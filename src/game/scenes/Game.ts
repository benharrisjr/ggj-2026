import { Scene } from 'phaser';

// Door color mapping: RGB color -> target level
// Add new colors here to create doors to different levels
const DOOR_COLORS: { r: number; g: number; b: number; targetLevel: number }[] = [
    { r: 190, g: 74, b: 47, targetLevel: 1 },   // #BE4A2F -> Level 1
    { r: 69, g: 40, b: 60, targetLevel: 0 },    // #45283C -> Level 0
    // Add more door colors as needed:
    // { r: 102, g: 57, b: 49, targetLevel: 2 },  // #663931 -> Level 2
];

// Special tile colors
const PLAYER_SPAWN_COLOR = { r: 99, g: 199, b: 77 };   // #63C74D - player spawn
const ENEMY_SPAWN_COLOR = { r: 215, g: 67, b: 207 };   // #D743CF - enemy spawn

interface DoorData {
    x: number;
    y: number;
    targetLevel: number;
}

interface SpawnPoint {
    x: number;
    y: number;
}

export class Game extends Scene {
    camera: Phaser.Cameras.Scene2D.Camera;
    background: Phaser.GameObjects.Image;
    player: Phaser.Physics.Arcade.Image; // Changed to Arcade.Image for physics
    enemies: Phaser.Physics.Arcade.Group;
    walls: Phaser.Physics.Arcade.StaticGroup;
    doors: Phaser.Physics.Arcade.StaticGroup;
    doorDataList: DoorData[];
    playerSpawnPoint: SpawnPoint | null;
    enemySpawnPoints: SpawnPoint[];
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
    playerHurtSound: Phaser.Sound.BaseSound;
    enemySpottedSound: Phaser.Sound.BaseSound;
    transitionOverlay: Phaser.GameObjects.Graphics;

    // Health system
    playerHealth: number = 6;
    playerMaxHealth: number = 6;
    heartSprites: Phaser.GameObjects.Image[] = [];
    isInvincible: boolean = false;
    isKnockedBack: boolean = false;

    constructor() {
        super('Game');

    }

    create() {
        this.camera = this.cameras.main;
        this.camera.setZoom(1.0);
        this.camera.setBackgroundColor(0x000000);

        // Create background at origin (0,0)
        this.background = this.add.image(0, 0, `level_${this.currentLevel}`);
        this.background.setOrigin(0, 0);
        this.background.setScale(2.0);

        // Set up world and camera bounds based on level size
        this.setupLevelBounds();

        // Create collision layer from IntGrid (also populates spawn points)
        this.createCollisionLayer();

        // Enable physics for the player at spawn point
        const playerStart = this.playerSpawnPoint || { x: 200, y: 250 };
        this.player = this.physics.add.image(playerStart.x, playerStart.y, 'player');
        this.player.setScale(2.0);
        this.player.setCollideWorldBounds(true);

        // Smaller hitbox for better game feel (28x28, centered on 32x32 sprite)
        this.player.body?.setSize(14, 14);

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

        // Combat sounds
        this.playerHurtSound = this.sound.add('playerHurt', { volume: 0.5 });
        this.enemySpottedSound = this.sound.add('enemySpotted', { volume: 0.3 });

        // Create enemies group and spawn at all enemy spawn points
        this.enemies = this.physics.add.group();
        this.spawnEnemies();

        // Add collision between player and enemies (for damage)
        this.physics.add.overlap(this.player, this.enemies, this.onEnemyCollision, undefined, this);

        // Create health UI
        this.createHealthUI();

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
        this.playerSpawnPoint = null;
        this.enemySpawnPoints = [];

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

                // Check for player spawn point (#63C74D)
                if (Math.abs(r - PLAYER_SPAWN_COLOR.r) < colorTolerance &&
                    Math.abs(g - PLAYER_SPAWN_COLOR.g) < colorTolerance &&
                    Math.abs(b - PLAYER_SPAWN_COLOR.b) < colorTolerance) {
                    this.playerSpawnPoint = { x: worldX, y: worldY };
                    console.log('Found player spawn point:', worldX, worldY);
                    continue;
                }

                // Check for enemy spawn point (#D743CF)
                if (Math.abs(r - ENEMY_SPAWN_COLOR.r) < colorTolerance &&
                    Math.abs(g - ENEMY_SPAWN_COLOR.g) < colorTolerance &&
                    Math.abs(b - ENEMY_SPAWN_COLOR.b) < colorTolerance) {
                    this.enemySpawnPoints.push({ x: worldX, y: worldY });
                    console.log('Found enemy spawn point:', worldX, worldY);
                    continue;
                }

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

        console.log('Created walls:', wallCount, 'doors:', doorCount, 'enemySpawns:', this.enemySpawnPoints.length);
    }

