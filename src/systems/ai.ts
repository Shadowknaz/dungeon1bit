import { createMachine } from 'xstate';
import * as ROT from 'rot-js';
import { Utils, Point, resolveCollision } from './physics';
import { TILE_SIZE, ENEMY_BARKS } from '../core/constants';

export enum B3Status {
    SUCCESS = 1,
    FAILURE = 2,
    RUNNING = 3
}

export interface B3TickData {
    enemy: any;
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
                REACHED_TARGET: 'patrol',
                PLAYER_LOST: 'patrol'
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

export const EnemyActions = {
    patrol: (e: any, canSeePlayer: boolean, obstacles: any[], isPassable: (x: number, y: number) => boolean, player: any, enemies: any[]) => {
        patrolTree.tick({ enemy: e });
        obstacles.forEach(obs => resolveCollision(e, obs));
    },
    investigate: (e: any, canSeePlayer: boolean, obstacles: any[], isPassable: (x: number, y: number) => boolean, player: any, enemies: any[]) => {
        if (e.memory) {
            const astar = new ROT.Path.AStar(e.memory.x, e.memory.y, isPassable);
            const path: Point[] = [];
            astar.compute(Math.floor(e.x/TILE_SIZE), Math.floor(e.y/TILE_SIZE), (x, y) => path.push({x, y}));
            if (path.length > 1) { 
                const angle = Math.atan2(path[1].y * TILE_SIZE + TILE_SIZE / 2 - e.y, path[1].x * TILE_SIZE + TILE_SIZE / 2 - e.x); 
                const eSpeed = e.speed * (e.status === 'oiled' || e.status === 'petroleum' ? 0.5 : 1.0);
                e.x += Math.cos(angle) * (eSpeed * 0.7); e.y += Math.sin(angle) * (eSpeed * 0.7); 
            } else { e.memory = null; e.fsm.send('REACHED_TARGET'); }
            obstacles.forEach(obs => resolveCollision(e, obs));
        } else { e.fsm.send('REACHED_TARGET'); }
    },
    chase: (e: any, canSeePlayer: boolean, obstacles: any[], isPassable: (x: number, y: number) => boolean, player: any, enemies: any[]) => {
        EnemyActions.combatMove(e, canSeePlayer, obstacles, isPassable, player, enemies);
    },
    attack: (e: any, canSeePlayer: boolean, obstacles: any[], isPassable: (x: number, y: number) => boolean, player: any, enemies: any[]) => {
        EnemyActions.combatMove(e, canSeePlayer, obstacles, isPassable, player, enemies);
    },
    alerting: () => {},
    combatMove: (e: any, canSeePlayer: boolean, obstacles: any[], isPassable: (x: number, y: number) => boolean, player: any, enemies: any[]) => {
        const eSpeed = e.speed * (e.status === 'oiled' || e.status === 'petroleum' ? 0.5 : 1.0);
        if (e.type === 'chaser') {
            if (e.memory) {
                const astar = new ROT.Path.AStar(e.memory.x, e.memory.y, isPassable);
                const path: Point[] = [];
                astar.compute(Math.floor(e.x/TILE_SIZE), Math.floor(e.y/TILE_SIZE), (x, y) => path.push({x, y}));
                if (path.length > 1) { 
                    let angle = Math.atan2(path[1].y * TILE_SIZE + TILE_SIZE / 2 - e.y, path[1].x * TILE_SIZE + TILE_SIZE / 2 - e.x); 
                    let closeAllies = 0; enemies.forEach(other => { if (other !== e && Utils.distSq(e, other) < 2500) closeAllies++; });
                    if (closeAllies >= 2 && canSeePlayer) angle += (e.id > 0.5 ? 0.8 : -0.8);
                    e.x += Math.cos(angle) * eSpeed; e.y += Math.sin(angle) * eSpeed; 
                }
            }
        } else if (e.type === 'shooter') {
            const dSq = Utils.distSq(e, player);
            if (dSq > 40000) { // Keep distance
                const angle = Math.atan2(player.y - e.y, player.x - e.x);
                e.x += Math.cos(angle) * eSpeed; e.y += Math.sin(angle) * eSpeed;
            } else if (dSq < 22500) {
                const angle = Math.atan2(e.y - player.y, e.x - player.x);
                e.x += Math.cos(angle) * eSpeed; e.y += Math.sin(angle) * eSpeed;
            }
        }
        obstacles.forEach(obs => resolveCollision(e, obs));
    }
};
