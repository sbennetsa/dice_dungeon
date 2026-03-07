# Campaign Mode — Design Specification

---

## Overview

Campaign Mode extends Dice Dungeon from single-run play into a series of escalating dungeon loops. The player's character identity emerges organically through which Skill Die nodes they unlock — and is reflected by growing allegiance to one or more **Ancient Orders**. Orders reward long-term playstyle commitment by enhancing nodes and artifacts the player is already using, growing more powerful the deeper into a campaign they go.

The Order system is **entirely hidden**. No numbers, bars, or labels are ever displayed. Experienced players discover it through narrative signals at loop end and by observing how their character's power changes between runs. The world reacts to how the player fights — the player's job is to notice.

**Campaign Mode is accessed from the existing Ancient Order screen** (`CampaignScreen` in `js/screens.js` / `campaign.js`). The current rank/achievement tracking is reworked into the campaign launch flow.

---

## Loop Structure

Campaign currently caps at **3 loops** while favor generation rates are assessed. Architecture must support extension to more loops without rework.

| Loop | Difficulty Band | Challenge Rating |
|------|----------------|-----------------|
| 1 | Casual | 1–3 |
| 2 | Standard | 4–7 |
| 3 | Heroic | 8–10 |

Each loop is a full 15-floor run using the existing dungeon blueprint system. The loop counter drives the difficulty band passed to `generateDungeonBlueprint()`.

---

## Death

Campaign is lost on any death. **Permadeath only.** Campaign record is saved to history with loop and floor reached. Revisit if high-level dungeons feel unfair — a favor-penalty variant (campaign continues but lose a % of accumulated favor) is the most natural fallback.

---

## The Ancient Orders

Five Orders exist in the world. No Order is chosen — allegiance emerges from which Skill Die nodes the player unlocks.

| Key | Name | Thematic Identity |
|-----|------|-------------------|
| `warpack` | The Warpack | Aggression, numbers, swarm tactics |
| `gilded` | The Gilded Hand | Wealth, economy, leverage |
| `runeforged` | The Runeforged | Craftsmanship, runes, die mastery |
| `brood` | The Brood | Poison, decay, degen play |
| `ironward` | The Ironward | Sustain, endurance, HP investment |

---

## Favor System

### Accumulation

Favor is calculated **at end of each loop** (on boss defeat), not during it. Mid-run behavior never changes based on favor. All threshold crossings are resolved at dungeon end and applied before the next loop begins.

```
favor_earned[order] = Σ over all kills: enemy.baseThreat × Σ(node.orderFavor[order] for each node in GS.unlockedNodes at time of kill)
```

- Bosses naturally generate more favor due to high `baseThreat` (Bone King 59, Crimson Wyrm 183, Void Lord 420 — no separate multiplier needed)
- More unlocked nodes = more favor per kill
- Each Order receives only the weight contributed by its aligned nodes
- Favor accumulates across loops and is persisted in campaign state — no cap

### Node Affinity Profiles

Each node in `SKILL_TREE` carries an `orderFavor` property. Weights sum to 1.0 per node.

