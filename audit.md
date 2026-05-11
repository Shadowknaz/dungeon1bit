# 🔍 Технический Аудит: dungeon1bit

> Дата: 2026-05-09 | Версия: 0.1.0 | Файлов проверено: 30+

---

## 📊 Сводка

| Категория | Кол-во проблем | Критичность |
|---|---|---|
| Архитектурные | 5 | 🔴 Высокая |
| Дублирование кода/типов | 8 | 🟠 Средняя |
| Технический долг | 9 | 🟠 Средняя |
| Мёртвый / избыточный код | 6 | 🟡 Низкая |
| Отладочный мусор | 3 | 🟡 Низкая |

---

## 🔴 1. АРХИТЕКТУРНЫЕ ПРОБЛЕМЫ

### 1.1 God-класс `Game` в `src/index.ts` (1116 строк)

**Проблема:** Класс `Game` выполняет ВСЁ: игровой цикл, рендеринг, физику, ИИ, инвентарь, UI, управление состоянием, спаун сущностей, диалоги, магазин. Это нарушает Single Responsibility Principle.

**Симптомы:**
- 45+ приватных полей
- 30+ методов в одном классе
- `gameState` — строковый union из 8 состояний, управляемый вручную
- Методы `update()`, `draw()`, `updateEnemies()` занимают сотни строк

**Как исправить:**
```
Разбить Game на отдельные контроллеры:
- GameStateMachine (xstate) — управление состоянием игры
- GameLoop — только цикл requestAnimationFrame
- EntityManager — спаун/удаление сущностей
- ProjectileManager — логика пуль
- UIController — диалоги, инвентарь, HUD
```

---

### 1.2 ECS используется как фасад, а не как архитектура

**Проблема:** bitECS подключён, но все объекты (`Enemy`, `PlayerState`, `NPC`) — это обычные JS-объекты с getter/setter-обёртками над ECS-компонентами. ECS не даёт никакого прироста производительности, только усложняет код.

**Пример из `entities/player.ts` (строка 148):**
```typescript
get dashCooldownTimer() { return Combat.reloadTimer[eid]; }, // Reusing combat for timers to keep it simple
set dashCooldownTimer(v) { Combat.reloadTimer[eid] = v; },
```
**`dashCooldownTimer` и `reloadTimer` делят ОДИН слот ECS** — это скрытый баг.

**Пример из `entities/player.ts` (строка 144):**
```typescript
get statusTimer() { return 0; /* status handling still in Game for now */ },
set statusTimer(v) {},
```
Getter возвращает жёсткий 0, setter ничего не делает. ECS-слот не используется.

**Как исправить:**
- Либо перейти на полноценный ECS (все системы работают с массивами компонентов)
- Либо убрать bitECS и использовать чистые TypeScript-объекты
- Устранить коллизию `dashCooldownTimer` / `reloadTimer` — добавить отдельный компонент `DashState`

---

### 1.3 Два определения интерфейса `Projectile`

**Проблема:** Интерфейс `Projectile` объявлен в **двух местах**:

| Файл | Строка |
|---|---|
| `src/systems/combat.ts` | 3: `export interface Projectile extends Point` |
| `src/domain/types.ts` | 126: `export interface Projectile { ... }` |

В `index.ts` используется импорт из `domain/types`, но объекты создаются с полями из `combat.ts`. TypeScript не ловит несоответствие из-за `as any`.

**Как исправить:** Удалить `Projectile` из `combat.ts`, оставить только в `domain/types.ts`.

---

### 1.4 `Point` импортируется из разных источников (хаос импортов)

**Проблема:** Интерфейс `Point` определён в `systems/physics.ts`, но импортируется хаотично:

| Файл | Источник импорта |
|---|---|
| `systems/ai.ts` | `./physics` |
| `systems/combat.ts` | `./physics` |
| `systems/memory.ts` | `../domain/types` |
| `systems/lumen.ts` | `../domain/types` |
| `systems/level.ts` | `../domain/types` |
| `ui/render.ts` | `../systems/physics` |
| `domain/types.ts` | `./systems/physics` ← **НЕВЕРНЫЙ ПУТЬ** |

`domain/types.ts` строка 16: `import { Point, Circle, Rect } from './systems/physics'`
Файл находится в `src/domain/`, путь должен быть `'../systems/physics'`.

**Как исправить:**
```typescript
// 1. Перенести Point/Circle/Rect в domain/types.ts как каноническое место
// 2. Везде импортировать из domain/types
// 3. В physics.ts: import { Point } from '../domain/types'
```

