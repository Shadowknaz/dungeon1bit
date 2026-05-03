import { SpriteCache } from './spriteCache';

export interface AnimDef {
  frames: string[];   // Keys in SpriteCache
  fps: number;
  loop: boolean;
}

export class AnimatedSprite {
  private currentFrame = 0;
  private timer = 0;

  constructor(private def: AnimDef) {}

  public update(dt: number): void {
    this.timer += dt;
    const frameDuration = 1000 / this.def.fps;
    if (this.timer >= frameDuration) {
      this.timer -= frameDuration;
      this.currentFrame++;
      if (this.currentFrame >= this.def.frames.length) {
        this.currentFrame = this.def.loop ? 0 : this.def.frames.length - 1;
      }
    }
  }

  public draw(ctx: CanvasRenderingContext2D, cache: SpriteCache, x: number, y: number, flipX = false, scaleX = 1, scaleY = 1): void {
    const sprite = cache.get(this.def.frames[this.currentFrame]);
    if (!sprite) return;

    if (flipX || scaleX !== 1 || scaleY !== 1) {
      ctx.save();
      ctx.translate(x, y);
      ctx.scale(flipX ? -scaleX : scaleX, scaleY);
      ctx.drawImage(sprite, -sprite.width / 2, -sprite.height / 2);
      ctx.restore();
    } else {
      ctx.drawImage(sprite, x - sprite.width / 2, y - sprite.height / 2);
    }
  }

  public reset(): void {
      this.currentFrame = 0;
      this.timer = 0;
  }
}
