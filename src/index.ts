import * as bitECS from 'bitecs';
import mitt from 'mitt';
import { interpret } from 'xstate';
import * as ROT from 'rot-js';

// Core
import { 
    GAME_WIDTH, GAME_HEIGHT, TILE_SIZE, MAP_COLS, MAP_ROWS, 
    PLAYER_VISION_RADIUS, STEAM_VISION_RADIUS, 
    STEAM_DENSITY_THRESHOLD, VISIBILITY_ABSOLUTE_RADIUS, PLAYER_FOV_ANGLE,
    FLUID_STEP_INTERVAL, AI_ROLES, AI_STATUS, ENEMY_BARKS,
    COST_BUY_RANDOM, COST_HEAL, DASH_COOLDOWN, DASH_IFRAME_DURATION,
    DEATH_ANIM_DURATION, FIXED_TIMESTEP_MS, MAX_FRAME_TIME_MS
} from './core/constants';
import { AudioEngine, sfx } from './core/audio';
import { InputHandler } from './core/input';
import { InputManager, GameIntent } from './core/inputManager';
import { SpriteCache } from './core/spriteCache';
import { AnimatedSprite } from './core/animatedSprite';
import { ANIMATIONS, ITEMS_DB, ENEMIES_DB, GRENADES_DB } from './data/registry';
import { GameLoop } from './core/gameLoop';

// Systems
import { Utils, resolveCollision, resolveCircleCollision } from './systems/physics';
import { ParticleSystem } from './systems/particles';
import { FluidSystem } from './systems/fluids';
import { TrapSystem, TrapState, PlateType } from './systems/traps';
import { enemyMachineDef, EnemyActions, EnemyStateActions, checkVisionCone, AISystem, AIContext } from './systems/ai';
import { updateMemory, decrementMemoryTimer, hasValidMemory, updateNoise, decayNoise, clearMemory } from './systems/memory';
import { generateGlobalMap, GlobalMap } from './systems/mapGenerator';
import { InventorySystem, ItemInstance } from './systems/inventory';
import { CombatSystem } from './systems/combat';
import { DungeonSystem } from './systems/dungeon';
import { lumen, LightType } from './systems/lumen';
import { OverlaySystem } from './systems/overlay';
import { FogSystem } from './systems/fog';
import { InteractionSystem, InteractionContext } from './systems/interaction';
import { LevelManager, LevelContext } from './systems/level';
import { ProjectileSystem } from './systems/projectileSystem';
import { ExplosionSystem } from './systems/explosionSystem';
import { PlayerSystem, PlayerContext } from './systems/playerSystem';
import { WeaponSystem } from './systems/weaponSystem';
import { VfxSystem } from './systems/vfxSystem';
import { SpawnManager, RoomTheme, RoomData } from './systems/spawnManager';
import { PassabilityGrid } from './systems/passabilityGrid';
import { 
    LaserBeam, LightningChain, Position, Health, PlayerTag, EnemyTag, 
    NpcTag, Stats, AI, Combat, ShooterTag, ChaserTag, Velocity, 
    GrenadeTag, ProjectileTag, Timer, Explosive, EnemyProjectileTag, Bounces 
} from './domain/components';

const enemyQuery = bitECS.defineQuery([EnemyTag, Position, Health]);
const npcQuery = bitECS.defineQuery([NpcTag, Position]);
const projectileQuery = bitECS.defineQuery([ProjectileTag, Position]);
const grenadeQuery = bitECS.defineQuery([GrenadeTag, Position]);
const explosiveQuery = bitECS.defineQuery([Explosive, Position]);

// Entities
import { createPlayer, PlayerState } from './entities/player';
import { createMerchant, createAltar, createCivilian } from './entities/npc';

// UI
import { RenderSystem } from './ui/render';
import { InterfaceSystem } from './ui/interface';

// Types
import { Enemy, NPC, Barrel, Chest, Door, Point, Torch, Projectile } from './domain/types';

class Game {
    private canvas: HTMLCanvasElement;
    private ctx: CanvasRenderingContext2D;
    private world = bitECS.createWorld();
    private events = mitt();

    private input: InputManager;
    private level: LevelManager = new LevelManager();
    private interaction: InteractionSystem = new InteractionSystem();
    private particles = new ParticleSystem();
    private fluids = new FluidSystem();
    private spriteCache = new SpriteCache();
    private render: RenderSystem;
    private ui: InterfaceSystem;
    private dungeon = new DungeonSystem();
    private inventory = new InventorySystem();
    private combat: CombatSystem;
    private laserQuery = bitECS.defineQuery([LaserBeam]);
    private enemyQuery = bitECS.defineQuery([EnemyTag, Position, Health]);

    private traps: TrapSystem;
    private explosionSystem: ExplosionSystem;
    private playerSystem: PlayerSystem;
    private vfxSystem: VfxSystem;
    private weaponSystem: WeaponSystem;
    private aiSystem = new AISystem();
    private overlay = new OverlaySystem();
    private fog = new FogSystem();
    private passabilityGrid = new PassabilityGrid(MAP_COLS, MAP_ROWS);
    private projectileSystem: ProjectileSystem;

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
    private pickups: { id: number, x: number, y: number, type: 'he' | 'flash' }[] = [];
    private currentWill = 5;
    private roomLevel = 1;
    private roomActive = false;
    private combatIntensity = 0;
    private frameCounter = 0;
    private inventoryItems: ItemInstance[] = [];
    private obstacles: any[] = [];
    private activeDoors: any[] = [];
    private activeDoorObstacles: any[] = [];
    private startDoor: any = null;
    private exitRoomCenter: Point = { x: 0, y: 0 };
    private roomClearTimer = 0;
    private chests: Chest[] = [];
    private droppedItems: any[] = [];
    private activeNPC: NPC | null = null;
    private doors: Door[] = [];
    private roomSnapshot: any = null;
    private isRestarting = false;
    private deathAnimTimer = 0;
    private isDead = false;
    private activeChest: Chest | null = null;
    private gameLoop!: GameLoop;
    private lightingDirty = true;
    private rooms: any[] = [];
    private debugPanel: HTMLElement | null = null;
    private secretRoomCells: any[] = [];

    private static readonly PLAYER_LIGHT_ID = 'player_light';

    constructor() {
        this.canvas = document.getElementById('gameCanvas') as HTMLCanvasElement;
        this.canvas.width = GAME_WIDTH;
        this.canvas.height = GAME_HEIGHT;
        this.ctx = this.canvas.getContext('2d')!;

        this.input = new InputManager(new InputHandler(this.canvas));
        this.render = new RenderSystem(this.ctx, this.spriteCache);
        this.render.reinit();
        this.ui = new InterfaceSystem(document.getElementById('uiContainer')!, () => this.updateUI());
        
        this.gameLoop = new GameLoop(
            () => this.update(),
            (alpha) => this.draw(alpha)
        );

        this.combat = new CombatSystem(sfx, (x, y, text, col) => this.addFloatingText(x, y, text, col), (x, y, r) => this.makeNoise(x, y, r));
        this.weaponSystem = new WeaponSystem();
        this.playerSystem = new PlayerSystem();
        this.vfxSystem = new VfxSystem();
        this.createDebugPanel();
        this.traps = new TrapSystem(
            sfx, this.particles,
            (x, y, t, c) => this.addFloatingText(x, y, t, c),
            (gateId, open) => this.setPrisonGateOpen(gateId, open),
            () => this.restartRoom(),
            (idx) => this.killEnemy(idx)
        );

        this.projectileSystem = new ProjectileSystem(
            (eid, amount) => this.damageEnemy(eid, amount),
            () => this.restartRoom(),
            () => this.ui.state.godMode,
            () => this.player.iframeTimer > 0
        );

        this.explosionSystem = new ExplosionSystem(
            sfx, this.particles,
            (x, y, t, c) => this.addFloatingText(x, y, t, c),
            () => this.restartRoom(),
            (eid, amount) => this.damageEnemy(eid, amount),
            this.enemiesMap,
            (id, gx, gy, r, i, ttl) => lumen.addLight({ id, x: gx, y: gy, radius: r, intensity: i, type: LightType.TEMPORARY, active: true, ttl }),
            this.dungeon,
            () => this.render.updateStaticLayer(this.dungeon.grid, this.dungeon.variations),
            this.ui
        );

        window.addEventListener('keydown', (e: KeyboardEvent) => {
            if (e.code === 'Tab') { e.preventDefault(); }
        });

        const godBtn = document.getElementById('godModeBtn');
        if (godBtn) {
            godBtn.onclick = () => {
                this.ui.state.godMode = !this.ui.state.godMode;
                godBtn.innerText = `GOD MODE: ${this.ui.state.godMode ? 'ON' : 'OFF'}`;
                godBtn.style.color = this.ui.state.godMode ? '#5f5' : '#fff';
                godBtn.style.borderColor = this.ui.state.godMode ? '#5f5' : '#fff';
            };
        }

        this.fog.init();
        this.preload();
    }

