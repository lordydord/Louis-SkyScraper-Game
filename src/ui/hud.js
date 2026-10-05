import * as THREE from 'three';
import { el, flash } from './dom.js';
import { icon } from './icons.js';
import { formatNumber } from '../util/format.js';
import { wobbleLevel } from '../game/physics.js';
import { clamp, damp } from '../util/math.js';

const TOWER_SVG = `<svg viewBox="0 0 30 40" fill="currentColor"><path d="M11 40V9l4-7 4 7v31z" opacity=".95"/><path d="M5 40V18h6v22zM19 40V14h6v26z" opacity=".55"/></svg>`;

// Big height number (top left) with the wobble meter and the next famous building.
export class HeightPanel {
  constructor(parent) {
    this.root = el('div', 'hud-height');
    this.root.innerHTML = `
      <div class="row"><span class="tower-ico">${TOWER_SVG}</span><span class="num">0</span><span class="unit">m</span></div>
      <div class="wobble"><span class="w-ico">${icon('wobble')}</span><div class="bar"><div class="needle"></div></div></div>
      <div class="next-goal hidden"><span class="arrow">${icon('arrowUp')}</span><img alt=""><span class="gsvg"></span><span class="gh"></span></div>`;
    parent.appendChild(this.root);
    this.num = this.root.querySelector('.num');
    this.wob = this.root.querySelector('.wobble');
    this.needle = this.root.querySelector('.needle');
    this.goal = this.root.querySelector('.next-goal');
    this.goalImg = this.goal.querySelector('img');
    this.goalH = this.goal.querySelector('.gh');
    this.goalSvg = this.goal.querySelector('.gsvg');
    this.shown = 0;
    this.target = 0;
    this._goalKey = null;
  }

  setHeight(m, { instant = false } = {}) {
    this.target = m;
    if (instant) this.shown = m;
  }

  setWobble(value, visible = true) {
    this.wob.classList.toggle('hidden', !visible);
    if (!visible) return;
    const pct = clamp(value / 1.5, 0, 1) * 100;
    this.needle.style.left = pct + '%';
    this.wob.classList.toggle('red', wobbleLevel(value) === 2);
  }

  setGoal(lm, imgUrl) {
    if (!lm) {
      this.goal.classList.add('hidden');
      this._goalKey = null;
      return;
    }
    this.goal.classList.remove('hidden');
    if (this._goalKey !== lm.key) {
      this._goalKey = lm.key;
      const svg = imgUrl && imgUrl.startsWith('<svg');
      this.goalImg.src = imgUrl && !svg ? imgUrl : '';
      this.goalImg.classList.toggle('hidden', !imgUrl || svg);
      this.goalSvg.innerHTML = svg ? imgUrl : '';
      this.goalH.textContent = formatNumber(lm.h) + ' m';
      flash(this.goal, 'pop', 400);
    }
  }

  pop() {
    flash(this.root, 'pop', 400);
  }

  update(dt) {
    // Count smoothly towards the real height.
    if (Math.abs(this.target - this.shown) < 0.5) this.shown = this.target;
    else this.shown = Math.exp(damp(Math.log(Math.max(1, this.shown)), Math.log(Math.max(1, this.target)), 10, dt));
    if (this.target === 0) this.shown = 0;
    const txt = formatNumber(this.shown);
    if (this.num.textContent !== txt) this.num.textContent = txt;
  }
}

export class Coins {
  constructor(parent) {
    this.root = el('div', 'coins', `<span class="coin">${icon('coin')}</span><span class="n">0</span>`);
    parent.appendChild(this.root);
    this.n = this.root.querySelector('.n');
    this.coinEl = this.root.querySelector('.coin');
    this.shown = 0;
    this.target = 0;
  }

  set(v, instant = false) {
    this.target = v;
    if (instant) this.shown = v;
  }

  bump() {
    flash(this.root, 'pop', 350);
  }

  shake() {
    flash(this.root, 'shake', 450);
  }

