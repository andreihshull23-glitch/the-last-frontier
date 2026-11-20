# The Last Frontier

A cyberpunk extraction roguelike that runs in the browser, seen from behind the runner's shoulder. Vanilla ES modules with no build step. The only dependency is three.js r128, loaded from cdnjs as a classic script before the modules. It is published as a claude.ai Artifact: `index.html`, `js/**` and `assets/*.json`.

The loop: walk Mercy Deck (stalls, job board, customs hall), take the freight lift out on a story chapter, a job or the Descent, come back or go down, spend, repeat. The setting and story are in `docs/STORY.md`; `docs/DESIGN.md` predates the cyberpunk rewrite. Many identifiers keep their older Western names (`town`, `canyon`, `saloon`, `horse`, `ride`): the name says what the code does, the text on screen says what it is now.

## Run and test

- Unit tests: `npm test` (`tests/game.test.js`: generators, rules, sim determinism, the companion).
- Browser smoke test: `node tests/smoke.mjs <outDir> <path/to/three.min.js> [sections]`. Sections: `town`, `death`, `levels`, `phone`, `pad` (a simulated controller and `play.html`). It uses Playwright and writes screenshots. WebGL runs on SwiftShader, which is slow, so the test waits on sim time, never wall time.
- Viewers for art work: `tests/actorview.mjs` (character line-ups; `set=guns`, `set=plugins`, `set=hollow`), `tests/levelview.mjs`, `tests/viewer.mjs`.
- Screenshot scripts (`node tests/<name>.mjs <three.min.js> <outDir>`): `looks` (every place at high quality), `gore` (hits, kills, Rook hurt), `systems` (meters, Override, Overclock, the cargo screen), `lift` (the title's story pan and a full lift ride).
- In `?debug` the freight lift is instant so tests do not wait for it; `LF_DEBUG.cutscenes(true)` turns the ride back on.
- Collision audit: `node tests/collision-audit.mjs [--list]` compares drawn objects with blocking tiles on every level. Keep walk-through near or under 10%.
- Local play: serve the folder over HTTP and open `/?debug` (`window.LF_DEBUG`). ES modules do not load from `file://`.
- `index.html` has no `<html>`, `<head>` or `<body>` because the Artifact host wraps it.

## Art pipeline

All art is baked to vertex colours, with no textures, into quantised JSON packs under `assets/`. The source packs are not in the project.

- `tools/bake-assets.mjs <packsDir>`: Kenney kits, the Quaternius sci-fi megakit and the cyberpunk kit (`cyber-kit/{platforms,pickups,turrets}`) become the world packs and `js/data/models.js` (boxes and collision footprints). A sign's artwork is read from its emissive texture.
- `tools/bake-characters.mjs <men> <women> <robots> <cyber> [outDir] [aliens]`: Quaternius characters become `assets/people-{man,woman,robot,cyber,alien}.json`. The aliens (the Hollow's mites, seers and gazers) ship with an idle clip only; `creature()` in `actors.js` moves them by hand. Each family shares one skeleton and clip set, except that a file whose skeleton differs keeps its own (`rigs`, `clipsets`); every robot does.
- `tools/bake-guns.mjs <objDir>`: guns become `assets/qg.json`.
- Blender runs here as a Python module (`pip install bpy` into a Python 3.11 venv). After any fresh bake, run `tools/blender/bake-ao.py assets/<pack>.json [strength] [samples]` on each world pack (0.8) and each `people-*` pack (0.6): it bakes ambient occlusion into the vertex colours and marks the pack so it is not done twice. Glowing cyber models (signs, screens, pickups) are skipped.
- `tools/creature-clips.mjs` writes Walk, Attack and Death clips into `assets/people-alien.json`; run it after rebaking the characters.
- `tools/blender/skyline.py <city|hollow> <out.jpg> [width] [samples]` renders the panoramas in `assets/sky/`. `tools/detail-from-photos.py <folder>` makes `assets/tex/detail.png` from two Poly Haven scans (red: plated metal for walls, green: worn concrete for floors; blue: the procedural one from `tools/detail-texture.py`). The world shader projects it onto every surface.

## Who owns what

- `js/rules.js` is the only code that changes the campaign (cash, armory, investments, story chapter, the dead).
- `js/sim.js` runs one outing, town or ride. No DOM, `Math.random` or wall clock. State is plain JSON, so `snapshot()` and `restoreSim()` round-trip. It talks to the outside only through `sim.events`.
- `js/level.js` and `js/gen/*` build levels from a spec and a seed. `validateLevel` must return no problems.
- `js/content.js` holds data only.
- `js/gen/town.js` is Mercy Deck, the hub. `js/gen/canyon.js` builds open districts (`skinBlocks` in `level.js` turns the cell mask into city blocks; the Hollow keeps rock). `js/gen/descent.js` builds the room-by-room floors.
- Look: `js/gfx/post.js` does bloom, tone mapping and grading on the two better quality tiers; `world.js` bakes light from every level light into nearby surfaces when a level is built; characters get a rim light (`assets.setRim`); the sky is a Blender panorama in districts, on the deck and in the Hollow.
- `js/gfx/*` draws: `assets.js` (packs, tints, merging), `world.js` (static level; pieces with `glow: true` go to an unlit mesh, which is how neon is drawn), `actors.js` (characters, skeletons, clips, guns in hands), `renderer.js` (camera, effects, per-frame sync).
- `js/hud.js`, `js/ui.js`, `js/controls.js`, `js/audio.js`, `js/save.js` read the sim and never write it.
- `js/gfx/gore.js`: blood, oil (machines) and ichor (the Hollow): splats on floors and walls where enemies die, marks stuck to body bones where they were hit (on Rook until a dressing), the screen-edge blood. Presentation only.
- `js/titlescroll.js`: the title screen's backdrop, a painted parallax pan along the story (2D canvas, no 3D).
- The freight lift ride (`rideLift` in `main.js`, `r.lift`/`liftCam` in `renderer.js`): the car sinks out of one level, the shaft screen shows while the next is built, the car lands. The sim does not step while it moves.
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
- Long guns are shouldered with both hands (`shoulder()` in `actors.js`); `ONE_HAND` lists the models held in one hand (pistols, revolvers, small blasters).
- The fitted plug-in shows on Rook: add its parts to `PLUGIN_PARTS` in `actors.js` when adding a plug-in.
- People on the deck answer questions from `ASK` in `content.js`, gated by chapters finished.
- Mark Hollow enemies `hollow: true` in `ENEMIES`; code checks that flag, never a list of kinds.
- Run variety lives in `content.js` as data: `SYNERGIES` (two relics give a third effect), `ELITES` (modifiers some enemies spawn with; chance from `eliteChance` in the run config), `DEALS` (the black-market uplink on each level), `LOGS` (intake records, one findable per run, kept in the journal), `COMMS` (lines spoken in your ear at a run's beats: start, wave, objective, lockdown, extract).
- District and underground levels hold part of their enemies back as `L.waves`: walking into a place, or taking the objective, brings a wave in (`updateWaves` in `sim.js`).
- Music is synthesized in `js/music.js` (pieces: deck, run, hollow, boss); `main.js` picks the piece and intensity (`musicFor`). `node tests/music.mjs <three.min.js>` renders each offline.
- The opening crawl is `CRAWL` in `content.js`; it plays on first launch and at the start of every campaign.
- Neon: set `glow` on a piece, add an `L.lights` entry of kind `neon` for its halo, and give `L.signs` entries `glow: true`.
- WARDEN adapts (`WARDEN` in `content.js`): `noteHit` and the dodge/pulse code feed `s.warden.stats`; `wardenAdapt` runs before a wave or a sealed room and leans `pickElite` toward a countermeasure. Elites marked `learned` only appear as a countermeasure.
- Cargo (`CARGO`): finds carry `bulk`; `cargoManifest` makes the default choice at the lift; `main.js` shows the cargo screen when something is left, then settles. Chutes move finds to `s.secured`, which `rules.js` pays whatever the outcome.
- Tower systems (`SYSTEMS`) are `infra` interactables placed by every generator. `useSystem` and `useOverride` change `s.sys`; those with `persist` carry to the next Descent floor (`carry.consequences`) and, through `c.aftermath`, to the next runs (`config.consequences`).
- Override (`OVERRIDE`, key T) and Overclock (`OVERCLOCK`, key Z) are player meters (`p.hack`, `p.heat`, `p.oc`, `p.crash`). Add new override targets in `overrideTarget` and `useOverride`.
- After changing gameplay, rerun both test suites and look at the smoke screenshots.
