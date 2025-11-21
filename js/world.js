import { CONFIG, BRAIN_SIZE } from './constants.js';
import { SpatialHash } from './spatial-hash.js';
import { NeuralNetwork } from './neural-network.js';

export class World {
    constructor() {
        this.capacity = CONFIG.AGENT_COUNT;
        this.count = 0;

        // --- PHYSICS DATA (SoA) ---
        this.x = new Float32Array(this.capacity);
        this.y = new Float32Array(this.capacity);
        this.vx = new Float32Array(this.capacity);
        this.vy = new Float32Array(this.capacity);
        this.angle = new Float32Array(this.capacity);

        // --- BIOLOGICAL DATA ---
        this.color = new Float32Array(this.capacity * 3); // R, G, B
        this.energy = new Float32Array(this.capacity);
        this.generation = new Int16Array(this.capacity);

        // --- PHASE 2: NEURAL NETWORK DATA ---
        this.brainWeights = new Float32Array(this.capacity * BRAIN_SIZE);

        // Temp buffer for inputs to avoid GC
        this.inputBuffer = new Float32Array(CONFIG.INPUT_NEURONS);

        // --- SPATIAL PARTITIONING ---
        this.grid = new SpatialHash(CONFIG.WIDTH, CONFIG.HEIGHT, CONFIG.GRID_SIZE, this.capacity);
        this.foodGrid = new SpatialHash(CONFIG.WIDTH, CONFIG.HEIGHT, CONFIG.GRID_SIZE, CONFIG.FOOD_COUNT);

        // --- ENVIRONMENT (FOOD) ---
        this.foodCount = CONFIG.FOOD_COUNT;
        this.foodX = new Float32Array(this.foodCount);
        this.foodY = new Float32Array(this.foodCount);

        // --- ENEMIES ---
        this.enemyCount = Math.floor(this.capacity / CONFIG.ENEMY_RATIO);
        this.enemyX = new Float32Array(this.enemyCount);
        this.enemyY = new Float32Array(this.enemyCount);
        this.spawnEnemies();

        // Init Food
        this.patternTimer = 0;
        this.currentPattern = 0; // 0: Star, 1: Ring, 2: Stripes, 3: Corners, 4: Center, 5: Spiral

        this.switchPattern(); // Initial spawn

        this.epochTimer = 0;
    }

    switchPattern() {
        this.currentPattern = (this.currentPattern + 1) % 6;
        // console.log("Switching Food Pattern to: " + this.currentPattern);

        // Relocate all food immediately
        for (let i = 0; i < this.foodCount; i++) {
            const [fx, fy] = this.getPatternPosition();
            this.foodX[i] = fx;
            this.foodY[i] = fy;
        }
    }

    getPatternPosition() {
        const w = CONFIG.WIDTH;
        const h = CONFIG.HEIGHT;
        let x, y;

        switch (this.currentPattern) {
            case 0: { // Star
                const arms = 5;
                const arm = Math.floor(Math.random() * arms);
                const angleBase = (arm / arms) * Math.PI * 2 - (Math.PI / 2); // Start pointing up
                const dist = Math.random() * (Math.min(w, h) * 0.45);
                const spread = 0.1; // Thickness of arms
                const angle = angleBase + (Math.random() * spread - spread / 2);

                x = w / 2 + Math.cos(angle) * dist;
                y = h / 2 + Math.sin(angle) * dist;
                break;
            }

            case 1: { // Ring
                const angle = Math.random() * Math.PI * 2;
                const r = Math.min(w, h) * 0.3 + (Math.random() * 120);
                x = w / 2 + Math.cos(angle) * r;
                y = h / 2 + Math.sin(angle) * r;
                break;
            }

            case 2: // Vertical Stripes
                const stripe = Math.floor(Math.random() * 3); // 0, 1, 2
                const sx = (w / 4) * (stripe + 1) + (Math.random() * 180 - 90);
                x = sx;
                y = Math.random() * h;
                break;

            case 3: // Corners
                const corner = Math.floor(Math.random() * 4);
                let cx = (corner % 2) * w;
                let cy = Math.floor(corner / 2) * h;
                // Pull in
                cx = cx === 0 ? w * 0.15 : w * 0.85;
                cy = cy === 0 ? h * 0.15 : h * 0.85;
                x = cx + (Math.random() * 300 - 150);
                y = cy + (Math.random() * 300 - 150);
                break;

            case 4: // Center Cluster
                x = w / 2 + (Math.random() * 900 - 450);
                y = h / 2 + (Math.random() * 900 - 450);
                break;

            case 5: { // Spiral
                const maxR = Math.min(w, h) * 0.45;
                const r = Math.random() * maxR;
                const spiralAngle = r * 0.05 + (Math.random() * 0.2); // r * tightness
                x = w / 2 + Math.cos(spiralAngle) * r;
                y = h / 2 + Math.sin(spiralAngle) * r;
                break;
            }

            default:
                x = Math.random() * w;
                y = Math.random() * h;
                break;
        }

        // Constrain to viewport with margin
        const margin = 50;
        x = Math.max(margin, Math.min(x, w - margin));
        y = Math.max(margin, Math.min(y, h - margin));

        return [x, y];
    }

