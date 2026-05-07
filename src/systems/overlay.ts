import { SpriteCache } from '../core/spriteCache';
import { TILE_SIZE } from '../core/constants';

export interface OverlayTile {
    x: number;
    y: number;
    type: 'crack' | 'moss' | 'blood' | 'blood_splatter';
    variant: number; // 0, 1, 2... для вариаций
    opacity: number;
}

export class OverlaySystem {
    private overlays: OverlayTile[] = [];
    private readonly MAX_OVERLAYS = 500;

    /**
     * Добавить overlay на тайл
     */
    addOverlay(x: number, y: number, type: OverlayTile['type'], variant: number = 0): void {
        if (this.overlays.length >= this.MAX_OVERLAYS) return;
        
        // Проверяем, нет ли уже overlay на этом тайле
        const existing = this.overlays.findIndex(o => o.x === x && o.y === y);
        if (existing !== -1) {
            // Заменяем существующий
            this.overlays[existing] = { x, y, type, variant, opacity: 1.0 };
        } else {
            this.overlays.push({ x, y, type, variant, opacity: 1.0 });
        }
    }

    /**
     * Удалить overlay с тайла
     */
    removeOverlay(x: number, y: number): void {
        const idx = this.overlays.findIndex(o => o.x === x && o.y === y);
        if (idx !== -1) {
            this.overlays.splice(idx, 1);
        }
    }

    /**
     * Добавить трещину
     */
    addCrack(x: number, y: number): void {
        const variant = Math.floor(Math.random() * 2); // 0 или 1
        this.addOverlay(x, y, 'crack', variant);
    }

    /**
     * Добавить мох
     */
    addMoss(x: number, y: number): void {
        const variant = Math.floor(Math.random() * 2); // 0 или 1
        this.addOverlay(x, y, 'moss', variant);
    }

    /**
     * Добавить пятно крови
     */
    addBlood(x: number, y: number): void {
        const variant = 0;
        this.addOverlay(x, y, 'blood', variant);
    }

    /**
     * Добавить брызги крови
     */
    addBloodSplatter(x: number, y: number): void {
        const variant = Math.floor(Math.random() * 2); // 0 или 1
        this.addOverlay(x, y, 'blood_splatter', variant);
    }

    /**
     * Случайно добавить детали на пол в комнате
     */
    decorateRoom(floorTiles: {x: number, y: number}[], density: number = 0.05): void {
        const numDecorations = Math.floor(floorTiles.length * density);
        
        for (let i = 0; i < numDecorations; i++) {
            const tile = floorTiles[Math.floor(Math.random() * floorTiles.length)];
            const rand = Math.random();
            
            if (rand < 0.3) {
                this.addCrack(tile.x, tile.y);
            } else if (rand < 0.6) {
                this.addMoss(tile.x, tile.y);
            } else if (rand < 0.8) {
                this.addBloodSplatter(tile.x, tile.y);
            }
        }
    }

    /**
     * Очистить все overlays
     */
    clear(): void {
        this.overlays = [];
    }

    /**
     * Отрисовка overlay слоев
     */
    draw(ctx: CanvasRenderingContext2D, cache: SpriteCache): void {
        for (const overlay of this.overlays) {
            const px = overlay.x * TILE_SIZE;
            const py = overlay.y * TILE_SIZE;
            
            // Рисуем только 1-2 пикселя вместо всего спрайта для минималистичности
            ctx.globalAlpha = overlay.opacity * 0.6; // Уменьшена непрозрачность
            
            const offsetX = (overlay.x * 7 + overlay.y * 13) % (TILE_SIZE - 4) + 2;
            const offsetY = (overlay.x * 11 + overlay.y * 17) % (TILE_SIZE - 4) + 2;
            
            switch (overlay.type) {
                case 'crack':
                    ctx.fillStyle = '#444';
                    ctx.fillRect(px + offsetX, py + offsetY, 1, 1);
                    if (overlay.variant === 1) {
                        ctx.fillRect(px + offsetX + 1, py + offsetY + 1, 1, 1);
                    }
                    break;
                case 'moss':
                    ctx.fillStyle = '#333';
                    ctx.fillRect(px + offsetX, py + offsetY, 2, 1);
                    break;
                case 'blood':
                    ctx.fillStyle = '#440000';
                    ctx.fillRect(px + offsetX, py + offsetY, 2, 2);
                    break;
                case 'blood_splatter':
                    ctx.fillStyle = '#330000';
                    ctx.fillRect(px + offsetX, py + offsetY, 1, 1);
                    if (overlay.variant === 1) {
                        ctx.fillRect(px + offsetX + 1, py + offsetY, 1, 1);
                    }
                    break;
            }
        }
        ctx.globalAlpha = 1.0;
    }

    /**
     * Получить все overlays
     */
    getOverlays(): OverlayTile[] {
        return [...this.overlays];
    }
}
