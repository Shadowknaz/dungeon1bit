import * as bitECS from 'bitecs';
import { IWorld } from 'bitecs';
import * as ROT from 'rot-js';
import { GAME_WIDTH, GAME_HEIGHT, TILE_SIZE, MAP_COLS, MAP_ROWS, WORLD_WIDTH, WORLD_HEIGHT, SECRET_ROOM_CHANCE, LONER_BASE_COUNT_MIN, LONER_BASE_COUNT_MAX, LONER_PER_ROOM_MIN, LONER_PER_ROOM_MAX, CHANCE_GOLEM, CHANCE_ELITE, CHANCE_SNIPER, CHANCE_LONER_SNIPER, MIN_LEVEL_ELITE, UNIFORM_LEVEL_MIN, UNIFORM_CHANCE } from '../core/constants';
import { ITEMS_DB, ENEMIES_DB, ANIMATIONS, OBJECTS_DB } from '../data/registry';
import { AnimatedSprite } from '../core/animatedSprite';
import { lumen, LightType } from './lumen';
import { SpawnManager, RoomTheme, RoomData } from './spawnManager';
import { generateBossArena, generateMerchantRoom, GlobalMapNode } from '../data/typeNode';
import { BIOMES } from '../data/biomes';
import { Position, PlayerTag } from '../domain/components';
import { Point, ItemInstance, Enemy, Barrel, Chest, Door, Torch } from '../domain/types';
import { sfx } from '../core/audio';
import { PlateType } from './traps';

export interface LevelContext {
    world: IWorld;
    player: any;
    dungeon: any;
    overlay: any;
    fog: any;
    globalMap: any;
    currentNodeId: number | null;
    roomLevel: number;
    spawnEnemy: (enemyId: string, x: number, y: number, role: 'guard' | 'patroller' | 'follower' | 'wanderer') => any;
    spawnNPC: (type: 'merchant' | 'shrine' | 'civilian', x: number, y: number) => any;
    updateUI: () => void;
    updateStaticLayer: () => void;
    ownedItemIds: string[];
    ui: any;
}

