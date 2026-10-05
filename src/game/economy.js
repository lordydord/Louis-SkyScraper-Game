// Coins. Building is always free; finished towers pay out, and taller pays more.

export function finishCoins(heightM) {
  if (heightM <= 0) return 0;
  const base = heightM <= 1000 ? heightM : 1000 * (1 + 4.5 * Math.log10(heightM / 1000));
  return Math.max(20, Math.round(base / 5) * 5);
}

// Finished towers keep making coin bubbles for Louie to tap.
export function bubbleCoins(heightM) {
  return Math.max(5, Math.round((finishCoins(heightM) * 0.08) / 5) * 5);
}

export const BUBBLE_MIN_S = 35;
export const BUBBLE_MAX_S = 75;
