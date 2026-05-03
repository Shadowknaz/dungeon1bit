import { ITEMS_DB, ItemData } from '../data/items';

export interface ItemInstance {
    id: string;
    instanceId: number;
    x: number;
    y: number;
}

export class InventorySystem {
    constructor(
        private cols: number,
        private rows: number
    ) {}

    canPlaceItem(item: ItemInstance, gridX: number, gridY: number, targetList: ItemInstance[]): boolean {
        const db = ITEMS_DB[item.id];
        if (!db) return false;
        const shape = db.shape;

        if (gridX < 0 || gridY < 0 || gridX + shape[0].length > this.cols || gridY + shape.length > this.rows) {
            return false;
        }

        for (const other of targetList) {
            if (other.instanceId === item.instanceId) continue;
            const oDb = ITEMS_DB[other.id];
            if (!oDb) continue;
            const oShape = oDb.shape;

            for (let r = 0; r < shape.length; r++) {
                for (let c = 0; c < shape[r].length; c++) {
                    if (shape[r][c]) {
                        const oX = gridX + c - other.x;
                        const oY = gridY + r - other.y;
                        if (oY >= 0 && oY < oShape.length && oX >= 0 && oX < oShape[oY].length && oShape[oY][oX]) {
                            return false;
                        }
                    }
                }
            }
        }
        return true;
    }

    findFreeSpot(item: { id: string, instanceId: number }, targetList: ItemInstance[]): { x: number, y: number } | null {
        for (let y = 0; y < this.rows; y++) {
            for (let x = 0; x < this.cols; x++) {
                if (this.canPlaceItem(item as ItemInstance, x, y, targetList)) {
                    return { x, y };
                }
            }
        }
        return null;
    }

    getItemAtPixel(
        px: number, py: number,
        gridOffsetX: number, gridOffsetY: number,
        slotSize: number,
        list: ItemInstance[]
    ): { item: ItemInstance, offsetX: number, offsetY: number } | null {
        const gx = Math.floor((px - gridOffsetX) / slotSize);
        const gy = Math.floor((py - gridOffsetY) / slotSize);

        for (const item of list) {
            const db = ITEMS_DB[item.id];
            if (!db) continue;
            const shape = db.shape;
            const lx = gx - item.x;
            const ly = gy - item.y;

            if (ly >= 0 && ly < shape.length && lx >= 0 && lx < shape[ly].length && shape[ly][lx]) {
                return {
                    item,
                    offsetX: px - (gridOffsetX + item.x * slotSize),
                    offsetY: py - (gridOffsetY + item.y * slotSize)
                };
            }
        }
        return null;
    }
}
