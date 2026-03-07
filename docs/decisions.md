# Design Decisions

A record of intentional design choices made during development, including the reasoning behind them. Reference this before changing related systems.

---

## Order Favor — Auto-Granted Nodes Do Not Accumulate Favor

**Date:** 2026-03-07
**Status:** Decided

### Decision
The `root` node (and any future auto-granted nodes) must have `orderFavor: {}`. Only nodes the player explicitly unlocks by spending a skill point should accumulate Order favor.

### Rationale
`root` is granted automatically when the skill die is first revealed — it is not a player choice. Giving it non-zero `orderFavor` caused Order favor to start accumulating after the very first combat, before the player had spent any skill points. This was confusing and meaningless as a signal — Order favor is supposed to reflect deliberate build choices.

### Rule
- `root` node: `orderFavor: {}` — no favor contribution
- Any future auto-granted node (e.g. campaign boons that unlock a node directly): set `orderFavor: {}` or omit the field
- Only explicitly player-chosen nodes (skill point spends) should carry non-zero `orderFavor`

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

The Elite card HP display should either be omitted or shown as the **base HP** (before any modifiers) with a `+ ???` note.

---

## Combat Zone Naming — Strike / Guard

**Date:** 2026-03-02
**Status:** Decided

### Decision
The two combat zones are named **Strike** (formerly "Attack") and **Guard** (formerly "Defend"). Individual die positions within each zone are still called "slots." The old terms "attack area / attack slot" and "defend area / defend slot" are retired.

### Rationale
"Slot" was overloaded — it referred both to individual die positions and to the whole zone. The ambiguity made design and code harder to reason about. Strike/Guard are unambiguous zone labels. "Slot" is reserved for individual die positions only (e.g. "strike slot 0", "guard slot 2").

---

## Dice Modifier System — Runes (Slots) + Face Mods (Single Face)

**Date:** 2026-03-02
**Status:** Decided

### Decision
Each die has exactly two modifier layers:

1. **Rune** — attaches to a slot, always active, applies to every die placed in that slot. Moderate, reliable power.
2. **Face mod** — one per die, placed on a single face index. Only triggers when that face is rolled. High power, unreliable (triggers ~1/N times).

### Rationale
The previous system allowed many face mods per die, matched by face value. This caused upgrade collision bugs (two adjacent face mods could collide after an upgrade remapped values) and made power budgeting unclear. One face mod per die at spike power level creates a clean contrast: Wide builds scale reliably through runes spread across many dice; Tall builds invest rerolls chasing a single high-power face.

---

## Tall Capstone — Runeforger (replaces Titan's Wrath)

**Date:** 2026-03-02
**Status:** Decided

### Decision
The Tall skill tree capstone (`t_n`) changes from `Titan's Wrath — Single-die slots deal ×3` to `Runeforger — Your slots can hold up to 3 runes each`.

### Rationale
Titan's Wrath as a passive overlapped directly with the Titan's Blow rune (same ×3 effect, same condition). Having both created redundancy. Runeforger is a more interesting capstone: it enables the Tall power fantasy of stacking Amplifier + Titan's Blow + Siphon on one slot for ×6 damage with full lifesteal — unambiguously a Tall-only strategy that Wide cannot exploit.

---

## Dungeon Path Screen — Strategic Preview Before Descent

**Date:** 2026-03-02
**Status:** Decided

### Decision
A dedicated `#screen-dungeon-path` screen is shown after `Game.start()` generates the blueprint and before `Game.enterFloor()` begins the run. It displays the full seeded dungeon map, a seed display with copy button, and a collapsible Run Settings panel. The player explicitly clicks "Descend into the Dungeon" to begin.

### Rationale
The dungeon map has enough information density (per-floor threat breakdowns, anomalies, environments, elite badges, act subtotals, scoring) that dumping the player directly into floor 1 without a preview is a missed opportunity. The path screen gives players time to internalize the layout before committing. It also naturally hosts run customization controls — changes live-regenerate the map using the same seed with updated options, giving immediate visual feedback.

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
Baking difficulty into blueprint generation would mean the same seed produces different enemies, environments, and schedules depending on the chosen difficulty — breaking the expectation that a seed is a reproducible run layout. Keeping difficulty as a run-level flag means same seed + same settings → identical dungeon. Heroic removes the Standard option from EncounterChoice entirely (not just pre-selects Elite) to make it a genuine constraint. Casual hides the Elite tab so players don't feel pressured into risky fights they opted out of.

---