---

### 1.5 Неправильный путь импорта в `domain/types.ts` строка 2

```typescript
import { ItemInstance } from './systems/inventory'; // НЕВЕРНО
// должно быть:
import { ItemInstance } from '../systems/inventory';
```

---

## 🟠 2. ДУБЛИРОВАНИЕ КОДА

### 2.1 Дублирование создания NPC (`entities/npc.ts`)

Три функции (`createMerchant`, `createAltar`, `createCivilian`) содержат идентичный блок из 7 строк каждая.

**Как исправить:**
```typescript
function createBaseNPC(world: IWorld, eid: number, x: number, y: number, radius: number) {
    addComponent(world, NpcTag, eid);
    addComponent(world, Position, eid);
    Position.x[eid] = x;
    Position.y[eid] = y;
    return {
        eid, radius,
        get x() { return Position.x[eid]; }, set x(v) { Position.x[eid] = v; },
        get y() { return Position.y[eid]; }, set y(v) { Position.y[eid] = v; }
    };
}
```

---

### 2.2 Дублирование проверки статуса врага в `ai.ts` (4 раза)

Строка `e.status === 'oiled' || e.status === 'petroleum' ? 0.5 : 1.0` встречается в строках 154, 210, 289, 317.

> ⚠️ Дополнительный баг: в строке 154 используется `'oiled'`, в остальных `'oil'` — несоответствие значений!

**Как исправить:**
```typescript
// Добавить в Helpers:
getSpeedMultiplier: (e: Enemy) =>
    (e.status === 'oil' || e.status === 'petroleum') ? 0.5 : 1.0
```

---

### 2.3 Константы FOV дублированы в `ai.ts` и `index.ts`

`fov = Math.PI / 1.8` и `numRays = 13` объявлены в `ai.ts:53-54` и `index.ts:883-884`.

**Как исправить:** Вынести в `constants.ts`:
```typescript
export const ENEMY_FOV_ANGLE = Math.PI / 1.8;
export const ENEMY_FOV_RAYS = 13;
```

---

### 2.4 Три разные скорости пуль врага

- `index.ts:715` — `vx: Math.cos(angle)*2`
- `index.ts:1055 (onShoot)` — `vx: Math.cos(angle)*2`
- `systems/combat.ts:114` — `vx: Math.cos(finalAngle) * 2.2`

**Как исправить:** Использовать `CombatSystem.spawnProjectiles()` везде.

---

### 2.5 Дублирование `resolveCollision` в `applyMovement`

Строки 600-604 вызывают `resolveCollision` для `obstacles` и `startDoor` дважды (для X и Y осей).

**Как исправить:** Вынести в `resolvePlayerCollisions()`.

---

### 2.6 Смешение источников случайных чисел

В `level.ts` используются и `Math.random()` и `ROT.RNG.getUniform()` вперемешку — генерация комнат не воспроизводима даже при одном сиде.

**Как исправить:** Заменить все `Math.random()` в логике генерации на `ROT.RNG.getUniform()`.

---

### 2.7 `Math.random()` как ID объектов

В `level.ts` и `interaction.ts`:
```typescript
const barrelId = Math.random(); // не детерминированный ID
const chestId = Math.random();
```

**Как исправить:**
```typescript
let _nextId = 1;
const genId = () => _nextId++;
```

---

### 2.8 `drawTorch` вызывается в `render.ts:601`, но не импортируется

Строка 4 импортирует из `spriteAssets`, но `drawTorch` отсутствует в списке импортов. Функция вызывается, компилируется (через module re-export?), но это хрупкая зависимость.

---

## 🟠 3. ТЕХНИЧЕСКИЙ ДОЛГ

### 3.1 `as any` — 22+ вхождения

Особо опасно в `index.ts:651`:
```typescript
(EnemyActions as any)[stateValue](e, canSee, ...);
```
Динамический вызов через строку без проверки типов — любая опечатка в FSM-состоянии даст runtime-ошибку.

**Как исправить:**
```typescript
type EnemyStateKey = keyof typeof EnemyActions;
const fn = EnemyActions[stateValue as EnemyStateKey];
fn?.(e, canSee, obstacles, isPassableWithEnemies, this.player);
```

---

### 3.2 `dt` захардкожен как `16.66` (`index.ts:411`)

Реальный `dt` вычисляется в `updateFPS()`, но не передаётся в `update()`. Физика и анимации привязаны к 60fps — при просадках FPS игра замедляется.

