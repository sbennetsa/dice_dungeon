# Design Decisions

A record of intentional design choices made during development, including the reasoning behind them. Reference this before changing related systems.

---

## No On-Death Effects That Can Kill the Player

**Date:** 2026-03-07
**Status:** Decided

### Decision
Enemy on-death passives must not be able to kill the player. Removed Soul Pact from the Demon (act2 and act3).

### Rationale
Soul Pact reflected overkill damage back to the player on the same turn they killed the Demon. This created an unavoidable death scenario — the player dealt the killing blow and died simultaneously with no way to prevent it. This feels unfair regardless of how much damage was dealt.

The Demon's identity is preserved by its existing kit: Hellfire (unblockable, alternates with Strike) and Hellfire Corruption (each hit corrupts a player die -1 max). These provide sufficient threat and uniqueness without a death trap.

### Rule
Do not add passives with `id` patterns like `soulPact`, `deathReflect`, or any mechanic that damages the player as a direct consequence of the player dealing lethal damage to an enemy.

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

## Player Advantage Values — Threat-Equivalent Scale

**Date:** 2026-03-05
**Status:** Decided

### Decision
All player advantage values (rests, shops, events, artifacts, elite rewards) are expressed in **threat-equivalent units** — the same scale as enemy `baseThreat`. Net challenge = totalCombatThreat − totalPlayerAdvantage is meaningful because both sides use the same unit.

### Anchor: die upgrade (+1/+1)
The die upgrade is the anchor for all advantage values because it's a fixed, calculable input to the threat formula:
- +1 avg damage/turn ≈ 5% DPS boost (player pool ~20 avg DPS)
- Value = boost fraction × remaining combat threat
- Post-Act 1: 0.05 × 720 ≈ 36
- Post-Act 2: 0.04 × 1220 ≈ 48

### Heal equivalence
The 30% heal has the **same face value** as the die upgrade — they are meant to be equivalent maintenance choices. The heal won't always be fully utilized (~60-70% uptime when damaged), making both approximately equal in expected value.

### Rest total
Rest = transformation(2.5× upgrade) + maintenance(1× upgrade) + consumable(0.25× upgrade) ≈ 3.75× upgrade.
- `REST_ADVANTAGES = [135, 180]` (post-Act 1, post-Act 2)

### Gold advantage (per combat, optimal spend)
Gold earned from combat is scored as player advantage at the die upgrade optimal-spend rate, discounted for structural constraints (limited shop visits, timing, unspendable late-run gold):
- `GOLD_ADVANTAGE_RATE = [0.25, 0.20, 0.10]` — Act 1/2/3
- Act 1 gold benefits the entire run (high utilization); Act 3 gold has few remaining fights
- Replaces the old `SHOP_ADVANTAGES` — the shop is the conversion venue, not the advantage source

### XP advantage (per combat)
XP earned from combat is scored as player advantage. Level-up ≈ +5 HP (permanent durability) + skill point ≈ 80 threat-equiv. Avg 82 XP/level → ~1.0/XP naive, discounted for diminishing level value and end-of-run XP waste:
- `XP_ADVANTAGE_RATE = 0.15`
- A player fighting the Act 1 boss at level 2 is meaningfully stronger than one at level 1; XP advantage captures this

### Per-combat net check
Each combat must contribute positive net threat (advantage ratio < 1):
- Act 1: 1.5×0.25 + 2.0×0.15 = 0.675 → net 32.5% of threat
- Act 2: 1.5×0.20 + 2.0×0.15 = 0.60 → net 40%
- Act 3: 1.5×0.10 + 2.0×0.15 = 0.45 → net 55%

Act 3 combats have highest net threat — correct since late-run rewards have fewer fights to benefit from.

### Other values
- `EVENT_ADVANTAGES` — 10 to 40, scaled by event impact and permanence
- `REWARD_ADVANTAGES` — bossArtifact: 35, eliteArtifact: 25
- `ELITE_NET_ADVANTAGE = [8, 3, -5]` — rewards dominate early, attrition dominates late

