import * as bitECS from 'bitecs';
import mitt from 'mitt';
import { interpret } from 'xstate';
import * as ROT from 'rot-js';

// Core
import { GAME_WIDTH, GAME_HEIGHT, TILE_SIZE, MAP_COLS, MAP_ROWS, ENEMY_BARKS, SLOT_SIZE } from './core/constants';
import { AudioEngine, sfx } from './core/audio';
import { InputHandler } from './core/input';
import { SpriteCache } from './core/spriteCache';
import { AnimatedSprite } from './core/animatedSprite';
import { ANIMATIONS } from './data/animations';

// Systems
import { Utils, resolveCollision } from './systems/physics';
import { ParticleSystem } from './systems/particles';
import { FluidSystem } from './systems/fluids';
import { TrapSystem, TrapState } from './systems/traps';
import { enemyMachineDef, EnemyActions, checkVisionCone } from './systems/ai';
import { updateMemory, decrementMemoryTimer, hasValidMemory, updateNoise, decayNoise, clearMemory } from './systems/memory';
import { generateGlobalMap, GlobalMap } from './systems/mapGenerator';
import { InventorySystem, ItemInstance } from './systems/inventory';
import { CombatSystem } from './systems/combat';
import { DungeonSystem } from './systems/dungeon';
import { lumen, LightType } from './systems/lumen';
import { OverlaySystem } from './systems/overlay';
import { SpawnManager } from './systems/spawnManager';

// Entities
import { createPlayer, PlayerState } from './entities/player';
import { createMerchant, createAltar, createCivilian } from './entities/npc';
import { ITEMS_DB } from './data/items';
import { ENEMIES_DB } from './data/enemies';
import { ELEMENTS_DB, ElementType } from './data/elements';
import { OBJECTS_DB } from './data/objects';
import { generateBossArena, generateMerchantRoom } from './data/typeNode';

// UI
import { RenderSystem } from './ui/render';
import { InterfaceSystem } from './ui/interface';

// Types
import { Enemy, NPC, Barrel, Chest, Door, Point, PressurePlate, Torch, Projectile } from './types';
import { Position, Velocity, Health, Sprite, PlayerTag, EnemyTag, NpcTag } from './components';

const playerQuery = bitECS.defineQuery([PlayerTag, Position, Health]);
const enemyQuery = bitECS.defineQuery([EnemyTag, Position, Health]);
const npcQuery = bitECS.defineQuery([NpcTag, Position]);

class Game {
    private canvas: HTMLCanvasElement;
    private ctx: CanvasRenderingContext2D;
    private world = bitECS.createWorld();
    private events = mitt();
    
    private input: InputHandler;
    private particles = new ParticleSystem();
    private fluids = new FluidSystem();
    private spriteCache = new SpriteCache();
    private render: RenderSystem;
    private ui: InterfaceSystem;
    private dungeon = new DungeonSystem();
    private inventory = new InventorySystem(8, 6);
    private combat: CombatSystem;
    private traps: TrapSystem;
    private overlay = new OverlaySystem();
    
    private player!: PlayerState;
    private gameState: 'GLOBAL_MAP' | 'PLAYING' | 'INVENTORY' | 'DIALOG' | 'GAME_OVER' | 'VICTORY' | 'EXIT_CONFIRM' | 'CHEST' = 'GLOBAL_MAP';
    private globalMap!: GlobalMap;
    private currentNodeId: number | null = null;
    private selectedNodeId: number | null = null;
    private hoveredNodeId: number | null = null;
    
    private enemiesMap = new Map<number, Enemy>();
    private npcsMap = new Map<number, NPC>();
    private trapState: TrapState = { pits: [], spikes: [], blades: [], plates: [], mines: [], mirrors: [] };
    private barrels: Barrel[] = [];
    private torches: Torch[] = [];
    private floatingTexts: any[] = [];
    private bullets: Projectile[] = [];
    private currentWill = 5;
    private roomLevel = 1;
    private roomActive = false;
    private combatIntensity = 0;
    private frameCounter = 0;
    private inventoryItems: ItemInstance[] = [];
    private obstacles: any[] = [];
    private secretDoors: any[] = [];
    private secretDoorObstacles: any[] = [];
    private secretRoomCells: {gx: number, gy: number}[] = [];
    private secretRoomOpen = false;
    private startDoor: any = null;
    private exitRoomCenter: Point = { x: 0, y: 0 };
    private roomClearTimer = 0;
    private chests: Chest[] = [];
    private activeNPC: NPC | null = null;
    private doors: Door[] = [];
    private roomSnapshot: any = null;
    private isRestarting = false;
    private deathAnimTimer = 0;
    private isDead = false;
    private static readonly PLAYER_LIGHT_ID = 'player_light';

    private draggingItem: any = null;
    private draggingItemSource: 'inventory' | 'chest' | null = null;
    private dragOffset: Point = { x: 0, y: 0 };
    private selectedItemInstanceId: number | null = null;
    private uiAnimProgress = 0;
    private activeChest: Chest | null = null;
    private animationFrameId: number | null = null;

    constructor() {
        this.canvas = document.getElementById('gameCanvas') as HTMLCanvasElement;
        this.ctx = this.canvas.getContext('2d')!;
        
        this.input = new InputHandler(this.canvas);
        this.render = new RenderSystem(this.ctx, this.spriteCache);
        this.ui = new InterfaceSystem(document.getElementById('guiContainer')!, () => this.updateStaticLayer());
        
        this.combat = new CombatSystem(sfx, (x, y, text, col) => this.addFloatingText(x, y, text, col), (x, y, r) => this.makeNoise(x, y, r));
        this.traps = new TrapSystem(
            sfx, this.particles, 
            (x, y, t, c) => this.addFloatingText(x, y, t, c),
            (open) => this.setSecretRoomOpen(open),
            () => this.restartRoom(),
            (idx) => this.killEnemy(idx)
        );

        this.canvas.addEventListener('mousedown', (e) => this.handleMouseDown(e));
        this.canvas.addEventListener('mouseup', (e) => this.handleMouseUp(e));
        
        window.addEventListener('keydown', (e: KeyboardEvent) => {
            if (e.code === 'Tab') { e.preventDefault(); this.toggleInventory(); }
            if (e.code === 'KeyR') {
                if (this.isDead) {
                    this.triggerRestartAnimation();
                } else {
                    this.reload();
                }
            }
            if (e.code === 'KeyE') this.interact();
        });

        this.preload();
    }

    private async preload() {
        await this.spriteCache.generateAll();
        this.init();
    }

    private interact() {
        if (this.gameState !== 'PLAYING') return;

        // 1. Drop barrel - place one cell ahead in facing direction
        if (this.player.carryingBarrel) {
            // Calculate cell ahead based on player angle
            const aheadGx = Math.floor((this.player.x + Math.cos(this.player.angle) * TILE_SIZE) / TILE_SIZE);
            const aheadGy = Math.floor((this.player.y + Math.sin(this.player.angle) * TILE_SIZE) / TILE_SIZE);

            // Validation: check if passable (not wall)
            if (!this.isPassable(aheadGx, aheadGy)) {
                this.addFloatingText(this.player.x, this.player.y - 30, "ЗАБЛОКИРОВАНО!", '#f88');
                return;
            }

            // Validation: check for pits
            const aheadWorldX = aheadGx * TILE_SIZE + TILE_SIZE / 2;
            const aheadWorldY = aheadGy * TILE_SIZE + TILE_SIZE / 2;
            const isPit = this.trapState.pits.some(p => Utils.dist({x: aheadWorldX, y: aheadWorldY}, p) < TILE_SIZE * 0.5);
            if (isPit) {
                this.addFloatingText(this.player.x, this.player.y - 30, "ЯМА!", '#f88');
                return;
            }

            let type = this.player.carryingBarrel as any;
            const barrelId = Math.random();
            let newBrl: Barrel = { id: barrelId, x: aheadWorldX, y: aheadWorldY, radius: 10, type };
            this.barrels.push(newBrl);
            // Add barrel as obstacle
            this.obstacles.push({ x: aheadWorldX - 10, y: aheadWorldY - 10, w: 20, h: 20, type: 'barrel', id: barrelId });
            this.player.carryingBarrel = null;
            sfx.click();

            // Check fluid interactions at barrel position
            const grid = this.fluids.getGrid();
            const cell = grid[aheadGx]?.[aheadGy];
            if (cell && (cell.type === 'oil' || cell.type === 'petroleum') && cell.fire === 0) {
                this.fluids.ignite(aheadGx, aheadGy);
                this.makeNoise(aheadWorldX, aheadWorldY, 400);
            } else if (cell && cell.fire > 0) {
                setTimeout(() => {
                    const idx = this.barrels.indexOf(newBrl);
                    if (idx > -1) this.destroyBarrel(idx);
                }, 500);
            }
            return;
        }

        // 2. Pick up barrel
        const nearBarrelIdx = this.barrels.findIndex(b => Utils.dist(this.player, b) < 30);
        if (nearBarrelIdx !== -1) {
            const barrel = this.barrels[nearBarrelIdx];
            this.player.carryingBarrel = barrel.type;
            // Remove from obstacles
            this.obstacles = this.obstacles.filter(o => !(o.type === 'barrel' && o.id === barrel.id));
            this.barrels.splice(nearBarrelIdx, 1);
            sfx.click();
            return;
        }

        // 3. Near NPC
        const npcs = npcQuery(this.world);
        let nearNPC: any = null;
        for (let i = 0; i < npcs.length; i++) {
            const eid = npcs[i];
            const npc = this.npcsMap.get(eid)!;
            if (Utils.dist({x: Position.x[this.player.eid], y: Position.y[this.player.eid]}, {x: Position.x[eid], y: Position.y[eid]}) < 40) {
                nearNPC = npc;
                break;
            }
        }

        if (nearNPC) {
            this.activeNPC = nearNPC;
            if (!this.activeNPC!.currentNode) this.activeNPC!.currentNode = this.activeNPC!.dialogTree;
            this.gameState = 'DIALOG';
            return;
        }

        // 4. Near Chest
        const nearChest = this.chests.find(c => Utils.dist(this.player, c) < 40);
        if (nearChest) {
            this.activeChest = nearChest;
            this.gameState = 'CHEST';
            this.uiAnimProgress = 0;
            sfx.chestOpen();
            return;
        }

        // 5. Near Torch - toggle on/off
        const nearTorchIdx = this.torches.findIndex(t => Utils.dist(this.player, {x: t.x, y: t.y}) < 40);
        if (nearTorchIdx !== -1) {
            const torch = this.torches[nearTorchIdx];
            const isNowLit = lumen.toggleLight(torch.id);
            torch.lit = isNowLit;
            if (isNowLit) {
                this.addFloatingText(torch.x, torch.y - 20, "ФАКЕЛ ЗАЖЖЁН", '#fa0');
            } else {
                this.addFloatingText(torch.x, torch.y - 20, "ФАКЕЛ ПОТУШЕН", '#888');
            }
            sfx.click();
            return;
        }
    }

    private takeAll() {
        if (!this.activeChest) return;
        const items = [...this.activeChest.items];
        for (let i = items.length - 1; i >= 0; i--) {
            const item = items[i];
            const spot = this.inventory.findFreeSpot(item, this.inventoryItems);
            if (spot) {
                item.x = spot.x; item.y = spot.y;
                this.inventoryItems.push(item);
                this.activeChest.items.splice(i, 1);
                this.addFloatingText(this.player.x, this.player.y - 20, `ЗАБРАНО: ${ITEMS_DB[item.id].name}`, '#ff0');
            } else {
                this.addFloatingText(this.player.x, this.player.y - 20, "НЕТ МЕСТА!", '#f00');
                break;
            }
        }
        sfx.click();
        this.updateUI();
    }

    private reload() {
        if (this.player.equippedWeaponInstanceId && !this.player.isReloading && this.player.ammo < this.player.computedStats.maxAmmo) {
            this.player.isReloading = true;
            this.player.reloadTimer = this.player.computedStats.reloadDuration;
            sfx.reload();
            this.addFloatingText(this.player.x, this.player.y - 20, "ПЕРЕЗАРЯДКА...");
        }
    }

    private toggleInventory() {
        if (this.gameState === 'PLAYING') {
            this.gameState = 'INVENTORY';
            this.uiAnimProgress = 0;
            sfx.click();
        } else if (this.gameState === 'INVENTORY' || this.gameState === 'CHEST') {
            this.gameState = 'PLAYING';
            this.activeChest = null;
            sfx.click();
        }
    }

