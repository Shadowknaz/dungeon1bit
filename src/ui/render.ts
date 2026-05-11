import { GAME_WIDTH, GAME_HEIGHT, TILE_SIZE, MAP_COLS, MAP_ROWS } from '../core/constants';
import { Point } from '../domain/types';
import { SpriteCache } from '../core/spriteCache';
import { ITEMS_DB } from '../data/registry';
import { drawHuman, drawSlime, drawSpikySlime, drawBarrel, drawChest, drawSpikeTrap, drawPit, drawFloorTile, drawWallTile, drawPressurePlate, drawNPC, drawTorch, drawGolem, drawGrenade, drawFlashbang, drawDroppedItem } from './spriteAssets';
import { Camera } from '../entities/player';
import p5 from 'p5';

interface ParallaxLayer {
    depth: number;
    sprites: Array<{
        spriteKey: string;
        x: number;
        y: number;
        scale: number;
        opacity: number;
    }>;
}

const SHADOW_LIGHT_THRESHOLD = 0.85;
const LIGHT_THRESHOLD = 0.7;
const MEDIUM_LIGHT_THRESHOLD = 0.55;
const MEDIUM_THRESHOLD = 0.4;
const MEDIUM_DARK_THRESHOLD = 0.25;
const DARK_THRESHOLD = 0.1;
const VERY_DARK_THRESHOLD = 0.05;

const DITHER_ALPHA = 0.4;
const FOG_ALPHA = 0.4;
const VIEWPORT_MARGIN = 1;

export class RenderSystem {
    private ditherPatterns: Map<string, CanvasPattern> = new Map();
    private ctx: CanvasRenderingContext2D;
    private p: p5;
    private staticGraphics!: p5.Graphics;
    private dynamicGraphics!: p5.Graphics;

    private readonly bayerMatrix = [
        [0, 8, 2, 10],
        [12, 4, 14, 6],
        [3, 11, 1, 9],
        [15, 7, 13, 5]
    ];

    private parallaxLayers: ParallaxLayer[] = [];
    private playerPos: Point = { x: 0, y: 0 };
    private currentCamera: Camera | null = null;
    
    private lightingCache: HTMLCanvasElement;
    private lightingCtx: CanvasRenderingContext2D;
    private lastCameraX = -1;
    private lastCameraY = -1;
    private lastCameraZoom = -1;
    private lastLightingAngle = -1;

    constructor(ctx: CanvasRenderingContext2D, private spriteCache: SpriteCache) {
        this.ctx = ctx;
        this.p = new p5((p: p5) => {
            p.setup = () => { 
                p.noCanvas();
                (p as any)._renderer.drawingContext = this.ctx;
            };
        });

        this.ctx.imageSmoothingEnabled = false;
        this.lightingCache = document.createElement('canvas');
        this.lightingCtx = this.lightingCache.getContext('2d')!;

        this.initDither();
        this.initParallaxLayers();
    }

    public reinit() {
        if (!this.p) return;
        if (this.staticGraphics) { try { this.staticGraphics.remove(); } catch(e) {} }
        if (this.dynamicGraphics) { try { this.dynamicGraphics.remove(); } catch(e) {} }

        const w = Math.max(1, MAP_COLS * TILE_SIZE);
        const h = Math.max(1, MAP_ROWS * TILE_SIZE);
        const sw = Math.max(1, GAME_WIDTH);
        const sh = Math.max(1, GAME_HEIGHT);

        this.staticGraphics = this.p.createGraphics(w, h, (this.p as any).P2D || 'p2d');
        this.staticGraphics.pixelDensity(1);
        this.staticGraphics.noSmooth();

        this.dynamicGraphics = this.p.createGraphics(sw, sh, (this.p as any).P2D || 'p2d');
        this.dynamicGraphics.pixelDensity(1);
        this.dynamicGraphics.noSmooth();

        this.lightingCache.width = sw;
        this.lightingCache.height = sh;
        this.lightingCtx.imageSmoothingEnabled = false;
        this.invalidateLightingCache();
    }

    public invalidateLightingCache() {
        this.lastCameraX = -1;
        this.lastCameraY = -1;
    }

    public applyCamera(camera: Camera) {
        this.currentCamera = camera;
        this.ctx.save();
        this.ctx.translate(GAME_WIDTH / 2, GAME_HEIGHT / 2);
        this.ctx.scale(camera.zoom, camera.zoom);
        this.ctx.translate(-camera.x, -camera.y);
    }

    public restoreCamera() {
        this.ctx.restore();
        this.currentCamera = null;
    }