### Rationale
Previous advantage values (e.g. rests at 15/18 vs Act 2 enemies at ~60 threat) were not on the same scale as threat, making the net challenge metric meaningless. Using the die upgrade as an anchor and deriving all other values relative to it ensures balanced scoring where each reward type speaks to a comparable benefit. Gold and XP are scored per combat rather than as flat shop values because they scale with combat threat — harder fights give more gold and XP, and more combat floors produce more total rewards.

---

## Challenge Rating Bands — Strict Non-Overlapping Per Difficulty

**Date:** 2026-03-05
**Status:** Decided

### Decision
Each difficulty enforces a strict challenge rating band via rejection + reseed:
- **Casual:** 1–3
- **Standard:** 4–7
- **Heroic:** 8–10

If a generated dungeon's `challengeRating` falls outside its difficulty's band, the seed is nudged (+1) and the dungeon regenerated, up to 5 attempts. The `reseedAttempts` count is stored on the blueprint for diagnostics.

### Schedule filtering
Certain floor schedules are excluded per difficulty to prevent structural mismatches:
- **Casual** excludes gauntlet (3 combats, no events) — too many combats produce too little player advantage
- **Heroic** excludes event-heavy (2 events per act) — too much player advantage reduces effective challenge
- **Standard** allows all 5 schedule types

This is implemented via `DIFFICULTY_SCHEDULES` in `dungeonBlueprint.js`, passed as `allowedSchedules` to `generateAct()`.

### Rationale
Without band enforcement, seed RNG could produce wildly inappropriate ratings (e.g. 4/10 on Heroic, 1/10 on Standard). Non-overlapping bands ensure each difficulty feels distinct. Schedule filtering addresses the root cause: the schedule determines how many combat vs. non-combat floors exist, which directly determines the advantage/threat balance. Filtering prevents the mismatch rather than trying to compensate after the fact.

### Normalization formula
`challengeRating = round((effectiveChallenge − 247) / 53)` clamped to 1–10. Effective challenge range is ~300 (casual/event-heavy) to ~780 (heroic/gauntlet) with current per-act bestiary threat values. Constants were recalibrated after the per-act bestiary overhaul raised baseThreat values significantly above the original scale.

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

---

## Font System — Cinzel / Crimson Text / JetBrains Mono

**Date:** 2026-03-04
**Status:** Decided

### Decision
Three fonts, each with a strict role, applied via CSS custom properties:

| Role | Font | Variable | Usage |
|------|------|----------|-------|
| **Headings** | Cinzel | `--font-heading` | h1–h3, enemy/artifact/boss names, screen titles, floor names |
| **Body** | Crimson Text | `--font-body` | Descriptions, flavor text, combat log, tooltips, event narrative, card body text |
| **Data** | JetBrains Mono | `--font-data` | Dice values, HP/ATK/DEF numbers, gold, XP, damage numbers, stat labels |

Root font size is responsive: 15px (mobile) → 16px (600px+) → 17px (1024px+). All font-size values use `rem` via a named scale (`--text-xs` through `--text-2xl`).

### Rationale
The previous stack (Uncial Antiqua / EB Garamond / JetBrains Mono) mixed a single-weight medieval display font with a serif body font that had readability issues at small sizes on dark backgrounds. Cinzel has wider glyph coverage and multiple weights, supporting bold headings vs. regular subheadings. Crimson Text is optimized for screen readability and supports italic/semi-bold weight for flavor text variation. JetBrains Mono is retained for data because its tabular numerals keep stats and dice values aligned.

