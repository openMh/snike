/**
 * ANTI-GRAVITY SNAKE
 * A modern, physics-based snake game.
 */

// --- CONFIGURATION ---
const CONFIG = {
    FPS: 60,
    INITIAL_SNAKE_SPEED: 2.5,
    SPEED_INCREMENT: 0.05,
    MAX_SPEED: 6,
    GRAVITY_FORCE: 0.08,
    STEERING_SPEED: 0.1, // Radians per frame
    SNAKE_WIDTH: 10,
    FOOD_SIZE: 12,
    GRAVITY_CHANGE_INTERVAL: 8000, // 8 seconds
    GLOW_INTENSITY: 15,
    PARTICLE_COUNT: 15,
    PRIMARY_NEON: '#00f2ff',
    ACCENT_NEON: '#ff00c8',
    SECONDARY_NEON: '#7000ff'
};

const GRAVITY_DIRECTIONS = [
    { name: 'DOWN', x: 0, y: 1, icon: '↓' },
    { name: 'UP', x: 0, y: -1, icon: '↑' },
    { name: 'LEFT', x: -1, y: 0, icon: '←' },
    { name: 'RIGHT', x: 1, y: 0, icon: '→' }
];

// --- VECTOR UTILITIES ---
class Vector {
    constructor(x, y) {
        this.x = x;
        this.y = y;
    }
    add(v) { this.x += v.x; this.y += v.y; return this; }
    mult(n) { this.x *= n; this.y *= n; return this; }
    copy() { return new Vector(this.x, this.y); }
    dist(v) { return Math.sqrt((this.x - v.x) ** 2 + (this.y - v.y) ** 2); }
}

// --- AUDIO SYSTEM ---
class AudioController {
    constructor() {
        this.ctx = null;
    }

    init() {
        if (this.ctx) return;
        this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    }

    playSound(freq, type, duration, volume = 0.1) {
        if (!this.ctx) return;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();

        osc.type = type;
        osc.frequency.setValueAtTime(freq, this.ctx.currentTime);

        gain.gain.setValueAtTime(volume, this.ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + duration);

        osc.connect(gain);
        gain.connect(this.ctx.destination);

        osc.start();
        osc.stop(this.ctx.currentTime + duration);
    }

    playEat() { this.playSound(440, 'square', 0.1, 0.05); this.playSound(880, 'square', 0.15, 0.03); }
    playCrash() { this.playSound(100, 'sawtooth', 0.5, 0.1); }
    playGravity() { this.playSound(220, 'sine', 0.3, 0.08); }
}

// --- ENTITIES ---

class Particle {
    constructor(pos, color) {
        this.pos = pos.copy();
        const angle = Math.random() * Math.PI * 2;
        const speed = Math.random() * 3 + 1;
        this.vel = new Vector(Math.cos(angle) * speed, Math.sin(angle) * speed);
        this.life = 1.0;
        this.decay = Math.random() * 0.02 + 0.02;
        this.color = color;
    }

    update() {
        this.pos.add(this.vel);
        this.life -= this.decay;
    }

    draw(ctx) {
        ctx.globalAlpha = this.life;
        ctx.fillStyle = this.color;
        ctx.shadowBlur = 10;
        ctx.shadowColor = this.color;
        ctx.beginPath();
        ctx.arc(this.pos.x, this.pos.y, 2, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1.0;
    }
}

class Food {
    constructor(width, height) {
        this.width = width;
        this.height = height;
        this.spawn();
        this.angle = 0;
    }

    spawn() {
        const padding = 50;
        this.pos = new Vector(
            padding + Math.random() * (this.width - padding * 2),
            padding + Math.random() * (this.height - padding * 2)
        );
    }

    update() {
        this.angle += 0.05;
    }

