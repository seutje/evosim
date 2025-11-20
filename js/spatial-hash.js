export class SpatialHash {
    constructor(width, height, cellSize, capacity) {
        this.cellSize = cellSize;
        this.cols = Math.ceil(width / cellSize);
        this.rows = Math.ceil(height / cellSize);
        this.numCells = this.cols * this.rows;

        // cellStart[cellIndex] holds the index of the first agent in this cell
        // Initialize with -1 (empty)
        this.cellStart = new Int32Array(this.numCells).fill(-1);

        // cellNext[agentIndex] holds the index of the next agent in the same cell
        this.cellNext = new Int32Array(capacity);
    }

    clear() {
        this.cellStart.fill(-1);
    }

    add(agentIndex, x, y) {
        const col = Math.floor(x / this.cellSize);
        const row = Math.floor(y / this.cellSize);

        // Clamp to grid boundaries to handle edge cases
        const safeCol = Math.max(0, Math.min(this.cols - 1, col));
        const safeRow = Math.max(0, Math.min(this.rows - 1, row));

        const cellIndex = safeRow * this.cols + safeCol;

        // Insert at head of linked list for this cell
        this.cellNext[agentIndex] = this.cellStart[cellIndex];
        this.cellStart[cellIndex] = agentIndex;
    }

    // Helper to get cell index from coordinates
    getCellIndex(x, y) {
        const col = Math.floor(x / this.cellSize);
        const row = Math.floor(y / this.cellSize);
        if (col < 0 || col >= this.cols || row < 0 || row >= this.rows) return -1;
        return row * this.cols + col;
    }
}
