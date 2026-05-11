import { Point } from '../domain/types';
import { 
    MAP_COLS, MAP_ROWS, 
    LIGHTING_FULL_INTERVAL, PLAYER_VISION_RADIUS, 
    VISIBILITY_ABSOLUTE_RADIUS, PLAYER_FOV_ANGLE 
} from '../core/constants';

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
  lastX?: number;      // Для отслеживания движения (dirty flags)
  lastY?: number;
}

// Карта освещенности: значение от 0 (тьма) до 1 (полный свет)
export type LightMap = Float32Array;

interface VisibilityCache {
  map: Uint8Array;
  lastUpdateFrame: number;
}

export interface LightingFrameInput {
  frameCount: number;
  playerPos: Point;
  playerVisionRadius: number;
  playerAngle?: number;  // Angle in radians for cone vision
  playerFovAngle?: number; // Half-angle of cone (default: PI for full circle)
  absoluteVisibilityRadius?: number; // Small circle around player with absolute visibility (default: 2)
  passabilityRaw: Uint8Array;
  mapCols: number;
  bounds?: { startX: number, endX: number, startY: number, endY: number };
}

// Интерфейс для информации об освещенности для игровых систем
export interface LightingInfo {
  lightLevel: number;        // 0-1, уровень света
  isVisible: boolean;        // Видна ли клетка
  shadowIntensity: number;   // 0-1, интенсивность тени (1 - полная тьма)
  ditherPattern: number;     // 0-15, паттерн дизеринга
}

// Интерфейс для модификаторов боя на основе света
export interface CombatLightModifier {
  accuracyModifier: number;  // Множитель на точность (0.5-1.5)
  damageModifier: number;    // Множитель на урон в тени (0.8-1.2)
  detectionRadius: number;   // Радиус обнаружения врагом игрока
}

class LumenSystem {
  private width: number = 0;
  private height: number = 0;
  private lightSources: Map<string, LightSource> = new Map();
  private lightMap: LightMap | null = null;
  private visibilityCache: VisibilityCache | null = null;
  private aoMap: Float32Array | null = null; // Ambient occlusion map
  private dirtyAO: boolean = true;

  // Множество дизеринг паттернов для разных уровней света
  private ditherPatterns = {
    // Минимальный дизеринг (0.7-1.0) - почти освещено
    light: [
      [0, 12, 3, 15],
      [8, 4, 11, 7],
      [2, 14, 1, 13],
      [10, 6, 9, 5]
    ],
    // Средний дизеринг (0.4-0.7) - полутень
    medium: [
      [0, 8, 2, 10],
      [12, 4, 14, 6],
      [3, 11, 1, 9],
      [15, 7, 13, 5]
    ],
    // Тяжелый дизеринг (0-0.4) - почти тьма
    dark: [
      [15, 7, 13, 5],
      [3, 11, 1, 9],
      [12, 4, 14, 6],
      [0, 8, 2, 10]
    ]
  };

  // Dirty flags - отслеживание измененных областей
  private dirtyRegions: Set<string> = new Set();
  private lastPlayerVisionRadius: number = 0;
  private static readonly CALC_MARGIN = 5;

  constructor() {}

  init(width: number, height: number) {
    this.width = width;
    this.height = height;
    this.lightMap = new Float32Array(width * height);
    this.aoMap = new Float32Array(width * height);
    this.visibilityCache = {
      map: new Uint8Array(width * height),
      lastUpdateFrame: 0
    };
  }

  reset() {
    this.lightSources.clear();
    this.dirtyRegions.clear();
    this.lastLightSourcesHash = '';
    this.lastPlayerPos = null;
    if (this.lightMap) this.lightMap.fill(0);
    if (this.aoMap) this.aoMap.fill(0);
    if (this.visibilityCache) {
      this.visibilityCache.map.fill(0);
      this.visibilityCache.lastUpdateFrame = 0;
    }
  }