```javascript
// Full affinity table — all 26 nodes
{ id: 'root', orderFavor: { warpack: 0.5, ironward: 0.3, runeforged: 0.2 } }

// Wide face — The Warpack
{ id: 'w_a', orderFavor: { warpack: 1.0 } }                              // Extra Arms
{ id: 'w_b', orderFavor: { warpack: 1.0 } }                              // Pack Tactics
{ id: 'w_c', orderFavor: { warpack: 0.5, ironward: 0.5 } }               // Shield Wall (guard slot benefits both)
{ id: 'w_d', orderFavor: { warpack: 1.0 } }                              // Volley
{ id: 'w_n', orderFavor: { warpack: 1.0 } }                              // Swarm Master (capstone)

// Gold face — The Gilded Hand
{ id: 'g_a', orderFavor: { gilded: 1.0 } }                               // Prospector
{ id: 'g_b', orderFavor: { gilded: 1.0 } }                               // Appraisal
{ id: 'g_c', orderFavor: { gilded: 0.7, warpack: 0.3 } }                 // Investment (gold→dmg serves both)
{ id: 'g_d', orderFavor: { gilded: 1.0 } }                               // Compound Interest
{ id: 'g_n', orderFavor: { gilded: 1.0 } }                               // Golden God (capstone)

// Tall face — The Runeforged
{ id: 't_a', orderFavor: { runeforged: 0.7, warpack: 0.2, brood: 0.1 } } // Precision (rerolls serve aggression + chaos)
{ id: 't_b', orderFavor: { runeforged: 1.0 } }                           // Forge
{ id: 't_c', orderFavor: { runeforged: 1.0 } }                           // Threshold
{ id: 't_d', orderFavor: { runeforged: 1.0 } }                           // Amplify
{ id: 't_n', orderFavor: { runeforged: 1.0 } }                           // Runeforger (capstone)

// Venom face — The Brood
{ id: 'v_a', orderFavor: { ironward: 0.6, brood: 0.4 } }                 // Vitality (HP investment: Ironward protects it, Brood spends it)
{ id: 'v_b', orderFavor: { brood: 1.0 } }                                // Venom
{ id: 'v_c', orderFavor: { brood: 0.5, warpack: 0.3, runeforged: 0.2 } } // Gambler (risk/chaos across 3 orders)
{ id: 'v_d', orderFavor: { ironward: 0.7, brood: 0.3 } }                 // Regeneration (sustain + degen enablement)
{ id: 'v_n', orderFavor: { brood: 1.0 } }                                // Plague Lord (capstone)

// Heart face — The Ironward
{ id: 'h_a', orderFavor: { ironward: 1.0 } }                             // Fortify
{ id: 'h_b', orderFavor: { ironward: 1.0 } }                             // Convalescence
{ id: 'h_c', orderFavor: { ironward: 0.8, brood: 0.2 } }                 // Iron Vitality (HP scaling; slight Brood for HP-as-resource)
{ id: 'h_d', orderFavor: { ironward: 1.0 } }                             // Bulwark
{ id: 'h_n', orderFavor: { ironward: 1.0 } }                             // Life Weave (capstone)
```

**Maximum possible favor weight per Order** (if all relevant nodes unlocked):
- The Warpack: 5.8 (wide face + cross-contributions from g_c, t_a, v_c)
- The Gilded Hand: 4.7 (gold face only)
- The Runeforged: 5.1 (tall face + root + v_c cross)
- The Ironward: 6.9 (heart + venom cross + root + w_c cross — most distributed Order)
- The Brood: 3.4 (venom face mainly — most specialized Order)

---

## Favor Simulation & Tier Thresholds

### Difficulty Scaling Impact on Favor

Favor uses **scaled baseThreat** — the same difficulty multipliers that make Casual enemies easier also reduce the favor earned per kill. The sublinear threat formula (`P=0.55`) compresses the effect: Act 1 ≈ 0.92×, Act 2 ≈ 0.81×, Act 3 ≈ 0.73× threat vs Standard.

| Loop | Difficulty | Threat/Loop | vs Standard |
|------|-----------|-------------|-------------|
| 1 | Casual | ~895 | 76% |
| 2 | Standard | ~1,177 | 100% |
| 3 | Heroic | ~1,428 | 121% |

Tier thresholds are calibrated to these scaled totals so campaign pacing is preserved.

### Simulation Methodology

Using the standard floor layout (8 kills per loop) with **difficulty-scaled** threat values:
- **Loop 1 (Casual):** floors 1, 3 regular (Act 1, ~15.2 each); floor 5 Bone King (~54); floor 8 regular (Act 2, ~50); floor 10 Crimson Wyrm (~148); floors 12, 13 regular (Act 3, ~153 each); floor 15 Void Lord (~307). **Total: ~895.**
- **Loop 2 (Standard):** unscaled threat. Total: ~1,177.
- **Loop 3 (Heroic):** threat scaled up. Total: ~1,428.

Nodes are assumed to unlock progressively across 6 levels evenly spaced through the 15 floors. Loop 2 and 3 start with all prior-loop nodes already active.

### Warpack Example (most illustrative — focused player)

