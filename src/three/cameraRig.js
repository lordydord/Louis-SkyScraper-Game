import * as THREE from 'three';
import { clamp, damp, easeInOutCubic, lerp } from '../util/math.js';

// Orbit camera with touch controls, tuned for a child on an iPad:
//   one finger drag  -> spin around the tower / look from higher or lower
//   pinch            -> zoom in and out
//   two finger drag  -> move up and down the tower
//   tap              -> onTap(x, y)
// On a computer: drag to spin, scroll or pinch the trackpad to zoom, swipe the
// trackpad sideways to spin, and right-drag (or Shift + drag) to move up and down.

const TAP_MOVE = 10;
const TAP_TIME = 380;

export class CameraRig {
  constructor(camera, dom) {
    this.camera = camera;
    this.dom = dom;
    this.goal = { target: new THREE.Vector3(0, 40, 0), dist: 260, az: 0.75, el: 0.32 };
    this.cur = { target: this.goal.target.clone(), dist: 260, az: 0.75, el: 0.32 };
    this.minDist = 18;
    this.maxDist = 3e6;
    this.minEl = -0.95;
    this.maxEl = 1.42;
    this.minTargetY = 0;
    this.maxTargetY = 1e6;
    this.enabled = true;
    this.autoSpin = 0;
    this.lastInteraction = -1e9;
    this.anim = null;
    this.onTap = null;
    this.onDoubleTap = null;
    this.onInteract = null;
    this.extraFar = 0;
    this._pointers = new Map();
    this._gesture = null;
    this._lastTapTime = 0;
    this._now = 0;
    this._bind();
  }

  _bind() {
    const el = this.dom;
    el.addEventListener('pointerdown', (e) => this._down(e));
    el.addEventListener('pointermove', (e) => this._move(e));
    el.addEventListener('pointerup', (e) => this._up(e));
    el.addEventListener('pointercancel', (e) => this._up(e, true));
    el.addEventListener('contextmenu', (e) => e.preventDefault());
    el.addEventListener(
      'wheel',
      (e) => {
        e.preventDefault();
        if (!this.enabled) return;
        const unit = e.deltaMode === 1 ? 16 : 1;
        const dx = e.deltaX * unit;
        const dy = e.deltaY * unit;
        if (Math.abs(dx) > Math.abs(dy) && !e.ctrlKey) {
          // Trackpad swipe sideways: spin around.
          this.goal.az += dx * 0.004;
        } else {
          // Scroll wheel, trackpad scroll, or trackpad pinch (ctrlKey): zoom.
          const k = e.ctrlKey ? 0.01 : 0.0012;
          this.goal.dist = clamp(this.goal.dist * Math.exp(dy * k), this.minDist, this.maxDist);
        }
        this._touched();
      },
      { passive: false },
    );
  }

  _touched() {
    this.lastInteraction = performance.now();
    this.anim = null;
    if (this.onInteract) this.onInteract();
  }

  _down(e) {
    this.dom.setPointerCapture?.(e.pointerId);
    this._pointers.set(e.pointerId, { x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY, t: performance.now() });
    if (this._pointers.size === 1) {
      // Right mouse button or Shift + drag moves up and down the tower.
      const pan = e.pointerType === 'mouse' && (e.button === 2 || e.shiftKey);
      this._gesture = pan ? { type: 'pan' } : { type: 'maybeTap', moved: 0 };
    } else if (this._pointers.size === 2) {
      const [a, b] = [...this._pointers.values()];
      this._gesture = {
        type: 'pinch',
        dist: Math.hypot(a.x - b.x, a.y - b.y),
        midY: (a.y + b.y) / 2,
        midX: (a.x + b.x) / 2,
      };
    }
  }

