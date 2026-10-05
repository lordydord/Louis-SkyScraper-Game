// Picture icons (inline SVG, 24x24). Louie can't read yet, so every button is a picture.

const S = (body, extra = '') =>
  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" ${extra}>${body}</svg>`;

export const ICONS = {
  home: S('<path d="M3 11.5 12 4l9 7.5"/><path d="M5.5 10v9.5h5v-5h3v5h5V10"/>'),
  soundOn: S('<path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z" fill="currentColor"/><path d="M15.5 9a4 4 0 0 1 0 6"/><path d="M18 6.5a7.5 7.5 0 0 1 0 11"/>'),
  soundOff: S('<path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z" fill="currentColor"/><path d="m16 9.5 5 5M21 9.5l-5 5"/>'),
  sun: S('<circle cx="12" cy="12" r="4.2" fill="currentColor"/><path d="M12 2.5v2.2M12 19.3v2.2M2.5 12h2.2M19.3 12h2.2M5.3 5.3l1.6 1.6M17.1 17.1l1.6 1.6M5.3 18.7l1.6-1.6M17.1 6.9l1.6-1.6"/>'),
  moon: S('<path d="M19.5 14.5A8 8 0 0 1 9.5 4.5a7.6 7.6 0 1 0 10 10z" fill="currentColor"/><path d="M17 4.5v2.4M15.8 5.7h2.4" stroke-width="1.6"/>'),
  ruler: S(
    '<rect x="8" y="2.5" width="8" height="19" rx="1.5" fill="currentColor" fill-opacity=".25"/><path d="M8 6h3.5M8 9.5h2M8 13h3.5M8 16.5h2M8 20h3.5"/>',
  ),
  lift: S(
    '<path d="M9.5 2v4.5" stroke-width="1.6"/><rect x="3.5" y="6.5" width="12" height="15" rx="2" fill="currentColor" fill-opacity=".25"/><circle cx="9.5" cy="11.3" r="1.7" fill="currentColor"/><path d="M9.5 13.5v4.8M7.4 15.6h4.2" stroke-width="1.8"/><path d="M19.5 18V5.5M16.8 8.2l2.7-2.7 2.7 2.7" stroke-width="2.2"/>',
  ),
  undo: S('<path d="M9 14 4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11"/>'),
  tick: S('<path d="m4.5 12.5 5 5 10-11" stroke-width="3"/>'),
  plus: S('<path d="M12 4.5v15M4.5 12h15" stroke-width="3"/>'),
  close: S('<path d="m6 6 12 12M18 6 6 18" stroke-width="2.8"/>'),
  back: S('<path d="M15 4.5 7.5 12l7.5 7.5" stroke-width="3"/>'),
  play: S('<path d="M8 4.8v14.4L19.5 12z" fill="currentColor"/>'),
  photos: S(
    '<rect x="6.5" y="3.5" width="14" height="11" rx="1.5"/><path d="M3.5 7.5v11a1.5 1.5 0 0 0 1.5 1.5h12"/><path d="m8.5 13 3.2-3.5 2.6 2.7 1.8-1.8 2.9 3" stroke-width="1.7"/><circle cx="16.5" cy="7" r="1.2" fill="currentColor"/>',
  ),
  skyline: S(
    '<path d="M3 21V11h4v10M7 21V5h5v16M12 21V8.5h4V21M16 21v-7h5v7" fill="currentColor" fill-opacity=".3"/><path d="M2 21h20"/>',
  ),
  trophy: S('<path d="M7 4h10v5a5 5 0 0 1-10 0z" fill="currentColor"/><path d="M7 6H4.5v1.5A3 3 0 0 0 7.5 10.5M17 6h2.5v1.5a3 3 0 0 1-3 3M12 14v4M8 21h8M9.5 18h5"/>'),
  paint: S(
    '<rect x="3.5" y="3.5" width="14" height="6" rx="1.5" fill="currentColor"/><path d="M17.5 6.5h2v5.5h-8v2.5"/><rect x="10" y="14.5" width="3" height="6.5" rx="1" fill="currentColor"/>',
  ),
  window: S('<rect x="4" y="3" width="16" height="18" rx="1.5"/><path d="M12 3v18M4 12h16"/><path d="M6.5 5.5l3 3" stroke-width="1.4"/>'),
  bulb: S(
    '<path d="M9 17.5h6M9.8 20.5h4.4"/><path d="M12 2.8a6.2 6.2 0 0 0-3.6 11.3c.4.3.6.8.6 1.3v.6h6v-.6c0-.5.2-1 .6-1.3A6.2 6.2 0 0 0 12 2.8z" fill="currentColor" fill-opacity=".35"/>',
  ),
  roof: S(
    '<path d="M4 21V12h16v9" fill="currentColor" fill-opacity=".25"/><path d="M2.5 12h19"/><path d="M8 12V4"/><path d="M8 4.5h6.5L13 6.8l1.5 2.2H8" fill="currentColor"/><circle cx="17" cy="10" r="1.3" fill="#ff4a3d" stroke="none"/>',
  ),
  firework: S(
    '<path d="M12 12v9" stroke-width="1.8"/><path d="M12 3v3M12 9v.5M5.6 5.6l2.1 2.1M16.3 7.7l2.1-2.1M3 12h3M18 12h3M7.2 16.8l1.6-1.6M15.2 15.2l1.6 1.6" />',
  ),
  coin: S('<circle cx="12" cy="12" r="9" fill="#ffcf3f" stroke="#c98f12"/><path d="m12 7 1.5 3.1 3.4.5-2.5 2.4.6 3.4L12 14.8 9 16.4l.6-3.4-2.5-2.4 3.4-.5z" fill="#fff3c4" stroke="none"/>'),
  lock: S('<rect x="5" y="11" width="14" height="10" rx="2" fill="currentColor"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>'),
  crane: S(
    '<path d="M6 21V5M6 5h14M6 5l4-2.5M6 9l4-4M9 5v0M17 5v6"/><rect x="15.5" y="11" width="3" height="3" fill="currentColor"/><path d="M3 21h6"/>',
  ),
  twin: S(
    '<path d="M4 21V6l3-2 3 2v15M14 21V6l3-2 3 2v15" fill="currentColor" fill-opacity=".3"/><path d="M10 11h4"/>',
  ),
  single: S('<path d="M8.5 21V6L12 3.5 15.5 6v15" fill="currentColor" fill-opacity=".3"/><path d="M11 9h2M11 13h2M11 17h2" stroke-width="1.6"/>'),
  wobble: S(
    '<path d="M10.5 21V7l2-3 2 3v14" fill="currentColor" fill-opacity=".35"/><path d="M5 9c-1 1.8-1 4.2 0 6M19 9c1 1.8 1 4.2 0 6M7.5 10.5c-.5 1-.5 2 0 3M16.5 10.5c.5 1 .5 2 0 3" stroke-width="1.6"/>',
  ),
  camera: S('<path d="M4 8h3l1.5-2.5h7L17 8h3v11H4z" fill="currentColor" fill-opacity=".3"/><circle cx="12" cy="13" r="3.5"/>'),
  grid: S('<rect x="3.5" y="3.5" width="7" height="7" rx="1.2"/><rect x="13.5" y="3.5" width="7" height="7" rx="1.2"/><rect x="3.5" y="13.5" width="7" height="7" rx="1.2"/><rect x="13.5" y="13.5" width="7" height="7" rx="1.2"/>'),
  rotate: S('<path d="M20 12a8 8 0 1 1-2.3-5.6"/><path d="M20 4v4.5h-4.5"/>'),
  arrowUp: S('<path d="M12 19V5M5.5 11.5 12 5l6.5 6.5" stroke-width="3"/>'),
  arrowUpDown: S('<path d="M12 3.5v17M7 8l5-4.5L17 8M7 16l5 4.5 5-4.5" stroke-width="2.6"/>'),
  sparkle: S('<path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z" fill="currentColor"/>'),
  // Sky milestones (in colour).
  cloud: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 18.5h10.5a4 4 0 0 0 .4-8 5.5 5.5 0 0 0-10.6-1.2A4.6 4.6 0 0 0 7 18.5z" fill="#fff" stroke="#9fb8d8" stroke-width="1.4"/></svg>`,
  plane: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M21.5 12c0-.9-.8-1.5-1.7-1.5H15L10.2 3H8l2.6 7.5H6.2L4.4 8H3l1.2 4L3 16h1.4l1.8-2.5h4.4L8 21h2.2L15 13.5h4.8c.9 0 1.7-.6 1.7-1.5z" fill="#fff" stroke="#5f7fa8" stroke-width="1"/></svg>`,
  rocket: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2.5c3 2.2 4.5 5.5 4.5 9.5v4h-9v-4c0-4 1.5-7.3 4.5-9.5z" fill="#f4f6fa" stroke="#5f6f88" stroke-width="1.2"/><circle cx="12" cy="9.5" r="1.8" fill="#4f8fe8"/><path d="M7.5 12.5 5 16v2.5l2.5-1.5M16.5 12.5 19 16v2.5l-2.5-1.5" fill="#ff5a52"/><path d="M10 16.5 12 22l2-5.5z" fill="#ffb43a"/></svg>`,
  satellite: `<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="9.5" y="9" width="5" height="6" rx="1" fill="#e8ecf2" stroke="#5f6f88"/><rect x="1.5" y="9.5" width="7" height="5" fill="#2f5fb8" stroke="#9fc0f0" stroke-width=".8"/><rect x="15.5" y="9.5" width="7" height="5" fill="#2f5fb8" stroke="#9fc0f0" stroke-width=".8"/><path d="M12 9V5.5M10.5 5.5h3" stroke="#c9d3e0" stroke-width="1.4"/></svg>`,
};

