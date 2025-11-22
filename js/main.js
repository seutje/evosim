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
        depth: CONFIG.DEPTH,
        agentCount: CONFIG.AGENT_COUNT
    }
});

// UI Refs
const uiCount = document.getElementById('count');
const uiFps = document.getElementById('fps');
const uiGen = document.getElementById('gen');
const uiStatus = document.getElementById('status');
const uiTimer = document.getElementById('timer');
const uiAvgEnergy = document.getElementById('avgEnergy');
const uiMaxEnergy = document.getElementById('maxEnergy');

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

    // Camera Controls are event-driven, not per-frame


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

            uiAvgEnergy.innerText = latestData.avgEnergy.toFixed(1);
            uiMaxEnergy.innerText = latestData.maxEnergy.toFixed(1);
        }
    }

    requestAnimationFrame(loop);
}

window.addEventListener('resize', () => {
    renderer.resize(window.innerWidth, window.innerHeight);
    // Update CONFIG in main thread (optional, mostly for initial setup)
    CONFIG.WIDTH = window.innerWidth * 5;
    CONFIG.HEIGHT = window.innerHeight * 5;
    CONFIG.DEPTH = window.innerHeight * 5;

    // Notify worker
    worker.postMessage({
        type: 'resize',
        payload: {
            width: CONFIG.WIDTH,
            height: CONFIG.HEIGHT,
            depth: CONFIG.DEPTH
        }
    });
});

// Mouse Interaction State
let isDragging = false;
let lastMouseX = 0;
let lastMouseY = 0;
let dragButton = -1; // 0: Left, 1: Middle, 2: Right

canvas.addEventListener('mousedown', (e) => {
    isDragging = true;
    lastMouseX = e.clientX;
    lastMouseY = e.clientY;
    dragButton = e.button;
    e.preventDefault(); // Prevent selection
});

window.addEventListener('mouseup', () => {
    isDragging = false;
    dragButton = -1;
});

canvas.addEventListener('mousemove', (e) => {
    if (isDragging) {
        const dx = e.clientX - lastMouseX;
        const dy = e.clientY - lastMouseY;
        lastMouseX = e.clientX;
        lastMouseY = e.clientY;

        if (dragButton === 0) {
            // Left Click: Rotate
            renderer.updateCamera(0, -dx, -dy, 0, 0);
        } else if (dragButton === 1 || dragButton === 2) {
            // Middle/Right Click: Pan
            renderer.updateCamera(0, 0, 0, dx, dy);
        }
    }
});

canvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    renderer.updateCamera(e.deltaY, 0, 0, 0, 0);
}, { passive: false });


