# Design Decisions

A record of intentional design choices made during development, including the reasoning behind them. Reference this before changing related systems.

---

## Elite Encounter UI — Visible vs. Hidden Modifier Display

**Date:** 2026-03-01
**Status:** Decided

### Decision
The EncounterChoice screen shows the **visible modifier's effects as discrete, labelled bullet points** — never as aggregate computed stats that include the hidden modifier.

### What to show
- The visible modifier's named effects individually: dice upgrade (e.g. "d6 → d8"), HP multiplier, gold/XP multipliers, and passive name + description if one is added.
- A clear acknowledgement that one hidden modifier also applies after committing.

### What NOT to show
- Aggregate HP totals, dice pool strings, or average damage numbers that incorporate both modifiers. Any such number would be wrong in combat (the hidden modifier will also apply), making the Elite offer feel like a bait-and-switch.
- The hidden modifier's identity, effects, or magnitude in any form before the player commits.

### Rationale
If computed stats are shown using only the visible modifier, they are misleading — the player plans around numbers that don't reflect reality. If computed stats are shown using both modifiers, the hidden modifier is revealed. Showing the visible modifier's effects as named discrete changes avoids both problems: the player has real, accurate information about what they're opting into, while the hidden modifier's reveal moment after committing is preserved.

### Implementation note
The Elite card HP display should either be omitted or shown as the **base HP** (before any modifiers) with a `+ ???` note. The post-visible-modifier HP is not a useful number to show because it doesn't account for the hidden modifier.

---

## Skill Die — CSS 3D vs. Three.js

**Date:** 2026-02-28
**Status:** Decided

### Decision
The skill die is implemented as a CSS `transform-style: preserve-3d` rotating cube, not a Three.js scene.

### Rationale
Zero external dependency, no build step required, consistent with the project's no-framework philosophy. A CSS cube is sufficient for a d6 with 4 active faces. A Three.js prototype was built (`docs/skill-tree-d6-v2.html`) but rejected in favour of the CSS approach (`docs/skill-die-css-v1.html`).

---

## Combat Zone Naming — Strike / Guard

**Date:** 2026-03-02
**Status:** Decided

### Decision
The two combat zones are named **Strike** (formerly "Attack") and **Guard** (formerly "Defend"). Individual die positions within each zone are still called "slots." The old terms "attack area / attack slot" and "defend area / defend slot" are retired.

### Code change
- `GS.slots.attack` → `GS.slots.strike`
- `GS.slots.defend` → `GS.slots.guard`

All references in `combat.js`, `engine.js`, `screens.js`, and `constants.js` updated when the rework is implemented.

### Rationale
"Slot" was overloaded — it referred both to individual die positions and to the whole zone. The ambiguity made design and code harder to reason about. Strike/Guard are unambiguous zone labels. "Slot" is reserved for individual die positions only (e.g. "strike slot 0", "guard slot 2").

---

## Dice Modifier System — Runes (Slots) + Face Mods (Single Face)

**Date:** 2026-03-02
**Status:** Decided

### Decision
Each die has exactly two modifier layers:

1. **Rune** — attaches to a slot, always active, applies to every die placed in that slot. Moderate, reliable power. Stored at `GS.slots.strike[i].rune` / `GS.slots.guard[i].rune`.
2. **Face mod** — one per die, placed on a single face index. Only triggers when that face is rolled. High power, unreliable (triggers ~1/N times). Stored as `die.faceMod = { faceIndex: N, mod: { name, effect, ... } }` or `null`.

### Rationale
The previous system allowed many face mods per die, matched by face value. This caused upgrade collision bugs (two adjacent face mods could collide after an upgrade remapped values) and made power budgeting unclear. One face mod per die at spike power level creates a clean contrast: Wide builds scale reliably through runes spread across many dice; Tall builds invest rerolls chasing a single high-power face mod face. See `docs/rework_artifacts_runes.md` for the full rune list (10 runes) and face mod list (8 spikes + 4 status triggers).

### Implementation notes
- `faceIndex` is an array position index into `die.faceValues[]`. It persists through `upgradeDie()` unchanged — no remapping needed after upgrade.
- Auto-tray is retired; no auto-fire face mods remain in the new system.

---

## Tall Capstone — Runeforger (replaces Titan's Wrath)

**Date:** 2026-03-02
**Status:** Decided

### Decision
The Tall skill tree capstone (`t_n`) changes:

- **Old:** `Titan's Wrath — Single-die slots deal ×3`
- **New:** `Runeforger — Your slots can hold up to 3 runes each`

### Rationale
Titan's Wrath as a passive overlapped directly with the Titan's Blow rune (same ×3 effect, same condition). Having both created redundancy. Runeforger is a more interesting capstone: it enables the Tall power fantasy of stacking Amplifier + Titan's Blow + Siphon on one slot for ×6 damage with full lifesteal — unambiguously a Tall-only strategy that Wide cannot exploit.

### Implementation notes
Slots always use `{ id: 'str-0', runes: [] }` (array). Without Runeforger the max is 1 (adding to a full slot replaces the existing rune via `shift()/push()`). With Runeforger the max is 3. `GS.passives.runeforger = true` is the flag; `getSlotRunes(slotId)` returns the array (or `[]` if none).

---

## Dungeon Path Screen — Strategic Preview Before Descent

