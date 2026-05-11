import { MAP_COLS, MAP_ROWS, TILE_SIZE } from '../core/constants';

// ──────────────────────────────────────────────
// Data structures
// ──────────────────────────────────────────────

export interface BSPRoom {
    left: number;
    top: number;
    right: number;
    bottom: number;
    centerX: number;
    centerY: number;
    isSecret: boolean;
    doors: { x: number; y: number }[];
}

export interface BSPNode {
    x: number;
    y: number;
    w: number;
    h: number;
    left?: BSPNode;
    right?: BSPNode;
    room?: BSPRoom;
    splitHorizontal?: boolean;
}

export interface BSPConfig {
    minRoomSize: number;       // minimum room dimension (5)
    maxRoomSize: number;       // maximum room dimension (15)
    minLeafSize: number;       // minimum leaf size before we stop splitting (10)
    splitVariance: number;     // randomness of split position (0.3–0.7 range around center)
    roomPadding: number;       // padding between room edge and leaf edge (1–2)
    corridorWidth: number;     // corridor width in tiles (2–3)
    loopChance: number;        // chance of extra corridor between branches (0–1)
    secretChance: number;      // chance a dead-end leaf becomes secret (0–1)
}

export const DEFAULT_BSP_CONFIG: BSPConfig = {
    minRoomSize: 5,
    maxRoomSize: 15,
    minLeafSize: 10,
    splitVariance: 0.4,
    roomPadding: 1,
    corridorWidth: 2,
    loopChance: 0.3,
    secretChance: 0.2,
};

// ──────────────────────────────────────────────
// RNG helper type
// ──────────────────────────────────────────────

interface RNG {
    getUniform: () => number;
}

// ──────────────────────────────────────────────
// BSP Tree generation
// ──────────────────────────────────────────────

function splitNode(node: BSPNode, config: BSPConfig, rng: RNG): boolean {
    // Already split
    if (node.left || node.right) return false;

    // Too small to split
    if (node.w < config.minLeafSize * 2 && node.h < config.minLeafSize * 2) return false;

    // Decide split direction
    let horizontal: boolean;
    if (node.w > node.h * 1.25) {
        horizontal = false; // split vertically (wide leaf)
    } else if (node.h > node.w * 1.25) {
        horizontal = true;  // split horizontally (tall leaf)
    } else {
        horizontal = rng.getUniform() > 0.5;
    }

    const maxSize = (horizontal ? node.h : node.w) - config.minLeafSize;
    if (maxSize < config.minLeafSize) return false;

    // Split position with variance around center
    const center = horizontal ? node.h / 2 : node.w / 2;
    const variance = center * config.splitVariance;
    const splitPos = Math.floor(center + (rng.getUniform() - 0.5) * 2 * variance);
    const clampedSplit = Math.max(config.minLeafSize, Math.min(maxSize, splitPos));

    node.splitHorizontal = horizontal;

    if (horizontal) {
        node.left = { x: node.x, y: node.y, w: node.w, h: clampedSplit };
        node.right = { x: node.x, y: node.y + clampedSplit, w: node.w, h: node.h - clampedSplit };
    } else {
        node.left = { x: node.x, y: node.y, w: clampedSplit, h: node.h };
        node.right = { x: node.x + clampedSplit, y: node.y, w: node.w - clampedSplit, h: node.h };
    }

    return true;
}

function buildTree(node: BSPNode, config: BSPConfig, rng: RNG, depth: number = 0): void {
    if (depth > 12) return; // safety cap

    if (splitNode(node, config, rng)) {
        buildTree(node.left!, config, rng, depth + 1);
        buildTree(node.right!, config, rng, depth + 1);
    }
}

// ──────────────────────────────────────────────
// Room placement in leaves
// ──────────────────────────────────────────────

function placeRooms(node: BSPNode, config: BSPConfig, rng: RNG, rooms: BSPRoom[]): void {
    if (node.left || node.right) {
        if (node.left) placeRooms(node.left, config, rng, rooms);
        if (node.right) placeRooms(node.right, config, rng, rooms);
        return;
    }

    // Leaf node — place a room
    const pad = config.roomPadding;
    const maxW = Math.min(config.maxRoomSize, node.w - pad * 2);
    const maxH = Math.min(config.maxRoomSize, node.h - pad * 2);

    if (maxW < config.minRoomSize || maxH < config.minRoomSize) return;

    const roomW = config.minRoomSize + Math.floor(rng.getUniform() * (maxW - config.minRoomSize + 1));
    const roomH = config.minRoomSize + Math.floor(rng.getUniform() * (maxH - config.minRoomSize + 1));

    const roomX = node.x + pad + Math.floor(rng.getUniform() * (node.w - pad * 2 - roomW + 1));
    const roomY = node.y + pad + Math.floor(rng.getUniform() * (node.h - pad * 2 - roomH + 1));

    const room: BSPRoom = {
        left: roomX,
        top: roomY,
        right: roomX + roomW - 1,
        bottom: roomY + roomH - 1,
        centerX: Math.floor(roomX + roomW / 2),
        centerY: Math.floor(roomY + roomH / 2),
        isSecret: false,
        doors: [],
    };

    node.room = room;
    rooms.push(room);
}

