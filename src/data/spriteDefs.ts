// ============================================================
// SPRITE DEFINITIONS — 1-bit pixel matrices (Minit style)
// Каждый элемент массива = строка пикселей (биты слева направо)
// Базовый размер: 10×10 пикселей, scale=2 → 20×20 на экране
// ============================================================

export interface SpriteDef {
  w: number;       // ширина в пикселях
  h: number;       // высота в пикселях
  scale: number;   // масштаб (pixel size)
  pixels: number[];
  outline?: boolean;
}

// --- ТАЙЛЫ ---

export const tile_floor: SpriteDef = {
  w: 10, h: 10, scale: 2, outline: false,
  pixels: [
    0b0000000000,
    0b0000000000,
    0b0010000000,
    0b0000000000,
    0b0000001000,
    0b0000000000,
    0b0001000000,
    0b0000000000,
    0b0000000010,
    0b0000000000,
  ]
};

// Вариации пола для разнообразия
export const tile_floor_var1: SpriteDef = {
  w: 10, h: 10, scale: 2, outline: false,
  pixels: [
    0b0000000000,
    0b0000000000,
    0b0000100000,
    0b0000000000,
    0b0000000100,
    0b0000000000,
    0b0000001000,
    0b0000000000,
    0b0000000010,
    0b0000000000,
  ]
};

export const tile_floor_var2: SpriteDef = {
  w: 10, h: 10, scale: 2, outline: false,
  pixels: [
    0b0000000000,
    0b0000000000,
    0b0010000000,
    0b0000000000,
    0b0000010000,
    0b0000000000,
    0b0000000100,
    0b0000000000,
    0b0000001000,
    0b0000000000,
  ]
};

export const tile_floor_var3: SpriteDef = {
  w: 10, h: 10, scale: 2, outline: false,
  pixels: [
    0b0000000000,
    0b0000000000,
    0b0001000000,
    0b0000000000,
    0b0000000100,
    0b0000000000,
    0b0000010000,
    0b0000000000,
    0b0000000001,
    0b0000000000,
  ]
};

export const tile_floor_secret: SpriteDef = {
  w: 10, h: 10, scale: 2, outline: false,
  pixels: [
    0b1010101010,
    0b0101010101,
    0b1010101010,
    0b0101010101,
    0b1010101010,
    0b0101010101,
    0b1010101010,
    0b0101010101,
    0b1010101010,
    0b0101010101,
  ]
};

// 16 вариантов стен по битовой маске соседей (вверх|право|вниз|лево)
// 0000 — изолированный столб
export const tile_wall_0000: SpriteDef = {
  w: 10, h: 10, scale: 2, outline: false,
  pixels: [
    0b0011111100,
    0b0111111110,
    0b1111111111,
    0b1111111111,
    0b1111111111,
    0b1111111111,
    0b1111111111,
    0b1111111111,
    0b0111111110,
    0b0011111100,
  ]
};

// 1111 — со всех сторон (кирпичная кладка)
export const tile_wall_1111: SpriteDef = {
  w: 10, h: 10, scale: 2, outline: false,
  pixels: [
    0b1111111111,
    0b1000100011,
    0b1111111111,
    0b0011000110,
    0b1111111111,
    0b1000100011,
    0b1111111111,
    0b0011000110,
    0b1111111111,
    0b1111111111,
  ]
};

// Вариации стены 1111 для разнообразия
export const tile_wall_1111_var1: SpriteDef = {
  w: 10, h: 10, scale: 2, outline: false,
  pixels: [
    0b1111111111,
    0b1000100011,
    0b1111011111,
    0b0011000110,
    0b1111111111,
    0b1000100011,
    0b1111111101,
    0b0011000110,
    0b1111111111,
    0b1111111111,
  ]
};

export const tile_wall_1111_var2: SpriteDef = {
  w: 10, h: 10, scale: 2, outline: false,
  pixels: [
    0b1111111111,
    0b1000100011,
    0b1111111111,
    0b0011000110,
    0b1110111111,
    0b1000100011,
    0b1111111111,
    0b0011000110,
    0b1111111111,
    0b1111111111,
  ]
};

// Поврежденная стена (трещины)
export const tile_wall_damaged: SpriteDef = {
  w: 10, h: 10, scale: 2, outline: false,
  pixels: [
    0b1111111111,
    0b1000100011,
    0b1111111111,
    0b0011000110,
    0b1111111111,
    0b1000100011,
    0b1111111111,
    0b0010000110,
    0b1111111111,
    0b1111111111,
  ]
};

