# Artifact Audit

Full pass across all main + 4 legendary artifacts.
Evaluated: relevance, balance, number impact, alternatives, gaps.
Last updated: 2026-03-07 (post-rework pass)

Sources: `js/constants.js` (definitions), `js/combat.js` (implementations), `js/screens.js` (onAcquire), `js/campaign.js` (_applyArtifactEnhancements)

---

## BUILD ENABLERS: WIDE

### Hydra's Crest `hydrasCrest` — +2 atk per die owned
- Counts ALL dice (guard + utility), not just strike dice. Free damage for wide builds.
- Impact: 4 dice = +8 flat; 7 dice = +14.
- Balance: strong but fair, scales naturally with Wide investment.
- Campaign Warpack T1: +3/die.
- **No issue.**

### Swarm Banner `swarmBanner` — 4+ dice in zone: x1.5 atk / x1.5 def
- Requires 4 dice per zone. Wide capstone (w_a) + root = 4 strike slots.
- Balance: well-designed zone commitment tension.
- Campaign Warpack T1: lowers threshold to 3+.
- **No issue.**

### Echo Stone `echoStone` — First allocated die per turn counts twice
- Best with Tall (doubles highest-priority placed die).
- Balance: base is fine.
- Campaign Warpack T1: extends to first TWO dice — very strong (+50-100% zone value). Warrants future review.

---

## BUILD ENABLERS: TALL

### Colossus Belt `colossussBelt` — +3 to all faces on dice with max >=9 (immediate, onAcquire)
- On a d12 [6..12]: becomes [9..15]. Stacks with Glass Cannon (+6 total to qualifying dice).
- `beltApplied` flag prevents double-dip. `_checkBelt()` handles newly acquired dice. VERIFIED working.
- Campaign Runeforged T1: adds +2 to all face values on beltApplied dice (effectively +3 -> +5 total). `beltArt.value` updated to 5 so new dice acquired later also receive the enhanced bonus.
- **No issue.**

### Precision Lens `precisionLens` — Roll twice, keep higher
- Impact: d6 avg 3.5 -> 4.47 (+28%). d12 avg 6.5 -> 8.46 (+30%).
- VERIFIED: implemented in `engine.js` around line 77. Initial audit agent missed it (searched combat.js only).
- Campaign Runeforged T1: applies to ALL dice (not just one).
- **No issue.**

### Sharpening Stone `sharpeningStone` — +50% total damage if only 1 die in strike zone
- Applied as `Math.ceil(totalAtk * 1.5)` — final multiplier after all other bonuses.
- Condition: only fires when `atkCount === 1`. Gives it a clear Tall identity — reward for committing to a single powerful die.
- Campaign Runeforged T1: +75%.
- **No issue.**

---

## BUILD ENABLERS: POISON

### Venom Gland `venomGland` — All poison doubled
- Uses `.some()` — non-stackable by design.
- Campaign Brood T1: x3.
- **No issue.**

### Festering Wound `festeringWound` — +1 dmg per enemy poison stack
- 10 stacks = +10 flat damage per turn. High ceiling with Venom Gland.
- Campaign Brood T1: +2/stack.
- **No issue.**

### Toxic Blood `toxicBlood` — When hit, apply 2 poison to enemy
- Triggers on ANY enemy attack, even fully blocked. Correct — rewards blocking.
- Moved outside the `mitigated > 0` block to ensure it fires on all hits.
- Campaign Brood T1: applies 3 poison.
- **No issue.**

---

## BUILD ENABLERS: GOLD

### Merchant's Crown `goldScaleDmg` — +1 atk per 20 gold SPENT
- Scales on `GS.goldSpent` (cumulative gold spent this run), not current gold held.
- Differentiates from Golden Aegis (which scales on held gold).
- Shown as a status tag in the combat UI and visible in the shop.
- `spendGold(amount)` helper in state.js tracks all intentional spends.
- Campaign Gilded T1: /15 gold spent.
- **No issue.**

### Golden Aegis `goldenAegis` — +1 block per 25 gold held
- Scales on current gold held. Rewards conserving gold rather than spending it.
- Now clearly differentiated from Merchant's Crown (hoard vs. spend).
- Campaign Gilded T1: /18 gold.
- **No issue.**

