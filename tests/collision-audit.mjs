// Compares what is drawn with what blocks, on every kind of level.
//   node tests/collision-audit.mjs [--list]
// "Walk-through": tiles covered by a drawn object at body height (0.15–1.5 m) that nothing blocks.
// "Invisible": blocking tiles (not walls or rock) with nothing drawn on them.
import { MODEL_BOX } from '../js/data/models.js';
import { SOLID, ROCK, TILE, PX } from '../js/content.js';
import { generateLevel } from '../js/gen/index.js';
import * as R from '../js/rules.js';

const TM = TILE / PX;
const list = process.argv.includes('--list');

function covered(L) {
  // per tile: which drawn piece (index) covers it at body height
  const cov = new Int32Array(L.w * L.h).fill(-1);
  L.pieces.forEach((p, i) => {
    let x0, x1, z0, z1, y0, y1;
    const sc = Array.isArray(p.s) ? p.s : [p.s ?? 1, p.s ?? 1, p.s ?? 1];
    if (p.m === '@box') { x0 = -p.sx / 2; x1 = p.sx / 2; z0 = -p.sz / 2; z1 = p.sz / 2; y0 = p.y; y1 = p.y + p.sy; }
    else if (p.m === '@cyl') { x0 = z0 = -p.sx; x1 = z1 = p.sx; y0 = p.y; y1 = p.y + p.sy; }
    else {
      const b = MODEL_BOX[p.m]; if (!b) return;
      x0 = b[0] * sc[0]; x1 = b[3] * sc[0]; z0 = b[2] * sc[2]; z1 = b[5] * sc[2]; y0 = (p.y || 0) + b[1] * sc[1]; y1 = (p.y || 0) + b[4] * sc[1];
    }
    if (y1 < 0.15 || y0 > 1.5) return;                        // underfoot or overhead
    if (p.glow && (x1 - x0 < 0.12 || z1 - z0 < 0.12)) return; // light strips on walls
    const c = Math.cos(p.r || 0), s = Math.sin(p.r || 0);
    // sample the footprint box; a model's box overstates its shape, so only its middle 70% counts
    const kx = (x1 - x0) * 0.15, kz = (z1 - z0) * 0.15;
    for (let a = x0 + kx; a <= x1 - kx; a += 0.2) for (let b = z0 + kz; b <= z1 - kz; b += 0.2) {
      const wx = p.x + a * c + b * s, wz = p.z - a * s + b * c;
      const tx = Math.floor(wx / TM), ty = Math.floor(wz / TM);
      if (tx >= 0 && ty >= 0 && tx < L.w && ty < L.h) cov[ty * L.w + tx] = i;
    }
  });
  return cov;
}

// drawn edges and blocking tiles are both rounded to half-metre tiles, so a blocker next to something drawn is fine
const near = (cov, L, i) => { const x = i % L.w, y = (i - x) / L.w; for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const j = (y + dy) * L.w + x + dx; if (j >= 0 && j < cov.length && cov[j] >= 0) return true; } return false; };
function audit(name, L) {
  const cov = covered(L);
  let ghost = 0, invisible = 0, drawn = 0;
  const byModel = new Map(), inv = [];
  for (let i = 0; i < L.w * L.h; i++) {
    const f = L.flags[i];
    if (cov[i] >= 0) {
      drawn++;
      if (!(f & SOLID)) { ghost++; const m = L.pieces[cov[i]].m; byModel.set(m, (byModel.get(m) || 0) + 1); }
    } else if (f & SOLID && !(f & ROCK) && L.hgt[i] < 40 && !near(cov, L, i)) { invisible++; if (inv.length < 6) inv.push(`${(i % L.w) * TM},${Math.floor(i / L.w) * TM}`); }
  }
  console.log(`${name.padEnd(22)} drawn ${String(drawn).padStart(6)}  walk-through ${String(ghost).padStart(5)} (${(100 * ghost / Math.max(1, drawn)).toFixed(1)}%)  invisible ${invisible}`);
  if (list) {
    console.log('   walk-through by model:', [...byModel].sort((a, b) => b[1] - a[1]).slice(0, 12).map(([m, n]) => `${m} ${n}`).join(', '));
    if (inv.length) console.log('   invisible at (m):', inv.join('  '));
  }
}

const c = R.newCampaign ? R.newCampaign() : null;
audit('Mercy Deck', generateLevel({ gen: 'town', seed: 20251 }));
const { CHAPTERS, DESCENT } = await import('../js/content.js');
for (const ch of CHAPTERS) audit(ch.title || ch.id, generateLevel({ ...ch.level, seed: 11 }));
for (let f = 1; f <= DESCENT.floors.length; f++) audit('Descent ' + f, generateLevel({ gen: 'descent', floor: f, seed: 5 }));