    private killEnemy(eid: number) {
        const e = this.enemiesMap.get(eid);
        if (!e) return;
        this.damageEnemy(eid, 999);
    }

    private async preload() {
        console.log("Preload started");
        await this.spriteCache.generateAll();
        console.log("Preload finished");
        this.init();
    }

    private init() {
        console.log("Game initialized");
        this.gameLoop.start();
        ROT.RNG.setSeed(Date.now());
        this.render.reinit();
        lumen.init(MAP_COLS, MAP_ROWS);
        lumen.reset();
        this.world = bitECS.createWorld();
        this.player = createPlayer(this.world, bitECS.addEntity(this.world));
        this.globalMap = generateGlobalMap(ROT.RNG);
        this.gameState = 'GLOBAL_MAP';
        this.roomLevel = 1;
        this.currentWill = 5;
        this.inventoryItems = [];
        this.player.ammo = 6;
        this.player.anim = new AnimatedSprite(ANIMATIONS.PLAYER_IDLE_DOWN);
        this.updateComputedStats();
        this.updateUI();
    }

    private interact() {
        const ctx: InteractionContext = {
            world: this.world,
            player: this.player,
            barrels: this.barrels,
            chests: this.chests,
            torches: this.torches,
            npcsMap: this.npcsMap,
            obstacles: this.obstacles,
            dungeon: this.dungeon,
            fluids: this.fluids,
            trapState: this.trapState,
            gameState: this.gameState,
            addFloatingText: this.addFloatingText.bind(this),
            makeNoise: this.makeNoise.bind(this),
            destroyBarrel: this.destroyBarrel.bind(this),
            updateUI: this.updateUI.bind(this),
            showChest: (item, onTake, onClose) => this.ui.showChest(item, onTake, onClose),
            setGameState: (state) => this.gameState = state,
            setActiveNPC: (npc) => this.activeNPC = npc,
            setActiveChest: (chest) => this.activeChest = chest,
            inventoryItems: this.inventoryItems,
            droppedItems: this.droppedItems,
            onItemPicked: (itemId: string) => this.onItemPicked(itemId),
            isPassable: this.isPassable.bind(this)
        };
        this.interaction.interact(ctx);
    }

    private toggleInventory() {
        if (this.gameState === 'PLAYING') {
            this.gameState = 'INVENTORY';
            this.ui.showInventory(this.inventoryItems, () => this.toggleInventory());
            sfx.click();
        } else if (this.gameState === 'INVENTORY' || this.gameState === 'CHEST') {
            this.gameState = 'PLAYING';
            this.ui.hideInventory();
            this.ui.hideChest();
            this.activeChest = null;
            sfx.click();
        }
    }