export class LevelManager {
    public generateRoom(ctx: LevelContext): any {
        const result = {
            bullets: [] as any[],
            trapState: { pits: [] as any[], spikes: [] as any[], blades: [] as any[], plates: [] as any[], mines: [] as any[], mirrors: [] as any[] },
            obstacles: [] as any[],
            floatingTexts: [] as any[],
            chests: [] as any[],
            doors: [] as any[],
            barrels: [] as any[],
            torches: [] as any[],
            secretRoomOpen: false,
            secretDoors: [] as any[],
            secretDoorObstacles: [] as any[],
            secretRoomCells: [] as {gx: number, gy: number}[],
            roomActive: false,
            combatIntensity: 0,
            startDoor: null as any,
            exitRoomCenter: { x: 0, y: 0 } as Point,
            pickups: [] as any[],
            rooms: [] as any[]
        };

        // Cleanup old bitECS entities except player
        const entities = bitECS.getAllEntities(ctx.world);
        for (const eid of entities) {
            if (!bitECS.hasComponent(ctx.world, PlayerTag, eid)) {
                bitECS.removeEntity(ctx.world, eid);
            }
        }

        ctx.player.trail = []; 
        ctx.player.camera.snap(WORLD_WIDTH / 2, WORLD_HEIGHT - 200);
        
        // Initialize components
        Position.x[ctx.player.eid] = WORLD_WIDTH / 2;
        Position.y[ctx.player.eid] = WORLD_HEIGHT - 200;

        lumen.reset();
        ctx.fog.reset();

        const node: GlobalMapNode = ctx.globalMap.nodes[ctx.currentNodeId!];
        const biome = BIOMES[node.biomeId || 'dungeon'];
        
        if (node.type === 'merchant' || node.type === 'shrine') {
            ctx.dungeon.reset();
            const res = generateMerchantRoom();
            ctx.dungeon.grid = res.grid;
            result.startDoor = res.startDoor;
            result.exitRoomCenter = res.exitRoomCenter;
            ctx.overlay.clear();
            ctx.overlay.decorateRoom(res.floorTiles, biome.visuals.floorDecorChance);

            const cx = Math.floor(MAP_COLS / 2);
            const cy = 10;
            if (node.type === 'merchant') ctx.spawnNPC('merchant', cx*TILE_SIZE, cy*TILE_SIZE);
            else ctx.spawnNPC('shrine', cx*TILE_SIZE, cy*TILE_SIZE);
            ctx.spawnNPC('civilian', cx*TILE_SIZE - 40, cy*TILE_SIZE + 40);
        } else if (node.type === 'boss') {
            ctx.dungeon.reset();
            const res = generateBossArena();
            ctx.dungeon.grid = res.grid;
            result.startDoor = res.startDoor;
            result.exitRoomCenter = res.exitRoomCenter;
            ctx.overlay.clear();
            ctx.overlay.decorateRoom(res.floorTiles, biome.visuals.floorDecorChance * 0.5);
        } else {
            const rooms = ctx.dungeon.generate(biome.generation);
            if (!rooms || rooms.length === 0) {
                // Fallback: minimal room if generation fails
                ctx.dungeon.grid[MAP_COLS/2][MAP_ROWS/2] = 0;
                result.startDoor = { x: (MAP_COLS * TILE_SIZE) / 2 - 60, y: (MAP_ROWS - 2) * TILE_SIZE, w: 120, h: 20, open: false, type: 'start' };
                result.exitRoomCenter = { x: (MAP_COLS * TILE_SIZE) / 2, y: 100 };
            } else {
                const closest = ctx.dungeon.getClosestRoom(rooms, MAP_COLS / 2, MAP_ROWS - 10);
                
                // Use A* to dig a guaranteed path from start to closest room
                const startX = Math.floor(MAP_COLS / 2), startY = MAP_ROWS - 9;
                const pathDigging: ROT.Path.AStar = new ROT.Path.AStar(closest.cx, closest.cy, (x, y) => true, { topology: 4 });
                pathDigging.compute(startX, startY, (x, y) => {
                    // Dig a 3x3 area for a reliable corridor
                    for (let dx = -1; dx <= 1; dx++) {
                        for (let dy = -1; dy <= 1; dy++) {
                            const nx = x + dx;
                            const ny = y + dy;
                            if (nx >= 0 && nx < MAP_COLS && ny >= 0 && ny < MAP_ROWS) {
                                ctx.dungeon.grid[nx][ny] = 0;
                            }
                        }
                    }
                });
                
                const lobbyX = Math.floor(MAP_COLS / 2);
                const lobbyY = MAP_ROWS - 11;
                for (let x = lobbyX - 4; x <= lobbyX + 3; x++) for (let y = lobbyY; y < lobbyY + 3; y++) ctx.dungeon.grid[x][y] = 0;
                for (let x = 0; x < MAP_COLS; x++) for (let y = lobbyY + 3; y < MAP_ROWS; y++) ctx.dungeon.grid[x][y] = (x >= lobbyX - 3 && x <= lobbyX + 2) ? 0 : 1;

                result.startDoor = { x: (MAP_COLS * TILE_SIZE) / 2 - 60, y: (lobbyY + 3) * TILE_SIZE, w: 120, h: 20, open: false, type: 'start' };
                const topRoom = ctx.dungeon.getTopRoom(rooms);
                result.exitRoomCenter = { x: topRoom.getCenter()[0] * TILE_SIZE, y: topRoom.getCenter()[1] * TILE_SIZE };
                result.rooms = rooms;
                // Move spawnManager initialization AFTER secret rooms are processed below

                // Secret room logic removed as per request

                // NOW initialize SpawnManager, after grid and rooms are ready
                const spawnManager = new SpawnManager(ctx.dungeon.grid, rooms, result.startDoor, result.exitRoomCenter, biome.spawnTable);

                // Secret plate logic removed

                result.secretDoorObstacles = [];
                
                // Position player at start door
                ctx.player.x = result.startDoor.x + result.startDoor.w / 2;
                ctx.player.y = result.startDoor.y + TILE_SIZE * 2;
                Position.x[ctx.player.eid] = ctx.player.x;
                Position.y[ctx.player.eid] = ctx.player.y;
                ctx.player.camera.snap(ctx.player.x, ctx.player.y);

                // 2. Floor Decorations (on final grid)
                ctx.overlay.clear();
                const floorTiles: {x: number, y: number}[] = [];
                for (let x = 0; x < MAP_COLS; x++) for (let y = 0; y < MAP_ROWS; y++) if (ctx.dungeon.grid[x][y] === 0) floorTiles.push({x, y});
                ctx.overlay.decorateRoom(floorTiles, biome.visuals.floorDecorChance);

                // 3. Wall Glows (Destructible walls handled by grid collision now)
                ctx.ui.clearWallGlows();
                for (let x = 0; x < MAP_COLS; x++) {
                    for (let y = 0; y < MAP_ROWS; y++) {
                        if (ctx.dungeon.grid[x][y] === 3) {
                            ctx.ui.addWallGlow(x * TILE_SIZE + TILE_SIZE/2, y * TILE_SIZE + TILE_SIZE/2);
                        }
                    }
                }

                // Add smart traps at bottlenecks
                ctx.dungeon.recommendations.recommendedTraps.forEach((p: {x: number, y: number}, i: number) => {
                    result.trapState.spikes.push({ 
                        id: `smart_spike_${i}`, 
                        x: p.x * TILE_SIZE + TILE_SIZE/2, 
                        y: p.y * TILE_SIZE + TILE_SIZE/2, 
                        state: 0, 
                        timer: 0 
                    });
                });

                // 4. Spawn Manager
                const eligibleRooms = spawnManager.getEligibleRooms();
                const placedObjects: { x: number; y: number }[] = [];
                const maxChestsPerRoom = OBJECTS_DB['chest'].maxPerRoom || 1;
                // Special handling for chests: user wants 1 per dungeon total if maxPerRoom is 1
                const maxChestsPerDungeon = (maxChestsPerRoom === 1) ? 1 : (maxChestsPerRoom * eligibleRooms.length);

                eligibleRooms.forEach((room: RoomData) => {
                    const roomFloor = spawnManager.getRoomFloorCells(room);
                    const shuffledRoomFloor = roomFloor.sort(() => ROT.RNG.getUniform() - 0.5);
                    let chestsInRoom = 0;

                    switch (room.theme) {
                        case RoomTheme.ARENA:
                            const arenaCenter = { x: room.centerX * TILE_SIZE + TILE_SIZE / 2, y: room.centerY * TILE_SIZE + TILE_SIZE / 2 };
                            const golem = ctx.spawnEnemy('golem', arenaCenter.x, arenaCenter.y, 'ambush');
                            golem.anim = new AnimatedSprite(ANIMATIONS.ENEMY_CHASER_WALK);
                            placedObjects.push(arenaCenter);
                            break;

                        case RoomTheme.ARMORY:
                            // Picking 1 chest for Armory (as requested)
                            for (let i = 0; i < Math.min(1, maxChestsPerRoom); i++) {
                                if (result.chests.length >= maxChestsPerDungeon) break;
                                const pos = shuffledRoomFloor.find(s => spawnManager.isDistanceValid(s.x, s.y, placedObjects, 128));
                                if (pos) {
                                    const weapons = Object.keys(ITEMS_DB).filter(id => ITEMS_DB[id].stats?.weaponId);
                                    const itemId = weapons.length > 0 
                                        ? weapons[Math.floor(ROT.RNG.getUniform() * weapons.length)]
                                        : 'medkit';
                                        
                                    const chestId = Math.random();
                                    result.chests.push({ id: chestId, x: pos.x, y: pos.y, items: [{ id: itemId, instanceId: Math.random() }] });
                                    result.obstacles.push({ x: pos.x - 12, y: pos.y - 10, w: 24, h: 20, type: 'chest', id: chestId });
                                    ctx.dungeon.grid[pos.gx][pos.gy] = 2;
                                    placedObjects.push(pos);
                                    chestsInRoom++;
                                    ctx.spawnEnemy('elite', pos.x + 32, pos.y, 'guard');
                                }
                            }
                            break;

                        case RoomTheme.MINEFIELD:
                            const mineSpawns = shuffledRoomFloor.filter((_, i) => i % 2 === 0);
                            mineSpawns.forEach((s, i) => {
                                result.trapState.spikes.push({ id: `mine_${room.id}_${i}`, x: s.x, y: s.y, state: 0, timer: 0 });
                            });
                            
                            while (chestsInRoom < maxChestsPerRoom && result.chests.length < maxChestsPerDungeon) {
                                const lootPos = shuffledRoomFloor.find(s => spawnManager.isDistanceValid(s.x, s.y, placedObjects, 128));
                                if (lootPos) {
                                    const chestId = Math.random();
                                    result.chests.push({ id: chestId, x: lootPos.x, y: lootPos.y, items: [{ id: 'medkit', instanceId: Math.random() }] });
                                    result.obstacles.push({ x: lootPos.x - 12, y: lootPos.y - 10, w: 24, h: 20, type: 'chest', id: chestId });
                                    ctx.dungeon.grid[lootPos.gx][lootPos.gy] = 2;
                                    placedObjects.push(lootPos);
                                    chestsInRoom++;
                                } else break;
                            }
                            break;

                        case RoomTheme.WAREHOUSE:
                            const barrelSpawns = shuffledRoomFloor.filter(s => spawnManager.isDistanceValid(s.x, s.y, placedObjects, 48)).slice(0, 10);
                            barrelSpawns.forEach(s => {
                                const barrelId = Math.random();
                                result.barrels.push({ id: barrelId, x: s.x, y: s.y, radius: 10, type: ROT.RNG.getUniform() < 0.5 ? 'oil' : 'petroleum' });
                                result.obstacles.push({ x: s.x - 10, y: s.y - 10, w: 20, h: 20, type: 'barrel', id: barrelId });
                                ctx.dungeon.grid[s.gx][s.gy] = 2;
                                placedObjects.push(s);
                            });
                            break;

                        case RoomTheme.PRISON:
                            // ... existing prison logic ...
                            const cellX = room.left + 1, cellY = room.top + 1;
                            const gatePos = { gx: cellX + 2, gy: cellY + 1 };
                            const prisonId = `prison_${room.id}`;
                            
                            for (let dx = 0; dx < 3; dx++) {
                                for (let dy = 0; dy < 3; dy++) {
                                    const gx = cellX + dx, gy = cellY + dy;
                                    if (dx === 0 || dx === 2 || dy === 0 || dy === 2) {
                                        ctx.dungeon.grid[gx][gy] = 1;
                                        if (gx === gatePos.gx && gy === gatePos.gy) {
                                            result.secretDoors.push({ x: gx, y: gy, id: prisonId }); 
                                            result.secretDoorObstacles.push({ x: gx * TILE_SIZE, y: gy * TILE_SIZE, w: TILE_SIZE, h: TILE_SIZE, id: prisonId });
                                        } else {
                                            result.obstacles.push({ x: gx * TILE_SIZE, y: gy * TILE_SIZE, w: TILE_SIZE, h: TILE_SIZE });
                                        }
                                    }
                                    result.secretRoomCells.push({ gx, gy });
                                }
                            }
                            ctx.spawnNPC('civilian', (cellX + 1) * TILE_SIZE + TILE_SIZE / 2, (cellY + 1) * TILE_SIZE + TILE_SIZE / 2);
                            let pPos = { x: (cellX + 4) * TILE_SIZE + TILE_SIZE/2, y: (cellY + 1) * TILE_SIZE + TILE_SIZE/2 };
                            let pgx = Math.floor(pPos.x / TILE_SIZE), pgy = Math.floor(pPos.y / TILE_SIZE);
                            if (ctx.dungeon.grid[pgx]?.[pgy] !== 0) {
                                const alternatives = [[1,0],[-1,0],[0,1],[0,-1],[1,1],[1,-1],[-1,1],[-1,-1]];
                                for(const [adx, ady] of alternatives) {
                                    if (ctx.dungeon.grid[pgx + adx]?.[pgy + ady] === 0) {
                                        pPos = { x: (pgx + adx) * TILE_SIZE + TILE_SIZE/2, y: (pgy + ady) * TILE_SIZE + TILE_SIZE/2 };
                                        break;
                                    }
                                }
                            }
                            result.trapState.plates.push({ id: `prison_plate_${room.id}`, x: pPos.x, y: pPos.y, pressed: false, timer: 0, discovered: false, type: PlateType.PRISON_GATE, targetId: prisonId });
                            break;

                        case RoomTheme.TREASURY:
                            while (chestsInRoom < Math.min(2, maxChestsPerRoom) && result.chests.length < maxChestsPerDungeon) {
                                const pos = shuffledRoomFloor.find(s => spawnManager.isDistanceValid(s.x, s.y, placedObjects, 128));
                                if (pos) {
                                    const treasureChestId = Math.random();
                                    const highTierItems = Object.keys(ITEMS_DB).filter(id => ITEMS_DB[id].rarity === 'legendary' || ITEMS_DB[id].rarity === 'epic');
                                    const rareItemId = highTierItems.length > 0 
                                        ? highTierItems[Math.floor(ROT.RNG.getUniform() * highTierItems.length)]
                                        : 'railgun';
                                        
                                    result.chests.push({ 
                                        id: treasureChestId, 
                                        x: pos.x, y: pos.y, 
                                        items: [{ id: rareItemId, instanceId: Math.random() }, { id: 'medkit', instanceId: Math.random() }] 
                                    });
                                    result.obstacles.push({ x: pos.x - 12, y: pos.y - 10, w: 24, h: 20, type: 'chest', id: treasureChestId });
                                    ctx.dungeon.grid[pos.gx][pos.gy] = 2;
                                    placedObjects.push(pos);
                                    chestsInRoom++;
                                } else break;
                            }
                            break;

                        default:
                            // Standard group spawn
                            const roomSpawns = spawnManager.getRoomOnlySpawns(1, 3).filter(s => s.gx >= room.left && s.gx <= room.right && s.gy >= room.top && s.gy <= room.bottom);
                            if (roomSpawns.length > 0) {
                                const center = roomSpawns[Math.floor(ROT.RNG.getUniform() * roomSpawns.length)];
                                let groupSize = Math.floor(ROT.RNG.getUniform() * biome.spawnTable.maxEnemiesPerRoom) + 1;
                                for (let i = 0; i < groupSize; i++) {
                                if (center) {
                                    // Improved cluster spawn safety
                                    const sx = center.x + (i === 0 ? 0 : Math.cos(i) * 32);
                                    const sy = center.y + (i === 0 ? 0 : Math.sin(i) * 32);
                                    
                                    const gx = Math.floor(sx / TILE_SIZE);
                                    const gy = Math.floor(sy / TILE_SIZE);
                                    
                                    // Use spawnManager's safety check
                                    if (spawnManager.isValidRoomSpawn(gx, gy, 1, 2)) {
                                        ctx.spawnEnemy(spawnManager.getRandomEnemy(), sx, sy, i === 0 ? 'guard' : 'follower');
                                    } else {
                                        // Fallback to center if cluster point is unsafe
                                        ctx.spawnEnemy(spawnManager.getRandomEnemy(), center.x, center.y, i === 0 ? 'guard' : 'follower');
                                    }
                                }
                                }
                            }
                            // Random Chests in default rooms
                            if (ROT.RNG.getUniform() < OBJECTS_DB['chest'].spawnChance && result.chests.length < maxChestsPerDungeon) {
                                while (chestsInRoom < maxChestsPerRoom && result.chests.length < maxChestsPerDungeon) {
                                    const pos = shuffledRoomFloor.find(s => spawnManager.isDistanceValid(s.x, s.y, placedObjects, 128));
                                    if (pos) {
                                        const chestId = Math.random();
                                        result.chests.push({ id: chestId, x: pos.x, y: pos.y, items: [{ id: 'medkit', instanceId: Math.random() }] });
                                        result.obstacles.push({ x: pos.x - 12, y: pos.y - 10, w: 24, h: 20, type: 'chest', id: chestId });
                                        ctx.dungeon.grid[pos.gx][pos.gy] = 2;
                                        placedObjects.push(pos);
                                        chestsInRoom++;
                                        if (ROT.RNG.getUniform() > 0.3) break; // Most rooms have 1, some have more
                                    } else break;
                                }
                            }
                            break;
                    }
                });

                // Global elements (corridors, loners, torches)
                const corridorSpawns = spawnManager.getCorridorSpawns(2);
                const shuffledCorridorSpawns = corridorSpawns.sort(() => ROT.RNG.getUniform() - 0.5);

                // Loners Spawning (Wanderers)
                const totalLoners = LONER_BASE_COUNT_MIN + (rooms?.length || 0) * LONER_PER_ROOM_MIN;
                for (let i = 0; i < totalLoners; i++) {
                    if (ROT.RNG.getUniform() > biome.spawnTable.lonerChance) continue;
                    const sp = spawnManager.getRandomSpawn(shuffledCorridorSpawns.filter(s => spawnManager.isDistanceValid(s.x, s.y, placedObjects, 60)));
                    if (sp) {
                        ctx.spawnEnemy(spawnManager.getRandomEnemy(), sp.x, sp.y, 'wanderer');
                        placedObjects.push(sp);
                    }
                }

                // Torches
                for (let i = 0; i < 5; i++) {
                    const sp = spawnManager.getRandomSpawn(shuffledCorridorSpawns.filter(s => spawnManager.isDistanceValid(s.x, s.y, placedObjects, 100)));
                    if (sp) {
                        const torchId = `torch_${Date.now()}_${i}`;
                        result.torches.push({ id: torchId, x: sp.x, y: sp.y, gx: sp.gx, gy: sp.gy });
                        lumen.addLight({ id: torchId, x: sp.gx, y: sp.gy, radius: 6, intensity: 0.9, type: LightType.STATIC, active: true });
                    }
                }

                // 5. Final Connectivity Check: Ensure player can reach exit
                const finalStartX = Math.floor(result.startDoor.x / TILE_SIZE) + 3;
                const finalStartY = Math.floor(result.startDoor.y / TILE_SIZE);
                const exitGX = Math.floor(result.exitRoomCenter.x / TILE_SIZE);
                const exitGY = Math.floor(result.exitRoomCenter.y / TILE_SIZE);

                const connectivityCheck = new ROT.Path.AStar(exitGX, exitGY, (x, y) => {
                    if (x < 0 || x >= MAP_COLS || y < 0 || y >= MAP_ROWS) return false;
                    return ctx.dungeon.grid[x][y] === 0;
                }, { topology: 4 });

                let isReachable = false;
                connectivityCheck.compute(finalStartX, finalStartY, (x, y) => {
                    if (x === exitGX && y === exitGY) isReachable = true;
                });

                if (!isReachable) {
                    // Force dig a corridor if unreachable
                    const pathFixer = new ROT.Path.AStar(exitGX, exitGY, (x, y) => true, { topology: 4 });
                    pathFixer.compute(finalStartX, finalStartY, (x, y) => {
                        ctx.dungeon.grid[x][y] = 0;
                        if (ctx.dungeon.grid[x+1] && ctx.dungeon.grid[x+1][y] === 1) ctx.dungeon.grid[x+1][y] = 0;
                        if (ctx.dungeon.grid[x] && ctx.dungeon.grid[x][y+1] === 1) ctx.dungeon.grid[x][y+1] = 0;
                    });
                }

                // Grenades Spawning
                if (ROT.RNG.getUniform() < 0.5) {
                    const sp = spawnManager.getRandomSpawn(shuffledCorridorSpawns.filter(s => spawnManager.isDistanceValid(s.x, s.y, placedObjects, 40)));
                    if (sp) result.pickups.push({ id: Math.random(), x: sp.x, y: sp.y, type: 'he' });
                }
            }
        }

        ctx.updateStaticLayer();
        ctx.updateUI();
        return result;
    }
}