### Midas Die `midasDie` — Gain gold each turn equal to the current turn number
- Turn 1: +1g, turn 2: +2g, turn 3: +3g... Longer fights generate exponentially more gold.
- `GS.midasTurnCount` resets at combat start, increments each turn in `newTurn()`.
- Rewards surviving long fights; synergises with gold-scaling artifacts.
- Campaign Gilded T1: base turn value doubled (turn 1: +2g, turn 2: +4g...).
- **No issue.**

### Tax Collector `goldPerKill` — +7 gold per combat
- +7 x 11 combats = ~77 gold. Predictable, reliable.
- Campaign Gilded T1: +10/combat.
- **No issue.**

### Gilded Gauntlet `goldToDmg` — At combat start, spend all available gold in 25g chunks for 10 dmg each
- Loops: while gold >= 25, spend 25g and deal 10 damage. Drains all usable gold.
- Creates a gold hoarding strategy: stockpile before a boss, burst it down at start.
- Tension with Golden Aegis (both want you to hold gold, but Gauntlet spends it).
- Campaign Gilded T1: each chunk costs 18g instead of 25g.
- **No issue.**

---

## PROBLEM SOLVERS

### Anchored Slots `anchoredSlots` — Slots cannot be sealed
- Hard counter to Lich, Void Lord, any sealing enemy. Zero value otherwise.
- Campaign Ironward T1 adds +1 block/turn as a secondary passive.
- **No issue.**

### Soul Mirror `soulMirror` — Unblockable damage reduced by 50%
- Strong counter to Demon's Hellfire and similar.
- Campaign Ironward T1: 65% reduction.
- **No issue.**

### Iron Will `ironWill` — Dice values/faces cannot be reduced
- Blocks diceCurse, Void Aura, Entropy. Hard counter to Lich.
- Campaign Ironward T1 adds +1 HP regen/turn.
- **No issue.**

### Thorn Mail `thornMail` — When hit, reflect 15% of guard value as damage
- Scales naturally with block-focused builds (Ironward identity).
- `Math.max(1, Math.floor(totalDef * 0.15))` — always reflects at least 1.
- `GS.passives._thornMailPct` (default 0.15) allows campaign override.
- Campaign Ironward T1: 25% of guard value.
- **No issue.**

### Overflow Chalice `overflowChalice` — On kill: heal 5 HP + overkill damage
- Floor heal of 5 ensures value even against bosses where overkill is minimal.
- Overkill = damage dealt beyond enemy's remaining HP; added on top of the base 5.
- Campaign Ironward T1: floor heal raised to 10 HP.
- **No issue.**

---

## STATUS EFFECT ARTIFACTS

### Frost Brand `frostBrand` — Block 8+: apply 2 chill; at 5 chill: freeze
- Merged with former Frozen Heart artifact — one slot, full control package.
- Freeze trigger built into the `applyStatus('chill')` handler: when chill >= 5 and frostBrand is held, freeze fires and chill resets to 0.
- `GS.passives._frostBrandThresh` (default 8) controls block threshold.
- `GS.passives._frozenHeartTurns` (default 1) controls freeze duration.
- Campaign Ironward T1: `_frostBrandThresh = 6`, `_frozenHeartTurns = 2`.
- **No issue.**

### Hunter's Mark `huntersMark` — Each turn you deal damage: apply 3 mark for 1 turn (+3 dmg from all sources)
- Fires every turn `finalAtk > 0`, not just the first hit.
- Provides consistent, scaling pressure — reward for sustained offense.
- Campaign Warpack T1: 5 mark for 1 turn.
- **No issue.**

### Witch's Hex `witchsHex` — Applying poison also applies weaken (1 turn, -25% enemy dmg)
- Near-permanent weaken in a poison build.
- Campaign Brood T1: 2 turns.
- **No issue.**

### Ember Crown `emberCrown` — Deal 15+ dmg -> apply 3 burn for 3 turns
- Requires confirming burn tick value (not verified in this audit).
- If burn = 2/turn: 3 stacks x 3 turns = 18 total bonus damage.
- Campaign Brood T1: lowers threshold to 10+.
- **OPEN: burn tick value per stack per turn still unconfirmed. Verify in combat.js.**

### Thunder Strike `thunderStrike` — Deal 25%+ enemy max HP -> stun (2-turn cooldown)
- vs 60 HP enemy: need 15 dmg. vs Bone King (200 HP): need 50 dmg. Scales correctly.
- Campaign Warpack T1: cooldown 2->1 turn.
- **No issue.**

---

## INTERESTING CHOICES