  addLight(source: LightSource) {
    this.lightSources.set(source.id, source);
    source.lastX = source.x;
    source.lastY = source.y;
    this.markDirty(source.x, source.y, source.radius);
  }

  updateLightPosition(id: string, x: number, y: number) {
    const source = this.lightSources.get(id);
    if (source) {
      const oldX = source.x;
      const oldY = source.y;
      source.x = x;
      source.y = y;
      // Отметить обе области как грязные (старую и новую)
      this.markDirty(oldX, oldY, source.radius);
      this.markDirty(x, y, source.radius);
    }
  }

  removeLight(id: string) {
    const source = this.lightSources.get(id);
    if (source) {
      this.markDirty(source.x, source.y, source.radius);
    }
    this.lightSources.delete(id);
  }

  triggerDirtyAO() {
    this.dirtyAO = true;
  }

  getAllLightIds(): string[] {
    return Array.from(this.lightSources.keys());
  }

  toggleLight(id: string): boolean {
    const source = this.lightSources.get(id);
    if (source) {
      source.active = !source.active;
      this.markDirty(source.x, source.y, source.radius);
      return source.active;
    }
    return false;
  }

  isLightActive(id: string): boolean {
    const source = this.lightSources.get(id);
    return source ? source.active : false;
  }

  private inBounds(x: number, y: number): boolean {
    return x >= 0 && x < this.width && y >= 0 && y < this.height;
  }

  // Отметить область как требующую пересчета
  private markDirty(cx: number, cy: number, radius: number) {
    const key = `${Math.floor(cx)},${Math.floor(cy)},${Math.floor(radius)}`;
    this.dirtyRegions.add(key);
  }

  // Получить хеш текущего состояния источников света для dirty flags
  private getLightSourcesHash(): string {
    let hash = '';
    this.lightSources.forEach((s, id) => {
      if (s.active) {
        hash += `${id}:${s.x},${s.y},${s.intensity};`;
      }
    });
    return hash;
  }

  calculateLighting(input: LightingFrameInput) {
    if (!this.lightMap || !this.visibilityCache) return;

    const { frameCount, playerPos, playerVisionRadius, playerAngle = 0, playerFovAngle = PLAYER_FOV_ANGLE, absoluteVisibilityRadius = VISIBILITY_ABSOLUTE_RADIUS, passabilityRaw, mapCols } = input;

    // 1. Throttling: Recalculate at most every N frames unless lights changed significantly
    if (frameCount % LIGHTING_FULL_INTERVAL !== 0 && this.lastLightSourcesHash === this.getLightSourcesHash()) {
        return;
    }

    const newHash = this.getLightSourcesHash();
    const distMoved = this.lastPlayerPos ? Math.abs(this.lastPlayerPos.x - playerPos.x) + Math.abs(this.lastPlayerPos.y - playerPos.y) : 999;
    
    // 2. Movement threshold: Only update if player moved more than a small amount or lights changed
    const playerPosChanged = distMoved > 0.15;
    const visionRadiusChanged = this.lastPlayerVisionRadius !== playerVisionRadius;
    const lightsChanged = newHash !== this.lastLightSourcesHash;

    if (playerPosChanged || visionRadiusChanged || lightsChanged || this.dirtyRegions.size > 0) {
      const { map } = this.visibilityCache;
      const bounds = input.bounds || { startX: 0, endX: this.width, startY: 0, endY: this.height };
      
      const calcStartX = Math.max(0, bounds.startX - LumenSystem.CALC_MARGIN);
      const calcEndX = Math.min(this.width, bounds.endX + LumenSystem.CALC_MARGIN);
      const calcStartY = Math.max(0, bounds.startY - LumenSystem.CALC_MARGIN);
      const calcEndY = Math.min(this.height, bounds.endY + LumenSystem.CALC_MARGIN);

      map.fill(0);
      this.lightMap.fill(0);

      this.computeVisibility(playerPos.x, playerPos.y, playerVisionRadius, playerAngle, playerFovAngle, absoluteVisibilityRadius, map, passabilityRaw, mapCols);
      this.addLightContribution(playerPos.x, playerPos.y, playerVisionRadius, 1.0, passabilityRaw, mapCols);

      this.lightSources.forEach(source => {
        if (source.active) {
          // Cull lights outside calculation bounds
          if (source.x >= calcStartX - source.radius && source.x <= calcEndX + source.radius &&
              source.y >= calcStartY - source.radius && source.y <= calcEndY + source.radius) {
            this.addLightContribution(source.x, source.y, source.radius, source.intensity, passabilityRaw, mapCols);
          }
        }
      });

      // Вычисляем AO только в видимой области и только если нужно
      if (this.dirtyAO) {
        this.computeAmbientOcclusion(passabilityRaw, mapCols);
        this.dirtyAO = false;
      }

      this.dirtyRegions.clear();
    }

    this.lastLightSourcesHash = newHash;
    this.lastPlayerPos = { ...playerPos };
    this.lastPlayerVisionRadius = playerVisionRadius;
    this.visibilityCache.lastUpdateFrame = frameCount;
  }

