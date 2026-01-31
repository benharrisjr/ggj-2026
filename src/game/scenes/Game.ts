import { Scene } from 'phaser';

export class Game extends Scene {
    camera: Phaser.Cameras.Scene2D.Camera;
    background: Phaser.GameObjects.Image;
    player: Phaser.Physics.Arcade.Image; // Changed to Arcade.Image for physics
    cursors: Phaser.Types.Input.Keyboard.CursorKeys;

    constructor() {
        super('Game');
    }

    create() {
        this.camera = this.cameras.main;
        this.camera.setZoom(1.0);
        this.camera.setBackgroundColor(0x00ff00);

        this.background = this.add.image(512, 384, 'background');
        this.background.setAlpha(0.5);

        // Enable physics for the player
        this.player = this.physics.add.image(512, 384, 'player');
        this.player.setCollideWorldBounds(true); // Prevent the player from leaving the screen

        // Create cursor keys for input
        this.cursors = this.input.keyboard.createCursorKeys();
    }

    update() {
        // Reset player velocity
        this.player.setVelocity(0);

        // Horizontal movement
        if (this.cursors.left?.isDown) {
            this.player.setVelocityX(-200);
        } else if (this.cursors.right?.isDown) {
            this.player.setVelocityX(200);
        }

        // Vertical movement
        if (this.cursors.up?.isDown) {
            this.player.setVelocityY(-200);
        } else if (this.cursors.down?.isDown) {
            this.player.setVelocityY(200);
        }

        // Normalize diagonal movement
        this.player.body.velocity.normalize().scale(200);
    }
}