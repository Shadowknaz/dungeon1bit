import { MAP_COLS, MAP_ROWS, PASSABILITY_TILE_WALL, PASSABILITY_TILE_DESTRUCTIBLE } from '../core/constants';

/**
 * A highly optimized passability grid that uses a Uint8Array for O(1) lookups.
 * 1 means passable, 0 means blocked.
 */
export class PassabilityGrid {
    private grid: Uint8Array;
    private width: number;
    private height: number;

    constructor(width: number, height: number) {
        this.width = width;
        this.height = height;
        this.grid = new Uint8Array(width * height);
    }

    /**
     * Rebuilds the entire passability cache from the dungeon grid.
     */
    rebuildFromDungeon(dungeonGrid: number[][]): void {
        for (let x = 0; x < this.width; x++) {
            for (let y = 0; y < this.height; y++) {
                const tile = dungeonGrid[x][y];
                // 0 is floor, others are walls/obstacles
                const passable = (tile !== PASSABILITY_TILE_WALL && tile !== PASSABILITY_TILE_DESTRUCTIBLE);
                this.grid[y * this.width + x] = passable ? 1 : 0;
            }
        }
    }

    /**
     * Sets the passability of a specific tile.
     */
    setPassable(x: number, y: number, passable: boolean): void {
        if (x < 0 || x >= this.width || y < 0 || y >= this.height) return;
        this.grid[y * this.width + x] = passable ? 1 : 0;
    }

    /**
     * O(1) check for passability.
     */
    isPassable(x: number, y: number): boolean {
        if (x < 0 || x >= this.width || y < 0 || y >= this.height) return false;
        return this.grid[y * this.width + x] === 1;
    }

    /**
     * Returns the raw Uint8Array for tight loops (e.g., lighting or BFS).
     */
    getRaw(): Uint8Array {
        return this.grid;
    }
}
