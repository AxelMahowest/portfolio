// Theme Cube: drag to a side to preview it, click the cube (or press Enter) to apply it
//
// Rotation uses a DOMMatrix instead of absolute rotateX/rotateY angles. Plain
// `rotateX(a) rotateY(b)` always spins around the ORIGINAL screen axes, so once
// the cube has turned sideways, "dragging up" stops tipping it toward you the
// way you'd expect - it can feel locked or snap back oddly. Composing each
// small drag step onto the current matrix (trackball-style) keeps dragging
// up/down/left/right feeling the same no matter how the cube is currently
// oriented.
const CUBE_FACES = [
    { theme: 'theme-coral', nx: 0, ny: 0, nz: 1, rotX: 0, rotY: 0 },
    { theme: 'theme-forest', nx: 0, ny: 0, nz: -1, rotX: 0, rotY: 180 },
    { theme: 'theme-lavender', nx: 1, ny: 0, nz: 0, rotX: 0, rotY: -90 },
    { theme: 'theme-teal', nx: -1, ny: 0, nz: 0, rotX: 0, rotY: 90 },
    { theme: 'theme-gold', nx: 0, ny: -1, nz: 0, rotX: -90, rotY: 0 },
    { theme: 'theme-rose', nx: 0, ny: 1, nz: 0, rotX: 90, rotY: 0 },
];

const GOLD_THEME = 'theme-gold';

// Unlocked state lives only in memory, not localStorage - it resets back to
// locked on every page load/visit, but stays unlocked for the rest of this
// one as you open and close the modal.
let goldUnlocked = false;

function isGoldUnlocked() {
    return goldUnlocked;
}

function setGoldUnlocked() {
    goldUnlocked = true;
}

const IDLE_ROT_X = -20;
const IDLE_ROT_Y = -30;
const DRAG_THRESHOLD = 4; // px of total movement before a press counts as a drag, not a click
const DEG_PER_PX = 0.5;

const HINT_DEFAULT = 'Drag to a side, then click the cube to apply it';
const HINT_PENDING = 'Click the cube (or press Enter) to apply this theme';
const HINT_LOCKED = 'This one is locked - click to try and unlock it';
const HINT_APPLIED = 'Theme applied! Drag again to change it';

function idleMatrix() {
    return new DOMMatrix().rotate(IDLE_ROT_X, IDLE_ROT_Y, 0);
}

function faceMatrix(face) {
    return new DOMMatrix().rotate(face.rotX, face.rotY, 0);
}

class ThemeCube {
    constructor(wrapper, hintEl, onLockedAttempt) {
        this.wrapper = wrapper;
        this.cube = wrapper.querySelector('.theme-cube');
        this.hintEl = hintEl;
        this.onLockedAttempt = onLockedAttempt || (() => {});
        this.matrix = idleMatrix();
        this.dragging = false;
        this.moved = false;
        this.currentTheme = null;
        this.pendingFace = null;
        this.appliedHintTimer = null;

        this.onPointerDown = this.onPointerDown.bind(this);
        this.onPointerMove = this.onPointerMove.bind(this);
        this.onPointerUp = this.onPointerUp.bind(this);
        this.onKeyDown = this.onKeyDown.bind(this);

        this.applyTransform();
        this.init();
    }

    init() {
        this.wrapper.addEventListener('pointerdown', this.onPointerDown);
        window.addEventListener('pointermove', this.onPointerMove);
        window.addEventListener('pointerup', this.onPointerUp);
        this.wrapper.addEventListener('keydown', this.onKeyDown);
    }

    onPointerDown(e) {
        // Without this, the browser treats the press as the start of a native
        // text-selection/drag gesture, which fights our own rotation and shows
        // the "not allowed" cursor while dragging. Mouse/touch users don't lose
        // anything here - keyboard users still reach the cube via Tab, which
        // triggers focus independently of this handler.
        e.preventDefault();

        this.dragging = true;
        this.moved = false;
        this.downX = e.clientX;
        this.downY = e.clientY;
        this.lastX = e.clientX;
        this.lastY = e.clientY;
        this.cube.classList.remove('is-snapping');
        this.cube.classList.add('is-dragging');
    }

    onPointerMove(e) {
        if (!this.dragging) return;

        const dx = e.clientX - this.lastX;
        const dy = e.clientY - this.lastY;
        this.lastX = e.clientX;
        this.lastY = e.clientY;

        if (!this.moved) {
            const totalDX = e.clientX - this.downX;
            const totalDY = e.clientY - this.downY;
            if (Math.abs(totalDX) > DRAG_THRESHOLD || Math.abs(totalDY) > DRAG_THRESHOLD) this.moved = true;
        }

        this.rotateBy(-dy * DEG_PER_PX, dx * DEG_PER_PX);
    }

