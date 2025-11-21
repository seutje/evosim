import { CONFIG } from './constants.js';
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
        const foodSize = CONFIG.FOOD_SIZE;
        const foodOffset = foodSize / 2;

        for (let i = 0; i < foodCount; i++) {
            ctx.fillRect(foodX[i] - foodOffset, foodY[i] - foodOffset, foodSize, foodSize);
        }

        // Optimization: Batch by color if possible, but since colors are random, just draw.
        // For 2000 agents, fillRect is very fast.
        const agentSize = CONFIG.AGENT_SIZE;
        // Agents are centered on x,y in physics, so we draw from x,y?
        // Actually, previous code was: ctx.fillRect(x[i], y[i], 4, 4);
        // Which means x,y was the top-left corner.
        // Let's center it now for better accuracy with rotation if we ever add it,
        // but for now let's stick to top-left to match previous behavior or center it?
        // The logic "x[i] += vx[i]" treats x,y as position.
        // Let's assume x,y is center for physics collisions usually, but let's check world.js...
        // world.js collision: dx = x[i] - x[neighbor]. This implies x,y is center.
        // So we should center the drawing.
        // Previous code: ctx.fillRect(x[i], y[i], 4, 4); -> This drew it at x,y (top-left).
        // This means the visual representation was slightly offset from the physics center (if physics assumed center).
        // Let's fix it to be centered: x - size/2.
        const agentOffset = agentSize / 2;

        for (let i = 0; i < count; i++) {
            ctx.fillStyle = `rgb(${color[i * 3]}, ${color[i * 3 + 1]}, ${color[i * 3 + 2]})`;
            ctx.fillRect(x[i] - agentOffset, y[i] - agentOffset, agentSize, agentSize);
        }

        // Draw Enemies
        ctx.fillStyle = '#ff4444';
        const enemyCount = world.enemyCount;
        const enemyX = world.enemyX;
        const enemyY = world.enemyY;
        const enemySize = CONFIG.ENEMY_SIZE;
        const enemyOffset = enemySize / 2;

        for (let i = 0; i < enemyCount; i++) {
            ctx.fillRect(enemyX[i] - enemyOffset, enemyY[i] - enemyOffset, enemySize, enemySize);
        }

        ctx.restore();
    }
}
