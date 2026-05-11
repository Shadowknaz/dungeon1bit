import { Utils } from './physics';
import { Point, Projectile } from '../domain/types';

/**
 * Модификаторы боя на основе света
 */
export interface LightCombatModifier {
    accuracyModifier: number;  // Множитель на точность попадания
    damageModifier: number;    // Множитель на урон
    detectionChance: number;   // Вероятность обнаружения враг (0-1)
}

export class CombatSystem {
    constructor(
        private sfx: any,
        private _addFloatingText: (x: number, y: number, text: string, color?: string) => void,
        private makeNoise: (x: number, y: number, radius: number) => void
    ) {}

    /**
     * Рассчитать модификаторы боя на основе освещенности
     * @param lightLevel уровень света (0-1)
     * @returns модификаторы боя
     */
    calculateLightModifiers(lightLevel: number): LightCombatModifier {
        // Точность: в свете лучше видно, поэтому лучше точность
        // В тени сложнее попасть, но можно скрываться
        const accuracyModifier = 0.6 + lightLevel * 0.8; // 0.6-1.4 диапазон
        
        // Урон в тени немного выше (преимущество скрытности)
        // Но общий урон в свете может быть немного выше из-за лучшей видимости
        const damageModifier = 0.95 + (1 - lightLevel) * 0.15; // 0.95-1.1 диапазон, инвертировано для тени
        
        // Вероятность обнаружения врагом при стрельбе
        // В тьме меньше вероятность быть замеченным
        // На свету высокая вероятность
        const detectionChance = 0.3 + lightLevel * 0.7; // 0.3-1.0 диапазон
        
        return {
            accuracyModifier,
            damageModifier,
            detectionChance
        };
    }

    /**
     * Применить модификаторы света к броску атаки
     * @param baseAccuracy базовая точность (0-1)
     * @param lightLevel уровень света
     * @returns модифицированная точность
     */
    applyLightToAccuracy(baseAccuracy: number, lightLevel: number): number {
        const modifiers = this.calculateLightModifiers(lightLevel);
        return baseAccuracy * modifiers.accuracyModifier;
    }

    /**
     * Применить модификаторы света к урону
     * @param baseDamage базовый урон
     * @param lightLevel уровень света
     * @returns модифицированный урон
     */
    applyLightToDamage(baseDamage: number, lightLevel: number): number {
        const modifiers = this.calculateLightModifiers(lightLevel);
        return baseDamage * modifiers.damageModifier;
    }

    /**
     * Проверить, будет ли враг обнаружен после выстрела
     * @param lightLevel уровень света
     * @param randomChance опциональное значение для детерминированного тестирования
     * @returns true если враг обнаружил игрока
     */
    willPlayerBeDetected(lightLevel: number, randomChance?: number): boolean {
        const modifiers = this.calculateLightModifiers(lightLevel);
        const roll = randomChance ?? Math.random();
        return roll < modifiers.detectionChance;
    }

    calculateSpread(baseSpread: number, consecutiveShots: number): number {
        return baseSpread + (consecutiveShots * 0.05);
    }

    spawnProjectiles(
        origin: Point,
        angle: number,
        stats: { projectiles: number, spreadAngle: number, projectileLifetime?: number },
        consecutiveShots: number,
        radius: number,
        isEnemy: boolean = false,
        projectileSpeed?: number
    ): Projectile[] {
        const projectiles: Projectile[] = [];
        const projs = stats.projectiles || 1;
        const spread = this.calculateSpread(stats.spreadAngle || 0, consecutiveShots);
        const startOffset = - (projs - 1) * spread / 2;
        const speed = projectileSpeed || (isEnemy ? 2.2 : 3.5);
        const lifetime = stats.projectileLifetime || 180;

        for (let i = 0; i < projs; i++) {
            const jitter = (Math.random() - 0.5) * spread * 0.5;
            const finalAngle = angle + startOffset + (i * spread) + jitter;
            projectiles.push({
                id: Math.random(),
                x: origin.x + Math.cos(finalAngle) * radius,
                y: origin.y + Math.sin(finalAngle) * radius,
                vx: Math.cos(finalAngle) * speed,
                vy: Math.sin(finalAngle) * speed,
                isEnemy,
                radius: isEnemy ? 4 : 3,
                damage: 1,
                type: isEnemy ? 'enemy' : 'player',
                lifetime
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
