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

export const Utils = {
    dist: (a: Point, b: Point): number => Math.hypot(a.x - b.x, a.y - b.y),
    distSq: (a: Point, b: Point): number => (a.x - b.x) ** 2 + (a.y - b.y) ** 2,
    clamp: (val: number, min: number, max: number): number => Math.max(min, Math.min(max, val)),
    lerp: (start: number, end: number, t: number): number => start + (end - start) * t,
};

/**
 * Resolves collision between a circle and a rectangle (AABB).
 * Mutates the circle's position to push it out of the rectangle.
 */
export function resolveCollision(circle: Circle, rect: Rect): void {
    let testX = circle.x;
    let testY = circle.y;
    let insideX = false;
    let insideY = false;

    if (circle.x < rect.x) {
        testX = rect.x;
    } else if (circle.x > rect.x + rect.w) {
        testX = rect.x + rect.w;
    } else {
        insideX = true;
    }

    if (circle.y < rect.y) {
        testY = rect.y;
    } else if (circle.y > rect.y + rect.h) {
        testY = rect.y + rect.h;
    } else {
        insideY = true;
    }

    // If the circle center is inside the rectangle
    if (insideX && insideY) {
        const dl = circle.x - rect.x;
        const dr = rect.x + rect.w - circle.x;
        const dt = circle.y - rect.y;
        const db = rect.y + rect.h - circle.y;
        const min = Math.min(dl, dr, dt, db);

        if (min === dl) circle.x = rect.x - circle.radius;
        else if (min === dr) circle.x = rect.x + rect.w + circle.radius;
        else if (min === dt) circle.y = rect.y - circle.radius;
        else if (min === db) circle.y = rect.y + rect.h + circle.radius;
        return;
    }

    const distX = circle.x - testX;
    const distY = circle.y - testY;
    const distance = Math.sqrt(distX * distX + distY * distY);

    if (distance < circle.radius) {
        const overlap = circle.radius - distance;
        if (distance > 0) {
            circle.x += (distX / distance) * overlap;
            circle.y += (distY / distance) * overlap;
        }
    }
}

/**
 * Applies separation force between enemies to prevent crowding.
 * Enemies push each other away if they are too close.
 */
export function applyEnemySeparation(enemies: Circle[], minDistance: number = 25): void {
    for (let i = 0; i < enemies.length; i++) {
        for (let j = i + 1; j < enemies.length; j++) {
            const a = enemies[i];
            const b = enemies[j];
            
            const dx = a.x - b.x;
            const dy = a.y - b.y;
            const distSq = dx * dx + dy * dy;
            const minDist = minDistance + a.radius + b.radius;
            
            if (distSq < minDist * minDist && distSq > 0) {
                const dist = Math.sqrt(distSq);
                const overlap = minDist - dist;
                const pushX = (dx / dist) * overlap * 0.5;
                const pushY = (dy / dist) * overlap * 0.5;
                
                a.x += pushX;
                a.y += pushY;
                b.x -= pushX;
                b.y -= pushY;
            }
        }
    }
}
