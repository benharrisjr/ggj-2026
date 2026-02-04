import { Game } from "../../scenes/Game";

// Shape types for mask definitions
type ShapeType = 'triangle' | 'circle' | 'rect';

interface MaskShape {
    type: ShapeType;
    // For triangle: size is the triangle size
    // For circle: size is the radius
    // For rect: size is { width, height }
    size: number | { width: number; height: number };
    // Offset from player position
    offsetX?: number;
    offsetY?: number;
    // For triangle: whether to rotate with player angle
    rotateWithPlayer?: boolean;
    // For triangle: angle offset from player direction
    angleOffset?: number;
}

// Light source (e.g., lit torch) that adds a circle to the mask
interface LightSource {
    id: number;
    x: number;
    y: number;
    radius: number;
}

// Color mapping for each mask (same as head/button colors)
const MASK_COLORS: Record<number, number> = {
    0: 0x000000,    // Default - black
    1: 0x00FFFF,    // Dash - cyan
    2: 0xFF4400,    // Attack - orange/fire
    3: 0x00FF00,    // Interact - green
    4: 0xFF00FF,    // Special - magenta
    5: 0x000000,
    6: 0x000000,
    7: 0x000000,
    8: 0x000000,
    9: 0x000000,
};

// Define shapes for each mask number
const MASK_SHAPES: Record<number, MaskShape[]> = {
    0: [
        // Default: circle around player
        { type: 'circle', size: 200 }
    ],
    1: [
        // Dash: narrower triangle
        { type: 'triangle', size: 140, rotateWithPlayer: true }
    ],
    2: [
        // Attack: forward triangle + small circle around player
        { type: 'triangle', size: 60, rotateWithPlayer: true },
        { type: 'circle', size: 24 }
    ],
    3: [
        // Interact: circle around player
        { type: 'circle', size: 96 }
    ],
    4: [
        // Special: multiple triangles (peripheral vision)
        { type: 'triangle', size: 60, rotateWithPlayer: true, angleOffset: 0 },
        { type: 'triangle', size: 60, rotateWithPlayer: true, angleOffset: Math.PI / 2 },
        // { type: 'triangle', size: 60, rotateWithPlayer: true, angleOffset: Math.PI },
        { type: 'triangle', size: 60, rotateWithPlayer: true, angleOffset: -Math.PI / 2 }
    ],
};

const numKeys: Record<number, Array<number>> = {
    0: [Phaser.Input.Keyboard.KeyCodes.ZERO, Phaser.Input.Keyboard.KeyCodes.NUMPAD_ZERO],
    1: [Phaser.Input.Keyboard.KeyCodes.ONE, Phaser.Input.Keyboard.KeyCodes.NUMPAD_ONE],
    2: [Phaser.Input.Keyboard.KeyCodes.TWO, Phaser.Input.Keyboard.KeyCodes.NUMPAD_TWO],
    3: [Phaser.Input.Keyboard.KeyCodes.THREE, Phaser.Input.Keyboard.KeyCodes.NUMPAD_THREE],
    4: [Phaser.Input.Keyboard.KeyCodes.FOUR, Phaser.Input.Keyboard.KeyCodes.NUMPAD_FOUR],
    5: [Phaser.Input.Keyboard.KeyCodes.FIVE, Phaser.Input.Keyboard.KeyCodes.NUMPAD_FIVE],
    6: [Phaser.Input.Keyboard.KeyCodes.SIX, Phaser.Input.Keyboard.KeyCodes.NUMPAD_SIX],
    7: [Phaser.Input.Keyboard.KeyCodes.SEVEN, Phaser.Input.Keyboard.KeyCodes.NUMPAD_SEVEN],
    8: [Phaser.Input.Keyboard.KeyCodes.EIGHT, Phaser.Input.Keyboard.KeyCodes.NUMPAD_EIGHT],
    9: [Phaser.Input.Keyboard.KeyCodes.NINE, Phaser.Input.Keyboard.KeyCodes.NUMPAD_NINE],
}

export class Masks {
    game: Game
    player: Phaser.Physics.Arcade.Image
    gfx: Phaser.GameObjects.Graphics
    overlay: Phaser.GameObjects.Graphics
    maskKeys: Record<number, Array<Phaser.Input.Keyboard.Key>> = {};
    mask: number = 0
    // Dynamic light sources (e.g., lit torches)
    lightSources: LightSource[] = [];
    nextLightId: number = 0;