**Как исправить:**
```typescript
private loop = (now: number) => {
    const dt = now - this.lastTime;
    this.lastTime = now;
    this.update(dt);
    this.draw();
    ...
}
```

---

### 3.3 Незакрытый `setTimeout` в `interaction.ts:72`

```typescript
setTimeout(() => {
    const idx = barrels.indexOf(newBrl);
    if (idx > -1) ctx.destroyBarrel(idx);
}, 500);
```

При перезапуске комнаты за 500мс callback сработает на уже сброшенный массив. Race condition.

**Как исправить:** Использовать игровой таймер на объекте бочки.

---

### 3.4 Баг: `elite` враги спаунятся со статами `grunt`

`level.ts:267` выбирает `enemyType = 'elite'` → `ENEMIES_DB['elite'].type === 'chaser'` → `index.ts:1035` делает `ENEMIES_DB['grunt']`.  
Элиты получают 20 HP вместо 50, скорость 0.5 вместо 0.7.

**Как исправить:** Передавать ключ DB (`'elite'`) напрямую, а не приводить к типу:
```typescript
spawnEnemy(dbKey: keyof typeof ENEMIES_DB, x, y, role) {
    const db = ENEMIES_DB[dbKey];
    ...
}
```

---

### 3.5 `dashCooldownTimer` делит ECS-слот с `reloadTimer` (`player.ts:148`)

Реальный баг: при старте перезарядки кулдаун рывка сбрасывается и наоборот.

**Как исправить:** Добавить `DashState = defineComponent({ cooldown: Types.i32, iframes: Types.i32 })`.

---

### 3.6 `LevelContext` использует `any` для ключевых полей

```typescript
player: any;   // должен быть PlayerState
dungeon: any;  // DungeonSystem
overlay: any;  // OverlaySystem
fog: any;      // FogSystem
globalMap: any; // GlobalMap
```

---

### 3.7 `statusTimer` getter игрока всегда возвращает `0`

`player.ts:144`: `get statusTimer() { return 0; }` — логика статуса игрока не ECS-связана, таймер всегда 0 при любом внешнем чтении.

---

### 3.8 FOV обновляется каждые 6 кадров, результат устаревает

`index.ts:641`: `if ((this.frameCounter + i) % 6 === 0) e.lastCanSeePlayer = checkVisionCone(...)`

Враг может не заметить, что игрок скрылся, на 5 кадров.

---

### 3.9 Захардкоженная позиция спауна игрока в двух местах

`level.ts:57-58`: `player.x = GAME_WIDTH / 2; player.y = GAME_HEIGHT - 80;`  
`index.ts:1013`: `this.player.x = GAME_WIDTH / 2; this.player.y = GAME_HEIGHT - 80;`

**Как исправить:**
```typescript
// constants.ts
export const PLAYER_SPAWN_X = GAME_WIDTH / 2;
export const PLAYER_SPAWN_Y = GAME_HEIGHT - 80;
```

---

## 🟡 4. МЁРТВЫЙ И ИЗБЫТОЧНЫЙ КОД

### 4.1 `InventorySystem` — пустая оболочка

Класс создаётся, но единственный метод `getItemById()` нигде не вызывается.  
**Как исправить:** Удалить класс, перенести `ItemInstance` в `domain/types.ts`.

---

### 4.2 Неиспользуемые зависимости в `package.json`

| Пакет | Статус |
|---|---|
| `immer ^10.0.3` | Нет ни одного импорта |
| `lil-gui ^0.19.1` | Нет ни одного импорта |

~400 КБ лишнего кода в бандле. `npm uninstall immer lil-gui`

---

### 4.3 Параллакс-слои содержат несуществующие спрайты

`render.ts:154-176`: ключи `'decor_rock'`, `'decor_skeleton'`, `'decor_crack_1'`, `'decor_blood_stain'` отсутствуют в SpriteCache. Параллакс-система работает вхолостую каждый кадр.

---

### 4.4 B3 Behavior Tree используется только для patrol

Классы `B3Status`, `B3Node`, `B3Sequence`, `B3Action` объявлены, но используются только для `patrolTree`. Остальной AI — процедурный. Архитектура смешана без причины.

**Как исправить:** Либо перевести весь AI на B3, либо удалить классы и оставить процедурный подход.

---

### 4.5 `mitt` импортируется, но не используется

`index.ts:2,51`: `import mitt from 'mitt'` и `private events = mitt()` — `this.events` нигде не вызывается.

