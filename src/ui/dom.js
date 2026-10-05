import { icon } from './icons.js';

export function el(tag, cls = '', html = '') {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html) e.innerHTML = html;
  return e;
}

// A round picture button. `onTap` fires on a normal tap; the button sinks while held.
export function button(iconName, { color = '', size = '', onTap = null, extra = '' } = {}) {
  const b = el('button', `btn tap ${color} ${size} ${extra}`.trim(), icon(iconName));
  b.type = 'button';
  if (onTap) onTapped(b, onTap);
  return b;
}

// Reliable tap handling for touch and mouse (ignores drags and scrolls).
export function onTapped(elem, fn) {
  let start = null;
  elem.addEventListener('pointerdown', (e) => {
    start = { x: e.clientX, y: e.clientY, t: performance.now() };
    elem.classList.add('pressed');
  });
  const end = (e, fire) => {
    elem.classList.remove('pressed');
    if (!start) return;
    const moved = Math.hypot(e.clientX - start.x, e.clientY - start.y);
    const s = start;
    start = null;
    if (fire && moved < 18 && performance.now() - s.t < 1200) fn(e);
  };
  elem.addEventListener('pointerup', (e) => end(e, true));
  elem.addEventListener('pointercancel', (e) => end(e, false));
  elem.addEventListener('pointerleave', (e) => {
    elem.classList.remove('pressed');
  });
}

export function setIcon(elem, name) {
  elem.innerHTML = icon(name);
}

export function flash(elem, cls, ms = 500) {
  elem.classList.remove(cls);
  void elem.offsetWidth;
  elem.classList.add(cls);
  setTimeout(() => elem.classList.remove(cls), ms);
}

export function setGlow(elem, on) {
  if (!elem) return;
  elem.classList.toggle('glow', !!on);
}
