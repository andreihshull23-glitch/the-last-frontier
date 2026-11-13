# The Last Frontier

A third-person sci-fi Western roguelike that runs in the browser. Walk the town of Mercy, gear up in its shops, then ride out on story chapters and jobs. Outlaws are people, the Meridian Company fields robots, and the Hollow keeps its dead walking.

## Play

`index.html` is the game. It loads ES modules, so it has to be served over HTTP rather than opened from disk:

```bash
python3 -m http.server 8000
```

Then open `http://localhost:8000/`. The only dependency is three.js r128, loaded from cdnjs.

## Controls

- WASD to move, mouse to look, Shift to sprint, Space to dodge.
- Click to fire, right-click or F for the alternate fire, R to reload.
- 1 to 7 or the mouse wheel to change guns, G for dynamite, Q for a bandage.
- J for the journal: the story so far and what to do next.
- E to use or talk, M for the map, Esc for the menu.

## Layout

- `index.html`: page and styles.
- `js/`: the game. `rules.js` owns the campaign, `sim.js` runs a ride, `gen/` builds levels, `gfx/` draws.
- `assets/`: models baked to vertex-coloured JSON packs.
- `tools/`: the scripts that bake the model packs.
- `tests/`: unit tests (`npm test`) and a Playwright smoke test.
- `docs/DESIGN.md`: design notes.

## Credits

World models by Kenney and characters and guns by Quaternius, both released under CC0.
