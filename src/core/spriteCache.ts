import * as defs from '../data/spriteDefs';

export class SpriteCache {
  private cache = new Map<string, ImageBitmap>();

  public async generateAll(): Promise<void> {
    const tasks = Object.entries(defs).map(async ([key, def]) => {
        // Skip non-sprite exports if any
        if (!def || typeof def !== 'object' || !('pixels' in def)) return;
        await this.renderDef(key, def as defs.SpriteDef);
    });
    
    await Promise.all(tasks);
  }

  private async renderDef(key: string, def: defs.SpriteDef): Promise<void> {
    const oc = new OffscreenCanvas(def.w * def.scale, def.h * def.scale);
    const ctx = oc.getContext('2d', { alpha: true })!;

    // Transparent background
    ctx.clearRect(0, 0, oc.width, oc.height);

    // If outline is enabled, draw black pixels shifted by 1 scale unit in all 4 directions
    if (def.outline) {
      ctx.fillStyle = '#000';
      for (let row = 0; row < def.pixels.length; row++) {
        for (let col = 0; col < def.w; col++) {
          const bit = (def.pixels[row] >> (def.w - 1 - col)) & 1;
          if (bit) {
            const px = col * def.scale;
            const py = row * def.scale;
            ctx.fillRect(px - def.scale, py, def.scale, def.scale); // left
            ctx.fillRect(px + def.scale, py, def.scale, def.scale); // right
            ctx.fillRect(px, py - def.scale, def.scale, def.scale); // top
            ctx.fillRect(px, py + def.scale, def.scale, def.scale); // bottom
            
            // Corners for a thicker outline (optional, but good for 1-bit)
            ctx.fillRect(px - def.scale, py - def.scale, def.scale, def.scale);
            ctx.fillRect(px + def.scale, py - def.scale, def.scale, def.scale);
            ctx.fillRect(px - def.scale, py + def.scale, def.scale, def.scale);
            ctx.fillRect(px + def.scale, py + def.scale, def.scale, def.scale);
          }
        }
      }
    }

    // Draw white pixels on top
    ctx.fillStyle = '#fff';
    for (let row = 0; row < def.pixels.length; row++) {
      for (let col = 0; col < def.w; col++) {
        const bit = (def.pixels[row] >> (def.w - 1 - col)) & 1;
        if (bit) {
          ctx.fillRect(
            col * def.scale,
            row * def.scale,
            def.scale,
            def.scale
          );
        }
      }
    }

    this.cache.set(key, await createImageBitmap(oc));
  }

  public get(key: string): ImageBitmap | undefined {
    return this.cache.get(key);
  }
}
