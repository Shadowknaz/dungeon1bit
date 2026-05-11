import * as PIXI from 'pixi.js';
import { UiStyle } from './style';
import { ItemInstance } from '../systems/inventory';
import { ITEMS_DB } from '../data/registry';
import { GAME_WIDTH, GAME_HEIGHT } from '../core/constants';

export interface InterfaceState {
    willpower: number;
    maxWillpower: number;
    ammo: string;
    credits: number;
    godMode: boolean;
    seeAllEnemies: boolean;
    seeAllMap: boolean;
    chargeLevel: number;
    noclip: boolean;
    showAiVision: boolean;
    showAiStates: boolean;
}

export class InterfaceSystem {
    private app: PIXI.Application;
    public state: InterfaceState;
    private inventoryWindow: PIXI.Container | null = null;
    private chestWindow: PIXI.Container | null = null;
    private chargeBar!: PIXI.Graphics;
    private vfxLayer!: PIXI.Container;
    private lightnings: Array<{ graphics: PIXI.Graphics, life: number, maxLife: number }> = [];
    private wallGlows: Array<{ graphics: PIXI.Graphics, phase: number }> = [];
    private ready: boolean = false;

    constructor(container: HTMLElement, onMapToggle: (v: boolean) => void) {
// ...
// ... existing constructor ...
        this.state = {
            willpower: 5,
            maxWillpower: 5,
            ammo: '6/6',
            credits: 0,
            godMode: false,
            seeAllEnemies: false,
            seeAllMap: false,
            chargeLevel: 0,
            noclip: false,
            showAiVision: true,
            showAiStates: false
        };

        this.app = new PIXI.Application();
        this.initPixi(container);
    }

    private async initPixi(container: HTMLElement) {
        try {
            await this.app.init({
                width: GAME_WIDTH,
                height: GAME_HEIGHT,
                backgroundAlpha: 0,
                antialias: false,
            });

            const canvas = this.app.canvas as HTMLCanvasElement;
            canvas.style.position = 'absolute';
            canvas.style.top = '0';
            canvas.style.left = '0';
            canvas.style.pointerEvents = 'none';
            container.appendChild(canvas);

            UiStyle.init(this.app.renderer as PIXI.Renderer);

            // VFX Layer (World space but drawn on UI for now)
            this.vfxLayer = new PIXI.Container();
            this.app.stage.addChild(this.vfxLayer);

            // Willpower (Top Left)
            this.willpowerDots = new PIXI.Graphics();
            this.willpowerLabel = new PIXI.Text({
                text: "ВОЛЯ",
                style: {
                    fontFamily: 'monospace',
                    fontSize: 12,
                    fill: 0xFFFFFF,
                    fontWeight: 'bold'
                }
            });
            this.willpowerLabel.position.set(20, 20);
            
            // Charge Bar (Bottom Center)
            this.chargeBar = new PIXI.Graphics();
            this.chargeBar.position.set(GAME_WIDTH / 2 - 50, GAME_HEIGHT - 100);
            
            this.app.stage.addChild(this.willpowerDots);
            this.app.stage.addChild(this.willpowerLabel);
            this.app.stage.addChild(this.chargeBar);
            
            this.ready = true;
            this.updateWillpowerDots();
        } catch (err) {
            console.error("Failed to init Pixi UI:", err);
        }
    }

    private updateWillpowerDots() {
        if (!this.ready || !this.willpowerDots) return;
        
        const g = this.willpowerDots;
        g.clear();
        
        const dotSize = 8;
        const spacing = 12;
        
        for (let i = 0; i < this.state.maxWillpower; i++) {
            const x = 20 + i * (dotSize + spacing);
            const y = 42;
            
            if (i < this.state.willpower) {
                // Active dot
                g.rect(x, y, dotSize, dotSize).fill(0xFFFFFF);
            } else {
                // Lost dot
                g.rect(x, y, dotSize, dotSize).stroke({ color: 0xFFFFFF, width: 1 });
            }
        }
    }

    private updateChargeBar() {
        if (!this.ready || !this.chargeBar) return;
        
        const g = this.chargeBar;
        g.clear();
        
        if (this.state.chargeLevel <= 0) return;
        
        const width = 100;
        const height = 6;
        
        // Background
        g.rect(0, 0, width, height).fill(0x000000).stroke({ color: 0xFFFFFF, width: 1 });
        
        // Progress
        const fillWidth = (width - 4) * this.state.chargeLevel;
        if (fillWidth > 0) {
            g.rect(2, 2, fillWidth, height - 4).fill(0xFFFFFF);
        }
    }

