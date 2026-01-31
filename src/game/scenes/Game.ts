import { Scene } from 'phaser';

export class Game extends Scene {
    camera: Phaser.Cameras.Scene2D.Camera;
    background: Phaser.GameObjects.Image;
    player: Phaser.Physics.Arcade.Image; // Changed to Arcade.Image for physics
    enemys: Phaser.Physics.Arcade.Group;
    enemy: Phaser.Physics.Arcade.Image;
    walls: Phaser.Physics.Arcade.StaticGroup;
    cursors: Phaser.Types.Input.Keyboard.CursorKeys;
    wasd: { up: Phaser.Input.Keyboard.Key; down: Phaser.Input.Keyboard.Key; left: Phaser.Input.Keyboard.Key; right: Phaser.Input.Keyboard.Key };
    maskGraphics: Phaser.GameObjects.Graphics;
    playerAngle: number = 0; // Start facing up (after correction)
    gamepad: Phaser.Input.Gamepad.Gamepad;

    constructor() {
        super('Game');

    }

    create() {
        this.camera = this.cameras.main;
        this.camera.setZoom(1.0);
        this.camera.setBackgroundColor(0x00ff00);

        this.background = this.add.image(320, 176, 'level');
        this.background.setScale(2.0);

        // Create collision layer from IntGrid
        this.createCollisionLayer();

        // Enable physics for the player
        this.player = this.physics.add.image(200, 250, 'player');
        this.player.setScale(2.0);
        this.player.setCollideWorldBounds(true); // Prevent the player from leaving the screen

        // Add collision between player and walls
        this.physics.add.collider(this.player, this.walls);

        this.enemys = this.physics.add.group();
        this.enemy = this.enemys.create(200, 200, 'enemy');
        this.enemy.setScale(2.0);

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
        // Draw initial rotated triangle
        this.drawRotatedTriangle(this.player.x, this.player.y, this.playerAngle);

        const mask = new Phaser.Display.Masks.BitmapMask(this, this.maskGraphics);

        mask.invertAlpha = true;

        overlay.setMask(mask);
    }

    createCollisionLayer() {
        this.walls = this.physics.add.staticGroup();

        // IntGrid is 20x11, each cell represents 16x16 pixels in Tiles.png
        // With 2.0 scale, each cell is 32x32 in game world
        const tileSize = 32;

        // Get the intgrid texture and read pixel data
        const texture = this.textures.get('intgrid');
        const source = texture.getSourceImage() as HTMLImageElement;

        console.log('IntGrid source size:', source.width, source.height);

        // Create a canvas to read pixel data
        const canvas = document.createElement('canvas');
        canvas.width = source.width;
        canvas.height = source.height;
        const ctx = canvas.getContext('2d')!;
        ctx.drawImage(source, 0, 0);
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const pixels = imageData.data;

        let wallCount = 0;

        // Loop through each pixel in the IntGrid
        for (let y = 0; y < source.height; y++) {
            for (let x = 0; x < source.width; x++) {
                const pixelIndex = (y * source.width + x) * 4;
                const r = pixels[pixelIndex];
                const g = pixels[pixelIndex + 1];
                const b = pixels[pixelIndex + 2];
                const a = pixels[pixelIndex + 3];

                // Check if pixel is black (collision tile) - non-transparent
                if (r < 50 && g < 50 && b < 50 && a > 200) {
                    // Create collision rectangle at this position
                    // Position is center of tile, offset from level origin (0,0)
                    const worldX = x * tileSize + tileSize / 2;
                    const worldY = y * tileSize + tileSize / 2;

                    const wall = this.add.rectangle(worldX, worldY, tileSize, tileSize);
                    this.physics.add.existing(wall, true); // true = static body
                    this.walls.add(wall);
                    wallCount++;
                }
            }
        }

        console.log('Created walls:', wallCount);
    }

    getTrianglePoints(x: number, y: number, angle: number, size: number = 40): { p1: { x: number; y: number }; p2: { x: number; y: number }; p3: { x: number; y: number } } {
        // Calculate the three points of the triangle rotated by the given angle
        // Base triangle points before rotation (pointing up):
        // Top: (0, -size)
        // Bottom left: (-size, size)
        // Bottom right: (size, size)

        const cos = Math.cos(angle);
        const sin = Math.sin(angle);

        // Rotate and translate each point
        const p1 = {
            x: x + (0 * cos - (-size) * sin),
            y: y + (0 * sin + (-size) * cos)
        };

        const p2 = {
            x: x + ((-size) * cos - size * sin),
            y: y + ((-size) * sin + size * cos)
        };

        const p3 = {
            x: x + (size * cos - size * sin),
            y: y + (size * sin + size * cos)
        };

        return { p1, p2, p3 };
    }

    drawRotatedTriangle(x: number, y: number, angle: number, size: number = 40) {
        const { p1, p2, p3 } = this.getTrianglePoints(x, y, angle, size);
        this.maskGraphics.fillTriangle(p1.x, p1.y, p2.x, p2.y, p3.x, p3.y);
    }

    isPointInTriangle(px: number, py: number, p1: { x: number; y: number }, p2: { x: number; y: number }, p3: { x: number; y: number }): boolean {
        // Using barycentric coordinates to check if point is inside triangle
        const sign = (p1: { x: number; y: number }, p2: { x: number; y: number }, p3: { x: number; y: number }) => {
            return (p1.x - p3.x) * (p2.y - p3.y) - (p2.x - p3.x) * (p1.y - p3.y);
        };

        const point = { x: px, y: py };
        const d1 = sign(point, p1, p2);
        const d2 = sign(point, p2, p3);
        const d3 = sign(point, p3, p1);

        const hasNeg = (d1 < 0) || (d2 < 0) || (d3 < 0);
        const hasPos = (d1 > 0) || (d2 > 0) || (d3 > 0);

        return !(hasNeg && hasPos);
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

            // Update player angle based on movement direction
            // Add PI/2 to correct the orientation, then add PI to flip 180 degrees
            this.playerAngle = Math.atan2(input.y, input.x) + Math.PI / 2 + Math.PI;

            // Mirror sprite horizontally based on horizontal input
            const deadzone = 0.01;
            if (input.x < -deadzone) {
                this.player.setFlipX(true);
            } else if (input.x > deadzone) {
                this.player.setFlipX(false);
            }
        }

        // Update mask to follow player (clear previous frame to prevent trails)
        this.maskGraphics.clear();
        this.maskGraphics.fillStyle(0xffffff);
        // Draw rotated triangle centered on player
        this.drawRotatedTriangle(this.player.x, this.player.y, this.playerAngle, 80);

        // Check if enemy is inside the mask triangle
        const trianglePoints = this.getTrianglePoints(this.player.x, this.player.y, this.playerAngle, 80);
        const enemyInMask = this.isPointInTriangle(
            this.enemy.x,
            this.enemy.y,
            trianglePoints.p1,
            trianglePoints.p2,
            trianglePoints.p3
        );

        this.enemy.setVisible(enemyInMask);
    }
}