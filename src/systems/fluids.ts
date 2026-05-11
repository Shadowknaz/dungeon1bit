import { MAP_COLS, MAP_ROWS, TILE_SIZE } from '../core/constants';
import { ElementType, ELEMENTS_DB } from '../data/registry';

export interface FluidCell {
    type: ElementType | null;
    vol: number; // 0-100
    fire: number;
    steam: number;
}

export class FluidSystem {
    private gridA: (FluidCell | null)[][] = [];
    private gridB: (FluidCell | null)[][] = [];
    private currentGrid: (FluidCell | null)[][] = [];
    private activeCells: Set<number> = new Set(); // Packed as (x << 16) | y
    private MAX_ACTIVE_CELLS = 1200;

    constructor() {
        this.initGrids();
        this.reset();
    }

    private initGrids() {
        this.gridA = Array.from({ length: MAP_COLS }, () => Array.from({ length: MAP_ROWS }, () => null));
        this.gridB = Array.from({ length: MAP_COLS }, () => Array.from({ length: MAP_ROWS }, () => null));
    }

    getGrid() {
        return this.currentGrid;
    }

    reset() {
        for (let x = 0; x < MAP_COLS; x++) {
            for (let y = 0; y < MAP_ROWS; y++) {
                this.gridA[x][y] = null;
                this.gridB[x][y] = null;
            }
        }
        this.currentGrid = this.gridA;
        this.activeCells = new Set();
    }

    private getNextGrid() {
        return this.currentGrid === this.gridA ? this.gridB : this.gridA;
    }

    private swapGrids() {
        this.currentGrid = this.getNextGrid();
    }

    step(passabilityRaw: Uint8Array, mapCols: number, onExplode?: (x: number, y: number) => void) {
        const nextGrid = this.getNextGrid();
        const fireProps = ELEMENTS_DB['fire'];
        const steamProps = ELEMENTS_DB['steam'];
        const newActiveKeys: Set<number> = new Set();

        // 1. Prepare next grid: Only clear what was active or will be active
        // But for simplicity and safety, we can just null out the target cells 
        // as we process them or clear the whole grid if small enough.
        // Given we have a fixed size, we just null out as needed.
        
        // Actually, let's clear the nextGrid positions that were active in currentGrid
        for (const packed of this.activeCells) {
            const x = packed >> 16, y = packed & 0xFFFF;
            if (nextGrid[x] && nextGrid[x][y]) nextGrid[x][y] = null;
        }

        // 2. Process active cells
        for (const packed of this.activeCells) {
            const x = packed >> 16;
            const y = packed & 0xFFFF;
            const cell = this.currentGrid[x][y];
            if (!cell) continue;

            // Initialize next state
            if (!nextGrid[x][y]) {
                nextGrid[x][y] = { type: cell.type, vol: cell.vol, fire: cell.fire, steam: cell.steam };
            } else {
                const n = nextGrid[x][y]!;
                n.type = cell.type; n.vol = cell.vol; n.fire = cell.fire; n.steam = cell.steam;
            }
            const nCell = nextGrid[x][y]!;

            // --- Simulation Logic (Same as before but optimized) ---
            
            // Steam
            if (cell.steam > 0) {
                nCell.steam -= steamProps.decayRate;
                const nx = [x+1, x-1, x, x];
                const ny = [y, y, y+1, y-1];
                for(let i=0; i<4; i++) {
                    if (nx[i] >= 0 && nx[i] < mapCols && ny[i] >= 0 && ny[i] < MAP_ROWS && passabilityRaw[ny[i] * mapCols + nx[i]] === 1) {
                        if (!nextGrid[nx[i]][ny[i]]) nextGrid[nx[i]][ny[i]] = { type: null, vol: 0, fire: 0, steam: 0 };
                        const target = nextGrid[nx[i]][ny[i]]!;
                        if (target.steam < cell.steam - 5) {
                            target.steam += 3;
                            newActiveKeys.add((nx[i] << 16) | ny[i]);
                        }
                    }
                }
            }

            // Fire
            if (cell.fire > 0) {
                nCell.fire -= fireProps.decayRate;
                if (cell.vol > 0) nCell.vol -= 2;

                const nx = [x+1, x-1, x, x];
                const ny = [y, y, y+1, y-1];
                for(let i=0; i<4; i++) {
                    if (nx[i] >= 0 && nx[i] < mapCols && ny[i] >= 0 && ny[i] < MAP_ROWS && passabilityRaw[ny[i] * mapCols + nx[i]] === 1) {
                        const target = this.currentGrid[nx[i]][ny[i]];
                        if (target) {
                            if (target.type === 'water' && target.vol > 10) {
                                if (!nextGrid[nx[i]][ny[i]]) nextGrid[nx[i]][ny[i]] = { ...target };
                                const nt = nextGrid[nx[i]][ny[i]]!;
                                nt.vol -= 15;
                                nt.steam = Math.min(100, nt.steam + 50);
                                nCell.fire = 0;
                                newActiveKeys.add((nx[i] << 16) | ny[i]);
                            } else if (target.type && ELEMENTS_DB[target.type].isFlammable && target.vol > 5 && target.fire <= 0) {
                                if (!nextGrid[nx[i]][ny[i]]) nextGrid[nx[i]][ny[i]] = { ...target };
                                nextGrid[nx[i]][ny[i]]!.fire = ELEMENTS_DB[target.type].fireDuration;
                                onExplode?.(nx[i] * TILE_SIZE, ny[i] * TILE_SIZE);
                                newActiveKeys.add((nx[i] << 16) | ny[i]);
                            }
                        }
                    }
                }
            }

            // Liquids
            if (cell.vol > 1.0 && cell.type && cell.type !== 'fire' && cell.type !== 'steam') {
                const props = ELEMENTS_DB[cell.type];
                nCell.vol -= props.decayRate;

                const nx = [x+1, x-1, x, x, x+1, x-1, x+1, x-1];
                const ny = [y, y, y+1, y-1, y+1, y+1, y-1, y-1];

                for (let i = 0; i < 8; i++) {
                    const tx = nx[i], ty = ny[i];
                    if (tx < 0 || tx >= mapCols || ty < 0 || ty >= MAP_ROWS || passabilityRaw[ty * mapCols + tx] === 0) continue;

                    const nGridCell = this.currentGrid[tx][ty];
                    const nVol = nGridCell ? nGridCell.vol : 0;
                    
                    if (cell.vol > nVol + 5) {
                        const diff = cell.vol - nVol;
                        const flowMult = i < 4 ? 0.2 : 0.1;
                        let flow = diff * flowMult;
                        const actualFlow = flow - (flow * props.viscosity);

                        nCell.vol -= flow;
                        
                        if (!nextGrid[tx][ty]) nextGrid[tx][ty] = { type: cell.type, vol: 0, fire: 0, steam: 0 };
                        const target = nextGrid[tx][ty]!;

                        if (target.type && target.type !== cell.type && target.vol > 10) {
                            if ((target.type === 'water' && cell.type === 'oil') || (target.type === 'oil' && cell.type === 'water')) {
                                target.type = 'petroleum';
                            }
                        } else if (!target.type || target.vol < 5) {
                            target.type = cell.type;
                        }

                        target.vol += actualFlow;
                        newActiveKeys.add((tx << 16) | ty);
                    }
                }
            }

            if (nCell.vol > 0.5 || nCell.fire > 0 || nCell.steam > 0) {
                newActiveKeys.add(packed);
            } else {
                nextGrid[x][y] = null;
            }
        }

        this.swapGrids();
        
        // Capping active cells for performance
        if (newActiveKeys.size > this.MAX_ACTIVE_CELLS) {
            const limited = Array.from(newActiveKeys).slice(0, this.MAX_ACTIVE_CELLS);
            this.activeCells = new Set(limited);
        } else {
            this.activeCells = newActiveKeys;
        }
    }

