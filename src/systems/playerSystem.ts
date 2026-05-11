import * as bitECS from 'bitecs';
import { PlayerState } from '../entities/player';
import { InputManager, GameIntent } from '../core/inputManager';
import { AnimatedSprite } from '../core/animatedSprite';
import { ANIMATIONS, GRENADES_DB } from '../data/registry';
import { Utils, resolveCollision, resolveGridCollision } from './physics';
import { GAME_WIDTH, GAME_HEIGHT, TILE_SIZE, DASH_COOLDOWN, DASH_IFRAME_DURATION, WORLD_WIDTH, WORLD_HEIGHT } from '../core/constants';
import { CombatSystem } from './combat';
import { ParticleSystem } from './particles';
import { Position, Velocity, ProjectileTag, Bounces, GrenadeTag, Timer, Explosive } from '../domain/components';
import { WeaponSystem, WeaponContext } from './weaponSystem';

export interface PlayerContext {
    world: bitECS.IWorld;
    player: PlayerState;
    input: InputManager;
    frameCounter: number;
    gameState: string;
    roomActive: boolean;
    obstacles: any[];
    startDoor: any;
    inventoryItems: any[];
    particles: ParticleSystem;
    combat: CombatSystem;
    weaponSystem: WeaponSystem;
    lumen: any;
    sfx: any;
    uiState: any;
    grid: number[][];
    isPassable: (gx: number, gy: number) => boolean;
    makeNoise: (x: number, y: number, radius: number) => void;
    addFloatingText: (x: number, y: number, text: string, color: string) => void;
    restartRoom: () => void;
    updateUI: () => void;
    damageEnemy: (eid: number, amount: number) => void;
    enemyQuery: bitECS.Query;
    enemiesMap: Map<number, any>;
    lasers: any[];
    secretRoomOpen: boolean;
    secretDoorObstacles: any[];
}

export class PlayerSystem {
    update(ctx: PlayerContext) {
        if (ctx.player.isReloading) {
            ctx.player.reloadTimer--;
            if (ctx.player.reloadTimer <= 0) { 
                ctx.player.isReloading = false; 
                ctx.player.ammo = ctx.player.computedStats.maxAmmo; 
                ctx.updateUI(); 
            }
        }
        if (ctx.player.dashCooldownTimer > 0) ctx.player.dashCooldownTimer--;
        if (ctx.player.iframeTimer > 0) ctx.player.iframeTimer--;

        let dx = 0, dy = 0, currentSpeed = ctx.player.computedStats.speed;
        if (ctx.weaponSystem.isCurrentlyCharging()) currentSpeed *= 0.5;
        if (ctx.weaponSystem.isCurrentlyChanneling()) currentSpeed = 0;
        if (ctx.player.status === 'oil') currentSpeed *= 0.5;
        if (ctx.player.status === 'petroleum') currentSpeed *= 0.4;

        if (ctx.player.isDashing) {
            ctx.player.dashTimer--; 
            dx = Math.cos(ctx.player.dashAngle) * ctx.player.baseStats.dashSpeed; 
            dy = Math.sin(ctx.player.dashAngle) * ctx.player.baseStats.dashSpeed;
            ctx.player.trail.push({ x: ctx.player.x, y: ctx.player.y, alpha: 0.8 });
            if (ctx.player.dashTimer <= 0) ctx.player.isDashing = false;
        } else {
            if (ctx.input.isIntentActive(GameIntent.MOVE_UP)) dy -= currentSpeed;
            if (ctx.input.isIntentActive(GameIntent.MOVE_DOWN)) dy += currentSpeed;
            if (ctx.input.isIntentActive(GameIntent.MOVE_LEFT)) dx -= currentSpeed;
            if (ctx.input.isIntentActive(GameIntent.MOVE_RIGHT)) dx += currentSpeed;

            if (dx !== 0 && dy !== 0) { const len = Math.sqrt(dx * dx + dy * dy); dx = (dx / len) * currentSpeed; dy = (dy / len) * currentSpeed; }
            this.updatePlayerAnimation(ctx, dx, dy);

            if (ctx.input.isIntentActive(GameIntent.DASH) && ctx.player.dashCooldownTimer <= 0) this.startDash(ctx, dx, dy);
        }

        this.applyMovement(ctx, dx, dy);
        this.applyKnockback(ctx);
        if (ctx.input.isIntentActive(GameIntent.DEBUG_REVEAL)) ctx.uiState.seeAllEnemies = !ctx.uiState.seeAllEnemies;
        const wm = ctx.player.camera.getWorldMouse(ctx.input.mouse.x, ctx.input.mouse.y);
        ctx.player.angle = Math.atan2(wm.y - ctx.player.y, wm.x - ctx.player.x);
        this.handleShooting(ctx);

        // Sync back to bitECS
        Position.x[ctx.player.eid] = ctx.player.x;
        Position.y[ctx.player.eid] = ctx.player.y;
    }

