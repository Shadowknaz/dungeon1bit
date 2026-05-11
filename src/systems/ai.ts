import { createMachine } from 'xstate';
import * as ROT from 'rot-js';
import { Utils } from './physics';
import { 
    TILE_SIZE, MAP_COLS, MAP_ROWS, ENEMY_BARKS,
    BFS_UPDATE_INTERVAL, AI_VISION_INTERVAL, AI_DIRECT_LOS_RANGE,
    AI_PATH_CACHE_TTL, AI_SAFE_MOVE_RADIUS, AI_PATH_RECALC_INTERVAL,
    AI_ACTIVE_RADIUS_TILES, AI_SEPARATION_RADIUS_TILES, AI_ASTAR_NODE_LIMIT
} from '../core/constants';
import { getMemoryPosition } from './memory';
import { Enemy, Point, Rect, Barrel } from '../domain/types';
import { updateMemory, hasValidMemory, decrementMemoryTimer, updateNoise, decayNoise } from './memory';
import { resolveCircleCollision, resolveCollision, resolveGridCollision, applyEnemySeparation } from './physics';
import { Position, Velocity, ProjectileTag, EnemyProjectileTag } from '../domain/components';
import * as bitECS from 'bitecs';
import { lumen, LightType } from './lumen';
import { PassabilityGrid } from './passabilityGrid';

// ─── B3 Core ──────────────────────────────────────────────────────────────────

export enum B3Status {
    SUCCESS = 1,
    FAILURE = 2,
    RUNNING = 3
}

export interface B3TickData {
    enemy: Enemy;
    canSeePlayer: boolean;
    player: Point;
    obstacles: Rect[];
    isPassable: (x: number, y: number, selfId?: number) => boolean;
    grid: number[][];
    distField?: Int32Array;
}

export abstract class B3Node {
    abstract tick(data: B3TickData): B3Status;
}

/** Runs children sequentially; stops on first FAILURE or RUNNING */
export class B3Sequence extends B3Node {
    constructor(private children: B3Node[]) { super(); }
    tick(data: B3TickData): B3Status {
        for (const child of this.children) {
            const s = child.tick(data);
            if (s !== B3Status.SUCCESS) return s;
        }
        return B3Status.SUCCESS;
    }
}

/** Runs children sequentially; stops on first SUCCESS or RUNNING */
export class B3Selector extends B3Node {
    constructor(private children: B3Node[]) { super(); }
    tick(data: B3TickData): B3Status {
        for (const child of this.children) {
            const s = child.tick(data);
            if (s !== B3Status.FAILURE) return s;
        }
        return B3Status.FAILURE;
    }
}

export class B3Action extends B3Node {
    constructor(private fn: (data: B3TickData) => B3Status) { super(); }
    tick(data: B3TickData): B3Status { return this.fn(data); }
}

export class B3Condition extends B3Node {
    constructor(private fn: (data: B3TickData) => boolean) { super(); }
    tick(data: B3TickData): B3Status {
        return this.fn(data) ? B3Status.SUCCESS : B3Status.FAILURE;
    }
}

// ─── Vision / Raycasting ──────────────────────────────────────────────────────

export function raycastToPlayer(
    start: Point,
    angle: number,
    maxDist: number,
    player: Point,
    isBlocking: (x: number, y: number) => boolean
): boolean {
    const vx = Math.cos(angle);
    const vy = Math.sin(angle);
    const stepSize = 4;
    const steps = Math.floor(maxDist / stepSize);
    const startGx = Math.floor(start.x / TILE_SIZE);
    const startGy = Math.floor(start.y / TILE_SIZE);

    for (let i = 3; i < steps; i++) {
        const px = start.x + vx * i * stepSize;
        const py = start.y + vy * i * stepSize;
        const gx = Math.floor(px / TILE_SIZE);
        const gy = Math.floor(py / TILE_SIZE);
        if ((gx !== startGx || gy !== startGy) && isBlocking(gx, gy)) return false;
        if ((px - player.x) ** 2 + (py - player.y) ** 2 < 400) return true;
    }
    return false;
}

export function checkVisionCone(
    enemy: Enemy,
    player: Point,
    isBlocking: (x: number, y: number) => boolean
): boolean {
    if (!player) return false;
    const fov = Math.PI / 1.8;
    const numRays = 13;
    const enemyAngle = enemy.angle || 0;
    const startAngle = enemyAngle - fov / 2;
    const step = fov / (numRays - 1);
    const maxDist = enemy.detectionRange * 1.4;

    if (Utils.dist(enemy, player) < 60) return true;

    const angleToPlayer = Math.atan2(player.y - enemy.y, player.x - enemy.x);
    if (raycastToPlayer(enemy, angleToPlayer, maxDist, player, isBlocking)) {
        let diff = angleToPlayer - enemyAngle;
        while (diff < -Math.PI) diff += Math.PI * 2;
        while (diff > Math.PI) diff -= Math.PI * 2;
        if (Math.abs(diff) < fov / 2) return true;
    }

    for (let i = 0; i < numRays; i++) {
        if (raycastToPlayer(enemy, startAngle + i * step, maxDist, player, isBlocking)) return true;
    }
    return false;
}

