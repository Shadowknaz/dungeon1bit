<!DOCTYPE html>
<html lang="ru">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>1-bit Подземелье: Испытание Воли</title>
    <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/lil-gui@0.19.1/dist/lil-gui.min.css">
    <link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;700&display=swap" rel="stylesheet">
    <style>
        body {
            margin: 0; padding: 0; background-color: #000; color: #fff;
            font-family: 'IBM Plex Mono', 'Consolas', monospace; overflow: hidden;
            display: flex; justify-content: center; align-items: center; height: 100vh;
        }
        #gameWrapper { 
            display: flex; gap: 20px; align-items: flex-start; 
            transform-origin: center center;
        }
        #gameCanvas {
            background-color: #000; border: 2px solid #fff;
            box-shadow: 0 0 20px rgba(255, 255, 255, 0.1); cursor: crosshair;
        }
        .crt::before {
            content: " "; display: block; position: absolute;
            top: 0; left: 0; bottom: 0; right: 0;
            background: linear-gradient(rgba(18, 16, 16, 0) 50%, rgba(0, 0, 0, 0.25) 50%), linear-gradient(90deg, rgba(255, 0, 0, 0.06), rgba(0, 255, 0, 0.02), rgba(0, 0, 255, 0.06));
            z-index: 2; background-size: 100% 2px, 3px 100%; pointer-events: none;
        }
        #sidePanel {
            width: 300px; height: 600px; border: 2px solid #fff; background-color: #000;
            box-sizing: border-box; padding: 20px; display: flex; flex-direction: column; z-index: 10;
        }
        #nodeInfo { flex-grow: 1; display: none; }
        #nodeInfo h2 { margin-top: 0; font-size: 24px; border-bottom: 2px solid #fff; padding-bottom: 10px; text-transform: uppercase; }
        #nodeInfo p { font-size: 16px; line-height: 1.5; color: #ccc; }
        #niStatus { margin-top: 20px; font-weight: bold; font-size: 18px; }
        .blink { animation: blink 1s step-end infinite; color: #fff; }
        @keyframes blink { 50% { opacity: 0; } }
        #guiContainer { margin-top: auto; }
        .lil-gui { 
            --background-color: #000; --text-color: #fff; --title-background-color: #222;
            --widget-color: #333; --hover-color: #555; --focus-color: #fff;
            --number-color: #fff; --string-color: #fff; --font-family: 'IBM Plex Mono', 'Consolas', monospace;
            border: 2px solid #fff; position: static !important; width: 100% !important;
        }
    </style>
    <script src="https://cdn.jsdelivr.net/npm/rot-js@2/dist/rot.js"></script>
</head>
<body class="crt">
    <div id="gameWrapper">
        <canvas id="gameCanvas" width="800" height="600"></canvas>
        <div id="sidePanel">
            <div id="nodeInfo">
                <h2 id="niTitle">УЗЕЛ</h2><p id="niDesc"></p><div id="niStatus"></div>
            </div>
            <div id="guiContainer"></div>
        </div>
    </div>

<script type="module">
    import { createWorld, addEntity, addComponent, removeComponent, hasComponent, defineComponent } from 'https://esm.sh/bitecs@0.3.40';
    import mitt from 'https://esm.sh/mitt@3.0.1';
    import { produce } from 'https://esm.sh/immer@10.0.3';
    import GUI from 'https://esm.sh/lil-gui@0.19.1';
    import { createMachine, interpret } from 'https://esm.sh/xstate@4.38.3';

    const canvas = document.getElementById('gameCanvas'); const ctx = canvas.getContext('2d');
    const GAME_WIDTH = 800, GAME_HEIGHT = 600, TILE_SIZE = 20;
    const MAP_COLS = GAME_WIDTH / TILE_SIZE, MAP_ROWS = GAME_HEIGHT / TILE_SIZE;

    // --- УТИЛИТЫ И МАТЕМАТИКА ---
    const Utils = {
        dist: (a, b) => Math.hypot(a.x - b.x, a.y - b.y),
        distSq: (a, b) => (a.x - b.x)**2 + (a.y - b.y)**2,
        clamp: (val, min, max) => Math.max(min, Math.min(max, val)),
        lerp: (start, end, t) => start + (end - start) * t
    };

    function resizeApp() {
        const wrapper = document.getElementById('gameWrapper');
        const padding = 40; 
        const baseWidth = GAME_WIDTH + 20 + 300; 
        const scale = Math.min((window.innerWidth - padding) / baseWidth, (window.innerHeight - padding) / GAME_HEIGHT);
        wrapper.style.transform = `scale(${scale > 1 ? 1 : Math.max(0.4, scale)})`;
    }
    window.addEventListener('resize', resizeApp);

    // --- ОПТИМИЗАЦИЯ РЕНДЕРА (OFFSCREEN CANVAS & DITHER) ---
    const ditherCanvas = document.createElement('canvas'); ditherCanvas.width = 4; ditherCanvas.height = 4;
    const dCtx = ditherCanvas.getContext('2d', { alpha: false });
    dCtx.fillStyle = '#000'; dCtx.fillRect(0, 0, 4, 4); dCtx.fillStyle = '#fff'; dCtx.fillRect(0, 0, 2, 2); dCtx.fillRect(2, 2, 2, 2);
    const ditherPatternCanvas = document.createElement('canvas'); ditherPatternCanvas.width = 4; ditherPatternCanvas.height = 4;
    const dpCtx = ditherPatternCanvas.getContext('2d'); dpCtx.globalAlpha = 0.25; dpCtx.drawImage(ditherCanvas, 0, 0);
    const ditherPattern = ctx.createPattern(ditherPatternCanvas, 'repeat');

    const staticCanvas = document.createElement('canvas');
    staticCanvas.width = GAME_WIDTH; staticCanvas.height = GAME_HEIGHT;
    const sCtx = staticCanvas.getContext('2d', { alpha: false });

    function updateStaticCanvas() {
        sCtx.fillStyle = '#000'; sCtx.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);
        sCtx.textAlign = 'center'; sCtx.textBaseline = 'middle'; sCtx.font = 'bold 20px "IBM Plex Mono", monospace';
        for (let x = 0; x < MAP_COLS; x++) {
            for (let y = 0; y < MAP_ROWS; y++) {
                let cx = x * TILE_SIZE + TILE_SIZE / 2, cy = y * TILE_SIZE + TILE_SIZE / 2;
                let isSecDoor = secretDoors.some(d => d.x === x && d.y === y);
                let isSecret = secretRoomCells.some(c => c.gx === x && c.gy === y);
                let isWall = grid[x][y] === 1;
                if (isSecDoor && secretRoomOpen) isWall = false;

                if (isWall) { sCtx.fillStyle = '#fff'; sCtx.fillText(getWallChar(x, y), cx, cy); } 
                else { sCtx.fillStyle = '#666'; sCtx.fillText(isSecret && (x+y)%2 === 0 ? '░' : '.', cx, cy); }
            }
        }
    }

    function setSecretRoomOpen(val) {
        if (secretRoomOpen !== val) { secretRoomOpen = val; updateStaticCanvas(); }
    }

    function drawText1bit(ctx, text, x, y, fg = '#fff', outline = '#000') {
        ctx.miterLimit = 2; ctx.lineJoin = 'round'; ctx.strokeStyle = outline; ctx.lineWidth = 3;
        ctx.strokeText(text, x, y); ctx.fillStyle = fg; ctx.fillText(text, x, y);
    }

    function shouldPulse(speedMs) { return Math.floor(Date.now() / speedMs) % 2 === 0; }

    // --- СИСТЕМА БАТЧИНГА ЧАСТИЦ (Float32Array) ---
    const ParticleSystem = {
        MAX: 2000, count: 0,
        init() {
            this.x = new Float32Array(this.MAX); this.y = new Float32Array(this.MAX);
            this.vx = new Float32Array(this.MAX); this.vy = new Float32Array(this.MAX);
            this.life = new Float32Array(this.MAX); this.decay = new Float32Array(this.MAX);
            this.char = new Uint8Array(this.MAX); this.chars = ['.', ',', '*', "'", '`'];
            this.count = 0;
        },
        spawn(px, py, count) {
            for(let i=0; i<count; i++) {
                if (this.count >= this.MAX) return;
                let idx = this.count++;
                this.x[idx] = px; this.y[idx] = py;
                this.vx[idx] = (Math.random()-0.5)*10; this.vy[idx] = (Math.random()-0.5)*10;
                this.life[idx] = 1.0; this.decay[idx] = 0.02 + Math.random()*0.05;
                this.char[idx] = Math.floor(Math.random() * this.chars.length);
            }
        },
        update() {
            for(let i = this.count - 1; i >= 0; i--) {
                this.x[i] += this.vx[i]; this.y[i] += this.vy[i]; this.life[i] -= this.decay[i];
                if (this.life[i] <= 0) {
                    this.count--; let last = this.count;
                    if (i !== last) {
                        this.x[i] = this.x[last]; this.y[i] = this.y[last]; this.vx[i] = this.vx[last]; this.vy[i] = this.vy[last];
                        this.life[i] = this.life[last]; this.decay[i] = this.decay[last]; this.char[i] = this.char[last];
                    }
                }
            }
        },
        draw(ctx) {
            ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.font = '12px "IBM Plex Mono", monospace';
            for(let i=0; i<this.count; i++) {
                ctx.fillStyle = `rgba(255,255,255,${this.life[i]})`; ctx.fillText(this.chars[this.char[i]], this.x[i], this.y[i]);
            }
        }
    };
    ParticleSystem.init();

    // --- ЗВУКИ ZzFX ---
    let zzfxX, zzfxV = 0.3, zzfxR = 44100;
    const zzfx = (...t) => { if (!zzfxX) zzfxX = new (window.AudioContext || window.webkitAudioContext)(); if (zzfxX.state === 'suspended') zzfxX.resume(); return zzfxP(zzfxG(...t)); };
    const zzfxP = (...t) => { let e = zzfxX.createBufferSource(), f = zzfxX.createBuffer(t.length, t[0].length, zzfxR); t.map((t, i) => f.getChannelData(i).set(t)); e.buffer = f; let gainNode = zzfxX.createGain(); gainNode.gain.value = zzfxV; gainNode.connect(zzfxX.destination); e.connect(gainNode); e.start(); return e; };
    const zzfxG = (q=1,k=.05,c=220,e=0,t=0,u=.1,r=0,F=1,v=0,z=0,w=0,A=0,l=0,B=0,x=0,A2=0,d=0,y=1,m=0,C=0) => { let b=2*Math.PI,H=v*=500*b/zzfxR**2,I=(0<x?1:-1)*b/4,J=c*=(1+2*k*Math.random()-k)*b/zzfxR,K=[],L=0,M=0,N=0,O=1,P=0,Q=0,R=0,S=0,T=0; e=99+zzfxR*e;m*=zzfxR;t*=zzfxR;u*=zzfxR;d*=zzfxR;z*=500*b/zzfxR**3;x*=b/zzfxR;w*=b/zzfxR;A*=zzfxR;l=zzfxR*l|0; for(let U=0;U<e+m+t+u+d;U++){ let V,W=O; if(U<e)W=U/e;else if(U<e+m)W=1-(U-e)/m*(1-y);else if(U<e+m+t)W=y;else if(U<e+m+t+u)W=y-(U-(e+m+t))/u*y;else W=0; if(U<A)W*=Math.sin(U*b/A);W*=q; if(U&&U>A2)J+=z;if(U&&U>B)J+=w;if(U&&U>C)v+=H; if(l&&++T>l)J+=x,T=0,O=-O; if(F>1)N+=(Math.sin(J)-N)/F;else N=Math.sin(J); P+=N-P*R;K[U]=P*W*Math.cos(I)*Math.exp(-S/1e3);I+=v;J+=N*O;S++; } return[K]; };
    
    const sfx = {
        playerShoot: () => zzfx(1,0.05,200,0.01,0.05,0.05,1,1.5,0,0,0,0,0,0,0,0,0.1,1,0,0),
        enemyShoot: () => zzfx(0.6,0.05,150,0.02,0.05,0.05,1,1.5,0,0,0,0,0,0,0,0,0.1,1,0,0),
        dash: () => zzfx(1,0.05,400,0.05,0.1,0.1,1,1.5,10,0,0,0,0,0,0,0,0.1,1,0,0),
        hit: () => zzfx(1,0.1,100,0.05,0.1,0.2,4,2,0,0,0,0,0,0,0,0,0.5,1,0,0),
        chestOpen: () => zzfx(1,0.1,800,0.05,0.2,0.5,1,1.5,0,0,0,0,0,0,0,0,0.1,1,0,0),
        doorOpen: () => zzfx(1,0.1,80,0.1,0.1,0.3,1,0.5,0,0,0,0,0,0,0,0,1,1,0,0),
        roomClear: () => zzfx(1,0.05,600,0.05,0.1,0.4,1,1.5,0,0,0,0,0,0,0,0,0.1,1,0,0),
        gameOver: () => zzfx(1,0.5,50,0.5,0.5,2,4,2,0,0,0,0,0,0,0,0,0.5,1,0,0),
        click: () => zzfx(1,0.05,800,0.01,0.05,0.05,1,1.5,0,0,0,0,0,0,0,0,0.1,1,0,0),
        explosion: () => zzfx(2,0.2,50,0.1,0.2,0.8,4,2,0,0,0,0,0,0,0,0,0.5,1,0,0),
        reflect: () => zzfx(1,0.01,800,0.01,0.05,0.05,1,1.5,0,0,0,0,0,0,0,0,0.1,1,0,0),
        reload: () => zzfx(1,0.05,100,0.1,0.1,0.2,1,1.5,0,0,0,0,0,0,0,0,0.5,1,0,0),
        empty: () => zzfx(1,0.01,800,0.01,0.01,0.01,1,1.5,0,0,0,0,0,0,0,0,0.1,1,0,0)
    };
    function resumeAudio() { if (!zzfxX) zzfxX = new (window.AudioContext || window.webkitAudioContext)(); if (zzfxX.state === 'suspended') zzfxX.resume(); }

    const B3 = {
        SUCCESS: 1, FAILURE: 2, RUNNING: 3,
        Sequence: class { constructor(children) { this.children = children; } tick(tickData) { for (let child of this.children) { let status = child.tick(tickData); if (status !== B3.SUCCESS) return status; } return B3.SUCCESS; } },
        Action: class { constructor(actionFn) { this.actionFn = actionFn; } tick(tickData) { return this.actionFn(tickData); } }
    };
    const patrolTree = new B3.Sequence([
        new B3.Action((t) => {
            let e = t.enemy;
            if (e.role === 'guard') return B3.SUCCESS; 
            if (e.role === 'follower') {
                if (e.leader) e.patrolTarget = { x: e.leader.x + e.followOffX, y: e.leader.y + e.followOffY };
                else e.role = 'wanderer'; 
            } 
            else if (e.role === 'patroller' && e.patrolPath) {
                let target = e.patrolPath[e.patrolIndex];
                if (Utils.dist(e, target) < 20) {
                    e.patrolIndex = (e.patrolIndex + 1) % e.patrolPath.length;
                    target = e.patrolPath[e.patrolIndex];
                }
                e.patrolTarget = target;
            } 
            else { 
                if (!e.patrolTarget || Utils.dist(e, e.patrolTarget) < 10) {
                    if (Math.random() < 0.05) e.patrolTarget = { x: e.x + (Math.random() - 0.5) * 100, y: e.y + (Math.random() - 0.5) * 100 };
                }
            }
            return B3.SUCCESS;
        }),
        new B3.Action((t) => {
            let e = t.enemy;
            if (e.role === 'guard' || !e.patrolTarget) return B3.SUCCESS;
            let angle = Math.atan2(e.patrolTarget.y - e.y, e.patrolTarget.x - e.x);
            let eSpeed = e.speed * (e.status === 'oiled' || e.status === 'petroleum' ? 0.5 : 1.0);
            e.x += Math.cos(angle) * (eSpeed * 0.4); e.y += Math.sin(angle) * (eSpeed * 0.4);
            return B3.RUNNING;
        })
    ]);

    const enemyMachineDef = createMachine({
        id: 'enemyFSM', initial: 'patrol',
        states: {
            patrol: { on: { PLAYER_SPOTTED: 'alerting', HEARD_NOISE: 'investigate' } },
            investigate: { on: { PLAYER_SPOTTED: 'alerting', REACHED_TARGET: 'patrol', PLAYER_LOST: 'patrol' } },
            alerting: { on: { ALERT_DONE: 'chase', PLAYER_LOST: 'investigate' } },
            chase: { on: { PLAYER_LOST: 'investigate', IN_RANGE: 'attack' } },
            attack: { on: { OUT_OF_RANGE: 'chase', PLAYER_LOST: 'investigate' } }
        }
    });

    // Декларативная система ИИ
    const EnemyActions = {
        patrol: (e) => { patrolTree.tick({ enemy: e }); obstacles.forEach(obs => resolveCollision(e, obs)); if (!secretRoomOpen) secretDoorObstacles.forEach(obs => resolveCollision(e, obs)); },
        investigate: (e) => {
            if (e.memory) {
                let astar = new window.ROT.Path.AStar(e.memory.x, e.memory.y, isPassable); let path = [];
                astar.compute(Math.floor(e.x/TILE_SIZE), Math.floor(e.y/TILE_SIZE), (x, y) => path.push({x, y}));
                if (path.length > 1) { 
                    let angle = Math.atan2(path[1].y * TILE_SIZE + TILE_SIZE / 2 - e.y, path[1].x * TILE_SIZE + TILE_SIZE / 2 - e.x); 
                    let eSpeed = e.speed * (e.status === 'oiled' || e.status === 'petroleum' ? 0.5 : 1.0);
                    e.x += Math.cos(angle) * (eSpeed * 0.7); e.y += Math.sin(angle) * (eSpeed * 0.7); 
                } else { e.memory = null; e.fsm.send('REACHED_TARGET'); }
                obstacles.forEach(obs => resolveCollision(e, obs));
                if (!secretRoomOpen) secretDoorObstacles.forEach(obs => resolveCollision(e, obs));
            } else { e.fsm.send('REACHED_TARGET'); }
        },
        chase: (e, canSeePlayer, inSteam, index) => EnemyActions.combatMove(e, canSeePlayer, inSteam, index),
        attack: (e, canSeePlayer, inSteam, index) => EnemyActions.combatMove(e, canSeePlayer, inSteam, index),
        alerting: () => {},
        combatMove: (e, canSeePlayer, inSteam, index) => {
            let eSpeed = e.speed * (e.status === 'oiled' || e.status === 'petroleum' ? 0.5 : 1.0);
            if (e.type === 'chaser') {
                if (e.memory) {
                    let astar = new window.ROT.Path.AStar(e.memory.x, e.memory.y, isPassable); let path = [];
                    astar.compute(Math.floor(e.x/TILE_SIZE), Math.floor(e.y/TILE_SIZE), (x, y) => path.push({x, y}));
                    if (path.length > 1) { 
                        let angle = Math.atan2(path[1].y * TILE_SIZE + TILE_SIZE / 2 - e.y, path[1].x * TILE_SIZE + TILE_SIZE / 2 - e.x); 
                        let closeAllies = 0; enemies.forEach(other => { if (other !== e && Utils.distSq(e, other) < 2500) closeAllies++; });
                        if (closeAllies >= 2 && canSeePlayer) angle += (e.id > 0.5 ? 0.8 : -0.8);
                        e.x += Math.cos(angle) * eSpeed; e.y += Math.sin(angle) * eSpeed; 
                    } 
                    else if (path.length <= 1 && !canSeePlayer) e.memory = null;
                    obstacles.forEach(obs => resolveCollision(e, obs));
                    if (!secretRoomOpen) secretDoorObstacles.forEach(obs => resolveCollision(e, obs));
                }
                if (!uiState.godMode && !player.isDashing && Utils.dist(player, e) < player.radius + e.radius) restartRoom();
            } else if (e.type === 'shooter') {
                if (canSeePlayer) {
                    e.timer++; if (e.timer > 100) { 
                        if (e.status === 'petroleum') { sfx.explosion(); ParticleSystem.spawn(e.x, e.y, 60); FluidSystem.ignite(Math.floor(e.x/TILE_SIZE), Math.floor(e.y/TILE_SIZE)); killEnemy(index); return; }
                        sfx.enemyShoot(); let aimAngle = Math.atan2(player.y - e.y, player.x - e.x); 
                        if (inSteam) aimAngle += (Math.random() - 0.5) * 1.0;
                        bullets.push({ x: e.x, y: e.y, vx: Math.cos(aimAngle) * 1, vy: Math.sin(aimAngle) * 1, isEnemy: true, radius: 4 }); e.timer = 0; 
                    }
                }
            }
        }
    };

    const events = mitt(); let world = createWorld(); let playerEid = addEntity(world);
    const C_Chalice = defineComponent(); const C_Thermal = defineComponent();
    
    const ITEMS_DB = {
        'pistol': { id: 'pistol', type: 'weapon', name: 'Пистолет новичка', desc: 'Базовое оружие.', shape: [[1,1]], cooldown: 25, maxAmmo: 6, reloadDuration: 60, projectiles: 1, spreadAngle: 0 },
        'shotgun': { id: 'shotgun', type: 'weapon', name: 'Дробовик', desc: 'Выстрел шрапнелью.', shape: [[1,1,1]], cooldown: 60, maxAmmo: 4, reloadDuration: 90, projectiles: 3, spreadAngle: 0.15 },
        'chalice': { id: 'chalice', type: 'passive', name: 'Чаша', desc: '50% шанс не потерять Волю.', shape: [[1,1],[1,1]], onEquip: (eid) => addComponent(world, C_Chalice, eid) },
        'thermal': { id: 'thermal', type: 'passive', name: 'Тепловизор', desc: 'Ауры врагов видно сквозь стены.', shape: [[1,1]], onEquip: (eid) => addComponent(world, C_Thermal, eid) }
    };
    
    const INV_COLS = 8, INV_ROWS = 6, SLOT_SIZE = 30;
    const INV_WIN = { x: 230, y: 100, w: INV_COLS*SLOT_SIZE + 220, h: INV_ROWS*SLOT_SIZE + 100 }; 
    const CHEST_WIN = { x: 40, y: 150, w: 4 * SLOT_SIZE + 40, h: 4 * SLOT_SIZE + 100, cols: 4, rows: 4 };
    
    let grid = [], explored = [], visibleCells = {};
    let bullets = [], enemies = [], npcs = [], traps_mine = [], traps_pit = [], traps_spike = [], hazards_blade = [], plates = [], mirrors = [];
    let doors = [], chests = [], floatingTexts = [], barrels = [], fluidGrid = [];
    let obstacles = [], startDoor = null, exitRoomCenter = { x: 400, y: 100 }, exitLocked = false;
    let roomSnapshot = {}, roomClearTimer = 0;

    let inventoryItems = []; let chestLootItems = []; let draggingItem = null; let activeChest = null;
    let invAnimProgress = 0; let selectedItemInstanceId = null; 

    const CDManager = { ticks: {}, set(id, max) { this.ticks[id] = max; }, tick() { for(let k in this.ticks) if(this.ticks[k] > 0) this.ticks[k]--; }, ready(id) { return !this.ticks[id] || this.ticks[id] <= 0; } };

    let gameState = 'GLOBAL_MAP'; 
    let currentWill = 100, roomLevel = 1, roomActive = false, combatIntensity = 0; 
    let globalMap = { nodes: {}, layers: [] }, currentNodeId = null, hoveredNodeId = null, selectedNodeId = null, popupItem = null;
    let activeNPC = null; let frameCounter = 0;

    let secretRoomOpen = false, secretDoors = [], secretDoorObstacles = [], secretRoomCells = [], runes = [];
    const keys = { KeyW: false, KeyA: false, KeyS: false, KeyD: false, KeyE: false, KeyR: false, Tab: false, Space: false };
    const mouse = { x: GAME_WIDTH/2, y: GAME_HEIGHT/2, clicked: false };

    const ENEMY_BARKS = ["!?", "ВИЖУ!", "СЮДА!", "СМЕРТЬ!", "ШОРОХ..."];

    const player = {
        eid: playerEid, x: GAME_WIDTH / 2, y: 520, radius: 10, angle: 0,
        baseStats: { speed: 1, dashCooldown: 120, dashSpeed: 8, dashDuration: 8 }, 
        computedStats: { maxAmmo: 0, shootCooldown: 0, reloadDuration: 0, projectiles: 1, spreadAngle: 0 }, 
        isDashing: false, isAimingDash: false, dashTimer: 0, dashAngle: 0, trail: [],
        ammo: 0, isReloading: false, reloadTimer: 0, equippedWeaponInstanceId: null,
        consecutiveShots: 0, lastShotTime: 0, carryingBarrel: null, credits: 0,
        status: null, statusTimer: 0
    };

    function addFloatingText(x, y, text, color = '#fff') {
        floatingTexts.push({ x, y, gx: Math.floor(x / TILE_SIZE), gy: Math.floor(y / TILE_SIZE), text, color, life: 60, maxLife: 60 });
    }

    function killEnemy(index) {
        let dead = enemies.splice(index, 1)[0];
        if (!dead) return;
        enemies.forEach(e => { if (e.leader === dead) { e.leader = null; e.role = 'wanderer'; } });
        ParticleSystem.spawn(dead.x, dead.y, 15);
        if (Math.random() < 0.4) {
            let amt = Math.floor(Math.random() * 10) + 5;
            player.credits += amt;
            addFloatingText(dead.x, dead.y - 15, `+${amt} CR`, '#ff0');
            updateUI();
        }
    }

    function makeNoise(nx, ny, radius) {
        enemies.forEach(en => {
            if ((en.fsm.state.value === 'patrol' || en.fsm.state.value === 'investigate') && Utils.distSq({x: nx, y: ny}, en) < radius*radius) {
                en.memory = { x: Math.floor(nx/TILE_SIZE), y: Math.floor(ny/TILE_SIZE) };
                en.fsm.send('HEARD_NOISE');
                addFloatingText(en.x, en.y - 20, "?!", "#ff0");
            }
        });
    }

    const FluidProps = {
        'water': { evap: 1500/(10*15), color: '#888', char: '~' },
        'oil': { evap: 1500/(20*15), color: '#666', char: '≈' },
        'petroleum': { evap: 1500/(30*15), color: '#444', char: '≈' }
    };

    const FluidSystem = {
        step() {
            let nextGrid = Array.from({length: MAP_COLS}, () => Array(MAP_ROWS).fill(null));
            for(let x=0; x<MAP_COLS; x++) {
                for(let y=0; y<MAP_ROWS; y++) {
                    if(fluidGrid[x][y]) nextGrid[x][y] = { ...fluidGrid[x][y] };
                }
            }

            for(let x=0; x<MAP_COLS; x++) {
                for(let y=0; y<MAP_ROWS; y++) {
                    let cell = fluidGrid[x][y];
                    if(!cell) continue;
                    let nCell = nextGrid[x][y];

                    if (cell.steam > 0) {
                        nCell.steam -= 2; 
                        let neighbors = [ {x:x+1,y}, {x:x-1,y}, {x,y:y+1}, {x,y:y-1} ];
                        neighbors.forEach(n => {
                            if (isPassable(n.x, n.y)) {
                                if (!nextGrid[n.x][n.y]) nextGrid[n.x][n.y] = { type: null, vol: 0, fire: 0, steam: 0 };
                                if (nextGrid[n.x][n.y].steam < cell.steam - 10) nextGrid[n.x][n.y].steam += 5; 
                            }
                        });
                    }

                    if (cell.fire > 0) {
                        nCell.fire -= 1;
                        if (cell.vol > 0) nCell.vol -= 5; 
                        
                        for (let i = barrels.length - 1; i >= 0; i--) {
                            let b = barrels[i];
                            if (Math.floor(b.x/TILE_SIZE) === x && Math.floor(b.y/TILE_SIZE) === y) {
                                if (b.type === 'explosive') destroyBarrel(i);
                                else if (Math.random() < 0.05) destroyBarrel(i); 
                            }
                        }

                        let neighbors = [ {x:x+1,y}, {x:x-1,y}, {x,y:y+1}, {x,y:y-1} ];
                        neighbors.forEach(n => {
                            if (isPassable(n.x, n.y)) {
                                let nFCell = fluidGrid[n.x][n.y];
                                if (nFCell) {
                                    if (nFCell.type === 'water' && nFCell.vol > 10) {
                                        if (!nextGrid[n.x][n.y]) nextGrid[n.x][n.y] = { type: 'water', vol: nFCell.vol, fire: 0, steam: 0 };
                                        nextGrid[n.x][n.y].vol -= 10;
                                        nextGrid[n.x][n.y].steam = 300; 
                                        nCell.fire = 0; 
                                    } else if ((nFCell.type === 'oil' || nFCell.type === 'petroleum') && nFCell.vol > 5 && !nFCell.fire) {
                                        if (!nextGrid[n.x][n.y]) nextGrid[n.x][n.y] = { ...nFCell };
                                        nextGrid[n.x][n.y].fire = 600;
                                        makeNoise(n.x*TILE_SIZE, n.y*TILE_SIZE, 300); 
                                    }
                                }
                            }
                        });
                    }

                    if(cell.vol > 5) {
                        let neighbors = [ {x:x+1,y}, {x:x-1,y}, {x,y:y+1}, {x,y:y-1} ];
                        let validN = neighbors.filter(n => isPassable(n.x, n.y));
                        let flowCap = cell.vol * 0.25; 
                        let flows = [];
                        
                        for(let n of validN) {
                            let nVol = fluidGrid[n.x][n.y] ? fluidGrid[n.x][n.y].vol : 0;
                            if(cell.vol > nVol + 10) flows.push({n, diff: cell.vol - nVol});
                        }
                        
                        if(flows.length > 0) {
                            let totalDiff = flows.reduce((sum, f) => sum + f.diff, 0);
                            for(let f of flows) {
                                let flow = (f.diff / totalDiff) * flowCap;
                                nCell.vol -= flow;
                                
                                if(!nextGrid[f.n.x][f.n.y]) nextGrid[f.n.x][f.n.y] = {type: cell.type, vol: 0, fire: 0, steam: 0};
                                let targetCell = nextGrid[f.n.x][f.n.y];
                                
                                if (targetCell.type && targetCell.type !== cell.type && targetCell.vol > 10) {
                                    if ((targetCell.type === 'water' && cell.type === 'oil') || (targetCell.type === 'oil' && cell.type === 'water')) {
                                        targetCell.type = 'petroleum';
                                    }
                                } else if (!targetCell.type || targetCell.vol <= 5) {
                                    targetCell.type = cell.type;
                                }
                                targetCell.vol += flow * 0.85; 
                            }
                        }
                    }

                    if (nCell.vol > 0 && FluidProps[nCell.type]) {
                        nCell.vol -= FluidProps[nCell.type].evap;
                    }

                    if (nCell.vol <= 0 && nCell.fire <= 0 && nCell.steam <= 0) nextGrid[x][y] = null;
                }
            }
            fluidGrid = nextGrid;
        },
        spill(x, y, type, amount) {
            let gx = Math.floor(x / TILE_SIZE); let gy = Math.floor(y / TILE_SIZE);
            if (gx>=0 && gx<MAP_COLS && gy>=0 && gy<MAP_ROWS && isPassable(gx, gy)) {
                if (!fluidGrid[gx][gy]) fluidGrid[gx][gy] = { type, vol: 0, fire: 0, steam: 0 };
                fluidGrid[gx][gy].type = type; 
                fluidGrid[gx][gy].vol += amount;
            }
        },
        ignite(gx, gy) {
            if (fluidGrid[gx] && fluidGrid[gx][gy]) {
                fluidGrid[gx][gy].fire = 600;
                makeNoise(gx*TILE_SIZE, gy*TILE_SIZE, 400);
            }
        }
    };

    const BarrelBehaviors = {
        'explosive': (brl) => {
            sfx.explosion(); ParticleSystem.spawn(brl.x, brl.y, 60); makeNoise(brl.x, brl.y, 500);
            if (!uiState.godMode && !player.isDashing && Utils.dist(player, brl) < 60) restartRoom();
            for (let j = enemies.length - 1; j >= 0; j--) { if (Utils.dist(enemies[j], brl) < 60) killEnemy(j); }
            FluidSystem.ignite(Math.floor(brl.x/TILE_SIZE), Math.floor(brl.y/TILE_SIZE));
        },
        'water': (brl) => FluidSystem.spill(brl.x, brl.y, 'water', 1500),
        'oil': (brl) => FluidSystem.spill(brl.x, brl.y, 'oil', 1500),
        'petroleum': (brl) => FluidSystem.spill(brl.x, brl.y, 'petroleum', 1500)
    };

    function destroyBarrel(index) {
        let brl = barrels.splice(index, 1)[0];
        if (!brl) return;
        sfx.hit(); BarrelBehaviors[brl.type](brl);
    }

    function equipWeapon(instanceId) {
        let it = inventoryItems.find(i => i.instanceId === instanceId);
        if (it && ITEMS_DB[it.id].type === 'weapon') {
            player.equippedWeaponInstanceId = instanceId; updateEquippedStats();
            player.ammo = player.computedStats.maxAmmo; player.isReloading = false; player.reloadTimer = 0; sfx.reload();
        }
    }
    function unequipWeapon() { player.equippedWeaponInstanceId = null; updateEquippedStats(); }
    function destroyItem(instanceId) {
        if (player.equippedWeaponInstanceId === instanceId) unequipWeapon();
        inventoryItems = inventoryItems.filter(i => i.instanceId !== instanceId);
        if (selectedItemInstanceId === instanceId) selectedItemInstanceId = null;
        sfx.hit(); updateEquippedStats();
    }
    function updateEquippedStats() {
        player.computedStats = { ...player.baseStats };
        if (hasComponent(world, C_Chalice, player.eid)) removeComponent(world, C_Chalice, player.eid);
        if (hasComponent(world, C_Thermal, player.eid)) removeComponent(world, C_Thermal, player.eid);
        inventoryItems.forEach(it => { let db = ITEMS_DB[it.id]; if (db.type === 'passive' && db.onEquip) db.onEquip(player.eid); });

        if (player.equippedWeaponInstanceId) {
            let w = inventoryItems.find(i => i.instanceId === player.equippedWeaponInstanceId);
            if (w) {
                let db = ITEMS_DB[w.id];
                player.computedStats.shootCooldown = db.cooldown; player.computedStats.maxAmmo = db.maxAmmo;
                player.computedStats.reloadDuration = db.reloadDuration; player.computedStats.projectiles = db.projectiles;
                player.computedStats.spreadAngle = db.spreadAngle;
            } else { player.equippedWeaponInstanceId = null; }
        }
        if (!player.equippedWeaponInstanceId) { player.computedStats.maxAmmo = 0; player.ammo = 0; }
        updateUI();
    }

    function canPlaceItem(item, gridX, gridY, targetList, cols, rows) {
        let shape = ITEMS_DB[item.id].shape;
        if (gridX < 0 || gridY < 0 || gridX + shape[0].length > cols || gridY + shape.length > rows) return false;
        for (let i = 0; i < targetList.length; i++) {
            let other = targetList[i];
            if (other.instanceId === item.instanceId) continue; 
            let oShape = ITEMS_DB[other.id].shape;
            for (let r = 0; r < shape.length; r++) {
                for (let c = 0; c < shape[r].length; c++) {
                    if (shape[r][c]) {
                        let oX = gridX + c - other.x; let oY = gridY + r - other.y;
                        if (oY >= 0 && oY < oShape.length && oX >= 0 && oX < oShape[oY].length && oShape[oY][oX]) return false;
                    }
                }
            }
        }
        return true;
    }

    function findFreeSpot(item, targetList, cols, rows) {
        for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) if (canPlaceItem(item, x, y, targetList, cols, rows)) return {x, y};
        return null;
    }

    function getItemAtPixel(px, py, gridOffsetX, gridOffsetY, list) {
        let gx = Math.floor((px - gridOffsetX) / SLOT_SIZE); let gy = Math.floor((py - gridOffsetY) / SLOT_SIZE);
        for (let item of list) {
            let shape = ITEMS_DB[item.id].shape; let lx = gx - item.x; let ly = gy - item.y;
            if (ly >= 0 && ly < shape.length && lx >= 0 && lx < shape[ly].length && shape[ly][lx]) return { item, offsetX: px - (gridOffsetX + item.x * SLOT_SIZE), offsetY: py - (gridOffsetY + item.y * SLOT_SIZE) };
        } return null;
    }

    // --- СИСТЕМА ЛОВУШЕК И МЕХАНИЗМОВ ---
    const TrapSystem = {
        update(entities) {
            const { player, enemies, traps_pit, traps_spike, hazards_blade, plates, traps_mine, restartRoom, uiState } = entities;
            traps_pit.forEach(p => { if (!uiState.godMode && !player.isDashing && Utils.dist(player, p) < 12) restartRoom(); });
            traps_spike.forEach(s => {
                let overlap = Utils.dist(player, s) < 15;
                if (s.state === 0 && overlap) { s.state = 1; sfx.click(); addFloatingText(s.x, s.y - 20, "КЛАЦ!"); }
                else if (s.state === 1) { s.timer++; if (s.timer > 45) { s.state = 2; s.timer = 0; sfx.hit(); } }
                else if (s.state === 2) { if (overlap && !uiState.godMode && !player.isDashing) restartRoom(); s.timer++; if (s.timer > 30) { s.state = 0; s.timer = 0; } }
            });
            hazards_blade.forEach(b => {
                b.x += b.vx; b.y += b.vy;
                if (b.x < b.startX - b.range || b.x > b.startX + b.range) b.vx *= -1;
                if (b.y < b.startY - b.range || b.y > b.startY + b.range) b.vy *= -1;
                if (!uiState.godMode && !player.isDashing && Utils.dist(player, b) < 15) restartRoom();
                for (let i = enemies.length - 1; i >= 0; i--) { if (Utils.dist(enemies[i], b) < 15) killEnemy(i); }
            });
            plates.forEach(p => {
                let wasPressed = p.pressed;
                if (!p.pressed && Utils.dist(player, p) < 15) {
                    p.pressed = true; sfx.doorOpen(); setSecretRoomOpen(true); ParticleSystem.spawn(p.x, p.y, 20); p.timer = 1200; 
                    addFloatingText(p.x, p.y - 20, "ПУТЬ ОТКРЫТ!");
                } else if (p.pressed && p.timer > 0 && p.timer !== Infinity) {
                    let inSecretRoom = secretRoomCells.some(c => Math.floor(player.x/TILE_SIZE) === c.gx && Math.floor(player.y/TILE_SIZE) === c.gy);
                    if (inSecretRoom) {
                        p.timer = Infinity; if (!p.discovered) { p.discovered = true; addFloatingText(player.x, player.y - 40, "СЕКРЕТ НАЙДЕН!"); }
                    } else {
                        p.timer--;
                        if (p.timer <= 0) { p.pressed = false; setSecretRoomOpen(false); sfx.click(); addFloatingText(p.x, p.y - 20, "ЗАКРЫЛОСЬ"); }
                    }
                }
            });
            traps_mine.forEach((t, index) => {
                if (!t.active) {
                    let triggered = Utils.dist(player, t) < 15;
                    enemies.forEach(e => { if (Utils.dist(e, t) < 15) triggered = true; });
                    if (triggered) { t.active = true; sfx.click(); addFloatingText(t.x, t.y - 20, "ВЗРЫВ!"); }
                } else {
                    t.timer--;
                    if (t.timer <= 0) {
                        sfx.explosion(); ParticleSystem.spawn(t.x, t.y, 60); makeNoise(t.x, t.y, 500);
                        if (!uiState.godMode && !player.isDashing && Utils.dist(player, t) < 60) restartRoom();
                        for (let j = enemies.length - 1; j >= 0; j--) { if (Utils.dist(enemies[j], t) < 60) killEnemy(j); }
                        traps_mine.splice(index, 1);
                    }
                }
            });
        }
    };

    const TrapRenderer = {
        draw(ctx, visibleCells) {
            ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.font = 'bold 20px "IBM Plex Mono", monospace';
            let isMapFull = uiState.seeAllMap;
            traps_pit.forEach(p => { if (isMapFull || visibleCells[`${Math.floor(p.x/TILE_SIZE)},${Math.floor(p.y/TILE_SIZE)}`]) { ctx.fillStyle = '#333'; ctx.fillText("O", p.x, p.y); } });
            traps_spike.forEach(s => { if (isMapFull || visibleCells[`${Math.floor(s.x/TILE_SIZE)},${Math.floor(s.y/TILE_SIZE)}`]) { ctx.fillStyle = '#fff'; let ch = s.state === 0 ? '.' : (s.state === 1 ? ':' : '^'); ctx.fillText(ch, s.x, s.y); } });
            hazards_blade.forEach(b => { if (isMapFull || visibleCells[`${Math.floor(b.x/TILE_SIZE)},${Math.floor(b.y/TILE_SIZE)}`]) { ctx.fillStyle = '#fff'; ctx.save(); ctx.translate(b.x, b.y); ctx.rotate(Date.now() / 100); ctx.fillText("X", 0, 0); ctx.restore(); } });
            plates.forEach(p => { 
                if (isMapFull || visibleCells[`${Math.floor(p.x/TILE_SIZE)},${Math.floor(p.y/TILE_SIZE)}`]) { 
                    ctx.fillStyle = '#fff'; ctx.fillText(p.pressed ? "[_]" : "[^]", p.x, p.y); 
                    if (p.pressed && p.timer > 0 && p.timer !== Infinity) { drawText1bit(ctx, Math.ceil(p.timer/60) + "s", p.x, p.y - 15); }
                } 
            });
            traps_mine.forEach(t => { if (t.active && (isMapFull || visibleCells[`${Math.floor(t.x/TILE_SIZE)},${Math.floor(t.y/TILE_SIZE)}`])) { ctx.fillStyle = '#fff'; if (shouldPulse(150)) ctx.fillText(`[${Math.ceil(t.timer/60)}]`, t.x, t.y); } });
            mirrors.forEach(m => { 
                if (isMapFull || visibleCells[`${Math.floor(m.x/TILE_SIZE)},${Math.floor(m.y/TILE_SIZE)}`]) { 
                    ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.strokeRect(m.x + 2, m.y + 2, m.w - 4, m.h - 4);
                    drawText1bit(ctx, "//", m.x + m.w/2, m.y + m.h/2);
                } 
            });
            barrels.forEach(b => {
                if (isMapFull || visibleCells[`${Math.floor(b.x/TILE_SIZE)},${Math.floor(b.y/TILE_SIZE)}`]) { 
                    ctx.fillStyle = '#fff'; 
                    let ch = b.type === 'water' ? '[В]' : (b.type === 'oil' ? '[М]' : '[*]');
                    ctx.fillText(ch, b.x, b.y); 
                } 
            });
        }
    };

    // --- UI lil-gui ---
    const gui = new GUI({ title: 'Терминал ОС', container: document.getElementById('guiContainer') });
    const sysFolder = gui.addFolder('Система');
    const uiState = { room: 1, ammo: "6/6", dash: "ГОТОВ", credits: "0", godMode: false, seeAllEnemies: false, seeAllMap: false };
    
    sysFolder.add(uiState, 'room').name('Уровень').listen().disable();
    sysFolder.add(uiState, 'ammo').name('Патроны').listen().disable();
    sysFolder.add(uiState, 'dash').name('Рывок').listen().disable();
    sysFolder.add(uiState, 'credits').name('Кредиты').listen().disable();
    sysFolder.add(uiState, 'godMode').name('Режим Бога');
    sysFolder.add(uiState, 'seeAllEnemies').name('Радар: Враги');
    sysFolder.add(uiState, 'seeAllMap').name('Радар: Карта').onChange(updateStaticCanvas);
    
    const invBtnObj = {
        open: () => { if (gameState === 'PLAYING') { gameState = 'INVENTORY'; activeChest = null; invAnimProgress = 0; sfx.click(); } },
        spawnBarrel: () => { if (gameState === 'PLAYING') { barrels.push({ id: Math.random(), x: player.x, y: player.y, radius: 10, type: ['water','oil','explosive'][Math.floor(Math.random()*3)] }); } }
    };
    gui.add(invBtnObj, 'open').name('ОТКРЫТЬ ИНВЕНТАРЬ [TAB]');
    sysFolder.add(invBtnObj, 'spawnBarrel').name('Спавн бочки');

    function updateUI() {
        uiState.room = roomLevel;
        uiState.ammo = player.isReloading ? "ПЕРЕЗАРЯДКА" : `${player.ammo}/${player.computedStats.maxAmmo}`;
        uiState.credits = `$ ${player.credits}`;
    }

    function updateSidePanel() {
        const nodeInfo = document.getElementById('nodeInfo');
        if (gameState !== 'GLOBAL_MAP') { nodeInfo.style.display = 'none'; return; }
        let targetId = hoveredNodeId !== null ? hoveredNodeId : selectedNodeId;
        if (targetId !== null) {
            let node = globalMap.nodes[targetId];
            let nType = node.type;
            document.getElementById('niTitle').innerText = nType === 'merchant' ? "ТОРГОВЕЦ" : (nType === 'shrine' ? "СВЯТИЛИЩЕ" : (node.next.length === 0 ? "КОМНАТА БОССА" : "ОБЫЧНАЯ КОМНАТА"));
            document.getElementById('niDesc').innerText = nType === 'merchant' ? "Здесь можно отдохнуть и купить припасы." : (nType === 'shrine' ? "Место силы. Восстанови свою Волю." : (node.next.length === 0 ? "Смертельная опасность. Назад пути нет." : "Возможны враги, ловушки и артефакты."));
            let statusText = "", isBlink = false;
            if (node.status === 'available') {
                if (selectedNodeId === node.id) { statusText = "[ КЛИКНИТЕ ДЛЯ ВХОДА ]"; isBlink = true; } else { statusText = "ДОСТУПНО"; }
            } else if (node.status === 'completed') { statusText = "ПРОЙДЕНО"; } else { statusText = "ЗАБЛОКИРОВАНО"; }
            let statusEl = document.getElementById('niStatus'); statusEl.innerText = statusText; statusEl.className = isBlink ? "blink" : "";
            nodeInfo.style.display = 'block';
        } else nodeInfo.style.display = 'none';
    }
    
    events.on('player.damage', (e) => { 
        if (uiState.godMode) { e.preventDamage(); return; }
        if (hasComponent(world, C_Chalice, player.eid) && Math.random() < 0.5) { e.preventDamage(); ParticleSystem.spawn(player.x, player.y, 30); } 
    });
    
    events.on('player.shoot', (e) => {
        if (!player.equippedWeaponInstanceId || player.carryingBarrel) return;
        
        if (player.status === 'petroleum') {
            sfx.explosion(); ParticleSystem.spawn(player.x, player.y, 60);
            player.status = null; currentWill = 0; gameState = 'GAME_OVER'; sfx.gameOver(); updateUI(); return;
        }

        let now = Date.now();
        if (now - player.lastShotTime > 2000) player.consecutiveShots = 0;
        player.consecutiveShots++;
        player.lastShotTime = now;

        sfx.playerShoot(); CDManager.set('shoot', player.computedStats.shootCooldown);
        makeNoise(player.x, player.y, 300);

        let projs = player.computedStats.projectiles || 1;
        let baseSpread = player.computedStats.spreadAngle || 0;
        let spread = baseSpread + (player.consecutiveShots * 0.05); 
        let startOffset = - (projs - 1) * spread / 2;

        for(let i = 0; i < projs; i++) {
            let jitter = (Math.random() - 0.5) * spread * 0.5; 
            let angle = player.angle + startOffset + (i * spread) + jitter;
            bullets.push({ x: player.x + Math.cos(angle) * player.radius, y: player.y + Math.sin(angle) * player.radius, vx: Math.cos(angle) * 5, vy: Math.sin(angle) * 5, isEnemy: false, radius: 3 });
        }
    });

    function generateGlobalMap() {
        const layersCount = 6; let idCounter = 0; globalMap = { nodes: {}, layers: [] };
        for (let i = 0; i < layersCount; i++) {
            let layerNodes = []; let numNodes = (i === 0 || i === layersCount - 1) ? 1 : 2 + Math.floor(window.ROT.RNG.getUniform() * 3);
            let layerY = GAME_HEIGHT - 100 - (i * (GAME_HEIGHT - 200) / (layersCount - 1));
            for (let j = 0; j < numNodes; j++) {
                let spacing = GAME_WIDTH / (numNodes + 1); let nodeX = spacing * (j + 1) + (window.ROT.RNG.getUniform() - 0.5) * 60;
                let node = { id: idCounter++, layer: i, x: nodeX, y: layerY, type: 'simple', next: [], status: i === 0 ? 'available' : 'locked' };
                layerNodes.push(node); globalMap.nodes[node.id] = node;
            }
            globalMap.layers.push(layerNodes);
        }
        for (let i = 0; i < layersCount - 1; i++) {
            let currLayer = globalMap.layers[i], nextLayer = globalMap.layers[i+1];
            currLayer.forEach(cNode => { let target = nextLayer[Math.floor(window.ROT.RNG.getUniform() * nextLayer.length)]; if (!cNode.next.includes(target.id)) cNode.next.push(target.id); });
            nextLayer.forEach(nNode => {
                let hasIncoming = currLayer.some(c => c.next.includes(nNode.id));
                if (!hasIncoming) { let source = currLayer[Math.floor(window.ROT.RNG.getUniform() * currLayer.length)]; if (!source.next.includes(nNode.id)) source.next.push(nNode.id); }
            });
        }
        
        let l2 = globalMap.layers[2]; if (l2 && l2.length > 0) l2[Math.floor(window.ROT.RNG.getUniform()*l2.length)].type = 'merchant';
        let l4 = globalMap.layers[4]; if (l4 && l4.length > 0) l4[Math.floor(window.ROT.RNG.getUniform()*l4.length)].type = 'shrine';

        currentNodeId = null; selectedNodeId = null; updateSidePanel();
    }

    function initRun() {
        world = createWorld(); playerEid = addEntity(world); player.eid = playerEid; inventoryItems = [];
        currentWill = 100; roomLevel = 1; player.credits = 0;

        let starterPistol = { id: 'pistol', x: 0, y: 0, instanceId: window.ROT.RNG.getUniform() };
        inventoryItems.push(starterPistol);
        player.equippedWeaponInstanceId = starterPistol.instanceId;

        updateEquippedStats(); 
        player.ammo = player.computedStats.maxAmmo; player.isReloading = false; player.reloadTimer = 0;
        updateUI(); generateGlobalMap(); gameState = 'GLOBAL_MAP';
    }

    function updateMousePos(e) {
        const rect = canvas.getBoundingClientRect();
        mouse.x = (e.clientX - rect.left) * (canvas.width / rect.width);
        mouse.y = (e.clientY - rect.top) * (canvas.height / rect.height);
    }

    window.addEventListener('keydown', (e) => { 
        resumeAudio(); 
        if (e.code in keys) keys[e.code] = true;
        
        if (e.code === 'Space' && CDManager.ready('dash') && !player.isDashing && gameState === 'PLAYING') { player.isAimingDash = true; }
        
        if (e.code === 'Tab') {
            e.preventDefault(); 
            if (gameState === 'PLAYING') { gameState = 'INVENTORY'; activeChest = null; invAnimProgress = 0; sfx.click(); } 
            else if (gameState === 'INVENTORY' && activeChest === null) { gameState = 'PLAYING'; sfx.click(); }
        }

        if (e.code === 'KeyE' && gameState === 'PLAYING') {
            keys.KeyE = false;
            if (player.carryingBarrel) {
                let px = Math.floor(player.x / TILE_SIZE); let py = Math.floor(player.y / TILE_SIZE);
                if (isPassable(px, py)) {
                    let newBrl = { id: Math.random(), x: player.x, y: player.y, radius: 10, type: player.carryingBarrel };
                    barrels.push(newBrl); player.carryingBarrel = null; sfx.click();
                    let cell = fluidGrid[px][py];
                    if (cell && (cell.type === 'oil' || cell.type === 'petroleum') && cell.fire === 0) { FluidSystem.ignite(px, py); } 
                    else if (cell && cell.fire > 0) { setTimeout(() => { let idx = barrels.indexOf(newBrl); if (idx > -1) destroyBarrel(idx); }, 500); }
                }
            } else {
                let nearBarrelIdx = barrels.findIndex(b => Utils.dist(player, b) < 30);
                if (nearBarrelIdx !== -1) {
                    player.carryingBarrel = barrels[nearBarrelIdx].type; barrels.splice(nearBarrelIdx, 1); sfx.click();
                } else {
                    let nearChest = chests.find(c => !c.opened && Utils.dist(player, c) < 30);
                    if (nearChest) {
                        let amt = Math.floor(Math.random()*15) + 10; player.credits += amt; addFloatingText(nearChest.x, nearChest.y - 20, `+${amt} CR`, '#ff0'); updateUI();
                        activeChest = nearChest; chestLootItems = nearChest.loot; gameState = 'INVENTORY'; invAnimProgress = 0; sfx.doorOpen();
                    } else {
                        let nearNPC = npcs.find(n => Utils.dist(player, n) < 40);
                        if (nearNPC) { activeNPC = nearNPC; if (!activeNPC.currentNode) activeNPC.currentNode = activeNPC.dialogTree; gameState = 'DIALOG'; }
                    }
                }
            }
        }
    });

    window.addEventListener('keyup', (e) => { 
        if (e.code in keys) keys[e.code] = false; 
        if (e.code === 'Space' && player.isAimingDash) {
            player.isAimingDash = false;
            sfx.dash(); player.isDashing = true; player.dashTimer = player.baseStats.dashDuration || 8; 
            CDManager.set('dash', player.computedStats.dashCooldown);
            let inputDx = 0, inputDy = 0; if (keys.KeyW) inputDy -= 1; if (keys.KeyS) inputDy += 1; if (keys.KeyA) inputDx -= 1; if (keys.KeyD) inputDx += 1;
            player.dashAngle = (inputDx !== 0 || inputDy !== 0) ? Math.atan2(inputDy, inputDx) : player.angle;
        }
    });
    
    canvas.addEventListener('mousemove', (e) => {
        updateMousePos(e);
        if (gameState === 'GLOBAL_MAP') {
            hoveredNodeId = null;
            for (let id in globalMap.nodes) if (Utils.distSq(mouse, globalMap.nodes[id]) < 625) { hoveredNodeId = globalMap.nodes[id].id; break; }
            updateSidePanel();
        }
    });
    
    canvas.addEventListener('mousedown', (e) => {
        updateMousePos(e); resumeAudio(); if (e.button === 0) mouse.clicked = true;

        if (gameState === 'INVENTORY') {
            let clickedButton = false;
            if (mouse.x > INV_WIN.x + INV_WIN.w - 30 && mouse.x < INV_WIN.x + INV_WIN.w - 10 && mouse.y > INV_WIN.y + 10 && mouse.y < INV_WIN.y + 30) {
                clickedButton = true; sfx.click(); gameState = 'PLAYING'; activeChest = null; return;
            }

            if (selectedItemInstanceId) {
                let db = ITEMS_DB[inventoryItems.find(i => i.instanceId === selectedItemInstanceId)?.id];
                if (db) {
                    let btnEquipHit = mouse.x > INV_WIN.x + 280 && mouse.x < INV_WIN.x + 420 && mouse.y > INV_WIN.y + 140 && mouse.y < INV_WIN.y + 170;
                    let btnDestroyHit = mouse.x > INV_WIN.x + 280 && mouse.x < INV_WIN.x + 420 && mouse.y > INV_WIN.y + 180 && mouse.y < INV_WIN.y + 210;
                    
                    if (btnEquipHit && db.type === 'weapon') {
                        clickedButton = true;
                        if (player.equippedWeaponInstanceId === selectedItemInstanceId) unequipWeapon(); else equipWeapon(selectedItemInstanceId);
                        sfx.click(); return;
                    }
                    if (btnDestroyHit) { clickedButton = true; destroyItem(selectedItemInstanceId); return; }
                }
            }

            if (activeChest) {
                if (mouse.x > CHEST_WIN.x + CHEST_WIN.w - 30 && mouse.x < CHEST_WIN.x + CHEST_WIN.w - 10 && mouse.y > CHEST_WIN.y + 10 && mouse.y < CHEST_WIN.y + 30) {
                    clickedButton = true; if (chestLootItems.length === 0) activeChest.opened = true; sfx.click(); gameState = 'PLAYING'; activeChest = null; return;
                }
                if (mouse.x > CHEST_WIN.x + 20 && mouse.x < CHEST_WIN.x + CHEST_WIN.w - 20 && mouse.y > CHEST_WIN.y + CHEST_WIN.h - 40 && mouse.y < CHEST_WIN.y + CHEST_WIN.h - 10) {
                    clickedButton = true; sfx.chestOpen();
                    for (let i = chestLootItems.length - 1; i >= 0; i--) {
                        let it = chestLootItems[i]; let spot = findFreeSpot(it, inventoryItems, INV_COLS, INV_ROWS);
                        if (spot) { it.x = spot.x; it.y = spot.y; inventoryItems.push(it); chestLootItems.splice(i, 1); }
                    }
                    updateEquippedStats(); if (chestLootItems.length === 0) activeChest.opened = true; return;
                }
            }

            let invObj = getItemAtPixel(mouse.x, mouse.y, INV_WIN.x + 20, INV_WIN.y + 50, inventoryItems);
            if (invObj) {
                selectedItemInstanceId = invObj.item.instanceId;
                draggingItem = { ...invObj, sourceGrid: 'inventory', oldX: invObj.item.x, oldY: invObj.item.y };
                inventoryItems = inventoryItems.filter(it => it.instanceId !== invObj.item.instanceId);
                sfx.click(); return;
            }

            if (activeChest) {
                let chestObj = getItemAtPixel(mouse.x, mouse.y, CHEST_WIN.x + 20, CHEST_WIN.y + 50, chestLootItems);
                if (chestObj) {
                    selectedItemInstanceId = null; 
                    draggingItem = { ...chestObj, sourceGrid: 'chest', oldX: chestObj.item.x, oldY: chestObj.item.y };
                    chestLootItems = chestLootItems.filter(it => it.instanceId !== chestObj.item.instanceId);
                    sfx.click(); return;
                }
            }

            if (!clickedButton) { selectedItemInstanceId = null; }
        }

        if (gameState === 'EXIT_CONFIRM') {
            let cx = GAME_WIDTH/2, cy = GAME_HEIGHT/2;
            if (mouse.x > cx - 120 && mouse.x < cx - 20 && mouse.y > cy + 20 && mouse.y < cy + 60) { sfx.click(); exitRoom(); } 
            else if (mouse.x > cx + 20 && mouse.x < cx + 120 && mouse.y > cy + 20 && mouse.y < cy + 60) { sfx.click(); gameState = 'PLAYING'; player.y += 50; }
            return;
        }

        if (gameState === 'DIALOG' && activeNPC) {
            let bottomY = GAME_HEIGHT - 80; let optWidth = (GAME_WIDTH - 120) / 2; let node = activeNPC.currentNode;
            
            if (mouse.x > 50 && mouse.x < 50 + optWidth && mouse.y > bottomY + 30 && mouse.y < bottomY + 60) {
                sfx.click();
                if (node.options[0].action === 'close') { gameState = 'PLAYING'; activeNPC = null; } 
                else if (node.options[0].action === 'buy_random') {
                    if (player.credits >= 50) {
                        let itemKeys = Object.keys(ITEMS_DB); let rndItem = itemKeys[Math.floor(Math.random() * itemKeys.length)];
                        let spot = findFreeSpot({id: rndItem, instanceId: 1}, inventoryItems, INV_COLS, INV_ROWS);
                        if (spot) {
                            player.credits -= 50; inventoryItems.push({ id: rndItem, x: spot.x, y: spot.y, instanceId: Math.random() });
                            activeNPC.currentNode = { text: "Товар в рюкзаке.", options: [{text: "[Закрыть]", action: 'close'}] }; sfx.chestOpen();
                        } else { activeNPC.currentNode = { text: "Рюкзак полон.", options: [{text: "[Закрыть]", action: 'close'}] }; }
                    } else { activeNPC.currentNode = { text: "Недостаточно кредитов.", options: [{text: "[Закрыть]", action: 'close'}] }; }
                    updateUI();
                }
                else if (node.options[0].action === 'heal') {
                    if (player.credits >= 30) {
                        if (currentWill < 100) { player.credits -= 30; currentWill = Math.min(100, currentWill + 20); activeNPC.currentNode = { text: "Воля восстановлена.", options: [{text: "[Закрыть]", action: 'close'}] }; sfx.hit(); } 
                        else { activeNPC.currentNode = { text: "Твоя Воля полна.", options: [{text: "[Закрыть]", action: 'close'}] }; }
                    } else { activeNPC.currentNode = { text: "Недостаточно даров.", options: [{text: "[Закрыть]", action: 'close'}] }; }
                    updateUI();
                }
                else { activeNPC.currentNode = node.options[0].next; }
            }
            else if (node.options[1] && mouse.x > 70 + optWidth && mouse.x < 70 + optWidth * 2 && mouse.y > bottomY + 30 && mouse.y < bottomY + 60) {
                sfx.click();
                if (node.options[1].action === 'close') { gameState = 'PLAYING'; activeNPC = null; } else { activeNPC.currentNode = node.options[1].next; }
            }
            return;
        }

        if (gameState === 'GLOBAL_MAP') {
            if (hoveredNodeId !== null) {
                let node = globalMap.nodes[hoveredNodeId];
                if (node.status === 'available') {
                    if (selectedNodeId === node.id) { sfx.click(); currentNodeId = node.id; selectedNodeId = null; generateRoom(); } 
                    else { sfx.click(); selectedNodeId = node.id; }
                }
            } else { selectedNodeId = null; }
            updateSidePanel(); return;
        }

        if (gameState === 'GAME_OVER' || gameState === 'VICTORY') initRun();
    });
    
    canvas.addEventListener('mouseup', (e) => { 
        if (e.button === 0) mouse.clicked = false; 

        if (gameState === 'INVENTORY' && draggingItem) {
            let dropX = mouse.x - draggingItem.offsetX; let dropY = mouse.y - draggingItem.offsetY;

            let trashY = INV_WIN.y + INV_WIN.h - 40;
            if (mouse.x > INV_WIN.x + 20 && mouse.x < INV_WIN.x + INV_WIN.w - 20 && mouse.y > trashY && mouse.y < trashY + 30) {
                if (globalMap.nodes[currentNodeId]?.type === 'merchant') { player.credits += 20; sfx.click(); } else { sfx.hit(); }
                draggingItem = null; updateEquippedStats(); return;
            }

            let invGridOffX = INV_WIN.x + 20; let invGridOffY = INV_WIN.y + 50;
            let dropInvX = Math.round((dropX - invGridOffX) / SLOT_SIZE); let dropInvY = Math.round((dropY - invGridOffY) / SLOT_SIZE);
            
            let chestGridOffX = CHEST_WIN.x + 20; let chestGridOffY = CHEST_WIN.y + 50;
            let dropChestX = Math.round((dropX - chestGridOffX) / SLOT_SIZE); let dropChestY = Math.round((dropY - chestGridOffY) / SLOT_SIZE);

            if (dropInvX >= -2 && dropInvX < INV_COLS && dropInvY >= -2 && dropInvY < INV_ROWS) {
                if (canPlaceItem(draggingItem.item, dropInvX, dropInvY, inventoryItems, INV_COLS, INV_ROWS)) {
                    draggingItem.item.x = dropInvX; draggingItem.item.y = dropInvY;
                    inventoryItems.push(draggingItem.item); sfx.click(); draggingItem = null; updateEquippedStats(); return;
                }
            } else if (activeChest && dropChestX >= -2 && dropChestX < CHEST_WIN.cols && dropChestY >= -2 && dropChestY < CHEST_WIN.rows) {
                if (canPlaceItem(draggingItem.item, dropChestX, dropChestY, chestLootItems, CHEST_WIN.cols, CHEST_WIN.rows)) {
                    if (player.equippedWeaponInstanceId === draggingItem.item.instanceId) unequipWeapon();
                    if (selectedItemInstanceId === draggingItem.item.instanceId) selectedItemInstanceId = null;
                    draggingItem.item.x = dropChestX; draggingItem.item.y = dropChestY;
                    chestLootItems.push(draggingItem.item); sfx.click(); draggingItem = null; updateEquippedStats(); return;
                }
            }

            draggingItem.item.x = draggingItem.oldX; draggingItem.item.y = draggingItem.oldY;
            if (draggingItem.sourceGrid === 'inventory') inventoryItems.push(draggingItem.item); else chestLootItems.push(draggingItem.item);
            sfx.click(); draggingItem = null; updateEquippedStats();
        }
    });

    function resolveCollision(circle, rect) {
        let testX = circle.x, testY = circle.y, insideX = false, insideY = false;
        if (circle.x < rect.x) testX = rect.x; else if (circle.x > rect.x + rect.w) testX = rect.x + rect.w; else insideX = true;
        if (circle.y < rect.y) testY = rect.y; else if (circle.y > rect.y + rect.h) testY = rect.y + rect.h; else insideY = true;
        if (insideX && insideY) {
            let dl = circle.x - rect.x, dr = (rect.x + rect.w) - circle.x, dt = circle.y - rect.y, db = (rect.y + rect.h) - circle.y;
            let min = Math.min(dl, dr, dt, db);
            if (min === dl) circle.x = rect.x - circle.radius; else if (min === dr) circle.x = rect.x + rect.w + circle.radius;
            else if (min === dt) circle.y = rect.y - circle.radius; else if (min === db) circle.y = rect.y + rect.h + circle.radius;
            return;
        }
        let distX = circle.x - testX, distY = circle.y - testY, distance = Math.sqrt(distX*distX + distY*distY);
        if (distance < circle.radius) { let overlap = circle.radius - distance; if (distance > 0) { circle.x += (distX / distance) * overlap; circle.y += (distY / distance) * overlap; } }
    }

    function isPassable(x, y) {
        if (x < 0 || y < 0 || x >= MAP_COLS || y >= MAP_ROWS) return false;
        let isSecDoor = secretDoors.some(d => d.x === x && d.y === y);
        if (grid[x][y] === 1) { if (isSecDoor && secretRoomOpen) {} else { return false; } }
        if (startDoor && !startDoor.open && y === 22 && x >= 17 && x <= 22) return false;
        for(let p of traps_pit) if (Utils.distSq({x: x*TILE_SIZE+TILE_SIZE/2, y: y*TILE_SIZE+TILE_SIZE/2}, p) < TILE_SIZE*TILE_SIZE) return false;
        for(let s of traps_spike) if (Utils.distSq({x: x*TILE_SIZE+TILE_SIZE/2, y: y*TILE_SIZE+TILE_SIZE/2}, s) < TILE_SIZE*TILE_SIZE) return false;
        return true;
    }

    const wallChars = { 0: '■', 1: '║', 2: '║', 3: '║', 4: '═', 5: '╚', 6: '╔', 7: '╠', 8: '═', 9: '╝', 10: '╗', 11: '╣', 12: '═', 13: '╩', 14: '╦', 15: '╬' };
    function getWallChar(x, y) {
        let n = (y > 0 && grid[x][y-1] === 1) ? 1 : 0; let s = (y < MAP_ROWS-1 && grid[x][y+1] === 1) ? 2 : 0;
        let e = (x < MAP_COLS-1 && grid[x+1][y] === 1) ? 4 : 0; let w = (x > 0 && grid[x-1][y] === 1) ? 8 : 0;
        return wallChars[n + s + e + w] || '#';
    }

    function generateRoom() {
        bullets = []; enemies = []; npcs = []; traps_mine = []; traps_pit = []; traps_spike = []; hazards_blade = []; plates = []; mirrors = [];
        doors = []; obstacles = []; chests = []; floatingTexts = []; explored = []; visibleCells = {};
        barrels = []; fluidGrid = Array.from({length: MAP_COLS}, () => Array(MAP_ROWS).fill(null));
        secretRoomOpen = false; secretDoors = []; secretDoorObstacles = []; secretRoomCells = []; runes = [];
        roomActive = false; combatIntensity = 0; gameState = 'PLAYING'; updateSidePanel(); player.x = GAME_WIDTH / 2; player.y = 520;
        exitLocked = false; roomClearTimer = 0; activeChest = null; draggingItem = null; selectedItemInstanceId = null; player.carryingBarrel = null;
        player.status = null; player.statusTimer = 0;

        let node = globalMap.nodes[currentNodeId];

        if (node && (node.type === 'merchant' || node.type === 'shrine')) {
            for (let x = 0; x < MAP_COLS; x++) { grid[x] = new Array(MAP_ROWS).fill(1); explored[x] = new Array(MAP_ROWS).fill(false); }
            
            let cx = Math.floor(MAP_COLS/2), cy = 10; 
            for(let x = cx - 5; x <= cx + 5; x++) for(let y = cy - 5; y <= cy + 5; y++) grid[x][y] = 0;
            
            for(let y = cy + 5; y < 22; y++) { grid[cx][y] = 0; grid[cx-1][y] = 0; grid[cx+1][y] = 0; }
            for (let x = 16; x <= 23; x++) { for (let y = 19; y < 22; y++) { grid[x][y] = 0; } }
            for (let x = 0; x < MAP_COLS; x++) { for (let y = 22; y < MAP_ROWS; y++) { if (x >= 17 && x <= 22) grid[x][y] = 0; else grid[x][y] = 1; } }
            
            startDoor = { x: 340, y: 440, w: 120, h: 20, open: false };
            exitRoomCenter = { x: cx * TILE_SIZE, y: (cy - 5) * TILE_SIZE };
            spawnDoors();
            
            if (node.type === 'merchant') {
                npcs.push({ x: cx*TILE_SIZE, y: cy*TILE_SIZE, radius: 10, dialogTree: { text: "ТОРГОВЕЦ: Приветствую. У меня есть товары.\n50 КРЕДИТОВ за случайный предмет.", options: [ { text: "[Купить (50 CR)]", action: 'buy_random' }, { text: "[Уйти]", action: 'close' } ] }, currentNode: null });
            } else {
                npcs.push({ x: cx*TILE_SIZE, y: cy*TILE_SIZE, radius: 15, dialogTree: { text: "АЛТАРЬ: Пожертвуй богатство для Воли.", options: [ { text: "[Лечение (30 CR)]", action: 'heal' }, { text: "[Уйти]", action: 'close' } ] }, currentNode: null, isAltar: true });
            }
            roomSnapshot = { inventoryItems: inventoryItems.map(it => ({...it})), equippedWeaponInstanceId: player.equippedWeaponInstanceId, enemies: [], npcs: npcs.map(n => ({...n, currentNode: null})), barrels: [], fluidGrid: Array.from({length: MAP_COLS}, () => Array(MAP_ROWS).fill(null)), traps_mine: [], traps_pit: [], traps_spike: [], hazards_blade: [], plates: [], secretRoomOpen: false, runes: [], chests: [] };
            updateStaticCanvas(); updateUI(); return;
        }

        for (let x = 0; x < MAP_COLS; x++) { grid[x] = new Array(MAP_ROWS).fill(1); explored[x] = new Array(MAP_ROWS).fill(false); }

        let digger = new window.ROT.Map.Digger(MAP_COLS, 22, { roomWidth: [4, 8], roomHeight: [4, 8], corridorLength: [2, 5], dugPercentage: 0.3 });
        digger.create(function(x, y, value) { grid[x][y] = value; });
        let rooms = digger.getRooms();

        let closestRoom = rooms.reduce((closest, room) => {
            let cx = room.getCenter()[0], cy = room.getCenter()[1], dist = Math.hypot(cx - (MAP_COLS / 2), cy - 22);
            if (!closest || dist < closest.dist) return { room, dist, cx, cy }; return closest;
        }, null);

        let pathX = Math.floor(MAP_COLS / 2), pathY = 21;
        while (pathY >= closestRoom.cy) { grid[pathX][pathY] = 0; grid[pathX - 1][pathY] = 0; grid[pathX + 1][pathY] = 0; pathY--; }
        while (pathX < closestRoom.cx) { grid[pathX][pathY] = 0; grid[pathX][pathY + 1] = 0; grid[pathX][pathY - 1] = 0; pathX++; }
        while (pathX > closestRoom.cx) { grid[pathX][pathY] = 0; grid[pathX][pathY + 1] = 0; grid[pathX][pathY - 1] = 0; pathX--; }
        for (let x = 16; x <= 23; x++) { for (let y = 19; y < 22; y++) { grid[x][y] = 0; } }
        for (let x = 0; x < MAP_COLS; x++) { for (let y = 22; y < MAP_ROWS; y++) { if (x >= 17 && x <= 22) grid[x][y] = 0; else grid[x][y] = 1; } }
        
        startDoor = { x: 340, y: 440, w: 120, h: 20, open: false };
        let topRoom = rooms.reduce((top, room) => (!top || room.getCenter()[1] < top.getCenter()[1]) ? room : top, null);
        exitRoomCenter = { x: topRoom.getCenter()[0] * TILE_SIZE, y: topRoom.getCenter()[1] * TILE_SIZE };

        let deadEndRooms = [];
        rooms.forEach(r => {
            if (r === topRoom || r === closestRoom) return;
            let doorCount = 0; r.getDoors(() => doorCount++);
            if (doorCount === 1) deadEndRooms.push(r);
        });

        if (deadEndRooms.length > 0 && Math.random() < 0.5) {
            let secretRoom = deadEndRooms[Math.floor(Math.random() * deadEndRooms.length)];
            for (let x = secretRoom.getLeft(); x <= secretRoom.getRight(); x++) for (let y = secretRoom.getTop(); y <= secretRoom.getBottom(); y++) secretRoomCells.push({gx: x, gy: y});
            secretRoom.getDoors((x, y) => { 
                secretDoors.push({x, y}); grid[x][y] = 1; 
                for(let dx=-2; dx<=2; dx++) {
                    for(let dy=-2; dy<=2; dy++) {
                        let nx = x + dx, ny = y + dy;
                        if (grid[nx] && grid[nx][ny] === 1 && Math.random() < 0.2) runes.push({x: nx*TILE_SIZE+TILE_SIZE/2, y: ny*TILE_SIZE+TILE_SIZE/2});
                    }
                }
            });
        }

        let emptyCells = [], secretEmptyCells = [];
        for (let x = 0; x < MAP_COLS; x++) {
            for (let y = 0; y < MAP_ROWS; y++) {
                let isSecDoor = secretDoors.some(d => d.x === x && d.y === y);
                if (grid[x][y] === 1 || isSecDoor) {
                    if (isSecDoor) secretDoorObstacles.push({ x: x * TILE_SIZE, y: y * TILE_SIZE, w: TILE_SIZE, h: TILE_SIZE, isMirror: false });
                    else obstacles.push({ x: x * TILE_SIZE, y: y * TILE_SIZE, w: TILE_SIZE, h: TILE_SIZE, isMirror: false });
                } else {
                    let cell = { x: x * TILE_SIZE + TILE_SIZE / 2, y: y * TILE_SIZE + TILE_SIZE / 2, gx: x, gy: y };
                    if (secretRoomCells.some(c => c.gx===x && c.gy===y)) secretEmptyCells.push(cell);
                    else emptyCells.push(cell);
                }
            }
        }
        
        let validSpawns = emptyCells.filter(cell => cell.gy < 18 && Math.hypot(cell.x - exitRoomCenter.x, cell.y - exitRoomCenter.y) > 60);
        const getSpawn = () => validSpawns.length > 0 ? validSpawns.splice(Math.floor(window.ROT.RNG.getUniform() * validSpawns.length), 1)[0] : null;

        const generateLoot = () => {
            let itemKeys = Object.keys(ITEMS_DB);
            let rndItem = itemKeys[Math.floor(window.ROT.RNG.getUniform() * itemKeys.length)];
            return [{ id: rndItem, x: 0, y: 0, instanceId: window.ROT.RNG.getUniform() }];
        };

        if (secretRoomCells.length > 0 && secretEmptyCells.length > 0) {
            let plateSpawn = getSpawn();
            if (plateSpawn) plates.push({ x: plateSpawn.x, y: plateSpawn.y, pressed: false, timer: 0, discovered: false });
            let rewardType = Math.floor(Math.random() * 3);
            let rewardSpawn = secretEmptyCells.splice(Math.floor(Math.random() * secretEmptyCells.length), 1)[0];
            
            if (rewardType === 0) { chests.push({ x: rewardSpawn.x, y: rewardSpawn.y, opened: false, loot: generateLoot() }); } 
            else if (rewardType === 1) {
                npcs.push({ x: rewardSpawn.x, y: rewardSpawn.y, radius: 10, dialogTree: { text: "Я нашел здесь укрытие.\nВозьми мои советы вместо золота.", options: [ { text: "[Спасибо]", next: { text: "Удачи тебе. Она понадобится.", options: [{ text: "[Уйти]", action: "close" }] } } ] }, currentNode: null });
            } else { enemies.push({ id: Math.random(), x: rewardSpawn.x, y: rewardSpawn.y, radius: 10, type: 'chaser', role: 'guard', timer: Math.random() * 60, speed: 0.5, memory: null, fsm: interpret(enemyMachineDef).start(), patrolTarget: null, barkText: "", barkTimer: 0, alertTimer: 0, status: null, statusTimer: 0 }); }
        }

        let safeRooms = rooms.filter(r => r !== topRoom && r !== closestRoom);
        if (Math.random() < 0.5 && safeRooms.length > 0) { 
            let r = safeRooms[Math.floor(window.ROT.RNG.getUniform() * safeRooms.length)];
            let m = { x: r.getCenter()[0] * TILE_SIZE, y: r.getCenter()[1] * TILE_SIZE, w: TILE_SIZE, h: TILE_SIZE, isMirror: true }; 
            mirrors.push(m); obstacles.push(m); validSpawns = validSpawns.filter(sp => sp.gx !== Math.floor(m.x/TILE_SIZE) || sp.gy !== Math.floor(m.y/TILE_SIZE)); 
        }

        let barrelCount = Math.floor(window.ROT.RNG.getUniform() * 3) + 1;
        let barrelCenters = [];
        for (let i = 0; i < barrelCount; i++) {
            if (validSpawns.length === 0) break;
            if (barrelCenters.length > 0) {
                validSpawns.sort((a, b) => Math.min(...barrelCenters.map(c => Utils.dist(b, c))) - Math.min(...barrelCenters.map(c => Utils.dist(a, c))));
            }
            let sp = validSpawns.splice(Math.floor(window.ROT.RNG.getUniform() * Math.min(5, validSpawns.length)), 1)[0];
            barrelCenters.push(sp);
            barrels.push({ id: Math.random(), x: sp.x, y: sp.y, radius: 10, type: window.ROT.RNG.getUniform() < 0.33 ? 'water' : (window.ROT.RNG.getUniform() < 0.66 ? 'oil' : 'explosive') });
        }

        for(let i=0; i < 2; i++) { let sp = getSpawn(); if (sp) traps_pit.push({ x: sp.x, y: sp.y }); }
        for(let i=0; i < 3; i++) { let sp = getSpawn(); if (sp) traps_spike.push({ x: sp.x, y: sp.y, state: 0, timer: 0 }); }
        if (Math.random() < 0.5) { let sp = getSpawn(); if (sp) hazards_blade.push({ startX: sp.x, startY: sp.y, x: sp.x, y: sp.y, vx: 2, vy: 0, range: 60 }); }
        for(let i=0; i < 2; i++) { let sp = getSpawn(); if (sp) traps_mine.push({ x: sp.x, y: sp.y, active: false, timer: 300 }); }
        if (Math.random() < 0.3) { let sp = getSpawn(); if (sp) chests.push({ x: sp.x, y: sp.y, opened: false, loot: generateLoot() }); }
        if (Math.random() < 0.4) {
            let sp = getSpawn();
            if (sp) npcs.push({ x: sp.x, y: sp.y, radius: 10, dialogTree: { text: "Привет, путник. Здесь очень опасно.\nТы ищешь выход из катакомб?", options: [ { text: "[Да, ищу]", next: { text: "Берегись ям 'O' и лезвий 'X'.\nСкрытые плиты '[_]' таят секреты.", options: [{ text: "[Понятно]", action: "close" }] } }, { text: "[Что за ловушки?]", next: { text: "Шипы прячутся в полу.\nА зеркала '//' отражают пули прямо в лоб!", options: [{ text: "[Спасибо]", action: "close" }] } } ] }, currentNode: null });
        }

        let groupsCount = Math.min(3, Math.floor(window.ROT.RNG.getUniform() * 3) + 1 + Math.floor((roomLevel - 1) / 3)); 
        let solosCount = Math.min(7, Math.floor(window.ROT.RNG.getUniform() * 5) + 3 + Math.floor((roomLevel - 1) / 2));   
        let groupCenters = [];

        for (let g = 0; g < groupsCount; g++) {
            if (validSpawns.length === 0) break;
            if (groupCenters.length > 0) validSpawns.sort((a, b) => Math.min(...groupCenters.map(c => Utils.dist(b, c))) - Math.min(...groupCenters.map(c => Utils.dist(a, c))));
            let centerSpawn = validSpawns.splice(Math.floor(window.ROT.RNG.getUniform() * Math.min(5, validSpawns.length)), 1)[0];
            groupCenters.push(centerSpawn);
            
            let groupSize = Math.floor(window.ROT.RNG.getUniform() * 3) + 2; 
            let leaderRole = window.ROT.RNG.getUniform() > 0.5 ? 'patroller' : 'guard';
            let pPath = null;
            if (leaderRole === 'patroller') {
                let distantSpawn = validSpawns.length > 0 ? validSpawns[Math.floor(window.ROT.RNG.getUniform() * validSpawns.length)] : centerSpawn;
                pPath = [{x: centerSpawn.x, y: centerSpawn.y}, {x: distantSpawn.x, y: distantSpawn.y}];
            }

            let leaderObj = null; let shootersInGroup = 0;

            for (let i = 0; i < groupSize; i++) {
                if (validSpawns.length === 0) break;
                let spawnPos = centerSpawn;
                if (i > 0) {
                    validSpawns.sort((a, b) => Utils.distSq(a, centerSpawn) - Utils.distSq(b, centerSpawn));
                    if (validSpawns.length > 0 && Utils.distSq(validSpawns[0], centerSpawn) < 6400) spawnPos = validSpawns.shift(); else break; 
                }
                
                let type = 'chaser'; if (shootersInGroup < 1 && window.ROT.RNG.getUniform() > 0.6) { type = 'shooter'; shootersInGroup++; }
                let role = (i === 0) ? leaderRole : 'follower';
                let followAngle = (i / groupSize) * Math.PI * 2 + window.ROT.RNG.getUniform();
                let followDist = 50 + window.ROT.RNG.getUniform() * 50; 
                
                let en = { 
                    id: Math.random(), x: spawnPos.x, y: spawnPos.y, radius: 10, type: type, role: role, leader: leaderObj,
                    patrolPath: pPath, patrolIndex: 0, followOffX: Math.cos(followAngle) * followDist, followOffY: Math.sin(followAngle) * followDist,
                    timer: window.ROT.RNG.getUniform() * 60, speed: 0.5, memory: null, fsm: interpret(enemyMachineDef).start(), patrolTarget: null, barkText: "", barkTimer: 0, alertTimer: 0, status: null, statusTimer: 0
                };
                if (i === 0) leaderObj = en; enemies.push(en);
            }
        }
        
        for (let i = 0; i < solosCount; i++) {
            if (validSpawns.length === 0) break;
            let spawnPos = validSpawns.splice(Math.floor(window.ROT.RNG.getUniform() * validSpawns.length), 1)[0];
            enemies.push({ 
                id: Math.random(), x: spawnPos.x, y: spawnPos.y, radius: 10, type: window.ROT.RNG.getUniform() > 0.5 ? 'shooter' : 'chaser', 
                role: window.ROT.RNG.getUniform() > 0.5 ? 'wanderer' : 'guard', leader: null, timer: window.ROT.RNG.getUniform() * 60, speed: 0.5, memory: null, fsm: interpret(enemyMachineDef).start(), patrolTarget: null, barkText: "", barkTimer: 0, alertTimer: 0, status: null, statusTimer: 0
            });
        }
        
        roomSnapshot = {
            inventoryItems: inventoryItems.map(it => ({...it})), equippedWeaponInstanceId: player.equippedWeaponInstanceId,
            enemies: enemies.map(e => ({ ...e, fsm: interpret(enemyMachineDef).start() })), npcs: npcs.map(n => ({...n, currentNode: null})),
            barrels: barrels.map(b => ({...b})), fluidGrid: fluidGrid.map(col => col.map(c => c ? {...c} : null)),
            traps_mine: traps_mine.map(t => ({...t})), traps_pit: traps_pit.map(t => ({...t})), traps_spike: traps_spike.map(t => ({...t})), hazards_blade: hazards_blade.map(t => ({...t})),
            plates: plates.map(p => ({...p})), secretRoomOpen: false, runes: runes.map(r => ({...r})), chests: chests.map(c => ({...c, loot: [...c.loot]})) 
        };
        updateStaticCanvas(); updateUI();
    }

    function restartRoom() {
        let damagePrevented = false; events.emit('player.damage', { preventDamage: () => damagePrevented = true });
        if (uiState.godMode) damagePrevented = true; 
        if (damagePrevented) return;

        currentWill -= 20;
        if (currentWill <= 0) { currentWill = 0; gameState = 'GAME_OVER'; sfx.gameOver(); updateUI(); return; }
        
        sfx.hit(); ParticleSystem.spawn(player.x, player.y, 30);
        
        gameState = 'PLAYING'; roomActive = false; combatIntensity = 0; if (startDoor) startDoor.open = false;
        player.x = GAME_WIDTH / 2; player.y = 520; player.trail = []; player.isDashing = false; player.isAimingDash = false; player.carryingBarrel = null;
        player.status = null; player.statusTimer = 0;
        CDManager.set('dash', 0); bullets = []; visibleCells = {}; activeNPC = null; doors = []; activeChest = null; draggingItem = null; selectedItemInstanceId = null;
        
        inventoryItems = roomSnapshot.inventoryItems.map(it => ({...it}));
        player.equippedWeaponInstanceId = roomSnapshot.equippedWeaponInstanceId;
        updateEquippedStats();

        enemies = roomSnapshot.enemies.map(e => ({...e, fsm: interpret(enemyMachineDef).start(), memory: null, barkText: "", barkTimer: 0, alertTimer: 0}));
        npcs = roomSnapshot.npcs.map(n => ({...n, currentNode: null})); barrels = roomSnapshot.barrels.map(b => ({...b})); fluidGrid = roomSnapshot.fluidGrid.map(col => col.map(c => c ? {...c} : null));
        chests = roomSnapshot.chests.map(c => ({...c, loot: [...c.loot]})); traps_mine = roomSnapshot.traps_mine.map(t => ({...t})); traps_pit = roomSnapshot.traps_pit.map(t => ({...t}));
        traps_spike = roomSnapshot.traps_spike.map(t => ({...t})); hazards_blade = roomSnapshot.hazards_blade.map(t => ({...t}));
        plates = roomSnapshot.plates.map(p => ({...p})); setSecretRoomOpen(roomSnapshot.secretRoomOpen); runes = roomSnapshot.runes.map(r => ({...r}));
        floatingTexts = []; roomClearTimer = 0; updateUI();
    }

    function spawnDoors() { doors = [ { x: exitRoomCenter.x - 30, y: exitRoomCenter.y - 20, w: 60, h: 40, type: 'exit' } ]; }

    function exitRoom() {
        let currNode = globalMap.nodes[currentNodeId]; currNode.status = 'completed';
        for(let id in globalMap.nodes) if (globalMap.nodes[id].status === 'available') globalMap.nodes[id].status = 'locked';
        if (currNode.next.length === 0) { gameState = 'VICTORY'; sfx.roomClear(); } else { currNode.next.forEach(nextId => globalMap.nodes[nextId].status = 'available'); roomLevel++; updateUI(); selectedNodeId = null; gameState = 'GLOBAL_MAP'; updateSidePanel(); }
    }

    // --- ИГРОВОЙ ЦИКЛ ОБНОВЛЕНИЯ ---
    function update() {
        frameCounter++; ParticleSystem.update();
        for (let i = floatingTexts.length - 1; i >= 0; i--) { let ft = floatingTexts[i]; ft.y -= 0.5; ft.life--; if (ft.life <= 0) floatingTexts.splice(i, 1); }
        if (roomClearTimer > 0) roomClearTimer--;
        if (gameState === 'INVENTORY') { if (invAnimProgress < 1) invAnimProgress = Math.min(1, invAnimProgress + 0.1); }
        if (gameState !== 'PLAYING') return;

        if (roomActive && frameCounter % 4 === 0) FluidSystem.step();

        if (!exitLocked) { doors.forEach(door => { if (player.x > door.x && player.x < door.x + door.w && player.y > door.y && player.y < door.y + door.h) { gameState = 'EXIT_CONFIRM'; keys.KeyW = false; keys.KeyS = false; keys.KeyA = false; keys.KeyD = false; player.isDashing = false; }}); }
        if (roomActive && enemies.length === 0 && doors.length === 0 && !exitLocked) { spawnDoors(); sfx.roomClear(); roomClearTimer = 180; }

        CDManager.tick(); uiState.dash = CDManager.ready('dash') ? "ГОТОВ" : `ОТКАТ (${Math.ceil(CDManager.ticks['dash']/60)}с)`;
        player.angle = Math.atan2(mouse.y - player.y, mouse.x - player.x);
        for (let i = player.trail.length - 1; i >= 0; i--) { player.trail[i].alpha -= 0.1; if (player.trail[i].alpha <= 0) player.trail.splice(i, 1); }

        let px = Math.floor(player.x / TILE_SIZE), py = Math.floor(player.y / TILE_SIZE);
        let pfCell = fluidGrid[px] && fluidGrid[px][py];
        if (pfCell && pfCell.vol > 0 && pfCell.fire === 0) {
            if (pfCell.type === 'water') { player.status = 'wet'; player.statusTimer = 180; } else if (pfCell.type === 'oil') { player.status = 'oiled'; player.statusTimer = 180; } else if (pfCell.type === 'petroleum') { player.status = 'petroleum'; player.statusTimer = 180; }
        }
        if (player.statusTimer > 0) { player.statusTimer--; if (player.statusTimer <= 0) player.status = null; }
        if (pfCell && pfCell.fire > 0 && !uiState.godMode) { restartRoom(); return; }

        let currentSpeed = player.computedStats.speed;
        if (player.status === 'oiled' || player.status === 'petroleum') currentSpeed *= 0.5; 

        let dx = 0, dy = 0;
        if (player.isDashing) {
            player.dashTimer--; dx = Math.cos(player.dashAngle) * player.baseStats.dashSpeed; dy = Math.sin(player.dashAngle) * player.baseStats.dashSpeed;
            player.trail.push({ x: player.x, y: player.y, alpha: 0.8 }); if (player.dashTimer <= 0) player.isDashing = false;
        } else {
            if (keys.KeyW) dy -= currentSpeed; if (keys.KeyS) dy += currentSpeed; if (keys.KeyA) dx -= currentSpeed; if (keys.KeyD) dx += currentSpeed;
            if (dx !== 0 && dy !== 0) { const length = Math.sqrt(dx * dx + dy * dy); dx = (dx / length) * currentSpeed; dy = (dy / length) * currentSpeed; }
        }

        let steps = player.isDashing ? 4 : 1; let stepDx = dx / steps, stepDy = dy / steps;
        for (let s = 0; s < steps; s++) {
            player.x += stepDx; player.x = Utils.clamp(player.x, player.radius, GAME_WIDTH - player.radius);
            obstacles.forEach(obs => resolveCollision(player, obs)); if (!secretRoomOpen) secretDoorObstacles.forEach(obs => resolveCollision(player, obs)); if (startDoor && !startDoor.open) resolveCollision(player, startDoor);
            
            player.y += stepDy; player.y = Utils.clamp(player.y, player.radius, GAME_HEIGHT - player.radius);
            obstacles.forEach(obs => resolveCollision(player, obs)); if (!secretRoomOpen) secretDoorObstacles.forEach(obs => resolveCollision(player, obs)); if (startDoor && !startDoor.open) resolveCollision(player, startDoor);

            if (startDoor && !startDoor.open && Utils.distSq({x: startDoor.x+startDoor.w/2, y: startDoor.y+startDoor.h/2}, player) < 2500) { startDoor.open = true; roomActive = true; sfx.doorOpen(); ParticleSystem.spawn(startDoor.x+startDoor.w/2, startDoor.y+startDoor.h/2, 20); }
        }

        if (roomActive) TrapSystem.update({ player, enemies, traps_pit, traps_spike, hazards_blade, plates, traps_mine, restartRoom, uiState });

        visibleCells = {};
        let inSteam = fluidGrid[px] && fluidGrid[px][py] && fluidGrid[px][py].steam > 0;
        let fov = new window.ROT.FOV.PreciseShadowcasting(isPassable);
        fov.compute(px, py, inSteam ? 6 : 15, function(x, y, r) {
            let cellCenterX = x * TILE_SIZE + TILE_SIZE/2, cellCenterY = y * TILE_SIZE + TILE_SIZE/2;
            let diff = Math.abs(Math.atan2(cellCenterY - player.y, cellCenterX - player.x) - player.angle);
            if (diff > Math.PI) diff = 2 * Math.PI - diff;
            if (r <= (inSteam?3:5) || diff <= Math.PI / 2.5 / 2) { visibleCells[`${x},${y}`] = true; explored[x][y] = true; }
        });

        if (player.isReloading) {
            player.reloadTimer--;
            if (player.reloadTimer <= 0) { player.isReloading = false; player.ammo = player.computedStats.maxAmmo; updateUI(); addFloatingText(player.x, player.y - 20, "ЗАРЯЖЕНО"); }
        } else if (keys.KeyR && player.ammo < player.computedStats.maxAmmo && !player.carryingBarrel) {
            if (player.equippedWeaponInstanceId) { player.isReloading = true; player.reloadTimer = player.computedStats.reloadDuration; sfx.reload(); addFloatingText(player.x, player.y - 20, "ПЕРЕЗАРЯДКА..."); updateUI(); }
        }

        if (mouse.clicked && CDManager.ready('shoot') && gameState === 'PLAYING' && roomActive && !player.carryingBarrel && player.equippedWeaponInstanceId) {
            if (!player.isReloading) {
                if (player.ammo <= 0) {
                    if (CDManager.ready('emptyClick')) { sfx.empty(); addFloatingText(player.x, player.y - 20, "ПУСТО! [R]"); CDManager.set('emptyClick', 30); }
                } else {
                    player.ammo--; updateUI(); events.emit('player.shoot', { angle: player.angle });
                    if (player.ammo <= 0) { player.isReloading = true; player.reloadTimer = player.computedStats.reloadDuration; sfx.reload(); addFloatingText(player.x, player.y - 20, "АВТО-ПЕРЕЗАРЯДКА"); updateUI(); }
                }
            }
        }

        for (let i = bullets.length - 1; i >= 0; i--) {
            let b = bullets[i]; b.x += b.vx; b.y += b.vy;
            if (b.x < 0 || b.x > GAME_WIDTH || b.y < 0 || b.y > GAME_HEIGHT) { bullets.splice(i, 1); continue; }
            
            let hitWall = false;
            for (let obs of obstacles) {
                if (b.x > obs.x && b.x < obs.x + obs.w && b.y > obs.y && b.y < obs.y + obs.h) {
                    if (obs.isMirror) {
                        let cx = obs.x + obs.w/2, cy = obs.y + obs.h/2;
                        if (Math.abs(b.x - cx) > Math.abs(b.y - cy)) b.vx *= -1; else b.vy *= -1;
                        b.x += b.vx * 2; b.y += b.vy * 2; b.isEnemy = !b.isEnemy; sfx.reflect(); ParticleSystem.spawn(b.x, b.y, 5);
                    } else hitWall = true; break;
                }
            }
            if (!secretRoomOpen && !hitWall) { for (let obs of secretDoorObstacles) if (b.x > obs.x && b.x < obs.x + obs.w && b.y > obs.y && b.y < obs.y + obs.h) hitWall = true; }
            if (!hitWall) {
                for (let j = barrels.length - 1; j >= 0; j--) {
                    let brl = barrels[j]; if (Utils.distSq(brl, b) < (brl.radius + b.radius)**2) { hitWall = true; destroyBarrel(j); break; }
                }
            }
            if (hitWall) { ParticleSystem.spawn(b.x, b.y, 5); bullets.splice(i, 1); continue; }

            if (b.isEnemy) {
                if (!uiState.godMode && !player.isDashing && Utils.distSq(player, b) < (player.radius + b.radius)**2) { restartRoom(); break; }
            } else {
                for (let j = enemies.length - 1; j >= 0; j--) {
                    if (Utils.distSq(enemies[j], b) < (enemies[j].radius + b.radius)**2) { sfx.hit(); killEnemy(j); bullets.splice(i, 1); break; }
                }
            }
        }

        let inCombat = false;
        if (roomActive) {
            enemies.forEach(e => {
                enemies.forEach(other => {
                    if (e !== other) {
                        let dSq = Utils.distSq(e, other);
                        if (dSq > 0 && dSq < 900) { let dist = Math.sqrt(dSq); let push = (30 - dist) / 30; e.x += ((e.x - other.x) / dist) * push * 1.5; e.y += ((e.y - other.y) / dist) * push * 1.5; }
                    }
                });
            });

            enemies.forEach((e, index) => {
                let ex = Math.floor(e.x / TILE_SIZE), ey = Math.floor(e.y / TILE_SIZE);
                let canSeePlayer = false; 
                if (Utils.distSq(e, player) < 144 * 400) { 
                    let efov = new window.ROT.FOV.PreciseShadowcasting(isPassable);
                    efov.compute(ex, ey, 12, function(x, y) { if (x === px && y === py) canSeePlayer = true; });
                }

                let efCell = fluidGrid[ex] && fluidGrid[ex][ey];
                if (efCell && efCell.vol > 0 && efCell.fire === 0) {
                    if (efCell.type === 'water') { e.status = 'wet'; e.statusTimer = 180; } else if (efCell.type === 'oil') { e.status = 'oiled'; e.statusTimer = 180; } else if (efCell.type === 'petroleum') { e.status = 'petroleum'; e.statusTimer = 180; }
                }
                if (e.statusTimer > 0) { e.statusTimer--; if (e.statusTimer <= 0) e.status = null; }
                if (efCell && efCell.fire > 0) { killEnemy(index); return; } 

                let currentState = e.fsm.state.value;

                if (e.role === 'follower' && e.leader) {
                    let lState = e.leader.fsm.state.value;
                    if (lState !== 'patrol' && currentState === 'patrol') {
                        e.memory = e.leader.memory ? { ...e.leader.memory } : null;
                        if (lState === 'investigate') e.fsm.send('HEARD_NOISE');
                        else if (lState === 'alerting' || lState === 'chase' || lState === 'attack') { e.fsm.send('PLAYER_SPOTTED'); e.alertTimer = e.leader.alertTimer || 60; }
                    }
                }

                if (canSeePlayer) { 
                    if (inSteam) { e.memory = { x: px + Math.floor((Math.random()-0.5)*6), y: py + Math.floor((Math.random()-0.5)*6) }; } 
                    else { e.memory = { x: px, y: py }; }
                    
                    if (currentState === 'patrol' || currentState === 'investigate') { e.fsm.send('PLAYER_SPOTTED'); e.alertTimer = 60; } 
                    else if (currentState === 'alerting') { e.alertTimer--; if (e.alertTimer <= 0) e.fsm.send('ALERT_DONE'); } 
                    else if (currentState === 'chase' || currentState === 'attack') { if (Utils.distSq(player, e) < 22500) e.fsm.send('IN_RANGE'); else e.fsm.send('OUT_OF_RANGE'); }
                } else {
                    if (!e.memory) e.fsm.send('PLAYER_LOST'); else if (currentState === 'alerting' || currentState === 'chase' || currentState === 'attack') e.fsm.send('PLAYER_LOST');
                }

                currentState = e.fsm.state.value;
                if (currentState === 'chase' || currentState === 'attack') inCombat = true;
                EnemyActions[currentState](e, canSeePlayer, inSteam, index);
                
                if (e.barkTimer > 0) e.barkTimer--;
                if (e.barkTimer <= 0 && canSeePlayer && currentState !== 'alerting' && Math.random() < 0.005) { e.barkText = ENEMY_BARKS[Math.floor(window.ROT.RNG.getUniform() * ENEMY_BARKS.length)]; e.barkTimer = 90; }
            });
        }
        
        if (roomActive) {
            if (inCombat) combatIntensity = Math.min(1.0, combatIntensity + 0.05); else combatIntensity = Math.max(0.0, combatIntensity - 0.02);
        } else { combatIntensity = 0; }
    }

    function drawGrid(ox, oy, cols, rows) {
        ctx.strokeStyle = '#333'; ctx.lineWidth = 1;
        for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) ctx.strokeRect(ox + c*SLOT_SIZE, oy + r*SLOT_SIZE, SLOT_SIZE, SLOT_SIZE);
    }

    function drawShape(ox, oy, shape, name, isDragging = false, isEquipped = false) {
        ctx.fillStyle = isDragging ? 'rgba(255, 255, 255, 0.7)' : '#fff';
        for (let r = 0; r < shape.length; r++) {
            for (let c = 0; c < shape[r].length; c++) {
                if (shape[r][c]) {
                    ctx.fillRect(ox + c*SLOT_SIZE, oy + r*SLOT_SIZE, SLOT_SIZE, SLOT_SIZE);
                    ctx.strokeStyle = '#000'; ctx.lineWidth = 2; ctx.strokeRect(ox + c*SLOT_SIZE, oy + r*SLOT_SIZE, SLOT_SIZE, SLOT_SIZE);
                    if (isEquipped && r === 0 && c === 0) {
                        ctx.fillStyle = '#000'; ctx.fillRect(ox + c*SLOT_SIZE + 2, oy + r*SLOT_SIZE + 2, 10, 10);
                        ctx.fillStyle = '#fff'; ctx.font = '8px "IBM Plex Mono"'; ctx.fillText('E', ox + c*SLOT_SIZE + 7, oy + r*SLOT_SIZE + 7);
                        ctx.fillStyle = isDragging ? 'rgba(255, 255, 255, 0.7)' : '#fff'; 
                    }
                }
            }
        }
        ctx.fillStyle = '#000'; ctx.font = '10px "IBM Plex Mono", monospace'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(name.substring(0,3), ox + SLOT_SIZE/2, oy + SLOT_SIZE/2);
    }

    function drawInventoryWindow() {
        ctx.fillStyle = 'rgba(0, 0, 0, 0.6)'; ctx.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);
        ctx.save(); ctx.translate(GAME_WIDTH/2, GAME_HEIGHT/2); ctx.scale(invAnimProgress, invAnimProgress); ctx.translate(-GAME_WIDTH/2, -GAME_HEIGHT/2);

        ctx.fillStyle = '#000'; ctx.fillRect(INV_WIN.x, INV_WIN.y, INV_WIN.w, INV_WIN.h);
        ctx.strokeStyle = '#fff'; ctx.lineWidth = 4; ctx.strokeRect(INV_WIN.x, INV_WIN.y, INV_WIN.w, INV_WIN.h);
        ctx.fillStyle = '#222'; ctx.fillRect(INV_WIN.x, INV_WIN.y, INV_WIN.w, 40);
        ctx.fillStyle = '#fff'; ctx.textAlign = 'left'; ctx.font = 'bold 16px "IBM Plex Mono", monospace'; ctx.fillText("РЮКЗАК", INV_WIN.x + 10, INV_WIN.y + 20);
        ctx.strokeRect(INV_WIN.x + INV_WIN.w - 30, INV_WIN.y + 10, 20, 20); ctx.fillText("X", INV_WIN.x + INV_WIN.w - 24, INV_WIN.y + 25);

        let invGridOffX = INV_WIN.x + 20; let invGridOffY = INV_WIN.y + 50;
        drawGrid(invGridOffX, invGridOffY, INV_COLS, INV_ROWS);
        inventoryItems.forEach(it => drawShape(invGridOffX + it.x*SLOT_SIZE, invGridOffY + it.y*SLOT_SIZE, ITEMS_DB[it.id].shape, ITEMS_DB[it.id].name, false, it.instanceId === player.equippedWeaponInstanceId));

        let panelX = INV_WIN.x + 280; let panelY = INV_WIN.y + 50;
        ctx.strokeStyle = '#444'; ctx.strokeRect(panelX, panelY, 160, 210);
        
        if (selectedItemInstanceId && !draggingItem) {
            let sItem = inventoryItems.find(i => i.instanceId === selectedItemInstanceId);
            if (sItem) {
                let db = ITEMS_DB[sItem.id];
                ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.font = 'bold 14px "IBM Plex Mono"'; ctx.fillText(db.name, panelX + 80, panelY + 20);
                ctx.font = '10px "IBM Plex Mono"'; ctx.fillStyle = '#aaa'; ctx.fillText(db.type === 'weapon' ? 'ОРУЖИЕ' : 'АРТЕФАКТ', panelX + 80, panelY + 35);
                let lines = db.desc.split('\n'); lines.forEach((l, i) => ctx.fillText(l, panelX + 80, panelY + 60 + i*12));

                if (db.type === 'weapon') {
                    ctx.strokeStyle = '#fff'; ctx.strokeRect(panelX, INV_WIN.y + 140, 160, 30);
                    ctx.fillStyle = '#fff'; ctx.fillText(player.equippedWeaponInstanceId === sItem.instanceId ? "[ СНЯТЬ ]" : "[ ЭКИПИРОВАТЬ ]", panelX + 80, INV_WIN.y + 155);
                }
                
                let isMerchant = globalMap.nodes[currentNodeId]?.type === 'merchant';
                let trashColor = isMerchant ? "#ff0" : "#f55";
                ctx.strokeStyle = trashColor; ctx.strokeRect(panelX, INV_WIN.y + 180, 160, 30);
                ctx.fillStyle = trashColor; ctx.fillText(isMerchant ? "[ ПРОДАТЬ (+20 CR) ]" : "[ УНИЧТОЖИТЬ ]", panelX + 80, INV_WIN.y + 195);
            }
        } else {
            ctx.fillStyle = '#444'; ctx.textAlign = 'center'; ctx.font = '12px "IBM Plex Mono"'; ctx.fillText("ВЫБЕРИТЕ", panelX + 80, panelY + 100); ctx.fillText("ПРЕДМЕТ", panelX + 80, panelY + 115);
        }

        if (activeChest) {
            ctx.fillStyle = '#000'; ctx.fillRect(CHEST_WIN.x, CHEST_WIN.y, CHEST_WIN.w, CHEST_WIN.h);
            ctx.strokeStyle = '#fff'; ctx.lineWidth = 4; ctx.strokeRect(CHEST_WIN.x, CHEST_WIN.y, CHEST_WIN.w, CHEST_WIN.h);
            ctx.fillStyle = '#222'; ctx.fillRect(CHEST_WIN.x, CHEST_WIN.y, CHEST_WIN.w, 40);
            ctx.fillStyle = '#fff'; ctx.textAlign = 'left'; ctx.font = 'bold 16px "IBM Plex Mono", monospace'; ctx.fillText("СУНДУК", CHEST_WIN.x + 10, CHEST_WIN.y + 20);
            ctx.strokeRect(CHEST_WIN.x + CHEST_WIN.w - 30, CHEST_WIN.y + 10, 20, 20); ctx.fillText("X", CHEST_WIN.x + CHEST_WIN.w - 24, CHEST_WIN.y + 25);

            let chestGridOffX = CHEST_WIN.x + 20; let chestGridOffY = CHEST_WIN.y + 50;
            drawGrid(chestGridOffX, chestGridOffY, CHEST_WIN.cols, CHEST_WIN.rows);
            chestLootItems.forEach(it => drawShape(chestGridOffX + it.x*SLOT_SIZE, chestGridOffY + it.y*SLOT_SIZE, ITEMS_DB[it.id].shape, ITEMS_DB[it.id].name));

            ctx.strokeStyle = '#fff'; ctx.strokeRect(CHEST_WIN.x + 20, CHEST_WIN.y + CHEST_WIN.h - 40, CHEST_WIN.w - 40, 30);
            ctx.textAlign = 'center'; ctx.fillText("[ ЗАБРАТЬ ВСЁ ]", CHEST_WIN.x + CHEST_WIN.w/2, CHEST_WIN.y + CHEST_WIN.h - 25);
        }

        if (draggingItem) drawShape(mouse.x - draggingItem.offsetX, mouse.y - draggingItem.offsetY, ITEMS_DB[draggingItem.item.id].shape, ITEMS_DB[draggingItem.item.id].name, true);
        ctx.restore();
    }

    // --- ОСНОВНАЯ ОТРИСОВКА ИГРЫ ---
    function draw() {
        ctx.fillStyle = '#000'; ctx.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);

        if (gameState === 'GLOBAL_MAP') { drawGlobalMap(); return; }

        ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.font = 'bold 20px "IBM Plex Mono", monospace';
        let isMapFull = uiState.seeAllMap;

        ctx.drawImage(staticCanvas, 0, 0);

        for (let x = 0; x < MAP_COLS; x++) {
            for (let y = 0; y < MAP_ROWS; y++) {
                let fluid = fluidGrid[x][y];
                if (!fluid) continue;
                let cx = x * TILE_SIZE + TILE_SIZE / 2, cy = y * TILE_SIZE + TILE_SIZE / 2;
                if (fluid.steam > 0) { ctx.fillStyle = '#555'; ctx.fillText(Math.random()>0.5?'°':'.', cx, cy); }
                else if (fluid.fire > 0) { ctx.fillStyle = Math.random()>0.5?'#fff':'#888'; ctx.fillText('^', cx, cy); }
                else if (fluid.vol > 5) { ctx.fillStyle = FluidProps[fluid.type].color; ctx.fillText(FluidProps[fluid.type].char, cx, cy); }
            }
        }
        runes.forEach(r => {
            let gx = Math.floor(r.x/TILE_SIZE), gy = Math.floor(r.y/TILE_SIZE);
            ctx.fillStyle = '#fff'; if (Math.random() < 0.1) ctx.globalAlpha = 0.5; ctx.fillText('ᚨ', r.x, r.y); ctx.globalAlpha = 1.0;
        });

        if (!isMapFull) {
            for (let x = 0; x < MAP_COLS; x++) {
                for (let y = 0; y < MAP_ROWS; y++) {
                    if (!visibleCells[`${x},${y}`]) {
                        ctx.fillStyle = explored[x][y] ? ditherPattern : '#000';
                        ctx.fillRect(x * TILE_SIZE, y * TILE_SIZE, TILE_SIZE, TILE_SIZE);
                    }
                }
            }
        }

        TrapRenderer.draw(ctx, visibleCells);

        chests.forEach(c => { 
            if (!c.opened && (isMapFull || visibleCells[`${Math.floor(c.x/TILE_SIZE)},${Math.floor(c.y/TILE_SIZE)}`])) { 
                ctx.fillStyle = '#fff'; ctx.fillText("[+]", c.x, c.y); 
                if (Utils.dist(player, c) < 30) { drawText1bit(ctx, "[E] Сундук", c.x, c.y - 15); ctx.font = 'bold 20px "IBM Plex Mono", monospace'; }
            } 
        });
        
        npcs.forEach(n => {
            if (isMapFull || visibleCells[`${Math.floor(n.x/TILE_SIZE)},${Math.floor(n.y/TILE_SIZE)}`]) {
                ctx.fillStyle = n.isAltar ? '#fff' : '#aaa'; ctx.fillText(n.isAltar ? "H" : "V", n.x, n.y);
                if (Utils.dist(player, n) < 40) { drawText1bit(ctx, n.isAltar ? "[E] Алтарь" : "[E] Говорить", n.x, n.y - 15); ctx.font = 'bold 20px "IBM Plex Mono", monospace'; }
            }
        });

        if (startDoor && !startDoor.open && (isMapFull || visibleCells[`${Math.floor(startDoor.x/TILE_SIZE)},${Math.floor(startDoor.y/TILE_SIZE)}`])) {
            ctx.fillStyle = '#222'; ctx.fillRect(startDoor.x, startDoor.y, startDoor.w, startDoor.h); ctx.fillStyle = '#fff'; ctx.font = '14px "IBM Plex Mono", monospace'; ctx.fillText("[ ВХОД ]", startDoor.x + startDoor.w/2, startDoor.y + 10);
        }

        ctx.font = 'bold 20px "IBM Plex Mono", monospace';
        doors.forEach(door => {
            let isVisible = isMapFull || (!exitLocked && enemies.length === 0) || visibleCells[`${Math.floor(door.x/TILE_SIZE)},${Math.floor(door.y/TILE_SIZE)}`] || explored[`${Math.floor(door.x/TILE_SIZE)},${Math.floor(door.y/TILE_SIZE)}`];
            if(isVisible) {
                if (!exitLocked && enemies.length === 0) {
                    if (shouldPulse(300)) { ctx.fillStyle = '#fff'; ctx.fillRect(door.x - 10, door.y - 10, door.w + 20, door.h + 20); ctx.fillStyle = '#000'; ctx.fillText("[ВЫХОД]", door.x + door.w/2, door.y + door.h/2); } 
                    else { ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.strokeRect(door.x - 10, door.y - 10, door.w + 20, door.h + 20); ctx.fillStyle = '#fff'; ctx.fillText("[ВЫХОД]", door.x + door.w/2, door.y + door.h/2); }
                } else { ctx.fillStyle = exitLocked ? '#aaa' : '#fff'; ctx.fillText(exitLocked ? "[ЗАКРЫТО]" : "[ВЫХОД]", door.x + door.w/2, door.y + door.h/2); }
            }
        });

        let hasThermal = hasComponent(world, C_Thermal, player.eid);

        enemies.forEach(e => {
            let ex = Math.floor(e.x / TILE_SIZE), ey = Math.floor(e.y / TILE_SIZE); let state = e.fsm.state.value;
            if (isMapFull || visibleCells[`${ex},${ey}`] || uiState.seeAllEnemies) {
                ctx.fillStyle = e.type === 'shooter' ? '#ddd' : '#fff'; ctx.fillText(e.type === 'shooter' ? 'S' : 'C', e.x, e.y);
                if (e.status) { ctx.font = '10px "IBM Plex Mono", monospace'; drawText1bit(ctx, e.status === 'wet' ? '[Влж]' : (e.status === 'oiled' ? '[Мсл]' : '[Нфт]'), e.x, e.y + 12); ctx.font = 'bold 20px "IBM Plex Mono", monospace'; }

                if (state === 'alerting') {
                    let progress = 1 - (e.alertTimer / 60); ctx.fillStyle = '#fff'; ctx.fillRect(e.x - 10, e.y - e.radius - 15, 20 * progress, 4); ctx.strokeStyle = '#fff'; ctx.lineWidth = 1; ctx.strokeRect(e.x - 10, e.y - e.radius - 15, 20, 4);
                    ctx.font = 'bold 16px "IBM Plex Mono", monospace'; drawText1bit(ctx, "?", e.x, e.y - e.radius - 22); ctx.font = 'bold 20px "IBM Plex Mono", monospace';
                }
                else if (e.barkTimer > 0) { ctx.font = 'bold 14px "IBM Plex Mono", monospace'; drawText1bit(ctx, e.barkText, e.x, e.y - e.radius - 12); ctx.font = 'bold 20px "IBM Plex Mono", monospace'; }
                else if (state === 'investigate') { ctx.font = 'bold 16px "IBM Plex Mono", monospace'; drawText1bit(ctx, "?", e.x, e.y - e.radius - 8, '#fff'); ctx.font = 'bold 20px "IBM Plex Mono", monospace'; }
                else if (e.memory && state !== 'patrol') { ctx.font = 'bold 12px "IBM Plex Mono", monospace'; drawText1bit(ctx, "!", e.x, e.y - e.radius - 8, '#fff'); ctx.font = 'bold 20px "IBM Plex Mono", monospace'; }
            } else if (hasThermal && Utils.distSq(player, e) < 62500) { ctx.fillStyle = '#555'; ctx.fillText(e.type === 'shooter' ? 'S' : 'C', e.x, e.y); }
        });

        bullets.forEach(b => { if (isMapFull || visibleCells[`${Math.floor(b.x / TILE_SIZE)},${Math.floor(b.y / TILE_SIZE)}`]) { ctx.fillStyle = '#fff'; ctx.fillText("*", b.x, b.y + 2); } });

        player.trail.forEach(t => { ctx.fillStyle = `rgba(255, 255, 255, ${t.alpha})`; ctx.fillText("@", t.x, t.y); });
        ctx.fillStyle = '#fff'; ctx.fillText("@", player.x, player.y);
        ctx.strokeStyle = '#fff'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(player.x + Math.cos(player.angle) * 12, player.y + Math.sin(player.angle) * 12); ctx.lineTo(player.x + Math.cos(player.angle) * 25, player.y + Math.sin(player.angle) * 25); ctx.stroke();
        
        if (player.status) { ctx.font = '10px "IBM Plex Mono", monospace'; drawText1bit(ctx, player.status === 'wet' ? '[Влж]' : (player.status === 'oiled' ? '[Мсл]' : '[Нфт]'), player.x, player.y + 12); ctx.font = 'bold 20px "IBM Plex Mono", monospace'; }
        if (player.carryingBarrel) { ctx.fillStyle = '#fff'; ctx.font = '14px "IBM Plex Mono", monospace'; let ch = player.carryingBarrel === 'water' ? '[В]' : (player.carryingBarrel === 'oil' ? '[М]' : '[*]'); ctx.fillText(ch, player.x, player.y - 20); }
        if (player.isAimingDash) {
            let inputDx = 0, inputDy = 0; if (keys.KeyW) inputDy -= 1; if (keys.KeyS) inputDy += 1; if (keys.KeyA) inputDx -= 1; if (keys.KeyD) inputDx += 1;
            let dAngle = (inputDx !== 0 || inputDy !== 0) ? Math.atan2(inputDy, inputDx) : player.angle; let dashDist = player.baseStats.dashDuration * player.baseStats.dashSpeed;
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)'; ctx.lineWidth = 2; ctx.setLineDash([5, 5]); ctx.beginPath(); ctx.moveTo(player.x, player.y); ctx.lineTo(player.x + Math.cos(dAngle)*dashDist, player.y + Math.sin(dAngle)*dashDist); ctx.stroke(); ctx.setLineDash([]);
        }

        ParticleSystem.draw(ctx);
        
        floatingTexts.forEach(ft => {
            if (isMapFull || visibleCells[`${ft.gx},${ft.gy}`] || uiState.seeAllEnemies) {
                ctx.globalAlpha = ft.life / ft.maxLife; ctx.font = 'bold 14px "IBM Plex Mono", monospace'; drawText1bit(ctx, ft.text, ft.x, ft.y, ft.color, '#000'); ctx.globalAlpha = 1.0;
            }
        });

        if (gameState === 'PLAYING' || gameState === 'ROOM_CLEAR') {
            ctx.textAlign = 'left'; ctx.font = 'bold 16px "IBM Plex Mono", monospace';
            drawText1bit(ctx, "ВОЛЯ", 20, GAME_HEIGHT - 65, '#fff', '#000');
            for(let i = 0; i < 5; i++) {
                ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.strokeRect(20 + i*25, GAME_HEIGHT - 45, 20, 15);
                if (currentWill > i * 20) { ctx.fillStyle = '#fff'; ctx.fillRect(22 + i*25, GAME_HEIGHT - 43, 16, 11); }
            }
            ctx.textAlign = 'right'; ctx.font = 'bold 20px "IBM Plex Mono", monospace';
            let ammoColor = (player.ammo === 0 && !player.isReloading) ? '#f55' : '#fff';
            let ammoText = player.isReloading ? "ПЕРЕЗАРЯДКА..." : `ПАТРОНЫ: ${player.ammo}/${player.computedStats.maxAmmo}`;
            drawText1bit(ctx, ammoText, GAME_WIDTH - 20, GAME_HEIGHT - 20, ammoColor, '#000');
            ctx.textAlign = 'center';
        }

        if (roomActive && combatIntensity > 0) {
            ctx.fillStyle = `rgba(255, 255, 255, ${combatIntensity * 0.8})`; ctx.font = 'bold 20px "IBM Plex Mono", monospace';
            let threshold = 0.15 * combatIntensity; 
            for(let i=0; i<GAME_WIDTH/20; i++) {
                if(Math.random()<threshold) { ctx.fillText(Math.random()>0.5?'╱':'╲', i*20+10, 10 + (Math.random()-0.5)*5); ctx.fillText(Math.random()>0.5?'╱':'╲', i*20+10, GAME_HEIGHT - 10 + (Math.random()-0.5)*5); }
            }
            for(let i=0; i<GAME_HEIGHT/20; i++) {
                if(Math.random()<threshold) { ctx.fillText(Math.random()>0.5?'╱':'╲', 10 + (Math.random()-0.5)*5, i*20+10); ctx.fillText(Math.random()>0.5?'╱':'╲', GAME_WIDTH - 10 + (Math.random()-0.5)*5, i*20+10); }
            }
        }
        
        ctx.font = 'bold 20px "IBM Plex Mono", monospace';
        if (roomClearTimer > 0) { ctx.globalAlpha = Math.min(1, roomClearTimer / 30); ctx.font = 'bold 24px "IBM Plex Mono", monospace'; drawText1bit(ctx, "КОМНАТА ЗАЧИЩЕНА. ИДИТЕ К ВЫХОДУ.", GAME_WIDTH / 2, GAME_HEIGHT / 2 - 40); ctx.globalAlpha = 1.0; }
        
        if (gameState === 'INVENTORY') drawInventoryWindow();
        if (gameState === 'EXIT_CONFIRM') drawExitConfirm();
        if (gameState === 'ITEM_POPUP') drawItemPopup();
        if (gameState === 'DIALOG') drawDialogPopup();
        if (gameState === 'GAME_OVER') { ctx.fillStyle = 'rgba(0, 0, 0, 0.8)'; ctx.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT); ctx.fillStyle = '#fff'; ctx.font = 'bold 48px "IBM Plex Mono", monospace'; ctx.fillText("ТВОЯ ВОЛЯ СЛОМЛЕНА", GAME_WIDTH / 2, GAME_HEIGHT / 2 - 20); ctx.font = '20px "IBM Plex Mono", monospace'; ctx.fillText("Кликни, чтобы начать новый забег", GAME_WIDTH / 2, GAME_HEIGHT / 2 + 30); }
        if (gameState === 'VICTORY') { ctx.fillStyle = 'rgba(0, 0, 0, 0.8)'; ctx.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT); ctx.fillStyle = '#fff'; ctx.font = 'bold 48px "IBM Plex Mono", monospace'; ctx.fillText("ВЫ ПОКОРИЛИ ПОДЗЕМЕЛЬЕ!", GAME_WIDTH / 2, GAME_HEIGHT / 2 - 20); ctx.font = '20px "IBM Plex Mono", monospace'; ctx.fillText("Кликни, чтобы начать заново", GAME_WIDTH / 2, GAME_HEIGHT / 2 + 30); }
    }

    function drawExitConfirm() {
        ctx.fillStyle = 'rgba(0, 0, 0, 0.85)'; ctx.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT); let cx = GAME_WIDTH/2, cy = GAME_HEIGHT/2;
        ctx.fillStyle = '#111'; ctx.fillRect(cx - 200, cy - 100, 400, 200); ctx.strokeStyle = '#fff'; ctx.lineWidth = 4; ctx.strokeRect(cx - 200, cy - 100, 400, 200); ctx.lineWidth = 1; ctx.strokeRect(cx - 190, cy - 90, 380, 180);
        ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.font = 'bold 24px "IBM Plex Mono", monospace'; ctx.fillText("ВЫЙТИ НА КАРТУ?", cx, cy - 40);
        let hoverYes = mouse.x > cx - 120 && mouse.x < cx - 20 && mouse.y > cy + 20 && mouse.y < cy + 60; ctx.fillStyle = hoverYes ? '#fff' : '#222'; ctx.fillRect(cx - 120, cy + 20, 100, 40); ctx.strokeStyle = '#fff'; ctx.strokeRect(cx - 120, cy + 20, 100, 40); ctx.fillStyle = hoverYes ? '#000' : '#fff'; ctx.font = 'bold 20px "IBM Plex Mono", monospace'; ctx.fillText("ДА", cx - 70, cy + 40);
        let hoverNo = mouse.x > cx + 20 && mouse.x < cx + 120 && mouse.y > cy + 20 && mouse.y < cy + 60; ctx.fillStyle = hoverNo ? '#fff' : '#222'; ctx.fillRect(cx + 20, cy + 20, 100, 40); ctx.strokeStyle = '#fff'; ctx.strokeRect(cx + 20, cy + 20, 100, 40); ctx.fillStyle = hoverNo ? '#000' : '#fff'; ctx.font = 'bold 20px "IBM Plex Mono", monospace'; ctx.fillText("НЕТ", cx + 70, cy + 40);
    }

    function drawDialogPopup() {
        if (!activeNPC) return;
        let bottomY = GAME_HEIGHT - 80; let optWidth = (GAME_WIDTH - 120) / 2; let node = activeNPC.currentNode;
        ctx.fillStyle = 'rgba(0, 0, 0, 0.9)'; ctx.fillRect(30, bottomY - 60, GAME_WIDTH - 60, 130); ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.strokeRect(30, bottomY - 60, GAME_WIDTH - 60, 130);
        ctx.fillStyle = '#fff'; ctx.textAlign = 'left'; ctx.textBaseline = 'top'; ctx.font = 'bold 18px "IBM Plex Mono", monospace'; ctx.fillText(activeNPC.isAltar ? "АЛТАРЬ:" : "МИРНЫЙ ЖИТЕЛЬ:", 50, bottomY - 45); ctx.font = '16px "IBM Plex Mono", monospace'; 
        node.text.split('\n').forEach((l, i) => ctx.fillText(l, 50, bottomY - 15 + (i * 20)));

        let hoverOpt1 = mouse.x > 50 && mouse.x < 50 + optWidth && mouse.y > bottomY + 30 && mouse.y < bottomY + 60;
        ctx.fillStyle = hoverOpt1 ? '#fff' : '#222'; ctx.fillRect(50, bottomY + 30, optWidth, 30); ctx.strokeStyle = '#fff'; ctx.strokeRect(50, bottomY + 30, optWidth, 30); ctx.fillStyle = hoverOpt1 ? '#000' : '#fff'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(node.options[0].text, 50 + optWidth/2, bottomY + 45);

        if (node.options[1]) {
            let hoverOpt2 = mouse.x > 70 + optWidth && mouse.x < 70 + optWidth*2 && mouse.y > bottomY + 30 && mouse.y < bottomY + 60;
            ctx.fillStyle = hoverOpt2 ? '#fff' : '#222'; ctx.fillRect(70 + optWidth, bottomY + 30, optWidth, 30); ctx.strokeStyle = '#fff'; ctx.strokeRect(70 + optWidth, bottomY + 30, optWidth, 30); ctx.fillStyle = hoverOpt2 ? '#000' : '#fff'; ctx.fillText(node.options[1].text, 70 + optWidth + optWidth/2, bottomY + 45);
        }
    }

    function drawGlobalMap() {
        ctx.strokeStyle = '#444'; ctx.lineWidth = 2;
        for (let id in globalMap.nodes) {
            let node = globalMap.nodes[id];
            node.next.forEach(nextId => {
                let target = globalMap.nodes[nextId];
                if (node.status === 'completed' && target.status === 'available') ctx.strokeStyle = '#fff'; else if (node.status === 'completed' && target.status === 'completed') ctx.strokeStyle = '#666'; else ctx.strokeStyle = '#333';
                ctx.beginPath(); ctx.moveTo(node.x, node.y); ctx.lineTo(target.x, target.y); ctx.stroke();
            });
        }
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        for (let id in globalMap.nodes) {
            let node = globalMap.nodes[id];
            ctx.beginPath(); ctx.arc(node.x, node.y, 20, 0, Math.PI*2);
            if (node.status === 'available') { ctx.fillStyle = '#fff'; ctx.fill(); ctx.strokeStyle = '#fff'; } else if (node.status === 'completed') { ctx.fillStyle = '#444'; ctx.fill(); ctx.strokeStyle = '#666'; } else { ctx.fillStyle = '#000'; ctx.fill(); ctx.strokeStyle = '#333'; }
            ctx.stroke();
            if (node.id === selectedNodeId) { ctx.beginPath(); ctx.arc(node.x, node.y, 26, 0, Math.PI*2); ctx.stroke(); } else if (node.id === hoveredNodeId && node.status === 'available') { ctx.beginPath(); ctx.arc(node.x, node.y, 26, 0, Math.PI*2); ctx.setLineDash([5, 5]); ctx.stroke(); ctx.setLineDash([]); }
            
            if (node.status === 'available' || node.status === 'completed') { 
                ctx.fillStyle = node.status === 'available' ? '#000' : '#888'; ctx.font = 'bold 20px "IBM Plex Mono", monospace'; 
                let ch = node.type === 'merchant' ? '$' : (node.type === 'shrine' ? 'H' : (node.next.length === 0 ? 'B' : 'R'));
                ctx.fillText(ch, node.x, node.y + 2); 
            }
        }
        ctx.fillStyle = '#fff'; ctx.font = 'bold 32px "IBM Plex Mono", monospace'; ctx.fillText("КАРТА ПОДЗЕМЕЛЬЯ", GAME_WIDTH/2, 50); ctx.font = '16px "IBM Plex Mono", monospace'; ctx.fillStyle = '#aaa'; ctx.fillText("Выберите следующий доступный узел", GAME_WIDTH/2, 90);
    }

    function drawItemPopup() {
        ctx.fillStyle = 'rgba(0, 0, 0, 0.85)'; ctx.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT); let cx = GAME_WIDTH/2, cy = GAME_HEIGHT/2;
        ctx.fillStyle = '#111'; ctx.fillRect(cx - 200, cy - 120, 400, 240); ctx.strokeStyle = '#fff'; ctx.lineWidth = 4; ctx.strokeRect(cx - 200, cy - 120, 400, 240); ctx.lineWidth = 1; ctx.strokeRect(cx - 190, cy - 110, 380, 220);
        ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.font = 'bold 24px "IBM Plex Mono", monospace'; ctx.fillText("ПРЕДМЕТ НАЙДЕН", cx, cy - 70); ctx.font = 'bold 28px "IBM Plex Mono", monospace'; ctx.fillText(`[ ${popupItem.name.toUpperCase()} ]`, cx, cy - 20); ctx.font = '16px "IBM Plex Mono", monospace'; ctx.fillStyle = '#ccc'; ctx.fillText(popupItem.desc, cx, cy + 30); ctx.fillStyle = `rgba(255, 255, 255, ${Math.abs(Math.sin(Date.now() / 300))})`; ctx.fillText("> КЛИКНИТЕ ЧТОБЫ ПРОДОЛЖИТЬ <", cx, cy + 80);
    }

    function loop() { update(); draw(); requestAnimationFrame(loop); }
    window.onload = function () { resizeApp(); initRun(); loop(); }; 

</script>
</body>
</html>