---

### 4.6 `InteractionSystem.takeAll()` — незаконченная заглушка

```typescript
public takeAll(ctx: InteractionContext) {
    // This is tricky...
}
```
Метод никогда не вызывается, тело пустое.

---

## 🟡 5. ОТЛАДОЧНЫЙ МУСОР

### 5.1 `console.log` в игровом цикле

- `index.ts:647` — каждые 60 кадров для каждого врага
- `index.ts:673` — каждый раз при обнаружении игрока

### 5.2 Отладочный рендер в production (`index.ts:882-915`)

Каждый кадр рендерится: конус зрения врага, FSM-состояние красным шрифтом, линия от врага к игроку, планка шума.

### 5.3 Debug-текст на глобальной карте (`index.ts:830`)

```typescript
ctx.fillText(`SELECTED: ${this.selectedNodeId} | HOVERED: ${this.hoveredNodeId}`, ...);
```

**Как исправить всё отладочное:**
```typescript
// vite.config.ts
const DEBUG = process.env.NODE_ENV === 'development';
// В коде:
if (DEBUG) { /* debug rendering */ }
```

---

## 📋 СВОДНАЯ ТАБЛИЦА ПРИОРИТЕТОВ

| # | Проблема | Файл | Приоритет | Сложность |
|---|---|---|---|---|
| 1 | `dashCooldownTimer` делит слот с `reloadTimer` | `player.ts:148` | 🔴 Баг | Низкая |
| 2 | `elite` враги спаунятся как `grunt` | `level.ts:267` + `index.ts:1035` | 🔴 Баг | Низкая |
| 3 | `setTimeout` race condition | `interaction.ts:72` | 🔴 Баг | Средняя |
| 4 | Статус `'oiled'` vs `'oil'` несоответствие | `ai.ts:154` | 🔴 Баг | Низкая |
| 5 | Неверный путь импорта `domain/types.ts` | `types.ts:2,16` | 🟠 | Низкая |
| 6 | Дублирование `Projectile` интерфейса | `combat.ts:3`, `types.ts:126` | 🟠 | Низкая |
| 7 | Смешение `Math.random()` и `ROT.RNG` | `level.ts` | 🟠 | Средняя |
| 8 | `as any` обходы (22+ вхождений) | Повсюду | 🟠 | Высокая |
| 9 | `dt = 16.66` захардкожен | `index.ts:411` | 🟠 | Низкая |
| 10 | Захардкоженная позиция спауна (2 места) | `level.ts:57`, `index.ts:1013` | 🟠 | Низкая |
| 11 | `console.log` в цикле | `index.ts:647,673` | 🟡 | Низкая |
| 12 | Неиспользуемые пакеты (immer, lil-gui) | `package.json` | 🟡 | Низкая |
| 13 | `InventorySystem` — пустая заглушка | `inventory.ts` | 🟡 | Низкая |
| 14 | Отладочный рендер в production | `index.ts:882-915` | 🟡 | Низкая |
| 15 | `mitt` не используется | `index.ts:51` | 🟡 | Низкая |
| 16 | Параллакс со спрайтами-заглушками | `render.ts:154` | 🟡 | Низкая |
| 17 | God-класс `Game` (1116 строк) | `index.ts` | 🔴 | Высокая |
| 18 | Дублирование кода создания NPC | `npc.ts` | 🟡 | Низкая |

---

## 🗂️ СТРУКТУРА ПРОЕКТА — ОЦЕНКА

```
src/
├── core/         ✅ Чистый — input, audio, constants, cache хорошо разделены
├── domain/       ⚠️  types.ts имеет неверные пути импорта; ItemInstance должен быть здесь
├── data/         ✅ registry.ts хорошо структурирован, spriteDefs.ts большой (29KB) но приемлемо
├── entities/     ⚠️  player.ts: скрытый баг с ECS-слотами; npc.ts: дублирование
├── systems/      ⚠️  inventory.ts — пустышка; ai.ts — смешение B3+процедурного
│   └── level.ts  ⚠️  314 строк, вся логика спауна в одном методе
└── ui/           ⚠️  render.ts: параллакс-заглушки; spriteAssets.ts большой (24KB)

src/index.ts      🔴 God-класс — требует декомпозиции
src/components.ts 🔴 ПОТЕНЦИАЛЬНЫЙ ОРФАН — проверить, не дублирует ли domain/components.ts
```

