import { Game } from "../../scenes/Game";

export class Masks {
    game: Game
    gfx: Phaser.GameObjects.Graphics;

    constructor(game: Game) {
        this.game = game
        this.gfx = game.make.graphics()

        // Create overlay that covers the entire level (will be masked)
        const overlay = game.add.graphics();
        overlay.fillStyle(0x000000, 0.8).fillRect(0, 0, 2000, 2000); // Large enough for any level

        this.gfx.fillStyle(0xffffff);

        // Draw initial rotated triangle
        this.drawRotatedTriangle(game.player.x, game.player.y, game.playerAngle);

        const mask = new Phaser.Display.Masks.BitmapMask(game, this.gfx);
        mask.invertAlpha = true;
        overlay.setMask(mask);
    }

    update() {
        // Update mask to follow player (clear previous frame to prevent trails)
        this.gfx.clear();
        this.gfx.fillStyle(0xffffff);

        // Draw rotated triangle centered on player
        this.drawRotatedTriangle(this.game.player.x, this.game.player.y, this.game.playerAngle, 80);
    }


    drawRotatedTriangle(x: number, y: number, angle: number, size: number = 40) {
        const { p1, p2, p3 } = this.game.getTrianglePoints(x, y, angle, size);
        this.gfx.fillTriangle(p1.x, p1.y, p2.x, p2.y, p3.x, p3.y);
    }
}