## Player Advantage Values — Threat-Equivalent Scale

**Date:** 2026-03-05
**Status:** Decided

### Decision
All player advantage values (rests, shops, events, artifacts, elite rewards) are expressed in **threat-equivalent units** — the same scale as enemy `baseThreat`. Net challenge = totalCombatThreat − totalPlayerAdvantage is meaningful because both sides use the same unit.

### Anchor: die upgrade (+1/+1)
The die upgrade is the anchor: +1 avg damage/turn ≈ 5% DPS boost (player pool ~20 avg DPS). Value = boost fraction × remaining combat threat. Post-Act 1: ~36, Post-Act 2: ~48.

### Key values
- **Heal (30% HP)**: same face value as die upgrade — equivalent maintenance choices
- **Rest total**: transformation (2.5×) + maintenance (1×) + consumable (0.25×) ≈ 3.75× upgrade. `REST_ADVANTAGES = [135, 180]`
- **Gold**: `GOLD_ADVANTAGE_RATE = [0.25, 0.20, 0.10]` (Act 1/2/3) — discounted for shop access constraints
- **XP**: `XP_ADVANTAGE_RATE = 0.15` — level-up ≈ 80 threat-equiv, discounted for diminishing returns
- **Elite**: `ELITE_NET_ADVANTAGE = [15, 8, -15]` (rewards dominate early, attrition dominates late)

### Rationale
Previous advantage values were not on the same scale as threat, making the net challenge metric meaningless. Using the die upgrade as an anchor and deriving all other values relative to it ensures balanced scoring. Gold and XP are scored per combat rather than as flat shop values because they scale with combat threat — harder fights give more gold and XP.

---

## Challenge Rating Bands — Strict Non-Overlapping Per Difficulty

**Date:** 2026-03-05
**Status:** Decided

### Decision
Each difficulty enforces a strict challenge rating band via rejection + reseed:
- **Casual:** 1–3
- **Standard:** 4–7
- **Heroic:** 8–10

Certain schedules are excluded per difficulty: Casual excludes gauntlet (too many combats, too little advantage); Heroic excludes event-heavy (too much advantage). Implemented via `DIFFICULTY_SCHEDULES` in `dungeonBlueprint.js`.

### Rationale
Without band enforcement, seed RNG could produce wildly inappropriate ratings. Non-overlapping bands ensure each difficulty feels distinct. Schedule filtering addresses the root cause (the schedule determines combat vs. non-combat floor counts) rather than compensating after the fact.

---

## Utility Dice — Purchasable Die Types with Special Effects

**Date:** 2026-03-02
**Status:** Decided

### Decision
Utility dice trade normal damage/block output for a distinct effect. They occupy a slot position and interact with runes, upgrades, trim, and fracture like any other die.

Catalog: Gold Die, Poison Die, Chill Die, Burn Die, Shield Die, Mark Die, Amplifier Die, Drain Die, Weaken Die, Mimic Die.

**Gold Die:** Faces show % multiplier values (5%–25%). Generates gold = slot's other dice total × rolled multiplier. Contributes 0 to damage/block.

**Mimic Die:** Copies the current rolled value of a random die from the player's entire dice pool (allocated or not). High variance.

### Rationale
Several retired face mods (×2 Strike, Shield, Poison, Gold Rush) represented interesting effects that deserved a home. Making them utility dice lets Wide builds use them as dedicated "engine dice" for consistent-trigger output, while Tall builds still prefer face mods (high-spike, reroll-chaseable). It creates a meaningful shop decision: spend gold on more dice vs. better dice.

### Acquisition
Shop purchase primarily. Price range 60–100g depending on power level.

---

## Elite Modifier Threat Methodology

**Date:** 2026-03-05
**Status:** Decided

### Decision
Elite modifier threat impact uses **per-act affinity dicts** (`{ 1: N, 2: N, 3: N }`) derived from the threat formula `baseThreat = (durability × offense)^0.55 + disruption`. Boss affinities remain flat numbers. The prior system used flat integers scaled by `passiveScale = 1.0 + 0.25 × (act−1)`, which covered only a 1.5× range against a ~12× baseThreat gap from Act 1 to Act 3.

### Threat factor framework
Each modifier has a factor per enemy type representing the proportional baseThreat increase: `threatDelta[act] = round(baseThreat[act] × factor)`. Enemy-specific adjustments for synergies (e.g. Armored + Iron Golem = 0.45 vs. typical 0.30) and anti-synergies (e.g. Vampiric + Vampire = 0.05). Disruption-heavy enemies use lower factors (~0.18–0.22) because disruption is additive and unaffected by HP/dice modifiers.

