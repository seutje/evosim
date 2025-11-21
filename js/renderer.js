import { CONFIG } from './constants.js';

export class Renderer {
    constructor(canvas) {
        this.canvas = canvas;
        this.gl = canvas.getContext('webgl', { alpha: false, antialias: false });

        if (!this.gl) {
            alert("WebGL not supported");
            return;
        }

        this.resize(window.innerWidth, window.innerHeight);
        this.initShaders();
        this.initBuffers();
    }

    resize(w, h) {
        this.width = w;
        this.height = h;
        this.canvas.width = w;
        this.canvas.height = h;
        if (this.gl) {
            this.gl.viewport(0, 0, w, h);
        }
    }

    initShaders() {
        const gl = this.gl;

        const vsSource = `
            attribute vec2 a_position;
            attribute vec3 a_color;
            attribute float a_size;
            
            uniform vec2 u_resolution;
            uniform float u_scale;
            
            varying vec3 v_color;
            
            void main() {
                // Convert position to clip space
                // Position is 0..WorldWidth, 0..WorldHeight
                // We want to map 0..WorldWidth to -1..1 ?
                // No, we want to map 0..WorldWidth to 0..CanvasWidth (scaled)
                
                // Actually, let's just map world coordinates to clip space directly.
                // World is 5x screen.
                // So 0..Width -> -1..1
                
                vec2 zeroToOne = a_position / u_resolution;
                vec2 zeroToTwo = zeroToOne * 2.0;
                vec2 clipSpace = zeroToTwo - 1.0;
                
                gl_Position = vec4(clipSpace * vec2(1, -1), 0, 1);
                gl_PointSize = a_size * u_scale;
                v_color = a_color;
            }
        `;

        const fsSource = `
            precision mediump float;
            varying vec3 v_color;
            
            void main() {
                gl_FragColor = vec4(v_color / 255.0, 1.0);
            }
        `;

        const vs = this.compileShader(gl.VERTEX_SHADER, vsSource);
        const fs = this.compileShader(gl.FRAGMENT_SHADER, fsSource);

        this.program = gl.createProgram();
        gl.attachShader(this.program, vs);
        gl.attachShader(this.program, fs);
        gl.linkProgram(this.program);

        if (!gl.getProgramParameter(this.program, gl.LINK_STATUS)) {
            console.error('Unable to initialize the shader program: ' + gl.getProgramInfoLog(this.program));
        }

        this.uResolution = gl.getUniformLocation(this.program, 'u_resolution');
        this.uScale = gl.getUniformLocation(this.program, 'u_scale');

        this.aPosition = gl.getAttribLocation(this.program, 'a_position');
        this.aColor = gl.getAttribLocation(this.program, 'a_color');
        this.aSize = gl.getAttribLocation(this.program, 'a_size');
    }