// 0001 — примыкает сверху
export const tile_wall_0001: SpriteDef = {
  w: 10, h: 10, scale: 2, outline: false,
  pixels: [
    0b1111111111,
    0b1111111111,
    0b1111111111,
    0b1111111111,
    0b1111111111,
    0b1111111111,
    0b1111111111,
    0b1111111111,
    0b0111111110,
    0b0011111100,
  ]
};

// 0100 — примыкает снизу
export const tile_wall_0100: SpriteDef = {
  w: 10, h: 10, scale: 2, outline: false,
  pixels: [
    0b0011111100,
    0b0111111110,
    0b1111111111,
    0b1111111111,
    0b1111111111,
    0b1111111111,
    0b1111111111,
    0b1111111111,
    0b1111111111,
    0b1111111111,
  ]
};

// 0010 — примыкает справа
export const tile_wall_0010: SpriteDef = {
  w: 10, h: 10, scale: 2, outline: false,
  pixels: [
    0b0011111111,
    0b0111111111,
    0b1111111111,
    0b1111111111,
    0b1111111111,
    0b1111111111,
    0b1111111111,
    0b1111111111,
    0b0111111111,
    0b0011111111,
  ]
};

// 1000 — примыкает слева
export const tile_wall_1000: SpriteDef = {
  w: 10, h: 10, scale: 2, outline: false,
  pixels: [
    0b1111111100,
    0b1111111110,
    0b1111111111,
    0b1111111111,
    0b1111111111,
    0b1111111111,
    0b1111111111,
    0b1111111111,
    0b1111111110,
    0b1111111100,
  ]
};

// 0101 — вверх+вниз (вертикальная полоса)
export const tile_wall_0101: SpriteDef = {
  w: 10, h: 10, scale: 2, outline: false,
  pixels: [
    0b1111111111,
    0b1111111111,
    0b1111111111,
    0b1111111111,
    0b1111111111,
    0b1111111111,
    0b1111111111,
    0b1111111111,
    0b1111111111,
    0b1111111111,
  ]
};

// 1010 — лево+право (горизонтальная полоса)
export const tile_wall_1010: SpriteDef = {
  w: 10, h: 10, scale: 2, outline: false,
  pixels: [
    0b1111111111,
    0b1111111111,
    0b1111111111,
    0b1111111111,
    0b1111111111,
    0b1111111111,
    0b1111111111,
    0b1111111111,
    0b1111111111,
    0b1111111111,
  ]
};

// 0110 — право+вниз (угол верх-лево)
export const tile_wall_0110: SpriteDef = {
  w: 10, h: 10, scale: 2, outline: false,
  pixels: [
    0b0011111111,
    0b0111111111,
    0b1111111111,
    0b1111111111,
    0b1111111111,
    0b1111111111,
    0b1111111111,
    0b1111111111,
    0b1111111111,
    0b1111111111,
  ]
};

// 1100 — лево+вниз (угол верх-право)
export const tile_wall_1100: SpriteDef = {
  w: 10, h: 10, scale: 2, outline: false,
  pixels: [
    0b1111111100,
    0b1111111110,
    0b1111111111,
    0b1111111111,
    0b1111111111,
    0b1111111111,
    0b1111111111,
    0b1111111111,
    0b1111111111,
    0b1111111111,
  ]
};

// 0011 — вверх+право (угол низ-лево)
export const tile_wall_0011: SpriteDef = {
  w: 10, h: 10, scale: 2, outline: false,
  pixels: [
    0b1111111111,
    0b1111111111,
    0b1111111111,
    0b1111111111,
    0b1111111111,
    0b1111111111,
    0b1111111111,
    0b1111111111,
    0b0111111111,
    0b0011111111,
  ]
};

// 1001 — вверх+лево (угол низ-право)
export const tile_wall_1001: SpriteDef = {
  w: 10, h: 10, scale: 2, outline: false,
  pixels: [
    0b1111111111,
    0b1111111111,
    0b1111111111,
    0b1111111111,
    0b1111111111,
    0b1111111111,
    0b1111111111,
    0b1111111111,
    0b1111111110,
    0b1111111100,
  ]
};

// 0111 — право+вниз+вверх (T-образное, слева открыто)
export const tile_wall_0111: SpriteDef = {
  w: 10, h: 10, scale: 2, outline: false,
  pixels: [
    0b1111111111,
    0b1111111111,
    0b1111111111,
    0b1111111111,
    0b1111111111,
    0b1111111111,
    0b1111111111,
    0b1111111111,
    0b1111111111,
    0b1111111111,
  ]
};