// ──────────────────────────────────────────────
// Corridor carving
// ──────────────────────────────────────────────

function getLeafRoom(node: BSPNode): BSPRoom | null {
    if (node.room) return node.room;
    if (node.left) {
        const r = getLeafRoom(node.left);
        if (r) return r;
    }
    if (node.right) {
        const r = getLeafRoom(node.right);
        if (r) return r;
    }
    return null;
}

/** Get a random room from this subtree */
function getRandomLeafRoom(node: BSPNode, rng: RNG): BSPRoom | null {
    const rooms: BSPRoom[] = [];
    collectRooms(node, rooms);
    if (rooms.length === 0) return null;
    return rooms[Math.floor(rng.getUniform() * rooms.length)];
}

function collectRooms(node: BSPNode, out: BSPRoom[]): void {
    if (node.room) out.push(node.room);
    if (node.left) collectRooms(node.left, out);
    if (node.right) collectRooms(node.right, out);
}

function carveCorridor(
    grid: number[][],
    x1: number, y1: number,
    x2: number, y2: number,
    width: number,
    rooms: BSPRoom[]
): void {
    const half = Math.floor(width / 2);

    // L-shaped corridor: horizontal then vertical
    // Carve horizontal segment
    const startX = Math.min(x1, x2);
    const endX = Math.max(x1, x2);
    for (let x = startX; x <= endX; x++) {
        for (let dy = -half; dy <= half; dy++) {
            const yy = y1 + dy;
            if (x >= 0 && x < grid.length && yy >= 0 && yy < grid[0].length) {
                grid[x][yy] = 0;
            }
        }
    }

    // Carve vertical segment
    const startY = Math.min(y1, y2);
    const endY = Math.max(y1, y2);
    for (let y = startY; y <= endY; y++) {
        for (let dx = -half; dx <= half; dx++) {
            const xx = x2 + dx;
            if (xx >= 0 && xx < grid.length && y >= 0 && y < grid[0].length) {
                grid[xx][y] = 0;
            }
        }
    }

    // Record door positions (where corridor meets room edge)
    for (const room of rooms) {
        // Check horizontal segment for door intersections
        if (y1 >= room.top && y1 <= room.bottom) {
            if (x1 < room.left && x2 >= room.left) {
                room.doors.push({ x: room.left, y: y1 });
            }
            if (x1 > room.right && x2 <= room.right) {
                room.doors.push({ x: room.right, y: y1 });
            }
        }
        // Check vertical segment
        if (x2 >= room.left && x2 <= room.right) {
            if (y1 < room.top && y2 >= room.top) {
                room.doors.push({ x: x2, y: room.top });
            }
            if (y1 > room.bottom && y2 <= room.bottom) {
                room.doors.push({ x: x2, y: room.bottom });
            }
        }
    }
}

function connectNodes(node: BSPNode, grid: number[][], config: BSPConfig, rng: RNG, rooms: BSPRoom[]): void {
    if (!node.left || !node.right) return;

    // Recursively connect children first
    connectNodes(node.left, grid, config, rng, rooms);
    connectNodes(node.right, grid, config, rng, rooms);

    // Connect a room from left subtree to a room from right subtree
    const roomA = getRandomLeafRoom(node.left, rng);
    const roomB = getRandomLeafRoom(node.right, rng);

    if (roomA && roomB) {
        carveCorridor(grid, roomA.centerX, roomA.centerY, roomB.centerX, roomB.centerY, config.corridorWidth, rooms);
    }
}

// ──────────────────────────────────────────────
// Loop corridors (extra connections between branches)
// ──────────────────────────────────────────────

function addLoops(grid: number[][], rooms: BSPRoom[], loopChance: number, corridorWidth: number, rng: RNG): void {
    if (rooms.length < 4) return;

    const maxLoops = Math.max(1, Math.floor(rooms.length / 4));
    let loopsAdded = 0;

    // Sort rooms by position for spatial coherence
    const sorted = [...rooms].sort((a, b) => a.centerX + a.centerY - (b.centerX + b.centerY));

    for (let i = 0; i < sorted.length - 1 && loopsAdded < maxLoops; i++) {
        const a = sorted[i];
        const b = sorted[i + 1];

        // Skip if rooms are already very close (likely already connected)
        const dist = Math.abs(a.centerX - b.centerX) + Math.abs(a.centerY - b.centerY);
        if (dist < 8 || dist > 30) continue;

        // Skip secret rooms
        if (a.isSecret || b.isSecret) continue;

        if (rng.getUniform() < loopChance) {
            carveCorridor(grid, a.centerX, a.centerY, b.centerX, b.centerY, corridorWidth, rooms);
            loopsAdded++;
        }
    }
}

// ──────────────────────────────────────────────
// Secret rooms (dead-end smallest leaves)
// ──────────────────────────────────────────────