    private handleMouseDown(e: MouseEvent) {
        AudioEngine.resume();
        const mouse = this.input.mouse;

        if (this.gameState === 'GLOBAL_MAP') {
            if (this.hoveredNodeId !== null) {
                let node = this.globalMap.nodes[this.hoveredNodeId];
                if (node.status === 'available') {
                    if (this.selectedNodeId === node.id) {
                        sfx.click(); this.currentNodeId = node.id; this.selectedNodeId = null; this.generateRoom();
                    } else {
                        sfx.click(); this.selectedNodeId = node.id;
                    }
                }
            } else this.selectedNodeId = null;
            this.updateSidePanel();
        } else if (this.gameState === 'INVENTORY' || this.gameState === 'CHEST') {
            // Horizontal layout: Chest left, Inventory right
            const chestX = this.gameState === 'CHEST' ? (GAME_WIDTH / 2 - 320) : 0;
            const invX = GAME_WIDTH / 2 + 20;
            const gridY = (GAME_HEIGHT - 6 * 30) / 2;
            
            // Check Inventory (right side)
            const foundInv = this.inventory.getItemAtPixel(mouse.x, mouse.y, invX, gridY, 30, this.inventoryItems);
            if (foundInv) {
                this.draggingItem = foundInv.item;
                this.draggingItemSource = 'inventory';
                this.selectedItemInstanceId = foundInv.item.instanceId;
                this.dragOffset = { x: mouse.x - (invX + foundInv.item.x * 30), y: mouse.y - (gridY + foundInv.item.y * 30) };
                sfx.click();
                return;
            }

            // Check Chest (left side)
            if (this.gameState === 'CHEST' && this.activeChest) {
                const cGridX = chestX;
                const cGridY = gridY;
                const foundChest = this.inventory.getItemAtPixel(mouse.x, mouse.y, cGridX, cGridY, 30, this.activeChest.items);
                if (foundChest) {
                    this.draggingItem = foundChest.item;
                    this.draggingItemSource = 'chest';
                    this.selectedItemInstanceId = foundChest.item.instanceId;
                    this.dragOffset = { x: mouse.x - (cGridX + foundChest.item.x * 30), y: mouse.y - (cGridY + foundChest.item.y * 30) };
                    sfx.click();
                    return;
                }

                // Close Chest Button
                if (mouse.y > gridY + 6 * 30 + 10 && mouse.y < gridY + 6 * 30 + 40 && mouse.x > chestX + 70 && mouse.x < chestX + 190) {
                    this.gameState = 'PLAYING';
                    this.activeChest = null;
                    sfx.click();
                    return;
                }
            }

            // Inventory Buttons (Equip/Destroy) - right side
            if (this.selectedItemInstanceId) {
                const item = this.inventoryItems.find(it => it.instanceId === this.selectedItemInstanceId);
                const db = item ? ITEMS_DB[item.id] : null;
                if (db) {
                    const bx = invX + 8 * 30 + 20;
                    const by = gridY;
                    if (db.type === 'weapon' && mouse.x > bx && mouse.x < bx + 100 && mouse.y > by && mouse.y < by + 30) {
                        if (this.player.equippedWeaponInstanceId === item!.instanceId) this.player.equippedWeaponInstanceId = null;
                        else this.player.equippedWeaponInstanceId = item!.instanceId;
                        sfx.click(); this.updateEquippedStats(); return;
                    }
                    if (mouse.x > bx && mouse.x < bx + 100 && mouse.y > by + 40 && mouse.y < by + 70) {
                        this.inventoryItems = this.inventoryItems.filter(it => it.instanceId !== this.selectedItemInstanceId);
                        if (this.player.equippedWeaponInstanceId === this.selectedItemInstanceId) this.player.equippedWeaponInstanceId = null;
                        this.selectedItemInstanceId = null;
                        sfx.hit(); this.updateEquippedStats(); return;
                    }
                }
            }
            this.selectedItemInstanceId = null;

        } else if (this.gameState === 'EXIT_CONFIRM') {
            const cx = GAME_WIDTH / 2, cy = GAME_HEIGHT / 2;
            if (mouse.x > cx - 110 && mouse.x < cx - 10 && mouse.y > cy + 20 && mouse.y < cy + 60) { 
                sfx.click(); this.exitRoom(); 
            } else if (mouse.x > cx + 10 && mouse.x < cx + 110 && mouse.y > cy + 20 && mouse.y < cy + 60) { 
                sfx.click(); this.gameState = 'PLAYING'; this.player.y += 30; 
            }
        } else if (this.gameState === 'DIALOG' && this.activeNPC) {
            const node = this.activeNPC.currentNode;
            if (!node) return;
            const optWidth = (GAME_WIDTH - 120) / 2;
            const bottomY = GAME_HEIGHT - 80;
            
            let clickedIdx = -1;
            if (mouse.x > 50 && mouse.x < 50 + optWidth && mouse.y > bottomY + 30 && mouse.y < bottomY + 60) clickedIdx = 0;
            else if (node.options[1] && mouse.x > 70 + optWidth && mouse.x < 70 + optWidth * 2 && mouse.y > bottomY + 30 && mouse.y < bottomY + 60) clickedIdx = 1;
            
            if (clickedIdx !== -1) {
                const opt = node.options[clickedIdx];
                sfx.click();
                if (opt.action === 'close') {
                    this.gameState = 'PLAYING'; this.activeNPC = null;
                } else if (opt.action === 'buy_random') {
                    if (this.player.credits >= 50) {
                        this.player.credits -= 50;
                        const itemIds = Object.keys(ITEMS_DB);
                        const rndId = itemIds[Math.floor(Math.random()*itemIds.length)];
                        const item = { id: rndId, instanceId: Math.random(), x: 0, y: 0 };
                        const spot = this.inventory.findFreeSpot(item, this.inventoryItems);
                        if (spot) {
                            item.x = spot.x; item.y = spot.y;
                            this.inventoryItems.push(item);
                            this.addFloatingText(this.player.x, this.player.y - 40, `КУПЛЕНО: ${ITEMS_DB[rndId].name}`, '#ff0');
                            this.activeNPC.currentNode = { text: "Отличный выбор!", options: [{ text: "[Закрыть]", action: 'close' }] };
                        } else {
                            this.addFloatingText(this.player.x, this.player.y - 40, "НЕТ МЕСТА!", '#f00');
                            this.player.credits += 50;
                        }
                    } else {
                        this.addFloatingText(this.player.x, this.player.y - 40, "НЕДОСТАТОЧНО КРЕДИТОВ!", '#f00');
                    }
                } else if (opt.action === 'heal') {
                    if (this.player.credits >= 30) {
                        this.currentWill = Math.min(100, this.currentWill + 40);
                        this.player.credits -= 30;
                        this.addFloatingText(this.player.x, this.player.y - 40, "ВОЛЯ ВОССТАНОВЛЕНА", '#0f0');
                        this.activeNPC.currentNode = { text: "Будь силен, путник.", options: [{ text: "[Закрыть]", action: 'close' }] };
                    } else {
                        this.addFloatingText(this.player.x, this.player.y - 40, "НЕДОСТАТОЧНО КРЕДИТОВ!", '#f00');
                    }
                } else if (opt.next) {
                    this.activeNPC.currentNode = opt.next;
                }
                this.updateUI();
            }
        } else if (this.gameState === 'GAME_OVER' || this.gameState === 'VICTORY') {
            this.init();
        }
    }

    private handleMouseUp(e: MouseEvent) {
        if ((this.gameState === 'INVENTORY' || this.gameState === 'CHEST') && this.draggingItem) {
            const mouse = this.input.mouse;
            // Horizontal layout: Chest left, Inventory right
            const chestX = this.gameState === 'CHEST' ? (GAME_WIDTH / 2 - 320) : 0;
            const invX = GAME_WIDTH / 2 + 20;
            const gridY = (GAME_HEIGHT - 6 * 30) / 2;

            let placed = false;

            // Try place in Inventory (right side)
            const invGX = Math.round((mouse.x - this.dragOffset.x - invX) / 30);
            const invGY = Math.round((mouse.y - this.dragOffset.y - gridY) / 30);
            if (this.inventory.canPlaceItem(this.draggingItem, invGX, invGY, this.inventoryItems)) {
                if (this.draggingItemSource === 'chest' && this.activeChest) {
                    this.activeChest.items = this.activeChest.items.filter(it => it !== this.draggingItem);
                    this.inventoryItems.push(this.draggingItem);
                }
                this.draggingItem.x = invGX;
                this.draggingItem.y = invGY;
                placed = true;
                sfx.click();
            } 
            // Try place in Chest (left side)
            else if (this.gameState === 'CHEST' && this.activeChest) {
                const chestGX = Math.round((mouse.x - this.dragOffset.x - chestX) / 30);
                const chestGY = Math.round((mouse.y - this.dragOffset.y - gridY) / 30);
                if (this.inventory.canPlaceItem(this.draggingItem, chestGX, chestGY, this.activeChest.items)) {
                    if (this.draggingItemSource === 'inventory') {
                        this.inventoryItems = this.inventoryItems.filter(it => it !== this.draggingItem);
                        if (this.player.equippedWeaponInstanceId === this.draggingItem.instanceId) this.player.equippedWeaponInstanceId = null;
                        this.activeChest.items.push(this.draggingItem);
                    }
                    this.draggingItem.x = chestGX;
                    this.draggingItem.y = chestGY;
                    placed = true;
                    sfx.click();
                }
            }

            if (!placed) sfx.hit();
            this.draggingItem = null;
            this.draggingItemSource = null;
            this.updateEquippedStats();
        }
    }

    private exitRoom() {
        let currNode = this.globalMap.nodes[this.currentNodeId!];
        currNode.status = 'completed';
        for (let id in this.globalMap.nodes) if (this.globalMap.nodes[id].status === 'available') this.globalMap.nodes[id].status = 'locked';
        if (currNode.next.length === 0) { this.gameState = 'VICTORY'; sfx.roomClear(); }
        else {
            currNode.next.forEach(nextId => this.globalMap.nodes[nextId].status = 'available');
            this.roomLevel++;
            this.gameState = 'GLOBAL_MAP';
            this.selectedNodeId = null;
            this.updateSidePanel();
            this.updateUI();
        }
    }

    private updateEquippedStats() {
        this.player.computedStats = {
            ...this.player.baseStats,
            maxAmmo: 0,
            shootCooldown: 0,
            reloadDuration: 0,
            projectiles: 1,
            spreadAngle: 0
        };
        const weapon = this.inventoryItems.find(it => it.instanceId === this.player.equippedWeaponInstanceId);
        if (weapon) {
            const db = ITEMS_DB[weapon.id] as any;
            this.player.computedStats.maxAmmo = db.maxAmmo;
            this.player.computedStats.shootCooldown = db.cooldown;
            this.player.computedStats.reloadDuration = db.reloadDuration;
            this.player.computedStats.projectiles = db.projectiles;
            this.player.computedStats.spreadAngle = db.spreadAngle;
        } else {
            this.player.computedStats.maxAmmo = 0;
            this.player.ammo = 0;
        }
        
        // Passive effects
        this.player.hasThermal = this.inventoryItems.some(it => it.id === 'thermal');
        this.player.hasChalice = this.inventoryItems.some(it => it.id === 'chalice');

        this.updateUI();
    }

    private init() {
        // Cancel any existing game loop to prevent multiple loops running
        if (this.animationFrameId !== null) {
            cancelAnimationFrame(this.animationFrameId);
            this.animationFrameId = null;
        }
        
        ROT.RNG.setSeed(Date.now());
        lumen.init(MAP_COLS, MAP_ROWS);
        lumen.reset();
        this.world = bitECS.createWorld();
        this.player = createPlayer(this.world, bitECS.addEntity(this.world));
        this.globalMap = generateGlobalMap(ROT.RNG);
        this.gameState = 'GLOBAL_MAP';
        this.roomLevel = 1;
        this.currentWill = 5;
        this.inventoryItems = [
            { id: 'pistol', instanceId: Math.random(), x: 0, y: 0 }
        ];
        this.player.equippedWeaponInstanceId = this.inventoryItems[0].instanceId;
        this.player.ammo = 6;
        
        // Initialize player animation
        this.player.anim = new AnimatedSprite(ANIMATIONS.PLAYER_IDLE_DOWN);
        
        this.updateEquippedStats();
        this.updateUI();
        this.loop();
    }

