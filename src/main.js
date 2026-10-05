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

// Offline support once the game has loaded (not when testing locally with ?nosw).
if ('serviceWorker' in navigator && !location.search.includes('nosw') && location.hostname !== 'localhost') {
  window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
}
