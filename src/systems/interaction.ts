import { Utils } from './physics';
import { TILE_SIZE } from '../core/constants';
import { sfx } from '../core/audio';
import { lumen } from './lumen';
import { ITEMS_DB } from '../data/registry';
import { PlayerState } from '../entities/player';
import { Barrel, Chest, NPC, Torch } from '../domain/types';
import { Position, NpcTag } from '../domain/components';
import * as bitECS from 'bitecs';
import { IWorld } from 'bitecs';

export interface InteractionContext {
    world: IWorld;
    player: PlayerState;
    barrels: Barrel[];
    chests: Chest[];
    torches: Torch[];
    npcsMap: Map<number, NPC>;
    obstacles: any[];
    dungeon: any;
    fluids: any;
    trapState: any;
    gameState: string;
    droppedItems: any[];
    addFloatingText: (x: number, y: number, text: string, color?: string) => void;
    makeNoise: (x: number, y: number, radius: number) => void;
    destroyBarrel: (index: number) => void;
    updateUI: () => void;
    onItemPicked: (itemId: string) => void;
    showChest: (item: any, onTake: () => void, onClose: () => void) => void;
    setGameState: (state: any) => void;
    setActiveNPC: (npc: NPC | null) => void;
    setActiveChest: (chest: Chest | null) => void;
    inventoryItems: any[];
    isPassable: (gx: number, gy: number) => boolean;
}

export class InteractionSystem {
    public interact(ctx: InteractionContext) {
        if (ctx.gameState !== 'PLAYING') return;

        const { player, world, barrels, npcsMap, chests, torches, obstacles, fluids, trapState, droppedItems } = ctx;

        // 1. Drop barrel
        if (player.carryingBarrel) {
            const aheadGx = Math.floor((player.x + Math.cos(player.angle) * TILE_SIZE) / TILE_SIZE);
            const aheadGy = Math.floor((player.y + Math.sin(player.angle) * TILE_SIZE) / TILE_SIZE);

            if (!ctx.isPassable(aheadGx, aheadGy)) {
                ctx.addFloatingText(player.x, player.y - 30, "ЗАБЛОКИРОВАНО!", '#f88');
                return;
            }

            const aheadWorldX = aheadGx * TILE_SIZE + TILE_SIZE / 2;
            const aheadWorldY = aheadGy * TILE_SIZE + TILE_SIZE / 2;
            const isPit = trapState.pits.some((p: any) => Utils.dist({x: aheadWorldX, y: aheadWorldY}, p) < TILE_SIZE * 0.5);
            if (isPit) {
                ctx.addFloatingText(player.x, player.y - 30, "ЯМА!", '#f88');
                return;
            }

            let type = player.carryingBarrel as any;
            const barrelId = Math.random();
            let newBrl: Barrel = { id: barrelId, x: aheadWorldX, y: aheadWorldY, radius: 10, type };
            barrels.push(newBrl);
            obstacles.push({ x: aheadWorldX - 10, y: aheadWorldY - 10, w: 20, h: 20, type: 'barrel', id: barrelId });
            ctx.dungeon.grid[aheadGx][aheadGy] = 2;
            player.carryingBarrel = null;
            sfx.click();

            const grid = fluids.getGrid();
            const cell = grid[aheadGx]?.[aheadGy];
            if (cell && (cell.type === 'oil' || cell.type === 'petroleum') && cell.fire === 0) {
                fluids.ignite(aheadGx, aheadGy);
                ctx.makeNoise(aheadWorldX, aheadWorldY, 400);
            } else if (cell && cell.fire > 0) {
                setTimeout(() => {
                    const idx = barrels.indexOf(newBrl);
                    if (idx > -1) ctx.destroyBarrel(idx);
                }, 500);
            }
            return;
        }

        // 2. Pick up barrel
        const nearBarrelIdx = barrels.findIndex(b => Utils.dist(player, b) < 30);
        if (nearBarrelIdx !== -1) {
            const barrel = barrels[nearBarrelIdx];
            player.carryingBarrel = barrel.type;
            const gx = Math.floor(barrel.x / TILE_SIZE), gy = Math.floor(barrel.y / TILE_SIZE);
            ctx.dungeon.grid[gx][gy] = 0;
            const obsIdx = obstacles.findIndex(o => o.type === 'barrel' && o.id === barrel.id);
            if (obsIdx !== -1) obstacles.splice(obsIdx, 1);
            barrels.splice(nearBarrelIdx, 1);
            sfx.click();
            return;
        }

        // 3. Near NPC
        const npcQuery = bitECS.defineQuery([NpcTag, Position]);
        const npcs = npcQuery(world);
        let nearNPC: NPC | null = null;
        for (let i = 0; i < npcs.length; i++) {
            const eid = npcs[i];
            const npc = npcsMap.get(eid)!;
            if (Utils.dist({x: Position.x[player.eid], y: Position.y[player.eid]}, {x: Position.x[eid], y: Position.y[eid]}) < 40) {
                nearNPC = npc;
                break;
            }
        }

        if (nearNPC) {
            ctx.setActiveNPC(nearNPC);
            if (!nearNPC.currentNode) nearNPC.currentNode = nearNPC.dialogTree;
            ctx.setGameState('DIALOG');
            return;
        }

        // 4. Near Chest
        const nearChest = chests.find(c => Utils.dist(player, c) < 40);
        if (nearChest && nearChest.items.length > 0) {
            ctx.setActiveChest(nearChest);
            ctx.setGameState('CHEST');
            ctx.showChest(nearChest.items[0], 
                () => {
                    const item = nearChest.items[0];
                    this.onItemPicked(ctx, item.id);
                    nearChest.items = [];
                },
                () => {
                    ctx.setGameState('PLAYING');
                    ctx.setActiveChest(null);
                }
            );
            sfx.chestOpen();
            return;
        }

        // 5. Near Dropped Item
        const nearDroppedIdx = droppedItems.findIndex(d => Utils.dist(player, d) < 40);
        if (nearDroppedIdx !== -1) {
            const dropped = droppedItems[nearDroppedIdx];
            this.onItemPicked(ctx, dropped.itemId);
            droppedItems.splice(nearDroppedIdx, 1);
            sfx.click();
            return;
        }

        // 6. Near Torch
        const nearTorchIdx = torches.findIndex(t => Utils.dist(player, {x: t.x, y: t.y}) < 40);
        if (nearTorchIdx !== -1) {
            const torch = torches[nearTorchIdx];
            const isNowLit = lumen.toggleLight(torch.id);
            torch.lit = isNowLit;
            if (isNowLit) {
                ctx.addFloatingText(torch.x, torch.y - 20, "ФАКЕЛ ЗАЖЖЁН", '#fa0');
            } else {
                ctx.addFloatingText(torch.x, torch.y - 20, "ФАКЕЛ ПОТУШЕН", '#888');
            }
            sfx.click();
            return;
        }
    }