    constructor(game: Game) {
        this.game = game
        this.player = game.player
        this.gfx = game.make.graphics()

        this.setupInput()

        // Create overlay that covers the entire level (will be masked)
        this.overlay = game.add.graphics();
        this.overlay.setDepth(100); // Above all game objects, below UI
        this.updateOverlayColor();

        this.gfx.fillStyle(0xffffff);

        // Draw initial rotated triangle
        this.drawRotatedTriangle(game.player.x, game.player.y, game.playerAngle, 80);

        const mask = new Phaser.Display.Masks.BitmapMask(game, this.gfx);
        mask.invertAlpha = true;
        this.overlay.setMask(mask);
    }

    setupInput() {
        const kb = this.game.input.keyboard!

        for (let i = 0; i <= 9; i++) {
            this.maskKeys[i] = []
            this.maskKeys[i][0] = kb.addKey(numKeys[i][0])
            this.maskKeys[i][1] = kb.addKey(numKeys[i][1])
        }
    }

    handleInput() {
        // If multiple keys pressed in one frame, biases towards higher numbers
        for (let i = 0; i <= 9; i++) {
            if (this.maskKeys[i][0].isDown || this.maskKeys[i][1].isDown) {
                if (this.mask != i) {
                    this.maskSelect(i)
                }
            }
        }
    }

    update() {
        this.handleInput()
        this.checkEnemies()

        // Update mask to follow player (clear previous frame to prevent trails)
        this.gfx.clear();
        this.gfx.fillStyle(0xffffff);

        // Draw all shapes for the current mask
        this.drawMaskShapes();
    }

    drawMaskShapes() {
        const shapes = MASK_SHAPES[this.mask] || MASK_SHAPES[0];
        const playerX = this.game.player.x;
        const playerY = this.game.player.y;
        const playerAngle = this.game.playerAngle;

        for (const shape of shapes) {
            const offsetX = shape.offsetX || 0;
            const offsetY = shape.offsetY || 0;
            const x = playerX + offsetX;
            const y = playerY + offsetY;

            switch (shape.type) {
                case 'triangle': {
                    const size = shape.size as number;
                    const angle = shape.rotateWithPlayer
                        ? playerAngle + (shape.angleOffset || 0)
                        : (shape.angleOffset || 0);
                    this.drawTriangle(x, y, angle, size);
                    break;
                }
                case 'circle': {
                    const radius = shape.size as number;
                    this.gfx.fillCircle(x, y, radius);
                    break;
                }
                case 'rect': {
                    const { width, height } = shape.size as { width: number; height: number };
                    // Center the rect on the position
                    this.gfx.fillRect(x - width / 2, y - height / 2, width, height);
                    break;
                }
            }
        }

        // Draw light source circles (lit torches, etc.)
        for (const light of this.lightSources) {
            this.gfx.fillCircle(light.x, light.y, light.radius);
        }
    }

    drawTriangle(x: number, y: number, angle: number, size: number) {
        const { p1, p2, p3 } = this.getTrianglePoints(x, y, angle, size);
        this.gfx.fillTriangle(p1.x, p1.y, p2.x, p2.y, p3.x, p3.y);
    }

    drawRotatedTriangle(x: number, y: number, angle: number, size: number) {
        const { p1, p2, p3 } = this.getTrianglePoints(x, y, angle, size);
        this.gfx.fillTriangle(p1.x, p1.y, p2.x, p2.y, p3.x, p3.y);
    }

    maskSelect(mask: number) {
        this.mask = mask
        console.log("mask set", mask)
        this.updateOverlayColor();
        // Emit an event on the scene so external code (e.g., Game.ts) can react
        // with the selected mask value.
        try {
            this.game.events.emit('mask:select', mask);
        } catch (e) {
            // Ignore if events not available for any reason
        }
    }

    // Cycle to next mask (wraps around)
    nextMask() {
        const nextMask = (this.mask + 1) % 5; // 0-4
        this.maskSelect(nextMask);
    }

    // Cycle to previous mask (wraps around)
    previousMask() {
        const prevMask = (this.mask - 1 + 5) % 5; // 0-4
        this.maskSelect(prevMask);
    }

    updateOverlayColor() {
        const color = MASK_COLORS[this.mask] ?? 0x000000;
        this.overlay.clear();
        const opacity = this.mask === 0 ? 0.95 : 0.7; // Set desired opacity here
        const darkenedColor = this.mask === 0 ? color : Phaser.Display.Color.IntegerToColor(color).darken(50).color;
        this.overlay.fillStyle(darkenedColor, opacity).fillRect(0, 0, 2000, 2000);
    }