// ─── XState FSM Definition ────────────────────────────────────────────────────

export const enemyMachineDef = createMachine({
    id: 'enemyFSM',
    initial: 'patrol',
    states: {
        sleeping:    { on: { HEARD_NOISE: 'alerting', PLAYER_SPOTTED: 'alerting', STUN: 'stun' } },
        patrol:      { on: { PLAYER_SPOTTED: 'alerting', HEARD_NOISE: 'investigate', START_SLEEPING: 'sleeping', GO_SLEEP: 'sleeping', STUN: 'stun' } },
        investigate: { on: { PLAYER_SPOTTED: 'alerting', REACHED_TARGET: 'patrol', GO_SLEEP: 'sleeping', STUN: 'stun' } },
        alerting:    { on: { ALERT_DONE: 'chase', PLAYER_LOST: 'investigate', STUN: 'stun' } },
        chase:       { on: { PLAYER_LOST: 'investigate', IN_RANGE: 'attack', STUN: 'stun' } },
        attack:      { on: { OUT_OF_RANGE: 'chase', PLAYER_LOST: 'investigate', STUN: 'stun' } },
        stun:        { on: { STUN_DONE: 'investigate' } },
    },
    predictableActionArguments: true
});

// ─── Shared Helpers ───────────────────────────────────────────────────────────