// 1011 — лево+вверх+вниз (T-образное, справа открыто)
export const tile_wall_1011: SpriteDef = {
  w: 10, h: 10, scale: 2, outline: false,
  pixels: [
    0b1111111111,
    0b1111111111,
    0b1111111111,
    0b1111111111,
    0b1111111111,
    0b1111111111,
    0b1111111111,
    0b1111111111,
    0b1111111111,
    0b1111111111,
  ]
};

// 1101 — лево+право+вверх (T-образное, снизу открыто)
export const tile_wall_1101: SpriteDef = {
  w: 10, h: 10, scale: 2, outline: false,
  pixels: [
    0b1111111111,
    0b1111111111,
    0b1111111111,
    0b1111111111,
    0b1111111111,
    0b1111111111,
    0b1111111111,
    0b1111111111,
    0b0111111110,
    0b0011111100,
  ]
};

// 1110 — лево+право+вниз (T-образное, сверху открыто)
export const tile_wall_1110: SpriteDef = {
  w: 10, h: 10, scale: 2, outline: false,
  pixels: [
    0b0011111100,
    0b0111111110,
    0b1111111111,
    0b1111111111,
    0b1111111111,
    0b1111111111,
    0b1111111111,
    0b1111111111,
    0b1111111111,
    0b1111111111,
  ]
};

// --- СУЩНОСТИ ---

// Игрок — вид сверху (Minit-стиль, 10×10) - УЛУЧШЕННАЯ ДЕТАЛИЗАЦИЯ
export const entity_player_d0: SpriteDef = {
  w: 10, h: 10, scale: 2, outline: true,
  pixels: [
    0b0001111000,
    0b0011111100,
    0b0111111110,
    0b1110110111,
    0b1111111111,
    0b1111111111,
    0b0111111110,
    0b0110110110,
    0b0110110110,
    0b0011001100,
  ]
};

// Игрок кадр 2 (анимация ходьбы — ноги) - УЛУЧШЕННАЯ ДЕТАЛИЗАЦИЯ
export const entity_player_d1: SpriteDef = {
  w: 10, h: 10, scale: 2, outline: true,
  pixels: [
    0b0001111000,
    0b0011111100,
    0b0111111110,
    0b1110110111,
    0b1111111111,
    0b1111111111,
    0b0111111110,
    0b0100110010,
    0b0110000010,
    0b0011001100,
  ]
};

// Игрок — смотрит вверх - УЛУЧШЕННАЯ ДЕТАЛИЗАЦИЯ
export const entity_player_u0: SpriteDef = {
  w: 10, h: 10, scale: 2, outline: true,
  pixels: [
    0b0011001100,
    0b0110110110,
    0b0110110110,
    0b0111111110,
    0b0111111110,
    0b1111111111,
    0b1110110111,
    0b0111111110,
    0b0011111100,
    0b0001111000,
  ]
};

export const entity_player_u1: SpriteDef = {
  w: 10, h: 10, scale: 2, outline: true,
  pixels: [
    0b0011001100,
    0b0100110010,
    0b0110000010,
    0b0111111110,
    0b0111111110,
    0b1111111111,
    0b1110110111,
    0b0111111110,
    0b0011111100,
    0b0001111000,
  ]
};

// Игрок — смотрит вправо - УЛУЧШЕННАЯ ДЕТАЛИЗАЦИЯ
export const entity_player_r0: SpriteDef = {
  w: 10, h: 10, scale: 2, outline: true,
  pixels: [
    0b0001111000,
    0b0011111100,
    0b0111111110,
    0b1111011111,
    0b1111111111,
    0b1111111111,
    0b0111111110,
    0b0011111100,
    0b0001100110,
    0b0011001100,
  ]
};

export const entity_player_r1: SpriteDef = {
  w: 10, h: 10, scale: 2, outline: true,
  pixels: [
    0b0001111000,
    0b0011111100,
    0b0111111110,
    0b1111011111,
    0b1111111111,
    0b1111111111,
    0b0111111110,
    0b0011111100,
    0b0011001100,
    0b0001100110,
  ]
};

// --- ВРАГИ ---