    public showInventory(items: ItemInstance[], onClose: () => void) {
        if (!this.ready) return;
        if (this.inventoryWindow) this.app.stage.removeChild(this.inventoryWindow);
        
        const win = UiStyle.createWindow(400, 500);
        win.position.set(320, 140);
        
        // Title bar
        const titleBg = new PIXI.Graphics();
        titleBg.rect(0, 0, 400, 25).fill(0xFFFFFF);
        
        const title = new PIXI.Text({
            text: "TERMINAL OS - INVENTORY",
            style: {
                fontFamily: 'monospace',
                fontSize: 16,
                fill: 0x000000,
                fontWeight: 'bold'
            }
        });
        title.position.set(10, 2);
        win.addChild(titleBg, title);

        // Close button
        const closeBtn = UiStyle.createButton("X", 25, 25, () => {
            this.hideInventory();
            onClose();
        });
        closeBtn.position.set(375, 0);
        win.addChild(closeBtn);

        // List Container
        const listContainer = new PIXI.Container();
        listContainer.position.set(10, 40);
        
        items.forEach((item, i) => {
            const db = ITEMS_DB[item.id];
            const itemRow = new PIXI.Container();
            itemRow.position.set(0, i * 40);

            const bg = new PIXI.Graphics();
            bg.rect(0, 0, 360, 35).fill(0x111111).stroke({ color: 0x333333, width: 1 });
            
            const nameText = `${db.name} (id:${item.instanceId.toString().slice(-4)})`;
            const name = new PIXI.Text({
                text: nameText,
                style: {
                    fontFamily: 'monospace',
                    fontSize: 14,
                    fill: 0xFFFFFF
                }
            });
            name.position.set(10, 8);


            itemRow.addChild(bg, name);
            listContainer.addChild(itemRow);
        });

        const scrollbar = UiStyle.createScrollbar(440);
        scrollbar.position.set(380, 40);
        win.addChild(scrollbar);

        win.addChild(listContainer);
        this.inventoryWindow = win;
        this.app.stage.addChild(win);
        (this.app.canvas as HTMLCanvasElement).style.pointerEvents = 'auto';
    }

    public hideInventory() {
        if (!this.ready) return;
        if (this.inventoryWindow) {
            this.app.stage.removeChild(this.inventoryWindow);
            this.inventoryWindow = null;
        }
        if (!this.chestWindow) {
            (this.app.canvas as HTMLCanvasElement).style.pointerEvents = 'none';
        }
    }

    public showChest(item: ItemInstance, onTake: () => void, onClose: () => void) {
        if (!this.ready) return;
        if (this.chestWindow) this.app.stage.removeChild(this.chestWindow);
        
        const win = UiStyle.createWindow(300, 200);
        win.position.set(370, 290);
        
        const titleBg = new PIXI.Graphics();
        titleBg.rect(0, 0, 300, 25).fill(0xFFFFFF);
        
        const titleText = new PIXI.Text({
            text: "CHEST CONTENT",
            style: {
                fontFamily: 'monospace',
                fontSize: 16,
                fill: 0x000000,
                fontWeight: 'bold'
            }
        });
        titleText.position.set(10, 2);
        win.addChild(titleBg, titleText);

        const closeBtn = UiStyle.createButton("X", 25, 25, () => {
            this.hideChest();
            onClose();
        });
        closeBtn.position.set(275, 0);
        win.addChild(closeBtn);

        const db = ITEMS_DB[item.id];
        if (!db) {
            console.error("Item database entry not found for ID:", item.id);
            onClose();
            return;
        }
        const info = new PIXI.Text({
            text: `FOUND: ${db.name}\n\n${db.desc}`,
            style: {
                fontFamily: 'monospace',
                fontSize: 14,
                fill: 0xFFFFFF,
                wordWrap: true,
                wordWrapWidth: 280
            }
        });
        info.position.set(10, 50);
        win.addChild(info);

        const takeBtn = UiStyle.createButton("TAKE ITEM", 200, 40, () => {
            onTake();
            this.hideChest();
            onClose();
        });
        takeBtn.position.set(50, 140);
        win.addChild(takeBtn);

        this.chestWindow = win;
        this.app.stage.addChild(win);
        (this.app.canvas as HTMLCanvasElement).style.pointerEvents = 'auto';
    }

    public hideChest() {
        if (!this.ready) return;
        if (this.chestWindow) {
            this.app.stage.removeChild(this.chestWindow);
            this.chestWindow = null;
        }
        if (!this.inventoryWindow) {
            (this.app.canvas as HTMLCanvasElement).style.pointerEvents = 'none';
        }
    }

