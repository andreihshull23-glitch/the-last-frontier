# Handoff

Where the project stands and what to work on next, for a new session picking it up.
Read `CLAUDE.md` first; it explains how the code is laid out and how to test it.

## How to start the new session

Open a new Claude Code session on the repository `andreihshull23-glitch/the-last-frontier`
(Default environment), then send:

> Read docs/HANDOFF.md and CLAUDE.md, then work through the next steps in order. Check in with me
> on the name before renaming anything.

The SpriteCook and CellCog plugins connect when a session starts. Their hosts (`mcp.spritecook.ai`,
`cellcog.ai`) are now allowed in the Default environment. Each will probably ask the owner to sign in,
because both are paid services with their own accounts and credits.

## State (2026-11-20)

- Published as a claude.ai artifact: https://claude.ai/artifact/614QNGDgEzdu7DKhCHLWPy.
  To update it, publish `index.html` with every file under `js/` and `assets/` (including
  `assets/sky/*.jpg` and `assets/tex/*.png`) to that same URL. Never create a new artifact.
- Everything needed to run, test and publish the game is in this repository.
- Tests: `npm test` (16 pass); browser tests `tests/smoke.mjs` (all sections passed before the art pass);
  high-quality screenshots of every place: `tests/looks.mjs <three.min.js> <outDir> 1`.
  three.js r128 for the tests: `npm pack three@0.128.0` and use `package/build/three.min.js`.
  Playwright: see `tests/harness.mjs`; on claude.ai cloud sessions it is preinstalled.

## Recently done (the art pass)

- Bloom, tone mapping and grading (`js/gfx/post.js`) on the two better quality tiers.
- Light from every lamp and sign baked onto nearby surfaces when a level is built (`js/gfx/world.js`).
- Rim light on characters; a world-space detail texture on every surface (`assets/tex/detail.png`).
- Ambient occlusion baked into every world and character pack with Blender (`tools/blender/bake-ao.py`).
- Panoramic skies rendered in Blender (`assets/sky/city.jpg`, `assets/sky/hollow.jpg`).
- Walk, attack and death animations for the Hollow's creatures (`tools/creature-clips.mjs`).

## Added since (2026-11-20, later)

- Compact Mercy Deck with customers and gesturing keepers; shield recharge; punchy hits (flash, sound,
  sparks, knockback, shake, hit-stop); gun kick, muzzle flash, spread bloom; blood, oil and ichor (`gore.js`).
- Five run systems from the owner's design brief: WARDEN adaptation, cargo capacity and chutes, tower
  systems with consequences, Override (T) and Overclock (Z). See the conventions in `CLAUDE.md`.
- A real freight-lift ride between levels, and a scrolling story backdrop on the title screen.

## Next steps, in order

1. **Done (Version 17):** the art pass is published, with scanned Poly Haven surface detail
   (`tools/detail-from-photos.py`) and the city sky pushed back to the horizon. Kenney's site refuses
   scripted downloads, so its UI packs have to be uploaded by hand if wanted.
2. **Pick a new name with the owner.** "The Last Frontier" is from the old Western version.
   Candidates: **UNLISTED** (the deleted people and the resistance; the favourite so far), Spire Runner,
   Mercy Deck, Intake. Then change it in `index.html` (`<title>`, meta description), `play.html`,
   the title screen in `js/ui.js`, `CRAWL.title` in `js/content.js`, `README.md`, `CLAUDE.md` and the
   artifact title. Make a title logo for it with the art plugins.
3. **In-world art with SpriteCook / CellCog.** Full-size images (Canva's connector only returns small
   previews, so do not use it for game art):
   - 6 to 10 billboard and screen images: fake adverts, Meridian propaganda ("WARDEN CARES"),
     Unlisted graffiti, a noodle bar, the Low Tide. Save to `assets/tex/`, show them on the
     `cyber/tv-*` and `cyber/sign-*` models or on new glowing planes in `js/gen/town.js` and the
     district generator. Keep them unlit (`glow`) so bloom catches them.
   - Pixel-style UI pieces for the menus (frames, buttons, icons) to match the 8-bit menu look.
4. **Better characters with CellCog's 3D generation.** Boss models that look like bosses: Director Voss
   (half machine), the Overseer, the Warden. Generate as GLB, then in Blender: clean up, scale to the
   game (1.8 m for people), rig to an existing skeleton so they use existing clips, and bake with
   `tools/bake-characters.mjs`. The owner also has a character from Tripo they want as Rook; ask for
   a GLB export or screenshots for image-to-3D.
5. **Real kit textures.** The sci-fi kit's trim-sheet textures are flattened to vertex colours. Keeping
   them needs UVs in the packs and a textured merge path in `world.js`.
6. **Balance**, after the owner has played: elite rates, wave sizes, deal costs, the slower economy.

## Rebuilding the art from source

The original asset packs (Quaternius characters, Kenney kits, the cyberpunk kit, the sci-fi megakit)
are not in the repository; they were uploads to an earlier session. The baked results in `assets/` are
all a session needs. To rebake from source, the packs have to be uploaded again (bake commands in
`CLAUDE.md`), then `bake-ao.py` and `creature-clips.mjs` rerun on the fresh packs.

Blender for the art tools: create a Python 3.11 virtual environment and `pip install bpy` (Blender 5.0
as a Python module, about 375 MB), then run scripts with that venv's `python -I`.
