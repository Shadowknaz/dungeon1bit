import { 
    BSP_MIN_ROOM_SIZE, BSP_MAX_ROOM_SIZE, BSP_SPLIT_VARIANCE, 
    BSP_CORRIDOR_WIDTH, BSP_LOOP_CHANCE, BSP_SECRET_CHANCE,
    BSP_MIN_LEAF_SIZE, BSP_ROOM_PADDING 
} from '../core/constants';

export interface Biome {
    id: string;
    name: string;
    
    // Generation parameters
    generation: {
        roomWidth: [number, number];
        roomHeight: [number, number];
        corridorLength: [number, number];
        dugPercentage: number;
        wallComplexity: number; // 0 for rectangles, higher for CA distortion
        generatorType: 'digger' | 'uniform' | 'bsp';
        bspConfig?: {
            minRoomSize: number;
            maxRoomSize: number;
            minLeafSize: number;
            splitVariance: number;
            roomPadding: number;
            corridorWidth: number;
            loopChance: number;
            secretChance: number;
        };
    };

    // Visual parameters
    visuals: {
        floorDecorChance: number;
        lightingIntensity: number;
        fluidType: 'water' | 'oil' | 'petroleum';
    };

    // Spawn parameters
    spawnTable: {
        enemies: Array<{ id: string, weight: number }>;
        objects: Array<{ id: string, weight: number }>;
        maxEnemiesPerRoom: number;
        lonerChance: number;
    };
}

export const BIOMES: Record<string, Biome> = {
    dungeon: {
        id: 'dungeon',
        name: 'Мрачное Подземелье',
        generation: {
            roomWidth: [7, 12],
            roomHeight: [7, 12],
            corridorLength: [3, 7],
            dugPercentage: 0.45,
            wallComplexity: 3,
            generatorType: 'bsp',
            bspConfig: {
                minRoomSize: BSP_MIN_ROOM_SIZE,
                maxRoomSize: BSP_MAX_ROOM_SIZE,
                minLeafSize: BSP_MIN_LEAF_SIZE,
                splitVariance: BSP_SPLIT_VARIANCE,
                roomPadding: BSP_ROOM_PADDING,
                corridorWidth: BSP_CORRIDOR_WIDTH,
                loopChance: BSP_LOOP_CHANCE,
                secretChance: BSP_SECRET_CHANCE,
            }
        },
        visuals: {
            floorDecorChance: 0.08,
            lightingIntensity: 0.9,
            fluidType: 'water'
        },
        spawnTable: {
            enemies: [
                { id: 'grunt', weight: 80 },
                { id: 'elite', weight: 10 },
                { id: 'sniper', weight: 10 }
            ],
            objects: [
                { id: 'barrel', weight: 50 },
                { id: 'torch', weight: 50 }
            ],
            maxEnemiesPerRoom: 4,
            lonerChance: 0.5
        }
    }
};
