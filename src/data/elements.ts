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