    private updatePlayerAnimation(ctx: PlayerContext, dx: number, dy: number) {
        if (dx !== 0 || dy !== 0) {
            if (ctx.frameCounter % 15 === 0) ctx.makeNoise(ctx.player.x, ctx.player.y, 250);
            if (Math.abs(dy) > Math.abs(dx)) ctx.player.anim = new AnimatedSprite(dy > 0 ? ANIMATIONS.PLAYER_WALK_DOWN : ANIMATIONS.PLAYER_WALK_UP);
            else ctx.player.anim = new AnimatedSprite(ANIMATIONS.PLAYER_WALK_SIDE);
        } else if (ctx.player.anim) {
            const frames = (ctx.player.anim as any).def.frames[0];
            if (frames.includes('_d')) ctx.player.anim = new AnimatedSprite(ANIMATIONS.PLAYER_IDLE_DOWN);
            else if (frames.includes('_u')) ctx.player.anim = new AnimatedSprite(ANIMATIONS.PLAYER_IDLE_UP);
            else ctx.player.anim = new AnimatedSprite(ANIMATIONS.PLAYER_IDLE_SIDE);
        }
    }

    private startDash(ctx: PlayerContext, dx: number, dy: number) {
        ctx.player.isDashing = true; 
        ctx.player.dashTimer = ctx.player.baseStats.dashDuration; 
        ctx.player.dashCooldownTimer = DASH_COOLDOWN; 
        ctx.player.iframeTimer = DASH_IFRAME_DURATION;
        if (dx !== 0 || dy !== 0) { const len = Math.sqrt(dx * dx + dy * dy); ctx.player.dashAngle = Math.atan2(dy / len, dx / len); }
        else ctx.player.dashAngle = ctx.player.angle;
        ctx.sfx.dash(); 
        ctx.particles.spawn(ctx.player.x, ctx.player.y, 5, 1, 3); 
        ctx.makeNoise(ctx.player.x, ctx.player.y, 600);
    }

    private applyMovement(ctx: PlayerContext, dx: number, dy: number) {
        const steps = ctx.player.isDashing ? 4 : 1;
        for (let s = 0; s < steps; s++) {
            if (ctx.player.isDashing && ctx.frameCounter % 2 === 0) ctx.particles.spawn(ctx.player.x, ctx.player.y, 2, 1, 2);
            ctx.player.x += dx / steps; ctx.player.x = Utils.clamp(ctx.player.x, ctx.player.radius, WORLD_WIDTH - ctx.player.radius);
            this.resolveAllCollisions(ctx);
            
            ctx.player.y += dy / steps; ctx.player.y = Utils.clamp(ctx.player.y, ctx.player.radius, WORLD_HEIGHT - ctx.player.radius);
            this.resolveAllCollisions(ctx);
        }
        for (let i = ctx.player.trail.length - 1; i >= 0; i--) { 
            ctx.player.trail[i].alpha -= 0.1; 
            if (ctx.player.trail[i].alpha <= 0) ctx.player.trail.splice(i, 1); 
        }
    }

    private applyKnockback(ctx: PlayerContext) {
        if (Math.abs(ctx.player.knockbackX) < 0.1 && Math.abs(ctx.player.knockbackY) < 0.1) return;
        const steps = 4;
        for (let s = 0; s < steps; s++) {
            ctx.player.x += ctx.player.knockbackX / steps;
            ctx.player.x = Utils.clamp(ctx.player.x, ctx.player.radius, WORLD_WIDTH - ctx.player.radius);
            this.resolveAllCollisions(ctx);
            
            ctx.player.y += ctx.player.knockbackY / steps;
            ctx.player.y = Utils.clamp(ctx.player.y, ctx.player.radius, WORLD_HEIGHT - ctx.player.radius);
            this.resolveAllCollisions(ctx);
        }
        ctx.player.knockbackX *= 0.85;
        ctx.player.knockbackY *= 0.85;
    }

    private resolveAllCollisions(ctx: PlayerContext) {
        if (ctx.uiState.noclip) return;
        
        // 1. Grid-based collisions (fast)
        resolveGridCollision(ctx.player, ctx.grid);

        // 2. Obstacle-based collisions (small objects)
        ctx.obstacles.forEach(obs => resolveCollision(ctx.player, obs));
        
        if (ctx.startDoor && !ctx.startDoor.open) resolveCollision(ctx.player, ctx.startDoor);
        if (!ctx.secretRoomOpen) {
            ctx.secretDoorObstacles.forEach(obs => resolveCollision(ctx.player, obs));
        }
    }

