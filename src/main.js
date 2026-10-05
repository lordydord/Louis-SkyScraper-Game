import { App } from './app.js';

// Show any crash on screen (helps when testing on the iPad), then keep going.
function showError(msg) {
  const box = document.getElementById('error');
  if (!box) return;
  box.style.display = 'block';
  box.textContent = String(msg).slice(0, 600);
  setTimeout(() => (box.style.display = 'none'), 8000);
}
window.addEventListener('error', (e) => showError(e.message));
window.addEventListener('unhandledrejection', (e) => showError(e.reason?.message || e.reason));

try {
  const app = new App();
  window.__app = app;
  app.start();
} catch (e) {
  console.error(e);
  showError(e.stack || e.message);
}

// Offline support once the game has loaded (not when testing locally with ?nosw,
// and not in the single-page test build, which sets SKY_CITY_NO_SW).
const noSW = window.SKY_CITY_NO_SW || location.search.includes('nosw') || location.hostname === 'localhost';
if ('serviceWorker' in navigator && !noSW) {
  window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
}