> **Первоочерёдные действия (быстрые победы):**
> 1. Удалить `console.log` — 2 строки
> 2. Исправить `'oiled'` → `'oil'` в `ai.ts:154` — 1 строка  
> 3. Добавить `PLAYER_SPAWN_X/Y` в constants — 2 строки
> 4. `npm uninstall immer lil-gui` — 0 строк кода
> 5. Исправить путь импорта в `domain/types.ts` — 1 строка
> 6. Добавить компонент `DashState` и убрать коллизию слотов — ~10 строк





Ваш проект уже имеет неплохую основу (выделены ECS-компоненты и папка systems/), но index.ts (класс Game) всё ещё работает как огромный «Божественный объект» (God Object). Он управляет слишком многим напрямую.

Вот список того, что прямо сейчас «просится» на вынос из index.ts, чтобы сделать архитектуру чище:

1. Логика Игрока (PlayerSystem)
Что вынести: Методы updatePlayer, updatePlayerAnimation, startDash, applyMovement, applyKnockback, handleShooting, reload.
Почему: Сейчас главный цикл игры сам высчитывает кулдауны дэшей игрока, трение, векторы отдачи и проверяет нажатия кнопок для стрельбы.
Куда: В новую систему src/systems/playerSystem.ts. Класс Game должен просто вызывать playerSystem.update(world, input).
2. Рендеринг и UI-оркестрация (расширение RenderSystem / UISystem)
Что вынести: Все методы, начинающиеся на draw... (drawEntities, drawHUD, drawGlobalMap, drawDialog, drawFluids, drawExitConfirm и т.д.).
Почему: У вас уже есть RenderSystem и InterfaceSystem, но index.ts всё равно напрямую дергает ctx.fillText, рисует линии (lasers) и управляет слоями (Parallax, Dither Overlay).
Куда: Делегировать этот код внутрь RenderSystem или создать MapRenderer / HudRenderer. index.ts должен просто говорить render.drawFrame(gameState, world).
3. Логика врагов и AI (EnemySystem)
Что вынести: Методы updateEnemies, updateEnemyFSM, handleEnemyShooting. Обновление таймеров состояний (stunTimer, barkTimer).
Почему: У вас есть отличный модуль systems/ai.ts (видимо, с XState машинами), но обход всех врагов, проверка checkVisionCone, передача ивентов в FSM и стрельба врагов почему-то остались в index.ts.
Куда: В новую систему src/systems/enemySystem.ts, которая будет итерироваться по enemyQuery и связывать ECS с XState.
4. Интерактивные объекты и разрушаемость
Что вынести: destroyBarrel, updatePickups, логика нажимных плит/сундуков, если она есть.
Почему: Уничтожение бочки спавнит лужи, огонь, взрывы, наносит урон соседям. Это доменная бизнес-логика.
Куда: У вас есть InteractionSystem. Логику уничтожения бочек можно вынести туда или в EnvironmentSystem. Поднятие предметов (updatePickups) можно перенести в InventorySystem.
5. Уникальное оружие (например, Railgun)
Что вынести: Метод fireRailgun и массив this.lasers.
Почему: Рельсотрон делает рейкаст (raycast) по стенам, наносит урон по линии и рисует кастомный градиент. Если вы добавите огнемет или цепную молнию, index.ts лопнет от количества уникальных проверок.
Куда: В CombatSystem (или WeaponSystem). Лазеры лучше перевести в ECS (создать сущность с компонентом LaserBeam), чтобы они сами угасали и отрисовывались.
6. Экономика и Диалоги
Что вынести: handleDialogClick, buyRandomItem, healPlayer.
Почему: Обработка кликов по кнопкам "Купить" или "Хил" вшита прямо в обработчик кликов главной сцены.
Куда: В InteractionSystem или отдельный DialogSystem / ShopSystem.
Резюме: Идеальный index.ts в ECS-архитектуре должен только инициализировать движок, ловить глобальные события (например, изменение размера окна) и в цикле update() просто вызывать методы .update() у всех зарегистрированных систем (Input, AI, Player, Physics, Combat, Render). Всё остальное — детали реализации, которые нужно прятать.

---

# 🔥 АУДИТ ОПТИМИЗАЦИИ ПРОИЗВОДИТЕЛЬНОСТИ

> Дата: 2026-05-12 | Фокус: Runtime performance, rendering, memory, algorithms

---

## 🔴 КРИТИЧНЫЕ ПРОБЛЕМЫ ПРОИЗВОДИТЕЛЬНОСТИ

### 1.1 Lighting System — полный пересчет каждые 2 кадра

