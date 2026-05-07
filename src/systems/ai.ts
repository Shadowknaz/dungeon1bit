import { createMachine } from 'xstate';
import * as ROT from 'rot-js';
import { Utils, Point, resolveCollision, applyEnemySeparation } from './physics';
import { TILE_SIZE, ENEMY_BARKS } from '../core/constants';
import { updateMemory, decrementMemoryTimer, hasValidMemory, getMemoryPosition } from './memory';
import { Enemy } from '../types';

/**
 * Physical raycast to check if player is visible
 */
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
    
    // Start with a small offset to avoid self-collision with the tile the enemy is standing on
    for (let i = 1; i < steps; i++) {
        const px = start.x + vx * i * stepSize;
        const py = start.y + vy * i * stepSize;
        const gx = Math.floor(px / TILE_SIZE);
        const gy = Math.floor(py / TILE_SIZE);
        
        if (isBlocking(gx, gy)) return false;

        // Check distance to player center and edges for better reliability
        const dx = px - player.x;
        const dy = py - player.y;
        const distSq = dx*dx + dy*dy;
        
        // hit if within player radius (approx 10px) + some leeway
        if (distSq < 144) return true; // 12px radius check
    }
    return false;
}

/**
 * Check visibility within a cone using raycasting
 */
export function checkVisionCone(
    enemy: Enemy, 
    player: Point,
    isBlocking: (x: number, y: number) => boolean
): boolean {
    if (!player) return false;
    
    const fov = Math.PI / 2.2; // slightly wider FOV
    const numRays = 13; // Increased ray density
    const enemyAngle = enemy.angle || 0;
    const startAngle = enemyAngle - fov / 2;
    const step = fov / (numRays - 1);
    const maxDist = enemy.detectionRange * 1.3;

    // 1. Check fixed cone rays
    for (let i = 0; i < numRays; i++) {
        if (raycastToPlayer(enemy, startAngle + i * step, maxDist, player, isBlocking)) {
            return true;
        }
    }

    // 2. Extra reliability: cast rays specifically at player center and edges 
    // if they are within the vision cone
    const angleToPlayer = Math.atan2(player.y - enemy.y, player.x - enemy.x);
    let diff = angleToPlayer - enemyAngle;
    while (diff < -Math.PI) diff += Math.PI * 2;
    while (diff > Math.PI) diff -= Math.PI * 2;

    if (Math.abs(diff) < fov / 1.8) {
        // Center
        if (raycastToPlayer(enemy, angleToPlayer, maxDist, player, isBlocking)) return true;
        
        // Edges (offset by approx player radius)
        const distToPlayer = Utils.dist(enemy, player);
        if (distToPlayer > 0) {
            const edgeOffset = Math.atan2(10, distToPlayer);
            if (raycastToPlayer(enemy, angleToPlayer - edgeOffset, maxDist, player, isBlocking)) return true;
            if (raycastToPlayer(enemy, angleToPlayer + edgeOffset, maxDist, player, isBlocking)) return true;
        }
    }

    return false;
}

export enum B3Status {
    SUCCESS = 1,
    FAILURE = 2,
    RUNNING = 3
}

export interface B3TickData {
    enemy: Enemy;
}

export abstract class B3Node {
    abstract tick(tickData: B3TickData): B3Status;
}

export class B3Sequence extends B3Node {
    constructor(private children: B3Node[]) {
        super();
    }
    tick(tickData: B3TickData): B3Status {
        for (const child of this.children) {
            const status = child.tick(tickData);
            if (status !== B3Status.SUCCESS) return status;
        }
        return B3Status.SUCCESS;
    }
}

export class B3Action extends B3Node {
    constructor(private actionFn: (tickData: B3TickData) => B3Status) {
        super();
    }
    tick(tickData: B3TickData): B3Status {
        return this.actionFn(tickData);
    }
}

// Concrete Patrol Tree
export const patrolTree = new B3Sequence([
    new B3Action((t) => {
        const e = t.enemy;
        if (e.role === 'guard') return B3Status.SUCCESS;
        if (e.role === 'follower') {
            if (e.leader && e.leader.fsm) {
                e.patrolTarget = { x: e.leader.x + e.followOffX, y: e.leader.y + e.followOffY };
            } else {
                e.role = 'wanderer';
            }
        } else if (e.role === 'patroller' && e.patrolPath) {
            let target = e.patrolPath[e.patrolIndex];
            if (Utils.dist(e, target) < 20) {
                e.patrolIndex = (e.patrolIndex + 1) % e.patrolPath.length;
                target = e.patrolPath[e.patrolIndex];
            }
            e.patrolTarget = target;
        } else {
            if (!e.patrolTarget || Utils.dist(e, e.patrolTarget) < 10) {
                if (Math.random() < 0.05) {
                    e.patrolTarget = {
                        x: e.x + (Math.random() - 0.5) * 100,
                        y: e.y + (Math.random() - 0.5) * 100
                    };
                }
            }
        }
        return B3Status.SUCCESS;
    }),
    new B3Action((t) => {
        const e = t.enemy;
        if (e.role === 'guard' || !e.patrolTarget) return B3Status.SUCCESS;
        const angle = Math.atan2(e.patrolTarget.y - e.y, e.patrolTarget.x - e.x);
        const eSpeed = e.speed * (e.status === 'oiled' || e.status === 'petroleum' ? 0.5 : 1.0);
        // Only update angle if NOT distracted by noise
        if (!e.noiseLevel || e.noiseLevel < 5) {
            e.angle = angle;
        }
        e.x += Math.cos(angle) * (eSpeed * 0.4);
        e.y += Math.sin(angle) * (eSpeed * 0.4);
        return B3Status.RUNNING;
    })
]);

