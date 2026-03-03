# Dice Dungeon

A tactical dice-based roguelike dungeon crawler built as a Progressive Web App (PWA).

## Gameplay

Players allocate dice to **Strike** and **Guard** zones to attack enemies and block incoming damage. Each run spans 15 floors across 3 acts, with a boss at the end of each act.

- **Strike zone** — dice placed here deal damage to the enemy
- **Guard zone** — dice placed here absorb incoming damage
- **Dice pool** — grows and upgrades over the run via rewards, shops, and rest stops

Every floor presents a choice: fight a standard encounter or risk an **Elite** encounter for greater rewards. Elites apply two modifiers — one visible before you commit, one hidden until after.

### Core Loop

1. **Combat** — allocate dice, execute, survive
2. **Rewards** — upgrade a die or gain an artifact
3. **Shop** — buy dice, runes, artifacts, consumables
4. **Events** — narrative choices with permanent consequences
5. **Rest** — transform or upgrade your dice
6. **Boss** — end-of-act encounter, harder than standard enemies

### Progression Systems

- **Artifacts** — passive effects that compound over a run (30 artifacts across 3 act pools)
- **Runes** — attach to slots; trigger on every die placed there (10 rune types)
- **Face mods** — attach to a single die face; trigger only when that face rolls (12 types)
- **Utility dice** — special dice with non-standard effects (gold, poison, shield, drain, mimic, and more)
- **Skill tree** — persistent upgrades across runs
- **Environments** — per-encounter modifiers that affect combat rules

### Seeded Runs

Every run uses a seed. The full 15-floor dungeon map — enemies, environments, floor types, elite schedules — is generated up front from that seed. Changing difficulty does **not** change the seed's layout; the same seed always produces the same dungeon.

Three difficulty tiers:
- **Casual** — standard encounters only
- **Standard** — choose between standard or elite on each floor
- **Heroic** — every encounter is forced elite

## Tech Stack

- Vanilla JavaScript (ES6 modules) — no frameworks, no build step
- HTML5 / CSS3 — semantic markup, CSS custom properties, flexbox
- Service Worker — offline-first PWA
- Cloudflare Workers (Wrangler) — deployment

## Running Locally

Serve `index.html` with any static HTTP server:

```sh
python -m http.server 8000
```

Then open `http://localhost:8000` in your browser.

## Deploying

```sh
wrangler deploy
```

## Project Structure

```
index.html           — Game markup and screen divs
style.css            — All styles
js/
  state.js           — Global game state (GS), utility functions
  constants.js       — Enemy/boss/artifact/rune/skill definitions
  engine.js          — Dice creation, rendering, drag-and-drop
  combat.js          — Combat turn execution, status effects
  screens.js         — All UI screens and game flow (entry point)
  persistence.js     — Run history (localStorage, up to 100 runs)
  encounters/
    encounterGenerator.js   — Per-floor encounter generation
    environmentSystem.js    — 10 combat environments
    eliteModifierSystem.js  — Elite modifier selection and application
    anomalySystem.js        — Random combat anomalies
    dungeonBlueprint.js     — Seeded full-run generation
    dungeonScoring.js       — Threat/reward scoring
docs/                — Design specs and decision log
```

## Testing

No automated test suite. Testing is manual in-browser.
