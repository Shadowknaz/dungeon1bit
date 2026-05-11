export const GAME_WIDTH = 960;
export const GAME_HEIGHT = 720;
export const TILE_SIZE = 20;

export const MAP_COLS = (GAME_WIDTH / TILE_SIZE) * 2;
export const MAP_ROWS = (GAME_HEIGHT / TILE_SIZE) * 2;
export const WORLD_WIDTH = MAP_COLS * TILE_SIZE;
export const WORLD_HEIGHT = MAP_ROWS * TILE_SIZE;
export const FIXED_TIMESTEP_MS = 1000 / 60;
export const MAX_FRAME_TIME_MS = 100;
export const GAME_SPEED = 2.2; // Global speed multiplier

export const INV_COLS = 8;
export const INV_ROWS = 6;
export const SLOT_SIZE = 30;

export const ENEMY_BARKS = ["!?", "ВИЖУ!", "СЮДА!", "СМЕРТЬ!", "ШОРОХ..."];

// Gameplay Costs
export const COST_BUY_RANDOM = 50;
export const COST_HEAL = 30;

// Generation & Secrets
export const UNIFORM_LEVEL_MIN = 1;
export const UNIFORM_CHANCE = 1.0;

// BSP Generation
export const BSP_MIN_ROOM_SIZE = 5;
export const BSP_MAX_ROOM_SIZE = 15;
export const BSP_MIN_LEAF_SIZE = 10;
export const BSP_SPLIT_VARIANCE = 0.4;
export const BSP_ROOM_PADDING = 1;
export const BSP_CORRIDOR_WIDTH = 2;
export const BSP_LOOP_CHANCE = 0.3;
export const BSP_SECRET_CHANCE = 0.2;

// Loner Spawning
export const LONER_BASE_COUNT_MIN = 8;
export const LONER_BASE_COUNT_MAX = 16;
export const LONER_PER_ROOM_MIN = 1;
export const LONER_PER_ROOM_MAX = 2;

// Enemy Spawn Chances
export const CHANCE_GOLEM = 0.9;
export const CHANCE_ELITE = 0.1;
export const CHANCE_SNIPER = 0.5;
export const CHANCE_LONER_SNIPER = 0.3;
export const MIN_LEVEL_ELITE = 3;

// Timers & Durations
export const DASH_COOLDOWN = 120;
export const DASH_IFRAME_DURATION = 18;
export const DEATH_ANIM_DURATION = 120;

// Physics
export const OBJECT_BLOCK_RADIUS_FACTOR = 0.8;

// ECS Enums (Mappings)
export const AI_ROLES = {
  guard: 0,
  patroller: 1,
  follower: 2,
  wanderer: 3,
  ambush: 4
} as const;

export const AI_STATUS = {
  none: 0,
  oil: 1,
  petroleum: 2,
  water: 3
} as const;

// Performance — Passability cache
export const PASSABILITY_TILE_WALL = 1;
export const PASSABILITY_TILE_DESTRUCTIBLE = 3;

// Performance — System throttling intervals (frames)
export const BFS_UPDATE_INTERVAL = 4;
export const AI_VISION_INTERVAL = 8;
export const LIGHTING_FULL_INTERVAL = 2;
export const FLUID_STEP_INTERVAL = 4;

// AI Behavior
export const AI_DIRECT_LOS_RANGE = 160;
export const AI_ASTAR_NODE_LIMIT = 200;
export const AI_PATH_CACHE_TTL = 15;
export const AI_PATH_RECALC_INTERVAL = 60;
export const AI_SAFE_MOVE_RADIUS = 8;
export const AI_ACTIVE_RADIUS_TILES = 30;
export const AI_SEPARATION_RADIUS_TILES = 20;

// Lighting & Vision
export const PLAYER_VISION_RADIUS = 15;
export const STEAM_VISION_RADIUS = 5;
export const STEAM_DENSITY_THRESHOLD = 50;
export const VISIBILITY_ABSOLUTE_RADIUS = 2;
export const PLAYER_FOV_ANGLE = Math.PI / 3;
