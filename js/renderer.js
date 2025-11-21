export class Renderer {
    constructor(canvas) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d', { alpha: false });
        this.resize(window.innerWidth, window.innerHeight);
    }

    resize(w, h) {
        this.width = w;
        this.height = h;
        this.canvas.width = w;
        this.canvas.height = h;
    }

    clear() {
        this.ctx.fillStyle = '#0d1117';
        this.ctx.fillRect(0, 0, this.width, this.height);
    }

    render(world) {
        const ctx = this.ctx;
        ctx.save();
        ctx.scale(0.2, 0.2);

        const count = world.count;
        const x = world.x;
        const y = world.y;
        const color = world.color;

        // Draw Food
        ctx.fillStyle = '#7ee787';
        const foodCount = world.foodCount;
        const foodX = world.foodX;
        const foodY = world.foodY;

        for (let i = 0; i < foodCount; i++) {
            ctx.fillRect(foodX[i] - 2, foodY[i] - 2, 4, 4);
        }

        // Optimization: Batch by color if possible, but since colors are random, just draw.
        // For 2000 agents, fillRect is very fast.
        for (let i = 0; i < count; i++) {
            // Optimization: Avoid string template if possible, but it's convenient.
            // For extreme perf, we'd use a single color or integer color lookup.
            ctx.fillStyle = `rgb(${color[i * 3]}, ${color[i * 3 + 1]}, ${color[i * 3 + 2]})`;

            // Draw a small square (faster than circle)
            ctx.fillRect(x[i], y[i], 4, 4);
        }

        // Draw Enemies
        ctx.fillStyle = '#ff4444';
        const enemyCount = world.enemyCount;
        const enemyX = world.enemyX;
        const enemyY = world.enemyY;

        for (let i = 0; i < enemyCount; i++) {
            ctx.fillRect(enemyX[i] - 5, enemyY[i] - 5, 10, 10);
        }

        ctx.restore();
    }
}
