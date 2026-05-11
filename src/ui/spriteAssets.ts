import { TILE_SIZE } from '../core/constants';

/**
 * Модуль с примитивами для отрисовки игровых объектов через Canvas API
 * Заменяет битовые спрайты на процедурную графику
 */

export interface DrawContext {
    p: any; // p5 instance
    ctx: CanvasRenderingContext2D;
    sCtx: CanvasRenderingContext2D;
}

/**
 * Отрисовка игрока (human) - детальный спрайт рыцаря через p5.js
 */
export function drawHuman(p: any, x: number, y: number, angle: number, isDashing: boolean, godMode: boolean, gameState: string, t: number = 0) {
    p.push();
    p.translate(x, y);
    p.rotate(angle + p.HALF_PI);

    const scale = 0.32;
    p.scale(scale, scale);

    const idleSway = Math.sin(t * 2) * 2;
    const breathe = 1 + Math.sin(t * 1.5) * 0.05;

    if (godMode && gameState === 'PLAYING') {
        p.stroke(255, 150);
        p.strokeWeight(3);
        p.noFill();
        p.ellipse(0, 0, 60 + Math.sin(t * 5) * 10, 60 + Math.sin(t * 5) * 10);
    }

    if (isDashing) {
        // Эффект рывка - фантомные линии
        p.stroke(255);
        p.strokeWeight(2);
        for(let i=0; i<3; i++) {
            p.line(-30, 20 + i*5, 30, 20 + i*5);
        }
    }

    p.stroke(255);
    p.strokeWeight(2.5);

    // 1. Ноги (с более четким контуром)
    const legOffset = Math.sin(t * 4) * 4;
    p.fill(0);
    p.rect(-16, -5 + legOffset, 10, 15, 3);
    p.rect(6, -5 - legOffset, 10, 15, 3);

    // 2. Торс - Комиксный стиль (Hatching + High Contrast)
    p.push();
    p.scale(1, breathe);
    p.fill(10);
    p.beginShape();
    p.vertex(-28, 0);
    p.bezierVertex(-25, -20, 25, -20, 28, 0);
    p.bezierVertex(25, 20, -25, 20, -28, 0);
    p.endShape(p.CLOSE);
    
    // Внутренние тени (Hatching)
    p.drawingContext.save();
    p.drawingContext.globalCompositeOperation = 'source-atop';
    p.noStroke();
    
    // Свет сверху
    p.fill(120); p.rect(-30, -20, 60, 8);
    p.fill(80);  p.rect(-30, -12, 60, 12);
    
    // Штриховка снизу
    p.stroke(255, 40);
    p.strokeWeight(1);
    for(let i=0; i<10; i++) {
        p.line(-20 + i*4, 5, -10 + i*4, 15);
    }
    p.drawingContext.restore();
    p.pop();

    // 3. Плащ (новое)
    p.fill(5);
    p.stroke(255);
    p.beginShape();
    p.vertex(-15, 5);
    p.quadraticVertex(-25, 30 + idleSway, -10, 40);
    p.quadraticVertex(0, 35, 10, 40);
    p.quadraticVertex(25, 30 + idleSway, 15, 5);
    p.endShape(p.CLOSE);

    // 4. Шлем (более детализированный)
    const headY = -5 + idleSway;
    p.fill(10);
    p.strokeWeight(2.5);
    p.ellipse(0, headY, 32, 34);
    
    p.drawingContext.save();
    p.drawingContext.globalCompositeOperation = 'source-atop';
    p.noStroke();
    p.fill(200); p.ellipse(-5, headY - 6, 15, 15); // Блик
    p.fill(40);  p.ellipse(0, headY + 5, 25, 20); // Тень
    
    // Штриховка шлема
    p.stroke(255, 60);
    p.strokeWeight(1);
    for(let i=0; i<5; i++) {
        p.line(5 + i*2, headY, 10 + i*2, headY + 8);
    }
    p.drawingContext.restore();

    // Визор (Comic Glow)
    p.fill(255);
    p.noStroke();
    p.rect(-10, headY - 2, 20, 4, 1);
    p.fill(255, 100);
    p.ellipse(0, headY, 25, 10);

    p.pop();
}

/**
 * Рисует органический четырехугольник (неидеальный квадрат)
 */
function drawOrganicRect(p: any, w: number, h: number, jitter: number, seed: number) {
    p.beginShape();
    // Используем шум для небольшого смещения углов
    const off = (i: number) => (p.noise(seed, i) - 0.5) * jitter;
    // Левый верх
    p.vertex(-w/2 + off(1), -h/2 + off(2));
    // Правый верх
    p.vertex(w/2 + off(3), -h/2 + off(4));
    // Правый низ
    p.vertex(w/2 + off(5), h/2 + off(6));
    // Левый низ
    p.vertex(-w/2 + off(7), h/2 + off(8));
    p.endShape(p.CLOSE);
}