// Chaser (преследователь) — угловатый, страшный - УЛУЧШЕННАЯ ДЕТАЛИЗАЦИЯ
export const entity_enemy_chaser_0: SpriteDef = {
  w: 10, h: 10, scale: 2, outline: true,
  pixels: [
    0b0111111110,
    0b1111111111,
    0b1101111011,
    0b1111001111,
    0b1111001111,
    0b1101111011,
    0b1011111101,
    0b1101111011,
    0b0110110110,
    0b0101001010,
  ]
};

export const entity_enemy_chaser_1: SpriteDef = {
  w: 10, h: 10, scale: 2, outline: true,
  pixels: [
    0b0111111110,
    0b1111111111,
    0b1101111011,
    0b1111001111,
    0b1111001111,
    0b1101111011,
    0b1011111101,
    0b1101111011,
    0b0010110100,
    0b0110000010,
  ]
};

// Shooter (стрелок) — с "прицелом" - УЛУЧШЕННАЯ ДЕТАЛИЗАЦИЯ
export const entity_enemy_shooter_0: SpriteDef = {
  w: 10, h: 10, scale: 2, outline: true,
  pixels: [
    0b0011111100,
    0b0111111110,
    0b1110111011,
    0b1101001011,
    0b1100000011,
    0b1101001011,
    0b1110111011,
    0b0111111110,
    0b0001111000,
    0b0000110000,
  ]
};

export const entity_enemy_shooter_1: SpriteDef = {
  w: 10, h: 10, scale: 2, outline: true,
  pixels: [
    0b0011111100,
    0b0111111110,
    0b1110111011,
    0b1101111011,
    0b1100110011,
    0b1101111011,
    0b1110111011,
    0b0111111110,
    0b0001111000,
    0b0000110000,
  ]
};

// Alert-знак над врагом (!)
export const entity_alert: SpriteDef = {
  w: 4, h: 6, scale: 2, outline: false,
  pixels: [
    0b0110,
    0b0110,
    0b0110,
    0b0110,
    0b0000,
    0b0110,
  ]
};

// --- ОБЪЕКТЫ ---

// Сундук закрытый - УЛУЧШЕННАЯ ДЕТАЛИЗАЦИЯ
export const object_chest_closed: SpriteDef = {
  w: 10, h: 8, scale: 2, outline: true,
  pixels: [
    0b0111111110,
    0b1111111111,
    0b1011111101,
    0b1011111101,
    0b1111111111,
    0b1010101011,
    0b1111111111,
    0b0111111110,
  ]
};

// Сундук открытый - УЛУЧШЕННАЯ ДЕТАЛИЗАЦИЯ
export const object_chest_open: SpriteDef = {
  w: 10, h: 8, scale: 2, outline: true,
  pixels: [
    0b1111111111,
    0b1011111101,
    0b1011111101,
    0b0111111110,
    0b0000000000,
    0b1010101011,
    0b1111111111,
    0b0111111110,
  ]
};

export const obj_chest: SpriteDef = object_chest_closed;

export const obj_altar: SpriteDef = {
  w: 10, h: 10, scale: 2, outline: true,
  pixels: [
    0b0011111000,
    0b0111111100,
    0b1110011110,
    0b1110011110,
    0b1111111110,
    0b1111111110,
    0b1110011110,
    0b1110011110,
    0b0111111100,
    0b0011111000,
  ]
};

export const entity_npc: SpriteDef = {
  w: 8, h: 10, scale: 2, outline: true,
  pixels: [
    0b00111100,
    0b01111110,
    0b11111111,
    0b11011011,
    0b11111111,
    0b00111100,
    0b01111110,
    0b01111110,
    0b00100100,
    0b00100100,
  ]
};

export const entity_npc_hand: SpriteDef = {
  w: 6, h: 4, scale: 2, outline: false,
  pixels: [
    0b011110,
    0b111111,
    0b011110,
    0b001000,
  ]
};

export const entity_npc_elder: SpriteDef = entity_npc;

export const object_barrel_water: SpriteDef = {
  w: 8, h: 10, scale: 2, outline: true,
  pixels: [
    0b01111110,
    0b11111111,
    0b10111101,
    0b11111111,
    0b10111101,
    0b10111101,
    0b11111111,
    0b10111101,
    0b11111111,
    0b01111110,
  ]
};

// Бочка (масло) - УЛУЧШЕННАЯ ДЕТАЛИЗАЦИЯ
export const object_barrel_oil: SpriteDef = {
  w: 8, h: 10, scale: 2, outline: true,
  pixels: [
    0b01111110,
    0b11111111,
    0b10111101,
    0b11111111,
    0b10111101,
    0b10111101,
    0b11111111,
    0b10111101,
    0b11111111,
    0b01111110,
  ]
};

