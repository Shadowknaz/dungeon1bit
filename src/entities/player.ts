import { GAME_WIDTH } from '../core/constants';
import { AnimatedSprite } from '../core/animatedSprite';

export interface PlayerStats {
    speed: number;
    dashCooldown: number;
    dashSpeed: number;
    dashDuration: number;
}

export interface PlayerComputedStats extends PlayerStats {
    maxAmmo: number;
    shootCooldown: number;
    reloadDuration: number;
    projectiles: number;
    spreadAngle: number;
}

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
    equippedWeaponInstanceId: number | null;
    consecutiveShots: number;
    lastShotTime: number;
    carryingBarrel: string | null;
    credits: number;
    status: string | null;
    statusTimer: number;
    anim?: AnimatedSprite;
}

export function createPlayer(eid: number): PlayerState {
    const baseStats: PlayerStats = {
        speed: 1,
        dashCooldown: 120,
        dashSpeed: 8,
        dashDuration: 8
    };

    return {
        eid,
        x: GAME_WIDTH / 2,
        y: 520,
        radius: 10,
        angle: 0,
        baseStats,
        computedStats: {
            ...baseStats,
            maxAmmo: 0,
            shootCooldown: 0,
            reloadDuration: 0,
            projectiles: 1,
            spreadAngle: 0
        },
        isDashing: false,
        isAimingDash: false,
        dashTimer: 0,
        dashAngle: 0,
        trail: [],
        ammo: 0,
        isReloading: false,
        reloadTimer: 0,
        equippedWeaponInstanceId: null,
        consecutiveShots: 0,
        lastShotTime: 0,
        carryingBarrel: null,
        credits: 0,
        status: null,
        statusTimer: 0
    };
}
