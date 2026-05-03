// --- ЗВУКОВОЙ ДВИЖОК (Абстракция над ZzFX) ---

let audioCtx: AudioContext | null = null;
const zzfxV = 0.3;
const zzfxR = 44100;

const zzfxG = (q=1,k=.05,c=220,e=0,t=0,u=.1,r=0,F=1,v=0,z=0,w=0,A=0,l=0,B=0,x=0,A2=0,d=0,y=1,m=0,C=0) => {
    let b=2*Math.PI,H=v*=500*b/zzfxR**2,I=(0<x?1:-1)*b/4,J=c*=(1+2*k*Math.random()-k)*b/zzfxR,K=[],L=0,M=0,N=0,O=1,P=0,Q=0,R=0,S=0,T=0;
    e=99+zzfxR*e;m*=zzfxR;t*=zzfxR;u*=zzfxR;d*=zzfxR;z*=500*b/zzfxR**3;x*=b/zzfxR;w*=b/zzfxR;A*=zzfxR;l=zzfxR*l|0;
    for(let U=0;U<e+m+t+u+d;U++){
        let V,W=O;
        if(U<e)W=U/e;else if(U<e+m)W=1-(U-e)/m*(1-y);else if(U<e+m+t)W=y;else if(U<e+m+t+u)W=y-(U-(e+m+t))/u*y;else W=0;
        if(U<A)W*=Math.sin(U*b/A);W*=q;
        if(U&&U>A2)J+=z;if(U&&U>B)J+=w;if(U&&U>C)v+=H;
        if(l&&++T>l)J+=x,T=0,O=-O;
        if(F>1)N+=(Math.sin(J)-N)/F;else N=Math.sin(J);
        P+=N-P*R;K[U]=P*W*Math.cos(I)*Math.exp(-S/1e3);I+=v;J+=N*O;S++;
    }
    return [K];
};

const zzfxP = (...t: number[][]) => {
    if (!audioCtx) return;
    let e = audioCtx.createBufferSource(), f = audioCtx.createBuffer(t.length, t[0].length, zzfxR);
    t.map((t, i) => f.getChannelData(i).set(t));
    e.buffer = f;
    let gainNode = audioCtx.createGain();
    gainNode.gain.value = zzfxV;
    gainNode.connect(audioCtx.destination);
    e.connect(gainNode);
    e.start();
    return e;
};

export const AudioEngine = {
    resume: () => {
        if (!audioCtx) audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
        if (audioCtx!.state === 'suspended') audioCtx!.resume();
    },
    play: (...params: any[]) => {
        AudioEngine.resume();
        return zzfxP(...(zzfxG as any)(...params));
    }
};

export const sfx = {
    playerShoot: () => AudioEngine.play(1, 0.05, 200, 0.01, 0.05, 0.05, 1, 1.5, 0, 0, 0, 0, 0, 0, 0, 0, 0.1, 1, 0, 0),
    enemyShoot: () => AudioEngine.play(0.6, 0.05, 150, 0.02, 0.05, 0.05, 1, 1.5, 0, 0, 0, 0, 0, 0, 0, 0, 0.1, 1, 0, 0),
    dash: () => AudioEngine.play(1, 0.05, 400, 0.05, 0.1, 0.1, 1, 1.5, 10, 0, 0, 0, 0, 0, 0, 0, 0.1, 1, 0, 0),
    hit: () => AudioEngine.play(1, 0.1, 100, 0.05, 0.1, 0.2, 4, 2, 0, 0, 0, 0, 0, 0, 0, 0, 0.5, 1, 0, 0),
    chestOpen: () => AudioEngine.play(1, 0.1, 800, 0.05, 0.2, 0.5, 1, 1.5, 0, 0, 0, 0, 0, 0, 0, 0, 0.1, 1, 0, 0),
    doorOpen: () => AudioEngine.play(1, 0.1, 80, 0.1, 0.1, 0.3, 1, 0.5, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 0, 0),
    roomClear: () => AudioEngine.play(1, 0.05, 600, 0.05, 0.1, 0.4, 1, 1.5, 0, 0, 0, 0, 0, 0, 0, 0, 0.1, 1, 0, 0),
    gameOver: () => AudioEngine.play(1, 0.5, 50, 0.5, 0.5, 2, 4, 2, 0, 0, 0, 0, 0, 0, 0, 0, 0.5, 1, 0, 0),
    click: () => AudioEngine.play(1, 0.05, 800, 0.01, 0.05, 0.05, 1, 1.5, 0, 0, 0, 0, 0, 0, 0, 0, 0.1, 1, 0, 0),
    explosion: () => AudioEngine.play(2, 0.2, 50, 0.1, 0.2, 0.8, 4, 2, 0, 0, 0, 0, 0, 0, 0, 0, 0.5, 1, 0, 0),
    reflect: () => AudioEngine.play(1, 0.01, 800, 0.01, 0.05, 0.05, 1, 1.5, 0, 0, 0, 0, 0, 0, 0, 0, 0.1, 1, 0, 0),
    reload: () => AudioEngine.play(1, 0.05, 100, 0.1, 0.1, 0.2, 1, 1.5, 0, 0, 0, 0, 0, 0, 0, 0, 0.5, 1, 0, 0),
    empty: () => AudioEngine.play(1, 0.01, 800, 0.01, 0.01, 0.01, 1, 1.5, 0, 0, 0, 0, 0, 0, 0, 0, 0.1, 1, 0, 0)
};
