// Things in the sky Louie can tap to compare with Earth. Diameters in km.

export const BODIES = {
  sun: { d: 1392700, say: 'The Sun! One hundred and nine Earths could fit across it!' },
  mercury: { d: 4879, say: 'Mercury! The smallest planet.' },
  venus: { d: 12104, say: 'Venus! Almost the same size as Earth.' },
  earth: { d: 12742, say: 'Earth! Our home planet.' },
  moon: { d: 3474, say: 'The Moon! About a quarter as wide as Earth.' },
  mars: { d: 6779, say: 'Mars! About half as wide as Earth.' },
  jupiter: { d: 139820, say: 'Jupiter! The biggest planet. Eleven Earths wide!' },
  saturn: { d: 116460, say: 'Saturn! Nine Earths wide, with beautiful rings.' },
  phobos: { d: 22.5, say: 'Phobos! A tiny moon of Mars. Only twenty two kilometres wide.' },
};

// What shows up in the night sky in each world. dir = [azimuth°, elevation°]
// at midnight; the sky turns slowly with the time of day.
export const SKY_OBJECTS = {
  earth: [
    { id: 'moon', dir: [140, 38], size: 0.0105 },
    { id: 'jupiter', dir: [210, 52], size: 0.0042, color: 0xffe9c4 },
    { id: 'venus', dir: [285, 18], size: 0.0046, color: 0xfffbe8 },
    { id: 'mars', dir: [60, 30], size: 0.0036, color: 0xff8a5c },
    { id: 'saturn', dir: [20, 46], size: 0.0036, color: 0xffe2a8 },
  ],
  moon: [
    { id: 'earth', dir: [160, 42], size: 0.034, fixed: true },
    { id: 'jupiter', dir: [230, 30], size: 0.0042, color: 0xffe9c4 },
    { id: 'mars', dir: [70, 35], size: 0.0036, color: 0xff8a5c },
  ],
  mars: [
    { id: 'phobos', dir: [120, 40], size: 0.0075 },
    { id: 'earth', dir: [250, 20], size: 0.0042, color: 0x9fd0ff },
    { id: 'jupiter', dir: [200, 50], size: 0.0046, color: 0xffe9c4 },
  ],
};