See `docs/design/threat-calculations.md` for full derivation, factor table, and master affinity table.

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
All player debuff countdowns (sealed slots, locked dice, dice curse, devoured dice) are decremented at the **very start of `execute()`**, before any combat processing.

### Lifecycle (example: seal with `turnsLeft: 1`)
1. Enemy fires Void Rift during turn N's `execute()` → seal pushed with `turnsLeft: 1`
2. `newTurn()` renders: player sees sealed slot and tag showing `(1t)`
3. Player allocates dice (sealed slot is blocked) and clicks Execute
4. Turn N+1 `execute()` start: `turnsLeft` decrements 1 → 0, entry removed
5. `newTurn()` at end of turn N+1 renders: seal gone, tag gone

### Rationale
Previously decremented in `newTurn()` which ran immediately after `execute()`. Any effect applied mid-execute with `turnsLeft: 1` was decremented to 0 and removed in the same frame, before the player could allocate. This gave one-turn effects zero turns of effect. Enemy status effects (chill, mark, weaken, stun, freeze) are on a different lifecycle and remain in `newTurn()`.

---

## Casual Environment Filtering — 10% Chance, Never on Boss Floors

**Date:** 2026-03-07
**Status:** Decided

### Decision
Casual difficulty applies a flat 10% environment spawn chance (vs. 30–70% budget-steered on Standard/Heroic). Boss floors on Casual always have `environment = null`.

### Rationale
Boss fights are already the hardest floors — environments add complexity and swing that new players aren't prepared for. Seed stability is preserved by running the RNG call before nulling the result, so the same seed on Casual produces the same enemy/schedule/elite layout as Standard/Heroic.

---

## Campaign Starting Boons — Per-Tier Run Grants

**Date:** 2026-03-07
**Status:** Decided

### Decision
Each Ancient Order grants starting items/buffs at run start based on accumulated favor tier. Boons are **cumulative** — reaching Tier 2 grants both Tier 1 and Tier 2 boons.

| Order | Tier 1 | Tier 2 | Tier 3 |
|-------|--------|--------|--------|
| **Warpack** | +1 d6 die | Lucky rune on strike slot | Rage Potion |
| **Gilded Hand** | +20 gold | +20 gold (total +40) | Tax Collector artifact |
| **Runeforged** | Amplifier rune on strike slot | Shield Die | Titan's Blow rune on strike slot |
| **Brood** | Poison Core rune on strike slot | Venom Flask | +3 Conduit transform buff |
| **Ironward** | +15 max HP | Healing Potion | Iron Skin Potion |

### Rationale
Tier enhancements (passive upgrades to existing nodes) reward players who invested in a specific Order's skill path. Starting boons reward Order favor independently of skill nodes — giving meaningful campaign progression even when trying a different build. They also differentiate early-run feel: Warpack starts with more dice, Gilded Hand starts richer, Ironward starts tankier.

---

## Order Face Tier Bonuses — Skill Die Face Leveling

**Date:** 2026-03-07
**Status:** Decided

### Decision
Each skill die face corresponds to one Order (Wide→Warpack, Gold→Gilded, Tall→Runeforged, Venom→Brood, Heart→Ironward). Reaching a campaign tier grants a passive bonus on that face **regardless of which skill die nodes have been unlocked**. These are separate from `TIER_NODE_ENHANCEMENTS`, which only enhance nodes the player has already unlocked.

| Face / Order | Tier 1 | Tier 2 | Tier 3 |
|---|---|---|---|
| **Wide / Warpack** | +2 flat Strike dmg | +2 flat Strike dmg (total +4) | +1 Strike slot |
| **Gold / Gilded** | +5 gold per combat | +5 gold per combat (total +10) | Free shop refresh |
| **Tall / Runeforged** | +1 reroll per combat | +1 reroll per combat (total +2) | +1 reroll per combat (total +3) |
| **Venom / Brood** | +1 poison per attack | +1 poison per attack (total +2) | Poison ticks deal +1 dmg |
| **Heart / Ironward** | +8 max HP | +8 max HP (total +16) | +1 HP regen per turn |

The skill die UI shows 3 pips at the bottom of each face (filled = tier earned). Tapping the pips opens a tier detail tooltip in the detail bar.

