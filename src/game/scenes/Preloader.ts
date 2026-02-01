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
        this.load.image('player-back', 'Sprite-Ninja-Back.png');
        this.load.image('player-front', 'Sprite-Ninja-Front.png');
        this.load.image('player-profile', 'Sprite-Ninja-Profile.png');

        // Player head/body split sprites (for shader effects)
        this.load.image('head-front', 'head-front.png');
        this.load.image('head-back', 'head-back.png');
        this.load.image('head-profile', 'head-profile.png');
        this.load.image('body-front', 'body-front.png');
        this.load.image('body-back', 'body-back.png');
        this.load.image('body-profile', 'body-profile.png');
        this.load.image('enemy', 'Tiles/tile_0108.png');
        this.load.image('enemy2', 'kpop-demon.png');
        this.load.image('enemy3', 'bubbly-sheep.png');

        // Level 0 assets
        this.load.image('level_0', 'Level_0/Tiles.png');
        this.load.image('intgrid_0', 'Level_0/IntGrid-int.png');

        // Level 1 assets
        this.load.image('level_1', 'Level_1/Tiles.png');
        this.load.image('intgrid_1', 'Level_1/IntGrid-int.png');

        // Level 2 assets
        this.load.image('level_2', 'Level_2/Tiles.png');
        this.load.image('intgrid_2', 'Level_2/IntGrid-int.png');

        // Audio - load all footstep variations
        for (let i = 1; i <= 9; i++) {
            this.load.audio(`footstep0${i}`, `audio/footstep0${i}.ogg`);
        }

        // Door sounds
        this.load.audio('doorOpen', 'audio/doorOpen_1.ogg');
        this.load.audio('doorClose', 'audio/doorClose_1.ogg');

        // Combat sounds
        this.load.audio('playerHurt', 'audio/Hit_Hurt23.wav');
        this.load.audio('enemySpotted', 'audio/Randomize7.wav');
        this.load.audio('fireShoot', 'audio/Explosion13.wav');

        // UI - Health hearts
        this.load.image('heart', 'heart.png');
        this.load.image('heart-half', 'heart-half.png');
        this.load.image('heart-empty', 'heart-empty.png');

        // UI - Touch controls
        this.load.image('btn-up', 'up.png');
        this.load.image('btn-down', 'down.png');
        this.load.image('btn-left', 'left.png');
        this.load.image('btn-right', 'right.png');
        this.load.image('btn-action', 'action.png');

        // UI - Action buttons
        this.load.image('mask0', 'ui/0.png');
        this.load.image('mask1', 'ui/1.png');
        this.load.image('mask2', 'ui/2.png');
        this.load.image('mask3', 'ui/3.png');
        this.load.image('mask4', 'ui/4.png');
        this.load.image('mask5', 'ui/5.png');
        this.load.image('mask6', 'ui/6.png');
        this.load.image('mask7', 'ui/7.png');
        this.load.image('mask8', 'ui/8.png');
        this.load.image('mask9', 'ui/9.png');

        // attack effects
        this.load.image('slash', 'effects/slash.png');
        this.load.image('fire', 'effects/fire.png');
        this.load.image('fire-hit', 'effects/fire-hit.png');
        this.load.image('fire-hit-end', 'effects/fire-hit-end.png');

        // Environment objects
        this.load.image('torch', 'torch.png');
        this.load.image('torch-lit', 'torch-lit.png');
    }

    create ()
    {
        //  When all the assets have loaded, it's often worth creating global objects here that the rest of the game can use.
        //  For example, you can define global animations here, so we can use them in other scenes.

        //  Move to the MainMenu. You could also swap this for a Scene Transition, such as a camera fade.
        this.scene.start('Game');
    }
}
