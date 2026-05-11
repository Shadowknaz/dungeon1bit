import { FIXED_TIMESTEP_MS, MAX_FRAME_TIME_MS, GAME_SPEED } from './constants';

export class GameLoop {
    private accumulator = 0;
    private lastTime = 0;
    private onTick: () => void;
    private onRender: (alpha: number) => void;
    private animationFrameId: number | null = null;
    
    private fps = 0;
    private fpsCounter = 0;
    private fpsTimer = 0;

    constructor(onTick: () => void, onRender: (alpha: number) => void) {
        this.onTick = onTick;
        this.onRender = onRender;
    }

    public start() {
        this.stop();
        this.lastTime = performance.now();
        this.animationFrameId = requestAnimationFrame(this.loop);
    }

    public stop() {
        if (this.animationFrameId !== null) {
            cancelAnimationFrame(this.animationFrameId);
            this.animationFrameId = null;
        }
    }

    private loop = (now: number) => {
        const frameTime = Math.min(now - this.lastTime, MAX_FRAME_TIME_MS);
        this.lastTime = now;
        this.accumulator += frameTime * GAME_SPEED;

        // FPS tracking
        this.fpsCounter++;
        this.fpsTimer += frameTime;
        if (this.fpsTimer >= 1000) {
            this.fps = this.fpsCounter;
            this.fpsCounter = 0;
            this.fpsTimer = 0;
        }

        // Logical ticks at fixed rate
        while (this.accumulator >= FIXED_TIMESTEP_MS) {
            this.onTick();
            this.accumulator -= FIXED_TIMESTEP_MS;
        }

        // Render with interpolation alpha
        const alpha = this.accumulator / FIXED_TIMESTEP_MS;
        this.onRender(alpha);

        this.animationFrameId = requestAnimationFrame(this.loop);
    }

    public getFPS(): number {
        return this.fps;
    }
}