// Pictures for the sky milestones that have no 3D model.
export const SKY_ICONS = { clouds: 'cloud', plane: 'plane', space: 'rocket', iss: 'satellite' };

// A friendly cartoon hand pointing up-left (the fingertip is at the top-left of the
// image) used by the wordless tutorial.
export const HAND = `<svg viewBox="0 0 64 64" aria-hidden="true">
  <path d="M16 6c2.8 0 5 2.2 5 5v15.5l2.2-.4c2-.4 3.9.8 4.5 2.7l.2.8 1.2-.3c2.2-.5 4.3.9 4.8 3l.1.5 1-.2c2.3-.4 4.4 1.1 4.8 3.4l1.4 9.3c.9 5.8-2.2 11.4-7.5 13.9l-1.8.8c-4.2 2-9.2 1.4-12.8-1.5l-8.2-6.6c-1.8-1.5-2.4-4-1.3-6.1 1.2-2.4 4.2-3.2 6.4-1.8l1 .6V11c0-2.8 2.2-5 5-5z" fill="#fff" stroke="#1d2a3a" stroke-width="2.6" stroke-linejoin="round"/>
  <path d="M21 27v8M28 29v7M34 32v5" stroke="#1d2a3a" stroke-width="2.2" stroke-linecap="round"/>
</svg>`;

export function icon(name) {
  return ICONS[name] || '';
}
