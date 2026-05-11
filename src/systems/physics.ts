import { Point, Circle, Rect } from '../domain/types';
import { TILE_SIZE, WORLD_WIDTH, WORLD_HEIGHT, MAP_COLS, MAP_ROWS } from '../core/constants';

/**
 * Fast spatial hash for broad-phase collision detection.
 */
export class SpatialHash {
    private grid: Map<number, number[]> = new Map();
    private cellSize: number;

    constructor(cellSize: number = TILE_SIZE * 2) {
        this.cellSize = cellSize;
    }

    clear() {
        this.grid.clear();
    }

    insert(id: number, x: number, y: number) {
        const gx = Math.floor(x / this.cellSize);
        const gy = Math.floor(y / this.cellSize);
        const key = (gx << 16) | (gy & 0xFFFF);
        if (!this.grid.has(key)) this.grid.set(key, []);
        this.grid.get(key)!.push(id);
    }

    query(x: number, y: number, radius: number): number[] {
        const results: number[] = [];
        const x1 = Math.floor((x - radius) / this.cellSize);
        const x2 = Math.floor((x + radius) / this.cellSize);
        const y1 = Math.floor((y - radius) / this.cellSize);
        const y2 = Math.floor((y + radius) / this.cellSize);

        for (let gx = x1; gx <= x2; gx++) {
            for (let gy = y1; gy <= y2; gy++) {
                const key = (gx << 16) | (gy & 0xFFFF);
                const ids = this.grid.get(key);
                if (ids) results.push(...ids);
            }
        }
        return results;
    }
}

export const Utils = {
    dist: (x1: number | Point, y1: number | Point, x2?: number, y2?: number): number => {
        if (typeof x1 === 'object' && typeof y1 === 'object') {
            return Math.hypot(x1.x - y1.x, x1.y - y1.y);
        }
        return Math.hypot((x1 as number) - (x2!), (y1 as number) - (y2!));
    },
    distSq: (a: Point, b: Point): number => (a.x - b.x) ** 2 + (a.y - b.y) ** 2,
    clamp: (val: number, min: number, max: number): number => Math.max(min, Math.min(max, val)),
    lerp: (start: number, end: number, t: number): number => start + (end - start) * t,
    angleDiff: (a: number, b: number): number => {
        const diff = (b - a + Math.PI) % (Math.PI * 2) - Math.PI;
        return diff < -Math.PI ? diff + Math.PI * 2 : diff;
    },
    distToSegment: (p: Point, a: Point, b: Point): number => {
        const l2 = (a.x - b.x) ** 2 + (a.y - b.y) ** 2;
        if (l2 === 0) return Math.hypot(p.x - a.x, p.y - a.y);
        let t = ((p.x - a.x) * (b.x - a.x) + (p.y - a.y) * (b.y - a.y)) / l2;
        t = Math.max(0, Math.min(1, t));
        return Math.hypot(p.x - (a.x + t * (b.x - a.x)), p.y - (a.y + t * (b.y - a.y)));
    }
};

/**
 * Resolves collision between a circle and a rectangle (AABB).
 * Mutates the circle's position to push it out of the rectangle.
 */
export function resolveCollision(circle: Circle, rect: Rect): void {
    let testX = circle.x;
    let testY = circle.y;
    let insideX = false;
    let insideY = false;

    if (circle.x < rect.x) {
        testX = rect.x;
    } else if (circle.x > rect.x + rect.w) {
        testX = rect.x + rect.w;
    } else {
        insideX = true;
    }

    if (circle.y < rect.y) {
        testY = rect.y;
    } else if (circle.y > rect.y + rect.h) {
        testY = rect.y + rect.h;
    } else {
        insideY = true;
    }

    // If the circle center is inside the rectangle
    if (insideX && insideY) {
        const dl = circle.x - rect.x;
        const dr = rect.x + rect.w - circle.x;
        const dt = circle.y - rect.y;
        const db = rect.y + rect.h - circle.y;
        const min = Math.min(dl, dr, dt, db);

        if (min === dl) circle.x = rect.x - circle.radius;
        else if (min === dr) circle.x = rect.x + rect.w + circle.radius;
        else if (min === dt) circle.y = rect.y - circle.radius;
        else if (min === db) circle.y = rect.y + rect.h + circle.radius;
        return;
    }

    const distX = circle.x - testX;
    const distY = circle.y - testY;
    const distance = Math.sqrt(distX * distX + distY * distY);

    if (distance < circle.radius) {
        const overlap = circle.radius - distance;
        if (distance > 0) {
            circle.x += (distX / distance) * overlap;
            circle.y += (distY / distance) * overlap;
        }
    }
}