// Бочка (взрывчатка) - УЛУЧШЕННАЯ ДЕТАЛИЗАЦИЯ
export const object_barrel_explosive: SpriteDef = {
  w: 8, h: 10, scale: 2, outline: true,
  pixels: [
    0b00111100,
    0b01111110,
    0b11111111,
    0b10111101,
    0b11111111,
    0b10111101,
    0b10111101,
    0b11111111,
    0b11111111,
    0b01111110,
  ]
};

export const obj_barrel: SpriteDef = object_barrel_water;

// Дверь закрытая
export const object_door_closed: SpriteDef = {
  w: 10, h: 10, scale: 2, outline: true,
  pixels: [
    0b1111111111,
    0b1000000001,
    0b1011111101,
    0b1010000101,
    0b1010110101,
    0b1010110101,
    0b1010000101,
    0b1011111101,
    0b1000000001,
    0b1111111111,
  ]
};

// Дверь открытая
export const object_door_open: SpriteDef = {
  w: 10, h: 10, scale: 2, outline: true,
  pixels: [
    0b1100000011,
    0b1000000001,
    0b1000000001,
    0b1000000001,
    0b1000000001,
    0b1000000001,
    0b1000000001,
    0b1000000001,
    0b1000000001,
    0b1100000011,
  ]
};

// --- ЛОВУШКИ ---

// Яма
export const trap_pit: SpriteDef = {
  w: 10, h: 10, scale: 2, outline: false,
  pixels: [
    0b0011111100,
    0b0111111110,
    0b1110000111,
    0b1100000011,
    0b1100000011,
    0b1100000011,
    0b1100000011,
    0b1110000111,
    0b0111111110,
    0b0011111100,
  ]
};

export const tile_pit: SpriteDef = trap_pit;

// Шипы — спокойно
export const trap_spike_idle: SpriteDef = {
  w: 10, h: 10, scale: 2, outline: false,
  pixels: [
    0b0000000000,
    0b0000000000,
    0b0000000000,
    0b0000000000,
    0b0000000000,
    0b0010100010,
    0b0110110110,
    0b1111111111,
    0b1111111111,
    0b1111111111,
  ]
};

// Шипы — выдвигаются
export const trap_spike_rising: SpriteDef = {
  w: 10, h: 10, scale: 2, outline: false,
  pixels: [
    0b0000000000,
    0b0010100010,
    0b0010100010,
    0b0110110110,
    0b0110110110,
    0b1110110111,
    0b1111111111,
    0b1111111111,
    0b1111111111,
    0b1111111111,
  ]
};

// Шипы — выдвинуты
export const trap_spike_out: SpriteDef = {
  w: 10, h: 10, scale: 2, outline: false,
  pixels: [
    0b0010100010,
    0b0010100010,
    0b0110110110,
    0b0110110110,
    0b1110110111,
    0b1111111111,
    0b1111111111,
    0b1111111111,
    0b1111111111,
    0b1111111111,
  ]
};

// Мина
export const trap_mine: SpriteDef = {
  w: 8, h: 8, scale: 2, outline: true,
  pixels: [
    0b00011000,
    0b01000100,
    0b10111101,
    0b11011011,
    0b11011011,
    0b10111101,
    0b01000100,
    0b00011000,
  ]
};

// Лезвие-ловушка
export const hazard_blade: SpriteDef = {
  w: 10, h: 10, scale: 2, outline: true,
  pixels: [
    0b1000000001,
    0b0100000010,
    0b0011000100,
    0b0001111000,
    0b0000110000,
    0b0000110000,
    0b0001111000,
    0b0011000100,
    0b0100000010,
    0b1000000001,
  ]
};

// --- СНАРЯДЫ ---

export const bullet_player: SpriteDef = {
  w: 4, h: 4, scale: 2, outline: false,
  pixels: [
    0b0110,
    0b1111,
    0b1111,
    0b0110,
  ]
};

export const bullet_enemy: SpriteDef = {
  w: 4, h: 4, scale: 2, outline: false,
  pixels: [
    0b0110,
    0b1001,
    0b1001,
    0b0110,
  ]
};

// --- ЧАСТИЦЫ (fx) ---

export const fx_particle_0: SpriteDef = {
  w: 3, h: 3, scale: 2, outline: false,
  pixels: [0b010, 0b111, 0b010]
};