  /**
   * Вычисляет ambient occlusion для углов и внутренних углов
   * AO делает углы темнее, создавая эффект глубины
   */
  private computeAmbientOcclusion(passabilityRaw: Uint8Array, mapCols: number): void {
    if (!this.aoMap) return;

    // Сбрасываем AO map
    this.aoMap.fill(0);

    for (let y = 0; y < this.height; y++) {
      for (let x = 0; x < this.width; x++) {
        // Пропускаем стены - AO только для пола
        if (passabilityRaw[y * mapCols + x] === 0) continue;

        let aoFactor = 0;

        // Проверяем 8 соседей
        const neighbors = [
          { dx: -1, dy: -1, weight: 0.5 },  // верх-лево (угол)
          { dx: 0, dy: -1, weight: 0.3 },   // верх
          { dx: 1, dy: -1, weight: 0.5 },   // верх-право (угол)
          { dx: -1, dy: 0, weight: 0.3 },   // лево
          { dx: 1, dy: 0, weight: 0.3 },    // право
          { dx: -1, dy: 1, weight: 0.5 },   // низ-лево (угол)
          { dx: 0, dy: 1, weight: 0.3 },    // низ
          { dx: 1, dy: 1, weight: 0.5 },    // низ-право (угол)
        ];

        for (const neighbor of neighbors) {
          const nx = x + neighbor.dx;
          const ny = y + neighbor.dy;

          if (this.inBounds(nx, ny) && passabilityRaw[ny * mapCols + nx] === 0) {
            aoFactor += neighbor.weight;
          }
        }

        // Нормализуем AO (максимум ~2.0, ограничиваем до 0.5)
        aoFactor = Math.min(aoFactor, 0.5);

        const idx = y * this.width + x;
        this.aoMap[idx] = aoFactor;
      }
    }
  }

  /**
   * Получить значение ambient occlusion для клетки
   * @returns значение от 0 (нет AO) до 0.5 (максимальное затемнение)
   */
  getAO(x: number, y: number): number {
    if (!this.aoMap || !this.inBounds(x, y)) return 0;
    return this.aoMap[y * this.width + x];
  }

