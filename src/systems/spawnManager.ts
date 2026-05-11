import * as ROT from 'rot-js';
import { MAP_COLS, MAP_ROWS, TILE_SIZE } from '../core/constants';

export interface SpawnPosition {
    x: number;
    y: number;
    gx: number;
    gy: number;
}

export enum RoomTheme {
    DEFAULT = 'default',
    ARMORY = 'armory',
    MINEFIELD = 'minefield',
    ARENA = 'arena',
    WAREHOUSE = 'warehouse',
    PRISON = 'prison',
    TREASURY = 'treasury'
}

export interface RoomData {
    id: string;
    left: number;
    right: number;
    top: number;
    bottom: number;
    centerX: number;
    centerY: number;
    doors: { x: number; y: number }[];
    theme: RoomTheme;
}

export class SpawnManager {
    private grid: number[][];
    private roomRegistry: Map<string, RoomData>;
    private spawnTable: any;

    constructor(
        grid: number[][],
        rooms: any[],
        startDoor: { x: number; y: number; w: number; h: number },
        exitRoomCenter: { x: number; y: number },
        spawnTable: any
    ) {
        this.grid = grid;
        this.spawnTable = spawnTable;
        this.startDoor = { x: Math.floor(startDoor.x / TILE_SIZE), y: Math.floor(startDoor.y / TILE_SIZE) };
        this.exitRoomCenter = { x: Math.floor(exitRoomCenter.x / TILE_SIZE), y: Math.floor(exitRoomCenter.y / TILE_SIZE) };
        this.roomRegistry = this.buildRoomRegistry(rooms);
    }

    private buildRoomRegistry(rooms: any[]): Map<string, RoomData> {
        const registry = new Map<string, RoomData>();
        const normalRooms: any[] = [];
        
        // 1. First pass: identify secret rooms and candidates for special themes
        rooms.forEach((room: any, idx: number) => {
            const roomId = `room_${idx}`;
            const doors: { x: number; y: number }[] = [];
            room.getDoors((x: number, y: number) => doors.push({ x, y }));

            const roomData: RoomData = {
                id: roomId,
                left: room.getLeft(),
                right: room.getRight(),
                top: room.getTop(),
                bottom: room.getBottom(),
                centerX: room.getCenter()[0],
                centerY: room.getCenter()[1],
                doors,
                theme: RoomTheme.DEFAULT
            };

            // Detect secret rooms from BSP generator
            if ((room as any).getBSPRoom && (room as any).getBSPRoom().isSecret) {
                roomData.theme = RoomTheme.TREASURY;
            }
            
            registry.set(roomId, roomData);
            
            // Collect eligible non-lobby rooms for special themes
            if (!this.isStartRoom(roomData) && !this.isExitRoom(roomData) && roomData.theme !== RoomTheme.TREASURY) {
                normalRooms.push(roomData);
            }
        });

        // 2. Second pass: distribute special themes from a pool
        const themePool: RoomTheme[] = [
            RoomTheme.ARENA,
            RoomTheme.PRISON,
            RoomTheme.ARMORY,
            RoomTheme.WAREHOUSE,
            RoomTheme.MINEFIELD
        ];

        // Shuffle normal rooms to pick random ones for themes
        const shuffledRooms = normalRooms.sort(() => ROT.RNG.getUniform() - 0.5);
        
        themePool.forEach(theme => {
            if (shuffledRooms.length > 0) {
                const room = shuffledRooms.pop()!;
                room.theme = theme;
            }
        });

        return registry;
    }

    public getRoomThemes(): Map<string, RoomTheme> {
        const themes = new Map<string, RoomTheme>();
        this.roomRegistry.forEach(r => themes.set(r.id, r.theme));
        return themes;
    }

    /**
     * Возвращает все клетки пола внутри комнаты
     */
    public getRoomFloorCells(room: RoomData): {gx: number, gy: number, x: number, y: number}[] {
        const cells: {gx: number, gy: number, x: number, y: number}[] = [];
        for (let x = room.left; x <= room.right; x++) {
            for (let y = room.top; y <= room.bottom; y++) {
                if (this.grid[x][y] === 0) {
                    cells.push({ gx: x, gy: y, x: x * TILE_SIZE + TILE_SIZE / 2, y: y * TILE_SIZE + TILE_SIZE / 2 });
                }
            }
        }
        return cells;
    }

    /**
     * Проверяет, находится ли клетка внутри комнаты (не коридор)
     */
    getRoomForCell(gx: number, gy: number): RoomData | null {
        for (const room of this.roomRegistry.values()) {
            if (gx >= room.left && gx <= room.right && gy >= room.top && gy <= room.bottom) {
                return room;
            }
        }
        return null;
    }

