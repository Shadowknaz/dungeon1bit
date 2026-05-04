/**
 * Lumen - Система динамического освещения для 1-битной игры
 * Использует алгоритм Shadowcasting для расчета видимости (FOV)
 * и генерирует карту освещенности для дизеринга.
 */

import { GameState, Point } from '../types';

// Типы источников света
export enum LightType {
  STATIC = 'static',   // Факелы, лампы (не двигаются)
  DYNAMIC = 'dynamic', // Игрок, снаряды, взрывы
  TEMPORARY = 'temporary' // Вспышки, магические эффекты
}

export interface LightSource {
  id: string;
  x: number;
  y: number;
  radius: number;      // Радиус освещения в клетках
  intensity: number;   // Базовая интенсивность (0-1)
  type: LightType;
  color?: string;      // Для будущих эффектов (сейчас 1-бит, но полезно для логики)
  active: boolean;
  ttl?: number;        // Время жизни для временных источников
}

// Карта освещенности: значение от 0 (тьма) до 1 (полный свет)
export type LightMap = Float32Array;

// Кэш видимости для оптимизации (Dirty Flags)
interface VisibilityCache {
  map: Uint8Array; // 0 - не видно, 1 - видно
  dirty: boolean;
  lastUpdateFrame: number;
}

class LumenSystem {
  private width: number = 0;
  private height: number = 0;
  private lightSources: Map<string, LightSource> = new Map();
  private lightMap: LightMap | null = null;
  private visibilityCache: VisibilityCache | null = null;

  // Паттерны дизеринга (Bayer Matrix 4x4)
  private ditherMatrix = [
    [0, 8, 2, 10],
    [12, 4, 14, 6],
    [3, 11, 1, 9],
    [15, 7, 13, 5]
  ];

  constructor() {}

  /**
   * Инициализация системы
   */
  init(width: number, height: number) {
    this.width = width;
    this.height = height;
    this.lightMap = new Float32Array(width * height);
    this.visibilityCache = {
      map: new Uint8Array(width * height),
      dirty: true,
      lastUpdateFrame: 0
    };
  }

  /**
   * Добавление источника света
   */
  addLight(source: LightSource) {
    this.lightSources.set(source.id, source);
    if (this.visibilityCache) this.visibilityCache.dirty = true;
  }

  /**
   * Обновление позиции динамического источника
   */
  updateLightPosition(id: string, x: number, y: number) {
    const source = this.lightSources.get(id);
    if (source && (source.x !== x || source.y !== y)) {
      source.x = x;
      source.y = y;
      if (source.type === LightType.DYNAMIC && this.visibilityCache) {
        this.visibilityCache.dirty = true;
      }
    }
  }

  /**
   * Удаление источника света
   */
  removeLight(id: string) {
    if (this.lightSources.delete(id) && this.visibilityCache) {
      this.visibilityCache.dirty = true;
    }
  }

  /**
   * Проверка блокирует ли клетка свет (стены, объекты)
   */
  private isBlocking(gameState: GameState, x: number, y: number): boolean {
    if (x < 0 || x >= this.width || y < 0 || y >= this.height) return true;
    
    // Проверяем стены в текущей комнате
    const room = gameState.currentRoom;
    if (!room) return true;

    // Локальные координаты в комнате
    const localX = x; 
    const localY = y;

    if (localY >= 0 && localY < room.map.length && localX >= 0 && localX < room.map[0].length) {
      const tile = room.map[localY][localX];
      // Стены (1), объекты (3+) могут блокировать свет. Пол (0) - нет.
      // Можно настроить пороги блокировки
      return tile === 1 || tile >= 3; 
    }
    return true;
  }

  /**
   * Алгоритм Shadowcasting для расчета видимости
   * Рекурсивно проверяет октанты от источника света
   * (Зарезервировано для будущего использования)
   */
  private castShadow(
    gameState: GameState,
    x: number, y: number, 
    row: number, 
    start: number, _end: number, 
    xx: number, xy: number, 
    yx: number, yy: number, 
    radius: number,
    visibleMap: Uint8Array
  ) {
    let slopeNextRow = start - 1;

    for (let j = row; j <= radius; j++) {
      let blocked = false;
      let dx = -j - 1;
      
      for (let i = -j; i <= 0; i++) {
        let dy = -i;
        let lSlope = (dx + 0.5) / (dy - 0.5);
        let rSlope = (dx - 0.5) / (dy + 0.5);

        if (!(start > rSlope)) {
          let cx = x + dx * xx + dy * xy;
          let cy = x + dx * yx + dy * yy;
          
          // Проверка границ и блокировки
          if (cx >= 0 && cx < this.width && cy >= 0 && cy < this.height) {
             // Преобразуем в индекс массива видимости (упрощенно считаем плоскую карту для всего уровня или текущей комнаты)
             // Для простоты используем глобальные координаты если они есть, или локальные
             // Здесь предполагаем, что x,y уже в координатах карты освещения
             
             // Если это первая строка радиуса и мы внутри радиуса - помечаем как видимое
             if (j <= radius) {
                const idx = cy * this.width + cx;
                if (idx >= 0 && idx < visibleMap.length) {
                    visibleMap[idx] = 1;
                }
             }
          }
        }

        if (blocked) {
          if (this.isBlocking(gameState, x + dx * xx + dy * xy, x + dx * yx + dy * yy)) {
            slopeNextRow = lSlope;
            continue;
          } else {
            blocked = false;
            start = slopeNextRow;
          }
        } else {
          if (this.isBlocking(gameState, x + dx * xx + dy * xy, x + dx * yx + dy * yy) && j < radius) {
            blocked = true;
            this.castShadow(gameState, x, y, j + 1, start, lSlope, xx, xy, yx, yy, radius, visibleMap);
            slopeNextRow = lSlope;
          }
        }
        start = rSlope;
        dx++;
      }
      if (blocked) break;
    }
  }

