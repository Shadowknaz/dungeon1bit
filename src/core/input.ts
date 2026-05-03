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
    };

    public mouse = {
        x: 0,
        y: 0,
        clicked: false,
    };

    constructor(private canvas: HTMLCanvasElement) {
        window.addEventListener('keydown', this.handleKeyDown);
        window.addEventListener('keyup', this.handleKeyUp);
        this.canvas.addEventListener('mousemove', this.handleMouseMove);
        this.canvas.addEventListener('mousedown', this.handleMouseDown);
        this.canvas.addEventListener('mouseup', this.handleMouseUp);
        this.canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    }

    private handleKeyDown = (e: KeyboardEvent) => {
        if (e.code in this.keys) {
            this.keys[e.code] = true;
        }
    };

    private handleKeyUp = (e: KeyboardEvent) => {
        if (e.code in this.keys) {
            this.keys[e.code] = false;
        }
    };

    private handleMouseMove = (e: MouseEvent) => {
        const rect = this.canvas.getBoundingClientRect();
        this.mouse.x = (e.clientX - rect.left) * (this.canvas.width / rect.width);
        this.mouse.y = (e.clientY - rect.top) * (this.canvas.height / rect.height);
    };

    private handleMouseDown = (e: MouseEvent) => {
        if (e.button === 0) this.mouse.clicked = true;
    };

    private handleMouseUp = (e: MouseEvent) => {
        if (e.button === 0) this.mouse.clicked = false;
    };

    public cleanup() {
        window.removeEventListener('keydown', this.handleKeyDown);
        window.removeEventListener('keyup', this.handleKeyUp);
        this.canvas.removeEventListener('mousemove', this.handleMouseMove);
        this.canvas.removeEventListener('mousedown', this.handleMouseDown);
        this.canvas.removeEventListener('mouseup', this.handleMouseUp);
    }
}
