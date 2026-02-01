import { Game } from "../../scenes/Game";

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
    touchButtons: {
        up?: Phaser.GameObjects.Image;
        down?: Phaser.GameObjects.Image;
        left?: Phaser.GameObjects.Image;
        right?: Phaser.GameObjects.Image;
        action?: Phaser.GameObjects.Image;
    } = {};
    touchInput = { up: false, down: false, left: false, right: false };

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
        // Calculate spacing to accommodate the largest possible icon (selected scale)
        const maxIconSize = iconSize * this.maskSelectedScale;
        const iconSpacing = maxIconSize;
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
            this.maskIcons.push(maskIcon);
        }
    }

    createTouchControls() {
        const buttonSize = 64;
        const buttonSpacing = 16;
        const startX = 32;
        const startY = this.game.cameras.main.height - 140;

        // Create buttons in a d-pad layout
        // Up button (top center)
        this.touchButtons.up = this.game.add.image(
            startX + buttonSize + buttonSpacing,
            startY - buttonSpacing,
            'btn-up'
        );

        // Down button (bottom center)
        this.touchButtons.down = this.game.add.image(
            startX + buttonSize + buttonSpacing,
            startY + buttonSize + buttonSpacing * 2,
            'btn-down'
        );

        // Left button (middle left)
        this.touchButtons.left = this.game.add.image(
            startX,
            startY + (buttonSize + buttonSpacing) / 2,
            'btn-left'
        );

        // Right button (middle right)
        this.touchButtons.right = this.game.add.image(
            startX + (buttonSize + buttonSpacing) * 2,
            startY + (buttonSize + buttonSpacing) / 2,
            'btn-right'
        );

        // Configure all buttons
        Object.entries(this.touchButtons).forEach(([direction, button]) => {
            if (!button || direction === 'action') return;

            button.setScrollFactor(0); // Fixed to camera
            button.setDepth(998); // Above game, below health UI
            button.setScale(3.0);
            button.setAlpha(0.7);
            button.setInteractive();

            // Pointer down - activate
            button.on('pointerdown', () => {
                this.touchInput[direction as keyof typeof this.touchInput] = true;
                button.setAlpha(1.0);
            });

            // Pointer up - deactivate
            button.on('pointerup', () => {
                this.touchInput[direction as keyof typeof this.touchInput] = false;
                button.setAlpha(0.7);
            });

            // Pointer out - deactivate (for when finger slides off)
            button.on('pointerout', () => {
                this.touchInput[direction as keyof typeof this.touchInput] = false;
                button.setAlpha(0.7);
            });
        });

        console.log('Touch controls created');

        // Add an action button on the right side for touch devices
        const actionX = this.game.cameras.main.width - 80;
        const actionY = this.game.cameras.main.height - 120;
        this.touchButtons.action = this.game.add.image(actionX, actionY, 'btn-action');
        const actionBtn = this.touchButtons.action;
        actionBtn.setScrollFactor(0);
        actionBtn.setDepth(998);
        actionBtn.setScale(3.0);
        actionBtn.setAlpha(0.9);
        actionBtn.setInteractive();
        actionBtn.on('pointerdown', () => {
            console.log('[ACTION] Touch action button pressed');
            this.game.tryUseAbility();
            actionBtn.setAlpha(1.0);
        });
        actionBtn.on('pointerup', () => {
            actionBtn.setAlpha(0.9);
        });
        actionBtn.on('pointerout', () => {
            actionBtn.setAlpha(0.9);
        });
    }

    update() {
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