    private generateRoom() {
        this.bullets = []; this.enemiesMap.clear(); this.npcsMap.clear(); this.trapState = { pits: [], spikes: [], blades: [], plates: [], mines: [], mirrors: [] };
        // Cleanup old bitECS entities except player
        const entities = bitECS.getAllEntities(this.world);
        for (const eid of entities) {
            if (!bitECS.hasComponent(this.world, PlayerTag, eid)) {
                bitECS.removeEntity(this.world, eid);
            }
        }
        this.obstacles = []; this.floatingTexts = []; this.chests = []; this.doors = [];
        this.barrels = []; this.torches = []; this.fluids.reset();
        this.secretRoomOpen = false; this.secretDoors = []; this.secretDoorObstacles = []; this.secretRoomCells = [];
        this.roomActive = false; this.combatIntensity = 0; this.gameState = 'PLAYING'; 
        this.player.x = GAME_WIDTH / 2; this.player.y = 520; this.player.trail = []; this.player.carryingBarrel = null;
        this.roomClearTimer = 0;
        lumen.reset();

        const node = this.globalMap.nodes[this.currentNodeId!];
        
        if (node.type === 'merchant' || node.type === 'shrine') {
            this.dungeon.reset();
            const result = generateMerchantRoom();
            this.dungeon.grid = result.grid;

            this.startDoor = result.startDoor;
            this.exitRoomCenter = result.exitRoomCenter;

            // Очищаем и декорируем overlay систему
            this.overlay.clear();
            this.overlay.decorateRoom(result.floorTiles, 0.05);

            const cx = Math.floor(MAP_COLS / 2);
            const cy = 10;
            if (node.type === 'merchant') this.spawnNPC('merchant', cx*TILE_SIZE, cy*TILE_SIZE);
            else this.spawnNPC('shrine', cx*TILE_SIZE, cy*TILE_SIZE);
            this.spawnNPC('civilian', cx*TILE_SIZE - 40, cy*TILE_SIZE + 40);
        } else if (node.type === 'boss') {
            this.dungeon.reset();
            const result = generateBossArena();
            this.dungeon.grid = result.grid;

            this.startDoor = result.startDoor;
            this.exitRoomCenter = result.exitRoomCenter;

            // Очищаем и декорируем overlay систему
            this.overlay.clear();
            this.overlay.decorateRoom(result.floorTiles, 0.03);

            // TODO: Здесь будет спавн босса
            // Пока без босса, только арена
        } else {
            const rooms = this.dungeon.generate({ roomWidth: [4, 8], roomHeight: [4, 8], corridorLength: [2, 5], dugPercentage: 0.3 });
            const closest = this.dungeon.getClosestRoom(rooms, MAP_COLS / 2, 22);
            
            let pathX = Math.floor(MAP_COLS / 2), pathY = 21;
            while (pathY >= closest.cy) { this.dungeon.grid[pathX][pathY] = 0; this.dungeon.grid[pathX - 1][pathY] = 0; this.dungeon.grid[pathX + 1][pathY] = 0; pathY--; }
            while (pathX < closest.cx) { this.dungeon.grid[pathX][pathY] = 0; this.dungeon.grid[pathX][pathY + 1] = 0; this.dungeon.grid[pathX][pathY - 1] = 0; pathX++; }
            while (pathX > closest.cx) { this.dungeon.grid[pathX][pathY] = 0; this.dungeon.grid[pathX][pathY + 1] = 0; this.dungeon.grid[pathX][pathY - 1] = 0; pathX--; }
            
            for (let x = 16; x <= 23; x++) for (let y = 19; y < 22; y++) this.dungeon.grid[x][y] = 0;
            for (let x = 0; x < MAP_COLS; x++) for (let y = 22; y < MAP_ROWS; y++) this.dungeon.grid[x][y] = (x >= 17 && x <= 22) ? 0 : 1;

            this.startDoor = { x: 340, y: 440, w: 120, h: 20, open: false, type: 'start' };
            const topRoom = this.dungeon.getTopRoom(rooms);
            this.exitRoomCenter = { x: topRoom.getCenter()[0] * TILE_SIZE, y: topRoom.getCenter()[1] * TILE_SIZE };

            // Очищаем и декорируем overlay систему для подземелья
            this.overlay.clear();
            const floorTiles: {x: number, y: number}[] = [];
            for (let x = 0; x < MAP_COLS; x++) {
                for (let y = 0; y < MAP_ROWS; y++) {
                    if (this.dungeon.grid[x][y] === 0) floorTiles.push({x, y});
                }
            }
            this.overlay.decorateRoom(floorTiles, 0.08);

            // Secret Rooms - 40% chance if dead-end room exists
            const SECRET_ROOM_CHANCE = 0.4;
            const deadEndRooms = rooms.filter(r => {
                if (r === topRoom || r === closest.room) return false;
                let count = 0; r.getDoors(() => count++);
                return count === 1;
            });

            if (deadEndRooms.length > 0 && ROT.RNG.getUniform() < SECRET_ROOM_CHANCE) {
                const secretRoom = deadEndRooms[Math.floor(Math.random() * deadEndRooms.length)];
                for (let x = secretRoom.getLeft(); x <= secretRoom.getRight(); x++)
                    for (let y = secretRoom.getTop(); y <= secretRoom.getBottom(); y++)
                        this.secretRoomCells.push({gx: x, gy: y});

                secretRoom.getDoors((x, y) => {
                    this.secretDoors.push({x, y});
                    this.dungeon.grid[x][y] = 1;
                    this.secretDoorObstacles.push({ x: x * TILE_SIZE, y: y * TILE_SIZE, w: TILE_SIZE, h: TILE_SIZE });
                });

                // Spawn pressure plate OUTSIDE the secret room (in adjacent area)
                // Find empty cells adjacent to secret room (not inside)
                const adjacentCells: any[] = [];
                for (let x = secretRoom.getLeft() - 2; x <= secretRoom.getRight() + 2; x++) {
                    for (let y = secretRoom.getTop() - 2; y <= secretRoom.getBottom() + 2; y++) {
                        // Skip cells inside secret room
                        if (x >= secretRoom.getLeft() && x <= secretRoom.getRight() &&
                            y >= secretRoom.getTop() && y <= secretRoom.getBottom()) continue;
                        // Check if cell is valid floor
                        if (x >= 0 && y >= 0 && x < MAP_COLS && y < MAP_ROWS &&
                            this.dungeon.grid[x]?.[y] === 0) {
                            adjacentCells.push({x: x * TILE_SIZE + TILE_SIZE/2, y: y * TILE_SIZE + TILE_SIZE/2});
                        }
                    }
                }
                // Place plate in random adjacent cell
                if (adjacentCells.length > 0) {
                    const platePos = adjacentCells[Math.floor(ROT.RNG.getUniform() * adjacentCells.length)];
                    this.trapState.plates.push({
                        id: `plate_${Math.random()}`,
                        x: platePos.x,
                        y: platePos.y,
                        pressed: false,
                        timer: 0,
                        discovered: false
                    });
                }

                // Add content to secret room: 1-2 enemies, 1 guaranteed chest, maybe NPC
                const secretSpawns: any[] = [];
                for (let x = secretRoom.getLeft(); x <= secretRoom.getRight(); x++) {
                    for (let y = secretRoom.getTop(); y <= secretRoom.getBottom(); y++) {
                        if (this.dungeon.grid[x][y] === 0) {
                            secretSpawns.push({x: x * TILE_SIZE + TILE_SIZE/2, y: y * TILE_SIZE + TILE_SIZE/2, gx: x, gy: y});
                        }
                    }
                }
                const getSecretSpawn = () => secretSpawns.length > 0 ? secretSpawns.splice(Math.floor(ROT.RNG.getUniform() * secretSpawns.length), 1)[0] : null;

                // Guaranteed chest in secret room
                const chestSpawn = getSecretSpawn();
                if (chestSpawn) {
                    const possibleItems = Object.keys(ITEMS_DB);
                    const numItems = Math.floor(ROT.RNG.getUniform() * 2) + 2; // 2-3 items, better loot
                    const chestItems: ItemInstance[] = [];
                    for (let i = 0; i < numItems; i++) {
                        const itemId = possibleItems[Math.floor(ROT.RNG.getUniform() * possibleItems.length)];
                        const spot = this.inventory.findFreeSpot({ id: itemId, instanceId: Math.random() }, chestItems);
                        if (spot) {
                            chestItems.push({ id: itemId, instanceId: Math.random(), x: spot.x, y: spot.y });
                        }
                    }
                    const secretChestId = Math.random();
                    this.chests.push({ id: secretChestId, x: chestSpawn.x, y: chestSpawn.y, items: chestItems });
                    // Add secret room chest as obstacle
                    this.obstacles.push({ x: chestSpawn.x - 12, y: chestSpawn.y - 10, w: 24, h: 20, type: 'chest', id: secretChestId });
                }

                // 1-2 enemies guarding the secret
                const numSecretEnemies = Math.floor(ROT.RNG.getUniform() * 2) + 1;
                for (let i = 0; i < numSecretEnemies; i++) {
                    const sp = getSecretSpawn();
                    if (sp) {
                        this.spawnEnemy('chaser', sp.x, sp.y, 'guard');
                    }
                }

                // 30% chance for civilian NPC in secret room
                if (ROT.RNG.getUniform() < 0.3) {
                    const npcSpawn = getSecretSpawn();
                    if (npcSpawn) {
                        this.spawnNPC('civilian', npcSpawn.x, npcSpawn.y);
                    }
                }
            }

            // Obstacles
            for (let x = 0; x < MAP_COLS; x++) {
                for (let y = 0; y < MAP_ROWS; y++) {
                    if (this.dungeon.grid[x][y] === 1 && !this.secretDoors.some(d => d.x === x && d.y === y)) {
                        this.obstacles.push({ x: x * TILE_SIZE, y: y * TILE_SIZE, w: TILE_SIZE, h: TILE_SIZE });
                    }
                }
            }

            // Initialize SpawnManager for better spawn distribution
            const spawnManager = new SpawnManager(
                this.dungeon.grid,
                rooms,
                this.startDoor,
                this.exitRoomCenter,
                this.secretRoomCells
            );

            // Get separate spawn pools for different object types
            // Room-only spawns: NPCs, chests, barrels - only in rooms, away from walls and doors
            const roomSpawns = spawnManager.getRoomOnlySpawns(1, 3); // min 1 cell from wall, 3 from doors
            // Corridor spawns: traps, pits - prefer narrow corridors
            const corridorSpawns = spawnManager.getCorridorSpawns(2); // min 2 cells from doors

            // Track placed objects for distance checks
            const placedObjects: { x: number; y: number }[] = [];
            const MIN_DISTANCE_OBJECTS = 80; // Минимальное расстояние между объектами (пиксели)
            const MIN_DISTANCE_TRAPS = 100;   // Минимальное расстояние между ловушками

            // Shuffle spawn pools for randomness
            const shuffledRoomSpawns = roomSpawns.sort(() => ROT.RNG.getUniform() - 0.5);
            const shuffledCorridorSpawns = corridorSpawns.sort(() => ROT.RNG.getUniform() - 0.5);

            // ===== BARRELS - только в комнатах, не у стен, с расстоянием =====
            const barrelProps = OBJECTS_DB['barrel'];
            const barrelCount = Math.floor(ROT.RNG.getUniform() * barrelProps.maxPerRoom) + 1;
            let barrelsSpawned = 0;
            for (const spawn of shuffledRoomSpawns) {
                if (barrelsSpawned >= barrelCount) break;
                if (ROT.RNG.getUniform() >= barrelProps.spawnChance) continue;

                // Check distance to other placed objects
                if (!spawnManager.isDistanceValid(spawn.x, spawn.y, placedObjects, MIN_DISTANCE_OBJECTS)) continue;

                const barrelId = Math.random();
                this.barrels.push({
                    id: barrelId,
                    x: spawn.x,
                    y: spawn.y,
                    radius: 10,
                    type: ROT.RNG.getUniform() < 0.33 ? 'water' : (ROT.RNG.getUniform() < 0.66 ? 'oil' : 'petroleum')
                });
                // Add barrel as obstacle for collision (20x20 size around center)
                this.obstacles.push({ x: spawn.x - 10, y: spawn.y - 10, w: 20, h: 20, type: 'barrel', id: barrelId });
                placedObjects.push({ x: spawn.x, y: spawn.y });
                barrelsSpawned++;
            }

            // ===== CHESTS - только в комнатах, не у стен, с расстоянием =====
            const chestProps = OBJECTS_DB['chest'];
            let chestsSpawned = 0;
            for (const spawn of shuffledRoomSpawns) {
                if (chestsSpawned >= 1) break; // Максимум 1 сундук на подземелье
                if (ROT.RNG.getUniform() >= chestProps.spawnChance) continue;

                // Check distance to other placed objects
                if (!spawnManager.isDistanceValid(spawn.x, spawn.y, placedObjects, MIN_DISTANCE_OBJECTS)) continue;

                // Generate random items for chest
                const possibleItems = Object.keys(ITEMS_DB);
                const numItems = Math.floor(ROT.RNG.getUniform() * 3) + 1; // 1-3 items
                const chestItems: ItemInstance[] = [];

                for (let i = 0; i < numItems; i++) {
                    const itemId = possibleItems[Math.floor(ROT.RNG.getUniform() * possibleItems.length)];
                    const spot = this.inventory.findFreeSpot({ id: itemId, instanceId: Math.random() }, chestItems);
                    if (spot) {
                        chestItems.push({
                            id: itemId,
                            instanceId: Math.random(),
                            x: spot.x,
                            y: spot.y
                        });
                    }
                }

                const chestId = Math.random();
                this.chests.push({
                    id: chestId,
                    x: spawn.x,
                    y: spawn.y,
                    items: chestItems
                });
                // Add chest as obstacle for collision (24x20 size around center)
                this.obstacles.push({ x: spawn.x - 12, y: spawn.y - 10, w: 24, h: 20, type: 'chest', id: chestId });
                placedObjects.push({ x: spawn.x, y: spawn.y });
                chestsSpawned++;
            }

            // ===== NPCs - только в комнатах, не у стен, с расстоянием =====
            const civProps = OBJECTS_DB['npc_civilian'];
            const eligibleRooms = spawnManager.getEligibleRooms();
            const shuffledRooms = eligibleRooms.sort(() => ROT.RNG.getUniform() - 0.5);

            for (const room of shuffledRooms) {
                if (ROT.RNG.getUniform() >= civProps.spawnChance) continue;

                // Get room-only spawns for this specific room
                const roomOnlySpawns: { x: number; y: number; gx: number; gy: number }[] = [];
                for (let x = room.left; x <= room.right; x++) {
                    for (let y = room.top; y <= room.bottom; y++) {
                        if (spawnManager.isValidRoomSpawn(x, y, 1, 3)) {
                            roomOnlySpawns.push({
                                x: x * TILE_SIZE + TILE_SIZE / 2,
                                y: y * TILE_SIZE + TILE_SIZE / 2,
                                gx: x, gy: y
                            });
                        }
                    }
                }
                if (roomOnlySpawns.length === 0) continue;

                // Find a spawn that's not too close to other objects
                const validSpawns = roomOnlySpawns.filter(spawn =>
                    spawnManager.isDistanceValid(spawn.x, spawn.y, placedObjects, MIN_DISTANCE_OBJECTS)
                );
                if (validSpawns.length === 0) continue;

                const sp = validSpawns[Math.floor(ROT.RNG.getUniform() * validSpawns.length)];
                this.spawnNPC('civilian', sp.x, sp.y);
                placedObjects.push({ x: sp.x, y: sp.y });
            }

            // ===== ENEMIES - только в комнатах =====
            const enemyRoomSpawns = [...shuffledRoomSpawns].filter(spawn =>
                !placedObjects.some(obj => Utils.distSq(obj, spawn) < 1600) // Avoid placed objects (reduced from 2500 to 1600)
            );
            let groupsCount = Math.min(5, Math.floor(ROT.RNG.getUniform() * 3) + 3 + Math.floor(this.roomLevel / 2)); // Increased base groups and level scaling
            for (let g = 0; g < groupsCount; g++) {
                if (enemyRoomSpawns.length === 0) break;
                const centerIdx = Math.floor(ROT.RNG.getUniform() * enemyRoomSpawns.length);
                const center = enemyRoomSpawns.splice(centerIdx, 1)[0];

                let groupSize = Math.floor(ROT.RNG.getUniform() * 3) + 2;
                let leaderRole: 'patroller' | 'guard' = ROT.RNG.getUniform() > 0.5 ? 'patroller' : 'guard';
                let leader: Enemy | undefined = undefined;
                let patrolPath: Point[] | undefined = undefined;

                if (leaderRole === 'patroller' && enemyRoomSpawns.length > 0) {
                    const distantIdx = Math.floor(ROT.RNG.getUniform() * enemyRoomSpawns.length);
                    const distant = enemyRoomSpawns[distantIdx];
                    patrolPath = [{ x: center.x, y: center.y }, { x: distant.x, y: distant.y }];
                }

                for (let i = 0; i < groupSize; i++) {
                    let sp: { x: number; y: number } | undefined;
                    if (i === 0) {
                        sp = center;
                    } else if (enemyRoomSpawns.length > 0) {
                        const idx = Math.floor(ROT.RNG.getUniform() * enemyRoomSpawns.length);
                        sp = enemyRoomSpawns.splice(idx, 1)[0];
                    }
                    if (!sp) break;

                    let db = ROT.RNG.getUniform() > 0.7 ? ENEMIES_DB['sniper'] : ENEMIES_DB['grunt'];
                    let role: 'patroller' | 'guard' | 'follower' = i === 0 ? leaderRole : 'follower';
                    let angle = (i / groupSize) * Math.PI * 2;
                    
                    let en = this.spawnEnemy(db.type, sp.x, sp.y, role);
                    en.leader = leader;
                    en.patrolPath = patrolPath;
                    en.angle = angle;
                    en.followOffX = Math.cos(angle) * 40;
                    en.followOffY = Math.sin(angle) * 40;
                    en.anim = new AnimatedSprite(db.type === 'shooter' ? ANIMATIONS.ENEMY_SHOOTER_IDLE : ANIMATIONS.ENEMY_CHASER_WALK);

                    if (i === 0) leader = en;
                }
            }

            // ===== SPIKE TRAPS - предпочтение коридорам, с расстоянием =====
            const placedTraps: { x: number; y: number }[] = [];
            const spikeCount = 3;
            for (let i = 0; i < spikeCount; i++) {
                // Сначала пробуем коридоры
                let sp = spawnManager.getRandomSpawn(
                    shuffledCorridorSpawns.filter(s => spawnManager.isDistanceValid(s.x, s.y, placedTraps, MIN_DISTANCE_TRAPS))
                );
                // Если в коридорах нет места, пробуем комнаты
                if (!sp) {
                    sp = spawnManager.getRandomSpawn(
                        shuffledRoomSpawns.filter(s => spawnManager.isDistanceValid(s.x, s.y, placedTraps, MIN_DISTANCE_TRAPS))
                    );
                }
                if (sp) {
                    this.trapState.spikes.push({ id: `spike_${i}`, x: sp.x, y: sp.y, state: 0, timer: 0 });
                    placedTraps.push({ x: sp.x, y: sp.y });
                }
            }

            // ===== PIT TRAPS - предпочтение коридорам, с расстоянием =====
            const pitProps = OBJECTS_DB['trap_pit'];
            const pitCount = Math.floor(ROT.RNG.getUniform() * pitProps.maxPerRoom);
            for (let i = 0; i < pitCount; i++) {
                if (ROT.RNG.getUniform() >= pitProps.spawnChance) continue;

                // Сначала пробуем коридоры
                let sp = spawnManager.getRandomSpawn(
                    shuffledCorridorSpawns.filter(s => spawnManager.isDistanceValid(s.x, s.y, placedTraps, MIN_DISTANCE_TRAPS))
                );
                // Если в коридорах нет места, пробуем комнаты
                if (!sp) {
                    sp = spawnManager.getRandomSpawn(
                        shuffledRoomSpawns.filter(s => spawnManager.isDistanceValid(s.x, s.y, placedTraps, MIN_DISTANCE_TRAPS))
                    );
                }
                if (sp) {
                    this.trapState.pits.push({ id: `pit_${i}`, x: sp.x, y: sp.y });
                    placedTraps.push({ x: sp.x, y: sp.y });
                }
            }

            // ===== TORCHES - в комнатах, с расстоянием =====
            const torchProps = OBJECTS_DB['torch'];
            const torchPositions: { x: number; y: number }[] = [];
            for (let i = 0; i < torchProps.maxPerRoom; i++) {
                if (ROT.RNG.getUniform() >= torchProps.spawnChance) continue;

                const validSpawns = shuffledRoomSpawns.filter(s =>
                    !torchPositions.some(t => Utils.distSq({ x: t.x, y: t.y }, { x: s.gx, y: s.gy }) < 64) // Минимум 8 клеток между факелами
                );
                if (validSpawns.length === 0) continue;

                const sp = validSpawns[Math.floor(ROT.RNG.getUniform() * validSpawns.length)];
                torchPositions.push({ x: sp.gx, y: sp.gy });
                const torchId = `torch_${this.frameCounter}_${i}`;
                this.torches.push({ id: torchId, x: sp.x, y: sp.y, gx: sp.gx, gy: sp.gy });
                lumen.addLight({
                    id: torchId,
                    x: sp.gx,
                    y: sp.gy,
                    radius: 6,
                    intensity: 0.9,
                    type: LightType.STATIC,
                    active: true
                });
            }
        }

        this.roomSnapshot = {
            inventoryItems: this.inventoryItems.map(it => ({...it})),
            enemies: Array.from(this.enemiesMap.values()).map(e => ({...e, fsm: null})), // We rebuild FSM on restore
            trapState: JSON.parse(JSON.stringify(this.trapState)),
            chests: JSON.parse(JSON.stringify(this.chests)),
            barrels: JSON.parse(JSON.stringify(this.barrels)),
            torches: JSON.parse(JSON.stringify(this.torches)),
            npcs: Array.from(this.npcsMap.values()).map(n => ({...n, fsm: null})),
            obstacles: JSON.parse(JSON.stringify(this.obstacles)),
            secretDoors: JSON.parse(JSON.stringify(this.secretDoors)),
            secretDoorObstacles: JSON.parse(JSON.stringify(this.secretDoorObstacles))
        };

        this.updateStaticLayer();
        this.updateUI();
    }