    compileShader(type, source) {
        const gl = this.gl;
        const shader = gl.createShader(type);
        gl.shaderSource(shader, source);
        gl.compileShader(shader);
        if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
            console.error('An error occurred compiling the shaders: ' + gl.getShaderInfoLog(shader));
            gl.deleteShader(shader);
            return null;
        }
        return shader;
    }

    initBuffers() {
        const gl = this.gl;

        // We'll use a single dynamic buffer for everything?
        // Or separate buffers?
        // Interleaved is best: x, y, r, g, b, size
        // But our data comes in separate arrays (SoA).
        // So separate buffers are easier to update.

        this.positionBuffer = gl.createBuffer();
        this.colorBuffer = gl.createBuffer();
        // Size is constant per type (agent, food, enemy), but we can pass it as attribute or uniform.
        // Since we batch draw, we can use a uniform for size if we draw in passes.
        // Let's draw in 3 passes: Food, Agents, Enemies.
        // Then we don't need a_size attribute, just u_size uniform.
        // Wait, my shader has a_size. Let's change it to u_size for simplicity in batching.
        // Actually, let's keep a_size and just use a constant attribute for the whole draw call?
        // No, `vertexAttrib1f` can set a constant value for an attribute.
    }

    render(data) {
        const gl = this.gl;
        gl.useProgram(this.program);

        // Clear
        gl.clearColor(0.05, 0.07, 0.09, 1.0); // #0d1117
        gl.clear(gl.COLOR_BUFFER_BIT);

        // Set Globals
        // World size is CONFIG.WIDTH/HEIGHT.
        // But we want to view the whole world scaled down.
        // CONFIG.WIDTH is window.innerWidth * 5.
        // We want to map 0..CONFIG.WIDTH to -1..1.
        gl.uniform2f(this.uResolution, CONFIG.WIDTH, CONFIG.HEIGHT);

        // Scale factor.
        // In Canvas renderer: ctx.scale(0.2, 0.2).
        // Here, our uResolution handles the mapping to clip space.
        // But gl_PointSize needs to know the screen pixel size.
        // If world coordinate is 1 unit, how many pixels is it?
        // Screen width = window.innerWidth.
        // World width = window.innerWidth * 5.
        // So 1 world unit = 0.2 screen pixels.
        gl.uniform1f(this.uScale, 0.2);

        // --- 1. Draw Food ---
        this.drawBatch(
            data.foodX,
            data.foodY,
            data.foodCount,
            126, 231, 135, // #7ee787
            CONFIG.FOOD_SIZE
        );

        // --- 2. Draw Agents ---
        // Agents have individual colors.
        this.drawAgents(data.x, data.y, data.color, data.count, CONFIG.AGENT_SIZE);

        // --- 3. Draw Enemies ---
        this.drawBatch(
            data.enemyX,
            data.enemyY,
            data.enemyCount,
            255, 68, 68, // #ff4444
            CONFIG.ENEMY_SIZE
        );
    }

    drawBatch(xArray, yArray, count, r, g, b, size) {
        const gl = this.gl;

        // Positions
        gl.bindBuffer(gl.ARRAY_BUFFER, this.positionBuffer);
        // We need to interleave x and y? Or can we use two buffers?
        // Or just update data.
        // Data comes as Float32Array x and Float32Array y.
        // We can't easily interleave without copying.
        // So we need two attributes or construct a buffer.
        // Constructing a buffer every frame is costly?
        // Copying to a pre-allocated Float32Array is fast.

        if (!this.tempPosBuffer || this.tempPosBuffer.length < count * 2) {
            this.tempPosBuffer = new Float32Array(count * 2);
        }

        for (let i = 0; i < count; i++) {
            this.tempPosBuffer[i * 2] = xArray[i];
            this.tempPosBuffer[i * 2 + 1] = yArray[i];
        }

        gl.bufferData(gl.ARRAY_BUFFER, this.tempPosBuffer.subarray(0, count * 2), gl.DYNAMIC_DRAW);
        gl.enableVertexAttribArray(this.aPosition);
        gl.vertexAttribPointer(this.aPosition, 2, gl.FLOAT, false, 0, 0);

        // Color (Constant)
        gl.disableVertexAttribArray(this.aColor);
        gl.vertexAttrib3f(this.aColor, r, g, b);

        // Size (Constant)
        gl.disableVertexAttribArray(this.aSize);
        gl.vertexAttrib1f(this.aSize, size);

        gl.drawArrays(gl.POINTS, 0, count);
    }

    drawAgents(xArray, yArray, colorArray, count, size) {
        const gl = this.gl;

        // Positions
        if (!this.tempPosBuffer || this.tempPosBuffer.length < count * 2) {
            this.tempPosBuffer = new Float32Array(count * 2);
        }
        for (let i = 0; i < count; i++) {
            this.tempPosBuffer[i * 2] = xArray[i];
            this.tempPosBuffer[i * 2 + 1] = yArray[i];
        }

        gl.bindBuffer(gl.ARRAY_BUFFER, this.positionBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, this.tempPosBuffer.subarray(0, count * 2), gl.DYNAMIC_DRAW);
        gl.enableVertexAttribArray(this.aPosition);
        gl.vertexAttribPointer(this.aPosition, 2, gl.FLOAT, false, 0, 0);

        // Colors (Per instance)
        gl.bindBuffer(gl.ARRAY_BUFFER, this.colorBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, colorArray.subarray(0, count * 3), gl.DYNAMIC_DRAW);
        gl.enableVertexAttribArray(this.aColor);
        gl.vertexAttribPointer(this.aColor, 3, gl.FLOAT, false, 0, 0);

        /*
        // Colors (Per instance)
        gl.bindBuffer(gl.ARRAY_BUFFER, this.colorBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, colorArray.subarray(0, count * 3), gl.DYNAMIC_DRAW);
        gl.enableVertexAttribArray(this.aColor);
        gl.vertexAttribPointer(this.aColor, 3, gl.FLOAT, false, 0, 0);
        */

        // Size (Constant)
        gl.disableVertexAttribArray(this.aSize);
        gl.vertexAttrib1f(this.aSize, size);

        gl.drawArrays(gl.POINTS, 0, count);
    }
}

