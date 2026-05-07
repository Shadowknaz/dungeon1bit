import { defineComponent, Types } from 'bitecs';

export const Position = defineComponent({
  x: Types.f32,
  y: Types.f32,
});

export const Velocity = defineComponent({
  x: Types.f32,
  y: Types.f32,
});

export const Health = defineComponent({
  current: Types.f32,
  max: Types.f32,
});

export const Sprite = defineComponent({
  textureId: Types.ui32, // ID for sprite mapping
});

export const PlayerTag = defineComponent();
export const EnemyTag = defineComponent();
export const NpcTag = defineComponent();
