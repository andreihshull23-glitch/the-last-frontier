# Handoff

Where the project stands and what to do next, for a new session picking it up.
Read `CLAUDE.md` first; it explains the code. This file is the current to-do list.

## State (2026-11-20)

- Published as a claude.ai artifact (latest: Version 16, plus the art work below once republished):
  https://claude.ai/artifact/614QNGDgEzdu7DKhCHLWPy. Publish `index.html` with every file under
  `js/` and `assets/` (including `assets/sky/*.jpg` and `assets/tex/*.png`) to that same URL.
- Everything is in this repository. Nothing needed to run or publish the game lives anywhere else.
- Tests: `npm test` (16 pass); browser tests in `tests/smoke.mjs` (all sections pass);
  high-quality screenshots with `tests/looks.mjs`.

## Done recently (art pass)

- Bloom, tone mapping and grading (`js/gfx/post.js`) on the two better quality tiers.
- Light from every lamp and sign baked onto nearby surfaces when a level is built (`world.js`).
- Rim light on characters; a world-space detail texture on every surface (`assets/tex/detail.png`).
- Ambient occlusion baked into every world and character pack with Blender (`tools/blender/bake-ao.py`).
- Panoramic skies rendered in Blender (`assets/sky/city.jpg`, `assets/sky/hollow.jpg`).
- Walk, attack and death animations for the Hollow's creatures (`tools/creature-clips.mjs`).

## Next steps

1. **Check the new city sky.** It was re-rendered with the towers pushed back and smaller windows
   because the first version filled the view overhead. Take `tests/looks.mjs` screenshots and look.
2. **Billboard and screen art.** The deck and districts would benefit from in-world adverts and
   Meridian propaganda on screens. The SpriteCook and CellCog plugins (now allowed through the
   network in the Default environment: `mcp.spritecook.ai`, `cellcog.ai`) can make these as
   full-size images. Canva's connector only returns small previews. Put images in `assets/tex/`
   and show them on the `cyber/tv-*` and `cyber/sign-*` screens or on new glowing planes.
3. **A new name.** "The Last Frontier" comes from the old Western version and no longer fits.
   Candidates discussed: UNLISTED (the deleted people, and the resistance), Spire Runner, Mercy Deck,
   Intake. Once chosen, change the title in `index.html`, `play.html`, `js/ui.js` (title screen),
   `CRAWL.title` in `js/content.js`, the README, and the artifact's title.
4. **Kit textures.** The sci-fi kit's trim-sheet textures are flattened to vertex colours. Keeping
   real textures needs UVs in the packs and a textured merge path in `world.js`.
5. Balance first guesses: elite rates, wave sizes, deal costs, the slower economy.

## Rebuilding the art from source

The original asset packs (Quaternius, Kenney, the cyberpunk kit) are not in the repository; they were
uploads to an earlier session. The baked results in `assets/` are all a session needs. To rebake from
source, the packs have to be uploaded again (see the bake commands in `CLAUDE.md`), and then
`bake-ao.py` and `creature-clips.mjs` have to be rerun on the fresh packs.

Blender for the art tools: create a Python 3.11 virtual environment and `pip install bpy`
(Blender 5.0 as a module, about 375 MB). Run scripts with that venv's `python -I`.
