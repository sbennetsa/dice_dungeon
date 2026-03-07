# CLAUDE.md

## Project Overview

Dice Dungeon is a tactical dice-based roguelike dungeon crawler built as a Progressive Web App (PWA). Players allocate dice to Strike/Guard zones across 15 floors (3 acts x 5 floors, each with a boss). Built entirely in vanilla JavaScript with ES6 modules — no frameworks, no build step.

## Tech Stack

- **JavaScript** (ES6 modules) — all game logic
- **HTML5 / CSS3** — semantic markup, CSS custom properties, flexbox
- **Service Worker** — offline-first PWA caching
- **Cloudflare Workers** (Wrangler) — deployment; `worker.js` handles `POST /api/issue` (play tester reporting → GitHub Issues API), falls through to static assets via `env.ASSETS.fetch()`

## Project Structure

```
worker.js          — Cloudflare Worker: POST /api/issue → GitHub Issues API; static asset fallthrough
js/
  state.js         — Global game state (GS object), utility functions ($, rand, pick, shuffle, log)
  constants.js     — Enemy definitions, artifacts, skills, consumables
  engine.js        — Dice creation, rendering, drag-and-drop
  combat.js        — Combat turn execution, status effects
  screens.js       — UI screens, game flow (entry point); IssueReport module
  campaign.js      — Ancient Order favor system, campaign loop manager, ORDER_START_BOONS, ORDER_CODEX
  bestiary.js      — Bestiary data (BESTIARY_DATA) and UI (BestiaryUI class)
  encounters/      — Procedural encounter generation system
    encounterGenerator.js
    environmentSystem.js
    eliteModifierSystem.js
    anomalySystem.js
    dungeonBlueprint.js  — Seeded dungeon generation (all 15 floors pre-determined)
    dungeonScoring.js    — Threat/reward budget values, per-floor and dungeon scoring
  persistence.js   — Run history: RunHistory (localStorage, up to 100 runs) + CampaignHistory (up to 50 campaigns)
assets/
  orders/
    headers/       — Order Codex header images (800×920px, ink sketch style)
    badges/        — Order guild badge images (400×400px, ink sketch style)
  enemies/
    sketch/        — Bestiary creature sketches (ink style, webp)
    card/          — Enemy card art (webp)
docs/              — Design specs (enemies, consumables, events, artifacts, encounters)
  order-art-prompts.md — AI image generation prompts for Order header and badge art
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
- **DOM helpers**: use `$()` from `state.js` (alias for `document.getElementById` — no `#` prefix)
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
- **Run difficulty (Casual/Standard/Heroic)**: Stored on `GS.runDifficulty` and passed to `generateDungeonBlueprint({ difficulty })`. Difficulty maps to a **challenge budget range** (`CHALLENGE_BUDGETS` in `dungeonBlueprint.js`) that drives procedural generation: enemy selection is weighted toward the per-floor threat target, environment spawn rate and selection are budget-steered, and elite offer probability scales continuously with the budget. The budget distributes across acts with weights `[0.15, 0.30, 0.55]` (+ seeded jitter) so Act 3 is always the hardest. Same seed + same difficulty = same dungeon; different difficulty = different enemy/env/elite choices. A direct `challengeTarget` override bypasses the difficulty range for custom challenge values.
- **Challenge rating bands**: Each difficulty enforces a strict non-overlapping rating band via rejection + reseed: Casual 1–3, Standard 4–7, Heroic 8–10. Schedule types are filtered per difficulty (`DIFFICULTY_SCHEDULES` in `dungeonBlueprint.js`): casual excludes gauntlet, heroic excludes event-heavy. See `docs/decisions.md`.
- **Player advantage values**: All advantage values (rests, events, artifacts, gold, XP) use **threat-equivalent units** — same scale as enemy `baseThreat`. Anchored on die upgrade (+1/+1 ≈ 5% DPS boost × remaining combat threat). Heal (30% HP) has the same face value as upgrade — equivalent maintenance choices. Rest total ≈ 3.75× upgrade. See `docs/decisions.md` for full methodology.
- **Gold + XP advantage per combat**: Gold and XP earned from combat are scored as player advantage instead of flat shop values. `GOLD_ADVANTAGE_RATE = [0.25, 0.20, 0.10]` (Act 1/2/3, anchored to die upgrade optimal spend, discounted for structural constraints). `XP_ADVANTAGE_RATE = 0.15` (level-up ≈ 80 threat-equiv, discounted for diminishing returns). Shops are no longer scored — gold is the advantage source. `rewardToAdvantage(reward, act)` converts `threatToReward` output to threat-equiv.
- **XP from threat**: XP rewards are computed dynamically from `baseThreat` at encounter generation using `threatToXP(threat) = round(2.5 × threat^0.65)` with ±15% range. This replaces hardcoded XP values — enemies no longer carry `xp:` in their definitions. The sublinear curve compresses the ~12× Act 1→3 threat range into ~5× XP range, so higher-act enemies reward more but don't dwarf Act 1. Level curve: `xpNext = 30` initial, `×1.4` per level. Targets 6–7 levels per standard run. Level 2 is guaranteed before the Bone King with 2+ combats (worst case: 2×16 = 32 > 30).
- **Font system**: Three fonts via CSS custom properties — `--font-heading` (Cinzel, headings/names/titles), `--font-body` (Crimson Text, descriptions/flavor/log), `--font-data` (JetBrains Mono, numbers/stats/dice values). Root font-size is responsive: 15px mobile / 16px 600px+ / 17px 1024px+. Font sizes use a rem scale (`--text-xs` through `--text-2xl`). All `font-family` declarations reference variables — no raw font names in CSS or HTML. Do NOT add raw font-name strings; use the variables. See `docs/decisions.md` and `docs/font-system-spec.md`.
- **Elite modifier threat**: `eliteAffinities` in `bestiaryThreatData.js` use per-act dicts (`{ 1: N, 2: N, 3: N }`) for regular enemies; boss affinities are flat numbers (each boss appears once). `getEliteThreatForEnemy(modId, enemyName, bossFloor, act)` resolves the correct value. `passiveScale` is NOT used in `scoreFloor()` — act-specific values already account for scaling. See `docs/elite-modifier-threat-analysis.md`.
- **Dual reward system**: `goldMult`/`xpMult` on modifiers in `eliteModifierSystem.js` are player-visible reward signals only. Actual balance lives in `eliteAffinities`. Do not attempt to align them — the discrepancy is intentional.
- **ELITE_NET_ADVANTAGE**: `[15, 8, -15]` in `dungeonScoring.js` — modifier-agnostic net advantage per elite fight per act. Must remain constant regardless of specific modifiers drawn; variation in individual encounters is by design. See `docs/elite-modifier-threat-analysis.md`.
- **Casual elite constraints**: max 10% elite rate; 1 modifier (visible only, `hidden: null`). `selectEliteModifiersSeeded` always consumes the same RNG calls regardless of `singleModifier` flag to preserve seed stability. Brittle on Casual is accepted as player-favourable (rare, optional, fully transparent).
- **Campaign Mode / Order favor system**: Five Orders (warpack/gilded/runeforged/brood/ironward); favor accumulates per-kill as `Σ(baseThreat × node.orderFavor[order])` for each unlocked Skill Die node. Flushed to campaign state at loop end via `Campaign.endLoop(GS._loopFavor, ...)`. Three tiers per Order; reaching a tier enhances already-unlocked nodes (written to `gs.passives` at dungeon start by `Campaign.applyTierEnhancements(GS)`) and upgrades aligned artifacts. Cross-order synergies activate when both Orders ≥ Tier 2. Order system is fully hidden during runs — player never sees numbers or bars; narrative-only Order Interaction screen shown at loop end when thresholds are crossed. Brood thresholds are lower (max weight 3.4 vs 5–6.9 for others) to ensure similar pacing. `GS.campaign` = active campaign obj or null; `GS._loopFavor` = per-order running totals for current loop. See `docs/campaign-mode.md` and `js/campaign.js`.
- **Campaign starting boons**: At run start, `Campaign.getApplicableStartBoons()` returns boons for each crossed Order tier. Applied in `Game.start()`. Types: `die`, `utilityDie`, `rune`, `gold`, `consumable`, `artifact`, `maxHp`, `transformBuff`. Defined in `ORDER_START_BOONS` in `campaign.js`. Boons are cumulative — reaching Tier 2 grants Tier 1 + Tier 2 boons. See `docs/decisions.md`.
- **Pack Tactics zone scoping**: `packTactics` passive applies to strike zone dice only — never guard. This must be enforced in three places: `renderDieCard()` (display), `dieContribution()` (slot totals), and the attack calculation in `combat.js`. The `dieContribution()` helper takes an `isStrike` boolean for this purpose.
- **Order Codex art**: Each Order in `ORDER_CODEX` has `headerImg` and `badgeImg` fields pointing to `assets/orders/headers/` and `assets/orders/badges/`. Art style matches bestiary sketches (black-and-white ink, white background). See `docs/order-art-prompts.md` for generation prompts.
- **Play tester issue reporting**: In-game 🐛 button in all header bars opens `IssueReport` overlay. Submits to `POST /api/issue` in `worker.js`, which creates a GitHub issue via the API. `GITHUB_TOKEN` stored as a Cloudflare Worker secret. Auto-captures seed, floor, act, difficulty, enemy, HP, artifacts, environment, browser.
- **Casual environment filtering**: Casual difficulty uses a flat 10% environment spawn chance (vs. 30–70% budget-steered on Standard/Heroic). Boss floors on Casual always have `environment = null`. Environment selection still runs (consuming its RNG call) before nulling the result, to preserve seed stability. Implemented via `chanceOverride` parameter in `selectEnvironmentSeeded()` / `selectEnvironmentForBudget()` in `dungeonBlueprint.js`.
- **Player debuff countdown timing**: All player debuff countdowns (sealed slots, locked dice, dice curse, devoured dice) are decremented at the **START of `execute()`**, not in `newTurn()`. This ensures effects persist through the full allocation phase the turn they are applied, then expire at the moment the player submits. See `docs/decisions.md`.
- **Player debuff tag display**: All player debuff tags (sealed slots, locked dice, dice curse, devoured dice, poison) are shown exclusively in the `#player-status-bar` via `renderPlayerStatus()`. They are NOT duplicated in the enemy panel. Tags for all timed effects show a turn count `(Nt)`. `renderPlayerStatus()` is called at the end of `enemyDefeated()` to ensure stale tags are cleared when combat ends.
- **NCE (Non-Combat Encounters)**: Random corridor interrupts that fire *between* floors without advancing the floor counter. Integrated at `Game.nextFloor()` — NCE check runs first; if one fires the floor advance is deferred until the player hits Continue. Fire rates: 50% after boss, 30% after combat, 25% after event, 10% after shop. Design intent: flavour + minor rewards only — not run-defining. `applyEncounterResult` scales positive gold (`×1/×1.5/×2.5`) and HP (`×1/×1.2/×1.5`) by act; negative outcomes never scale; XP is flat. NCE UI reuses `#screen-event` via the `NCE` object in `screens.js`. `GS.seenEncounters` deduplicates the last 8 encounters. See `docs/nce-balance-audit.md` for full design rationale and encounter breakdown.
