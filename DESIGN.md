# Louie's Sky City — design notes

A skyscraper-building game for Louie (9, nearly 10). He loves Minecraft, building,
size limits, physics, planets, and the Burj Khalifa. He can't read yet but is fine
with numbers, so **the game has no words on screen** — only pictures, numbers,
colours, animation and (spoken) voice.

These are the decisions his parent made before building. Keep to them when changing
the game.

## Device and controls

- **iPad mini, held sideways (landscape).** A portrait overlay asks (with a picture) to rotate.
- He plays Minecraft on a tablet, so touch 3D controls are familiar:
  one finger drag = spin around, pinch = zoom, two-finger drag = move up/down the tower.
- Normal-sized buttons are fine.
- Guidance is wordless: an animated **pointing hand** the first time, and **glowing,
  bouncing buttons** for the next useful thing to do.

## Building

- **Stack sections up.** Tap a picture in the inventory and that section drops onto the
  top of the tower. Drag the glowing arrow knob up/down to stretch it, floor by floor.
- Tap any part of the tower to select it; the size squares then change *that* section's
  width (so he can widen the base of a wobbly tower).
- Section types cover all four of his favourite kinds of tower:
  - super tall and pointy (Burj-style Y tiers that step in automatically, spires),
  - twisty and curvy (twisted and round sections),
  - classic (stone sections with ledges, the Chrysler-style crown),
  - twin towers with sky bridges (twin toggle + sky-bridge piece).
- Undo is always available.
- A construction crane sits on top of the tower while it's being built.

## Physics

- **Wobbles but never falls.** A wobble meter (green → yellow → red) shows how slender the
  tower is. Tall thin towers sway; a wider base, tapering, a damper ball (like Taipei 101)
  or sky bridges between twins steady it. Nothing ever breaks or falls down.
- Sway period grows with height like real buildings (Burj Khalifa ≈ 11 s).
- **Real physics on other worlds:** the Moon has 1/6 gravity and no wind (no sway at all);
  Mars has 38% gravity and very thin air.

## Height

- **No height limit until space.** Up through the clouds, past planes and Mount Everest,
  until the sky turns black at the edge of space (100 km) and the Space Station (400 km).
  At high altitude the curve of the planet becomes visible.
- Big metres number top-left (e.g. `1,250 m`).
- See-through **famous buildings** to compare against, with a celebration and a spoken
  "Taller than the Eiffel Tower!" each time he passes one. Includes the Jeddah Tower
  (under construction, ~430 m built as of mid-2026, aiming for 1,000 m+ by 2028).
- **Tape measure**: unrolls up the side when a tower is finished; a ruler button shows or
  hides it at any time (it is *not* always on).
- **Ride the lift** to the top while the metres count up.

## Money

- **Building is always free.** When a tower is finished, people move in and coins pour
  out — taller towers pay more. Finished towers keep making coin bubbles to tap.
- Coins unlock new pieces, light shows, rooftop extras, and the Moon and Mars.
  He can never get stuck.

## Look and feel

- **Bright, clean and modern** (soft shadows, glowing windows, beautiful sky) — not Minecraft.
- Slow, automatic **day → night** cycle, plus a sun/moon button to switch.
- **A real night sky**: stars, the Moon, bright planets. **Tap a planet** to see it next to
  Earth at true scale, with its width in km.
- Avoid **sudden loud noises**: soft sounds only, fireworks have no bangs, a limiter on output.
- Sounds: building sound effects, calm background music, a voice calling out heights,
  city sounds (birds by day, crickets at night, gentle traffic). Mute button always available.

## After building: decorate

- Wall and glass colours.
- Coloured lights and gentle light shows (no strobing).
- Rooftop extras: helipad, pool, garden, flag, blinking red aircraft lights, spotlights.
- Quiet celebrations: soft fireworks, confetti, spotlights.

## Cities (main menu)

- **New city**: an empty city that grows. Each new tower goes on a new plot, and roads,
  cars, trees, houses and people fill in automatically around finished towers.
- **Pre-made places**: Dubai (next to the Burj Khalifa), New York (Empire State, Chrysler,
  One World Trade Center, Statue of Liberty), the **Moon** and **Mars** (unlocked with coins).

## Portfolio

- **His skyline**: every finished tower side by side, tallest first, with heights.
- **Photo cards**: a picture of each tower with its height and the coins it earned.

## Name and hosting

- Title: **Louie's Sky City**.
- Static web app (no build step) hosted on GitHub Pages; add to the iPad Home Screen so it
  opens full screen, works offline and keeps his progress.