// XState Machine Definition
export const enemyMachineDef = createMachine({
    id: 'enemyFSM',
    initial: 'patrol',
    states: {
        patrol: {
            on: {
                PLAYER_SPOTTED: 'alerting',
                HEARD_NOISE: 'investigate'
            }
        },
        investigate: {
            on: {
                PLAYER_SPOTTED: 'alerting',
                REACHED_TARGET: 'patrol'
            }
        },
        alerting: {
            on: {
                ALERT_DONE: 'chase',
                PLAYER_LOST: 'investigate'
            }
        },
        chase: {
            on: {
                PLAYER_LOST: 'investigate',
                IN_RANGE: 'attack'
            }
        },
        attack: {
            on: {
                OUT_OF_RANGE: 'chase',
                PLAYER_LOST: 'investigate'
            }
        }
    }
});

/**
 * Common helpers to reduce redundancy
 */
const Helpers = {
    moveTo: (e: Enemy, target: Point, speedMult: number, isPassable: (x: number, y: number) => boolean) => {
        const eSpeed = e.speed * (e.status === 'oiled' || e.status === 'petroleum' ? 0.5 : 1.0) * speedMult;
        const targetTileX = Math.floor(target.x / TILE_SIZE);
        const targetTileY = Math.floor(target.y / TILE_SIZE);
        const astar = new ROT.Path.AStar(targetTileX, targetTileY, isPassable);
        const path: Point[] = [];
        astar.compute(Math.floor(e.x/TILE_SIZE), Math.floor(e.y/TILE_SIZE), (x, y) => path.push({x, y}));
        
        if (path.length > 1) {
            const angle = Math.atan2(path[1].y * TILE_SIZE + TILE_SIZE / 2 - e.y, path[1].x * TILE_SIZE + TILE_SIZE / 2 - e.x);
            e.angle = angle; // Set enemy facing direction
            e.x += Math.cos(angle) * eSpeed; e.y += Math.sin(angle) * eSpeed;
            return true;
        } else {
            // Precise move to world target if on the same tile
            const dSq = Utils.distSq(e, target);
            if (dSq > 25) {
                const angle = Math.atan2(target.y - e.y, target.x - e.x);
                e.angle = angle; // Set enemy facing direction
                e.x += Math.cos(angle) * (eSpeed * 0.5); e.y += Math.sin(angle) * (eSpeed * 0.5);
                return true;
            }
        }
        return false;
    },
    handleShooting: (e: Enemy, target: Point, accuracy: number = 1.0) => {
        const dSq = Utils.distSq(e, target);
        if (dSq < 50000 && dSq > 10000) { 
            if (Math.floor(e.shootTimer || 0) % 65 === 0) {
                const jitter = accuracy < 1.0 ? (Math.random() - 0.5) * (1.0 - accuracy) * 0.4 : 0;
                const angle = Math.atan2(target.y - e.y, target.x - e.x) + jitter;
                if (e.onShoot) e.onShoot(e.x, e.y, angle);
            }
            if (!e.shootTimer) e.shootTimer = 0;
            e.shootTimer++;
        } else {
            e.shootTimer = 0;
        }
    },
    postUpdate: (e: Enemy, obstacles: any[], enemies: Enemy[]) => {
        obstacles.forEach(obs => resolveCollision(e, obs));
        applyEnemySeparation(enemies, 20);
    },
    turnTowards: (e: Enemy, target: Point, speed: number) => {
        if (!target) return;
        const targetAngle = Math.atan2(target.y - e.y, target.x - e.x);
        let diff = targetAngle - (e.angle || 0);
        while (diff < -Math.PI) diff += Math.PI * 2;
        while (diff > Math.PI) diff -= Math.PI * 2;
        
        // Interpolate toward target angle
        const step = speed;
        if (Math.abs(diff) < step) {
            e.angle = targetAngle;
        } else {
            e.angle = (e.angle || 0) + Math.sign(diff) * step;
        }
    }
};