    spawnEnemies() {
        // Clear existing enemies
        this.enemies.clear(true, true);

        const enemySprites = ['enemy', 'enemy2', 'enemy3'];
        const enemySpeed = 60;

        // Spawn enemy at each spawn point with random sprite
        for (const spawn of this.enemySpawnPoints) {
            const randomSprite = enemySprites[Math.floor(Math.random() * enemySprites.length)];
            const enemy = this.enemies.create(spawn.x, spawn.y, randomSprite) as Phaser.Physics.Arcade.Image;
            enemy.setScale(2.0);
            enemy.setCollideWorldBounds(true);
            enemy.setBounce(1, 1);

            // Set random initial direction
            const angle = Math.random() * Math.PI * 2;
            enemy.setVelocity(
                Math.cos(angle) * enemySpeed,
                Math.sin(angle) * enemySpeed
            );

            // Store the base speed for later
            enemy.setData('speed', enemySpeed);
        }

        // Add collision between enemies and walls
        this.physics.add.collider(this.enemies, this.walls);

        console.log('Spawned', this.enemySpawnPoints.length, 'enemies');
    }

    createHealthUI() {
        // Clear existing hearts
        this.heartSprites.forEach(heart => heart.destroy());
        this.heartSprites = [];

        // Calculate max hearts (each heart = 2 health)
        const maxHearts = Math.ceil(this.playerMaxHealth / 2);
        const heartsPerRow = 8;
        const heartSpacing = 32;
        const startX = 16;
        const startY = 16;
        const rowHeight = 20;

        for (let i = 0; i < maxHearts; i++) {
            const row = Math.floor(i / heartsPerRow);
            const col = i % heartsPerRow;
            const x = startX + col * heartSpacing;
            const y = startY + row * rowHeight;

            const heart = this.add.image(x, y, 'heart');
            heart.setScrollFactor(0); // Fixed to camera
            heart.setDepth(999); // Above most things, below transition overlay
            heart.setScale(2.0);
            this.heartSprites.push(heart);
        }

        this.updateHealthDisplay();
    }

    updateHealthDisplay() {
        const maxHearts = Math.ceil(this.playerMaxHealth / 2);

        for (let i = 0; i < maxHearts; i++) {
            const heartValue = (i + 1) * 2; // Health value this heart represents (2, 4, 6, etc.)
            const heart = this.heartSprites[i];

            if (this.playerHealth >= heartValue) {
                // Full heart
                heart.setTexture('heart');
            } else if (this.playerHealth === heartValue - 1) {
                // Half heart
                heart.setTexture('heart-half');
            } else {
                // Empty heart
                heart.setTexture('heart-empty');
            }
        }
    }

    onEnemyCollision(_player: Phaser.GameObjects.GameObject, enemy: Phaser.GameObjects.GameObject) {
        // Don't take damage if invincible or transitioning
        if (this.isInvincible || this.isTransitioning) return;

        // Take damage
        this.playerHealth -= 1;
        console.log('Player hit! Health:', this.playerHealth);

        // Play hurt sound
        this.playerHurtSound.play();

        // Screen shake
        this.camera.shake(150, 0.01);

        // Knockback - push player away from enemy
        const enemySprite = enemy as Phaser.Physics.Arcade.Image;
        const knockbackForce = 300;
        const angle = Math.atan2(
            this.player.y - enemySprite.y,
            this.player.x - enemySprite.x
        );
        this.player.setVelocity(
            Math.cos(angle) * knockbackForce,
            Math.sin(angle) * knockbackForce
        );
        this.isKnockedBack = true;

        // End knockback after a short duration
        this.time.delayedCall(200, () => {
            this.isKnockedBack = false;
        });

        // Update health display
        this.updateHealthDisplay();

        // Become invincible briefly
        this.isInvincible = true;

        // Flash player to indicate damage
        this.tweens.add({
            targets: this.player,
            alpha: 0.3,
            duration: 100,
            yoyo: true,
            repeat: 5,
            onComplete: () => {
                this.player.setAlpha(1);
                this.isInvincible = false;
            }
        });

        // Check for death
        if (this.playerHealth <= 0) {
            this.onPlayerDeath();
        }
    }

