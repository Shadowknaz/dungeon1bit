import * as ROT from 'rot-js';
import { MAP_COLS, MAP_ROWS, TILE_SIZE, OBJECT_BLOCK_RADIUS_FACTOR } from '../core/constants';
import { generateBSP, BSPRoomAdapter, DEFAULT_BSP_CONFIG, BSPConfig } from './bspGenerator';
import { RoomDecorator } from './roomDecorator';

export interface RoomConfig {
    roomWidth: [number, number];
    roomHeight: [number, number];
    corridorLength: [number, number];
    dugPercentage: number;
}

export class DungeonSystem {
    public grid: number[][] = [];
    public variations: number[][] = [];
    public explored: boolean[][] = [];
    private lastGeneratedRooms: any[] = [];
    public recommendations: { recommendedTraps: { x: number, y: number }[] } = { recommendedTraps: [] };

    constructor() {
        this.reset();
    }

    reset() {
        this.grid = Array.from({ length: MAP_COLS }, () => new Array(MAP_ROWS).fill(1));
        this.variations = Array.from({ length: MAP_COLS }, () => new Array(MAP_ROWS).fill(0));
        this.explored = Array.from({ length: MAP_COLS }, () => new Array(MAP_ROWS).fill(false));
    }



    generate(config: { 
        roomWidth: [number, number], 
        roomHeight: [number, number], 
        corridorLength: [number, number], 
        dugPercentage: number, 
        wallComplexity: number,
        generatorType?: 'digger' | 'uniform' | 'bsp',
        bspConfig?: BSPConfig
    }, typeOverride?: 'digger' | 'uniform' | 'bsp') {
        this.reset();
        
        const type = typeOverride || config.generatorType || 'digger';
        
        let map: any;
        if (type === 'uniform') {
            map = new ROT.Map.Uniform(MAP_COLS, MAP_ROWS - 4, {
                roomWidth: config.roomWidth,
                roomHeight: config.roomHeight,
                roomDugPercentage: 0.9
            });
            map.create((x: number, y: number, value: number) => {
                this.grid[x][y] = value;
            });
            this.lastGeneratedRooms = map.getRooms();
        } else if (type === 'bsp') {
            const bspConfig = { ...DEFAULT_BSP_CONFIG, ...(config.bspConfig || {}) };
            const bspResult = generateBSP(MAP_COLS, MAP_ROWS - 4, bspConfig, ROT.RNG);
            this.grid = bspResult.grid;
            this.lastGeneratedRooms = bspResult.rooms.map(r => new BSPRoomAdapter(r));
        } else {
            map = new ROT.Map.Digger(MAP_COLS, MAP_ROWS - 4, {
                roomWidth: config.roomWidth,
                roomHeight: config.roomHeight,
                corridorLength: config.corridorLength,
                dugPercentage: config.dugPercentage
            });
            map.create((x: number, y: number, value: number) => {
                this.grid[x][y] = value;
            });
            this.lastGeneratedRooms = map.getRooms();
        }

        // Apply room decorations
        this.recommendations = RoomDecorator.decorate(this.grid, this.lastGeneratedRooms, ROT.RNG);

        if (config.wallComplexity > 0 && type !== 'bsp') {
            this.applyWallComplexity(config.wallComplexity);
        }

        if (type !== 'bsp') {
            this.widenCorridors();
        }
        
        this.generateVariations();

        return this.lastGeneratedRooms;
    }

    /**
     * Тайл 3 = разрушаемая стена
     */
    destroyWall(gx: number, gy: number): boolean {
        if (this.grid[gx] && this.grid[gx][gy] === 3) {
            this.grid[gx][gy] = 0;
            return true;
        }
        return false;
    }

    private applyWallComplexity(complexity: number) {
        // Ограничиваем количество итераций для производительности и стабильности
        const iterations = Math.min(complexity, 4);
        
        for (let i = 0; i < iterations; i++) {
            const nextGrid = this.grid.map(row => [...row]);
            
            for (let x = 1; x < MAP_COLS - 1; x++) {
                for (let y = 1; y < MAP_ROWS - 5; y++) {
                    // Проверяем, находится ли клетка внутри или рядом с какой-либо комнатой
                    // Это защищает коридоры от разрушения CA
                    const isInRoomArea = this.lastGeneratedRooms.some(r => 
                        x >= r.getLeft() - 1 && x <= r.getRight() + 1 && 
                        y >= r.getTop() - 1 && y <= r.getBottom() + 1
                    );

                    if (!isInRoomArea) continue;

                    const floorNeighbors = this.countFloorNeighbors(x, y);
                    
                    if (this.grid[x][y] === 1) { // Стена
                        // Эрозия стен: если вокруг много пола, стена может исчезнуть
                        if (floorNeighbors >= 6) nextGrid[x][y] = 0;
                    } else { // Пол
                        // Сглаживание пола: если у пола ОЧЕНЬ мало соседей-пола (изолированная клетка), убираем её
                        // Но если 2-3 соседа, это может быть узкий коридор, его НЕЛЬЗЯ трогать
                        if (floorNeighbors <= 1) nextGrid[x][y] = 1;
                    }
                }
            }
            this.grid = nextGrid;
        }
    }

