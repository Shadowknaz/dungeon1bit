import { addComponent, IWorld } from 'bitecs';
import { Position, NpcTag } from '../components';

export interface DialogOption {
    text: string;
    next?: DialogNode;
    action?: 'close' | 'buy_random' | 'heal';
}

export interface DialogNode {
    text: string;
    options: DialogOption[];
}

export interface NPCState {
    x: number;
    y: number;
    radius: number;
    type: 'merchant' | 'shrine' | 'civilian';
    dialogTree: DialogNode;
    currentNode: DialogNode | null;
}

export function createMerchant(world: IWorld, eid: number, x: number, y: number): NPCState {
    addComponent(world, NpcTag, eid);
    addComponent(world, Position, eid);
    Position.x[eid] = x;
    Position.y[eid] = y;
    return {
        x, y,
        radius: 10,
        type: 'merchant',
        dialogTree: {
            text: "ТОРГОВЕЦ: Приветствую. У меня есть товары.\n50 КРЕДИТОВ за случайный предмет.",
            options: [
                { text: "[Купить (50 CR)]", action: 'buy_random' },
                { text: "[Уйти]", action: 'close' }
            ]
        },
        currentNode: null
    };
}

export function createAltar(world: IWorld, eid: number, x: number, y: number): NPCState {
    addComponent(world, NpcTag, eid);
    addComponent(world, Position, eid);
    Position.x[eid] = x;
    Position.y[eid] = y;
    return {
        x, y,
        radius: 15,
        type: 'shrine',
        dialogTree: {
            text: "АЛТАРЬ: Пожертвуй богатство для Воли.",
            options: [
                { text: "[Лечение (30 CR)]", action: 'heal' },
                { text: "[Уйти]", action: 'close' }
            ]
        },
        currentNode: null
    };
}

export function createCivilian(world: IWorld, eid: number, x: number, y: number): NPCState {
    addComponent(world, NpcTag, eid);
    addComponent(world, Position, eid);
    Position.x[eid] = x;
    Position.y[eid] = y;
    const dialogs = [
        "Тут когда-то был сад...",
        "Они пришли из теней.",
        "Будь осторожен, бочки нестабильны.",
        "Говорят, в стенах есть секретные плиты."
    ];
    return {
        x, y,
        radius: 10,
        type: 'civilian',
        dialogTree: {
            text: `ГРАЖДАНИН: ${dialogs[Math.floor(Math.random()*dialogs.length)]}`,
            options: [{ text: "[Уйти]", action: 'close' }]
        },
        currentNode: null
    };
}