### Rationale
`TIER_NODE_ENHANCEMENTS` require node investment in a specific face — if the player built a Wide+Venom hybrid, they get no benefit from Ironward tiers. Face bonuses give every player some return on Order favor regardless of build, and make tier crossings feel meaningful on the die itself. The pip UI also surfaces the otherwise-invisible tier state directly on the game's central object.

---

## Campaign Mode — Loop Structure and Order Favor System

**Date:** 2026-03-07
**Status:** Decided

### Decision
Campaign Mode runs 3 loops at escalating difficulty (Casual → Standard → Heroic). Death ends the campaign (permadeath). The Ancient Order system tracks favor across loops and enhances already-unlocked Skill Die nodes and artifacts — silently, at dungeon start. The system is entirely hidden during runs; the player sees only narrative interactions at loop end.

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
Bosses generate more favor naturally via high baseThreat. Accumulated in `GS._loopFavor` during a run; flushed via `Campaign.endLoop()` on victory. Brood has lower tier thresholds because its nodes have a lower max favor weight (3.4 vs 5–6.9 for others).

### Order Interaction screen
Shown at loop end after favor flush. If any tier threshold was newly crossed, shows one narrative text block per Order/tier. Atmospheric fallback text if no threshold crossed. No numbers, bar fills, or mechanical labels are ever shown.

### Rationale
The three-loop structure creates a natural campaign arc: learn on Casual, apply on Standard, prove on Heroic. Hidden accumulation avoids mid-run number-chasing — the player builds a run-appropriate strategy, and the Order rewards emerge as narrative at loop end, reinforcing playstyle identity without interrupting focus.

See `docs/design/campaign-mode.md` for full spec including tier thresholds, node enhancements, artifact enhancements, and synergy table.

---

## NCE Design Intent — Flavour, Not Run-Defining

**Date:** 2026-03-07
**Status:** Decided

### Decision
NCEs (Non-Combat Encounters) are random corridor interrupts that fire between floors without advancing the floor counter. They are flavour events with minor mechanical rewards — not run-defining. Dark bargains, large trade-offs, and major player-advantage events belong in the scheduled floor event system.

### Design rules
- **Structure**: every encounter offers a safe minor reward / gamble for more / walk away. No guaranteed punishments — risk is always probabilistic.
- **Act-scaling**: positive deltaGold `[×1, ×1.5, ×2.5]` and positive deltaHP `[×1, ×1.2, ×1.5]` by act. Negative outcomes never scale. XP is flat.
- **XP target**: 2–3 NCEs contributing XP over a run should add roughly one level. Base values 20–30 XP for primary XP choices.

### Why Dark Bargain was redesigned
The original offered trades at the scale of half the player's gold or 25 HP — run-defining swings more appropriate for floor events. Redesigned to small-stakes trades (−10 HP, −25g) while keeping the atmospheric theme.

### Fire rates
| Floor type | Chance |
|---|---|
| After boss | 50% |
| After combat | 30% |
| After event | 25% |
| After shop | 10% |

See `docs/audits/nce-balance-audit.md` for full economy analysis and per-encounter rationale.

---

## Casual Elite Constraints

**Date:** 2026-03-05
**Status:** Decided

### Decision
Casual difficulty: max 10% elite offer rate; elites have exactly 1 modifier (the visible modifier only, `hidden: null`). The player always sees the full modifier scope with no information asymmetry.

### Rationale
- Casual players should not face hidden surprises in an already optional encounter type.
- Brittle as sole modifier on Casual is player-favourable (enemy weaker + gold/XP multiplier). Acceptable because elites are rare and optional, and the player has complete information upfront.
- `selectEliteModifiersSeeded` always consumes the same RNG calls regardless of `singleModifier` to preserve seed stability.

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

---

## Merchant's Crown — Gold Spent vs. Gold Held

**Date:** 2026-03-07
**Status:** Decided

### Decision
Merchant's Crown scales on cumulative gold **spent** this run (`GS.goldSpent`), not current gold held. Golden Aegis retains gold-held scaling. All intentional player gold spends route through `spendGold(amount)` in `state.js`.

### Rationale
Both artifacts previously used identical design (hold gold → gain stat). Spending-based scaling differentiates them: Merchant's Crown rewards an active economy (buy items, use consumables, pay event costs), while Golden Aegis rewards conservation. The two now pull in opposite directions, creating tension when held together.

### Rule
Any code that deducts gold intentionally (shop, events, artifact costs, skill purchases) must use `spendGold(amount)`. Enemy steal effects and other non-player-initiated gold loss may use direct mutation.