const Helpers = {
    /** Returns speed multiplier based on fluid status */
    getSpeedMult: (e: Enemy): number =>
        (e.status === 'oil' || e.status === 'petroleum') ? 0.5 : 1.0,

    /** A* pathfinding move toward target. Returns true if moved. */
    moveTo: (
        e: Enemy,
        target: Point,
        speedMult: number,
        isPassable: (x: number, y: number, selfId?: number) => boolean,
        distanceField?: Int32Array,
        requestAStar?: () => boolean
    ): boolean => {
        const eSpeed = e.speed * Helpers.getSpeedMult(e) * speedMult;
        const tx = Math.floor(target.x / TILE_SIZE);
        const ty = Math.floor(target.y / TILE_SIZE);
        const ex = Math.floor(e.x / TILE_SIZE);
        const ey = Math.floor(e.y / TILE_SIZE);

        if (tx === ex && ty === ey) return false;

        // Optimization: Distance Field move if target is player and field is available
        const distSq = Utils.distSq(e, target);
        if (distanceField) {
            const idx = ey * MAP_COLS + ex;
            const dist = distanceField[idx];
            
            if (dist !== -1) {
                let bestD = dist;
                let bestMove: {x: number, y: number} | null = null;
                for (let dx = -1; dx <= 1; dx++) {
                    for (let dy = -1; dy <= 1; dy++) {
                        if (dx === 0 && dy === 0) continue;
                        const nx = ex + dx;
                        const ny = ey + dy;
                        if (nx >= 0 && nx < MAP_COLS && ny >= 0 && ny < MAP_ROWS) {
                            const d = distanceField[ny * MAP_COLS + nx];
                            if (d !== -1 && d < bestD) {
                                bestD = d;
                                bestMove = { x: nx, y: ny };
                            }
                        }
                    }
                }
                if (bestMove) {
                    const angle = Math.atan2(
                        bestMove.y * TILE_SIZE + TILE_SIZE / 2 - e.y,
                        bestMove.x * TILE_SIZE + TILE_SIZE / 2 - e.x
                    );
                    Helpers.safeMove(e, angle, eSpeed, isPassable);
                    return true;
                }
            } else if (distSq > AI_DIRECT_LOS_RANGE * AI_DIRECT_LOS_RANGE) {
                // If distance field says -1 (unreachable), don't spam heavy A* if far
                return false; 
            }
        }

        // Optimization: Direct LOS move if close enough
        if (distSq < AI_DIRECT_LOS_RANGE * AI_DIRECT_LOS_RANGE) {
             let hasLOS = true;
             const steps = 5;
             for (let i = 1; i <= steps; i++) {
                 const t = i / steps;
                 const checkX = Math.floor((e.x + (target.x - e.x) * t) / TILE_SIZE);
                 const checkY = Math.floor((e.y + (target.y - e.y) * t) / TILE_SIZE);
                 if (!isPassable(checkX, checkY)) { hasLOS = false; break; }
             }
             if (hasLOS) {
                 const angle = Math.atan2(target.y - e.y, target.x - e.x);
                 Helpers.safeMove(e, angle, eSpeed, isPassable);
                 return true;
             }
        }

        // Path caching logic
        if (e.currentPath && e.currentPath.length > 0 && e.pathTimer && e.pathTimer > 0) {
            e.pathTimer--;
            const pathIndex = e.currentPath.findIndex(p => p.x === ex && p.y === ey);
            if (pathIndex !== -1 && pathIndex < e.currentPath.length - 1) {
                const next = e.currentPath[pathIndex + 1];
                const angle = Math.atan2(
                    next.y * TILE_SIZE + TILE_SIZE / 2 - e.y,
                    next.x * TILE_SIZE + TILE_SIZE / 2 - e.x
                );
                Helpers.safeMove(e, angle, eSpeed, isPassable);
                return true;
            }
        }

        // Limit A* to budget and range
        if (requestAStar && !requestAStar()) return false;

        const astar = new ROT.Path.AStar(tx, ty, (x, y) => isPassable(x, y, e.id), { topology: 8 });
        const path: Point[] = [];
        let nodesExplored = 0;
        astar.compute(ex, ey, (x, y) => {
            nodesExplored++;
            if (nodesExplored < AI_ASTAR_NODE_LIMIT) path.push({ x, y });
        });
        
        if (path.length > 1) {
            e.currentPath = path;
            e.pathTimer = AI_PATH_RECALC_INTERVAL;
            const next = path[1];
            const angle = Math.atan2(
                next.y * TILE_SIZE + TILE_SIZE / 2 - e.y,
                next.x * TILE_SIZE + TILE_SIZE / 2 - e.x
            );
            Helpers.safeMove(e, angle, eSpeed, isPassable);
            return true;
        }

        if (Utils.distSq(e, target) > 25) {
            const angle = Math.atan2(target.y - e.y, target.x - e.x);
            Helpers.safeMove(e, angle, eSpeed * 0.5, isPassable);
            return true;
        }
        return false;
    },

    /** Moves enemy while checking walls and bounds */
    safeMove: (
        e: Enemy, 
        angle: number, 
        dist: number, 
        isPassable: (x: number, y: number, selfId?: number) => boolean
    ): void => {
        const nx = e.x + Math.cos(angle) * dist;
        const ny = e.y + Math.sin(angle) * dist;
        
        // Simple 4-point collision check for the entity radius
        const radius = AI_SAFE_MOVE_RADIUS;
        const points = [[nx-radius, ny], [nx+radius, ny], [nx, ny-radius], [nx, ny+radius]];
        const canMove = points.every(p => isPassable(Math.floor(p[0] / TILE_SIZE), Math.floor(p[1] / TILE_SIZE), e.id));

        if (canMove) {
            e.x = Utils.clamp(nx, TILE_SIZE, (MAP_COLS - 1) * TILE_SIZE);
            e.y = Utils.clamp(ny, TILE_SIZE, (MAP_ROWS - 1) * TILE_SIZE);
            if (!e.noiseLevel || e.noiseLevel < 5) e.angle = angle;
        }
    },

    /** Shooter ranged attack logic */
    handleShooting: (e: Enemy, target: Point, accuracy: number = 1.0): void => {
        const dSq = Utils.distSq(e, target);
        if (dSq < 50000 && dSq > 10000) {
            if (!e.shootTimer) e.shootTimer = 0;
            if (Math.floor(e.shootTimer) % 65 === 0) {
                const jitter = accuracy < 1.0 ? (Math.random() - 0.5) * (1.0 - accuracy) * 0.4 : 0;
                const angle = Math.atan2(target.y - e.y, target.x - e.x) + jitter;
                if (e.onShoot) e.onShoot(e.x, e.y, angle);
            }
            e.shootTimer++;
        } else {
            e.shootTimer = 0;
        }
    },

    /** Smooth angle interpolation toward a target point */
    turnTowards: (e: Enemy, target: Point, speed: number): void => {
        if (!target) return;
        const targetAngle = Math.atan2(target.y - e.y, target.x - e.x);
        let diff = targetAngle - (e.angle || 0);
        while (diff < -Math.PI) diff += Math.PI * 2;
        while (diff > Math.PI) diff -= Math.PI * 2;
        e.angle = Math.abs(diff) < speed
            ? targetAngle
            : (e.angle || 0) + Math.sign(diff) * speed;
    },

    /** Apply grid collision resolution and map boundary clamping. Obstacles handled globally in final pass. */
    postUpdate: (e: Enemy, grid: number[][], _obstacles: Rect[]): void => {
        resolveGridCollision(e, grid);
        // Clamp to map boundaries
        e.x = Utils.clamp(e.x, TILE_SIZE, (MAP_COLS - 1) * TILE_SIZE);
        e.y = Utils.clamp(e.y, TILE_SIZE, (MAP_ROWS - 1) * TILE_SIZE);
    }
};

