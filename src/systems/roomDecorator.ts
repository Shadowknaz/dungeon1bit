import { MAP_COLS, MAP_ROWS } from '../core/constants';

export enum RoomFeature {
    PILLARS = 'pillars',
    WATER_POOL = 'water_pool',
    PARTITION = 'partition'
}

export interface RoomDecorConfig {
    pillarChance: number;
    waterPoolChance: number;
    partitionChance: number;
}

export const DEFAULT_DECOR_CONFIG: RoomDecorConfig = {
    pillarChance: 0.3,
    waterPoolChance: 0.2,
    partitionChance: 0.15
};

export class RoomDecorator {
    /**
     * Decorates rooms with internal features.
     * @returns Recommendations for gameplay elements (like traps at bottlenecks)
     */
    public static decorate(
        grid: number[][],
        rooms: any[],
        rng: { getUniform: () => number },
        config: RoomDecorConfig = DEFAULT_DECOR_CONFIG
    ): { recommendedTraps: { x: number, y: number }[] } {
        for (const room of rooms) {
            const w = room.getRight() - room.getLeft() + 1;
            const h = room.getBottom() - room.getTop() + 1;
            
            if (w < 6 || h < 6) continue;

            const roll = rng.getUniform();
            if (roll < config.pillarChance) {
                this.addPillars(grid, room, rng);
            } else if (roll < config.pillarChance + config.waterPoolChance) {
                this.addWaterPool(grid, room, rng);
            } else if (roll < config.pillarChance + config.waterPoolChance + config.partitionChance) {
                this.addPartition(grid, room, rng);
            }
        }

        return {
            recommendedTraps: this.findBottlenecks(grid, rng)
        };
    }

    private static findBottlenecks(grid: number[][], rng: { getUniform: () => number }): { x: number, y: number }[] {
        const trapPoints: { x: number, y: number }[] = [];

        for (let x = 1; x < MAP_COLS - 1; x++) {
            for (let y = 1; y < MAP_ROWS - 1; y++) {
                if (grid[x][y] === 0) {
                    let neighbors = 0;
                    if (grid[x+1][y] === 0) neighbors++;
                    if (grid[x-1][y] === 0) neighbors++;
                    if (grid[x][y+1] === 0) neighbors++;
                    if (grid[x][y-1] === 0) neighbors++;

                    if (neighbors === 2) {
                        const horizontal = (grid[x+1][y] === 0 && grid[x-1][y] === 0);
                        const vertical = (grid[x][y+1] === 0 && grid[x][y-1] === 0);
                        if ((horizontal || vertical) && rng.getUniform() < 0.15) {
                            trapPoints.push({ x, y });
                        }
                    }
                }
            }
        }
        return trapPoints;
    }

    private static addPillars(grid: number[][], room: any, rng: { getUniform: () => number }): void {
        const left = room.getLeft(), right = room.getRight(), top = room.getTop(), bottom = room.getBottom();
        const w = right - left + 1;
        const h = bottom - top + 1;

        // Pattern 1: Single central pillar (large)
        if (w >= 8 && h >= 8 && rng.getUniform() > 0.5) {
            const cx = Math.floor(left + w / 2);
            const cy = Math.floor(top + h / 2);
            for (let x = cx - 1; x <= cx; x++) {
                for (let y = cy - 1; y <= cy; y++) {
                    grid[x][y] = 1;
                }
            }
        } else {
            // Pattern 2: 4 corner pillars
            const offX = Math.floor(w / 4);
            const offY = Math.floor(h / 4);
            const positions = [
                { x: left + offX, y: top + offY },
                { x: right - offX, y: top + offY },
                { x: left + offX, y: bottom - offY },
                { x: right - offX, y: bottom - offY }
            ];
            for (const pos of positions) {
                grid[pos.x][pos.y] = 1;
            }
        }
    }

    private static addWaterPool(grid: number[][], room: any, rng: { getUniform: () => number }): void {
        const left = room.getLeft(), right = room.getRight(), top = room.getTop(), bottom = room.getBottom();
        const w = right - left + 1;
        const h = bottom - top + 1;

        const poolW = Math.floor(w / 3) + 1;
        const poolH = Math.floor(h / 3) + 1;
        
        const startX = left + 2 + Math.floor(rng.getUniform() * (w - poolW - 4));
        const startY = top + 2 + Math.floor(rng.getUniform() * (h - poolH - 4));

        for (let x = startX; x < startX + poolW; x++) {
            for (let y = startY; y < startY + poolH; y++) {
                // Tile 2 = water (unpassable for now)
                grid[x][y] = 2;
            }
        }
    }

    private static addPartition(grid: number[][], room: any, rng: { getUniform: () => number }): void {
        const left = room.getLeft(), right = room.getRight(), top = room.getTop(), bottom = room.getBottom();
        const w = right - left + 1;
        const h = bottom - top + 1;

        if (w > h) {
            // Vertical partition
            const px = Math.floor(left + w / 2);
            const gapY = top + 1 + Math.floor(rng.getUniform() * (h - 2));
            for (let y = top + 1; y < bottom; y++) {
                if (y !== gapY && y !== gapY + 1) {
                    grid[px][y] = 1;
                }
            }
        } else {
            // Horizontal partition
            const py = Math.floor(top + h / 2);
            const gapX = left + 1 + Math.floor(rng.getUniform() * (w - 2));
            for (let x = left + 1; x < right; x++) {
                if (x !== gapX && x !== gapX + 1) {
                    grid[x][py] = 1;
                }
            }
        }
    }
}