    spawnEnemies() {
        for (let i = 0; i < this.enemyCount; i++) {
            this.enemyX[i] = Math.random() * CONFIG.WIDTH;
            this.enemyY[i] = Math.random() * CONFIG.HEIGHT;
        }
    }

    spawn(x, y) {
        if (this.count >= this.capacity) return;
        const id = this.count++;

        this.x[id] = x;
        this.y[id] = y;

        const a = Math.random() * Math.PI * 2;
        const speed = 4 + Math.random() * 4;
        this.vx[id] = Math.cos(a) * speed;
        this.vy[id] = Math.sin(a) * speed;
        this.angle[id] = a;

        this.energy[id] = 50;

        // Random color
        this.color[id * 3] = 100 + Math.random() * 155;
        this.color[id * 3 + 1] = 100 + Math.random() * 155;
        this.color[id * 3 + 2] = 255;

        // Randomize Brain
        const weightOffset = id * BRAIN_SIZE;
        for (let i = 0; i < BRAIN_SIZE; i++) {
            this.brainWeights[weightOffset + i] = (Math.random() - 0.5) * 2;
        }
    }

    update(dt) {
        // 0. Update Environment Pattern
        this.patternTimer += dt;
        if (this.patternTimer > 10) {
            this.patternTimer = 0;
            this.switchPattern();
        }

        // Evolution Check
        this.epochTimer += dt;
        // Evolve every EPOCH_LENGTH seconds
        // We keep the population check as a failsafe against extinction, but user asked for fixed time.
        // Let's prioritize the timer but keep the extinction check (count == 0 or very low).
        if (this.epochTimer > CONFIG.EPOCH_LENGTH || this.count < 10) {
            console.log("Triggering Evolution. Timer:", this.epochTimer, "Count:", this.count);
            this.evolve();
            this.epochTimer = 0;
        }

        // 1. Rebuild Spatial Hashes
        this.grid.clear();
        for (let i = 0; i < this.count; i++) {
            this.grid.add(i, this.x[i], this.y[i]);
        }

        this.foodGrid.clear();
        for (let i = 0; i < this.foodCount; i++) {
            this.foodGrid.add(i, this.foodX[i], this.foodY[i]);
        }

        // 1.5 Update Enemies
        for (let i = 0; i < this.enemyCount; i++) {
            let minDistSq = Infinity;
            let targetId = -1;

            // Find nearest agent
            // Optimization: We could use the grid, but for 10 enemies, brute force is fine.
            for (let a = 0; a < this.count; a++) {
                const dx = this.x[a] - this.enemyX[i];
                const dy = this.y[a] - this.enemyY[i];
                const dSq = dx * dx + dy * dy;
                if (dSq < minDistSq) {
                    minDistSq = dSq;
                    targetId = a;
                }
            }

            if (targetId !== -1) {
                const dx = this.x[targetId] - this.enemyX[i];
                const dy = this.y[targetId] - this.enemyY[i];
                const dist = Math.sqrt(minDistSq);

                if (dist > 0) {
                    this.enemyX[i] += (dx / dist) * CONFIG.ENEMY_SPEED;
                    this.enemyY[i] += (dy / dist) * CONFIG.ENEMY_SPEED;
                }

                // Kill Agent?
                if (dist < CONFIG.ENEMY_SIZE + (CONFIG.AGENT_SIZE / 2)) {
                    this.kill(targetId);
                    // If we killed the agent at 'i' in the agent loop (which hasn't happened yet), 
                    // we are fine because we are in the enemy loop.
                    // However, we just swapped the last agent to 'targetId'.
                    // We should decrement 'a' if we were in the agent loop, but we are not.
                }
            }
        }

        // 2. Update Agents
        for (let i = 0; i < this.count; i++) {
            // --- SENSORY INPUT ---
            const nearestNeighborDist = this.getNearestNeighborDist(i);
            const [nearestFoodDist, nearestFoodId, foodDx, foodDy] = this.getNearestFood(i);

            // Calculate Angle to Food (Relative to Agent's Heading)
            let angleToFood = 0;
            if (nearestFoodId !== -1) {
                const absoluteAngle = Math.atan2(foodDy, foodDx);
                let relativeAngle = absoluteAngle - this.angle[i];

                // Normalize to -PI to PI
                while (relativeAngle > Math.PI) relativeAngle -= Math.PI * 2;
                while (relativeAngle < -Math.PI) relativeAngle += Math.PI * 2;

                angleToFood = relativeAngle / Math.PI; // Normalize -1 to 1
            }

            this.inputBuffer[0] = nearestNeighborDist / CONFIG.SENSOR_RANGE;
            // Normalize by world diagonal (approx 2000 for 1080p)
            const maxDist = Math.max(CONFIG.WIDTH, CONFIG.HEIGHT) * 1.5;
            this.inputBuffer[1] = nearestFoodDist / maxDist;
            this.inputBuffer[2] = angleToFood;
            this.inputBuffer[3] = this.energy[i] / 100;

            const [nearestEnemyDist, nearestEnemyId, enemyDx, enemyDy] = this.getNearestEnemy(i);

            // Calculate Angle to Enemy
            let angleToEnemy = 0;
            if (nearestEnemyId !== -1) {
                const absoluteAngle = Math.atan2(enemyDy, enemyDx);
                let relativeAngle = absoluteAngle - this.angle[i];
                while (relativeAngle > Math.PI) relativeAngle -= Math.PI * 2;
                while (relativeAngle < -Math.PI) relativeAngle += Math.PI * 2;
                angleToEnemy = relativeAngle / Math.PI;
            }

            this.inputBuffer[4] = nearestEnemyDist / maxDist;
            this.inputBuffer[5] = angleToEnemy;

            // DEBUG: Log inputs for agent 0
            if (i === 0 && Math.random() < 0.01) {
                console.log("Agent 0 Inputs:",
                    "Neighbor:", this.inputBuffer[0].toFixed(2),
                    "FoodDist:", this.inputBuffer[1].toFixed(2),
                    "FoodAngle:", this.inputBuffer[2].toFixed(2),
                    "Energy:", this.inputBuffer[3].toFixed(2)
                );
            }

            // --- NEURAL NETWORK ---
            const outputs = NeuralNetwork.compute(this.inputBuffer, this.brainWeights, i * BRAIN_SIZE);

            const turnForce = outputs[0];
            const speedForce = outputs[1];

            // --- PHYSICS ---
            this.angle[i] += turnForce * 0.2;
            const speed = 4 + speedForce * 2;

            this.vx[i] = Math.cos(this.angle[i]) * speed;
            this.vy[i] = Math.sin(this.angle[i]) * speed;

            this.x[i] += this.vx[i];
            this.y[i] += this.vy[i];

            // --- INTERACTIONS ---
            // Eat Food?
            if (nearestFoodDist < CONFIG.FOOD_SIZE + CONFIG.AGENT_SIZE && nearestFoodId !== -1) {
                // Eat
                this.energy[i] += CONFIG.FOOD_ENERGY;
                if (this.energy[i] > 100) this.energy[i] = 100;

                // Respawn Food (Respecting current pattern)
                const [fx, fy] = this.getPatternPosition();
                this.foodX[nearestFoodId] = fx;
                this.foodY[nearestFoodId] = fy;
            }

            // Boundaries
            if (this.x[i] < 0) { this.x[i] = 0; this.vx[i] *= -1; }
            if (this.x[i] > CONFIG.WIDTH) { this.x[i] = CONFIG.WIDTH; this.vx[i] *= -1; }
            if (this.y[i] < 0) { this.y[i] = 0; this.vy[i] *= -1; }
            if (this.y[i] > CONFIG.HEIGHT) { this.y[i] = CONFIG.HEIGHT; this.vy[i] *= -1; }

            // Metabolism
            this.energy[i] -= 0.05 + (Math.abs(speedForce) * 0.05);
            if (this.energy[i] <= 0) {
                this.kill(i);
                i--;
            }
        }
    }