    public getViewportBoundaries(camera?: Camera): { x1: number, x2: number, y1: number, y2: number } {
        const cam = camera || this.currentCamera || { x: (MAP_COLS * TILE_SIZE) / 2, y: (MAP_ROWS * TILE_SIZE) / 2, zoom: 1 };
        const halfWidthInWorld = (GAME_WIDTH / 2) / cam.zoom;
        const halfHeightInWorld = (GAME_HEIGHT / 2) / cam.zoom;
        return {
            x1: Math.floor((cam.x - halfWidthInWorld) / TILE_SIZE),
            x2: Math.floor((cam.x + halfWidthInWorld) / TILE_SIZE),
            y1: Math.floor((cam.y - halfHeightInWorld) / TILE_SIZE),
            y2: Math.floor((cam.y + halfHeightInWorld) / TILE_SIZE)
        };
    }

    private initDither() {
        const patterns = ['dense', 'medium', 'light'];
        const thresholds = [0.1, 0.4, 0.7];
        
        patterns.forEach((name, i) => {
            const canvas = document.createElement('canvas');
            canvas.width = 4; canvas.height = 4;
            const ctx = canvas.getContext('2d')!;
            // Start with transparent background
            ctx.clearRect(0, 0, 4, 4);
            ctx.fillStyle = '#181818'; // Match shadow color
            const t = thresholds[i];
            for (let y = 0; y < 4; y++) {
                for (let x = 0; x < 4; x++) {
                    // Draw black pixels where it should be dark
                    if (this.bayerMatrix[y][x] / 16 < (1 - t)) ctx.fillRect(x, y, 1, 1);
                }
            }
            const p = this.ctx.createPattern(canvas, 'repeat');
            if (p) this.ditherPatterns.set(name, p);
        });
    }

    private initParallaxLayers() {
        this.parallaxLayers.push({
            depth: 0.9,
            sprites: [{ spriteKey: 'decor_rock', x: 100, y: 100, scale: 1.5, opacity: 0.3 }]
        });
    }

    public updatePlayerPosition(x: number, y: number) { this.playerPos = { x, y }; }

    private getWallMask(x: number, y: number, grid: number[][]): string {
        let mask = 0;
        if (y > 0 && grid[x][y - 1] === 1) mask |= 0b0001; 
        if (x < MAP_COLS - 1 && grid[x + 1][y] === 1) mask |= 0b0010; 
        if (y < MAP_ROWS - 1 && grid[x][y + 1] === 1) mask |= 0b0100; 
        if (x > 0 && grid[x - 1][y] === 1) mask |= 0b1000; 
        return mask.toString(2).padStart(4, '0');
    }

    public updateStaticLayer(grid: number[][], variations: number[][], secretDoors: Point[], playerX?: number, playerY?: number) {
        this.staticGraphics.background(17); 
        this.staticGraphics.noStroke();
        for (let x = 0; x < MAP_COLS; x++) {
            for (let y = 0; y < MAP_ROWS; y++) {
                const px = x * TILE_SIZE, py = y * TILE_SIZE;
                const tile = grid[x][y];
                if (tile === 1 || tile === 3) {
                    drawWallTile(this.staticGraphics, px, py, this.getWallMask(x, y, grid), tile === 3 ? 0.99 : variations[x][y]);
                } else if (tile === 2) {
                    drawFloorTile(this.staticGraphics, px, py, variations[x][y]);
                    this.staticGraphics.fill(255, 100); this.staticGraphics.textAlign(this.p.CENTER, this.p.CENTER); this.staticGraphics.textSize(12); this.staticGraphics.text('≈', px + TILE_SIZE/2, py + TILE_SIZE/2);
                } else {
                    drawFloorTile(this.staticGraphics, px, py, variations[x][y]);
                }
            }
        }
    }

    public drawParallaxLayers() {
        const centerX = GAME_WIDTH / 2;
        const centerY = GAME_HEIGHT / 2;
        for (const layer of this.parallaxLayers) {
            const offsetX = (this.playerPos.x - centerX) * layer.depth;
            const offsetY = (this.playerPos.y - centerY) * layer.depth;
            for (const sprite of layer.sprites) {
                const b = this.spriteCache.get(sprite.spriteKey);
                if (!b) continue;
                this.ctx.globalAlpha = sprite.opacity;
                this.ctx.drawImage(b, sprite.x - offsetX - (b.width * sprite.scale) / 2, sprite.y - offsetY - (b.height * sprite.scale) / 2, b.width * sprite.scale, b.height * sprite.scale);
            }
        }
        this.ctx.globalAlpha = 1.0;
    }