  private computeVisibility(cx: number, cy: number, radius: number, playerAngle: number, fovHalfAngle: number, absoluteRadius: number, visibleMap: Uint8Array, passabilityRaw: Uint8Array, mapCols: number) {
    if (!this.inBounds(cx, cy)) return;

    // Full circle if fovHalfAngle >= PI
    const fullCircle = fovHalfAngle >= Math.PI - 0.01;
    // Optimized ray count: 48 minimum, radius * 8 instead of 16
    const steps = Math.max(48, radius * 8);

    // First, mark absolute radius circle with full 360-degree raycasting
    const absoluteSteps = Math.max(32, absoluteRadius * 16);
    for (let i = 0; i < absoluteSteps; i++) {
      const rayAngle = (Math.PI * 2 * i) / absoluteSteps;
      const dx = Math.cos(rayAngle);
      const dy = Math.sin(rayAngle);

      let x = cx + 0.5;
      let y = cy + 0.5;

      for (let r = 0; r < absoluteRadius; r += 0.5) {
        const tx = Math.floor(x);
        const ty = Math.floor(y);

        if (!this.inBounds(tx, ty)) break;

        const idx = ty * this.width + tx;
        visibleMap[idx] = 1;

        if (passabilityRaw[idx] === 0) {
          break;
        }

        x += dx;
        y += dy;
      }
    }

    // Then, mark the main vision cone with larger radius
    for (let i = 0; i < steps; i++) {
      const rayAngle = (Math.PI * 2 * i) / steps;
      // Skip rays outside cone
      if (!fullCircle) {
        let angleDiff = Math.abs(rayAngle - playerAngle);
        if (angleDiff > Math.PI) angleDiff = 2 * Math.PI - angleDiff;
        if (angleDiff > fovHalfAngle) continue;
      }

      const dx = Math.cos(rayAngle);
      const dy = Math.sin(rayAngle);

      let x = cx + 0.5;
      let y = cy + 0.5;

      for (let r = 0; r < radius; r += 0.5) {
        const tx = Math.floor(x);
        const ty = Math.floor(y);

        if (!this.inBounds(tx, ty)) break;

        const idx = ty * this.width + tx;
        visibleMap[idx] = 1;

        if (passabilityRaw[idx] === 0) {
          break;
        }

        x += dx;
        y += dy;
      }
    }

    // Ensure center is always visible
    const centerIdx = cy * this.width + cx;
    visibleMap[centerIdx] = 1;
  }

