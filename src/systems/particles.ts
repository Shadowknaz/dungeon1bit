import { SpriteCache } from '../core/spriteCache';

// Типы частиц
export enum ParticleType {
    SMOKE = 0,        // Дым (спрайт)
    DUST = 1,         // Пыль (круг)
    SPARK = 2,        // Искра (квадрат)
    ASH = 3,          // Пепел (маленькие частицы, падают вниз)
    BLOOD = 4,        // Кровь (красные капли)
    FOOTSTEP = 5,     // След от шага (исчезает медленно)
    EMBER = 6,        // Угли (мерцающие)
    STEAM = 7,        // Пар (поднимается вверх)
    EXPLOSION = 8,    // Взрыв (быстрые оранжевые круги)
    FLASH = 9         // Вспышка (быстрые белые круги)
}

export interface TrailPoint {
    x: number;
    y: number;
    life: number;
}

export class ParticleSystem {
    private readonly MAX = 2000;
    private count = 0;
    private x: Float32Array;
    private y: Float32Array;
    private vx: Float32Array;
    private vy: Float32Array;
    private life: Float32Array;
    private decay: Float32Array;
    private type: Uint8Array;
    private size: Float32Array;
    private color: Uint32Array; // Для цветных частиц (кровь и т.д.)
    
    // Trail эффекты для снарядов
    private trails: Map<string, TrailPoint[]> = new Map();

    constructor() {
        this.x = new Float32Array(this.MAX);
        this.y = new Float32Array(this.MAX);
        this.vx = new Float32Array(this.MAX);
        this.vy = new Float32Array(this.MAX);
        this.life = new Float32Array(this.MAX);
        this.decay = new Float32Array(this.MAX);
        this.type = new Uint8Array(this.MAX);
        this.size = new Float32Array(this.MAX);
        this.color = new Uint32Array(this.MAX);
    }

    spawn(px: number, py: number, count: number, type: ParticleType = ParticleType.SMOKE, size: number = 4, color?: string): void {
        for (let i = 0; i < count; i++) {
            if (this.count >= this.MAX) return;
            const idx = this.count++;
            this.x[idx] = px;
            this.y[idx] = py;
            
            // Разные скорости для разных типов
            switch (type) {
                case ParticleType.ASH:
                    this.vx[idx] = (Math.random() - 0.5) * 2;
                    this.vy[idx] = Math.random() * 2; // Падает вниз
                    this.decay[idx] = 0.01 + Math.random() * 0.02;
                    break;
                case ParticleType.BLOOD:
                    this.vx[idx] = (Math.random() - 0.5) * 4;
                    this.vy[idx] = (Math.random() - 0.5) * 4;
                    this.decay[idx] = 0.03 + Math.random() * 0.05;
                    break;
                case ParticleType.FOOTSTEP:
                    this.vx[idx] = 0;
                    this.vy[idx] = 0;
                    this.decay[idx] = 0.005; // Медленно исчезает
                    break;
                case ParticleType.EMBER:
                    this.vx[idx] = (Math.random() - 0.5) * 1;
                    this.vy[idx] = -Math.random() * 2; // Поднимается
                    this.decay[idx] = 0.02 + Math.random() * 0.03;
                    break;
                case ParticleType.STEAM:
                    this.vx[idx] = (Math.random() - 0.5) * 1;
                    this.vy[idx] = -1 - Math.random(); // Быстро поднимается
                    this.decay[idx] = 0.04 + Math.random() * 0.04;
                    break;
                case ParticleType.EXPLOSION:
                    const angE = Math.random() * Math.PI * 2;
                    const velE = (1 + Math.random() * 3) * 0.5; // Reduced for 2-3 tile spread and slowed down
                    this.vx[idx] = Math.cos(angE) * velE;
                    this.vy[idx] = Math.sin(angE) * velE;
                    this.decay[idx] = (0.01 + Math.random() * 0.02) * 0.5; 
                    break;
                case ParticleType.FLASH:
                    const angF = Math.random() * Math.PI * 2;
                    const velF = (2 + Math.random() * 4) * 0.5; // Reduced and slowed
                    this.vx[idx] = Math.cos(angF) * velF;
                    this.vy[idx] = Math.sin(angF) * velF;
                    this.decay[idx] = (0.02 + Math.random() * 0.05) * 0.5;
                    break;
                default:
                    this.vx[idx] = (Math.random() - 0.5) * 6;
                    this.vy[idx] = (Math.random() - 0.5) * 6;
                    this.decay[idx] = 0.02 + Math.random() * 0.05;
            }
            
            this.life[idx] = 1.0;
            this.type[idx] = type;
            this.size[idx] = size + Math.random() * size;
            
            // Цвет для специальных частиц
            if (color) {
                this.color[idx] = this.hexToUint32(color);
            } else if (type === ParticleType.BLOOD) {
                this.color[idx] = this.hexToUint32('#ff3333');
            } else {
                this.color[idx] = this.hexToUint32('#ffffff');
            }
        }
    }

