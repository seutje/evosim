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
        this.initBuffers();

        // Camera State
        this.camera = {
            radius: CONFIG.WIDTH * 0.6,
            theta: Math.PI / 2, // Yaw
            phi: Math.PI / 2,   // Pitch
            target: [CONFIG.WIDTH / 2, CONFIG.HEIGHT / 2, CONFIG.DEPTH / 2]
        };
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
            attribute vec3 a_position;
            attribute vec3 a_color;
            attribute float a_size;
            attribute float a_energy;
            
            uniform mat4 u_matrix;
            
            varying vec3 v_color;
            varying float v_energy;
            
            void main() {
                gl_Position = u_matrix * vec4(a_position, 1.0);
                
                // Size attenuation
                // Scale size by 1/w (perspective division)
                // 500.0 is a tweakable factor for size scaling
                // Grow slightly with energy (0 to 100)
                float energyScale = 1.0 + (a_energy / 100.0) * 0.5;
                gl_PointSize = a_size * energyScale * (500.0 / gl_Position.w);
                
                v_color = a_color;
                v_energy = a_energy;
            }
        `;

        const fsSource = `
            precision mediump float;
            varying vec3 v_color;
            varying float v_energy;
            
            void main() {
                // Round particles
                vec2 coord = gl_PointCoord - vec2(0.5);
                float dist = length(coord);
                if(dist > 0.5) discard;
                
                // Glow effect
                // High energy = whiter core, brighter
                float energyFactor = v_energy / 100.0;
                
                // Mix color with white based on energy
                vec3 finalColor = mix(v_color / 255.0, vec3(1.0, 1.0, 1.0), energyFactor * 0.5);
                
                // Soft edge for glow
                float alpha = 1.0 - smoothstep(0.3, 0.5, dist);
                // Boost alpha with energy
                alpha = clamp(alpha + energyFactor * 0.2, 0.0, 1.0);

                gl_FragColor = vec4(finalColor, alpha);
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

        this.uMatrix = gl.getUniformLocation(this.program, 'u_matrix');

        this.aPosition = gl.getAttribLocation(this.program, 'a_position');
        this.aColor = gl.getAttribLocation(this.program, 'a_color');
        this.aSize = gl.getAttribLocation(this.program, 'a_size');
        this.aEnergy = gl.getAttribLocation(this.program, 'a_energy');
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
        this.energyBuffer = gl.createBuffer();
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
        gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
        gl.enable(gl.DEPTH_TEST);
        gl.enable(gl.BLEND);
        gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

        // --- Matrix Setup ---
        const aspect = gl.canvas.clientWidth / gl.canvas.clientHeight;
        const zNear = 1;
        const zFar = 20000;
        const projectionMatrix = m4.perspective(60 * Math.PI / 180, aspect, zNear, zFar);

        // Camera Position (Spherical to Cartesian)
        const c = this.camera;
        const camX = c.target[0] + c.radius * Math.sin(c.phi) * Math.cos(c.theta);
        const camY = c.target[1] + c.radius * Math.cos(c.phi);
        const camZ = c.target[2] + c.radius * Math.sin(c.phi) * Math.sin(c.theta);

        const up = [0, 1, 0];

        const viewMatrix = m4.lookAt([camX, camY, camZ], c.target, up);
        const viewProjectionMatrix = m4.multiply(projectionMatrix, viewMatrix);

        gl.uniformMatrix4fv(this.uMatrix, false, viewProjectionMatrix);

        // --- 1. Draw Food ---
        this.drawBatch(
            data.foodX,
            data.foodY,
            data.foodZ,
            data.foodCount,
            126, 231, 135, // #7ee787
            CONFIG.FOOD_SIZE
        );

        // --- 2. Draw Agents ---
        this.drawAgents(data.x, data.y, data.z, data.color, data.energy, data.count, CONFIG.AGENT_SIZE);

        // --- 3. Draw Enemies ---
        this.drawBatch(
            data.enemyX,
            data.enemyY,
            data.enemyZ,
            data.enemyCount,
            255, 68, 68, // #ff4444
            CONFIG.ENEMY_SIZE
        );
    }

    drawBatch(xArray, yArray, zArray, count, r, g, b, size) {
        const gl = this.gl;

        // Positions
        gl.bindBuffer(gl.ARRAY_BUFFER, this.positionBuffer);

        if (!this.tempPosBuffer || this.tempPosBuffer.length < count * 3) {
            this.tempPosBuffer = new Float32Array(count * 3);
        }

        for (let i = 0; i < count; i++) {
            this.tempPosBuffer[i * 3] = xArray[i];
            this.tempPosBuffer[i * 3 + 1] = yArray[i];
            this.tempPosBuffer[i * 3 + 2] = zArray[i];
        }

        gl.bufferData(gl.ARRAY_BUFFER, this.tempPosBuffer.subarray(0, count * 3), gl.DYNAMIC_DRAW);
        gl.enableVertexAttribArray(this.aPosition);
        gl.vertexAttribPointer(this.aPosition, 3, gl.FLOAT, false, 0, 0);

        // Color (Constant)
        gl.disableVertexAttribArray(this.aColor);
        gl.vertexAttrib3f(this.aColor, r, g, b);

        // Size (Constant)
        gl.disableVertexAttribArray(this.aSize);
        gl.vertexAttrib1f(this.aSize, size);

        // Energy (Constant 0 for non-agents)
        gl.disableVertexAttribArray(this.aEnergy);
        gl.vertexAttrib1f(this.aEnergy, 0.0);

        gl.drawArrays(gl.POINTS, 0, count);
    }

    drawAgents(xArray, yArray, zArray, colorArray, energyArray, count, size) {
        const gl = this.gl;

        // Positions
        if (!this.tempPosBuffer || this.tempPosBuffer.length < count * 3) {
            this.tempPosBuffer = new Float32Array(count * 3);
        }
        for (let i = 0; i < count; i++) {
            this.tempPosBuffer[i * 3] = xArray[i];
            this.tempPosBuffer[i * 3 + 1] = yArray[i];
            this.tempPosBuffer[i * 3 + 2] = zArray[i];
        }

        gl.bindBuffer(gl.ARRAY_BUFFER, this.positionBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, this.tempPosBuffer.subarray(0, count * 3), gl.DYNAMIC_DRAW);
        gl.enableVertexAttribArray(this.aPosition);
        gl.vertexAttribPointer(this.aPosition, 3, gl.FLOAT, false, 0, 0);

        // Colors (Per instance)
        gl.bindBuffer(gl.ARRAY_BUFFER, this.colorBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, colorArray.subarray(0, count * 3), gl.DYNAMIC_DRAW);
        gl.enableVertexAttribArray(this.aColor);
        gl.vertexAttribPointer(this.aColor, 3, gl.FLOAT, false, 0, 0);

        // Energy (Per instance)
        gl.bindBuffer(gl.ARRAY_BUFFER, this.energyBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, energyArray.subarray(0, count), gl.DYNAMIC_DRAW);
        gl.enableVertexAttribArray(this.aEnergy);
        gl.vertexAttribPointer(this.aEnergy, 1, gl.FLOAT, false, 0, 0);

        // Size (Constant)
        gl.disableVertexAttribArray(this.aSize);
        gl.vertexAttrib1f(this.aSize, size);

        gl.drawArrays(gl.POINTS, 0, count);
    }

    updateCamera(zoom, dTheta, dPhi, dPanX, dPanY) {
        const c = this.camera;

        // Zoom
        if (zoom !== 0) {
            c.radius *= (1 + zoom * 0.001);
            c.radius = Math.max(100, Math.min(c.radius, 50000));
        }

        // Rotate
        if (dTheta !== 0 || dPhi !== 0) {
            c.theta += dTheta * 0.01;
            c.phi += dPhi * 0.01;

            // Clamp phi to avoid gimbal lock
            const epsilon = 0.01;
            c.phi = Math.max(epsilon, Math.min(Math.PI - epsilon, c.phi));
        }

        // Pan
        if (dPanX !== 0 || dPanY !== 0) {
            // Calculate Right and Up vectors relative to camera
            const camX = c.radius * Math.sin(c.phi) * Math.cos(c.theta);
            const camY = c.radius * Math.cos(c.phi);
            const camZ = c.radius * Math.sin(c.phi) * Math.sin(c.theta);

            const camPos = [camX, camY, camZ]; // Relative to target
            const up = [0, 1, 0];

            // We need the view matrix vectors to pan correctly relative to view
            // Forward is -camPos (normalized)
            const forward = normalize([-camX, -camY, -camZ]);
            const right = normalize(cross(forward, up));
            const camUp = normalize(cross(right, forward));

            const panSpeed = c.radius * 0.001;

            c.target[0] -= (right[0] * dPanX + camUp[0] * dPanY) * panSpeed;
            c.target[1] -= (right[1] * dPanX + camUp[1] * dPanY) * panSpeed;
            c.target[2] -= (right[2] * dPanX + camUp[2] * dPanY) * panSpeed;
        }
    }
}

