/* ==========================================================================
   Aurora Jigsaw Studio - Game Logic Controller
   Features: Procedural Audio Synth, Canvas Piece Slicer, PointerEvent DragEngine,
             Confetti Physics, Dynamic Background Particles, Local Leaderboard
   ========================================================================== */

document.addEventListener('DOMContentLoaded', () => {
    // --- State Variables ---
    let currentDifficulty = 'easy'; // easy (3x3), medium (4x4), hard (5x5)
    let gridRows = 3;
    let gridCols = 3;
    
    let currentImageKey = 'nature'; // nature, synthwave, cyberpunk, or custom
    let customImageSrc = null;
    let activeImage = null; // HTMLImageElement
    
    let pieces = []; // Array of piece objects
    let movesCount = 0;
    let snappedCount = 0;
    let totalPieces = 9;
    
    // Timer
    let timerInterval = null;
    let secondsElapsed = 0;
    let gameStarted = false;
    let gameWon = false;

    // Board configuration
    const BOARD_WIDTH = 600;
    const BOARD_HEIGHT = 400;
    
    // Leaderboard key in localStorage
    const LEADERBOARD_KEY = 'aurora_jigsaw_leaderboard';

    // --- DOM Elements ---
    const bgCanvas = document.getElementById('bg-particles');
    const timerDisplay = document.getElementById('timer-display');
    const movesDisplay = document.getElementById('moves-display');
    const progressText = document.getElementById('progress-text');
    const progressBarFill = document.getElementById('progress-bar-fill');
    
    const btnEasy = document.getElementById('diff-easy');
    const btnMedium = document.getElementById('diff-medium');
    const btnHard = document.getElementById('diff-hard');
    
    const btnToggleMusic = document.getElementById('btn-toggle-music');
    const volumeSlider = document.getElementById('volume-slider');
    
    const imgNature = document.getElementById('img-preset-nature');
    const imgSynthwave = document.getElementById('img-preset-synthwave');
    const imgCyberpunk = document.getElementById('img-preset-cyberpunk');
    const fileUploader = document.getElementById('file-uploader');
    const dropZone = document.getElementById('drop-zone');
    
    const btnPeek = document.getElementById('btn-peek');
    const btnRestart = document.getElementById('btn-restart');
    const btnShowScores = document.getElementById('btn-show-scores');
    
    const puzzleTable = document.getElementById('puzzle-table');
    const puzzleBoard = document.getElementById('puzzle-board');
    const boardPreviewImg = document.getElementById('board-preview-img');
    const boardPlaceholder = document.getElementById('board-placeholder');
    const boardGridOverlay = document.getElementById('board-grid-overlay');
    
    // Modals
    const leaderboardModal = document.getElementById('leaderboard-modal');
    const btnCloseModal = document.getElementById('btn-close-modal');
    const leaderboardTbody = document.getElementById('leaderboard-tbody');
    const tabEasy = document.getElementById('tab-easy');
    const tabMedium = document.getElementById('tab-medium');
    const tabHard = document.getElementById('tab-hard');
    
    const victoryModal = document.getElementById('victory-modal');
    const vDifficulty = document.getElementById('v-difficulty');
    const vTime = document.getElementById('v-time');
    const vMoves = document.getElementById('v-moves');
    const playerNameInput = document.getElementById('player-name-input');
    const btnSubmitScore = document.getElementById('btn-submit-score');
    const btnVictoryClose = document.getElementById('btn-victory-close');
    const btnPlayAgain = document.getElementById('btn-play-again');
    const confettiCanvas = document.getElementById('victory-confetti');

    // --- Web Audio Synthesizer ---
    class AudioEngine {
        constructor() {
            this.ctx = null;
            this.bgmGain = null;
            this.masterGain = null;
            this.isPlayingBgm = false;
            
            // Synth scheduler parameters
            this.bgmInterval = null;
            this.chordIndex = 0;
            this.volume = 0.4;
            
            // Relaxing Lydian-inspired chord progression (in C/A minor)
            // Frequency values for oscillators
            this.chords = [
                // Cmaj7 (C3, G3, B3, E4)
                [130.81, 196.00, 246.94, 329.63],
                // Fmaj7 (F3, A3, C4, E4)
                [174.61, 220.00, 261.63, 329.63],
                // Am9 (A2, G3, C4, E4, B4)
                [110.00, 196.00, 261.63, 329.63, 493.88],
                // G6 (G2, D3, B3, E4)
                [98.00, 146.83, 246.94, 329.63]
            ];
        }

        init() {
            if (this.ctx) return;
            const AudioContextClass = window.AudioContext || window.webkitAudioContext;
            this.ctx = new AudioContextClass();
            
            this.masterGain = this.ctx.createGain();
            this.masterGain.gain.setValueAtTime(1.0, this.ctx.currentTime);
            this.masterGain.connect(this.ctx.destination);
            
            this.bgmGain = this.ctx.createGain();
            this.bgmGain.gain.setValueAtTime(this.volume, this.ctx.currentTime);
            this.bgmGain.connect(this.masterGain);
        }

        setVolume(val) {
            this.volume = val / 100;
            if (this.bgmGain && this.ctx) {
                this.bgmGain.gain.setValueAtTime(this.volume, this.ctx.currentTime);
            }
        }

        toggleBgm() {
            this.init();
            
            // Resume context if suspended (browser security autoplay policy)
            if (this.ctx.state === 'suspended') {
                this.ctx.resume();
            }

            if (this.isPlayingBgm) {
                this.stopBgm();
                btnToggleMusic.innerHTML = '<i class="fa-solid fa-play"></i>';
                btnToggleMusic.classList.remove('active');
            } else {
                this.startBgm();
                btnToggleMusic.innerHTML = '<i class="fa-solid fa-pause"></i>';
                btnToggleMusic.classList.add('active');
            }
        }

        startBgm() {
            if (this.isPlayingBgm) return;
            this.isPlayingBgm = true;
            this.chordIndex = 0;
            
            // Immediately play first chord
            this.playNextBgmChord();
            
            // Schedule chords every 6 seconds with overlap
            this.bgmInterval = setInterval(() => {
                this.playNextBgmChord();
            }, 6000);
        }

        stopBgm() {
            if (!this.isPlayingBgm) return;
            this.isPlayingBgm = false;
            clearInterval(this.bgmInterval);
        }

        playNextBgmChord() {
            if (!this.isPlayingBgm || !this.ctx) return;
            
            const chord = this.chords[this.chordIndex];
            const now = this.ctx.currentTime;
            const duration = 6.5; // Chord duration, slightly longer than schedule interval to blend
            
            chord.forEach((freq, idx) => {
                // Detune synth voice subtly for lush analog feel
                const detune = (idx % 2 === 0) ? 4 : -4; 
                
                // Main warm triangle oscillator
                const osc = this.ctx.createOscillator();
                osc.type = 'triangle';
                osc.frequency.value = freq;
                osc.detune.value = detune;
                
                // Soft sub sine oscillator for root notes to ground the BGM
                let subOsc = null;
                if (idx === 0) {
                    subOsc = this.ctx.createOscillator();
                    subOsc.type = 'sine';
                    subOsc.frequency.value = freq / 2; // Octave lower
                }
                
                // Gain node for smooth envelope fade in/out
                const gainNode = this.ctx.createGain();
                gainNode.gain.setValueAtTime(0, now);
                // Slow attack: 2 seconds
                gainNode.gain.linearRampToValueAtTime(0.12 / chord.length, now + 2.0);
                // Keep sustain
                gainNode.gain.setValueAtTime(0.12 / chord.length, now + duration - 2.5);
                // Slow decay: 2.5 seconds
                gainNode.gain.exponentialRampToValueAtTime(0.0001, now + duration);
                
                // Lowpass filter to cut out bright harshness and create deep warm ambience
                const filter = this.ctx.createBiquadFilter();
                filter.type = 'lowpass';
                filter.frequency.setValueAtTime(450 + Math.sin(now) * 50, now);
                
                osc.connect(filter);
                filter.connect(gainNode);
                gainNode.connect(this.bgmGain);
                
                osc.start(now);
                osc.stop(now + duration);
                
                if (subOsc) {
                    const subGain = this.ctx.createGain();
                    subGain.gain.setValueAtTime(0, now);
                    subGain.gain.linearRampToValueAtTime(0.08, now + 2.0);
                    subGain.gain.setValueAtTime(0.08, now + duration - 2.5);
                    subGain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
                    
                    subOsc.connect(subGain);
                    subGain.connect(this.bgmGain);
                    subOsc.start(now);
                    subOsc.stop(now + duration);
                }
            });
            
            // Advance to next chord loop
            this.chordIndex = (this.chordIndex + 1) % this.chords.length;
        }

        // --- Sound Effects ---
        playGrabSFX() {
            if (!this.ctx) return;
            this.init();
            
            const now = this.ctx.currentTime;
            const osc = this.ctx.createOscillator();
            const gainNode = this.ctx.createGain();
            
            osc.type = 'sine';
            // Pitch sweep from 750Hz down to 250Hz in 0.06 seconds
            osc.frequency.setValueAtTime(750, now);
            osc.frequency.exponentialRampToValueAtTime(250, now + 0.06);
            
            gainNode.gain.setValueAtTime(0.1, now);
            gainNode.gain.exponentialRampToValueAtTime(0.001, now + 0.06);
            
            osc.connect(gainNode);
            gainNode.connect(this.masterGain);
            
            osc.start(now);
            osc.stop(now + 0.07);
        }

        playSnapSFX() {
            if (!this.ctx) return;
            this.init();
            
            const now = this.ctx.currentTime;
            
            // Elegant crystalline glass chime
            const osc1 = this.ctx.createOscillator();
            const osc2 = this.ctx.createOscillator();
            const gainNode = this.ctx.createGain();
            
            osc1.type = 'triangle';
            osc1.frequency.setValueAtTime(1046.50, now); // C6 Note
            
            osc2.type = 'sine';
            osc2.frequency.setValueAtTime(2093.00, now); // C7 (Harmonic resonance)
            
            gainNode.gain.setValueAtTime(0, now);
            // Ultra rapid attack: 0.005s
            gainNode.gain.linearRampToValueAtTime(0.2, now + 0.005);
            // Decay & release
            gainNode.gain.exponentialRampToValueAtTime(0.001, now + 0.25);
            
            const delay = this.ctx.createDelay();
            delay.delayTime.value = 0.04;
            
            const delayGain = this.ctx.createGain();
            delayGain.gain.value = 0.3; // Echo volume
            
            osc1.connect(gainNode);
            osc2.connect(gainNode);
            gainNode.connect(this.masterGain);
            
            // Connect to delay for spatial feel
            gainNode.connect(delay);
            delay.connect(delayGain);
            delayGain.connect(this.masterGain);
            
            osc1.start(now);
            osc2.start(now);
            osc1.stop(now + 0.3);
            osc2.stop(now + 0.3);
        }

        playVictorySFX() {
            if (!this.ctx) return;
            this.init();
            
            const now = this.ctx.currentTime;
            
            // Majestic ascending Major Pentatonic chime arpeggio
            // Notes: C4(261.63), E4(329.63), G4(392.00), A4(440.00), C5(523.25), E5(659.25), G5(783.99), C6(1046.50)
            const scale = [261.63, 329.63, 392.00, 440.00, 523.25, 659.25, 783.99, 1046.50];
            const noteDuration = 0.6;
            
            scale.forEach((freq, index) => {
                const triggerTime = now + (index * 0.08); // Speed of arpeggio
                
                const osc = this.ctx.createOscillator();
                const gainNode = this.ctx.createGain();
                
                osc.type = 'triangle';
                osc.frequency.setValueAtTime(freq, triggerTime);
                
                gainNode.gain.setValueAtTime(0, triggerTime);
                gainNode.gain.linearRampToValueAtTime(0.18, triggerTime + 0.01);
                gainNode.gain.exponentialRampToValueAtTime(0.0001, triggerTime + noteDuration);
                
                // Add a cute little vibrating tremolo effect for the final chimes
                if (index >= 4) {
                    const lfo = this.ctx.createOscillator();
                    lfo.frequency.value = 8; // 8Hz modulation
                    const lfoGain = this.ctx.createGain();
                    lfoGain.gain.value = 5; // Vibrato depth
                    lfo.connect(lfoGain);
                    lfoGain.connect(osc.frequency);
                    lfo.start(triggerTime);
                    lfo.stop(triggerTime + noteDuration);
                }
                
                osc.connect(gainNode);
                gainNode.connect(this.masterGain);
                
                osc.start(triggerTime);
                osc.stop(triggerTime + noteDuration + 0.05);
            });
        }
    }

    const audio = new AudioEngine();

    // Volume Slider handler
    volumeSlider.addEventListener('input', (e) => {
        audio.setVolume(e.target.value);
    });

    btnToggleMusic.addEventListener('click', () => {
        audio.toggleBgm();
    });

    // --- Interactive Starry Background Particles ---
    class ParticleBackground {
        constructor() {
            this.canvas = bgCanvas;
            this.ctx = this.canvas.getContext('2d');
            this.particles = [];
            this.maxParticles = 55;
            
            this.mouse = { x: null, y: null, radius: 140 };
            
            window.addEventListener('resize', () => this.resize());
            window.addEventListener('pointermove', (e) => {
                this.mouse.x = e.clientX;
                this.mouse.y = e.clientY;
            });
            window.addEventListener('pointerleave', () => {
                this.mouse.x = null;
                this.mouse.y = null;
            });
            
            this.resize();
            this.init();
            this.animate();
        }

        resize() {
            this.canvas.width = window.innerWidth;
            this.canvas.height = window.innerHeight;
        }

        init() {
            this.particles = [];
            for (let i = 0; i < this.maxParticles; i++) {
                this.particles.push({
                    x: Math.random() * this.canvas.width,
                    y: Math.random() * this.canvas.height,
                    vx: (Math.random() - 0.5) * 0.4,
                    vy: (Math.random() - 0.5) * 0.4,
                    radius: Math.random() * 2 + 1,
                    alpha: Math.random() * 0.5 + 0.2
                });
            }
        }

        animate() {
            this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
            
            // Draw & Update Particles
            this.particles.forEach((p, idx) => {
                p.x += p.vx;
                p.y += p.vy;
                
                // Wrap around edges
                if (p.x < 0) p.x = this.canvas.width;
                if (p.x > this.canvas.width) p.x = 0;
                if (p.y < 0) p.y = this.canvas.height;
                if (p.y > this.canvas.height) p.y = 0;
                
                // Mouse push effect
                if (this.mouse.x !== null) {
                    const dx = p.x - this.mouse.x;
                    const dy = p.y - this.mouse.y;
                    const dist = Math.sqrt(dx * dx + dy * dy);
                    if (dist < this.mouse.radius) {
                        const force = (this.mouse.radius - dist) / this.mouse.radius;
                        p.x += (dx / dist) * force * 1.5;
                        p.y += (dy / dist) * force * 1.5;
                    }
                }
                
                // Render particle
                this.ctx.beginPath();
                this.ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
                this.ctx.fillStyle = `rgba(0, 242, 254, ${p.alpha})`;
                this.ctx.fill();
                
                // Draw connecting lines (constellations)
                for (let j = idx + 1; j < this.particles.length; j++) {
                    const p2 = this.particles[j];
                    const dx = p.x - p2.x;
                    const dy = p.y - p2.y;
                    const dist = Math.sqrt(dx * dx + dy * dy);
                    
                    if (dist < 100) {
                        const alpha = (100 - dist) / 100 * 0.15;
                        this.ctx.beginPath();
                        this.ctx.moveTo(p.x, p.y);
                        this.ctx.lineTo(p2.x, p2.y);
                        this.ctx.strokeStyle = `rgba(157, 78, 221, ${alpha})`;
                        this.ctx.lineWidth = 0.5;
                        this.ctx.stroke();
                    }
                }
            });
            
            requestAnimationFrame(() => this.animate());
        }
    }
    
    new ParticleBackground();

    // --- Puzzle Piece Path Drawing Function ---
    // Mathematically pre-calculated tabs & sockets
    function drawTab(ctx, x1, y1, x2, y2, type) {
        const dx = x2 - x1;
        const dy = y2 - y1;
        const l = Math.sqrt(dx * dx + dy * dy);
        const ux = dx / l;
        const uy = dy / l;
        
        // Perpendicular vector pointing OUTWARD relative to clockwise drawing sequence:
        // px = uy * type, py = -ux * type
        const px = uy * type;
        const py = -ux * type;
        
        // Divide edge into segments to construct clean curves for the puzzle tab
        const p1 = { x: x1 + ux * l * 0.35, y: y1 + uy * l * 0.35 };
        const p2 = { x: x1 + ux * l * 0.39 + px * l * 0.05, y: y1 + uy * l * 0.39 + py * l * 0.05 };
        const p3 = { x: x1 + ux * l * 0.32 + px * l * 0.18, y: y1 + uy * l * 0.32 + py * l * 0.18 };
        const p4 = { x: x1 + ux * l * 0.50 + px * l * 0.20, y: y1 + uy * l * 0.50 + py * l * 0.20 };
        const p5 = { x: x1 + ux * l * 0.68 + px * l * 0.18, y: y1 + uy * l * 0.68 + py * l * 0.18 };
        const p6 = { x: x1 + ux * l * 0.61 + px * l * 0.05, y: y1 + uy * l * 0.61 + py * l * 0.05 };
        const p7 = { x: x1 + ux * l * 0.65, y: y1 + uy * l * 0.65 };
        
        ctx.lineTo(p1.x, p1.y);
        ctx.bezierCurveTo(p2.x, p2.y, p3.x, p3.y, p4.x, p4.y);
        ctx.bezierCurveTo(p5.x, p5.y, p6.x, p6.y, p7.x, p7.y);
        ctx.lineTo(x2, y2);
    }

    function drawPuzzlePiecePath(ctx, x, y, w, h, top, right, bottom, left) {
        ctx.beginPath();
        ctx.moveTo(x, y);
        
        // Top edge: Left to Right
        if (top === 0) ctx.lineTo(x + w, y);
        else drawTab(ctx, x, y, x + w, y, top);
        
        // Right edge: Top to Bottom
        if (right === 0) ctx.lineTo(x + w, y + h);
        else drawTab(ctx, x + w, y, x + w, y + h, right);
        
        // Bottom edge: Right to Left
        if (bottom === 0) ctx.lineTo(x, y + h);
        else drawTab(ctx, x + w, y + h, x, y + h, bottom);
        
        // Left edge: Bottom to Top
        if (left === 0) ctx.lineTo(x, y);
        else drawTab(ctx, x, y + h, x, y, left);
        
        ctx.closePath();
    }

    // --- Game Logic Engine ---
    
    // Difficulty Settings
    const difficulties = {
        easy: { rows: 3, cols: 3, label: '簡單 (3x3)' },
        medium: { rows: 4, cols: 4, label: '中等 (4x4)' },
        hard: { rows: 5, cols: 5, label: '困難 (5x5)' }
    };

    function setDifficulty(diff) {
        currentDifficulty = diff;
        gridRows = difficulties[diff].rows;
        gridCols = difficulties[diff].cols;
        totalPieces = gridRows * gridCols;
        
        [btnEasy, btnMedium, btnHard].forEach(btn => btn.classList.remove('active'));
        document.getElementById(`diff-${diff}`).classList.add('active');
        
        initGame();
    }

    btnEasy.addEventListener('click', () => setDifficulty('easy'));
    btnMedium.addEventListener('click', () => setDifficulty('medium'));
    btnHard.addEventListener('click', () => setDifficulty('hard'));

    // Image presets
    const imagePresets = {
        nature: 'assets/images/nature.png',
        synthwave: 'assets/images/synthwave.png',
        cyberpunk: 'assets/images/cyberpunk.png'
    };

    function selectPresetImage(key) {
        currentImageKey = key;
        customImageSrc = null;
        
        [imgNature, imgSynthwave, imgCyberpunk].forEach(el => el.classList.remove('active'));
        document.getElementById(`img-preset-${key}`).classList.add('active');
        
        loadGameImage(imagePresets[key]);
    }

    imgNature.addEventListener('click', () => selectPresetImage('nature'));
    imgSynthwave.addEventListener('click', () => selectPresetImage('synthwave'));
    imgCyberpunk.addEventListener('click', () => selectPresetImage('cyberpunk'));

    // Custom File Upload
    fileUploader.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (file) {
            handleImageFile(file);
        }
    });

    // Drag and Drop files onto drop zone
    dropZone.addEventListener('dragover', (e) => {
        e.preventDefault();
        dropZone.classList.add('dragover');
    });

    dropZone.addEventListener('dragleave', () => {
        dropZone.classList.remove('dragover');
    });

    dropZone.addEventListener('drop', (e) => {
        e.preventDefault();
        dropZone.classList.remove('dragover');
        const file = e.dataTransfer.files[0];
        if (file && file.type.startsWith('image/')) {
            handleImageFile(file);
        }
    });

    function handleImageFile(file) {
        const reader = new FileReader();
        reader.onload = (event) => {
            customImageSrc = event.target.result;
            currentImageKey = 'custom';
            
            // Remove active classes from presets
            [imgNature, imgSynthwave, imgCyberpunk].forEach(el => el.classList.remove('active'));
            
            loadGameImage(customImageSrc);
        };
        reader.readAsDataURL(file);
    }

    function loadGameImage(src) {
        boardPlaceholder.style.display = 'flex';
        activeImage = new Image();
        activeImage.onload = () => {
            boardPlaceholder.style.display = 'none';
            boardPreviewImg.src = src;
            initGame();
        };
        activeImage.onerror = () => {
            boardPlaceholder.innerHTML = '<i class="fa-solid fa-triangle-exclamation"></i><p>載入圖片失敗！</p>';
        };
        activeImage.src = src;
    }

    // Timer functions
    function startTimer() {
        if (timerInterval) clearInterval(timerInterval);
        secondsElapsed = 0;
        timerDisplay.textContent = '00:00';
        
        timerInterval = setInterval(() => {
            secondsElapsed++;
            const mins = Math.floor(secondsElapsed / 60).toString().padStart(2, '0');
            const secs = (secondsElapsed % 60).toString().padStart(2, '0');
            timerDisplay.textContent = `${mins}:${secs}`;
        }, 1000);
    }

    function stopTimer() {
        if (timerInterval) {
            clearInterval(timerInterval);
            timerInterval = null;
        }
    }

    // Board outline drawing
    function renderBoardGridOverlay() {
        // Clear previous overlays
        boardGridOverlay.innerHTML = '';
        
        const cellW = BOARD_WIDTH / gridCols;
        const cellH = BOARD_HEIGHT / gridRows;
        
        // We will construct an SVG grid layout that overlays neatly on the board
        let svgContent = `<svg width="100%" height="100%" style="position:absolute; top:0; left:0; pointer-events:none;">`;
        
        // Draw grid lines
        for (let r = 1; r < gridRows; r++) {
            svgContent += `<line x1="0" y1="${r * cellH}" x2="${BOARD_WIDTH}" y2="${r * cellH}" stroke="rgba(255,255,255,0.08)" stroke-width="1" />`;
        }
        for (let c = 1; c < gridCols; c++) {
            svgContent += `<line x1="${c * cellW}" y1="0" x2="${c * cellW}" y2="${BOARD_HEIGHT}" stroke="rgba(255,255,255,0.08)" stroke-width="1" />`;
        }
        
        svgContent += `</svg>`;
        boardGridOverlay.innerHTML = svgContent;
    }

    // Core Game Initialization
    function initGame() {
        stopTimer();
        gameStarted = false;
        gameWon = false;
        secondsElapsed = 0;
        timerDisplay.textContent = '00:00';
        
        movesCount = 0;
        movesDisplay.textContent = '0';
        
        snappedCount = 0;
        progressText.textContent = '0%';
        progressBarFill.style.width = '0%';

        // Clear all previous scattered pieces
        const oldPieces = puzzleTable.querySelectorAll('.puzzle-piece');
        oldPieces.forEach(p => p.remove());
        
        renderBoardGridOverlay();
        
        if (!activeImage) return;

        // Step 1: Pre-generate all internal grid edge styles (tabs vs sockets)
        // verticalEdges[row][col-1] - column separators
        const verticalEdges = Array.from({ length: gridRows }, () => 
            Array.from({ length: gridCols - 1 }, () => Math.random() < 0.5 ? 1 : -1)
        );
        // horizontalEdges[row-1][col] - row separators
        const horizontalEdges = Array.from({ length: gridRows - 1 }, () => 
            Array.from({ length: gridCols }, () => Math.random() < 0.5 ? 1 : -1)
        );

        // Step 2: Slice and spawn individual puzzle pieces
        const cellW = BOARD_WIDTH / gridCols;
        const cellH = BOARD_HEIGHT / gridRows;

        pieces = [];

        // Define absolute coordinates of target board relative to the workspace table container
        const tableRect = puzzleTable.getBoundingClientRect();
        const boardRect = puzzleBoard.getBoundingClientRect();
        const boardLeft = boardRect.left - tableRect.left;
        const boardTop = boardRect.top - tableRect.top;

        for (let r = 0; r < gridRows; r++) {
            for (let c = 0; c < gridCols; c++) {
                // Determine edge protrudes/intrudes for this cell
                const top = (r === 0) ? 0 : -horizontalEdges[r - 1][c];
                const right = (c === gridCols - 1) ? 0 : verticalEdges[r][c];
                const bottom = (r === gridRows - 1) ? 0 : horizontalEdges[r][c];
                const left = (c === 0) ? 0 : -verticalEdges[r][c - 1];

                // Create offscreen drawing parameters
                // Padding size covers protrusion: 30% on each side
                const padW = cellW * 0.3;
                const padH = cellH * 0.3;
                const pieceCanvasW = cellW + padW * 2;
                const pieceCanvasH = cellH + padH * 2;

                // Build piece canvas
                const pCanvas = document.createElement('canvas');
                pCanvas.width = pieceCanvasW;
                pCanvas.height = pieceCanvasH;
                pCanvas.className = 'puzzle-piece';
                pCanvas.id = `piece-${r}-${c}`;
                
                const pCtx = pCanvas.getContext('2d');
                
                // Clip drawing area to the exact puzzle tab shape
                drawPuzzlePiecePath(pCtx, padW, padH, cellW, cellH, top, right, bottom, left);
                pCtx.clip();

                // Draw relevant sub-region of the scaled image
                // The scaled image dimensions are BOARD_WIDTH x BOARD_HEIGHT
                // Shift image to perfectly align target cell with padW, padH coordinates
                pCtx.drawImage(
                    activeImage,
                    0, 0, activeImage.width, activeImage.height,
                    padW - c * cellW, padH - r * cellH, BOARD_WIDTH, BOARD_HEIGHT
                );

                // Add nice inner shadow/depth stroke to the piece boundary to make it look 3D and premium
                pCtx.strokeStyle = 'rgba(255, 255, 255, 0.25)';
                pCtx.lineWidth = 1.5;
                pCtx.stroke();
                
                // Dark silhouette shadow for tabs definition
                pCtx.strokeStyle = 'rgba(0, 0, 0, 0.3)';
                pCtx.lineWidth = 0.5;
                pCtx.stroke();

                // Set correct snapped coordinates
                const snapX = boardLeft + c * cellW - padW;
                const snapY = boardTop + r * cellH - padH;

                // Scatter pieces on the table, avoiding the center board
                // Random position inside the table container
                let scatterX, scatterY;
                let validLocation = false;
                let attempts = 0;
                
                const tableW = tableRect.width || puzzleTable.clientWidth || 900;
                const tableH = tableRect.height || puzzleTable.clientHeight || 550;

                while (!validLocation && attempts < 50) {
                    scatterX = Math.random() * (tableW - pieceCanvasW);
                    scatterY = Math.random() * (tableH - pieceCanvasH);
                    
                    // Bounding boxes check (avoid spawning exactly inside the board center)
                    const onBoard = (
                        scatterX + pieceCanvasW > boardLeft - 20 &&
                        scatterX < boardLeft + BOARD_WIDTH + 20 &&
                        scatterY + pieceCanvasH > boardTop - 20 &&
                        scatterY < boardTop + BOARD_HEIGHT + 20
                    );
                    
                    if (!onBoard || attempts > 30) {
                        validLocation = true;
                    }
                    attempts++;
                }

                // Random rotation offset (-18 to +18 degrees)
                const rot = (Math.random() - 0.5) * 36;

                pCanvas.style.left = `${scatterX}px`;
                pCanvas.style.top = `${scatterY}px`;
                pCanvas.style.transform = `rotate(${rot}deg)`;

                // Store state in piece objects
                const pieceObj = {
                    element: pCanvas,
                    row: r,
                    col: c,
                    padW: padW,
                    padH: padH,
                    snapX: snapX,
                    snapY: snapY,
                    isSnapped: false,
                    rotation: rot
                };

                pieces.push(pieceObj);
                
                // Add PointerEvent-based drag-and-drop mechanics to support touch/mouse
                initDragEngine(pieceObj);
                
                puzzleTable.appendChild(pCanvas);
            }
        }
    }

    // --- PointerEvent Drag-and-Drop Engine ---
    let maxZIndex = 20;

    function initDragEngine(piece) {
        const el = piece.element;
        
        el.addEventListener('pointerdown', (e) => {
            if (piece.isSnapped || gameWon) return;
            
            // Activate Audio Context if suspended
            if (audio.ctx && audio.ctx.state === 'suspended') {
                audio.ctx.resume();
            }
            
            // Start game timer on the very first drag
            if (!gameStarted) {
                gameStarted = true;
                startTimer();
            }

            audio.playGrabSFX();

            // Bring to front
            maxZIndex += 2;
            el.style.zIndex = maxZIndex;
            el.classList.add('dragging');

            // Calculate exact click offset relative to piece element
            const elRect = el.getBoundingClientRect();
            const shiftX = e.clientX - elRect.left;
            const shiftY = e.clientY - elRect.top;

            // Bounding container client rect
            const tableRect = puzzleTable.getBoundingClientRect();

            function onPointerMove(moveEvent) {
                // Keep inside table boundaries
                let x = moveEvent.clientX - tableRect.left - shiftX;
                let y = moveEvent.clientY - tableRect.top - shiftY;

                // Bounding limits
                const maxX = tableRect.width - el.clientWidth;
                const maxY = tableRect.height - el.clientHeight;
                
                x = Math.max(0, Math.min(x, maxX));
                y = Math.max(0, Math.min(y, maxY));

                el.style.left = `${x}px`;
                el.style.top = `${y}px`;

                // During dragging, we also dynamically check if we are extremely close to snap target
                // If yes, we can highlight the board grid border or give dynamic glowing feedback
                const snapDist = Math.hypot(x - piece.snapX, y - piece.snapY);
                if (snapDist < 25) {
                    puzzleBoard.classList.add('active-drag');
                } else {
                    puzzleBoard.classList.remove('active-drag');
                }
            }

            function onPointerUp(upEvent) {
                document.removeEventListener('pointermove', onPointerMove);
                document.removeEventListener('pointerup', onPointerUp);
                
                el.classList.remove('dragging');
                puzzleBoard.classList.remove('active-drag');

                // Check snapping distance
                const currentX = parseFloat(el.style.left);
                const currentY = parseFloat(el.style.top);
                const distance = Math.hypot(currentX - piece.snapX, currentY - piece.snapY);

                movesCount++;
                movesDisplay.textContent = movesCount;

                if (distance < 25) {
                    // Success! Snap piece in place
                    snapPiece(piece);
                } else {
                    // Drop back on the table, re-apply a tactile random rotation
                    piece.rotation = (Math.random() - 0.5) * 30;
                    el.style.transform = `rotate(${piece.rotation}deg)`;
                }
            }

            document.addEventListener('pointermove', onPointerMove);
            document.addEventListener('pointerup', onPointerUp);
        });

        // Disable standard default touch-scrolling behaviors to prevent mobile page drag jitter
        el.style.touchAction = 'none';
    }

    function snapPiece(piece) {
        piece.isSnapped = true;
        const el = piece.element;
        
        el.style.left = `${piece.snapX}px`;
        el.style.top = `${piece.snapY}px`;
        el.style.transform = 'rotate(0deg)';
        el.classList.add('snapped');
        el.style.zIndex = 5; // Flat on the board layer

        audio.playSnapSFX();
        triggerPieceSnapParticles(piece);

        snappedCount++;
        
        // Update progress bar
        const percent = Math.round((snappedCount / totalPieces) * 100);
        progressText.textContent = `${percent}%`;
        progressBarFill.style.width = `${percent}%`;

        // Check Victory
        if (snappedCount === totalPieces) {
            triggerVictory();
        }
    }

    // --- Dynamic Snap Particle Sparkle ---
    function triggerPieceSnapParticles(piece) {
        // Create 8 little glowing light particles radiating from snap center
        const el = piece.element;
        const rect = el.getBoundingClientRect();
        const tableRect = puzzleTable.getBoundingClientRect();
        
        // Midpoint coordinates of snapped piece
        const originX = rect.left - tableRect.left + el.clientWidth / 2;
        const originY = rect.top - tableRect.top + el.clientHeight / 2;

        for (let i = 0; i < 8; i++) {
            const particle = document.createElement('div');
            particle.style.position = 'absolute';
            particle.style.width = '6px';
            particle.style.height = '6px';
            particle.style.borderRadius = '50%';
            particle.style.background = 'var(--neon-cyan)';
            particle.style.boxShadow = '0 0 8px var(--neon-cyan)';
            particle.style.pointerEvents = 'none';
            particle.style.zIndex = 100;
            
            particle.style.left = `${originX}px`;
            particle.style.top = `${originY}px`;

            const angle = (i / 8) * Math.PI * 2;
            const velocity = 2 + Math.random() * 2;
            const vx = Math.cos(angle) * velocity;
            const vy = Math.sin(angle) * velocity;

            puzzleTable.appendChild(particle);

            let opacity = 1.0;
            let currentX = originX;
            let currentY = originY;

            const animateParticle = () => {
                if (opacity <= 0.05) {
                    particle.remove();
                    return;
                }
                opacity -= 0.04;
                currentX += vx;
                currentY += vy;
                
                particle.style.left = `${currentX}px`;
                particle.style.top = `${currentY}px`;
                particle.style.opacity = opacity;
                
                requestAnimationFrame(animateParticle);
            };

            requestAnimationFrame(animateParticle);
        }
    }

    // --- Original Image Preview Hover / Peek ---
    let isPeeking = false;
    
    function togglePeek(forceState = null) {
        const state = (forceState !== null) ? forceState : !isPeeking;
        isPeeking = state;
        
        if (isPeeking) {
            boardPreviewImg.classList.add('peeking');
            btnPeek.classList.add('active');
            btnPeek.innerHTML = '<i class="fa-solid fa-eye-slash"></i> <span>隱藏</span>';
        } else {
            boardPreviewImg.classList.remove('peeking');
            btnPeek.classList.remove('active');
            btnPeek.innerHTML = '<i class="fa-regular fa-eye"></i> <span>預覽</span>';
        }
    }

    btnPeek.addEventListener('mousedown', () => togglePeek(true));
    btnPeek.addEventListener('mouseup', () => togglePeek(false));
    btnPeek.addEventListener('mouseleave', () => togglePeek(false));
    btnPeek.addEventListener('touchstart', (e) => {
        e.preventDefault();
        togglePeek(true);
    });
    btnPeek.addEventListener('touchend', (e) => {
        e.preventDefault();
        togglePeek(false);
    });

    btnRestart.addEventListener('click', () => {
        initGame();
    });

    // --- Victory State & Celebration Particles ---
    let confettiActive = false;
    let confettiList = [];

    function triggerVictory() {
        gameWon = true;
        stopTimer();
        audio.playVictorySFX();

        // Start confetti simulation
        startConfetti();

        // Populate victory stats in modal
        vDifficulty.textContent = difficulties[currentDifficulty].label;
        vTime.textContent = timerDisplay.textContent;
        vMoves.textContent = `${movesCount} 步`;

        // Open Victory Modal with slight delay for dramatic effect
        setTimeout(() => {
            victoryModal.classList.add('open');
        }, 1000);
    }

    function startConfetti() {
        confettiCanvas.width = window.innerWidth;
        confettiCanvas.height = window.innerHeight;
        confettiActive = true;
        confettiList = [];

        // Spawn 150 colorful confetti flakes
        const colors = ['#00f2fe', '#4facfe', '#7000ff', '#ff007f', '#39ff14', '#ffb703'];
        for (let i = 0; i < 160; i++) {
            confettiList.push({
                x: Math.random() * confettiCanvas.width,
                y: Math.random() * confettiCanvas.height - confettiCanvas.height,
                radius: Math.random() * 5 + 4,
                color: colors[Math.floor(Math.random() * colors.length)],
                vx: (Math.random() - 0.5) * 4,
                vy: Math.random() * 4 + 3,
                rotation: Math.random() * 360,
                rotationSpeed: (Math.random() - 0.5) * 10
            });
        }

        animateConfetti();
    }

    function animateConfetti() {
        if (!confettiActive) return;
        
        const cCtx = confettiCanvas.getContext('2d');
        cCtx.clearRect(0, 0, confettiCanvas.width, confettiCanvas.height);

        confettiList.forEach((c) => {
            c.y += c.vy;
            c.x += c.vx;
            c.rotation += c.rotationSpeed;

            // Recenter if goes off bottom
            if (c.y > confettiCanvas.height) {
                c.y = -10;
                c.x = Math.random() * confettiCanvas.width;
            }

            cCtx.save();
            cCtx.translate(c.x, c.y);
            cCtx.rotate((c.rotation * Math.PI) / 180);
            
            cCtx.beginPath();
            cCtx.fillStyle = c.color;
            // Draw little rectangle/flake
            cCtx.fillRect(-c.radius, -c.radius / 2, c.radius * 2, c.radius);
            cCtx.restore();
        });

        requestAnimationFrame(animateConfetti);
    }

    function stopConfetti() {
        confettiActive = false;
        const cCtx = confettiCanvas.getContext('2d');
        cCtx.clearRect(0, 0, confettiCanvas.width, confettiCanvas.height);
    }

    // Modal closes
    btnVictoryClose.addEventListener('click', () => {
        victoryModal.classList.remove('open');
        stopConfetti();
    });

    btnPlayAgain.addEventListener('click', () => {
        victoryModal.classList.remove('open');
        stopConfetti();
        initGame();
    });

    // --- Leaderboard Database Management (Local Storage) ---
    function getLeaderboard() {
        const data = localStorage.getItem(LEADERBOARD_KEY);
        return data ? JSON.parse(data) : { easy: [], medium: [], hard: [] };
    }

    function saveScore(difficulty, name, timeStr, seconds, moves) {
        const board = getLeaderboard();
        
        const newRecord = {
            name: name || '無名勇士',
            timeStr: timeStr,
            seconds: seconds,
            moves: moves,
            date: new Date().toLocaleDateString('zh-TW', { year: 'numeric', month: '2-digit', day: '2-digit' })
        };

        board[difficulty].push(newRecord);
        
        // Sort by seconds ascending, then moves ascending
        board[difficulty].sort((a, b) => {
            if (a.seconds !== b.seconds) return a.seconds - b.seconds;
            return a.moves - b.moves;
        });

        // Slice to keep only top 5 scores
        board[difficulty] = board[difficulty].slice(0, 5);

        localStorage.setItem(LEADERBOARD_KEY, JSON.stringify(board));
    }

    function displayLeaderboard(difficultyTab) {
        leaderboardTbody.innerHTML = '';
        const board = getLeaderboard();
        const list = board[difficultyTab] || [];

        if (list.length === 0) {
            leaderboardTbody.innerHTML = `
                <tr>
                    <td colspan="5" style="text-align: center; color: #64748b; padding: 30px 0;">
                        尚無通關紀錄，等你來搶佔榜首！
                    </td>
                </tr>
            `;
            return;
        }

        list.forEach((record, index) => {
            let rankMedal = index + 1;
            if (index === 0) rankMedal = '<i class="fa-solid fa-crown" style="color:var(--neon-gold)"></i> 1';
            else if (index === 1) rankMedal = '<i class="fa-solid fa-medal" style="color:#cbd5e1"></i> 2';
            else if (index === 2) rankMedal = '<i class="fa-solid fa-medal" style="color:#b45309"></i> 3';

            const row = document.createElement('tr');
            row.innerHTML = `
                <td>${rankMedal}</td>
                <td><strong>${escapeHtml(record.name)}</strong></td>
                <td>${record.timeStr}</td>
                <td>${record.moves} 步</td>
                <td>${record.date}</td>
            `;
            leaderboardTbody.appendChild(row);
        });
    }

    function escapeHtml(str) {
        return str.replace(/&/g, "&amp;")
                  .replace(/</g, "&lt;")
                  .replace(/>/g, "&gt;")
                  .replace(/"/g, "&quot;")
                  .replace(/'/g, "&#039;");
    }

    // Submit Leaderboard Score Handler
    btnSubmitScore.addEventListener('click', () => {
        const name = playerNameInput.value.trim() || '無名勇士';
        saveScore(currentDifficulty, name, timerDisplay.textContent, secondsElapsed, movesCount);
        
        // Hide record submission form to prevent double-submits
        document.getElementById('record-form').style.display = 'none';
        
        // Transition straight to showing the Leaderboard modal
        victoryModal.classList.remove('open');
        stopConfetti();
        
        openLeaderboardModal(currentDifficulty);
    });

    // Leaderboard Modal controls
    let activeTab = 'easy';

    function openLeaderboardModal(tab = 'easy') {
        activeTab = tab;
        
        [tabEasy, tabMedium, tabHard].forEach(el => el.classList.remove('active'));
        document.getElementById(`tab-${tab}`).classList.add('active');
        
        displayLeaderboard(tab);
        leaderboardModal.classList.add('open');
    }

    btnShowScores.addEventListener('click', () => openLeaderboardModal(currentDifficulty));
    btnCloseModal.addEventListener('click', () => leaderboardModal.classList.remove('open'));
    
    // Clicking outside modal closes it
    leaderboardModal.addEventListener('click', (e) => {
        if (e.target === leaderboardModal) leaderboardModal.classList.remove('open');
    });

    // Leaderboard Tabs listeners
    [tabEasy, tabMedium, tabHard].forEach(tabEl => {
        tabEl.addEventListener('click', (e) => {
            const selectedTab = e.target.getAttribute('data-tab');
            [tabEasy, tabMedium, tabHard].forEach(el => el.classList.remove('active'));
            e.target.classList.add('active');
            displayLeaderboard(selectedTab);
        });
    });

    // Handle Victory Modal Reset form
    function resetVictoryRecordForm() {
        document.getElementById('record-form').style.display = 'block';
        playerNameInput.value = '無名勇士';
    }

    // Wrap initialization with reset forms
    const originalInit = initGame;
    initGame = function() {
        originalInit();
        resetVictoryRecordForm();
    };

    // --- Launch App ---
    // Start with Nature Preset image as default
    loadGameImage(imagePresets.nature);
});
