export const ANIMATIONS = {
    // Игрок с пистолетом - новые детализированные анимации
    PLAYER_IDLE_DOWN: { frames: ['entity_player_pistol_d0'], fps: 1, loop: true },
    PLAYER_WALK_DOWN: { frames: ['entity_player_pistol_d0', 'entity_player_pistol_d1'], fps: 8, loop: true },
    PLAYER_IDLE_UP: { frames: ['entity_player_pistol_u0'], fps: 1, loop: true },
    PLAYER_WALK_UP: { frames: ['entity_player_pistol_u0', 'entity_player_pistol_u1'], fps: 8, loop: true },
    PLAYER_IDLE_SIDE: { frames: ['entity_player_pistol_r0'], fps: 1, loop: true },
    PLAYER_WALK_SIDE: { frames: ['entity_player_pistol_r0', 'entity_player_pistol_r1'], fps: 8, loop: true },

    // NPC житель
    NPC_IDLE: { frames: ['entity_npc_elder'], fps: 1, loop: true },

    // Враги
    ENEMY_CHASER_WALK: { frames: ['entity_enemy_chaser_0', 'entity_enemy_chaser_1'], fps: 6, loop: true },
    ENEMY_SHOOTER_IDLE: { frames: ['entity_enemy_shooter_0'], fps: 1, loop: true },
    ENEMY_SHOOTER_ATTACK: { frames: ['entity_enemy_shooter_1'], fps: 1, loop: true },

    // Факел - анимация пламени
    TORCH_FLAME: { frames: ['object_torch_flame_1', 'object_torch_flame_2'], fps: 4, loop: true },
};

export type ElementType = 'water' | 'oil' | 'petroleum' | 'fire' | 'steam';

export interface ElementProperties {
    type: ElementType;
    name: string;
    char: string;
    color: string;
    decayRate: number; // Volume loss per tick (0-100 scale)
    viscosity: number; // Friction loss (0-1)
    fireDuration: number;
    isFlammable: boolean;
}

export const ELEMENTS_DB: Record<ElementType, ElementProperties> = {
    'water': {
        type: 'water',
        name: 'Вода',
        char: '~',
        color: '#88aaff',
        decayRate: 0.1, // Slower evaporation
        viscosity: 0.05, // Low friction
        fireDuration: 0,
        isFlammable: false
    },
    'oil': {
        type: 'oil',
        name: 'Масло',
        char: '≈',
        color: '#998855',
        decayRate: 0.05,
        viscosity: 0.15, // High friction
        fireDuration: 600,
        isFlammable: true
    },
    'petroleum': {
        type: 'petroleum',
        name: 'Нефть',
        char: '∞',
        color: '#444444',
        decayRate: 0.02,
        viscosity: 0.25, // Very high friction
        fireDuration: 1200,
        isFlammable: true
    },
    'fire': {
        type: 'fire',
        name: 'Огонь',
        char: '*',
        color: '#ff5522',
        decayRate: 1.0,
        viscosity: 0,
        fireDuration: 0,
        isFlammable: false
    },
    'steam': {
        type: 'steam',
        name: 'Пар',
        char: '░',
        color: '#ffffff',
        decayRate: 0.5,
        viscosity: 0,
        fireDuration: 0,
        isFlammable: false
    }
};

export interface EnemyType {
    id: string;
    name: string;
    maxHits: number;
    speed: number;
    type: 'chaser' | 'shooter';
    char: string;
    color: string;
    detectionRange: number;
    shootCooldown?: number;
    projectileSpeed?: number;
}

export const ENEMIES_DB: Record<string, EnemyType> = {
    'grunt': {
        id: 'grunt',
        name: 'Пехотинец',
        maxHits: 1,
        speed: 0.5,
        type: 'chaser',
        char: 'C',
        color: '#fff',
        detectionRange: 160,
        shootCooldown: 60,
        projectileSpeed: 0.1
    },
    'sniper': {
        id: 'sniper',
        name: 'Снайпер',
        maxHits: 1,
        speed: 0.2,
        type: 'shooter',
        char: 'S',
        color: '#ddd',
        detectionRange: 200,
        shootCooldown: 120,
        projectileSpeed: 0.9
    },
    'elite': {
        id: 'elite',
        name: 'Элита',
        maxHits: 2,
        speed: 0.7,
        type: 'chaser',
        char: 'E',
        color: '#f00',
        detectionRange: 130,
        shootCooldown: 45,
        projectileSpeed: 0.5
    },
    'golem': {
        id: 'golem',
        name: 'Голем',
        maxHits: 3,
        speed: 0.7,
        type: 'chaser',
        char: 'G',
        color: '#888',
        detectionRange: 180,
    }
};

export type ItemRarity = 'common' | 'magic' | 'rare' | 'unique';
export type ItemType = 'passive' | 'weapon' | 'active';

