# Codex Review

## Findings

| Location | Severity | Finding and disposition |
|---|---:|---|
| `js/game.js:360` | High | A Space tap could be removed by keyup before the next frame. Added a queued-shot counter so every non-repeating tap fires at least once while held Space still auto-fires. |
| `js/game.js:252`, `js/game.js:387`, `js/game.js:543` | High | The opening spawned enemies too early and allowed enemies to queue on an invulnerable player. Delayed and slowed the opening, moved divers and tanks later, ramped the late round faster, and consume ordinary enemies that collide during invulnerability. |
| `js/game.js:634` | High | `onGameOver` must fire once per round because the host awards `final / 10`. The existing `state !== 'running'` guard is correct; added a regression test proving one callback after repeated frames. |
| `js/game.js:902` | High | Global game key listeners were reviewed for page-key theft. Space and arrows are prevented only when the running, visible game owns focus; regression tests cover idle and stopped states. No behavior change was needed. |
| `js/game.js:308` | Medium | Paused and offscreen games kept rendering every animation frame. The loop now stops after one paused frame and resumes only on the existing visibility, intersection, or pause events. |
| `js/game.js:107`, `js/game.js:742` | Low | Static gradients and sprite palettes were allocated during rendering. They are now created once per game instance. |
| `index.html:160`, `js/game.js:274` | Medium | The focusable canvas was exposed as an image with a fixed start label. It is now an application described by the visible instructions, and its label reports running, paused, score, game-over, and retry states. |
| `js/main.js:159` | High | The ARIA-modal boot overlay did not isolate the page; keyboard and assistive-technology users could reach controls behind it. Page siblings are now inert until boot dismissal. A live accessibility-tree check confirmed only the title dialog remained exposed. |
| `js/main.js:179` | High | Boot dismissal could run twice, continue its timer after dismissal, steal focus, or accept a navigation Enter before the title was ready. Added one-shot state, timer and listener cleanup, ready-state gating, Start-button-only click handling, and explicit post-boot focus. |
| `js/main.js:267`, `index.html:122` | Medium | Inventory tabs lacked tab-to-panel relationships, roving tab stops, and arrow-key behavior. Added IDs, `aria-controls`, `aria-labelledby`, Left/Right/Home/End navigation, and selected-only tab stops. |
| `js/main.js:14` | Medium | Valid JSON with an unexpected stored type could still crash `new Set(...)` or corrupt score arithmetic even though storage exceptions were caught. Stored scores and lists are now type-checked. |
| `js/main.js:417` | Medium | Rapid project-card activation could schedule more than one `showModal()` call. Added one opening guard shared across all cards. |
| `js/main.js:544` | Low | The mobile navigation could not be dismissed with Escape. Escape now closes it, updates `aria-expanded`, and returns focus to the menu button. |
| `js/audio.js:8` | Medium | AudioContext construction or resume failures could escape the optional-audio boundary and break the sound control. Initialization now fails closed, and the button stores the actual enabled state. |
| `js/scene.js:153`, `js/scene.js:369` | Low | Pointer hit testing and cabinet-screen animation allocated vectors, filtered arrays, intersection arrays, and flipped sprite strings in hot paths. These objects and sprite data are now reused. |
| `js/scene.js:313`, `js/scene.js:451` | Medium | Reduced-motion mode still animated the terrain, ring, stars, coins, and cabinet screen. Automatic scene motion now freezes, live preference changes are observed, and the static cabinet screen is not redrawn repeatedly. |
| `js/data.js:97` | Medium | The current FIU housing role was marked unconditionally active even though the approved profile says its current status is unconfirmed. It is now labeled as resume-listed and the date is attributed to the resume. |
| `js/data.js:129`, `js/data.js:147`, `js/data.js:165`, `js/data.js:181`, `js/data.js:197`, `js/data.js:246` | Medium | Several "Final boss" values were fictional or exaggerated. Replaced them with challenges supported by the corresponding repositories. |
| `js/data.js:173` | Medium | Google Storm copy included bilingual chat, emergency mode, NGO editing, and AI moderation without support in the approved profile. Replaced it with the profile-backed Gemini, map, Next.js route, and weather-API facts. |
| `js/data.js:229` | Low | "Launching soon" was time-sensitive and unsupported. Replaced it with the verified deployment-pending status. |
| `js/data.js:236` | High | Football Edge Engine claimed implemented ML prediction and listed scikit-learn, but its README says predictions are not implemented and scikit-learn is deferred. Rewrote the entry to describe its current ingestion phase and actual stack. |
| `js/data.js:31` | Low | Skill levels remain subjective self-ratings. They are explicitly described in source as rough comfort ratings and were left intact because no factual replacement is available. Owner confirmation is recommended before publication. |

## Audits with no change

- `css/style.css:48-64`, `css/style.css:604-633`: focus indicators, contrast, responsive grids, 375px sizing, and document overflow rules were reviewed. No definite layout defect was found; the project carousel intentionally scrolls inside its own container.
- All requested user-visible files were scanned for em-dash and en-dash characters and encoded equivalents. None remain.
- Remaining biography, education, T&TEC, GridBridge, agentproof, Media Organizer, FaithQuote, Nail Cove TT, and Football Edge Engine claims were checked against the approved profile, shared project notes, or local repository documentation.

## Verification

- `node --experimental-default-type=module --test tests/game.test.mjs`: 6 passed, 0 failed.
- `node --check` passed for every touched JavaScript file: `main.js`, `scene.js`, `audio.js`, `data.js`, and `game.js`.
- `git diff --check` passed.
- Desktop rendering and the boot accessibility tree were checked in Chrome against the local server.
- Automated 375px Chromium rendering was attempted with Chrome, Edge, and Brave. All three headless processes terminated in this Windows environment because their GPU process was unusable, so the 375px conclusion is source-audited rather than screenshot-verified. `tests/layout-harness.html` remains as a small repeatable width/scroll check for a working browser runner.
