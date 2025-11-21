import { World } from './world.js?v=5';
import { CONFIG } from './constants.js?v=5';

let world;

self.onmessage = function (e) {
  const { type, payload } = e.data;

  switch (type) {
    case 'init':
      console.log("Worker: Init received", payload);
      // Override CONFIG with payload if provided (e.g. canvas size)
      if (payload.width) CONFIG.WIDTH = payload.width;
      if (payload.height) CONFIG.HEIGHT = payload.height;

      console.log("Worker: Creating World with Agent Count:", CONFIG.AGENT_COUNT);
      world = new World();

      // Spawn agents
      console.log("Worker: Spawning agents...");
      for (let i = 0; i < CONFIG.AGENT_COUNT; i++) {
        world.spawn(Math.random() * CONFIG.WIDTH, Math.random() * CONFIG.HEIGHT);
      }
      console.log("Worker: Spawned", world.count, "agents");

      self.postMessage({ type: 'ready' });
      break;

    case 'step':
      if (!world) return;
      const dt = payload;
      world.update(dt);

      // Send data back for rendering
      // We rely on structured clone (copy) which is fast enough for < 1MB
      const renderData = world.getRenderData();
      self.postMessage({ type: 'render', payload: renderData });
      break;

    case 'resize':
      if (payload.width) CONFIG.WIDTH = payload.width;
      if (payload.height) CONFIG.HEIGHT = payload.height;
      // Note: In a real app we might need to resize grid/spatial hash here
      break;
  }
};
