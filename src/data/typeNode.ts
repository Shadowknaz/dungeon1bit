import { MAP_COLS, MAP_ROWS, TILE_SIZE, GAME_WIDTH, WORLD_WIDTH, WORLD_HEIGHT } from '../core/constants';

export type NodeStatus = 'locked' | 'available' | 'completed';
export type NodeType = 'simple' | 'merchant' | 'shrine' | 'boss';

export interface GlobalMapNode {
    id: number;
    layer: number;
    x: number;
    y: number;
    type: NodeType;
    biomeId: string;
    next: number[];
    status: NodeStatus;
}

export interface GlobalMap {
    nodes: Record<number, GlobalMapNode>;
    layers: GlobalMapNode[][];
}

export interface RoomGeneratorResult {
    grid: number[][];
    exitRoomCenter: { x: number; y: number };
    startDoor: { x: number; y: number; w: number; h: number; type: 'start'; open: boolean };
    floorTiles: { x: number; y: number }[];
}

export interface NodeTypeConfig {
    type: NodeType;
    displayName: string;
    mapSymbol: string;
    description: string;
}

export const NODE_TYPE_CONFIGS: Record<NodeType, NodeTypeConfig> = {
    simple: {
        type: 'simple',
        displayName: 'КОМНАТА',
        mapSymbol: 'R',
        description: 'Место испытаний и опасностей.'
    },
    merchant: {
        type: 'merchant',
        displayName: 'ТОРГОВЕЦ',
        mapSymbol: '$',
        description: 'Торговец со снаряжением.'
    },
    shrine: {
        type: 'shrine',
        displayName: 'СВЯТИЛИЩЕ',
        mapSymbol: 'H',
        description: 'Алтарь благословений.'
    },
    boss: {
        type: 'boss',
        displayName: 'БОСС',
        mapSymbol: 'B',
        description: 'Арена битвы с боссом.'
    }
};

export function generateEmptyGrid(): number[][] {
    return Array.from({ length: MAP_COLS }, () => new Array(MAP_ROWS).fill(1));
}

export function generateSimpleRoom(): RoomGeneratorResult {
    // Возвращаем пустой результат - генерация происходит через DungeonSystem
    const lobbyX = Math.floor(MAP_COLS / 2);
    const lobbyY = MAP_ROWS - 11;
    return {
        grid: generateEmptyGrid(),
        exitRoomCenter: { x: 0, y: 0 },
        startDoor: { x: WORLD_WIDTH / 2 - 60, y: (lobbyY + 3) * TILE_SIZE, w: 120, h: 20, type: 'start', open: false },
        floorTiles: []
    };
}

export function generateMerchantRoom(): RoomGeneratorResult {
    const grid = generateEmptyGrid();
    const cx = Math.floor(MAP_COLS / 2);
    const cy = 10;

    // Центральная арена 11x11
    for (let x = cx - 5; x <= cx + 5; x++) {
        for (let y = cy - 5; y <= cy + 5; y++) {
            grid[x][y] = 0;
        }
    }

    // Коридор вниз к стартовой зоне
    const lobbyY = MAP_ROWS - 11;
    const lobbyX = Math.floor(MAP_COLS / 2);

    for (let y = cy + 5; y < lobbyY + 3; y++) {
        grid[cx][y] = 0;
        grid[cx - 1][y] = 0;
        grid[cx + 1][y] = 0;
    }

    // Проход к лобби
    for (let x = lobbyX - 4; x <= lobbyX + 3; x++) {
        for (let y = lobbyY; y < lobbyY + 3; y++) {
            grid[x][y] = 0;
        }
    }

    // Стартовая зона (лобби и коридор входа)
    for (let x = 0; x < MAP_COLS; x++) {
        for (let y = lobbyY + 3; y < MAP_ROWS; y++) {
            grid[x][y] = (x >= lobbyX - 3 && x <= lobbyX + 2) ? 0 : 1;
        }
    }

    const floorTiles: { x: number; y: number }[] = [];
    for (let x = cx - 5; x <= cx + 5; x++) {
        for (let y = cy - 5; y <= cy + 5; y++) {
            if (grid[x][y] === 0) {
                floorTiles.push({ x, y });
            }
        }
    }

    return {
        grid,
        exitRoomCenter: { x: cx * TILE_SIZE, y: (cy - 5) * TILE_SIZE },
        startDoor: { x: WORLD_WIDTH / 2 - 60, y: (lobbyY + 3) * TILE_SIZE, w: 120, h: 20, type: 'start', open: false },
        floorTiles
    };
}