    onPointerUp() {
        if (!this.dragging) return;
        this.dragging = false;
        this.cube.classList.remove('is-dragging');

        if (this.moved) {
            // Dragged to a side: settle on it, but wait for a click to confirm
            this.previewNearestFace();
        } else {
            // A plain click/tap: apply whichever face is currently facing front
            this.previewNearestFace();
            this.confirmTheme();
        }
    }

    onKeyDown(e) {
        if (e.key === 'Enter' || e.key === ' ' || e.key === 'Spacebar') {
            e.preventDefault();
            this.confirmTheme();
            return;
        }

        const step = 90;
        if (e.key === 'ArrowLeft') this.rotateBy(0, -step);
        else if (e.key === 'ArrowRight') this.rotateBy(0, step);
        else if (e.key === 'ArrowUp') this.rotateBy(-step, 0);
        else if (e.key === 'ArrowDown') this.rotateBy(step, 0);
        else return;

        e.preventDefault();
        this.previewNearestFace(true);
    }

    // Rotates the cube by a small step defined in SCREEN space (the axes you
    // see right now), composed onto whatever orientation it already has.
    rotateBy(stepX, stepY) {
        const increment = new DOMMatrix().rotate(stepX, 0, 0).rotate(0, stepY, 0);
        this.matrix = increment.multiply(this.matrix);
        this.applyTransform();
    }

    applyTransform() {
        this.cube.style.transform = this.matrix.toString();
    }

    nearestFace() {
        let best = null;
        let bestZ = -Infinity;
        CUBE_FACES.forEach((face) => {
            const n = this.matrix.transformPoint(new DOMPoint(face.nx, face.ny, face.nz, 0));
            if (n.z > bestZ) {
                bestZ = n.z;
                best = face;
            }
        });
        return best;
    }

    // `snap` forces the cube to rotate the rest of the way into the face's
    // exact, perfectly-aligned pose. That's the right feel for the keyboard
    // (each arrow key press is a deliberate, clean 90deg step), but after a
    // mouse/touch drag it reads as an unwanted extra spin - there, the cube
    // should just rest wherever it was let go and we only need to work out
    // which face that's closest to.
    previewNearestFace(snap = false) {
        const face = this.nearestFace();
        if (snap) {
            this.matrix = faceMatrix(face);
            this.cube.classList.add('is-snapping');
            this.applyTransform();
        } else {
            this.cube.classList.remove('is-snapping');
        }

        this.pendingFace = face;
        const locked = face.theme === GOLD_THEME && !isGoldUnlocked();
        const alreadyApplied = face.theme === this.currentTheme;
        this.wrapper.classList.toggle('is-pending', !alreadyApplied && !locked);
        if (locked) {
            this.setHint(HINT_LOCKED);
        } else {
            this.setHint(alreadyApplied ? HINT_DEFAULT : HINT_PENDING);
        }
    }

    confirmTheme() {
        if (!this.pendingFace) {
            this.previewNearestFace();
        }
        const face = this.pendingFace;

        if (face.theme === GOLD_THEME && !isGoldUnlocked()) {
            this.wrapper.classList.remove('is-pending');
            this.setHint(HINT_LOCKED);
            this.onLockedAttempt(face);
            return;
        }

        this.applyTheme(face.theme);
        this.wrapper.classList.remove('is-pending');
        this.setHint(HINT_APPLIED);

        clearTimeout(this.appliedHintTimer);
        this.appliedHintTimer = window.setTimeout(() => {
            this.setHint(HINT_DEFAULT);
        }, 1800);
    }

    applyTheme(themeClass) {
        if (this.currentTheme === themeClass) return;
        if (this.currentTheme) document.body.classList.remove(this.currentTheme);
        document.body.classList.add(themeClass);
        this.currentTheme = themeClass;
    }

    setHint(text) {
        if (this.hintEl) this.hintEl.textContent = text;
    }

    reset() {
        clearTimeout(this.appliedHintTimer);
        this.matrix = idleMatrix();
        this.pendingFace = null;
        this.cube.classList.remove('is-dragging', 'is-snapping');
        this.wrapper.classList.remove('is-pending');
        this.applyTransform();
        this.setHint(HINT_DEFAULT);
    }
}