    public drawStaticLayer(camera?: Camera) {
        const b = this.getViewportBoundaries(camera);
        const startX = Math.max(0, b.x1 - VIEWPORT_MARGIN);
        const endX = Math.min(MAP_COLS, b.x2 + VIEWPORT_MARGIN);
        const startY = Math.max(0, b.y1 - VIEWPORT_MARGIN);
        const endY = Math.min(MAP_ROWS, b.y2 + VIEWPORT_MARGIN);
        const sx = startX * TILE_SIZE, sy = startY * TILE_SIZE, sw = (endX - startX) * TILE_SIZE, sh = (endY - startY) * TILE_SIZE;
        if (sw <= 0 || sh <= 0) return;
        this.ctx.drawImage((this.staticGraphics as any).canvas, sx, sy, sw, sh, sx, sy, sw, sh);
    }

    public drawDitherOverlay(camera: Camera, lumen: any, px: number, py: number, angle: number, explored: boolean[][], seeAll: boolean, force: boolean = false) {
        const moved = Math.abs(camera.x - this.lastCameraX) > 0.1 || Math.abs(camera.y - this.lastCameraY) > 0.1 || Math.abs(camera.zoom - this.lastCameraZoom) > 0.01;
        const rot = Math.abs(angle - this.lastLightingAngle) > 0.01;
        if (moved || rot || force) {
            this.rebuildLightingCache(camera, lumen, explored, seeAll);
            this.lastCameraX = camera.x; this.lastCameraY = camera.y; this.lastCameraZoom = camera.zoom; this.lastLightingAngle = angle;
        }
        this.ctx.save();
        this.ctx.setTransform(1, 0, 0, 1, 0, 0);
        this.ctx.globalAlpha = 1.0; 
        this.ctx.drawImage(this.lightingCache, 0, 0);
        this.ctx.restore();
    }

    private rebuildLightingCache(cam: Camera, lumen: any, explored: boolean[][], seeAll: boolean) {
        const ctx = this.lightingCtx;
        ctx.clearRect(0, 0, this.lightingCache.width, this.lightingCache.height);
        
        const b = this.getViewportBoundaries(cam);
        const zoom = cam.zoom;
        const offsetX = -cam.x * zoom + GAME_WIDTH / 2;
        const offsetY = -cam.y * zoom + GAME_HEIGHT / 2;
        const SHADOW_COLOR = 'rgba(24, 24, 24, 0.7)'; 

        ctx.globalAlpha = 1.0; // Draw everything OPAQUELY to prevent grid lines

        for (let x = Math.max(0, b.x1 - 1); x <= Math.min(MAP_COLS - 1, b.x2 + 1); x++) {
            const screenX = Math.round(x * TILE_SIZE * zoom + offsetX);
            const nextX = Math.round((x + 1) * TILE_SIZE * zoom + offsetX);
            const sizeX = nextX - screenX;

            for (let y = Math.max(0, b.y1 - 1); y <= Math.min(MAP_ROWS - 1, b.y2 + 1); y++) {
                const screenY = Math.round(y * TILE_SIZE * zoom + offsetY);
                const nextY = Math.round((y + 1) * TILE_SIZE * zoom + offsetY);
                const sizeY = nextY - screenY;

                if (lumen.isVisible(x, y) || seeAll) {
                    const l = lumen.getLightLevel(x, y);
                    const ao = lumen.getAO(x, y);
                    if (l < SHADOW_LIGHT_THRESHOLD || ao > 0.3) {
                        this.drawSingleTileScreen(ctx, screenX, screenY, sizeX, sizeY, l, ao, SHADOW_COLOR);
                    }
                } else {
                    const isExplored = explored[x]?.[y];
                    if (isExplored) {
                        ctx.fillStyle = SHADOW_COLOR;
                        ctx.fillRect(screenX, screenY, sizeX, sizeY);
                    } else {
                        ctx.fillStyle = '#000'; // Unvisited is PITCH BLACK (opaque)
                        ctx.fillRect(screenX, screenY, sizeX, sizeY);
                    }
                }
            }
        }
    }

    private drawSingleTileScreen(ctx: CanvasRenderingContext2D, px: number, py: number, sw: number, sh: number, l: number, ao: number, shadowColor: string) {
        const al = Math.max(0, l - ao);
        if (al < VERY_DARK_THRESHOLD) {
            ctx.fillStyle = shadowColor;
            ctx.fillRect(px, py, sw, sh);
        } else {
            const p = this.ditherPatterns.get(al < DARK_THRESHOLD ? 'dense' : (al < MEDIUM_THRESHOLD ? 'medium' : 'light'));
            if (p) { 
                ctx.fillStyle = p; 
                ctx.globalAlpha = 0.5; // Single tile dither intensity
                ctx.fillRect(px, py, sw, sh); 
                ctx.globalAlpha = 1.0;
            }
        }
        if (ao > 0.3) { 
            ctx.fillStyle = 'rgba(0,0,0,0.4)'; 
            ctx.fillRect(px, py, sw, sh); 
        }
    }

