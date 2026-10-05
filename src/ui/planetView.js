import { el, button } from './dom.js';
import { BODIES } from '../data/planets.js';
import { planetTexture } from '../three/planetTextures.js';
import { formatNumber } from '../util/format.js';

// Tap a planet in the night sky: see it next to Earth at true size, with its width
// in kilometres and a row of little Earths (or planets) to show how many fit across.

function drawBody(ctx, name, cx, cy, r) {
  if (r < 0.5) {
    ctx.fillStyle = '#ccc';
    ctx.beginPath();
    ctx.arc(cx, cy, 1.2, 0, Math.PI * 2);
    ctx.fill();
    return;
  }
  const tex = planetTexture(name, 256).image;
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.clip();
  // Show the front half of the equirectangular map.
  ctx.drawImage(tex, tex.width * 0.25, 0, tex.width * 0.5, tex.height, cx - r, cy - r, r * 2, r * 2);
  const shade = ctx.createRadialGradient(cx - r * 0.35, cy - r * 0.35, r * 0.1, cx, cy, r);
  shade.addColorStop(0, 'rgba(255,255,255,0.12)');
  shade.addColorStop(0.7, 'rgba(0,0,0,0)');
  shade.addColorStop(1, 'rgba(0,0,0,0.55)');
  ctx.fillStyle = shade;
  ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
  ctx.restore();
  if (name === 'saturn') {
    ctx.strokeStyle = 'rgba(230,210,160,0.85)';
    ctx.lineWidth = Math.max(1, r * 0.12);
    ctx.beginPath();
    ctx.ellipse(cx, cy, r * 1.8, r * 0.45, -0.2, 0, Math.PI * 2);
    ctx.stroke();
  }
  if (name === 'sun') {
    const glow = ctx.createRadialGradient(cx, cy, r * 0.9, cx, cy, r * 1.15);
    glow.addColorStop(0, 'rgba(255,200,80,0.6)');
    glow.addColorStop(1, 'rgba(255,200,80,0)');
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(cx, cy, r * 1.15, 0, Math.PI * 2);
    ctx.fill();
  }
}

export class PlanetView {
  constructor(parent, { voice, audio, onClose }) {
    this.parent = parent;
    this.voice = voice;
    this.audio = audio;
    this.onClose = onClose;
    this.root = null;
  }

  get open() {
    return !!this.root;
  }

  show(id) {
    this.close(true);
    const body = BODIES[id];
    if (!body) return;
    const earth = BODIES.earth;
    const W = window.innerWidth;
    const H = window.innerHeight;
    const root = el('div', 'planet-view tap');
    const big = Math.max(body.d, earth.d);
    const maxR = Math.min(H * 0.33, W * 0.22);
    const scale = maxR / (big / 2);
    const rBody = (body.d / 2) * scale;
    const rEarth = (earth.d / 2) * scale;

    const make = (name, d, r) => {
      const wrap = el('div', 'body');
      const size = Math.max(16, Math.ceil(r * 2 + (name === 'saturn' ? r * 1.8 : 4)));
      const canvas = document.createElement('canvas');
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      canvas.width = size * dpr;
      canvas.height = size * dpr;
      canvas.style.width = size + 'px';
      canvas.style.height = size + 'px';
      const ctx = canvas.getContext('2d');
      ctx.scale(dpr, dpr);
      drawBody(ctx, name, size / 2, size / 2, r);
      if (r < 6) {
        ctx.strokeStyle = 'rgba(255,220,90,0.9)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(size / 2, size / 2, 7, 0, Math.PI * 2);
        ctx.stroke();
      }
      wrap.appendChild(canvas);
      wrap.appendChild(el('div', 'km', `${formatNumber(d)} <small>km</small>`));
      return wrap;
    };

    if (id !== 'earth') root.appendChild(make(id, body.d, rBody));
    root.appendChild(make('earth', earth.d, rEarth));

    // How many fit across: "11 x Earth" drawn as a row of little Earths.
    const ratio = body.d / earth.d;
    const times = ratio >= 1 ? ratio : 1 / ratio;
    if (id !== 'earth' && times >= 1.5) {
      const n = Math.round(times);
      const t = el('div', 'times');
      const small = ratio >= 1 ? 'earth' : id;
      const count = Math.min(n, 120);
      const dot = Math.max(6, Math.min(34, (W * 0.8) / count / 1.15));
      const c = document.createElement('canvas');
      c.width = Math.ceil(count * dot * 1.15) + 4;
      c.height = Math.ceil(dot) + 4;
      const ctx = c.getContext('2d');
      for (let i = 0; i < count; i++) drawBody(ctx, small, 2 + dot / 2 + i * dot * 1.15, 2 + dot / 2, dot / 2);
      t.innerHTML = `<span>${formatNumber(n)} ×</span>`;
      t.style.display = 'flex';
      t.style.alignItems = 'center';
      t.style.gap = '14px';
      t.appendChild(c);
      root.appendChild(t);
    }

    const close = button('close', { color: 'glass', onTap: () => this.close() });
    close.classList.add('close');
    root.appendChild(close);
    root.addEventListener('pointerdown', (e) => {
      if (e.target === root) this.close();
    });
    this.parent.appendChild(root);
    this.root = root;
    this.audio?.milestone();
    this.voice?.say(body.say, { important: true });
  }

  close(silent = false) {
    if (!this.root) return;
    this.root.remove();
    this.root = null;
    if (!silent && this.onClose) this.onClose();
  }
}
