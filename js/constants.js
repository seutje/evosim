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
    DEPTH: (typeof window !== 'undefined' ? window.innerHeight : 1080) * 5, // Make it a cube
    EPOCH_LENGTH: 30,

    // Environment
    MAX_FOOD: 10000,
    FOOD_COUNT: 4000,
    FOOD_ENERGY: 50,
    FOOD_SIZE: 8,

    // Enemies
    ENEMY_RATIO: 1000, // 1 enemy per 1000 agents
    ENEMY_SPEED: 3.0,
    ENEMY_SIZE: 50,

    // Neural Network Topology
    // Inputs: [NeighborDist, FoodDist, FoodYaw, FoodPitch, Energy, EnemyDist, EnemyYaw, EnemyPitch]
    INPUT_NEURONS: 8,
    HIDDEN_NEURONS: 8,
    OUTPUT_NEURONS: 3, // [YawForce, PitchForce, SpeedForce]
};

export const BRAIN_SIZE =
    (CONFIG.INPUT_NEURONS * CONFIG.HIDDEN_NEURONS) + // Input -> Hidden1 Weights
    CONFIG.HIDDEN_NEURONS +                           // Hidden1 Biases
    (CONFIG.HIDDEN_NEURONS * CONFIG.HIDDEN_NEURONS) + // Hidden1 -> Hidden2 Weights
    CONFIG.HIDDEN_NEURONS +                           // Hidden2 Biases
    (CONFIG.HIDDEN_NEURONS * CONFIG.OUTPUT_NEURONS) + // Hidden2 -> Output Weights
    CONFIG.OUTPUT_NEURONS;                            // Output Biases
