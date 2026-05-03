import GUI from 'lil-gui';

export interface UIState {
    room: number;
    ammo: string;
    dash: string;
    credits: string;
    godMode: boolean;
    seeAllEnemies: boolean;
    seeAllMap: boolean;
}

export class InterfaceSystem {
    private gui: GUI;
    public state: UIState;

    constructor(container: HTMLElement, onMapToggle: () => void) {
        this.state = {
            room: 1,
            ammo: "6/6",
            dash: "ГОТОВ",
            credits: "0",
            godMode: false,
            seeAllEnemies: false,
            seeAllMap: false
        };

        this.gui = new GUI({ title: 'Терминал ОС', container });
        const sysFolder = this.gui.addFolder('Система');

        sysFolder.add(this.state, 'room').name('Уровень').listen().disable();
        sysFolder.add(this.state, 'ammo').name('Патроны').listen().disable();
        sysFolder.add(this.state, 'dash').name('Рывок').listen().disable();
        sysFolder.add(this.state, 'credits').name('Кредиты').listen().disable();
        sysFolder.add(this.state, 'godMode').name('Режим Бога');
        sysFolder.add(this.state, 'seeAllEnemies').name('Радар: Враги');
        sysFolder.add(this.state, 'seeAllMap').name('Радар: Карта').onChange(onMapToggle);
    }

    public update(room: number, ammo: string, credits: number) {
        this.state.room = room;
        this.state.ammo = ammo;
        this.state.credits = `$ ${credits}`;
    }

    public addAction(name: string, callback: () => void) {
        const obj = { [name]: callback };
        this.gui.add(obj, name);
    }
}
