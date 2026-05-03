import { MAP_COLS, MAP_ROWS, TILE_SIZE } from '../core/constants';
import { ElementType, ELEMENTS_DB } from '../data/elements';

export interface FluidCell {
    type: ElementType | null;
    vol: number; // 0-100
    fire: number;
    steam: number;
}

export class FluidSystem {
    public grid: (FluidCell | null)[][] = [];
    private activeCells: {x: number, y: number}[] = [];
    private MAX_ACTIVE_CELLS = 800;

    constructor() {
        this.reset();
    }

    getGrid() {
        return this.grid;
    }

    reset() {
        this.grid = Array.from({ length: MAP_COLS }, () => Array(MAP_ROWS).fill(null));
        this.activeCells = [];
    }

    step(isPassable: (x: number, y: number) => boolean, onExplode?: (x: number, y: number) => void) {
        const nextGrid: (FluidCell | null)[][] = Array.from({ length: MAP_COLS }, () => Array(MAP_ROWS).fill(null));

        // Copy current state
        for (const pos of this.activeCells) {
            if (this.grid[pos.x][pos.y]) {
                nextGrid[pos.x][pos.y] = { ...this.grid[pos.x][pos.y]! };
            }
        }

        const newActiveCells: Set<string> = new Set();
        const fireProps = ELEMENTS_DB['fire'];
        const steamProps = ELEMENTS_DB['steam'];

        // Process active cells
        for (const pos of this.activeCells) {
            const {x, y} = pos;
            const cell = this.grid[x][y];
            if (!cell) continue;

            const nCell = nextGrid[x][y]!;

            // 1. Steam Simulation
            if (cell.steam > 0) {
                nCell.steam -= steamProps.decayRate;
                const neighbors = [{x: x + 1, y: y}, {x: x - 1, y: y}, {x: x, y: y + 1}, {x: x, y: y - 1}];
                neighbors.forEach(n => {
                    if (isPassable(n.x, n.y)) {
                        if (!nextGrid[n.x][n.y]) nextGrid[n.x][n.y] = { type: null, vol: 0, fire: 0, steam: 0 };
                        if (nextGrid[n.x][n.y]!.steam < cell.steam - 5) {
                            nextGrid[n.x][n.y]!.steam += 3;
                            newActiveCells.add(`${n.x},${n.y}`);
                        }
                    }
                });
            }

            // 2. Fire Simulation
            if (cell.fire > 0) {
                nCell.fire -= fireProps.decayRate;
                if (cell.vol > 0) nCell.vol -= 2; // Fire consumes fuel

                const neighbors = [{x: x + 1, y: y}, {x: x - 1, y: y}, {x: x, y: y + 1}, {x: x, y: y - 1}];
                neighbors.forEach(n => {
                    if (isPassable(n.x, n.y)) {
                        const target = this.grid[n.x][n.y];
                        if (target) {
                            // Extinguish by water
                            if (target.type === 'water' && target.vol > 10) {
                                if (!nextGrid[n.x][n.y]) nextGrid[n.x][n.y] = { ...target };
                                nextGrid[n.x][n.y]!.vol -= 15;
                                nextGrid[n.x][n.y]!.steam = Math.min(100, (nextGrid[n.x][n.y]!.steam || 0) + 50);
                                nCell.fire = 0;
                                newActiveCells.add(`${n.x},${n.y}`);
                            } 
                            // Ignite flammable
                            else if (target.type && ELEMENTS_DB[target.type].isFlammable && target.vol > 5 && target.fire <= 0) {
                                if (!nextGrid[n.x][n.y]) nextGrid[n.x][n.y] = { ...target };
                                nextGrid[n.x][n.y]!.fire = ELEMENTS_DB[target.type].fireDuration;
                                onExplode?.(n.x * TILE_SIZE, n.y * TILE_SIZE);
                                newActiveCells.add(`${n.x},${n.y}`);
                            }
                        }
                    }
                });
            }

            // 3. Pressure + Diffusion Flow (Liquids)
            if (cell.vol > 1.0 && cell.type && cell.type !== 'fire' && cell.type !== 'steam') {
                const props = ELEMENTS_DB[cell.type];
                
                // Evaporation/Absorption
                nCell.vol -= props.decayRate;

                // Flow to neighbors
                const neighbors = [
                    {x: x + 1, y: y}, {x: x - 1, y: y}, {x: x, y: y + 1}, {x: x, y: y - 1}, // Cardinal
                    {x: x + 1, y: y + 1}, {x: x - 1, y: y + 1}, {x: x + 1, y: y - 1}, {x: x - 1, y: y - 1} // Diagonal
                ];

                for (let i = 0; i < neighbors.length; i++) {
                    const n = neighbors[i];
                    if (!isPassable(n.x, n.y)) continue;

                    const nGridCell = this.grid[n.x][n.y];
                    const nVol = nGridCell ? nGridCell.vol : 0;
                    
                    // Pressure difference check
                    if (cell.vol > nVol + 5) {
                        const diff = cell.vol - nVol;
                        // Cardinal flows more than diagonal
                        const flowMult = i < 4 ? 0.2 : 0.1;
                        let flow = diff * flowMult;
                        
                        // Viscosity loss
                        const loss = flow * props.viscosity;
                        const actualFlow = flow - loss;

                        nCell.vol -= flow;
                        
                        if (!nextGrid[n.x][n.y]) nextGrid[n.x][n.y] = { type: cell.type, vol: 0, fire: 0, steam: 0 };
                        const target = nextGrid[n.x][n.y]!;

                        // Mixing logic (Water + Oil = Petroleum)
                        if (target.type && target.type !== cell.type && target.vol > 10) {
                            if ((target.type === 'water' && cell.type === 'oil') || (target.type === 'oil' && cell.type === 'water')) {
                                target.type = 'petroleum';
                            }
                        } else if (!target.type || target.vol < 5) {
                            target.type = cell.type;
                        }

                        target.vol += actualFlow;
                        newActiveCells.add(`${n.x},${n.y}`);
                    }
                }
            }

            // Keep cell active if it still has substance
            if (nCell.vol > 0.5 || nCell.fire > 0 || nCell.steam > 0) {
                newActiveCells.add(`${x},${y}`);
            } else {
                nextGrid[x][y] = null;
            }
        }

        // Limit active cells for performance
        this.grid = nextGrid;
        this.activeCells = Array.from(newActiveCells)
            .map(s => { const [x, y] = s.split(',').map(Number); return {x, y}; })
            .slice(0, this.MAX_ACTIVE_CELLS);
    }

