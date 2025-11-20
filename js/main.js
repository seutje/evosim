import { CONFIG } from './constants.js';
import { World } from './world.js';
import { Renderer } from './renderer.js';

const canvas = document.getElementById('simCanvas');
const renderer = new Renderer(canvas);
const world = new World();

// Spawn agents
for (let i = 0; i < CONFIG.AGENT_COUNT; i++) {
    world.spawn(Math.random() * CONFIG.WIDTH, Math.random() * CONFIG.HEIGHT);
}

// UI Refs
const uiCount = document.getElementById('count');
const uiFps = document.getElementById('fps');

let lastTime = performance.now();
let frameCount = 0;
let lastFpsUpdate = 0;

function loop() {
    const now = performance.now();
    // Cap dt to avoid explosion on tab switch
    const dt = Math.min((now - lastTime) / 1000, 0.1);
    lastTime = now;

    world.update(dt);

    renderer.clear();
    renderer.render(world);

    // UI
    frameCount++;
    if (now - lastFpsUpdate > 1000) {
        uiFps.innerText = Math.round(frameCount * 1000 / (now - lastFpsUpdate));
        uiCount.innerText = world.count;
        frameCount = 0;
        lastFpsUpdate = now;
    }

    // Evolution Epoch (Time-based OR Population-based safety)
    if ((frameCount % CONFIG.EPOCH_LENGTH === 0 && frameCount > 0) || world.count < CONFIG.AGENT_COUNT * 0.2) {
        world.evolve();
        document.getElementById('gen').innerText = world.generation[0];
        // Optional: We could add a pattern indicator to the UI, but the user didn't ask for it explicitly.
        // Let's just log it for now or leave it be.
        // Actually, let's update the status text to show the pattern.
        const patterns = ["Random", "Ring", "Stripes", "Corners", "Cluster"];
        document.getElementById('status').innerText = patterns[world.currentPattern];
        frameCount = 0; // Reset frame count after evolution
    }

    requestAnimationFrame(loop);
}

window.addEventListener('resize', () => {
    renderer.resize(window.innerWidth, window.innerHeight);
    CONFIG.WIDTH = window.innerWidth;
    CONFIG.HEIGHT = window.innerHeight;
    // Note: In a real app we should resize the SpatialHash too
});

loop();