/**
 * Resolves collision against a grid. Checks 3x3 area around the circle.
 */
export function resolveGridCollision(circle: Circle, grid: number[][]): void {
    const gx = Math.floor(circle.x / TILE_SIZE);
    const gy = Math.floor(circle.y / TILE_SIZE);

    for (let x = gx - 1; x <= gx + 1; x++) {
        for (let y = gy - 1; y <= gy + 1; y++) {
            if (x < 0 || y < 0 || x >= grid.length || (grid[0] && y >= grid[0].length)) continue;

            const tile = grid[x][y];
            // 1: Solid wall, 3: Destructible wall
            if (tile === 1 || tile === 3) {
                resolveCollision(circle, {
                    x: x * TILE_SIZE,
                    y: y * TILE_SIZE,
                    w: TILE_SIZE,
                    h: TILE_SIZE
                });
            }
        }
    }
}

/**
 * Applies separation force between enemies to prevent crowding.
 * Enemies push each other away if they are too close.
 */
export function applyEnemySeparation(enemies: Circle[], _obstacles: Rect[], minDistance: number = 15): void {
    if (enemies.length < 2) return;

    const cellSize = TILE_SIZE * 2;
    const grid: Map<number, number[]> = new Map();

    // 1. Fill spatial grid
    for (let i = 0; i < enemies.length; i++) {
        const e = enemies[i];
        const key = (Math.floor(e.x / cellSize) << 16) | (Math.floor(e.y / cellSize) & 0xFFFF);
        const cell = grid.get(key);
        if (cell) cell.push(i);
        else grid.set(key, [i]);
    }

    // 2. Localized collision check
    for (let i = 0; i < enemies.length; i++) {
        const a = enemies[i];
        const gx = Math.floor(a.x / cellSize);
        const gy = Math.floor(a.y / cellSize);

        for (let dx = -1; dx <= 1; dx++) {
            for (let dy = -1; dy <= 1; dy++) {
                const key = ((gx + dx) << 16) | ((gy + dy) & 0xFFFF);
                const cell = grid.get(key);
                if (!cell) continue;

                for (const j of cell) {
                    if (i >= j) continue;
                    const b = enemies[j];
                    const dxp = a.x - b.x;
                    const dyp = a.y - b.y;
                    const distSq = dxp * dxp + dyp * dyp;
                    const minDist = minDistance + a.radius + b.radius;
                    const minDistSq = minDist * minDist;

                    if (distSq < minDistSq) {
                        if (distSq === 0) {
                            const angle = (i + j) * 0.1; // Deterministic-ish spread
                            const push = minDist * 0.5;
                            a.x += Math.cos(angle) * push;
                            a.y += Math.sin(angle) * push;
                            b.x -= Math.cos(angle) * push;
                            b.y -= Math.sin(angle) * push;
                        } else {
                            const dist = Math.sqrt(distSq);
                            const overlap = minDist - dist;
                            const pushX = (dxp / dist) * overlap * 0.5;
                            const pushY = (dyp / dist) * overlap * 0.5;
                            a.x += pushX; a.y += pushY;
                            b.x -= pushX; b.y -= pushY;
                        }
                    }
                }
            }
        }
    }
}

/**
 * Hard collision resolution between two circles.
 */
export function resolveCircleCollision(a: Circle, b: Circle): void {
    const dx = a.x - b.x;
    const dy = a.y - b.y;
    const distSq = dx * dx + dy * dy;
    const minDist = a.radius + b.radius;
    
    if (distSq < minDist * minDist) {
        if (distSq === 0) {
            a.x += Math.random() - 0.5;
            a.y += Math.random() - 0.5;
            return;
        }
        const dist = Math.sqrt(distSq);
        const overlap = minDist - dist;
        const nx = dx / dist;
        const ny = dy / dist;
        a.x += nx * (overlap * 0.51);
        b.x -= nx * (overlap * 0.51);
        a.y += ny * (overlap * 0.51);
        b.y -= ny * (overlap * 0.51);
    }
}