// ─── Shared Leaf Nodes ────────────────────────────────────────────────────────

const PostUpdateNode = new B3Action((t) => {
    Helpers.postUpdate(t.enemy, (t as any).grid || [], t.obstacles);
    return B3Status.SUCCESS;
});

// ─── Patrol Tree ──────────────────────────────────────────────────────────────

export const patrolTree = new B3Sequence([
    // 1. Compute patrol target based on role
    new B3Action((t) => {
        const e = t.enemy;
        if (e.role === 'guard') return B3Status.SUCCESS;

        if (e.role === 'follower') {
            if (e.leader?.fsm) {
                e.patrolTarget = { x: e.leader.x + e.followOffX, y: e.leader.y + e.followOffY };
            } else {
                e.role = 'wanderer';
            }
        } else if (e.role === 'patroller' && e.patrolPath) {
            let target = e.patrolPath[e.patrolIndex];
            if (target && Utils.dist(e, target) < 20) {
                e.patrolIndex = (e.patrolIndex + 1) % e.patrolPath.length;
                target = e.patrolPath[e.patrolIndex];
            }
            if (target) e.patrolTarget = target;
        } else {
            // Wanderer: pick random nearby target occasionally
            if (!e.patrolTarget || Utils.dist(e, e.patrolTarget) < 20) {
                if (Math.random() < 0.05) {
                    // Try to find a valid nearby floor tile
                    for (let attempt = 0; attempt < 5; attempt++) {
                        const tx = Math.floor(e.x / TILE_SIZE) + Math.floor((Math.random() - 0.5) * 10);
                        const ty = Math.floor(e.y / TILE_SIZE) + Math.floor((Math.random() - 0.5) * 10);
                        if (t.isPassable(tx, ty, e.id)) {
                            e.patrolTarget = {
                                x: tx * TILE_SIZE + TILE_SIZE / 2,
                                y: ty * TILE_SIZE + TILE_SIZE / 2
                            };
                            break;
                        }
                    }
                }
            }
        }
        return B3Status.SUCCESS;
    }),
    // 2. Move toward patrol target using A*
    new B3Action((t) => {
        const e = t.enemy;
        if (e.role === 'guard' || !e.patrolTarget) return B3Status.SUCCESS;
        
        const moved = Helpers.moveTo(e, e.patrolTarget, 0.7, t.isPassable, undefined, (t as any).requestAStar);
        return moved ? B3Status.RUNNING : B3Status.SUCCESS;
    }),
    PostUpdateNode,
]);

// ─── Investigate Tree ─────────────────────────────────────────────────────────

export const investigateTree = new B3Sequence([
    // 1. Check memory — fail if expired (triggers REACHED_TARGET)
    new B3Action((t) => {
        const pos = getMemoryPosition(t.enemy);
        if (!pos) { t.enemy.fsm.send('REACHED_TARGET'); return B3Status.FAILURE; }
        Helpers.turnTowards(t.enemy, pos, 0.1);
        return B3Status.SUCCESS;
    }),
    // 2. Move to last known position (type-specific)
    new B3Selector([
        // Shooter: maintain preferred range while investigating
        new B3Sequence([
            new B3Condition((t) => t.enemy.type === 'shooter'),
            new B3Action((t) => {
                const e = t.enemy;
                const pos = getMemoryPosition(e)!;
                const dSq = Utils.distSq(e, pos);
                if (dSq > 40000) {
                    Helpers.moveTo(e, pos, 0.8, t.isPassable, undefined, (t as any).requestAStar);
                } else if (dSq < 22500) {
                    const angle = Math.atan2(e.y - pos.y, e.x - pos.x);
                    const spd = e.speed * Helpers.getSpeedMult(e);
                    e.x += Math.cos(angle) * spd;
                    e.y += Math.sin(angle) * spd;
                }
                Helpers.handleShooting(e, pos, 0.8);
                if (Utils.distSq(e, pos) < 2500) e.fsm.send('REACHED_TARGET');
                return B3Status.RUNNING;
            }),
        ]),
        // Chaser: direct A* path to memory position
        new B3Action((t) => {
            const e = t.enemy;
            const pos = getMemoryPosition(e)!;
            Helpers.moveTo(e, pos, 0.8, t.isPassable, t.distField, (t as any).requestAStar);
            if (Utils.distSq(e, pos) < 2500) e.fsm.send('REACHED_TARGET');
            return B3Status.RUNNING;
        }),
    ]),
    PostUpdateNode,
]);

