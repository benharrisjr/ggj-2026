import { Scene } from 'phaser';

export class Game extends Scene {
    camera: Phaser.Cameras.Scene2D.Camera;
    background: Phaser.GameObjects.Image;
    player: Phaser.Physics.Arcade.Image; // Changed to Arcade.Image for physics
    cursors: Phaser.Types.Input.Keyboard.CursorKeys;
    maskGraphics: Phaser.GameObjects.Graphics;

    constructor() {
        super('Game');
        
    }

    create() {
        this.camera = this.cameras.main;
        this.camera.setZoom(1.0);
        this.camera.setBackgroundColor(0x00ff00);

        // this.background = this.add.image(512, 384, 'background');
        // this.background.setAlpha(0.5);

        // Enable physics for the player
        this.player = this.physics.add.image(0, 0, 'player');
        this.player.setCollideWorldBounds(true); // Prevent the player from leaving the screen

        // Create cursor keys for input
        this.cursors = this.input.keyboard.createCursorKeys();

        const overlay = this.add.graphics();

        overlay.fillStyle(0x000000, 0.8).fillRect(0, 0, 800, 600);

        this.maskGraphics = this.make.graphics();

        this.maskGraphics.fillStyle(0xffffff);
        this.maskGraphics.fillRect(this.player.x, this.player.y, 64, 64);

        const mask = new Phaser.Display.Masks.BitmapMask(this, this.maskGraphics);

        mask.invertAlpha = true;

        overlay.setMask(mask);
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
        this.maskGraphics.fillRect(this.player.x, this.player.y, 64, 64);
    }
}