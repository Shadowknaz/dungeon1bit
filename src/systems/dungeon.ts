import * as ROT from 'rot-js';
import { MAP_COLS, MAP_ROWS, TILE_SIZE } from '../core/constants';

export interface RoomConfig {
    roomWidth: [number, number];
    roomHeight: [number, number];
    corridorLength: [number, number];
    dugPercentage: number;
}

export class DungeonSystem {
    public grid: number[][] = [];
    public explored: boolean[][] = [];

    constructor() {
        this.reset();
    }

    reset() {
        this.grid = Array.from({ length: MAP_COLS }, () => new Array(MAP_ROWS).fill(1));
        this.explored = Array.from({ length: MAP_COLS }, () => new Array(MAP_ROWS).fill(false));
    }

    generate(config: RoomConfig) {
        this.reset();
        const digger = new ROT.Map.Digger(MAP_COLS, 22, config);
        digger.create((x, y, value) => {
            this.grid[x][y] = value;
        });
        return digger.getRooms();
    }

    getClosestRoom(rooms: any[], targetX: number, targetY: number) {
        return rooms.reduce((closest, room) => {
            let cx = room.getCenter()[0], cy = room.getCenter()[1], dist = Math.hypot(cx - targetX, cy - targetY);
            if (!closest || dist < closest.dist) return { room, dist, cx, cy }; return closest;
        }, null);
    }

    getTopRoom(rooms: any[]) {
        return rooms.reduce((top, room) => (!top || room.getCenter()[1] < top.getCenter()[1]) ? room : top, null);
    }

    computeFOV(
        px: number, py: number,
        range: number,
        angle: number,
        fovHalfAngle: number,
        isPassable: (x: number, y: number) => boolean,
        onVisible: (x: number, y: number) => void
    ) {
        const fov = new ROT.FOV.PreciseShadowcasting(isPassable);
        fov.compute(px, py, range, (x, y, r) => {
            const cellCenterX = x * TILE_SIZE + TILE_SIZE / 2;
            const cellCenterY = y * TILE_SIZE + TILE_SIZE / 2;
            let diff = Math.abs(Math.atan2(cellCenterY - (py * TILE_SIZE + TILE_SIZE/2), cellCenterX - (px * TILE_SIZE + TILE_SIZE/2)) - angle);
            if (diff > Math.PI) diff = 2 * Math.PI - diff;

            if (r <= range / 3 || diff <= fovHalfAngle) {
                onVisible(x, y);
                if (x >= 0 && x < MAP_COLS && y >= 0 && y < MAP_ROWS) {
                    this.explored[x][y] = true;
                }
            }
        });
    }

    isPassable(x: number, y: number): boolean {
        if (x < 0 || y < 0 || x >= MAP_COLS || y >= MAP_ROWS) return false;
        return this.grid[x][y] === 0;
    }
}
