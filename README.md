# The Last Frontier

A third-person sci-fi Western roguelike that runs in the browser. Walk the town of Mercy, gear up in its shops, then ride out on story chapters and jobs. Outlaws are people, the Meridian Company fields robots, and the Hollow keeps its dead walking.

## Play

`index.html` is the game. It loads ES modules, so it has to be served over HTTP rather than opened from disk:

```bash
python3 -m http.server 8000
```

Then open `http://localhost:8000/play.html`. The only dependency is three.js r128, loaded from cdnjs.

`index.html` is written as a fragment because the claude.ai Artifact host wraps it in a page. `play.html` wraps it the same way, so use `play.html` in an ordinary browser tab or on GitHub Pages.

## Controls

- WASD to move, mouse to look, Shift to sprint, Space to dodge.
- Click to fire, right-click or F for the alternate fire, R to reload.
- 1 to 7 or the mouse wheel to change guns, G for dynamite, Q for a bandage.
- J for the journal: the story so far and what to do next.
- E to use or talk, M for the map, Esc for the menu.

### Controller

Any standard controller works: left stick moves, right stick looks, RT fires, LT alternate fire, A dodges, X reloads, Y uses, B bandages, RB dynamite, LB next gun, L3 sprint. In menus the D-pad moves, A presses and B goes back. Every button can be changed in Settings.

## Layout

- `index.html`: page and styles.
- `js/`: the game. `rules.js` owns the campaign, `sim.js` runs a ride, `gen/` builds levels, `gfx/` draws.
- `assets/`: models baked to vertex-coloured JSON packs.
- `tools/`: the scripts that bake the model packs.
- `tests/`: unit tests (`npm test`) and a Playwright smoke test.
- `docs/DESIGN.md`: design notes.

## Credits

World models by Kenney and characters and guns by Quaternius, both released under CC0.