### Implementation notes
- Google Fonts load: `Cinzel:wght@400;600;700`, `Crimson+Text:ital,wght@0,400;0,600;0,700;1,400`, `JetBrains+Mono:wght@400;600;700`
- Preconnect links added before the stylesheet link in `index.html`
- Service worker already caches `fonts.googleapis.com` / `fonts.gstatic.com` responses generically — no SW change needed
- All `font-family` declarations in `style.css` now reference variables; no raw font names remain in CSS or HTML
- Headings: h1 `letter-spacing: 0.05em`, h2 `0.03em`, h3 none (Cinzel reads well at scale without heavy tracking)
- Do NOT convert border, box-shadow, icon-size, or fixed layout pixel values to rem

---

## Elite Modifier Threat Methodology

**Date:** 2026-03-05
**Status:** Decided

### Decision
Elite modifier threat impact uses **per-act affinity dicts** (`{ 1: N, 2: N, 3: N }`) derived from the threat formula `baseThreat = (durability × offense)^0.55 + disruption`. Boss affinities remain flat numbers (each boss appears once). The prior system used flat integers scaled by `passiveScale = 1.0 + 0.25 × (act−1)`, which covered only a 1.5× range against a ~12× baseThreat gap from Act 1 to Act 3.

### Threat factor framework
Each modifier has a factor per enemy type representing the proportional baseThreat increase:
- `threatDelta[act] = round(baseThreat[act] × factor)`
- Enemy-specific adjustments for synergies (e.g. Armored + Iron Golem = 0.45 factor vs. typical 0.30) and anti-synergies (e.g. Vampiric + Vampire = 0.05 due to existing lifesteal redundancy)
- Disruption-heavy enemies (Dark Mage, Lich, Demon) use lower factors (~0.18–0.22) because disruption is additive and unaffected by HP/dice modifiers

### Files
- `js/encounters/bestiaryThreatData.js`: `eliteAffinities` per enemy — per-act dicts for regular enemies, flat for bosses
- `js/encounters/dungeonScoring.js`: `scoreFloor()` — passes `act` to `getEliteThreatForEnemy`, no `passiveScale`
- `docs/elite-modifier-threat-analysis.md`: full derivation, factor table, master affinity table

---

## ELITE_NET_ADVANTAGE — Modifier-Agnostic Design

**Date:** 2026-03-05
**Status:** Decided

### Decision
`ELITE_NET_ADVANTAGE = [15, 8, -15]` in `dungeonScoring.js` is a fixed per-act average regardless of which specific modifiers appear on a given elite. Values derived from: `eliteArtifact advantage (25) − median_elite_threat[act] × attritionFactor (0.4)`.

### Rationale
- Blueprint scoring computes the challenge rating before the player knows which modifiers will appear. A modifier-dependent value would require coupling blueprint generation to encounter selection.
- The per-modifier threat affinities capture how hard individual encounters are. `ELITE_NET_ADVANTAGE` captures the expected value of the *elite strategy* averaged over all possible modifier draws.
- Natural variation (sometimes Enraged + Berserker Orc, sometimes Brittle Goblin) is a feature, not a problem.

---

## Dual-Reward System — Affinity Scoring vs. goldMult/xpMult

**Date:** 2026-03-05
**Status:** Decided

### Decision
Two reward systems coexist without alignment. **Threat affinities** drive blueprint scoring and challenge rating. **goldMult/xpMult** on modifiers drive actual combat reward grants. They are intentionally not aligned.

### Rationale
Aligning them would require either rewriting runtime rewards to be threat-derived (breaking legible multiplier UX) or computing goldMult from affinity factors (added complexity). The systems serve different purposes: affinities are the balance truth; multipliers are the player communication layer.

---

## Combat Debuff Countdown Timing — execute() Start, Not newTurn()

**Date:** 2026-03-07
**Status:** Decided

### Decision
All player debuff countdowns (sealed slots, locked dice, dice curse, devoured dice) are decremented at the **very start of `execute()`**, before any combat processing. They were previously decremented in `newTurn()`, which ran immediately after `execute()` — meaning an effect applied with `turnsLeft: 1` was expired before the player ever saw it.

