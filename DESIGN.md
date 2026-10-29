# Arcade Portfolio - Design Spec

Personal portfolio for Bhavesh Basdeo (CS @ FIU, Dec 2026). Theme: a retro arcade
you walk into at night. 3D synthwave world in the hero (three.js), pixel UI on top.

## Design read

Developer portfolio for recruiters and engineers, playful retro-arcade language,
three.js synthwave hero + pixel-type UI. Dials: VARIANCE 8, MOTION 7, DENSITY 4.
One theme (dark arcade). Must stay simple to understand: every game label has a
plain-English subtitle (e.g. "Level Select" / "Projects").

## Stack

Static site, no build step. ES modules. three.js from jsdelivr via import map
(`three@0.169.0`). Fonts: Press Start 2P (display, used sparingly), VT323 (UI/body
accents), Space Grotesk (readable body copy). Everything else hand-written.

```
index.html
css/style.css
js/data.js      content (single source of truth)
js/scene.js     three.js hero world
js/audio.js     WebAudio chiptune SFX (no audio files)
js/main.js      boot screen, HUD, sections, cards, modal, achievements, konami
js/game.js      BONUS STAGE mini-game (canvas 2D, self-contained)
```

## Palette (CSS custom properties)

```
--ink:      #0b0a16   page background (off-black, blue-violet)
--ink-2:    #141229   raised surfaces
--ink-3:    #1e1a3a   borders / slots
--paper:    #f3efe6   primary text
--muted:    #a6a1c4   secondary text
--coin:     #ffc93c   PRIMARY accent (coin gold): CTAs, score, focus rings
--neon:     #3cf0ff   secondary (grid lines, links, 3D wireframes)
--hot:      #ff4f9a   tertiary, only for danger / "enemy" / sun gradient
--lime:     #7dff8a   success / achievement unlocked
```

Shape: all-sharp pixel corners (radius 0) with "stepped" pixel borders via
box-shadow. No rounded cards anywhere.

## game.js contract (BONUS STAGE)

```js
export function createGame(canvas, opts) -> { start(), stop(), destroy() }
opts = {
  onScore(points),            // called whenever score changes (total)
  onGameOver(finalScore),
  onAchievement(id, label),   // e.g. ('first_blood','Squashed your first bug')
  sfx: { play(name) }         // names: 'shoot','hit','power','die','coin','start'
}
```

- Canvas is sized by CSS; the game must handle devicePixelRatio and resize.
- Concept: "BUG BLASTER". Player is a little pixel ship/cursor at the bottom.
  Bugs (pixel beetles) descend in waves; power-ups are tech-stack icons drawn as
  pixel glyphs (e.g. "PY", "TS", "SQL") that give spread shot / shield / slow-mo.
  Short rounds (60s timer) so it's a 1-minute distraction.
- Controls: arrows/A-D + Space on desktop; on touch, drag to move + auto-fire.
- Pixel art drawn procedurally from small string matrices; palette from above.
- Start screen inside the canvas ("PRESS SPACE / TAP TO START"), game over shows
  score + high score (localStorage, wrapped in try/catch) + "TAP TO RETRY".
- Pause automatically when the canvas leaves the viewport (IntersectionObserver)
  or the tab is hidden. No global key handlers stealing keys while not focused/
  visible: only capture keys while game is running and canvas is in view; prevent
  default scrolling for Space/arrows only then.
- Respect prefers-reduced-motion: reduce screen shake/particles, still playable.
- No external assets, no dependencies.