    private updateStaticLayer() {
        this.render.updateStaticLayer(
            this.dungeon.grid, 
            this.secretDoors, 
            this.secretRoomOpen, 
            this.secretRoomCells,
            this.player.x,
            this.player.y
        );
    }

    private getWallChar(x: number, y: number): string {
        const wallChars: Record<number, string> = { 0: '■', 1: '║', 2: '║', 3: '║', 4: '═', 5: '╚', 6: '╔', 7: '╠', 8: '═', 9: '╝', 10: '╗', 11: '╣', 12: '═', 13: '╩', 14: '╦', 15: '╬' };
        let n = (y > 0 && this.dungeon.grid[x][y-1] === 1) ? 1 : 0;
        let s = (y < MAP_ROWS-1 && this.dungeon.grid[x][y+1] === 1) ? 2 : 0;
        let e = (x < MAP_COLS-1 && this.dungeon.grid[x+1][y] === 1) ? 4 : 0;
        let w = (x > 0 && this.dungeon.grid[x-1][y] === 1) ? 8 : 0;
        return wallChars[n + s + e + w] || '#';
    }

    private isPassable = (x: number, y: number) => {
        if (x < 0 || y < 0 || x >= MAP_COLS || y >= MAP_ROWS) return false;
        const isSecDoor = this.secretDoors.some(d => d.x === x && d.y === y);
        if (this.dungeon.grid[x][y] === 1) { if (isSecDoor && this.secretRoomOpen) {} else return false; }
        if (this.startDoor && !this.startDoor.open && y === 22 && x >= 17 && x <= 22) return false;
        // Check for objects (barrels and chests) that block pathfinding
        const worldX = x * TILE_SIZE + TILE_SIZE / 2;
        const worldY = y * TILE_SIZE + TILE_SIZE / 2;
        // Check barrels
        for (const barrel of this.barrels) {
            if (Math.abs(barrel.x - worldX) < TILE_SIZE * 0.8 && Math.abs(barrel.y - worldY) < TILE_SIZE * 0.8) {
                return false;
            }
        }
        // Check chests
        for (const chest of this.chests) {
            if (Math.abs(chest.x - worldX) < TILE_SIZE * 0.8 && Math.abs(chest.y - worldY) < TILE_SIZE * 0.8) {
                return false;
            }
        }
        return true;
    }

    private isCellVisible = (x: number, y: number) => {
        if (this.ui.state.seeAllMap) return true;
        return lumen.isVisible(x, y);
    }

    private getCellLightLevel = (x: number, y: number) => {
        if (this.ui.state.seeAllMap) return 1;
        return lumen.getLightLevel(x, y);
    }

    private refreshExploredFromLumen() {
        for (let x = 0; x < MAP_COLS; x++) {
            for (let y = 0; y < MAP_ROWS; y++) {
                if (lumen.isVisible(x, y)) {
                    this.dungeon.explored[x][y] = true;
                }
            }
        }
    }

    private updateDynamicLights() {
        const px = Math.floor(this.player.x / TILE_SIZE);
        const py = Math.floor(this.player.y / TILE_SIZE);
        lumen.addLight({
            id: Game.PLAYER_LIGHT_ID,
            x: px,
            y: py,
            radius: 7,
            intensity: 1,
            type: LightType.DYNAMIC,
            active: true
        });
        lumen.updateLightPosition(Game.PLAYER_LIGHT_ID, px, py);

        for (let i = this.bullets.length - 1; i >= 0; i--) {
            const b = this.bullets[i];
            const bx = Math.floor(b.x / TILE_SIZE);
            const by = Math.floor(b.y / TILE_SIZE);
            if (bx < 0 || by < 0 || bx >= MAP_COLS || by >= MAP_ROWS) continue;
            lumen.addLight({
                id: `bullet_${i}`,
                x: bx,
                y: by,
                radius: 2,
                intensity: 0.25,
                type: LightType.TEMPORARY,
                active: true,
                ttl: 25
            });
        }
    }

    private isBlocking = (gx: number, gy: number) => {
        if (gx < 0 || gy < 0 || gx >= MAP_COLS || gy >= MAP_ROWS) return true;
        if (this.dungeon.grid[gx][gy] === 1) {
            const isSecDoor = this.secretDoors.some(d => d.x === gx && d.y === gy);
            if (!(isSecDoor && this.secretRoomOpen)) return true;
        }
        return false;
    };

    private countWallsBetween(x1: number, y1: number, x2: number, y2: number): number {
        let tx1 = Math.floor(x1 / TILE_SIZE);
        let ty1 = Math.floor(y1 / TILE_SIZE);
        const tx2 = Math.floor(x2 / TILE_SIZE);
        const ty2 = Math.floor(y2 / TILE_SIZE);

        const dx = Math.abs(tx2 - tx1);
        const dy = Math.abs(ty2 - ty1);
        const sx = tx1 < tx2 ? 1 : -1;
        const sy = ty1 < ty2 ? 1 : -1;
        let err = dx - dy;

        let walls = 0;
        while (tx1 !== tx2 || ty1 !== ty2) {
            const e2 = err * 2;
            if (e2 > -dy) { err -= dy; tx1 += sx; }
            if (e2 < dx) { err += dx; ty1 += sy; }
            if (this.dungeon.grid[tx1]?.[ty1] === 1) {
                const isSecDoor = this.secretDoors.some(d => d.x === tx1 && d.y === ty1);
                if (!(isSecDoor && this.secretRoomOpen)) walls++;
            }
        }
        return walls;
    }

    private update() {
        this.frameCounter++;

        // Handle death animation countdown
        if (this.deathAnimTimer > 0) {
            this.deathAnimTimer--;
            if (this.deathAnimTimer <= 0) {
                this.finishRestartRoom();
            }
            this.particles.update();
            return; // Skip normal update during death animation
        }

        // Update particles even when dead
        if (this.isDead) {
            this.particles.update();
            return;
        }

        this.particles.update();
        
        // Update animations
        const dt = 16.66; // Approx 60fps
        if (this.player.anim) this.player.anim.update(dt);
        this.enemiesMap.values().forEach(e => {
            if (e.anim) e.anim.update(dt);
        });
        
        for (let i = this.floatingTexts.length - 1; i >= 0; i--) {
            this.floatingTexts[i].y -= 0.5;
            this.floatingTexts[i].life--;
            if (this.floatingTexts[i].life <= 0) this.floatingTexts.splice(i, 1);
        }

        if (this.gameState === 'INVENTORY' || this.gameState === 'CHEST') {
            if (this.uiAnimProgress < 1) this.uiAnimProgress += 0.1;
        }

        if (this.gameState === 'GLOBAL_MAP') {
            this.hoveredNodeId = null;
            for (let id in this.globalMap.nodes) {
                if (Utils.distSq(this.input.mouse, this.globalMap.nodes[id]) < 625) {
                    this.hoveredNodeId = this.globalMap.nodes[id].id;
                    break;
                }
            }
        }

        if (this.gameState === 'PLAYING') {
            this.updateStatuses();
            if (this.isDead) return;
            this.updatePlayer();
            if (this.isDead) return;
            this.updateEnemies();
            if (this.isDead) return;
            this.updateProjectiles();
            if (this.isDead) return;
            this.traps.update(this.player, Array.from(this.enemiesMap.values()), this.trapState, this.ui.state.godMode, this.secretRoomCells);
            if (this.roomActive && this.frameCounter % 4 === 0) this.fluids.step(this.isPassable, (x, y) => this.makeNoise(x, y, 400));
            
            // Exit logic
            if (this.roomActive && this.enemiesMap.size === 0 && this.doors.length === 0) {
                this.doors = [{ x: this.exitRoomCenter.x - 30, y: this.exitRoomCenter.y - 20, w: 60, h: 40, type: 'exit' }];
                sfx.roomClear();
                this.roomClearTimer = 180;
            }
            if (this.roomClearTimer > 0) this.roomClearTimer--;

            this.doors.forEach(door => {
                if (this.player.x > door.x && this.player.x < door.x + door.w && this.player.y > door.y && this.player.y < door.y + door.h) {
                    this.gameState = 'EXIT_CONFIRM';
                    this.input.keys.KeyW = false; this.input.keys.KeyS = false; this.input.keys.KeyA = false; this.input.keys.KeyD = false;
                }
            });

            const px = Math.floor(this.player.x / TILE_SIZE);
            const py = Math.floor(this.player.y / TILE_SIZE);
            
            let fovRadius = 15;
            const currentTile = this.fluids.getGrid()[px]?.[py];
            if (currentTile && currentTile.steam > 50) fovRadius = 5;
            this.updateDynamicLights();
            this.fluids.getGrid().forEach((column, x) => {
                column.forEach((cell, y) => {
                    if (cell && cell.fire > 0) {
                        lumen.addLight({
                            id: `fire_${x}_${y}`,
                            x,
                            y,
                            radius: 3,
                            intensity: Math.min(0.9, 0.35 + cell.fire / 200),
                            type: LightType.TEMPORARY,
                            active: true,
                            ttl: 120
                        });
                    }
                });
            });

            lumen.update(dt);
            lumen.calculateLighting({
                frameCount: this.frameCounter,
                playerPos: { x: px, y: py },
                playerVisionRadius: fovRadius,
                playerAngle: this.player.angle,
                playerFovAngle: Math.PI / 3, // 60 degree cone
                absoluteVisibilityRadius: 2, // 2 cells absolute visibility around player
                isBlocking: (x, y) => !this.isPassable(x, y)
            });
            this.refreshExploredFromLumen();

            // Start door trigger
            if (this.startDoor && !this.startDoor.open && Utils.distSq({x: this.startDoor.x+this.startDoor.w/2, y: this.startDoor.y+this.startDoor.h/2}, this.player) < 2500) {
                this.startDoor.open = true;
                this.roomActive = true;
                sfx.doorOpen();
                this.particles.spawn(this.startDoor.x+this.startDoor.w/2, this.startDoor.y+this.startDoor.h/2, 20);
            }
        }
    }

    private updateStatuses() {
        const grid = this.fluids.getGrid();
        
        // Player
        const px = Math.floor(this.player.x / TILE_SIZE);
        const py = Math.floor(this.player.y / TILE_SIZE);
        const pTile = grid[px]?.[py];
        if (pTile && pTile.vol > 50) {
            this.player.status = pTile.type;
            this.player.statusTimer = 180;
        } else if (this.player.statusTimer > 0) {
            this.player.statusTimer--;
            if (this.player.statusTimer <= 0) this.player.status = null;
        }

        // Enemies
        const enemies = enemyQuery(this.world);
        for (let i = 0; i < enemies.length; i++) {
            const eid = enemies[i];
            const e = this.enemiesMap.get(eid)!;
            const ex = Math.floor(Position.x[eid] / TILE_SIZE);
            const ey = Math.floor(Position.y[eid] / TILE_SIZE);
            const eTile = grid[ex]?.[ey];
            if (eTile && eTile.vol > 50) {
                e.status = eTile.type;
                e.statusTimer = 180;
            } else if (e.statusTimer > 0) {
                e.statusTimer--;
                if (e.statusTimer <= 0) e.status = null;
            }

            // Contact death
            if (!this.ui.state.godMode && !this.player.isDashing && Utils.distSq({x: Position.x[eid], y: Position.y[eid]}, {x: Position.x[this.player.eid], y: Position.y[this.player.eid]}) < (12 + this.player.radius)**2) {
                this.restartRoom();
            }
        }
    }

