import { defineComponent, Types } from 'bitecs';

export const Position = defineComponent({
  x: Types.f32,
  y: Types.f32,
  angle: Types.f32
});

export const Velocity = defineComponent({
  x: Types.f32,
  y: Types.f32,
});

export const Health = defineComponent({
  current: Types.f32,
  max: Types.f32,
});

export const Stats = defineComponent({
  speed: Types.f32,
  detectionRange: Types.f32,
  radius: Types.f32
});

export const AI = defineComponent({
  role: Types.ui8, // 0: guard, 1: patroller, 2: follower, 3: wanderer
  alertTimer: Types.i32,
  barkTimer: Types.i32,
  memoryTimer: Types.i32,
  status: Types.ui8, // 0: none, 1: oil, 2: petroleum, 3: water
  statusTimer: Types.i32,
  noiseLevel: Types.f32
});

export const Combat = defineComponent({
  shootTimer: Types.i32,
  ammo: Types.i32,
  reloadTimer: Types.i32,
  iframeTimer: Types.i32
});

export const PlayerTag = defineComponent();
export const EnemyTag = defineComponent();
export const NpcTag = defineComponent();

// Enemy Type Tags
export const ShooterTag = defineComponent();
export const ChaserTag = defineComponent();

// Grenade and Projectile Components
export const GrenadeTag = defineComponent();
export const Timer = defineComponent({
  value: Types.i32
});
export const Explosive = defineComponent({
  radius: Types.f32,
  damage: Types.i32,
  type: Types.ui8 // 0: HE, 1: Flash
});
export const ProjectileTag = defineComponent();
export const Bounces = defineComponent({
  value: Types.i32
});
export const EnemyProjectileTag = defineComponent();

export const LaserBeam = defineComponent({
  x1: Types.f32,
  y1: Types.f32,
  x2: Types.f32,
  y2: Types.f32,
  width: Types.f32,
  life: Types.i32,
  maxLife: Types.i32
});

export const LightningChain = defineComponent({
  pointsX: [Types.f32, 6],
  pointsY: [Types.f32, 6],
  count: Types.ui8,
  life: Types.i32,
  maxLife: Types.i32
});