  /**
   * Расчет полной карты освещенности
   * Вызывается каждый кадр или по флагу dirty
   */
  calculateLighting(gameState: GameState, playerPos: Point) {
    if (!this.lightMap || !this.visibilityCache) return;

    const { map } = this.visibilityCache;
    
    // Очистка карты видимости
    map.fill(0);

    // 1. Расчет видимости от игрока (динамический источник)
    // Используем упрощенный Raycasting для скорости вместо полного рекурсивного shadowcast на каждый кадр
    // Или оптимизированный shadowcast только для игрока
    this.computeFOV(gameState, playerPos.x, playerPos.y, 8, map);

    // 2. Расчет статических источников (факелы)
    // Оптимизация: пересчитываем только если карта изменилась или источник новый
    // Для простоты в демо-режиме пересчитываем вклад всех источников
    
    this.lightMap.fill(0);

    // Функция добавления света в карту
    const addLightContribution = (lx: number, ly: number, radius: number, intensity: number) => {
      const rSquared = radius * radius;
      const minX = Math.max(0, lx - radius);
      const maxX = Math.min(this.width - 1, lx + radius);
      const minY = Math.max(0, ly - radius);
      const maxY = Math.min(this.height - 1, ly + radius);

      for (let y = minY; y <= maxY; y++) {
        for (let x = minX; x <= maxX; x++) {
          const dx = x - lx;
          const dy = y - ly;
          const distSq = dx * dx + dy * dy;

          if (distSq <= rSquared) {
            const dist = Math.sqrt(distSq);
            // Затухание света: 1 - (dist / radius)^2
            let falloff = 1.0 - (dist / radius);
            falloff = falloff * falloff; // Квадратичное затухание для мягкости
            
            // Проверка видимости (если точка не видна ни одному источнику, она темная)
            // Упрощение: считаем, что если точка в радиусе и не за стеной прямой видимости - она освещена
            // Для полноценной работы нужно проверять LOS от источника до точки
            
            const idx = y * this.width + x;
            if (idx >= 0 && idx < this.lightMap.length) {
              // Берем максимум от всех источников
              const contribution = falloff * intensity;
              if (contribution > this.lightMap[idx]) {
                this.lightMap[idx] = contribution;
              }
            }
          }
        }
      }
    };

    // Применяем свет от игрока
    addLightContribution(playerPos.x, playerPos.y, 8, 1.0);

    // Применяем свет от статических источников
    this.lightSources.forEach(source => {
      if (source.active && source.type === LightType.STATIC) {
        const src = source;
        // Оптимизация: можно кэшировать статический свет и пересчитывать только при изменении геометрии
        addLightContribution(src.x, src.y, src.radius, src.intensity);
      }
    });

    this.visibilityCache.lastUpdateFrame = gameState.frameCount || 0;
    this.visibilityCache.dirty = false;
  }

  /**
   * Упрощенный расчет FOV (Raycasting) для видимости
   */
  private computeFOV(gameState: GameState, cx: number, cy: number, radius: number, visibleMap: Uint8Array) {
    const steps = radius * 8; // Количество лучей
    for (let i = 0; i < steps; i++) {
      const angle = (Math.PI * 2 * i) / steps;
      const dx = Math.cos(angle);
      const dy = Math.sin(angle);

      let x = cx + 0.5;
      let y = cy + 0.5;

      for (let r = 0; r < radius; r += 0.5) {
        const tx = Math.floor(x);
        const ty = Math.floor(y);

        if (tx < 0 || tx >= this.width || ty < 0 || ty >= this.height) break;

        const idx = ty * this.width + tx;
        visibleMap[idx] = 1; // Помечаем как видимое

        if (this.isBlocking(gameState, tx, ty)) {
          break; // Луч упёрся в стену
        }

        x += dx;
        y += dy;
      }
    }
    // Центральная клетка всегда видна
    const centerIdx = cy * this.width + cx;
    if (centerIdx >= 0 && centerIdx < visibleMap.length) {
        visibleMap[centerIdx] = 1;
    }
  }

  /**
   * Получение значения освещенности для клетки
   * Возвращает значение 0-1
   */
  getLightLevel(x: number, y: number): number {
    if (!this.lightMap || x < 0 || x >= this.width || y < 0 || y >= this.height) return 0;
    return this.lightMap[y * this.width + x];
  }

  /**
   * Проверка видимости клетки для ИИ или механик
   */
  isVisible(x: number, y: number): boolean {
    if (!this.visibilityCache || x < 0 || x >= this.width || y < 0 || y >= this.height) return false;
    return this.visibilityCache.map[y * this.width + x] === 1;
  }

  /**
   * Генерация порогового значения для дизеринга на основе координат и освещенности
   */
  getDitherThreshold(x: number, y: number): number {
    // Bayer matrix 4x4 нормализованная (0-1)
    const bx = x % 4;
    const by = y % 4;
    return (this.ditherMatrix[by][bx] + 0.5) / 16.0;
  }

  /**
   * Очистка временных источников
   */
  update(dt: number) {
    const toRemove: string[] = [];
    this.lightSources.forEach((source, id) => {
      if (source.type === LightType.TEMPORARY && source.ttl !== undefined) {
        source.ttl -= dt;
        if (source.ttl <= 0) {
          toRemove.push(id);
        }
      }
    });
    toRemove.forEach(id => this.removeLight(id));
  }
}

export const lumen = new LumenSystem();
