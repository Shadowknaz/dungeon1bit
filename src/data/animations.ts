export const ANIMATIONS = {
    // Игрок с пистолетом - новые детализированные анимации
    PLAYER_IDLE_DOWN: { frames: ['entity_player_pistol_d0'], fps: 1, loop: true },
    PLAYER_WALK_DOWN: { frames: ['entity_player_pistol_d0', 'entity_player_pistol_d1'], fps: 8, loop: true },
    PLAYER_IDLE_UP: { frames: ['entity_player_pistol_u0'], fps: 1, loop: true },
    PLAYER_WALK_UP: { frames: ['entity_player_pistol_u0', 'entity_player_pistol_u1'], fps: 8, loop: true },
    PLAYER_IDLE_SIDE: { frames: ['entity_player_pistol_r0'], fps: 1, loop: true },
    PLAYER_WALK_SIDE: { frames: ['entity_player_pistol_r0', 'entity_player_pistol_r1'], fps: 8, loop: true },
    
    // NPC житель
    NPC_IDLE: { frames: ['entity_npc_elder'], fps: 1, loop: true },
    
    // Враги
    ENEMY_CHASER_WALK: { frames: ['entity_enemy_chaser_0', 'entity_enemy_chaser_1'], fps: 6, loop: true },
    ENEMY_SHOOTER_IDLE: { frames: ['entity_enemy_shooter_0'], fps: 1, loop: true },
    ENEMY_SHOOTER_ATTACK: { frames: ['entity_enemy_shooter_1'], fps: 1, loop: true },
    
    // Факел - анимация пламени
    TORCH_FLAME: { frames: ['object_torch_flame_1', 'object_torch_flame_2'], fps: 4, loop: true },
};