export const fx_particle_1: SpriteDef = {
  w: 4, h: 4, scale: 2, outline: false,
  pixels: [0b1000, 0b0100, 0b0010, 0b0001]
};

export const fx_particle_2: SpriteDef = {
  w: 3, h: 3, scale: 2, outline: false,
  pixels: [0b010, 0b010, 0b010]
};

export const fx_particle_3: SpriteDef = {
  w: 3, h: 3, scale: 2, outline: false,
  pixels: [0b101, 0b010, 0b101]
};

export const fx_particle_4: SpriteDef = {
  w: 3, h: 3, scale: 2, outline: false,
  pixels: [0b110, 0b010, 0b011]
};

// --- HUD ---

export const hud_will_full: SpriteDef = {
  w: 6, h: 6, scale: 2, outline: false,
  pixels: [
    0b011110,
    0b111111,
    0b111111,
    0b111111,
    0b011110,
    0b001100,
  ]
};

export const hud_will_empty: SpriteDef = {
  w: 6, h: 6, scale: 2, outline: false,
  pixels: [
    0b011110,
    0b100001,
    0b100001,
    0b100001,
    0b010010,
    0b001100,
  ]
};

export const hud_bullet_full: SpriteDef = {
  w: 3, h: 5, scale: 2, outline: false,
  pixels: [0b010, 0b111, 0b111, 0b111, 0b111]
};

export const hud_bullet_empty: SpriteDef = {
  w: 3, h: 5, scale: 2, outline: false,
  pixels: [0b010, 0b101, 0b101, 0b101, 0b101]
};

export const hud_weapon_pistol: SpriteDef = {
  w: 10, h: 6, scale: 2, outline: false,
  pixels: [
    0b0001111111,
    0b0011111111,
    0b1111111111,
    0b1111000000,
    0b0110000000,
    0b0110000000,
  ]
};

export const hud_weapon_shotgun: SpriteDef = {
  w: 12, h: 6, scale: 2, outline: false,
  pixels: [
    0b000001111111,
    0b000111111111,
    0b111111111111,
    0b111100000000,
    0b011000000000,
    0b011000000000,
  ]
};

// Зеркало
export const object_mirror: SpriteDef = {
  w: 10, h: 10, scale: 2, outline: true,
  pixels: [
    0b1111111111,
    0b1100000011,
    0b1010000101,
    0b1001001001,
    0b1000110001,
    0b1000110001,
    0b1001001001,
    0b1010000101,
    0b1100000011,
    0b1111111111,
  ]
};

// --- НОВЫЕ СПРАЙТЫ ДЛЯ БОЧЕК (детализированные) ---

// Бочка воды - вид сверху с крышкой и обручами
export const object_barrel_water_top: SpriteDef = {
  w: 10, h: 10, scale: 2, outline: true,
  pixels: [
    0b0011111100,
    0b0111111110,
    0b1110111011,
    0b1111111111,
    0b1111111111,
    0b1111111111,
    0b1110111011,
    0b0111111110,
    0b0011111100,
    0b0001111000,
  ]
};

// Бочка масла - с каплями и другой текстурой крышки
export const object_barrel_oil_top: SpriteDef = {
  w: 10, h: 10, scale: 2, outline: true,
  pixels: [
    0b0011111100,
    0b0110110110,
    0b1101010101,
    0b1111111111,
    0b1111111111,
    0b1111111111,
    0b1101010101,
    0b0110110110,
    0b0011111100,
    0b0001111000,
  ]
};

// Бочка взрывчатки - с предупреждающими знаками
export const object_barrel_explosive_top: SpriteDef = {
  w: 10, h: 10, scale: 2, outline: true,
  pixels: [
    0b0011111100,
    0b0111111110,
    0b1101111101,
    0b1111011011,
    0b1111111111,
    0b1111111111,
    0b1101111101,
    0b0111111110,
    0b0011111100,
    0b0001111000,
  ]
};

// Бочка поврежденная (трещины, подтеки)
export const object_barrel_damaged: SpriteDef = {
  w: 10, h: 10, scale: 2, outline: true,
  pixels: [
    0b0011111100,
    0b0110110110,
    0b1101000101,
    0b1111011111,
    0b1111111111,
    0b1110111011,
    0b1100010101,
    0b0110110110,
    0b0011111100,
    0b0001111000,
  ]
};

// --- НОВЫЕ СПРАЙТЫ ДЛЯ ИГРОКА С ОРУЖИЕМ ---