    /**
     * Проверяет, находится ли клетка рядом с дверями (вход/выход)
     */
    isNearDoors(gx: number, gy: number, minDistance: number = 3): boolean {
        for (const room of this.roomRegistry.values()) {
            for (const door of room.doors) {
                if (Math.hypot(gx - door.x, gy - door.y) < minDistance) return true;
            }
        }
        // Проверка расстояния до стартовой двери
        if (Math.hypot(gx - this.startDoor.x, gy - this.startDoor.y) < minDistance * 2) return true;
        // Проверка расстояния до выхода
        if (Math.hypot(gx - this.exitRoomCenter.x, gy - this.exitRoomCenter.y) < minDistance * 2) return true;
        return false;
    }

    /**
     * Проверяет, находится ли клетка в узком коридоре
     */
    isNarrowCorridor(gx: number, gy: number): boolean {
        let floorNeighbors = 0;
        const dirs = [[0, 1], [0, -1], [1, 0], [-1, 0], [1, 1], [1, -1], [-1, 1], [-1, -1]];
        for (const [dx, dy] of dirs) {
            const nx = gx + dx, ny = gy + dy;
            if (nx >= 0 && ny >= 0 && nx < MAP_COLS && ny < MAP_ROWS && this.grid[nx][ny] === 0) {
                floorNeighbors++;
            }
        }
        return floorNeighbors < 7; // More inclusive for corridors
    }

    /**
     * Проверяет расстояние до стен (minDistance - минимальное расстояние в клетках)
     */
    isNearWalls(gx: number, gy: number, minDistance: number = 1): boolean {
        for (let dx = -minDistance; dx <= minDistance; dx++) {
            for (let dy = -minDistance; dy <= minDistance; dy++) {
                const nx = gx + dx, ny = gy + dy;
                if (nx < 0 || ny < 0 || nx >= MAP_COLS || ny >= MAP_ROWS) return true;
                if (this.grid[nx][ny] === 1) return true;
            }
        }
        return false;
    }

    /**
     * Получает позиции только внутри комнат (не в коридорах), не у стен, не у дверей
     */
    getRoomOnlySpawns(minWallDistance: number = 1, minDoorDistance: number = 3): SpawnPosition[] {
        const spawns: SpawnPosition[] = [];
        const eligibleRooms = this.getEligibleRooms();

        for (const room of eligibleRooms) {
            for (let x = room.left; x <= room.right; x++) {
                for (let y = room.top; y <= room.bottom; y++) {
                    if (this.isValidRoomSpawn(x, y, minWallDistance, minDoorDistance)) {
                        spawns.push({
                            x: x * TILE_SIZE + TILE_SIZE / 2,
                            y: y * TILE_SIZE + TILE_SIZE / 2,
                            gx: x,
                            gy: y
                        });
                    }
                }
            }
        }
        return spawns;
    }

    /**
     * Получает позиции только в коридорах (узкие проходы)
     */
    getCorridorSpawns(minDoorDistance: number = 2): SpawnPosition[] {
        const spawns: SpawnPosition[] = [];

        for (let x = 0; x < MAP_COLS; x++) {
            for (let y = 0; y < MAP_ROWS; y++) {
                // Skip safe zone (now dynamic via isNearDoors)
                // if (y >= 19) continue; 

                // Должен быть пол
                if (this.grid[x][y] !== 0) continue;
                // Не должен быть в комнате
                if (this.getRoomForCell(x, y)) continue;
                // Должен быть узким коридором
                if (!this.isNarrowCorridor(x, y)) continue;
                // Не рядом с дверями
                if (this.isNearDoors(x, y, minDoorDistance)) continue;

                spawns.push({
                    x: x * TILE_SIZE + TILE_SIZE / 2,
                    y: y * TILE_SIZE + TILE_SIZE / 2,
                    gx: x,
                    gy: y
                });
            }
        }
        return spawns;
    }

    /**
     * Проверяет валидность позиции для спавна в комнате
     */
    isValidRoomSpawn(gx: number, gy: number, minWallDistance: number = 1, minDoorDistance: number = 3): boolean {
        // Bounds check
        if (gx < 0 || gy < 0 || gx >= MAP_COLS || gy >= MAP_ROWS) return false;
        // Должен быть пол
        if (this.grid[gx][gy] !== 0) return false;
        // Должен быть внутри комнаты (не коридор)
        const room = this.getRoomForCell(gx, gy);
        if (!room) return false;
        // Не должен быть в исключенных комнатах
        if (!this.isRoomEligible(room)) return false;
        // Не рядом со стенами
        if (this.isNearWalls(gx, gy, minWallDistance)) return false;
        // Не рядом с дверями
        if (this.isNearDoors(gx, gy, minDoorDistance)) return false;
        return true;
    }

    /**
     * Проверяет, может ли комната использоваться для спавна
     */
    isRoomEligible(room: RoomData): boolean {
        // Исключаем комнату со стартовой дверью
        if (this.isStartRoom(room)) return false;
        // Исключаем комнату с выходом
        if (this.isExitRoom(room)) return false;
        return true;
    }

    private isStartRoom(room: RoomData): boolean {
        return this.startDoor.x >= room.left && this.startDoor.x <= room.right &&
               this.startDoor.y >= room.top && this.startDoor.y <= room.bottom;
    }