    /**
     * Добавить точку в trail для снаряда
     */
    addTrailPoint(projectileId: string, x: number, y: number): void {
        if (!this.trails.has(projectileId)) {
            this.trails.set(projectileId, []);
        }
        const trail = this.trails.get(projectileId)!;
        trail.push({ x, y, life: 1.0 });
        
        // Ограничиваем длину trail
        if (trail.length > 20) {
            trail.shift();
        }
    }

    /**
     * Удалить trail для снаряда
     */
    removeTrail(projectileId: string): void {
        this.trails.delete(projectileId);
    }

    /**
     * Спавнит кровь при ударе
     */
    spawnBlood(x: number, y: number, count: number = 5): void {
        this.spawn(x, y, count, ParticleType.BLOOD, 3, '#ff3333');
    }

    /**
     * Спавнит пепел
     */
    spawnAsh(x: number, y: number, count: number = 3): void {
        this.spawn(x, y, count, ParticleType.ASH, 2);
    }

    /**
     * Спавнит след от шага
     */
    spawnFootstep(x: number, y: number): void {
        this.spawn(x, y, 1, ParticleType.FOOTSTEP, 6);
    }

    /**
     * Спавнит угли
     */
    spawnEmber(x: number, y: number, count: number = 3): void {
        this.spawn(x, y, count, ParticleType.EMBER, 2);
    }

    /**
     * Спавнит пар
     */
    spawnSteam(x: number, y: number, count: number = 5): void {
        this.spawn(x, y, count, ParticleType.STEAM, 4);
    }

    spawnExplosion(x: number, y: number): void {
        this.spawn(x, y, 120, ParticleType.EXPLOSION, 3, '#ffffff');
        this.spawn(x, y, 80, ParticleType.SMOKE, 5, '#888888');
    }

    spawnFlash(x: number, y: number): void {
        this.spawn(x, y, 150, ParticleType.FLASH, 4, '#ffffff');
        this.spawn(x, y, 60, ParticleType.STEAM, 8, '#cccccc');
    }

    spawnWallDebris(x: number, y: number): void {
        this.spawn(x, y, 15, ParticleType.ASH, 3, '#888888');
        this.spawn(x, y, 10, ParticleType.SMOKE, 4, '#666666');
    }

    private hexToUint32(hex: string): number {
        const r = parseInt(hex.slice(1, 3), 16);
        const g = parseInt(hex.slice(3, 5), 16);
        const b = parseInt(hex.slice(5, 7), 16);
        return (r << 16) | (g << 8) | b;
    }

    private uint32ToHex(color: number): string {
        const r = (color >> 16) & 0xff;
        const g = (color >> 8) & 0xff;
        const b = color & 0xff;
        return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
    }

    update(): void {
        // Обновляем частицы
        for (let i = this.count - 1; i >= 0; i--) {
            this.x[i] += this.vx[i];
            this.y[i] += this.vy[i];
            this.life[i] -= this.decay[i];

            if (this.life[i] <= 0) {
                this.count--;
                const last = this.count;
                if (i !== last) {
                    this.x[i] = this.x[last];
                    this.y[i] = this.y[last];
                    this.vx[i] = this.vx[last];
                    this.vy[i] = this.vy[last];
                    this.life[i] = this.life[last];
                    this.decay[i] = this.decay[last];
                    this.type[i] = this.type[last];
                    this.size[i] = this.size[last];
                    this.color[i] = this.color[last];
                }
            }
        }

        // Обновляем trails
        this.trails.forEach((trail, id) => {
            for (let i = trail.length - 1; i >= 0; i--) {
                trail[i].life -= 0.05;
                if (trail[i].life <= 0) {
                    trail.splice(i, 1);
                }
            }
            if (trail.length === 0) {
                this.trails.delete(id);
            }
        });
    }