### Lifecycle (example: seal with `turnsLeft: 1`)
1. Enemy fires Void Rift during turn N's `execute()` → seal pushed with `turnsLeft: 1`
2. `newTurn()` renders: player sees sealed slot and tag showing `(1t)`
3. Player allocates dice (sealed slot is blocked) and clicks Execute
4. Turn N+1 `execute()` start: `turnsLeft` decrements 1 → 0, entry removed
5. `newTurn()` at end of turn N+1 renders: seal gone, tag gone

This gives the effect exactly one allocation phase — correct. The old code gave zero.

### What was wrong before
`newTurn()` immediately followed `execute()`. Any effect applied mid-execute with `turnsLeft: 1` was decremented to 0 and removed in the same frame, before the player could allocate. Effects with `turnsLeft: 2` became effectively 1 turn.

### Affected debuffs
- `GS.playerDebuffs.disabledSlots` (sealed slots, `turnsLeft` per entry)
- `die.locked` / `die.lockedTurns` (locked dice)
- `GS.playerDebuffs.diceCurse` / `diceCurseTurns`
- `GS.playerDebuffs.devouredDice` (`turnsLeft` per entry)

### Implementation note
A `// NOTE:` comment in `newTurn()` documents that these countdowns were intentionally moved to `execute()` start. Enemy status effects (chill, mark, weaken, stun, freeze) are on a different lifecycle and are NOT moved — they remain in `newTurn()` / specific resolve points.

---

## Casual Environment Filtering — 10% Chance, Never on Boss Floors

**Date:** 2026-03-07
**Status:** Decided

### Decision
Casual difficulty applies a flat 10% environment spawn chance on all combat floors (vs. 30–70% budget-steered on Standard/Heroic). Boss floors on Casual always have `environment = null` regardless of the random roll.

### Why boss floors are always clear on Casual
Boss fights are already the hardest floors. On Casual, environments add complexity and swing that new players aren't prepared for. Boss floors should be a clean skill test on the easiest difficulty.

### Seed stability
Environment selection still runs (consuming its RNG call) before the result is nulled. This preserves the seed's determinism — the same seed on Casual still produces the same enemies, schedules, and elite layouts as Standard/Heroic. Only the environment filtering happens after selection.

### Implementation
`selectEnvironmentSeeded()` and `selectEnvironmentForBudget()` accept a `chanceOverride` parameter. When `difficulty === 'casual'`, `generateCombatFloor()` passes `chanceOverride: 0.10`. Boss floors: selection runs with the override, then the result is set to `null`.

---

## Campaign Starting Boons — Per-Tier Run Grants

**Date:** 2026-03-07
**Status:** Decided

### Decision
Each Ancient Order grants starting items/buffs at run start based on the player's accumulated favor tier for that Order. Boons are **cumulative** — reaching Tier 2 grants both Tier 1 and Tier 2 boons. Applied in `Game.start()` via `Campaign.getApplicableStartBoons()`.

| Order | Tier 1 | Tier 2 | Tier 3 |
|-------|--------|--------|--------|
| **Warpack** | +1 d6 die | Lucky rune on strike slot | Rage Potion |
| **Gilded Hand** | +20 gold | +20 gold (total +40) | Tax Collector artifact |
| **Runeforged** | Amplifier rune on strike slot | Shield Die | Titan's Blow rune on strike slot |
| **Brood** | Poison Core rune on strike slot | Venom Flask | +3 Conduit transform buff |
| **Ironward** | +15 max HP | Healing Potion | Iron Skin Potion |

### Boon types
`die`, `utilityDie`, `rune`, `gold`, `consumable`, `artifact`, `maxHp`, `transformBuff`. Defined in `ORDER_START_BOONS` in `campaign.js`. Player-facing descriptions in `ORDER_START_BOON_DESCS` (same file).

