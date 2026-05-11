import * as bitECS from 'bitecs';
import { LaserBeam, Position, Health, EnemyTag, LightningChain } from '../domain/components';
import { Utils } from './physics';
import { TILE_SIZE, GAME_WIDTH, GAME_HEIGHT } from '../core/constants';

export interface WeaponContext {
    world: bitECS.IWorld;
    isPassable: (gx: number, gy: number) => boolean;
    damageEnemy: (eid: number, amount: number) => void;
    makeNoise: (x: number, y: number, radius: number) => void;
    particles: any;
    sfx: any;
    input: any;
    updateUI: () => void;
}

export class WeaponSystem {
    private enemyQuery = bitECS.defineQuery([EnemyTag, Position, Health]);
    private isCharging = false;
    private chargeTimer = 0;
    private isChanneling = false;
    private channelTimer = 0;

    update(ctx: WeaponContext, shooter: any) {
        const { weaponType, chargeTime, weaponId } = shooter.computedStats;
        const maxCharge = chargeTime || 60;

        if (weaponType === 'charge') {
            if (ctx.input.mouse.clicked && !shooter.isReloading) {
                this.isCharging = true;
                this.chargeTimer = Math.min(maxCharge, this.chargeTimer + 1);

                // Auto-fire at max charge
                if (this.chargeTimer >= maxCharge) {
                    this.fireWeapon(ctx, shooter, 1.0, weaponId);
                    this.isCharging = false;
                    this.chargeTimer = 0;
                }
            } else if (this.isCharging) {
                const charge = this.chargeTimer / maxCharge;
                this.fireWeapon(ctx, shooter, charge, weaponId);
                this.isCharging = false;
                this.chargeTimer = 0;
            }
            ctx.updateUI();
        } else if (weaponType === 'channel') {
            const maxChannel = shooter.computedStats.channelMaxTime || 300;
            if (ctx.input.mouse.clicked && !shooter.isReloading) {
                this.isChanneling = true;
                this.channelTimer = Math.min(maxChannel, this.channelTimer + 1);

                // Continuous fire
                const charge = this.channelTimer / maxChannel;
                this.fireWeapon(ctx, shooter, charge, weaponId);
            } else {
                this.isChanneling = false;
                this.channelTimer = 0;
            }
            ctx.updateUI();
        }
    }

    private fireWeapon(ctx: WeaponContext, shooter: any, charge: number, weaponId: string) {
        if (weaponId === 'railgun') {
            this.fireRailgun(ctx, shooter, charge);
        } else if (weaponId === 'electrobolt') {
            this.fireElectrobolt(ctx, shooter, charge);
        }
    }

    public isCurrentlyCharging(): boolean {
        return this.isCharging;
    }

    public isCurrentlyChanneling(): boolean {
        return this.isChanneling;
    }

    public getChargeLevel(shooter: any): number {
        const stats = shooter?.computedStats;
        if (stats?.weaponType === 'channel') {
            const max = stats.channelMaxTime || 300;
            return this.channelTimer / max;
        }
        const maxCharge = stats?.chargeTime || 60;
        return this.chargeTimer / maxCharge;
    }