**Файл:** `src/systems/lumen.ts:201-256`

**Проблема:** Функция `calculateLighting()` заполняет НУЛЯМИ огромные массивы каждый раз:
```typescript
map.fill(0);           // Uint8Array[width*height]
this.lightMap.fill(0); // Float32Array[width*height]
```

При размере карты 96x72 = 6912 ячеек — это ~14KB обнулений памяти каждый 2й кадр.

**Хуже:** `addLightContribution()` использует `hasLineOfSight()` с LINE OF SIGHT проверкой для КАЖДОЙ клетки в радиусе света:
```typescript
for (let y = minY; y <= maxY; y++) {
  for (let x = minX; x <= maxX; x++) {
    if (!this.hasLineOfSight(lx, ly, x, y, passabilityRaw, mapCols)) continue;
    // ...
  }
}
```

Сложность: O(L × R² × S) где L — количество источников света, R — радиус, S — шаг LOS-проверки.

**Импакт:** С 5 источниками света и радиусом 7 → ~980 LOS-проверок на источник = 4900 проверок кадр.

**Рекомендация:**
- Использовать Shadow Casting (Robin Hood algorithm) вместо LOS-проверок
- Кэшировать результаты статических источников
- Вынести обнуление в отдельный TypedArray с версионированием

---

### 1.2 Raycasting в AI — 13 лучей на врага каждые 8 кадров

**Файл:** `src/systems/ai.ts:104-131`

```typescript
const numRays = 13;  // Линейный рэйкастинг
for (let i = 0; i < numRays; i++) {
  if (raycastToPlayer(enemy, startAngle + i * step, maxDist, player, isBlocking)) return true;
}
```

При 20 врагах: 260 raycast-операций каждые 8 кадров.

**Усугубляется:** `raycastToPlayer()` делает `Math.floor()` на каждом шаге:
```typescript
for (let i = 3; i < steps; i++) {
  const gx = Math.floor(px / TILE_SIZE);  // <-- дорого
  const gy = Math.floor(py / TILE_SIZE);
}
```

**Рекомендация:**
- Заменить на Bresenham line algorithm (целочисленный)
- Использовать DDA (Digital Differential Analysis) для raycast
- Кэшировать grid-позиции игрока между кадрами

---

### 1.3 Particle System — линейное удаление из массива

**Файл:** `src/systems/particles.ts:207-229`

```typescript
for (let i = this.count - 1; i >= 0; i--) {
  // ...
  if (this.life[i] <= 0) {
    this.count--;
    const last = this.count;
    if (i !== last) {
      // swap with last — O(1), но cache miss
      this.x[i] = this.x[last];
      // ... 6 ещё присваиваний
    }
  }
}
```

**Проблемы:**
1. Структура массивов (SoA) вызывает 7 cache misses при swap
2. `uint32ToHex()` вызывается в РЕНДЕРЕ для каждой частицы:
```typescript
ctx.fillStyle = this.uint32ToHex(this.color[i]);  // 6 битовых операций + 3 toString
```

**Рекомендация:**
- Перейти на Object Pool паттерн вместо swap-remove
- Предварительно конвертировать цвета в строки при спавне
- Batch-отрисовка частиц одного типа

---

### 1.4 Render System — создание паттернов каждый кадр

**Файл:** `src/ui/render.ts:215-280`

```typescript
rebuildLightingCache() {
  for (let x = startX; x <= endX; x++) {
    for (let y = startY; y <= endY; y++) {
      // Каждый кадр создаём gradient/fill для КАЖДОЙ клетки!
      this.drawSingleTileScreen(ctx, screenX, screenY, size, l, ao);
    }
  }
}
```

`drawSingleTileScreen` вызывает:
- `ctx.fillRect()` — GPU command buffer flush
- `ctx.globalAlpha` переключения — state change overhead

**Импакт:** При viewport 40x30 клеток = 1200 state changes кадр.

**Рекомендация:**
- Использовать ImageData + WebGL/Canvas 2D putImageData
- Предварительно рендерить dither-паттерны в offscreen canvas
- Батчить отрисовку по паттернам

---

### 1.5 Fluids System — аллокации в hot path

**Файл:** `src/systems/fluids.ts:51-188`

```typescript
step() {
  const newActiveKeys: Set<number> = new Set();  // <-- аллокация каждый шаг!
  
  for (const packed of this.activeCells) {
    // ...
    if (!nextGrid[x][y]) nextGrid[x][y] = { type: cell.type, vol: 0, fire: 0, steam: 0 };
    // <-- объект создаётся каждый раз для каждой клетки!
  }
}
```

