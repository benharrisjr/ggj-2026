import { Scene } from 'phaser';

export class Game extends Scene {
    camera: Phaser.Cameras.Scene2D.Camera;
    background: Phaser.GameObjects.Image;
    player: Phaser.Physics.Arcade.Image; // Changed to Arcade.Image for physics
    cursors: Phaser.Types.Input.Keyboard.CursorKeys;
    wasd: { up: Phaser.Input.Keyboard.Key; down: Phaser.Input.Keyboard.Key; left: Phaser.Input.Keyboard.Key; right: Phaser.Input.Keyboard.Key };
    maskGraphics: Phaser.GameObjects.Graphics;

    constructor() {
        super('Game');

    }

    create() {
        this.camera = this.cameras.main;
        this.camera.setZoom(1.0);
        this.camera.setBackgroundColor(0x00ff00);

        this.background = this.add.image(320, 176, 'level');
        this.background.setScale(2.0);

        // Enable physics for the player
        this.player = this.physics.add.image(0, 0, 'player');
        this.player.setScale(2.0);
        this.player.setCollideWorldBounds(true); // Prevent the player from leaving the screen

        // Create cursor keys for input
        this.cursors = this.input.keyboard.createCursorKeys();

        // Create WASD keys
        this.wasd = {
            up: this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.W),
            down: this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.S),
            left: this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.A),
            right: this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.D)
        };

        const overlay = this.add.graphics();

        overlay.fillStyle(0x000000, 0.8).fillRect(0, 0, 800, 600);

        this.maskGraphics = this.make.graphics();

        this.maskGraphics.fillStyle(0xffffff);
        this.maskGraphics.fillRect(this.player.x, this.player.y, 64, 64);

        const mask = new Phaser.Display.Masks.BitmapMask(this, this.maskGraphics);

        mask.invertAlpha = true;

        overlay.setMask(mask);
    }

    handleInput(): { x: number; y: number } {
        let x = 0;
        let y = 0;

        // Check keyboard input (Arrow keys)
        if (this.cursors.left?.isDown) {
            x -= 1;
        }
        if (this.cursors.right?.isDown) {
            x += 1;
        }
        if (this.cursors.up?.isDown) {
            y -= 1;
        }
        if (this.cursors.down?.isDown) {
            y += 1;
        }

        // Check WASD keys
        if (this.wasd.left.isDown) {
            x -= 1;
        }
        if (this.wasd.right.isDown) {
            x += 1;
        }
        if (this.wasd.up.isDown) {
            y -= 1;
        }
        if (this.wasd.down.isDown) {
            y += 1;
        }

        // Check gamepad input
        const gamepad = this.input.gamepad?.getPad(0);
        if (gamepad) {
            // Left stick
            const leftStickX = gamepad.leftStick.x;
            const leftStickY = gamepad.leftStick.y;

            // Apply deadzone (0.15)
            if (Math.abs(leftStickX) > 0.15) {
                x += leftStickX;
            }
            if (Math.abs(leftStickY) > 0.15) {
                y += leftStickY;
            }

            // D-pad
            if (gamepad.left) {
                x -= 1;
            }
            if (gamepad.right) {
                x += 1;
            }
            if (gamepad.up) {
                y -= 1;
            }
            if (gamepad.down) {
                y += 1;
            }
        }

        return { x, y };
    }

    update() {
        // Reset player velocity
        this.player.setVelocity(0);

        // Get input from all sources
        const input = this.handleInput();

        // Apply movement
        if (input.x !== 0 || input.y !== 0) {
            // Set velocity based on input
            this.player.setVelocity(input.x * 200, input.y * 200);

            // Normalize diagonal movement to maintain consistent speed
            this.player.body.velocity.normalize().scale(200);
        }

        // Update mask to follow player (clear previous frame to prevent trails)
        this.maskGraphics.clear();
        this.maskGraphics.fillStyle(0xffffff);
        this.maskGraphics.fillRect(this.player.x - 32, this.player.y - 32, 64, 64);
    }
}