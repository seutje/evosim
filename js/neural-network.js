import { CONFIG, BRAIN_SIZE } from './constants.js';

export class NeuralNetwork {
    /**
     * Forward pass of the MLP.
     * Architecture: Input -> Tanh -> Hidden -> Tanh -> Output
     * 
     * @param {Float32Array} inputs - Array of input values
     * @param {Float32Array} weights - Giant array of all weights
     * @param {number} offset - Start index for this agent's weights
     * @returns {Float32Array} - Output values (reused static buffer to avoid GC)
     */
    static compute(inputs, weights, offset) {
        let wIdx = offset;

        // Buffers
        if (!this.hiddenBuffer1) this.hiddenBuffer1 = new Float32Array(CONFIG.HIDDEN_NEURONS);
        if (!this.hiddenBuffer2) this.hiddenBuffer2 = new Float32Array(CONFIG.HIDDEN_NEURONS);
        if (!this.outputBuffer) this.outputBuffer = new Float32Array(CONFIG.OUTPUT_NEURONS);

        // --- Layer 1: Input -> Hidden 1 ---
        for (let h = 0; h < CONFIG.HIDDEN_NEURONS; h++) {
            let sum = 0;
            // Weights
            for (let i = 0; i < CONFIG.INPUT_NEURONS; i++) {
                sum += inputs[i] * weights[wIdx++];
            }
            // Bias
            sum += weights[wIdx++];
            // Activation (Tanh)
            this.hiddenBuffer1[h] = Math.tanh(sum);
        }

        // --- Layer 2: Hidden 1 -> Hidden 2 ---
        for (let h2 = 0; h2 < CONFIG.HIDDEN_NEURONS; h2++) {
            let sum = 0;
            // Weights
            for (let h1 = 0; h1 < CONFIG.HIDDEN_NEURONS; h1++) {
                sum += this.hiddenBuffer1[h1] * weights[wIdx++];
            }
            // Bias
            sum += weights[wIdx++];
            // Activation (Tanh)
            this.hiddenBuffer2[h2] = Math.tanh(sum);
        }

        // --- Layer 3: Hidden 2 -> Output ---
        for (let o = 0; o < CONFIG.OUTPUT_NEURONS; o++) {
            let sum = 0;
            // Weights
            for (let h2 = 0; h2 < CONFIG.HIDDEN_NEURONS; h2++) {
                sum += this.hiddenBuffer2[h2] * weights[wIdx++];
            }
            // Bias
            sum += weights[wIdx++];

            // Activation (Tanh)
            this.outputBuffer[o] = Math.tanh(sum);
        }

        return this.outputBuffer;
    }

    static mutate(weights, offset, rate) {
        for (let i = 0; i < BRAIN_SIZE; i++) {
            if (Math.random() < rate) {
                weights[offset + i] += (Math.random() - 0.5) * 0.5;

                // Clamp weights to prevent explosion
                if (weights[offset + i] > 4) weights[offset + i] = 4;
                if (weights[offset + i] < -4) weights[offset + i] = -4;
            }
        }
    }
}