**Loop 1 (Casual, scaled threat):**

| Kill | Floor | Threat | Weight | Warpack Favor | Cumulative |
|------|-------|--------|--------|---------------|------------|
| 1 | 1 | 15.2 | 0.5 | 8 | 8 |
| 2 | 3 | 15.2 | 1.5 | 23 | 31 |
| 3 | 5 Bone King | 54 | 2.5 | 135 | 166 |
| 4 | 8 | 50 | 3.1 | 155 | 321 |
| 5 | 10 Crimson Wyrm | 148 | 4.1 | 607 | 928 |
| 6 | 12 | 153 | 5.1 | 780 | 1,708 |
| 7 | 13 | 153 | 5.1 | 780 | 2,488 ← Tier 1 crossed |
| 8 | 15 Void Lord | 307 | 5.1 | 1,566 | 4,054 |

Loop 2 (Standard, weight ~5.5 throughout): **+6,500** → cumulative ~10,554. Tier 2 crossed mid-loop 2.
Loop 3 (Heroic, weight ~5.8): **+8,300** → cumulative ~18,854. Tier 3 crossed mid-loop 3.

### Tier Thresholds (per Order)

Derived from expected favor accumulation with difficulty-scaled threat. Tier 1 reduced ~27% vs pre-scaling values (matching Casual threat reduction). Tier 2/3 reduced less (~15-17%) — Loops 2-3 use Standard/Heroic scaling which partially compensates.

| Order | Max Weight | Loop 1 Total | Loop 2 Cumul. | Loop 3 Cumul. | **Tier 1** | **Tier 2** | **Tier 3** |
|-------|-----------|-------------|--------------|--------------|-----------|-----------|-----------|
| The Warpack | 5.1 | 4,054 | 10,554 | 18,854 | **2,200** | **7,500** | **15,000** |
| The Gilded Hand | 4.7 | 3,675 | 9,575 | 17,075 | **2,200** | **7,000** | **13,500** |
| The Runeforged | 5.1 | 3,750 | 9,850 | 17,550 | **2,200** | **7,000** | **14,000** |
| The Ironward | 5.1 | 4,054 | 10,454 | 18,554 | **2,200** | **7,500** | **15,000** |
| The Brood | 3.4 | 2,475 | 6,975 | 13,475 | **1,500** | **5,000** | **10,000** |

*Brood has lower thresholds to compensate for its specialized (lower max weight) node profile, so Brood players hit tiers at similar campaign milestones to other Orders.*

**Cross-order synergy** activates when **both Orders have reached Tier 2** simultaneously. A mixed player accumulates ~65% of a focused player's rate per Order — cross-order synergy is achievable in a 3-loop campaign but requires intentional node investment across two faces.

These values are starting estimates — calibrate against playtesting data.

---

## Tier Rewards: Node Enhancements

Reaching a tier enhances existing unlocked nodes. Enhancements apply at dungeon start based on campaign state. A node that hasn't been unlocked yet receives its enhancement when eventually unlocked.

### The Warpack

| Tier | Threshold | Node Enhanced | Enhancement |
|------|-----------|--------------|-------------|
| 1 | 3,000 | Pack Tactics | +1 dmg/die → +2 dmg/die |
| 2 | 9,000 | Volley | Threshold: 4+ dice → 3+ dice |
| 3 | 16,000 | Swarm Master | +2/die → +3/die in any zone |

### The Gilded Hand

| Tier | Threshold | Node Enhanced | Enhancement |
|------|-----------|--------------|-------------|
| 1 | 3,000 | Prospector | +4 gold/combat → +7 gold/combat |
| 2 | 8,500 | Compound Interest | 10% gold → 18% gold |
| 3 | 14,500 | Golden God | Dmg per 8 gold → per 6 gold |

### The Runeforged

| Tier | Threshold | Node Enhanced | Enhancement |
|------|-----------|--------------|-------------|
| 1 | 3,000 | Threshold | Trigger ≥12 → ≥10 |
| 2 | 8,500 | Runeforger | Slot rune cap 3 → 4 |
| 3 | 15,000 | Amplify | Grants Titan's Blow instead of Amplifier rune |

