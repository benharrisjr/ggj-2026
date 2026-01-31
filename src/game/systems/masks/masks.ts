import { Game } from "../../scenes/Game";

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
    maskKeys: Record<number, Array<Phaser.Input.Keyboard.Key>> = {};
    mask: number = 0

    constructor(game: Game) {
        this.game = game
        this.player = game.player
        this.gfx = game.make.graphics()

        this.setupInput()

        // Create overlay that covers the entire level (will be masked)
        const overlay = game.add.graphics();
        overlay.fillStyle(0x000000, 0.8).fillRect(0, 0, 2000, 2000); // Large enough for any level

        this.gfx.fillStyle(0xffffff);

        // Draw initial rotated triangle
        this.drawRotatedTriangle(game.player.x, game.player.y, game.playerAngle, 80);

        const mask = new Phaser.Display.Masks.BitmapMask(game, this.gfx);
        mask.invertAlpha = true;
        overlay.setMask(mask);
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

        // Draw rotated triangle centered on player
        this.drawRotatedTriangle(this.game.player.x, this.game.player.y, this.game.playerAngle, 80);
    }

    drawRotatedTriangle(x: number, y: number, angle: number, size: number) {
        const { p1, p2, p3 } = this.getTrianglePoints(x, y, angle, size);
        this.gfx.fillTriangle(p1.x, p1.y, p2.x, p2.y, p3.x, p3.y);
    }

    maskSelect(mask: number) {
        this.mask = mask
        console.log("mask set", mask)
    }

    checkEnemies() {
        // Check if each enemy is inside the mask triangle
        const trianglePoints = this.getTrianglePoints(this.game.player.x, this.game.player.y, this.game.playerAngle, 80);

        this.game.enemies.getChildren().forEach((enemy) => {
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
                this.game.enemySpottedSound.play();
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
}
