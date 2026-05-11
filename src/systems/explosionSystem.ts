import * as bitECS from 'bitecs';
import { Position, Explosive, Timer, Health, EnemyTag, PlayerTag } from '../domain/components';
import { TILE_SIZE } from '../core/constants';

export class ExplosionSystem {
    private explosiveQuery = bitECS.defineQuery([Position, Explosive, Timer]);
    private enemyQuery = bitECS.defineQuery([EnemyTag, Position, Health]);
    private playerQuery = bitECS.defineQuery([PlayerTag, Position]);

    constructor(
        private sfx: any,
        private particles: any,
        private addFloatingText: (x: number, y: number, text: string, color?: string) => void,
        private onPlayerDamage: () => void,
        private damageEnemy: (eid: number, amount: number) => void,
        private enemiesMap: Map<number, any>,
        private addLight: (id: string, gx: number, gy: number, radius: number, intensity: number, ttl: number) => void,
        private dungeon: any,
        private onGridChange: () => void,
        private ui: any
    ) {}

    update(world: bitECS.IWorld) {
        const explosives = this.explosiveQuery(world);
        for (let i = 0; i < explosives.length; i++) {
            const eid = explosives[i];
            Timer.value[eid]--;

            if (Timer.value[eid] <= 0) {
                this.explode(world, eid);
            }
        }
    }

    private explode(world: bitECS.IWorld, eid: number) {
        const x = Position.x[eid];
        const y = Position.y[eid];
        const radius = Explosive.radius[eid] * TILE_SIZE;
        const damage = Explosive.damage[eid];
        const type = Explosive.type[eid]; // 0: HE, 1: Flash
        const radiusSq = radius * radius;

        this.sfx.explosion();
        if (type === 0) {
            this.particles.spawnExplosion(x, y);
        } else {
            this.particles.spawnFlash(x, y);
        }

        this.addLight(`explosion_${eid}`, Math.floor(x / TILE_SIZE), Math.floor(y / TILE_SIZE), 8, 1, 120);

        // Damage enemies
        const enemies = this.enemyQuery(world);
        enemies.forEach(eeid => {
            const ex = Position.x[eeid];
            const ey = Position.y[eeid];
            const distSq = (x - ex) ** 2 + (y - ey) ** 2;

            if (distSq < radiusSq) {
                if (type === 0) {
                    this.damageEnemy(eeid, damage);
                } else {
                    // Flashbang Stun
                    const enemy = this.enemiesMap.get(eeid);
                    if (enemy) {
                        enemy.fsm.send('STUN');
                        enemy.stunTimer = 180;
                        this.addFloatingText(ex, ey - 20, "STUNNED", "#fff");
                    }
                }
            }
        });

        // Damage player
        const players = this.playerQuery(world);
        players.forEach(peid => {
            const px = Position.x[peid];
            const py = Position.y[peid];
            const distSq = (x - px) ** 2 + (y - py) ** 2;
            if (distSq < radiusSq && type === 0) {
                this.onPlayerDamage();
            }
        });

        // Destroy walls
        if (type === 0) {
            let wallDestroyed = false;
            const gx = Math.floor(x / TILE_SIZE);
            const gy = Math.floor(y / TILE_SIZE);
            const tileRadius = Math.ceil(radius / TILE_SIZE);

            for (let dx = -tileRadius; dx <= tileRadius; dx++) {
                for (let dy = -tileRadius; dy <= tileRadius; dy++) {
                    const tx = gx + dx;
                    const ty = gy + dy;
                    const distSq = dx * dx + dy * dy;
                    if (distSq <= tileRadius * tileRadius) {
                        if (this.dungeon.destroyWall(tx, ty)) {
                            wallDestroyed = true;
                            this.ui.removeWallGlow(tx * TILE_SIZE + TILE_SIZE/2, ty * TILE_SIZE + TILE_SIZE/2);
                            this.particles.spawnWallDebris(tx * TILE_SIZE + TILE_SIZE/2, ty * TILE_SIZE + TILE_SIZE/2);
                        }
                    }
                }
            }
            if (wallDestroyed) {
                this.onGridChange();
            }
        }

        bitECS.removeEntity(world, eid);
    }
}
