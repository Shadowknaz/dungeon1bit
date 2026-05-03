import { AnimDef } from '../core/animatedSprite';

export const ANIMATIONS = {
    PLAYER_IDLE_DOWN: { frames: ['entity_player_d0'], fps: 1, loop: true },
    PLAYER_WALK_DOWN: { frames: ['entity_player_d0', 'entity_player_d1'], fps: 8, loop: true },
    PLAYER_IDLE_UP: { frames: ['entity_player_u0'], fps: 1, loop: true },
    PLAYER_WALK_UP: { frames: ['entity_player_u0', 'entity_player_u1'], fps: 8, loop: true },
    PLAYER_IDLE_SIDE: { frames: ['entity_player_r0'], fps: 1, loop: true },
    PLAYER_WALK_SIDE: { frames: ['entity_player_r0', 'entity_player_r1'], fps: 8, loop: true },
    
    ENEMY_CHASER_WALK: { frames: ['entity_enemy_chaser_0', 'entity_enemy_chaser_1'], fps: 6, loop: true },
    ENEMY_SHOOTER_IDLE: { frames: ['entity_enemy_shooter_0'], fps: 1, loop: true },
    ENEMY_SHOOTER_ATTACK: { frames: ['entity_enemy_shooter_1'], fps: 1, loop: true },
};
