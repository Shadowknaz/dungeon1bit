import { GAME_WIDTH, GAME_HEIGHT, TILE_SIZE, MAP_COLS, MAP_ROWS } from '../core/constants';
import { Point } from '../systems/physics';
import { SpriteCache } from '../core/spriteCache';
import { drawHuman, drawSlime, drawSpikySlime, drawBarrel, drawChest, drawSpikeTrap, drawPit, drawFloorTile, drawWallTile, drawPressurePlate, drawNPC } from './spriteAssets';

/**
 * Интерфейс для параллакс слоя
 */
interface ParallaxLayer {
    depth: number;        // Глубина (0-1, где 1 = самый дальний)
    sprites: Array<{
        spriteKey: string;
        x: number;
        y: number;
        scale: number;
        opacity: number;
    }>;
}

export class RenderSystem {
    private ditherPattern: CanvasPattern | null = null;
    private ditherPatterns: Map<string, CanvasPattern> = new Map();
    private staticCanvas: HTMLCanvasElement;
    private sCtx: CanvasRenderingContext2D;
    private ctx: CanvasRenderingContext2D;
    
    // Bayer ordered dither matrix 4x4
    private readonly bayerMatrix = [
        [0, 8, 2, 10],
        [12, 4, 14, 6],
        [3, 11, 1, 9],
        [15, 7, 13, 5]
    ];

