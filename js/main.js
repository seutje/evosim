import { CONFIG } from './constants.js';
import { Renderer } from './renderer.js';

const canvas = document.getElementById('simCanvas');
const renderer = new Renderer(canvas);

// Initialize Worker
const worker = new Worker('js/worker.js?v=' + Date.now(), { type: 'module' });
worker.onerror = function (e) {
    console.error("Worker Error:", e.message, "at", e.filename, ":", e.lineno);
};

worker.postMessage({
    type: 'init',
    payload: {
        width: CONFIG.WIDTH,
        height: CONFIG.HEIGHT,
        agentCount: CONFIG.AGENT_COUNT
    }
});

// UI Refs
const uiCount = document.getElementById('count');
const uiFps = document.getElementById('fps');
const uiGen = document.getElementById('gen');
const uiStatus = document.getElementById('status');
const uiTimer = document.getElementById('timer');

let lastTime = performance.now();
let frameCount = 0;
let lastFpsUpdate = 0;

worker.onmessage = function (e) {
    const { type, payload } = e.data;

    if (type === 'render') {
        if (Math.random() < 0.01) console.log("Render Payload:", payload.count, payload.x ? payload.x.length : 'no x');
        renderer.render(payload);

        // Update UI from payload
        // We only update UI every second to save DOM calls, but we need data.
        // Let's store the latest data for the UI loop.
        latestData = payload;
    } else if (type === 'ready') {
        console.log("Worker ready");
        loop();
    }
};

let latestData = null;

function loop() {
    const now = performance.now();
    // Cap dt to avoid explosion on tab switch
    const dt = Math.min((now - lastTime) / 1000, 0.1);
    lastTime = now;

    // Send step to worker
    worker.postMessage({ type: 'step', payload: dt });

    // Continuous Food Spawning
    if (isMouseDown) {
        worker.postMessage({
            type: 'spawn_food',
            payload: {
                x: mouseX,
                y: mouseY,
                count: 5, // Smaller count per frame for smooth painting
                radius: 30 // Smaller radius for precision
            }
        });
    }

    // UI Updates
    frameCount++;
    if (now - lastFpsUpdate > 1000) {
        const fps = Math.round(frameCount * 1000 / (now - lastFpsUpdate));
        uiFps.innerText = fps;
        frameCount = 0;
        lastFpsUpdate = now;

        if (latestData) {
            uiCount.innerText = latestData.count;
            uiGen.innerText = latestData.generation;
            const patterns = ["Star", "Ring", "Stripes", "Corners", "Cluster", "Spiral"];
            uiStatus.innerText = patterns[latestData.currentPattern];

            const remaining = Math.max(0, Math.ceil(CONFIG.EPOCH_LENGTH - (latestData.epochTimer || 0)));
            uiTimer.innerText = isNaN(remaining) ? "Wait..." : remaining;
        }
    }

    requestAnimationFrame(loop);
}

window.addEventListener('resize', () => {
    renderer.resize(window.innerWidth, window.innerHeight);
    // Update CONFIG in main thread (optional, mostly for initial setup)
    CONFIG.WIDTH = window.innerWidth * 5;
    CONFIG.HEIGHT = window.innerHeight * 5;

    // Notify worker
    worker.postMessage({
        type: 'resize',
        payload: {
            width: CONFIG.WIDTH,
            height: CONFIG.HEIGHT
        }
    });
});

// Mouse Interaction State
let isMouseDown = false;
let mouseX = 0;
let mouseY = 0;

function updateMousePos(e) {
    const rect = canvas.getBoundingClientRect();
    mouseX = (e.clientX - rect.left) / rect.width * CONFIG.WIDTH;
    mouseY = (e.clientY - rect.top) / rect.height * CONFIG.HEIGHT;
}

canvas.addEventListener('mousedown', (e) => {
    isMouseDown = true;
    updateMousePos(e);
});

window.addEventListener('mouseup', () => {
    isMouseDown = false;
});

canvas.addEventListener('mousemove', (e) => {
    if (isMouseDown) {
        updateMousePos(e);
    }
});

// Also handle touch for mobile support (bonus)
canvas.addEventListener('touchstart', (e) => {
    isMouseDown = true;
    updateMousePos(e.touches[0]);
    e.preventDefault(); // Prevent scrolling
}, { passive: false });

window.addEventListener('touchend', () => {
    isMouseDown = false;
});

canvas.addEventListener('touchmove', (e) => {
    if (isMouseDown) {
        updateMousePos(e.touches[0]);
        e.preventDefault();
    }
}, { passive: false });

