import { Scene, GameObjects } from 'phaser';

export class MainMenu extends Scene
{
    background: GameObjects.Image;
    logo: GameObjects.Image;
    title: GameObjects.Text;
    startButton: GameObjects.Text;
    gameObject: GameObjects.GameObject;
    centerX: number;
    centerY: number;
    amplitudeX: number;
    amplitudeY: number;
    frequencyX: number;
    frequencyY: number;
    angle: number;
    speed: number;
    camera: Phaser.Cameras.Scene2D.Camera;
    gamepad: Phaser.Input.Gamepad.Gamepad | null = null;
    gamepadMessage: Phaser.GameObjects.Text;
    previousButtonState: boolean = false;
    menuMusic: Phaser.Sound.BaseSound;
    

    constructor ()
    {
        super('MainMenu');
    }

    create ()
    {
        this.game.canvas.style.cursor = 'none';

        // Stop all existing sounds and play menu music (looping)
        this.sound.stopAll();
        this.menuMusic = this.sound.add('menuMusic', { loop: true, volume: 0.5 });
        this.menuMusic.play();

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

        this.camera = this.cameras.main;
        this.camera.setZoom(1.0);
        this.background = this.add.image(320, 180, 'level_1').setScale(3.0);
        this.title = this.add.text(320, 180, 'Ninja Vision', {
            fontFamily: 'Arial Black', fontSize: 38, color: '#ffffff',
            stroke: '#000000', strokeThickness: 8,
            align: 'center'
        }).setOrigin(0.5).setScrollFactor(0);


        this.startButton = this.add.text(320, 300, 'Start', {
            fontFamily: 'Arial Black', fontSize: 38, color: '#ffffff',
            stroke: '#000000', strokeThickness: 8,
            align: 'center'
        }).setOrigin(0.5).setScrollFactor(0);

        this.input.once('pointerdown', () => {
            this.menuMusic.stop();
            this.scene.start('Game');
        });

        this.gameObject = this.add.container(0, 0);
        this.centerX = 400; // Center X position of the figure eight
        this.centerY = 300; // Center Y position
        this.amplitudeX = 600; // Width of the loops
        this.amplitudeY = 300; // Height of the loops
        this.frequencyX = 1; // Frequency for the X axis
        this.frequencyY = 2; // Frequency for the Y axis (double for figure eight)
        this.angle = 0; // Timer/angle variable
        this.speed = 0.0003; // Speed of movement along the path
        this.camera.startFollow(this.gameObject, true, 0.1, 0.1);  // 

    }

    update(time, delta) {
        // Check for gamepad B button (button 1) to start game
        if (this.gamepad) {
            const bPressed = !!(this.gamepad.buttons && this.gamepad.buttons[1] && this.gamepad.buttons[1].pressed);
            if (bPressed && !this.previousButtonState) {
                console.log('[MENU] Gamepad B button pressed - starting game');
                this.menuMusic.stop();
                this.scene.start('Game');
            }
            this.previousButtonState = bPressed;
        }

        // Update the angle based on time (delta) and speed
        this.angle += this.speed * delta;

        // Calculate new X and Y positions using sine and cosine
        // For a horizontal figure eight, double the frequency for the Y axis
        this.gameObject.x = this.centerX + this.amplitudeX * Math.cos(this.angle * this.frequencyX);
        this.gameObject.y = this.centerY + this.amplitudeY * Math.sin(this.angle * this.frequencyY);

        // Optional: Wrap the angle to prevent the number from growing indefinitely
        if (this.angle > Math.PI * 2) {
            this.angle -= Math.PI * 2;
        }
    }

}
