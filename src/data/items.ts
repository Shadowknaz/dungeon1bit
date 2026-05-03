export type ItemType = 'weapon' | 'passive';

export interface ItemBase {
    id: string;
    type: ItemType;
    name: string;
    desc: string;
    shape: number[][];
}

export interface Weapon extends ItemBase {
    type: 'weapon';
    cooldown: number;
    maxAmmo: number;
    reloadDuration: number;
    projectiles: number;
    spreadAngle: number;
}

export interface PassiveItem extends ItemBase {
    type: 'passive';
    onEquip?: (eid: number) => void;
}

export type ItemData = Weapon | PassiveItem;

export const ITEMS_DB: Record<string, ItemData> = {
    'pistol': {
        id: 'pistol',
        type: 'weapon',
        name: 'Пистолет новичка',
        desc: 'Базовое оружие.',
        shape: [[1, 1]],
        cooldown: 25,
        maxAmmo: 6,
        reloadDuration: 60,
        projectiles: 1,
        spreadAngle: 0
    },
    'shotgun': {
        id: 'shotgun',
        type: 'weapon',
        name: 'Дробовик',
        desc: 'Выстрел шрапнелью.',
        shape: [[1, 1, 1]],
        cooldown: 60,
        maxAmmo: 4,
        reloadDuration: 90,
        projectiles: 3,
        spreadAngle: 0.15
    },
    'chalice': {
        id: 'chalice',
        type: 'passive',
        name: 'Чаша',
        desc: '50% шанс не потерять Волю.',
        shape: [[1, 1], [1, 1]],
        // onEquip will be handled in inventory system/player setup to avoid circular dependencies
    },
    'thermal': {
        id: 'thermal',
        type: 'passive',
        name: 'Тепловизор',
        desc: 'Ауры врагов видно сквозь стены.',
        shape: [[1, 1]],
    }
};