    // Parallax layers
    private parallaxLayers: ParallaxLayer[] = [];
    private playerPos: Point = { x: 0, y: 0 };

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
        this.initParallaxLayers();
    }

    private initDither() {
        // Создать паттерны на основе Bayer matrix для 7 уровней света для плавных переходов
        const patterns = ['very_light', 'light', 'medium_light', 'medium', 'medium_dark', 'dark', 'very_dark'];
        const intensityOffsets = [0.85, 0.7, 0.55, 0.4, 0.25, 0.1, 0.0];
        const grayShades = ['#555', '#444', '#333', '#2a2a2a', '#222', '#1a1a1a', '#111'];

        patterns.forEach((patternName, idx) => {
            const ditherCanvas = document.createElement('canvas');
            ditherCanvas.width = 4;
            ditherCanvas.height = 4;
            const dCtx = ditherCanvas.getContext('2d', { alpha: false })!;
            
            dCtx.fillStyle = '#000'; 
            dCtx.fillRect(0, 0, 4, 4);
            
            // Bayer ordered dither - равномерное распределение
            const threshold = intensityOffsets[idx];
            dCtx.fillStyle = grayShades[idx];
            
            for (let y = 0; y < 4; y++) {
                for (let x = 0; x < 4; x++) {
                    const normalizedValue = this.bayerMatrix[y][x] / 16.0;
                    if (normalizedValue >= threshold) {
                        dCtx.fillRect(x, y, 1, 1);
                    }
                }
            }

            const ditherPatternCanvas = document.createElement('canvas');
            ditherPatternCanvas.width = 4;
            ditherPatternCanvas.height = 4;
            const dpCtx = ditherPatternCanvas.getContext('2d')!;
            dpCtx.globalAlpha = 0.5;
            dpCtx.drawImage(ditherCanvas, 0, 0);
            const pattern = this.ctx.createPattern(ditherPatternCanvas, 'repeat');
            if (pattern) {
                this.ditherPatterns.set(patternName, pattern);
            }
        });

        // Основной паттерн дизеринга (по умолчанию средний)
        this.ditherPattern = this.ditherPatterns.get('medium') || null;
    }

    /**
     * Получить порог Bayer dither для конкретного пикселя
     * @param x координата x
     * @param y координата y
     * @param lightLevel уровень света (0-1)
     * @returns true если пиксель должен быть закрашен
     */
    public getBayerDitherThreshold(x: number, y: number, lightLevel: number): boolean {
        const bx = x % 4;
        const by = y % 4;
        const bayerValue = this.bayerMatrix[by][bx] / 16.0;
        return lightLevel > bayerValue;
    }

    private initParallaxLayers() {
        // Создаем 3 параллакс слоя для глубины
        // Слой 0: дальний фон (медленно движется)
        this.parallaxLayers.push({
            depth: 0.9,
            sprites: [
                { spriteKey: 'decor_rock', x: 100, y: 100, scale: 1.5, opacity: 0.3 },
                { spriteKey: 'decor_rock', x: 600, y: 200, scale: 1.2, opacity: 0.25 },
                { spriteKey: 'decor_skeleton', x: 300, y: 400, scale: 1.0, opacity: 0.2 },
            ]
        });

        // Слой 1: средний фон
        this.parallaxLayers.push({
            depth: 0.5,
            sprites: [
                { spriteKey: 'decor_crack_1', x: 200, y: 150, scale: 1.0, opacity: 0.4 },
                { spriteKey: 'decor_moss_1', x: 500, y: 300, scale: 1.0, opacity: 0.35 },
            ]
        });

        // Слой 2: ближний фон (быстро движется)
        this.parallaxLayers.push({
            depth: 0.2,
            sprites: [
                { spriteKey: 'decor_blood_stain', x: 400, y: 250, scale: 0.8, opacity: 0.5 },
            ]
        });
    }

    /**
     * Обновить позицию игрока для параллакс эффекта
     */
    public updatePlayerPosition(x: number, y: number): void {
        this.playerPos = { x, y };
    }

    /**
     * Отрисовка параллакс слоев
     */
    public drawParallaxLayers(): void {
        const centerX = GAME_WIDTH / 2;
        const centerY = GAME_HEIGHT / 2;

        for (const layer of this.parallaxLayers) {
            const offsetX = (this.playerPos.x - centerX) * layer.depth;
            const offsetY = (this.playerPos.y - centerY) * layer.depth;

            for (const sprite of layer.sprites) {
                const spriteBitmap = this.spriteCache.get(sprite.spriteKey);
                if (!spriteBitmap) continue;

                const renderX = sprite.x - offsetX;
                const renderY = sprite.y - offsetY;

                this.ctx.globalAlpha = sprite.opacity;
                this.ctx.drawImage(
                    spriteBitmap,
                    renderX - (spriteBitmap.width * sprite.scale) / 2,
                    renderY - (spriteBitmap.height * sprite.scale) / 2,
                    spriteBitmap.width * sprite.scale,
                    spriteBitmap.height * sprite.scale
                );
            }
        }
        this.ctx.globalAlpha = 1.0;
    }

    /**
     * Добавить спрайт в параллакс слой
     */
    public addParallaxSprite(layerIndex: number, spriteKey: string, x: number, y: number, scale: number = 1, opacity: number = 0.5): void {
        if (layerIndex < 0 || layerIndex >= this.parallaxLayers.length) return;
        
        this.parallaxLayers[layerIndex].sprites.push({
            spriteKey,
            x,
            y,
            scale,
            opacity
        });
    }

    /**
     * Очистить параллакс слои
     */
    public clearParallaxLayers(): void {
        this.parallaxLayers = [];
        this.initParallaxLayers();
    }

    private getWallMask(x: number, y: number, grid: number[][]): string {
        let mask = 0;
        if (y > 0 && grid[x][y - 1] === 1) mask |= 0b0001; // Up
        if (x < MAP_COLS - 1 && grid[x + 1][y] === 1) mask |= 0b0010; // Right
        if (y < MAP_ROWS - 1 && grid[x][y + 1] === 1) mask |= 0b0100; // Down
        if (x > 0 && grid[x - 1][y] === 1) mask |= 0b1000; // Left
        return mask.toString(2).padStart(4, '0');
    }

    public updateStaticLayer(grid: number[][], secretDoors: Point[], secretRoomOpen: boolean, secretRoomCells: {gx: number, gy: number}[], playerX?: number, playerY?: number) {
        this.sCtx.fillStyle = '#111';
        this.sCtx.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);

        // Детерминированный RNG для консистентного выбора вариаций
        const pseudoRandom = (x: number, y: number) => {
            const n = x * 374761393 + y * 668265263;
            return ((n * (n * n * 15731 + 789221) + 1376312589) & 0x7fffffff) / 0x7fffffff;
        };

        const wallTiles: {x: number, y: number, px: number, py: number}[] = [];

        for (let x = 0; x < MAP_COLS; x++) {
            for (let y = 0; y < MAP_ROWS; y++) {
                const px = x * TILE_SIZE;
                const py = y * TILE_SIZE;
                const isWall = grid[x][y] === 1;
                const isSecret = secretDoors.some(d => d.x === x && d.y === y);

                if (isWall) {
                    const mask = this.getWallMask(x, y, grid);
                    const rand = pseudoRandom(x, y);
                    drawWallTile(this.sCtx, px, py, mask, rand);
                    wallTiles.push({x, y, px, py});
                } else {
                    // Используем canvas-отрисовку пола вместо спрайтов
                    const rand = pseudoRandom(x, y);
                    drawFloorTile(this.sCtx, px, py, isSecret, rand);
                }
            }
        }

        // Дополнительное затемнение стен по расстоянию от игрока
        wallTiles.forEach(tile => {
            if (playerX !== undefined && playerY !== undefined) {
                const dist = Math.sqrt(Math.pow(tile.px + TILE_SIZE/2 - playerX, 2) + Math.pow(tile.py + TILE_SIZE/2 - playerY, 2));
                const maxDist = 400;
                if (dist > maxDist * 0.3) {
                    const darkness = Math.min(0.5, (dist - maxDist * 0.3) / (maxDist * 0.7) * 0.5);
                    this.sCtx.fillStyle = '#000';
                    this.sCtx.globalAlpha = darkness;
                    this.sCtx.fillRect(tile.px, tile.py, TILE_SIZE, TILE_SIZE);
                    this.sCtx.globalAlpha = 1.0;
                }
            }
        });

        // Секретная комната
        if (secretRoomOpen) {
            secretRoomCells.forEach(c => {
                const px = c.gx * TILE_SIZE;
                const py = c.gy * TILE_SIZE;
                const rand = pseudoRandom(c.gx, c.gy);
                // Используем canvas-отрисовку пола для секретной комнаты (без шахматного узора)
                drawFloorTile(this.sCtx, px, py, false, rand);
            });
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

    public drawText1bit(text: string, x: number, y: number, fg = '#fff', outline = '#000', important: boolean = false) {
        this.ctx.miterLimit = 2;
        this.ctx.lineJoin = 'round';
        
        if (important) {
            // Многослойное свечение для важного текста
            this.ctx.save();
            
            // Внешний слой свечение (большой радиус, низкая прозрачность)
            this.ctx.shadowColor = fg;
            this.ctx.shadowBlur = 16;
            this.ctx.globalAlpha = 0.3;
            this.ctx.fillStyle = fg;
            this.ctx.fillText(text, x, y);
            
            // Средний слой свечение
            this.ctx.shadowBlur = 10;
            this.ctx.globalAlpha = 0.5;
            this.ctx.fillText(text, x, y);
            
            // Внутренний слой свечение
            this.ctx.shadowBlur = 5;
            this.ctx.globalAlpha = 0.7;
            this.ctx.fillText(text, x, y);
            
            this.ctx.restore();
            
            // Обводка с градиентной прозрачностью
            this.ctx.save();
            const gradient = this.ctx.createLinearGradient(x - 50, y, x + 50, y);
            gradient.addColorStop(0, 'rgba(0, 0, 0, 0.4)');
            gradient.addColorStop(0.5, 'rgba(0, 0, 0, 0.9)');
            gradient.addColorStop(1, 'rgba(0, 0, 0, 0.4)');
            this.ctx.strokeStyle = gradient;
            this.ctx.lineWidth = 4;
            this.ctx.strokeText(text, x, y);
            this.ctx.restore();
        } else {
            // Обычное свечение для обычного текста
            this.ctx.shadowColor = fg;
            this.ctx.shadowBlur = 8;
            
            this.ctx.strokeStyle = outline;
            this.ctx.lineWidth = 3;
            this.ctx.strokeText(text, x, y);
        }
        
        // Основной текст
        this.ctx.fillStyle = fg;
        this.ctx.fillText(text, x, y);
        
        // Сбрасываем тень
        this.ctx.shadowBlur = 0;
    }

    /**
     * Отрисовка спрайта с оттенком серого для псевдо 1-битного стиля
     * @param bitmap спрайт для отрисовки
     * @param x позиция X
     * @param y позиция Y
     * @param shade оттенок серого (0-1, где 1 = белый, 0 = черный)
     */
    public drawSpriteWithShade(bitmap: ImageBitmap, x: number, y: number, shade: number = 1) {
        this.ctx.save();
        this.ctx.globalAlpha = shade;
        this.ctx.drawImage(bitmap, x - bitmap.width / 2, y - bitmap.height / 2);
        this.ctx.restore();
    }

    /**
     * Отрисовка анимированного спрайта с оттенком серого
     */
    public drawAnimatedSpriteWithShade(
        anim: any,
        cache: SpriteCache,
        x: number,
        y: number,
        shade: number = 1,
        flipX: boolean = false,
        scaleX: number = 1,
        scaleY: number = 1
    ) {
        const currentFrame = anim.def.frames[anim.currentFrame];
        const sprite = cache.get(currentFrame);
        if (!sprite) return;

        this.ctx.save();
        this.ctx.globalAlpha = shade;

        if (flipX || scaleX !== 1 || scaleY !== 1) {
            this.ctx.translate(x, y);
            this.ctx.scale(flipX ? -scaleX : scaleX, scaleY);
            this.ctx.drawImage(sprite, -sprite.width / 2, -sprite.height / 2);
        } else {
            this.ctx.drawImage(sprite, x - sprite.width / 2, y - sprite.height / 2);
        }

        this.ctx.restore();
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
        seeAllMap: boolean,
        getAO?: (x: number, y: number) => number
    ) {
        if (seeAllMap) return;

        for (let x = 0; x < MAP_COLS; x++) {
            for (let y = 0; y < MAP_ROWS; y++) {
                const px = x * TILE_SIZE;
                const py = y * TILE_SIZE;
                
                if (isVisible(x, y)) {
                    const lightLevel = getLightLevel(x, y);
                    let aoValue = getAO ? getAO(x, y) : 0;
                    
                    // Применяем ambient occlusion к уровню света
                    const adjustedLightLevel = Math.max(0, lightLevel - aoValue);
                    
                    if (adjustedLightLevel < 0.85) {
                        let patternKey = 'very_light';
                        if (adjustedLightLevel < 0.7) patternKey = 'light';
                        if (adjustedLightLevel < 0.55) patternKey = 'medium_light';
                        if (adjustedLightLevel < 0.4) patternKey = 'medium';
                        if (adjustedLightLevel < 0.25) patternKey = 'medium_dark';
                        if (adjustedLightLevel < 0.1) patternKey = 'dark';
                        if (adjustedLightLevel < 0.05) patternKey = 'very_dark';
                        
                        const pattern = this.ditherPatterns.get(patternKey);
                        if (pattern) {
                            this.ctx.fillStyle = pattern;
                            this.ctx.globalAlpha = 0.4;
                            this.ctx.fillRect(px, py, TILE_SIZE, TILE_SIZE);
                            this.ctx.globalAlpha = 1.0;
                        }
                    }
                    
                    // Дополнительное затемнение для сильного AO (уменьшено влияние)
                    if (aoValue > 0.3) {
                        this.ctx.fillStyle = '#000';
                        this.ctx.globalAlpha = aoValue * 0.25;
                        this.ctx.fillRect(px, py, TILE_SIZE, TILE_SIZE);
                        this.ctx.globalAlpha = 1.0;
                    }
                } else if (explored[x][y]) {
                    // Туман войны - видно контуры карты, но затемнено
                    this.ctx.fillStyle = '#000';
                    this.ctx.globalAlpha = 0.75;
                    this.ctx.fillRect(px, py, TILE_SIZE, TILE_SIZE);
                    this.ctx.globalAlpha = 1.0;
                } else {
                    this.ctx.fillStyle = '#000';
                    this.ctx.fillRect(px, py, TILE_SIZE, TILE_SIZE);
                }
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

    /**
     * Отрисовка игрока с помощью примитивов canvas
     */
    public drawHuman(x: number, y: number, angle: number, isDashing: boolean, godMode: boolean, gameState: string, t: number = 0) {
        drawHuman(this.ctx, x, y, angle, isDashing, godMode, gameState, t);
    }

    /**
     * Отрисовка слизня (chaser)
     */
    public drawSlime(x: number, y: number, t: number, active: boolean = false) {
        drawSlime(this.ctx, x, y, t, active);
    }

    /**
     * Отрисовка шипастого слизня (shooter)
     */
    public drawSpikySlime(x: number, y: number, t: number) {
        drawSpikySlime(this.ctx, x, y, t);
    }

    /**
     * Отрисовка бочки
     */
    public drawBarrel(x: number, y: number) {
        drawBarrel(this.ctx, x, y);
    }

    /**
     * Отрисовка сундука
     */
    public drawChest(x: number, y: number, t: number) {
        drawChest(this.ctx, x, y, t);
    }

    /**
     * Отрисовка ловушки шипов
     */
    public drawSpikeTrap(x: number, y: number, t: number, active: boolean) {
        drawSpikeTrap(this.ctx, x, y, t, active);
    }

    /**
     * Отрисовка ямы (pit)
     */
    public drawPit(x: number, y: number, t: number) {
        drawPit(this.ctx, x, y, t);
    }

    /**
     * Отрисовка нажимной плиты (pressure plate)
     */
    public drawPressurePlate(x: number, y: number, active: boolean) {
        drawPressurePlate(this.ctx, x, y, active);
    }

    /**
     * Отрисовка NPC (мирный житель)
     */
    public drawNPC(x: number, y: number, t: number) {
        drawNPC(this.ctx, x, y, t);
    }
}