const m4 = {
    perspective: function (fieldOfViewInRadians, aspect, near, far) {
        var f = Math.tan(Math.PI * 0.5 - 0.5 * fieldOfViewInRadians);
        var rangeInv = 1.0 / (near - far);

        return [
            f / aspect, 0, 0, 0,
            0, f, 0, 0,
            0, 0, (near + far) * rangeInv, -1,
            0, 0, near * far * rangeInv * 2, 0
        ];
    },

    lookAt: function (cameraPosition, target, up) {
        var zAxis = normalize(subtractVectors(cameraPosition, target));
        var xAxis = normalize(cross(up, zAxis));
        var yAxis = normalize(cross(zAxis, xAxis));

        return [
            xAxis[0], yAxis[0], zAxis[0], 0,
            xAxis[1], yAxis[1], zAxis[1], 0,
            xAxis[2], yAxis[2], zAxis[2], 0,
            -(xAxis[0] * cameraPosition[0] + xAxis[1] * cameraPosition[1] + xAxis[2] * cameraPosition[2]),
            -(yAxis[0] * cameraPosition[0] + yAxis[1] * cameraPosition[1] + yAxis[2] * cameraPosition[2]),
            -(zAxis[0] * cameraPosition[0] + zAxis[1] * cameraPosition[1] + zAxis[2] * cameraPosition[2]),
            1
        ];
    },

    multiply: function (a, b) {
        var a00 = a[0 * 4 + 0];
        var a01 = a[0 * 4 + 1];
        var a02 = a[0 * 4 + 2];
        var a03 = a[0 * 4 + 3];
        var a10 = a[1 * 4 + 0];
        var a11 = a[1 * 4 + 1];
        var a12 = a[1 * 4 + 2];
        var a13 = a[1 * 4 + 3];
        var a20 = a[2 * 4 + 0];
        var a21 = a[2 * 4 + 1];
        var a22 = a[2 * 4 + 2];
        var a23 = a[2 * 4 + 3];
        var a30 = a[3 * 4 + 0];
        var a31 = a[3 * 4 + 1];
        var a32 = a[3 * 4 + 2];
        var a33 = a[3 * 4 + 3];
        var b00 = b[0 * 4 + 0];
        var b01 = b[0 * 4 + 1];
        var b02 = b[0 * 4 + 2];
        var b03 = b[0 * 4 + 3];
        var b10 = b[1 * 4 + 0];
        var b11 = b[1 * 4 + 1];
        var b12 = b[1 * 4 + 2];
        var b13 = b[1 * 4 + 3];
        var b20 = b[2 * 4 + 0];
        var b21 = b[2 * 4 + 1];
        var b22 = b[2 * 4 + 2];
        var b23 = b[2 * 4 + 3];
        var b30 = b[3 * 4 + 0];
        var b31 = b[3 * 4 + 1];
        var b32 = b[3 * 4 + 2];
        var b33 = b[3 * 4 + 3];
        return [
            b00 * a00 + b01 * a10 + b02 * a20 + b03 * a30,
            b00 * a01 + b01 * a11 + b02 * a21 + b03 * a31,
            b00 * a02 + b01 * a12 + b02 * a22 + b03 * a32,
            b00 * a03 + b01 * a13 + b02 * a23 + b03 * a33,
            b10 * a00 + b11 * a10 + b12 * a20 + b13 * a30,
            b10 * a01 + b11 * a11 + b12 * a21 + b13 * a31,
            b10 * a02 + b11 * a12 + b12 * a22 + b13 * a32,
            b10 * a03 + b11 * a13 + b12 * a23 + b13 * a33,
            b20 * a00 + b21 * a10 + b22 * a20 + b23 * a30,
            b20 * a01 + b21 * a11 + b22 * a21 + b23 * a31,
            b20 * a02 + b21 * a12 + b22 * a22 + b23 * a32,
            b20 * a03 + b21 * a13 + b22 * a23 + b23 * a33,
            b30 * a00 + b31 * a10 + b32 * a20 + b33 * a30,
            b30 * a01 + b31 * a11 + b32 * a21 + b33 * a31,
            b30 * a02 + b31 * a12 + b32 * a22 + b33 * a32,
            b30 * a03 + b31 * a13 + b32 * a23 + b33 * a33,
        ];
    },
};

function normalize(v) {
    var length = Math.sqrt(v[0] * v[0] + v[1] * v[1] + v[2] * v[2]);
    if (length > 0.00001) {
        return [v[0] / length, v[1] / length, v[2] / length];
    } else {
        return [0, 0, 0];
    }
}

function cross(a, b) {
    return [
        a[1] * b[2] - a[2] * b[1],
        a[2] * b[0] - a[0] * b[2],
        a[0] * b[1] - a[1] * b[0]
    ];
}

function subtractVectors(a, b) {
    return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}

