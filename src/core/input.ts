import { AudioEngine } from './audio';
export type KeyCode = 'KeyW' | 'KeyA' | 'KeyS' | 'KeyD' | 'KeyE' | 'KeyR' | 'Tab' | 'Space';

export class InputHandler {
    public keys: Record<string, boolean> = {
        KeyW: false,
        KeyA: false,
        KeyS: false,
        KeyD: false,
        KeyE: false,
        KeyR: false,
        Tab: false,
        Space: false,
        KeyG: false,
        KeyF: false,
        KeyP: false,
    };

    public justPressed: Record<string, boolean> = { ...this.keys };

    public mouse = {
        x: 0,
        y: 0,
        clicked: false,
    };

    public clickBuffer: {x: number, y: number}[] = [];

    constructor(private canvas: HTMLCanvasElement) {
        window.addEventListener('keydown', this.handleKeyDown);
        window.addEventListener('keyup', this.handleKeyUp);
        window.addEventListener('pointermove', this.handlePointerMove);
        window.addEventListener('pointerdown', this.handlePointerDown);
        window.addEventListener('pointerup', this.handlePointerUp);
        this.canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    }

    private handleKeyDown = (e: KeyboardEvent) => {
        if (e.code in this.keys) {
            if (!this.keys[e.code]) {
                this.justPressed[e.code] = true;
            }
            this.keys[e.code] = true;
        }
    };

    private handleKeyUp = (e: KeyboardEvent) => {
        if (e.code in this.keys) {
            this.keys[e.code] = false;
        }
    };

    private updateMousePos(e: PointerEvent) {
        const rect = this.canvas.getBoundingClientRect();
        this.mouse.x = (e.clientX - rect.left) * (this.canvas.width / rect.width);
        this.mouse.y = (e.clientY - rect.top) * (this.canvas.height / rect.height);
    }

    private handlePointerMove = (e: PointerEvent) => {
        this.updateMousePos(e);
    };

    private handlePointerDown = (e: PointerEvent) => {
        if (e.button === 0) {
            this.updateMousePos(e);
            this.mouse.clicked = true;
            this.clickBuffer.push({ x: this.mouse.x, y: this.mouse.y });
            AudioEngine.resume();
        }
    };

    private handlePointerUp = (e: PointerEvent) => {
        if (e.button === 0) {
            this.updateMousePos(e);
            this.mouse.clicked = false;
        }
    };

    public update() {
        for (const key in this.justPressed) {
            this.justPressed[key] = false;
        }
    }

    public consumeClick(): {x: number, y: number} | null {
        return this.clickBuffer.shift() || null;
    }

    public cleanup() {
        window.removeEventListener('keydown', this.handleKeyDown);
        window.removeEventListener('keyup', this.handleKeyUp);
        window.removeEventListener('pointermove', this.handlePointerMove);
        window.removeEventListener('pointerdown', this.handlePointerDown);
        window.removeEventListener('pointerup', this.handlePointerUp);
    }
}