    private isExitRoom(room: RoomData): boolean {
        return this.exitRoomCenter.x >= room.left && this.exitRoomCenter.x <= room.right &&
               this.exitRoomCenter.y >= room.top && this.exitRoomCenter.y <= room.bottom;
    }

    /**
     * Получает список комнат, доступных для спавна
     */
    getEligibleRooms(): RoomData[] {
        return Array.from(this.roomRegistry.values()).filter(r => this.isRoomEligible(r));
    }

    /**
     * Фильтрует позиции с учетом минимального расстояния до уже размещенных объектов
     */
    filterByDistance(spawns: SpawnPosition[], placedObjects: { x: number; y: number }[], minDistance: number): SpawnPosition[] {
        const minDistSq = minDistance * minDistance;
        return spawns.filter(spawn => {
            return !placedObjects.some(obj => {
                const dx = spawn.x - obj.x;
                const dy = spawn.y - obj.y;
                return dx * dx + dy * dy < minDistSq;
            });
        });
    }

    /**
     * Получает случайную позицию из массива и удаляет её
     */
    getRandomSpawn(spawns: SpawnPosition[]): SpawnPosition | null {
        if (spawns.length === 0) return null;
        const index = Math.floor(ROT.RNG.getUniform() * spawns.length);
        return spawns.splice(index, 1)[0];
    }

    /**
     * Finds optimal spawn points for groups in each room.
     * Points are chosen to be in the center area, away from walls.
     */
    getOptimalSpawnPoints(): { gx: number; gy: number; x: number; y: number; roomId: string }[] {
        const points: { gx: number; gy: number; x: number; y: number; roomId: string }[] = [];
        const eligibleRooms = this.getEligibleRooms();

        for (const room of eligibleRooms) {
            const roomCandidates: { gx: number; gy: number; x: number; y: number; score: number }[] = [];

            // Search for the point with maximum "safety" (distance to walls and doors)
            for (let x = room.left; x <= room.right; x++) {
                for (let y = room.top; y <= room.bottom; y++) {
                    if (this.grid[x][y] !== 0) continue;
                    
                    // Basic distance to walls
                    let minDistToWall = 5;
                    for (let dx = -3; dx <= 3; dx++) {
                        for (let dy = -3; dy <= 3; dy++) {
                            const nx = x + dx, ny = y + dy;
                            if (nx < 0 || ny < 0 || nx >= MAP_COLS || ny >= MAP_ROWS || this.grid[nx][ny] === 1) {
                                minDistToWall = Math.min(minDistToWall, Math.max(Math.abs(dx), Math.abs(dy)));
                            }
                        }
                    }

                    // Avoid doors
                    if (this.isNearDoors(x, y, 3)) continue;

                    // Heuristic score: favor distance from walls and proximity to center
                    const distToCenter = Math.hypot(x - room.centerX, y - room.centerY);
                    const score = minDistToWall * 10 - distToCenter;

                    if (score > 0) {
                        roomCandidates.push({
                            gx: x, gy: y,
                            x: x * TILE_SIZE + TILE_SIZE / 2,
                            y: y * TILE_SIZE + TILE_SIZE / 2,
                            score
                        });
                    }
                }
            }

            // Сортируем кандидатов по качеству
            roomCandidates.sort((a, b) => b.score - a.score);

            // В больших комнатах делаем несколько точек спавна
            const roomArea = (room.right - room.left) * (room.bottom - room.top);
            const maxPointsInRoom = roomArea > 80 ? 3 : (roomArea > 40 ? 2 : 1);
            
            const selectedInRoom: any[] = [];
            for (const cand of roomCandidates) {
                if (selectedInRoom.length >= maxPointsInRoom) break;
                
                // Проверка дистанции до уже выбранных точек в этой комнате (минимум 5 клеток)
                const tooClose = selectedInRoom.some(p => Math.hypot(p.gx - cand.gx, p.gy - cand.gy) < 5);
                if (!tooClose) {
                    selectedInRoom.push(cand);
                    points.push({ ...cand, roomId: room.id });
                }
            }
        }
        return points;
    }

    /**
     * Выбирает случайного врага на основе весов из таблицы спавна биома
     */
    public getRandomEnemy(): string {
        const totalWeight = this.spawnTable.enemies.reduce((sum: number, e: any) => sum + e.weight, 0);
        let roll = ROT.RNG.getUniform() * totalWeight;
        
        for (const enemy of this.spawnTable.enemies) {
            roll -= enemy.weight;
            if (roll <= 0) return enemy.id;
        }
        return this.spawnTable.enemies[0].id;
    }

    /**
     * Проверяет минимальное расстояние до существующих объектов
     */
    isDistanceValid(x: number, y: number, objects: { x: number; y: number }[], minDistance: number): boolean {
        const minDistSq = minDistance * minDistance;
        return !objects.some(obj => {
            const dx = x - obj.x;
            const dy = y - obj.y;
            return dx * dx + dy * dy < minDistSq;
        });
    }
}
