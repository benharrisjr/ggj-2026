import { Game } from "../../scenes/Game";
import VirtualJoyStick from 'phaser3-rex-plugins/plugins/virtualjoystick.js';

// Color mapping for each mask (same as head colors in Game.ts)
const MASK_COLORS: Record<number, number> = {
    0: 0xFFFFFF,    // Default - white (no tint)
    1: 0x00FFFF,    // Dash - cyan
    2: 0xFF4400,    // Attack - orange/fire
    3: 0x00FF00,    // Interact - green
    4: 0xFF00FF,    // Special - magenta
    5: 0xFFFFFF,    // Unused - white
    6: 0xFFFFFF,    // Unused - white
    7: 0xFFFFFF,    // Unused - white
    8: 0xFFFFFF,    // Unused - white
    9: 0xFFFFFF,    // Unused - white
};

export class UI {
    game: Game;
    heartSprites: Phaser.GameObjects.Image[] = [];
    maskValueText: Phaser.GameObjects.Text | null = null;
    maskIcons: Phaser.GameObjects.Image[] = [];
    maskBaseScale: number = 2.0;
    maskSelectedScale: number = 3.0;
    joystick: VirtualJoyStick | null = null;
    touchButtons: {
        slash?: Phaser.GameObjects.Arc;
        dash?: Phaser.GameObjects.Arc;
        action?: Phaser.GameObjects.Arc;
    } = {};
    joystickInput = { x: 0, y: 0 };

    constructor(game: Game) {
        this.game = game;
    }

    setup() {
        this.createHealthUI();
        this.createMaskDisplay();

        // Create touch controls if touch is available
        if (this.game.sys.game.device.input.touch) {
            this.createTouchControls();
        }
    }

    createHealthUI() {
        // Clear existing hearts
        this.heartSprites.forEach(heart => heart.destroy());
        this.heartSprites = [];

        // Calculate max hearts (each heart = 2 health)
        const maxHearts = Math.ceil(this.game.playerMaxHealth / 2);
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

            const heart = this.game.add.image(x, y, 'heart');
            heart.setScrollFactor(0); // Fixed to camera
            heart.setDepth(999); // Above most things, below transition overlay
            heart.setScale(2.0);
            this.heartSprites.push(heart);
        }