    draw(ctx) {
        const bounce = Math.sin(this.angle) * 3;
        ctx.shadowBlur = 20;
        ctx.shadowColor = CONFIG.ACCENT_NEON;
        ctx.fillStyle = CONFIG.ACCENT_NEON;
        ctx.beginPath();
        // Pulsing hexagon or diamond
        ctx.moveTo(this.pos.x, this.pos.y - CONFIG.FOOD_SIZE + bounce);
        ctx.lineTo(this.pos.x + CONFIG.FOOD_SIZE, this.pos.y + bounce);
        ctx.lineTo(this.pos.x, this.pos.y + CONFIG.FOOD_SIZE + bounce);
        ctx.lineTo(this.pos.x - CONFIG.FOOD_SIZE, this.pos.y + bounce);
        ctx.closePath();
        ctx.fill();
        ctx.shadowBlur = 0;
    }
}

class Snake {
    constructor(x, y) {
        this.pos = new Vector(x, y);
        this.angle = -Math.PI / 2;
        this.vel = new Vector(0, 0);
        this.segments = [];
        this.length = 20;
        this.speed = CONFIG.INITIAL_SNAKE_SPEED;

        // Initialize segments trailing behind the head
        for (let i = 0; i < this.length; i++) {
            this.segments.push(new Vector(x, y + i * 2));
        }
    }

    update(keys, gravity) {
        // Calculate target direction based on all 4 keys
        let dx = 0;
        let dy = 0;
        if (keys['ArrowLeft'] || keys['a']) dx -= 1;
        if (keys['ArrowRight'] || keys['d']) dx += 1;
        if (keys['ArrowUp'] || keys['w']) dy -= 1;
        if (keys['ArrowDown'] || keys['s']) dy += 1;

        // If a direction is pressed, rotate towards it
        if (dx !== 0 || dy !== 0) {
            const targetAngle = Math.atan2(dy, dx);
            let diff = targetAngle - this.angle;

            // Normalize angle difference to [-PI, PI]
            while (diff < -Math.PI) diff += Math.PI * 2;
            while (diff > Math.PI) diff -= Math.PI * 2;

            // Smoothly interpolate angle (0.15 is turn speed)
            this.angle += diff * 0.15;
        }

        // Base Forward Velocity
        this.vel.x = Math.cos(this.angle) * this.speed;
        this.vel.y = Math.sin(this.angle) * this.speed;

        // Apply Gravity influence
        this.vel.x += gravity.x * CONFIG.GRAVITY_FORCE;
        this.vel.y += gravity.y * CONFIG.GRAVITY_FORCE;

        // Update Position
        this.pos.add(this.vel);

        // Update angle based on actual velocity to make it look natural
        // Comment out if you want strict steering control
        // this.angle = Math.atan2(this.vel.y, this.vel.x);

        // Update Segments (Snake Body)
        this.segments.unshift(this.pos.copy());
        if (this.segments.length > this.length) {
            this.segments.pop();
        }
    }

    draw(ctx) {
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';

        // Glow effect
        ctx.shadowBlur = CONFIG.GLOW_INTENSITY;
        ctx.shadowColor = this.color || CONFIG.PRIMARY_NEON;

        // Draw body
        ctx.beginPath();
        ctx.strokeStyle = this.color || CONFIG.PRIMARY_NEON;
        ctx.lineWidth = CONFIG.SNAKE_WIDTH;

        ctx.moveTo(this.segments[0].x, this.segments[0].y);
        for (let i = 1; i < this.segments.length; i++) {
            ctx.lineTo(this.segments[i].x, this.segments[i].y);
        }
        ctx.stroke();

        // Draw head
        ctx.fillStyle = '#fff';
        ctx.beginPath();
        ctx.arc(this.pos.x, this.pos.y, CONFIG.SNAKE_WIDTH / 1.5, 0, Math.PI * 2);
        ctx.fill();

        ctx.shadowBlur = 0;
    }

    checkCollision(width, height) {
        // Wall collision
        if (this.pos.x < 0 || this.pos.x > width || this.pos.y < 0 || this.pos.y > height) {
            return true;
        }

        // Self collision (skip first 20 segments to allow for tight turns and initialization)
        const collisionThreshold = CONFIG.SNAKE_WIDTH * 0.8;
        for (let i = 20; i < this.segments.length; i++) {
            if (this.pos.dist(this.segments[i]) < collisionThreshold) {
                return true;
            }
        }
        return false;
    }

