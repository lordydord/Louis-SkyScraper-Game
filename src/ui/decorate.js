import { el, onTapped, button, flash, setGlow } from './dom.js';
import { icon } from './icons.js';
import {
  WALL_COLOURS,
  GLASS_COLOURS,
  LIGHT_COLOURS,
  LIGHT_PATTERNS,
  LIGHT_PRICES,
  EXTRAS,
  EXTRAS_ORDER,
} from '../data/pieces.js';
import { formatNumber } from '../util/format.js';

// Decorating a finished tower: paint, glass, light shows, rooftop extras, fireworks.

const hex = (n) => '#' + n.toString(16).padStart(6, '0');

// Little pictures of each light show on a tower shape.
function patternSvg(p, colour) {
  const c = colour === -1 ? 'url(#rb)' : hex(colour);
  const tower = (inner) => `<svg viewBox="0 0 84 66"><defs><linearGradient id="rb" x1="0" y1="1" x2="0" y2="0">
    <stop offset="0" stop-color="#ff4d4d"/><stop offset=".25" stop-color="#ffd23f"/><stop offset=".5" stop-color="#52e06a"/><stop offset=".75" stop-color="#45d6ff"/><stop offset="1" stop-color="#b05cff"/></linearGradient>
    <clipPath id="tw"><rect x="28" y="6" width="28" height="56" rx="3"/></clipPath></defs>
    <rect x="0" y="0" width="84" height="66" fill="#16233f"/>
    <rect x="28" y="6" width="28" height="56" rx="3" fill="#2b3a5c"/>
    <g clip-path="url(#tw)">${inner}</g></svg>`;
  switch (p) {
    case 'off':
      return `<svg viewBox="0 0 84 66"><rect width="84" height="66" fill="#16233f"/><rect x="28" y="6" width="28" height="56" rx="3" fill="#2b3a5c"/><path d="M20 10 64 58" stroke="#ff5a52" stroke-width="6" stroke-linecap="round"/></svg>`;
    case 'solid':
      return tower(`<rect x="0" y="0" width="84" height="66" fill="${c}"/>`);
    case 'wave':
      return tower(`${[10, 26, 42, 58].map((y) => `<rect x="0" y="${y}" width="84" height="7" fill="${c}"/>`).join('')}`);
    case 'sparkle':
      return tower(
        `${[
          [33, 12],
          [47, 18],
          [38, 28],
          [50, 36],
          [34, 44],
          [46, 52],
          [40, 58],
        ]
          .map(([x, y]) => `<circle cx="${x}" cy="${y}" r="3" fill="${c}"/>`)
          .join('')}`,
      );
    case 'stripes':
      return tower(`${[30, 40, 50].map((x) => `<rect x="${x}" y="0" width="5" height="66" fill="${c}"/>`).join('')}`);
    case 'breathe':
      return tower(`<rect x="0" y="0" width="84" height="66" fill="${c}" opacity=".55"/><circle cx="42" cy="34" r="10" fill="${c}"/>`);
    case 'heart':
      return tower(`<path d="M42 50 31 39a7 7 0 0 1 11-9 7 7 0 0 1 11 9z" fill="${c}"/>`);
    case 'star':
      return tower(`<path d="m42 22 4 9 10 1-7.5 6.5 2.5 9.5-9-5.5-9 5.5 2.5-9.5L28 32l10-1z" fill="${c}"/>`);
    default:
      return tower('');
  }
}

const EXTRA_SVG = {
  beacons: `<svg viewBox="0 0 84 66"><rect width="84" height="66" fill="#16233f"/><rect x="26" y="26" width="32" height="40" fill="#8aa3c4"/><rect x="40" y="8" width="4" height="18" fill="#cfd8e3"/><circle cx="42" cy="8" r="5" fill="#ff3b30"/><circle cx="28" cy="26" r="4" fill="#ff3b30"/><circle cx="56" cy="26" r="4" fill="#ff3b30"/></svg>`,
  flag: `<svg viewBox="0 0 84 66"><rect width="84" height="66" fill="#bfe3ff"/><rect x="24" y="8" width="4" height="54" fill="#8a96a3"/><rect x="28" y="10" width="34" height="22" fill="#2f6fe0"/><path d="m45 15 3.5 6 6.5.5-5 4 1.5 6.5L45 28.5 39.5 32l1.5-6.5-5-4 6.5-.5z" fill="#ffd23f"/></svg>`,
  garden: `<svg viewBox="0 0 84 66"><rect width="84" height="66" fill="#bfe3ff"/><rect x="10" y="48" width="64" height="18" fill="#4f9a46"/><rect x="26" y="34" width="5" height="16" fill="#7a5533"/><circle cx="28.5" cy="28" r="12" fill="#5bb04c"/><rect x="52" y="38" width="4" height="12" fill="#7a5533"/><circle cx="54" cy="34" r="9" fill="#3f8f3a"/></svg>`,
  helipad: `<svg viewBox="0 0 84 66"><rect width="84" height="66" fill="#bfe3ff"/><circle cx="42" cy="33" r="26" fill="#3b3f46"/><circle cx="42" cy="33" r="22" fill="none" stroke="#ffd23f" stroke-width="3"/><path d="M33 21v24M51 21v24M33 33h18" stroke="#fff" stroke-width="5"/></svg>`,
  pool: `<svg viewBox="0 0 84 66"><rect width="84" height="66" fill="#f4f1ea"/><rect x="10" y="12" width="64" height="42" rx="6" fill="#2bb3e0"/><path d="M14 28c6-4 10 4 16 0s10 4 16 0 10 4 16 0 8 3 8 3M14 40c6-4 10 4 16 0s10 4 16 0 10 4 16 0 8 3 8 3" stroke="#bff0ff" stroke-width="3" fill="none"/></svg>`,
  spotlights: `<svg viewBox="0 0 84 66"><rect width="84" height="66" fill="#0f1a33"/><path d="M30 60 14 0h12l8 60zM54 60 70 0H58l-8 60z" fill="#fff8c8" opacity=".75"/><rect x="24" y="56" width="36" height="10" fill="#5b6b86"/></svg>`,
};