### Berserker's Mask `berserkersMask` — x1.5 attack; max 1 guard die
- Forces all-in offense. Excluded from Act 1.
- **No issue.**

### Glass Cannon `glassCannon` — +3 to ALL die faces; max HP halved (immediate, onAcquire)
- d6 [1..6] -> [4..9] (avg +86%). Stacks with Colossus Belt.
- `_checkGlassCannon(die)` applies to dice acquired after the artifact — mirrors `_checkBelt` pattern. `die.glassApplied` flag prevents double-application.
- Excluded from Act 1. Campaign Runeforged T1: +4 faces.
- **No issue.**

### Parasite `parasite` — Kill enemy: +1 max HP and +2 gold immediately
- Immediate per-kill rewards — no deferred accumulation.
- 11 kills over a run = +11 max HP and +22 gold. Strong finish for high-kill builds.
- Campaign Gilded + Ironward synergy (both >= T1): `_parasiteEnh = true` → +2 max HP and +3 gold per kill.
- **No issue.**

### Blood Pact `bloodPact` — x1.3 attack; lose 3 HP at turn start
- 5-turn combat = -15 HP. Pairs well with Bloodstone. Campaign Brood T1: drain 2/turn.
- **No issue.**

### Gambler's Coin `gamblersCoin` — Combat start: +2 all dice (heads) or -1 all dice (tails), 50/50
- EV = +0.5/die/combat. Net positive long-term. Intentional variance.
- **No issue.**

### Battle Fury `battleFury` — +1 Fury/turn survived; at 3 Fury: highest strike die x2, reset
- Base threshold of 3 turns is still slow for Act 1. Many combats end in 2-3 turns.
- Campaign Warpack T1 already lowers to 2 turns.
- **OPEN: consider lowering base to 2 turns; push Campaign T1 to 1 turn.**

---

## LEGENDARY POOL

### Titan's Die `titansDie` — Permanent d12 always rolling 12
- Guaranteed +12 to any zone every turn.
- Campaign Runeforged T1: min value -> 14.
- **No issue.**

### Echo Chamber `echoChamber` — Highest strike die counts twice each turn
- Strictly better than Echo Stone (highest value vs first allocated). Correctly legendary.
- Campaign Runeforged T1: x2.5.
- **No issue.**

### Bloodstone `bloodstone` — Heal 30% of damage dealt
- 20 dmg/turn x 5 turns = +30 HP healed. Strong sustain. Synergises with Blood Pact.
- Campaign Ironward T1: 40%.
- **No issue.**

### Eternal Pact `eternalPact` — Survive lethal: revive at 25% max HP (once per run)
- `GS.passives._eternalPactRevivePct` (default 0.25) — more impactful than 1 HP revival.
- Revive HP = `Math.max(1, Math.floor(GS.maxHp * 0.25))`.
- `GS.eternalPactUsed` prevents a second activation.
- Campaign Ironward T1: revive at 50% max HP.
- **No issue.**

---

## REMOVED ARTIFACTS

| Artifact | Reason |
|----------|--------|
| Hourglass | Universally optimal — no downside, no cost, no condition. A flat upgrade for every build with no meaningful choice. Removed from pool. |
| Burnproof Cloak | Two disconnected effects (fire immunity + poison reduction) with no thematic coherence. Removed from pool. |
| Frozen Heart | Merged into Frost Brand. Standalone artifact was unusable without Frost Brand; two artifact slots for one control effect is bad design. |

---

## OPEN ISSUES

| # | Artifact | Issue |
|---|----------|-------|
| 1 | Ember Crown | Burn tick value per stack per turn not confirmed. Verify in combat.js status effect handler. |
| 2 | Battle Fury | Base 3-turn threshold too slow for Act 1. Consider lowering base to 2 turns, pushing Campaign T1 to 1 turn. |
| 3 | Echo Stone (Campaign T1) | Extending to first TWO dice is very powerful (+50-100% total zone value). Monitor for balance issues. |

---

## DESIGN GAPS (Still Open)

| # | Gap |
|---|-----|
| 1 | No artifact that rewards NOT taking damage / clean play. |
| 2 | No artifact that directly interacts with rerolls (a passive exists, but no artifact). |
| 3 | No artifact that chains overkill damage to the next enemy (Overflow Chalice only heals). |
| 4 | Act 1 pool excludes only a small set of artifacts. Several are weak in Act 1 context (gold scalers, Gilded Gauntlet) — consider more granular act targeting. |
