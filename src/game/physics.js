// How much a tower wobbles. Pure functions, unit tested.
//
// Two real effects, simplified:
// - Wind sway grows with slenderness (height / width near the base). That's why real
//   skyscrapers are wide at the bottom and why super-slim towers need dampers.
// - Self-weight: the base carries everything above it, scaled by gravity. Tapering
//   (narrower towards the top) makes this much smaller.
// The Moon has no air (no wind at all) and 1/6 gravity, so towers can go far higher.

import { layout, towerHeight, hasBridge } from './towerModel.js';

const SWAY_SLENDERNESS = 22; // slenderness that gives a wobble of about 1 on Earth
const CRUSH_HEIGHT = 3000; // a uniform tower this tall is at its limit on Earth
const DAMPER_FACTOR = 0.72;

export function computeWobble(tower, world) {
  const lay = layout(tower);
  const H = towerHeight(tower);
  if (H <= 0) return { value: 0, sway: 0, strain: 0, period: 2, H, Hs: 0, slenderness: 0 };

  // Toppers are thin and light, so they count for less.
  let Hs = 0;
  for (const it of lay) Hs += it.top ? 0.3 * it.part.h : it.part.h;

  let num = 0;
  let den = 0;
  let massW2H = 0;
  let baseW = 0;
  let dampers = 0;
  for (const it of lay) {
    if (it.top) continue;
    if (!baseW) baseW = it.w;
    const h = it.part.h;
    const wAvg = (it.w + it.topW) / 2;
    const zc = (it.z0 + it.z1) / 2;
    const k = Math.pow(1 - Math.min(zc / Hs, 1), 2) + 0.05;
    num += wAvg * h * k;
    den += h * k;
    massW2H += wAvg * wAvg * h;
    if (it.part.t === 'damper') dampers++;
  }
  if (!baseW) {
    // Only a topper on the ground: treat like a short, thin thing.
    return { value: 0, sway: 0, strain: 0, period: 1.5, H, Hs, slenderness: 0 };
  }

  let W = num / den;
  // Twin towers joined by sky bridges brace each other.
  if (tower.twin && hasBridge(tower)) W *= 1.7;

  const slenderness = Hs / W;
  const sway = world.wind * Math.pow(slenderness / SWAY_SLENDERNESS, 1.6);
  const strain = (world.gravity * (massW2H / (baseW * baseW))) / CRUSH_HEIGHT;
  let value = Math.sqrt(sway * sway + strain * strain);
  value *= Math.pow(DAMPER_FACTOR, Math.min(dampers, 3));

  // Tall buildings sway slowly (the Burj Khalifa takes about 11 s).
  const period = Math.min(12, Math.max(1.2, Hs / 70));
  return { value, sway, strain, period, H, Hs, slenderness };
}

// 0 = green (steady), 1 = yellow (wobbly), 2 = red (very wobbly).
export function wobbleLevel(value) {
  return value < 0.5 ? 0 : value < 1 ? 1 : 2;
}

// How far the top of the tower moves sideways (metres) for the visual sway.
// Exaggerated so Louie can see it; capped so it never looks like it's falling.
export function swayAmplitude(w, world) {
  const v = Math.min(w.value, 3);
  const windiness = 0.25 + 0.75 * Math.min(1, world.wind);
  return w.H * (0.0008 + 0.012 * v * windiness);
}