    fireRailgun(ctx: WeaponContext, shooter: any, charge: number) {
        const angle = shooter.angle;
        const startX = shooter.x + Math.cos(angle) * 15;
        const startY = shooter.y + Math.sin(angle) * 15;

        const maxDist = 10 + 400 * charge;
        const beamWidth = 6 + 14 * charge;
        let endX = startX + Math.cos(angle) * maxDist;
        let endY = startY + Math.sin(angle) * maxDist;

        // Raycast against walls
        const step = 4;
        const numSteps = Math.floor(maxDist / step);
        for (let i = 0; i < numSteps; i++) {
            const tx = startX + Math.cos(angle) * i * step;
            const ty = startY + Math.sin(angle) * i * step;
            const gx = Math.floor(tx / TILE_SIZE);
            const gy = Math.floor(ty / TILE_SIZE);

            if (tx < 0 || tx > GAME_WIDTH || ty < 0 || ty > GAME_HEIGHT || !ctx.isPassable(gx, gy)) {
                endX = tx; endY = ty;
                break;
            }
        }

        // Damage enemies on line
        const enemies = this.enemyQuery(ctx.world);
        for (let i = 0; i < enemies.length; i++) {
            const eid = enemies[i];
            const ex = Position.x[eid], ey = Position.y[eid];
            const d = Utils.distToSegment({ x: ex, y: ey }, { x: startX, y: startY }, { x: endX, y: endY });
            if (d < 15 + beamWidth / 2) {
                ctx.damageEnemy(eid, 2 + Math.floor(charge * 6));
                ctx.particles.spawn(ex, ey, 10, 2, 3);
            }
        }

        // Create ECS Laser entity
        const laserEid = bitECS.addEntity(ctx.world);
        bitECS.addComponent(ctx.world, LaserBeam, laserEid);
        LaserBeam.x1[laserEid] = startX;
        LaserBeam.y1[laserEid] = startY;
        LaserBeam.x2[laserEid] = endX;
        LaserBeam.y2[laserEid] = endY;
        LaserBeam.width[laserEid] = beamWidth;
        LaserBeam.life[laserEid] = 60;
        LaserBeam.maxLife[laserEid] = 60;

        // Apply knockback to shooter
        const knockIntensity = 4 + 10 * charge;
        shooter.knockbackX = Math.cos(angle + Math.PI) * knockIntensity;
        shooter.knockbackY = Math.sin(angle + Math.PI) * knockIntensity;

        ctx.particles.spawn(startX, startY, 25, 2, 4);
        ctx.sfx.explosion();
        ctx.makeNoise(shooter.x, shooter.y, 400);
    }