// A short memory sequence: watch the pads light up, then repeat the pattern
// back. Each round is a brand new random sequence (one pad longer than the
// last) rather than the previous round's sequence with a step appended, so
// you can't lean on remembering just "the new one" - the whole thing has to
// be relearned every round. Reaching ROUNDS_TO_WIN correct rounds wins; a
// wrong pad restarts from round one.
class SimonGame {
    constructor(padsEl, statusEl, onWin) {
        this.pads = Array.from(padsEl.querySelectorAll('.simon-pad'));
        this.statusEl = statusEl;
        this.onWin = onWin;
        this.roundsToWin = 5;
        this.sequence = [];
        this.playerIndex = 0;
        this.accepting = false;
        this.timer = null;

        this.onPadClick = this.onPadClick.bind(this);
        this.pads.forEach((pad) => pad.addEventListener('click', this.onPadClick));
    }

    start() {
        clearTimeout(this.timer);
        this.sequence = [];
        this.nextRound();
    }

    stop() {
        this.accepting = false;
        clearTimeout(this.timer);
        this.pads.forEach((pad) => pad.classList.remove('is-active'));
    }

    setStatus(text) {
        if (this.statusEl) this.statusEl.textContent = text;
    }

    wait(ms) {
        return new Promise((resolve) => {
            this.timer = window.setTimeout(resolve, ms);
        });
    }

    // The sequence plays back faster as rounds go on, down to a floor that
    // keeps it just barely readable - the main source of extra difficulty.
    flashDuration() {
        return Math.max(180, 450 - (this.sequence.length - 1) * 30);
    }

    gapDuration() {
        return Math.max(80, 200 - (this.sequence.length - 1) * 15);
    }

    flashPad(index) {
        return new Promise((resolve) => {
            const pad = this.pads[index];
            pad.classList.add('is-active');
            this.timer = window.setTimeout(() => {
                pad.classList.remove('is-active');
                resolve();
            }, this.flashDuration());
        });
    }

    setPadsDisabled(disabled) {
        this.pads.forEach((pad) => {
            pad.disabled = disabled;
        });
    }

    async nextRound() {
        this.playerIndex = 0;
        this.accepting = false;
        const length = this.sequence.length + 1;
        this.sequence = Array.from({ length }, () => Math.floor(Math.random() * this.pads.length));
        this.setStatus(`Round ${this.sequence.length} of ${this.roundsToWin} - watch...`);

        this.setPadsDisabled(true);
        await this.wait(500);
        for (const index of this.sequence) {
            await this.flashPad(index);
            await this.wait(this.gapDuration());
        }
        this.setPadsDisabled(false);
        this.accepting = true;
        this.setStatus('Your turn - repeat it');
    }

    onPadClick(e) {
        if (!this.accepting) return;
        const index = Number(e.currentTarget.dataset.pad);
        this.flashPad(index);

        if (index !== this.sequence[this.playerIndex]) {
            this.accepting = false;
            this.setStatus('Wrong! Starting over...');
            this.timer = window.setTimeout(() => this.start(), 1200);
            return;
        }

        this.playerIndex += 1;
        if (this.playerIndex < this.sequence.length) return;

        if (this.sequence.length >= this.roundsToWin) {
            this.accepting = false;
            this.setStatus('Unlocked!');
            this.onWin();
        } else {
            this.accepting = false;
            this.timer = window.setTimeout(() => this.nextRound(), 700);
        }
    }
}

class ThemeCubeModal {
    constructor() {
        this.trigger = document.getElementById('themeCubeTrigger');
        this.modal = document.getElementById('themeCubeModal');
        this.closeBtn = document.getElementById('themeCubeClose');
        this.cubeEl = document.getElementById('themeCube');
        this.hintEl = document.getElementById('themeCubeHint');
        this.lockIcon = document.getElementById('themeCubeLockIcon');
        this.stageEl = document.getElementById('cubeStage');
        this.minigameEl = document.getElementById('cubeMinigame');
        this.minigameStatusEl = document.getElementById('cubeMinigameStatus');
        this.minigamePadsEl = document.getElementById('simonPads');
        this.minigameCancelBtn = document.getElementById('cubeMinigameCancel');

        if (!this.trigger || !this.modal || !this.closeBtn || !this.cubeEl) return;

        this.cube = new ThemeCube(this.cubeEl, this.hintEl, (face) => this.startMinigame(face));
        this.updateLockIcon();

        if (this.minigamePadsEl) {
            this.simon = new SimonGame(this.minigamePadsEl, this.minigameStatusEl, () => this.onMinigameWin());
        }

        this.trigger.addEventListener('click', () => this.open());
        this.closeBtn.addEventListener('click', () => this.close());
        if (this.minigameCancelBtn) {
            this.minigameCancelBtn.addEventListener('click', () => this.hideMinigame());
        }

        // Only a press that *starts* directly on the backdrop closes the modal.
        // (A click event here would also fire after a drag that's released over
        // the backdrop, since the browser synthesizes it on the common ancestor
        // of the press and release targets - pointerdown avoids that entirely.)
        this.modal.addEventListener('pointerdown', (e) => {
            if (e.target === this.modal) this.close();
        });

        document.addEventListener('keydown', (e) => {
            if (e.key !== 'Escape' || !this.isOpen()) return;
            // Back out one level at a time: leave the minigame first, then
            // on a second Escape close the whole modal.
            if (this.isMinigameOpen()) {
                this.hideMinigame();
            } else {
                this.close();
            }
        });
    }