// ─── Alerting Tree ────────────────────────────────────────────────────────────

export const alertingTree = new B3Sequence([
    // Stand still, only resolve collisions
    PostUpdateNode,
]);

// ─── Sleeping Tree (Ambush) ───────────────────────────────────────────────────

export const sleepingTree = new B3Sequence([
    // Stand still, do nothing
    PostUpdateNode,
]);

// ─── Stunned Tree ────────────────────────────────────────────────────────────

export const stunTree = new B3Sequence([
    // Stand still, resolve collisions
    PostUpdateNode,
]);

// ─── Combat Nodes (shared by chase + attack) ──────────────────────────────────

const ChaserCombatNode = new B3Action((t) => {
    const e = t.enemy;
    const target: Point = t.canSeePlayer ? t.player : (getMemoryPosition(e) ?? t.player);
    const eSpeed = e.speed * Helpers.getSpeedMult(e);

    // If target is player, use distance field (much faster)
    const isTargetPlayer = target.x === t.player.x && target.y === t.player.y;
    if (isTargetPlayer && t.distField) {
        Helpers.moveTo(e, target, 1.0, t.isPassable, t.distField, (t as any).requestAStar);
        return B3Status.RUNNING;
    }

    // Fallback to A*
    Helpers.moveTo(e, target, 1.0, t.isPassable, undefined, (t as any).requestAStar);
    return B3Status.RUNNING;
});

const ShooterCombatNode = new B3Action((t) => {
    const e = t.enemy;
    const target: Point = t.canSeePlayer ? t.player : (getMemoryPosition(e) ?? t.player);
    const eSpeed = e.speed * Helpers.getSpeedMult(e);
    const dSq = Utils.distSq(e, target);

    if (dSq > 40000) {
        // Approach
        const angle = Math.atan2(target.y - e.y, target.x - e.x);
        e.angle = angle;
        e.x += Math.cos(angle) * eSpeed;
        e.y += Math.sin(angle) * eSpeed;
    } else if (dSq < 22500) {
        // Retreat safely
        const retreatAngle = Math.atan2(e.y - target.y, e.x - target.x);
        e.angle = Math.atan2(target.y - e.y, target.x - e.x);
        Helpers.safeMove(e, retreatAngle, eSpeed, t.isPassable);
    }
    // Always try to shoot when in range
    Helpers.handleShooting(e, target, 1.0);
    return B3Status.RUNNING;
});

// ─── Combat Tree (chase + attack) ─────────────────────────────────────────────

export const combatTree = new B3Sequence([
    // Guard: must have a valid target
    new B3Condition((t) => t.canSeePlayer || getMemoryPosition(t.enemy) !== null),
    // Dispatch by enemy type
    new B3Selector([
        new B3Sequence([
            new B3Condition((t) => t.enemy.type === 'chaser'),
            ChaserCombatNode,
        ]),
        new B3Sequence([
            new B3Condition((t) => t.enemy.type === 'shooter'),
            ShooterCombatNode,
        ]),
    ]),
    PostUpdateNode,
]);

// ─── EnemyActions Dispatcher ──────────────────────────────────────────────────

type EnemyActionFn = (
    e: Enemy,
    canSeePlayer: boolean,
    obstacles: Rect[],
    isPassable: (x: number, y: number, selfId?: number) => boolean,
    player: Point,
    grid: number[][],
    distField?: Int32Array,
    requestAStar?: () => boolean
) => void;

/** Convert a B3 tree into an EnemyAction function */
const fromTree = (tree: B3Node): EnemyActionFn =>
    (e, canSeePlayer, obstacles, isPassable, player, grid, distField, requestAStar) =>
        tree.tick({ enemy: e, canSeePlayer, obstacles, isPassable, player, grid, distField, requestAStar } as any);

/** State-keyed action map — index by FSM state string to get the correct tree tick */
export const EnemyStateActions: Record<string, EnemyActionFn> = {
    sleeping:    fromTree(sleepingTree),
    patrol:      fromTree(patrolTree),
    investigate: fromTree(investigateTree),
    alerting:    fromTree(alertingTree),
    chase:       fromTree(combatTree),
    attack:      fromTree(combatTree),
    stun:        fromTree(stunTree),
};

export const EnemyActions = {
    ...EnemyStateActions,
    turnTowards: Helpers.turnTowards,
};

// ─── AI System (High Level) ──────────────────────────────────────────────────