    private updatePlayer() {
        // Sync bitECS -> legacy
        this.player.x = Position.x[this.player.eid];
        this.player.y = Position.y[this.player.eid];

        if (this.player.isReloading) {
            this.player.reloadTimer--;
            if (this.player.reloadTimer <= 0) { 
                this.player.isReloading = false; 
                this.player.ammo = this.player.computedStats.maxAmmo; 
                this.updateUI(); 
            }
        }

        let dx = 0, dy = 0;
        let currentSpeed = this.player.computedStats.speed;
        if (this.player.status === 'oil') currentSpeed *= 0.5;
        if (this.player.status === 'petroleum') currentSpeed *= 0.4;
        
        if (this.player.isDashing) {
            this.player.dashTimer--;
            dx = Math.cos(this.player.dashAngle) * this.player.baseStats.dashSpeed;
            dy = Math.sin(this.player.dashAngle) * this.player.baseStats.dashSpeed;
            this.player.trail.push({ x: this.player.x, y: this.player.y, alpha: 0.8 });
            if (this.player.dashTimer <= 0) this.player.isDashing = false;
        } else {
            if (this.input.keys.KeyW) dy -= currentSpeed;
            if (this.input.keys.KeyS) dy += currentSpeed;
            if (this.input.keys.KeyA) dx -= currentSpeed;
            if (this.input.keys.KeyD) dx += currentSpeed;

            if (dx !== 0 && dy !== 0) {
                const length = Math.sqrt(dx * dx + dy * dy);
                dx = (dx / length) * currentSpeed;
                dy = (dy / length) * currentSpeed;
            }

            // Update player animation state
            if (dx !== 0 || dy !== 0) {
                if (this.frameCounter % 15 === 0) {
                    this.makeNoise(this.player.x, this.player.y, 150);
                }

                if (Math.abs(dy) > Math.abs(dx)) {
                    this.player.anim = new AnimatedSprite(dy > 0 ? ANIMATIONS.PLAYER_WALK_DOWN : ANIMATIONS.PLAYER_WALK_UP);
                } else {
                    this.player.anim = new AnimatedSprite(ANIMATIONS.PLAYER_WALK_SIDE);
                }
            } else {
                if (this.player.anim) {
                    const frames = (this.player.anim as any).def.frames[0];
                    if (frames.includes('_d')) this.player.anim = new AnimatedSprite(ANIMATIONS.PLAYER_IDLE_DOWN);
                    else if (frames.includes('_u')) this.player.anim = new AnimatedSprite(ANIMATIONS.PLAYER_IDLE_UP);
                    else this.player.anim = new AnimatedSprite(ANIMATIONS.PLAYER_IDLE_SIDE);
                }
            }

            if (this.input.keys.Space && this.frameCounter % 60 === 0) {
                this.player.isDashing = true;
                this.player.dashTimer = this.player.baseStats.dashDuration;
                
                let dashDx = 0, dashDy = 0;
                if (this.input.keys.KeyW) dashDy -= 1;
                if (this.input.keys.KeyS) dashDy += 1;
                if (this.input.keys.KeyA) dashDx -= 1;
                if (this.input.keys.KeyD) dashDx += 1;
                
                if (dashDx !== 0 || dashDy !== 0) {
                    const len = Math.sqrt(dashDx * dashDx + dashDy * dashDy);
                    dashDx /= len; dashDy /= len;
                    this.player.dashAngle = Math.atan2(dashDy, dashDx);
                }
                
                sfx.dash();
                this.particles.spawn(this.player.x, this.player.y, 5, 1, 3);
                this.makeNoise(this.player.x, this.player.y, 400);
            }
        }

        const steps = this.player.isDashing ? 4 : 1;
        for (let s = 0; s < steps; s++) {
            if (this.player.isDashing && this.frameCounter % 2 === 0) {
                this.particles.spawn(this.player.x, this.player.y, 2, 1, 2);
            }
            this.player.x += dx / steps;
            this.player.x = Utils.clamp(this.player.x, this.player.radius, GAME_WIDTH - this.player.radius);
            this.obstacles.forEach(obs => resolveCollision(this.player, obs));
            if (this.startDoor && !this.startDoor.open) resolveCollision(this.player, this.startDoor);

            this.player.y += dy / steps;
            this.player.y = Utils.clamp(this.player.y, this.player.radius, GAME_HEIGHT - this.player.radius);
            this.obstacles.forEach(obs => resolveCollision(this.player, obs));
            if (this.startDoor && !this.startDoor.open) resolveCollision(this.player, this.startDoor);
        }

        for (let i = this.player.trail.length - 1; i >= 0; i--) {
            this.player.trail[i].alpha -= 0.1;
            if (this.player.trail[i].alpha <= 0) this.player.trail.splice(i, 1);
        }

        this.player.angle = Math.atan2(this.input.mouse.y - this.player.y, this.input.mouse.x - this.player.x);
        
        // Shooting
        if (this.input.mouse.clicked && this.roomActive && this.gameState === 'PLAYING' && !this.player.isReloading) {
            if (this.frameCounter % this.player.computedStats.shootCooldown === 0 && this.player.ammo > 0) {
                if (this.player.status === 'petroleum') {
                    this.addFloatingText(this.player.x, this.player.y - 20, "ИСКРА!", "#f00");
                    sfx.explosion();
                    this.particles.spawn(this.player.x, this.player.y, 60, 2, 5);
                    this.restartRoom();
                    return;
                }
                this.player.ammo--;
                
                const px = Math.floor(this.player.x / TILE_SIZE);
                const py = Math.floor(this.player.y / TILE_SIZE);
                const playerLightLevel = this.getCellLightLevel(px, py);
                
                const baseAccuracy = 0.85;
                const modifiedAccuracy = this.combat.applyLightToAccuracy(baseAccuracy, playerLightLevel);
                
                const projs = this.combat.spawnProjectiles(this.player, this.player.angle, { projectiles: this.player.computedStats.projectiles, spreadAngle: this.player.computedStats.spreadAngle }, 0, this.player.radius, false);
                this.bullets.push(...projs);
                
                lumen.addLight({
                    id: `muzzle_${this.frameCounter}`,
                    x: px,
                    y: py,
                    radius: 3,
                    intensity: 0.8,
                    type: LightType.TEMPORARY,
                    active: true,
                    ttl: 60
                });
                sfx.playerShoot();
                this.makeNoise(this.player.x, this.player.y, 300);
                this.updateUI();
                if (this.player.ammo <= 0) this.reload();
            }
        }

        // Sync legacy -> bitECS
        Position.x[this.player.eid] = this.player.x;
        Position.y[this.player.eid] = this.player.y;
    }

    private updateEnemies() {
        let inCombat = false;
        const grid = this.fluids.getGrid();
        const enemies = enemyQuery(this.world);
        for (let i = 0; i < enemies.length; i++) {
            const eid = enemies[i];
            const e = this.enemiesMap.get(eid)!;
            const idx = i;
            
            e.x = Position.x[eid];
            e.y = Position.y[eid];

            for (let j = 0; j < enemies.length; j++) {
                const otherEid = enemies[j];
                if (eid !== otherEid) {
                    const dx = Position.x[eid] - Position.x[otherEid];
                    const dy = Position.y[eid] - Position.y[otherEid];
                    const dSq = dx * dx + dy * dy;
                    if (dSq > 0 && dSq < 900) {
                        const dist = Math.sqrt(dSq);
                        const push = (30 - dist) / 30;
                        Position.x[eid] += (dx / dist) * push * 1.5;
                        Position.y[eid] += (dy / dist) * push * 1.5;
                    }
                }
            }

            decayNoise(e, 0.1);
            if (e.noiseLevel > 0 && e.noisePosition) {
                const rotationSpeed = e.noiseLevel > 60 ? 0.12 : 0.04;
                (EnemyActions as any).turnTowards(e, e.noisePosition, rotationSpeed);
            }

            if ((this.frameCounter + idx) % 6 === 0) {
                e.lastCanSeePlayer = checkVisionCone(e, this.player, this.isBlocking);
            }
            const canSeePlayer = e.lastCanSeePlayer || false;

            if (canSeePlayer) {
                updateMemory(e, { x: Position.x[this.player.eid], y: Position.y[this.player.eid] });
                if (e.fsm.state.value === 'patrol' || e.fsm.state.value === 'investigate') { 
                    e.fsm.send('PLAYER_SPOTTED'); e.alertTimer = 45; 
                    this.addFloatingText(Position.x[eid], Position.y[eid] - 20, "!", "#f00");
                } else if (e.fsm.state.value === 'alerting') { 
                    e.alertTimer--; if (e.alertTimer <= 0) e.fsm.send('ALERT_DONE'); 
                }
            } else if (e.noiseLevel >= 100) {
                if (e.fsm.state.value === 'patrol') e.fsm.send('HEARD_NOISE');
            } else if (hasValidMemory(e)) {
                if (e.fsm.state.value === 'chase' || e.fsm.state.value === 'attack' || e.fsm.state.value === 'alerting') e.fsm.send('PLAYER_LOST');
                decrementMemoryTimer(e);
            } else if (e.fsm.state.value !== 'patrol') e.fsm.send('REACHED_TARGET');

            if (e.role === 'follower' && e.leader && e.leader.fsm) {
                const lState = e.leader.fsm.state.value;
                if (lState !== 'patrol' && e.fsm.state.value === 'patrol') {
                    if (e.leader.lastKnownPosition) updateMemory(e, e.leader.lastKnownPosition);
                    if (lState === 'investigate') e.fsm.send('HEARD_NOISE');
                    else if (lState === 'alerting' || lState === 'chase' || lState === 'attack') { e.fsm.send('PLAYER_SPOTTED'); e.alertTimer = e.leader.alertTimer || 60; }
                }
            }

            const state = e.fsm.state.value;
            if (state === 'chase' || state === 'attack') inCombat = true;
            (EnemyActions as any)[state](e, canSeePlayer, this.obstacles, this.isPassable, this.player, this.enemiesMap.values());
            Position.x[eid] = e.x; Position.y[eid] = e.y;

            if (e.barkTimer > 0) e.barkTimer--;
            if (e.barkTimer <= 0 && canSeePlayer && Math.random() < 0.005) { e.barkText = ENEMY_BARKS[Math.floor(Math.random()*ENEMY_BARKS.length)]; e.barkTimer = 90; }

            if (e.type === 'shooter' && (state === 'chase' || state === 'attack') && canSeePlayer && this.frameCounter % 60 === 0) {
                if (e.status === 'petroleum') {
                    this.addFloatingText(Position.x[eid], Position.y[eid] - 20, "ИСКРА!", "#f00");
                    sfx.explosion(); this.particles.spawn(Position.x[eid], Position.y[eid], 60, 2, 5); this.killEnemy(eid);
                } else {
                    const px = Math.floor(Position.x[this.player.eid]/TILE_SIZE), py = Math.floor(Position.y[this.player.eid]/TILE_SIZE);
                    const pTile = grid[px]?.[py];
                    let spread = 0; if (pTile && pTile.steam > 50) spread = 0.5;
                    const angle = Math.atan2(Position.y[this.player.eid] - Position.y[eid], Position.x[this.player.eid] - Position.x[eid]) + (Math.random() - 0.5) * spread;
                    this.bullets.push({ x: Position.x[eid], y: Position.y[eid], vx: Math.cos(angle)*4, vy: Math.sin(angle)*4, radius: 3, isEnemy: true, id: Math.random(), damage: 1, type: 'enemy', lifetime: 180 });
                    lumen.addLight({ id: `enemy_muzzle_${eid}_${this.frameCounter}`, x: Math.floor(Position.x[eid] / TILE_SIZE), y: Math.floor(Position.y[eid] / TILE_SIZE), radius: 2, intensity: 0.6, type: LightType.TEMPORARY, active: true, ttl: 50 });
                    sfx.enemyShoot();
                }
            }
        }
        if (inCombat) this.combatIntensity = Math.min(1, this.combatIntensity + 0.05);
        else this.combatIntensity = Math.max(0, this.combatIntensity - 0.02);
    }

    private updateProjectiles() {
        for (let i = this.bullets.length - 1; i >= 0; i--) {
            let b = this.bullets[i];
            b.x += b.vx; b.y += b.vy;
            this.particles.spawn(b.x, b.y, 1, 1, 1);
            if (b.x < 0 || b.x > GAME_WIDTH || b.y < 0 || b.y > GAME_HEIGHT) { this.bullets.splice(i, 1); continue; }
            
            let hit = false;
            for (let obs of this.obstacles) {
                if (b.x > obs.x && b.x < obs.x + obs.w && b.y > obs.y && b.y < obs.y + obs.h) { hit = true; break; }
            }
            if (hit) { this.particles.spawn(b.x, b.y, 5, 2, 2); this.bullets.splice(i, 1); continue; }

            for (let j = this.barrels.length - 1; j >= 0; j--) {
                const brl = this.barrels[j];
                if (Utils.distSq(brl, b) < (brl.radius + b.radius)**2) { this.destroyBarrel(j); this.bullets.splice(i, 1); hit = true; break; }
            }
            if (hit) continue;

            if (!b.isEnemy) {
                const enemies = enemyQuery(this.world);
                for (let j = enemies.length - 1; j >= 0; j--) {
                    const eid = enemies[j];
                    if (Utils.distSq({x: Position.x[eid], y: Position.y[eid]}, b) < (12 + b.radius)**2) {
                        this.killEnemy(eid); this.bullets.splice(i, 1); break;
                    }
                }
            } else {
                if (!this.ui.state.godMode && !this.player.isDashing && Utils.distSq({x: Position.x[this.player.eid], y: Position.y[this.player.eid]}, b) < (this.player.radius + b.radius)**2) {
                    this.restartRoom(); break;
                }
            }
        }
    }

    private draw() {
        this.render.clear();
        if (this.gameState === 'GLOBAL_MAP') {
            this.drawGlobalMap();
        } else if (this.gameState === 'PLAYING' || this.gameState === 'INVENTORY' || this.gameState === 'EXIT_CONFIRM' || this.gameState === 'DIALOG' || this.gameState === 'CHEST') {
            // Обновляем позицию игрока для параллакс эффекта
            this.render.updatePlayerPosition(this.player.x, this.player.y);
            
            // Рисуем параллакс слои (фон)
            this.render.drawParallaxLayers();
            
            this.render.drawStaticLayer();
            
            // Рисуем overlay детали (трещины, мох, кровь)
            this.overlay.draw(this.ctx, this.spriteCache);
            
            this.drawSecretVisuals();
            this.drawFluids();
            this.drawEntities();
            this.particles.draw(this.ctx, this.spriteCache);
            this.bullets.forEach(b => {
                this.ctx.fillStyle = '#fff';
                this.ctx.beginPath(); this.ctx.arc(b.x, b.y, b.radius, 0, Math.PI*2); this.ctx.fill();
            });
            this.render.drawDitherOverlay(this.isCellVisible, this.getCellLightLevel, this.dungeon.explored, this.ui.state.seeAllMap, lumen.getAO.bind(lumen));
            
            // Отрисовка эффектов вспышек для источников света (магические эффекты)
            lumen.getAllLightIds().forEach(id => {
                // Вспышки для временных источников света (взрывы, магия)
                if (id.includes('barrel_blast') || id.includes('muzzle') || id.includes('fire_')) {
                    const idx = id.split('_');
                    if (id.includes('barrel_blast')) {
                        const gridX = Math.floor(Math.random() * 5) - 2;  // Random x offset
                        const gridY = Math.floor(Math.random() * 5) - 2;  // Random y offset
                        this.render.drawBrightFlash(
                            (gridX + 1) * TILE_SIZE + TILE_SIZE/2, 
                            (gridY + 1) * TILE_SIZE + TILE_SIZE/2, 
                            6
                        );
                    }
                }
            });
            
            this.drawCinemaLines();

            if (this.gameState === 'INVENTORY' || this.gameState === 'CHEST') this.drawInventory();
            if (this.gameState === 'EXIT_CONFIRM') this.drawExitConfirm();
            if (this.gameState === 'DIALOG') this.drawDialogPopup();
        }
        
        if (this.gameState === 'GAME_OVER') this.drawFullscreenMessage("ТВОЯ ВОЛЯ СЛОМЛЕНА", "Кликни, чтобы начать новый забег");
        if (this.gameState === 'VICTORY') this.drawFullscreenMessage("ВЫ ПОКОРИЛИ ПОДЗЕМЕЛЬЕ!", "Кликни, чтобы начать заново");

        // Death animation - Smooth fade to black like Hotline Miami
        if (this.deathAnimTimer > 0) {
            const ctx = this.ctx;

            // Smooth fade - progress 0 to 1
            const progress = 1 - (this.deathAnimTimer / 120);

            ctx.save();
            ctx.fillStyle = `rgba(0, 0, 0, ${progress})`;
            ctx.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);
            ctx.restore();
        }

