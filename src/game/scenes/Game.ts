import { Scene } from 'phaser';

export class Game extends Scene {
    camera: Phaser.Cameras.Scene2D.Camera;
    background: Phaser.GameObjects.Image;
    player: Phaser.Physics.Arcade.Image; // Changed to Arcade.Image for physics
    enemys: Phaser.Physics.Arcade.Group;
    enemy: Phaser.Physics.Arcade.Image;
    walls: Phaser.Physics.Arcade.StaticGroup;
    doors: Phaser.Physics.Arcade.StaticGroup;
    cursors: Phaser.Types.Input.Keyboard.CursorKeys;
    wasd: { up: Phaser.Input.Keyboard.Key; down: Phaser.Input.Keyboard.Key; left: Phaser.Input.Keyboard.Key; right: Phaser.Input.Keyboard.Key };
    maskGraphics: Phaser.GameObjects.Graphics;
    playerAngle: number = 0; // Start facing up (after correction)
    gamepad: Phaser.Input.Gamepad.Gamepad;
    currentLevel: number = 0;

    constructor() {
        super('Game');

    }

    create() {
        this.camera = this.cameras.main;
        this.camera.setZoom(1.0);
        this.camera.setBackgroundColor(0x00ff00);

        // Create background at origin (0,0)
        this.background = this.add.image(0, 0, `level_${this.currentLevel}`);
        this.background.setOrigin(0, 0);
        this.background.setScale(2.0);

        // Set up world and camera bounds based on level size
        this.setupLevelBounds();

        // Create collision layer from IntGrid
        this.createCollisionLayer();

        // Enable physics for the player
        this.player = this.physics.add.image(200, 250, 'player');
        this.player.setScale(2.0);
        this.player.setCollideWorldBounds(true);

        // Camera follows player
        this.camera.startFollow(this.player, true, 0.1, 0.1);

        // Add collision between player and walls
        this.physics.add.collider(this.player, this.walls);

        // Add overlap detection for doors
        this.physics.add.overlap(this.player, this.doors, this.onDoorCollision, undefined, this);

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

        // Create overlay that covers the entire level (will be masked)
        const overlay = this.add.graphics();
        overlay.fillStyle(0x000000, 0.8).fillRect(0, 0, 2000, 2000); // Large enough for any level

        this.maskGraphics = this.make.graphics();
        this.maskGraphics.fillStyle(0xffffff);
        // Draw initial rotated triangle
        this.drawRotatedTriangle(this.player.x, this.player.y, this.playerAngle);

        const mask = new Phaser.Display.Masks.BitmapMask(this, this.maskGraphics);
        mask.invertAlpha = true;
        overlay.setMask(mask);
    }

    setupLevelBounds() {
        // Get level dimensions from the background texture (scaled 2x)
        const levelWidth = this.background.displayWidth;
        const levelHeight = this.background.displayHeight;

        console.log('Level bounds:', levelWidth, levelHeight);

        // Set physics world bounds
        this.physics.world.setBounds(0, 0, levelWidth, levelHeight);

        // Set camera bounds
        this.camera.setBounds(0, 0, levelWidth, levelHeight);
    }

    createCollisionLayer() {
        this.walls = this.physics.add.staticGroup();
        this.doors = this.physics.add.staticGroup();

        // IntGrid is 20x11, each cell represents 16x16 pixels in Tiles.png
        // With 2.0 scale, each cell is 32x32 in game world
        const tileSize = 32;

        // Get the intgrid texture and read pixel data
        const texture = this.textures.get(`intgrid_${this.currentLevel}`);
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
        let doorCount = 0;

        // Door color: #BE4A2F = R:190, G:74, B:47
        const doorR = 190, doorG = 74, doorB = 47;
        const colorTolerance = 20;

        // Loop through each pixel in the IntGrid
        for (let y = 0; y < source.height; y++) {
            for (let x = 0; x < source.width; x++) {
                const pixelIndex = (y * source.width + x) * 4;
                const r = pixels[pixelIndex];
                const g = pixels[pixelIndex + 1];
                const b = pixels[pixelIndex + 2];
                const a = pixels[pixelIndex + 3];

                // Position is center of tile, offset from level origin (0,0)
                const worldX = x * tileSize + tileSize / 2;
                const worldY = y * tileSize + tileSize / 2;

                // Check if pixel is door color (#BE4A2F)
                if (Math.abs(r - doorR) < colorTolerance &&
                    Math.abs(g - doorG) < colorTolerance &&
                    Math.abs(b - doorB) < colorTolerance &&
                    a > 200) {
                    const door = this.add.rectangle(worldX, worldY, tileSize, tileSize);
                    this.physics.add.existing(door, true);
                    this.doors.add(door);
                    doorCount++;
                }
                // Check if pixel is black (wall tile)
                else if (r < 50 && g < 50 && b < 50 && a > 200) {
                    const wall = this.add.rectangle(worldX, worldY, tileSize, tileSize);
                    this.physics.add.existing(wall, true);
                    this.walls.add(wall);
                    wallCount++;
                }
            }
        }

        console.log('Created walls:', wallCount, 'doors:', doorCount);
    }

    onDoorCollision() {
        console.log('Door collision! Loading next level...');
        this.loadLevel(this.currentLevel + 1);
    }

    loadLevel(levelIndex: number) {
        // Clear existing walls and doors
        this.walls.clear(true, true);
        this.doors.clear(true, true);

        // Update current level
        this.currentLevel = levelIndex;

        // Update background
        this.background.setTexture(`level_${this.currentLevel}`);

        // Update world and camera bounds for new level size
        this.setupLevelBounds();

        // Recreate collision layer for new level
        this.createCollisionLayer();

        // Re-add colliders
        this.physics.add.collider(this.player, this.walls);
        this.physics.add.overlap(this.player, this.doors, this.onDoorCollision, undefined, this);

        // Move player to starting position for new level
        this.player.setPosition(100, 100);
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