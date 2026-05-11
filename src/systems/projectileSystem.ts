import * as bitECS from 'bitecs';
import { Position, Velocity, ProjectileTag, GrenadeTag, Timer, Stats, Bounces, EnemyTag, Health, PlayerTag, EnemyProjectileTag } from '../domain/components';
import { Utils, resolveCollision, SpatialHash } from './physics';
import { TILE_SIZE, GAME_WIDTH, GAME_HEIGHT, WORLD_WIDTH, WORLD_HEIGHT, MAP_COLS, MAP_ROWS } from '../core/constants';

export class ProjectileSystem {
    private projectileQuery = bitECS.defineQuery([Position, Velocity, ProjectileTag]);
    private grenadeQuery = bitECS.defineQuery([Position, Velocity, GrenadeTag]);
    private enemyQuery = bitECS.defineQuery([EnemyTag, Position, Health]);
    private playerQuery = bitECS.defineQuery([PlayerTag, Position]);
    private enemyHash: SpatialHash = new SpatialHash(TILE_SIZE * 3);
    private obstacleHash: SpatialHash = new SpatialHash(TILE_SIZE * 3);
    private lastObstacleCount: number = -1;

    constructor(
        private damageEnemy: (eid: number, amount: number) => void,
        private restartRoom: () => void,
        private isGodMode: () => boolean,
        private isPlayerIframe: () => boolean
    ) {}

    update(world: bitECS.IWorld, passabilityRaw: Uint8Array, mapCols: number, obstacles: any[]) {
        // 1. Build enemy spatial hash
        this.enemyHash.clear();
        const enemies = this.enemyQuery(world);
        for (let i = 0; i < enemies.length; i++) {
            const eid = enemies[i];
            this.enemyHash.insert(eid, Position.x[eid], Position.y[eid]);
        }

        // 2. Rebuild obstacle hash if changed
        if (this.lastObstacleCount !== obstacles.length) {
            this.obstacleHash.clear();
            obstacles.forEach((obs, idx) => this.obstacleHash.insert(idx, obs.x + obs.w/2, obs.y + obs.h/2));
            this.lastObstacleCount = obstacles.length;
        }

        const players = this.playerQuery(world);
        const projectiles = this.projectileQuery(world);

        for (let i = 0; i < projectiles.length; i++) {
            const eid = projectiles[i];
            
            Position.x[eid] += Velocity.x[eid];
            Position.y[eid] += Velocity.y[eid];

            const px = Position.x[eid];
            const py = Position.y[eid];
            const gx = Math.floor(px / TILE_SIZE);
            const gy = Math.floor(py / TILE_SIZE);

            let destroyed = false;

            // Wall check
            if (px < 0 || px > WORLD_WIDTH || py < 0 || py > WORLD_HEIGHT || passabilityRaw[gy * mapCols + gx] === 0) {
                if (bitECS.hasComponent(world, Bounces, eid) && Bounces.value[eid] > 0) {
                    const prevX = px - Velocity.x[eid];
                    const prevY = py - Velocity.y[eid];
                    if (Math.floor(prevX / TILE_SIZE) !== gx) Velocity.x[eid] *= -1;
                    if (Math.floor(prevY / TILE_SIZE) !== gy) Velocity.y[eid] *= -1;
                    Bounces.value[eid]--;
                    Position.x[eid] = prevX;
                    Position.y[eid] = prevY;
                } else {
                    destroyed = true;
                }
            } else {
                // Optimized Obstacle check
                const nearbyObsIdx = this.obstacleHash.query(px, py, TILE_SIZE * 2);
                for (const idx of nearbyObsIdx) {
                    const obs = obstacles[idx];
                    if (px > obs.x && px < obs.x + obs.w && py > obs.y && py < obs.y + obs.h) {
                        if (bitECS.hasComponent(world, Bounces, eid) && Bounces.value[eid] > 0) {
                            const prevX = px - Velocity.x[eid];
                            const prevY = py - Velocity.y[eid];
                            if (prevX > obs.x && prevX < obs.x + obs.w) Velocity.y[eid] *= -1;
                            else Velocity.x[eid] *= -1;
                            Bounces.value[eid]--;
                        } else {
                            destroyed = true;
                        }
                        break;
                    }
                }
            }

            if (!destroyed) {
                const isEnemyBullet = bitECS.hasComponent(world, EnemyProjectileTag, eid);

                if (!isEnemyBullet) {
                    const nearbyEnemies = this.enemyHash.query(px, py, 32);
                    for (const eeid of nearbyEnemies) {
                        const distSq = (px - Position.x[eeid]) ** 2 + (py - Position.y[eeid]) ** 2;
                        if (distSq < 225) { // (12+3)^2
                            this.damageEnemy(eeid, 1);
                            destroyed = true;
                            break;
                        }
                    }
                } else if (!this.isGodMode() && !this.isPlayerIframe()) {
                    for (let j = 0; j < players.length; j++) {
                        const peid = players[j];
                        const distSq = (px - Position.x[peid]) ** 2 + (py - Position.y[peid]) ** 2;
                        if (distSq < 361) { // (15+4)^2
                            this.restartRoom();
                            destroyed = true;
                            break;
                        }
                    }
                }
            }

            if (destroyed) bitECS.removeEntity(world, eid);
        }

        // Update Grenades (same as before)
        const grenades = this.grenadeQuery(world);
        for (let i = 0; i < grenades.length; i++) {
            const eid = grenades[i];
            Velocity.x[eid] *= 0.95;
            Velocity.y[eid] *= 0.95;
            const nextX = Position.x[eid] + Velocity.x[eid];
            const nextY = Position.y[eid] + Velocity.y[eid];
            const gx = Math.floor(nextX / TILE_SIZE);
            const gy = Math.floor(nextY / TILE_SIZE);
            if (gx >= 0 && gx < mapCols && gy >= 0 && gy < MAP_ROWS && passabilityRaw[gy * mapCols + gx] === 1) {
                Position.x[eid] = nextX;
                Position.y[eid] = nextY;
            } else {
                Velocity.x[eid] *= -0.5;
                Velocity.y[eid] *= -0.5;
            }
            const dummyEntity = { x: Position.x[eid], y: Position.y[eid], radius: 4 };
            const nearbyObsIdx = this.obstacleHash.query(dummyEntity.x, dummyEntity.y, TILE_SIZE);
            for (const idx of nearbyObsIdx) {
                const obs = obstacles[idx];
                const collided = resolveCollision(dummyEntity, obs);
                if (collided) {
                    Position.x[eid] = dummyEntity.x;
                    Position.y[eid] = dummyEntity.y;
                    Velocity.x[eid] *= -0.5;
                    Velocity.y[eid] *= -0.5;
                }
            }
        }
    }
}
