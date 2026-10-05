// Famous things to measure towers against. Heights are to the very tip, in metres
// (checked October 2026). `say` is what the voice announces when Louie passes it.
//
// kind: 'building' -> a see-through 3D model stands beside his tower
//       'mountain' -> a see-through mountain
//       'sky'      -> a glowing height ring with a picture label
// where: limit to some worlds (default: everywhere)

export const LANDMARKS = [
  { key: 'liberty', h: 93, kind: 'building', say: 'Taller than the Statue of Liberty!' },
  { key: 'bigben', h: 96, kind: 'building', say: 'Taller than Big Ben!' },
  { key: 'pyramid', h: 139, kind: 'building', say: 'Taller than the Great Pyramid!' },
  { key: 'shard', h: 310, kind: 'building', say: 'Taller than the Shard!' },
  { key: 'chrysler', h: 319, kind: 'building', say: 'Taller than the Chrysler Building!' },
  { key: 'eiffel', h: 330, kind: 'building', say: 'Taller than the Eiffel Tower!' },
  { key: 'empire', h: 443, kind: 'building', say: 'Taller than the Empire State Building!' },
  { key: 'petronas', h: 452, kind: 'building', say: 'Taller than the Petronas Towers!' },
  { key: 'taipei', h: 508, kind: 'building', say: 'Taller than Taipei one oh one!' },
  { key: 'onewtc', h: 541, kind: 'building', say: 'Taller than One World Trade Center!' },
  { key: 'shanghai', h: 632, kind: 'building', say: 'Taller than the Shanghai Tower!' },
  { key: 'skytree', h: 634, kind: 'building', say: 'Taller than the Tokyo Skytree!' },
  { key: 'merdeka', h: 679, kind: 'building', say: 'Taller than Merdeka one one eight!' },
  {
    key: 'burj',
    h: 828,
    kind: 'building',
    say: 'Taller than the Burj Khalifa! That is the tallest building in the world!',
  },
  {
    key: 'jeddah',
    h: 1000,
    kind: 'building',
    say: 'Taller than the Jeddah Tower! It is still being built, and it will be one kilometre tall!',
  },
  { key: 'clouds', h: 2000, kind: 'sky', where: ['earth'], say: 'Above the clouds!' },
  { key: 'huygens', h: 5500, kind: 'mountain', where: ['moon'], say: 'Taller than the highest mountain on the Moon!' },
  { key: 'everest', h: 8849, kind: 'mountain', say: 'Taller than Mount Everest! The highest mountain on Earth!' },
  { key: 'plane', h: 11000, kind: 'sky', where: ['earth'], say: 'Higher than the aeroplanes fly!' },
  {
    key: 'olympus',
    h: 21900,
    kind: 'mountain',
    say: 'Taller than Olympus Mons! The biggest volcano in the whole solar system!',
  },
  { key: 'space', h: 100000, kind: 'sky', say: 'You reached the edge of space!' },
  {
    key: 'iss',
    h: 400000,
    kind: 'sky',
    say: 'You reached the International Space Station! Four hundred kilometres high!',
  },
];

export function landmarksFor(world) {
  return LANDMARKS.filter((l) => !l.where || l.where.includes(world));
}

// Height milestones the voice calls out (in addition to landmarks).
export function milestoneFor(prevH, newH) {
  const steps = [];
  const marks = [];
  for (let m = 100; m < 1000; m += 100) marks.push(m);
  for (let m = 1000; m < 10000; m += 1000) marks.push(m);
  for (let m = 10000; m < 100000; m += 10000) marks.push(m);
  for (let m = 100000; m <= 400000; m += 100000) marks.push(m);
  for (const m of marks) if (prevH < m && newH >= m) steps.push(m);
  return steps.length ? steps[steps.length - 1] : null;
}