### Rationale
Tier enhancements (passive upgrades to existing nodes) reward players who have invested in a specific Order's skill path. Starting boons reward Order favor independently of which skill nodes the player has unlocked — giving meaningful campaign progression value even on runs where the player tries a different build. They also differentiate early-run feel: Warpack starts with more dice, Gilded Hand starts richer, Ironward starts tankier, regardless of skill tree choices.

### Implementation notes
- `Campaign.getApplicableStartBoons()` returns boons where `tier > boon.tierIdx` (i.e. tier must be crossed, not just reached).
- Applied in `Game.start()` after blueprint generation and `applyTierEnhancements()`.
- Rune boons target a slot in the specified `slotZone` ('strike'/'guard'). If all slots in that zone already have a rune, the boon is silently skipped (Runeforger cap applies normally).

---

## Campaign Mode — Loop Structure and Order Favor System

**Date:** 2026-03-07
**Status:** Decided

### Decision
Campaign Mode runs 3 loops at escalating difficulty (Casual → Standard → Heroic). Death ends the campaign (permadeath). The Ancient Order system tracks favor across loops and enhances already-unlocked Skill Die nodes and artifacts — silently, at dungeon start. The system is entirely hidden during runs; the player only ever sees narrative interactions at loop end.

### Loop structure
| Loop | Difficulty | Challenge Band |
|------|-----------|---------------|
| 1 | Casual | 1–3 |
| 2 | Standard | 4–7 |
| 3 | Heroic | 8–10 |

### Favor accumulation
```
favor_earned[order] = Σ over all kills: enemy.baseThreat × Σ(node.orderFavor[order] for each unlocked node)
```
- Bosses generate more favor naturally via high baseThreat — no separate multiplier needed
- Favor uses scaled baseThreat — Casual enemies generate ~76% of Standard favor per kill
- Accumulated in `GS._loopFavor` during a run; flushed to campaign state via `Campaign.endLoop()` on boss defeat
- `GS.campaign` holds the active campaign object (null for single runs)

### Order tier thresholds
Calibrated so a focused player hits Tier 1 by Loop 1 end, Tier 2 mid-Loop 2, Tier 3 mid-Loop 3.

| Order | Tier 1 | Tier 2 | Tier 3 |
|-------|--------|--------|--------|
| Warpack | 2,200 | 7,500 | 15,000 |
| Gilded | 2,200 | 7,000 | 13,500 |
| Runeforged | 2,200 | 7,000 | 14,000 |
| Brood | 1,500 | 5,000 | 10,000 |
| Ironward | 2,200 | 7,500 | 15,000 |

Brood has lower thresholds because its nodes have a lower max favor weight (3.4 vs 5–6.9 for others) — a focused Brood player would otherwise hit tiers later than all other Orders.

### Tier node enhancements
Applied in `Campaign.applyTierEnhancements(GS)` at `Game.start()`. Only applies if the node is currently unlocked. Writes directly to `gs.passives[passiveKey]`. Fortify (Ironward Tier 1) is a special case — applies directly to `gs.maxHp` and `gs.hp`.

| Order | Tier | Node | Enhancement |
|-------|------|------|-------------|
| Warpack | 1 | Pack Tactics | +1→+2 dmg/die |
| Warpack | 2 | Volley | Threshold 4+→3+ dice |
| Warpack | 3 | Swarm Master | +2→+3 dmg/die |
| Gilded | 1 | Prospector | +4→+7 gold/combat |
| Gilded | 2 | Compound Interest | 10%→18% gold interest |
| Gilded | 3 | Golden God | dmg per 8 gold → per 6 gold |
| Runeforged | 1 | Threshold | Trigger ≥12→≥10 |
| Runeforged | 2 | Runeforger | Slot rune cap 3→4 |
| Runeforged | 3 | Amplify | Also grants Titan's Blow effect |
| Brood | 1 | Venom | +1→+2 poison/attack |
| Brood | 2 | Plague Lord | ×2→×3 poison mult |
| Brood | 3 | Gambler | Reroll dmg 2→4; also applies 1 poison |
| Ironward | 1 | Fortify | +15→+25 max HP |
| Ironward | 2 | Convalescence | 25%→35% missing HP recovery |
| Ironward | 3 | Life Weave | Healing ×2→×3 |

