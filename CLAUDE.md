# CLAUDE.md

## Project Overview

Dice Dungeon is a tactical dice-based roguelike dungeon crawler built as a Progressive Web App (PWA). Players allocate dice to Attack/Defend slots across 15 floors (3 acts x 5 floors, each with a boss). Built entirely in vanilla JavaScript with ES6 modules — no frameworks, no build step.

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