    grow() {
        this.length += 10;
        this.speed = Math.min(this.speed + CONFIG.SPEED_INCREMENT, CONFIG.MAX_SPEED);
    }
}

// --- GAME ENGINE ---

class Game {
    constructor() {
        this.canvas = document.getElementById('gameCanvas');
        this.ctx = this.canvas.getContext('2d');
        this.keys = {};
        this.particles = [];
        this.score = 0;
        this.highScore = localStorage.getItem('snike_highscore') || 0;
        this.userName = localStorage.getItem('snike_user') || '';
        this.snakeColor = localStorage.getItem('snike_color') || CONFIG.PRIMARY_NEON;
        this.gameTheme = localStorage.getItem('snike_theme') || 'space';
        this.gameState = 'AUTH';
        this.gravityIndex = 0;
        this.lastGravityChange = 0;
        this.mobileDirection = null;

        this.audio = new AudioController();

        // UI elements
        this.scoreEl = document.getElementById('score-value');
        this.highScoreEl = document.getElementById('high-score-value');
        this.gravityIcon = document.getElementById('gravity-icon');
        this.gravityLabel = document.getElementById('gravity-label');
        this.userDisplay = document.getElementById('user-display');

        if (this.highScoreEl) {
            this.highScoreEl.innerText = this.padScore(this.highScore);
        }

        this.setupEventListeners();

        // Initial sizing and initialization
        this.handleResize();
        this.init();
        this.loop();
    }

    setupEventListeners() {
        // Login
        document.getElementById('login-button').addEventListener('click', () => {
            const val = document.getElementById('username-input').value.trim();
            if (val) {
                this.userName = val;
                localStorage.setItem('snike_user', val);
                this.userDisplay.innerText = val;
                this.gameState = 'START';
                this.updateOverlays();
            }
        });

        // Customization
        document.getElementById('customize-button').addEventListener('click', () => {
            this.gameState = 'CUSTOMIZE';
            this.updateOverlays();
        });

        document.getElementById('in-game-settings').addEventListener('click', () => {
            if (this.gameState === 'PLAYING') {
                this.previousState = 'PAUSED';
                this.gameState = 'CUSTOMIZE';
            } else if (this.gameState === 'START' || this.gameState === 'PAUSED' || this.gameState === 'OVER') {
                this.previousState = this.gameState;
                this.gameState = 'CUSTOMIZE';
            }
            this.updateOverlays();
        });

        document.getElementById('back-to-menu').addEventListener('click', () => {
            this.gameState = this.previousState || 'START';
            this.updateOverlays();
        });

        document.querySelectorAll('#color-options .opt').forEach(opt => {
            opt.addEventListener('click', () => {
                document.querySelector('#color-options .opt.active').classList.remove('active');
                opt.classList.add('active');
                this.snakeColor = opt.dataset.color;
                localStorage.setItem('snike_color', this.snakeColor);
                if (this.snake) this.snake.color = this.snakeColor;
            });
        });

        document.querySelectorAll('#theme-options .opt').forEach(opt => {
            opt.addEventListener('click', () => {
                document.querySelector('#theme-options .opt.active').classList.remove('active');
                opt.classList.add('active');
                this.gameTheme = opt.dataset.theme;
                localStorage.setItem('snike_theme', this.gameTheme);
            });
        });

        // Mobile Buttons
        const btns = {
            'btn-up': { dx: 0, dy: -1 },
            'btn-down': { dx: 0, dy: 1 },
            'btn-left': { dx: -1, dy: 0 },
            'btn-right': { dx: 1, dy: 0 }
        };

        Object.keys(btns).forEach(id => {
            const el = document.getElementById(id);
            el.addEventListener('touchstart', (e) => {
                e.preventDefault();
                this.mobileDirection = btns[id];
            }, { passive: false });
            el.addEventListener('touchend', (e) => {
                e.preventDefault();
                this.mobileDirection = null;
            }, { passive: false });
            el.addEventListener('mousedown', () => this.mobileDirection = btns[id]);
            el.addEventListener('mouseup', () => this.mobileDirection = null);
        });

        document.getElementById('btn-flip').addEventListener('click', (e) => {
            e.preventDefault();
            this.flipGravity();
        });

        window.addEventListener('resize', () => {
            this.handleResize();
            if (this.gameState === 'START') this.init();
        });

        window.addEventListener('keydown', (e) => {
            this.keys[e.key] = true;
            this.handleInput(e.key);
        });
        window.addEventListener('keyup', (e) => this.keys[e.key] = false);

        document.getElementById('start-button').addEventListener('click', () => this.start());
        document.getElementById('restart-button').addEventListener('click', () => this.start());
        document.getElementById('resume-button').addEventListener('click', () => this.togglePause());

        if (this.userName) {
            this.userDisplay.innerText = this.userName;
            this.gameState = 'START';
            this.updateOverlays();
        }
    }

