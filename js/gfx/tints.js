// Named recolours for the Kenney kits. The building kit ships slate blue; the
// blasters ship as bright toys. remap() swaps a hue band and keeps the shading.
import { remap, multiply, chain } from './assets.js';

const SLATE = [0.55, 0.8];       // the blue-grey every kit uses for "neutral"

function paintWalls(h, s, lMul, trim = null) {
  return remap([
    trim ? { hue: SLATE, lit: [0.74, 1], h: trim.h, s: trim.s, lMul: trim.l ?? 1 } : { hue: SLATE, lit: [0.74, 1], sMul: 0.5 },
    { hue: SLATE, sat: [0, 0.6], h, s, lMul },
    { sat: [0, 0.07], lit: [0, 0.74], h, s: s * 0.8, lMul },
  ]);
}

export function registerTints(assets) {
  const T = (name, fn) => assets.registerTint(name, fn);
  // buildings
  // buildings: the style names are older than the setting. Everything is plate and poured stone now,
  // told apart by a wash of colour and the trim.
  T('wood', paintWalls(0.64, 0.16, 0.36, { h: 0.52, s: 0.5, l: 0.8 }));
  T('wood_dark', paintWalls(0.66, 0.14, 0.3, { h: 0.9, s: 0.5, l: 0.8 }));
  T('adobe', paintWalls(0.6, 0.1, 0.42, { h: 0.1, s: 0.5, l: 0.85 }));
  T('red', paintWalls(0.93, 0.2, 0.3, { h: 0.9, s: 0.7, l: 0.85 }));
  T('sage', paintWalls(0.45, 0.16, 0.34, { h: 0.4, s: 0.6, l: 0.8 }));
  T('blue', paintWalls(0.6, 0.24, 0.38, { h: 0.52, s: 0.7, l: 0.85 }));
  T('cream', paintWalls(0.62, 0.08, 0.46, { h: 0.52, s: 0.6, l: 0.8 }));
  T('ochre', paintWalls(0.08, 0.2, 0.32, { h: 0.1, s: 0.75, l: 0.85 }));
  T('teal', paintWalls(0.5, 0.22, 0.34, { h: 0.5, s: 0.7, l: 0.85 }));
  T('company', remap([{ hue: SLATE, lit: [0.74, 1], h: 0.58, s: 0.3, lMul: 1.0 }, { hue: SLATE, lit: [0, 0.74], h: 0.62, s: 0.12, lMul: 0.6 }]));
  T('roof', paintWalls(0.66, 0.14, 0.3, { h: 0.66, s: 0.14, l: 0.34 }));
  T('ruin', paintWalls(0.64, 0.1, 0.42, { h: 0.64, s: 0.1, l: 0.5 }));
  // guns: bright plastic -> walnut, grey -> blued steel
  T('gun', remap([
    { sat: [0.38, 1], lit: [0.2, 0.9], h: 0.065, s: 0.5, lMul: 0.62 },
    { sat: [0, 0.38], lMul: 0.5, sMul: 0.6 },
  ]));
  T('gun_enemy', remap([
    { sat: [0.38, 1], lit: [0.2, 0.9], h: 0.05, s: 0.3, lMul: 0.45 },
    { sat: [0, 0.38], lMul: 0.42, sMul: 0.5 },
  ]));
  // loot crates by tier
  T('crate', remap([{ sat: [0.3, 1], h: 0.07, s: 0.45, lMul: 0.8 }, { sat: [0, 0.3], h: 0.09, s: 0.25, lMul: 0.8 }]));
  T('crate_gold', remap([{ sat: [0.3, 1], h: 0.11, s: 0.75, lMul: 1.0 }, { sat: [0, 0.3], h: 0.07, s: 0.4, lMul: 0.62 }]));
  T('crate_meridian', remap([{ sat: [0.3, 1], h: 0.6, s: 0.3, lMul: 0.7 }, { sat: [0, 0.3], lMul: 0.75 }]));
  // rock and theme washes
  T('canyon', remap([{ hue: SLATE, h: 0.045, s: 0.42, lMul: 1.05 }]));
  // sci-fi kit walls: rusted company iron on the Foundry, the ship's own dark plate on the Hull
  T('rustwall', chain(remap([{ sat: [0, 1], h: 0.06, s: 0.2, lMul: 0.72 }]), multiply(0.8, 0.74, 0.7)));
  T('hullwall', chain(remap([{ sat: [0, 0.35], h: 0.63, s: 0.16, lMul: 0.62 }, { sat: [0.35, 1], h: 0.5, s: 0.5, lMul: 0.9 }]), multiply(0.8, 0.86, 1.0)));
  // Mercy Deck: dark blue plate, gunmetal street furniture, signs that keep their colour
  T('deckwall', chain(remap([{ sat: [0, 0.35], h: 0.66, s: 0.22, lMul: 0.78 }, { sat: [0.35, 1], h: 0.52, s: 0.7, lMul: 1.0 }]), multiply(0.85, 0.85, 1.0)));
  T('deckprop', remap([{ sat: [0, 0.3], h: 0.65, s: 0.16, lMul: 0.6 }, { sat: [0.3, 1], lMul: 0.9 }]));
  T('street', remap([{ sat: [0, 0.25], h: 0.64, s: 0.14, lMul: 0.6 }]));
  T('neonsign', remap([{ sat: [0, 0.2], lit: [0, 0.62], h: 0.64, s: 0.12, lMul: 0.45 }]));
  T('clinic', remap([{ sat: [0, 1], h: 0.42, s: 0.18, lMul: 1.0 }]));
  T('machine', chain(remap([{ sat: [0, 1], sMul: 0.55, lMul: 0.8 }]), multiply(0.9, 0.82, 0.74)));
  T('mine', chain(remap([{ sat: [0, 1], sMul: 0.72 }]), multiply(0.74, 0.7, 0.72)));
  T('hollow', remap([{ sat: [0, 1], h: 0.74, s: 0.28, lMul: 0.62 }]));
  T('hollow_glow', remap([{ sat: [0, 1], h: 0.72, s: 0.6, lMul: 1.15 }]));
  T('dark', multiply(0.62, 0.6, 0.62));
  T('timber', remap([{ sat: [0, 1], h: 0.64, s: 0.14, lMul: 0.55 }]));
  T('canvas', remap([{ hue: [0.5, 0.75], h: 0.6, s: 0.12, lMul: 0.7 }]));
  T('tent_red', remap([{ hue: [0.5, 0.75], h: 0.95, s: 0.55, lMul: 0.75 }]));
  T('stone', remap([{ sat: [0, 1], h: 0.66, s: 0.1, lMul: 0.5 }]));
  T('shopwood', remap([{ hue: SLATE, sat: [0, 0.7], h: 0.07, s: 0.4, lMul: 0.95 }, { hue: [0.3, 0.5], h: 0.07, s: 0.45, lMul: 0.8 }]));
}
