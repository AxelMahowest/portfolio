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
    { theme: 'theme-sunset', nx: 0, ny: -1, nz: 0, rotX: -90, rotY: 0 },
    { theme: 'theme-rose', nx: 0, ny: 1, nz: 0, rotX: 90, rotY: 0 },
];

const IDLE_ROT_X = -20;
const IDLE_ROT_Y = -30;
const DRAG_THRESHOLD = 4; // px of total movement before a press counts as a drag, not a click
const DEG_PER_PX = 0.5;

const HINT_DEFAULT = 'Drag to a side, then click the cube to apply it';
const HINT_PENDING = 'Click the cube (or press Enter) to apply this theme';
const HINT_APPLIED = 'Theme applied! Drag again to change it';

function idleMatrix() {
    return new DOMMatrix().rotate(IDLE_ROT_X, IDLE_ROT_Y, 0);
}

function faceMatrix(face) {
    return new DOMMatrix().rotate(face.rotX, face.rotY, 0);
}

class ThemeCube {
    constructor(wrapper, hintEl) {
        this.wrapper = wrapper;
        this.cube = wrapper.querySelector('.theme-cube');
        this.hintEl = hintEl;
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
        const alreadyApplied = face.theme === this.currentTheme;
        this.wrapper.classList.toggle('is-pending', !alreadyApplied);
        this.setHint(alreadyApplied ? HINT_DEFAULT : HINT_PENDING);
    }

    confirmTheme() {
        if (!this.pendingFace) {
            this.previewNearestFace();
        }
        this.applyTheme(this.pendingFace.theme);
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

class ThemeCubeModal {
    constructor() {
        this.trigger = document.getElementById('themeCubeTrigger');
        this.modal = document.getElementById('themeCubeModal');
        this.closeBtn = document.getElementById('themeCubeClose');
        this.cubeEl = document.getElementById('themeCube');
        this.hintEl = document.getElementById('themeCubeHint');

        if (!this.trigger || !this.modal || !this.closeBtn || !this.cubeEl) return;

        this.cube = new ThemeCube(this.cubeEl, this.hintEl);

        this.trigger.addEventListener('click', () => this.open());
        this.closeBtn.addEventListener('click', () => this.close());

        // Only a press that *starts* directly on the backdrop closes the modal.
        // (A click event here would also fire after a drag that's released over
        // the backdrop, since the browser synthesizes it on the common ancestor
        // of the press and release targets - pointerdown avoids that entirely.)
        this.modal.addEventListener('pointerdown', (e) => {
            if (e.target === this.modal) this.close();
        });

        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && this.isOpen()) this.close();
        });
    }

    isOpen() {
        return this.modal.style.display === 'flex';
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
        this.cube.reset();
        this.trigger.focus({ preventScroll: true });
    }
}

document.addEventListener('DOMContentLoaded', () => {
    new ThemeCubeModal();
});
