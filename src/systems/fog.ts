import * as PIXI from 'pixi.js';
import { GAME_WIDTH, GAME_HEIGHT, TILE_SIZE, MAP_COLS, MAP_ROWS } from '../core/constants';

interface FogCloud extends PIXI.Sprite {
    vx: number;
    vy: number;
    baseAlpha: number;
    phase: number;
}

/**
 * Система тумана на базе PixiJS
 * Реализует легкий, едва видимый туман с градиентами черного, серого и белого
 */
export class FogSystem {
    private app: PIXI.Application | null = null;
    private container: PIXI.Container | null = null;
    private clouds: FogCloud[] = [];
    private cloudTexture: PIXI.Texture | null = null;
    private isInitialized = false;

    constructor() {}

    /**
     * Инициализация PixiJS приложения для тумана
     */
    public async init() {
        if (this.isInitialized) return;

        this.app = new PIXI.Application();
        
        await this.app.init({
            width: GAME_WIDTH,
            height: GAME_HEIGHT,
            backgroundAlpha: 0,
            antialias: true,
            resolution: window.devicePixelRatio || 1,
            autoDensity: true,
        });

        const gameContainer = document.getElementById('gameContainer');
        if (gameContainer) {
            const pixiCanvas = this.app.canvas;
            pixiCanvas.id = 'fogCanvas';
            pixiCanvas.style.position = 'absolute';
            pixiCanvas.style.top = '0';
            pixiCanvas.style.left = '0';
            pixiCanvas.style.pointerEvents = 'none';
            pixiCanvas.style.zIndex = '4';
            gameContainer.appendChild(pixiCanvas);
        }

        this.container = new PIXI.Container();
        this.app.stage.addChild(this.container);

        this.createCloudTexture();
        this.spawnClouds();
        
        this.isInitialized = true;
    }

    /**
     * Создает текстуру облака с градиентом (чуть плотнее, +15%)
     */
    private createCloudTexture() {
        const size = 300;
        const canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d')!;

        const grad = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
        
        // Еще более прозрачный туман для чистого геймплея
        grad.addColorStop(0, 'rgba(255, 255, 255, 0.03)'); 
        grad.addColorStop(0.4, 'rgba(120, 120, 120, 0.015)');
        grad.addColorStop(0.7, 'rgba(40, 40, 40, 0.005)');   
        grad.addColorStop(1, 'rgba(0, 0, 0, 0)');           

        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, size, size);

        this.cloudTexture = PIXI.Texture.from(canvas);
    }

    /**
     * Спавнит облака тумана (увеличено до 22)
     */
    private spawnClouds() {
        if (!this.container || !this.cloudTexture) return;

        const worldWidth = MAP_COLS * TILE_SIZE;
        const worldHeight = MAP_ROWS * TILE_SIZE;

        // 20 облаков достаточно для атмосферы без перекрытия обзора
        const count = 20;
        for (let i = 0; i < count; i++) {
            const cloud = new PIXI.Sprite(this.cloudTexture) as FogCloud;
            cloud.anchor.set(0.5);
            
            // Мировые координаты
            cloud.x = Math.random() * worldWidth;
            cloud.y = Math.random() * worldHeight;
            
            cloud.scale.set(2.0 + Math.random() * 4);
            
            // Минимальная базовая прозрачность
            cloud.baseAlpha = 0.03 + Math.random() * 0.07;
            cloud.alpha = 0; 
            
            cloud.vx = (Math.random() - 0.5) * 0.1;
            cloud.vy = (Math.random() - 0.5) * 0.1;
            
            cloud.phase = Math.random() * Math.PI * 2;

            this.container.addChild(cloud);
            this.clouds.push(cloud);
        }
    }


    /**
     * Обновление состояния тумана
     * @param dt дельта времени
     * @param grid сетка подземелья
     * @param camera текущая камера
     */
    public update(dt: number, grid: number[][], camera: { x: number, y: number, zoom: number }) {
        if (!this.isInitialized || !this.container) return;

        const worldWidth = MAP_COLS * TILE_SIZE;
        const worldHeight = MAP_ROWS * TILE_SIZE;
        const time = Date.now() * 0.001;

        // Применяем трансформацию камеры к контейнеру, чтобы туман был статичен в мире
        this.container.x = GAME_WIDTH / 2 - camera.x * camera.zoom;
        this.container.y = GAME_HEIGHT / 2 - camera.y * camera.zoom;
        this.container.scale.set(camera.zoom);

        this.clouds.forEach(cloud => {
            // Движение в мировых координатах
            cloud.x += cloud.vx * dt;
            cloud.y += cloud.vy * dt;

            // Зацикливание в мировых координатах
            const margin = 300;
            if (cloud.x < -margin) cloud.x = worldWidth + margin;
            if (cloud.x > worldWidth + margin) cloud.x = -margin;
            if (cloud.y < -margin) cloud.y = worldHeight + margin;
            if (cloud.y > worldHeight + margin) cloud.y = -margin;

            const gx = Math.floor(cloud.x / TILE_SIZE);
            const gy = Math.floor(cloud.y / TILE_SIZE);
            
            let multiplier = 1.0;
            if (gx >= 0 && gx < MAP_COLS && gy >= 0 && gy < MAP_ROWS) {
                const isWall = grid[gx][gy] === 1;
                multiplier = isWall ? 0.1 : 1.0; // Еще сильнее гасим в стенах
            } else {
                multiplier = 0.3; 
            }

            // Почти прозрачный туман
            const pulse = Math.sin(time * 0.15 + cloud.phase) * 0.02;
            const targetAlpha = (cloud.baseAlpha + pulse) * multiplier * 0.2;
            
            cloud.alpha += (targetAlpha - cloud.alpha) * 0.01;
        });
    }

    /**
     * Очистка при смене уровня
     */
    public reset() {
        const worldWidth = MAP_COLS * TILE_SIZE;
        const worldHeight = MAP_ROWS * TILE_SIZE;

        this.clouds.forEach(c => {
            c.alpha = 0;
            c.x = Math.random() * worldWidth;
            c.y = Math.random() * worldHeight;
        });
    }
}

