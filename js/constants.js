export const CONFIG = {
    AGENT_COUNT: 10000,
    AGENT_SIZE: 8,
    SENSOR_RANGE: 50,
    SENSOR_ANGLE: Math.PI / 4,
    MUTATION_RATE: 0.05,
    ELITISM_PERCENT: 0.1,
    GRID_SIZE: 50,
    WIDTH: (typeof window !== 'undefined' ? window.innerWidth : 1920) * 5,
    HEIGHT: (typeof window !== 'undefined' ? window.innerHeight : 1080) * 5,
    EPOCH_LENGTH: 30,

    // Environment
    FOOD_COUNT: 4000,
    FOOD_ENERGY: 50,
    FOOD_SIZE: 8,

    // Enemies
    ENEMY_RATIO: 1000, // 1 enemy per 1000 agents
    ENEMY_SPEED: 3.0,
    ENEMY_SIZE: 50,

    // Neural Network Topology
    // Added AngleToFood so they know WHERE to turn
    // Added NearestEnemyDist and AngleToEnemy
    INPUT_NEURONS: 6,  // [NearestNeighborDist, NearestFoodDist, AngleToFood, Energy, NearestEnemyDist, AngleToEnemy]
    HIDDEN_NEURONS: 8,
    OUTPUT_NEURONS: 2, // [TurnForce, SpeedForce]
};

export const BRAIN_SIZE =
    (CONFIG.INPUT_NEURONS * CONFIG.HIDDEN_NEURONS) + // Input -> Hidden1 Weights
    CONFIG.HIDDEN_NEURONS +                           // Hidden1 Biases
    (CONFIG.HIDDEN_NEURONS * CONFIG.HIDDEN_NEURONS) + // Hidden1 -> Hidden2 Weights
    CONFIG.HIDDEN_NEURONS +                           // Hidden2 Biases
    (CONFIG.HIDDEN_NEURONS * CONFIG.OUTPUT_NEURONS) + // Hidden2 -> Output Weights
    CONFIG.OUTPUT_NEURONS;                            // Output Biases