    private countFloorNeighbors(x: number, y: number): number {
        let count = 0;
        for (let dx = -1; dx <= 1; dx++) {
            for (let dy = -1; dy <= 1; dy++) {
                if (dx === 0 && dy === 0) continue;
                const nx = x + dx, ny = y + dy;
                if (nx >= 0 && nx < MAP_COLS && ny >= 0 && ny < MAP_ROWS && this.grid[nx][ny] === 0) {
                    count++;
                }
            }
        }
        return count;
    }

    private generateVariations() {
        // 1. Сначала заполняем чистым шумом
        for (let x = 0; x < MAP_COLS; x++) {
            for (let y = 0; y < MAP_ROWS; y++) {
                this.variations[x][y] = ROT.RNG.getUniform();
            }
        }

        // 2. Проход "сглаживания" для создания кластеров (clumping)
        // Если у соседа похожее значение, подтягиваем к нему
        const copy = this.variations.map(row => [...row]);
        for (let x = 1; x < MAP_COLS - 1; x++) {
            for (let y = 1; y < MAP_ROWS - 1; y++) {
                let sum = 0;
                let count = 0;
                for (let dx = -1; dx <= 1; dx++) {
                    for (let dy = -1; dy <= 1; dy++) {
                        sum += copy[x + dx][y + dy];
                        count++;
                    }
                }
                // Смешиваем текущее значение с редним по соседям для эффекта пятен
                this.variations[x][y] = (this.variations[x][y] * 0.4) + (sum / count * 0.6);
            }
        }
    }

    private widenCorridors() {
        // Создаем копию сетки для анализа
        const copy = Array.from({ length: MAP_COLS }, (_, x) => [...this.grid[x]]);
        
        for (let x = 1; x < MAP_COLS - 1; x++) {
            for (let y = 1; y < MAP_ROWS - 5; y++) {
                // Если клетка - пол, расширяем её
                if (copy[x][y] === 0) {
                    // Делаем коридоры и проходы толще
                    if (this.grid[x + 1][y] === 1) this.grid[x + 1][y] = 0;
                    if (this.grid[x][y + 1] === 1) this.grid[x][y + 1] = 0;
                }
            }
        }
    }

    getClosestRoom(rooms: any[], targetX: number, targetY: number) {
        return rooms.reduce((closest, room) => {
            let cx = room.getCenter()[0], cy = room.getCenter()[1], dist = Math.hypot(cx - targetX, cy - targetY);
            if (!closest || dist < closest.dist) return { room, dist, cx, cy }; return closest;
        }, null);
    }

    getTopRoom(rooms: any[]) {
        return rooms.reduce((top, room) => (!top || room.getCenter()[1] < top.getCenter()[1]) ? room : top, null);
    }

    computeFOV(
        px: number, py: number,
        range: number,
        angle: number,
        fovHalfAngle: number,
        isPassable: (x: number, y: number) => boolean,
        onVisible: (x: number, y: number) => void
    ) {
        const fov = new ROT.FOV.PreciseShadowcasting(isPassable);
        fov.compute(px, py, range, (x, y, r) => {
            const cellCenterX = x * TILE_SIZE + TILE_SIZE / 2;
            const cellCenterY = y * TILE_SIZE + TILE_SIZE / 2;
            let diff = Math.abs(Math.atan2(cellCenterY - (py * TILE_SIZE + TILE_SIZE/2), cellCenterX - (px * TILE_SIZE + TILE_SIZE/2)) - angle);
            if (diff > Math.PI) diff = 2 * Math.PI - diff;

            if (r <= range / 3 || diff <= fovHalfAngle) {
                onVisible(x, y);
                if (x >= 0 && x < MAP_COLS && y >= 0 && y < MAP_ROWS) {
                    this.explored[x][y] = true;
                }
            }
        });
    }

    isPassable(x: number, y: number, context?: { 
        secretDoors?: {x: number, y: number}[], 
        secretRoomOpen?: boolean,
        startDoor?: any,
        barrels?: any[],
        chests?: any[]
    }): boolean {
        if (x < 0 || y < 0 || x >= MAP_COLS || y >= MAP_ROWS) return false;
        
        // 1. Grid check (fastest)
        if (this.grid[x][y] !== 0) return false;
        
        return true;
    }
}