    getNearestFood(i) {
        let minDistSq = Infinity;
        let foundId = -1;
        let foundDx = 0;
        let foundDy = 0;

        const myX = this.x[i];
        const myY = this.y[i];

        // Optimized search using SpatialHash
        const cellX = Math.floor(myX / CONFIG.GRID_SIZE);
        const cellY = Math.floor(myY / CONFIG.GRID_SIZE);
        const searchRadius = 2; // Check 2 cells radius (approx 100px if grid is 50)

        for (let dy = -searchRadius; dy <= searchRadius; dy++) {
            for (let dx = -searchRadius; dx <= searchRadius; dx++) {
                const cx = cellX + dx;
                const cy = cellY + dy;
                if (cx < 0 || cx >= this.foodGrid.cols || cy < 0 || cy >= this.foodGrid.rows) continue;

                const cellIndex = cy * this.foodGrid.cols + cx;
                let foodId = this.foodGrid.cellStart[cellIndex];

                while (foodId !== -1) {
                    const dx = this.foodX[foodId] - myX;
                    const dy = this.foodY[foodId] - myY;
                    const distSq = dx * dx + dy * dy;

                    if (distSq < minDistSq) {
                        minDistSq = distSq;
                        foundId = foodId;
                        foundDx = dx;
                        foundDy = dy;
                    }
                    foodId = this.foodGrid.cellNext[foodId];
                }
            }
        }

        // Fallback: Hybrid Search (Global Sampling)
        // If nothing found in local grid, sample random food items to provide a global gradient.
        // This prevents agents from being "blind" to distant food.
        if (minDistSq === Infinity) {
            const sampleCount = 20; // Check 20 random food items
            for (let k = 0; k < sampleCount; k++) {
                const randId = Math.floor(Math.random() * this.foodCount);
                const dx = this.foodX[randId] - myX;
                const dy = this.foodY[randId] - myY;
                const distSq = dx * dx + dy * dy;

                if (distSq < minDistSq) {
                    minDistSq = distSq;
                    foundId = randId;
                    foundDx = dx;
                    foundDy = dy;
                }
            }
        }

        // If STILL nothing (unlikely), return max dist
        if (minDistSq === Infinity) {
            return [Math.max(CONFIG.WIDTH, CONFIG.HEIGHT), -1, 0, 0];
        }

        return [Math.sqrt(minDistSq), foundId, foundDx, foundDy];
    }

