# Louie's Sky City 🏙️

A wordless 3D skyscraper-building game made for Louie, for the iPad mini.

Stack sections, stretch them all the way to space, beat famous buildings like the
Eiffel Tower and the Burj Khalifa, decorate with light shows, and watch a city grow
around every tower. Everything is pictures and numbers, so no reading is needed.
See [DESIGN.md](DESIGN.md) for every design decision and why.

## Putting it on the iPad (one-time setup)

The game is a website that installs like an app. It's free to host on GitHub Pages:

1. **Make the repository public** (GitHub Pages is only free for public repositories):
   on GitHub, open the repo → **Settings** → **General** → scroll to the bottom
   (**Danger Zone**) → **Change visibility** → **Public**.
2. **Turn on GitHub Pages:** **Settings** → **Pages** → under **Build and deployment**,
   set **Source** to **Deploy from a branch**, pick the branch with the game
   (`claude/dazzling-franklin-ubcf02`, or `main` once it's merged) and the
   **/ (root)** folder → **Save**. After a minute or two, the page shows the game's address,
   e.g. `https://lordydord.github.io/Louis-SkyScraper-Game/`.
3. **On the iPad mini**, open that address in **Safari**, tap the **Share** button
   (square with an arrow), then **Add to Home Screen**.
4. Open **Louie's Sky City** from the Home Screen. It runs full screen, works without
   Wi-Fi after the first launch, and remembers Louie's cities and towers.

Tips:
- Hold the iPad sideways (a picture asks you to turn it if it's upright).
- The speaker button (top right) turns all sound and the voice on or off.
- For the spoken voice, the iPad's own voices are used. A nicer British voice can be
  downloaded in **Settings → Accessibility → Spoken Content → Voices → English**.

## How to play (for grown-ups)

- **Main menu:** the green ➕ card makes a brand-new city. Dubai and New York are
  ready-made cities. The Moon and Mars unlock with coins. The purple photos button
  opens the portfolio.
- **Building:** tap a picture in the bottom bar to stack that section on top. Drag the
  yellow ⬍ knob up or down to stretch it. Tap any part of the tower to select it, then
  the size bars (bottom left) change its width. The twin-tower button builds two towers
  side by side, and the sky-bridge piece joins them. ↶ undoes.
- **Wobble meter:** tall, thin towers sway (green → yellow → red). A wider base,
  tapering, the golden damper ball piece or sky bridges steady them. Towers never fall.
- **Finish:** the green ✔ finishes the tower. A tape measure unrolls, then Louie can
  decorate it (paint, glass, light shows, rooftop extras, fireworks). The ✔ again
  completes it: people move in, coins pour out (taller = more), and the city grows.
- **Coins** also come from coin bubbles that float above finished towers.
- **Left buttons:** sun/moon (day ↔ night), ruler (tape measure), and the purple lift: a
  glass lift rides up the outside of the tower while the camera circles it, then shows
  the whole tower and its height (tap to stop early).
- **Night sky:** tap the Moon or a bright planet to compare its size with Earth.

## For developers

No build step: it's plain JavaScript modules plus [three.js](https://threejs.org)
(vendored in `vendor/`).

```sh
npm test                 # unit tests for the game logic (Node 20+)
npm run serve            # http://localhost:8080
node tools/build-sw.mjs  # refresh the offline file list after changing files
node tools/build-single-page.mjs out.html   # whole game in one page (three.js from a CDN)
```

On a computer: drag to spin around, scroll (or pinch the trackpad) to zoom, swipe the
trackpad sideways to spin, and right-drag or Shift + drag to move up and down the tower.

- `src/game/`: rules (tower model, wobble physics, coins, saving) and screens
- `src/three/`: 3D rendering (sky, buildings, city, landmarks, effects)
- `src/ui/`: the picture-only interface
- `src/audio/`: synthesised sound effects, music and the spoken voice
- `dev/sandbox.html`: a test page for looking at towers, landmarks and cities
- `tools/`: screenshots, a scripted play-through, icon and service-worker builders

Real-world heights (checked October 2026) are in `src/data/landmarks.js`.
