import { Scene } from 'phaser';

// Door color mapping: RGB color -> target level
// Add new colors here to create doors to different levels
const DOOR_COLORS: { r: number; g: number; b: number; targetLevel: number }[] = [
    { r: 190, g: 74, b: 47, targetLevel: 1 },   // #BE4A2F -> Level 1
    { r: 69, g: 40, b: 60, targetLevel: 0 },    // #45283C -> Level 0
    // Add more door colors as needed:
    // { r: 102, g: 57, b: 49, targetLevel: 2 },  // #663931 -> Level 2
];

interface DoorData {
    x: number;
    y: number;
    targetLevel: number;
}

export class Game extends Scene {
    camera: Phaser.Cameras.Scene2D.Camera;
    background: Phaser.GameObjects.Image;
    player: Phaser.Physics.Arcade.Image; // Changed to Arcade.Image for physics
    enemys: Phaser.Physics.Arcade.Group;
    enemy: Phaser.Physics.Arcade.Image;
    walls: Phaser.Physics.Arcade.StaticGroup;
    doors: Phaser.Physics.Arcade.StaticGroup;
    doorDataList: DoorData[];
    cursors: Phaser.Types.Input.Keyboard.CursorKeys;
    wasd: { up: Phaser.Input.Keyboard.Key; down: Phaser.Input.Keyboard.Key; left: Phaser.Input.Keyboard.Key; right: Phaser.Input.Keyboard.Key };
    maskGraphics: Phaser.GameObjects.Graphics;
    playerAngle: number = 0; // Start facing up (after correction)
    gamepad: Phaser.Input.Gamepad.Gamepad;
    currentLevel: number = 0;
    previousLevel: number = -1;
    isTransitioning: boolean = false;
    justSpawnedOnDoor: boolean = false;
    footstepSounds: Phaser.Sound.BaseSound[];
    isPlayingFootstep: boolean = false;
    doorOpenSound: Phaser.Sound.BaseSound;
    doorCloseSound: Phaser.Sound.BaseSound;
    transitionOverlay: Phaser.GameObjects.Graphics;

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

        // Load all footstep sound variations
        this.footstepSounds = [];
        for (let i = 1; i <= 9; i++) {
            const sound = this.sound.add(`footstep0${i}`, { volume: 0.2 });
            sound.on('complete', () => {
                this.isPlayingFootstep = false;
            });
            this.footstepSounds.push(sound);
        }

        // Door sounds
        this.doorOpenSound = this.sound.add('doorOpen', { volume: 0.5 });
        this.doorCloseSound = this.sound.add('doorClose', { volume: 0.5 });

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

        // Create transition overlay (separate from fog-of-war mask)
        this.transitionOverlay = this.add.graphics();
        this.transitionOverlay.setDepth(1000); // Render above everything
        this.transitionOverlay.setAlpha(0); // Start invisible
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

    calculateDoorSpawnOffset(doorX: number, doorY: number): { x: number; y: number } {
        const levelWidth = this.background.displayWidth;
        const levelHeight = this.background.displayHeight;
        const offset = 48; // Spawn offset distance

        // Calculate distance from each edge
        const distToLeft = doorX;
        const distToRight = levelWidth - doorX;
        const distToTop = doorY;
        const distToBottom = levelHeight - doorY;

        // Find which edge is closest
        const minDist = Math.min(distToLeft, distToRight, distToTop, distToBottom);

        // Offset away from the closest edge (into the room)
        if (minDist === distToLeft) {
            return { x: offset, y: 0 };  // Door on left, spawn to the right
        } else if (minDist === distToRight) {
            return { x: -offset, y: 0 }; // Door on right, spawn to the left
        } else if (minDist === distToTop) {
            return { x: 0, y: offset };  // Door on top, spawn below
        } else {
            return { x: 0, y: -offset }; // Door on bottom, spawn above
        }
    }

