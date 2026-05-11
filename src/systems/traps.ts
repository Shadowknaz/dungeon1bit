import { Utils, SpatialHash } from './physics';
import { Point, Circle, Rect } from '../domain/types';
import { TILE_SIZE } from '../core/constants';

export interface TrapBase extends Point {
    id: string;
}

export enum PlateType {
    PRISON_GATE = 'prison_gate',
    TRAP_TRIGGER = 'trap_trigger'
}

export interface PitTrap extends TrapBase {}

export interface SpikeTrap extends TrapBase {
    state: 0 | 1 | 2; // 0: retracted, 1: triggering, 2: active
    timer: number;
}

export interface SwingingBlade extends TrapBase {
    startX: number;
    startY: number;
    vx: number;
    vy: number;
    range: number;
}

export interface PressurePlate extends TrapBase {
    pressed: boolean;
    timer: number;
    discovered: boolean;
    type: PlateType;
    targetId?: string; // ID of the specific door or room it controls
}

export interface MineTrap extends TrapBase {
    active: boolean;
    timer: number;
}

export interface Mirror extends Rect {
    id: string;
    isMirror: true;
}

export interface TrapState {
    pits: PitTrap[];
    spikes: SpikeTrap[];
    blades: SwingingBlade[];
    plates: PressurePlate[];
    mines: MineTrap[];
    mirrors: Mirror[];
}

export class TrapSystem {
    private enemyHash: SpatialHash = new SpatialHash(TILE_SIZE * 2);

    constructor(
        private sfx: any,
        private particles: any,
        private floatingTextCallback: (x: number, y: number, text: string, color?: string) => void,
        private prisonGateCallback: (gateId: string, open: boolean) => void,
        private restartRoomCallback: () => void,
        private killEnemyCallback: (index: number) => void
    ) {}

    update(
        player: Circle & { isDashing: boolean },
        enemies: Circle[],
        state: TrapState,
        isGodMode: boolean
    ) {
        // Build spatial hash for enemies
        this.enemyHash.clear();
        enemies.forEach((e, i) => this.enemyHash.insert(i, e.x, e.y));
        // Pit traps
        state.pits.forEach(p => {
            if (!isGodMode && !player.isDashing && Utils.dist(player, p) < 12) {
                this.restartRoomCallback();
            }
        });

        // Spike traps
        state.spikes.forEach(s => {
            const overlap = Utils.dist(player, s) < 15;
            if (s.state === 0 && overlap) {
                s.state = 1;
                this.sfx.click();
                this.floatingTextCallback(s.x, s.y - 20, "КЛАЦ!");
            } else if (s.state === 1) {
                s.timer++;
                if (s.timer > 45) {
                    s.state = 2;
                    s.timer = 0;
                    this.sfx.hit();
                }
            } else if (s.state === 2) {
                if (overlap && !isGodMode && !player.isDashing) {
                    this.restartRoomCallback();
                }
                s.timer++;
                if (s.timer > 30) {
                    s.state = 0;
                    s.timer = 0;
                }
            }
        });

        // Swinging blades
        state.blades.forEach(b => {
            b.x += b.vx;
            b.y += b.vy;
            if (b.x < b.startX - b.range || b.x > b.startX + b.range) b.vx *= -1;
            if (b.y < b.startY - b.range || b.y > b.startY + b.range) b.vy *= -1;

            if (!isGodMode && !player.isDashing && Utils.dist(player, b) < 15) {
                this.restartRoomCallback();
            }

            const nearbyEnemies = this.enemyHash.query(b.x, b.y, 15);
            for (const i of nearbyEnemies) {
                if (Utils.dist(enemies[i], b) < 15) {
                    this.killEnemyCallback(i);
                }
            }
        });

        // Pressure plates
        state.plates.forEach(p => {
            const overlap = Utils.dist(player, p) < 15;
            if (!p.pressed && overlap) {
                p.pressed = true;
                this.sfx.doorOpen();
                this.particles.spawn(p.x, p.y, 20);
                p.timer = 1200; // Standard temporary opening

                if (p.type === PlateType.PRISON_GATE) {
                    this.prisonGateCallback(p.targetId || '', true);
                    this.floatingTextCallback(p.x, p.y - 20, "ВОРОТА ОТКРЫТЫ!");
                    p.timer = Infinity; // Prison gates usually stay open
                }
            } else if (p.pressed && p.timer > 0 && p.timer !== Infinity) {
                p.timer--;
                if (p.timer <= 0) {
                    p.pressed = false;
                    this.prisonGateCallback(p.targetId || '', false);
                    this.sfx.click();
                    this.floatingTextCallback(p.x, p.y - 20, "ЗАКРЫЛОСЬ");
                }
            }
        });

        // Mines - Safe removal with reverse loop
        for (let i = state.mines.length - 1; i >= 0; i--) {
            const t = state.mines[i];
            if (!t.active) {
                let triggered = false;
                const nearbyEnemies = this.enemyHash.query(t.x, t.y, 15);
                for (const idx of nearbyEnemies) {
                    if (Utils.dist(enemies[idx], t) < 15) triggered = true;
                }
                if (triggered) {
                    t.active = true;
                    this.sfx.click();
                    this.floatingTextCallback(t.x, t.y - 20, "ВЗРЫВ!");
                    t.timer = 45; // Explosion delay
                }
            } else {
                t.timer--;
                if (t.timer <= 0) {
                    this.sfx.explosion();
                    this.particles.spawn(t.x, t.y, 60);
                    if (!isGodMode && !player.isDashing && Utils.dist(player, t) < 60) {
                        this.restartRoomCallback();
                    }
                    const affectedEnemies = this.enemyHash.query(t.x, t.y, 60);
                    for (const j of affectedEnemies) {
                        if (Utils.dist(enemies[j], t) < 60) {
                            this.killEnemyCallback(j);
                        }
                    }
                    state.mines.splice(i, 1);
                }
            }
        }
    }
}