    // Add a light source (returns its ID for later removal)
    addLightSource(x: number, y: number, radius: number): number {
        const id = this.nextLightId++;
        this.lightSources.push({ id, x, y, radius });
        return id;
    }

    // Remove a light source by ID
    removeLightSource(id: number) {
        this.lightSources = this.lightSources.filter(light => light.id !== id);
    }

    // Check if a point is inside any of the current mask's shapes
    isPointInMask(px: number, py: number): boolean {
        const shapes = MASK_SHAPES[this.mask] || MASK_SHAPES[0];
        const playerX = this.game.player.x;
        const playerY = this.game.player.y;
        const playerAngle = this.game.playerAngle;

        for (const shape of shapes) {
            const offsetX = shape.offsetX || 0;
            const offsetY = shape.offsetY || 0;
            const x = playerX + offsetX;
            const y = playerY + offsetY;

            switch (shape.type) {
                case 'triangle': {
                    const size = shape.size as number;
                    const angle = shape.rotateWithPlayer
                        ? playerAngle + (shape.angleOffset || 0)
                        : (shape.angleOffset || 0);
                    const points = this.getTrianglePoints(x, y, angle, size);
                    if (this.isPointInTriangle(px, py, points.p1, points.p2, points.p3)) {
                        return true;
                    }
                    break;
                }
                case 'circle': {
                    const radius = shape.size as number;
                    const dist = Math.hypot(px - x, py - y);
                    if (dist <= radius) {
                        return true;
                    }
                    break;
                }
                case 'rect': {
                    const { width, height } = shape.size as { width: number; height: number };
                    const left = x - width / 2;
                    const top = y - height / 2;
                    if (px >= left && px <= left + width && py >= top && py <= top + height) {
                        return true;
                    }
                    break;
                }
            }
        }

        // Also check light sources (lit torches, etc.)
        for (const light of this.lightSources) {
            const dist = Math.hypot(px - light.x, py - light.y);
            if (dist <= light.radius) {
                return true;
            }
        }

        return false;
    }

    checkEnemies() {
        this.game.enemies.getChildren().forEach((enemy) => {
            const enemySprite = enemy as Phaser.Physics.Arcade.Image;
            const wasVisible = enemySprite.visible;
            const enemyInMask = this.isPointInMask(enemySprite.x, enemySprite.y);
            enemySprite.setVisible(enemyInMask);

            // Play spotted sound when enemy becomes visible
            if (enemyInMask && !wasVisible) {
                // this.game.enemySpottedSound.play();
                const xOffset = - 16;
                const yOffset = - 60;
                
                const enemyAlert = this.game.add.text(this.game.player.x + xOffset, this.game.player.y + yOffset, '!', 
                    {   
                        color: 'red',
                        fontSize: 42,
                        shadow: {
                            offsetX: 5,
                            offsetY: 5,
                            color: "black",
                            blur: 7,
                            stroke: true,
                            fill: true
                        }
                    });

                this.game.events.on('update', () => {
                    enemyAlert.setPosition(this.game.player.x + xOffset, this.game.player.y + yOffset);
                });

                this.game.time.delayedCall(500, () => {
                    enemyAlert.removeFromDisplayList()
                })
            }

            // Check if enemy is behind the player (outside forward 180 degree arc)
            const angleToEnemy = Math.atan2(
                enemySprite.y - this.player.y,
                enemySprite.x - this.player.x
            );
            // Player faces opposite of playerAngle (subtract PI to get forward direction)
            const playerForward = this.game.playerAngle - Math.PI;
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

                // Skip movement if enemy is being knocked back
                if (enemySprite.getData('knockedBack')) {
                    return;
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

                let vx = 0;
                let vy = 0;

                if (shouldChase) {
                    // Move towards player
                    const angle = Math.atan2(
                        this.player.y - enemySprite.y,
                        this.player.x - enemySprite.x
                    );
                    vx = Math.cos(angle) * speed;
                    vy = Math.sin(angle) * speed;
                } else {
                    // Random direction
                    const randomAngle = Math.random() * Math.PI * 2;
                    vx = Math.cos(randomAngle) * speed;
                    vy = Math.sin(randomAngle) * speed;
                }

                enemySprite.setVelocity(vx, vy);

                // Update enemy sprite based on movement direction
                const enemyType = enemySprite.getData('enemyType');
                if (enemyType) {
                    const deadzone = 0.3;
                    if (vy < -deadzone * speed) {
                        // Moving up - show back
                        enemySprite.setTexture(`enemy-${enemyType}-back`);
                        enemySprite.setFlipX(false);
                    } else if (vy > deadzone * speed) {
                        // Moving down - show front
                        enemySprite.setTexture(`enemy-${enemyType}-front`);
                        enemySprite.setFlipX(false);
                    } else if (Math.abs(vx) > deadzone * speed) {
                        // Moving horizontally - show profile
                        enemySprite.setTexture(`enemy-${enemyType}-profile`);
                        enemySprite.setFlipX(vx > 0); // Flip based on direction
                    }
                }
            }
        });

        // Check boss separately
        this.checkBoss();
    }