        // Draw death state
        if (this.isDead) {
            const ctx = this.ctx;
            
            // Draw "R to restart" message
            ctx.save();
            ctx.font = 'bold 20px "IBM Plex Mono"';
            ctx.textAlign = 'center';
            ctx.fillStyle = '#fff';
            ctx.shadowColor = '#000';
            ctx.shadowBlur = 4;
            ctx.fillText('[R] TO RESTART', GAME_WIDTH / 2, GAME_HEIGHT / 2 + 80);
            ctx.restore();
        }
    }

    private drawSecretVisuals() {
        const ctx = this.ctx;
        ctx.font = '16px "IBM Plex Mono"';
        ctx.textAlign = 'center';
        
        // Secret Room Floor
        this.secretRoomCells.forEach(c => {
            if (this.isCellVisible(c.gx, c.gy)) {
                ctx.fillStyle = '#222';
                ctx.fillText('░', c.gx * TILE_SIZE + TILE_SIZE/2, c.gy * TILE_SIZE + TILE_SIZE/2 + 6);
            }
        });

        // Runes on walls
        if (this.secretDoors.length > 0 && Math.floor(this.frameCounter/30) % 2 === 0) {
            this.secretDoors.forEach(d => {
                if (this.isCellVisible(d.x, d.y)) {
                    ctx.fillStyle = '#fff';
                    ctx.fillText('ᚨ', d.x * TILE_SIZE + TILE_SIZE/2, d.y * TILE_SIZE + TILE_SIZE/2 + 6);
                }
            });
        }
    }

    private drawFluids() {
        const grid = this.fluids.getGrid();
        const ctx = this.ctx;
        ctx.font = 'bold 16px "IBM Plex Mono", monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        for (let x = 0; x < MAP_COLS; x++) {
            for (let y = 0; y < MAP_ROWS; y++) {
                const cell = grid[x][y];
                if (!cell) continue;
                if (!this.isCellVisible(x, y)) continue;

                const cx = x * TILE_SIZE + TILE_SIZE / 2;
                const cy = y * TILE_SIZE + TILE_SIZE / 2;

                // Priority: Fire > Steam > Liquids
                if (cell.fire > 0) {
                    ctx.fillStyle = ELEMENTS_DB['fire'].color;
                    ctx.fillText(ELEMENTS_DB['fire'].char, cx, cy);
                } else if (cell.steam > 5) {
                    ctx.globalAlpha = Utils.clamp(cell.steam / 100, 0.2, 0.8);
                    ctx.fillStyle = ELEMENTS_DB['steam'].color;
                    ctx.fillText(ELEMENTS_DB['steam'].char, cx, cy);
                    ctx.globalAlpha = 1.0;
                } else if (cell.type && cell.vol > 5) {
                    const props = ELEMENTS_DB[cell.type];
                    ctx.fillStyle = props.color;
                    ctx.globalAlpha = Utils.clamp(cell.vol / 100, 0.4, 1.0);
                    ctx.fillText(props.char, cx, cy);
                    ctx.globalAlpha = 1.0;
                }
            }
        }
    }

    private drawCinemaLines() {
        if (this.combatIntensity <= 0) return;
        const ctx = this.ctx;
        ctx.fillStyle = '#fff';
        ctx.font = '12px "IBM Plex Mono"';
        const count = Math.floor(20 * this.combatIntensity);
        for (let i = 0; i < count; i++) {
            const side = Math.floor(Math.random() * 4);
            let x = 0, y = 0;
            if (side === 0) { x = Math.random() * GAME_WIDTH; y = 10 + Math.random() * 20; }
            else if (side === 1) { x = Math.random() * GAME_WIDTH; y = GAME_HEIGHT - 30 + Math.random() * 20; }
            else if (side === 2) { x = 10 + Math.random() * 20; y = Math.random() * GAME_HEIGHT; }
            else { x = GAME_WIDTH - 30 + Math.random() * 20; y = Math.random() * GAME_HEIGHT; }
            ctx.fillText(Math.random() > 0.5 ? '╱' : '╲', x, y);
        }
    }

    private drawHUD() {
        const ctx = this.ctx;
        ctx.textAlign = 'left';
        ctx.font = 'bold 16px "IBM Plex Mono", monospace';
        ctx.fillStyle = '#fff';
        
        // Will as Segments
        ctx.fillText("ВОЛЯ", 20, GAME_HEIGHT - 65);
        for(let i = 0; i < 5; i++) {
            const spriteKey = this.currentWill > i ? 'hud_will_1' : 'hud_will_0';
            const sprite = this.spriteCache.get(spriteKey);
            if (sprite) {
                ctx.drawImage(sprite, 20 + i * 25, GAME_HEIGHT - 45);
            } else {
                ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.strokeRect(20 + i*25, GAME_HEIGHT - 45, 20, 15);
                if (this.currentWill > i) { ctx.fillStyle = '#fff'; ctx.fillRect(22 + i*25, GAME_HEIGHT - 43, 16, 11); }
            }
        }

        ctx.textAlign = 'right'; ctx.font = 'bold 20px "IBM Plex Mono", monospace';
        ctx.fillStyle = '#fff';
        let ammoText = this.player.isReloading ? "ПЕРЕЗАРЯДКА..." : `ПАТРОНЫ: ${this.player.ammo}/${this.player.computedStats.maxAmmo}`;
        if (this.player.ammo === 0 && !this.player.isReloading) {
            // Negative effect for low ammo
            const w = ctx.measureText(ammoText).width;
            ctx.fillStyle = '#fff';
            ctx.fillRect(GAME_WIDTH - 20 - w - 4, GAME_HEIGHT - 55, w + 8, 20);
            ctx.fillStyle = '#000';
        } else {
            ctx.fillStyle = '#fff';
        }
        ctx.fillText(ammoText, GAME_WIDTH - 20, GAME_HEIGHT - 40);
        ctx.fillStyle = '#fff';
        ctx.fillText(`${this.player.credits} CR`, GAME_WIDTH - 20, GAME_HEIGHT - 15);

        if (this.player.status) {
            ctx.textAlign = 'left';
            ctx.fillStyle = '#fff';
            ctx.font = '14px "IBM Plex Mono"';
            let statusText = this.player.status.toUpperCase();
            if (this.player.status === 'petroleum') statusText = "ОПАСНОСТЬ: НЕФТЬ!";
            ctx.fillText(`СТАТУС: ${statusText}`, 20, GAME_HEIGHT - 85);
        }
        ctx.textAlign = 'center';
    }

    private drawFullscreenMessage(title: string, sub: string) {
        const ctx = this.ctx;
        ctx.fillStyle = '#181818'; ctx.fillRect(0,0,GAME_WIDTH,GAME_HEIGHT);
        ctx.fillStyle = '#fff'; ctx.textAlign = 'center';
        ctx.font = 'bold 48px "IBM Plex Mono"'; ctx.fillText(title, GAME_WIDTH/2, GAME_HEIGHT/2 - 20);
        ctx.font = '20px "IBM Plex Mono"'; ctx.fillText(sub, GAME_WIDTH/2, GAME_HEIGHT/2 + 30);
    }

    private drawGlobalMap() {
        const ctx = this.ctx;
        ctx.strokeStyle = '#444'; ctx.lineWidth = 2;
        for (let id in this.globalMap.nodes) {
            let node = this.globalMap.nodes[id];
            node.next.forEach(nextId => {
                let target = this.globalMap.nodes[nextId];
                if (node.status === 'completed' && target.status === 'available') ctx.strokeStyle = '#fff'; 
                else if (node.status === 'completed' && target.status === 'completed') ctx.strokeStyle = '#666'; 
                else ctx.strokeStyle = '#333';
                ctx.beginPath(); ctx.moveTo(node.x, node.y); ctx.lineTo(target.x, target.y); ctx.stroke();
            });
        }
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        for (let id in this.globalMap.nodes) {
            let node = this.globalMap.nodes[id];
            ctx.beginPath(); ctx.arc(node.x, node.y, 20, 0, Math.PI*2);
            if (node.status === 'available') { ctx.fillStyle = '#fff'; ctx.fill(); ctx.strokeStyle = '#fff'; } 
            else if (node.status === 'completed') { ctx.fillStyle = '#181818'; ctx.fill(); ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; } 
            else { ctx.fillStyle = '#000'; ctx.fill(); ctx.strokeStyle = '#333'; }
            ctx.stroke();
            
            if (node.id === this.selectedNodeId) { ctx.beginPath(); ctx.arc(node.x, node.y, 26, 0, Math.PI*2); ctx.stroke(); } 
            else if (node.id === this.hoveredNodeId && node.status === 'available') { ctx.beginPath(); ctx.arc(node.x, node.y, 26, 0, Math.PI*2); ctx.setLineDash([5, 5]); ctx.stroke(); ctx.setLineDash([]); }
            
            if (node.status === 'available' || node.status === 'completed') { 
                ctx.fillStyle = node.status === 'available' ? '#000' : '#888'; ctx.font = 'bold 20px "IBM Plex Mono", monospace'; 
                let ch = node.type === 'merchant' ? '$' : (node.type === 'shrine' ? 'H' : (node.type === 'boss' ? '!' : (node.next.length === 0 ? 'E' : 'R')));
                ctx.fillText(ch, node.x, node.y + 2); 
            }
        }
        ctx.fillStyle = '#fff'; ctx.font = 'bold 32px "IBM Plex Mono", monospace'; ctx.fillText("КАРТА ПОДЗЕМЕЛЬЯ", GAME_WIDTH/2, 50); 
    }

    private drawEntities() {
        const isMapFull = this.ui.state.seeAllMap;
        const ctx = this.ctx;
        ctx.font = 'bold 20px "IBM Plex Mono", monospace';
        ctx.textAlign = 'center';

        if (this.startDoor) {
            const doorSprite = this.spriteCache.get(this.startDoor.open ? 'tile_wall_0000' : 'tile_wall_1111');
            if (doorSprite) {
                for (let dx = 0; dx < this.startDoor.w; dx += TILE_SIZE) {
                    this.ctx.drawImage(doorSprite, this.startDoor.x + dx, this.startDoor.y, TILE_SIZE, TILE_SIZE);
                }
            } else {
                ctx.fillStyle = this.startDoor.open ? '#444' : '#fff';
                ctx.fillRect(this.startDoor.x, this.startDoor.y, this.startDoor.w, this.startDoor.h);
            }
            if (!this.startDoor.open) { ctx.fillStyle = '#fff'; ctx.font = '14px "IBM Plex Mono"'; ctx.fillText("[ ВХОД ]", this.startDoor.x + this.startDoor.w/2, this.startDoor.y + 12); ctx.font = 'bold 20px "IBM Plex Mono"'; }
        }

        this.chests.forEach(c => {
            if (isMapFull || this.isCellVisible(Math.floor(c.x/TILE_SIZE), Math.floor(c.y/TILE_SIZE))) {
                this.render.drawShadow(c.x, c.y + 5, 12);
                this.render.drawChest(c.x, c.y, this.frameCounter * 0.05);
                if (Utils.dist(this.player, c) < 30) {
                    // Желтая обводка
                    ctx.strokeStyle = '#ff0';
                    ctx.lineWidth = 2;
                    ctx.strokeRect(c.x - 12, c.y - 14, 24, 28);
                    ctx.font = '14px "IBM Plex Mono"';
                    ctx.fillText("[E] Сундук", c.x, c.y - 20);
                    ctx.font = 'bold 20px "IBM Plex Mono"';
                }
            }
        });
        this.trapState.pits.forEach(p => {
            if (!isMapFull && !this.isCellVisible(Math.floor(p.x / TILE_SIZE), Math.floor(p.y / TILE_SIZE))) return;
            this.render.drawPit(p.x, p.y, this.frameCounter * 0.05);
        });
        this.trapState.spikes.forEach(s => {
            if (!isMapFull && !this.isCellVisible(Math.floor(s.x / TILE_SIZE), Math.floor(s.y / TILE_SIZE))) return;
            // s.state === 2 означает что шипы полностью выдвинуты (активны)
            const isActive = s.state === 2;
            this.render.drawSpikeTrap(s.x, s.y, this.frameCounter * 0.05, isActive);
        });
        this.trapState.plates.forEach(p => {
            if (!isMapFull && !this.isCellVisible(Math.floor(p.x / TILE_SIZE), Math.floor(p.y / TILE_SIZE))) return;
            this.render.drawPressurePlate(p.x, p.y, p.pressed);
        });

        // bitECS NPCs
        const npcs = npcQuery(this.world);
        for (let i = 0; i < npcs.length; i++) {
            const eid = npcs[i];
            const n = this.npcsMap.get(eid)!;
            const nx = Position.x[eid], ny = Position.y[eid];
            if (isMapFull || this.isCellVisible(Math.floor(nx/TILE_SIZE), Math.floor(ny/TILE_SIZE))) {
                if (n.type === 'shrine') {
                    this.render.drawShadow(nx, ny + 8, 10);
                    const sprite = this.spriteCache.get('obj_altar');
                    if (sprite) ctx.drawImage(sprite, nx - sprite.width/2, ny - sprite.height/2);
                } else {
                    this.render.drawShadow(nx, ny + 8, 10);
                    this.render.drawNPC(nx, ny, this.frameCounter * 0.05);
                }
                if (Utils.dist(this.player, {x: nx, y: ny}) < 40) {
                    ctx.strokeStyle = '#ff0'; ctx.lineWidth = 2; ctx.strokeRect(nx - 12, ny - 18, 24, 36);
                    ctx.font = '14px "IBM Plex Mono"'; ctx.fillText(`[E] ${n.type === 'shrine' ? "Алтарь" : "Говорить"}`, nx, ny - 25); ctx.font = 'bold 20px "IBM Plex Mono"';
                }
            }
        }

        this.torches.forEach(t => {
            if (isMapFull || this.isCellVisible(t.gx, t.gy)) {
                const isLit = t.lit !== false;
                const isNear = Utils.dist(this.player, {x: t.x, y: t.y}) < 40;
                if (isNear) { ctx.strokeStyle = '#ff0'; ctx.lineWidth = 2; ctx.strokeRect(t.x - 10, t.y - 14, 20, 28); }
                this.render.drawShadow(t.x, t.y + 8, 10);
                const torchSprite = this.spriteCache.get('object_torch');
                if (torchSprite) ctx.drawImage(torchSprite, t.x - torchSprite.width/2, t.y - torchSprite.height/2);
                if (isLit) {
                    const flameSprite = this.spriteCache.get(this.frameCounter % 8 < 4 ? 'object_torch_flame_1' : 'object_torch_flame_2');
                    if (flameSprite) ctx.drawImage(flameSprite, t.x - flameSprite.width/2, t.y - flameSprite.height/2 - 6);
                }
                if (isNear) {
                    ctx.font = '14px "IBM Plex Mono"'; ctx.fillStyle = '#ff0'; ctx.fillText(isLit ? "[E] Потушить" : "[E] Зажечь", t.x, t.y - 20); ctx.font = 'bold 20px "IBM Plex Mono"';
                }
            }
        });

        // bitECS Enemies
        const enemies = enemyQuery(this.world);
        const thermalRadius = TILE_SIZE * 15;
        for (let i = 0; i < enemies.length; i++) {
            const eid = enemies[i];
            const e = this.enemiesMap.get(eid)!;
            const ex = Position.x[eid], ey = Position.y[eid];
            const isVisible = this.isCellVisible(Math.floor(ex/TILE_SIZE), Math.floor(ey/TILE_SIZE));
            const inThermalRange = this.player.hasThermal && Utils.dist(this.player, {x: ex, y: ey}) <= thermalRadius;
            
            if (isMapFull || isVisible || this.ui.state.seeAllEnemies || inThermalRange) {
                this.render.drawShadow(ex, ey + 8, 10);
                
                const debugFov = Math.PI / 2.2;
                const debugAngle = e.angle || 0;
                ctx.save();
                ctx.beginPath(); ctx.moveTo(ex, ey); ctx.arc(ex, ey, e.detectionRange, debugAngle - debugFov/2, debugAngle + debugFov/2); ctx.closePath();
                ctx.fillStyle = 'rgba(255, 255, 255, 0.05)'; ctx.fill();
                ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)'; ctx.stroke();
                ctx.restore();

                if (e.type === 'chaser') {
                    const isActive = e.fsm && (e.fsm.state.value === 'chase' || e.fsm.state.value === 'attacking' || e.fsm.state.value === 'alerting');
                    this.render.drawSlime(ex, ey, this.frameCounter * 0.05, isActive);
                } else if (e.type === 'shooter') {
                    this.render.drawSpikySlime(ex, ey, this.frameCounter * 0.05);
                } else if (e.anim) {
                    this.render.drawAnimatedSpriteWithShade(e.anim, this.spriteCache, ex, ey, 0.85);
                } else {
                    ctx.fillStyle = '#ddd'; ctx.fillText('?', ex, ey);
                }

                const state = e.fsm.state.value;
                if (state === 'alerting') { 
                    const progress = 1 - (e.alertTimer / 60); ctx.fillStyle = '#fff'; ctx.fillRect(ex - 10, ey - 15, 20 * progress, 4); 
                    const alertSprite = this.spriteCache.get('entity_alert');
                    if (alertSprite) this.ctx.drawImage(alertSprite, ex - alertSprite.width/2, ey - 25);
                }
                if (e.barkTimer > 0) { ctx.font = '14px "IBM Plex Mono"'; ctx.fillText(e.barkText, ex, ey - 20); ctx.font = 'bold 20px "IBM Plex Mono"'; }
            }
        }
        this.barrels.forEach(b => {
            if (isMapFull || this.isCellVisible(Math.floor(b.x/TILE_SIZE), Math.floor(b.y/TILE_SIZE))) {
                this.render.drawShadow(b.x, b.y + 8, 12);
                this.render.drawBarrel(b.x, b.y);
                if (Utils.dist(this.player, b) < 30 && !this.player.carryingBarrel) {
                    // Желтая обводка
                    ctx.strokeStyle = '#ff0';
                    ctx.lineWidth = 2;
                    ctx.strokeRect(b.x - 12, b.y - 16, 24, 32);
                    ctx.font = '14px "IBM Plex Mono"';
                    ctx.fillText("[E] Поднять", b.x, b.y - 20);
                    ctx.font = 'bold 20px "IBM Plex Mono"';
                }
            } 
        });
        this.doors.forEach(d => { 
            ctx.fillStyle = '#fff'; 
            if (this.roomClearTimer > 0 && Math.floor(this.frameCounter/10) % 2 === 0) ctx.fillRect(d.x-5, d.y-5, d.w+10, d.h+10);
            const sprite = this.spriteCache.get('tile_floor_secret');
            if (sprite) { for(let dx=0; dx<d.w; dx+=TILE_SIZE) for(let dy=0; dy<d.h; dy+=TILE_SIZE) ctx.drawImage(sprite, d.x+dx, d.y+dy); }
            ctx.fillStyle = (this.roomClearTimer > 0 && Math.floor(this.frameCounter/10) % 2 === 0) ? '#000' : '#fff';
            ctx.fillText("[ВЫХОД]", d.x + d.w/2, d.y + d.h/2); 
        });

        ctx.fillStyle = '#fff';
        this.render.drawShadow(this.player.x, this.player.y + 8, 10);
        this.render.drawHuman(this.player.x, this.player.y, this.player.angle, this.player.isDashing, this.player.godMode || false, this.gameState, this.frameCounter * 0.05);

        if (this.player.carryingBarrel) { ctx.font = '14px "IBM Plex Mono"'; let ch = this.player.carryingBarrel === 'water' ? '[В]' : (this.player.carryingBarrel === 'oil' ? '[М]' : '[*]'); ctx.fillText(ch, this.player.x, this.player.y - 20); ctx.font = 'bold 20px "IBM Plex Mono"'; }

        this.floatingTexts.forEach(ft => { ctx.globalAlpha = ft.life / 60; ctx.fillStyle = ft.color; ctx.fillText(ft.text, ft.x, ft.y); ctx.globalAlpha = 1.0; });
        if (this.roomClearTimer > 0) { ctx.fillStyle = '#fff'; ctx.font = 'bold 24px "IBM Plex Mono"'; ctx.fillText("КОМНАТА ЗАЧИЩЕНА. ИДИТЕ К ВЫХОДУ.", GAME_WIDTH/2, GAME_HEIGHT/2 - 40); ctx.font = 'bold 20px "IBM Plex Mono"'; }
    }

    private drawInventory() {
        const ctx = this.ctx;
        const progress = this.uiAnimProgress;
        ctx.fillStyle = `rgba(24,24,24,${0.9 * progress})`;
        ctx.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);
        
        ctx.save();
        ctx.translate(GAME_WIDTH/2, GAME_HEIGHT/2);
        ctx.scale(0.8 + 0.2 * progress, 0.8 + 0.2 * progress);
        ctx.translate(-GAME_WIDTH/2, -GAME_HEIGHT/2);

        // Horizontal layout: Chest left, Inventory right (same Y level)
        const chestX = this.gameState === 'CHEST' ? (GAME_WIDTH / 2 - 320) : 0;
        const invX = GAME_WIDTH / 2 + 20;
        const gridY = (GAME_HEIGHT - 6 * 30) / 2;
        
        // Draw Chest Window (left side)
        if (this.gameState === 'CHEST' && this.activeChest) {
            ctx.fillStyle = '#181818'; ctx.strokeStyle = '#fff'; ctx.lineWidth = 2;
            ctx.fillRect(chestX - 20, gridY - 40, 8 * 30 + 40, 6 * 30 + 100);
            ctx.strokeRect(chestX - 20, gridY - 40, 8 * 30 + 40, 6 * 30 + 100);
            
            ctx.fillStyle = '#fff'; ctx.font = 'bold 16px "IBM Plex Mono"'; ctx.textAlign = 'left';
            ctx.fillText("СОДЕРЖИМОЕ СУНДУКА", chestX, gridY - 15);
            
            // Grid
            ctx.strokeStyle = '#444'; ctx.lineWidth = 1;
            for(let r=0; r<6; r++) for(let c=0; c<8; c++) ctx.strokeRect(chestX + c*30, gridY + r*30, 30, 30);
            
            this.activeChest.items.forEach(item => {
                if (this.draggingItem === item) return;
                const db = ITEMS_DB[item.id];
                ctx.fillStyle = this.selectedItemInstanceId === item.instanceId ? '#fff' : '#888';
                db.shape.forEach((row, ri) => row.forEach((cell, ci) => { if (cell) ctx.fillRect(chestX + (item.x + ci)*30 + 2, gridY + (item.y + ri)*30 + 2, 26, 26); }));
            });

            // Close Button
            const mouse = this.input.mouse;
            const hClose = mouse.y > gridY + 6 * 30 + 10 && mouse.y < gridY + 6 * 30 + 40 && mouse.x > chestX + 70 && mouse.x < chestX + 190;

            ctx.fillStyle = hClose ? '#fff' : '#000'; ctx.fillRect(chestX + 70, gridY + 6*30 + 10, 120, 30);
            ctx.strokeStyle = '#fff'; ctx.strokeRect(chestX + 70, gridY + 6*30 + 10, 120, 30);
            ctx.fillStyle = hClose ? '#000' : '#fff'; ctx.textAlign = 'center'; ctx.fillText("ЗАКРЫТЬ", chestX + 70 + 60, gridY + 6*30 + 30);
        }

        // Draw Player Inventory Window (right side)
        ctx.fillStyle = '#111'; ctx.strokeStyle = '#fff'; ctx.lineWidth = 2;
        ctx.fillRect(invX - 20, gridY - 40, 8 * 30 + 140, 6 * 30 + 60);
        ctx.strokeRect(invX - 20, gridY - 40, 8 * 30 + 140, 6 * 30 + 60);
        ctx.fillStyle = '#fff'; ctx.font = 'bold 16px "IBM Plex Mono"'; ctx.textAlign = 'left';
        ctx.fillText("РЮКЗАК ИГРОКА", invX, gridY - 15);
        
        ctx.strokeStyle = '#444'; ctx.lineWidth = 1;
        for (let r = 0; r < 6; r++) for (let c = 0; c < 8; c++) ctx.strokeRect(invX + c * 30, gridY + r * 30, 30, 30);
        
        this.inventoryItems.forEach(item => {
            if (this.draggingItem === item) return;
            const db = ITEMS_DB[item.id];
            const isSelected = this.selectedItemInstanceId === item.instanceId;
            ctx.fillStyle = isSelected ? '#fff' : '#888';
            db.shape.forEach((row, ri) => row.forEach((cell, ci) => { if (cell) ctx.fillRect(invX + (item.x + ci)*30 + 2, gridY + (item.y + ri)*30 + 2, 26, 26); }));
            if (this.player.equippedWeaponInstanceId === item.instanceId) { ctx.strokeStyle = '#0f0'; ctx.lineWidth = 2; ctx.strokeRect(invX + item.x*30, gridY + item.y*30, 30, 30); ctx.lineWidth = 1; }
        });
        
        // Item tooltip popup - shows for selected item from either chest or inventory
        let hoveredItem: any = null;
        let hoveredSource: 'chest' | 'inventory' | null = null;
        let hoveredX = 0;
        
        // Check inventory item
        const invItem = this.inventoryItems.find(it => it.instanceId === this.selectedItemInstanceId);
        if (invItem && this.draggingItemSource !== 'chest') {
            hoveredItem = invItem;
            hoveredSource = 'inventory';
            hoveredX = invX;
        }
        // Check chest item
        else if (this.gameState === 'CHEST' && this.activeChest) {
            const chestItem = this.activeChest.items.find(it => it.instanceId === this.selectedItemInstanceId);
            if (chestItem) {
                hoveredItem = chestItem;
                hoveredSource = 'chest';
                hoveredX = chestX;
            }
        }
        
        // Draw item info tooltip at bottom center
        if (hoveredItem && !this.draggingItem) {
            const db = ITEMS_DB[hoveredItem.id];
            const tipX = GAME_WIDTH / 2 - 100;
            const tipY = gridY + 6 * 30 + 80;
            
            // Tooltip background
            ctx.fillStyle = '#000'; ctx.strokeStyle = '#fff'; ctx.lineWidth = 2;
            ctx.fillRect(tipX, tipY, 200, 60);
            ctx.strokeRect(tipX, tipY, 200, 60);
            
            // Item name
            ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.font = 'bold 14px "IBM Plex Mono"';
            ctx.fillText(db.name.toUpperCase(), tipX + 100, tipY + 25);
            
            // Item description
            ctx.fillStyle = '#aaa'; ctx.font = '12px "IBM Plex Mono"';
            ctx.fillText(db.desc.substring(0, 35), tipX + 100, tipY + 45);
            
            // Action buttons (only for inventory items)
            if (hoveredSource === 'inventory') {
                const bx = invX + 8 * 30 + 20;
                const by = gridY;
                if (db.type === 'weapon') {
                    ctx.fillStyle = (this.player.equippedWeaponInstanceId === hoveredItem.instanceId) ? '#444' : '#000';
                    ctx.fillRect(bx, by, 100, 30);
                    ctx.strokeStyle = '#fff'; ctx.strokeRect(bx, by, 100, 30);
                    ctx.fillStyle = '#fff'; ctx.font = '14px "IBM Plex Mono"'; ctx.textAlign = 'center';
                    ctx.fillText(this.player.equippedWeaponInstanceId === hoveredItem.instanceId ? "СНЯТЬ" : "ЭКИПИР.", bx + 50, by + 20);
                }
                ctx.fillStyle = '#000'; ctx.fillRect(bx, by + 40, 100, 30);
                ctx.strokeStyle = '#fff'; ctx.strokeRect(bx, by + 40, 100, 30);
                ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.fillText("УНИЧТОЖИТЬ", bx + 50, by + 60);
            }
        }

        // Dragging Item
        if (this.draggingItem) {
            const db = ITEMS_DB[this.draggingItem.id];
            ctx.fillStyle = 'rgba(255,255,255,0.7)';
            db.shape.forEach((row, ri) => row.forEach((cell, ci) => { if (cell) ctx.fillRect(this.input.mouse.x - this.dragOffset.x + ci*30 + 2, this.input.mouse.y - this.dragOffset.y + ri*30 + 2, 26, 26); }));
        }

        ctx.restore();
    }

    private drawExitConfirm() {
        const ctx = this.ctx;
        ctx.fillStyle = 'rgba(0,0,0,0.85)';
        ctx.fillRect(0,0,GAME_WIDTH,GAME_HEIGHT);
        ctx.fillStyle = '#fff';
        ctx.textAlign = 'center';
        ctx.font = 'bold 24px "IBM Plex Mono"';
        ctx.fillText("ВЫЙТИ НА КАРТУ?", GAME_WIDTH/2, GAME_HEIGHT/2 - 20);
        ctx.font = 'bold 20px "IBM Plex Mono"';
        ctx.fillText("[ДА]                    [НЕТ]", GAME_WIDTH/2, GAME_HEIGHT/2 + 30);
    }

    private drawDialogPopup() {
        if (!this.activeNPC) return;
        const ctx = this.ctx;
        const bottomY = GAME_HEIGHT - 80;
        const optWidth = (GAME_WIDTH - 120) / 2;
        const node = this.activeNPC.currentNode;
        if (!node) return;
        ctx.fillStyle = 'rgba(0, 0, 0, 0.9)'; ctx.fillRect(30, bottomY - 60, GAME_WIDTH - 60, 130); 
        ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.strokeRect(30, bottomY - 60, GAME_WIDTH - 60, 130);
        ctx.fillStyle = '#fff'; ctx.textAlign = 'left'; ctx.font = 'bold 18px "IBM Plex Mono"'; ctx.fillText("СООБЩЕНИЕ:", 50, bottomY - 40);
        ctx.font = '16px "IBM Plex Mono"'; node.text.split('\n').forEach((l:any, i:any) => ctx.fillText(l, 50, bottomY - 10 + (i * 20)));
        ctx.textAlign = 'center'; ctx.fillStyle = '#fff';
        
        const mouse = this.input.mouse;
        const h1 = mouse.x > 50 && mouse.x < 50 + optWidth && mouse.y > bottomY + 30 && mouse.y < bottomY + 60;
        ctx.fillStyle = h1 ? '#fff' : '#000'; ctx.fillRect(50, bottomY + 30, optWidth, 30);
        ctx.strokeStyle = '#fff'; ctx.strokeRect(50, bottomY + 30, optWidth, 30);
        ctx.fillStyle = h1 ? '#000' : '#fff'; ctx.fillText(node.options[0].text, 50 + optWidth/2, bottomY + 45);
        
        if (node.options[1]) {
            const h2 = mouse.x > 70 + optWidth && mouse.x < 70 + optWidth * 2 && mouse.y > bottomY + 30 && mouse.y < bottomY + 60;
            ctx.fillStyle = h2 ? '#fff' : '#000'; ctx.fillRect(70 + optWidth, bottomY + 30, optWidth, 30);
            ctx.strokeStyle = '#fff'; ctx.strokeRect(70 + optWidth, bottomY + 30, optWidth, 30);
            ctx.fillStyle = h2 ? '#000' : '#fff'; ctx.fillText(node.options[1].text, 70 + optWidth + optWidth/2, bottomY + 45);
        }
    }

    private updateSidePanel() {
        const nodeInfo = document.getElementById('nodeInfo')!;
        if (this.gameState !== 'GLOBAL_MAP') { nodeInfo.style.display = 'none'; return; }
        let targetId = this.hoveredNodeId !== null ? this.hoveredNodeId : this.selectedNodeId;
        if (targetId !== null) {
            let node = this.globalMap.nodes[targetId];
            document.getElementById('niTitle')!.innerText = node.type.toUpperCase();
            const descriptions: Record<string, string> = {
                simple: "Место испытаний и опасностей.",
                merchant: "Торговец со снаряжением.",
                shrine: "Алтарь благословений.",
                boss: "Арена битвы с боссом."
            };
            document.getElementById('niDesc')!.innerText = descriptions[node.type] || descriptions.simple;
            document.getElementById('niStatus')!.innerText = node.status.toUpperCase();
            nodeInfo.style.display = 'block';
        } else nodeInfo.style.display = 'none';
    }

    private loop = () => {
        this.update();
        this.draw();
        this.animationFrameId = requestAnimationFrame(this.loop);
    }

    private addFloatingText(x: number, y: number, text: string, color = '#fff') {
        this.floatingTexts.push({ x, y, text, color, life: 60 });
    }

    private makeNoise(nx: number, ny: number, radius: number) {
        const enemies = enemyQuery(this.world);
        for (let i = 0; i < enemies.length; i++) {
            const eid = enemies[i];
            const en = this.enemiesMap.get(eid)!;
            const state = en.fsm.state.value;
            // Only non-combat enemies accumulate noise
            if (state === 'patrol' || state === 'investigate') {
                const dist = Utils.dist({x: nx, y: ny}, {x: Position.x[eid], y: Position.y[eid]});
                if (dist < radius) {
                    const wallCount = this.countWallsBetween(nx, ny, Position.x[eid], Position.y[eid]);
                    const dampening = Math.pow(0.5, wallCount); // Walls block noise
                    
                    const intensity = (1 - dist / radius) * 50 * dampening;
                    
                    en.noisePosition = { x: nx, y: ny };
                    if (updateNoise(en, intensity)) {
                        // Threshold reached (100%)
                        updateMemory(en, { x: Position.x[this.player.eid], y: Position.y[this.player.eid] });
                        // Transition to investigate is handled in updateEnemies loop
                        this.addFloatingText(Position.x[eid], Position.y[eid] - 20, "!!!", "#f00");
                    } else if (intensity > 5) {
                        this.addFloatingText(Position.x[eid], Position.y[eid] - 20, "?", "#ff0");
                    }
                }
            }
        }
    }

    private destroyBarrel(index: number) {
        const brl = this.barrels.splice(index, 1)[0];
        if (!brl) return;
        // Remove from obstacles
        this.obstacles = this.obstacles.filter(o => !(o.type === 'barrel' && o.id === brl.id));
        sfx.hit();
        
        if (brl.type === 'explosive') {
            lumen.addLight({
                id: `barrel_blast_${this.frameCounter}`,
                x: Math.floor(brl.x / TILE_SIZE),
                y: Math.floor(brl.y / TILE_SIZE),
                radius: 6,
                intensity: 1,
                type: LightType.TEMPORARY,
                active: true,
                ttl: 180
            });
            sfx.explosion();
            this.particles.spawn(brl.x, brl.y, 60, 2, 6); // Large sparks on barrel explosion
            this.makeNoise(brl.x, brl.y, 500);
            if (!this.ui.state.godMode && !this.player.isDashing && Utils.dist(this.player, brl) < 60) this.restartRoom();
            const enemies = enemyQuery(this.world);
            for (let j = enemies.length - 1; j >= 0; j--) {
                const eid = enemies[j];
                if (Utils.dist({x: Position.x[eid], y: Position.y[eid]}, brl) < 60) this.killEnemy(eid);
            }
            this.fluids.ignite(Math.floor(brl.x/TILE_SIZE), Math.floor(brl.y/TILE_SIZE), (x, y) => this.makeNoise(x, y, 400));
        } else {
            this.fluids.spill(brl.x, brl.y, brl.type, 1500, this.isPassable);
        }
    }

    private setSecretRoomOpen(open: boolean) { this.secretRoomOpen = open; this.updateStaticLayer(); }
    
    private restartRoom() {
        if (this.ui.state.godMode || this.isRestarting || this.deathAnimTimer > 0 || this.isDead) return;
        this.isRestarting = true;
        // Chalice: 50% chance to not lose will
        if (this.player.hasChalice && Math.random() < 0.5) {
            this.addFloatingText(this.player.x, this.player.y - 40, "ЧАША ЗАЩИТИЛА ВОЛЮ!", "#ff0");
        } else {
            this.currentWill -= 1;
        }
        if (this.currentWill <= 0) { this.gameState = 'GAME_OVER'; sfx.gameOver(); this.isRestarting = false; }
        else {
            // Mark as dead and show R to restart message
            this.isDead = true;
            sfx.hit();
            
            // Clear all AI targets and memories immediately
            for (let e of this.enemiesMap.values()) {
                if (e.fsm) e.fsm.send('PLAYER_LOST');
                clearMemory(e);
            }

            // Spawn blood particles
            this.particles.spawnBlood(this.player.x, this.player.y, 20);
        }
        this.isRestarting = false;
    }

    private triggerRestartAnimation() {
        if (!this.isDead) return;
        this.isDead = false;
        this.deathAnimTimer = 120;
    }

    private finishRestartRoom() {
        // Restore room state after death animation
        this.inventoryItems = this.roomSnapshot.inventoryItems.map((it:any) => ({...it}));
        
        // Clear bitECS world of enemies/npcs
        const enemies = enemyQuery(this.world);
        enemies.forEach(eid => bitECS.removeEntity(this.world, eid));
        this.enemiesMap.clear();

        const npcs = npcQuery(this.world);
        npcs.forEach(eid => bitECS.removeEntity(this.world, eid));
        this.npcsMap.clear();

        this.roomSnapshot.enemies.forEach((eData:any) => {
            const en = this.spawnEnemy(eData.type, eData.x, eData.y, eData.role);
            en.angle = eData.angle || 0;
            if (eData.patrolPath) en.patrolPath = eData.patrolPath;
        });

        this.roomSnapshot.npcs.forEach((nData:any) => {
            this.spawnNPC(nData.type, nData.x, nData.y);
        });

        this.player.x = GAME_WIDTH / 2; this.player.y = 520; 
        Position.x[this.player.eid] = this.player.x;
        Position.y[this.player.eid] = this.player.y;
        this.player.trail = []; this.player.carryingBarrel = null;
        this.player.status = null; this.player.statusTimer = 0;
        this.isDead = false;
        
        if (this.player.equippedWeaponInstanceId) {
            const weapon = this.inventoryItems.find(it => it.instanceId === this.player.equippedWeaponInstanceId);
            if (!weapon) this.player.equippedWeaponInstanceId = null;
        }
        this.player.ammo = this.player.computedStats.maxAmmo;
        this.player.isReloading = false; this.player.reloadTimer = 0;
        this.trapState = { ...this.roomSnapshot.trapState };
        this.barrels = this.roomSnapshot.barrels.map((b:any) => ({...b}));
        this.bullets = []; this.particles.reset(); this.fluids.reset();
        this.secretRoomOpen = false;
        this.secretDoors = this.roomSnapshot.secretDoors ? [...this.roomSnapshot.secretDoors] : [];
        this.secretDoorObstacles = this.roomSnapshot.secretDoorObstacles ? [...this.roomSnapshot.secretDoorObstacles] : [];
        this.obstacles = this.roomSnapshot.obstacles ? [...this.roomSnapshot.obstacles] : [];
        this.chests = this.roomSnapshot.chests.map((c:any) => ({...c, items: c.items.map((it:any) => ({...it}))}));
        this.doors = [];
        if (this.startDoor) this.startDoor.open = false;
        this.roomActive = false;
        this.gameState = 'PLAYING';
        this.updateEquippedStats();
        this.updateStaticLayer();
        this.addFloatingText(this.player.x, this.player.y - 20, "НОВАЯ ПОПЫТКА", "#fff");
        this.updateUI();
    }

    private killEnemy(eid: number) { 
        const e = this.enemiesMap.get(eid);
        if (!e) return;
        this.particles.spawn(Position.x[eid], Position.y[eid], 15, 2, 3); // Sparks on kill
        bitECS.removeEntity(this.world, eid);
        this.enemiesMap.delete(eid);
        sfx.hit(); 
    }
    
    private updateUI() {
        this.ui.update(this.roomLevel, `${this.player.ammo}/${this.player.computedStats.maxAmmo}`, this.player.credits);
        
        // Обновляем HTML HUD элементы
        const creditsDisplay = document.getElementById('creditsDisplay');
        const healthBar = document.getElementById('healthBar');
        const ammoDisplay = document.getElementById('ammoDisplay');
        const dashDisplay = document.getElementById('dashDisplay');
        
        if (creditsDisplay) creditsDisplay.textContent = `$ ${this.player.credits}`;
        
        // Обновляем патроны
        if (ammoDisplay) {
            const ammoText = this.player.isReloading ? "ПЕРЕЗАРЯДКА..." : `${this.player.ammo}/${this.player.computedStats.maxAmmo}`;
            ammoDisplay.textContent = ammoText;
            ammoDisplay.classList.toggle('reloading', this.player.isReloading);
        }
        
        // Обновляем статус рывка
        if (dashDisplay) {
            const dashReady = this.player.dashTimer <= 0 || !this.player.isDashing;
            dashDisplay.textContent = dashReady ? "ГОТОВ" : "НЕТ";
            dashDisplay.classList.toggle('ready', dashReady);
        }
        
        // Обновляем иконки сердец (5 максимум)
        if (healthBar) {
            healthBar.innerHTML = '';
            const maxHealth = 5;
            for (let i = 0; i < maxHealth; i++) {
                const heart = document.createElement('div');
                heart.className = `heart-icon${i >= this.currentWill ? ' empty' : ''}`;
                healthBar.appendChild(heart);
            }
        }
    }

    private spawnEnemy(type: 'shooter' | 'chaser', x: number, y: number, role: 'guard' | 'patroller' | 'follower' | 'wanderer' = 'wanderer') {
        const eid = bitECS.addEntity(this.world);
        bitECS.addComponent(this.world, EnemyTag, eid);
        bitECS.addComponent(this.world, Position, eid);
        bitECS.addComponent(this.world, Health, eid);
        bitECS.addComponent(this.world, Velocity, eid);

        const db = ENEMIES_DB[type === 'shooter' ? 'sniper' : 'grunt'];
        Position.x[eid] = x;
        Position.y[eid] = y;
        Health.current[eid] = db.health;
        Health.max[eid] = db.health;

        const enemy: Enemy = {
            id: eid, x, y, radius: 12,
            type, role, speed: db.speed, health: db.health, maxHealth: db.health,
            fsm: interpret(enemyMachineDef).start(), lastKnownPosition: null, barkText: "", barkTimer: 0,
            angle: Math.random() * Math.PI * 2,
            alertTimer: 0, status: null, statusTimer: 0, patrolIndex: 0, followOffX: 0, followOffY: 0,
            memoryTimer: 0, shootTimer: 0, detectionRange: db.detectionRange, noiseLevel: 0, noisePosition: null,
            onShoot: (sx, sy, angle) => {
                this.bullets.push({
                    id: Math.random(), x: sx, y: sy, vx: Math.cos(angle)*4, vy: Math.sin(angle)*4, radius: 3,
                    isEnemy: true, damage: 1, type: 'enemy', lifetime: 180
                });
                lumen.addLight({
                    id: `enemy_muzzle_${eid}_${this.frameCounter}`,
                    x: Math.floor(sx/TILE_SIZE), y: Math.floor(sy/TILE_SIZE),
                    radius: 3, intensity: 0.5, type: LightType.TEMPORARY, active: true, ttl: 15
                });
            }
        };
        this.enemiesMap.set(eid, enemy);
        return enemy;
    }

    private spawnNPC(type: 'merchant' | 'shrine' | 'civilian', x: number, y: number) {
        const eid = bitECS.addEntity(this.world);
        let npc: any;
        if (type === 'merchant') npc = createMerchant(this.world, eid, x, y);
        else if (type === 'shrine') npc = createAltar(this.world, eid, x, y);
        else npc = createCivilian(this.world, eid, x, y);
        
        this.npcsMap.set(eid, npc);
        return npc;
    }
}

window.onload = () => new Game();
