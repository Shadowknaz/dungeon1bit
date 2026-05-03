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

// Игрок — вид сверху (Minit-стиль, 10×10)
export const entity_player_d0: SpriteDef = {
  w: 10, h: 10, scale: 2, outline: true,
  pixels: [
    0b0001111000,
    0b0011111100,
    0b0111111110,
    0b0110110110,
    0b0111111110,
    0b0011111100,
    0b0011111100,
    0b0110000110,
    0b0110000110,
    0b0000000000,
  ]
};

// Игрок кадр 2 (анимация ходьбы — ноги)
export const entity_player_d1: SpriteDef = {
  w: 10, h: 10, scale: 2, outline: true,
  pixels: [
    0b0001111000,
    0b0011111100,
    0b0111111110,
    0b0110110110,
    0b0111111110,
    0b0011111100,
    0b0011111100,
    0b0100000010,
    0b0110000000,
    0b0000000000,
  ]
};

// Игрок — смотрит вверх
export const entity_player_u0: SpriteDef = {
  w: 10, h: 10, scale: 2, outline: true,
  pixels: [
    0b0000000000,
    0b0110000110,
    0b0110000110,
    0b0011111100,
    0b0011111100,
    0b0111111110,
    0b0110110110,
    0b0111111110,
    0b0011111100,
    0b0001111000,
  ]
};

export const entity_player_u1: SpriteDef = {
  w: 10, h: 10, scale: 2, outline: true,
  pixels: [
    0b0000000000,
    0b0000000110,
    0b0100000110,
    0b0011111100,
    0b0011111100,
    0b0111111110,
    0b0110110110,
    0b0111111110,
    0b0011111100,
    0b0001111000,
  ]
};

// Игрок — смотрит вправо
export const entity_player_r0: SpriteDef = {
  w: 10, h: 10, scale: 2, outline: true,
  pixels: [
    0b0001111000,
    0b0011111100,
    0b0111111110,
    0b1111011110,
    0b1111111110,
    0b1111011110,
    0b0111111110,
    0b0011111100,
    0b0000110000,
    0b0001100000,
  ]
};

export const entity_player_r1: SpriteDef = {
  w: 10, h: 10, scale: 2, outline: true,
  pixels: [
    0b0001111000,
    0b0011111100,
    0b0111111110,
    0b1111011110,
    0b1111111110,
    0b1111011110,
    0b0111111110,
    0b0011111100,
    0b0001100000,
    0b0000110000,
  ]
};

// --- ВРАГИ ---

// Chaser (преследователь) — угловатый, страшный
export const entity_enemy_chaser_0: SpriteDef = {
  w: 10, h: 10, scale: 2, outline: true,
  pixels: [
    0b0111111110,
    0b1111111111,
    0b1100000011,
    0b1111001111,
    0b1111001111,
    0b1100000011,
    0b1011111101,
    0b1101111011,
    0b0110110110,
    0b0100000010,
  ]
};

export const entity_enemy_chaser_1: SpriteDef = {
  w: 10, h: 10, scale: 2, outline: true,
  pixels: [
    0b0111111110,
    0b1111111111,
    0b1100000011,
    0b1111001111,
    0b1111001111,
    0b1100000011,
    0b1011111101,
    0b1101111011,
    0b0010110100,
    0b0110000010,
  ]
};

// Shooter (стрелок) — с "прицелом"
export const entity_enemy_shooter_0: SpriteDef = {
  w: 10, h: 10, scale: 2, outline: true,
  pixels: [
    0b0011111100,
    0b0111111110,
    0b1110000111,
    0b1101001011,
    0b1100000011,
    0b1101001011,
    0b1110000111,
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
    0b1110000111,
    0b1101111011,
    0b1100110011,
    0b1101111011,
    0b1110000111,
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

// Сундук закрытый
export const object_chest_closed: SpriteDef = {
  w: 10, h: 8, scale: 2, outline: true,
  pixels: [
    0b0111111110,
    0b1111111111,
    0b1000000001,
    0b1001111001,
    0b1111111111,
    0b1010101011,
    0b1111111111,
    0b0111111110,
  ]
};

// Сундук открытый
export const object_chest_open: SpriteDef = {
  w: 10, h: 8, scale: 2, outline: true,
  pixels: [
    0b1111111111,
    0b1000000001,
    0b1000000001,
    0b0111111110,
    0b0000000000,
    0b1010101011,
    0b1111111111,
    0b0111111110,
  ]
};

// Бочка (вода)
export const object_barrel_water: SpriteDef = {
  w: 8, h: 10, scale: 2, outline: true,
  pixels: [
    0b01111110,
    0b11111111,
    0b10000001,
    0b11111111,
    0b10010001,
    0b10010001,
    0b11111111,
    0b10000001,
    0b11111111,
    0b01111110,
  ]
};

// Бочка (масло)
export const object_barrel_oil: SpriteDef = {
  w: 8, h: 10, scale: 2, outline: true,
  pixels: [
    0b01111110,
    0b11111111,
    0b10000001,
    0b11111111,
    0b10110101,
    0b10110101,
    0b11111111,
    0b10000001,
    0b11111111,
    0b01111110,
  ]
};

// Бочка (взрывчатка)
export const object_barrel_explosive: SpriteDef = {
  w: 8, h: 10, scale: 2, outline: true,
  pixels: [
    0b00011000,
    0b01111110,
    0b11111111,
    0b10000001,
    0b11111111,
    0b10100101,
    0b10011001,
    0b11111111,
    0b11111111,
    0b01111110,
  ]
};

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