  _move(e) {
    const p = this._pointers.get(e.pointerId);
    if (!p) return;
    const dx = e.clientX - p.x;
    const dy = e.clientY - p.y;
    p.x = e.clientX;
    p.y = e.clientY;
    if (!this.enabled) return;
    const g = this._gesture;
    if (!g) return;
    if (this._pointers.size === 1) {
      const total = Math.hypot(p.x - p.sx, p.y - p.sy);
      if (g.type === 'maybeTap' && total > TAP_MOVE) g.type = 'orbit';
      if (g.type === 'orbit') {
        const k = 0.0062;
        this.goal.az -= dx * k;
        this.goal.el = clamp(this.goal.el + dy * k * 0.8, this.minEl, this.maxEl);
        this._touched();
      } else if (g.type === 'pan') {
        const worldPerPx = (2 * this.cur.dist * Math.tan((this.camera.fov * Math.PI) / 360)) / this.dom.clientHeight;
        this.goal.target.y = clamp(this.goal.target.y + dy * worldPerPx, this.minTargetY, this.maxTargetY);
        this._touched();
      }
    } else if (this._pointers.size === 2 && g.type === 'pinch') {
      const [a, b] = [...this._pointers.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      const midY = (a.y + b.y) / 2;
      if (g.dist > 0 && d > 0) {
        this.goal.dist = clamp(this.goal.dist * (g.dist / d), this.minDist, this.maxDist);
      }
      const worldPerPx = (2 * this.cur.dist * Math.tan((this.camera.fov * Math.PI) / 360)) / this.dom.clientHeight;
      this.goal.target.y = clamp(this.goal.target.y + (midY - g.midY) * worldPerPx, this.minTargetY, this.maxTargetY);
      g.dist = d;
      g.midY = midY;
      this._touched();
    }
  }

  _up(e, cancelled = false) {
    const p = this._pointers.get(e.pointerId);
    this._pointers.delete(e.pointerId);
    if (!p) return;
    const g = this._gesture;
    if (!cancelled && g && g.type === 'maybeTap' && this._pointers.size === 0) {
      const dt = performance.now() - p.t;
      if (dt < TAP_TIME && Math.hypot(p.x - p.sx, p.y - p.sy) < TAP_MOVE) {
        const now = performance.now();
        if (now - this._lastTapTime < 320 && this.onDoubleTap) {
          this._lastTapTime = 0;
          this.onDoubleTap(p.x, p.y);
        } else {
          this._lastTapTime = now;
          if (this.onTap) this.onTap(p.x, p.y);
        }
      }
    }
    if (this._pointers.size === 0) this._gesture = null;
    else if (this._pointers.size === 1) this._gesture = { type: 'orbit' };
  }

  get dragging() {
    return this._pointers.size > 0 && this._gesture && this._gesture.type !== 'maybeTap';
  }

  // Ease the camera to look at a point from a distance (keeps the current angle
  // unless az/el are given).
  flyTo({ target, dist, az, el, duration = 1.4 }) {
    const from = {
      target: this.cur.target.clone(),
      dist: this.cur.dist,
      az: this.cur.az,
      el: this.cur.el,
    };
    const to = {
      target: target ? target.clone() : from.target.clone(),
      dist: dist ?? from.dist,
      az: az ?? from.az,
      el: el ?? from.el,
    };
    // Take the short way round.
    while (to.az - from.az > Math.PI) to.az -= Math.PI * 2;
    while (to.az - from.az < -Math.PI) to.az += Math.PI * 2;
    this.anim = { from, to, t: 0, duration };
    this.goal.target.copy(to.target);
    this.goal.dist = to.dist;
    this.goal.az = to.az;
    this.goal.el = to.el;
  }

  // Gently move the goal (used for auto-framing while building).
  setGoal({ target, dist, az, el }) {
    if (target) this.goal.target.copy(target);
    if (dist !== undefined) this.goal.dist = clamp(dist, this.minDist, this.maxDist);
    if (az !== undefined) this.goal.az = az;
    if (el !== undefined) this.goal.el = el;
  }

  snap() {
    this.anim = null;
    this.cur.target.copy(this.goal.target);
    this.cur.dist = this.goal.dist;
    this.cur.az = this.goal.az;
    this.cur.el = this.goal.el;
  }

  idleSeconds() {
    return (performance.now() - this.lastInteraction) / 1000;
  }

  update(dt) {
    const c = this.cur;
    const g = this.goal;
    if (this.anim) {
      const a = this.anim;
      a.t += dt / a.duration;
      const t = easeInOutCubic(Math.min(1, a.t));
      c.target.lerpVectors(a.from.target, a.to.target, t);
      // Zoom in log space so big changes in distance feel even.
      c.dist = Math.exp(lerp(Math.log(a.from.dist), Math.log(a.to.dist), t));
      c.az = lerp(a.from.az, a.to.az, t);
      c.el = lerp(a.from.el, a.to.el, t);
      if (a.t >= 1) this.anim = null;
    } else {
      if (this.autoSpin && this.idleSeconds() > 6) g.az += this.autoSpin * dt;
      const k = 7;
      c.target.x = damp(c.target.x, g.target.x, k, dt);
      c.target.y = damp(c.target.y, g.target.y, k, dt);
      c.target.z = damp(c.target.z, g.target.z, k, dt);
      c.dist = Math.exp(damp(Math.log(c.dist), Math.log(g.dist), k, dt));
      c.az = damp(c.az, g.az, k * 1.4, dt);
      c.el = damp(c.el, g.el, k * 1.4, dt);
    }
    this.apply();
  }

  apply() {
    const c = this.cur;
    const cam = this.camera;
    const cosEl = Math.cos(c.el);
    cam.position.set(
      c.target.x + c.dist * cosEl * Math.sin(c.az),
      c.target.y + c.dist * Math.sin(c.el),
      c.target.z + c.dist * cosEl * Math.cos(c.az),
    );
    // Never go underground.
    if (cam.position.y < 2) cam.position.y = 2;
    cam.lookAt(c.target);
    cam.near = clamp(c.dist * 0.015, 0.4, 3000);
    cam.far = Math.max(90000, c.dist * 4 + c.target.y * 3 + this.extraFar);
    cam.updateProjectionMatrix();
  }
}
