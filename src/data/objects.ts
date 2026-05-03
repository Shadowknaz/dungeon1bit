export type ObjectType = 'barrel' | 'chest' | 'trap_spike' | 'trap_plate' | 'npc_civilian';

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
        spawnChance: 0.15, // Reduced chance
        maxPerRoom: 1     // Max 1 per map
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
    'npc_civilian': {
        type: 'npc_civilian',
        name: 'Мирный житель',
        spawnChance: 0.3,
        maxPerRoom: 2
    }
};