    private handleDialogClick(mouse: any) {
        const node = this.activeNPC!.currentNode;
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
                this.buyRandomItem();
            } else if (opt.action === 'heal') {
                this.healPlayer();
            } else if (opt.next) {
                this.activeNPC!.currentNode = opt.next;
            }
            this.updateUI();
        }
    }

    private buyRandomItem() {
        const COST_BUY_RANDOM = 50; // Use constant if exists
        if (this.player.credits >= COST_BUY_RANDOM) {
            const ownedIds = this.inventoryItems.map(it => it.id);
            const itemIds = Object.keys(ITEMS_DB).filter(id => {
                const db = ITEMS_DB[id];
                return !db.unique || !ownedIds.includes(id);
            });

            if (itemIds.length === 0) {
                this.addFloatingText(this.player.x, this.player.y - 40, "ВСЕ ПРЕДМЕТЫ КУПЛЕНЫ!", '#ff0');
                return;
            }

            this.player.credits -= COST_BUY_RANDOM;
            const rndId = itemIds[Math.floor(Math.random() * itemIds.length)];
            this.addItemToInventory(rndId);
            this.activeNPC!.currentNode = { text: "Отличный выбор!", options: [{ text: "[Закрыть]", action: 'close' }] };
        } else {
            this.addFloatingText(this.player.x, this.player.y - 40, "НЕДОСТАТОЧНО КРЕДИТОВ!", '#f00');
        }
    }

    private onItemPicked(itemId: string) {
        this.updateComputedStats();
        this.updateUI();
    }

    private addItemToInventory(itemId: string) {
        const itemData = ITEMS_DB[itemId];
        if (itemData.type === 'weapon') {
            const currentWeaponIdx = this.inventoryItems.findIndex(it => ITEMS_DB[it.id].type === 'weapon');
            if (currentWeaponIdx !== -1) {
                const oldWeapon = this.inventoryItems.splice(currentWeaponIdx, 1)[0];
                this.droppedItems.push({ id: Math.random(), itemId: oldWeapon.id, x: this.player.x, y: this.player.y });
            }
        }
        this.inventoryItems.push({ id: itemId, instanceId: Math.random() });
        this.onItemPicked(itemId);
    }

    private healPlayer() {
        const COST_HEAL = 25; // Use constant if exists
        if (this.player.credits >= COST_HEAL) {
            this.player.willpower = Math.min(this.player.maxWillpower, this.player.willpower + 1);
            this.player.credits -= COST_HEAL;
            this.addFloatingText(this.player.x, this.player.y - 40, "ВОЛЯ ВОССТАНОВЛЕНА", '#0f0');
            this.activeNPC!.currentNode = { text: "Будь силен, путник.", options: [{ text: "[Закрыть]", action: 'close' }] };
        } else {
            this.addFloatingText(this.player.x, this.player.y - 40, "НЕДОСТАТОЧНО КРЕДИТОВ!", '#f00');
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
            this.updateUI();
        }
    }

    private update() {
        this.frameCounter++;
        this.fog.update(1, this.dungeon.grid, { x: this.player.camera.x, y: this.player.camera.y, zoom: this.player.camera.zoom });
        this.updateDebugPanel();

        if (this.deathAnimTimer > 0) {
            this.deathAnimTimer--;
            if (this.deathAnimTimer <= 0) this.finishRestartRoom();
            this.particles.update();
            return;
        }

        if (this.isDead) { this.particles.update(); if (this.input.isIntentActive(GameIntent.RELOAD)) this.triggerRestartAnimation(); return; }

        this.particles.update();
        this.updatePickups();

        this.vfxSystem.update(this.world, (points, life) => {
            this.ui.addLightningChain(points, life);
        });
        this.vfxSystem.updateLootGlow(this.droppedItems, this.particles, this.frameCounter);

        if (this.player.anim) this.player.anim.update(FIXED_TIMESTEP_MS);
        this.enemiesMap.values().forEach(e => { if (e.anim) e.anim.update(FIXED_TIMESTEP_MS); });

        if (this.gameState !== 'GLOBAL_MAP') this.player.camera.update(this.player.x, this.player.y);

        for (let i = this.floatingTexts.length - 1; i >= 0; i--) {
            this.floatingTexts[i].y -= 0.5; this.floatingTexts[i].life--;
            if (this.floatingTexts[i].life <= 0) this.floatingTexts.splice(i, 1);
        }

        const mouse = this.input.mouse;

        if (this.gameState === 'GLOBAL_MAP') {
            this.hoveredNodeId = null;
            for (let id in this.globalMap.nodes) {
                const node = this.globalMap.nodes[id];
                if (Utils.distSq(mouse, node) < 900) { this.hoveredNodeId = node.id; break; }
            }
        }

        let click;
        while (click = this.input.consumeClick()) {
            if (this.gameState === 'GLOBAL_MAP') {
                let clickedNodeId: number | null = null;
                for (let id in this.globalMap.nodes) {
                    const node = this.globalMap.nodes[id];
                    if (Utils.distSq(click, node) < 1600) { clickedNodeId = node.id; break; }
                }

                if (clickedNodeId !== null) {
                    const node = this.globalMap.nodes[clickedNodeId];
                    if (node.status === 'available') {
                        if (this.selectedNodeId === node.id) {
                            sfx.click(); this.currentNodeId = node.id; this.selectedNodeId = null; this.generateRoom();
                            break;
                        } else {
                            sfx.click(); this.selectedNodeId = node.id;
                        }
                    }
                } else {
                    this.selectedNodeId = null;
                }
            } else if (this.gameState === 'EXIT_CONFIRM') {
                const cx = GAME_WIDTH / 2, cy = GAME_HEIGHT / 2;
                if (click.x > cx - 110 && click.x < cx - 10 && click.y > cy + 20 && click.y < cy + 60) {
                    sfx.click(); this.exitRoom(); break;
                } else if (click.x > cx + 10 && click.x < cx + 110 && click.y > cy + 20 && click.y < cy + 60) {
                    sfx.click(); this.gameState = 'PLAYING'; this.player.y += 30; break;
                }
            } else if (this.gameState === 'DIALOG' && this.activeNPC) {
                this.handleDialogClick(click);
            } else if (this.gameState === 'GAME_OVER' || this.gameState === 'VICTORY') {
                this.init();
                break;
            }
        }

        if (this.input.isIntentActive(GameIntent.DEBUG_MAP)) {
            this.ui.state.seeAllMap = !this.ui.state.seeAllMap;
            sfx.click();
            this.refreshExploredFromLumen();
        }

        if (this.gameState === 'PLAYING') {
            this.updateStatuses();
            if (!this.isDead) {
                this.projectileSystem.update(this.world, this.passabilityGrid.getRaw(), MAP_COLS, this.obstacles);
                this.explosionSystem.update(this.world);
                try {
                    this.playerSystem.update(this.getPlayerContext());
                } catch (e) { console.error("Error in playerSystem.update:", e); }
                try {
                    this.updateEnemies();
                } catch (e) { console.error("CRASH in updateEnemies:", e); }

                try {
                    this.traps.update(this.player, Array.from(this.enemiesMap.values()), this.trapState, this.ui.state.godMode || this.player.iframeTimer > 0);
                } catch (e) { console.error("CRASH in traps.update:", e); }
                
                if (this.roomActive && this.frameCounter % FLUID_STEP_INTERVAL === 0) {
                    try {
                        this.fluids.step(this.passabilityGrid.getRaw(), MAP_COLS, (x, y) => this.makeNoise(x, y, 400));
                    } catch (e) { console.error("CRASH in fluids.step:", e); }
                }

                if (this.roomActive && this.enemiesMap.size === 0 && this.doors.length === 0) {
                    this.doors = [{ x: this.exitRoomCenter.x - 30, y: this.exitRoomCenter.y - 20, w: 60, h: 40, type: 'exit' }];
                    sfx.roomClear(); this.roomClearTimer = 180;
                }
                if (this.roomClearTimer > 0) this.roomClearTimer--;

                this.doors.forEach(door => {
                    if (this.player.x > door.x && this.player.x < door.x + door.w && this.player.y > door.y && this.player.y < door.y + door.h) this.gameState = 'EXIT_CONFIRM';
                });

                this.updateLighting(FIXED_TIMESTEP_MS);

                if (this.startDoor && !this.startDoor.open && Utils.distSq({ x: this.startDoor.x + this.startDoor.w / 2, y: this.startDoor.y + this.startDoor.h / 2 }, this.player) < 2500) {
                    this.startDoor.open = true; this.roomActive = true; sfx.doorOpen();
                    this.particles.spawn(this.startDoor.x + this.startDoor.w / 2, this.startDoor.y + this.startDoor.h / 2, 20);
                }

                if (this.input.isIntentActive(GameIntent.INTERACT)) this.interact();
                if (this.input.isIntentActive(GameIntent.RELOAD)) this.playerSystem.reload(this.getPlayerContext());
                if (this.input.isIntentActive(GameIntent.INVENTORY)) this.toggleInventory();
            }
        }
        this.input.update();
        this.ui.update(
            this.player.willpower, this.player.maxWillpower, 
            `${this.player.ammo}/${this.player.baseStats.maxAmmo}`, 
            this.player.credits, 
            this.player.isChargingRailgun ? this.player.railgunChargeTimer / 60 : 0,
            this.player.camera,
            this.gameLoop.getFPS()
        );
    }

    private getPlayerContext(): PlayerContext {
        return {
            world: this.world,
            player: this.player,
            input: this.input,
            frameCounter: this.frameCounter,
            gameState: this.gameState,
            roomActive: this.roomActive,
            obstacles: this.obstacles,
            startDoor: this.startDoor,
            inventoryItems: this.inventoryItems,
            particles: this.particles,
            combat: this.combat,
            weaponSystem: this.weaponSystem,
            lumen: lumen,
            sfx: sfx,
            uiState: this.ui.state,
            grid: this.dungeon.grid,
            passabilityGrid: this.passabilityGrid,
            isPassable: this.isPassable,
            addFloatingText: this.addFloatingText.bind(this),
            makeNoise: this.makeNoise.bind(this),
            restartRoom: this.restartRoom.bind(this),
            updateUI: this.updateUI.bind(this),
            damageEnemy: this.damageEnemy.bind(this),
            enemyQuery: enemyQuery,
            enemiesMap: this.enemiesMap,
            lasers: [],
            secretRoomOpen: this.ui.state.secretRoomOpen,
            secretDoorObstacles: this.activeDoorObstacles
        };
    }

    private updateLighting(dt: number) {
        this.lightingDirty = true;
        const px = Math.floor(this.player.x / TILE_SIZE);
        const py = Math.floor(this.player.y / TILE_SIZE);
        
        const currentTile = this.fluids.getGrid()[px]?.[py];
        const hasSteamAtPlayer = currentTile && currentTile.steam > STEAM_DENSITY_THRESHOLD;

        this.updateDynamicLights();
        const bounds = this.render.getViewportBoundaries(this.player.camera);
        this.fluids.updateLighting(lumen, LightType.TEMPORARY, bounds);

        lumen.update(dt);
        try {
            lumen.calculateLighting({ 
                frameCount: this.frameCounter, 
                playerPos: { x: px, y: py }, 
                playerVisionRadius: this.player.status === 'blind' ? 4 : (hasSteamAtPlayer ? STEAM_VISION_RADIUS : PLAYER_VISION_RADIUS),
                playerAngle: this.player.angle, 
                playerFovAngle: PLAYER_FOV_ANGLE,
                absoluteVisibilityRadius: VISIBILITY_ABSOLUTE_RADIUS, 
                passabilityRaw: this.passabilityGrid.getRaw(),
                mapCols: MAP_COLS,
                bounds
            });
        } catch (e) { console.error("Error in lumen.calculateLighting:", e); }
        this.refreshExploredFromLumen();
    }

    private isPassable = (x: number, y: number) => {
        if (this.ui.state.noclip) return true;
        return this.passabilityGrid.isPassable(x, y);
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
        const bounds = this.render.getViewportBoundaries(this.player.camera);
        const startX = Math.max(0, bounds.x1 - 2);
        const endX = Math.min(MAP_COLS, bounds.x2 + 2);
        const startY = Math.max(0, bounds.y1 - 2);
        const endY = Math.min(MAP_ROWS, bounds.y2 + 2);

        for (let x = startX; x < endX; x++) {
            for (let y = startY; y < endY; y++) {
                if (this.ui.state.seeAllMap || lumen.isVisible(x, y)) {
                    this.dungeon.explored[x][y] = true;
                }
            }
        }
    }

    private updateDynamicLights() {
        const px = Math.floor(this.player.x / TILE_SIZE);
        const py = Math.floor(this.player.y / TILE_SIZE);
        lumen.addLight({ id: Game.PLAYER_LIGHT_ID, x: px, y: py, radius: 7, intensity: 1, type: LightType.DYNAMIC, active: true });
        lumen.updateLightPosition(Game.PLAYER_LIGHT_ID, px, py);

        const bullets = projectileQuery(this.world);
        for (let i = 0; i < bullets.length; i++) {
            const eid = bullets[i];
            const bx = Math.floor(Position.x[eid] / TILE_SIZE), by = Math.floor(Position.y[eid] / TILE_SIZE);
            if (bx >= 0 && by >= 0 && bx < MAP_COLS && by < MAP_ROWS) {
                lumen.addLight({ id: `bullet_${eid}`, x: bx, y: by, radius: 2, intensity: 0.25, type: LightType.TEMPORARY, active: true, ttl: 25 });
            }
        }
    }

    private generateRoom(typeOverride?: 'digger' | 'uniform' | 'bsp') {
        this.enemiesMap.clear();
        this.npcsMap.clear();

        const ctx: LevelContext = {
            world: this.world,
            player: this.player,
            dungeon: this.dungeon,
            overlay: this.overlay,
            fog: this.fog,
            globalMap: this.globalMap,
            currentNodeId: this.currentNodeId,
            roomLevel: this.roomLevel,
            spawnEnemy: this.spawnEnemy.bind(this),
            spawnNPC: this.spawnNPC.bind(this),
            updateUI: this.updateUI.bind(this),
            updateStaticLayer: this.updateStaticLayer.bind(this),
            ownedItemIds: this.inventoryItems.map(it => it.id),
            ui: this.ui
        };
        const result = this.level.generateRoom(ctx);
        this.passabilityGrid.rebuildFromDungeon(this.dungeon.grid);
        lumen.triggerDirtyAO();
        Object.assign(this, result);
        this.activeDoors = result.secretDoors || [];
        this.activeDoorObstacles = result.secretDoorObstacles || [];
        const node = this.globalMap.nodes[this.currentNodeId!];
        this.roomLevel = node.layer + 1;

        const snapshotEnemies = Array.from(this.enemiesMap.values()).map(e => ({
            enemyId: e.enemyId, type: e.type, x: e.x, y: e.y, role: e.role, angle: e.angle, patrolPath: e.patrolPath
        }));
        const snapshotNPCs = Array.from(this.npcsMap.values()).map(n => ({
            type: n.type, x: n.x, y: n.y
        }));

        this.roomSnapshot = {
            ...result,
            enemies: snapshotEnemies,
            npcs: snapshotNPCs,
            inventoryItems: this.inventoryItems.map(it => ({ ...it })),
            grid: this.dungeon.grid.map(row => [...row])
        };
        this.updateStaticLayer();
        this.gameState = 'PLAYING';
    }

    private getAIContext(): AIContext {
        return {
            world: this.world,
            player: this.player,
            enemiesMap: this.enemiesMap,
            obstacles: this.obstacles,
            frameCounter: this.frameCounter,
            dungeon: this.dungeon,
            fluids: this.fluids,
            combat: this.combat,
            sfx: sfx,
            particles: this.particles,
            uiState: this.ui.state,
            secretDoors: this.activeDoors,
            secretRoomOpen: this.ui.state.secretRoomOpen,
            secretRoomCells: this.secretRoomCells,
            grid: this.dungeon.grid,
            passabilityGrid: this.passabilityGrid,
            isPassable: this.isPassable,
            addFloatingText: this.addFloatingText.bind(this),
            damageEnemy: this.damageEnemy.bind(this),
            restartRoom: this.restartRoom.bind(this)
        };
    }

    private updateStatuses() {
        const grid = this.fluids.getGrid();
        const px = Math.floor(this.player.x / TILE_SIZE), py = Math.floor(this.player.y / TILE_SIZE);
        const pTile = grid[px]?.[py];
        if (pTile && pTile.vol > 50) { this.player.status = pTile.type; this.player.statusTimer = 180; }
        else if (this.player.statusTimer > 0) { this.player.statusTimer--; if (this.player.statusTimer <= 0) this.player.status = null; }

        const enemies = enemyQuery(this.world);
        for (let i = 0; i < enemies.length; i++) {
            const eid = enemies[i], e = this.enemiesMap.get(eid)!;
            const ex = Math.floor(Position.x[eid] / TILE_SIZE), ey = Math.floor(Position.y[eid] / TILE_SIZE);
            const eTile = grid[ex]?.[ey];
            if (eTile && eTile.vol > 50) { e.status = eTile.type; e.statusTimer = 180; }
            else if (e.statusTimer > 0) { e.statusTimer--; if (e.statusTimer <= 0) e.status = null; }
            if (!this.ui.state.godMode && this.player.iframeTimer <= 0 && !this.player.isDashing && Utils.distSq(e, this.player) < (12 + this.player.radius) ** 2) this.restartRoom();
        }
    }

    private updatePickups() {
        for (let i = this.pickups.length - 1; i >= 0; i--) {
            const p = this.pickups[i];
            if (Utils.distSq(this.player, p) < 400) {
                if (p.type === 'he') this.player.grenadesHE++;
                else this.player.grenadesFlash++;
                this.addFloatingText(this.player.x, this.player.y - 40, `+1 ${p.type.toUpperCase()} GRENADE`, "#0f0");
                sfx.click();
                this.pickups.splice(i, 1);
                this.updateUI();
            }
        }
    }

    private updateEnemies() {
        console.log("updateEnemies() started");
        const ctx = this.getAIContext();
        const inCombat = this.aiSystem.update(ctx, enemyQuery);
        this.combatIntensity = inCombat ? Math.min(1, this.combatIntensity + 0.05) : Math.max(0, this.combatIntensity - 0.02);
    }


    private draw(alpha: number = 1.0) {
        this.render.clear();
        if (this.gameState === 'GLOBAL_MAP') this.drawGlobalMap();
        else if (['PLAYING', 'INVENTORY', 'EXIT_CONFIRM', 'DIALOG', 'CHEST'].includes(this.gameState)) {
            // Interpolate camera for smooth movement
            const interpX = this.player.camera.x; // We could add previous camera pos for real interp
            const interpY = this.player.camera.y;

            this.render.updatePlayerPosition(this.player.x, this.player.y); 
            this.render.applyCamera(this.player.camera);
            this.render.drawParallaxLayers(); 
            this.render.drawStaticLayer(this.player.camera); 
            this.overlay.draw(this.ctx, this.spriteCache);
            
            this.render.beginDynamicPass(this.player.camera);
            this.drawFluids(); 
            this.drawEntities(); 
            this.render.drawDroppedItems(this.droppedItems, this.frameCounter * 0.05);
            
            // Pickups
            this.pickups.forEach(p => {
                const t = this.frameCounter * 0.1;
                if (p.type === 'he') this.render.drawGrenade(p.x, p.y, t);
                else this.render.drawFlashbang(p.x, p.y, t);
            });

            // Thrown Grenades
            const grenades = grenadeQuery(this.world);
            for (let i = 0; i < grenades.length; i++) {
                const eid = grenades[i];
                const t = this.frameCounter * 0.1;
                const type = Explosive.type[eid];
                if (type === 0) this.render.drawGrenade(Position.x[eid], Position.y[eid], t);
                else this.render.drawFlashbang(Position.x[eid], Position.y[eid], t);

                if (Math.floor(this.frameCounter / 10) % 2 === 0) {
                    this.render.getDynamicBuffer().fill('#f00');
                    this.render.getDynamicBuffer().noStroke();
                    this.render.getDynamicBuffer().circle(Position.x[eid], Position.y[eid] - 10, 4);
                }
            }

            this.render.drawShadow(this.player.x, this.player.y + 8, 10);
            this.render.drawHuman(this.player.x, this.player.y, this.player.angle, this.player.isDashing, this.player.godMode || false, this.gameState, this.frameCounter * 0.05);
            this.render.endDynamicPass();

            this.particles.draw(this.ctx, this.spriteCache);
            const projs = projectileQuery(this.world);
            for (let i = 0; i < projs.length; i++) {
                const eid = projs[i];
                this.ctx.fillStyle = '#fff'; this.ctx.beginPath(); this.ctx.arc(Position.x[eid], Position.y[eid], 3, 0, Math.PI * 2); this.ctx.fill();
            }
            this.render.drawDitherOverlay(this.player.camera, lumen, this.player.x, this.player.y, this.player.angle, this.dungeon.explored, this.ui.state.seeAllMap, this.lightingDirty);
            this.lightingDirty = false;
            this.render.restoreCamera(); 
            this.drawCinemaLines();
            if (this.gameState === 'EXIT_CONFIRM') this.drawExitConfirm();
            this.drawHUD();
        }
        if (this.gameState === 'GAME_OVER') this.drawFullscreenMessage("ТВОЯ ВОЛЯ СЛОМЛЕНА", "Кликни, чтобы начать новый забег");
        if (this.gameState === 'VICTORY') this.drawFullscreenMessage("ВЫ ПОКОРИЛИ ПОДЗЕМЕЛЬЕ!", "Кликни, чтобы начать заново");
        if (this.deathAnimTimer > 0) { this.ctx.fillStyle = `rgba(0, 0, 0, ${1 - (this.deathAnimTimer / DEATH_ANIM_DURATION)})`; this.ctx.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT); }
        if (this.isDead) { this.ctx.font = 'bold 20px "IBM Plex Mono"'; this.ctx.textAlign = 'center'; this.ctx.fillStyle = '#fff'; this.ctx.fillText('[R] TO RESTART', GAME_WIDTH / 2, GAME_HEIGHT / 2 + 80); }

        // Draw FPS
        this.ctx.save();
        this.ctx.fillStyle = '#5f5';
        this.ctx.font = 'bold 12px "IBM Plex Mono"';
        this.ctx.textAlign = 'right';
        this.ctx.fillText(`FPS: ${this.gameLoop.getFPS()}`, GAME_WIDTH - 10, 20);
        this.ctx.restore();
    }


    private drawFluids() {
        this.render.drawFluids(this.fluids.getGrid(), (x, y) => this.isCellVisible(x, y));
    }

    private drawCinemaLines() {
        if (this.combatIntensity <= 0) return;
        const ctx = this.ctx; ctx.fillStyle = '#fff'; ctx.font = '12px "IBM Plex Mono"';
        const count = Math.floor(20 * this.combatIntensity);
        for (let i = 0; i < count; i++) {
            const side = Math.floor(Math.random() * 4);
            let x = Math.random() * GAME_WIDTH, y = Math.random() * GAME_HEIGHT;
            if (side === 0) y = 10 + Math.random() * 20; else if (side === 1) y = GAME_HEIGHT - 30 + Math.random() * 20; else if (side === 2) x = 10 + Math.random() * 20; else x = GAME_WIDTH - 30 + Math.random() * 20;
            ctx.fillText(Math.random() > 0.5 ? '╱' : '╲', x, y);
        }
    }

    private drawFullscreenMessage(title: string, sub: string) {
        this.ctx.fillStyle = '#181818'; this.ctx.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);
        this.ctx.fillStyle = '#fff'; this.ctx.textAlign = 'center';
        this.ctx.font = 'bold 48px "IBM Plex Mono"'; this.ctx.fillText(title, GAME_WIDTH / 2, GAME_HEIGHT / 2 - 20);
        this.ctx.font = '20px "IBM Plex Mono"'; this.ctx.fillText(sub, GAME_WIDTH / 2, GAME_HEIGHT / 2 + 30);
    }

    private drawGlobalMap() {
        const ctx = this.ctx; ctx.strokeStyle = '#444'; ctx.lineWidth = 2;
        for (let id in this.globalMap.nodes) {
            let node = this.globalMap.nodes[id];
            node.next.forEach(nextId => {
                let target = this.globalMap.nodes[nextId];
                ctx.strokeStyle = (node.status === 'completed' && target.status === 'available') ? '#fff' : (node.status === 'completed' && target.status === 'completed' ? '#666' : '#333');
                ctx.beginPath(); ctx.moveTo(node.x, node.y); ctx.lineTo(target.x, target.y); ctx.stroke();
            });
        }
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        for (let id in this.globalMap.nodes) {
            let node = this.globalMap.nodes[id];
            ctx.beginPath(); ctx.arc(node.x, node.y, 20, 0, Math.PI * 2);
            if (node.status === 'available') { ctx.fillStyle = '#fff'; ctx.fill(); ctx.strokeStyle = '#fff'; }
            else if (node.status === 'completed') { ctx.fillStyle = '#181818'; ctx.fill(); ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; }
            else { ctx.fillStyle = '#000'; ctx.fill(); ctx.strokeStyle = '#333'; }
            ctx.stroke();
            if (node.id === this.selectedNodeId) { ctx.beginPath(); ctx.arc(node.x, node.y, 26, 0, Math.PI * 2); ctx.stroke(); }
            else if (node.id === this.hoveredNodeId && node.status === 'available') { ctx.beginPath(); ctx.arc(node.x, node.y, 26, 0, Math.PI * 2); ctx.setLineDash([5, 5]); ctx.stroke(); ctx.setLineDash([]); }
            if (node.status === 'available' || node.status === 'completed') {
                ctx.fillStyle = node.status === 'available' ? '#000' : '#888'; ctx.font = 'bold 20px "IBM Plex Mono", monospace';
                let ch = node.type === 'merchant' ? '$' : (node.type === 'shrine' ? 'H' : (node.type === 'boss' ? '!' : (node.next.length === 0 ? 'E' : 'R')));
                ctx.fillText(ch, node.x, node.y + 2);
            }
        }
        ctx.fillStyle = '#fff'; ctx.font = 'bold 32px "IBM Plex Mono", monospace'; ctx.fillText("КАРТА ПОДЗЕМЕЛЬЯ", GAME_WIDTH / 2, 50);
        ctx.font = '14px "IBM Plex Mono"'; ctx.fillText(`SELECTED: ${this.selectedNodeId} | HOVERED: ${this.hoveredNodeId}`, GAME_WIDTH / 2, GAME_HEIGHT - 30);

        // Debug cursor for player
        ctx.strokeStyle = '#fff'; ctx.lineWidth = 1;
        const mx = this.input.mouse.x, my = this.input.mouse.y;
        ctx.beginPath(); ctx.moveTo(mx - 10, my); ctx.lineTo(mx + 10, my); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(mx, my - 10); ctx.lineTo(mx, my + 10); ctx.stroke();
    }

    private drawHUD() {
        const ctx = this.ctx;
        ctx.fillStyle = '#fff';
        ctx.font = 'bold 12px "IBM Plex Mono"';
        ctx.textAlign = 'right';
        ctx.fillText(`AMMO: ${this.player.ammo}/${this.player.computedStats.maxAmmo}`, GAME_WIDTH - 20, GAME_HEIGHT - 20);
        ctx.fillText(`ENEMIES: ${enemyQuery(this.world).length}`, GAME_WIDTH - 20, GAME_HEIGHT - 40);

        ctx.textAlign = 'left';
        ctx.font = 'bold 11px "IBM Plex Mono"';
        ctx.fillText(`HE GRENADES: ${this.player.grenadesHE} [G]`, 20, GAME_HEIGHT - 40);
        ctx.fillText(`FLASH GRENADES: ${this.player.grenadesFlash} [F]`, 20, GAME_HEIGHT - 20);
    }

    private drawEntities() {
        const ctx = this.ctx, isMapFull = this.ui.state.seeAllMap;
        ctx.font = 'bold 20px "IBM Plex Mono", monospace'; ctx.textAlign = 'center';
        if (this.startDoor) {
            const doorSprite = this.spriteCache.get(this.startDoor.open ? 'tile_wall_0000' : 'tile_wall_1111');
            if (doorSprite) for (let dx = 0; dx < this.startDoor.w; dx += TILE_SIZE) ctx.drawImage(doorSprite, this.startDoor.x + dx, this.startDoor.y, TILE_SIZE, TILE_SIZE);
            else { ctx.fillStyle = this.startDoor.open ? '#444' : '#fff'; ctx.fillRect(this.startDoor.x, this.startDoor.y, this.startDoor.w, this.startDoor.h); }
            if (!this.startDoor.open) { ctx.fillStyle = '#fff'; ctx.font = '14px "IBM Plex Mono"'; ctx.fillText("[ ВХОД ]", this.startDoor.x + this.startDoor.w / 2, this.startDoor.y + 12); ctx.font = 'bold 20px "IBM Plex Mono"'; }
        }
        this.chests.forEach(c => {
            if (isMapFull || this.isCellVisible(Math.floor(c.x / TILE_SIZE), Math.floor(c.y / TILE_SIZE))) {
                this.render.drawShadow(c.x, c.y + 5, 12); this.render.drawChest(c.x, c.y, this.frameCounter * 0.05);
                if (Utils.dist(this.player, c) < 30) { ctx.strokeStyle = '#ff0'; ctx.lineWidth = 2; ctx.strokeRect(c.x - 12, c.y - 14, 24, 28); ctx.font = '14px "IBM Plex Mono"'; ctx.fillText("[E] Сундук", c.x, c.y - 20); ctx.font = 'bold 20px "IBM Plex Mono"'; }
            }
        });
        this.trapState.pits.forEach(p => { if (isMapFull || this.isCellVisible(Math.floor(p.x / TILE_SIZE), Math.floor(p.y / TILE_SIZE))) this.render.drawPit(p.x, p.y, this.frameCounter * 0.05); });
        this.trapState.spikes.forEach(s => { if (isMapFull || this.isCellVisible(Math.floor(s.x / TILE_SIZE), Math.floor(s.y / TILE_SIZE))) this.render.drawSpikeTrap(s.x, s.y, this.frameCounter * 0.05, s.state === 2); });
        this.trapState.plates.forEach(p => { if (isMapFull || this.isCellVisible(Math.floor(p.x / TILE_SIZE), Math.floor(p.y / TILE_SIZE))) this.render.drawPressurePlate(p.x, p.y, p.pressed); });

        const npcs = npcQuery(this.world);
        for (let i = 0; i < npcs.length; i++) {
            const eid = npcs[i], n = this.npcsMap.get(eid)!, nx = Position.x[eid], ny = Position.y[eid];
            if (isMapFull || this.isCellVisible(Math.floor(nx / TILE_SIZE), Math.floor(ny / TILE_SIZE))) {
                this.render.drawShadow(nx, ny + 8, 10);
                if (n.type === 'shrine') { const sprite = this.spriteCache.get('obj_altar'); if (sprite) ctx.drawImage(sprite, nx - sprite.width / 2, ny - sprite.height / 2); }
                else this.render.drawNPC(nx, ny, this.frameCounter * 0.05);
                if (Utils.dist(this.player, { x: nx, y: ny }) < 40) { ctx.strokeStyle = '#ff0'; ctx.lineWidth = 2; ctx.strokeRect(nx - 12, ny - 18, 24, 36); ctx.font = '14px "IBM Plex Mono"'; ctx.fillText(`[E] ${n.type === 'shrine' ? "Алтарь" : "Говорить"}`, nx, ny - 25); ctx.font = 'bold 20px "IBM Plex Mono"'; }
            }
        }
        this.torches.forEach(t => {
            if (isMapFull || this.isCellVisible(t.gx, t.gy)) {
                const isNear = Utils.dist(this.player, { x: t.x, y: t.y }) < 40; if (isNear) { ctx.strokeStyle = '#ff0'; ctx.lineWidth = 2; ctx.strokeRect(t.x - 10, t.y - 14, 20, 28); }
                this.render.drawShadow(t.x, t.y + 8, 10); this.render.drawTorch(t.x, t.y, this.frameCounter * 0.05);
                if (isNear) { ctx.font = '14px "IBM Plex Mono"'; ctx.fillStyle = '#ff0'; ctx.fillText(t.lit !== false ? "[E] Потушить" : "[E] Зажечь", t.x, t.y - 20); ctx.font = 'bold 20px "IBM Plex Mono"'; }
            }
        });

        const enemies = enemyQuery(this.world);
        for (let i = 0; i < enemies.length; i++) {
            const eid = enemies[i], e = this.enemiesMap.get(eid)!, ex = Position.x[eid], ey = Position.y[eid];
            if (isMapFull || this.isCellVisible(Math.floor(ex / TILE_SIZE), Math.floor(ey / TILE_SIZE)) || this.ui.state.seeAllEnemies) {
                this.render.drawShadow(ex, ey + 8, 10);

                // Draw Vision Cone (Debug)
                if (this.ui.state.showAiVision) {
                    const fov = Math.PI / 1.8; // Realistic ~100 degree FOV
                    const numRays = 13;
                    const enemyAngle = e.angle || 0;
                    const startAngle = enemyAngle - fov / 2;
                    const step = fov / (numRays - 1);
                    const maxDist = e.detectionRange * 1.4; // Standard detection multiplier
                    ctx.fillStyle = 'rgba(255, 255, 255, 0.05)';
                    ctx.beginPath();
                    ctx.moveTo(ex, ey);
                    ctx.arc(ex, ey, maxDist, startAngle, startAngle + fov);
                    ctx.lineTo(ex, ey);
                    ctx.fill();
                    ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)'; ctx.stroke();
                }

                // AI Debug States
                if (this.ui.state.showAiStates) {
                    ctx.fillStyle = '#f0f'; ctx.font = '10px "IBM Plex Mono"'; ctx.textAlign = 'center';
                    const stateName = typeof e.fsm.state.value === 'string' ? e.fsm.state.value : JSON.stringify(e.fsm.state.value);
                    ctx.fillText(stateName.toUpperCase(), ex, ey - 35);
                    ctx.font = 'bold 20px "IBM Plex Mono"';
                }

                // Noise bar
                if (e.noiseLevel > 0) {
                    ctx.fillStyle = '#ff0'; ctx.fillRect(ex - 10, ey - 30, (e.noiseLevel / 100) * 20, 3);
                }

                if (e.enemyId === 'golem') {
                    const moveIntensity = (e.fsm && e.fsm.state.value !== 'patrol') ? 1.0 : 0.0;
                    this.render.drawGolem(ex, ey, this.frameCounter * 0.05, e.angle || 0, moveIntensity);
                } else if (e.type === 'chaser') this.render.drawSlime(ex, ey, this.frameCounter * 0.05, e.fsm && e.fsm.state.value !== 'patrol');
                else if (e.type === 'shooter') this.render.drawSpikySlime(ex, ey, this.frameCounter * 0.05);
                else if (e.anim) this.render.drawAnimatedSpriteWithShade(e.anim, this.spriteCache, ex, ey, 0.85);

                // Debug state text
                const stateStr = typeof e.fsm.state.value === 'string' ? e.fsm.state.value : JSON.stringify(e.fsm.state.value);
                ctx.fillStyle = '#f00'; ctx.font = '10px "IBM Plex Mono"'; ctx.textAlign = 'center';
                ctx.fillText(stateStr, ex, ey - 25);

                // Debug vision rays if alerting
                if (e.fsm.state.value === 'alerting' || e.fsm.state.value === 'chase') {
                    ctx.strokeStyle = 'rgba(255, 0, 0, 0.3)';
                    ctx.beginPath(); ctx.moveTo(ex, ey); ctx.lineTo(this.player.x, this.player.y); ctx.stroke();
                }

                if (e.fsm.state.value === 'alerting') { const progress = 1 - (e.alertTimer / 60); ctx.fillStyle = '#fff'; ctx.fillRect(ex - 10, ey - 15, 20 * progress, 4); }
                if (e.barkTimer > 0) { ctx.font = '14px "IBM Plex Mono"'; ctx.fillText(e.barkText, ex, ey - 20); ctx.font = 'bold 20px "IBM Plex Mono"'; }
            }
        }
        this.barrels.forEach(b => {
            if (isMapFull || this.isCellVisible(Math.floor(b.x / TILE_SIZE), Math.floor(b.y / TILE_SIZE))) {
                this.render.drawShadow(b.x, b.y + 8, 12); this.render.drawBarrel(b.x, b.y);
                if (Utils.dist(this.player, b) < 30 && !this.player.carryingBarrel) { ctx.strokeStyle = '#ff0'; ctx.lineWidth = 2; ctx.strokeRect(b.x - 12, b.y - 16, 24, 32); ctx.font = '14px "IBM Plex Mono"'; ctx.fillText("[E] Поднять", b.x, b.y - 20); ctx.font = 'bold 20px "IBM Plex Mono"'; }
            }
        });
        this.doors.forEach(d => {
            const sprite = this.spriteCache.get('tile_floor_secret'); if (sprite) for (let dx = 0; dx < d.w; dx += TILE_SIZE) for (let dy = 0; dy < d.h; dy += TILE_SIZE) ctx.drawImage(sprite, d.x + dx, d.y + dy);
            ctx.fillStyle = (this.roomClearTimer > 0 && Math.floor(this.frameCounter / 10) % 2 === 0) ? '#000' : '#fff'; ctx.fillText("[ВЫХОД]", d.x + d.w / 2, d.y + d.h / 2);
        });

        const laserEntities = this.laserQuery(this.world);
        for (let i = 0; i < laserEntities.length; i++) {
            const eid = laserEntities[i];
            const x1 = LaserBeam.x1[eid], y1 = LaserBeam.y1[eid];
            const x2 = LaserBeam.x2[eid], y2 = LaserBeam.y2[eid];
            const alpha = LaserBeam.life[eid] / LaserBeam.maxLife[eid];
            const width = LaserBeam.width[eid] * alpha;
            ctx.save();
            const grad = ctx.createLinearGradient(x1, y1, x2, y2);
            grad.addColorStop(0, '#fff');
            grad.addColorStop(0.5, '#888');
            grad.addColorStop(1, '#fff');
            ctx.strokeStyle = grad;
            ctx.lineWidth = width;
            ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
            ctx.restore();
        }

        // Reload / Charge Indicator
        if (this.player.isReloading || this.player.isChargingRailgun) {
            const progress = this.player.isReloading ?
                (this.player.computedStats.reloadDuration - this.player.reloadTimer) / this.player.computedStats.reloadDuration :
                this.player.railgunChargeTimer / 60;
            const barW = 20, barH = 3;
            ctx.fillStyle = 'rgba(0,0,0,0.5)';
            ctx.fillRect(this.player.x - barW / 2, this.player.y - 25, barW, barH);
            ctx.fillStyle = this.player.isChargingRailgun ? '#f0f' : '#fff';
            ctx.fillRect(this.player.x - barW / 2, this.player.y - 25, barW * progress, barH);
        }
        this.render.drawDynamicLayer();
        if (this.player.carryingBarrel) { ctx.font = '14px "IBM Plex Mono"'; ctx.fillText(this.player.carryingBarrel === 'water' ? '[В]' : (this.player.carryingBarrel === 'oil' ? '[М]' : '[*]'), this.player.x, this.player.y - 20); ctx.font = 'bold 20px "IBM Plex Mono"'; }
        this.floatingTexts.forEach(ft => { ctx.globalAlpha = ft.life / 60; ctx.fillStyle = ft.color; ctx.fillText(ft.text, ft.x, ft.y); ctx.globalAlpha = 1; });
        if (this.roomClearTimer > 0) { ctx.fillStyle = '#fff'; ctx.font = 'bold 24px "IBM Plex Mono"'; ctx.fillText("КОМНАТА ЗАЧИЩЕНА. ИДИТЕ К ВЫХОДУ.", GAME_WIDTH / 2, GAME_HEIGHT / 2 - 40); ctx.font = 'bold 20px "IBM Plex Mono"'; }
    }

    private addFloatingText(x: number, y: number, text: string, color = '#fff') { this.floatingTexts.push({ x, y, text, color, life: 60 }); }

    private makeNoise(nx: number, ny: number, radius: number) {
        this.aiSystem.makeNoise(nx, ny, radius, this.getAIContext(), enemyQuery);
    }

    private destroyBarrel(index: number) {
        const brl = this.barrels.splice(index, 1)[0]; if (!brl) return;
        const gx = Math.floor(brl.x / TILE_SIZE), gy = Math.floor(brl.y / TILE_SIZE);
        this.dungeon.grid[gx][gy] = 0;
        this.passabilityGrid.setPassable(gx, gy, true);
        this.obstacles = this.obstacles.filter(o => !(o.type === 'barrel' && o.id === brl.id)); sfx.hit();
        if (brl.type === 'explosive') {
            lumen.addLight({ id: `barrel_blast_${this.frameCounter}`, x: Math.floor(brl.x / TILE_SIZE), y: Math.floor(brl.y / TILE_SIZE), radius: 6, intensity: 1, type: LightType.TEMPORARY, active: true, ttl: 180 });
            sfx.explosion(); this.particles.spawn(brl.x, brl.y, 60, 2, 6); this.makeNoise(brl.x, brl.y, 500);
            if (!this.ui.state.godMode && this.player.iframeTimer <= 0 && !this.player.isDashing && Utils.dist(this.player, brl) < 60) this.restartRoom();
            enemyQuery(this.world).forEach(eid => { if (Utils.dist(this.enemiesMap.get(eid)!, brl) < 60) this.damageEnemy(eid, 3); });
            this.fluids.ignite(Math.floor(brl.x / TILE_SIZE), Math.floor(brl.y / TILE_SIZE), (x, y: number) => this.makeNoise(x, y, 400));
        } else this.fluids.spill(brl.x, brl.y, brl.type, 1500, this.isPassable);
    }


    
    private setPrisonGateOpen(gateId: string, open: boolean) {
        if (open) {
            // Find all cells belonging to this gate and open them in the grid
            this.activeDoors.forEach(d => {
                if (d.id === gateId) {
                    this.dungeon.grid[d.x][d.y] = 0;
                    this.passabilityGrid.setPassable(d.x, d.y, true);
                }
            });
            
            this.activeDoors = this.activeDoors.filter(d => d.id !== gateId);
            this.activeDoorObstacles = this.activeDoorObstacles.filter(obs => obs.id !== gateId);
            this.updateStaticLayer();
        }
    }

    private restartRoom() {
        if (this.ui.state.godMode || this.isRestarting || this.deathAnimTimer > 0 || this.isDead) return;
        this.isRestarting = true; this.player.willpower -= 1;
        if (this.player.willpower <= 0) { this.gameState = 'GAME_OVER'; sfx.gameOver(); }
        else { this.isDead = true; sfx.hit(); this.enemiesMap.values().forEach(e => { if (e.fsm) e.fsm.send('PLAYER_LOST'); clearMemory(e); }); this.particles.spawnBlood(this.player.x, this.player.y, 20); }
        this.isRestarting = false;
    }

    private triggerRestartAnimation() { if (this.isDead) { this.isDead = false; this.deathAnimTimer = 120; } }

    private finishRestartRoom() {
        // Items and chest states now persist
        enemyQuery(this.world).forEach(eid => bitECS.removeEntity(this.world, eid)); this.enemiesMap.clear();
        npcQuery(this.world).forEach(eid => bitECS.removeEntity(this.world, eid)); this.npcsMap.clear();
        this.roomSnapshot.enemies.forEach((e: any) => { const en = this.spawnEnemy(e.enemyId, e.x, e.y, e.role); en.angle = e.angle || 0; if (e.patrolPath) en.patrolPath = e.patrolPath; });
        this.roomSnapshot.npcs.forEach((n: any) => this.spawnNPC(n.type, n.x, n.y));
        this.dungeon.grid = this.roomSnapshot.grid.map((row: any) => [...row]);
        this.passabilityGrid.rebuildFromDungeon(this.dungeon.grid);
        this.player.x = this.roomSnapshot.startDoor.x + this.roomSnapshot.startDoor.w / 2; 
        this.player.y = this.roomSnapshot.startDoor.y + TILE_SIZE * 2; 
        Position.x[this.player.eid] = this.player.x; Position.y[this.player.eid] = this.player.y;
        this.player.camera.snap(this.player.x, this.player.y); this.player.trail = []; this.player.carryingBarrel = null; this.player.status = null; this.player.statusTimer = 0;
        this.isDead = false; this.player.ammo = this.player.computedStats.maxAmmo; this.player.isReloading = false; this.player.reloadTimer = 0;
        this.trapState = { ...this.roomSnapshot.trapState }; this.barrels = this.roomSnapshot.barrels.map((b: any) => ({ ...b }));

        // Clear ECS projectiles and grenades
        projectileQuery(this.world).forEach(eid => bitECS.removeEntity(this.world, eid));
        grenadeQuery(this.world).forEach(eid => bitECS.removeEntity(this.world, eid));

        this.particles.reset(); this.fluids.reset();
        this.activeDoors = [...this.roomSnapshot.secretDoors]; this.activeDoorObstacles = [...this.roomSnapshot.secretDoorObstacles];
        this.obstacles = this.roomSnapshot.obstacles;
        this.rooms = this.roomSnapshot.rooms || [];
        // Inventory, Chests, and Pickups now persist through death
        this.doors = []; if (this.startDoor) this.startDoor.open = false; this.roomActive = false; this.roomClearTimer = 0; this.gameState = 'PLAYING';
        this.updateStaticLayer(); this.addFloatingText(this.player.x, this.player.y - 20, "НОВАЯ ПОПЫТКА"); this.updateUI();
    }

    private damageEnemy(eid: number, amount: number) {
        const e = this.enemiesMap.get(eid); if (!e) return;
        e.hits -= amount;
        this.addFloatingText(e.x, e.y - 10, `-${amount}`, "#f00");
        if (e.hits <= 0) {
            this.particles.spawn(Position.x[eid], Position.y[eid], 15, 2, 3);
            bitECS.removeEntity(this.world, eid);
            this.enemiesMap.delete(eid);
            sfx.hit();

            // Grenade drop chance
            if (Math.random() < 0.08) {
                this.pickups.push({ id: Math.random(), x: Position.x[eid], y: Position.y[eid], type: Math.random() < 0.7 ? 'he' : 'flash' });
            }
        } else {
            sfx.hit(); // Play hit sound even if not dead
            this.particles.spawnBlood(e.x, e.y, 5);
        }
    }

    private updateComputedStats() {
        if (!this.player) return;
        const stats = { ...this.player.baseStats };

        for (const item of this.inventoryItems) {
            const dbItem = ITEMS_DB[item.id];
            if (dbItem && dbItem.stats) {
                Object.assign(stats, dbItem.stats);
            }
        }

        this.player.computedStats = stats;
        // Если макс патронов изменилось, можно обновить текущее, но в нашем случае shotgun не меняет maxAmmo
    }

    private updateUI() {
        this.updateComputedStats(); // Гарантируем актуальность статов при обновлении UI
        this.ui.update(
            this.player.willpower,
            this.player.maxWillpower,
            `${this.player.ammo}/${this.player.computedStats.maxAmmo}`,
            this.player.credits,
            this.weaponSystem.getChargeLevel(this.player),
            this.player.camera
        );
    }

    private updateStaticLayer() {
        this.render.updateStaticLayer(
            this.dungeon.grid,
            this.dungeon.variations,
            this.activeDoors,
            false,
            [],
            this.player.x,
            this.player.y
        );
    }

    private spawnEnemy(enemyId: string, x: number, y: number, role: 'guard' | 'patroller' | 'follower' | 'wanderer' | 'ambush' = 'wanderer') {
        const eid = bitECS.addEntity(this.world);
        const db = ENEMIES_DB[enemyId];
        const type = db.type;
        [EnemyTag, Position, Health, Velocity, Stats, AI, Combat].forEach(c => bitECS.addComponent(this.world, c, eid));
        if (type === 'shooter') bitECS.addComponent(this.world, ShooterTag, eid); else bitECS.addComponent(this.world, ChaserTag, eid);
        Position.x[eid] = x; Position.y[eid] = y; Position.angle[eid] = Math.random() * Math.PI * 2;
        Health.current[eid] = Health.max[eid] = db.maxHits; Stats.speed[eid] = db.speed; Stats.radius[eid] = 12; Stats.detectionRange[eid] = db.detectionRange;
        AI.role[eid] = AI_ROLES[role]; AI.status[eid] = AI_STATUS.none;

        const enemy: Enemy = {
            id: eid, enemyId, type, fsm: interpret(enemyMachineDef).start(), lastKnownPosition: null, barkText: "", noisePosition: null,
            get x() { return Position.x[eid]; }, set x(v) { Position.x[eid] = v; }, get y() { return Position.y[eid]; }, set y(v) { Position.y[eid] = v; },
            get angle() { return Position.angle[eid]; }, set angle(v) { Position.angle[eid] = v; }, get hits() { return Health.current[eid]; }, set hits(v) { Health.current[eid] = v; },
            get maxHits() { return Health.max[eid]; }, set maxHits(v) { Health.max[eid] = v; },
            get alertTimer() { return AI.alertTimer[eid]; }, set alertTimer(v) { AI.alertTimer[eid] = v; }, get barkTimer() { return AI.barkTimer[eid]; }, set barkTimer(v) { AI.barkTimer[eid] = v; },
            get memoryTimer() { return AI.memoryTimer[eid]; }, set memoryTimer(v) { AI.memoryTimer[eid] = v; }, get noiseLevel() { return AI.noiseLevel[eid]; }, set noiseLevel(v) { AI.noiseLevel[eid] = v; },
            get speed() { return Stats.speed[eid]; }, set speed(v) { Stats.speed[eid] = v; }, get radius() { return Stats.radius[eid]; }, set radius(v) { Stats.radius[eid] = v; },
            get detectionRange() { return Stats.detectionRange[eid]; }, set detectionRange(v) { Stats.detectionRange[eid] = v; },
            get statusTimer() { return AI.statusTimer[eid]; }, set statusTimer(v) { AI.statusTimer[eid] = v; },
            get role() { const r = AI.role[eid]; return (Object.keys(AI_ROLES) as any).find((k: string) => (AI_ROLES as any)[k] === r) || 'wanderer'; },
            set role(v) { AI.role[eid] = (AI_ROLES as any)[v]; },
            get status() { const s = AI.status[eid]; return s === AI_STATUS.none ? null : (Object.keys(AI_STATUS) as any).find((k: string) => (AI_STATUS as any)[k] === s) || null; },
            set status(v) { AI.status[eid] = v ? (AI_STATUS as any)[v] : AI_STATUS.none; },
            patrolIndex: 0, followOffX: 0, followOffY: 0,
            shootTimer: 0,
            shootCooldown: db.shootCooldown || 60,
            projectileSpeed: db.projectileSpeed || 2.0,
            stunTimer: 0,
            isStunned: false,
            onShoot: (sx: number, sy: number, angle: number) => {
                const projs = this.combat.spawnProjectiles({ x: sx, y: sy }, angle, { projectiles: 1, spreadAngle: 0 }, 0, 0, true, db.projectileSpeed);
                projs.forEach(p => {
                    const peid = bitECS.addEntity(this.world);
                    bitECS.addComponent(this.world, Position, peid);
                    bitECS.addComponent(this.world, Velocity, peid);
                    bitECS.addComponent(this.world, ProjectileTag, peid);
                    bitECS.addComponent(this.world, EnemyProjectileTag, peid);
                    Position.x[peid] = p.x;
                    Position.y[peid] = p.y;
                    Velocity.x[peid] = p.vx;
                    Velocity.y[peid] = p.vy;
                });
                lumen.addLight({ id: `enemy_muzzle_${eid}_${this.frameCounter}`, x: Math.floor(sx / TILE_SIZE), y: Math.floor(sy / TILE_SIZE), radius: 3, intensity: 0.5, type: LightType.TEMPORARY, active: true, ttl: 15 });
            }
        } as any as Enemy;
        if (role === 'ambush') enemy.fsm.send('START_SLEEPING');
        this.enemiesMap.set(eid, enemy); return enemy;
    }

    private spawnNPC(type: 'merchant' | 'shrine' | 'civilian', x: number, y: number) {
        const eid = bitECS.addEntity(this.world);
        const npc = type === 'merchant' ? createMerchant(this.world, eid, x, y) : (type === 'shrine' ? createAltar(this.world, eid, x, y) : createCivilian(this.world, eid, x, y));
        this.npcsMap.set(eid, npc); return npc;
    }

    private drawDialog() {
        if (!this.activeNPC?.currentNode) return;
        const node = this.activeNPC.currentNode, ctx = this.ctx;
        const padding = 20, width = GAME_WIDTH - 100, height = 150, x = 50, y = GAME_HEIGHT - 220;
        ctx.save();
        ctx.fillStyle = 'rgba(0,0,0,0.9)'; ctx.fillRect(x, y, width, height);
        ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.strokeRect(x, y, width, height);
        ctx.fillStyle = '#fff'; ctx.font = '14px "IBM Plex Mono"'; ctx.textAlign = 'left';
        this.wrapText(node.text, x + padding, y + padding + 10, width - padding * 2, 22);
        const optWidth = (GAME_WIDTH - 120) / 2, bottomY = GAME_HEIGHT - 80;
        node.options.forEach((opt, i) => {
            const ox = 50 + (i * (optWidth + 20)), oy = bottomY + 30, isHovered = this.input.mouse.x > ox && this.input.mouse.x < ox + optWidth && this.input.mouse.y > oy && this.input.mouse.y < oy + 30;
            ctx.fillStyle = isHovered ? '#fff' : '#000'; ctx.fillRect(ox, oy, optWidth, 30);
            ctx.strokeStyle = '#fff'; ctx.strokeRect(ox, oy, optWidth, 30);
            ctx.fillStyle = isHovered ? '#000' : '#fff'; ctx.textAlign = 'center'; ctx.font = 'bold 12px "IBM Plex Mono"'; ctx.fillText(opt.text, ox + optWidth / 2, oy + 20);
        });
        ctx.restore();
    }

    private drawExitConfirm() {
        const ctx = this.ctx, cx = GAME_WIDTH / 2, cy = GAME_HEIGHT / 2;
        ctx.save();
        ctx.fillStyle = 'rgba(0,0,0,0.9)'; ctx.fillRect(cx - 150, cy - 80, 300, 160);
        ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.strokeRect(cx - 150, cy - 80, 300, 160);
        ctx.fillStyle = '#fff'; ctx.font = 'bold 18px "IBM Plex Mono"'; ctx.textAlign = 'center'; ctx.fillText("ПОКИНУТЬ КОМНАТУ?", cx, cy - 10);
        [{ t: "ДА", x: cx - 110 }, { t: "НЕТ", x: cx + 10 }].forEach(b => {
            const h = this.input.mouse.x > b.x && this.input.mouse.x < b.x + 100 && this.input.mouse.y > cy + 20 && this.input.mouse.y < cy + 60;
            ctx.fillStyle = h ? '#fff' : '#000'; ctx.fillRect(b.x, cy + 20, 100, 40);
            ctx.strokeStyle = '#fff'; ctx.strokeRect(b.x, cy + 20, 100, 40);
            ctx.fillStyle = h ? '#000' : '#fff'; ctx.font = 'bold 14px "IBM Plex Mono"'; ctx.fillText(b.t, b.x + 50, cy + 45);
        });
        ctx.restore();
    }

    private wrapText(text: string, x: number, y: number, maxWidth: number, lineHeight: number) {
        text.split('\n').forEach(l => {
            let line = '';
            l.split(' ').forEach(w => {
                const test = line + w + ' ';
                if (this.ctx.measureText(test).width > maxWidth) { this.ctx.fillText(line, x, y); line = w + ' '; y += lineHeight; }
                else line = test;
            });
            this.ctx.fillText(line, x, y); y += lineHeight;
        });
    }

    private createDebugPanel() {
        this.debugPanel = document.createElement('div');
        Object.assign(this.debugPanel.style, {
            position: 'absolute', top: '10px', right: '10px',
            background: 'rgba(0,0,0,0.8)', color: '#0f0',
            padding: '10px', border: '1px solid #0f0',
            fontFamily: '"IBM Plex Mono", monospace', fontSize: '12px',
            zIndex: '100', pointerEvents: 'auto',
            minWidth: '200px', borderRadius: '4px',
            boxShadow: '0 0 10px rgba(0,255,0,0.2)'
        });
        
        const title = document.createElement('div');
        title.innerText = '--- DEBUG CONSOLE ---';
        title.style.borderBottom = '1px solid #0f0';
        title.style.marginBottom = '5px';
        title.style.fontWeight = 'bold';
        
        const content = document.createElement('div');
        content.id = 'debugContent';
        
        const btn = document.createElement('button');
        btn.innerText = 'REVEAL MAP [M]';
        Object.assign(btn.style, {
            marginTop: '10px', width: '100%', background: '#0f0', color: '#000',
            border: 'none', padding: '5px', cursor: 'pointer', fontWeight: 'bold'
        });
        btn.onclick = () => { this.ui.state.seeAllMap = !this.ui.state.seeAllMap; sfx.click(); if (this.ui.state.seeAllMap) this.refreshExploredFromLumen(); };
        
        const createToggle = (label: string, prop: keyof InterfaceState) => {
            const b = document.createElement('button');
            b.innerText = label;
            Object.assign(b.style, {
                marginTop: '5px', width: '100%', background: '#333', color: '#0f0',
                border: '1px solid #0f0', padding: '3px', cursor: 'pointer', fontSize: '10px'
            });
            b.onclick = () => { (this.ui.state as any)[prop] = !(this.ui.state as any)[prop]; sfx.click(); b.style.background = (this.ui.state as any)[prop] ? '#060' : '#333'; };
            if ((this.ui.state as any)[prop]) b.style.background = '#060';
            return b;
        };

        this.debugPanel.appendChild(title);
        this.debugPanel.appendChild(content);
        this.debugPanel.appendChild(btn);
        this.debugPanel.appendChild(createToggle('NOCLIP [DEBUG]', 'noclip'));
        this.debugPanel.appendChild(createToggle('SHOW AI VISION', 'showAiVision'));
        this.debugPanel.appendChild(createToggle('SHOW AI STATES', 'showAiStates'));
        document.body.appendChild(this.debugPanel);
    }

    private updateDebugPanel() {
        if (!this.debugPanel) return;
        const content = document.getElementById('debugContent');
        if (!content) return;

        const px = Math.floor(this.player.x / TILE_SIZE);
        const py = Math.floor(this.player.y / TILE_SIZE);
        
        let currentRoom = null;
        for (const room of this.rooms) {
            if (px >= room.getLeft() && px <= room.getRight() && py >= room.getTop() && py <= room.getBottom()) {
                currentRoom = room;
                break;
            }
        }

        const roomType = currentRoom ? (RoomTheme[currentRoom.theme] || 'NORMAL') : 'CORRIDOR';
        content.innerHTML = `
            POS: ${px}, ${py}<br>
            ROOM: <span style="color: #fff">${roomType}</span><br>
            MAP VISIBLE: <span style="color: #fff">${this.ui.state.seeAllMap ? 'ON' : 'OFF'}</span>
        `;
    }
}

window.onload = () => new Game();
