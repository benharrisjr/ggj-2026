import { Scene } from 'phaser';
import { Masks } from '../systems/masks/masks';
import { Ability } from '../systems/abilities/abilities';
import { UI } from '../systems/ui/ui';

// Door color mapping: RGB color -> target level
// Add new colors here to create doors to different levels
const DOOR_COLORS: { r: number; g: number; b: number; targetLevel: number }[] = [
    { r: 215, g: 118, b: 67, targetLevel: 2 },  // #D77643 -> Level 2
    { r: 190, g: 74, b: 47, targetLevel: 1 },   // #BE4A2F -> Level 1
    { r: 69, g: 40, b: 60, targetLevel: 0 },    // #45283C -> Level 0
    // Add more door colors as needed:
    // { r: 102, g: 57, b: 49, targetLevel: 2 },  
    // #D77643 door2
    // #EAD4AA door3
    // #E4A672 door4
    // #FEAE34 ladder
    // #FEE761 ladder2
    // #3E8948 ladder3
    // #124E89 ladder4
];

// Special tile colors
const PLAYER_SPAWN_COLOR = { r: 99, g: 199, b: 77 };   // #63C74D - player spawn
const ENEMY_SPAWN_COLOR = { r: 215, g: 67, b: 207 };   // #D743CF - enemy spawn
const BOSS_SPAWN_COLOR = { r: 172, g: 50, b: 50 };     // #AC3232 - boss spawn


