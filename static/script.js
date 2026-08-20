(function () {
    const GRID_SIZE = 4;
    const TOTAL_CELLS = GRID_SIZE * GRID_SIZE;
    const BOMB_COUNT = 4; // 4 bombs + 12 coins = 16 tiles
    const SURPRISE_ON_BOMB_NUMBER = 2; // which bomb tap (1st, 2nd, 3rd...) triggers the overlay

    const SLIDE_INTERVAL_MS = 2600;
    const SLIDE_MAX_LOOPS = 2; // full passes through the photos before auto-closing
    const HEART_COUNT = 18;

    let audioCtx = null;
    let gridData = [];
    let coinCount = 0;
    let bombCount = 0;
    let gameActive = true;
    let messageTimeout = null;

    let bombImages = [];
    let bombAudioSrc = null;
    let slideTimer = null;
    let heartTimer = null;

    const gridEl = document.getElementById('gameGrid');
    const coinCounterEl = document.getElementById('coinCounter');
    const bombCounterEl = document.getElementById('bombCounter');
    const messageEl = document.getElementById('messageDisplay');

    const surpriseOverlay = document.getElementById('surpriseOverlay');
    const surpriseImg = document.getElementById('surpriseImg');
    const surprisePlaceholder = document.getElementById('surprisePlaceholder');
    const surpriseClose = document.getElementById('surpriseClose');
    const surpriseAudio = document.getElementById('surpriseAudio');
    const heartField = document.getElementById('heartField');

    // --- Fallback chime, used only if no song has been dropped in static/audio/ ---
    function playFallbackChime() {
        try {
            if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
            const now = audioCtx.currentTime;
            const notes = [523, 659, 784, 1047];
            notes.forEach((freq, i) => {
                const osc = audioCtx.createOscillator();
                const gain = audioCtx.createGain();
                osc.type = 'sine';
                osc.frequency.setValueAtTime(freq, now + i * 0.12);
                gain.gain.setValueAtTime(0.001, now + i * 0.12);
                gain.gain.linearRampToValueAtTime(0.14, now + i * 0.12 + 0.03);
                gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.12 + 0.5);
                osc.connect(gain);
                gain.connect(audioCtx.destination);
                osc.start(now + i * 0.12);
                osc.stop(now + i * 0.12 + 0.5);
            });
        } catch (e) {
            console.log('Audio error:', e);
        }
    }

    // --- Coin tap sound: bright two-note "ding" ---
    function playCoinSound() {
        try {
            if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
            const now = audioCtx.currentTime;
            const notes = [988, 1319];
            notes.forEach((freq, i) => {
                const osc = audioCtx.createOscillator();
                const gain = audioCtx.createGain();
                osc.type = 'triangle';
                osc.frequency.setValueAtTime(freq, now + i * 0.07);
                gain.gain.setValueAtTime(0.001, now + i * 0.07);
                gain.gain.linearRampToValueAtTime(0.18, now + i * 0.07 + 0.02);
                gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.07 + 0.25);
                osc.connect(gain);
                gain.connect(audioCtx.destination);
                osc.start(now + i * 0.07);
                osc.stop(now + i * 0.07 + 0.25);
            });
        } catch (e) {
            console.log('Audio error:', e);
        }
    }

    // --- Bomb tap sound: low thud + noise burst ---
    function playBombSound() {
        try {
            if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
            const now = audioCtx.currentTime;

            // Low thud
            const osc = audioCtx.createOscillator();
            const gain = audioCtx.createGain();
            osc.type = 'sine';
            osc.frequency.setValueAtTime(180, now);
            osc.frequency.exponentialRampToValueAtTime(40, now + 0.35);
            gain.gain.setValueAtTime(0.25, now);
            gain.gain.exponentialRampToValueAtTime(0.001, now + 0.4);
            osc.connect(gain);
            gain.connect(audioCtx.destination);
            osc.start(now);
            osc.stop(now + 0.4);

            // Noise burst for the "boom" texture
            const bufferSize = audioCtx.sampleRate * 0.3;
            const noiseBuffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
            const data = noiseBuffer.getChannelData(0);
            for (let i = 0; i < bufferSize; i++) {
                data[i] = (Math.random() * 2 - 1) * (1 - i / bufferSize);
            }
            const noise = audioCtx.createBufferSource();
            noise.buffer = noiseBuffer;
            const noiseGain = audioCtx.createGain();
            noiseGain.gain.setValueAtTime(0.2, now);
            noiseGain.gain.exponentialRampToValueAtTime(0.001, now + 0.3);
            noise.connect(noiseGain);
            noiseGain.connect(audioCtx.destination);
            noise.start(now);
        } catch (e) {
            console.log('Audio error:', e);
        }
    }

    // --- Load whatever media the user has dropped into the static folders ---
    function loadBombMedia() {
        fetch('/api/bomb-media')
            .then((res) => res.json())
            .then((data) => {
                bombImages = data.images || [];
                bombAudioSrc = data.audio || null;
                if (bombAudioSrc) {
                    surpriseAudio.src = bombAudioSrc;
                }
            })
            .catch((err) => {
                console.log('Could not load bomb media:', err);
                bombImages = [];
                bombAudioSrc = null;
            });
    }

    function randomInt(min, max) {
        return Math.floor(Math.random() * (max - min + 1)) + min;
    }

    function generateBoard() {
        const arr = new Array(TOTAL_CELLS).fill('coin');
        let placed = 0;
        while (placed < BOMB_COUNT) {
            const idx = randomInt(0, TOTAL_CELLS - 1);
            if (arr[idx] === 'coin') {
                arr[idx] = 'bomb';
                placed++;
            }
        }
        return arr;
    }

    function pad2(n) {
        return String(n).padStart(2, '0');
    }

    function resetGame() {
        gridData = generateBoard();
        coinCount = 0;
        bombCount = 0;
        gameActive = true;
        coinCounterEl.textContent = pad2(0);
        bombCounterEl.textContent = pad2(0);
        renderGrid();
        setMessage('Fresh board! Tap a tile.');
    }

    function renderGrid() {
        gridEl.innerHTML = '';
        gridData.forEach((type, index) => {
            const cell = document.createElement('div');
            cell.className = 'cell';
            cell.dataset.index = index;
            cell.dataset.type = type;

            const inner = document.createElement('div');
            inner.className = 'cell-inner';

            const front = document.createElement('div');
            front.className = 'cell-front';

            const back = document.createElement('div');
            back.className = 'cell-back';

            if (type === 'bomb') {
                cell.classList.add('bomb-cell');
                const token = document.createElement('div');
                token.className = 'bomb-token';
                back.appendChild(token);
            } else {
                cell.classList.add('coin-cell');
                const token = document.createElement('div');
                token.className = 'coin-token';
                back.appendChild(token);
            }

            inner.appendChild(front);
            inner.appendChild(back);
            cell.appendChild(inner);

            cell.addEventListener('click', function (e) {
                e.stopPropagation();
                if (!gameActive) {
                    setMessage('Round over! Tap "Play again" to reset.');
                    return;
                }
                if (this.classList.contains('flipped')) {
                    setMessage('Already flipped that one!');
                    return;
                }
                const idx = parseInt(this.dataset.index, 10);
                handleCellTap(idx, this);
            });

            gridEl.appendChild(cell);
        });
    }

    function handleCellTap(index, cellElement) {
        const type = gridData[index];

        cellElement.classList.add('flipped');

        if (type === 'bomb') {
            bombCount++;
            bombCounterEl.textContent = pad2(bombCount);
            gridData[index] = 'tapped_bomb';
            playBombSound();

            if (bombCount === SURPRISE_ON_BOMB_NUMBER) {
                setMessage('💥 Boom... wait, what\'s this?');
                openSurprise();
            } else {
                setMessage('💥 Boom! Careful, one more thing might happen soon...');
            }
        } else if (type === 'coin') {
            coinCount++;
            coinCounterEl.textContent = pad2(coinCount);
            setMessage('🪙 Nice, +1 coin!');
            gridData[index] = 'tapped_coin';
            playCoinSound();
        } else {
            setMessage('Already flipped that one!');
            return;
        }

        const totalCoins = gridData.filter((v) => v === 'coin' || v === 'tapped_coin').length;
        const tappedCoins = gridData.filter((v) => v === 'tapped_coin').length;
        const totalBombs = gridData.filter((v) => v === 'bomb' || v === 'tapped_bomb').length;
        const tappedBombs = gridData.filter((v) => v === 'tapped_bomb').length;

        if (tappedCoins === totalCoins && tappedBombs === totalBombs) {
            setMessage('That\'s every tile! Play again?');
            gameActive = false;
        } else if (tappedCoins === totalCoins && totalBombs > 0) {
            setMessage('All coins found! Just bombs left.');
        } else if (tappedBombs === totalBombs && totalCoins > 0) {
            setMessage('All bombs found! Clean sweep on the coins.');
        }
    }

    // --- Surprise overlay: fires only on the 2nd bomb tap ---
    function spawnHearts() {
        heartField.innerHTML = '';
        for (let i = 0; i < HEART_COUNT; i++) {
            const heart = document.createElement('span');
            heart.className = 'heart';
            const left = Math.random() * 100;
            const duration = 3.5 + Math.random() * 2.5;
            const delay = Math.random() * 2.5;
            const scale = 0.7 + Math.random() * 0.8;
            heart.style.left = left + '%';
            heart.style.animationDuration = duration + 's';
            heart.style.animationDelay = delay + 's';
            heart.style.transform = `scale(${scale}) rotate(-45deg)`;
            heartField.appendChild(heart);
        }
    }

    function openSurprise() {
        surpriseOverlay.classList.add('active');
        surpriseOverlay.setAttribute('aria-hidden', 'false');

        spawnHearts();
        clearInterval(heartTimer);
        heartTimer = setInterval(spawnHearts, 4000);

        if (bombAudioSrc) {
            surpriseAudio.currentTime = 0;
            surpriseAudio.play().catch(() => {});
        } else {
            playFallbackChime();
        }

        if (bombImages.length === 0) {
            surpriseImg.classList.remove('active');
            surprisePlaceholder.classList.add('active');
            return;
        }

        surprisePlaceholder.classList.remove('active');

        let slide = 0;
        let loops = 0;
        surpriseImg.src = bombImages[0];
        surpriseImg.classList.add('active');

        clearInterval(slideTimer);
        slideTimer = setInterval(() => {
            slide++;
            if (slide >= bombImages.length) {
                slide = 0;
                loops++;
            }
            surpriseImg.classList.remove('active');
            setTimeout(() => {
                surpriseImg.src = bombImages[slide];
                surpriseImg.classList.add('active');
            }, 200);
            if (loops >= SLIDE_MAX_LOOPS) {
                closeSurprise();
            }
        }, SLIDE_INTERVAL_MS);
    }

    function closeSurprise() {
        clearInterval(slideTimer);
        clearInterval(heartTimer);
        slideTimer = null;
        heartTimer = null;
        surpriseOverlay.classList.remove('active');
        surpriseOverlay.setAttribute('aria-hidden', 'true');
        surpriseAudio.pause();
    }

    surpriseClose.addEventListener('click', closeSurprise);
    document.getElementById('surpriseStage').addEventListener('click', closeSurprise);
    document.addEventListener('keydown', function (e) {
        if (e.key === 'Escape' && surpriseOverlay.classList.contains('active')) closeSurprise();
    });

    function setMessage(msg) {
        if (messageTimeout) clearTimeout(messageTimeout);
        messageEl.textContent = msg;
        messageTimeout = setTimeout(() => {
            messageEl.textContent = gameActive ? 'Keep flipping!' : 'Round over. Play again?';
        }, 3500);
    }

    document.getElementById('resetGameBtn').addEventListener('click', resetGame);

    loadBombMedia();
    resetGame();
})();