export interface AIContext {
    world: bitECS.IWorld;
    player: any;
    enemiesMap: Map<number, Enemy>;
    obstacles: Rect[];
    frameCounter: number;
    dungeon: any;
    fluids: any;
    combat: any;
    sfx: any;
    particles: any;
    uiState: any;
    secretDoors: any[];
    secretRoomOpen: boolean;
    secretRoomCells: any[];
    grid: number[][];
    passabilityGrid: PassabilityGrid;
    isPassable: (x: number, y: number) => boolean;
    addFloatingText: (x: number, y: number, t: string, c: string) => void;
    damageEnemy: (eid: number, amount: number) => void;
    restartRoom: () => void;
}

export class AISystem {
    private playerDistanceField: Int32Array;

    constructor() {
        this.playerDistanceField = new Int32Array(MAP_COLS * MAP_ROWS).fill(-1);
    }

    private bfsQueue: Int32Array = new Int32Array(MAP_COLS * MAP_ROWS * 2);

    private updatePlayerDistanceField(ctx: AIContext) {
        const px = Math.floor(ctx.player.x / TILE_SIZE);
        const py = Math.floor(ctx.player.y / TILE_SIZE);
        
        if (px < 0 || px >= MAP_COLS || py < 0 || py >= MAP_ROWS) return;

        this.playerDistanceField.fill(-1);
        
        let head = 0;
        let tail = 0;
        
        this.bfsQueue[tail++] = px;
        this.bfsQueue[tail++] = py;
        this.playerDistanceField[py * MAP_COLS + px] = 0;
        
        const rawPassability = ctx.passabilityGrid.getRaw();

        while (head < tail) {
            const x = this.bfsQueue[head++];
            const y = this.bfsQueue[head++];
            const d = this.playerDistanceField[y * MAP_COLS + x];
            
            for (let dx = -1; dx <= 1; dx++) {
                for (let dy = -1; dy <= 1; dy++) {
                    if (dx === 0 && dy === 0) continue;
                    const nx = x + dx;
                    const ny = y + dy;
                    
                    if (nx >= 0 && nx < MAP_COLS && ny >= 0 && ny < MAP_ROWS) {
                        const idx = ny * MAP_COLS + nx;
                        if (this.playerDistanceField[idx] === -1 && rawPassability[idx] === 1) {
                            this.playerDistanceField[idx] = d + 1;
                            this.bfsQueue[tail++] = nx;
                            this.bfsQueue[tail++] = ny;
                        }
                    }
                }
            }
        }
    }
    
    private astarFrameBudget = 0;