    private handleShooting(ctx: PlayerContext) {
        if (ctx.gameState !== 'PLAYING' || !ctx.roomActive || ctx.player.isReloading) return;

        const { weaponType } = ctx.player.computedStats;

        if (weaponType === 'charge' || weaponType === 'channel') {
            ctx.weaponSystem.update(this.getWeaponContext(ctx), ctx.player);
        } else if (ctx.input.mouse.clicked && !ctx.player.isReloading) {
            if (ctx.frameCounter % ctx.player.computedStats.shootCooldown === 0 && ctx.player.ammo > 0) {
                if (ctx.player.status === 'petroleum') { 
                    ctx.addFloatingText(ctx.player.x, ctx.player.y - 20, "ИСКРА!", "#f00"); 
                    ctx.sfx.explosion(); 
                    ctx.particles.spawn(ctx.player.x, ctx.player.y, 60, 2, 5); 
                    ctx.restartRoom(); 
                    return; 
                }
                const px = Math.floor(ctx.player.x / TILE_SIZE), py = Math.floor(ctx.player.y / TILE_SIZE);
                const pSpeed = 3.5;
                const projs = ctx.combat.spawnProjectiles(ctx.player, ctx.player.angle, {
                    projectiles: ctx.player.computedStats.projectiles,
                    spreadAngle: ctx.player.computedStats.spreadAngle,
                    projectileLifetime: ctx.player.computedStats.projectileLifetime
                }, 0, ctx.player.radius, false, pSpeed);

                projs.forEach(p => {
                    const eid = bitECS.addEntity(ctx.world);
                    bitECS.addComponent(ctx.world, Position, eid);
                    bitECS.addComponent(ctx.world, Velocity, eid);
                    bitECS.addComponent(ctx.world, ProjectileTag, eid);
                    Position.x[eid] = p.x;
                    Position.y[eid] = p.y;
                    Velocity.x[eid] = p.vx;
                    Velocity.y[eid] = p.vy;

                    if (ctx.player.computedStats.bounces > 0) {
                        bitECS.addComponent(ctx.world, Bounces, eid);
                        Bounces.value[eid] = ctx.player.computedStats.bounces;
                    }
                });

                ctx.lumen.addLight({ id: `muzzle_${ctx.frameCounter}`, x: px, y: py, radius: 3, intensity: 0.8, type: 1, active: true, ttl: 60 });
                ctx.sfx.playerShoot(); 
                ctx.player.ammo--;
                ctx.makeNoise(ctx.player.x, ctx.player.y, 300);
                ctx.updateUI();
                if (ctx.player.ammo <= 0) this.reload(ctx);
            } else if (ctx.player.ammo <= 0) {
                this.reload(ctx);
            }
        }

        // Grenade throwing
        if (ctx.input.isIntentActive(GameIntent.GRENADE_HE) && ctx.player.grenadesHE > 0) {
            this.throwGrenade(ctx, 'he');
            ctx.player.grenadesHE--;
            ctx.updateUI();
        }
        if (ctx.input.isIntentActive(GameIntent.GRENADE_FLASH) && ctx.player.grenadesFlash > 0) {
            this.throwGrenade(ctx, 'flash');
            ctx.player.grenadesFlash--;
            ctx.updateUI();
        }
    }

    private throwGrenade(ctx: PlayerContext, type: 'he' | 'flash') {
        const angle = ctx.player.angle;
        const speed = 6;
        const eid = bitECS.addEntity(ctx.world);
        [Position, Velocity, GrenadeTag, Explosive, Timer].forEach(c => bitECS.addComponent(ctx.world, c, eid));
        
        Position.x[eid] = ctx.player.x;
        Position.y[eid] = ctx.player.y;
        Velocity.x[eid] = Math.cos(angle) * speed;
        Velocity.y[eid] = Math.sin(angle) * speed;
        
        const config = GRENADES_DB[type];
        Explosive.radius[eid] = config.radius;
        Explosive.damage[eid] = config.damage;
        Explosive.type[eid] = type === 'he' ? 0 : 1;
        Timer.value[eid] = config.timer;

        ctx.sfx.click();
    }

    private getWeaponContext(ctx: PlayerContext): WeaponContext {
        return {
            world: ctx.world,
            isPassable: ctx.isPassable,
            damageEnemy: ctx.damageEnemy,
            makeNoise: ctx.makeNoise,
            particles: ctx.particles,
            sfx: ctx.sfx,
            input: ctx.input,
            updateUI: ctx.updateUI
        };
    }

    public reload(ctx: PlayerContext) {
        if (!ctx.player.computedStats.canReload) return;
        if (!ctx.player.isReloading && ctx.player.ammo < ctx.player.computedStats.maxAmmo) {
            ctx.player.isReloading = true;
            ctx.player.reloadTimer = ctx.player.computedStats.reloadDuration;
            ctx.sfx.reload();
            ctx.updateUI();
        }
    }
}