// Игрок с пистолетом (смотрит вниз)
export const entity_player_pistol_d0: SpriteDef = {
  w: 10, h: 10, scale: 2, outline: true,
  pixels: [
    0b0001111000,
    0b0011111100,
    0b0111111110,
    0b1110110111,
    0b1111111111,
    0b1111111111,
    0b0111111110,
    0b0110110110,
    0b0110010010,
    0b0011011100,
  ]
};

export const entity_player_pistol_d1: SpriteDef = {
  w: 10, h: 10, scale: 2, outline: true,
  pixels: [
    0b0001111000,
    0b0011111100,
    0b0111111110,
    0b1110110111,
    0b1111111111,
    0b1111111111,
    0b0111111110,
    0b0100110010,
    0b0110010010,
    0b0011011100,
  ]
};

// Игрок с пистолетом (смотрит вверх)
export const entity_player_pistol_u0: SpriteDef = {
  w: 10, h: 10, scale: 2, outline: true,
  pixels: [
    0b0011011100,
    0b0110010010,
    0b0110110110,
    0b0111111110,
    0b0111111110,
    0b1111111111,
    0b1110110111,
    0b0111111110,
    0b0011111100,
    0b0001111000,
  ]
};

export const entity_player_pistol_u1: SpriteDef = {
  w: 10, h: 10, scale: 2, outline: true,
  pixels: [
    0b0011011100,
    0b0100010010,
    0b0110000010,
    0b0111111110,
    0b0111111110,
    0b1111111111,
    0b1110110111,
    0b0111111110,
    0b0011111100,
    0b0001111000,
  ]
};

// Игрок с пистолетом (смотрит вправо)
export const entity_player_pistol_r0: SpriteDef = {
  w: 10, h: 10, scale: 2, outline: true,
  pixels: [
    0b0001111000,
    0b0011111100,
    0b0111111110,
    0b1111011111,
    0b1111111111,
    0b1111111111,
    0b0111111110,
    0b0011111100,
    0b0001100110,
    0b0011001111,
  ]
};

export const entity_player_pistol_r1: SpriteDef = {
  w: 10, h: 10, scale: 2, outline: true,
  pixels: [
    0b0001111000,
    0b0011111100,
    0b0111111110,
    0b1111011111,
    0b1111111111,
    0b1111111111,
    0b0111111110,
    0b0011111100,
    0b0011001100,
    0b0001100111,
  ]
};

// Игрок с дробовиком (смотрит вниз) - более широкое оружие
export const entity_player_shotgun_d0: SpriteDef = {
  w: 10, h: 10, scale: 2, outline: true,
  pixels: [
    0b0001111000,
    0b0011111100,
    0b0111111110,
    0b1110110111,
    0b1111111111,
    0b1111111111,
    0b0111111110,
    0b0110110110,
    0b0110110110,
    0b0011111100,
  ]
};

// Игрок получает урон (мигает, искажен)
export const entity_player_hurt: SpriteDef = {
  w: 10, h: 10, scale: 2, outline: true,
  pixels: [
    0b0001111000,
    0b0011011100,
    0b0110111110,
    0b1101110111,
    0b1111111111,
    0b1111111111,
    0b0111111110,
    0b0110110110,
    0b0110110110,
    0b0011001100,
  ]
};

// --- ДЕКОРАТИВНЫЕ ЭЛЕМЕНТЫ (Set Dressing) ---

// Скелет (разбросанные кости)
export const decor_skeleton: SpriteDef = {
  w: 8, h: 8, scale: 2, outline: false,
  pixels: [
    0b00111100,
    0b01011010,
    0b00111100,
    0b00011000,
    0b01100110,
    0b10011001,
    0b01100110,
    0b00011000,
  ]
};

// Пятно крови
export const decor_blood_stain: SpriteDef = {
  w: 8, h: 8, scale: 2, outline: false,
  pixels: [
    0b00111100,
    0b01111110,
    0b11111111,
    0b11111111,
    0b01111110,
    0b00111100,
    0b00011000,
    0b00000000,
  ]
};

// Трещина на стене/полу
export const decor_crack_1: SpriteDef = {
  w: 6, h: 6, scale: 2, outline: false,
  pixels: [
    0b100000,
    0b010000,
    0b001100,
    0b000010,
    0b000001,
    0b000000,
  ]
};

export const decor_crack_2: SpriteDef = {
  w: 6, h: 6, scale: 2, outline: false,
  pixels: [
    0b000001,
    0b000010,
    0b001100,
    0b010000,
    0b100000,
    0b000000,
  ]
};

