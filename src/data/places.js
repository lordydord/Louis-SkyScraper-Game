// Places Louie can build in. Gravity and wind are relative to Earth and feed the
// wobble physics: the Moon has 1/6 gravity and no air at all, Mars has 38% gravity
// and air about 1/60th as thick as ours.

export const PLACES = {
  newcity: { world: 'earth', ground: 'grass', water: null, premade: false, price: 0 },
  dubai: { world: 'earth', ground: 'sand', water: 'sea', premade: true, price: 0 },
  newyork: { world: 'earth', ground: 'park', water: 'river', premade: true, price: 0 },
  moon: { world: 'moon', ground: 'moon', water: null, premade: true, price: 800 },
  mars: { world: 'mars', ground: 'mars', water: null, premade: true, price: 1500 },
};

export const WORLDS = {
  earth: { radius: 6371000, gravity: 1, wind: 1, air: 1 },
  moon: { radius: 1737400, gravity: 0.165, wind: 0, air: 0 },
  mars: { radius: 3389500, gravity: 0.38, wind: 0.05, air: 0.2 },
};

export function worldOf(placeId) {
  return WORLDS[PLACES[placeId].world];
}
