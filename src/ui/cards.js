// Illustrations for the place cards on the main menu (pure SVG, no words).

const stars = (n, seed = 1) => {
  let s = seed;
  const r = () => ((s = (s * 9301 + 49297) % 233280) / 233280);
  let out = '';
  for (let i = 0; i < n; i++) out += `<circle cx="${(r() * 224).toFixed(1)}" cy="${(r() * 120).toFixed(1)}" r="${(0.6 + r() * 1.4).toFixed(1)}" fill="#fff" opacity="${(0.5 + r() * 0.5).toFixed(2)}"/>`;
  return out;
};

export const PLACE_ART = {
  dubai: `<svg viewBox="0 0 224 236" preserveAspectRatio="xMidYMid slice">
    <defs><linearGradient id="dbs" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ff9f5a"/><stop offset=".6" stop-color="#ffd59a"/><stop offset="1" stop-color="#fff0cf"/></linearGradient></defs>
    <rect width="224" height="236" fill="url(#dbs)"/>
    <circle cx="170" cy="70" r="22" fill="#fff6d8"/>
    <rect y="168" width="224" height="22" fill="#3d9ad1"/>
    <rect y="186" width="224" height="50" fill="#e6c78f"/>
    <path d="M104 186V150h4v-40h3V70h2V40l1-26 1 26v30h2v40h3v40h4v36z" fill="#5d7088"/>
    <path d="M36 186V120h14v66zM60 186V96h12v90zM150 186v-60h14v60zM178 186V104h12v82z" fill="#6f8299" opacity=".85"/>
    <path d="M200 168c-14-30-16-60-6-84 2 30 6 56 14 84z" fill="#fff" stroke="#9fb0c2" stroke-width="2"/>
    <path d="M20 190c2-16 2-26-2-36M18 154c-8-2-14 2-16 6M18 154c6-6 14-6 18-2M18 154c-2-8 2-12 6-14" stroke="#4f7f3a" stroke-width="3" fill="none" stroke-linecap="round"/>
  </svg>`,
  newyork: `<svg viewBox="0 0 224 236" preserveAspectRatio="xMidYMid slice">
    <defs><linearGradient id="nys" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#4f8fe8"/><stop offset="1" stop-color="#bfe0ff"/></linearGradient></defs>
    <rect width="224" height="236" fill="url(#nys)"/>
    <path d="M48 196V130h20v66zM70 196V110h16v86zM88 196V60l6-10 6 10v136zM108 196V96h4V78l5-12 5 12v18h4v100zM130 196v-74h18v74zM150 196v-96h14v96zM166 196v-60h16v60zM184 196v-80h14v80z" fill="#43566f"/>
    <path d="M94 50V28" stroke="#43566f" stroke-width="3"/>
    <path d="M117 66V48" stroke="#43566f" stroke-width="2"/>
    <rect y="196" width="224" height="40" fill="#2f6c98"/>
    <path d="M24 196v-22h10v22z" fill="#4f6f5f"/>
    <path d="M26 174l3-34 3 34z" fill="#6fa892"/>
    <path d="M30 144l4-12" stroke="#6fa892" stroke-width="3" stroke-linecap="round"/>
    <circle cx="35" cy="130" r="3" fill="#ffcf3f"/>
  </svg>`,
  moon: `<svg viewBox="0 0 224 236" preserveAspectRatio="xMidYMid slice">
    <rect width="224" height="236" fill="#05060c"/>${stars(46, 3)}
    <circle cx="160" cy="62" r="30" fill="#3d7fe0"/>
    <path d="M140 52c8-6 16 0 20-6 6 4 12 0 16 6-4 6-14 10-20 8-8 0-12-4-16-8zM150 76c6 2 12-2 16 2-4 4-12 4-16-2z" fill="#5fb05a"/>
    <path d="M132 62a30 30 0 0 0 46 24 30 30 0 0 1-46-24z" fill="#000" opacity=".35"/>
    <path d="M0 176c40-14 90-12 130-4s70 6 94 0v64H0z" fill="#8e8e93"/>
    <ellipse cx="50" cy="200" rx="22" ry="6" fill="#6e6e74"/>
    <ellipse cx="160" cy="214" rx="30" ry="7" fill="#6e6e74"/>
    <path d="M86 182a20 20 0 0 1 40 0z" fill="#f1f1ee"/>
    <rect x="100" y="150" width="4" height="32" fill="#d9d9d9"/>
  </svg>`,
  mars: `<svg viewBox="0 0 224 236" preserveAspectRatio="xMidYMid slice">
    <defs><linearGradient id="mrs" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#b9805a"/><stop offset="1" stop-color="#e8bf92"/></linearGradient></defs>
    <rect width="224" height="236" fill="url(#mrs)"/>
    <circle cx="60" cy="74" r="10" fill="#fdf5e6"/>
    <circle cx="60" cy="74" r="20" fill="#9cc2ef" opacity=".35"/>
    <path d="M0 150c30-10 40-30 70-34s50 20 80 22 52-10 74-6v104H0z" fill="#a8532f"/>
    <path d="M0 180c50-8 120-10 224-2v58H0z" fill="#c4683a"/>
    <rect x="120" y="170" width="30" height="12" rx="3" fill="#f2f2f2"/>
    <circle cx="124" cy="186" r="5" fill="#333"/><circle cx="146" cy="186" r="5" fill="#333"/>
    <path d="M140 170v-14" stroke="#ddd" stroke-width="2"/><circle cx="140" cy="154" r="3" fill="#2c6fd6"/>
  </svg>`,
};

// A tiny skyline drawing of Louie's own city (bars for each tower, log height).
export function skylineArt(heights) {
  const sorted = heights.slice(0, 7);
  const max = Math.max(...sorted, 100);
  const bars = sorted
    .map((h, i) => {
      const bh = 30 + (Math.log10(Math.max(h, 10)) / Math.log10(Math.max(max, 10))) * 150;
      const x = 20 + i * 27;
      return `<rect x="${x}" y="${196 - bh}" width="20" height="${bh}" rx="3" fill="#9fc4ff"/><rect x="${x + 4}" y="${200 - bh}" width="12" height="${bh - 8}" fill="#cfe2ff" opacity=".5"/>`;
    })
    .join('');
  return `<svg viewBox="0 0 224 236" preserveAspectRatio="xMidYMid slice">
    <defs><linearGradient id="sk" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#1b2f5e"/><stop offset="1" stop-color="#4f6fb0"/></linearGradient></defs>
    <rect width="224" height="236" fill="url(#sk)"/>${stars(20, 9)}${bars}<rect y="196" width="224" height="40" fill="#5f9a4f"/></svg>`;
}
