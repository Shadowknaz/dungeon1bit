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
import { enemyMachineDef, EnemyActions } from './systems/ai';
import { generateGlobalMap, GlobalMap } from './systems/mapGenerator';
import { InventorySystem, ItemInstance } from './systems/inventory';
import { CombatSystem, Projectile } from './systems/combat';
import { DungeonSystem } from './systems/dungeon';

// Entities
import { createPlayer, PlayerState } from './entities/player';
import { createMerchant, createAltar, createCivilian } from './entities/npc';
import { ITEMS_DB } from './data/items';
import { ENEMIES_DB } from './data/enemies';
import { ELEMENTS_DB, ElementType } from './data/elements';
import { OBJECTS_DB } from './data/objects';

// UI
import { RenderSystem } from './ui/render';
import { InterfaceSystem } from './ui/interface';

// Types
import { Enemy, NPC, Barrel, Chest, Door, Point, PressurePlate } from './types';

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
    
    private player!: PlayerState;
    private gameState: 'GLOBAL_MAP' | 'PLAYING' | 'INVENTORY' | 'DIALOG' | 'GAME_OVER' | 'VICTORY' | 'EXIT_CONFIRM' | 'CHEST' = 'GLOBAL_MAP';
    private globalMap!: GlobalMap;
    private currentNodeId: number | null = null;
    private selectedNodeId: number | null = null;
    private hoveredNodeId: number | null = null;
    
    private enemies: Enemy[] = [];
    private npcs: NPC[] = [];
    private trapState: TrapState = { pits: [], spikes: [], blades: [], plates: [], mines: [], mirrors: [] };
    private barrels: Barrel[] = [];
    private floatingTexts: any[] = [];
    private bullets: Projectile[] = [];
    private visibleCells: Record<string, boolean> = {};
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

    private draggingItem: any = null;
    private draggingItemSource: 'inventory' | 'chest' | null = null;
    private dragOffset: Point = { x: 0, y: 0 };
    private selectedItemInstanceId: number | null = null;
    private uiAnimProgress = 0;
    private activeChest: Chest | null = null;

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
            if (e.code === 'KeyR') this.reload();
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

        // 1. Drop barrel
        if (this.player.carryingBarrel) {
            let px = Math.floor(this.player.x / TILE_SIZE);
            let py = Math.floor(this.player.y / TILE_SIZE);
            if (this.isPassable(px, py)) {
                let type = this.player.carryingBarrel as any;
                let newBrl: Barrel = { id: Math.random(), x: this.player.x, y: this.player.y, radius: 10, type };
                this.barrels.push(newBrl);
                this.player.carryingBarrel = null;
                sfx.click();
                
                const grid = this.fluids.getGrid();
                const cell = grid[px]?.[py];
                if (cell && (cell.type === 'oil' || cell.type === 'petroleum') && cell.fire === 0) {
                    this.fluids.ignite(px, py);
                    this.makeNoise(this.player.x, this.player.y, 400);
                } else if (cell && cell.fire > 0) {
                    setTimeout(() => {
                        const idx = this.barrels.indexOf(newBrl);
                        if (idx > -1) this.destroyBarrel(idx);
                    }, 500);
                }
            }
            return;
        }

        // 2. Pick up barrel
        const nearBarrelIdx = this.barrels.findIndex(b => Utils.dist(this.player, b) < 30);
        if (nearBarrelIdx !== -1) {
            this.player.carryingBarrel = this.barrels[nearBarrelIdx].type;
            this.barrels.splice(nearBarrelIdx, 1);
            sfx.click();
            return;
        }

        // 3. Near NPC
        const nearNPC = this.npcs.find(n => Utils.dist(this.player, n) < 40);
        if (nearNPC) {
            this.activeNPC = nearNPC;
            if (!this.activeNPC.currentNode) this.activeNPC.currentNode = this.activeNPC.dialogTree;
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
        if (this.activeChest.items.length === 0) {
            this.activeChest.opened = true;
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
            const gridX = (GAME_WIDTH - 8 * 30) / 2;
            const gridY = (GAME_HEIGHT - 6 * 30) / 2 + (this.gameState === 'CHEST' ? 60 : 0);
            
            // Check Inventory
            const foundInv = this.inventory.getItemAtPixel(mouse.x, mouse.y, gridX, gridY, 30, this.inventoryItems);
            if (foundInv) {
                this.draggingItem = foundInv.item;
                this.draggingItemSource = 'inventory';
                this.selectedItemInstanceId = foundInv.item.instanceId;
                this.dragOffset = { x: mouse.x - (gridX + foundInv.item.x * 30), y: mouse.y - (gridY + foundInv.item.y * 30) };
                sfx.click();
                return;
            }

            // Check Chest
            if (this.gameState === 'CHEST' && this.activeChest) {
                const cGridX = (GAME_WIDTH - 8 * 30) / 2;
                const cGridY = (GAME_HEIGHT - 6 * 30) / 2 - 140;
                const foundChest = this.inventory.getItemAtPixel(mouse.x, mouse.y, cGridX, cGridY, 30, this.activeChest.items);
                if (foundChest) {
                    this.draggingItem = foundChest.item;
                    this.draggingItemSource = 'chest';
                    this.selectedItemInstanceId = foundChest.item.instanceId;
                    this.dragOffset = { x: mouse.x - (cGridX + foundChest.item.x * 30), y: mouse.y - (cGridY + foundChest.item.y * 30) };
                    sfx.click();
                    return;
                }

                // Buttons
                if (mouse.y > cGridY + 6 * 30 + 10 && mouse.y < cGridY + 6 * 30 + 40) {
                    if (mouse.x > cGridX && mouse.x < cGridX + 120) { this.takeAll(); return; }
                    if (mouse.x > cGridX + 130 && mouse.x < cGridX + 240) { this.toggleInventory(); return; }
                }
            }

            // Inventory Buttons (Equip/Destroy)
            if (this.selectedItemInstanceId && this.draggingItemSource === 'inventory') {
                const item = this.inventoryItems.find(it => it.instanceId === this.selectedItemInstanceId);
                const db = item ? ITEMS_DB[item.id] : null;
                if (db) {
                    const bx = gridX + 8 * 30 + 20;
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
            const btnW = 100, btnH = 40;
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
            const gridX = (GAME_WIDTH - 8 * 30) / 2;
            const gridY = (GAME_HEIGHT - 6 * 30) / 2 + (this.gameState === 'CHEST' ? 60 : 0);
            
            const cGridX = (GAME_WIDTH - 8 * 30) / 2;
            const cGridY = (GAME_HEIGHT - 6 * 30) / 2 - 140;

            let placed = false;

            // Try place in Inventory
            const invGX = Math.round((mouse.x - this.dragOffset.x - gridX) / 30);
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
            // Try place in Chest
            else if (this.gameState === 'CHEST' && this.activeChest) {
                const chestGX = Math.round((mouse.x - this.dragOffset.x - cGridX) / 30);
                const chestGY = Math.round((mouse.y - this.dragOffset.y - cGridY) / 30);
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
        this.player.computedStats = { ...this.player.baseStats };
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
        ROT.RNG.setSeed(Date.now());
        this.world = bitECS.createWorld();
        this.player = createPlayer(bitECS.addEntity(this.world));
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
        this.bullets = []; this.enemies = []; this.npcs = []; this.trapState = { pits: [], spikes: [], blades: [], plates: [], mines: [], mirrors: [] };
        this.obstacles = []; this.floatingTexts = []; this.visibleCells = {}; this.chests = []; this.doors = [];
        this.barrels = []; this.fluids.reset();
        this.secretRoomOpen = false; this.secretDoors = []; this.secretDoorObstacles = []; this.secretRoomCells = [];
        this.roomActive = false; this.combatIntensity = 0; this.gameState = 'PLAYING'; 
        this.player.x = GAME_WIDTH / 2; this.player.y = 520; this.player.trail = []; this.player.carryingBarrel = null;
        this.roomClearTimer = 0;

        const node = this.globalMap.nodes[this.currentNodeId!];
        
        if (node.type === 'merchant' || node.type === 'shrine') {
            this.dungeon.reset();
            let cx = Math.floor(MAP_COLS/2), cy = 10; 
            for(let x = cx - 5; x <= cx + 5; x++) for(let y = cy - 5; y <= cy + 5; y++) this.dungeon.grid[x][y] = 0;
            for(let y = cy + 5; y < 22; y++) { this.dungeon.grid[cx][y] = 0; this.dungeon.grid[cx-1][y] = 0; this.dungeon.grid[cx+1][y] = 0; }
            for (let x = 16; x <= 23; x++) for (let y = 19; y < 22; y++) this.dungeon.grid[x][y] = 0;
            for (let x = 0; x < MAP_COLS; x++) for (let y = 22; y < MAP_ROWS; y++) this.dungeon.grid[x][y] = (x >= 17 && x <= 22) ? 0 : 1;
            
            this.startDoor = { x: 340, y: 440, w: 120, h: 20, open: false, type: 'start' };
            this.exitRoomCenter = { x: cx * TILE_SIZE, y: (cy - 5) * TILE_SIZE };
            
            if (node.type === 'merchant') this.npcs.push(createMerchant(cx*TILE_SIZE, cy*TILE_SIZE));
            else this.npcs.push(createAltar(cx*TILE_SIZE, cy*TILE_SIZE));
            this.npcs.push(createCivilian(cx*TILE_SIZE - 40, cy*TILE_SIZE + 40));
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

            // Secret Rooms
            const deadEndRooms = rooms.filter(r => {
                if (r === topRoom || r === closest.room) return false;
                let count = 0; r.getDoors(() => count++);
                return count === 1;
            });

            if (deadEndRooms.length > 0) {
                const secretRoom = deadEndRooms[Math.floor(Math.random() * deadEndRooms.length)];
                for (let x = secretRoom.getLeft(); x <= secretRoom.getRight(); x++) 
                    for (let y = secretRoom.getTop(); y <= secretRoom.getBottom(); y++) 
                        this.secretRoomCells.push({gx: x, gy: y});
                
                secretRoom.getDoors((x, y) => {
                    this.secretDoors.push({x, y});
                    this.dungeon.grid[x][y] = 1;
                    this.secretDoorObstacles.push({ x: x * TILE_SIZE, y: y * TILE_SIZE, w: TILE_SIZE, h: TILE_SIZE });
                    
                    // Spawn pressure plate nearby
                    this.trapState.plates.push({ id: `plate_${Math.random()}`, x: (x + 1) * TILE_SIZE, y: y * TILE_SIZE, pressed: false, timer: 0, discovered: false });
                });
            }

            // Obstacles
            for (let x = 0; x < MAP_COLS; x++) {
                for (let y = 0; y < MAP_ROWS; y++) {
                    if (this.dungeon.grid[x][y] === 1 && !this.secretDoors.some(d => d.x === x && d.y === y)) {
                        this.obstacles.push({ x: x * TILE_SIZE, y: y * TILE_SIZE, w: TILE_SIZE, h: TILE_SIZE });
                    }
                }
            }

            // Spawns
            const emptyCells: any[] = [];
            for (let x = 0; x < MAP_COLS; x++) {
                for (let y = 0; y < MAP_ROWS; y++) {
                    if (this.dungeon.grid[x][y] === 0) {
                        emptyCells.push({x: x * TILE_SIZE + TILE_SIZE/2, y: y * TILE_SIZE + TILE_SIZE/2, gx: x, gy: y});
                    }
                }
            }

            let validSpawns = emptyCells.filter(cell => cell.gy < 18 && Utils.dist(cell, {x: this.exitRoomCenter.x, y: this.exitRoomCenter.y}) > 60);
            const getSpawn = () => validSpawns.length > 0 ? validSpawns.splice(Math.floor(ROT.RNG.getUniform() * validSpawns.length), 1)[0] : null;

            // Content: Barrels
            const barrelProps = OBJECTS_DB['barrel'];
            for (let i = 0; i < barrelProps.maxPerRoom; i++) {
                if (ROT.RNG.getUniform() < barrelProps.spawnChance) {
                    const sp = getSpawn();
                    if (sp) {
                        const tooClose = this.barrels.some(b => Utils.distSq(b, sp) < 2500);
                        if (!tooClose) {
                            this.barrels.push({ 
                                id: Math.random(), x: sp.x, y: sp.y, radius: 10, 
                                type: ROT.RNG.getUniform() < 0.33 ? 'water' : (ROT.RNG.getUniform() < 0.66 ? 'oil' : 'petroleum') 
                            });
                        }
                    }
                }
            }

            // Chests
            const chestProps = OBJECTS_DB['chest'];
            if (ROT.RNG.getUniform() < chestProps.spawnChance) {
                const sp = getSpawn();
                if (sp) {
                    this.chests.push({ 
                        id: Math.random(), x: sp.x, y: sp.y, opened: false, 
                        items: [{ id: 'pistol', x: 0, y: 0, instanceId: Math.random() }] 
                    });
                }
            }

            // Enemies in groups
            let groupsCount = Math.min(4, Math.floor(ROT.RNG.getUniform() * 3) + 2 + Math.floor((this.roomLevel - 1) / 3)); 
            for (let g = 0; g < groupsCount; g++) {
                const center = getSpawn();
                if (!center) break;
                let groupSize = Math.floor(ROT.RNG.getUniform() * 3) + 2;
                let leaderRole: 'patroller' | 'guard' = ROT.RNG.getUniform() > 0.5 ? 'patroller' : 'guard';
                let leader: Enemy | undefined = undefined;
                let patrolPath: Point[] | undefined = undefined;
                if (leaderRole === 'patroller') {
                    const distant = validSpawns.length > 0 ? validSpawns[Math.floor(ROT.RNG.getUniform() * validSpawns.length)] : center;
                    patrolPath = [{x: center.x, y: center.y}, {x: distant.x, y: distant.y}];
                }
                for (let i = 0; i < groupSize; i++) {
                    const sp = i === 0 ? center : getSpawn();
                    if (!sp) break;
                    let db = ROT.RNG.getUniform() > 0.7 ? ENEMIES_DB['sniper'] : ENEMIES_DB['grunt'];
                    let role: 'patroller' | 'guard' | 'follower' = i === 0 ? leaderRole : 'follower';
                    let angle = (i / groupSize) * Math.PI * 2;
                    let en: Enemy = {
                        id: Math.random(), x: sp.x, y: sp.y, radius: 10, type: db.type, role, leader,
                        patrolPath: patrolPath, patrolIndex: 0,
                        followOffX: Math.cos(angle) * 40, followOffY: Math.sin(angle) * 40,
                        speed: db.speed, health: db.health, maxHealth: db.health,
                        fsm: interpret(enemyMachineDef).start(), memory: null, barkText: "", barkTimer: 0, alertTimer: 0, status: null, statusTimer: 0,
                        anim: new AnimatedSprite(db.type === 'shooter' ? ANIMATIONS.ENEMY_SHOOTER_IDLE : ANIMATIONS.ENEMY_CHASER_WALK)
                    };
                    if (i === 0) leader = en;
                    this.enemies.push(en);
                }
            }

            for (let i = 0; i < 3; i++) { let sp = getSpawn(); if (sp) this.trapState.spikes.push({ id: `spike_${i}`, x: sp.x, y: sp.y, state: 0, timer: 0 }); }
            
            const civProps = OBJECTS_DB['npc_civilian'];
            for (let i = 0; i < civProps.maxPerRoom; i++) {
                if (ROT.RNG.getUniform() < civProps.spawnChance) {
                    const sp = getSpawn();
                    if (sp) this.npcs.push(createCivilian(sp.x, sp.y));
                }
            }
        }

        this.roomSnapshot = {
            inventoryItems: this.inventoryItems.map(it => ({...it})),
            enemies: this.enemies.map(e => ({...e, fsm: interpret(enemyMachineDef).start()})),
            trapState: JSON.parse(JSON.stringify(this.trapState)),
            chests: JSON.parse(JSON.stringify(this.chests)),
            npcs: JSON.parse(JSON.stringify(this.npcs))
        };

        this.updateStaticLayer();
        this.updateUI();
    }

    private updateStaticLayer() {
        this.render.updateStaticLayer(
            this.dungeon.grid, 
            this.secretDoors, 
            this.secretRoomOpen, 
            this.secretRoomCells
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
        return true;
    }

    private update() {
        this.frameCounter++;
        this.particles.update();
        
        // Update animations
        const dt = 16.66; // Approx 60fps
        if (this.player.anim) this.player.anim.update(dt);
        this.enemies.forEach(e => {
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
            this.updatePlayer();
            this.updateEnemies();
            this.updateProjectiles();
            this.traps.update(this.player, this.enemies, this.trapState, this.ui.state.godMode, this.secretRoomCells);
            if (this.roomActive && this.frameCounter % 4 === 0) this.fluids.step(this.isPassable, (x, y) => this.makeNoise(x, y, 400));
            
            // Exit logic
            if (this.roomActive && this.enemies.length === 0 && this.doors.length === 0) {
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

            // Fog of War
            this.visibleCells = {};
            const px = Math.floor(this.player.x / TILE_SIZE);
            const py = Math.floor(this.player.y / TILE_SIZE);
            
            let fovRadius = 15;
            const currentTile = this.fluids.getGrid()[px]?.[py];
            if (currentTile && currentTile.steam > 50) fovRadius = 5;

            this.dungeon.computeFOV(px, py, fovRadius, this.player.angle, Math.PI / 2.5 / 2, this.isPassable, (x, y) => {
                this.visibleCells[`${x},${y}`] = true;
            });

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
        this.enemies.forEach(e => {
            const ex = Math.floor(e.x / TILE_SIZE);
            const ey = Math.floor(e.y / TILE_SIZE);
            const eTile = grid[ex]?.[ey];
            if (eTile && eTile.vol > 50) {
                e.status = eTile.type;
                e.statusTimer = 180;
            } else if (e.statusTimer > 0) {
                e.statusTimer--;
                if (e.statusTimer <= 0) e.status = null;
            }

            // Contact death
            if (!this.ui.state.godMode && !this.player.isDashing && Utils.distSq(e, this.player) < (e.radius + this.player.radius)**2) {
                this.restartRoom();
            }
        });
    }

    private updatePlayer() {
        if (this.player.isReloading) {
            this.player.reloadTimer--;
            if (this.player.reloadTimer <= 0) { this.player.isReloading = false; this.player.ammo = this.player.computedStats.maxAmmo; this.updateUI(); }
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
                if (Math.abs(dy) > Math.abs(dx)) {
                    this.player.anim = new AnimatedSprite(dy > 0 ? ANIMATIONS.PLAYER_WALK_DOWN : ANIMATIONS.PLAYER_WALK_UP);
                } else {
                    this.player.anim = new AnimatedSprite(ANIMATIONS.PLAYER_WALK_SIDE);
                }
            } else {
                // Idle animations (simplified to just use current dir idle frame if we wanted to be fancy)
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
                this.player.dashAngle = this.player.angle;
                sfx.dash();
                this.particles.spawn(this.player.x, this.player.y, 5, 1, 3);
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
                const projs = this.combat.spawnProjectiles(this.player, this.player.angle, { projectiles: this.player.computedStats.projectiles, spreadAngle: this.player.computedStats.spreadAngle }, 0, this.player.radius, false);
                this.bullets.push(...projs);
                sfx.playerShoot();
                this.makeNoise(this.player.x, this.player.y, 300);
                this.updateUI();
                if (this.player.ammo <= 0) this.reload();
            }
        }
    }

    private updateEnemies() {
        let inCombat = false;
        const grid = this.fluids.getGrid();

        this.enemies.forEach((e, idx) => {
            // Repulsion
            this.enemies.forEach(other => {
                if (e !== other) {
                    const dSq = Utils.distSq(e, other);
                    if (dSq > 0 && dSq < 900) {
                        const dist = Math.sqrt(dSq);
                        const push = (30 - dist) / 30;
                        e.x += ((e.x - other.x) / dist) * push * 1.5;
                        e.y += ((e.y - other.y) / dist) * push * 1.5;
                    }
                }
            });

            const ex = Math.floor(e.x/TILE_SIZE), ey = Math.floor(e.y/TILE_SIZE);
            const px = Math.floor(this.player.x/TILE_SIZE), py = Math.floor(this.player.y/TILE_SIZE);
            let canSeePlayer = false;
            
            // Stealth in steam
            let seeRadius = 12;
            const pTile = grid[px]?.[py];
            if (pTile && pTile.steam > 50) seeRadius = 4;

            if (Utils.distSq(e, this.player) < 250000) {
                const fov = new ROT.FOV.PreciseShadowcasting(this.isPassable);
                fov.compute(ex, ey, seeRadius, (x, y) => { if (x === px && y === py) canSeePlayer = true; });
            }

            if (canSeePlayer) {
                e.memory = { x: px, y: py };
                if (e.fsm.state.value === 'patrol' || e.fsm.state.value === 'investigate') { e.fsm.send('PLAYER_SPOTTED'); e.alertTimer = 60; }
                else if (e.fsm.state.value === 'alerting') { e.alertTimer--; if (e.alertTimer <= 0) e.fsm.send('ALERT_DONE'); }
            } else {
                if (!e.memory && (e.fsm.state.value === 'chase' || e.fsm.state.value === 'attack')) e.fsm.send('PLAYER_LOST');
            }

            // Memory sharing
            if (e.role === 'follower' && e.leader && e.leader.fsm) {
                const lState = e.leader.fsm.state.value;
                if (lState !== 'patrol' && e.fsm.state.value === 'patrol') {
                    e.memory = e.leader.memory ? {...e.leader.memory} : null;
                    if (lState === 'investigate') e.fsm.send('HEARD_NOISE');
                    else if (lState === 'alerting' || lState === 'chase' || lState === 'attack') { e.fsm.send('PLAYER_SPOTTED'); e.alertTimer = e.leader.alertTimer || 60; }
                }
            }

            const state = e.fsm.state.value;
            if (state === 'chase' || state === 'attack') inCombat = true;

            (EnemyActions as any)[state](e, canSeePlayer, this.obstacles, this.isPassable, this.player, this.enemies);

            // Barking
            if (e.barkTimer > 0) e.barkTimer--;
            if (e.barkTimer <= 0 && canSeePlayer && Math.random() < 0.005) { e.barkText = ENEMY_BARKS[Math.floor(Math.random()*ENEMY_BARKS.length)]; e.barkTimer = 90; }

            // Shooter AI
            if (e.type === 'shooter' && (state === 'chase' || state === 'attack') && canSeePlayer && this.frameCounter % 60 === 0) {
                if (e.status === 'petroleum') {
                    this.addFloatingText(e.x, e.y - 20, "ИСКРА!", "#f00");
                    sfx.explosion();
                    this.particles.spawn(e.x, e.y, 60, 2, 5);
                    this.killEnemy(idx);
                } else {
                    let spread = 0;
                    if (pTile && pTile.steam > 50) spread = 0.5;
                    const angle = Math.atan2(this.player.y - e.y, this.player.x - e.x) + (Math.random() - 0.5) * spread;
                    this.bullets.push({ x: e.x, y: e.y, vx: Math.cos(angle)*4, vy: Math.sin(angle)*4, radius: 3, isEnemy: true });
                    sfx.enemyShoot();
                }
            }
        });

        if (inCombat) this.combatIntensity = Math.min(1, this.combatIntensity + 0.05);
        else this.combatIntensity = Math.max(0, this.combatIntensity - 0.02);
    }

    private updateProjectiles() {
        for (let i = this.bullets.length - 1; i >= 0; i--) {
            let b = this.bullets[i];
            b.x += b.vx; b.y += b.vy;
            this.particles.spawn(b.x, b.y, 1, 1, 1); // Bullet trace
            if (b.x < 0 || b.x > GAME_WIDTH || b.y < 0 || b.y > GAME_HEIGHT) { this.bullets.splice(i, 1); continue; }
            
            let hit = false;
            for (let obs of this.obstacles) {
                if (b.x > obs.x && b.x < obs.x + obs.w && b.y > obs.y && b.y < obs.y + obs.h) {
                    hit = true; break;
                }
            }
            if (hit) { this.particles.spawn(b.x, b.y, 5, 2, 2); this.bullets.splice(i, 1); continue; }

            // Barrel hit
            for (let j = this.barrels.length - 1; j >= 0; j--) {
                const brl = this.barrels[j];
                if (Utils.distSq(brl, b) < (brl.radius + b.radius)**2) {
                    this.destroyBarrel(j);
                    this.bullets.splice(i, 1);
                    hit = true; break;
                }
            }
            if (hit) continue;

            if (!b.isEnemy) {
                for (let j = this.enemies.length - 1; j >= 0; j--) {
                    if (Utils.distSq(this.enemies[j], b) < (this.enemies[j].radius + b.radius)**2) {
                        this.killEnemy(j); this.bullets.splice(i, 1); break;
                    }
                }
            } else {
                if (!this.ui.state.godMode && !this.player.isDashing && Utils.distSq(this.player, b) < (this.player.radius + b.radius)**2) {
                    this.restartRoom(); break;
                }
            }
        }
    }

    private draw() {
        this.render.clear();
        if (this.gameState === 'GLOBAL_MAP') {
            this.drawGlobalMap();
        } else if (this.gameState === 'PLAYING' || this.gameState === 'INVENTORY' || this.gameState === 'EXIT_CONFIRM' || this.gameState === 'DIALOG') {
            this.render.drawStaticLayer();
            this.drawSecretVisuals();
            this.drawFluids();
            this.drawEntities();
            this.particles.draw(this.ctx, this.spriteCache);
            this.bullets.forEach(b => {
                this.ctx.fillStyle = '#fff';
                this.ctx.beginPath(); this.ctx.arc(b.x, b.y, b.radius, 0, Math.PI*2); this.ctx.fill();
            });
            this.render.drawDitherOverlay(this.visibleCells, this.dungeon.explored, this.ui.state.seeAllMap);
            
            this.drawCinemaLines();
            this.drawHUD();

            if (this.gameState === 'INVENTORY') this.drawInventory();
            if (this.gameState === 'EXIT_CONFIRM') this.drawExitConfirm();
            if (this.gameState === 'DIALOG') this.drawDialogPopup();
        }
        
        if (this.gameState === 'GAME_OVER') this.drawFullscreenMessage("ТВОЯ ВОЛЯ СЛОМЛЕНА", "Кликни, чтобы начать новый забег");
        if (this.gameState === 'VICTORY') this.drawFullscreenMessage("ВЫ ПОКОРИЛИ ПОДЗЕМЕЛЬЕ!", "Кликни, чтобы начать заново");
    }

    private drawSecretVisuals() {
        const ctx = this.ctx;
        ctx.font = '16px "IBM Plex Mono"';
        ctx.textAlign = 'center';
        
        // Secret Room Floor
        this.secretRoomCells.forEach(c => {
            if (this.visibleCells[`${c.gx},${c.gy}`] || this.ui.state.seeAllMap) {
                ctx.fillStyle = '#222';
                ctx.fillText('░', c.gx * TILE_SIZE + TILE_SIZE/2, c.gy * TILE_SIZE + TILE_SIZE/2 + 6);
            }
        });

        // Runes on walls
        if (this.secretDoors.length > 0 && Math.floor(this.frameCounter/30) % 2 === 0) {
            this.secretDoors.forEach(d => {
                if (this.visibleCells[`${d.x},${d.y}`] || this.ui.state.seeAllMap) {
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
                if (!this.visibleCells[`${x},${y}`] && !this.ui.state.seeAllMap) continue;

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
                let ch = node.type === 'merchant' ? '$' : (node.type === 'shrine' ? 'H' : (node.next.length === 0 ? 'B' : 'R'));
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
            if (!c.opened && (isMapFull || this.visibleCells[`${Math.floor(c.x/TILE_SIZE)},${Math.floor(c.y/TILE_SIZE)}`])) { 
                this.render.drawShadow(c.x, c.y + 5, 12);
                const sprite = this.spriteCache.get('obj_chest');
                if (sprite) ctx.drawImage(sprite, c.x - sprite.width/2, c.y - sprite.height/2);
                else { ctx.fillStyle = '#fff'; ctx.fillText("[+]", c.x, c.y); }
                if (Utils.dist(this.player, c) < 30) { ctx.font = '14px "IBM Plex Mono"'; ctx.fillText("[E] Сундук", c.x, c.y - 15); ctx.font = 'bold 20px "IBM Plex Mono"'; }
            } 
        });
        this.trapState.pits.forEach(p => { 
            const sprite = this.spriteCache.get('tile_pit');
            if (sprite) ctx.drawImage(sprite, p.x - TILE_SIZE/2, p.y - TILE_SIZE/2);
            else { ctx.fillStyle = '#111'; ctx.fillText('O', p.x, p.y); }
        });
        this.trapState.spikes.forEach(s => { 
            const sprite = this.spriteCache.get(s.state === 2 ? 'obj_spikes_1' : 'obj_spikes_0');
            if (sprite) ctx.drawImage(sprite, s.x - sprite.width/2, s.y - sprite.height/2);
            else { ctx.fillStyle = s.state === 2 ? '#fff' : '#666'; ctx.fillText('^', s.x, s.y); }
        });
        this.trapState.plates.forEach(p => { 
            const sprite = this.spriteCache.get(p.pressed ? 'obj_plate_1' : 'obj_plate_0');
            if (sprite) ctx.drawImage(sprite, p.x - sprite.width/2, p.y - sprite.height/2);
            else { ctx.fillStyle = p.pressed ? '#444' : '#fff'; ctx.fillText('=', p.x, p.y); }
        });

        this.npcs.forEach(n => {
            if (isMapFull || this.visibleCells[`${Math.floor(n.x/TILE_SIZE)},${Math.floor(n.y/TILE_SIZE)}`]) {
                this.render.drawShadow(n.x, n.y + 8, 10);
                const sprite = this.spriteCache.get(n.type === 'shrine' ? 'obj_altar' : 'entity_npc');
                if (sprite) {
                    ctx.drawImage(sprite, n.x - sprite.width/2, n.y - sprite.height/2);
                    if (n.type !== 'shrine') {
                        const hand = this.spriteCache.get('entity_npc_hand');
                        if (hand) {
                            const wave = Math.sin(this.frameCounter * 0.1) * 3;
                            ctx.drawImage(hand, n.x - 12, n.y + 2 + wave);
                            ctx.drawImage(hand, n.x + 8, n.y + 2 - wave);
                        }
                    }
                } else {
                    ctx.fillStyle = n.type === 'shrine' ? '#fff' : (n.type === 'merchant' ? '#aaa' : '#888'); 
                    ctx.fillText(n.type === 'shrine' ? "H" : (n.type === 'merchant' ? "V" : "P"), n.x, n.y);
                }
                if (Utils.dist(this.player, n) < 40) { ctx.font = '14px "IBM Plex Mono"'; ctx.fillText(`[E] ${n.type === 'shrine' ? "Алтарь" : "Говорить"}`, n.x, n.y - 15); ctx.font = 'bold 20px "IBM Plex Mono"'; }
            }
        });
        this.enemies.forEach(e => {
            if (isMapFull || this.visibleCells[`${Math.floor(e.x/TILE_SIZE)},${Math.floor(e.y/TILE_SIZE)}`] || this.ui.state.seeAllEnemies) {
                this.render.drawShadow(e.x, e.y + 8, 10);
                if (e.anim) {
                    if (e.type === 'shooter') {
                        const state = e.fsm.state.value;
                        if (state === 'attack' || state === 'chase') (e.anim as any).def = ANIMATIONS.ENEMY_SHOOTER_ATTACK;
                        else (e.anim as any).def = ANIMATIONS.ENEMY_SHOOTER_IDLE;
                    }
                    e.anim.draw(this.ctx, this.spriteCache, e.x, e.y);
                } else {
                    ctx.fillStyle = e.type === 'shooter' ? '#ddd' : '#fff';
                    ctx.fillText(e.type === 'shooter' ? 'S' : 'C', e.x, e.y);
                }

                const state = e.fsm.state.value;
                if (state === 'alerting') { 
                    const progress = 1 - (e.alertTimer / 60); ctx.fillStyle = '#fff'; ctx.fillRect(e.x - 10, e.y - 15, 20 * progress, 4); 
                    const alertSprite = this.spriteCache.get('entity_alert');
                    if (alertSprite) this.ctx.drawImage(alertSprite, e.x - alertSprite.width/2, e.y - 25);
                }
                if (e.barkTimer > 0) { ctx.font = '14px "IBM Plex Mono"'; ctx.fillText(e.barkText, e.x, e.y - 20); ctx.font = 'bold 20px "IBM Plex Mono"'; }
            }
        });
        this.barrels.forEach(b => { 
            if (isMapFull || this.visibleCells[`${Math.floor(b.x/TILE_SIZE)},${Math.floor(b.y/TILE_SIZE)}`]) {
                this.render.drawShadow(b.x, b.y + 8, 12);
                const sprite = this.spriteCache.get('obj_barrel');
                if (sprite) ctx.drawImage(sprite, b.x - sprite.width/2, b.y - sprite.height/2);
                else { ctx.fillStyle = '#fff'; let ch = b.type === 'water' ? '[В]' : (b.type === 'oil' ? '[М]' : '[*]'); ctx.fillText(ch, b.x, b.y); }
                if (Utils.dist(this.player, b) < 30 && !this.player.carryingBarrel) { ctx.font = '14px "IBM Plex Mono"'; ctx.fillText("[E] Поднять", b.x, b.y - 15); ctx.font = 'bold 20px "IBM Plex Mono"'; }
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
        if (this.player.anim) {
            const flipX = this.input.mouse.x < this.player.x;
            let scaleX = 1, scaleY = 1;
            if (this.player.isDashing) { scaleX = 1.4; scaleY = 0.6; }
            this.render.drawShadow(this.player.x, this.player.y + 8, 10);
            this.player.anim.draw(this.ctx, this.spriteCache, this.player.x, this.player.y, flipX, scaleX, scaleY);
        } else {
            this.render.drawShadow(this.player.x, this.player.y + 8, 10);
            ctx.fillText("@", this.player.x, this.player.y);
        }

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

        const gridX = (GAME_WIDTH - 8 * 30) / 2;
        const gridY = (GAME_HEIGHT - 6 * 30) / 2 + (this.gameState === 'CHEST' ? 60 : 0);
        
        // Draw Chest Window
        if (this.gameState === 'CHEST' && this.activeChest) {
            const cGridX = (GAME_WIDTH - 8 * 30) / 2;
            const cGridY = (GAME_HEIGHT - 6 * 30) / 2 - 140;
            
            ctx.fillStyle = '#181818'; ctx.strokeStyle = '#fff'; ctx.lineWidth = 2;
            ctx.fillRect(cGridX - 20, cGridY - 40, 8 * 30 + 40, 6 * 30 + 100);
            ctx.strokeRect(cGridX - 20, cGridY - 40, 8 * 30 + 40, 6 * 30 + 100);
            
            ctx.fillStyle = '#fff'; ctx.font = 'bold 16px "IBM Plex Mono"'; ctx.textAlign = 'left';
            ctx.fillText("СОДЕРЖИМОЕ СУНДУКА", cGridX, cGridY - 15);
            
            // Grid
            ctx.strokeStyle = '#444'; ctx.lineWidth = 1;
            for(let r=0; r<6; r++) for(let c=0; c<8; c++) ctx.strokeRect(cGridX + c*30, cGridY + r*30, 30, 30);
            
            this.activeChest.items.forEach(item => {
                if (this.draggingItem === item) return;
                const db = ITEMS_DB[item.id];
                ctx.fillStyle = this.selectedItemInstanceId === item.instanceId ? '#fff' : '#888';
                db.shape.forEach((row, ri) => row.forEach((cell, ci) => { if (cell) ctx.fillRect(cGridX + (item.x + ci)*30 + 2, cGridY + (item.y + ri)*30 + 2, 26, 26); }));
            });

            // Chest Buttons
            const mouse = this.input.mouse;
            const hTake = mouse.y > cGridY + 6 * 30 + 10 && mouse.y < cGridY + 6 * 30 + 40 && mouse.x > cGridX && mouse.x < cGridX + 120;
            const hRefuse = mouse.y > cGridY + 6 * 30 + 10 && mouse.y < cGridY + 6 * 30 + 40 && mouse.x > cGridX + 130 && mouse.x < cGridX + 240;
            
            ctx.fillStyle = hTake ? '#fff' : '#000'; ctx.fillRect(cGridX, cGridY + 6*30 + 10, 120, 30);
            ctx.strokeStyle = '#fff'; ctx.strokeRect(cGridX, cGridY + 6*30 + 10, 120, 30);
            ctx.fillStyle = hTake ? '#000' : '#fff'; ctx.textAlign = 'center'; ctx.fillText("ЗАБРАТЬ ВСЕ", cGridX + 60, cGridY + 6*30 + 30);
            
            ctx.fillStyle = hRefuse ? '#fff' : '#000'; ctx.fillRect(cGridX + 130, cGridY + 6*30 + 10, 110, 30);
            ctx.strokeStyle = '#fff'; ctx.strokeRect(cGridX + 130, cGridY + 6*30 + 10, 110, 30);
            ctx.fillStyle = hRefuse ? '#000' : '#fff'; ctx.fillText("ОТКАЗАТЬСЯ", cGridX + 130 + 55, cGridY + 6*30 + 30);
        }

        // Draw Player Inventory Window
        ctx.fillStyle = '#111'; ctx.strokeStyle = '#fff'; ctx.lineWidth = 2;
        ctx.fillRect(gridX - 20, gridY - 40, 8 * 30 + 140, 6 * 30 + 60);
        ctx.strokeRect(gridX - 20, gridY - 40, 8 * 30 + 140, 6 * 30 + 60);
        ctx.fillStyle = '#fff'; ctx.font = 'bold 16px "IBM Plex Mono"'; ctx.textAlign = 'left';
        ctx.fillText("РЮКЗАК ИГРОКА", gridX, gridY - 15);
        
        ctx.strokeStyle = '#444'; ctx.lineWidth = 1;
        for (let r = 0; r < 6; r++) for (let c = 0; c < 8; c++) ctx.strokeRect(gridX + c * 30, gridY + r * 30, 30, 30);
        
        let hoveredItem = null;
        this.inventoryItems.forEach(item => {
            if (this.draggingItem === item) return;
            const db = ITEMS_DB[item.id];
            const isSelected = this.selectedItemInstanceId === item.instanceId;
            ctx.fillStyle = isSelected ? '#fff' : '#888';
            db.shape.forEach((row, ri) => row.forEach((cell, ci) => { if (cell) ctx.fillRect(gridX + (item.x + ci)*30 + 2, gridY + (item.y + ri)*30 + 2, 26, 26); }));
            if (isSelected) hoveredItem = item;
            if (this.player.equippedWeaponInstanceId === item.instanceId) { ctx.strokeStyle = '#0f0'; ctx.lineWidth = 2; ctx.strokeRect(gridX + item.x*30, gridY + item.y*30, 30, 30); ctx.lineWidth = 1; }
        });
        
        // Detailed Item View
        if (hoveredItem && !this.draggingItem) {
            const db = ITEMS_DB[hoveredItem.id];
            ctx.fillStyle = '#fff'; ctx.textAlign = 'left'; ctx.font = 'bold 18px "IBM Plex Mono"'; ctx.fillText(db.name.toUpperCase(), gridX + 8*30 + 20, gridY + 110);
            
            const bx = gridX + 8 * 30 + 20;
            const by = gridY;
            if (db.type === 'weapon') {
                ctx.fillStyle = (this.player.equippedWeaponInstanceId === hoveredItem.instanceId) ? '#444' : '#000'; ctx.fillRect(bx, by, 100, 30);
                ctx.strokeStyle = '#fff'; ctx.strokeRect(bx, by, 100, 30);
                ctx.fillStyle = '#fff'; ctx.font = '14px "IBM Plex Mono"'; ctx.textAlign = 'center'; ctx.fillText(this.player.equippedWeaponInstanceId === hoveredItem.instanceId ? "СНЯТЬ" : "ЭКИПИР.", bx + 50, by + 20);
            }
            ctx.fillStyle = '#000'; ctx.fillRect(bx, by + 40, 100, 30);
            ctx.strokeStyle = '#fff'; ctx.strokeRect(bx, by + 40, 100, 30);
            ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.fillText("УНИЧТОЖИТЬ", bx + 50, by + 60);
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
            document.getElementById('niDesc')!.innerText = "Место испытаний и опасностей.";
            document.getElementById('niStatus')!.innerText = node.status.toUpperCase();
            nodeInfo.style.display = 'block';
        } else nodeInfo.style.display = 'none';
    }

    private loop = () => {
        this.update();
        this.draw();
        requestAnimationFrame(this.loop);
    }

    private addFloatingText(x: number, y: number, text: string, color = '#fff') {
        this.floatingTexts.push({ x, y, text, color, life: 60 });
    }

    private makeNoise(nx: number, ny: number, radius: number) {
        this.enemies.forEach(en => {
            if ((en.fsm.state.value === 'patrol' || en.fsm.state.value === 'investigate') && Utils.distSq({x: nx, y: ny}, en) < radius*radius) {
                en.memory = { x: Math.floor(nx/TILE_SIZE), y: Math.floor(ny/TILE_SIZE) };
                en.fsm.send('HEARD_NOISE');
                this.addFloatingText(en.x, en.y - 20, "?!", "#ff0");
            }
        });
    }

    private destroyBarrel(index: number) {
        const brl = this.barrels.splice(index, 1)[0];
        if (!brl) return;
        sfx.hit();
        
        if (brl.type === 'explosive') {
            sfx.explosion();
            this.particles.spawn(brl.x, brl.y, 60, 2, 6); // Large sparks on barrel explosion
            this.makeNoise(brl.x, brl.y, 500);
            if (!this.ui.state.godMode && !this.player.isDashing && Utils.dist(this.player, brl) < 60) this.restartRoom();
            for (let j = this.enemies.length - 1; j >= 0; j--) {
                if (Utils.dist(this.enemies[j], brl) < 60) this.killEnemy(j);
            }
            this.fluids.ignite(Math.floor(brl.x/TILE_SIZE), Math.floor(brl.y/TILE_SIZE), (x, y) => this.makeNoise(x, y, 400));
        } else {
            this.fluids.spill(brl.x, brl.y, brl.type, 1500, this.isPassable);
        }
    }

    private setSecretRoomOpen(open: boolean) { this.secretRoomOpen = open; this.updateStaticLayer(); }
    
    private restartRoom() {
        if (this.ui.state.godMode || this.isRestarting) return;
        this.isRestarting = true;
        this.currentWill -= 1;
        this.addFloatingText(this.player.x, this.player.y - 40, "ВОЛЯ ПОТЕРЯНА!", "#f00");
        if (this.currentWill <= 0) { this.gameState = 'GAME_OVER'; sfx.gameOver(); }
        else {
            this.inventoryItems = this.roomSnapshot.inventoryItems.map((it:any) => ({...it}));
            this.enemies = this.roomSnapshot.enemies.map((e:any) => ({...e, fsm: interpret(enemyMachineDef).start(), memory: null, alertTimer: 0, barkTimer: 0}));
            this.trapState = JSON.parse(JSON.stringify(this.roomSnapshot.trapState));
            this.chests = JSON.parse(JSON.stringify(this.roomSnapshot.chests));
            this.npcs = JSON.parse(JSON.stringify(this.roomSnapshot.npcs));
            this.bullets = [];
            this.player.x = GAME_WIDTH / 2; this.player.y = 520; this.player.carryingBarrel = null;
            this.gameState = 'PLAYING';
            this.roomActive = false;
            this.isRestarting = false;
            this.doors = [];
            if (this.startDoor) this.startDoor.open = false;
            this.updateStaticLayer();
        }
        this.updateEquippedStats();
        this.updateUI();
    }
    
    private killEnemy(index: number) { 
        const e = this.enemies[index];
        if (!e) return;
        this.particles.spawn(e.x, e.y, 15, 2, 3); // Sparks on kill
        this.enemies.splice(index, 1); 
        sfx.hit(); 
    }
    
    private updateUI() { 
        this.ui.update(this.roomLevel, `${this.player.ammo}/${this.player.computedStats.maxAmmo}`, this.player.credits);
        
        // Обновляем HTML HUD элементы
        const ammoDisplay = document.getElementById('ammoDisplay');
        const dashDisplay = document.getElementById('dashDisplay');
        const creditsDisplay = document.getElementById('creditsDisplay');
        const healthBar = document.getElementById('healthBar');
        
        if (ammoDisplay) ammoDisplay.textContent = `${this.player.ammo}/${this.player.computedStats.maxAmmo}`;
        if (dashDisplay) dashDisplay.textContent = this.player.dashReady ? 'ГОТОВ' : '...';
        if (creditsDisplay) creditsDisplay.textContent = `$ ${this.player.credits}`;
        
        // Обновляем полоску здоровья
        if (healthBar) {
            healthBar.innerHTML = '';
            const maxHealth = 3;
            for (let i = 0; i < maxHealth; i++) {
                const pip = document.createElement('div');
                pip.className = `health-pip${i >= this.currentWill ? ' empty' : ''}`;
                healthBar.appendChild(pip);
            }
        }
    }
}

window.onload = () => new Game();
