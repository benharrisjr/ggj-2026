import { Scene } from 'phaser';
import { Masks } from '../systems/masks/masks';
import { Ability } from '../systems/abilities/abilities';
import { UI } from '../systems/ui/ui';
import ColorReplacePipelinePlugin from 'phaser3-rex-plugins/plugins/colorreplacepipeline-plugin.js';

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


// #0099DB chest
// #2CE8F5 barrel
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

// 


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
    headColorReplace: any; // ColorReplace pipeline instance
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
    transitionOverlay: Phaser.GameObjects.Graphics;

    // Health system
    playerHealth: number = 6;
    playerMaxHealth: number = 6;
    isInvincible: boolean = false;
    isKnockedBack: boolean = false;

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
    actionButtonPressed: boolean = false;
    // Last movement direction (unit vector) used for dash fallback
    lastMoveX: number = 0;
    lastMoveY: number = -1;
    // Dashing state to prevent update from overwriting dash velocity
    isDashing: boolean = false;
    // Debug mode toggle
    debugMode: boolean = true;

    constructor() {
        super('Game');
    }

    create() {
        this.physics.world.debugGraphic.visible = false;
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

        // Create body sprite (offset down from center)
        this.playerBody = this.make.image({ x: 0, y: 8, key: 'body-front', add: false });
        this.playerBody.setScale(2.0);

        // Create head sprite (offset up from center)
        this.playerHead = this.make.image({ x: 0, y: -8, key: 'head-front', add: false });
        this.playerHead.setScale(2.0);

        // Add to container (order matters: body first, then head on top)
        this.playerContainer.add([this.playerBody, this.playerHead]);

        // Set up ColorReplace shader on head
        const colorReplacePipeline = (this.plugins.get('rexColorReplacePipeline') as ColorReplacePipelinePlugin);
        if (colorReplacePipeline) {
            this.headColorReplace = colorReplacePipeline.add(this.playerHead, {
                originalColor: 0x000000,  // Color to replace (black by default)
                newColor: 0x000000,       // New color (same by default)
                epsilon: 0.4              // Color matching tolerance
            });
        }

        // Camera follows player
        this.camera.startFollow(this.player, true, 0.1, 0.1);

        // Sync container position after every physics step for zero lag
        this.physics.world.on('worldstep', () => {
            this.playerContainer.setPosition(this.player.x, this.player.y);
        });

        // Add collision between player and walls
        this.physics.add.collider(this.player, this.walls);

    // Add overlap detection for doors
    this.physics.add.overlap(this.player, this.doors, this.onDoorCollision as any, undefined, this);

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
        this.fireShootSound = this.sound.add('fireShoot', { volume: 0.5 });

        // Create enemies group and spawn at all enemy spawn points
        this.enemies = this.physics.add.group();
        this.spawnEnemies();

    // Add collision between player and enemies (for damage)
    this.physics.add.overlap(this.player, this.enemies, this.onEnemyCollision as any, undefined, this);

        // Create cursor keys for input
    this.cursors = this.input.keyboard!.createCursorKeys();

    // Space key for action
    this.spaceKey = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE);

    // Escape key for debug toggle
    this.escapeKey = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.ESC);

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
        this.abilityCooldowns[Ability.Dash] = 1000;
        this.abilityCooldowns[Ability.Attack] = 500;
        this.abilityCooldowns[Ability.Interact] = 250;
        this.abilityCooldowns[Ability.Special] = 2000;
        // ensure last-used defaults
        Object.keys(this.abilityCooldowns).forEach(k => { this.abilityLastUsed[Number(k)] = 0; });

        this.masks = new Masks(this);
        this.ui = new UI(this);

        // Listen for mask selection events and map them to abilities.
        // When a mask is selected, set the current ability (if mapped) and try to use it.
        this.events.on('mask:select', (mask: number) => {
            console.log('[MASK] Mask selected:', mask);
            const mapping: Record<number, Ability> = {
                1: Ability.Dash,
                2: Ability.Attack,
                3: Ability.Interact,
                4: Ability.Special
            };
            if (mapping[mask] !== undefined) {
                this.currentAbility = mapping[mask];
                console.log('[MASK] Current ability set to:', this.currentAbility, '(', Ability[this.currentAbility], ')');
            } else {
                console.log('[MASK] No ability mapping for mask:', mask);
            }

            // Update head color based on mask
            this.updateHeadColor(mask);
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


    // Color mapping for each mask (mask number -> hex color)
    updateHeadColor(mask: number) {
        if (!this.headColorReplace) return;

        // Define colors for each mask
        const maskColors: Record<number, number> = {
            0: 0x000000,    // Default - no change (black to black)
            1: 0x00FFFF,    // Dash - cyan
            2: 0xFF4400,    // Attack - orange/fire
            3: 0x00FF00,    // Interact - green
            4: 0xFF00FF,    // Special - magenta
        };

        const newColor = maskColors[mask] ?? 0x000000;

        // Update the ColorReplace shader
        // originalColor is the color in the sprite to replace
        // newColor is what to replace it with
        this.headColorReplace.setOriginalColor(0x000000);  // Replace black pixels
        this.headColorReplace.setNewColor(newColor);

        console.log('[HEAD COLOR] Mask', mask, '-> Color', newColor.toString(16));
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
            case Ability.Dash: {
                console.log('[ABILITY] Executing Dash');
                // Short burst in the last movement direction (fallback to current velocity or up)
                const dashSpeed = 600;
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
                this.player.setVelocity(vx, vy);
                // Make invincible for a short moment while dashing
                this.isInvincible = true;
                this.time.delayedCall(200, () => {
                    this.isInvincible = false;
                    this.isDashing = false;
                    // stop dash movement gently
                    this.player.setVelocity(0, 0);
                });
                console.log('Used Dash');
                break;
            }
            case Ability.Attack: {
                console.log('[ABILITY] Executing Attack');
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
                fire.setScale(1.0);
                fire.body.setAllowGravity(false);
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

                // collide with walls, doors, enemies and world bounds
                if (this.walls) this.physics.add.collider(fire, this.walls, handleHit as any, undefined, this);
                if (this.doors) this.physics.add.collider(fire, this.doors, handleHit as any, undefined, this);
                if (this.enemies) this.physics.add.collider(fire, this.enemies, handleHit as any, undefined, this);

                // world bounds hit -> trigger same sequence
                fire.setCollideWorldBounds(true);
                fire.body.onWorldBounds = true;
                this.physics.world.on('worldbounds', (body: Phaser.Physics.Arcade.Body) => {
                    if (body.gameObject === fire) {
                        handleHit(fire, body.gameObject);
                    }
                });
                console.log('Used Attack');
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
            default:
                console.log('[ABILITY] Unknown ability:', ability);
                break;
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
        this.physics.add.overlap(this.player, this.doors, this.onDoorCollision as any, undefined, this);

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
    this.physics.add.overlap(this.player, this.enemies, this.onEnemyCollision as any, undefined, this);

        // Mark that player just spawned (may be on a door)
        this.justSpawnedOnDoor = true;
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

        // Handle debug mode toggle with Escape key
        if (Phaser.Input.Keyboard.JustDown(this.escapeKey)) {
            this.debugMode = !this.debugMode;
            if (this.physics.world.debugGraphic) {
                this.physics.world.debugGraphic.visible = this.debugMode;
            }
            console.log('[DEBUG] Debug mode:', this.debugMode ? 'ON' : 'OFF');
        }

        // Handle action input: keyboard (space) and gamepad A (rising edge)
        // Keyboard: just down
        if (Phaser.Input.Keyboard.JustDown(this.spaceKey)) {
            console.log('[ACTION] Space key pressed');
            this.tryUseAbility();
        }

        // Gamepad A detection (rising edge)
        if (this.gamepad) {
            const aPressed = !!(this.gamepad.buttons && this.gamepad.buttons[0] && this.gamepad.buttons[0].pressed);
            if (aPressed && !this.previousGamepadAState) {
                console.log('[ACTION] Gamepad A button pressed');
                this.tryUseAbility();
            }
            this.previousGamepadAState = aPressed;
        }

        // Skip input handling during knockback or while dashing (so dash velocity isn't immediately overwritten)
        if (this.isKnockedBack || this.isDashing) {
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

            // Update player sprite based on movement direction
            const deadzone = 0.01;
            if (input.y < -deadzone) {
                // Moving up - show back
                this.playerHead.setTexture('head-back');
                this.playerBody.setTexture('body-back');
                this.playerHead.setFlipX(false);
                this.playerBody.setFlipX(false);
                this.currentPlayerDirection = 'up';
            } else if (input.y > deadzone) {
                // Moving down - show front
                this.playerHead.setTexture('head-front');
                this.playerBody.setTexture('body-front');
                this.playerHead.setFlipX(false);
                this.playerBody.setFlipX(false);
                this.currentPlayerDirection = 'down';
            } else if (Math.abs(input.x) > deadzone) {
                // Moving horizontally - show profile
                this.playerHead.setTexture('head-profile');
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
