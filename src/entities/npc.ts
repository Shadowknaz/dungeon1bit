import { addComponent, IWorld } from 'bitecs';
import { Position, NpcTag } from '../domain/components';
import { NPC, DialogNode } from '../domain/types';

export function createMerchant(world: IWorld, eid: number, x: number, y: number): NPC {
    addComponent(world, NpcTag, eid);
    addComponent(world, Position, eid);
    Position.x[eid] = x;
    Position.y[eid] = y;
    return {
        eid,
        get x() { return Position.x[eid]; },
        set x(v) { Position.x[eid] = v; },
        get y() { return Position.y[eid]; },
        set y(v) { Position.y[eid] = v; },
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
    } as any as NPC;
}

export function createAltar(world: IWorld, eid: number, x: number, y: number): NPC {
    addComponent(world, NpcTag, eid);
    addComponent(world, Position, eid);
    Position.x[eid] = x;
    Position.y[eid] = y;
    return {
        eid,
        get x() { return Position.x[eid]; },
        set x(v) { Position.x[eid] = v; },
        get y() { return Position.y[eid]; },
        set y(v) { Position.y[eid] = v; },
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
    } as any as NPC;
}

export function createCivilian(world: IWorld, eid: number, x: number, y: number): NPC {
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
        eid,
        get x() { return Position.x[eid]; },
        set x(v) { Position.x[eid] = v; },
        get y() { return Position.y[eid]; },
        set y(v) { Position.y[eid] = v; },
        radius: 10,
        type: 'civilian',
        dialogTree: {
            text: `ГРАЖДАНИН: ${dialogs[Math.floor(Math.random()*dialogs.length)]}`,
            options: [{ text: "[Уйти]", action: 'close' }]
        },
        currentNode: null
    } as any as NPC;
}