    getNearestEnemy(i) {
        let minDistSq = Infinity;
        let foundId = -1;
        let foundDx = 0;
        let foundDy = 0;

        const myX = this.x[i];
        const myY = this.y[i];

        for (let e = 0; e < this.enemyCount; e++) {
            const dx = this.enemyX[e] - myX;
            const dy = this.enemyY[e] - myY;
            const distSq = dx * dx + dy * dy;

            if (distSq < minDistSq) {
                minDistSq = distSq;
                foundId = e;
                foundDx = dx;
                foundDy = dy;
            }
        }

        if (minDistSq === Infinity) {
            return [Math.max(CONFIG.WIDTH, CONFIG.HEIGHT), -1, 0, 0];
        }

        return [Math.sqrt(minDistSq), foundId, foundDx, foundDy];
    }

    getNearestNeighborDist(i) {
        const range = CONFIG.SENSOR_RANGE;
        const rangeSq = range * range;
        let minDistSq = rangeSq;
        let found = false;

        const cellX = Math.floor(this.x[i] / CONFIG.GRID_SIZE);
        const cellY = Math.floor(this.y[i] / CONFIG.GRID_SIZE);

        for (let dy = -1; dy <= 1; dy++) {
            for (let dx = -1; dx <= 1; dx++) {
                const cx = cellX + dx;
                const cy = cellY + dy;
                if (cx < 0 || cx >= this.grid.cols || cy < 0 || cy >= this.grid.rows) continue;

                const cellIndex = cy * this.grid.cols + cx;
                let neighbor = this.grid.cellStart[cellIndex];

                while (neighbor !== -1) {
                    if (neighbor !== i) {
                        const dx = this.x[i] - this.x[neighbor];
                        const dy = this.y[i] - this.y[neighbor];
                        const distSq = dx * dx + dy * dy;

                        if (distSq < minDistSq) {
                            minDistSq = distSq;
                            found = true;
                        }
                    }
                    neighbor = this.grid.cellNext[neighbor];
                }
            }
        }

        return found ? Math.sqrt(minDistSq) : range;
    }