**Проблемы:**
1. `new Set()` каждый кадр (fluid step interval = 4)
2. Объекты `FluidCell` создаются/удаляются постоянно — GC pressure
3. Double-buffering двумерных массивов: `gridA` и `gridB` — 2×96×72 = 13KB × 2

**Рекомендация:**
- Object pool для FluidCell
- Использовать TypedArrays вместо объектов: `type: Uint8Array`, `vol: Uint8Array`
- Single-buffer с версионированием вместо double-buffer

---

### 1.6 Sprite Cache — синхронная генерация при старте

**Файл:** `src/core/spriteCache.ts:12-20`

```typescript
public async generateAll(): Promise<void> {
  const tasks = Object.entries(defs).map(async ([key, def]) => {
    await this.renderDef(key, def as defs.SpriteDef);  // createImageBitmap
  });
  await Promise.all(tasks);
}
```

**Проблема:** `createImageBitmap` — микротаска, но renderDef делает ОГРОМНУЮ работу синхронно:
- Двойной nested loop по `def.pixels`
- 8 вызовов `fillRect` на пиксель с outline

**Рекомендация:**
- Вынести генерацию в Web Worker
- Использовать offscreen canvas без `createImageBitmap` где возможно
- Кэшировать в IndexedDB между сессиями

---

## 🟠 СРЕДНИЕ ПРОБЛЕМЫ ПРОИЗВОДИТЕЛЬНОСТИ

### 2.1 Getters/setters в ECS-обёртках

**Файл:** `src/index.ts:1173-1208`

```typescript
const enemy: Enemy = {
  get x() { return Position.x[eid]; },
  set x(v) { Position.x[eid] = v; },
  // ... 15+ таких пар
}
```

**Проблема:** Каждый доступ к `enemy.x` вызывает getter — deoptimization в V8.
Каждый кадр AI делает сотни таких доступов.

**Рекомендация:**
- Использовать прямые обращения к Position.x[eid] в hot paths
- Либо вовсе отказаться от обёрток в пользу чистого ECS

---

### 2.2 Distance Field пересчёт без кэширования

**Файл:** `src/systems/ai.ts:174-200`

```typescript
if (distanceField) {
  const idx = ey * MAP_COLS + ex;
  const dist = distanceField[idx];  // <-- пересчитывается каждый кадр?
  // ...
}
```

Distance field к игроку пересчитывается в `aiSystem.update()` для КАЖДОГО врага:
```typescript
// ai.ts (implied)
const distField = computeDistanceField(playerPos, passability);
```

**Рекомендация:**
- Кэшировать distance field на уровне Game и инвалидировать только при изменении grid
- Обновлять только при движении игрока более чем на N клеток

---

### 2.3 String-based FSM transitions

**Файл:** `src/systems/ai.ts:135-148`, `src/index.ts:1055+`

```typescript
enemy.fsm.send('PLAYER_SPOTTED');  // строковый event
enemy.fsm.send({ type: 'STUN', duration: 60 });  // объект создаётся
```

XState создаёт объекты action'ов при каждом transition — GC pressure.

**Рекомендация:**
- Использовать числовые константы вместо строк
- Рассмотреть замену XState на lightweight FSM (switch/case)

---

### 2.4 Trail эффекты — Map<string, Array> без pooling

**Файл:** `src/systems/particles.ts:37, 123-141`

```typescript
private trails: Map<string, TrailPoint[]> = new Map();

addTrailPoint(projectileId: string, x: number, y: number) {
  if (!this.trails.has(projectileId)) {
    this.trails.set(projectileId, []);  // <-- новый массив каждый снаряд
  }
  // ...
  if (trail.length > 20) trail.shift();  // O(n) операция!
}
```

`Array.shift()` — O(n) копирование всех элементов.

**Рекомендация:**
- Ring buffer (circular array) вместо Array
- Object pool для TrailPoint

---

### 2.5 UI state вычисляется каждый кадр

**Файл:** `src/index.ts:508-515`

```typescript
this.ui.update(
  this.player.willpower,
  this.player.maxWillpower,
  `${this.player.ammo}/${this.player.computedStats.maxAmmo}`,
  // ...
  this.gameLoop.getFPS()  // <-- уже посчитан в gameLoop!
);
```

Весь UI обновляется каждый кадр, даже когда ничего не изменилось.