    fireElectrobolt(ctx: WeaponContext, shooter: any, chargeLevel: number) {
        const angle = shooter.angle;
        const startX = shooter.x + Math.cos(angle) * 15;
        const startY = shooter.y + Math.sin(angle) * 15;

        const isChannel = shooter.computedStats.weaponType === 'channel';
        // Base range + growth. Growth is faster when channeling (reaching max at 5s)
        const maxRange = isChannel ? (50 + 250 * chargeLevel) : (100 + 300 * chargeLevel);
        const jumpRange = 120;
        const maxJumps = 4;

        const points: { x: number, y: number }[] = [{ x: startX, y: startY }];
        const hitEnemies = new Set<number>();
        const enemies = this.enemyQuery(ctx.world);

        let currentX = startX;
        let currentY = startY;
        let currentAngle = angle;

        for (let j = 0; j < maxJumps; j++) {
            let bestTarget = -1;
            let targetX = 0, targetY = 0;
            let minDist = j === 0 ? maxRange : jumpRange;
            let hitWall = false;

            if (j === 0) {
                // Initial shot: look for enemy in cone
                for (let i = 0; i < enemies.length; i++) {
                    const eid = enemies[i];
                    const ex = Position.x[eid], ey = Position.y[eid];
                    const dist = Utils.dist(currentX, currentY, ex, ey);
                    if (dist < minDist) {
                        const angToEnemy = Math.atan2(ey - currentY, ex - currentX);
                        const diff = Math.abs(Utils.angleDiff(currentAngle, angToEnemy));
                        if (diff < 0.8) {
                            // Check for walls between start and enemy
                            const wallPoint = this.raycast(currentX, currentY, ex, ey, ctx);
                            if (!wallPoint) {
                                minDist = dist;
                                bestTarget = eid;
                                targetX = ex; targetY = ey;
                            } else {
                                // Wall is in the way, but we might hit it
                                const wallDist = Utils.dist(currentX, currentY, wallPoint.x, wallPoint.y);
                                if (wallDist < minDist) {
                                    hitWall = true;
                                    targetX = wallPoint.x; targetY = wallPoint.y;
                                    minDist = wallDist;
                                }
                            }
                        }
                    }
                }

                // If no enemy in cone, check if we hit a wall in front
                if (bestTarget === -1 && !hitWall) {
                    const endX = currentX + Math.cos(currentAngle) * maxRange;
                    const endY = currentY + Math.sin(currentAngle) * maxRange;
                    const wallPoint = this.raycast(currentX, currentY, endX, endY, ctx);
                    if (wallPoint) {
                        hitWall = true;
                        targetX = wallPoint.x; targetY = wallPoint.y;
                    } else {
                        // Just a fizzle line
                        const fizzleDist = isChannel ? maxRange : maxRange * 0.4;
                        targetX = currentX + Math.cos(currentAngle) * fizzleDist;
                        targetY = currentY + Math.sin(currentAngle) * fizzleDist;
                        points.push({ x: targetX, y: targetY });
                        break;
                    }
                }
            } else {
                // Chaining: look for nearest enemy from current point
                for (let i = 0; i < enemies.length; i++) {
                    const eid = enemies[i];
                    if (hitEnemies.has(eid)) continue;
                    const ex = Position.x[eid], ey = Position.y[eid];
                    const dist = Utils.dist(currentX, currentY, ex, ey);
                    if (dist < minDist) {
                        const wallPoint = this.raycast(currentX, currentY, ex, ey, ctx);
                        if (!wallPoint) {
                            minDist = dist;
                            bestTarget = eid;
                            targetX = ex; targetY = ey;
                        }
                    }
                }
            }

            if (bestTarget !== -1 || hitWall) {
                points.push({ x: targetX, y: targetY });
                currentX = targetX;
                currentY = targetY;

                if (bestTarget !== -1) {
                    hitEnemies.add(bestTarget);

                    // Damage logic
                    if (isChannel) {
                        // Channeling damage: small amounts frequently
                        // Only damage every 10 frames of channeling per enemy (or similar)
                        // For simplicity, damage every frame but very little? No, ECS Health is usually int.
                        // Let's use a timer check or just damage every 12 frames.
                        if (this.channelTimer % 12 === 0) {
                            ctx.damageEnemy(bestTarget, 1);
                            ctx.particles.spawn(targetX, targetY, 5, 1, 2);
                        }
                    } else {
                        ctx.damageEnemy(bestTarget, 1 + Math.floor(chargeLevel * 2));
                        ctx.particles.spawn(targetX, targetY, 15, 1, 4);
                    }
                } else {
                    ctx.particles.spawn(targetX, targetY, isChannel ? 2 : 8, 1, 2);
                }

                if (bestTarget === -1 && hitWall && j > 0) break;
            } else {
                break;
            }
        }

        // Create ECS Lightning entity
        const lightningEid = bitECS.addEntity(ctx.world);
        bitECS.addComponent(ctx.world, LightningChain, lightningEid);
        LightningChain.count[lightningEid] = points.length;
        for (let i = 0; i < points.length; i++) {
            LightningChain.pointsX[lightningEid][i] = points[i].x;
            LightningChain.pointsY[lightningEid][i] = points[i].y;
        }
        // Channeling bolts are very short lived for flickery look
        const life = isChannel ? 2 : 30;
        LightningChain.life[lightningEid] = life;
        LightningChain.maxLife[lightningEid] = life;

        if (!isChannel) {
            ctx.sfx.explosion();
            ctx.makeNoise(shooter.x, shooter.y, 300);
        } else if (this.channelTimer % 20 === 0) {
            // Quieter noise/sfx for channeling
            ctx.makeNoise(shooter.x, shooter.y, 150);
        }
    }

    private raycast(x1: number, y1: number, x2: number, y2: number, ctx: WeaponContext): { x: number, y: number } | null {
        const dist = Utils.dist(x1, y1, x2, y2);
        const steps = Math.ceil(dist / 4);
        const dx = (x2 - x1) / steps;
        const dy = (y2 - y1) / steps;

        for (let i = 1; i <= steps; i++) {
            const tx = x1 + dx * i;
            const ty = y1 + dy * i;
            const gx = Math.floor(tx / TILE_SIZE);
            const gy = Math.floor(ty / TILE_SIZE);

            if (tx < 0 || tx > GAME_WIDTH || ty < 0 || ty > GAME_HEIGHT || !ctx.isPassable(gx, gy)) {
                return { x: tx, y: ty };
            }
        }
        return null;
    }
}
