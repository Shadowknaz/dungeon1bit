import { GAME_WIDTH, GAME_HEIGHT, WORLD_WIDTH, WORLD_HEIGHT } from '../core/constants';
import { AnimatedSprite } from '../core/animatedSprite';
import { addComponent, IWorld } from 'bitecs';
import { Position, Health, PlayerTag, Combat } from '../domain/components';

export class Camera {
    public x: number = 0;
    public y: number = 0;
    public zoom: number = 1.3; // Увеличенный зум для лучшей детализации
    public targetX: number = 0;
    public targetY: number = 0;
    public lerpFactor: number = 0.1;
    public lookAhead: number = 0.3; // На сколько камера смещается к курсору

    constructor(x: number, y: number) {
        this.x = x;
        this.y = y;
        this.targetX = x;
        this.targetY = y;
    }

    update(playerX: number, playerY: number) {
        // Камера следует только за игроком
        this.targetX = playerX;
        this.targetY = playerY;

        this.x += (this.targetX - this.x) * this.lerpFactor;
        this.y += (this.targetY - this.y) * this.lerpFactor;
    }

    snap(x: number, y: number) {
        this.x = x;
        this.y = y;
        this.targetX = x;
        this.targetY = y;
    }


    getWorldMouse(mouseX: number, mouseY: number) {
        return {
            x: (mouseX - GAME_WIDTH / 2) / this.zoom + this.x,
            y: (mouseY - GAME_HEIGHT / 2) / this.zoom + this.y
        };
    }
}



export interface PlayerStats {
    speed: number;
    dashCooldown: number;
    dashSpeed: number;
    dashDuration: number;
    // Weapon stats (now integrated into player)
    maxAmmo: number;
    shootCooldown: number;
    reloadDuration: number;
    projectiles: number;
    spreadAngle: number;
    projectileLifetime: number;
    bounces: number;
    canReload: boolean;
    weaponType: 'reload' | 'charge';
    chargeTime: number;
    weaponId: string;
}

export interface PlayerComputedStats extends PlayerStats {}

export interface PlayerState {
    eid: number;
    x: number;
    y: number;
    radius: number;
    angle: number;
    baseStats: PlayerStats;
    computedStats: PlayerComputedStats;
    isDashing: boolean;
    isAimingDash: boolean;
    dashTimer: number;
    dashAngle: number;
    trail: { x: number, y: number, alpha: number }[];
    ammo: number;
    isReloading: boolean;
    reloadTimer: number;
    consecutiveShots: number;
    lastShotTime: number;
    carryingBarrel: string | null;
    credits: number;
    status: string | null;
    statusTimer: number;
    willpower: number;
    maxWillpower: number;
    godMode?: boolean;
    anim?: AnimatedSprite;
    camera: Camera;
    dashCooldownTimer: number;
    iframeTimer: number;
    grenadesHE: number;
    grenadesFlash: number;
    knockbackX: number;
    knockbackY: number;
}


export function createPlayer(world: IWorld, eid: number): PlayerState {
    addComponent(world, PlayerTag, eid);
    addComponent(world, Position, eid);
    addComponent(world, Health, eid);

    const baseStats: PlayerStats = {
        speed: 1,
        dashCooldown: 120,
        dashSpeed: 4,
        dashDuration: 8,
        maxAmmo: 6,
        shootCooldown: 35,
        reloadDuration: 180,
        projectiles: 1,
        spreadAngle: 0.1,
        projectileLifetime: 180,
        bounces: 0,
        canReload: true,
        weaponType: 'reload',
        chargeTime: 60,
        weaponId: 'pistol'
    };

    const player = {
        eid,
        radius: 10,
        baseStats,
        computedStats: { ...baseStats },
        isDashing: false,
        isAimingDash: false,
        dashTimer: 0,
        dashAngle: 0,
        trail: [],
        isReloading: false,
        consecutiveShots: 0,
        lastShotTime: 0,
        carryingBarrel: null,
        credits: 0,
        status: null,
        maxWillpower: 5,
        grenadesHE: 0,
        grenadesFlash: 0,
        knockbackX: 0,
        knockbackY: 0,
        camera: new Camera(WORLD_WIDTH / 2, WORLD_HEIGHT - 200),
        
        // ECS-linked properties
        get x() { return Position.x[eid]; },
        set x(v) { Position.x[eid] = v; },
        get y() { return Position.y[eid]; },
        set y(v) { Position.y[eid] = v; },
        get angle() { return Position.angle[eid]; },
        set angle(v) { Position.angle[eid] = v; },
        get ammo() { return Combat.ammo[eid]; },
        set ammo(v) { Combat.ammo[eid] = v; },
        get reloadTimer() { return Combat.reloadTimer[eid]; },
        set reloadTimer(v) { Combat.reloadTimer[eid] = v; },
        get statusTimer() { return 0; /* status handling still in Game for now */ },
        set statusTimer(v) {},
        get willpower() { return Health.current[eid]; },
        set willpower(v) { Health.current[eid] = v; },
        get dashCooldownTimer() { return Combat.reloadTimer[eid]; }, // Reusing combat for timers to keep it simple
        set dashCooldownTimer(v) { Combat.reloadTimer[eid] = v; },
        get iframeTimer() { return Combat.iframeTimer[eid]; },
        set iframeTimer(v) { Combat.iframeTimer[eid] = v; }
    } as any as PlayerState;
 
    // Initialize components
    Position.x[eid] = WORLD_WIDTH / 2;
    Position.y[eid] = WORLD_HEIGHT - 200;
    Position.angle[eid] = 0;
    Health.current[eid] = 5;
    Health.max[eid] = 5;
    Combat.ammo[eid] = 6;

    return player;
}