export interface ItemBase {
    id: string;
    type: ItemType;
    rarity: ItemRarity;
    name: string;
    desc: string;
    unique?: boolean;
}

export interface PassiveItem extends ItemBase {
    type: 'passive' | 'weapon' | 'active';
    stats?: Partial<{
        projectiles: number;
        spreadAngle: number;
        shootCooldown: number;
        projectileLifetime: number;
        maxAmmo: number;
        weaponType: 'reload' | 'charge' | 'channel';
        canReload: boolean;
        bounces: number;
        chargeTime: number;
        channelMaxTime?: number;
        weaponId: string;
    }>;
}

export type ItemData = PassiveItem;

export const ITEMS_DB: Record<string, ItemData> = {
    'medkit': {
        id: 'medkit',
        type: 'passive',
        rarity: 'common',
        name: 'Медкомплект',
        desc: 'Восстанавливает стабильность.',
    },
    'shotgun': {
        id: 'shotgun',
        type: 'weapon',
        rarity: 'rare',
        name: 'Дробовик',
        desc: 'Стреляет веером шрапнели, но на меньшую дистанцию.',
        unique: true,
        stats: {
            projectiles: 4,
            spreadAngle: 0.15,
            shootCooldown: 50,
            projectileLifetime: 45,
            weaponType: 'reload',
            canReload: true,
            weaponId: 'shotgun'
        }
    },
    'railgun': {
        id: 'railgun',
        type: 'weapon',
        rarity: 'unique',
        name: 'Рельсотрон',
        desc: 'Мощный лазерный луч, пробивающий врагов насквозь.',
        unique: true,
        stats: {
            projectiles: 1,
            spreadAngle: 0,
            shootCooldown: 180,
            projectileLifetime: 100,
            maxAmmo: 1,
            weaponType: 'charge',
            canReload: false,
            chargeTime: 120,
            weaponId: 'railgun'
        }
    },
    'electrobolt': {
        id: 'electrobolt',
        type: 'weapon',
        rarity: 'rare',
        name: 'Электроболт',
        desc: 'Выпускает непрерывную дугу. Длина растет при зажатии. Движение заблокировано.',
        unique: true,
        stats: {
            weaponType: 'channel',
            channelMaxTime: 60, // 1 seconds
            maxAmmo: 1,
            canReload: false,
            projectiles: 1,
            weaponId: 'electrobolt'
        }
    },
    'eggs_of_destiny': {
        id: 'eggs_of_destiny',
        type: 'passive',
        rarity: 'magic',
        name: 'Яйца судьбы',
        desc: 'Ваши снаряды один раз отскакивают от стен.',
        unique: true,
        stats: {
            bounces: 1
        }
    }
};

export interface GrenadeType {
    id: 'he' | 'flash';
    name: string;
    radius: number; // in tiles
    timer: number; // in frames
    damage: number;
    stunDuration?: number; // in frames
}

export const GRENADES_DB: Record<string, GrenadeType> = {
    'he': {
        id: 'he',
        name: 'Осколочная граната',
        radius: 3,
        timer: 135,
        damage: 5
    },
    'flash': {
        id: 'flash',
        name: 'Светошумовая граната',
        radius: 3,
        timer: 135,
        damage: 0,
        stunDuration: 180
    }
};

export type ObjectType = 'barrel' | 'chest' | 'trap_spike' | 'trap_plate' | 'trap_pit' | 'npc_civilian' | 'torch';

export interface ObjectProperties {
    type: ObjectType;
    name: string;
    spawnChance: number;
    maxPerRoom: number;
}

export const OBJECTS_DB: Record<ObjectType, ObjectProperties> = {
    'barrel': {
        type: 'barrel',
        name: 'Бочка',
        spawnChance: 0.6,
        maxPerRoom: 6
    },
    'chest': {
        type: 'chest',
        name: 'Сундук',
        spawnChance: 0.4,  // 40% chance per eligible room
        maxPerRoom: 1    // Max 1 per room, 1 per dungeon total
    },
    'trap_spike': {
        type: 'trap_spike',
        name: 'Шипы',
        spawnChance: 0.4,
        maxPerRoom: 8
    },
    'trap_plate': {
        type: 'trap_plate',
        name: 'Нажимная плита',
        spawnChance: 1.0, // Always spawned with secret rooms
        maxPerRoom: 1
    },
    'trap_pit': {
        type: 'trap_pit',
        name: 'Яма',
        spawnChance: 0.3,
        maxPerRoom: 2
    },
    'npc_civilian': {
        type: 'npc_civilian',
        name: 'Мирный житель',
        spawnChance: 0.25,  // 25% chance per eligible room
        maxPerRoom: 1       // Max 1 per room
    },
    'torch': {
        type: 'torch',
        name: 'Факел',
        spawnChance: 0.0,
        maxPerRoom: 4
    }
};

export * from './spriteDefs';