    createCollisionLayer() {
        this.walls = this.physics.add.staticGroup();
        this.doors = this.physics.add.staticGroup();
        this.doorDataList = [];

        // IntGrid is 20x11, each cell represents 16x16 pixels in Tiles.png
        // With 2.0 scale, each cell is 32x32 in game world
        const tileSize = 32;
        const colorTolerance = 20;

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

        // Loop through each pixel in the IntGrid
        for (let y = 0; y < source.height; y++) {
            for (let x = 0; x < source.width; x++) {
                const pixelIndex = (y * source.width + x) * 4;
                const r = pixels[pixelIndex];
                const g = pixels[pixelIndex + 1];
                const b = pixels[pixelIndex + 2];
                const a = pixels[pixelIndex + 3];

                if (a < 200) continue; // Skip transparent pixels

                // Position is center of tile, offset from level origin (0,0)
                const worldX = x * tileSize + tileSize / 2;
                const worldY = y * tileSize + tileSize / 2;

                // Check if pixel matches any door color
                let isDoor = false;
                for (const doorColor of DOOR_COLORS) {
                    if (Math.abs(r - doorColor.r) < colorTolerance &&
                        Math.abs(g - doorColor.g) < colorTolerance &&
                        Math.abs(b - doorColor.b) < colorTolerance) {

                        const door = this.add.rectangle(worldX, worldY, tileSize, tileSize);
                        this.physics.add.existing(door, true);
                        door.setData('targetLevel', doorColor.targetLevel);
                        this.doors.add(door);

                        // Store door data for spawn point lookup
                        this.doorDataList.push({
                            x: worldX,
                            y: worldY,
                            targetLevel: doorColor.targetLevel
                        });

                        doorCount++;
                        isDoor = true;
                        break;
                    }
                }

                // Check if pixel is black (wall tile)
                if (!isDoor && r < 50 && g < 50 && b < 50) {
                    const wall = this.add.rectangle(worldX, worldY, tileSize, tileSize);
                    this.physics.add.existing(wall, true);
                    this.walls.add(wall);
                    wallCount++;
                }
            }
        }

        console.log('Created walls:', wallCount, 'doors:', doorCount, 'doorData:', this.doorDataList);
    }

    onDoorCollision(_player: Phaser.GameObjects.GameObject, door: Phaser.GameObjects.GameObject) {
        // Ignore door collisions if player just spawned on a door
        if (this.justSpawnedOnDoor) return;

        // Prevent multiple transitions
        if (this.isTransitioning) return;
        this.isTransitioning = true;

        const targetLevel = door.getData('targetLevel') as number;
        console.log(`Door collision! Going from level ${this.currentLevel} to level ${targetLevel}`);

        this.doorOpenSound.play();

        // Draw black rectangle for fade overlay
        this.transitionOverlay.clear();
        this.transitionOverlay.fillStyle(0x000000, 1.0);
        this.transitionOverlay.fillRect(0, 0, 2000, 2000);

        // Fade to black (200ms)
        this.tweens.add({
            targets: this.transitionOverlay,
            alpha: 1.0,
            duration: 200,
            ease: 'Power2',
            onComplete: () => {
                // Execute level transition during black screen
                this.loadLevel(targetLevel);

                // Camera snap for extra safety
                const spawnDoor = this.doorDataList.find(d => d.targetLevel === this.previousLevel);
                if (spawnDoor) {
                    const spawnOffset = this.calculateDoorSpawnOffset(spawnDoor.x, spawnDoor.y);
                    this.camera.centerOn(spawnDoor.x + spawnOffset.x, spawnDoor.y + spawnOffset.y);
                }

                // Fade back from black (200ms)
                this.tweens.add({
                    targets: this.transitionOverlay,
                    alpha: 0,
                    duration: 200,
                    ease: 'Power2',
                    onComplete: () => {
                        // Transition complete, allow next door interaction
                        this.isTransitioning = false;
                    }
                });
            }
        });
    }

    loadLevel(levelIndex: number) {
        // Clear existing walls and doors
        this.walls.clear(true, true);
        this.doors.clear(true, true);

        // Track level transition
        this.previousLevel = this.currentLevel;
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

        // Find door that leads back to previous level and spawn there
        const spawnDoor = this.doorDataList.find(d => d.targetLevel === this.previousLevel);
        if (spawnDoor) {
            const spawnOffset = this.calculateDoorSpawnOffset(spawnDoor.x, spawnDoor.y);
            const spawnX = spawnDoor.x + spawnOffset.x;
            const spawnY = spawnDoor.y + spawnOffset.y;
            this.player.setPosition(spawnX, spawnY);
            // Snap camera to player position (prevents pan if fade fails)
            this.camera.centerOn(spawnX, spawnY);
            console.log(`Spawning at door to level ${this.previousLevel}:`, spawnX, spawnY);
        } else {
            // Fallback spawn position if no matching door found
            this.player.setPosition(100, 100);
            // Snap camera to player position (prevents pan if fade fails)
            this.camera.centerOn(100, 100);
            console.log('No matching door found, spawning at default position');
        }

        // Play door close sound
        this.doorCloseSound.play();

        // Mark that player just spawned (may be on a door)
        this.justSpawnedOnDoor = true;
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

            // Play random footstep sound while moving
            if (!this.isPlayingFootstep) {
                const randomIndex = Math.floor(Math.random() * this.footstepSounds.length);
                const sound = this.footstepSounds[randomIndex] as Phaser.Sound.WebAudioSound;
                sound.setRate(0.8 + Math.random() * 0.4);
                sound.play();
                this.isPlayingFootstep = true;
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

        // Reset spawn flag if player is no longer overlapping any doors
        if (this.justSpawnedOnDoor) {
            const overlappingAnyDoor = this.physics.overlap(this.player, this.doors);
            if (!overlappingAnyDoor) {
                this.justSpawnedOnDoor = false;
            }
        }
    }
}