  private hasLineOfSight(x0: number, y0: number, x1: number, y1: number, passabilityRaw: Uint8Array, mapCols: number): boolean {
    const steps = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0));
    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      const x = Math.floor(x0 + (x1 - x0) * t);
      const y = Math.floor(y0 + (y1 - y0) * t);
      if ((x !== x0 || y !== y0) && passabilityRaw[y * mapCols + x] === 0) {
        return x === x1 && y === y1;
      }
    }
    return true;
  }

  private addLightContribution(lx: number, ly: number, radius: number, intensity: number, passabilityRaw: Uint8Array, mapCols: number) {
    if (!this.lightMap) return;
    const rSquared = radius * radius;
    const minX = Math.max(0, lx - radius);
    const maxX = Math.min(this.width - 1, lx + radius);
    const minY = Math.max(0, ly - radius);
    const maxY = Math.min(this.height - 1, ly + radius);

    // Gradual fade zone - last 20% of radius
    const fadeStart = radius * 0.8;

    for (let y = minY; y <= maxY; y++) {
      for (let x = minX; x <= maxX; x++) {
        const dx = x - lx;
        const dy = y - ly;
        const distSq = dx * dx + dy * dy;
        if (distSq > rSquared) continue;
        if (!this.hasLineOfSight(lx, ly, x, y, passabilityRaw, mapCols)) continue;

        const dist = Math.sqrt(distSq);
        let falloff = Math.pow(Math.max(0, 1 - dist / radius), 2);

        // Apply gradual fade at edges
        if (dist > fadeStart) {
          const fadeProgress = (dist - fadeStart) / (radius - fadeStart);
          falloff *= (1 - fadeProgress * 0.5); // Reduce intensity by up to 50% at edge
        }

        const idx = y * this.width + x;
        this.lightMap[idx] = Math.max(this.lightMap[idx], falloff * intensity);
      }
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
    if (!this.visibilityCache || !this.inBounds(x, y)) return false;
    return this.visibilityCache.map[y * this.width + x] === 1;
  }

  /**
   * Получить информацию об освещенности для клетки
   * Используется для UI, AI и боевых модификаторов
   */
  getLightingInfo(x: number, y: number): LightingInfo {
    const lightLevel = this.getLightLevel(x, y);
    const visible = this.isVisible(x, y);
    const shadowIntensity = 1 - lightLevel;
    const ditherPattern = this.getDitherThreshold(x, y);

    return {
      lightLevel,
      isVisible: visible,
      shadowIntensity,
      ditherPattern
    };
  }

  /**
   * Получить дизеринг паттерн в зависимости от уровня света
   */
  private selectDitherPattern(lightLevel: number): number[][] {
    if (lightLevel > 0.7) return this.ditherPatterns.light;
    if (lightLevel > 0.4) return this.ditherPatterns.medium;
    return this.ditherPatterns.dark;
  }

  /**
   * Генерация порогового значения для дизеринга на основе координат и освещенности
   */
  getDitherThreshold(x: number, y: number): number {
    const lightLevel = this.getLightLevel(x, y);
    const pattern = this.selectDitherPattern(lightLevel);
    const bx = ((x % 4) + 4) % 4;
    const by = ((y % 4) + 4) % 4;
    return (pattern[by][bx] + 0.5) / 16.0;
  }

  /**
   * Получить динамический дизеринг паттерн для визуализации
   * Возвращает матрицу для текущего уровня света
   */
  getDitherPatternForLight(lightLevel: number): number[][] {
    return this.selectDitherPattern(lightLevel);
  }

  /**
   * Рассчить модификаторы боя на основе освещенности
   * Тьма дает преимущество игроку (меньше видимость), штраф врагам
   */
  getCombatLightModifier(x: number, y: number): CombatLightModifier {
    const lightLevel = this.getLightLevel(x, y);
    
    // Точность: в полной тьме лучше скрытатьс, но хуже атаковать
    // В свете: хуже скрытаться, но лучше атаковать
    const accuracyModifier = 0.5 + lightLevel * 1.0; // 0.5 в тьме, 1.5 на свету

    // Урон в тени немного повышается (скрытая позиция)
    const damageModifier = 0.95 + (1 - lightLevel) * 0.25; // 1.2 в тьме, 0.95 на свету

    // Радиус обнаружения врагом игрока зависит от света
    const baseDetectionRadius = 10;
    const detectionRadius = baseDetectionRadius * (0.5 + lightLevel * 0.5); // 5 в тьме, 10 на свету

    return {
      accuracyModifier,
      damageModifier,
      detectionRadius
    };
  }

  /**
   * Проверить обнаружит ли враг игрока на основе освещенности и расстояния
   * @param enemyPos позиция врага
   * @param playerPos позиция игрока
   * @param distance расстояние между врагом и игроком
   * @returns вероятность обнаружения (0-1)
   */
  getEnemyDetectionChance(enemyPos: Point, playerPos: Point, distance: number): number {
    const playerLighting = this.getLightingInfo(Math.floor(playerPos.x / 32), Math.floor(playerPos.y / 32));
    const modifier = this.getCombatLightModifier(Math.floor(playerPos.x / 32), Math.floor(playerPos.y / 32));
    
    // Базовая вероятность зависит от расстояния
    const baseChance = Math.max(0, 1 - (distance / modifier.detectionRadius));
    
    // Светлость увеличивает вероятность обнаружения
    const detectionChance = baseChance * (0.3 + playerLighting.lightLevel * 1.4);
    
    return Math.min(1, Math.max(0, detectionChance));
  }

  /**
   * Получить светлость на позиции для упрощенных проверок
   */
  getBrightness(x: number, y: number): number {
    const lightLevel = this.getLightLevel(x, y);
    // Нормализовать в диапазон 0-1, где 0 = полная тьма, 1 = полный свет
    return Math.min(1, Math.max(0, lightLevel));
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