export function generateShrineRoom(): RoomGeneratorResult {
    // Идентична merchant комнате по структуре
    return generateMerchantRoom();
}

export function generateBossArena(): RoomGeneratorResult {
    const grid = generateEmptyGrid();
    const cx = Math.floor(MAP_COLS / 2);
    const cy = 10;
    const arenaWidth = 15;  // Ширина арены (нечетное число для центрирования)
    const arenaHeight = 11; // Высота арены

    const left = cx - Math.floor(arenaWidth / 2);
    const right = cx + Math.floor(arenaWidth / 2);
    const top = cy - Math.floor(arenaHeight / 2);
    const bottom = cy + Math.floor(arenaHeight / 2);

    // Пол арены (внутренняя область)
    for (let x = left; x <= right; x++) {
        for (let y = top; y <= bottom; y++) {
            grid[x][y] = 0;
        }
    }

    // Стены по периметру
    for (let x = left - 1; x <= right + 1; x++) {
        grid[x][top - 1] = 1;     // Верхняя стена
        grid[x][bottom + 1] = 1;  // Нижняя стена
    }
    for (let y = top - 1; y <= bottom + 1; y++) {
        grid[left - 1][y] = 1;    // Левая стена
        grid[right + 1][y] = 1;   // Правая стена
    }

    // Проход к стартовой зоне (пробел в нижней стене)
    const passageWidth = 3;
    const passageStart = cx - Math.floor(passageWidth / 2);
    for (let x = passageStart; x < passageStart + passageWidth; x++) {
        grid[x][bottom + 1] = 0; // Убираем стену для прохода
    }

    // Коридор вниз к стартовой зоне
    const lobbyY = MAP_ROWS - 11;
    const lobbyX = Math.floor(MAP_COLS / 2);

    for (let y = bottom + 1; y < lobbyY + 3; y++) {
        for (let x = cx - 1; x <= cx + 1; x++) {
            grid[x][y] = 0;
        }
    }

    // Проход к выходу (вверху)
    for (let x = cx - 1; x <= cx + 1; x++) {
        grid[x][top - 1] = 0; // Убираем стену для выхода
    }

    // Стартовое лобби
    for (let x = lobbyX - 4; x <= lobbyX + 3; x++) {
        for (let y = lobbyY; y < lobbyY + 3; y++) {
            grid[x][y] = 0;
        }
    }

    // Основная стартовая зона (коридор входа)
    for (let x = 0; x < MAP_COLS; x++) {
        for (let y = lobbyY + 3; y < MAP_ROWS; y++) {
            grid[x][y] = (x >= lobbyX - 3 && x <= lobbyX + 2) ? 0 : 1;
        }
    }

    // Собираем floor tiles для декораций
    const floorTiles: { x: number; y: number }[] = [];
    for (let x = left; x <= right; x++) {
        for (let y = top; y <= bottom; y++) {
            if (grid[x][y] === 0) {
                floorTiles.push({ x, y });
            }
        }
    }

    return {
        grid,
        exitRoomCenter: { x: cx * TILE_SIZE, y: top * TILE_SIZE },
        startDoor: { x: WORLD_WIDTH / 2 - 60, y: (lobbyY + 3) * TILE_SIZE, w: 120, h: 20, type: 'start', open: false },
        floorTiles
    };
}

export function getNodeGenerator(type: NodeType): () => RoomGeneratorResult {
    switch (type) {
        case 'simple':
            return generateSimpleRoom;
        case 'merchant':
            return generateMerchantRoom;
        case 'shrine':
            return generateShrineRoom;
        case 'boss':
            return generateBossArena;
        default:
            return generateSimpleRoom;
    }
}
