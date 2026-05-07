import { Point, Enemy } from '../types';

/**
 * Memory system for enemy AI
 * Centralized module that only stores player position information
 * Does NOT handle movement logic - that's handled by AI actions
 */

const MEMORY_DURATION = 600; // 10 seconds at 60fps

/**
 * Update enemy memory with current player position
 * Resets the timer to full duration
 */
export function updateMemory(enemy: Enemy, playerPos: Point): void {
    if (!playerPos) return;
    enemy.lastKnownPosition = { x: playerPos.x, y: playerPos.y };
    enemy.memoryTimer = MEMORY_DURATION;
}

/**
 * Decrement memory timer for an enemy
 * Returns true if memory is still valid, false if expired
 */
export function decrementMemoryTimer(enemy: Enemy): boolean {
    if (enemy.memoryTimer > 0) {
        enemy.memoryTimer--;
        if (enemy.memoryTimer <= 0) {
            enemy.lastKnownPosition = null;
            return false;
        }
        return true;
    }
    // If timer is already 0, ensure memory is also null
    if (enemy.memoryTimer === 0 && enemy.lastKnownPosition !== null) {
        enemy.lastKnownPosition = null;
    }
    return false;
}

/**
 * Check if enemy has valid memory
 */
export function hasValidMemory(enemy: Enemy): boolean {
    return enemy.lastKnownPosition !== null && enemy.memoryTimer > 0;
}

/**
 * Get enemy's remembered player position
 */
export function getMemoryPosition(enemy: Enemy): Point | null {
    return hasValidMemory(enemy) ? enemy.lastKnownPosition : null;
}

/**
 * Update enemy noise level based on an event
 * Returns true if noise threshold reached (100%)
 */
export function updateNoise(enemy: Enemy, amount: number): boolean {
    if (enemy.noiseLevel === undefined) enemy.noiseLevel = 0;
    enemy.noiseLevel = Math.min(100, enemy.noiseLevel + amount);
    return enemy.noiseLevel >= 100;
}

/**
 * Decay noise level over time
 */
export function decayNoise(enemy: Enemy, rate: number = 0.2): void {
    if (enemy.noiseLevel > 0) {
        enemy.noiseLevel = Math.max(0, enemy.noiseLevel - rate);
    }
}

/**
 * Clear enemy memory
 */
export function clearMemory(enemy: Enemy): void {
    enemy.lastKnownPosition = null;
    enemy.memoryTimer = 0;
    enemy.noiseLevel = 0;
    enemy.noisePosition = null;
}