    checkBoss() {
        const boss = this.game.boss;
        if (!boss || !boss.active) return;

        const wasVisible = boss.visible;
        const bossInMask = this.isPointInMask(boss.x, boss.y);
        boss.setVisible(bossInMask);

        // Play spotted sound when boss becomes visible
        if (bossInMask && !wasVisible) {
            this.game.enemySpottedSound.play();
        }

        // Check if boss is behind the player
        const angleToEnemy = Math.atan2(
            boss.y - this.player.y,
            boss.x - this.player.x
        );
        const playerForward = this.game.playerAngle - Math.PI;
        let angleDiff = angleToEnemy - playerForward;
        while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
        while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;
        const isBehindPlayer = Math.abs(angleDiff) > Math.PI / 2;

        const speed = boss.getData('speed') || 80;
        const deltaTime = this.game.sys.game.loop.delta; // ms since last frame

        // Freeze boss when in player's view AND in front of player
        if (bossInMask && !isBehindPlayer) {
            // Store current velocity before freezing (if not already frozen)
            if (!boss.getData('frozen')) {
                boss.setData('savedVelocityX', boss.body?.velocity.x || 0);
                boss.setData('savedVelocityY', boss.body?.velocity.y || 0);
                boss.setData('frozen', true);
                boss.setData('frozenTime', 0);
                console.log('[BOSS] Boss frozen!');
            }
            boss.setVelocity(0, 0);

            // Track frozen time
            const frozenTime = (boss.getData('frozenTime') || 0) + deltaTime;
            boss.setData('frozenTime', frozenTime);

            // Teleport after 2 second of being frozen
            if (frozenTime >= 2000) {
                console.log('[BOSS] Boss teleporting after 1s frozen!');
                const newPos = this.game.getValidTeleportPosition();
                if (newPos) {
                    this.game.teleportSound.play();
                    boss.setPosition(newPos.x, newPos.y);
                    boss.setData('frozen', false);
                    boss.setData('frozenTime', 0);
                    console.log('[BOSS] Boss teleported to', newPos.x, newPos.y);
                }
            }
        } else {
            // Restore movement when out of view
            if (boss.getData('frozen')) {
                boss.setData('frozen', false);
                boss.setData('frozenTime', 0);
            }

            // Always chase player
            const angle = Math.atan2(
                this.player.y - boss.y,
                this.player.x - boss.x
            );
            const vx = Math.cos(angle) * speed;
            const vy = Math.sin(angle) * speed;
            boss.setVelocity(vx, vy);

            // Update boss sprite based on movement direction
            const deadzone = 0.3;
            if (vy < -deadzone * speed) {
                // Moving up - show back
                boss.setTexture('demon-back');
                boss.setFlipX(false);
            } else if (vy > deadzone * speed) {
                // Moving down - show front
                boss.setTexture('demon-front');
                boss.setFlipX(false);
            } else if (Math.abs(vx) > deadzone * speed) {
                // Moving horizontally - show profile
                boss.setTexture('demon-profile');
                boss.setFlipX(vx > 0); // Flip based on direction
            }
        }
    }

    getTrianglePoints(x: number, y: number, angle: number, size: number): { p1: { x: number; y: number }; p2: { x: number; y: number }; p3: { x: number; y: number } } {
        // Calculate the three points of the triangle rotated by the given angle
        // Base triangle points before rotation (pointing up):
        // Top: (0, -size)
        // Bottom left: (-size, size)
        // Bottom right: (size, size)

        const cos = Math.cos(angle);
        const sin = Math.sin(angle);

        // Rotate and translate each point
        const p1 = {
            x: x,
            y: y
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

    enemyVisible(enemy: Phaser.Physics.Arcade.Image): boolean {
        console.log(enemy)
        return true
    }
}