    kill(id) {
        const last = this.count - 1;

        this.x[id] = this.x[last];
        this.y[id] = this.y[last];
        this.vx[id] = this.vx[last];
        this.vy[id] = this.vy[last];
        this.angle[id] = this.angle[last];
        this.energy[id] = this.energy[last];
        this.generation[id] = this.generation[last];

        this.color[id * 3] = this.color[last * 3];
        this.color[id * 3 + 1] = this.color[last * 3 + 1];
        this.color[id * 3 + 2] = this.color[last * 3 + 2];

        const srcStart = last * BRAIN_SIZE;
        const destStart = id * BRAIN_SIZE;
        this.brainWeights.set(this.brainWeights.subarray(srcStart, srcStart + BRAIN_SIZE), destStart);

        this.count--;
    }

    evolve() {
        const indices = new Int32Array(this.count);
        for (let i = 0; i < this.count; i++) indices[i] = i;

        indices.sort((a, b) => this.energy[b] - this.energy[a]);

        const survivorCount = Math.floor(this.count / 2);
        if (survivorCount === 0) {
            console.log("Extinction! Respawning...");
            this.count = 0;
            for (let i = 0; i < this.capacity; i++) {
                this.spawn(Math.random() * CONFIG.WIDTH, Math.random() * CONFIG.HEIGHT);
            }
            return;
        }

        const bestBrains = new Float32Array(survivorCount * BRAIN_SIZE);

        for (let i = 0; i < survivorCount; i++) {
            const oldIdx = indices[i];
            const start = oldIdx * BRAIN_SIZE;
            const end = start + BRAIN_SIZE;
            bestBrains.set(this.brainWeights.subarray(start, end), i * BRAIN_SIZE);
        }

        this.count = 0;

        for (let i = 0; i < this.capacity; i++) {
            const parentIdx = i % survivorCount;

            this.spawn(Math.random() * CONFIG.WIDTH, Math.random() * CONFIG.HEIGHT);
            const newId = this.count - 1;

            const srcStart = parentIdx * BRAIN_SIZE;
            const destStart = newId * BRAIN_SIZE;

            this.brainWeights.set(bestBrains.subarray(srcStart, srcStart + BRAIN_SIZE), destStart);

            if (i >= survivorCount) {
                NeuralNetwork.mutate(this.brainWeights, destStart, CONFIG.MUTATION_RATE);
                this.color[newId * 3] += (Math.random() - 0.5) * 50;
                this.color[newId * 3 + 1] += (Math.random() - 0.5) * 50;
            } else {
                this.color[newId * 3] = 0;
                this.color[newId * 3 + 1] = 255;
                this.color[newId * 3 + 2] = 0;
            }

            this.generation[newId]++;
        }

        console.log(`Evolved! Survivors: ${survivorCount}. New Generation.`);
    }

    getRenderData() {
        return {
            count: this.count,
            x: this.x,
            y: this.y,
            color: this.color,
            foodCount: this.foodCount,
            foodX: this.foodX,
            foodY: this.foodY,
            enemyCount: this.enemyCount,
            enemyX: this.enemyX,
            enemyY: this.enemyY,
            generation: this.generation[0], // Just for UI
            currentPattern: this.currentPattern,
            epochTimer: this.epochTimer
        };
    }
}