    public update(ctx: AIContext, enemyQuery: any) {
        this.astarFrameBudget = 10; // Max 10 heavy A* per frame
        if (ctx.frameCounter % 8 === 0) { // Update distance field every 8 frames
            this.updatePlayerDistanceField(ctx);
        }
        let inCombat = false;
        const grid = ctx.fluids.getGrid();
        const enemies = enemyQuery(ctx.world);
        
        const isPassableWithEnemies = (gx: number, gy: number, _selfId?: number) => {
            return ctx.isPassable(gx, gy);
        };

        for (let i = 0; i < enemies.length; i++) {
            const eid = enemies[i];
            const e = ctx.enemiesMap.get(eid)!;
            if (!e) continue;

            const playerTileX = Math.floor(ctx.player.x / TILE_SIZE);
            const playerTileY = Math.floor(ctx.player.y / TILE_SIZE);
            const etx = Math.floor(e.x / TILE_SIZE);
            const ety = Math.floor(e.y / TILE_SIZE);
            
            if (Math.abs(etx - playerTileX) + Math.abs(ety - playerTileY) > AI_ACTIVE_RADIUS_TILES) {
                decayNoise(e, 0.1);
                continue;
            }

            if (e.stunTimer > 0) {
                e.stunTimer--;
                if (e.stunTimer <= 0) e.fsm.send('STUN_DONE');
            }
            
            const stateValue = typeof e.fsm.state.value === 'string' 
                ? e.fsm.state.value 
                : Object.keys(e.fsm.state.value)[0];
            const isSleeping = stateValue === 'sleeping';

            // FIXED: Prevent spinning while asleep
            if (!isSleeping && e.noiseLevel > 0 && e.noisePosition) {
                Helpers.turnTowards(e, e.noisePosition, e.noiseLevel > 60 ? 0.12 : 0.04);
            }

            // Vision check (throttled)
            if ((ctx.frameCounter + i) % AI_VISION_INTERVAL === 0) {
                e.lastCanSeePlayer = !isSleeping && checkVisionCone(e, ctx.player, (gx, gy) => {
                    if (gx < 0 || gy < 0 || gx >= MAP_COLS || gy >= MAP_ROWS) return true;
                    if (ctx.dungeon.grid[gx][gy] === 1) {
                        if (!ctx.secretDoors.some(d => d.x === gx && d.y === gy) || !ctx.secretRoomOpen) return true;
                    }
                    return false;
                });
            }

            const canSee = e.lastCanSeePlayer || false;
            this.updateEnemyFSM(e, canSee, ctx);

            if (stateValue === 'chase' || stateValue === 'attack') inCombat = true;

            // Execute B3 Logic
            EnemyStateActions[stateValue]?.(e, canSee, ctx.obstacles, isPassableWithEnemies, ctx.player, ctx.grid, this.playerDistanceField, () => {
                if (this.astarFrameBudget > 0) {
                    this.astarFrameBudget--;
                    return true;
                }
                return false;
            });

            // Barks
            if (e.barkTimer > 0) e.barkTimer--;
            if (e.barkTimer <= 0 && canSee && Math.random() < 0.005) {
                e.barkText = ENEMY_BARKS[Math.floor(Math.random() * ENEMY_BARKS.length)];
                e.barkTimer = 90;
            }

            this.handleEnemyShooting(e, eid, canSee, grid, ctx);

            // Sync back to bitECS
            Position.x[eid] = e.x;
            Position.y[eid] = e.y;
            Velocity.x[eid] = Math.cos(e.angle || 0);
            Velocity.y[eid] = Math.sin(e.angle || 0);

            // Decay noise at the end of update to ensure threshold is reached first
            decayNoise(e, isSleeping ? 0.02 : 0.1);
        }

        const playerTileX = Math.floor(ctx.player.x / TILE_SIZE);
        const playerTileY = Math.floor(ctx.player.y / TILE_SIZE);

        const nearbyEnemies = Array.from(ctx.enemiesMap.values()).filter(e => {
            const etx = Math.floor(e.x / TILE_SIZE);
            const ety = Math.floor(e.y / TILE_SIZE);
            return Math.abs(etx - playerTileX) + Math.abs(ety - playerTileY) <= AI_SEPARATION_RADIUS_TILES;
        });

        applyEnemySeparation(nearbyEnemies, ctx.obstacles, 15);
        return inCombat;
    }

    private updateEnemyFSM(e: Enemy, canSee: boolean, ctx: AIContext) {
        const stateValue = typeof e.fsm.state.value === 'string' 
            ? e.fsm.state.value 
            : Object.keys(e.fsm.state.value)[0];

        if (canSee) {
            updateMemory(e, { x: ctx.player.x, y: ctx.player.y });
            if (stateValue === 'patrol' || stateValue === 'investigate' || stateValue === 'sleeping') {
                e.fsm.send('PLAYER_SPOTTED');
                e.alertTimer = 45;
                ctx.addFloatingText(e.x, e.y - 20, "!", "#f00");
            }
        }

        if (stateValue === 'alerting') {
            e.alertTimer = (e.alertTimer || 0) - 1;
            if (e.alertTimer <= 0) e.fsm.send('ALERT_DONE');
            if (!canSee && !hasValidMemory(e)) e.fsm.send('PLAYER_LOST');
        } else if (canSee) {
            // Spotted
        } else if (e.noiseLevel >= 100) {
            if (stateValue === 'patrol' || stateValue === 'sleeping') e.fsm.send('HEARD_NOISE');
        } else if (hasValidMemory(e)) {
            if (['chase', 'attack'].includes(stateValue)) e.fsm.send('PLAYER_LOST');
            decrementMemoryTimer(e);
        } else if (stateValue !== 'patrol' && stateValue !== 'sleeping') {
            if (e.role === 'ambush') e.fsm.send('GO_SLEEP');
            else e.fsm.send('REACHED_TARGET');
        }

        if (e.role === 'follower' && e.leader && e.leader.fsm) {
            const lState = e.leader.fsm.state.value;
            if (lState !== 'patrol' && e.fsm.state.value === 'patrol') {
                if (e.leader.lastKnownPosition) updateMemory(e, e.leader.lastKnownPosition);
                if (lState === 'investigate') e.fsm.send('HEARD_NOISE');
                else if (['alerting', 'chase', 'attack'].includes(lState as string)) {
                    e.fsm.send('PLAYER_SPOTTED');
                    e.alertTimer = e.leader.alertTimer || 60;
                }
            }
        }

        if (e.type === 'chaser' && canSee) {
            const dSq = Utils.distSq(e, ctx.player);
            if (e.fsm.state.value === 'chase' && (dSq < 6400 || (dSq < 10000 && Math.random() < 0.01))) {
                e.fsm.send('IN_RANGE');
            } else if (e.fsm.state.value === 'attack' && dSq > 14400) {
                e.fsm.send('OUT_OF_RANGE');
            }
        }
    }

