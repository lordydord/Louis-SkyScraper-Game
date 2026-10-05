import { el, onTapped, flash, setGlow } from './dom.js';
import { icon } from './icons.js';
import { INVENTORY, PIECES } from '../data/pieces.js';
import { SIZES } from '../config.js';
import { formatNumber } from '../util/format.js';

// The building bar along the bottom: width choices, single/twin, and the pieces.

const SIZE_W = [12, 19, 27, 38];

export class Inventory {
  constructor(parent, { store, thumbs, onPiece, onSize, onTwin }) {
    this.store = store;
    this.root = el('div', 'inventory');
    parent.appendChild(this.root);

    const left = el('div', 'inv-group');
    this.sizesEl = el('div', 'sizes');
    this.sizeEls = SIZES.map((w, i) => {
      const s = el('div', 'size tap', `<i style="width:${SIZE_W[i]}px;height:${52 + i * 6}px"></i>`);
      onTapped(s, () => onSize(i));
      this.sizesEl.appendChild(s);
      return s;
    });
    left.appendChild(this.sizesEl);
    this.twinBtn = el('div', 'size tap twin-toggle', `<span style="width:38px;height:44px;display:block">${icon('twin')}</span>`);
    this.twinBtn.style.alignItems = 'center';
    this.twinBtn.style.paddingBottom = '0';
    this.twinBtn.style.width = '58px';
    onTapped(this.twinBtn, () => onTwin());
    left.appendChild(this.twinBtn);
    this.root.appendChild(left);

    const scroll = el('div', 'inv-group inv-scroll tap');
    const track = el('div', 'track');
    scroll.appendChild(track);
    this.root.appendChild(scroll);
    this.scroll = scroll;

    this.pieceEls = {};
    for (const id of INVENTORY) {
      const def = PIECES[id];
      const p = el('div', `piece tap ${def.cat === 'top' ? 'top' : ''}`);
      const img = el('img');
      img.alt = '';
      img.draggable = false;
      img.src = thumbs.piece(id);
      p.appendChild(img);
      onTapped(p, () => onPiece(id, p));
      track.appendChild(p);
      this.pieceEls[id] = p;
    }
    this.refresh();
  }

  refresh() {
    for (const id of INVENTORY) {
      const def = PIECES[id];
      const p = this.pieceEls[id];
      const locked = !this.store.isUnlocked(id);
      p.classList.toggle('locked', locked);
      let price = p.querySelector('.price');
      let lock = p.querySelector('.lock');
      if (locked) {
        if (!price) {
          price = el('div', 'price', `${icon('coin')}<span>${formatNumber(def.price)}</span>`);
          p.appendChild(price);
        }
        if (!lock) {
          lock = el('div', 'lock', icon('lock'));
          p.appendChild(lock);
        }
      } else {
        price?.remove();
        lock?.remove();
      }
    }
  }

  // Highlight the width of the selected section (-1 = none), or grey them out.
  setSize(index, enabled = true) {
    this.sizeEls.forEach((s, i) => {
      s.classList.toggle('on', i === index);
      s.classList.toggle('disabled', !enabled);
    });
  }

  setTwin(on) {
    this.twinBtn.classList.toggle('on', on);
  }

  piece(id) {
    return this.pieceEls[id];
  }

  shakePiece(id) {
    flash(this.pieceEls[id], 'shake', 450);
  }

  popPiece(id) {
    flash(this.pieceEls[id], 'pop', 400);
  }

  glow(ids = []) {
    for (const [id, p] of Object.entries(this.pieceEls)) setGlow(p, ids.includes(id));
  }

  glowSize(i) {
    this.sizeEls.forEach((s, k) => setGlow(s, k === i));
  }

  scrollTo(id) {
    const p = this.pieceEls[id];
    if (!p) return;
    const r = p.getBoundingClientRect();
    const sr = this.scroll.getBoundingClientRect();
    if (r.left < sr.left || r.right > sr.right) this.scroll.scrollLeft += r.left - sr.left - 20;
  }

  show(on) {
    this.root.classList.toggle('hidden', !on);
  }
}