        this.updateHealthDisplay();
    }

    updateHealthDisplay() {
        const maxHearts = Math.ceil(this.game.playerMaxHealth / 2);

        for (let i = 0; i < maxHearts; i++) {
            const heartValue = (i + 1) * 2; // Health value this heart represents (2, 4, 6, etc.)
            const heart = this.heartSprites[i];

            if (this.game.playerHealth >= heartValue) {
                // Full heart
                heart.setTexture('heart');
            } else if (this.game.playerHealth === heartValue - 1) {
                // Half heart
                heart.setTexture('heart-half');
            } else {
                // Empty heart
                heart.setTexture('heart-empty');
            }
        }
    }

    createMaskDisplay() {
        // Display remaining enemies count in top-right
        const pad = 8;
        this.maskValueText = this.game.add.text(
            this.game.camera.width - pad,
            pad,
            `Remaining: ${this.game.remainingEnemies}`,
            {
                font: '16px monospace',
                color: '#ffffff'
            }
        ).setOrigin(1, 0);
        this.maskValueText.setScrollFactor(0);
        this.maskValueText.setDepth(1001);

        // Create mask icons along the bottom of the screen
        const iconSize = 16; // Base size of mask icons at 1x scale
        // Use tighter spacing (base scale + small padding)
        const iconSpacing = iconSize * this.maskBaseScale + 4;
        const totalWidth = iconSpacing * 10;
        const startX = (this.game.camera.width - totalWidth) / 2 + (iconSpacing / 2);
        const startY = this.game.camera.height - 40;

        for (let i = 0; i <= 9; i++) {
            const x = startX + (i * iconSpacing);
            const maskIcon = this.game.add.image(x, startY, `mask${i}`);
            maskIcon.setScrollFactor(0);
            maskIcon.setDepth(1000);
            maskIcon.setScale(this.maskBaseScale);
            maskIcon.setOrigin(0.5, 0.5); // Center origin for scaling

            // Make mask icons tappable for touch devices
            maskIcon.setInteractive();
            const maskIndex = i;
            maskIcon.on('pointerdown', () => {
                this.game.masks.maskSelect(maskIndex);
                // Visual feedback: brief scale pulse
                this.game.tweens.add({
                    targets: maskIcon,
                    scaleX: this.maskSelectedScale * 1.2,
                    scaleY: this.maskSelectedScale * 1.2,
                    duration: 100,
                    yoyo: true,
                    ease: 'Power2'
                });
            });

            this.maskIcons.push(maskIcon);
        }
    }

    createTouchControls() {
        const screenWidth = this.game.cameras.main.width;
        const screenHeight = this.game.cameras.main.height;

        // Create virtual joystick on the left side
        const joystickX = 80;
        const joystickY = screenHeight - 80;

        this.joystick = new VirtualJoyStick(this.game, {
            x: joystickX,
            y: joystickY,
            radius: 50,
            base: this.game.add.circle(0, 0, 50, 0x333333, 0.6).setDepth(998).setScrollFactor(0),
            thumb: this.game.add.circle(0, 0, 24, 0xffffff, 0.8).setDepth(999).setScrollFactor(0),
            dir: '8dir',
            fixed: true
        });

        console.log('Virtual joystick created');

        // Create action buttons on the right side
        const buttonRadius = 28;
        const rightEdge = screenWidth - 50;
        const bottomEdge = screenHeight - 80;

        // Slash button (red/orange) - bottom right
        const slashBtn = this.game.add.circle(rightEdge, bottomEdge, buttonRadius, 0xff4400, 0.8);
        slashBtn.setScrollFactor(0);
        slashBtn.setDepth(998);
        slashBtn.setInteractive();
        slashBtn.setStrokeStyle(3, 0xffffff, 0.5);
        this.touchButtons.slash = slashBtn;

        // Draw a simple slash icon inside
        const slashIcon = this.game.add.graphics();
        slashIcon.setScrollFactor(0);
        slashIcon.setDepth(999);
        slashIcon.lineStyle(4, 0xffffff, 0.9);
        slashIcon.lineBetween(rightEdge - 12, bottomEdge + 12, rightEdge + 12, bottomEdge - 12);

        slashBtn.on('pointerdown', () => {
            this.game.performBasicAttack();
            slashBtn.setFillStyle(0xff6622, 1.0);
        });
        slashBtn.on('pointerup', () => {
            slashBtn.setFillStyle(0xff4400, 0.8);
        });
        slashBtn.on('pointerout', () => {
            slashBtn.setFillStyle(0xff4400, 0.8);
        });

        // Dash button (cyan) - above and left of slash
        const dashX = rightEdge - 60;
        const dashY = bottomEdge - 50;
        const dashBtn = this.game.add.circle(dashX, dashY, buttonRadius, 0x00ffff, 0.8);
        dashBtn.setScrollFactor(0);
        dashBtn.setDepth(998);
        dashBtn.setInteractive();
        dashBtn.setStrokeStyle(3, 0xffffff, 0.5);
        this.touchButtons.dash = dashBtn;

        // Draw a simple arrow/dash icon inside
        const dashIcon = this.game.add.graphics();
        dashIcon.setScrollFactor(0);
        dashIcon.setDepth(999);
        dashIcon.lineStyle(4, 0xffffff, 0.9);
        dashIcon.lineBetween(dashX - 10, dashY, dashX + 10, dashY);
        dashIcon.lineBetween(dashX + 4, dashY - 6, dashX + 10, dashY);
        dashIcon.lineBetween(dashX + 4, dashY + 6, dashX + 10, dashY);

        dashBtn.on('pointerdown', () => {
            this.game.performDash(600, false);
            dashBtn.setFillStyle(0x22ffff, 1.0);
        });
        dashBtn.on('pointerup', () => {
            dashBtn.setFillStyle(0x00ffff, 0.8);
        });
        dashBtn.on('pointerout', () => {
            dashBtn.setFillStyle(0x00ffff, 0.8);
        });

        // Action button (mask ability) - above slash, to the right of dash
        const actionX = rightEdge;
        const actionY = bottomEdge - 70;
        const actionBtn = this.game.add.circle(actionX, actionY, buttonRadius, 0xff00ff, 0.8);
        actionBtn.setScrollFactor(0);
        actionBtn.setDepth(998);
        actionBtn.setInteractive();
        actionBtn.setStrokeStyle(3, 0xffffff, 0.5);
        this.touchButtons.action = actionBtn;

        // Draw a star/burst icon inside (4-pointed star for "special")
        const actionIcon = this.game.add.graphics();
        actionIcon.setScrollFactor(0);
        actionIcon.setDepth(999);
        actionIcon.lineStyle(3, 0xffffff, 0.9);
        // Vertical line
        actionIcon.lineBetween(actionX, actionY - 12, actionX, actionY + 12);
        // Horizontal line
        actionIcon.lineBetween(actionX - 12, actionY, actionX + 12, actionY);
        // Diagonal lines (smaller)
        actionIcon.lineBetween(actionX - 8, actionY - 8, actionX + 8, actionY + 8);
        actionIcon.lineBetween(actionX + 8, actionY - 8, actionX - 8, actionY + 8);

        actionBtn.on('pointerdown', () => {
            this.game.tryUseAbility();
            actionBtn.setFillStyle(0xff44ff, 1.0);
        });
        actionBtn.on('pointerup', () => {
            actionBtn.setFillStyle(0xff00ff, 0.8);
        });
        actionBtn.on('pointerout', () => {
            actionBtn.setFillStyle(0xff00ff, 0.8);
        });

        console.log('Touch controls created');
    }

    update() {
        // Update joystick input values
        if (this.joystick) {
            this.joystickInput.x = this.joystick.forceX;
            this.joystickInput.y = this.joystick.forceY;
        }

        // Update on-screen remaining enemies display
        if (this.maskValueText) {
            this.maskValueText.setText(`Remaining: ${this.game.remainingEnemies}`);
            // Keep positioned top-right in case camera size changes
            const pad = 8;
            this.maskValueText.setPosition(this.game.camera.width - pad, pad);
        }

        // Update mask icon scales and tints - scale up and tint the selected one
        const selectedMask = this.game.masks.mask;
        for (let i = 0; i < this.maskIcons.length; i++) {
            const icon = this.maskIcons[i];
            if (i === selectedMask) {
                // Selected mask - scale up and apply color tint
                icon.setScale(this.maskSelectedScale);
                icon.setTint(MASK_COLORS[i] ?? 0xFFFFFF);
            } else {
                // Unselected mask - normal scale, no tint
                icon.setScale(this.maskBaseScale);
                icon.clearTint();
            }
        }
    }
}