    public update(willpower: number, maxWillpower: number, ammo: string, credits: number, chargeLevel: number = 0, camera?: any) {
        this.state.willpower = willpower;
        this.state.maxWillpower = maxWillpower;
        this.state.ammo = ammo;
        this.state.credits = credits;
        this.state.chargeLevel = chargeLevel;
        if (this.ready) {
            this.updateWillpowerDots();
            this.updateChargeBar();
            this.updateVfx(camera);
        }
    }

    public addLightningChain(points: Array<{x: number, y: number}>, life: number) {
        if (!this.ready) return;
        const g = new PIXI.Graphics();
        this.vfxLayer.addChild(g);
        this.lightnings.push({ graphics: g, life, maxLife: life });
        this.renderLightning(g, points, 1.0);
    }

    public addWallGlow(x: number, y: number) {
        if (!this.ready) return;
        const g = new PIXI.Graphics();
        
        // Draw a soft circular glow
        g.circle(0, 0, 16).fill({ color: 0xFF0066, alpha: 0.3 });
        g.circle(0, 0, 8).fill({ color: 0xFF33CC, alpha: 0.5 });
        
        g.position.set(x, y);
        g.blendMode = 'add';
        
        this.vfxLayer.addChild(g);
        this.wallGlows.push({ graphics: g, phase: Math.random() * Math.PI * 2 });
    }

    public clearWallGlows() {
        if (!this.ready) return;
        this.wallGlows.forEach(w => {
            this.vfxLayer.removeChild(w.graphics);
            w.graphics.destroy();
        });
        this.wallGlows = [];
    }

    public removeWallGlow(x: number, y: number) {
        if (!this.ready) return;
        const index = this.wallGlows.findIndex(w => 
            Math.abs(w.graphics.x - x) < 5 && Math.abs(w.graphics.y - y) < 5
        );
        if (index !== -1) {
            const w = this.wallGlows[index];
            this.vfxLayer.removeChild(w.graphics);
            w.graphics.destroy();
            this.wallGlows.splice(index, 1);
        }
    }

    private updateVfx(camera?: any) {
        if (!this.ready) return;
        
        if (camera) {
            this.vfxLayer.position.set(GAME_WIDTH / 2, GAME_HEIGHT / 2);
            this.vfxLayer.scale.set(camera.zoom);
            this.vfxLayer.pivot.set(camera.x, camera.y);
        }

        // Pulse wall glows
        for (const w of this.wallGlows) {
            w.phase += 0.05;
            w.graphics.alpha = 0.5 + Math.sin(w.phase) * 0.3;
        }

        for (let i = this.lightnings.length - 1; i >= 0; i--) {
            const l = this.lightnings[i];
            l.life--;
            if (l.life <= 0) {
                this.vfxLayer.removeChild(l.graphics);
                l.graphics.destroy();
                this.lightnings.splice(i, 1);
            } else {
                const alpha = l.life / l.maxLife;
                l.graphics.alpha = alpha;
            }
        }
    }

    private renderLightning(g: PIXI.Graphics, points: Array<{x: number, y: number}>, alpha: number) {
        g.clear();
        
        for (let i = 0; i < points.length - 1; i++) {
            const p1 = points[i];
            const p2 = points[i+1];
            
            // Draw main glow (blue)
            g.moveTo(p1.x, p1.y);
            this.drawJaggedLine(g, p1.x, p1.y, p2.x, p2.y, 4, 0x0088FF, 0.6);
            
            // Draw core (white)
            g.moveTo(p1.x, p1.y);
            this.drawJaggedLine(g, p1.x, p1.y, p2.x, p2.y, 1.5, 0xFFFFFF, 1.0);
        }
    }

    private drawJaggedLine(g: PIXI.Graphics, x1: number, y1: number, x2: number, y2: number, width: number, color: number, alpha: number) {
        const dist = Math.sqrt((x2-x1)**2 + (y2-y1)**2);
        const steps = Math.floor(dist / 10);
        const dx = (x2 - x1) / steps;
        const dy = (y2 - y1) / steps;
        
        g.setStrokeStyle({ width, color, alpha, cap: 'round', join: 'round' });
        g.moveTo(x1, y1);
        
        for (let i = 1; i < steps; i++) {
            const tx = x1 + dx * i + (Math.random() - 0.5) * 12;
            const ty = y1 + dy * i + (Math.random() - 0.5) * 12;
            g.lineTo(tx, ty);
        }
        g.lineTo(x2, y2);
        g.stroke();
    }
}
