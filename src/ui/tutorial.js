import { el } from './dom.js';
import { HAND } from './icons.js';

// The wordless helper: an animated hand that taps, drags or swipes to show Louie
// what to do. Its target can be an element or a function returning {x, y}.

const TIP = { x: 23, y: 6 };

export class Hand {
  constructor(parent) {
    this.el = el('div', 'hand hidden', HAND);
    parent.appendChild(this.el);
    this.target = null;
    this.mode = 'tap';
  }

  // mode: 'tap', 'drag-up' or 'swipe' (CSS animation classes are prefixed with
  // "h-" so they never clash with the ".tap" class that makes things touchable).
  point(target, mode = 'tap') {
    this.target = target;
    if (mode !== this.mode) {
      this.el.classList.remove('h-' + this.mode);
      this.mode = mode;
    }
    this.el.classList.add('h-' + mode);
    this.el.classList.remove('hidden');
    this.update();
  }

  hide() {
    this.target = null;
    this.el.classList.add('hidden');
  }

  get visible() {
    return !!this.target;
  }

  update() {
    if (!this.target) return;
    let p = null;
    if (typeof this.target === 'function') p = this.target();
    else if (this.target instanceof Element) {
      const r = this.target.getBoundingClientRect();
      if (r.width === 0) p = null;
      else p = { x: r.left + r.width * 0.55, y: r.top + r.height * 0.55 };
    } else p = this.target;
    if (!p) {
      this.el.style.display = 'none';
      return;
    }
    this.el.style.display = '';
    this.el.style.left = p.x - TIP.x + 'px';
    this.el.style.top = p.y - TIP.y + 'px';
  }
}
