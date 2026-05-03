import { GAME_WIDTH, GAME_HEIGHT, TILE_SIZE, MAP_COLS, MAP_ROWS } from '../core/constants';
import { Point } from '../systems/physics';
import { SpriteCache } from '../core/spriteCache';

export class RenderSystem {
    private ditherPattern: CanvasPattern | null = null;
    private staticCanvas: HTMLCanvasElement;
    private sCtx: CanvasRenderingContext2D;

    constructor(private ctx: CanvasRenderingContext2D, private spriteCache: SpriteCache) {
        this.staticCanvas = document.createElement('canvas');
        this.staticCanvas.width = GAME_WIDTH;
        this.staticCanvas.height = GAME_HEIGHT;
        this.sCtx = this.staticCanvas.getContext('2d', { alpha: false })!;
        
        // Disable smoothing for crisp pixels
        this.ctx.imageSmoothingEnabled = false;
        this.sCtx.imageSmoothingEnabled = false;
        
        this.initDither();
    }

    private initDither() {
        const ditherCanvas = document.createElement('canvas');
        ditherCanvas.width = 4;
        ditherCanvas.height = 4;
        const dCtx = ditherCanvas.getContext('2d', { alpha: false })!;
        dCtx.fillStyle = '#000'; dCtx.fillRect(0, 0, 4, 4);
        dCtx.fillStyle = '#fff'; dCtx.fillRect(0, 0, 2, 2); dCtx.fillRect(2, 2, 2, 2);

        const ditherPatternCanvas = document.createElement('canvas');
        ditherPatternCanvas.width = 4;
        ditherPatternCanvas.height = 4;
        const dpCtx = ditherPatternCanvas.getContext('2d')!;
        dpCtx.globalAlpha = 0.25;
        dpCtx.drawImage(ditherCanvas, 0, 0);
        this.ditherPattern = this.ctx.createPattern(ditherPatternCanvas, 'repeat');
    }

    private getWallMask(x: number, y: number, grid: number[][]): string {
        let mask = 0;
        if (y > 0 && grid[x][y - 1] === 1) mask |= 0b0001; // Up
        if (x < MAP_COLS - 1 && grid[x + 1][y] === 1) mask |= 0b0010; // Right
        if (y < MAP_ROWS - 1 && grid[x][y + 1] === 1) mask |= 0b0100; // Down
        if (x > 0 && grid[x - 1][y] === 1) mask |= 0b1000; // Left
        return mask.toString(2).padStart(4, '0');
    }

    public updateStaticLayer(grid: number[][], secretDoors: Point[], secretRoomOpen: boolean, secretRoomCells: {gx: number, gy: number}[]) {
        this.sCtx.fillStyle = '#181818'; // Dark gray background for contrast
        this.sCtx.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);

        for (let x = 0; x < MAP_COLS; x++) {
            for (let y = 0; y < MAP_ROWS; y++) {
                const px = x * TILE_SIZE;
                const py = y * TILE_SIZE;
                
                const isSecDoor = secretDoors.some(d => d.x === x && d.y === y);
                const isSecret = secretRoomCells.some(c => c.gx === x && c.gy === y);
                let isWall = grid[x][y] === 1;
                
                if (isSecDoor && secretRoomOpen) isWall = false;

                if (isWall) {
                    const mask = this.getWallMask(x, y, grid);
                    const sprite = this.spriteCache.get(`tile_wall_${mask}`) || this.spriteCache.get('tile_wall_1111');
                    if (sprite) {
                        this.sCtx.drawImage(sprite, px, py, TILE_SIZE, TILE_SIZE);
                    }
                } else {
                    const sprite = isSecret ? this.spriteCache.get('tile_floor_secret') : this.spriteCache.get('tile_floor');
                    if (sprite) {
                        this.sCtx.drawImage(sprite, px, py, TILE_SIZE, TILE_SIZE);
                    }
                }
            }
        }
    }

    public drawShadow(x: number, y: number, radius: number) {
        this.ctx.fillStyle = '#000000';
        this.ctx.beginPath();
        this.ctx.ellipse(x, y + radius * 0.5, radius, radius * 0.4, 0, 0, Math.PI * 2);
        this.ctx.fill();
    }

    public drawText1bit(text: string, x: number, y: number, fg = '#fff', outline = '#000') {
        this.ctx.miterLimit = 2;
        this.ctx.lineJoin = 'round';
        this.ctx.strokeStyle = outline;
        this.ctx.lineWidth = 3;
        this.ctx.strokeText(text, x, y);
        this.ctx.fillStyle = fg;
        this.ctx.fillText(text, x, y);
    }

    public clear() {
        this.ctx.fillStyle = '#181818';
        this.ctx.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);
    }

    public drawStaticLayer() {
        this.ctx.drawImage(this.staticCanvas, 0, 0);
    }

    public drawDitherOverlay(visibleCells: Record<string, boolean>, explored: boolean[][], seeAllMap: boolean) {
        if (seeAllMap) return;
        for (let x = 0; x < MAP_COLS; x++) {
            for (let y = 0; y < MAP_ROWS; y++) {
                if (!visibleCells[`${x},${y}`]) {
                    this.ctx.fillStyle = explored[x][y] ? this.ditherPattern! : '#000';
                    this.ctx.fillRect(x * TILE_SIZE, y * TILE_SIZE, TILE_SIZE, TILE_SIZE);
                }
            }
        }
    }
}