    spill(x: number, y: number, type: ElementType, amount: number, passabilityRaw: Uint8Array, mapCols: number) {
        const gx = Math.floor(x / TILE_SIZE), gy = Math.floor(y / TILE_SIZE);
        if (gx >= 0 && gx < mapCols && gy >= 0 && gy < MAP_ROWS && passabilityRaw[gy * mapCols + gx] === 1) {
            if (!this.currentGrid[gx][gy]) this.currentGrid[gx][gy] = { type, vol: 0, fire: 0, steam: 0 };
            const c = this.currentGrid[gx][gy]!;
            c.type = type;
            c.vol = Math.min(100, c.vol + amount);
            
            if (amount > 100) {
                for(let dx = -1; dx <= 1; dx++) {
                    for(let dy = -1; dy <= 1; dy++) {
                        if (dx === 0 && dy === 0) continue;
                        const nx = gx + dx, ny = gy + dy;
                        if (nx >= 0 && nx < mapCols && ny >= 0 && ny < MAP_ROWS && passabilityRaw[ny * mapCols + nx] === 1) {
                            if (!this.currentGrid[nx][ny]) this.currentGrid[nx][ny] = { type, vol: 0, fire: 0, steam: 0 };
                            this.currentGrid[nx][ny]!.type = type;
                            this.currentGrid[nx][ny]!.vol += amount / 8;
                            this.addActive(nx, ny);
                        }
                    }
                }
            }
            this.addActive(gx, gy);
        }
    }

    private addActive(x: number, y: number) {
        this.activeCells.add((x << 16) | y);
    }

    ignite(gx: number, gy: number, onExplode?: (x: number, y: number) => void) {
        if (this.currentGrid[gx] && this.currentGrid[gx][gy]) {
            const cell = this.currentGrid[gx][gy]!;
            if (cell.type && ELEMENTS_DB[cell.type].isFlammable) {
                cell.fire = ELEMENTS_DB[cell.type].fireDuration || 600;
                onExplode?.(gx * TILE_SIZE, gy * TILE_SIZE);
                this.addActive(gx, gy);
            }
        }
    }

    /**
     * Update dynamic lights from active fire cells with viewport culling
     */
    updateLighting(lumen: any, lightType: any, bounds: {startX: number, endX: number, startY: number, endY: number}) {
        const FIRE_LIGHT_RADIUS = 3;
        const FIRE_LIGHT_INTENSITY_BASE = 0.35;
        const FIRE_LIGHT_INTENSITY_MAX = 0.9;
        const FIRE_LIGHT_DIVISOR = 200;
        const FIRE_LIGHT_TTL = 120;

        for (const packed of this.activeCells) {
            const x = packed >> 16, y = packed & 0xFFFF;
            
            // Viewport culling for fire lights
            if (x < bounds.startX - FIRE_LIGHT_RADIUS || x > bounds.endX + FIRE_LIGHT_RADIUS ||
                y < bounds.startY - FIRE_LIGHT_RADIUS || y > bounds.endY + FIRE_LIGHT_RADIUS) {
                continue;
            }

            const cell = this.currentGrid[x][y];
            if (cell && cell.fire > 0) {
                lumen.addLight({ 
                    id: `fire_${x}_${y}`, x, y, 
                    radius: FIRE_LIGHT_RADIUS, 
                    intensity: Math.min(FIRE_LIGHT_INTENSITY_MAX, FIRE_LIGHT_INTENSITY_BASE + cell.fire / FIRE_LIGHT_DIVISOR), 
                    type: lightType, active: true, ttl: FIRE_LIGHT_TTL 
                });
            }
        }
    }
}
