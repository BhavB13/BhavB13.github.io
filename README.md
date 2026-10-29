# Bhavesh Basdeo | Player 1

A retro-arcade personal portfolio. A three.js synthwave world (terrain, striped sun,
floating arcade cabinet with clickable coins) sits behind a pixel-art UI with a score,
achievements, a Konami code, chiptune sound effects and a one-minute mini-game.

No build step: plain HTML, CSS and ES modules. three.js loads from jsDelivr.

## Run locally

```bash
python -m http.server 8000
```

Then open http://localhost:8000. (ES modules need a server; opening the file directly won't work.)

## Edit content

Everything you would want to change lives in `js/data.js`: bio, stats, skills,
experience, projects (and their links), and achievement labels.

## Files

| File | What it does |
|---|---|
| `index.html` | Page structure |
| `css/style.css` | All styling (one dark theme, pixel borders) |
| `js/main.js` | Boot screen, HUD, sections, cartridges, modals, achievements, Konami code |
| `js/scene.js` | three.js world |
| `js/audio.js` | Oscillator-based sound effects (no audio files) |
| `js/game.js` | Bug Blaster mini-game |
| `js/data.js` | Content |

## Deploy

Any static host works. For GitHub Pages: push this folder to a repo named
`BhavB13.github.io` (or any repo with Pages enabled on the main branch, root folder).

## Secrets

- Click the spinning coins in the hero.
- Up Up Down Down Left Right Left Right B A.
- There are 16 achievements. The trophy button in the top bar lists them.
