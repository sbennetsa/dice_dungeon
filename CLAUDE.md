# CLAUDE.md

## Project Overview

Dice Dungeon is a tactical dice-based roguelike dungeon crawler built as a Progressive Web App (PWA). Players allocate dice to Strike/Guard zones across 15 floors (3 acts x 5 floors, each with a boss). Built entirely in vanilla JavaScript with ES6 modules — no frameworks, no build step.

## Tech Stack

- **JavaScript** (ES6 modules) — all game logic
- **HTML5 / CSS3** — semantic markup, CSS custom properties, flexbox
- **Service Worker** — offline-first PWA caching
- **Cloudflare Workers** (Wrangler) — deployment

## Project Structure

```
js/
  state.js         — Global game state (GS object), utility functions ($, rand, pick, shuffle, log)
  constants.js     — Enemy definitions, artifacts, skills, consumables
  engine.js        — Dice creation, rendering, drag-and-drop
  combat.js        — Combat turn execution, status effects
  screens.js       — UI screens, game flow (entry point)
  encounters/      — Procedural encounter generation system
    encounterGenerator.js
    environmentSystem.js
    eliteModifierSystem.js
    anomalySystem.js
    dungeonBlueprint.js  — Seeded dungeon generation (all 15 floors pre-determined)
    dungeonScoring.js    — Threat/reward budget values, per-floor and dungeon scoring
  persistence.js   — Run history (localStorage, up to 100 completed runs)
docs/              — Design specs (enemies, consumables, events, artifacts, encounters)
```

## Running Locally

Serve `index.html` with any HTTP server:

```sh
python -m http.server 8000
```

No `npm install` or build step required.

## Deploying

```sh
wrangler deploy
```

## Testing

No automated test suite. Testing is manual in-browser.

## Code Conventions

- **Naming**: camelCase for functions/variables, UPPERCASE for constants
- **Global state**: centralized in the `GS` object (`state.js`)
- **DOM helpers**: use `$()` from `state.js` (alias for `document.querySelector`)
- **Utility functions**: `rand()`, `pick()`, `shuffle()`, `log()`, `gainXP()`, `gainGold()`, `heal()` — all in `state.js`
- **Section headers**: decorated with `// ════════════════════` comment borders
- **Module pattern**: each file exports specific functions, `screens.js` is the main entry point
- **No linter/formatter configured** — maintain consistency with existing style

## Key Design Decisions

See `docs/decisions.md` for the full record. Summary of decisions that affect coding:

- **Elite EncounterChoice UI**: Show the visible modifier's effects as discrete named bullet points only — never aggregate computed stats (HP totals, avg damage, dice pool strings) that include both modifiers. Any aggregate number would be wrong in combat because the hidden modifier also applies. The hidden modifier must not be revealed before the player commits. See `docs/decisions.md` for full rationale.
- **Strike / Guard zone naming**: The attack area is the **Strike zone**; the defend area is the **Guard zone**. "Slot" refers only to individual die positions within a zone. Code: `GS.slots.strike` / `GS.slots.guard`. See `docs/decisions.md`.
- **Rune + Face Mod rework** *(implemented)*: Runes attach to slots as an array (`slot.runes[]`, max 1 normally, up to 3 with Runeforger); face mods attach to one face of a die (high power, triggers ~1/N times). Slots always use `{ id, runes: [] }` shape. See `docs/rework_artifacts_runes.md` — 10 runes, 10 utility die types, 12 face mods, Runeforger Tall capstone.
- **Dungeon Path screen**: A dedicated screen shown after `Game.start()` and before `Game.enterFloor()`. Displays the full seeded dungeon map with per-floor threat breakdowns and a collapsible Run Settings panel. `DungeonPath.proceed()` triggers floor entry. See `docs/decisions.md`.
- **Run difficulty (Casual/Standard/Heroic)**: Stored on `GS.runDifficulty`; NOT baked into blueprint generation. Same seed always produces the same enemy/environment/schedule layout regardless of difficulty. Difficulty only affects `EncounterChoice.show()` UI behavior and the dungeon map threat display. See `docs/decisions.md`.
- **Shop advantage scales by act**: `SHOP_ADVANTAGES = [4, 8, 12]` (Act 1/2/3). Early shops are worth less because players have had fewer combats and less gold to spend.
