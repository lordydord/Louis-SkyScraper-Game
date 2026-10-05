// Service worker: keeps a copy of the whole game so it works offline once it has
// been opened. The file list and version are filled in by tools/build-sw.mjs.
// A new version downloads in the background and is used the next time the game
// is opened (it never swaps files in the middle of a game).

const VERSION = 'sky-city-9b3f930652';
// FILES-START
const FILES = [
  './',
  './index.html',
  './manifest.webmanifest',
  './src/app.js',
  './src/audio/audio.js',
  './src/audio/voice.js',
  './src/config.js',
  './src/data/landmarks.js',
  './src/data/pieces.js',
  './src/data/places.js',
  './src/data/planets.js',
  './src/game/cityLayout.js',
  './src/game/cityScreen.js',
  './src/game/economy.js',
  './src/game/physics.js',
  './src/game/screens.js',
  './src/game/store.js',
  './src/game/towerModel.js',
  './src/main.js',
  './src/three/cameraRig.js',
  './src/three/cityParts.js',
  './src/three/cityView.js',
  './src/three/effects.js',
  './src/three/engine.js',
  './src/three/environment.js',
  './src/three/geometry.js',
  './src/three/ghosts.js',
  './src/three/landmarks3d.js',
  './src/three/materials.js',
  './src/three/planetTextures.js',
  './src/three/tape.js',
  './src/three/thumbs.js',
  './src/three/towerView.js',
  './src/ui/cards.js',
  './src/ui/decorate.js',
  './src/ui/dom.js',
  './src/ui/hud.js',
  './src/ui/icons.js',
  './src/ui/inventory.js',
  './src/ui/planetView.js',
  './src/ui/styles.css',
  './src/ui/tutorial.js',
  './src/util/format.js',
  './src/util/idb.js',
  './src/util/math.js',
  './vendor/three-addons.min.js',
  './vendor/three.module.min.js',
  './assets/icons/icon-180.png',
  './assets/icons/icon-192.png',
  './assets/icons/icon-512.png',
  './assets/icons/icon.svg',
];
// FILES-END

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(VERSION).then((cache) => cache.addAll(FILES)));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  event.respondWith(
    caches.open(VERSION).then(async (cache) => {
      const hit = await cache.match(req, { ignoreSearch: true });
      if (hit) return hit;
      try {
        const res = await fetch(req);
        if (res.ok) cache.put(req, res.clone());
        return res;
      } catch (e) {
        if (req.mode === 'navigate') {
          const home = await cache.match('./');
          if (home) return home;
        }
        throw e;
      }
    }),
  );
});
