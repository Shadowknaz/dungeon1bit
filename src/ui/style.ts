import * as PIXI from 'pixi.js';

export class UiStyle {
    private static frameTexture: PIXI.Texture | null = null;
    private static borderTexture: PIXI.Texture | null = null;

    /**
     * Initializes the UI styles by rendering them once to textures.
     * This follows the 9-slice optimization requested.
     */
    public static init(renderer: PIXI.Renderer) {
        const graphics = new PIXI.Graphics();
        
        // Window Background (black)
        graphics.rect(0, 0, 24, 24).fill(0x000000);

        // Window Border (white)
        graphics.rect(0, 0, 24, 24).stroke({ color: 0xFFFFFF, width: 1 });
        
        // Inner detail (1px offset)
        graphics.rect(2, 2, 20, 20).stroke({ color: 0xFFFFFF, alpha: 0.5, width: 1 });

        this.frameTexture = renderer.generateTexture(graphics);
        
        // Simple border texture
        graphics.clear();
        graphics.rect(0, 0, 16, 16).stroke({ color: 0xFFFFFF, width: 1 });
        this.borderTexture = renderer.generateTexture(graphics);
    }

    public static createWindow(width: number, height: number): PIXI.NineSliceSprite {
        if (!this.frameTexture) throw new Error("UiStyle not initialized");
        const window = new PIXI.NineSliceSprite({
            texture: this.frameTexture,
            leftWidth: 8,
            topHeight: 8,
            rightWidth: 8,
            bottomHeight: 8
        });
        window.width = width;
        window.height = height;
        return window;
    }

    public static createScrollbar(height: number): PIXI.Container {
        const container = new PIXI.Container();
        
        // Track
        const track = new PIXI.Graphics();
        track.rect(0, 0, 10, height).fill(0x111111);
        track.rect(0, 0, 10, height).stroke({ color: 0x333333, width: 1 });
        
        // Thumb (Handle)
        const thumb = new PIXI.Graphics();
        thumb.rect(2, 2, 6, 20).fill(0xFFFFFF);
        
        container.addChild(track, thumb);
        return container;
    }

    public static createButton(text: string, width: number, height: number, callback: () => void): PIXI.Container {
        const container = new PIXI.Container();
        container.eventMode = 'static';
        container.cursor = 'pointer';

        const bg = new PIXI.Graphics();
        bg.rect(0, 0, width, height).fill(0x000000);
        bg.rect(0, 0, width, height).stroke({ color: 0xFFFFFF, width: 1 });

        const label = new PIXI.Text({
            text,
            style: {
                fontFamily: 'monospace',
                fontSize: 14,
                fill: 0xFFFFFF,
                align: 'center'
            }
        });
        label.anchor.set(0.5);
        label.position.set(width / 2, height / 2);

        container.addChild(bg, label);
        container.on('pointerdown', callback);
        
        container.on('pointerover', () => { bg.tint = 0x444444; });
        container.on('pointerout', () => { bg.tint = 0xFFFFFF; });

        return container;
    }
}