    init() {
        const w = this.logicalWidth || this.canvas.width;
        const h = this.logicalHeight || this.canvas.height;

        this.snake = new Snake(w / 2, h / 2);
        this.snake.color = this.snakeColor;
        this.food = new Food(w, h);
        this.particles = [];
        this.score = 0;
        this.gravityIndex = 0;
        this.updateGravityUI();
    }

    handleResize() {
        const container = document.getElementById('game-container');
        const dpr = window.devicePixelRatio || 1;
        this.logicalWidth = container.clientWidth;
        this.logicalHeight = container.clientHeight;

        this.canvas.width = this.logicalWidth * dpr;
        this.canvas.height = this.logicalHeight * dpr;
        this.ctx.scale(dpr, dpr);
        this.canvas.style.width = this.logicalWidth + 'px';
        this.canvas.style.height = this.logicalHeight + 'px';

        if (this.food) {
            this.food.width = this.logicalWidth;
            this.food.height = this.logicalHeight;
        }
    }

    handleInput(key) {
        if (key === ' ' && this.gameState === 'PLAYING') {
            this.flipGravity();
        }
        if (key === 'Escape') {
            this.togglePause();
        }
    }

    start() {
        console.log("Initializing mission...");
        this.audio.init();
        this.init();
        this.gameState = 'PLAYING';
        this.lastGravityChange = Date.now();
        this.startTime = Date.now(); // Invincibility period
        this.updateOverlays();
    }

    togglePause() {
        if (this.gameState === 'PLAYING') this.gameState = 'PAUSED';
        else if (this.gameState === 'PAUSED') this.gameState = 'PLAYING';
        this.updateOverlays();
    }

    flipGravity() {
        this.gravityIndex = (this.gravityIndex + 1) % GRAVITY_DIRECTIONS.length;
        this.audio.playGravity();
        this.updateGravityUI();
        this.triggerFlash();
    }

    updateGravityUI() {
        const g = GRAVITY_DIRECTIONS[this.gravityIndex];
        this.gravityIcon.innerText = g.icon;
        this.gravityLabel.innerText = `GRAVITY: ${g.name}`;

        // Rotate icon based on direction
        let rotation = 0;
        if (g.name === 'UP') rotation = 180;
        if (g.name === 'LEFT') rotation = 90;
        if (g.name === 'RIGHT') rotation = -90;
        this.gravityIcon.style.transform = `rotate(${rotation}deg)`;
    }

    triggerFlash() {
        const flash = document.getElementById('gravity-flip-flash');
        flash.classList.remove('flash-active');
        void flash.offsetWidth; // Trigger reflow
        flash.classList.add('flash-active');
    }

    updateOverlays() {
        document.getElementById('auth-screen').classList.toggle('active', this.gameState === 'AUTH');
        document.getElementById('start-screen').classList.toggle('active', this.gameState === 'START');
        document.getElementById('customize-screen').classList.toggle('active', this.gameState === 'CUSTOMIZE');
        document.getElementById('game-over-screen').classList.toggle('active', this.gameState === 'OVER');
        document.getElementById('pause-screen').classList.toggle('active', this.gameState === 'PAUSED');

        if (this.gameState === 'OVER') {
            document.getElementById('final-score').innerText = this.score;
        }
    }

    padScore(num) {
        return num.toString().padStart(3, '0');
    }

    gameOver() {
        this.gameState = 'OVER';
        this.audio.playCrash();
        if (this.score > this.highScore) {
            this.highScore = this.score;
            localStorage.setItem('snike_highscore', this.highScore);
            this.highScoreEl.innerText = this.padScore(this.highScore);
        }
        this.updateOverlays();

        // Death particles
        for (let i = 0; i < 50; i++) {
            this.particles.push(new Particle(this.snake.pos, CONFIG.PRIMARY_NEON));
        }
    }