### The Brood

| Tier | Threshold | Node Enhanced | Enhancement |
|------|-----------|--------------|-------------|
| 1 | 2,000 | Venom | Apply 1 poison/attack → 2 |
| 2 | 6,000 | Plague Lord | Poison ×2 → ×3 |
| 3 | 10,500 | Gambler | Reroll damage 2 → 4; also applies 1 poison |

### The Ironward

| Tier | Threshold | Node Enhanced | Enhancement |
|------|-----------|--------------|-------------|
| 1 | 3,000 | Fortify | +15 Max HP at unlock → +25 Max HP |
| 2 | 9,000 | Convalescence | Heal 25% missing → 35% |
| 3 | 16,000 | Life Weave | Healing doubled → tripled |

---

## Tier Rewards: Artifact Enhancements

At high favor, specific artifacts behave differently. Enhancements applied dynamically at dungeon start based on campaign favor state — favor-conditional branches in existing effect handlers, no structural artifact changes.

### The Warpack
| Artifact | Enhancement |
|----------|------------|
| **Hydra's Crest** (+2 dmg/die) | +3 dmg/die |
| **Swarm Banner** (4+ dice ×1.5) | Breakpoint: 3+ dice |
| **Echo Stone** (first die counts twice) | First two dice each count twice |
| **Battle Fury** (3 Fury → ×2) | Fury threshold: 2 |

### The Gilded Hand
| Artifact | Enhancement |
|----------|------------|
| **Merchant's Crown** (dmg/20 gold) | dmg/15 gold |
| **Golden Aegis** (block/25 gold) | block/18 gold |
| **Midas Die** (d6 gold on combat start) | Roll d8 |
| **Tax Collector** (+7 gold/combat) | +10 gold/combat |
| **Gilded Gauntlet** (spend 50 → 15 dmg) | Cost 35; damage 20 |

### The Runeforged
| Artifact | Enhancement |
|----------|------------|
| **Sharpening Stone** (dice +50% after runes) | +75% |
| **Precision Lens** (roll twice, keep higher) | Roll three, keep highest |
| **Colossus Belt** (dice ≥9 get +3 faces) | Threshold ≥7 |
| **Glass Cannon** (+3 faces, HP halved) | +4 faces |
| **Titan's Die** [Legendary] (always-12 die) | Minimum roll 14 |

### The Brood
| Artifact | Enhancement |
|----------|------------|
| **Venom Gland** (poison doubled) | Tripled |
| **Festering Wound** (+1 dmg/stack) | +2 dmg/stack |
| **Toxic Blood** (take dmg → 2 poison) | Apply 3 poison |
| **Witch's Hex** (poison → weaken 1 turn) | Weaken: 2 turns |
| **Blood Pact** (−3 HP/turn, +30% dmg) | −2 HP/turn |

### The Ironward
| Artifact | Enhancement |
|----------|------------|
| **Overflow Chalice** (overkill → healing) | Also heals 15% of damage blocked per turn |
| **Bloodstone** [Legendary] (30% dmg → healing) | 40% |
| **Thorn Mail** (take dmg → deal 3 back) | Deal 5 back |
| **Frost Brand** (block 10+ → 3 chill) | Block threshold: 7 |
| **Soul Mirror** (unblockable −50%) | −65% |
| **Eternal Pact** [Legendary] (survive lethal once) | Survive lethal twice per run |

### Partially-Mapped Artifacts
| Artifact | Order | Notes |
|----------|-------|-------|
| **Berserker's Mask** | Warpack | Enhancement: at Tier 3, max-guard-die constraint lifted |
| **Hourglass** | Warpack | First-turn advantage suits aggression; enhancement: TBD |
| **Hunter's Mark** | Warpack | Enhancement: Mark extends to 3 turns |
| **Ember Crown** | Brood | Enhancement: trigger threshold 15 → 10 dmg |
| **Thunder Strike** | Warpack | Enhancement: stun cooldown 2 → 1 turn |
| **Parasite** | Gilded + Ironward | Favor weight 0.5 Gilded / 0.5 Ironward; enhancement: gold and HP gains each +50% |
| **Gambler's Coin** | Brood | Enhancement: heads +3 instead of +2 |
| **Anchored Slots** | Ironward | Enhancement: +1 block per combat turn while active |
| **Iron Will** | Ironward | Enhancement: also grants +1 regen/turn |
| **Burnproof Cloak** | Ironward | Enhancement: poison damage reduction 50% → 75% |
| **Frozen Heart** | Ironward | Enhancement: freeze lasts 2 turns |
| **Echo Chamber** [Legendary] | Runeforged | Enhancement: highest die counts ×2.5 |
| **Bloodstone** [Legendary] | Ironward | Listed above |

