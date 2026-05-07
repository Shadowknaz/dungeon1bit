import * as defs from '../data/spriteDefs';

export class SpriteCache {
  private cache = new Map<string, ImageBitmap>();
  private rng: () => number;

  constructor(customRng?: () => number) {
    // Use custom RNG if provided (for reproducible results), otherwise Math.random
    this.rng = customRng || Math.random;
  }

  public async generateAll(): Promise<void> {
    const tasks = Object.entries(defs).map(async ([key, def]) => {
        // Skip non-sprite exports if any
        if (!def || typeof def !== 'object' || !('pixels' in def)) return;
        await this.renderDef(key, def as defs.SpriteDef);
    });
    
    await Promise.all(tasks);
  }

  /**
   * Создает вариацию спрайта с небольшими случайными изменениями
   * @param baseKey базовый ключ спрайта
   * @param variationSeed сид для вариации (0-1)
   * @returns ключ вариации или базовый ключ если вариация не создана
   */
  public createVariation(baseKey: string, variationSeed: number): string {
    // Для производительности используем предопределенные вариации вместо процедурной генерации
    const variations = ['_var1', '_var2', '_var3'];
    const variationIndex = Math.floor(variationSeed * variations.length);
    const variationKey = `${baseKey}${variations[variationIndex]}`;
    
    // Если вариация существует в кэше, возвращаем её
    if (this.cache.has(variationKey)) {
      return variationKey;
    }
    
    // Иначе возвращаем базовый спрайт
    return baseKey;
  }

  /**
   * Получить случайную вариацию спрайта
   * @param baseKey базовый ключ спрайта
   * @returns ключ спрайта (вариация или базовый)
   */
  public getRandomVariation(baseKey: string): string {
    return this.createVariation(baseKey, this.rng());
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
