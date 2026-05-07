import { ElementType } from './data/elements';
import { DialogNode } from './entities/npc';
import { ItemInstance } from './systems/inventory';
import { AnimatedSprite } from './core/animatedSprite';

export interface Point {
    x: number;
    y: number;
}

export interface Room {
  id: string;
  x: number; // global map coordinates
  y: number;
  w: number;
  h: number;
  map: number[][];
  doors: Door[];
  enemies: Enemy[];
  barrels: Barrel[];
  chests: Chest[];
  traps: any[];
  npcs: NPC[];
  objects: any[];
  decorations?: any[]; // декоративные объекты
}

export interface GameState {
  currentRoom: Room | null;
  player: any;
  frameCount?: number;
  // другие поля состояния игры
}

export interface Barrel {
    id: number;
    x: number;
    y: number;
    radius: number;
    type: ElementType | 'explosive';
}

export interface Torch extends Point {
    id: string;
    gx: number;
    gy: number;
    lit?: boolean;
}

export interface Enemy {
    id: number;
    x: number;
    y: number;
    radius: number;
    type: 'shooter' | 'chaser';
    role: 'guard' | 'patroller' | 'follower' | 'wanderer';
    leader?: Enemy;
    patrolPath?: Point[];
    patrolIndex: number;
    patrolTarget?: Point;
    followOffX: number;
    followOffY: number;
    speed: number;
    health: number;
    maxHealth: number;
    fsm: any; // XState interpreter
    lastKnownPosition: Point | null;
    barkText: string;
    barkTimer: number;
    alertTimer: number;
    status: string | null;
    statusTimer: number;
    angle?: number;
    anim?: AnimatedSprite;
    memoryTimer: number;
    shootTimer: number;
    onShoot: (x: number, y: number, angle: number) => void;
    detectionRange: number;
    lastCanSeePlayer?: boolean;
    noiseLevel: number; // 0-100 accumulation
    noisePosition: Point | null; // Source of noise
}

export interface NPC extends Point {
    radius: number;
    type: 'merchant' | 'shrine' | 'civilian';
    dialogTree: DialogNode;
    currentNode: DialogNode | null;
}

export interface PressurePlate extends Point {
    id: string;
    triggered: boolean;
    type: 'secret_trigger';
}

export interface Chest extends Point {
    id: number;
    opened?: boolean;
    items: ItemInstance[];
}

export interface Door {
    x: number;
    y: number;
    w: number;
    h: number;
    type: 'exit' | 'start';
    open?: boolean;
}

export interface TrapPlate extends Point {
    id: string;
    state: number; // 0: idle, 1: pressed, 2: active
    timer: number;
}

export interface Projectile {
    id: number;
    x: number;
    y: number;
    vx: number;
    vy: number;
    damage: number;
    type: 'player' | 'enemy';
    lifetime: number;
    radius: number;
    isEnemy: boolean;
}