const TABS = [
  { id: 'wall', icon: 'paint', color: 'orange' },
  { id: 'glass', icon: 'window', color: '' },
  { id: 'lights', icon: 'bulb', color: 'yellow' },
  { id: 'roof', icon: 'roof', color: 'purple' },
  { id: 'fireworks', icon: 'firework', color: 'red' },
];

export class DecorateBar {
  constructor(parent, { store, getDeco, onChange, onFirework, onTab }) {
    this.store = store;
    this.getDeco = getDeco;
    this.onChange = onChange;
    this.onFirework = onFirework;
    this.onTab = onTab;
    this.root = el('div', 'deco');
    this.options = el('div', 'options tap');
    const tabs = el('div', 'tabs');
    this.tabEls = {};
    for (const t of TABS) {
      const b = button(t.icon, { color: t.color, onTap: () => this.setTab(t.id) });
      tabs.appendChild(b);
      this.tabEls[t.id] = b;
    }
    this.root.appendChild(this.options);
    this.root.appendChild(tabs);
    parent.appendChild(this.root);
    this._select('lights');
  }

  // Louie tapped a tab.
  setTab(id) {
    this._select(id);
    if (this.onTab) this.onTab(id);
  }

  _select(id) {
    this.tab = id;
    for (const [k, b] of Object.entries(this.tabEls)) b.classList.toggle('on', k === id);
    this.render();
  }

  _price(key, price) {
    return this.store.isUnlocked(key) ? '' : `<div class="price">${icon('coin')}<span>${formatNumber(price)}</span></div>`;
  }

  // Buy something if needed; returns true if Louie may use it now.
  _ensure(key, price, elem) {
    if (this.store.isUnlocked(key)) return true;
    if (this.store.unlock(key, price)) {
      flash(elem, 'pop', 400);
      this.onChange({ unlocked: key });
      return true;
    }
    flash(elem, 'shake', 450);
    this.onChange({ denied: key });
    return false;
  }

  render() {
    const o = this.options;
    o.innerHTML = '';
    o.classList.remove('two-rows');
    const deco = this.getDeco();
    if (this.tab === 'wall' || this.tab === 'glass') {
      const list = this.tab === 'wall' ? WALL_COLOURS : GLASS_COLOURS;
      list.forEach((c, i) => {
        const s = el('div', `swatch tap ${c == null ? 'none' : ''}`);
        if (c != null) s.style.background = hex(c);
        s.classList.toggle('on', (deco[this.tab] || 0) === i);
        onTapped(s, () => {
          this.onChange({ [this.tab]: i });
          this.render();
        });
        o.appendChild(s);
      });
    } else if (this.tab === 'lights') {
      // Two rows: light-show patterns on top, colours underneath.
      o.classList.add('two-rows');
      const row1 = el('div', 'row');
      const row2 = el('div', 'row');
      o.append(row1, row2);
      const light = deco.light || { c: 0, p: 'off' };
      LIGHT_PATTERNS.forEach((p) => {
        const t = el('div', 'tile tap', patternSvg(p, LIGHT_COLOURS[light.c] ?? 0xffffff) + this._price('light:' + p, LIGHT_PRICES[p]));
        t.classList.toggle('on', light.p === p);
        t.classList.toggle('locked', !this.store.isUnlocked('light:' + p));
        onTapped(t, () => {
          if (!this._ensure('light:' + p, LIGHT_PRICES[p], t)) return;
          this.onChange({ light: { ...light, p } });
          this.render();
        });
        row1.appendChild(t);
      });
      LIGHT_COLOURS.forEach((c, i) => {
        const s = el('div', `swatch tap ${c === -1 ? 'rainbow' : ''}`);
        if (c !== -1) s.style.background = hex(c);
        s.classList.toggle('on', light.c === i);
        onTapped(s, () => {
          const p = light.p === 'off' ? 'solid' : light.p;
          this.onChange({ light: { c: i, p } });
          this.render();
        });
        row2.appendChild(s);
      });
    } else if (this.tab === 'roof') {
      const ex = deco.extras || {};
      for (const id of EXTRAS_ORDER) {
        const t = el('div', 'tile tap', EXTRA_SVG[id] + this._price('extra:' + id, EXTRAS[id].price));
        t.classList.toggle('on', !!ex[id]);
        t.classList.toggle('locked', !this.store.isUnlocked('extra:' + id));
        onTapped(t, () => {
          if (!this._ensure('extra:' + id, EXTRAS[id].price, t)) return;
          this.onChange({ extras: { ...ex, [id]: !ex[id] } });
          this.render();
        });
        o.appendChild(t);
      }
    } else if (this.tab === 'fireworks') {
      const b = button('firework', { color: 'red', size: 'big', onTap: () => this.onFirework() });
      b.style.margin = '0 auto';
      o.appendChild(b);
      this.fireworkBtn = b;
    }
  }

  glowTab(id) {
    for (const [k, b] of Object.entries(this.tabEls)) setGlow(b, k === id);
  }

  show(on) {
    this.root.classList.toggle('hidden', !on);
  }
}
