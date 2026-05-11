import { ITEMS_DB } from '../data/registry';

export interface ItemInstance {
    id: string;
    instanceId: number;
}

export class InventorySystem {
    // Inventory is now just a list managed in Game class, 
    // but we can keep some helper methods here if needed.
    
    constructor() {}

    getItemById(instanceId: number, list: ItemInstance[]): ItemInstance | null {
        return list.find(it => it.instanceId === instanceId) || null;
    }
}