/**
 * Помощник для отрисовки процедурного "тела" слайма
 */
function drawSlimeBlob(p: any, points: number, radius: number, jitter: number, seed: number, t: number) {
    p.beginShape();
    for (let i = 0; i <= points; i++) {
        let a = p.map(i, 0, points, 0, p.TWO_PI);
        // Делаем верх более округлым, а низ более плоским
        let rMult = (a > 0 && a < p.PI) ? p.map(Math.sin(a), 0, 1, 1.0, 0.8) : 1.0;
        // Используем шум для органического дрожания
        let n = p.noise(i * 0.5, seed, t * 2) - 0.5;
        let r = (radius * rMult) + n * jitter;
        p.vertex(Math.cos(a) * r, Math.sin(a) * r);
    }
    p.endShape(p.CLOSE);
}

/**
 * Отрисовка слизня (chaser) через p5.js
 */
export function drawSlime(p: any, x: number, y: number, t: number, active: boolean = false) {
    p.push();
    p.translate(x, y);

    const jumpCycle = Math.sin(t * 0.3);
    const yOffset = jumpCycle > 0 ? -jumpCycle * 10 : 0;
    let sX = jumpCycle > 0 ? 0.75 : 1 + Math.abs(jumpCycle) * 0.2;
    let sY = jumpCycle > 0 ? 1.2 : 1 - Math.abs(jumpCycle) * 0.2;

    p.translate(0, yOffset);
    p.scale(sX * 0.75, sY * 0.75); // -25% от базового (чуть больше чем -20% для запаса)

    // 1. Тело (Comic Base)
    p.stroke(255);
    p.strokeWeight(3);
    p.fill(5);
    drawSlimeBlob(p, 12, 11, 3, 5, t); // Основная форма

    // 2. Многослойное затенение (Cell Shading)
    p.noStroke();
    
    // Глубокая тень
    p.fill(30);
    p.push(); p.translate(0, 2); drawSlimeBlob(p, 10, 8, 2, 15, t); p.pop();
    
    // Основной объем
    p.fill(80);
    p.push(); p.translate(0, -1); drawSlimeBlob(p, 8, 7, 2, 25, t); p.pop();
    
    // Блик
    p.fill(180);
    p.push(); p.translate(-2, -3); drawSlimeBlob(p, 6, 4, 1.5, 35, t); p.pop();

    // 3. Штриховка (Comic Hatching)
    p.stroke(255, 40); p.strokeWeight(1);
    for(let i=0; i<6; i++) {
        p.line(-6 + i*2.5, 3, -4 + i*2.5, 7);
    }

    // 4. Глаза
    p.fill(255);
    p.noStroke();
    if (!active) {
        if (Math.sin(t * 0.5) > -0.8) {
            p.ellipse(-3.5, -1, 2.5, 3.5);
            p.ellipse(3.5, -1, 2.5, 3.5);
        }
    } else {
        // Злые глаза (Комиксные треугольники)
        p.beginShape(); p.vertex(-6, -3); p.vertex(-2, -0.5); p.vertex(-4, 1); p.endShape(p.CLOSE);
        p.beginShape(); p.vertex(6, -3); p.vertex(2, -0.5); p.vertex(4, 1); p.endShape(p.CLOSE);
        // Яростный зрачок
        p.fill(0); p.ellipse(-4, -0.5, 1, 1); p.ellipse(4, -0.5, 1, 1);
    }

    p.pop();
}

/**
 * Отрисовка шипастого слизня (shooter) через p5.js
 */