function tagSecretRooms(node: BSPNode, config: BSPConfig, rng: RNG): void {
    const leaves: BSPNode[] = [];
    collectLeaves(node, leaves);

    // Sort by area — smallest leaves are best candidates
    leaves.sort((a, b) => (a.w * a.h) - (b.w * b.h));

    // Tag at most 1-2 secret rooms
    let secretCount = 0;
    const maxSecrets = Math.min(2, Math.floor(leaves.length / 3));

    for (const leaf of leaves) {
        if (!leaf.room) continue;
        if (secretCount >= maxSecrets) break;

        if (rng.getUniform() < config.secretChance) {
            leaf.room.isSecret = true;
            secretCount++;
        }
    }
}

function collectLeaves(node: BSPNode, out: BSPNode[]): void {
    if (!node.left && !node.right) {
        out.push(node);
        return;
    }
    if (node.left) collectLeaves(node.left, out);
    if (node.right) collectLeaves(node.right, out);
}

// ──────────────────────────────────────────────
// Main generation function
// ──────────────────────────────────────────────

export function generateBSP(
    cols: number,
    rows: number,
    config: BSPConfig,
    rng: RNG
): { grid: number[][]; rooms: BSPRoom[]; tree: BSPNode } {
    // Initialize grid (all walls)
    const grid: number[][] = Array.from({ length: cols }, () => new Array(rows).fill(1));

    // Build BSP tree
    const root: BSPNode = { x: 1, y: 1, w: cols - 2, h: rows - 6 }; // margins
    buildTree(root, config, rng);

    // Place rooms in leaves
    const rooms: BSPRoom[] = [];
    placeRooms(root, config, rng, rooms);

    // Carve rooms into grid
    for (const room of rooms) {
        for (let x = room.left; x <= room.right; x++) {
            for (let y = room.top; y <= room.bottom; y++) {
                if (x >= 0 && x < cols && y >= 0 && y < rows) {
                    grid[x][y] = 0;
                }
            }
        }
    }

    // Connect rooms via BSP tree corridors
    connectNodes(root, grid, config, rng, rooms);

    // Tag secret rooms
    tagSecretRooms(root, config, rng);

    // Block secret room entrances with destructible walls (tile 3)
    for (const room of rooms) {
        if (room.isSecret) {
            blockSecretEntrance(grid, room, cols, rows);
        }
    }

    // Add loop corridors for non-linear exploration
    const nonSecretRooms = rooms.filter(r => !r.isSecret);
    addLoops(grid, nonSecretRooms, config.loopChance, config.corridorWidth, rng);

    return { grid, rooms, tree: root };
}

/**
 * Block secret room entrance with destructible wall tiles (3).
 * Find corridor tiles adjacent to the room boundary and replace with tile 3.
 */
function blockSecretEntrance(grid: number[][], room: BSPRoom, cols: number, rows: number): void {
    // Scan room perimeter for corridor connections
    const perimeterCells: { x: number; y: number }[] = [];

    for (let x = room.left - 1; x <= room.right + 1; x++) {
        for (let y = room.top - 1; y <= room.bottom + 1; y++) {
            // Only check cells on the border (not inside)
            if (x >= room.left && x <= room.right && y >= room.top && y <= room.bottom) continue;
            if (x < 0 || x >= cols || y < 0 || y >= rows) continue;

            // Is this a floor tile (corridor) adjacent to the room?
            if (grid[x][y] === 0) {
                // Check that it's adjacent to a room floor tile
                const isAdjacentToRoom =
                    (x + 1 >= room.left && x + 1 <= room.right && y >= room.top && y <= room.bottom) ||
                    (x - 1 >= room.left && x - 1 <= room.right && y >= room.top && y <= room.bottom) ||
                    (x >= room.left && x <= room.right && y + 1 >= room.top && y + 1 <= room.bottom) ||
                    (x >= room.left && x <= room.right && y - 1 >= room.top && y - 1 <= room.bottom);

                if (isAdjacentToRoom) {
                    perimeterCells.push({ x, y });
                }
            }
        }
    }

    // Replace first found corridor entrance with destructible wall
    if (perimeterCells.length > 0) {
        const entrance = perimeterCells[0];
        grid[entrance.x][entrance.y] = 3; // destructible wall
    }
}

// ──────────────────────────────────────────────
// BSPRoomAdapter — wraps BSPRoom for SpawnManager compatibility
// SpawnManager expects rot-js Room interface: getLeft(), getRight(), etc.
// ──────────────────────────────────────────────

export class BSPRoomAdapter {
    constructor(private room: BSPRoom) {}

    getLeft(): number { return this.room.left; }
    getRight(): number { return this.room.right; }
    getTop(): number { return this.room.top; }
    getBottom(): number { return this.room.bottom; }
    getCenter(): [number, number] { return [this.room.centerX, this.room.centerY]; }

    getDoors(callback: (x: number, y: number) => void): void {
        for (const door of this.room.doors) {
            callback(door.x, door.y);
        }
    }

    /** Access underlying BSPRoom data */
    getBSPRoom(): BSPRoom { return this.room; }
}