**Date:** 2026-03-02
**Status:** Decided

### Decision
A dedicated `#screen-dungeon-path` screen is shown after `Game.start()` generates the blueprint and before `Game.enterFloor()` begins the run. It displays the full seeded dungeon map (`DungeonMap.render()` with `showAll: true`), a seed display with copy button, and a collapsible Run Settings panel. The player explicitly clicks "Descend into the Dungeon" to begin.

### Rationale
The dungeon map has enough information density (per-floor threat breakdowns, anomalies, environments, elite badges, act subtotals, scoring) that dumping the player directly into floor 1 without a preview is a missed opportunity. The path screen gives players time to internalize the layout before committing. It also naturally hosts the run customization controls — changes live-regenerate the map using the same seed with updated options, giving immediate visual feedback.

### Implementation notes
- `DungeonPath` object in `screens.js`: `show()`, `proceed()`, `regenerate()`, `toggleSettings()`, `setSchedule()`, `setModifier()`, `_renderSettings()`
- `DungeonMap.render(seedContainerId, contentContainerId, options)` is reused by both the dungeon path screen (full reveal) and the in-run overlay (fog of war on unvisited floors)
- `options.showAll: true` overrides fog; `options.difficulty` (falls back to `GS.runDifficulty`) controls elite threat badge display

---

## Run Difficulty Tiers — Casual / Standard / Heroic

**Date:** 2026-03-02
**Status:** Decided

### Decision
Three difficulty tiers are offered in the Run Settings panel:

| Tier | Elites | EncounterChoice UI |
|------|--------|-------------------|
| **Casual** | Never offered | Standard panel only, no Elite tab |
| **Standard** | Per-act odds (33%/67%/100%) | Standard + Elite tabs as normal |
| **Heroic** | Always elite, no downgrade | Elite panel only; `applyEliteChoice()` applied before show; single Fight button |

Difficulty is stored as `GS.runDifficulty` and is **NOT** baked into blueprint generation. The blueprint always uses the same seeded `eliteOffered` logic regardless of difficulty.

### Rationale
Baking difficulty into blueprint generation would mean the same seed produces different enemies, environments, and schedules depending on the chosen difficulty — breaking the expectation that a seed is a reproducible run layout. Keeping difficulty as a run-level flag means:
- Same seed + same settings → identical dungeon (reproducible, shareable)
- Difficulty only affects the EncounterChoice gating and map display
- Blueprint generation stays deterministic and composable

Heroic removes the Standard option from EncounterChoice entirely (not just pre-selects Elite) to make it a genuine constraint, not just a convenience. Casual hides the Elite tab so players don't feel pressured to take risky fights they opted out of.

### Implementation notes
- `EncounterChoice.show()`: branches on `GS.runDifficulty`
  - `'heroic'`: calls `applyEliteChoice()` upfront, renders elite panel, Fight button → `Combat.start()`
  - `'casual'`: renders standard panel only, Fight button → `Combat.start()`
  - `'standard'`: existing tab-flipper behavior unchanged
- `DungeonMap.render()` `options.difficulty` controls threat badge display: heroic always shows elite threat badge; casual never shows it; standard shows it only when `floor.eliteOffered` is true

---

## Shop Advantage — Scaled by Act, Not Flat

**Date:** 2026-03-02
**Status:** Decided

### Decision
Shop player-advantage in dungeon scoring uses `SHOP_ADVANTAGES = [4, 8, 12]` (Act 1 / Act 2 / Act 3) instead of a flat value. Double-shop schedules use `DOUBLE_SHOP_ADVANTAGES = [6, 12, 18]`.

### Rationale
An Act 1 shop is objectively worth less than an Act 3 shop: the player has fewer dice, less gold accumulated, and fewer upgrade paths explored. A flat value of 8 overestimated the benefit of early shops (player can barely afford one item) and underestimated late shops (player has capital and a clear strategy). The scaled values better reflect actual purchasing power and decision quality at each act.

---

## Utility Dice — Purchasable Die Types with Special Effects

**Date:** 2026-03-02
**Status:** Decided

### Decision
Utility dice are purchasable die types that trade normal damage/block output for a distinct effect. They occupy a slot position (the cost) and interact with runes, upgrades, trim, and fracture like any other die.

Catalog: Gold Die, Poison Die, Chill Die, Burn Die, Shield Die, Mark Die, Amplifier Die, Drain Die, Weaken Die, Mimic Die.

**Gold Die specifics:** Faces show % multiplier values (5%–25%). Generates gold = the slot's other dice total × the rolled multiplier. Contributes 0 to damage/block.

**Mimic Die specifics:** On roll, copies the current rolled value of a random die from the player's **entire dice pool** (allocated or not — not just the same slot). High variance.

### Rationale
Several retired face mods (×2 Strike, Shield, Poison, Gold Rush) represented interesting effects that deserved a home. Making them utility dice lets Wide builds use them as dedicated "engine dice" for consistent-trigger output, while Tall builds still prefer face mods (high-spike, reroll-chaseable). It avoids bloating the face mod list with effects that are better as always-on choices — and it creates a meaningful shop decision: spend gold on more dice vs. spend gold on better dice.

### Acquisition
Shop purchase primarily. Price range 60–100g depending on power level (Gold Die and Amplifier Die at the higher end; status utility dice at the lower end).