    spill(x: number, y: number, type: ElementType, amount: number, isPassable: (x: number, y: number) => boolean) {
        const gx = Math.floor(x / TILE_SIZE);
        const gy = Math.floor(y / TILE_SIZE);
        if (gx >= 0 && gx < MAP_COLS && gy >= 0 && gy < MAP_ROWS && isPassable(gx, gy)) {
            if (!this.grid[gx][gy]) this.grid[gx][gy] = { type, vol: 0, fire: 0, steam: 0 };
            this.grid[gx][gy]!.type = type;
            this.grid[gx][gy]!.vol = Math.min(100, this.grid[gx][gy]!.vol + amount);
            
            // Initial burst spread
            if (amount > 100) {
                const spreadRadius = 1;
                for(let dx = -spreadRadius; dx <= spreadRadius; dx++) {
                    for(let dy = -spreadRadius; dy <= spreadRadius; dy++) {
                        if (dx === 0 && dy === 0) continue;
                        const nx = gx + dx, ny = gy + dy;
                        if (nx >= 0 && nx < MAP_COLS && ny >= 0 && ny < MAP_ROWS && isPassable(nx, ny)) {
                            if (!this.grid[nx][ny]) this.grid[nx][ny] = { type, vol: 0, fire: 0, steam: 0 };
                            this.grid[nx][ny]!.type = type;
                            this.grid[nx][ny]!.vol += amount / 8;
                            this.addActive(nx, ny);
                        }
                    }
                }
            }
            this.addActive(gx, gy);
        }
    }

    private addActive(x: number, y: number) {
        if (!this.activeCells.some(c => c.x === x && c.y === y)) {
            this.activeCells.push({x, y});
        }
    }

    ignite(gx: number, gy: number, onExplode?: (x: number, y: number) => void) {
        if (this.grid[gx] && this.grid[gx][gy]) {
            const type = this.grid[gx][gy]!.type;
            if (type && ELEMENTS_DB[type].isFlammable) {
                this.grid[gx][gy]!.fire = ELEMENTS_DB[type].fireDuration || 600;
                onExplode?.(gx * TILE_SIZE, gy * TILE_SIZE);
                this.addActive(gx, gy);
            }
        }
    }
}
