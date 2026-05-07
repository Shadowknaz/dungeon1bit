import { TILE_SIZE } from '../core/constants';

/**
 * Модуль с примитивами для отрисовки игровых объектов через Canvas API
 * Заменяет битовые спрайты на процедурную графику
 */

export interface DrawContext {
    ctx: CanvasRenderingContext2D;
    sCtx: CanvasRenderingContext2D;
}

/**
 * Отрисовка игрока (human) - детальный спрайт рыцаря
 */
export function drawHuman(ctx: CanvasRenderingContext2D, x: number, y: number, angle: number, isDashing: boolean, godMode: boolean, gameState: string, t: number = 0) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle + Math.PI / 2);

    // Масштаб под 1 клетку (TILE_SIZE = 20)
    const scale = 0.35;
    ctx.scale(scale, scale);

    if (godMode && gameState === 'PLAYING') {
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 1;
        ctx.setLineDash([2, 4]);
        ctx.beginPath();
        ctx.arc(0, 0, 16 + Math.sin(Date.now() * 0.005) * 2, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);
    }

    if (isDashing) {
        ctx.strokeStyle = Math.floor(Date.now() / 50) % 2 === 0 ? '#fff' : '#444';
        ctx.lineWidth = 2;
        ctx.setLineDash([4, 4]);
        ctx.beginPath();
        ctx.arc(0, 0, 8, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);
    } else {
        const idleSway = Math.sin(t * 2) * 1.5;
        ctx.lineWidth = 1.5;
        ctx.strokeStyle = '#fff';

        // 1. НОГИ (вид сверху, немного выходят за пределы торса)
        const legOffset = Math.sin(t * 4) * 3; // Анимация переступания
        ctx.fillStyle = '#000';

        // Левая нога
        ctx.beginPath();
        ctx.roundRect ? ctx.roundRect(-14, -5 + legOffset, 8, 12, 2) : ctx.rect(-14, -5 + legOffset, 8, 12);
        ctx.fill(); ctx.stroke();

        // Правая нога
        ctx.beginPath();
        ctx.roundRect ? ctx.roundRect(6, -5 - legOffset, 8, 12, 2) : ctx.rect(6, -5 - legOffset, 8, 12);
        ctx.fill(); ctx.stroke();

        // 2. Наплечники и торс
        const bodyGrad = ctx.createLinearGradient(-25, 0, 25, 0);
        bodyGrad.addColorStop(0, '#0a0a0a');
        bodyGrad.addColorStop(0.2, '#333');
        bodyGrad.addColorStop(0.5, '#444');
        bodyGrad.addColorStop(0.8, '#333');
        bodyGrad.addColorStop(1, '#0a0a0a');

        ctx.fillStyle = bodyGrad;
        ctx.beginPath();
        ctx.moveTo(-25, 0);
        ctx.quadraticCurveTo(-20, -15, 0, -15);
        ctx.quadraticCurveTo(20, -15, 25, 0);
        ctx.quadraticCurveTo(20, 15, 0, 15);
        ctx.quadraticCurveTo(-20, 15, -25, 0);
        ctx.fill();
        ctx.stroke();

        // 3. Руки / Перчатки
        ctx.strokeStyle = '#fff';
        ctx.fillStyle = '#000';
        const handSway = Math.sin(t * 2) * 2;
        ctx.beginPath(); ctx.arc(-28, 5 + handSway, 6, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
        ctx.beginPath(); ctx.arc(28, 5 - handSway, 6, 0, Math.PI * 2); ctx.fill(); ctx.stroke();

        // 4. Шлем
        const headY = -2 + idleSway;
        const headGrad = ctx.createRadialGradient(-3, headY - 4, 1, 0, headY, 15);
        headGrad.addColorStop(0, '#999');
        headGrad.addColorStop(0.4, '#333');
        headGrad.addColorStop(1, '#050505');

        ctx.fillStyle = headGrad;
        ctx.beginPath();
        ctx.arc(0, headY, 14, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();

        // Визор
        ctx.fillStyle = '#fff';
        ctx.beginPath();
        ctx.roundRect ? ctx.roundRect(-8, headY - 2, 16, 3, 1) : ctx.rect(-8, headY - 2, 16, 3);
        ctx.fill();
    }

    ctx.restore();
}

/**
 * Отрисовка слизня (chaser) - simple slime с двумя состояниями
 * active = false: обычные глаза, active = true: злые глаза (нашел игрока)
 */
export function drawSlime(ctx: CanvasRenderingContext2D, x: number, y: number, t: number, active: boolean = false) {
    ctx.save();
    ctx.translate(x, y);

    // Анимация прыжка через синус (замедлена на 90%: было t*3, стало t*0.3)
    const jumpCycle = Math.sin(t * 0.3);
    const yOffset = jumpCycle > 0 ? -jumpCycle * 8 : 0;
    let stretchX = jumpCycle > 0 ? 0.8 : 1 + Math.abs(jumpCycle) * 0.2;
    let stretchY = jumpCycle > 0 ? 1.2 : 1 - Math.abs(jumpCycle) * 0.2;

    ctx.translate(0, yOffset);
    ctx.scale(stretchX, stretchY);

    // Масштаб под 1 клетку (оригинал 30 -> 9)
    const scale = 0.3;

    // Тело с градиентом
    const bodyGrad = ctx.createLinearGradient(0, -9 * scale, 0, 8 * scale);
    bodyGrad.addColorStop(0, '#aaa');
    bodyGrad.addColorStop(0.5, '#444');
    bodyGrad.addColorStop(1, '#111');
    ctx.fillStyle = bodyGrad;
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 1.5;

    // Тело (масштабировано под 1 клетку)
    ctx.beginPath();
    ctx.arc(0, 0, 9, Math.PI, 0);
    ctx.quadraticCurveTo(9, 8, 0, 8);
    ctx.quadraticCurveTo(-9, 8, -9, 0);
    ctx.fill();
    ctx.stroke();

    // Глаза
    ctx.fillStyle = '#fff';
    if (!active) {
        // Обычные круглые глаза
        ctx.beginPath();
        ctx.arc(-3, -2, 1.2, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.arc(3, -2, 1.2, 0, Math.PI * 2);
        ctx.fill();
    } else {
        // Злые треугольные глаза (нашел игрока)
        ctx.beginPath();
        ctx.moveTo(-4.5, -2.5); ctx.lineTo(-1.5, -1); ctx.lineTo(-3, 0.5); ctx.fill();
        ctx.beginPath();
        ctx.moveTo(4.5, -2.5); ctx.lineTo(1.5, -1); ctx.lineTo(3, 0.5); ctx.fill();
    }

    ctx.restore();
}

/**
 * Отрисовка шипастого слизня (shooter) - стрелок
 */
export function drawSpikySlime(ctx: CanvasRenderingContext2D, x: number, y: number, t: number) {
    ctx.save();
    ctx.translate(x, y);

    // Анимация прыжка через синус (замедлена)
    const jumpCycle = Math.sin(t * 0.6);
    const isRising = jumpCycle > 0;
    const yOffset = isRising ? -jumpCycle * 12 : 0;

    let stretchX = isRising ? 0.8 : 1 + Math.abs(jumpCycle) * 0.15;
    let stretchY = isRising ? 1.2 : 1 - Math.abs(jumpCycle) * 0.15;

    ctx.translate(0, yOffset);
    ctx.scale(stretchX, stretchY);

    // Шипы (масштаб под 1 клетку - примерно 1/3 от оригинала)
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 1.5;
    for (let i = -1; i <= 1; i++) {
        const ang = i * 0.6 - Math.PI / 2;
        ctx.beginPath();
        ctx.moveTo(Math.cos(ang) * 7, Math.sin(ang) * 7);
        ctx.lineTo(Math.cos(ang) * 12, Math.sin(ang) * 12);
        ctx.stroke();
    }

    // Тело с градиентом (масштаб под 1 клетку)
    const bodyGrad = ctx.createRadialGradient(-3, -3, 1, 0, 0, 15);
    bodyGrad.addColorStop(0, '#777');
    bodyGrad.addColorStop(0.3, '#333');
    bodyGrad.addColorStop(0.8, '#111');
    bodyGrad.addColorStop(1, '#000');

    ctx.fillStyle = bodyGrad;
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(0, 0, 10, Math.PI, 0);
    ctx.quadraticCurveTo(10, 8, 0, 8);
    ctx.quadraticCurveTo(-10, 8, -10, 0);
    ctx.fill();
    ctx.stroke();

    // Злые глаза (треугольники, масштабированы)
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.moveTo(-5, -2.5); ctx.lineTo(-1.5, -1); ctx.lineTo(-3, 0.5); ctx.fill();
    ctx.beginPath();
    ctx.moveTo(5, -2.5); ctx.lineTo(1.5, -1); ctx.lineTo(3, 0.5); ctx.fill();

    ctx.restore();
}

/**
 * Данные для генерации бочки
 */
const barrelData = {
    planks: [-20, -7, 7, 20],
    hoopRivets: [
        { x: -22, y: -15 }, { x: 22, y: -15 },
        { x: -23, y: 15 }, { x: 23, y: 15 }
    ]
};

/**
 * Отрисовка бочки - детализированная версия
 */
export function drawBarrel(ctx: CanvasRenderingContext2D, x: number, y: number) {
    ctx.save();
    ctx.translate(x, y);

    // Масштаб для 1 клетки (оригинал 70x100 -> ~18x26 для TILE_SIZE=20)
    const scale = 0.16;
    ctx.scale(scale, scale);

    const w = 70, h = 100, tilt = 10;
    ctx.lineWidth = 1.5; ctx.strokeStyle = '#fff';

    // Монохромный градиент дерева (серые тона)
    const woodGrad = ctx.createLinearGradient(-w / 2, 0, w / 2, 0);
    woodGrad.addColorStop(0, '#050505');
    woodGrad.addColorStop(0.3, '#222');
    woodGrad.addColorStop(0.5, '#444');
    woodGrad.addColorStop(0.7, '#222');
    woodGrad.addColorStop(1, '#050505');

    ctx.fillStyle = woodGrad;
    ctx.beginPath();
    ctx.moveTo(-w / 2, -h / 2 + tilt);
    ctx.quadraticCurveTo(-w / 2 - 10, 0, -w / 2, h / 2 - tilt);
    ctx.quadraticCurveTo(0, h / 2 + tilt, w / 2, h / 2 - tilt);
    ctx.quadraticCurveTo(w / 2 + 10, 0, w / 2, -h / 2 + tilt);
    ctx.quadraticCurveTo(0, -h / 2 + tilt, -w / 2, -h / 2 + tilt);
    ctx.fill(); ctx.stroke();

    const lidGrad = ctx.createRadialGradient(0, -h / 2 + tilt, 5, 0, -h / 2 + tilt, w / 2);
    lidGrad.addColorStop(0, '#333'); lidGrad.addColorStop(1, '#050505');
    ctx.fillStyle = lidGrad;
    ctx.beginPath(); ctx.ellipse(0, -h / 2 + tilt, w / 2, tilt, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();

    ctx.strokeStyle = 'rgba(255,255,255,0.15)';
    barrelData.planks.forEach(px => {
        ctx.beginPath(); ctx.moveTo(px, -h / 2 + tilt * 2); ctx.quadraticCurveTo(px * 1.3, 0, px, h / 2); ctx.stroke();
    });

    ctx.lineWidth = 5; ctx.strokeStyle = '#fff';
    const hoops = [-h / 4, h / 4];
    hoops.forEach(hy => {
        const curW = w / 2 + 5;
        ctx.beginPath(); ctx.ellipse(0, hy + tilt, curW, tilt, 0, 0, Math.PI); ctx.stroke();
    });

    ctx.lineWidth = 1; ctx.fillStyle = '#fff';
    barrelData.hoopRivets.forEach(r => {
        ctx.beginPath(); ctx.arc(r.x, r.y + tilt, 1.5, 0, Math.PI * 2); ctx.fill();
    });

    // Эффект шероховатости
    ctx.strokeStyle = 'rgba(255,255,255,0.05)';
    ctx.lineWidth = 0.5;
    for (let i = 0; i < 20; i++) {
        const rx = (Math.random() - 0.5) * w;
        const ry = (Math.random() - 0.5) * h;
        ctx.beginPath();
        ctx.moveTo(rx, ry);
        ctx.lineTo(rx + (Math.random() - 0.5) * 4, ry + (Math.random() - 0.5) * 4);
        ctx.stroke();
    }

    ctx.restore();
}

/**
 * Отрисовка сундука (Isaac style) - размер под 1 клетку
 */
export function drawChest(ctx: CanvasRenderingContext2D, x: number, y: number, t: number) {
    ctx.save();
    ctx.translate(x, y);

    // Размер под одну клетку (20x20)
    const w = 18, h = 14;
    ctx.lineWidth = 1.5;

    // Bounce анимация (замедлена на 90%: было t*3, стало t*0.3)
    const jump = Math.abs(Math.sin(t * 0.3)) * 3;
    ctx.translate(0, -jump);

    // Основное тело (нижняя часть)
    const bodyGrad = ctx.createLinearGradient(0, 0, 0, h);
    bodyGrad.addColorStop(0, '#2a2a2a');
    bodyGrad.addColorStop(1, '#050505');
    ctx.fillStyle = bodyGrad;
    ctx.strokeStyle = '#fff';
    ctx.fillRect(-w / 2, 0, w, h);
    ctx.strokeRect(-w / 2, 0, w, h);

    // Крышка (верхняя часть - фронтально)
    const lidH = h * 0.45;
    const lidGrad = ctx.createLinearGradient(0, -lidH, 0, 0);
    lidGrad.addColorStop(0, '#666');
    lidGrad.addColorStop(1, '#1a1a1a');
    ctx.fillStyle = lidGrad;
    ctx.fillRect(-w / 2, -lidH, w, lidH);
    ctx.strokeRect(-w / 2, -lidH, w, lidH);

    // Железные кованые полосы (Isaac Style - по бокам)
    const bandW = 3;
    const drawBand = (bx: number) => {
        const bandGrad = ctx.createLinearGradient(bx, 0, bx + bandW, 0);
        bandGrad.addColorStop(0, '#333');
        bandGrad.addColorStop(0.5, '#555');
        bandGrad.addColorStop(1, '#333');
        ctx.fillStyle = bandGrad;
        ctx.fillRect(bx, -lidH, bandW, h + lidH);
        ctx.strokeRect(bx, -lidH, bandW, h + lidH);

        // Заклепки на полосе (уменьшены)
        ctx.fillStyle = '#fff';
        const rivets = [-lidH + 2, -1, 4, 8, 11];
        rivets.forEach(ry => {
            ctx.beginPath();
            ctx.arc(bx + bandW / 2, ry, 0.5, 0, Math.PI * 2);
            ctx.fill();
        });
    };

    drawBand(-w / 2);       // Левая полоса
    drawBand(w / 2 - bandW); // Правая полоса

    // Горизонтальный разделитель (стык крышки)
    ctx.strokeStyle = '#fff';
    ctx.beginPath();
    ctx.moveTo(-w / 2, 0);
    ctx.lineTo(w / 2, 0);
    ctx.stroke();

    // Замок (по центру, уменьшен)
    ctx.save();
    ctx.translate(0, -1);
    // Пластина замка
    const lockGrad = ctx.createLinearGradient(0, -2, 0, 5);
    lockGrad.addColorStop(0, '#888');
    lockGrad.addColorStop(1, '#333');
    ctx.fillStyle = lockGrad;

    // roundRect polyfill для старых браузеров
    const drawRoundedRect = (x: number, y: number, w: number, h: number, r: number) => {
        ctx.beginPath();
        ctx.moveTo(x + r, y);
        ctx.lineTo(x + w - r, y);
        ctx.quadraticCurveTo(x + w, y, x + w, y + r);
        ctx.lineTo(x + w, y + h - r);
        ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
        ctx.lineTo(x + r, y + h);
        ctx.quadraticCurveTo(x, y + h, x, y + h - r);
        ctx.lineTo(x, y + r);
        ctx.quadraticCurveTo(x, y, x + r, y);
        ctx.closePath();
    };

    drawRoundedRect(-3, -2, 6, 7, 1);
    ctx.fill(); ctx.stroke();

    // Скважина
    ctx.fillStyle = '#000';
    ctx.beginPath();
    ctx.arc(0, 1, 1, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillRect(-0.5, 1, 1, 3);
    ctx.restore();

    ctx.restore();
}

// Хранилище состояний анимации шипов (для плавной интерполяции)
const spikeHeights: Map<string, number> = new Map();

// Хранилище состояний анимации нажимных плит
const plateScales: Map<string, number> = new Map();

/**
 * Отрисовка ловушки шипов (spike trap)
 */
export function drawSpikeTrap(ctx: CanvasRenderingContext2D, x: number, y: number, t: number, active: boolean) {
    ctx.save();
    ctx.translate(x, y);

    // Размер под 1 клетку (20x20), оригинал был 120
    const size = 18;
    ctx.lineWidth = 1.5;

    // 1. Отрисовка Плиты (Top-Down)
    const tileGrad = ctx.createLinearGradient(-size / 2, -size / 2, size / 2, size / 2);
    tileGrad.addColorStop(0, '#333');
    tileGrad.addColorStop(0.5, '#1a1a1a');
    tileGrad.addColorStop(1, '#050505');
    ctx.fillStyle = tileGrad;
    ctx.strokeStyle = '#fff';
    ctx.strokeRect(-size / 2, -size / 2, size, size);
    ctx.fillRect(-size / 2, -size / 2, size, size);

    // 2. Отрисовка отверстий и анимированных шипов
    // Сетка 3x3 шипов, позиции масштабированы под размер клетки
    const grid = [-4.5, 0, 4.5];
    const holeRadius = 1.2;
    const maxSpikeRadius = 2.5;

    grid.forEach(gx => {
        grid.forEach(gy => {
            // Отверстие
            ctx.fillStyle = '#000';
            ctx.beginPath();
            ctx.arc(gx, gy, holeRadius, 0, Math.PI * 2);
            ctx.fill();
            ctx.strokeStyle = '#333';
            ctx.lineWidth = 0.5;
            ctx.stroke();

            // Логика высоты шипа с плавной анимацией
            const targetR = active ? maxSpikeRadius : 0;
            const key = `${x}_${y}_${gx}_${gy}`;
            let currentR = spikeHeights.get(key) ?? 0;
            // Замедленная анимация (t * 0.6 вместо прямого доступа к времени)
            const animSpeed = active ? 0.15 : 0.08;
            currentR += (targetR - currentR) * animSpeed;
            spikeHeights.set(key, currentR);

            const r = currentR;
            if (r > 0.2) {
                // Радиальный градиент шипа (кончик светлее и смещен)
                const spikeGrad = ctx.createRadialGradient(gx - r / 3, gy - r / 3, 0, gx, gy, r);
                spikeGrad.addColorStop(0, '#fff');
                spikeGrad.addColorStop(0.4, '#bbb');
                spikeGrad.addColorStop(1, '#222');

                ctx.fillStyle = spikeGrad;
                ctx.beginPath();
                ctx.arc(gx, gy, r, 0, Math.PI * 2);
                ctx.fill();

                // Белый блик на самом кончике
                ctx.fillStyle = '#fff';
                ctx.beginPath();
                ctx.arc(gx - r / 3, gy - r / 3, r / 5, 0, Math.PI * 2);
                ctx.fill();

                // Контур шипа
                ctx.strokeStyle = '#fff';
                ctx.lineWidth = 0.5;
                ctx.beginPath();
                ctx.arc(gx, gy, r, 0, Math.PI * 2);
                ctx.stroke();
            }
        });
    });

    // 3. Детали плитки (минимальные трещины)
    ctx.strokeStyle = 'rgba(255,255,255,0.05)';
    ctx.lineWidth = 0.5;
    ctx.beginPath();
    ctx.moveTo(-size / 2, size / 4); ctx.lineTo(-size / 4, size / 2);
    ctx.moveTo(size / 2, -size / 3); ctx.lineTo(size / 3, -size / 2);
    ctx.stroke();

    ctx.restore();
}

/**
 * Отрисовка NPC (мирный житель)
 */
export function drawNPC(ctx: CanvasRenderingContext2D, x: number, y: number, t: number) {
    ctx.save();
    ctx.translate(x, y);

    // Масштаб под 1 клетку (оригинал ~50 -> 0.35)
    const scale = 0.35;
    ctx.scale(scale, scale);

    ctx.lineWidth = 1.5;
    ctx.strokeStyle = '#fff';

    // Анимация дыхания (без ходьбы)
    const breathing = Math.sin(t * 2) * 1.5;
    const handSway = Math.sin(t * 2) * 3;

    // 1. НОГИ с градиентом (без движения)
    const drawLeg = (lx: number, ly: number) => {
        const lGrad = ctx.createRadialGradient(lx + 4, ly + 5, 0, lx + 4, ly + 5, 8);
        lGrad.addColorStop(0, '#333');
        lGrad.addColorStop(1, '#000');
        ctx.fillStyle = lGrad;
        ctx.beginPath();
        ctx.roundRect ? ctx.roundRect(lx, ly, 8, 10, 2) : ctx.rect(lx, ly, 8, 10);
        ctx.fill();
        ctx.stroke();
    };
    drawLeg(-12, 8);
    drawLeg(4, 8);

    // 2. ТОРС с радиальным градиентом
    const torsoGrad = ctx.createRadialGradient(0, -2, 0, 0, 0, 25);
    torsoGrad.addColorStop(0, '#555');
    torsoGrad.addColorStop(0.6, '#222');
    torsoGrad.addColorStop(1, '#050505');
    ctx.fillStyle = torsoGrad;
    ctx.beginPath();
    ctx.ellipse(0, 0, 22 + breathing * 0.5, 12, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // 3. РУКИ с градиентом на кистях
    const drawHand = (hx: number, hy: number, isLeft: boolean) => {
        ctx.beginPath();
        ctx.moveTo(isLeft ? -22 : 22, 0);
        ctx.lineTo(hx, hy - 4);
        ctx.stroke();

        const hGrad = ctx.createRadialGradient(hx, hy, 0, hx, hy, 5);
        hGrad.addColorStop(0, '#666');
        hGrad.addColorStop(1, '#111');
        ctx.fillStyle = hGrad;
        ctx.beginPath(); ctx.arc(hx, hy, 4, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    };
    drawHand(-26, 12 + handSway, true);
    drawHand(26, 12 - handSway, false);

    // 4. ГОЛОВА / КАПЮШОН
    const headY = -2 + breathing;
    const hoodGrad = ctx.createRadialGradient(-2, headY - 3, 2, 0, headY, 12);
    hoodGrad.addColorStop(0, '#888');
    hoodGrad.addColorStop(0.4, '#333');
    hoodGrad.addColorStop(1, '#0a0a0a');
    ctx.fillStyle = hoodGrad;
    ctx.beginPath();
    ctx.arc(0, headY, 11, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Лицо
    ctx.fillStyle = '#000';
    ctx.beginPath(); ctx.arc(0, headY, 7, 0, Math.PI * 2); ctx.fill();

    // Глаза (мигание)
    if (Math.sin(t * 0.5) > -0.8) {
        ctx.fillStyle = '#fff';
        ctx.fillRect(-4, headY - 1, 2, 2);
        ctx.fillRect(2, headY - 1, 2, 2);
    }

    ctx.restore();
}

/**
 * Отрисовка нажимной плиты (pressure plate)
 */
export function drawPressurePlate(ctx: CanvasRenderingContext2D, x: number, y: number, active: boolean) {
    ctx.save();
    ctx.translate(x, y);

    // Размер под 1 клетку (оригинал 120 -> 18)
    const size = 18;
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = '#fff';

    // Базовая плита
    const tileGrad = ctx.createLinearGradient(-size / 2, -size / 2, size / 2, size / 2);
    tileGrad.addColorStop(0, '#222');
    tileGrad.addColorStop(1, '#050505');
    ctx.fillStyle = tileGrad;
    ctx.strokeRect(-size / 2, -size / 2, size, size);
    ctx.fillRect(-size / 2, -size / 2, size, size);

    // Анимация масштаба
    const key = `${x}_${y}`;
    const targetScale = active ? 0.85 : 0.95;
    let currentScale = plateScales.get(key) ?? 0.95;
    currentScale += (targetScale - currentScale) * 0.2;
    plateScales.set(key, currentScale);

    ctx.save();
    ctx.scale(currentScale, currentScale);

    // Внутренняя часть плиты с градиентом и свечением при активации
    const pG = ctx.createRadialGradient(0, 0, 0, 0, 0, size / 2);
    if (active) {
        pG.addColorStop(0, '#777');
        pG.addColorStop(1, '#222');
        ctx.shadowColor = '#fff';
        ctx.shadowBlur = 4; // Уменьшено для масштаба
    } else {
        pG.addColorStop(0, '#333');
        pG.addColorStop(1, '#111');
    }

    ctx.fillStyle = pG;
    const innerSize = size - 4; // Масштабировано с size-20
    ctx.fillRect(-innerSize / 2, -innerSize / 2, innerSize, innerSize);
    ctx.strokeRect(-innerSize / 2, -innerSize / 2, innerSize, innerSize);

    ctx.restore();
    ctx.restore();
}

/**
 * Отрисовка ямы (pit trap)
 */
export function drawPit(ctx: CanvasRenderingContext2D, x: number, y: number, t: number) {
    ctx.save();
    ctx.translate(x, y);

    // Размер под 1 клетку (оригинал 120 -> 18)
    const size = 18;
    ctx.lineWidth = 1.5;

    // Плита
    const tileGrad = ctx.createLinearGradient(-size / 2, -size / 2, size / 2, size / 2);
    tileGrad.addColorStop(0, '#333');
    tileGrad.addColorStop(0.5, '#1a1a1a');
    tileGrad.addColorStop(1, '#050505');
    ctx.fillStyle = tileGrad;
    ctx.strokeStyle = '#fff';
    ctx.strokeRect(-size / 2, -size / 2, size, size);
    ctx.fillRect(-size / 2, -size / 2, size, size);

    // Отверстие (неровное)
    const holeSize = 6.5; // 45 / 120 * 18 ≈ 6.75
    ctx.fillStyle = '#000';
    ctx.beginPath();
    for (let i = 0; i < 20; i++) {
        let ang = (Math.PI * 2 / 20) * i;
        let r = holeSize + Math.sin(i * 1.5) * 0.6; // масштабировано
        if (i === 0) ctx.moveTo(Math.cos(ang) * r, Math.sin(ang) * r);
        else ctx.lineTo(Math.cos(ang) * r, Math.sin(ang) * r);
    }
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = '#555';
    ctx.lineWidth = 1;
    ctx.stroke();

    ctx.save();
    ctx.clip();

    // Градиент глубины
    const pitGrad = ctx.createRadialGradient(0, 0, 0, 0, 0, holeSize + 1);
    pitGrad.addColorStop(0, '#000');
    pitGrad.addColorStop(0.6, '#080808');
    pitGrad.addColorStop(1, '#151515');
    ctx.fillStyle = pitGrad;
    ctx.fillRect(-holeSize - 2, -holeSize - 2, (holeSize + 2) * 2, (holeSize + 2) * 2);

    // Вращающиеся дуги (анимация, замедлена)
    ctx.strokeStyle = 'rgba(255,255,255,0.15)';
    ctx.lineWidth = 0.5;
    for (let i = 0; i < 3; i++) {
        ctx.beginPath();
        let rot = t * (0.1 + i * 0.05); // замедлена
        let r = (holeSize * 0.3) + i * 1.5;
        ctx.arc(0, 0, r, rot, rot + Math.PI * 0.5);
        ctx.stroke();
    }

    // Падающие частицы
    ctx.fillStyle = '#fff';
    for (let i = 0; i < 5; i++) {
        let px = Math.sin(t * 0.15 + i * 100) * (holeSize - 2);
        let py = ((t * 3 + i * 30) % (holeSize * 2)) - holeSize;
        ctx.globalAlpha = 0.1;
        ctx.fillRect(px, py, 0.5, 0.5);
        ctx.globalAlpha = 1.0;
    }

    ctx.restore();

    // Трещины на плите
    ctx.strokeStyle = 'rgba(255,255,255,0.08)';
    ctx.lineWidth = 0.5;
    ctx.beginPath();
    ctx.moveTo(-holeSize - 1.5, -holeSize);
    ctx.lineTo(-size / 2 + 2, -size / 2 + 3);
    ctx.moveTo(holeSize + 1.5, holeSize);
    ctx.lineTo(size / 2 - 1.5, size / 2 - 1);
    ctx.stroke();

    ctx.restore();
}

/**
 * Отрисовка одного тайла пола с градиентом серого и объемом
 */
export function drawFloorTile(ctx: CanvasRenderingContext2D, px: number, py: number, isSecret: boolean, variation: number) {
    const size = TILE_SIZE;

    if (isSecret) {
        // Секретная комната - шахматный узор
        ctx.fillStyle = '#1a1a1a';
        ctx.fillRect(px, py, TILE_SIZE, TILE_SIZE);

        ctx.fillStyle = '#222';
        const cellSize = TILE_SIZE / 2;
        for (let dy = 0; dy < 2; dy++) {
            for (let dx = 0; dx < 2; dx++) {
                if ((dx + dy) % 2 === 0) {
                    ctx.fillRect(px + dx * cellSize, py + dy * cellSize, cellSize, cellSize);
                }
            }
        }
    } else {
        // Обычный пол с градиентом серого (не чистый черный)
        const baseGray = 12 + Math.floor(variation * 8); // 12-20 (темно-серый, не черный)
        const midGray = Math.min(255, baseGray + 15);
        const darkGray = Math.max(0, baseGray - 5);

        // Базовый градиент от центра к краям (эффект объема)
        const gradient = ctx.createRadialGradient(
            px + TILE_SIZE / 2, py + TILE_SIZE / 2, 2,
            px + TILE_SIZE / 2, py + TILE_SIZE / 2, TILE_SIZE * 0.7
        );
        gradient.addColorStop(0, `rgb(${midGray}, ${midGray}, ${midGray})`);
        gradient.addColorStop(0.6, `rgb(${baseGray}, ${baseGray}, ${baseGray})`);
        gradient.addColorStop(1, `rgb(${darkGray}, ${darkGray}, ${darkGray})`);

        ctx.fillStyle = gradient;
        ctx.fillRect(px, py, TILE_SIZE, TILE_SIZE);

        // Добавляем легкую текстуру - случайные пиксели для "грязи"
        ctx.fillStyle = `rgba(${baseGray + 10}, ${baseGray + 10}, ${baseGray + 10}, 0.3)`;
        const seed = (px * 17 + py * 31) % 7;
        for (let i = 0; i < seed; i++) {
            const rx = (px + (i * 7) % TILE_SIZE);
            const ry = (py + (i * 13) % TILE_SIZE);
            ctx.fillRect(rx, ry, 1, 1);
        }

        // Объем - тень по краям тайла
        const shadowGradient = ctx.createLinearGradient(px, py + TILE_SIZE - 3, px, py + TILE_SIZE);
        shadowGradient.addColorStop(0, 'rgba(0, 0, 0, 0)');
        shadowGradient.addColorStop(1, 'rgba(0, 0, 0, 0.25)');
        ctx.fillStyle = shadowGradient;
        ctx.fillRect(px, py + TILE_SIZE - 3, TILE_SIZE, 3);

        const rightShadow = ctx.createLinearGradient(px + TILE_SIZE - 3, py, px + TILE_SIZE, py);
        rightShadow.addColorStop(0, 'rgba(0, 0, 0, 0)');
        rightShadow.addColorStop(1, 'rgba(0, 0, 0, 0.2)');
        ctx.fillStyle = rightShadow;
        ctx.fillRect(px + TILE_SIZE - 3, py, 3, TILE_SIZE);
    }

    // Слабое свечение центра (имитация источника света сверху)
    const centerGlow = ctx.createRadialGradient(
        px + TILE_SIZE / 2 - 3, py + TILE_SIZE / 2 - 3, 0,
        px + TILE_SIZE / 2 - 3, py + TILE_SIZE / 2 - 3, TILE_SIZE / 2
    );
    centerGlow.addColorStop(0, 'rgba(255, 255, 255, 0.03)');
    centerGlow.addColorStop(1, 'rgba(255, 255, 255, 0)');
    ctx.fillStyle = centerGlow;
    ctx.fillRect(px, py, TILE_SIZE, TILE_SIZE);
}

/**
 * Отрисовка одного тайла стены с градиентом белого/серого и вариациями
 */
export function drawWallTile(ctx: CanvasRenderingContext2D, px: number, py: number, mask: string, variation: number) {
    const size = TILE_SIZE;

    // Тип стены по маске (вверх|право|вниз|лево)
    const hasUp = mask[0] === '1';
    const hasRight = mask[1] === '1';
    const hasDown = mask[2] === '1';
    const hasLeft = mask[3] === '1';

    // Базовый градиент от белого сверху к темно-серому снизу (объем)
    const topGray = 180 + Math.floor(variation * 40); // 180-220
    const bottomGray = 60 + Math.floor(variation * 30); // 60-90
    const midGray = Math.floor((topGray + bottomGray) / 2);

    const gradient = ctx.createLinearGradient(px, py, px, py + size);
    gradient.addColorStop(0, `rgb(${topGray}, ${topGray}, ${topGray})`);
    gradient.addColorStop(0.5, `rgb(${midGray}, ${midGray}, ${midGray})`);
    gradient.addColorStop(1, `rgb(${bottomGray}, ${bottomGray}, ${bottomGray})`);

    ctx.fillStyle = gradient;
    ctx.fillRect(px, py, size, size);

    // Вариации текстуры стены (0-3)
    const wallType = Math.floor(variation * 4);

    if (wallType === 0) {
        // Кирпичная кладка - горизонтальные линии
        ctx.strokeStyle = `rgba(${bottomGray - 20}, ${bottomGray - 20}, ${bottomGray - 20}, 0.4)`;
        ctx.lineWidth = 1;
        for (let i = 1; i < 4; i++) {
            const y = py + (size * i / 4);
            ctx.beginPath();
            ctx.moveTo(px + 2, y);
            ctx.lineTo(px + size - 2, y);
            ctx.stroke();
        }
        // Вертикальные "швы" кирпичей
        for (let i = 1; i < 3; i++) {
            const x = px + (size * i / 3);
            ctx.beginPath();
            ctx.moveTo(x, py + size / 4);
            ctx.lineTo(x, py + size / 2);
            ctx.moveTo(x, py + size * 3 / 4);
            ctx.lineTo(x, py + size);
            ctx.stroke();
        }
    } else if (wallType === 1) {
        // Каменная кладка - неровные линии
        ctx.strokeStyle = `rgba(${bottomGray - 30}, ${bottomGray - 30}, ${bottomGray - 30}, 0.5)`;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(px + 4, py + size / 3);
        ctx.lineTo(px + size / 2, py + size / 3 + 2);
        ctx.lineTo(px + size - 4, py + size / 3 - 1);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(px + 6, py + size * 2 / 3);
        ctx.lineTo(px + size - 6, py + size * 2 / 3 + 1);
        ctx.stroke();
    } else if (wallType === 2) {
        // Поврежденная/трещины
        ctx.strokeStyle = `rgba(${bottomGray - 40}, ${bottomGray - 40}, ${bottomGray - 40}, 0.6)`;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(px + size / 2, py + 4);
        ctx.lineTo(px + size / 3, py + size / 2);
        ctx.lineTo(px + size / 2 + 2, py + size - 4);
        ctx.stroke();
        // Мелкие трещины
        ctx.beginPath();
        ctx.moveTo(px + 4, py + size / 4);
        ctx.lineTo(px + 8, py + size / 4 + 3);
        ctx.stroke();
    } else {
        // Гладкая стена с минимальным узором
        ctx.fillStyle = `rgba(${topGray - 10}, ${topGray - 10}, ${topGray - 10}, 0.15)`;
        ctx.fillRect(px + 4, py + 4, size - 8, size / 3);
    }

    // Соединения с соседними стенами - затемнение краев
    ctx.fillStyle = 'rgba(0, 0, 0, 0.2)';
    if (hasUp) ctx.fillRect(px, py, size, 2);
    if (hasDown) ctx.fillRect(px, py + size - 2, size, 2);
    if (hasLeft) ctx.fillRect(px, py, 2, size);
    if (hasRight) ctx.fillRect(px + size - 2, py, 2, size);

    // Блик сверху-слева (имитация света)
    const shine = ctx.createLinearGradient(px, py, px + size / 3, py + size / 3);
    shine.addColorStop(0, `rgba(255, 255, 255, ${0.1 + variation * 0.1})`);
    shine.addColorStop(1, 'rgba(255, 255, 255, 0)');
    ctx.fillStyle = shine;
    ctx.fillRect(px, py, size / 2, size / 2);
}