  // Where flying coins should go.
  center() {
    const r = this.coinEl.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  }

  update(dt) {
    if (this.shown !== this.target) {
      const d = this.target - this.shown;
      this.shown += Math.sign(d) * Math.max(1, Math.ceil(Math.abs(d) * Math.min(1, dt * 6)));
      if (Math.abs(this.target - this.shown) < 1) this.shown = this.target;
    }
    const txt = formatNumber(this.shown);
    if (this.n.textContent !== txt) this.n.textContent = txt;
  }
}

// DOM labels pinned to 3D positions (heights over ghosts, tape measure numbers,
// coin bubbles...). Reuses elements each frame.
export class LabelLayer {
  constructor(parent) {
    this.root = el('div', 'labels');
    parent.appendChild(this.root);
    this.pool = new Map();
    this.used = new Set();
    this.v = new THREE.Vector3();
  }

  begin() {
    this.used.clear();
  }

  // Returns the element, or null if behind the camera.
  put(id, pos, camera, w, h, { cls = 'label3d', html = '', tap = null } = {}) {
    this.v.copy(pos).project(camera);
    if (this.v.z > 1 || this.v.z < -1) return null;
    const x = (this.v.x * 0.5 + 0.5) * w;
    const y = (-this.v.y * 0.5 + 0.5) * h;
    let e = this.pool.get(id);
    if (!e) {
      e = el('div', cls);
      if (tap) {
        e.classList.add('tap');
        e.addEventListener('pointerdown', (ev) => {
          ev.stopPropagation();
          tap(ev);
        });
      }
      this.root.appendChild(e);
      this.pool.set(id, e);
      e._html = null;
    }
    if (e._html !== html) {
      e.innerHTML = html;
      e._html = html;
    }
    if (e.className !== cls && !tap) e.className = cls;
    e.style.left = x.toFixed(1) + 'px';
    e.style.top = y.toFixed(1) + 'px';
    e.style.display = '';
    this.used.add(id);
    return e;
  }

  end() {
    for (const [id, e] of this.pool) {
      if (!this.used.has(id)) {
        e.remove();
        this.pool.delete(id);
      }
    }
  }

  clear() {
    for (const e of this.pool.values()) e.remove();
    this.pool.clear();
  }
}

// Coins flying from a point on screen to the coin counter.
export function flyCoins(parent, from, to, count, onEach) {
  const n = Math.min(14, Math.max(3, Math.round(Math.log2(count + 1) * 2)));
  for (let i = 0; i < n; i++) {
    const c = el('div', 'flying-coin', icon('coin'));
    parent.appendChild(c);
    const sx = from.x + (Math.random() - 0.5) * 80;
    const sy = from.y + (Math.random() - 0.5) * 60;
    c.style.left = sx + 'px';
    c.style.top = sy + 'px';
    const delay = i * 70;
    const anim = c.animate(
      [
        { transform: 'translate(0,0) scale(0.4)', opacity: 0 },
        { transform: `translate(${(Math.random() - 0.5) * 60}px, -40px) scale(1.1)`, opacity: 1, offset: 0.25 },
        { transform: `translate(${to.x - sx}px, ${to.y - sy}px) scale(0.7)`, opacity: 1 },
      ],
      { duration: 900, delay, easing: 'cubic-bezier(.5,0,.5,1)', fill: 'forwards' },
    );
    anim.onfinish = () => {
      c.remove();
      if (onEach) onEach(i, n);
    };
  }
}

// A big friendly pop-up in the middle (e.g. a famous building and its height).
let lastBurst = null;
export function burst(parent, html, ms = 2600) {
  if (lastBurst) lastBurst.remove();
  const b = el('div', 'burst', html);
  lastBurst = b;
  parent.appendChild(b);
  setTimeout(() => {
    b.animate([{ opacity: 1 }, { opacity: 0, transform: 'translate(-50%,-60%) scale(0.9)' }], { duration: 400, fill: 'forwards' }).onfinish =
      () => b.remove();
  }, ms);
  return b;
}