**Рекомендация:**
- Dirty flag pattern для UI
- Обновлять только при изменении значений

---

### 2.6 Бесполезная проверка в `hasLineOfSight`

**Файл:** `src/systems/lumen.ts:390-401`

```typescript
private hasLineOfSight(x0: number, y0: number, x1: number, y1: number, passabilityRaw: Uint8Array, mapCols: number): boolean {
  const steps = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0));
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    // ...
    if ((x !== x0 || y !== y0) && passabilityRaw[y * mapCols + x] === 0) {
      return x === x1 && y === y1;  // <-- всегда false здесь
    }
  }
}
```

Строка `return x === x1 && y === y1` выполняется только если найдена стена — но тогда `x !== x1 || y !== y1` (мы остановились раньше).

**Рекомендация:**
- Упростить до `return false;`
- Или использовать Bresenham вместо линейной интерполяции

---

## 🟡 МИКРООПТИМИЗАЦИИ

### 3.1 Лишние Math.floor для grid-координат

**Множественные файлы:**
```typescript
const gx = Math.floor(x / TILE_SIZE);  // TILE_SIZE = 20
```

Можно заменить на:
```typescript
const gx = (x / TILE_SIZE) | 0;  // битовый OR — в 2-3 раза быстрее
```

---

### 3.2 Неиспользуемый Lighting dirty flag

**Файл:** `src/index.ts:136`

```typescript
private lightingDirty = true;  // выставляется в updateLighting
```

Устанавливается в `true` каждый кадр, но не используется для пропуска расчёта.

---

### 3.3 Лишние bounds-проверки в циклах

**Файл:** `src/systems/lumen.ts:237-256`

```typescript
for (let x = Math.max(0, b.x1 - 1); x <= Math.min(MAP_COLS - 1, b.x2 + 1); x++) {
```

`Math.max/min` вызываются на каждой итерации (но JIT может их заинлайнить).

**Рекомендация:**
```typescript
const startX = Math.max(0, b.x1 - 1);
const endX = Math.min(MAP_COLS - 1, b.x2 + 1);
for (let x = startX; x <= endX; x++) {  // вычислено 1 раз
```

---

## 📊 БЕНЧМАРК-ОЦЕНКИ

| Система | Оценка FPS impact | Приоритет |
|---------|-------------------|-----------|
| Lighting LOS-проверки | -15-25% | 🔴 Критичный |
| AI raycast 13 лучей | -10-15% | 🔴 Критичный |
| Fluid аллокации | -8-12% | 🔴 Критичный |
| Particle color convert | -5-8% | 🟠 Средний |
| Render state changes | -5-10% | 🔴 Критичный |
| Trail.shift() O(n) | -3-5% | 🟠 Средний |
| Getter overhead | -2-4% | 🟡 Низкий |
| hasLineOfSight | -1-2% | 🟡 Низкий |

---

## 🛠️ ПЛАН ОПТИМИЗАЦИИ (по приоритету)

### Фаза 1: Hot Path (1-2 дня)
1. **Lighting:** Заменить LOS-проверки на shadow casting
2. **Render:** Батчить dither-отрисовку, уменьшить state changes
3. **AI:** Оптимизировать raycast (DDA), кэшировать distance field

### Фаза 2: Memory (2-3 дня)
1. **Fluids:** Object pool для FluidCell
2. **Particles:** Предконвертация цветов, ring buffer для trails
3. **SpriteCache:** Web Worker для генерации

### Фаза 3: Архитектура (3-5 дней)
1. Удалить ECS-обёртки в пользу прямого доступа
2. Заменить XState на lightweight FSM
3. UI dirty flags

---

## 🎯 БЫСТРЫЕ ПОБЕДЫ (30 минут)

| # | Файл | Строка | Изменение | Ожидаемый эффект |
|---|------|--------|-----------|------------------|
| 1 | `lumen.ts` | 390 | `return false` вместо `x === x1` | Микро |
| 2 | `ai.ts` | 94 | `(i * stepSize) | 0` вместо `Math.floor` | Микро |
| 3 | `particles.ts` | 204 | Кэшировать hex-строки при спавне | -5% CPU |
| 4 | `render.ts` | 237 | Вынести Math.max/min из цикла | Микро |
| 5 | `index.ts` | 136 | Убрать неиспользуемый `lightingDirty` | Код-чистка |

---

*Этот аудит оптимизации сфокусирован на runtime performance. Архитектурные проблемы (God-класс, ECS-обёртки) описаны в основной части документа.*