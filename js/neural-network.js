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

        // --- Layer 1: Input -> Hidden ---
        // We'll use a small static buffer for hidden outputs to avoid allocation
        // Note: In a threaded env this would be bad, but JS is single threaded.
        if (!this.hiddenBuffer) this.hiddenBuffer = new Float32Array(CONFIG.HIDDEN_NEURONS);
        if (!this.outputBuffer) this.outputBuffer = new Float32Array(CONFIG.OUTPUT_NEURONS);

        for (let h = 0; h < CONFIG.HIDDEN_NEURONS; h++) {
            let sum = 0;
            // Weights
            for (let i = 0; i < CONFIG.INPUT_NEURONS; i++) {
                sum += inputs[i] * weights[wIdx++];
            }
            // Bias
            sum += weights[wIdx++];

            // Activation (Tanh)
            this.hiddenBuffer[h] = Math.tanh(sum);
        }

        // --- Layer 2: Hidden -> Output ---
        for (let o = 0; o < CONFIG.OUTPUT_NEURONS; o++) {
            let sum = 0;
            // Weights
            for (let h = 0; h < CONFIG.HIDDEN_NEURONS; h++) {
                sum += this.hiddenBuffer[h] * weights[wIdx++];
            }
            // Bias
            sum += weights[wIdx++];

            // Activation (Tanh for output too, gives -1 to 1 range)
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