    isOpen() {
        return this.modal.style.display === 'flex';
    }

    isMinigameOpen() {
        return !!this.minigameEl && !this.minigameEl.hidden;
    }

    updateLockIcon() {
        const topFace = this.cubeEl.querySelector('.theme-cube-face--top');
        if (topFace) topFace.classList.toggle('is-locked', !isGoldUnlocked());
    }

    startMinigame() {
        if (!this.minigameEl || !this.simon) return;
        this.stageEl.style.display = 'none';
        this.minigameEl.hidden = false;
        this.simon.start();
    }

    hideMinigame() {
        if (!this.minigameEl || !this.simon) return;
        this.simon.stop();
        this.minigameEl.hidden = true;
        this.stageEl.style.display = '';
        this.cubeEl.focus({ preventScroll: true });
    }

    onMinigameWin() {
        setGoldUnlocked();
        this.updateLockIcon();
        this.cube.applyTheme(GOLD_THEME);
        window.setTimeout(() => {
            this.hideMinigame();
            this.cube.setHint(HINT_APPLIED);
        }, 1200);
    }

    open() {
        // Close the mobile nav drawer first so it doesn't sit on top of the modal
        const navEl = document.querySelector('nav');
        const navToggle = document.querySelector('.mobile-menu-toggle');
        if (navEl && navEl.classList.contains('nav-open') && navToggle) {
            navToggle.click();
        }

        this.modal.style.display = 'flex';
        this.modal.setAttribute('aria-hidden', 'false');
        document.body.style.overflow = 'hidden';
        this.cubeEl.focus({ preventScroll: true });
    }

    close() {
        this.modal.style.display = 'none';
        this.modal.setAttribute('aria-hidden', 'true');
        document.body.style.overflow = '';
        this.hideMinigame();
        this.cube.reset();
        this.trigger.focus({ preventScroll: true });
    }
}

// Fills the (otherwise CSS-hidden) #goldFx overlay with a handful of
// randomized confetti pieces and sparkles. It's always generated - the CSS
// rule on body.theme-gold is what actually turns it on - so there's nothing
// to redo when the theme changes.
function initGoldEffects() {
    const container = document.getElementById('goldFx');
    if (!container) return;

    const confettiColors = ['#d4af37', '#f0c542', '#fff2b2', '#b8860b', '#e8c547'];
    const confettiCount = 22;
    const sparkleCount = 14;

    for (let i = 0; i < confettiCount; i++) {
        const piece = document.createElement('span');
        piece.className = 'confetti-piece';
        piece.style.left = `${Math.random() * 100}%`;
        piece.style.background = confettiColors[Math.floor(Math.random() * confettiColors.length)];
        piece.style.setProperty('--drift', `${Math.round((Math.random() - 0.5) * 120)}px`);
        piece.style.animationDuration = `${7 + Math.random() * 6}s`;
        piece.style.animationDelay = `-${Math.random() * 12}s`;
        piece.style.transform = `scale(${0.7 + Math.random() * 0.6})`;
        container.appendChild(piece);
    }

    for (let i = 0; i < sparkleCount; i++) {
        const sparkle = document.createElement('span');
        sparkle.className = 'sparkle';
        sparkle.style.left = `${Math.random() * 100}%`;
        sparkle.style.top = `${Math.random() * 100}%`;
        sparkle.style.animationDuration = `${2 + Math.random() * 2.5}s`;
        sparkle.style.animationDelay = `-${Math.random() * 4}s`;
        container.appendChild(sparkle);
    }
}

document.addEventListener('DOMContentLoaded', () => {
    new ThemeCubeModal();
    initGoldEffects();
});