// #0099DB chest
const BARREL_SPAWN_COLOR = { r: 44, g: 232, b: 245 };   // #2CE8F5 - barrel spawn
// #FFFFFF crate
// #C0CBDC water
// #8B9BB4 anvil
// #5A6988 pickup
// #3A4466 pickup1
// #181425 pickup2
// #FF0044 pickup3
// #B55088 pickup4
// #733E39 pickup5
// #A22633 pickup6
// #F77622 pickup7
const TORCH_SPAWN_COLOR = { r: 38, g: 92, b: 66 };   // #265C42 torch
const INVISIBLE_WALL_COLOR = { r: 246, g: 117, b: 122 };   // #F6757A invisible wall


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
    player: Phaser.Physics.Arcade.Image;
    playerContainer: Phaser.GameObjects.Container;
    playerHead: Phaser.GameObjects.Image;
    playerBody: Phaser.GameObjects.Image;
    playerShadow: Phaser.GameObjects.Ellipse;
    enemies: Phaser.Physics.Arcade.Group;
    walls: Phaser.Physics.Arcade.StaticGroup;
    doors: Phaser.Physics.Arcade.StaticGroup;
    doorDataList: DoorData[];
    doorSprites: Phaser.GameObjects.Image[];
    playerSpawnPoint: SpawnPoint | null;
    enemySpawnPoints: SpawnPoint[];
    bossSpawnPoints: SpawnPoint[];
    torchSpawnPoints: SpawnPoint[];
    boss: Phaser.Physics.Arcade.Image | null = null;
    invisibleWalls: Phaser.GameObjects.Image[];
    cursors: Phaser.Types.Input.Keyboard.CursorKeys;
    wasd: { up: Phaser.Input.Keyboard.Key; down: Phaser.Input.Keyboard.Key; left: Phaser.Input.Keyboard.Key; right: Phaser.Input.Keyboard.Key };
    maskGraphics: Phaser.GameObjects.Graphics;
    playerAngle: number = 0; // Start facing up (after correction)
    gamepad: Phaser.Input.Gamepad.Gamepad | null = null;
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
    fireShootSound: Phaser.Sound.BaseSound;
    slashSound: Phaser.Sound.BaseSound;
    whiffSound: Phaser.Sound.BaseSound;
    teleportSound: Phaser.Sound.BaseSound;
    transitionOverlay: Phaser.GameObjects.Graphics;
    isInputAllowed: boolean = true;

    // Health system
    playerHealth: number = 6;
    playerMaxHealth: number = 6;
    isInvincible: boolean = false;
    isKnockedBack: boolean = false;
    isTransformed: boolean = false;
    isPlayerBusy: boolean = false;

    gamepadMessage: Phaser.GameObjects.Text;

    masks: Masks;
    ui: UI;

    // Ability system
    currentAbility: Ability = Ability.Interact;
    abilityLastUsed: Record<number, number> = {};
    abilityCooldowns: Record<number, number> = {};
    spaceKey: Phaser.Input.Keyboard.Key;
    escapeKey: Phaser.Input.Keyboard.Key;
    previousGamepadAState: boolean = false;
    previousGamepadBState: boolean = false;
    previousGamepadXState: boolean = false;
    previousGamepadYState: boolean = false;
    previousGamepadLTState: boolean = false;
    previousGamepadRTState: boolean = false;
    previousGamepadLBState: boolean = false;
    previousGamepadRBState: boolean = false;
    dashHitEnemy: boolean = false;
    dashInflictsDamage: boolean = false;
    actionButtonPressed: boolean = false;
    slashAnimToggle: boolean = true;

    // Last movement direction (unit vector) used for dash fallback
    lastMoveX: number = 0;
    lastMoveY: number = -1;
    // Dashing state to prevent update from overwriting dash velocity
    isDashing: boolean = false;
    // Debug mode toggle
    debugMode: boolean = true;
    // Torches
    torches: Phaser.Physics.Arcade.StaticGroup;
    // Music
    levelMusic: Phaser.Sound.BaseSound;
    levelMusicLoop: Phaser.Sound.BaseSound;
    bossMusic: Phaser.Sound.BaseSound;
    puzzleMusic: Phaser.Sound.BaseSound;
    isBossMusicPlaying: boolean = false;
    // Barrels
    barrels: Phaser.Physics.Arcade.StaticGroup;
    barrelSpawnPoints: SpawnPoint[];
    // Health potions
    healthPotions: Phaser.Physics.Arcade.Group;
    healthPickupSound: Phaser.Sound.BaseSound;
    // Player direction for sprite selection
    currentPlayerDirection: 'up' | 'down' | 'horizontal' = 'down';
    // Enemy tracking
    remainingEnemies: number = 0;

    constructor() {
        super('Game');
    }

    create() {
        // Reset to level 0 when starting a new game
        this.currentLevel = 0;
        this.previousLevel = -1;

        this.game.canvas.style.cursor = 'none';
        this.physics.world.debugGraphic.visible = false;
        this.camera = this.cameras.main;
        this.camera.setZoom(1.0);
        this.camera.setBackgroundColor(0x000000);

        // Stop all existing sounds and play level music (looping)
        this.sound.stopAll();
        this.levelMusic = this.sound.add('levelMusic', { loop: true, volume: 0.3 });
        this.levelMusicLoop = this.sound.add('levelMusicLoop', { loop: true, volume: 0.3 });
        this.bossMusic = this.sound.add('bossMusic', { loop: true, volume: 0.4 });
        this.puzzleMusic = this.sound.add('puzzleMusic', { loop: true, volume: 0.4 });
        this.levelMusic.play();
        this.levelMusic.on('complete', () => {
            this.levelMusicLoop.play();
        });
        this.isBossMusicPlaying = false;

        // Create background at origin (0,0)
        this.background = this.add.image(0, 0, `level_${this.currentLevel}`);
        this.background.setOrigin(0, 0);
        this.background.setScale(2.0);

        // Set up world and camera bounds based on level size
        this.setupLevelBounds();

        // Create collision layer from IntGrid (also populates spawn points)
        this.createCollisionLayer();

        const playerStart = this.playerSpawnPoint || { x: 200, y: 250 };

        // Create physics body (invisible - just for collisions)
        this.player = this.physics.add.image(playerStart.x, playerStart.y, 'player-front');
        this.player.setScale(2.0);
        this.player.setCollideWorldBounds(true);
        this.player.setAlpha(0); // Hide the physics sprite

        // Smaller hitbox for better game feel
        this.player.body?.setSize(14, 14);

        // Create visual container for split sprites
        this.playerContainer = this.add.container(playerStart.x, playerStart.y);
        this.playerContainer.setDepth(10); // Ensure container renders above background

        // Sprites are 16x8 pixels, scaled 2x = 32x16 each
        // Stack them vertically: head on top, body below
        
        this.playerShadow = this.add.ellipse(0, 0, 28, 16, 0x000000, 0.3);
        // const blur = this.playerShadow.preFX?.addBlur(40, 40 ,100,1);

        // Create body sprite (offset down from center)
        this.playerBody = this.make.image({ x: 0, y: 8, key: 'body-front', add: false });
        this.playerBody.setScale(2.0);

        // Create head sprite (offset up from center)
        this.playerHead = this.make.image({ x: 0, y: -8, key: 'head-front', add: false });
        this.playerHead.setScale(2.0);

        // Add to container (order matters: body first, then head on top)
        this.playerContainer.add([this.playerBody, this.playerHead]);

        // Camera follows player
        this.camera.startFollow(this.player, true, 0.1, 0.1);

        // Sync container position after every physics step for zero lag
        this.physics.world.on('worldstep', () => {
            this.playerContainer.setPosition(this.player.x, this.player.y);
            this.playerShadow.setPosition(this.player.x, this.player.y + 16)
        });

        // Add collision between player and walls
        this.physics.add.collider(this.player, this.walls);

    // Add overlap detection for doors
    this.physics.add.overlap(this.player, this.doors, this.onDoorCollision as any, undefined, this);

        // Load all footstep sound variations
        this.footstepSounds = [];
        for (let i = 1; i <= 9; i++) {
            const sound = this.sound.add(`footstep0${i}`, { volume: 0.1 });
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
        this.fireShootSound = this.sound.add('fireShoot', { volume: 0.5 });
        this.slashSound = this.sound.add('chop', { volume: 0.7 });
        this.whiffSound = this.sound.add('whiff1', { volume: 0.5 });
        this.teleportSound = this.sound.add('teleport', { volume: 0.5 });

        // Pickup sounds
        this.healthPickupSound = this.sound.add('health', { volume: 0.5 });

        // Create enemies group and spawn at all enemy spawn points
        this.enemies = this.physics.add.group();
        this.spawnEnemies();

        // Create torches group and place torches
        this.torches = this.physics.add.staticGroup();
        this.createTorches();

        // Add collision between player and torches
        this.physics.add.collider(this.player, this.torches);

        // Create barrels group and place barrels
        this.barrels = this.physics.add.staticGroup();
        this.createBarrels();

        // Add collision between player and barrels
        this.physics.add.collider(this.player, this.barrels);

        // Create health potions group (initially empty)
        this.healthPotions = this.physics.add.group();

        // Add overlap detection for health potions and player
        this.physics.add.overlap(this.player, this.healthPotions, this.onHealthPotionCollision as any, undefined, this);

    // Add collision between player and enemies (for damage)
    this.physics.add.overlap(this.player, this.enemies, this.onEnemyCollision as any, undefined, this);

        // Create cursor keys for input
    this.cursors = this.input.keyboard!.createCursorKeys();

    // Space key for action
    this.spaceKey = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE);

    // Escape key for debug toggle
    this.escapeKey = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.ESC);

        // Left click for basic attack, right click for mask ability
        this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
            if (pointer.leftButtonDown()) {
                this.performBasicAttack();
            } else if (pointer.rightButtonDown()) {
                console.log('[INPUT] Right mouse button pressed - using mask ability');
                this.tryUseAbility();
            }
        });

        // Create WASD keys
        this.wasd = {
            up: this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.W),
            down: this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.S),
            left: this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.A),
            right: this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.D)
        };

        // Gamepad connection handling
        if (this.input.gamepad) {
            // Check if gamepad is already connected
            if (this.input.gamepad.total > 0) {
                this.gamepad = this.input.gamepad.getPad(0);
                console.log('Gamepad already connected:', this.gamepad.id);
            }

            // Listen for gamepad connection
            this.input.gamepad.on('connected', (pad: Phaser.Input.Gamepad.Gamepad) => {
                console.log('Gamepad connected:', pad.id);

                this.gamepadMessage = this.add.text(90, 320, `Gamepad connected: ${pad.id}`);
                this.gamepadMessage.setScrollFactor(0);
                this.gamepadMessage.setDepth(999);
                this.time.addEvent({
                    delay: 5000,
                    callback: () => {
                        this.gamepadMessage.destroy();
                    },
                    loop: false
                });
                this.gamepad = pad;
            });

            // Listen for gamepad disconnection
            this.input.gamepad.on('disconnected', (pad: Phaser.Input.Gamepad.Gamepad) => {
                console.log('Gamepad disconnected:', pad.id);
                if (this.gamepad === pad) {
                    this.gamepad = null;
                }
            });
        }

        // Initialize ability cooldowns (ms)
        this.abilityCooldowns[Ability.DashAttack] = 1000;
        this.abilityCooldowns[Ability.FireAttack] = 500;
        this.abilityCooldowns[Ability.Interact] = 250;
        this.abilityCooldowns[Ability.Special] = 2000;
        this.abilityCooldowns[Ability.Transformation] = 2000;

        // ensure last-used defaults
        Object.keys(this.abilityCooldowns).forEach(k => { this.abilityLastUsed[Number(k)] = 0; });

        // Create slash sprite
        this.anims.create({
            key: 'sword-slash-anim',
            frames: this.anims.generateFrameNumbers('sword-slash', {frames: [3,4,5,6,7]}),
            frameRate: 24,
            repeat: 0,
            hideOnComplete: true,
        });

        // Create smoke sprite
        this.anims.create({
            key: "smoke",
            frames: this.anims.generateFrameNumbers('smoke-fire', {frames: [0,1,2,3,4,5,6,7] }),
            frameRate: 16,
            repeat: 0,
            hideOnComplete: true,
        });

        // 1. Create a Graphics object
        const graphics = this.add.graphics();
        graphics.fillStyle(0xff0000, 1); // Red fill
        graphics.fillEllipse(10, 10, 20, 20); // x, y, width, height

        // 2. Generate the texture from the graphics object
        graphics.generateTexture('ellipseTexture', 100, 100);

        // 3. Destroy the graphic object (it is now a texture)
        graphics.destroy();
        
        // this.anims.create({
        //     key: "hit-particles-fx",
        //     frames: this.anims.generateFrameNumbers('hit-particles-fx', {frames: [0,1,2,3,4,5,6,7] }),
        //     frameRate: 16,
        //     repeat: 0,
        //     hideOnComplete: true,
        // });

        this.masks = new Masks(this);
        this.ui = new UI(this);

        // Listen for mask selection events and map them to abilities.
        // When a mask is selected, set the current ability (if mapped) and try to use it.
        this.events.on('mask:select', (mask: number) => {
            console.log('[MASK] Mask selected:', mask);
            const mapping: Record<number, Ability> = {
                1: Ability.DashAttack,
                2: Ability.FireAttack,
                3: Ability.Interact,
                4: Ability.Special,
                5: Ability.Transformation,
            };
            if (mapping[mask] !== undefined) {
                this.currentAbility = mapping[mask];
                console.log('[MASK] Current ability set to:', this.currentAbility, '(', Ability[this.currentAbility], ')');
            } else {
                console.log('[MASK] No ability mapping for mask:', mask);
            }

            // Update head sprite based on mask
            this.updateHeadSprite(mask);
        });

        // Setup UI (health, mask display, touch controls)
        this.ui.setup();

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
        this.doorSprites = [];
        this.playerSpawnPoint = null;
        this.enemySpawnPoints = [];
        this.bossSpawnPoints = [];
        this.torchSpawnPoints = [];
        this.barrelSpawnPoints = [];
        this.invisibleWalls = [];

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

                // Check for boss spawn point (#AC3232)
                if (Math.abs(r - BOSS_SPAWN_COLOR.r) < colorTolerance &&
                    Math.abs(g - BOSS_SPAWN_COLOR.g) < colorTolerance &&
                    Math.abs(b - BOSS_SPAWN_COLOR.b) < colorTolerance) {
                    this.bossSpawnPoints.push({ x: worldX, y: worldY });
                    console.log('Found boss spawn point:', worldX, worldY);
                    continue;
                }

                // Check for torch spawn point (#265C42)
                if (Math.abs(r - TORCH_SPAWN_COLOR.r) < colorTolerance &&
                    Math.abs(g - TORCH_SPAWN_COLOR.g) < colorTolerance &&
                    Math.abs(b - TORCH_SPAWN_COLOR.b) < colorTolerance) {
                    this.torchSpawnPoints.push({ x: worldX, y: worldY });
                    console.log('Found torch spawn point:', worldX, worldY);
                    continue;
                }

                // Check for barrel spawn point (#2CE8F5)
                if (Math.abs(r - BARREL_SPAWN_COLOR.r) < colorTolerance &&
                    Math.abs(g - BARREL_SPAWN_COLOR.g) < colorTolerance &&
                    Math.abs(b - BARREL_SPAWN_COLOR.b) < colorTolerance) {
                    this.barrelSpawnPoints.push({ x: worldX, y: worldY });
                    console.log('Found barrel spawn point:', worldX, worldY);
                    continue;
                }

                // Check for invisible wall (#F6757A)
                if (Math.abs(r - INVISIBLE_WALL_COLOR.r) < colorTolerance &&
                    Math.abs(g - INVISIBLE_WALL_COLOR.g) < colorTolerance &&
                    Math.abs(b - INVISIBLE_WALL_COLOR.b) < colorTolerance) {
                    // Create collision wall
                    const wall = this.add.rectangle(worldX, worldY, tileSize, tileSize);
                    this.physics.add.existing(wall, true);
                    this.walls.add(wall);

                    // Create invisible wall sprite (hidden by default)
                    const invisibleWall = this.add.image(worldX, worldY, 'invisible-wall');
                    invisibleWall.setScale(2.0);
                    invisibleWall.setDepth(2); // Above background, visible when revealed
                    invisibleWall.setVisible(false);
                    // Store reference to collision body for toggling
                    invisibleWall.setData('collisionBody', wall);
                    this.invisibleWalls.push(invisibleWall);

                    console.log('Found invisible wall:', worldX, worldY);
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

                        // Determine if this is left or right door tile by checking adjacent pixel
                        let isLeftDoor = true; // Default to left

                        // Check pixel to the right
                        if (x + 1 < source.width) {
                            const rightPixelIndex = (y * source.width + (x + 1)) * 4;
                            const rightR = pixels[rightPixelIndex];
                            const rightG = pixels[rightPixelIndex + 1];
                            const rightB = pixels[rightPixelIndex + 2];
                            const rightA = pixels[rightPixelIndex + 3];

                            // If right pixel is also a door (same color), this is left tile
                            if (rightA >= 200 &&
                                Math.abs(rightR - r) < colorTolerance &&
                                Math.abs(rightG - g) < colorTolerance &&
                                Math.abs(rightB - b) < colorTolerance) {
                                isLeftDoor = true;
                            }
                        }

                        // Check pixel to the left
                        if (x - 1 >= 0) {
                            const leftPixelIndex = (y * source.width + (x - 1)) * 4;
                            const leftR = pixels[leftPixelIndex];
                            const leftG = pixels[leftPixelIndex + 1];
                            const leftB = pixels[leftPixelIndex + 2];
                            const leftA = pixels[leftPixelIndex + 3];

                            // If left pixel is also a door (same color), this is right tile
                            if (leftA >= 200 &&
                                Math.abs(leftR - r) < colorTolerance &&
                                Math.abs(leftG - g) < colorTolerance &&
                                Math.abs(leftB - b) < colorTolerance) {
                                isLeftDoor = false;
                            }
                        }

                        // Create visual door sprite with correct tile
                        const doorTexture = isLeftDoor ? 'door-closed-left' : 'door-closed-right';
                        const doorSprite = this.add.image(worldX, worldY, doorTexture);
                        doorSprite.setScale(2.0);
                        doorSprite.setDepth(1); // Above background, below player
                        doorSprite.setData('isLeft', isLeftDoor); // Store for opening later
                        this.doorSprites.push(doorSprite);

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

        // Set remaining enemies count
        this.remainingEnemies = this.enemySpawnPoints.length;

        const enemyTypes = ['blue', 'red'];
        const enemySpeed = 60;

        // Spawn enemy at each spawn point with random type
        for (const spawn of this.enemySpawnPoints) {
            const randomType = enemyTypes[Math.floor(Math.random() * enemyTypes.length)];
            const enemySprite = `enemy-${randomType}-front`; // Start with front sprite
            const enemy = this.enemies.create(spawn.x, spawn.y, enemySprite) as Phaser.Physics.Arcade.Image;
            if (randomType === 'blue') {
                enemy.setScale(3.0);
            } else {
                enemy.setScale(2.0);
            }
            enemy.setCollideWorldBounds(true);
            enemy.setBounce(1, 1);

            // Set random initial direction
            const angle = Math.random() * Math.PI * 2;
            enemy.setVelocity(
                Math.cos(angle) * enemySpeed,
                Math.sin(angle) * enemySpeed
            );

            // Store the base speed, health, and type
            enemy.setData('speed', enemySpeed);
            enemy.setData('enemyType', randomType); // Store type for sprite updates
            enemy.setData('currentDirection', 'front');

            // Blue enemy has 4 health, red has 2
            const health = randomType === 'blue' ? 4 : 2;
            enemy.setData('health', health);
        }

        // Add collision between enemies and walls
        this.physics.add.collider(this.enemies, this.walls);

        console.log('Spawned', this.enemySpawnPoints.length, 'enemies');
    }

    spawnBoss() {
        // Only spawn boss in level_2
        if (this.currentLevel !== 2) {
            console.log('[BOSS] Not in level_2, skipping boss spawn');
            return;
        }

        // Destroy existing boss if any
        if (this.boss) {
            this.boss.destroy();
            this.boss = null;
        }

        // Hardcoded spawn position for now
        const spawnX = 352;
        const spawnY = 288;
        const bossSpeed = 80;

        // Create boss enemy
        this.boss = this.physics.add.image(spawnX, spawnY, 'demon-front');
        this.boss.setScale(4.0);
        this.boss.setCollideWorldBounds(true);
        this.boss.setDepth(5);

        // Store boss-specific data
        this.boss.setData('speed', bossSpeed);
        this.boss.setData('health', 10);
        this.boss.setData('isBoss', true);
        this.boss.setData('frozen', false);
        this.boss.setData('frozenTime', 0);
        this.boss.setData('currentDirection', 'front');

        // Add collision between boss and walls
        this.physics.add.collider(this.boss, this.walls);

        // Add overlap for player damage
        this.physics.add.overlap(this.player, this.boss, this.onBossCollision as any, undefined, this);

        console.log('[BOSS] Spawned boss at', spawnX, spawnY);
    }

    onBossCollision(_player: Phaser.GameObjects.GameObject, boss: Phaser.GameObjects.GameObject) {
        const bossSprite = boss as Phaser.Physics.Arcade.Image;

        // If dashing with damage enabled, damage the boss instead
        if (this.isDashing && this.dashInflictsDamage && !this.dashHitEnemy) {
            console.log('[DASH] Hit boss during dash attack!');
            this.damageBoss(bossSprite, 1); // Dash attack does 1 damage to boss

            // Mark that this dash has hit (use same flag for boss/enemy)
            this.dashHitEnemy = true;

            // Reset dash cooldown to allow immediate chaining
            this.abilityLastUsed[Ability.DashAttack] = 0;
            console.log('[DASH] Cooldown reset - can dash again!');
            return;
        }

        // Don't take damage if invincible or transitioning or boss is frozen
        if (this.isInvincible || this.isTransitioning || bossSprite.getData('frozen')) return;

        // Take damage (boss does 2 damage)
        this.playerHealth -= 2;
        console.log('[BOSS] Player hit by boss! Health:', this.playerHealth);

        // Play hurt sound
        this.playerHurtSound.play();

        // Screen shake (stronger for boss)
        this.camera.shake(200, 0.02);

        // Knockback - push player away from boss
        const knockbackForce = 400;
        const angle = Math.atan2(
            this.player.y - bossSprite.y,
            this.player.x - bossSprite.x
        );
        this.player.setVelocity(
            Math.cos(angle) * knockbackForce,
            Math.sin(angle) * knockbackForce
        );
        this.isKnockedBack = true;

        this.time.delayedCall(200, () => {
            this.isKnockedBack = false;
        });

        // Update health display
        this.ui.updateHealthDisplay();

        // Become invincible briefly
        this.isInvincible = true;

        // Flash player during invincibility
        this.tweens.add({
            targets: this.playerContainer,
            alpha: 0.5,
            duration: 100,
            yoyo: true,
            repeat: 5,
            onComplete: () => {
                this.isInvincible = false;
                this.playerContainer.setAlpha(1);
            }
        });

        // Check for death
        if (this.playerHealth <= 0) {
            this.onPlayerDeath();
        }
    }

    getValidTeleportPosition(): { x: number; y: number } | null {
        // Get level dimensions
        const levelWidth = this.background.displayWidth;
        const levelHeight = this.background.displayHeight;
        const tileSize = 32;

        // Try to find a valid position (not colliding with walls)
        const maxAttempts = 50;
        for (let i = 0; i < maxAttempts; i++) {
            // Random position within level bounds
            const x = Math.floor(Math.random() * (levelWidth / tileSize)) * tileSize + tileSize / 2;
            const y = Math.floor(Math.random() * (levelHeight / tileSize)) * tileSize + tileSize / 2;

            // Check if this position is not too close to player
            const distToPlayer = Phaser.Math.Distance.Between(x, y, this.player.x, this.player.y);
            if (distToPlayer < 100) continue;

            // Check if position overlaps with any wall
            let isValid = true;
            this.walls.getChildren().forEach((wall) => {
                const wallSprite = wall as Phaser.Physics.Arcade.Image;
                const dist = Phaser.Math.Distance.Between(x, y, wallSprite.x, wallSprite.y);
                if (dist < tileSize) {
                    isValid = false;
                }
            });

            if (isValid) {
                return { x, y };
            }
        }

        return null;
    }

    damageEnemy(enemy: Phaser.Physics.Arcade.Image, damage: number, knockbackFromX?: number, knockbackFromY?: number) {
        const currentHealth = enemy.getData('health') || 0;
        const newHealth = currentHealth - damage;
        enemy.setData('health', newHealth);
        // enemy.preFX?.addGradient(0xffffff, 0xffffff);
        
        console.log('[ENEMY] Enemy damaged! Health:', currentHealth, '->', newHealth);

        // Apply knockback if source position provided
        if (knockbackFromX !== undefined && knockbackFromY !== undefined) {
            const knockbackForce = 200;
            const angle = Math.atan2(
                enemy.y - knockbackFromY,
                enemy.x - knockbackFromX
            );
            enemy.setVelocity(
                Math.cos(angle) * knockbackForce,
                Math.sin(angle) * knockbackForce
            );

            // Temporarily store that enemy is being knocked back
            enemy.setData('knockedBack', true);
            this.time.delayedCall(150, () => {
                enemy.setData('knockedBack', false);
            });
        }

        // Flash enemy to indicate damage (multiple flashes like player)
        enemy.setTintFill();
        this.tweens.add({
            targets: enemy,
            alpha: 0.3,
            duration: 80,
            yoyo: true,
            repeat: 2,
            onComplete: () => { enemy.setAlpha(1); enemy.clearTint(); }
        });

        // Check if enemy is defeated
        if (newHealth <= 0) {
            this.remainingEnemies--;
            console.log('[ENEMY] Enemy defeated! Remaining:', this.remainingEnemies);
            enemy.destroy();

            // Open doors when all enemies defeated
            if (this.remainingEnemies <= 0) {
                this.openDoors();
            }
        }
    }

    damageBoss(boss: Phaser.Physics.Arcade.Image, damage: number) {
        const currentHealth = boss.getData('health') || 0;
        const newHealth = currentHealth - damage;
        boss.setData('health', newHealth);

        console.log('[BOSS] Boss damaged! Health:', currentHealth, '->', newHealth);

        // Flash boss to indicate damage
        this.tweens.add({
            targets: boss,
            alpha: 0.5,
            duration: 50,
            yoyo: true,
            repeat: 2,
            onComplete: () => { boss.setAlpha(1); }
        });

        // Screen shake on boss hit
        this.camera.shake(100, 0.005);

        // Check if boss is defeated
        if (newHealth <= 0) {
            console.log('[BOSS] Boss defeated!');
            boss.destroy();
            this.boss = null;

            // Stop boss music and play boss defeat sound
            try {
                if (this.bossMusic && this.bossMusic.isPlaying) {
                    this.bossMusic.stop();
                }
            } catch (e) {
                // ignore if sound not available
            }
            // Play boss defeat jingle (loaded in Preloader as 'bossDefeat')
            if (this.sound) {
                this.sound.play('bossDefeat', { volume: 0.6 });
            }
            this.isBossMusicPlaying = false;

            // Open doors when boss defeated
            this.openDoors();
        }
    }

    openDoors() {
        console.log('[DOORS] All enemies defeated! Opening doors...');

        // Play door open sound
        if (this.doorOpenSound) {
            this.doorOpenSound.play();
        }

        // Change all door sprites to open (use correct left/right sprite)
        for (const doorSprite of this.doorSprites) {
            const isLeft = doorSprite.getData('isLeft');
            const openTexture = isLeft ? 'door-open-left' : 'door-open-right';
            doorSprite.setTexture(openTexture);
        }
    }

    createTorches() {
        // Clear existing torches
        this.torches.clear(true, true);

        // Spawn torches at spawn points from IntGrid
        for (const pos of this.torchSpawnPoints) {
            const torch = this.torches.create(pos.x, pos.y, 'torch') as Phaser.Physics.Arcade.Image;
            torch.setScale(2.0);
            torch.setDepth(3); // Below overlay, above most other things
            torch.setData('lit', false);
            torch.setData('lightId', null);
        }

        console.log('Created', this.torchSpawnPoints.length, 'torches');
    }

    createBarrels() {
        // Clear existing barrels
        this.barrels.clear(true, true);

        // Spawn barrels at spawn points from IntGrid
        for (const pos of this.barrelSpawnPoints) {
            const barrel = this.barrels.create(pos.x, pos.y, 'barrel') as Phaser.Physics.Arcade.Image;
            barrel.setScale(2.0);
            barrel.setDepth(3); // Below overlay
        }

        console.log('Created', this.barrelSpawnPoints.length, 'barrels');
    }

    destroyBarrel(barrel: Phaser.Physics.Arcade.Image) {
        const x = barrel.x;
        const y = barrel.y;

        // Create destruction particles
        const particleCount = 10;
        for (let i = 0; i < particleCount; i++) {
            const angle = (Math.PI * 2 * i) / particleCount;
            const speed = 50 + Math.random() * 100;

            // Create particle sprite
            const particle = this.add.rectangle(x, y, 4, 4, 0x8B5A3C); // Brown color
            particle.setDepth(5);

            // Add physics to particle
            this.physics.add.existing(particle);
            const particleBody = particle.body as Phaser.Physics.Arcade.Body;
            particleBody.setVelocity(
                Math.cos(angle) * speed,
                Math.sin(angle) * speed
            );

            // Fade out and destroy particle
            this.tweens.add({
                targets: particle,
                alpha: 0,
                duration: 500,
                onComplete: () => particle.destroy()
            });
        }

        // Create debris sprite at barrel location
        const debris = this.add.image(x, y, 'invisible-wall');
        debris.setScale(2.0);
        debris.setDepth(1); // Below player

        // Spawn health potion
        this.spawnHealthPotion(x, y);

        // Destroy barrel
        barrel.destroy();

        console.log('[BARREL] Barrel destroyed at', x, y);
    }

    spawnHealthPotion(x: number, y: number) {
        const potion = this.healthPotions.create(x, y, 'health-potion') as Phaser.Physics.Arcade.Image;
        potion.setScale(2.0);
        potion.setDepth(4);

        // Add a gentle floating animation
        this.tweens.add({
            targets: potion,
            y: y - 4,
            duration: 800,
            yoyo: true,
            repeat: -1,
            ease: 'Sine.easeInOut'
        });

        console.log('[POTION] Health potion spawned at', x, y);
    }

    onHealthPotionCollision(_player: Phaser.GameObjects.GameObject, potion: Phaser.GameObjects.GameObject) {
        const potionSprite = potion as Phaser.Physics.Arcade.Image;

        // Only heal if not at max health
        if (this.playerHealth < this.playerMaxHealth) {
            if (this.healthPickupSound) this.healthPickupSound.play();
            this.playerHealth = Math.min(this.playerHealth + 2, this.playerMaxHealth);
            this.ui.updateHealthDisplay();
            console.log('[POTION] Healed player! Health:', this.playerHealth);

            // Play a collect effect
            this.tweens.add({
                targets: potionSprite,
                alpha: 0,
                scale: 3,
                duration: 200,
                onComplete: () => potionSprite.destroy()
            });
        } else {
            console.log('[POTION] Player at max health, cannot collect');
        }
    }

    onFireHitTorch(fire: Phaser.GameObjects.GameObject, torch: Phaser.GameObjects.GameObject) {
        const torchSprite = torch as Phaser.Physics.Arcade.Image;
        const fireSprite = fire as Phaser.Physics.Arcade.Sprite;

        // Skip if torch is already lit or fire already hit something
        if (torchSprite.getData('lit') || fireSprite.getData('hit')) {
            return;
        }

        // Mark fire as hit
        fireSprite.setData('hit', true);
        fireSprite.setVelocity(0, 0);
        if (fireSprite.body) {
            (fireSprite.body as Phaser.Physics.Arcade.Body).enable = false;
        }
        fireSprite.setTexture('fire-hit');

        // Destroy fire after hit animation
        this.time.delayedCall(100, () => {
            if (!fireSprite.active) return;
            fireSprite.setTexture('fire-hit-end');
            this.time.delayedCall(150, () => {
                if (fireSprite && fireSprite.active) fireSprite.destroy();
            });
        });

        // Light the torch
        torchSprite.setData('lit', true);
        torchSprite.setTexture('torch-lit');

        // Add a light circle mask around the torch (larger radius for better visibility)
        const lightId = this.masks.addLightSource(torchSprite.x, torchSprite.y, 128);
        torchSprite.setData('lightId', lightId);

        console.log('Torch lit at', torchSprite.x, torchSprite.y);

        // Check if all torches are lit in level_2 for boss music
        this.checkBossMusic();

        // Set timer to extinguish after 10 seconds
        this.time.delayedCall(10000, () => {
            if (!torchSprite.active) return;

            torchSprite.setData('lit', false);
            torchSprite.setTexture('torch');

            // Remove the light mask
            const storedLightId = torchSprite.getData('lightId');
            if (storedLightId !== null) {
                this.masks.removeLightSource(storedLightId);
                torchSprite.setData('lightId', null);
            }

            console.log('Torch extinguished at', torchSprite.x, torchSprite.y);
        });
    }

    checkBossMusic() {
        // Only check for boss music in level_2, and only if not already playing
        if (this.currentLevel !== 2 || this.isBossMusicPlaying) return;

        // Count how many torches are currently lit
        let litCount = 0;
        this.torches.getChildren().forEach((torch) => {
            const torchSprite = torch as Phaser.Physics.Arcade.Image;
            if (torchSprite.getData('lit')) {
                litCount++;
            }
        });

        console.log('[BOSS] Lit torches:', litCount, '/', this.torches.getChildren().length);

        // If all 4 torches are lit, start boss music and spawn boss (one-time switch)
        if (litCount >= 4) {
            console.log('[BOSS] All torches lit! Starting boss music and spawning boss!');
            this.levelMusic.stop();
            this.puzzleMusic.stop();
            this.bossMusic.play();
            this.isBossMusicPlaying = true;

            // Spawn the boss
            this.spawnBoss();
        }
    }

    performDash(magnitude: number = 900, inflictDamage: boolean = false) {
        console.log('[DASH] Performing dash - magnitude:', magnitude, 'inflictDamage:', inflictDamage);
        // Short burst in the last movement direction (fallback to current velocity or up)
        const dashSpeed = magnitude;
        const dashDuration = 250; // Duration stays consistent

        // Prefer the last known movement direction (unit vector)
        let dirX = this.lastMoveX;
        let dirY = this.lastMoveY;

        // If last movement is essentially zero, try to derive from current body velocity
        if (Math.abs(dirX) < 1e-3 && Math.abs(dirY) < 1e-3) {
            const bvx = this.player.body?.velocity.x || 0;
            const bvy = this.player.body?.velocity.y || 0;
            const blen = Math.hypot(bvx, bvy);
            if (blen > 1e-3) {
                dirX = bvx / blen;
                dirY = bvy / blen;
            } else {
                // Default to up
                dirX = 0;
                dirY = -1;
            }
        }

        const vx = dirX * dashSpeed;
        const vy = dirY * dashSpeed;
        console.log('Dash direction:', dirX, dirY, 'Dash velocity:', vx, vy);

        // Activate dash state and set velocity
        this.isDashing = true;
        this.dashHitEnemy = false; // Reset hit flag for this dash
        this.dashInflictsDamage = inflictDamage; // Store whether this dash should damage enemies
        this.player.setVelocity(vx, vy);
        this.playerHead.setAlpha(0);
        this.playerBody.setAlpha(0);
        this.playerShadow.setAlpha(0.2);

        const particleConfig: Phaser.Types.GameObjects.Particles.ParticleEmitterConfig = {
            frame: [0,1,2,3],
            angle: { min: 0, max: 360 },
            rotate: { min: 0, max: 360 },
            speed: 60,
            alpha: {min: 0.3, max: 0.5, end: 0},
            frequency: 40,
            scale: 2.0,
            lifespan: 200, 
            anim: 'smoke',
            stopAfter: 10
        }

        const particles = this.add.particles(this.player.x, this.player.y, 'smoke-fire', particleConfig);
        
        console.log('[DASH] Dash started. isDashing:', this.isDashing, 'dashHitEnemy:', this.dashHitEnemy, 'dashInflictsDamage:', this.dashInflictsDamage);

        // Make invincible for a short moment while dashing
        this.isInvincible = true;
        this.time.delayedCall(dashDuration, () => {
            this.isDashing = false;
            this.playerShadow.setAlpha(1);
            // stop dash movement gently
            this.player.setVelocity(0, 0);
            this.playerHead.setAlpha(1);
            this.playerBody.setAlpha(1);
            const particles2 = this.add.particles(this.player.x, this.player.y, 'smoke-fire', particleConfig);
            particles2.setDepth(10);
            particles2.setAlpha(0.5);
            particles2.stopAfter = 5;

        });

        // Extension of invulnerability QOL
        this.time.delayedCall(dashDuration + 100, () => {
            this.isInvincible = false;
            // stop dash movement gently
            // particles.stop();
        });
        particles.onParticleDeath(() => console.log("PARTOICLE DEATHHHHHH"))

        console.log('Dash executed');
    }

    performBasicAttack() {

        if (this.isPlayerBusy) return;
        // Determine position in front of player based on current direction
        const tileSize = 50 // Distance in front of player
        this.isPlayerBusy = true;
        this.isInvincible = true;
        // determine direction (fallback to up)
        let dir = new Phaser.Math.Vector2(this.lastMoveX, this.lastMoveY);
        if (Math.abs(dir.x) < 1e-3 && Math.abs(dir.y) < 1e-3) {
            dir.set(0, -1);
        }
        dir = dir.normalize();
        
        // Slash's offset
        const slashX = this.player.x + (dir.x * tileSize);
        const slashY = this.player.y + (dir.y * tileSize);

        const slash = this.physics.add.sprite(slashX, slashY, 'sword-slash') as Phaser.Physics.Arcade.Sprite;
        slash.preFX?.addShadow(0, 0, 0.1, 1, 0xcccccc)
        slash.setOrigin(0.5, 0.4)
        slash.setScale(1.5);
        slash.setDepth(100);
        slash.setRotation(dir.angle() + Math.PI * 2);
        slash.setData('hit', false);
        this.slashAnimToggle = !this.slashAnimToggle;
        slash.flipY = this.slashAnimToggle;

        slash.play('sword-slash-anim');

        // const particleX = slashX + tileSize;
        // const particleY = slashY + tileSize;
        // const fxAngle = dir.angle();
        // console.log("ANGLEE: ",fxAngle)
        // const particles = this.add.particles(particleX, particleY, 'ellipseTexture', {
        //     angle: dir.angle() + Math.PI * 2, 
        //     // rotate: { min: 0, max: 360 },
        //     speed:300,
        //     alpha: {min: 0.7, max: 1, end: 1},
        //     frequency: 100,
        //     scale: 1.0,
        //     lifespan: 100, 
        //     // maxVelocityX: 300,
        //     // maxVelocityY: 300,            
        //     // anim: 'smoke',
        // });
        // this.time.delayedCall(400, () => {
        //     // emitter.stop(); // Stop emitting new particles
        //     particles.stop(); // Destroy the particle manager to clean up
        // });


        // Add collision with enemies
        const slashHitEnemy = (slashObj: Phaser.GameObjects.GameObject, enemy: Phaser.GameObjects.GameObject) => {
            const slashSprite = slashObj as Phaser.Physics.Arcade.Sprite;
            if (this.slashSound) this.slashSound.play();
            // Only hit once
            if (slashSprite.getData('hit')) return;
            slashSprite.setData('hit', true);

            // Disable physics body to prevent further collisions
            if (slashSprite.body) {
                (slashSprite.body as Phaser.Physics.Arcade.Body).enable = false;
            }

            const enemySprite = enemy as Phaser.Physics.Arcade.Image;
            console.log('[SLASH] Hit enemy at', enemySprite.x, enemySprite.y);
            this.camera.shake(100, 0.015, true);
            // createHitParticles();
            this.damageEnemy(enemySprite, 1, slashSprite.x, slashSprite.y); // Slash does 2 damage with knockback
        };

        // Add collision with barrels
        const slashHitBarrel = (slashObj: Phaser.GameObjects.GameObject, barrel: Phaser.GameObjects.GameObject) => {
            const slashSprite = slashObj as Phaser.Physics.Arcade.Sprite;

            // Only hit once
            if (slashSprite.getData('hit')) return;
            slashSprite.setData('hit', true);

            // Disable physics body to prevent further collisions
            if (slashSprite.body) {
                (slashSprite.body as Phaser.Physics.Arcade.Body).enable = false;
            }

            const barrelSprite = barrel as Phaser.Physics.Arcade.Image;
            console.log('[SLASH] Hit barrel at', barrelSprite.x, barrelSprite.y);
            this.destroyBarrel(barrelSprite);
        };

        if (this.whiffSound) this.whiffSound.play();

        this.physics.add.overlap(slash, this.enemies, slashHitEnemy as any, undefined, this);
        this.physics.add.overlap(slash, this.barrels, slashHitBarrel as any, undefined, this);

        // Add collision with boss
        if (this.boss) {
            const slashHitBoss = (slashObj: Phaser.GameObjects.GameObject, bossObj: Phaser.GameObjects.GameObject) => {
                const slashSprite = slashObj as Phaser.Physics.Arcade.Sprite;
                if (slashSprite.getData('hit')) return;
                slashSprite.setData('hit', true);
                if (slashSprite.body) {
                    (slashSprite.body as Phaser.Physics.Arcade.Body).enable = false;
                }
                const bossSprite = bossObj as Phaser.Physics.Arcade.Image;
                console.log('[SLASH] Hit boss at', bossSprite.x, bossSprite.y);
                this.damageBoss(bossSprite, 2); // Slash does 2 damage to boss
            };
            this.physics.add.overlap(slash, this.boss, slashHitBoss as any, undefined, this);
        }

        // Destroy slash after 300ms
        // this.time.delayedCall(300, () => {
        //     if (slash && slash.active) {
        //         slash.destroy();
        //     }
        //     this.isPlayerBusy = false;
        // });

        slash.once('animationcomplete', () => {
            slash.destroy();
            this.isPlayerBusy = false;
            this.isInvincible = false;
            // if (slash && slash.active) {
            //     slash.destroy();
            // }
          });

        console.log('[SLASH] Basic attack at', slashX, slashY);
    }

    performFireBall() {
        console.log('[ABILITY] Executing Fire Attack');
        // Simple attack stub: flash player and play a sound if available
        this.tweens.add({
            targets: this.playerContainer,
            alpha: 0.3,
            duration: 80,
            yoyo: true,
            repeat: 0,
            onComplete: () => { this.playerContainer.setAlpha(1); }
        });

        if (this.fireShootSound) this.fireShootSound.play();
        // spawn a fire projectile at the player and launch it forward
        const px = this.player.x;
        const py = this.player.y; 

        // determine direction (fallback to up)
        let dir = new Phaser.Math.Vector2(this.lastMoveX, this.lastMoveY);
        if (Math.abs(dir.x) < 1e-3 && Math.abs(dir.y) < 1e-3) {
            dir.set(0, -1);
        }
        dir = dir.normalize();

        const speed = 600;

        // create physics sprite for the fire projectile
        const fire = this.physics.add.sprite(px, py, 'fire') as Phaser.Physics.Arcade.Sprite;
        // Rotate projectile to face its travel direction. If your sprite art is not aligned
        // to the right (0 radians), add an offset like +Math.PI/2 or -Math.PI/2 as needed.
        fire.setRotation(dir.angle() + Math.PI / 2);
        fire.setScale(2.0);
        // fire.body.setAllowGravity(false);
        fire.setVelocity(dir.x * speed, dir.y * speed);
        fire.setData('hit', false);

        // ensure it doesn't live forever
        const lifetime = 3000;
        const lifetimeTimer = this.time.delayedCall(lifetime, () => {
            if (fire && fire.active) fire.destroy();
        });

        // collision handler for "anything"
        const handleHit = (proj: Phaser.GameObjects.GameObject, _other: Phaser.GameObjects.GameObject) => {
            const p = proj as Phaser.Physics.Arcade.Sprite;
            if (p.getData('hit')) return;
            this.camera.shake(80, 0.010);
            p.setData('hit', true);

            // stop movement and disable physics body to prevent further collisions
            p.setVelocity(0, 0);
            if (p.body) {
                (p.body as Phaser.Physics.Arcade.Body).enable = false;
            }
            p.setTexture('fire-hit');

            // short delay then final hit texture then destroy
            this.time.delayedCall(100, () => {
                if (!p.active) return;
                p.setTexture('fire-hit-end');
                this.time.delayedCall(150, () => {
                    if (p && p.active) p.destroy();
                });
            });

            // cancel lifetime timer
            if (lifetimeTimer) lifetimeTimer.remove(false);
        };

        // Special handler for enemy hits - deals 1 damage
        const handleEnemyHit = (proj: Phaser.GameObjects.GameObject, enemy: Phaser.GameObjects.GameObject) => {
            const enemySprite = enemy as Phaser.Physics.Arcade.Image;
            const fireSprite = proj as Phaser.Physics.Arcade.Sprite;
            this.camera.shake(100, 0.015, true);
            this.damageEnemy(enemySprite, 1, fireSprite.x, fireSprite.y); // Fire does 1 damage with knockback
            handleHit(proj, enemy); // Then trigger normal hit behavior
        };
        // const handleBossHit = (proj: Phaser.GameObjects.GameObject, enemy: Phaser.GameObjects.GameObject) => {
        //     const enemySprite = enemy as Phaser.Physics.Arcade.Image;
        //     const fireSprite = proj as Phaser.Physics.Arcade.Sprite;
        //     this.camera.shake(100, 0.015, true);
        //     this.damageEnemy(enemySprite, 1, fireSprite.x, fireSprite.y); // Fire does 1 damage with knockback
        //     handleHit(proj, enemy); // Then trigger normal hit behavior
        // };

        // collide with walls, doors, enemies and world bounds
        if (this.walls) this.physics.add.collider(fire, this.walls, handleHit as any, undefined, this);
        if (this.doors) this.physics.add.collider(fire, this.doors, handleHit as any, undefined, this);
        if (this.enemies) this.physics.add.collider(fire, this.enemies, handleEnemyHit as any, undefined, this);
        if (this.boss) this.physics.add.collider(fire, this.boss, handleEnemyHit as any, undefined, this);
        // Fire can light torches
        if (this.torches) this.physics.add.overlap(fire, this.torches, this.onFireHitTorch as any, undefined, this);

        // world bounds hit -> trigger same sequence
        fire.setCollideWorldBounds(true);
        fire.body.onWorldBounds = true;
        this.physics.world.on('worldbounds', (body: Phaser.Physics.Arcade.Body) => {
            if (body.gameObject === fire) {
                handleHit(fire, body.gameObject);
            }
        });
        console.log('Used Attack');
    }

    // Get head texture based on direction and current mask
    getHeadTexture(direction: string): string {
        // Map mask to color prefix
        const maskColorMap: Record<number, string> = {
            1: 'blue',   // DashAttack
            2: 'red',    // FireAttack
            3: 'green',  // Interact
        };

        const color = maskColorMap[this.masks.mask];

        // Build texture key
        if (color) {
            return `head-${color}-${direction}`;
        }
        return `head-${direction}`;
    }

    // Update head sprite based on mask and current direction
    updateHeadSprite(mask: number) {
        // Get direction suffix based on current texture
        let direction = 'front';
        if (this.playerHead.texture.key.includes('back')) {
            direction = 'back';
        } else if (this.playerHead.texture.key.includes('profile')) {
            direction = 'profile';
        }

        // Update the head sprite texture using the helper
        const newTexture = this.getHeadTexture(direction);
        this.playerHead.setTexture(newTexture);

        console.log('[HEAD SPRITE] Mask', mask, '-> Texture', newTexture);
    }

    tryUseAbility() {
        console.log('[ABILITY] tryUseAbility() called');
        console.log('[ABILITY] Current ability:', this.currentAbility, '(', Ability[this.currentAbility], ')');
        console.log('[ABILITY] Current mask:', this.masks.mask);

        const now = this.time.now;
        const abilityKey = this.currentAbility as number;
        const last = this.abilityLastUsed[abilityKey] || 0;
        const cd = this.abilityCooldowns[abilityKey] || 0;
        const cooldownRemaining = Math.max(0, cd - (now - last));

        console.log('[ABILITY] Cooldown:', cd, 'ms | Time since last use:', now - last, 'ms | Remaining:', cooldownRemaining, 'ms');

        if (now - last < cd) {
            console.log('[ABILITY] Still cooling down, aborting');
            return;
        }

        console.log('[ABILITY] Cooldown passed, executing ability');
        this.abilityLastUsed[abilityKey] = now;
        this.useAbility(this.currentAbility);
    }

    useAbility(ability: Ability) {
        console.log('[ABILITY] useAbility() called with:', ability, '(', Ability[ability], ')');

        switch (ability) {
            case Ability.DashAttack: {
                console.log('[ABILITY] Executing Dash Attack');
                this.performDash(600, true); // Short attack dash
                break;
            }
            case Ability.FireAttack: {
                this.performFireBall();
                break;
            }
            case Ability.Interact: {
                console.log('[ABILITY] Executing Interact');
                // Placeholder for interact ability
                console.log('Used Interact');
                break;
            }
            case Ability.Special: {
                console.log('[ABILITY] Executing Special');
                // Placeholder for special ability
                console.log('Used Special ability');
                break;
            }
            case Ability.Transformation: {
                console.log('[ABILITY] Executing Transformation');

                // Stop movement and disable control temporarily
                this.isInputAllowed = false;
                this.isInvincible = true;
                this.isTransformed = true;
                this.player.setVelocity(0, 0);

                // Enable control after timeout
                this.time.delayedCall(1400, () => {
                    this.isInputAllowed = true;
                }, [], this);

                // Create smoke effect on transform
                let smokeSprite = this.add.sprite(this.player.x-4, this.player.y +4, 'smoke-fire');
                smokeSprite.setDepth(100).setScale(5.0).play('smoke')
                this.tweens.add({
                    targets: smokeSprite,
                    alpha: 0.5,
                    duration: 1000,
                    ease: 'Ease-out',
                    repeat: 0
                });

                // Transform player sprite to random item
                const TRANSFORMATION_ITEMS = ['player-transform-barrel', 'player-transform-tomb', 'player-transform-grave', 'player-transform-box']
                const randomIndex = Math.floor(Math.random() * TRANSFORMATION_ITEMS.length);
                this.playerBody.setTexture(TRANSFORMATION_ITEMS[randomIndex]);
                this.playerHead.setVisible(false);

                console.log('Used Transformation ability');
                break;
            }
            default:
                console.log('[ABILITY] Unknown ability:', ability);
                break;
        }
    }

    onEnemyCollision(_player: Phaser.GameObjects.GameObject, enemy: Phaser.GameObjects.GameObject) {
        console.log('[COLLISION] Enemy collision detected. isDashing:', this.isDashing, 'dashInflictsDamage:', this.dashInflictsDamage, 'dashHitEnemy:', this.dashHitEnemy, 'isInvincible:', this.isInvincible);

        // If dashing with damage enabled, damage the enemy instead and reset dash cooldown (only once per dash)
        if (this.isDashing && this.dashInflictsDamage && !this.dashHitEnemy) {
            const enemySprite = enemy as Phaser.Physics.Arcade.Image;
            console.log('[DASH] Hit enemy during dash attack!');
            this.damageEnemy(enemySprite, 1, this.player.x, this.player.y); // Dash attack does 1 damage with knockback

            // Mark that this dash has hit an enemy
            this.dashHitEnemy = true;

            // Reset dash cooldown to allow immediate chaining
            this.abilityLastUsed[Ability.DashAttack] = 0;
            console.log('[DASH] Cooldown reset - can dash again!');
            return;
        }

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
        this.ui.updateHealthDisplay();

        // Become invincible briefly
        this.isInvincible = true;

        // Flash player to indicate damage
        this.tweens.add({
            targets: this.playerContainer,
            alpha: 0.3,
            duration: 100,
            yoyo: true,
            repeat: 5,
            onComplete: () => {
                this.playerContainer.setAlpha(1);
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
        this.ui.updateHealthDisplay();

        // Respawn at player spawn point or fallback position
        this.loadLevel(0);
        const spawnPoint = this.playerSpawnPoint || { x: 100, y: 100 };
        this.player.setPosition(spawnPoint.x, spawnPoint.y);
        this.camera.centerOn(spawnPoint.x, spawnPoint.y);
    }

    onDoorCollision(_player: Phaser.GameObjects.GameObject, door: Phaser.GameObjects.GameObject) {
        // Ignore door collisions if player just spawned on a door
        if (this.justSpawnedOnDoor) return;

        // Prevent door usage if enemies remain
        if (this.remainingEnemies > 0) {
            console.log('[DOOR] Doors locked! Defeat all enemies first. Remaining:', this.remainingEnemies);
            return;
        }

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
                // If we're currently in level_2, entering a door should go to the Credits scene
                if (this.currentLevel === 2) {
                    // Start the Credits scene instead of loading another level
                    this.scene.start('Credits');
                    return;
                }

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


        // Destroy all door sprites from previous level
        if (this.doorSprites) {
            this.doorSprites.forEach(sprite => sprite.destroy());
            this.doorSprites = [];
        }

        // Destroy all invisible wall sprites from previous level
        if (this.invisibleWalls) {
            this.invisibleWalls.forEach(wall => wall.destroy());
            this.invisibleWalls = [];
        }

        // Clear all light sources from previous level
        this.masks.lightSources = [];

        // Destroy boss from previous level
        if (this.boss) {
            this.boss.destroy();
            this.boss = null;
        }

        // Reset boss music state when changing levels
        if (this.isBossMusicPlaying) {
            this.bossMusic.stop();
            this.levelMusic.play();
            this.isBossMusicPlaying = false;
        }

        // Play puzzle music for level 2, otherwise normal level music
        if (levelIndex === 2) {
            this.sound.stopAll();
            this.puzzleMusic.play({ loop: true, volume: 0.5 });
        }

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
        this.physics.add.collider(this.player, this.torches);
        this.physics.add.collider(this.player, this.barrels);
        this.physics.add.overlap(this.player, this.doors, this.onDoorCollision as any, undefined, this);
        this.physics.add.overlap(this.player, this.healthPotions, this.onHealthPotionCollision as any, undefined, this);

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

        // Recreate torches for new level
        this.createTorches();

        // Recreate barrels for new level
        this.createBarrels();

        // Clear health potions from previous level
        if (this.healthPotions) {
            this.healthPotions.clear(true, true);
        }

        // Re-add enemy collision
    this.physics.add.overlap(this.player, this.enemies, this.onEnemyCollision as any, undefined, this);

        // Mark that player just spawned (may be on a door)
        this.justSpawnedOnDoor = true;
    }

    handleInput(): { x: number; y: number } {
        let x = 0;
        let y = 0;

        if (!this.input.keyboard.enabled) { return { x, y}}
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

        // Check gamepad input (using stored reference from connection event)
        if (this.gamepad && this.gamepad.connected) {
            // Left stick
            const leftStickX = this.gamepad.leftStick.x;
            const leftStickY = this.gamepad.leftStick.y;

            // Apply deadzone (0.15)
            if (Math.abs(leftStickX) > 0.15) {
                x += leftStickX;
            }
            if (Math.abs(leftStickY) > 0.15) {
                y += leftStickY;
            }

            // D-pad
            if (this.gamepad.left) {
                x -= 1;
            }
            if (this.gamepad.right) {
                x += 1;
            }
            if (this.gamepad.up) {
                y -= 1;
            }
            if (this.gamepad.down) {
                y += 1;
            }
        }

        // Check touch controls
        if (this.ui.touchInput.left) {
            x -= 1;
        }
        if (this.ui.touchInput.right) {
            x += 1;
        }
        if (this.ui.touchInput.up) {
            y -= 1;
        }
        if (this.ui.touchInput.down) {
            y += 1;
        }

        return { x, y };
    }

    update() {
        // Sync player container to physics player position
        this.playerContainer.setPosition(this.player.x, this.player.y);

        this.masks.update();
        this.ui.update();

        // Update invisible wall visibility and collision (only visible with mask 3 when in mask shape)
        if (this.masks.mask === 3) {
            for (const wall of this.invisibleWalls) {
                const isInMask = this.masks.isPointInMask(wall.x, wall.y);
                wall.setVisible(isInMask);

                // Disable collision when visible (wall is revealed, player can pass through)
                const collisionBody = wall.getData('collisionBody') as Phaser.GameObjects.GameObject;
                if (collisionBody && collisionBody.body) {
                    (collisionBody.body as Phaser.Physics.Arcade.Body).enable = !isInMask;
                }
            }
        } else {
            // Hide all invisible walls when not using mask 3 and re-enable collision
            for (const wall of this.invisibleWalls) {
                wall.setVisible(false);

                // Re-enable collision when not viewing with mask 3
                const collisionBody = wall.getData('collisionBody') as Phaser.GameObjects.GameObject;
                if (collisionBody && collisionBody.body) {
                    (collisionBody.body as Phaser.Physics.Arcade.Body).enable = true;
                }
            }
        }

        // Handle debug mode toggle with Escape key or SELECT button
        if (Phaser.Input.Keyboard.JustDown(this.escapeKey) || (this.gamepad && this.gamepad.connected && this.gamepad.buttons[8].pressed)) {
            this.debugMode = !this.debugMode;
            if (this.physics.world.debugGraphic) {
                this.physics.world.debugGraphic.visible = this.debugMode;
            }

            // Toggle player collision
            if (this.debugMode) {
                // Disable collision in debug mode
                this.player.setCollideWorldBounds(false);
                if (this.player.body) {
                    (this.player.body as Phaser.Physics.Arcade.Body).checkCollision.none = true;
                }
                console.log('[DEBUG] Player collision DISABLED');
            } else {
                // Re-enable collision when debug mode off
                this.player.setCollideWorldBounds(true);
                if (this.player.body) {
                    (this.player.body as Phaser.Physics.Arcade.Body).checkCollision.none = false;
                }
                console.log('[DEBUG] Player collision ENABLED');
            }

            console.log('[DEBUG] Debug mode:', this.debugMode ? 'ON' : 'OFF');
        }

        // Handle action input: keyboard (space for dash) and gamepad controls
        // Keyboard: spacebar for dash
        if (Phaser.Input.Keyboard.JustDown(this.spaceKey)) {
            console.log('[ACTION] Space key pressed - dashing');
            this.performDash(600, false); // Long mobility dash
        }

        const key = {
            G: this.input.keyboard?.addKey(Phaser.Input.Keyboard.KeyCodes.G),
            H: this.input.keyboard?.addKey(Phaser.Input.Keyboard.KeyCodes.H),
            J: this.input.keyboard?.addKey(Phaser.Input.Keyboard.KeyCodes.J),
            K: this.input.keyboard?.addKey(Phaser.Input.Keyboard.KeyCodes.K),
        }

        const pad = {
            A: this.gamepad?.buttons[0],
            B: this.gamepad?.buttons[1],
            X: this.gamepad?.buttons[3],
            Y: this.gamepad?.buttons[4],
        }

        const basicAttackIsPressed = Boolean(key.G?.isDown || pad.X?.pressed);
        const dashIsPressed = Boolean(key.H?.isDown || pad.A?.pressed);
        const projectileIsPressed = Boolean(key.J?.isDown || pad.B?.pressed);
        const abilityIsPressed = Boolean(key.K?.isDown || pad.Y?.pressed);
        // const basicAttackIsPressed = key.G?.isDown || pad.A?.pressed;

        // INPUT: BASIC ATTACK
        if (basicAttackIsPressed && !this.previousGamepadXState) {
            console.log("[NEW BASIC ATTACK]");
            this.performBasicAttack();
        }
        this.previousGamepadXState = !!(basicAttackIsPressed);
        
        // INPUT: DASH
        if (dashIsPressed && !this.previousGamepadAState) {
            console.log("[DASH ATTACK]");
            this.performDash(600, false);
        }
        this.previousGamepadAState = !!(dashIsPressed);


        // INPUT: FIRE ATTACK
        if (projectileIsPressed && !this.previousGamepadBState) {
            console.log("[FIRE ATTACK]");
            this.useAbility(Ability.FireAttack)
        }
        this.previousGamepadBState = !!(projectileIsPressed);

        // INPUT: SPECIAL
        if (abilityIsPressed && !this.previousGamepadYState) {
            console.log("[SPECIAL ABILITY]");
            this.tryUseAbility();
        }
        this.previousGamepadYState = !!(abilityIsPressed);

        
        // Gamepad controls
        if (this.gamepad && false) {
            // A button (button 0) - slash attack (rising edge) 
            const aPressed = !!(this.gamepad.buttons?.[1]?.pressed);
            if (aPressed && !this.previousGamepadAState) {
                console.log('[ACTION] Gamepad A button pressed - slash attack');
                this.performBasicAttack();
            }
            this.previousGamepadAState = aPressed;

            // Left trigger (button 6) - dash
            const ltPressed = !!(this.gamepad.buttons?.[6]?.pressed);
            const bPressed = !!(this.gamepad.buttons?.[0]?.pressed)
            if ((ltPressed && !this.previousGamepadLTState) ||
                (bPressed && !this.previousGamepadBState)) {
                console.log('[ACTION] Gamepad LT or B pressed - dashing');
                this.performDash(600, false); // Long mobility dash
            }
            this.previousGamepadLTState = ltPressed;
            this.previousGamepadBState = bPressed;

            // Right trigger (button 7) - mask ability
            const rtPressed = !!(this.gamepad.buttons?.[7]?.pressed);
            if (rtPressed && !this.previousGamepadRTState) {
                console.log('[ACTION] Gamepad RT pressed - using mask ability');
                this.tryUseAbility();
            }
            this.previousGamepadRTState = rtPressed;

            // Left bumper (button 4) - previous mask
            const lbPressed = !!(this.gamepad.buttons?.[4]?.pressed);
            if (lbPressed && !this.previousGamepadLBState) {
                console.log('[ACTION] Gamepad LB pressed - previous mask');
                this.masks.previousMask();
            }
            this.previousGamepadLBState = lbPressed;

            // Right bumper (button 5) - next mask
            const rbPressed = !!(this.gamepad.buttons?.[5]?.pressed);
            if (rbPressed && !this.previousGamepadRBState) {
                console.log('[ACTION] Gamepad RB pressed - next mask');
                this.masks.nextMask();
            }
            this.previousGamepadRBState = rbPressed;
        }

        // Skip input handling during knockback or while dashing (so dash velocity isn't immediately overwritten)
        if (this.isKnockedBack || this.isDashing) {
            return;
        }

        // Skip input handling
        if (this.isInputAllowed === false) {
            return;
        }

        // Reset player velocity
        this.player.setVelocity(0);

        // Get input from all sources
        const input = this.handleInput();

        // Apply movement
        if (input.x !== 0 || input.y !== 0) {
            // Set velocity based on input (normalize for consistent speed)
            // Use a local vector so we can store the normalized facing for dash
            const mv = new Phaser.Math.Vector2(input.x, input.y);
            if (mv.length() > 0) mv.normalize(); 
            this.player.setVelocity(mv.x * 200, mv.y * 200);
            // Normalize body velocity to be safe
            this.player.body!.velocity.normalize().scale(200);
            // Store last movement direction (unit vector) for dash usage
            this.lastMoveX = mv.x;
            this.lastMoveY = mv.y;

            // Update player angle based on movement direction
            // Add PI/2 to correct the orientation, then add PI to flip 180 degrees
            this.playerAngle = Math.atan2(input.y, input.x) + Math.PI / 2 + Math.PI;

            // When player comes out of transformation jutsu
            // TODO: To abstract player's logic
            this.playerHead.setVisible(true);
            this.isInvincible = false;

            // Update player sprite based on movement direction
            const deadzone = 0.01;
            if (input.y < -deadzone) {
                // Moving up - show back
                this.playerHead.setTexture(this.getHeadTexture('back'));
                this.playerBody.setTexture('body-back');
                this.playerHead.setFlipX(false);
                this.playerBody.setFlipX(false);
                this.currentPlayerDirection = 'up';
            } else if (input.y > deadzone) {
                // Moving down - show front
                this.playerHead.setTexture(this.getHeadTexture('front'));
                this.playerBody.setTexture('body-front');
                this.playerHead.setFlipX(false);
                this.playerBody.setFlipX(false);
                this.currentPlayerDirection = 'down';
            } else if (Math.abs(input.x) > deadzone) {
                // Moving horizontally - show profile
                this.playerHead.setTexture(this.getHeadTexture('profile'));
                this.playerBody.setTexture('body-profile');
                // Flip sprite based on direction
                this.playerHead.setFlipX(input.x > 0);
                this.playerBody.setFlipX(input.x > 0);
                this.currentPlayerDirection = 'horizontal';
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

        

        // Reset spawn flag if player is no longer overlapping any doors
        if (this.justSpawnedOnDoor) {
            const overlappingAnyDoor = this.physics.overlap(this.player, this.doors);
            if (!overlappingAnyDoor) {
                this.justSpawnedOnDoor = false;
            }
        }
    }

}
