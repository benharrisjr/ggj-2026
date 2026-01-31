import { Scene } from 'phaser';

export class Preloader extends Scene
{
    constructor ()
    {
        super('Preloader');
    }

    init ()
    {
        //  We loaded this image in our Boot Scene, so we can display it here
        this.add.image(512, 384, 'background');

        //  A simple progress bar. This is the outline of the bar.
        this.add.rectangle(512, 384, 468, 32).setStrokeStyle(1, 0xffffff);

        //  This is the progress bar itself. It will increase in size from the left based on the % of progress.
        const bar = this.add.rectangle(512-230, 384, 4, 28, 0xffffff);

        //  Use the 'progress' event emitted by the LoaderPlugin to update the loading bar
        this.load.on('progress', (progress: number) => {

            //  Update the progress bar (our bar is 464px wide, so 100% = 464px)
            bar.width = 4 + (460 * progress);

        });
    }

    preload ()
    {
        //  Load the assets for the game - Replace with your own assets
        this.load.setPath('assets');

        this.load.image('logo', 'logo.png');
        this.load.image('player', 'Tiles/tile_0084.png');
        this.load.image('enemy', 'Tiles/tile_0108.png');
        this.load.image('enemy2', 'kpop-demon.png');
        this.load.image('enemy3', 'bubbly-sheep.png');

        // Level 0 assets
        this.load.image('level_0', 'Level_0/Tiles.png');
        this.load.image('intgrid_0', 'Level_0/IntGrid-int.png');

        // Level 1 assets
        this.load.image('level_1', 'Level_1/Tiles.png');
        this.load.image('intgrid_1', 'Level_1/IntGrid-int.png');

        // Audio - load all footstep variations
        for (let i = 1; i <= 9; i++) {
            this.load.audio(`footstep0${i}`, `audio/footstep0${i}.ogg`);
        }

        // Door sounds
        this.load.audio('doorOpen', 'audio/doorOpen_1.ogg');
        this.load.audio('doorClose', 'audio/doorClose_1.ogg');

        // UI - Health hearts
        this.load.image('heart', 'heart.png');
        this.load.image('heart-half', 'heart-half.png');
        this.load.image('heart-empty', 'heart-empty.png');
    }

    create ()
    {
        //  When all the assets have loaded, it's often worth creating global objects here that the rest of the game can use.
        //  For example, you can define global animations here, so we can use them in other scenes.

        //  Move to the MainMenu. You could also swap this for a Scene Transition, such as a camera fade.
        this.scene.start('Game');
    }
}