export const EnemyActions = {
    patrol: (e: Enemy, canSeePlayer: boolean, obstacles: any[], isPassable: (x: number, y: number) => boolean, player: any, enemies: Enemy[]) => {
        patrolTree.tick({ enemy: e });
        Helpers.postUpdate(e, obstacles, enemies);
    },
    investigate: (e: Enemy, canSeePlayer: boolean, obstacles: any[], isPassable: (x: number, y: number) => boolean, player: any, enemies: Enemy[]) => {
        const memoryPos = getMemoryPosition(e);
        if (!memoryPos) {
            e.fsm.send('REACHED_TARGET');
            return;
        }
        
        // Face movement direction smoothly
        Helpers.turnTowards(e, memoryPos, 0.1);
        
        if (e.type === 'shooter') {
            const dSq = Utils.distSq(e, memoryPos);
            if (dSq > 40000) {
                Helpers.moveTo(e, memoryPos, 0.8, isPassable);
            } else if (dSq < 22500) {
                const angle = Math.atan2(e.y - memoryPos.y, e.x - memoryPos.x);
                const eSpeed = e.speed * (e.status === 'oiled' || e.status === 'petroleum' ? 0.5 : 1.0);
                e.x += Math.cos(angle) * eSpeed; e.y += Math.sin(angle) * eSpeed;
            }
            Helpers.handleShooting(e, memoryPos, 0.8);
        } else {
            Helpers.moveTo(e, memoryPos, 0.7, isPassable);
        }

        if (Utils.distSq(e, memoryPos) < 2500) {
            e.fsm.send('REACHED_TARGET');
        }

        Helpers.postUpdate(e, obstacles, enemies);
    },
    chase: (e: Enemy, canSeePlayer: boolean, obstacles: any[], isPassable: (x: number, y: number) => boolean, player: any, enemies: Enemy[]) => {
        EnemyActions.combatMove(e, canSeePlayer, obstacles, isPassable, player, enemies);
    },
    attack: (e: Enemy, canSeePlayer: boolean, obstacles: any[], isPassable: (x: number, y: number) => boolean, player: any, enemies: Enemy[]) => {
        EnemyActions.combatMove(e, canSeePlayer, obstacles, isPassable, player, enemies);
    },
    alerting: (e: Enemy, canSeePlayer: boolean, obstacles: any[], isPassable: (x: number, y: number) => boolean, player: any, enemies: Enemy[]) => {
        Helpers.postUpdate(e, obstacles, enemies);
    },
    combatMove: (e: Enemy, canSeePlayer: boolean, obstacles: any[], isPassable: (x: number, y: number) => boolean, player: any, enemies: Enemy[]) => {
        if (!player && canSeePlayer) return;
        const target = canSeePlayer ? player : getMemoryPosition(e);
        if (!target) return;

        const eSpeed = e.speed * (e.status === 'oiled' || e.status === 'petroleum' ? 0.5 : 1.0);
        
        if (e.type === 'chaser') {
            const targetTileX = Math.floor(target.x / TILE_SIZE);
            const targetTileY = Math.floor(target.y / TILE_SIZE);
            const astar = new ROT.Path.AStar(targetTileX, targetTileY, isPassable);
            const path: Point[] = [];
            astar.compute(Math.floor(e.x/TILE_SIZE), Math.floor(e.y/TILE_SIZE), (x, y) => path.push({x, y}));
            
            if (path.length > 1) {
                let angle = Math.atan2(path[1].y * TILE_SIZE + TILE_SIZE / 2 - e.y, path[1].x * TILE_SIZE + TILE_SIZE / 2 - e.x);
                // Improved flanking behavior
                let closeAllies = 0; enemies.forEach(other => { if (other !== e && Utils.distSq(e, other) < 3600) closeAllies++; });
                if (closeAllies >= 1 && canSeePlayer) {
                    const perpAngle = angle + (e.id > 0.5 ? Math.PI / 2 : -Math.PI / 2);
                    angle = Utils.lerp(angle, perpAngle, Math.min(0.5, closeAllies * 0.15));
                }
                e.angle = angle; // Set enemy facing direction
                e.x += Math.cos(angle) * eSpeed; e.y += Math.sin(angle) * eSpeed;
            }
        } else if (e.type === 'shooter') {
            const dSq = Utils.distSq(e, target);
            if (dSq > 40000) {
                const angle = Math.atan2(target.y - e.y, target.x - e.x);
                e.angle = angle; // Set enemy facing direction
                e.x += Math.cos(angle) * eSpeed; e.y += Math.sin(angle) * eSpeed;
            } else if (dSq < 22500) {
                const angle = Math.atan2(e.y - target.y, e.x - target.x);
                // Keep looking at target while retreating
                e.angle = Math.atan2(target.y - e.y, target.x - e.x); 
                e.x += Math.cos(angle) * eSpeed; e.y += Math.sin(angle) * eSpeed;
            }
            Helpers.handleShooting(e, target, 1.0);
        }
        Helpers.postUpdate(e, obstacles, enemies);
    },
    turnTowards: Helpers.turnTowards
};