    private onItemPicked(ctx: InteractionContext, itemId: string) {
        const itemData = ITEMS_DB[itemId];
        
        if (itemId === 'medkit') {
            ctx.player.willpower = Math.min(ctx.player.maxWillpower, ctx.player.willpower + 1);
            ctx.addFloatingText(ctx.player.x, ctx.player.y - 40, "ВОЛЯ ВОССТАНОВЛЕНА", '#0f0');
            sfx.click();
        } else {
            // Weapon swap logic
            if (itemData.type === 'weapon') {
                const currentWeaponIdx = ctx.inventoryItems.findIndex(it => ITEMS_DB[it.id].type === 'weapon');
                if (currentWeaponIdx !== -1) {
                    const oldWeapon = ctx.inventoryItems.splice(currentWeaponIdx, 1)[0];
                    // Drop old weapon
                    ctx.droppedItems.push({
                        id: Math.random(),
                        itemId: oldWeapon.id,
                        x: ctx.player.x,
                        y: ctx.player.y
                    });
                    ctx.addFloatingText(ctx.player.x, ctx.player.y - 20, `СБРОШЕНО: ${ITEMS_DB[oldWeapon.id].name}`, '#aaa');
                }
            }

            ctx.inventoryItems.push({ id: itemId, instanceId: Math.random() });
            ctx.onItemPicked(itemId); // Call the callback for stats update
            ctx.addFloatingText(ctx.player.x, ctx.player.y - 40, `ПОЛУЧЕНО: ${itemData.name}`, '#ff0');
            sfx.click();
        }
        ctx.updateUI();
    }
}
