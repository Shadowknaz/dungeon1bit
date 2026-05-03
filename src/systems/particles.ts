import { SpriteCache } from '../core/spriteCache';

export class ParticleSystem {
    private readonly MAX = 2000;
    private count = 0;
    private x: Float32Array;
    private y: Float32Array;
    private vx: Float32Array;
    private vy: Float32Array;
    private life: Float32Array;
    private decay: Float32Array;
    private type: Uint8Array; // 0: sprite smoke, 1: geometric circle (dust), 2: geometric square (spark)
    private size: Float32Array;

    constructor() {
        this.x = new Float32Array(this.MAX);
        this.y = new Float32Array(this.MAX);
        this.vx = new Float32Array(this.MAX);
        this.vy = new Float32Array(this.MAX);
        this.life = new Float32Array(this.MAX);
        this.decay = new Float32Array(this.MAX);
        this.type = new Uint8Array(this.MAX);
        this.size = new Float32Array(this.MAX);
    }

    spawn(px: number, py: number, count: number, type: number = 0, size: number = 4): void {
        for (let i = 0; i < count; i++) {
            if (this.count >= this.MAX) return;
            const idx = this.count++;
            this.x[idx] = px;
            this.y[idx] = py;
            this.vx[idx] = (Math.random() - 0.5) * 6;
            this.vy[idx] = (Math.random() - 0.5) * 6;
            this.life[idx] = 1.0;
            this.decay[idx] = 0.02 + Math.random() * 0.05;
            this.type[idx] = type;
            this.size[idx] = size + Math.random() * size;
        }
    }

    update(): void {
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
                }
            }
        }
    }

    draw(ctx: CanvasRenderingContext2D, cache: SpriteCache): void {
        for (let i = 0; i < this.count; i++) {
            const life = this.life[i];
            const size = this.size[i] * life;
            
            ctx.globalAlpha = life;
            ctx.fillStyle = '#ffffff';

            if (this.type[i] === 0) {
                const sprite = cache.get('particle_smoke');
                if (sprite) {
                    ctx.drawImage(sprite, this.x[i] - sprite.width / 2, this.y[i] - sprite.height / 2);
                }
            } else if (this.type[i] === 1) { // Dust (Circle)
                ctx.beginPath();
                ctx.arc(this.x[i], this.y[i], size, 0, Math.PI * 2);
                ctx.fill();
            } else if (this.type[i] === 2) { // Spark (Square)
                ctx.fillRect(this.x[i] - size/2, this.y[i] - size/2, size, size);
            }
        }
        ctx.globalAlpha = 1.0;
    }

    reset(): void {
        this.count = 0;
    }
}