    draw(ctx: CanvasRenderingContext2D, cache: SpriteCache): void {
        // Рисуем trails
        this.trails.forEach(trail => {
            if (trail.length < 2) return;
            
            ctx.beginPath();
            ctx.moveTo(trail[0].x, trail[0].y);
            
            for (let i = 1; i < trail.length; i++) {
                ctx.lineTo(trail[i].x, trail[i].y);
            }
            
            ctx.strokeStyle = '#ffffff';
            ctx.lineWidth = 2;
            ctx.globalAlpha = 0.5;
            ctx.stroke();
            ctx.globalAlpha = 1.0;
        });

        // Рисуем частицы
        for (let i = 0; i < this.count; i++) {
            const life = this.life[i];
            const size = this.size[i] * life;
            const type = this.type[i];
            
            ctx.globalAlpha = life;
            ctx.fillStyle = this.uint32ToHex(this.color[i]);

            if (type === ParticleType.SMOKE) {
                const sprite = cache.get('fx_particle_0');
                if (sprite) {
                    ctx.drawImage(sprite, this.x[i] - sprite.width / 2, this.y[i] - sprite.height / 2);
                }
            } else if (type === ParticleType.DUST) {
                ctx.beginPath();
                ctx.arc(this.x[i], this.y[i], size, 0, Math.PI * 2);
                ctx.fill();
            } else if (type === ParticleType.SPARK) {
                ctx.fillRect(this.x[i] - size/2, this.y[i] - size/2, size, size);
            } else if (type === ParticleType.ASH) {
                // Маленькие серые частицы
                ctx.fillStyle = '#888888';
                ctx.fillRect(this.x[i] - size/2, this.y[i] - size/2, size, size);
            } else if (type === ParticleType.BLOOD) {
                // Красные капли
                ctx.fillStyle = this.uint32ToHex(this.color[i]);
                ctx.beginPath();
                ctx.arc(this.x[i], this.y[i], size, 0, Math.PI * 2);
                ctx.fill();
            } else if (type === ParticleType.FOOTSTEP) {
                // След от шага (овал)
                ctx.fillStyle = '#444444';
                ctx.beginPath();
                ctx.ellipse(this.x[i], this.y[i], size, size * 0.6, 0, 0, Math.PI * 2);
                ctx.fill();
            } else if (type === ParticleType.EMBER) {
                // Мерцающие угли
                const flicker = Math.random() > 0.5 ? '#ff6600' : '#ff3300';
                ctx.fillStyle = flicker;
                ctx.fillRect(this.x[i] - size/2, this.y[i] - size/2, size, size);
            } else if (type === ParticleType.STEAM) {
                // Пар (полупрозрачные круги)
                ctx.fillStyle = '#cccccc';
                ctx.beginPath();
                ctx.arc(this.x[i], this.y[i], size, 0, Math.PI * 2);
                ctx.fill();
            } else if (type === ParticleType.EXPLOSION) {
                const r = Math.random();
                ctx.fillStyle = r > 0.5 ? '#ffffff' : '#888888'; // White and Grey gradient
                ctx.beginPath();
                ctx.arc(this.x[i], this.y[i], size, 0, Math.PI * 2);
                ctx.fill();
            } else if (type === ParticleType.FLASH) {
                const r = Math.random();
                ctx.fillStyle = r > 0.7 ? '#ffffff' : '#bbbbbb';
                ctx.beginPath();
                ctx.arc(this.x[i], this.y[i], size, 0, Math.PI * 2);
                ctx.fill();
            }
        }
        ctx.globalAlpha = 1.0;
    }

    reset(): void {
        this.count = 0;
        this.trails.clear();
    }
}
