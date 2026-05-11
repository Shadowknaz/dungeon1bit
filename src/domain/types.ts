import { ElementType } from '../data/registry';
export type { ItemInstance } from '../systems/inventory';
import { ItemInstance } from '../systems/inventory';
import { AnimatedSprite } from '../core/animatedSprite';

export interface DialogOption {
    text: string;
    next?: DialogNode;
    action?: 'close' | 'buy_random' | 'heal';
}

export interface DialogNode {
    text: string;
    options: DialogOption[];
}

export interface Point {
    x: number;
    y: number;
}

export interface Circle extends Point {
    radius: number;
}

export interface Rect extends Point {
    w: number;
    h: number;
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
    enemyId: string; // ID from ENEMIES_DB (e.g. 'grunt', 'golem')
    x: number;
    y: number;
    radius: number;
    type: 'shooter' | 'chaser';
    role: 'guard' | 'patroller' | 'follower' | 'wanderer' | 'ambush';
    leader?: Enemy;
    patrolPath?: Point[];
    patrolIndex: number;
    patrolTarget?: Point;
    followOffX: number;
    followOffY: number;
    speed: number;
    hits: number;
    maxHits: number;
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
    projectileSpeed: number;
    stunTimer: number;
    isStunned: boolean;
    currentPath?: Point[];
    pathTimer?: number;
}

export interface NPC extends Point {
    eid: number;
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

export interface DroppedItem extends Point {
    id: number;
    itemId: string;
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

export interface Laser {
    id: number;
    x1: number;
    y1: number;
    x2: number;
    y2: number;
    life: number;
    maxLife: number;
    width?: number;
}

export interface Grenade extends Point {
    id: number;
    vx: number;
    vy: number;
    timer: number;
    type: 'he' | 'flash';
    radius: number;
}

export interface Projectile extends Point {
    id: number;
    vx: number;
    vy: number;
    damage: number;
    type: 'player' | 'enemy';
    lifetime: number;
    radius: number;
    isEnemy: boolean;
    bounces?: number;
}