---

## Cross-Order Synergies

Activates when **both Orders have reached Tier 2** (mid-tier in each). Rewards players who diversify playstyle and invest in two Order paths simultaneously.

| Orders | Synergy |
|--------|---------|
| **Warpack + Ironward** | Swarm Master gains a guard-zone clause: 4+ dice in the Guard zone also grant the +per-die bonus. |
| **Brood + Ironward** | Healing received scales with active poison stacks on the enemy — the more it rots, the more you recover. |
| **Gilded Hand + Warpack** | Each die fielded beyond the starting slot count generates +1 gold at combat end. |
| **Brood + Runeforged** | PoisonCore rune applies additional stacks proportional to the die's face value. |
| **Gilded Hand + Ironward** | Overflow Chalice healing also generates 0.5 gold per HP healed (rounded up). |
| **Warpack + Runeforged** | Echo Stone's "first die counts twice" also applies to the highest-value rune-enhanced die. |
| **Gilded Hand + Runeforged** | Sharpening Stone scales with gold held: +50% base + 1% per 10 gold (max double). |
| **Brood + Warpack** | Battle Fury: each Fury stack also applies 1 poison to the enemy. |
| **Gilded Hand + Brood** | Toxic Blood: poison applied on taking damage also yields 1 gold per stack. |
| **Ironward + Runeforged** | Precision Lens: if the kept roll exceeds the dropped roll by 4+, heal 2 HP. |

---

## Order Interaction Screen (End of Loop)

After the boss is defeated, favor is calculated and applied. If any tier thresholds were crossed, the player sees **narrative interaction text** — never numbers or mechanical descriptions. The Order system is silent during the run; these interactions are the only hint it exists.

Each Order has distinct voice:

- *The Warpack, Tier 1:* "Word of your campaigns has reached the Warpack's outriders. They've begun marking your kills alongside their own."
- *The Gilded Hand, Tier 1:* "A sealed letter arrives. Inside, a small coin and a note: 'We noticed. We always notice.'"
- *The Ironward, Tier 2:* "A veteran approaches after your victory. She studies your wounds, then nods. 'You endure. That is enough.'"
- *Cross-order synergy active:* "The Ironward and the Warpack rarely acknowledge the same fighter. Lately, both have been quiet about you."

**No threshold crossed:** Brief atmospheric rest beat — arrival at camp, the weather, a moment of silence. Nothing mechanical surfaced.

**Multiple thresholds in one loop** shown as separate interactions in sequence.

Order lore is available in a **Campaign Codex** — an in-world description of each Order's philosophy and what they respect. Written as world information, not game-mechanical guidance. Accessible from the Ancient Order / Campaign screen.

---

## Skill Die

All 6 faces are always present and always accessible. Nodes unlock via leveling during runs, exactly as now. Nothing on the Skill Die is ever locked, removed, or restricted.

What changes in campaign mode: node enhancements from Order favor alter the effective values of already-unlocked nodes, applied silently at dungeon start.

---

## Campaign Persistence

Replaces `RunHistory` with a `CampaignHistory` model. Campaigns are the top-level record; individual loop runs are nested within each campaign. Single (non-campaign) runs are stored as single-loop campaign records to unify the history model.