### Artifact enhancements
`_applyArtifactEnhancements(gs, tier)` in `campaign.js`. Writes favor-conditional flags to `gs.passives._<flag>`. Requires the artifact to be held by the player. Each Order enhances 4–9 thematically aligned artifacts. Fully enumerated in `js/campaign.js`. Examples:
- Warpack Tier 1: Echo Stone → first two dice each count twice (was just first)
- Gilded Tier 1: Tax Collector → +10 gold/combat (was +7)
- Runeforged Tier 1: Colossus Belt threshold 9→7
- Brood Tier 1: Venom Gland → poison ×3 (was ×2)
- Ironward Tier 1: Eternal Pact → survive lethal twice per run (was once)

### Cross-order synergies
Activate when **both** Orders have reached Tier ≥2. Applied in `_applySynergies(gs, tier)`. 10 pairs — all enumerated in `js/campaign.js`. Examples:
- Warpack + Ironward: Swarm Master also applies to dice in Guard zone
- Brood + Ironward: healing scales with active poison stacks on enemy
- Gilded + Runeforged: Sharpening Stone scales with gold held
- Brood + Warpack: Battle Fury stacks also apply 1 poison

### Order Interaction screen
Shown at loop end after `Campaign.endLoop()` flushes favor. If any tier threshold was newly crossed, shows one narrative text block per Order/tier. Multiple crossings shown in sequence. Atmospheric fallback text if no threshold crossed. The Order system is fully silent during the run — this screen is the only hint it exists. No numbers, bar fills, or mechanical labels are ever shown.

### Implementation notes
- `Campaign.applyTierEnhancements(GS)` and `applyStartBoons()` called in `Game.start()` after blueprint generation, only when `GS.campaign !== null`
- `GS.passives._campaignTier` set by `applyTierEnhancements` for node effect functions to read during the run
- `Campaign.endLoop(GS._loopFavor, outcome, stats)` handles favor flush, tier crossing detection, loop increment on victory, and archiving defeated campaigns
- `CampaignHistory` in `persistence.js` stores up to 50 completed campaigns; campaigns are top-level records with nested loop entries
- See `docs/campaign-mode.md` for full design spec including favor simulation tables and node affinity profiles

---

## NCE Design Intent — Flavour, Not Run-Defining

**Date:** 2026-03-07
**Status:** Decided

### Decision
NCEs (Non-Combat Encounters) are random corridor interrupts that fire between floors without advancing the floor counter. They are flavour events with minor mechanical rewards — not run-defining. Dark bargains, large trade-offs, and major player-advantage events belong in the scheduled floor event system.

### Design rules
- **Structure**: every encounter offers a safe minor reward / gamble for more / walk away. No guaranteed punishments — risk is always probabilistic.
- **Act-scaling**: `applyEncounterResult` scales positive deltaGold `[×1, ×1.5, ×2.5]` and positive deltaHP `[×1, ×1.2, ×1.5]` by act. Negative outcomes (damage, gold costs) are never scaled. XP is not scaled — the XP threshold grows proportionally so flat values stay relevant.
- **XP target**: 2–3 NCEs contributing XP over a run should add roughly one level if the player takes XP options. Base values are in the 20–30 XP range for primary XP choices.

### Why Dark Bargain was redesigned
The original Dark Bargain offered trades at the scale of half the player's gold or 25 HP — run-defining swings more appropriate for floor events. It was redesigned to small-stakes trades (−10 HP, −25g, luck gamble) while keeping the atmospheric theme. The body text was updated to acknowledge the modest scale: "The exchange is modest. The reasons remain opaque."

