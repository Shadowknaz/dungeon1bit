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
        maxPerRoom: 1      // Max 1 per room, 1 per dungeon total
    },
    'trap_spike': {
        type: 'trap_spike',
        name: 'Шипы',
        spawnChance: 0.4,
        maxPerRoom: 3
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
