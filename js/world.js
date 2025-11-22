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
        this.z = new Float32Array(this.capacity);
        this.vx = new Float32Array(this.capacity);
        this.vy = new Float32Array(this.capacity);
        this.vz = new Float32Array(this.capacity);
        this.angle = new Float32Array(this.capacity); // Yaw
        this.angleV = new Float32Array(this.capacity); // Pitch

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
        this.foodGrid = new SpatialHash(CONFIG.WIDTH, CONFIG.HEIGHT, CONFIG.GRID_SIZE, CONFIG.MAX_FOOD);

        // --- ENVIRONMENT (FOOD) ---
        this.foodCount = CONFIG.FOOD_COUNT;
        this.foodX = new Float32Array(CONFIG.MAX_FOOD);
        this.foodY = new Float32Array(CONFIG.MAX_FOOD);
        this.foodZ = new Float32Array(CONFIG.MAX_FOOD);

        // --- ENEMIES ---
        this.enemyCount = Math.floor(this.capacity / CONFIG.ENEMY_RATIO);
        this.enemyX = new Float32Array(this.enemyCount);
        this.enemyY = new Float32Array(this.enemyCount);
        this.enemyZ = new Float32Array(this.enemyCount);
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
            const [fx, fy, fz] = this.getPatternPosition();
            this.foodX[i] = fx;
            this.foodY[i] = fy;
            this.foodZ[i] = fz;
        }
    }

    getPatternPosition() {
        const w = CONFIG.WIDTH;
        const h = CONFIG.HEIGHT;
        const d = CONFIG.DEPTH;
        let x, y, z;

        switch (this.currentPattern) {
            case 0: { // 3D Star (Spikes)
                const arms = 14; // More arms for 3D
                // Pick a random direction on a sphere, but quantized to arms?
                // Or just random spikes?
                // Let's do random spikes.
                const spikeIdx = Math.floor(Math.random() * arms);
                // Fibonacci sphere for even distribution of spikes?
                // Or just random angles?
                // Let's use spherical coordinates.
                const phi = Math.acos(1 - 2 * (spikeIdx + 0.5) / arms);
                const theta = Math.PI * (1 + Math.sqrt(5)) * (spikeIdx + 0.5);

                const dist = Math.random() * (Math.min(w, h, d) * 0.45);
                const spread = 0.15; // Thickness

                // Perturb angle slightly
                const pPhi = phi + (Math.random() * spread - spread / 2);
                const pTheta = theta + (Math.random() * spread - spread / 2);

                x = w / 2 + dist * Math.sin(pPhi) * Math.cos(pTheta);
                y = h / 2 + dist * Math.sin(pPhi) * Math.sin(pTheta);
                z = d / 2 + dist * Math.cos(pPhi);
                break;
            }

            case 1: { // Sphere Shell
                // Random point on sphere surface
                const u = Math.random();
                const v = Math.random();
                const theta = 2 * Math.PI * u;
                const phi = Math.acos(2 * v - 1);

                const r = Math.min(w, h, d) * 0.3 + (Math.random() * 120);

                x = w / 2 + r * Math.sin(phi) * Math.cos(theta);
                y = h / 2 + r * Math.sin(phi) * Math.sin(theta);
                z = d / 2 + r * Math.cos(phi);
                break;
            }

            case 2: // Layers (Planes)
                const layer = Math.floor(Math.random() * 3); // 0, 1, 2
                const lz = (d / 4) * (layer + 1) + (Math.random() * 100 - 50);
                x = Math.random() * w;
                y = Math.random() * h;
                z = lz;
                break;

            case 3: // Cube Corners
                const corner = Math.floor(Math.random() * 8);
                // corner is 0..7. Binary: 000 to 111
                let cx = (corner & 1) ? w * 0.85 : w * 0.15;
                let cy = (corner & 2) ? h * 0.85 : h * 0.15;
                let cz = (corner & 4) ? d * 0.85 : d * 0.15;

                x = cx + (Math.random() * 300 - 150);
                y = cy + (Math.random() * 300 - 150);
                z = cz + (Math.random() * 300 - 150);
                break;

            case 4: // Center Cluster (Sphere Volume)
                // Rejection sampling for uniform sphere volume or just gaussian
                // Gaussian is easier for "Cluster"
                // Box-Muller transform
                const u1 = Math.random();
                const u2 = Math.random();
                const randStdNormal = Math.sqrt(-2.0 * Math.log(u1)) * Math.sin(2.0 * Math.PI * u2);
                // ... simplified:
                x = w / 2 + (Math.random() - 0.5) * 900;
                y = h / 2 + (Math.random() - 0.5) * 900;
                z = d / 2 + (Math.random() - 0.5) * 900;
                break;

            case 5: { // 3D Helix
                const maxR = Math.min(w, h) * 0.4;
                const t = Math.random(); // 0 to 1 along helix
                const height = d * 0.8;
                const zPos = d * 0.1 + t * height;

                const loops = 3;
                const angle = t * Math.PI * 2 * loops;
                const r = maxR * (0.5 + 0.5 * Math.sin(t * Math.PI)); // Vary radius? Or constant?
                // Let's do constant radius + noise
                const rFinal = maxR * 0.8 + (Math.random() * 50);

                x = w / 2 + Math.cos(angle) * rFinal;
                y = h / 2 + Math.sin(angle) * rFinal;
                z = zPos;
                break;
            }

            default:
                x = Math.random() * w;
                y = Math.random() * h;
                z = Math.random() * d;
                break;
        }

        // Constrain to viewport with margin
        const margin = 50;
        x = Math.max(margin, Math.min(x, w - margin));
        y = Math.max(margin, Math.min(y, h - margin));
        z = Math.max(margin, Math.min(z, d - margin));

        return [x, y, z];
    }

    spawnEnemies() {
        for (let i = 0; i < this.enemyCount; i++) {
            this.enemyX[i] = Math.random() * CONFIG.WIDTH;
            this.enemyY[i] = Math.random() * CONFIG.HEIGHT;
            this.enemyZ[i] = Math.random() * CONFIG.DEPTH;
        }
    }

    spawnFood(x, y, z) {
        let id;
        if (this.foodCount < CONFIG.MAX_FOOD) {
            id = this.foodCount++;
        } else {
            id = Math.floor(Math.random() * CONFIG.MAX_FOOD);
        }
        this.foodX[id] = x;
        this.foodY[id] = y;
        this.foodZ[id] = z;
    }

    spawnFoodCluster(x, y, z, count, radius) {
        for (let i = 0; i < count; i++) {
            // Random point in sphere
            const u = Math.random();
            const v = Math.random();
            const theta = 2 * Math.PI * u;
            const phi = Math.acos(2 * v - 1);
            const r = Math.cbrt(Math.random()) * radius; // cbrt for uniform volume

            const fx = x + r * Math.sin(phi) * Math.cos(theta);
            const fy = y + r * Math.sin(phi) * Math.sin(theta);
            const fz = z + r * Math.cos(phi);

            // Boundary checks
            const clampedX = Math.max(0, Math.min(fx, CONFIG.WIDTH));
            const clampedY = Math.max(0, Math.min(fy, CONFIG.HEIGHT));
            const clampedZ = Math.max(0, Math.min(fz, CONFIG.DEPTH));
            this.spawnFood(clampedX, clampedY, clampedZ);
        }
    }

    spawn(x, y) {
        if (this.count >= this.capacity) return;
        const id = this.count++;

        this.x[id] = x;
        this.y[id] = y;
        this.z[id] = Math.random() * CONFIG.DEPTH;

        const a = Math.random() * Math.PI * 2;
        const av = (Math.random() - 0.5) * Math.PI; // Pitch: -PI/2 to PI/2
        const speed = 4 + Math.random() * 4;

        // Spherical to Cartesian velocity
        // vx = speed * cos(pitch) * cos(yaw)
        // vy = speed * cos(pitch) * sin(yaw)
        // vz = speed * sin(pitch)

        const cosPitch = Math.cos(av);
        this.vx[id] = Math.cos(a) * cosPitch * speed;
        this.vy[id] = Math.sin(a) * cosPitch * speed;
        this.vz[id] = Math.sin(av) * speed;

        this.angle[id] = a;
        this.angleV[id] = av;

        this.energy[id] = 100;

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
            for (let a = 0; a < this.count; a++) {
                const dx = this.x[a] - this.enemyX[i];
                const dy = this.y[a] - this.enemyY[i];
                const dz = this.z[a] - this.enemyZ[i];
                const dSq = dx * dx + dy * dy + dz * dz;
                if (dSq < minDistSq) {
                    minDistSq = dSq;
                    targetId = a;
                }
            }

            if (targetId !== -1) {
                const dx = this.x[targetId] - this.enemyX[i];
                const dy = this.y[targetId] - this.enemyY[i];
                const dz = this.z[targetId] - this.enemyZ[i];
                const dist = Math.sqrt(minDistSq);

                if (dist > 0) {
                    this.enemyX[i] += (dx / dist) * CONFIG.ENEMY_SPEED;
                    this.enemyY[i] += (dy / dist) * CONFIG.ENEMY_SPEED;
                    this.enemyZ[i] += (dz / dist) * CONFIG.ENEMY_SPEED;
                }

                // Kill Agent?
                if (dist < CONFIG.ENEMY_SIZE + (CONFIG.AGENT_SIZE / 2)) {
                    this.kill(targetId);
                }
            }
        }

        // 2. Update Agents
        for (let i = 0; i < this.count; i++) {
            // --- SENSORY INPUT ---
            const nearestNeighborDist = this.getNearestNeighborDist(i);
            const [nearestFoodDist, nearestFoodId, foodDx, foodDy, foodDz] = this.getNearestFood(i);

            // Calculate Angle to Food (Yaw and Pitch)
            let yawToFood = 0;
            let pitchToFood = 0;
            if (nearestFoodId !== -1) {
                // Yaw
                const absoluteYaw = Math.atan2(foodDy, foodDx);
                let relativeYaw = absoluteYaw - this.angle[i];
                while (relativeYaw > Math.PI) relativeYaw -= Math.PI * 2;
                while (relativeYaw < -Math.PI) relativeYaw += Math.PI * 2;
                yawToFood = relativeYaw / Math.PI;

                // Pitch
                const distH = Math.sqrt(foodDx * foodDx + foodDy * foodDy);
                const absolutePitch = Math.atan2(foodDz, distH);
                let relativePitch = absolutePitch - this.angleV[i];
                while (relativePitch > Math.PI) relativePitch -= Math.PI * 2;
                while (relativePitch < -Math.PI) relativePitch += Math.PI * 2;
                pitchToFood = relativePitch / (Math.PI / 2); // Normalize
            }

            this.inputBuffer[0] = nearestNeighborDist / CONFIG.SENSOR_RANGE;
            const maxDist = Math.max(CONFIG.WIDTH, CONFIG.HEIGHT, CONFIG.DEPTH) * 1.5;
            this.inputBuffer[1] = nearestFoodDist / maxDist;
            this.inputBuffer[2] = yawToFood;
            this.inputBuffer[3] = pitchToFood;
            this.inputBuffer[4] = this.energy[i] / 100;

            const [nearestEnemyDist, nearestEnemyId, enemyDx, enemyDy, enemyDz] = this.getNearestEnemy(i);

            let yawToEnemy = 0;
            let pitchToEnemy = 0;
            if (nearestEnemyId !== -1) {
                const absoluteYaw = Math.atan2(enemyDy, enemyDx);
                let relativeYaw = absoluteYaw - this.angle[i];
                while (relativeYaw > Math.PI) relativeYaw -= Math.PI * 2;
                while (relativeYaw < -Math.PI) relativeYaw += Math.PI * 2;
                yawToEnemy = relativeYaw / Math.PI;

                const distH = Math.sqrt(enemyDx * enemyDx + enemyDy * enemyDy);
                const absolutePitch = Math.atan2(enemyDz, distH);
                let relativePitch = absolutePitch - this.angleV[i];
                while (relativePitch > Math.PI) relativePitch -= Math.PI * 2;
                while (relativePitch < -Math.PI) relativePitch += Math.PI * 2;
                pitchToEnemy = relativePitch / (Math.PI / 2);
            }

            this.inputBuffer[5] = nearestEnemyDist / maxDist;
            this.inputBuffer[6] = yawToEnemy;
            this.inputBuffer[7] = pitchToEnemy;

            // --- NEURAL NETWORK ---
            const outputs = NeuralNetwork.compute(this.inputBuffer, this.brainWeights, i * BRAIN_SIZE);

            const yawForce = outputs[0];
            const pitchForce = outputs[1];
            const speedForce = outputs[2];

            // --- PHYSICS ---
            this.angle[i] += yawForce * 0.2;
            this.angleV[i] += pitchForce * 0.2;
            // Clamp pitch to avoid gimbal lock issues or just weird behavior
            this.angleV[i] = Math.max(-Math.PI / 2 + 0.1, Math.min(Math.PI / 2 - 0.1, this.angleV[i]));

            const speed = 4 + speedForce * 2;

            const cosPitch = Math.cos(this.angleV[i]);
            this.vx[i] = Math.cos(this.angle[i]) * cosPitch * speed;
            this.vy[i] = Math.sin(this.angle[i]) * cosPitch * speed;
            this.vz[i] = Math.sin(this.angleV[i]) * speed;

            this.x[i] += this.vx[i];
            this.y[i] += this.vy[i];
            this.z[i] += this.vz[i];

            // --- INTERACTIONS ---
            // Eat Food?
            if (nearestFoodDist < CONFIG.FOOD_SIZE + CONFIG.AGENT_SIZE && nearestFoodId !== -1) {
                this.energy[i] += CONFIG.FOOD_ENERGY;
                if (this.energy[i] > 100) this.energy[i] = 100;

                // Respawn Food
                const [fx, fy, fz] = this.getPatternPosition();
                this.foodX[nearestFoodId] = fx;
                this.foodY[nearestFoodId] = fy;
                this.foodZ[nearestFoodId] = fz;
            }

            // Boundaries
            if (this.x[i] < 0) { this.x[i] = 0; this.vx[i] *= -1; }
            if (this.x[i] > CONFIG.WIDTH) { this.x[i] = CONFIG.WIDTH; this.vx[i] *= -1; }
            if (this.y[i] < 0) { this.y[i] = 0; this.vy[i] *= -1; }
            if (this.y[i] > CONFIG.HEIGHT) { this.y[i] = CONFIG.HEIGHT; this.vy[i] *= -1; }
            if (this.z[i] < 0) { this.z[i] = 0; this.vz[i] *= -1; }
            if (this.z[i] > CONFIG.DEPTH) { this.z[i] = CONFIG.DEPTH; this.vz[i] *= -1; }

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
        let foundDz = 0;

        const myX = this.x[i];
        const myY = this.y[i];
        const myZ = this.z[i];

        // Optimized search using SpatialHash (2D Broadphase)
        const cellX = Math.floor(myX / CONFIG.GRID_SIZE);
        const cellY = Math.floor(myY / CONFIG.GRID_SIZE);
        const searchRadius = 2;

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
                    const dz = this.foodZ[foodId] - myZ;
                    const distSq = dx * dx + dy * dy + dz * dz;

                    if (distSq < minDistSq) {
                        minDistSq = distSq;
                        foundId = foodId;
                        foundDx = dx;
                        foundDy = dy;
                        foundDz = dz;
                    }
                    foodId = this.foodGrid.cellNext[foodId];
                }
            }
        }

        // Fallback: Hybrid Search (Global Sampling)
        if (minDistSq === Infinity) {
            const sampleCount = 20;
            for (let k = 0; k < sampleCount; k++) {
                const randId = Math.floor(Math.random() * this.foodCount);
                const dx = this.foodX[randId] - myX;
                const dy = this.foodY[randId] - myY;
                const dz = this.foodZ[randId] - myZ;
                const distSq = dx * dx + dy * dy + dz * dz;

                if (distSq < minDistSq) {
                    minDistSq = distSq;
                    foundId = randId;
                    foundDx = dx;
                    foundDy = dy;
                    foundDz = dz;
                }
            }
        }

        if (minDistSq === Infinity) {
            return [Math.max(CONFIG.WIDTH, CONFIG.HEIGHT, CONFIG.DEPTH), -1, 0, 0, 0];
        }

        return [Math.sqrt(minDistSq), foundId, foundDx, foundDy, foundDz];
    }

    getNearestEnemy(i) {
        let minDistSq = Infinity;
        let foundId = -1;
        let foundDx = 0;
        let foundDy = 0;
        let foundDz = 0;

        const myX = this.x[i];
        const myY = this.y[i];
        const myZ = this.z[i];

        for (let e = 0; e < this.enemyCount; e++) {
            const dx = this.enemyX[e] - myX;
            const dy = this.enemyY[e] - myY;
            const dz = this.enemyZ[e] - myZ;
            const distSq = dx * dx + dy * dy + dz * dz;

            if (distSq < minDistSq) {
                minDistSq = distSq;
                foundId = e;
                foundDx = dx;
                foundDy = dy;
                foundDz = dz;
            }
        }

        if (minDistSq === Infinity) {
            return [Math.max(CONFIG.WIDTH, CONFIG.HEIGHT, CONFIG.DEPTH), -1, 0, 0, 0];
        }

        return [Math.sqrt(minDistSq), foundId, foundDx, foundDy, foundDz];
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
                        const dz = this.z[i] - this.z[neighbor];
                        const distSq = dx * dx + dy * dy + dz * dz;

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
        this.z[id] = this.z[last];
        this.vx[id] = this.vx[last];
        this.vy[id] = this.vy[last];
        this.vz[id] = this.vz[last];
        this.angle[id] = this.angle[last];
        this.angleV[id] = this.angleV[last];
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
            z: this.z,
            color: this.color,
            foodCount: this.foodCount,
            foodX: this.foodX,
            foodY: this.foodY,
            foodZ: this.foodZ,
            enemyCount: this.enemyCount,
            enemyX: this.enemyX,
            enemyY: this.enemyY,
            enemyZ: this.enemyZ,
            generation: this.generation[0], // Just for UI
            currentPattern: this.currentPattern,
            epochTimer: this.epochTimer
        };
    }
}
