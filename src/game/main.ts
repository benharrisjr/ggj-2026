import { Boot } from './scenes/Boot';
import { GameOver } from './scenes/GameOver';
import { Game as MainGame } from './scenes/Game';
import { MainMenu } from './scenes/MainMenu';
import { AUTO, Game } from 'phaser';
import { Preloader } from './scenes/Preloader';

//  Find out more information about the Game Config at:
//  https://docs.phaser.io/api-documentation/typedef/types-core#gameconfig
const config: Phaser.Types.Core.GameConfig = {
    type: AUTO,
    width: 320,
    height: 180,
    parent: 'game-container',
    backgroundColor: '#028af8',
    input: {
        gamepad: true,
        keyboard: true,
        mouse: true,
        touch: true,
    },
    physics: {
        default: 'arcade',
        arcade: {
            debug: true
        }
    },
    render: {
        pixelArt: true,
    },
    scale: {
        parent: 'game-container',
        // mode: Phaser.Scale.FIT,
        width: 640,
        height: 360,
    },
    scene: [
        Boot,
        Preloader,
        MainMenu,
        MainGame,
        GameOver
    ]
};

const StartGame = (parent: string) => {

    return new Game({ ...config, parent });

}

export default StartGame;