    public clear() { this.ctx.fillStyle = '#181818'; this.ctx.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT); }
    public beginDynamicPass(cam: Camera) {
        this.dynamicGraphics.clear(); this.dynamicGraphics.push();
        this.dynamicGraphics.translate(GAME_WIDTH / 2, GAME_HEIGHT / 2); this.dynamicGraphics.scale(cam.zoom, cam.zoom); this.dynamicGraphics.translate(-cam.x, -cam.y);
    }
    public endDynamicPass() { this.dynamicGraphics.pop(); }
    public drawDynamicLayer() { this.ctx.save(); this.ctx.setTransform(1, 0, 0, 1, 0, 0); this.ctx.drawImage((this.dynamicGraphics as any).canvas, 0, 0); this.ctx.restore(); }
    public getDynamicBuffer() { return this.dynamicGraphics; }

    public drawShadow(x: number, y: number, r: number) {
        const g = this.ctx.createRadialGradient(x, y + r * 0.3, 0, x, y + r * 0.5, r);
        g.addColorStop(0, 'rgba(0,0,0,0.4)'); g.addColorStop(1, 'rgba(0,0,0,0)');
        this.ctx.fillStyle = g; this.ctx.beginPath(); this.ctx.ellipse(x, y + r * 0.5, r, r * 0.4, 0, 0, Math.PI * 2); this.ctx.fill();
    }

    public drawHuman(x: number, y: number, a: number, d: boolean, g: boolean, s: string, t: number) { drawHuman(this.p, x, y, a, d, g, s, t); }
    public drawSlime(x: number, y: number, t: number, a: boolean = false) { drawSlime(this.p, x, y, t, a); }
    public drawSpikySlime(x: number, y: number, t: number) { drawSpikySlime(this.p, x, y, t); }
    public drawBarrel(x: number, y: number) { drawBarrel(this.dynamicGraphics, x, y); }
    public drawChest(x: number, y: number, t: number) { drawChest(this.dynamicGraphics, x, y, t); }
    public drawDroppedItems(items: any[], t: number) { items.forEach(it => drawDroppedItem(this.dynamicGraphics, it.x, it.y, it.itemId, ITEMS_DB[it.itemId]?.rarity || 'common', t)); }
    public drawSpikeTrap(x: number, y: number, t: number, a: boolean) { drawSpikeTrap(this.dynamicGraphics, x, y, t, a); }
    public drawPit(x: number, y: number, t: number) { drawPit(this.dynamicGraphics, x, y, t); }
    public drawPressurePlate(x: number, y: number, a: boolean) { drawPressurePlate(this.dynamicGraphics, x, y, a); }
    public drawNPC(x: number, y: number, t: number) { drawNPC(this.dynamicGraphics, x, y, t); }
    public drawTorch(x: number, y: number, t: number) { drawTorch(this.dynamicGraphics, x, y, t); }
    public drawGolem(x: number, y: number, t: number, a: number, i: number) { drawGolem(this.dynamicGraphics, x, y, t, a, i); }
    public drawGrenade(x: number, y: number, t: number) { drawGrenade(this.dynamicGraphics, x, y, t); }
    public drawFlashbang(x: number, y: number, t: number) { drawFlashbang(this.dynamicGraphics, x, y, t); }

    public drawFluids(grid: any[][], isVisible: (x: number, y: number) => boolean) {
        const b = this.getViewportBoundaries();
        this.ctx.font = 'bold 16px monospace'; this.ctx.textAlign = 'center'; this.ctx.textBaseline = 'middle';
        for (let x = Math.max(0, b.x1); x <= Math.min(MAP_COLS - 1, b.x2); x++) {
            for (let y = Math.max(0, b.y1); y <= Math.min(MAP_ROWS - 1, b.y2); y++) {
                const c = grid[x][y]; if (!c || !isVisible(x, y)) continue;
                const cx = x * TILE_SIZE + TILE_SIZE / 2, cy = y * TILE_SIZE + TILE_SIZE / 2;
                if (c.fire > 0) { this.ctx.fillStyle = '#f50'; this.ctx.fillText('ж', cx, cy); }
                else if (c.steam > 5) { this.ctx.globalAlpha = Math.min(0.8, c.steam / 100); this.ctx.fillStyle = '#fff'; this.ctx.fillText('~', cx, cy); this.ctx.globalAlpha = 1; }
                else if (c.type && c.vol > 5) { this.ctx.fillStyle = c.type === 'water' ? '#0af' : '#444'; this.ctx.globalAlpha = Math.min(1, c.vol / 100); this.ctx.fillText('≈', cx, cy); this.ctx.globalAlpha = 1; }
            }
        }
    }
}