```javascript
// Active campaign state — in localStorage under existing campaign key
{
  campaignId: timestamp,
  currentLoop: 1,           // 1–3 for now
  orderFavor: {
    warpack: 0,
    gilded: 0,
    runeforged: 0,
    brood: 0,
    ironward: 0
  },
  outcome: 'active' | 'completed' | 'defeated',
  defeatedAt: { loop: N, floor: N } | null,
  loops: [
    {
      loop: 1,
      difficulty: 'casual',
      outcome: 'victory' | 'defeat',
      floor: 15,
      enemiesKilled: N,
      totalGold: N,
      favorEarned: { warpack: N, gilded: N, runeforged: N, brood: N, ironward: N }
    }
    // ... one entry per completed loop
  ]
}

// Completed campaigns archived in CampaignHistory (replaces RunHistory)
// localStorage key: 'diceDungeon_v1_campaigns'
// Max 50 campaigns (each contains up to 3 loop records)
```

**API:** `CampaignHistory.save(campaign)`, `CampaignHistory.getAll()`, `CampaignHistory.getStats()` — replaces `RunHistory` equivalents. The history screen shows campaigns as the top-level unit with expandable loop detail.

---

## Relationship to Existing Systems

| System | Change |
|--------|--------|
| Ancient Order screen (`CampaignScreen`) | Becomes campaign launch + loop status UI |
| Ancient Order ranks (Outsider → Adept) | Reworked: rank titles repurposed as Order tier labels within the Codex |
| Per-run difficulty selector | Kept for single-run mode; replaced by loop number in campaign mode |
| Dungeon blueprint generation | Unchanged — loop drives difficulty band |
| Skill Die node unlocks | Unchanged within a run; node effects enhanced by campaign favor |
| Artifacts | Existing handlers gain favor-conditional branches at dungeon start |
| Run history (`RunHistory`) | Replaced by `CampaignHistory` — campaigns are top-level, loop runs nested within |

---

## Open Questions

1. **Favor earn from elites** — Elite encounters increase enemy threat via modifiers. The formula naturally handles this (higher baseThreat modifier → more favor). Confirm that `applyEliteChoice()` updates `enemy.baseThreat` or confirm the threat used is pre-modifier. *Check: `encounterGenerator.js` / `eliteModifierSystem.js`.*
2. **Affinity weight tuning** — Starting weights above are principled estimates. Calibrate after seeing actual favor accumulation across real playthroughs.
3. **Tier threshold calibration** — Values above derived from simulation with standard layout (2 combat/act). Gauntlet layout (3 combat/act) will generate more favor per loop — thresholds may need adjustment.
4. **Order naming** — Current names (Warpack, Gilded Hand, Runeforged, Brood, Ironward) are working names pending world-appropriate finals.
5. **Campaign Codex placement** — Where in the Ancient Order screen does the Codex live?
6. **Loop 4+ extension** — Requires new `CHALLENGE_BUDGETS` bands in `dungeonBlueprint.js` when 3-loop cap is lifted.

---

## Implementation Phases

1. **`orderFavor` on all 26 nodes** — Add property to `SKILL_TREE` in `js/constants.js` per the table above
2. **Campaign persistence** — Replace `RunHistory` with `CampaignHistory` in `js/persistence.js`; campaign state holds active campaign with nested loop records; archive to `CampaignHistory` on campaign end
3. **Campaign start flow** — Rework Ancient Order screen to support campaign launch with loop/death display; wire into `Game.start()`
4. **Favor accumulation** — Hook into enemy defeat in `js/combat.js`; read `GS.unlockedNodes` + `enemy.baseThreat`; accumulate per-loop totals in GS; flush to campaign state on boss defeat
5. **Favor tier enhancements** — Define tier tables per Order; apply active enhancements at dungeon start in `Game.start()` based on campaign favor state
6. **Loop difficulty scaling** — Loop counter drives difficulty band in `generateDungeonBlueprint()`
7. **Order interaction screen** — New screen shown after boss defeat in campaign mode; show narrative text for crossed thresholds; atmospheric fallback if none
8. **Campaign Codex** — In-world Order descriptions accessible from campaign screen
9. **Artifact enhancements** — Add favor-conditional branches to relevant artifact effect handlers in `js/combat.js` / `js/screens.js`
10. **Cross-order synergies** — Detect dual Tier 2 conditions at dungeon start; apply synergy bonuses alongside standard tier bonuses
