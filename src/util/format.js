// 1250 -> "1,250"
export function formatNumber(n) {
  const s = String(Math.round(Math.abs(n)));
  let out = '';
  for (let i = 0; i < s.length; i++) {
    if (i > 0 && (s.length - i) % 3 === 0) out += ',';
    out += s[i];
  }
  return (n < 0 ? '-' : '') + out;
}

// Words for the spoken voice, e.g. 1000 -> "1,000 metres".
export function spokenMetres(m) {
  if (m >= 1000 && m % 1000 === 0) {
    const km = m / 1000;
    return `${formatNumber(m)} metres. That's ${km === 1 ? 'one kilometre' : formatNumber(km) + ' kilometres'}!`;
  }
  return `${formatNumber(m)} metres!`;
}
