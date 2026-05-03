import { Utils, Point, Circle, Rect } from './physics';
import { TILE_SIZE } from '../core/constants';

export interface TrapBase extends Point {
    id: string;
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
    constructor(
        private sfx: any,
        private particles: any,
        private floatingTextCallback: (x: number, y: number, text: string, color?: string) => void,
        private secretRoomCallback: (open: boolean) => void,
        private restartRoomCallback: () => void,
        private killEnemyCallback: (index: number) => void
    ) {}

    update(
        player: Circle & { isDashing: boolean },
        enemies: Circle[],
        state: TrapState,
        isGodMode: boolean,
        secretRoomCells: { gx: number, gy: number }[]
    ) {
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

            for (let i = enemies.length - 1; i >= 0; i--) {
                if (Utils.dist(enemies[i], b) < 15) {
                    this.killEnemyCallback(i);
                }
            }
        });

        // Pressure plates
        state.plates.forEach(p => {
            if (!p.pressed && Utils.dist(player, p) < 15) {
                p.pressed = true;
                this.sfx.doorOpen();
                this.secretRoomCallback(true);
                this.particles.spawn(p.x, p.y, 20);
                p.timer = 1200;
                this.floatingTextCallback(p.x, p.y - 20, "ПУТЬ ОТКРЫТ!");
            } else if (p.pressed && p.timer > 0 && p.timer !== Infinity) {
                const inSecretRoom = secretRoomCells.some(
                    c => Math.floor(player.x / TILE_SIZE) === c.gx && Math.floor(player.y / TILE_SIZE) === c.gy
                );
                if (inSecretRoom) {
                    p.timer = Infinity;
                    if (!p.discovered) {
                        p.discovered = true;
                        this.floatingTextCallback(player.x, player.y - 40, "СЕКРЕТ НАЙДЕН!");
                    }
                } else {
                    p.timer--;
                    if (p.timer <= 0) {
                        p.pressed = false;
                        this.secretRoomCallback(false);
                        this.sfx.click();
                        this.floatingTextCallback(p.x, p.y - 20, "ЗАКРЫЛОСЬ");
                    }
                }
            }
        });

        // Mines
        state.mines.forEach((t, index) => {
            if (!t.active) {
                let triggered = Utils.dist(player, t) < 15;
                enemies.forEach(e => {
                    if (Utils.dist(e, t) < 15) triggered = true;
                });
                if (triggered) {
                    t.active = true;
                    this.sfx.click();
                    this.floatingTextCallback(t.x, t.y - 20, "ВЗРЫВ!");
                }
            } else {
                t.timer--;
                if (t.timer <= 0) {
                    this.sfx.explosion();
                    this.particles.spawn(t.x, t.y, 60);
                    // makeNoise logic will be handled by the main game loop / audio engine
                    if (!isGodMode && !player.isDashing && Utils.dist(player, t) < 60) {
                        this.restartRoomCallback();
                    }
                    for (let j = enemies.length - 1; j >= 0; j--) {
                        if (Utils.dist(enemies[j], t) < 60) {
                            this.killEnemyCallback(j);
                        }
                    }
                    state.mines.splice(index, 1);
                }
            }
        });
    }
}
