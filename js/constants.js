export const CONFIG = {
    AGENT_COUNT: 2000,
    SENSOR_RANGE: 50,
    SENSOR_ANGLE: Math.PI / 4,
    MUTATION_RATE: 0.05,
    ELITISM_PERCENT: 0.1,
    GRID_SIZE: 50,
    WIDTH: window.innerWidth,
    HEIGHT: window.innerHeight,
    EPOCH_LENGTH: 600,

    // Environment
    FOOD_COUNT: 400, // Reduced from 1000 to 400 to require seeking
    FOOD_ENERGY: 50,
    FOOD_SIZE: 4,

    // Enemies
    ENEMY_RATIO: 200, // 1 enemy per 200 agents
    ENEMY_SPEED: 1.5,
    ENEMY_SIZE: 10,

    // Neural Network Topology
    // Added AngleToFood so they know WHERE to turn
    // Added NearestEnemyDist and AngleToEnemy
    INPUT_NEURONS: 6,  // [NearestNeighborDist, NearestFoodDist, AngleToFood, Energy, NearestEnemyDist, AngleToEnemy]
    HIDDEN_NEURONS: 6,
    OUTPUT_NEURONS: 2, // [TurnForce, SpeedForce]
};

export const BRAIN_SIZE =
    (CONFIG.INPUT_NEURONS * CONFIG.HIDDEN_NEURONS) +
    CONFIG.HIDDEN_NEURONS +
    (CONFIG.HIDDEN_NEURONS * CONFIG.OUTPUT_NEURONS) +
    CONFIG.OUTPUT_NEURONS;