    onPlayerDeath() {
        console.log('Player died!');
        // Reset health and respawn at player spawn point
        this.playerHealth = this.playerMaxHealth;
        this.updateHealthDisplay();

        // Respawn at player spawn point or fallback position
        const spawnPoint = this.playerSpawnPoint || { x: 100, y: 100 };
        this.player.setPosition(spawnPoint.x, spawnPoint.y);
        this.camera.centerOn(spawnPoint.x, spawnPoint.y);
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

        // Spawn enemies for this level
        this.spawnEnemies();

        // Re-add enemy collision
        this.physics.add.overlap(this.player, this.enemies, this.onEnemyCollision, undefined, this);

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
        // Skip input handling during knockback
        if (this.isKnockedBack) {
            // Still update mask and enemy visibility during knockback
            this.updateMaskAndEnemies();
            return;
        }

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

        this.updateMaskAndEnemies();

        // Reset spawn flag if player is no longer overlapping any doors
        if (this.justSpawnedOnDoor) {
            const overlappingAnyDoor = this.physics.overlap(this.player, this.doors);
            if (!overlappingAnyDoor) {
                this.justSpawnedOnDoor = false;
            }
        }
    }

    updateMaskAndEnemies() {
        // Update mask to follow player (clear previous frame to prevent trails)
        this.maskGraphics.clear();
        this.maskGraphics.fillStyle(0xffffff);
        // Draw rotated triangle centered on player
        this.drawRotatedTriangle(this.player.x, this.player.y, this.playerAngle, 80);

        // Check if each enemy is inside the mask triangle
        const trianglePoints = this.getTrianglePoints(this.player.x, this.player.y, this.playerAngle, 80);
        this.enemies.getChildren().forEach((enemy) => {
            const enemySprite = enemy as Phaser.Physics.Arcade.Image;
            const wasVisible = enemySprite.visible;
            const enemyInMask = this.isPointInTriangle(
                enemySprite.x,
                enemySprite.y,
                trianglePoints.p1,
                trianglePoints.p2,
                trianglePoints.p3
            );
            enemySprite.setVisible(enemyInMask);

            // Play spotted sound when enemy becomes visible
            if (enemyInMask && !wasVisible) {
                this.enemySpottedSound.play();
            }

            // Check if enemy is behind the player (outside forward 180 degree arc)
            const angleToEnemy = Math.atan2(
                enemySprite.y - this.player.y,
                enemySprite.x - this.player.x
            );
            // Player faces opposite of playerAngle (subtract PI to get forward direction)
            const playerForward = this.playerAngle - Math.PI;
            let angleDiff = angleToEnemy - playerForward;
            // Normalize to -PI to PI
            while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
            while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;
            const isBehindPlayer = Math.abs(angleDiff) > Math.PI / 2;

            // Freeze enemy when in player's view AND in front of player
            if (enemyInMask && !isBehindPlayer) {
                // Store current velocity before freezing (if not already frozen)
                if (!enemySprite.getData('frozen')) {
                    enemySprite.setData('savedVelocityX', enemySprite.body?.velocity.x || 0);
                    enemySprite.setData('savedVelocityY', enemySprite.body?.velocity.y || 0);
                    enemySprite.setData('frozen', true);
                }
                enemySprite.setVelocity(0, 0);
            } else {
                // Restore movement when out of view
                if (enemySprite.getData('frozen')) {
                    enemySprite.setData('frozen', false);
                }

                // Calculate distance to player
                const distToPlayer = Phaser.Math.Distance.Between(
                    enemySprite.x, enemySprite.y,
                    this.player.x, this.player.y
                );

                const speed = enemySprite.getData('speed') || 60;
                const chaseRange = 200;

                // Only chase if within range, and 70% chance to chase vs 30% random
                const inRange = distToPlayer <= chaseRange;
                const shouldChase = inRange && Math.random() < 0.7;

                if (shouldChase) {
                    // Move towards player
                    const angle = Math.atan2(
                        this.player.y - enemySprite.y,
                        this.player.x - enemySprite.x
                    );
                    enemySprite.setVelocity(
                        Math.cos(angle) * speed,
                        Math.sin(angle) * speed
                    );
                } else {
                    // Random direction
                    const randomAngle = Math.random() * Math.PI * 2;
                    enemySprite.setVelocity(
                        Math.cos(randomAngle) * speed,
                        Math.sin(randomAngle) * speed
                    );
                }
            }
        });
    }
}