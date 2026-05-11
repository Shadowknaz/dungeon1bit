import { InputHandler } from './input';

export enum GameIntent {
    MOVE_UP,
    MOVE_DOWN,
    MOVE_LEFT,
    MOVE_RIGHT,
    INTERACT,
    RELOAD,
    INVENTORY,
    PAUSE,
    DASH,
    CONFIRM,
    CANCEL,
    GRENADE_HE,
    GRENADE_FLASH,
    DEBUG_REVEAL,
    DEBUG_MAP
}

export class InputManager {
    constructor(private handler: InputHandler) {}

    public isIntentActive(intent: GameIntent): boolean {
        switch (intent) {
            case GameIntent.MOVE_UP: return this.handler.keys['KeyW'];
            case GameIntent.MOVE_DOWN: return this.handler.keys['KeyS'];
            case GameIntent.MOVE_LEFT: return this.handler.keys['KeyA'];
            case GameIntent.MOVE_RIGHT: return this.handler.keys['KeyD'];
            case GameIntent.INTERACT: return this.handler.justPressed['KeyE'];
            case GameIntent.RELOAD: return this.handler.justPressed['KeyR'];
            case GameIntent.INVENTORY: return this.handler.justPressed['Tab'];
            case GameIntent.DASH: return this.handler.justPressed['Space'];
            case GameIntent.GRENADE_HE: return this.handler.justPressed['KeyG'];
            case GameIntent.GRENADE_FLASH: return this.handler.justPressed['KeyF'];
            case GameIntent.DEBUG_REVEAL: return this.handler.justPressed['KeyP'];
            case GameIntent.DEBUG_MAP: return this.handler.justPressed['KeyM'];
            default: return false;
        }
    }

    public get mouse() {
        return this.handler.mouse;
    }

    public consumeClick() {
        return this.handler.consumeClick();
    }

    public update() {
        this.handler.update();
    }
}
