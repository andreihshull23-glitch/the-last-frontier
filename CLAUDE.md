# The Last Frontier

A cyberpunk extraction roguelike that runs in the browser, seen from behind the runner's shoulder. Vanilla ES modules with no build step. The only dependency is three.js r128, loaded from cdnjs as a classic script before the modules. It is published as a claude.ai Artifact: `index.html`, `js/**` and `assets/*.json`.

The loop: walk Mercy Deck (stalls, job board, customs hall), take the freight lift out on a story chapter, a job or the Descent, come back or go down, spend, repeat. The setting and story are in `docs/STORY.md`; `docs/DESIGN.md` predates the cyberpunk rewrite. Many identifiers keep their older Western names (`town`, `canyon`, `saloon`, `horse`, `ride`): the name says what the code does, the text on screen says what it is now.

## Run and test

- Unit tests: `npm test` (`tests/game.test.js`: generators, rules, sim determinism, the companion).
- Browser smoke test: `node tests/smoke.mjs <outDir> <path/to/three.min.js> [sections]`. Sections: `town`, `death`, `levels`, `phone`, `pad` (a simulated controller and `play.html`). It uses Playwright and writes screenshots. WebGL runs on SwiftShader, which is slow, so the test waits on sim time, never wall time.
- Viewers for art work: `tests/actorview.mjs` (character line-ups), `tests/levelview.mjs`, `tests/viewer.mjs`.
- Local play: serve the folder over HTTP and open `/?debug` (`window.LF_DEBUG`). ES modules do not load from `file://`.
- `index.html` has no `<html>`, `<head>` or `<body>` because the Artifact host wraps it.

## Art pipeline

All art is baked to vertex colours, with no textures, into quantised JSON packs under `assets/`. The source packs are not in the project.

- `tools/bake-assets.mjs <packsDir>`: Kenney kits, the Quaternius sci-fi megakit and the cyberpunk kit (`cyber-kit/{platforms,pickups,turrets}`) become the world packs and `js/data/models.js` (boxes and collision footprints). A sign's artwork is read from its emissive texture.
- `tools/bake-characters.mjs <men> <women> <robots> <cyber>`: Quaternius characters become `assets/people-{man,woman,robot,cyber}.json`. Each family shares one skeleton and clip set, except that a file whose skeleton differs keeps its own (`rigs`, `clipsets`); every robot does.
- `tools/bake-guns.mjs <objDir>`: guns become `assets/qg.json`.

## Who owns what

- `js/rules.js` is the only code that changes the campaign (cash, armory, investments, story chapter, the dead).
- `js/sim.js` runs one outing, town or ride. No DOM, `Math.random` or wall clock. State is plain JSON, so `snapshot()` and `restoreSim()` round-trip. It talks to the outside only through `sim.events`.
- `js/level.js` and `js/gen/*` build levels from a spec and a seed. `validateLevel` must return no problems.
- `js/content.js` holds data only.
- `js/gen/town.js` is Mercy Deck, the hub. `js/gen/canyon.js` builds open districts (`skinBlocks` in `level.js` turns the cell mask into city blocks; the Hollow keeps rock). `js/gen/descent.js` builds the room-by-room floors.
- `js/gfx/*` draws: `assets.js` (packs, tints, merging), `world.js` (static level; pieces with `glow: true` go to an unlit mesh, which is how neon is drawn), `actors.js` (characters, skeletons, clips, guns in hands), `renderer.js` (camera, effects, per-frame sync).
- `js/hud.js`, `js/ui.js`, `js/controls.js`, `js/audio.js`, `js/save.js` read the sim and never write it.
- `js/gamepad.js` reads a controller once per frame (`controls.padFrame`). Bindings are data in the `pad` setting. `main.js` drives menus from it (`padMenus`).
- `play.html` wraps `index.html` in a full page for ordinary browser tabs and GitHub Pages.
- `js/main.js` wires everything and runs the fixed 60 Hz step.

## Scale

32 sim units are 1 metre. A tile is 16 units. People are about 1.8 m tall.

## Invariants (tested)

- `resolveExpedition` settles an expedition exactly once.
- Going down loses the run and the kit worn. Creds, plug-ins, unlocked guns, investments and story progress stay. There is one runner, Rook.
- The same seed and inputs give the same sim state, including after a snapshot and restore.
- Every generated level has a reachable objective, exits, spawns and items.

## Conventions

- Add content to `content.js` as data, then teach `rules.js` or `sim.js` the behaviour.
- Randomness in the sim comes from `sim.rng` only.
- A character look is an entry in `LOOKS` in `actors.js`: family, model, and optional tint, gun and scale. Nobody wears a hat.
- Neon: set `glow` on a piece, add an `L.lights` entry of kind `neon` for its halo, and give `L.signs` entries `glow: true`.
- After changing gameplay, rerun both test suites and look at the smoke screenshots.