// Мох на стенах/полу
export const decor_moss_1: SpriteDef = {
  w: 8, h: 8, scale: 2, outline: false,
  pixels: [
    0b00110000,
    0b01111000,
    0b00111100,
    0b00011110,
    0b00001111,
    0b00000111,
    0b00000011,
    0b00000001,
  ]
};

export const decor_moss_2: SpriteDef = {
  w: 8, h: 8, scale: 2, outline: false,
  pixels: [
    0b00001100,
    0b00011110,
    0b00111100,
    0b01111000,
    0b11110000,
    0b11100000,
    0b11000000,
    0b10000000,
  ]
};

// Брызги крови (маленькие)
export const decor_blood_splatter_1: SpriteDef = {
  w: 6, h: 6, scale: 2, outline: false,
  pixels: [
    0b010000,
    0b111000,
    0b010100,
    0b001010,
    0b000100,
    0b000000,
  ]
};

export const decor_blood_splatter_2: SpriteDef = {
  w: 6, h: 6, scale: 2, outline: false,
  pixels: [
    0b000010,
    0b000111,
    0b001010,
    0b010100,
    0b000111,
    0b000000,
  ]
};

// Факел на стене (источник света)
export const object_torch: SpriteDef = {
  w: 6, h: 8, scale: 2, outline: true,
  pixels: [
    0b001100,
    0b011110,
    0b111111,
    0b011110,
    0b001100,
    0b001100,
    0b001100,
    0b001100,
  ]
};

// Факел анимация кадр 2 (пламя колышется)
export const object_torch_flame_1: SpriteDef = {
  w: 6, h: 8, scale: 2, outline: true,
  pixels: [
    0b011110,
    0b111111,
    0b111111,
    0b011110,
    0b001100,
    0b001100,
    0b001100,
    0b001100,
  ]
};

// Факел анимация кадр 3
export const object_torch_flame_2: SpriteDef = {
  w: 6, h: 8, scale: 2, outline: true,
  pixels: [
    0b001110,
    0b011111,
    0b111111,
    0b011110,
    0b001100,
    0b001100,
    0b001100,
    0b001100,
  ]
};

// Камень/валун
export const decor_rock: SpriteDef = {
  w: 8, h: 8, scale: 2, outline: true,
  pixels: [
    0b00111100,
    0b01111110,
    0b11101111,
    0b11111111,
    0b11111111,
    0b11101111,
    0b01111110,
    0b00111100,
  ]
};

// Монета/сокровище
export const item_coin: SpriteDef = {
  w: 6, h: 6, scale: 2, outline: true,
  pixels: [
    0b011110,
    0b110111,
    0b101011,
    0b110111,
    0b111011,
    0b011110,
  ]
};

// Ключ
export const item_key: SpriteDef = {
  w: 8, h: 6, scale: 2, outline: true,
  pixels: [
    0b00111100,
    0b01100110,
    0b11011011,
    0b11011000,
    0b01100110,
    0b00111100,
  ]
};

// Аптечка
export const item_medkit: SpriteDef = {
  w: 8, h: 8, scale: 2, outline: true,
  pixels: [
    0b01111110,
    0b11011011,
    0b10011001,
    0b10111101,
    0b10111101,
    0b10011001,
    0b11011011,
    0b01111110,
  ]
};

// Патроны (коробка)
export const item_ammo_box: SpriteDef = {
  w: 8, h: 8, scale: 2, outline: true,
  pixels: [
    0b01111110,
    0b11111111,
    0b11000011,
    0b11011011,
    0b11011011,
    0b11000011,
    0b11111111,
    0b01111110,
  ]
};

// Нажимная плита — не нажата
export const trap_plate_up: SpriteDef = {
  w: 10, h: 6, scale: 2, outline: false,
  pixels: [
    0b1111111111,
    0b1000000001,
    0b1011111101,
    0b1011111101,
    0b1000000001,
    0b1111111111,
  ]
};

// Нажимная плита — нажата
export const trap_plate_down: SpriteDef = {
  w: 10, h: 4, scale: 2, outline: false,
  pixels: [
    0b1111111111,
    0b1011111101,
    0b1011111101,
    0b1111111111,
  ]
};

export const obj_spikes_0: SpriteDef = trap_spike_idle;
export const obj_spikes_1: SpriteDef = trap_spike_rising;
export const obj_plate_0: SpriteDef = trap_plate_up;
export const obj_plate_1: SpriteDef = trap_plate_down;
