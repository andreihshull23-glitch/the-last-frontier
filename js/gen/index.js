// One entry point for every kind of level. Deterministic in (spec, seed).
import { generateTown } from './town.js';
import { generateCanyon } from './canyon.js';
import { generateMine } from './mine.js';

export function generateLevel(spec) {
  switch (spec.gen) {
    case 'town': return generateTown(spec);
    case 'canyon': return generateCanyon(spec);
    case 'mine': return generateMine(spec);
    default: throw new Error('Unknown level generator: ' + spec.gen);
  }
}
