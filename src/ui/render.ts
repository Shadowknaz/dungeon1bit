import { GAME_WIDTH, GAME_HEIGHT, TILE_SIZE, MAP_COLS, MAP_ROWS } from '../core/constants';
import { Point } from '../systems/physics';
import { SpriteCache } from '../core/spriteCache';

export class RenderSystem {
    private ditherPattern: CanvasPattern | null = null;
    private ditherPatterns: Map<string, CanvasPattern> = new Map();
    private staticCanvas: HTMLCanvasElement;
    private sCtx: CanvasRenderingContext2D;
    private ctx: CanvasRenderingContext2D;

    constructor(ctx: CanvasRenderingContext2D, private spriteCache: SpriteCache) {
        this.ctx = ctx;
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
        // Создать несколько дизеринг паттернов для разных уровней света
        const patterns = ['light', 'medium', 'dark'];
        const intensities = [0.25, 0.5, 0.75];

        patterns.forEach((patternName, idx) => {
            const ditherCanvas = document.createElement('canvas');
            ditherCanvas.width = 4;
            ditherCanvas.height = 4;
            const dCtx = ditherCanvas.getContext('2d', { alpha: false })!;
            
            dCtx.fillStyle = '#000'; 
            dCtx.fillRect(0, 0, 4, 4);
            
            // Разные паттерны дизеринга для разных уровней света
            if (patternName === 'light') {
                // Минимальный дизеринг - редкие черные пиксели
                dCtx.fillStyle = '#333'; 
                dCtx.fillRect(0, 3, 1, 1); 
                dCtx.fillRect(2, 1, 1, 1);
            } else if (patternName === 'medium') {
                // Средний дизеринг - вероятностный паттерн
                dCtx.fillStyle = '#333'; 
                dCtx.fillRect(0, 0, 1, 1); 
                dCtx.fillRect(2, 1, 1, 1);
                dCtx.fillRect(1, 2, 1, 1); 
                dCtx.fillRect(3, 2, 1, 1);
                dCtx.fillRect(0, 3, 1, 1); 
                dCtx.fillRect(2, 3, 1, 1);
            } else {
                // Тяжелый дизеринг - густой паттерн для полутени
                dCtx.fillStyle = '#333'; 
                dCtx.fillRect(0, 0, 1, 1); 
                dCtx.fillRect(2, 0, 1, 1);
                dCtx.fillRect(1, 1, 1, 1);
                dCtx.fillRect(3, 1, 1, 1);
                dCtx.fillRect(0, 2, 1, 1); 
                dCtx.fillRect(2, 2, 1, 1);
                dCtx.fillRect(1, 3, 1, 1);
                dCtx.fillRect(3, 3, 1, 1);
            }

            const ditherPatternCanvas = document.createElement('canvas');
            ditherPatternCanvas.width = 4;
            ditherPatternCanvas.height = 4;
            const dpCtx = ditherPatternCanvas.getContext('2d')!;
            dpCtx.globalAlpha = intensities[idx];
            dpCtx.drawImage(ditherCanvas, 0, 0);
            const pattern = this.ctx.createPattern(ditherPatternCanvas, 'repeat');
            if (pattern) {
                this.ditherPatterns.set(patternName, pattern);
            }
        });

        // Основной паттерн дизеринга (по умолчанию средний)
        this.ditherPattern = this.ditherPatterns.get('medium') || null;
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
        // Градиентная тень для большей глубины
        const gradient = this.ctx.createRadialGradient(x, y + radius * 0.3, 0, x, y + radius * 0.5, radius);
        gradient.addColorStop(0, 'rgba(0, 0, 0, 0.4)');
        gradient.addColorStop(1, 'rgba(0, 0, 0, 0)');
        this.ctx.fillStyle = gradient;
        this.ctx.beginPath();
        this.ctx.ellipse(x, y + radius * 0.5, radius, radius * 0.4, 0, 0, Math.PI * 2);
        this.ctx.fill();
    }

