import { Point } from './physics';

export interface Projectile extends Point {
    vx: number;
    vy: number;
    isEnemy: boolean;
    radius: number;
}

export class CombatSystem {
    constructor(
        private sfx: any,
        private addFloatingText: (x: number, y: number, text: string, color?: string) => void,
        private makeNoise: (x: number, y: number, radius: number) => void
    ) {}

    calculateSpread(baseSpread: number, consecutiveShots: number): number {
        return baseSpread + (consecutiveShots * 0.05);
    }

    spawnProjectiles(
        origin: Point,
        angle: number,
        stats: { projectiles: number, spreadAngle: number },
        consecutiveShots: number,
        radius: number,
        isEnemy: boolean = false
    ): Projectile[] {
        const projectiles: Projectile[] = [];
        const projs = stats.projectiles || 1;
        const spread = this.calculateSpread(stats.spreadAngle || 0, consecutiveShots);
        const startOffset = - (projs - 1) * spread / 2;

        for (let i = 0; i < projs; i++) {
            const jitter = (Math.random() - 0.5) * spread * 0.5;
            const finalAngle = angle + startOffset + (i * spread) + jitter;
            projectiles.push({
                x: origin.x + Math.cos(finalAngle) * radius,
                y: origin.y + Math.sin(finalAngle) * radius,
                vx: Math.cos(finalAngle) * (isEnemy ? 1 : 5),
                vy: Math.sin(finalAngle) * (isEnemy ? 1 : 5),
                isEnemy,
                radius: isEnemy ? 4 : 3
            });
        }

        if (!isEnemy) {
            this.sfx.playerShoot();
            this.makeNoise(origin.x, origin.y, 300);
        } else {
            this.sfx.enemyShoot();
        }

        return projectiles;
    }
}