    private handleEnemyShooting(e: Enemy, eid: number, canSee: boolean, grid: any, ctx: AIContext) {
        const stateValue = typeof e.fsm.state.value === 'string' 
            ? e.fsm.state.value 
            : Object.keys(e.fsm.state.value)[0];

        if (e.type === 'shooter' && ['chase', 'attack'].includes(stateValue) && canSee && (ctx.frameCounter + eid) % e.shootCooldown! === 0) {
            if (e.status === 'petroleum') {
                ctx.addFloatingText(e.x, e.y - 20, "ИСКРА!", "#f00");
                ctx.sfx.explosion();
                ctx.particles.spawn(e.x, e.y, 60, 2, 5);
                ctx.damageEnemy(eid, e.maxHits);
            } else {
                const px = Math.floor(ctx.player.x / TILE_SIZE);
                const py = Math.floor(ctx.player.y / TILE_SIZE);
                const angle = Math.atan2(ctx.player.y - e.y, ctx.player.x - e.x) + (Math.random() - 0.5) * (grid[px]?.[py]?.steam > 50 ? 0.5 : 0);
                const projs = ctx.combat.spawnProjectiles(e, angle, { projectiles: 1, spreadAngle: 0 }, 0, 0, true, e.projectileSpeed);

                projs.forEach((p: any) => {
                    const peid = bitECS.addEntity(ctx.world);
                    bitECS.addComponent(ctx.world, Position, peid);
                    bitECS.addComponent(ctx.world, Velocity, peid);
                    bitECS.addComponent(ctx.world, ProjectileTag, peid);
                    bitECS.addComponent(ctx.world, EnemyProjectileTag, peid);
                    Position.x[peid] = p.x;
                    Position.y[peid] = p.y;
                    Velocity.x[peid] = p.vx;
                    Velocity.y[peid] = p.vy;
                });

                lumen.addLight({ id: `enemy_muzzle_${eid}_${ctx.frameCounter}`, x: Math.floor(e.x / TILE_SIZE), y: Math.floor(e.y / TILE_SIZE), radius: 2, intensity: 0.6, type: LightType.TEMPORARY, active: true, ttl: 50 });
            }
        }
    }

    public makeNoise(nx: number, ny: number, radius: number, ctx: AIContext, enemyQuery: any) {
        const enemies = enemyQuery(ctx.world);
        for (let i = 0; i < enemies.length; i++) {
            const eid = enemies[i];
            const en = ctx.enemiesMap.get(eid)!;
            if (!en) continue;

            const state = en.fsm.state.value as string;
            if (['patrol', 'investigate', 'sleeping'].includes(state)) {
                const dist = Utils.dist({ x: nx, y: ny }, en);
                if (dist < radius) {
                    const wallCount = this.countWallsBetween(nx, ny, en.x, en.y, ctx.dungeon);
                    const intensity = (1 - dist / radius) * 50 * Math.pow(0.5, wallCount);
                    if (updateNoise(en, intensity)) {
                        en.fsm.send('HEARD_NOISE'); // Wake up immediately
                        en.noisePosition = { x: nx, y: ny };
                        updateMemory(en, { x: nx, y: ny });
                        ctx.addFloatingText(en.x, en.y - 20, "!!!", "#f00");
                    } else if (intensity > 5) {
                        en.noisePosition = { x: nx, y: ny };
                        ctx.addFloatingText(en.x, en.y - 20, "?", "#ff0");
                    }
                }
            }
        }
    }

    private countWallsBetween(x1: number, y1: number, x2: number, y2: number, dungeon: any): number {
        let tx1 = Math.floor(x1 / TILE_SIZE), ty1 = Math.floor(y1 / TILE_SIZE);
        const tx2 = Math.floor(x2 / TILE_SIZE), ty2 = Math.floor(y2 / TILE_SIZE);
        const dx = Math.abs(tx2 - tx1), dy = Math.abs(ty2 - ty1);
        const sx = tx1 < tx2 ? 1 : -1, sy = ty1 < ty2 ? 1 : -1;
        let err = dx - dy, walls = 0;
        while (tx1 !== tx2 || ty1 !== ty2) {
            const e2 = err * 2;
            if (e2 > -dy) { err -= dy; tx1 += sx; }
            if (e2 < dx) { err += dx; ty1 += sy; }
            if (dungeon.grid[tx1]?.[ty1] === 1) walls++;
        }
        return walls;
    }
}