    update() {
        if (this.gameState !== 'PLAYING' && this.gameState !== 'OVER') {
            // Even if not playing, we can still update food/particles for aesthetic
            if (this.food) this.food.update();
            this.particles.forEach(p => p.update());
            return;
        }

        if (this.gameState === 'PLAYING') {
            // Auto Gravity Change
            if (Date.now() - this.lastGravityChange > CONFIG.GRAVITY_CHANGE_INTERVAL) {
                this.flipGravity();
                this.lastGravityChange = Date.now();
            }

            const gravity = GRAVITY_DIRECTIONS[this.gravityIndex];

            // Combine Keyboard and Mobile Inputs
            const effectiveKeys = { ...this.keys };
            if (this.mobileDirection) {
                if (this.mobileDirection.dx === -1) effectiveKeys['ArrowLeft'] = true;
                if (this.mobileDirection.dx === 1) effectiveKeys['ArrowRight'] = true;
                if (this.mobileDirection.dy === -1) effectiveKeys['ArrowUp'] = true;
                if (this.mobileDirection.dy === 1) effectiveKeys['ArrowDown'] = true;
            }

            this.snake.update(effectiveKeys, gravity);

            // Check Food
            if (this.snake.pos.dist(this.food.pos) < CONFIG.FOOD_SIZE + CONFIG.SNAKE_WIDTH) {
                this.score += 10;
                this.scoreEl.innerText = this.padScore(this.score);
                this.snake.grow();
                this.audio.playEat();

                // Particles
                for (let i = 0; i < CONFIG.PARTICLE_COUNT; i++) {
                    this.particles.push(new Particle(this.food.pos, CONFIG.ACCENT_NEON));
                }
                this.food.spawn();
            }

            // Check Collision (with 1s grace period at start)
            if (Date.now() - this.startTime > 1000) {
                if (this.snake.checkCollision(this.logicalWidth, this.logicalHeight)) {
                    this.gameOver();
                }
            }

            this.food.update();

            // Update particles
            for (let i = this.particles.length - 1; i >= 0; i--) {
                this.particles[i].update();
                if (this.particles[i].life <= 0) {
                    this.particles.splice(i, 1);
                }
            }
        }
    }

    draw() {
        this.ctx.clearRect(0, 0, this.logicalWidth, this.logicalHeight);

        // Theme Backgrounds
        if (this.gameTheme === 'neon') {
            this.ctx.fillStyle = '#0a0a20';
            this.ctx.fillRect(0, 0, this.logicalWidth, this.logicalHeight);
            this.drawGrid('rgba(255, 0, 255, 0.05)');
        } else if (this.gameTheme === 'void') {
            this.ctx.fillStyle = '#000';
            this.ctx.fillRect(0, 0, this.logicalWidth, this.logicalHeight);
        } else {
            this.drawGrid('rgba(0, 242, 255, 0.03)');
        }

        if (this.gameState === 'PLAYING' || this.gameState === 'OVER' || this.gameState === 'PAUSED') {
            if (this.food) this.food.draw(this.ctx);
            if (this.snake) this.snake.draw(this.ctx);
            this.particles.forEach(p => p.draw(this.ctx));
        }
    }

    drawGrid(color = 'rgba(0, 242, 255, 0.03)') {
        this.ctx.strokeStyle = color;
        this.ctx.lineWidth = 1;
        const spacing = 50;

        for (let x = 0; x < this.logicalWidth; x += spacing) {
            this.ctx.beginPath();
            this.ctx.moveTo(x, 0);
            this.ctx.lineTo(x, this.logicalHeight);
            this.ctx.stroke();
        }
        for (let y = 0; y < this.logicalHeight; y += spacing) {
            this.ctx.beginPath();
            this.ctx.moveTo(0, y);
            this.ctx.lineTo(this.logicalWidth, y);
            this.ctx.stroke();
        }
    }

    loop() {
        this.update();
        this.draw();
        requestAnimationFrame(() => this.loop());
    }
}

// Wait for DOM to be fully loaded before starting
document.addEventListener('DOMContentLoaded', () => {
    try {
        new Game();
    } catch (e) {
        console.error("Game failed to initialize:", e);
    }
});