### Integration point
`Game.nextFloor()` is the single integration point. It calls `checkForNCE(resolvedFloorType)` before `_doAdvance()`. If an NCE fires, the floor counter does not advance until the player presses Continue. All callers (Rewards, Shop, Events) already route through `Game.nextFloor()`.

### Fire rates
| Floor type | Chance |
|---|---|
| After boss | 50% |
| After combat | 30% |
| After event | 25% |
| After shop | 10% |

### See also
`docs/nce-balance-audit.md` — full economy analysis and per-encounter change rationale.

---

## Casual Elite Constraints

**Date:** 2026-03-05
**Status:** Decided

### Decision
Casual difficulty: max 10% elite offer rate; elites have exactly 1 modifier (the visible modifier only, `hidden: null`). The player always sees the full modifier scope with no information asymmetry.

### Rationale
- Casual players should not face hidden surprises in an already optional encounter type.
- Brittle as sole modifier on Casual is player-favourable (enemy weaker + gold/XP multiplier). Acceptable because: (a) elites are rare and optional, (b) the player has complete information upfront, (c) it's a small upside in an easy mode.
- `selectEliteModifiersSeeded` always consumes the same RNG calls regardless of `singleModifier` to preserve seed stability (same seed + same difficulty = same dungeon).

---

## Artifact Removals — Hourglass and Burnproof Cloak

**Date:** 2026-03-07
**Status:** Decided

### Decision
Hourglass and Burnproof Cloak were removed from the artifact pool entirely.

### Rationale — Hourglass
A free turn before the enemy acts every combat with no downside, no cost, and no build condition. Every build benefits equally — it is a flat upgrade masquerading as a meaningful choice. It has no place in the 'interesting choices' category without a balancing constraint. Rather than rework it, the slot is better left open for a future artifact with genuine trade-offs.

### Rationale — Burnproof Cloak
Two mechanically unrelated effects (burn immunity + poison damage reduction) with no thematic bridge. The defensive coverage it provided is adequately served by other problem-solver artifacts (Soul Mirror, Iron Will).

---

## Frost Brand + Frozen Heart Merger

**Date:** 2026-03-07
**Status:** Decided

### Decision
Frozen Heart was removed as a standalone artifact. Its freeze effect was merged into Frost Brand, which now reads: "Block 8+: apply 2 chill. At 5 chill stacks: freeze the enemy (skip attack), chill resets."

### Rationale
Frost Brand and Frozen Heart had a hard dependency — neither was useful without the other, yet both occupied artifact slots. Two artifact slots for a single control effect (freeze) is poor design. Merging them preserves the full control chain while freeing a slot.

### Implementation
The freeze trigger lives in `applyStatus('chill', ...)` in `combat.js`. When `frostBrand` is held and `GS.enemyStatus.chill >= 5`, freeze fires and chill resets to 0. Campaign Ironward T1 sets `GS.passives._frostBrandThresh = 6` (block threshold to apply chill) and `GS.passives._frozenHeartTurns = 2` (freeze duration). The passive name `_frozenHeartTurns` is retained for clarity.

---

## Merchant's Crown — Gold Spent vs. Gold Held

**Date:** 2026-03-07
**Status:** Decided

### Decision
Merchant's Crown scales on cumulative gold **spent** this run (`GS.goldSpent`), not current gold held. Golden Aegis retains gold-held scaling. All intentional player gold spends route through `spendGold(amount)` in `state.js`, which decrements `GS.gold` and increments `GS.goldSpent`.

### Rationale
Both artifacts previously used identical design (hold gold → gain stat). Spending-based scaling differentiates them: Merchant's Crown rewards an active economy (buy items, use consumables, pay event costs), while Golden Aegis rewards conservation. The two now pull in opposite directions, creating tension when held together.

### Rule
Any code that deducts gold intentionally (shop, events, artifact costs, skill purchases) must use `spendGold(amount)`. Enemy steal effects and other non-player-initiated gold loss may use direct mutation.
