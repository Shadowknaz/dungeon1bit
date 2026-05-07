export interface EnemyType {
    id: string;
    name: string;
    health: number;
    speed: number;
    type: 'chaser' | 'shooter';
    char: string;
    color: string;
    detectionRange: number;
}

export const ENEMIES_DB: Record<string, EnemyType> = {
    'grunt': {
        id: 'grunt',
        name: 'Пехотинец',
        health: 20,
        speed: 0.2,
        type: 'chaser',
        char: 'C',
        color: '#fff',
        detectionRange: 160 // 100 * 1.3
    },
    'sniper': {
        id: 'sniper',
        name: 'Снайпер',
        health: 15,
        speed: 0.3,
        type: 'shooter',
        char: 'S',
        color: '#ddd',
        detectionRange: 100 // 100 * 1.3
    },
    'elite': {
        id: 'elite',
        name: 'Элита',
        health: 50,
        speed: 0.7,
        type: 'chaser',
        char: 'E',
        color: '#f00',
        detectionRange: 130 // 100 * 1.3
    }
};