export function drawSpikySlime(p: any, x: number, y: number, t: number) {
    p.push();
    p.translate(x, y);

    const jumpCycle = Math.sin(t * 0.6);
    const isRising = jumpCycle > 0;
    const yOffset = isRising ? -jumpCycle * 14 : 0;
    let sX = isRising ? 0.7 : 1 + Math.abs(jumpCycle) * 0.2;
    let sY = isRising ? 1.3 : 1 - Math.abs(jumpCycle) * 0.2;

    p.translate(0, yOffset);
    p.scale(sX * 0.75, sY * 0.75);

    // 1. Тело (Кристаллическое / Шипастое)
    p.stroke(255);
    p.strokeWeight(3);
    p.fill(0);
    
    const drawSpikyBlob = (rad: number, jit: number, seed: number) => {
        p.beginShape();
        for (let i = 0; i < 16; i++) {
            let a = p.map(i, 0, 16, 0, p.TWO_PI);
            let r = rad + (p.noise(i, seed, t * 4) - 0.5) * jit;
            // Делаем шипы через один
            if (i % 2 === 0) r += 5;
            p.vertex(Math.cos(a) * r, Math.sin(a) * r);
        }
        p.endShape(p.CLOSE);
    };

    drawSpikyBlob(9, 4, 10);

    // 2. Затенение
    p.noStroke();
    p.fill(40);
    p.push(); p.translate(0, 2); drawSpikyBlob(7, 3, 20); p.pop();
    
    p.fill(120);
    p.push(); p.translate(-1, -2); drawSpikyBlob(5, 2, 30); p.pop();

    // 3. Глаза (Evil)
    p.fill(255);
    p.rect(-6, -2, 4, 1.5);
    p.rect(2, -2, 4, 1.5);
    
    // Блики
    p.fill(255, 100);
    p.ellipse(0, -6, 4, 2);

    p.pop();
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
/**
 * Отрисовка бочки через p5.js
 */
export function drawBarrel(p: any, x: number, y: number) {
    p.push();
    p.translate(x, y);

    const scale = 0.18;
    p.scale(scale, scale);

    const w = 75, h = 105, tilt = 12;
    p.stroke(255); p.strokeWeight(3);

    // Тело бочки
    p.fill(10);
    p.beginShape();
    p.vertex(-w / 2, -h / 2 + tilt);
    p.quadraticVertex(-w / 2 - 12, 0, -w / 2, h / 2 - tilt);
    p.quadraticVertex(0, h / 2 + tilt + 5, w / 2, h / 2 - tilt);
    p.quadraticVertex(w / 2 + 12, 0, w / 2, -h / 2 + tilt);
    p.quadraticVertex(0, -h / 2 + tilt - 5, -w / 2, -h / 2 + tilt);
    p.endShape(p.CLOSE);

    p.drawingContext.save();
    p.drawingContext.globalCompositeOperation = 'source-atop';
    p.noStroke();
    
    // Текстура досок
    for(let i=-2; i<=2; i++) {
        p.fill(40 + Math.abs(i)*20);
        p.rect(i*15 - 7, -h, 14, h*2);
        // Штриховка на каждой доске
        p.stroke(255, 30); p.strokeWeight(1);
        p.line(i*15, -h/2, i*15 + 5, -h/2 + 20);
    }
    
    p.drawingContext.restore();

    // Обручи
    p.noFill(); p.strokeWeight(6); p.stroke(255);
    p.arc(0, -h / 3 + tilt, w + 15, tilt * 2, 0, p.PI);
    p.arc(0, h / 3 + tilt, w + 15, tilt * 2, 0, p.PI);

    // Заклепки
    p.fill(255); p.noStroke();
    barrelData.hoopRivets.forEach(r => {
        p.ellipse(r.x, r.y + tilt, 5, 5);
    });

    p.pop();
}

/**
 * Отрисовка сундука (Isaac style) - размер под 1 клетку
 */
/**
 * Отрисовка сундука через p5.js
 */
export function drawChest(p: any, x: number, y: number, t: number) {
    p.push();
    p.translate(x, y);

    const w = 18, h = 14; // Подогнано под 20px
    p.strokeWeight(2);
    p.stroke(255);

    const jump = Math.abs(Math.sin(t * 0.3)) * 4;
    const wobble = Math.sin(t * 5) * 1.5;
    p.translate(0, -jump);
    p.rotate(wobble * 0.02);

    // Основное тело
    p.fill(10);
    p.rect(-w / 2, 0, w, h, 1);
    
    p.drawingContext.save();
    p.drawingContext.globalCompositeOperation = 'source-atop';
    p.noStroke();
    p.fill(60); p.rect(-w/2, 0, w, h/2);
    // Hatching on wood
    p.stroke(255, 40); p.strokeWeight(1);
    for(let i=0; i<w; i+=4) p.line(-w/2+i, 0, -w/2+i+2, h);
    p.drawingContext.restore();

    // Крышка
    const lidH = h * 0.5;
    p.fill(15);
    p.stroke(255);
    p.rect(-w / 2, -lidH, w, lidH, 2);
    
    p.drawingContext.save();
    p.drawingContext.globalCompositeOperation = 'source-atop';
    p.noStroke();
    p.fill(120); p.rect(-w/2, -lidH, w, lidH/2);
    p.drawingContext.restore();

    // Полосы (Окованные края)
    const bandW = 4;
    const drawBand = (bx: number) => {
        p.fill(30); p.stroke(255); p.strokeWeight(1.5);
        p.rect(bx, -lidH, bandW, h + lidH);
        
        p.fill(255); p.noStroke();
        p.ellipse(bx + bandW/2, -lidH + 2, 1.5, 1.5);
        p.ellipse(bx + bandW/2, h - 2, 1.5, 1.5);
    };

    drawBand(-w / 2);
    drawBand(w / 2 - bandW);

    // Замок (Comic style)
    p.fill(40); p.stroke(255); p.strokeWeight(1.5);
    p.rect(-4, -3, 8, 8, 1);
    p.fill(255); p.noStroke();
    p.ellipse(0, 1, 2.5, 2.5);
    p.rect(-0.7, 1, 1.4, 4);

    p.pop();
}

// Хранилище состояний анимации шипов (для плавной интерполяции)
const spikeHeights: Map<string, number> = new Map();

// Хранилище состояний анимации нажимных плит
const plateScales: Map<string, number> = new Map();

/**
 * Отрисовка ловушки шипов (spike trap)
 */
/**
 * Отрисовка ловушки шипов через p5.js
 */
export function drawSpikeTrap(p: any, x: number, y: number, t: number, active: boolean) {
    p.push();
    p.translate(x, y);

    const size = 18;
    p.strokeWeight(2);
    p.stroke(255);

    // Плита (Comic metallic)
    p.fill(10);
    p.rect(-size / 2, -size / 2, size, size, 1);
    
    p.drawingContext.save();
    p.drawingContext.globalCompositeOperation = 'source-atop';
    p.noStroke();
    p.fill(60); p.rect(-size/2, -size/2, size, size/2);
    // Hatching on metal
    p.stroke(255, 40); p.strokeWeight(1);
    for(let i=0; i<size; i+=3) p.line(-size/2+i, -size/2, -size/2+i+2, size/2);
    p.drawingContext.restore();

    // Отверстия и шипы
    const gridPos = [-4.5, 0, 4.5];
    const holeRadius = 1.5;
    const maxSpikeRadius = 3;

    gridPos.forEach(gx => {
        gridPos.forEach(gy => {
            p.fill(0); p.noStroke();
            p.ellipse(gx, gy, holeRadius * 2, holeRadius * 2);
            
            const targetR = active ? maxSpikeRadius : 0;
            const key = `${x}_${y}_${gx}_${gy}`;
            let currentR = spikeHeights.get(key) ?? 0;
            const animSpeed = active ? 0.2 : 0.1;
            currentR += (targetR - currentR) * animSpeed;
            spikeHeights.set(key, currentR);

            const r = currentR;
            if (r > 0.3) {
                p.stroke(255); p.strokeWeight(1.5);
                p.fill(10);
                p.ellipse(gx, gy, r * 2, r * 2);
                p.fill(255); p.noStroke();
                p.ellipse(gx - r/2, gy - r/2, r, r); // Sharp comic highlight
            }
        });
    });

    p.pop();
}

/**
 * Отрисовка NPC (мирный житель)
 */
/**
 * Отрисовка NPC через p5.js
 */
export function drawNPC(p: any, x: number, y: number, t: number) {
    p.push();
    p.translate(x, y);

    const scale = 0.33;
    p.scale(scale, scale);
    p.strokeWeight(2.5); p.stroke(255);

    const breathing = Math.sin(t * 2) * 2;
    const sway = Math.sin(t * 1.5) * 5;

    // Мантия / Тело
    p.fill(10);
    p.beginShape();
    p.vertex(-25, 20);
    p.quadraticVertex(-25, -20, 0, -25);
    p.quadraticVertex(25, -20, 25, 20);
    p.endShape(p.CLOSE);
    
    p.drawingContext.save();
    p.drawingContext.globalCompositeOperation = 'source-atop';
    p.noStroke();
    p.fill(60); p.ellipse(0, -10, 40, 30);
    // Hatching on robe
    p.stroke(255, 50); p.strokeWeight(1);
    for(let i=0; i<12; i++) p.line(-20 + i*4, 10, -10 + i*4, 25);
    p.drawingContext.restore();

    // Капюшон
    const headY = -15 + breathing;
    p.fill(5); p.stroke(255);
    p.ellipse(0, headY, 26, 28);
    
    // Лицо (Тень внутри капюшона)
    p.fill(0); p.noStroke();
    p.ellipse(0, headY + 2, 18, 20);

    // Глаза (Светящиеся точки)
    if (Math.sin(t * 0.8) > -0.7) {
        p.fill(255);
        p.ellipse(-4 + sway * 0.1, headY + 2, 4, 4);
        p.ellipse(4 + sway * 0.1, headY + 2, 4, 4);
        p.fill(255, 150);
        p.ellipse(-4 + sway * 0.1, headY + 2, 8, 8); // Glow
        p.ellipse(4 + sway * 0.1, headY + 2, 8, 8);
    }

    p.pop();
}

/**
 * Отрисовка нажимной плиты (pressure plate)
 */
/**
 * Отрисовка нажимной плиты через p5.js
 */
export function drawPressurePlate(p: any, x: number, y: number, active: boolean) {
    p.push();
    p.translate(x, y);

    const size = 18;
    const innerSize = 14;
    p.strokeWeight(2); p.stroke(255);

    // База (Comic Stone)
    p.fill(10);
    p.rect(-size / 2, -size / 2, size, size, 1);
    
    const key = `${x}_${y}`;
    const targetScale = active ? 0.8 : 0.95;
    let currentScale = plateScales.get(key) ?? 0.95;
    currentScale += (targetScale - currentScale) * 0.25;
    plateScales.set(key, currentScale);

    p.scale(currentScale, currentScale);

    p.fill(active ? 150 : 40);
    p.rect(-innerSize / 2, -innerSize / 2, innerSize, innerSize, 1);
    
    // Руны / Детали на плите
    p.stroke(255, active ? 255 : 100);
    p.strokeWeight(1);
    p.line(-3, -3, 3, 3);
    p.line(3, -3, -3, 3);

    p.pop();
}

/**
 * Отрисовка ямы (pit trap)
 */
/**
 * Отрисовка ямы (pit trap) через p5.js
 */
export function drawPit(p: any, x: number, y: number, t: number) {
    p.push();
    p.translate(x, y);

    const size = 18;
    p.strokeWeight(2.5); p.stroke(255);

    // Края ямы
    p.fill(5);
    p.rect(-size / 2, -size / 2, size, size, 2);

    // Отверстие (Organic / Cracked)
    const holeSize = 7;
    p.fill(0); p.noStroke();
    p.beginShape();
    for (let i = 0; i < 12; i++) {
        let ang = (p.TWO_PI / 12) * i;
        let r = holeSize + Math.sin(i * 3 + t) * 1.5;
        p.vertex(Math.cos(ang) * r, Math.sin(ang) * r);
    }
    p.endShape(p.CLOSE);
    
    // Глубина с "туманным" эффектом
    p.drawingContext.save();
    p.drawingContext.clip();
    p.fill(15);
    p.ellipse(0, 0, holeSize*2, holeSize*2);
    // Hatching into the abyss
    p.stroke(255, 30); p.strokeWeight(0.5);
    for(let i=-10; i<10; i+=2) p.line(i, -10, i-5, 10);
    p.drawingContext.restore();

    // Трещины на плите (Comic style)
    p.stroke(255, 100); p.strokeWeight(1.5);
    p.line(-size/2, -size/2, -size/4, -size/4);
    p.line(size/2, size/2, size/3, size/3);

    p.pop();
}

/**
 * Отрисовка факела через p5.js
 */
export function drawTorch(p: any, x: number, y: number, t: number) {
    p.push();
    p.translate(x, y);

    const scale = 0.35;
    p.scale(scale, scale);
    p.stroke(255); p.strokeWeight(3);

    // Держатель (Comic Iron)
    p.fill(10);
    p.rect(-5, 0, 10, 25, 2);
    p.fill(40);
    p.rect(-8, -5, 16, 8, 1);
    
    // Штриховка на держателе
    p.stroke(255, 80); p.strokeWeight(1);
    p.line(-3, 5, 3, 15);

    // Пламя (Dynamic Comic Look)
    const flicker = Math.sin(t * 8) * 3;
    p.noStroke();
    // Внешнее свечение
    p.fill(255, 60);
    p.ellipse(0, -15 + flicker, 24 + flicker, 30 - flicker);
    // Ядро пламени
    p.fill(255);
    p.beginShape();
    p.vertex(-6, -10 + flicker);
    p.bezierVertex(-10, -25 + flicker, 0, -35 + flicker, 0, -35 + flicker);
    p.bezierVertex(10, -25 + flicker, 6, -10 + flicker, 0, -10 + flicker);
    p.endShape(p.CLOSE);

    p.pop();
}

/**
 * Отрисовка одного тайла пола через p5.js (Instance Mode)
 * учитывает размеры 1 клетки (TILE_SIZE)
 */
export function drawFloorTile(p: any, px: number, py: number, variation: number) {
    const size = TILE_SIZE;
    p.push();
    p.translate(px + size/2, py + size/2);
    
    // Используем variation для получения уникального зерна (entropy)
    const seed = Math.floor(variation * 123456);

    // 1. Основа плиты с более широким диапазоном яркости
    p.stroke(255, 30); p.strokeWeight(1);
    const stoneCol = 10 + variation * 25; // Расширенный диапазон
    p.fill(stoneCol);
    drawOrganicRect(p, size - 1, size - 1, 1.2, seed);
    
    // 2. Внутренний скол (Cell shade)
    p.noStroke();
    p.fill(stoneCol - 8);
    const innerJit = 1 + variation * 4;
    drawOrganicRect(p, size - 6, size - 6, innerJit, seed + 100);

    // 3. Уникальные элементы (Расширенные вариации)
    if (variation > 0.9) {
        // Пятно грязи
        p.fill(0, 120);
        p.ellipse((variation * 10) % 6 - 3, (seed % 10) - 5, 5, 3);
    } else if (variation < 0.12) {
        // Двойная трещина
        p.stroke(0, 180); p.strokeWeight(1);
        p.line(-6, -6, 2, 2);
        p.line(2, 2, 6, 8);
    } else if (variation > 0.48 && variation < 0.52) {
        // "Старый" камень (более темный и неровный)
        p.fill(0, 50);
        drawOrganicRect(p, size-4, size-4, 3, seed + 200);
    }

    // Рандомные точки фактуры
    p.stroke(255, 60);
    const pointCount = 1 + Math.floor(variation * 5);
    for(let i=0; i<pointCount; i++) {
        const rx = Math.sin(seed + i) * 8;
        const ry = Math.cos(seed * 0.5 + i) * 8;
        p.point(rx, ry);
    }
    p.pop();
}

/**
 * Отрисовка одного тайла стены через p5.js (Instance Mode)
 * учитывает размеры 1 клетки (TILE_SIZE) и маску соседства
 */
export function drawWallTile(p: any, px: number, py: number, mask: string, variation: number) {
    const size = TILE_SIZE;
    // Используем variation (0-1) для получения уникального зерна
    const seed = Math.floor(variation * 987654);
    
    p.push();
    p.translate(px + size/2, py + size/2);

    // 1. ВНЕШНИЙ КОНТУР И ОСНОВАНИЕ
    p.stroke(255);
    p.strokeWeight(1.5);
    p.fill(0);
    const baseJitter = 1.2 + variation * 2.5;
    drawOrganicRect(p, size, size, baseJitter, seed);

    // 2. БОКОВЫЕ ГРАНИ
    p.noStroke();
    p.fill(15 + variation * 15); 
    drawOrganicRect(p, size-2, size-2, baseJitter * 0.7, seed + 50);

    // 3. ВЕРХНЯЯ ПОВЕРХНОСТЬ
    const surfaceCol = 35 + variation * 25;
    p.fill(surfaceCol);
    drawOrganicRect(p, size-5, size-5, 0.8, seed + 100);

    // 4. СЕЛЛ-ШЕЙДИНГ (Световая зона)
    // Рандомизируем смещение зоны света
    const hx = -1.5 + (p.noise(seed, 9) - 0.5) * 2;
    const hy = -1.5 + (p.noise(seed, 10) - 0.5) * 2;
    p.fill(110 + variation * 50); 
    p.push();
    p.translate(hx, hy);
    drawOrganicRect(p, size-10, size-10, 2, seed + 150);
    p.pop();

    // 5. ЯРКИЙ БЛИК
    if (variation > 0.15) {
        p.fill(200 + variation * 55);
        p.push();
        // Блик тоже может быть в разных углах (редко)
        const bx = variation > 0.9 ? 4 : -4;
        const by = -4;
        p.translate(bx, by);
        drawOrganicRect(p, 3 + variation * 4, 3 + variation * 4, 1, seed + 200);
        p.pop();
    }

    // 6. ТЕКСТУРА И ОСОБЫЕ ВАРИАЦИИ
    p.stroke(0);
    p.strokeWeight(1);
    p.noFill();
    
    if (variation > 0.85) {
        // "Мшистая" стена - выраженные пятна
        p.fill(0, 160); p.noStroke();
        p.ellipse(variation * 10 - 5, seed % 12 - 6, 8, 5);
        p.fill(0, 100);
        p.ellipse(seed % 10 - 5, variation * 12 - 6, 5, 8);
    } else if (variation > 0.4) {
        // Процедурные трещины (более длинные и ломаные)
        p.noFill(); p.stroke(0);
        p.strokeWeight(1.2);
        p.beginShape();
        const startX = (p.noise(seed, 11) - 0.5) * 12;
        const startY = (p.noise(seed, 12) - 0.5) * 12;
        p.vertex(startX, startY);
        p.vertex(startX + (p.noise(seed, 13) - 0.5) * 15, startY + 8);
        p.vertex(startX + (p.noise(seed, 14) - 0.5) * 15, startY + 16);
        p.endShape();
    } else if (variation > 0.98) {
        // "Разрушаемая" стена - много трещин
        p.noFill(); p.stroke(255, 180);
        p.strokeWeight(1.5);
        for(let i=0; i<3; i++) {
            p.beginShape();
            const startX = -size/2 + i*5;
            const startY = -size/2;
            p.vertex(startX, startY);
            p.vertex(startX + 5, startY + 8);
            p.vertex(startX - 2, startY + 16);
            p.vertex(startX + 3, startY + 20);
            p.endShape();
        }
    } else if (variation < 0.15) {
        // Глубокий скол (больше по размеру)
        p.fill(0); p.noStroke();
        p.push(); 
        p.translate(size/2 - 3, -size/2 + 3); 
        p.rotate(variation * p.TWO_PI);
        p.rect(-5, -5, 10, 10);
        p.pop();
    }

    // Рандомные точки-выбоины (более заметные)
    p.stroke(255, 150 + variation * 105);
    const dots = Math.floor(variation * 5);
    for(let i=0; i<dots; i++) {
        p.point(p.noise(seed, i*7) * 16 - 8, p.noise(seed, i*9) * 16 - 8);
    }

    p.pop();
}

/**
 * Отрисовка голема (тяжелый враг) через p5.js
 * Анимация рук зависит от направления взгляда (lookAngle) и интенсивности движения (moveIntensity)
 */
export function drawGolem(p: any, x: number, y: number, t: number, lookAngle: number, moveIntensity: number) {
    p.push();
    p.translate(x, y);

    // Масштабируем, чтобы вписаться в 1 клетку (20x20)
    // Оригинальные координаты около 50-60 единиц, поэтому 0.3 - хороший масштаб
    const scale = 0.3; 
    p.scale(scale, scale);

    const speedMod = 1 + moveIntensity * 1.2;
    const breathing = Math.sin(t * speedMod) * 1.8;

    // Хелпер для органических путей (из референса)
    const drawOrganicPath = (points: number, radius: number, jitter: number, seed: number) => {
        p.beginShape();
        for (let i = 0; i <= points; i++) {
            let a = p.map(i, 0, points, 0, p.TWO_PI);
            let r = radius + (p.noise(i, seed, t * 0.5) - 0.5) * jitter;
            p.vertex(Math.cos(a) * r, Math.sin(a) * r);
        }
        p.endShape(p.CLOSE);
    };

    // 1. НОГИ (статичная ориентация)
    const drawLeg = (lx: number, ly: number) => {
        p.push();
        p.translate(lx, ly);
        p.stroke(255);
        p.fill(0);
        p.beginShape();
        p.vertex(0, 0); p.vertex(11, 2); p.vertex(9, 15); p.vertex(5, 17); p.vertex(-2, 13);
        p.endShape(p.CLOSE);
        p.pop();
    };

    drawLeg(-12, 16 + (moveIntensity > 0.1 ? Math.sin(t * 8) * 4 : breathing * 0.3));
    drawLeg(6, 16 + (moveIntensity > 0.1 ? Math.sin(t * 8 + p.PI) * 4 : -breathing * 0.3));

    // 2. ТОРС
    p.push();
    p.stroke(255);
    p.strokeWeight(1.5);
    p.fill(15); // deepGray
    p.beginShape();
    p.vertex(-22, -15); p.vertex(22, -18); p.vertex(14, 20); p.vertex(-14, 22);
    p.endShape(p.CLOSE);

    p.noStroke();
    p.fill(40); // darkGray
    drawOrganicPath(8, 14 + breathing, 5, 100);

    p.fill(80); // gray
    p.push();
    p.translate(2, -4);
    drawOrganicPath(6, 7, 3, 200);
    p.pop();
    p.pop();

    // 3. ПЛЕЧИ
    const drawShoulder = (sx: number, sy: number, isLeft: boolean) => {
        p.push();
        p.translate(sx, sy);
        p.stroke(255);
        p.fill(0);
        drawOrganicPath(7, 10, 4, sx + sy);
        p.noStroke();
        p.fill(150); // lightGray
        p.ellipse(isLeft ? -3 : 3, -4, 4);
        p.pop();
    };

    drawShoulder(-24, -12, true);
    drawShoulder(24, -14, false);

    // 4. РУКИ (анимированные)
    const drawArm = (ax: number, ay: number, isLeft: boolean) => {
        p.push();
        p.translate(ax, ay);
        
        let baseAngle = isLeft ? p.PI : 0;
        let finalAngle = p.lerp(baseAngle + p.HALF_PI, lookAngle, 0.6 * moveIntensity + 0.2);
        
        let sway = Math.sin(t * (moveIntensity > 0.1 ? 8 : 1.5)) * (moveIntensity > 0.1 ? 0.4 : 0.1);
        finalAngle += sway;

        let armLen = 28 + (moveIntensity * 5);
        let targetX = Math.cos(finalAngle) * armLen;
        let targetY = Math.sin(finalAngle) * armLen;

        p.stroke(255);
        p.strokeWeight(3.5);
        p.noFill();
        
        p.beginShape();
        p.vertex(0, 0);
        let midX = Math.cos(finalAngle - (isLeft ? 0.3 : -0.3)) * (armLen * 0.5);
        let midY = Math.sin(finalAngle - (isLeft ? 0.3 : -0.3)) * (armLen * 0.5);
        p.vertex(midX, midY);
        p.vertex(targetX, targetY);
        p.endShape();

        p.translate(targetX, targetY);
        p.strokeWeight(1);
        p.fill(0);
        drawOrganicPath(5, 6, 3, isLeft ? 111 : 222);
        
        p.stroke(255);
        p.line(0, 0, Math.cos(finalAngle) * 6, Math.sin(finalAngle) * 6);
        p.pop();
    };

    drawArm(-24, -12, true);
    drawArm(24, -14, false);

    // 5. ГОЛОВА
    p.push();
    let hY = -24 + breathing * 0.7;
    p.translate(0, hY);
    
    p.stroke(255);
    p.fill(0);
    p.beginShape();
    p.vertex(-10, 8); p.vertex(-13, -8); p.vertex(-5, -20); p.vertex(8, -18); 
    p.vertex(13, -6); p.vertex(9, 10); p.vertex(0, 12);
    p.endShape(p.CLOSE);

    let eyeIntensity = p.map(Math.sin(t * 5), -1, 1, 150, 255);
    p.fill(255, eyeIntensity);
    if (Math.sin(t * 0.5) > -0.8) {
        p.rect(-6, -1, 4, 2);
        p.rect(3, -1, 4, 2);
    }

    p.fill(80);
    p.ellipse(-2, -13, 6, 3);
    p.pop();

    p.pop();
}

export function drawGrenade(p: any, x: number, y: number, t: number) {
    p.push();
    p.translate(x, y);
    p.scale(0.5, 0.5); // Half tile size approx
    p.stroke(255); p.strokeWeight(2);
    p.fill(10);
    p.ellipse(0, 0, 16, 18);
    p.fill(40);
    p.rect(-4, -12, 8, 4);
    p.strokeWeight(1);
    p.line(-2, -10, 2, -10);
    // Pin
    p.noFill(); p.stroke(255);
    p.ellipse(6, -14, 6, 6);
    p.pop();
}

export function drawFlashbang(p: any, x: number, y: number, t: number) {
    p.push();
    p.translate(x, y);
    p.scale(0.5, 0.5);
    p.stroke(255); p.strokeWeight(2);
    p.fill(20);
    p.rect(-5, -8, 10, 16, 1);
    p.fill(255); p.noStroke();
    p.rect(-5, -2, 10, 4); // White band
    p.pop();
}

/**
 * Отрисовка предмета на полу
 */
export function drawDroppedItem(p: any, x: number, y: number, itemId: string, rarity: string, t: number) {
    p.push();
    p.translate(x, y);

    // Цвет в зависимости от редкости
    let glowColor = [255, 255, 255]; // common
    if (rarity === 'magic') glowColor = [100, 180, 255];
    if (rarity === 'rare') glowColor = [255, 230, 100];
    if (rarity === 'unique') glowColor = [200, 100, 255];

    // Пульсирующий ореол
    const pulse = Math.sin(t * 3) * 4;
    p.noStroke();
    p.fill(glowColor[0], glowColor[1], glowColor[2], 50 + pulse * 5);
    p.ellipse(0, 0, 18 + pulse, 18 + pulse);
    p.fill(glowColor[0], glowColor[1], glowColor[2], 30);
    p.ellipse(0, 0, 26 + pulse * 2, 26 + pulse * 2);

    // Иконка предмета (упрощенная)
    p.rotate(Math.sin(t) * 0.2);
    p.stroke(255);
    p.strokeWeight(1.5);
    p.fill(10);
    
    // Рисуем силуэт в зависимости от типа (по ID для простоты)
    if (['shotgun', 'railgun', 'electrobolt'].includes(itemId)) {
        // Силуэт оружия
        p.rect(-6, -2, 12, 4, 1);
        p.rect(-5, 0, 3, 5, 1); // рукоятка
    } else {
        // Силуэт пассивного предмета / аптечки
        p.rect(-5, -5, 10, 10, 1);
        p.line(-3, 0, 3, 0);
        p.line(0, -3, 0, 3);
    }

    // Яркая точка-блик сверху
    p.noStroke();
    p.fill(255, 200);
    p.ellipse(-2, -2, 2, 2);

    p.pop();
}