    public drawText1bit(text: string, x: number, y: number, fg = '#fff', outline = '#000') {
        this.ctx.miterLimit = 2;
        this.ctx.lineJoin = 'round';
        
        // Добавляем свечение для текста
        this.ctx.shadowColor = fg;
        this.ctx.shadowBlur = 8;
        
        this.ctx.strokeStyle = outline;
        this.ctx.lineWidth = 3;
        this.ctx.strokeText(text, x, y);
        this.ctx.fillStyle = fg;
        this.ctx.fillText(text, x, y);
        
        // Сбрасываем тень
        this.ctx.shadowBlur = 0;
    }

    public clear() {
        this.ctx.fillStyle = '#181818';
        this.ctx.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);
    }

    public drawStaticLayer() {
        // Добавляем легкое свечение для статического слоя
        this.ctx.save();
        this.ctx.shadowColor = 'rgba(255, 255, 255, 0.1)';
        this.ctx.shadowBlur = 10;
        this.ctx.drawImage(this.staticCanvas, 0, 0);
        this.ctx.restore();
    }

    public drawDitherOverlay(
        isVisible: (x: number, y: number) => boolean,
        getLightLevel: (x: number, y: number) => number,
        explored: boolean[][],
        seeAllMap: boolean
    ) {
        if (seeAllMap) return;
        
        for (let x = 0; x < MAP_COLS; x++) {
            for (let y = 0; y < MAP_ROWS; y++) {
                const visible = isVisible(x, y);
                if (visible) continue;

                const light = getLightLevel(x, y);
                if (!explored[x][y]) {
                    // Полная чернота - неисследованная область
                    this.ctx.fillStyle = '#000';
                    this.ctx.fillRect(x * TILE_SIZE, y * TILE_SIZE, TILE_SIZE, TILE_SIZE);
                    continue;
                }

                // Динамический дизеринг в зависимости от уровня света
                if (light > 0.6) {
                    // Яркая полутень - легкое затемнение
                    this.ctx.fillStyle = 'rgba(0, 0, 0, 0.25)';
                } else if (light > 0.35) {
                    // Средняя полутень - модеральное затемнение
                    this.ctx.fillStyle = 'rgba(0, 0, 0, 0.45)';
                } else if (light > 0.15) {
                    // Темная полутень - сильное затемнение с дизерингом
                    const pattern = this.ditherPatterns.get('dark');
                    if (pattern) {
                        this.ctx.fillStyle = pattern;
                    } else {
                        this.ctx.fillStyle = 'rgba(0, 0, 0, 0.65)';
                    }
                } else {
                    // Почти полная тьма - полный дизеринг
                    this.ctx.fillStyle = 'rgba(0, 0, 0, 0.85)';
                }
                this.ctx.fillRect(x * TILE_SIZE, y * TILE_SIZE, TILE_SIZE, TILE_SIZE);
            }
        }
    }

    /**
     * Применить эффект вспышки (инверсия цветов для магических эффектов)
     */
    public drawFlashEffect(x: number, y: number, radius: number, intensity: number) {
        this.ctx.save();
        this.ctx.globalCompositeOperation = 'lighten';
        
        const gradient = this.ctx.createRadialGradient(x, y, 0, x, y, radius * TILE_SIZE);
        gradient.addColorStop(0, `rgba(255, 255, 255, ${intensity})`);
        gradient.addColorStop(1, `rgba(255, 255, 255, 0)`);
        
        this.ctx.fillStyle = gradient;
        this.ctx.beginPath();
        this.ctx.arc(x, y, radius * TILE_SIZE, 0, Math.PI * 2);
        this.ctx.fill();
        
        this.ctx.restore();
    }

    /**
     * Применить эффект локальной инверсии для обозначения сверхъярких источников
     */
    public drawBrightFlash(x: number, y: number, radius: number) {
        this.ctx.save();
        this.ctx.globalCompositeOperation = 'screen';
        
        this.ctx.fillStyle = '#fff';
        this.ctx.globalAlpha = 0.3;
        this.ctx.beginPath();
        this.ctx.arc(x, y, radius * TILE_SIZE, 0, Math.PI * 2);
        this.ctx.fill();
        
        this.ctx.restore();
    }
}

