# Elite Modifier Threat Analysis

## 1. Overview & Purpose

This document assesses the threat impact of each elite modifier in the context of the procedural dungeon generation system, quantifies that impact per enemy, traces its effect on XP and gold through a run, and identifies required system changes and documentation updates.

### Scope
- 9 standard elite modifiers (all non-boss enemies)
- 5 boss-specific elite modifiers (Bone King, Crimson Wyrm, Void Lord)
- 15 enemies: 10 universal (Acts 1–3) + 5 specialists (Acts 2–3)
- 3 bosses (floors 5, 10, 15)

### Why this is needed
The `eliteAffinities` in `bestiaryThreatData.js` are single flat integers (e.g. `deadly: 10`) that were set before the per-act baseThreat rework. At score time, `scoreFloor()` applies `passiveScale = 1.0 + 0.25 × (act−1)` — but this only covers a 1.5× range while baseThreat spans roughly 12× from Act 1 to Act 3.

**Example — Deadly Goblin in Act 3:**
- baseThreat: 200
- Deadly affinity (current): 10 × passiveScale 1.5 = **+15** → 7.5% threat increase
- Mechanically, Deadly adds +30% HP and upgrades all dice by +2 faces — roughly **+30% total threat**

The affinities need to be per-act values derived from the threat formula.

---

## 2. Threat Computation Methodology

### Base formula (from `bestiaryThreatData.js`)

```
baseThreat = (durability × offense)^0.55 + disruption

durability = HP × armorMult × evasionMult × (1 + sustainFactor)
offense    = avgDieSum × patternMult × multiHitMult + bypass + escalate + summon
disruption = additive score for status effects, sealing, decay, poison, gold theft, etc.

P = 0.55 (power coefficient)
C = 1.0 (regular enemies) / 1.35 (bosses)
```

### Modifier threat delta

For a modifier that multiplies durability by `f_d` and offense by `f_o` and adds disruption `Δd`:

```
T_mod = (f_d × D × f_o × O)^0.55 + disruption + Δd
T_mod ≈ (f_d × f_o)^0.55 × (D × O)^0.55 + disruption + Δd

Δ_threat = T_mod − baseThreat
         = (D × O)^0.55 × ((f_d × f_o)^0.55 − 1) + Δd
```

Key consequence: the formula component `(D × O)^0.55` is smaller than `baseThreat` for enemies with significant disruption. Disruption is additive and unaffected by HP/dice multipliers. For disruption-heavy enemies (Dark Mage, Lich, Demon), offensive/defensive modifiers contribute less proportionally.

**Disruption fraction estimates:**
| Enemy | Disruption fraction of baseThreat |
|---|---|
| Goblin, Dire Rat, Slime, Orc Warrior, Dragon Whelp | ~5–10% |
| Skeleton, Fungal Creep, Troll, Vampire, Berserker | ~10–15% |
| Dark Mage, Mimic, Shadow Assassin | ~25–35% |
| Lich, Demon | ~35–45% |

### Modifier factors

For each modifier we derive an **effective threat factor** = proportional increase in baseThreat. Enemy-specific adjustments are applied for synergy (e.g. Armored stacking on Iron Golem's existing armor) or anti-synergy (e.g. Brittle conflicting with the Skeleton's own Brittle passive).

The recommended implementation replaces flat affinities with **per-act dicts** matching the structure of `baseThreat`:

```javascript
// Current (flat — incorrect scaling)
eliteAffinities: { deadly: 10 }

// Recommended (per-act — matches baseThreat structure)
eliteAffinities: { deadly: { 1: 5, 2: 18, 3: 60 } }
```

Boss affinities remain flat since each boss appears only once at a fixed floor.

---

## 3. The Act-Scaling Problem

### The numbers

| Enemy | baseThreat Act 1 | baseThreat Act 2 | baseThreat Act 3 | Ratio 1→3 |
|---|---|---|---|---|
| Goblin | 17 | 59 | 200 | 11.8× |
| Orc Warrior | 17 | 62 | 219 | 12.9× |
| Troll | 17 | 58 | 205 | 12.1× |
| Dark Mage | 16 | 57 | 201 | 12.6× |

### How passiveScale falls short

`passiveScale = 1.0 + 0.25 × (act−1)` covers only a **1.5×** range. With flat affinities, a modifier worth `+10` at Act 1 becomes `+15` at Act 3 — but baseThreat has grown ~12×. The modifier's actual threat impact on the enemy has grown proportionally too.

### Solution

Switch to per-act affinity dicts. Remove `passiveScale` from `scoreFloor()` (it becomes redundant once affinities are act-specific). Update `getEliteThreatForEnemy` to accept an `act` parameter.

**Code change required in `dungeonScoring.js` `scoreFloor()`:**
```javascript
// Current
const passiveScale = 1.0 + 0.25 * (act - 1);
eliteThreat = Math.round((visibleThreat + hiddenThreat) * passiveScale);

// Recommended (after per-act affinity migration)
eliteThreat = visibleThreat + hiddenThreat; // affinities already act-resolved
```

**Code change required in `bestiaryThreatData.js` `getEliteThreatForEnemy()`:**
```javascript
// Current
export function getEliteThreatForEnemy(modifierId, enemyName, bossFloor = null) {
    const profile = getEnemyProfile(enemyName, bossFloor);
    if (!profile || !profile.eliteAffinities) return 0;
    return profile.eliteAffinities[modifierId] || 0;
}

// Recommended
export function getEliteThreatForEnemy(modifierId, enemyName, bossFloor = null, act = null) {
    const profile = getEnemyProfile(enemyName, bossFloor);
    if (!profile || !profile.eliteAffinities) return 0;
    const affinity = profile.eliteAffinities[modifierId];
    if (!affinity) return 0;
    if (typeof affinity === 'object' && act) return affinity[act] || 0;
    return affinity; // flat value for bosses or unresolved
}
```

---

## 4. Standard Modifier Analysis

### 4.1 💀 Deadly (+2 diceUpgrade, ×1.3 HP)

**Mechanical effect:** Each die in the enemy's pool gains +2 faces (d6→d8, d8→d10, d10→d12). HP multiplied by 1.3. Both offense and durability increase.

**Component analysis:**
- `f_d = 1.30`
- `f_o` depends on base die size: d6 base → 4.5/3.5 = 1.286; d8 base → 5.5/4.5 = 1.222; d10 base → 6.5/5.5 = 1.182
- Combined factor: `(f_d × f_o)^0.55 − 1`
  - 3d6 enemies: (1.3 × 1.286)^0.55 − 1 ≈ **0.327** (33%)
  - 2d8 enemies: (1.3 × 1.222)^0.55 − 1 ≈ **0.290** (29%)
  - 2d10 enemies: (1.3 × 1.182)^0.55 − 1 ≈ **0.266** (27%)

**Enemy-specific synergies:**
- **Orc Warrior**: War Cry buffs the now-larger dice pool. Higher average die value means buffed attacks deal disproportionately more. Apply **+0.03 bonus**.
- **Troll**: Already durable; Deadly extends an already-long fight. Effective factor **0.28**.
- **Dark Mage**: High disruption fraction (~30%) means formula component is smaller share of baseThreat. Effective factor **0.20**.
- **Lich**: Very high disruption (phylactery + decay). Effective factor **0.20**.
- **Demon**: Hellfire (unblockable) not affected by die upgrade; disruption-dominant. Effective factor **0.22**.
- **Shadow Assassin**: Low-HP glass cannon; Deadly's HP bump is relatively more impactful. Effective factor **0.28**.
- **Dragon Whelp**: Charge immunity + Deadly = extended window of huge burst. Effective factor **0.32**.

**Conflicts:** none. Can pair with any other modifier except Enraged.

**Recommended per-act affinities:**

| Enemy | Act 1 | Act 2 | Act 3 | Factor |
|---|---|---|---|---|
| Goblin | 5 | 18 | 60 | 0.30 |
| Dire Rat | 5 | 18 | 61 | 0.30 |
| Fungal Creep | 5 | 16 | 55 | 0.28 |
| Slime | 5 | 17 | 54 | 0.28 |
| Skeleton | 4 | 16 | 59 | 0.28 |
| Dark Mage | 3 | 11 | 40 | 0.20 |
| Orc Warrior | 6 | 21 | 74 | 0.33 (War Cry synergy) |
| Troll | 5 | 16 | 57 | 0.28 |
| Vampire | 4 | 15 | 54 | 0.25 |
| Mimic | 4 | 15 | 50 | 0.25 |
| Demon | — | 14 | 50 | 0.22 |
| Lich | — | 13 | 44 | 0.20 |
| Dragon Whelp | — | 22 | 76 | 0.32 |
| Shadow Assassin | — | 17 | 61 | 0.28 |
| Iron Golem | — | 17 | 59 | 0.28 |

---

### 4.2 🛡️ Armored (×1.5 HP, Armor passive −2 damage reduction)

**Mechanical effect:** HP × 1.5, plus a passive that reduces ALL incoming player damage by 2. The reduction applies every attack, not per slot. Scales with `scaleElitePassives` (2→2.5→3 in Acts 1/2/3).

**Component analysis:**
- `f_d = 1.50` (from HP alone)
- Armor passive adds armorMult bonus: +2 reduction ≈ `+0.10 × armorMult` contribution to durability
- Combined: `f_d_eff ≈ 1.60` for formula purposes
- `f_o = 1.0` (no offense change)
- Factor: `(1.60)^0.55 − 1 ≈ 0.326`

**Enemy-specific synergies:**
- **Iron Golem**: Already has Armor(2) natively. Elite Armor stacks → Armor(4–5 total). Player needs to roll very high to deal meaningful damage. Massive synergy: **factor 0.45**.
- **Troll**: Already tanky with Regen and Thick Hide (Act 3). Armored makes an already-long fight much longer: **factor 0.40**.
- **Dragon Whelp**: High HP + charge immunity + armor = extreme wall. During charge turns (immune), the armor reduction never helps player — but in subsequent double-attack turns, armor is irrelevant to offense. Net: **factor 0.35**.
- **Skeleton**: Interesting case. Act 1 Skeleton already has Brittle passive (enemy-granted, doubles per-slot damage above threshold). Armored CONFLICTS with Brittle, so this combination cannot occur by design.
- **Dark Mage**: Disruption-heavy; armor doesn't affect curse/decay impact. **factor 0.25**.
- **Shadow Assassin**: Low HP; the 1.5× HP mult is very impactful on a glass cannon. **factor 0.35**.

**Conflicts:** `brittle` (cannot have both — thematically and mechanically correct).

**Recommended per-act affinities:**

| Enemy | Act 1 | Act 2 | Act 3 | Factor |
|---|---|---|---|---|
| Goblin | 5 | 18 | 60 | 0.30 |
| Dire Rat | 5 | 18 | 60 | 0.30 |
| Fungal Creep | 5 | 17 | 58 | 0.30 |
| Slime | 6 | 21 | 68 | 0.35 (engorge+armor = extreme tank) |
| Skeleton | 4 | 17 | 63 | 0.30 |
| Dark Mage | 4 | 14 | 50 | 0.25 |
| Orc Warrior | 5 | 19 | 66 | 0.30 |
| Troll | 7 | 23 | 82 | 0.40 (sustain synergy) |
| Vampire | 5 | 18 | 65 | 0.30 |
| Mimic | 5 | 18 | 60 | 0.30 |
| Demon | — | 19 | 68 | 0.30 |
| Lich | — | 19 | 66 | 0.30 |
| Dragon Whelp | — | 24 | 83 | 0.35 |
| Shadow Assassin | — | 21 | 76 | 0.35 |
| Iron Golem | — | 27 | 95 | 0.45 (stacking armor) |

---

### 4.3 ⚡ Swift (+1 d6 extraDie)

**Mechanical effect:** Adds one additional d6 to the enemy's dice pool. HP unchanged. A pure offense increase, with impact proportional to how large the existing pool is.

**Component analysis:**
- `f_d = 1.0`
- `f_o` = (original_avgDieSum + 3.5) / original_avgDieSum
  - 3d6 (avg 10.5): f_o = 14/10.5 = 1.333 → factor (1.333)^0.55 − 1 ≈ **0.175**
  - 2d8 (avg 9.0): f_o = 12.5/9.0 = 1.389 → factor **0.207** (adding d6 to smaller pool = bigger ratio)
  - 2d10 (avg 11.0): f_o = 14.5/11.0 = 1.318 → factor **0.166**
  - 4d6 (Dire Rat-style): f_o = 17.5/14.0 = 1.25 → factor **0.133**

**Enemy-specific considerations:**
- **Dire Rat**: Multi-hit. Each die hits separately — the extra d6 adds a whole additional hit. This compounds with multi-hit defensive limitations. **+0.05 bonus**: effective factor **0.22**.
- **Dark Mage**: The 2d10 pool gets +1d6. The d6 is relatively weak compared to d10. Lower effective impact. **factor 0.16**.
- **Iron Golem**: Extra d6 on top of 2d10 is proportionally modest. **factor 0.17**.

**Conflicts:** none.

**Recommended per-act affinities:**

| Enemy | Act 1 | Act 2 | Act 3 | Factor |
|---|---|---|---|---|
| Goblin | 3 | 10 | 35 | 0.175 |
| Dire Rat | 4 | 13 | 44 | 0.22 (multi-hit) |
| Fungal Creep | 4 | 11 | 39 | 0.20 |
| Slime | 3 | 10 | 35 | 0.18 |
| Skeleton | 3 | 10 | 38 | 0.18 |
| Dark Mage | 3 | 9 | 32 | 0.16 |
| Orc Warrior | 4 | 12 | 44 | 0.20 |
| Troll | 4 | 12 | 41 | 0.20 |
| Vampire | 3 | 10 | 37 | 0.17 |
| Mimic | 3 | 10 | 35 | 0.17 |
| Demon | — | 11 | 38 | 0.17 |
| Lich | — | 10 | 35 | 0.16 |
| Dragon Whelp | — | 12 | 42 | 0.18 |
| Shadow Assassin | — | 11 | 39 | 0.18 |
| Iron Golem | — | 10 | 36 | 0.17 |

---

### 4.4 🔥 Enraged (+4 diceUpgrade, ×1.0 HP)

**Mechanical effect:** Each die gains +4 faces (d6→d10, d8→d12, d10→d14). HP unchanged. Pure offense upgrade — the largest single-stat boost available.

**Component analysis:**
- `f_d = 1.0`
- `f_o` = (upgraded_die_avg / original_die_avg):
  - d6→d10: 5.5/3.5 = 1.571 → factor (1.571)^0.55 − 1 ≈ **0.286**
  - d8→d12: 6.5/4.5 = 1.444 → factor **0.235**
  - d10→d14: 7.5/5.5 = 1.364 → factor **0.201**
  - Note: despite having a larger goldMult/xpMult than Deadly, Enraged produces slightly less combined threat because it only improves offense (not durability). The higher multipliers reflect *perceived* danger, not formula-derived threat. This discrepancy is intentional — see Section 9.

**Enemy-specific synergies:**
- **Orc Warrior**: War Cry buffs larger dice. After War Cry, an Enraged Orc deals dramatically more burst damage. Strong synergy: **factor 0.38**.
- **Dire Rat**: Multi-hit amplified — more damage per hit, same number of hits. Effective factor **0.32**.
- **Vampire**: Drain ability + larger dice = bigger sustain swings. **factor 0.32**.
- **Dragon Whelp**: +4 to already-large dice + charge double-attack = highest burst potential in the game. **factor 0.42**.
- **Lich**: Decay is not dice-based; disruption is dominant. **factor 0.18**.
- **Dark Mage**: Enraged on 2d10 → 2d14 combined with Bolt penetration = very dangerous. **factor 0.25**  (disruption fraction still reduces formula contribution).

**Conflicts:** `deadly` (cannot have both — combined +6d would be extreme).

**Recommended per-act affinities:**

| Enemy | Act 1 | Act 2 | Act 3 | Factor |
|---|---|---|---|---|
| Goblin | 5 | 19 | 64 | 0.32 |
| Dire Rat | 5 | 19 | 65 | 0.32 |
| Fungal Creep | 6 | 18 | 63 | 0.32 |
| Slime | 5 | 18 | 62 | 0.32 |
| Skeleton | 5 | 17 | 60 | 0.29 |
| Dark Mage | 4 | 14 | 50 | 0.25 |
| Orc Warrior | 6 | 24 | 83 | 0.38 |
| Troll | 5 | 17 | 62 | 0.30 |
| Vampire | 5 | 19 | 69 | 0.32 |
| Mimic | 5 | 17 | 60 | 0.30 |
| Demon | — | 16 | 58 | 0.25 |
| Lich | — | 12 | 40 | 0.18 |
| Dragon Whelp | — | 29 | 99 | 0.42 |
| Shadow Assassin | — | 18 | 65 | 0.30 |
| Iron Golem | — | 18 | 64 | 0.30 |

---

### 4.5 💚 Regenerating (×1.2 HP, Regen passive +3 HP/turn)

**Mechanical effect:** HP × 1.2, plus Regen(3) passive that heals at turn start. Scaled by `scaleElitePassives`: 3/3.75/4.5 HP per turn in Acts 1/2/3.

**Component analysis:**
The regen passive adds a `sustainFactor` contribution:
- sustainFactor += amount × 0.05
- Act 1: 3 × 0.05 = +0.15; Act 2: 3.75 × 0.05 = +0.19; Act 3: 4.5 × 0.05 = +0.23
- Combined f_d ≈ 1.2 × (1 + sustainFactor_delta) ≈ 1.2 × 1.15–1.23 ≈ **1.38–1.48**
- `f_o = 1.0`
- Factor: (1.38)^0.55 − 1 ≈ **0.194** to (1.48)^0.55 − 1 ≈ **0.249**

**Enemy-specific synergies:**
- **Troll**: Already has Regen(3) in Act 2 and Regen(5)+ThickHide in Act 3. Adding elite Regen stacks directly — the combined regen rate becomes 6/turn (Act 2) or 8/turn (Act 3). This is the most dangerous Regenerating synergy in the game. **factor 0.45** (stacking regen on already-sustain-dominant design).
- **Fungal Creep**: Sporadic ability heals the enemy. Additional regen turns a self-healing enemy into an extreme attrition wall. **factor 0.35**.
- **Slime**: Engorge ability grants HP bursts. Regen on top extends effective HP further. **factor 0.32**.
- **Skeleton**: Reassemble passive (revive chance) + Regen = the enemy frequently unkillable unless massive burst. **factor 0.32**.
- **Vampire**: Lifesteal + regen = double sustain. **factor 0.30**.
- **Brittle conflict**: Cannot appear on enemies that already have Brittle (but Brittle modifier conflicts anyway).

**Conflicts:** `brittle`.

**Recommended per-act affinities:**

| Enemy | Act 1 | Act 2 | Act 3 | Factor |
|---|---|---|---|---|
| Goblin | 4 | 14 | 48 | 0.24 |
| Dire Rat | 4 | 14 | 48 | 0.24 |
| Fungal Creep | 6 | 20 | 68 | 0.35 |
| Slime | 5 | 19 | 62 | 0.32 |
| Skeleton | 5 | 19 | 67 | 0.32 |
| Dark Mage | 3 | 11 | 40 | 0.20 |
| Orc Warrior | 4 | 15 | 53 | 0.24 |
| Troll | 8 | 26 | 92 | 0.45 (stacking regen) |
| Vampire | 5 | 18 | 65 | 0.30 |
| Mimic | 4 | 14 | 48 | 0.24 |
| Demon | — | 16 | 56 | 0.25 |
| Lich | — | 16 | 55 | 0.25 |
| Dragon Whelp | — | 20 | 71 | 0.30 |
| Shadow Assassin | — | 15 | 54 | 0.25 |
| Iron Golem | — | 18 | 62 | 0.30 |

---

### 4.6 🩸 Vampiric (×1.1 HP, Lifesteal passive 35%)

**Mechanical effect:** HP × 1.1, plus Lifesteal passive that heals the enemy for 35% of damage dealt. Scaled: 35%/44%/52.5% in Acts 1/2/3 (capped at 75%).

**Component analysis:**
- Lifesteal adds sustainFactor += 0.35 × 0.5 = +0.175 (from `computeBaseThreat`)
- f_d ≈ 1.1 × (1.175) ≈ **1.29**
- f_o = 1.0
- Factor: (1.29)^0.55 − 1 ≈ **0.153**

**Enemy-specific synergies:**
- **Vampire**: Already has Lifesteal(50%) in Act 2 and Lifesteal(75%) in Act 3. The elite Vampiric modifier's passive would be at a lower % than base and is partially redundant. Effective factor **0.05** — minimal additional threat since the passive may not stack, or if it stacks the cap (75%) limits total value.
- **Orc Warrior**: High consistent damage means substantial lifesteal healing per turn. Effective factor **0.28**.
- **Troll**: Already tanky; lifesteal turns it into a near-unkillable wall combined with existing Regen. **factor 0.32**.
- **Dragon Whelp**: High burst damage makes lifesteal swings very large per attack. **factor 0.30**.
- **Demon**: Hellfire (unblockable) triggers lifesteal. Unblockable damage that heals the demon is severe. **factor 0.30**.
- **Dark Mage**: Bolt penetration triggers lifesteal; curse is non-damaging. **factor 0.20**.

**Conflicts:** none.

**Recommended per-act affinities:**

| Enemy | Act 1 | Act 2 | Act 3 | Factor |
|---|---|---|---|---|
| Goblin | 3 | 10 | 36 | 0.18 |
| Dire Rat | 3 | 11 | 38 | 0.19 |
| Fungal Creep | 3 | 10 | 35 | 0.18 |
| Slime | 3 | 10 | 35 | 0.18 |
| Skeleton | 3 | 10 | 38 | 0.18 |
| Dark Mage | 3 | 11 | 40 | 0.20 |
| Orc Warrior | 5 | 17 | 61 | 0.28 |
| Troll | 5 | 19 | 66 | 0.32 |
| Vampire | 1 | 3 | 11 | 0.05 (existing lifesteal redundancy) |
| Mimic | 3 | 10 | 36 | 0.18 |
| Demon | — | 19 | 68 | 0.30 |
| Lich | — | 13 | 44 | 0.20 |
| Dragon Whelp | — | 20 | 71 | 0.30 |
| Shadow Assassin | — | 12 | 43 | 0.20 |
| Iron Golem | — | 16 | 57 | 0.27 |

---

### 4.7 💎 Brittle (×0.8 HP, Brittle passive — per-slot damage above 4 is doubled)

**Mechanical effect:** HP × 0.8 (the enemy is WEAKER). The Brittle passive benefits the PLAYER — per-slot damage above the threshold is doubled. Net result: the enemy is easier to kill in most circumstances.

**Component analysis:**
- f_d = 0.80 (enemy is frailer)
- Brittle passive: armorMult penalty −0.25 in `computeBaseThreat`
- Combined effective: f_d_eff ≈ 0.75–0.80
- Factor: (0.75)^0.55 − 1 ≈ **−0.148** (negative — enemy becomes easier)
- Disruption: none added

**Enemy-specific considerations:**
- **Skeleton**: Already has Brittle as a base passive. Elite Brittle is fully redundant on the passive (can't stack). Only the −20% HP applies. Net factor more negative: **−0.15**.
- **Iron Golem**: Has Armor(2–3) passive. Armor reduces player damage to slot — if player hits below the Brittle threshold (4), Brittle never triggers. Armor potentially negates Brittle bonus entirely. Factor ≈ **+0.02** (slightly positive — enemy loses HP but the Brittle bonus is unreliable vs. its armor).
- **Troll**: Very high HP + Regen. Brittle reduces HP but the player still needs many turns to kill it. The Brittle bonus helps burst it down. Factor **−0.05** (modest net negative — toughness partially absorbs the deficit).
- **Dragon Whelp**: High burst damage + charge immune turns. Brittle makes it physically easier to kill; the dangerous burst turns don't change. Factor **−0.12**.

**Important: Brittle in Heroic mode** — see Section 8.

**Conflicts:** `armored`, `regenerating`.

**Recommended per-act affinities (all negative — modifier makes enemy easier):**

| Enemy | Act 1 | Act 2 | Act 3 | Factor |
|---|---|---|---|---|
| Goblin | −3 | −9 | −30 | −0.15 |
| Dire Rat | −3 | −9 | −30 | −0.15 |
| Fungal Creep | −2 | −8 | −29 | −0.15 |
| Slime | −2 | −9 | −29 | −0.15 |
| Skeleton | −2 | −9 | −32 | −0.15 (passive redundant, only HP matters) |
| Dark Mage | −2 | −8 | −30 | −0.15 |
| Orc Warrior | −2 | −9 | −33 | −0.15 |
| Troll | −1 | −3 | −10 | −0.05 (regen partially absorbs) |
| Vampire | −2 | −9 | −32 | −0.15 |
| Mimic | −2 | −9 | −30 | −0.15 |
| Demon | — | −10 | −34 | −0.15 |
| Lich | — | −10 | −33 | −0.15 |
| Dragon Whelp | — | −8 | −28 | −0.12 |
| Shadow Assassin | — | −9 | −32 | −0.15 |
| Iron Golem | — | +1 | +4 | +0.02 (armor negates Brittle bonus) |

---

### 4.8 💜 Cursed (×1.2 HP, enemy applies starting curse to player)

**Mechanical effect:** HP × 1.2, plus `cursePlayerOnStart = true` — the enemy applies a curse before the first player turn. The curse effect depends on the enemy's curse ability (typically: reduces player dice count by 1–2 for several turns, or seals a slot).

**Component analysis:**
- f_d = 1.20 from HP
- Disruption delta: starting curse = full turn 1 disruption value applied before player acts
  - For enemies with `curse` ability (Dark Mage, Lich): the curse is consistent with what they'd do on a normal turn. Starting curse means player is immediately debuffed. Disruption impact for scoring: approximately equivalent to a free curse turn = `curse_disruption_value × pattern_frequency_of_curse` extra disruption.
  - For enemies WITHOUT a curse ability (Goblin, Orc): the starting curse uses a generic debuff — approximately equivalent to the Dark Mage's Act 1 curse in severity (dice reduction for 2 turns). Disruption add ≈ 5–8.
- Combined factor (HP only): (1.20)^0.55 − 1 ≈ **0.105** plus disruption add.
- With disruption add of ~6: effective delta on baseThreat ≈ **0.20–0.30 total**.

**Enemy-specific considerations:**
- **Dark Mage**: Has curse ability natively. Starting curse on the Dark Mage means player is debuffed before the Mage's first real action. Very high impact on a glass-cannon fight where the opening tempo matters. **factor 0.35**.
- **Lich**: Similar reasoning. Phylactery + starting curse = player debuffed for a potentially long fight. **factor 0.32**.
- **Orc Warrior**: Starting curse + War Cry spike = player weakened exactly when the Orc's biggest damage turn arrives. High synergy. **factor 0.32**.
- **Goblin**: Simple pattern; starting curse disrupts early but Goblin fights don't last long enough for it to compound. **factor 0.22**.
- **Slime**: Engorge ability means fights run long; curse debuff lasts multiple turns. **factor 0.28**.

**Conflicts:** none.

**Recommended per-act affinities:**

| Enemy | Act 1 | Act 2 | Act 3 | Factor |
|---|---|---|---|---|
| Goblin | 4 | 13 | 44 | 0.22 |
| Dire Rat | 4 | 13 | 44 | 0.22 |
| Fungal Creep | 4 | 14 | 49 | 0.25 |
| Slime | 4 | 17 | 54 | 0.28 |
| Skeleton | 4 | 14 | 48 | 0.23 |
| Dark Mage | 6 | 20 | 70 | 0.35 |
| Orc Warrior | 5 | 20 | 70 | 0.32 |
| Troll | 4 | 16 | 56 | 0.27 |
| Vampire | 5 | 18 | 65 | 0.30 |
| Mimic | 4 | 14 | 50 | 0.25 |
| Demon | — | 19 | 68 | 0.30 |
| Lich | — | 20 | 70 | 0.32 |
| Dragon Whelp | — | 17 | 59 | 0.25 |
| Shadow Assassin | — | 18 | 65 | 0.30 |
| Iron Golem | — | 18 | 64 | 0.30 |

---

### 4.9 😈 Berserker (×1.3 HP, BloodFrenzy passive — below 50% HP gains 2d6)

**Mechanical effect:** HP × 1.3, plus BloodFrenzy passive: when enemy HP drops below 50%, it gains 2 extra d6 dice for the remainder of combat. This creates a two-phase fight — normal phase then a berserk phase with materially more offense.

**Component analysis:**
- f_d = 1.30 from HP
- BloodFrenzy adds: sustainFactor += 0.1 (from `computeBaseThreat` for bloodFrenzy)
- Combined f_d_eff ≈ 1.30 × 1.10 ≈ **1.43**
- Berserk phase offense: additional avg 2 × 3.5 = +7 avg DPS when triggered
- f_o_berserk_avg ≈ 1 + (7 / original_avgDPS) × 0.5 (triggered ~50% of fight duration)
  - 3d6 enemy (avg 10.5 DPS): +7 × 0.5 / 10.5 ≈ **1.33** for phase 2 DPS
  - Net offense factor (weighted avg): ≈ 1.17
- Combined factor: (1.43 × 1.17)^0.55 − 1 ≈ (1.67)^0.55 − 1 ≈ **0.30**

**Enemy-specific synergies:**
- **Orc Warrior**: War Cry spike + berserk 2d6 = potential one-turn lethal. Very high berserk phase impact. **factor 0.38**.
- **Vampire**: Drain ability + berserk phase means weaker player dice AND more enemy dice simultaneously. **factor 0.35**.
- **Dragon Whelp**: Charge double-attack + berserk phase = the most dangerous combination of tempo + offense in the game. **factor 0.40**.
- **Troll**: Already survives to berserk phase easily. The 2d6 combined with existing dice makes berserk phase very dangerous. **factor 0.35**.
- **Fungal Creep**: Moderate attack pattern; berserk adds raw damage to an otherwise control-focused enemy. **factor 0.28**.
- **Dark Mage**: High disruption; berserk 2d6 added to 2d10 = significant jump. **factor 0.25**.

**Conflicts:** none.

**Recommended per-act affinities:**

| Enemy | Act 1 | Act 2 | Act 3 | Factor |
|---|---|---|---|---|
| Goblin | 5 | 18 | 60 | 0.30 |
| Dire Rat | 5 | 18 | 61 | 0.30 |
| Fungal Creep | 5 | 16 | 55 | 0.28 |
| Slime | 5 | 18 | 58 | 0.30 |
| Skeleton | 5 | 17 | 59 | 0.28 |
| Dark Mage | 4 | 14 | 50 | 0.25 |
| Orc Warrior | 6 | 24 | 83 | 0.38 |
| Troll | 6 | 20 | 72 | 0.35 |
| Vampire | 5 | 21 | 75 | 0.35 |
| Mimic | 5 | 18 | 60 | 0.30 |
| Demon | — | 19 | 68 | 0.30 |
| Lich | — | 16 | 55 | 0.25 |
| Dragon Whelp | — | 27 | 94 | 0.40 |
| Shadow Assassin | — | 19 | 65 | 0.30 |
| Iron Golem | — | 18 | 64 | 0.30 |

---

## 5. Boss Modifier Analysis

Boss affinities remain flat (each boss appears only once) but should be scaled up substantially from current values — the current values (20–48) were set relative to the un-reworked threat scale.

**Boss base threats:**
- Floor 5 (Bone King): 59
- Floor 10 (Crimson Wyrm): 183
- Floor 15 (Void Lord): 420

### 5.1 💀 Deadly — Boss (+4 diceUpgrade, ×1.4 HP)

- Larger upgrade (+4 vs +2) and larger HP mult (×1.4 vs ×1.3) than standard Deadly.
- Factor ≈ 0.35–0.45 (bigger upgrade step on boss dice pools, HP × 1.4 is more impactful).

| Boss | Floor | Factor | Recommended |
|---|---|---|---|
| Bone King | 5 | 0.40 | 24 |
| Crimson Wyrm | 10 | 0.38 | 70 |
| Void Lord | 15 | 0.35 | 147 |

### 5.2 🔥 Enraged — Boss (+6 diceUpgrade, ×1.2 HP)

- Largest dice upgrade in the game (+6 faces to each die).
- Boss-specific: Bone King's Raise Dead ability adds new dice each turn — larger base dice means the snowball grows faster.
- Crimson Wyrm: fire breath die upgrade + Inferno Phase burn = catastrophic offense in Phase 2.
- Void Lord: double-action at 20% HP becomes potentially lethal with d16 dice.

| Boss | Floor | Factor | Recommended |
|---|---|---|---|
| Bone King | 5 | 0.50 | 30 |
| Crimson Wyrm | 10 | 0.45 | 82 |
| Void Lord | 15 | 0.42 | 176 |

### 5.3 🌀 Phasing (×1.5 HP, Phase passive — 50% resist alternating each turn)

- Effective HP is doubled on resist turns (player deals half damage every other turn).
- Combined with high HP mult, the effective durability is massive.
- f_d_eff ≈ 1.5 × 1.5 (effective HP due to resist) = **2.25** durability multiplier on resisting turns.
- Sustained factor: (2.25)^0.55 − 1 ≈ **0.47** damage contribution, plus sustained across a longer fight.

| Boss | Floor | Factor | Recommended |
|---|---|---|---|
| Bone King | 5 | 0.45 | 27 |
| Crimson Wyrm | 10 | 0.42 | 77 |
| Void Lord | 15 | 0.40 | 168 |

### 5.4 ⏰ Timewarped (×1.3 HP, phase triggers 25% sooner)

- Each phase threshold gains +0.25 (e.g. Bone King's Raise Dead phase at 75%→ triggers earlier).
- Crimson Wyrm Inferno Phase triggers at 75% HP instead of 50% — the burning escalation starts much earlier.
- Void Lord Entropy phase at 75% and double-action at 45% — player faces the hardest conditions for more of the fight.
- The threat increase scales with how impactful each boss's phases are.

| Boss | Floor | Factor | Recommended |
|---|---|---|---|
| Bone King | 5 | 0.35 | 21 |
| Crimson Wyrm | 10 | 0.38 | 70 |
| Void Lord | 15 | 0.40 | 168 |

### 5.5 🛡️ Armored — Boss (×1.6 HP, Armor passive −4 damage reduction)

- Larger HP mult (×1.6) and armor reduction (−4 vs −2) compared to standard Armored.
- On the Void Lord (700 HP base → 1120 HP with Armored), this is an extreme durability increase.
- Armor −4 means player needs to roll consistently above 4 per die to contribute meaningfully.

| Boss | Floor | Factor | Recommended |
|---|---|---|---|
| Bone King | 5 | 0.42 | 25 |
| Crimson Wyrm | 10 | 0.40 | 73 |
| Void Lord | 15 | 0.38 | 160 |

---

## 6. Master Affinity Tables

### Standard Enemies — Recommended Per-Act Affinities

| Enemy | Act | deadly | armored | swift | enraged | regen | vampiric | brittle | cursed | berserker |
|---|---|---|---|---|---|---|---|---|---|---|
| Goblin | 1 | 5 | 5 | 3 | 5 | 4 | 3 | −3 | 4 | 5 |
| | 2 | 18 | 18 | 10 | 19 | 14 | 10 | −9 | 13 | 18 |
| | 3 | 60 | 60 | 35 | 64 | 48 | 36 | −30 | 44 | 60 |
| Dire Rat | 1 | 5 | 5 | 4 | 5 | 4 | 3 | −3 | 4 | 5 |
| | 2 | 18 | 18 | 13 | 19 | 14 | 11 | −9 | 13 | 18 |
| | 3 | 61 | 60 | 44 | 65 | 48 | 38 | −30 | 44 | 61 |
| Fungal Creep | 1 | 5 | 5 | 4 | 6 | 6 | 3 | −2 | 4 | 5 |
| | 2 | 16 | 17 | 11 | 18 | 20 | 10 | −8 | 14 | 16 |
| | 3 | 55 | 58 | 39 | 63 | 68 | 35 | −29 | 49 | 55 |
| Slime | 1 | 5 | 6 | 3 | 5 | 5 | 3 | −2 | 4 | 5 |
| | 2 | 17 | 21 | 10 | 18 | 19 | 10 | −9 | 17 | 18 |
| | 3 | 54 | 68 | 35 | 62 | 62 | 35 | −29 | 54 | 58 |
| Skeleton | 1 | 4 | 4 | 3 | 5 | 5 | 3 | −2 | 4 | 5 |
| | 2 | 16 | 17 | 10 | 17 | 19 | 10 | −9 | 14 | 17 |
| | 3 | 59 | 63 | 38 | 60 | 67 | 38 | −32 | 48 | 59 |
| Dark Mage | 1 | 3 | 4 | 3 | 4 | 3 | 3 | −2 | 6 | 4 |
| | 2 | 11 | 14 | 9 | 14 | 11 | 11 | −8 | 20 | 14 |
| | 3 | 40 | 50 | 32 | 50 | 40 | 40 | −30 | 70 | 50 |
| Orc Warrior | 1 | 6 | 5 | 4 | 6 | 4 | 5 | −2 | 5 | 6 |
| | 2 | 21 | 19 | 12 | 24 | 15 | 17 | −9 | 20 | 24 |
| | 3 | 74 | 66 | 44 | 83 | 53 | 61 | −33 | 70 | 83 |
| Troll | 1 | 5 | 7 | 4 | 5 | 8 | 5 | −1 | 4 | 6 |
| | 2 | 16 | 23 | 12 | 17 | 26 | 19 | −3 | 16 | 20 |
| | 3 | 57 | 82 | 41 | 62 | 92 | 66 | −10 | 56 | 72 |
| Vampire | 1 | 4 | 5 | 3 | 5 | 5 | 1 | −2 | 5 | 5 |
| | 2 | 15 | 18 | 10 | 19 | 18 | 3 | −9 | 18 | 21 |
| | 3 | 54 | 65 | 37 | 69 | 65 | 11 | −32 | 65 | 75 |
| Mimic | 1 | 4 | 5 | 3 | 5 | 4 | 3 | −2 | 4 | 5 |
| | 2 | 15 | 18 | 10 | 17 | 14 | 10 | −9 | 14 | 18 |
| | 3 | 50 | 60 | 35 | 60 | 48 | 36 | −30 | 50 | 60 |
| Demon | 2 | 14 | 19 | 11 | 16 | 16 | 19 | −10 | 19 | 19 |
| | 3 | 50 | 68 | 38 | 58 | 56 | 68 | −34 | 68 | 68 |
| Lich | 2 | 13 | 19 | 10 | 12 | 16 | 13 | −10 | 20 | 16 |
| | 3 | 44 | 66 | 35 | 40 | 55 | 44 | −33 | 70 | 55 |
| Dragon Whelp | 2 | 22 | 24 | 12 | 29 | 20 | 20 | −8 | 17 | 27 |
| | 3 | 76 | 83 | 42 | 99 | 71 | 71 | −28 | 59 | 94 |
| Shadow Assassin | 2 | 17 | 21 | 11 | 18 | 15 | 12 | −9 | 18 | 19 |
| | 3 | 61 | 76 | 39 | 65 | 54 | 43 | −32 | 65 | 65 |
| Iron Golem | 2 | 17 | 27 | 10 | 18 | 18 | 16 | +1 | 18 | 18 |
| | 3 | 59 | 95 | 36 | 64 | 62 | 57 | +4 | 64 | 64 |

### Bosses — Recommended Flat Affinities

| Boss | deadly | enraged | phasing | timewarped | armored |
|---|---|---|---|---|---|
| Bone King (floor 5) | 24 | 30 | 27 | 21 | 25 |
| Crimson Wyrm (floor 10) | 70 | 82 | 77 | 70 | 73 |
| Void Lord (floor 15) | 147 | 176 | 168 | 168 | 160 |

### Current vs Recommended (Goblin example, passive-scale applied to current)

| Modifier | Current (flat) | Current Act 1 | Current Act 2 (×1.25) | Current Act 3 (×1.5) | Rec Act 1 | Rec Act 2 | Rec Act 3 |
|---|---|---|---|---|---|---|---|
| deadly | 10 | 10 | 12.5 | 15 | 5 | 18 | 60 |
| armored | 8 | 8 | 10 | 12 | 5 | 18 | 60 |
| swift | 7 | 7 | 8.75 | 10.5 | 3 | 10 | 35 |
| enraged | 10 | 10 | 12.5 | 15 | 5 | 19 | 64 |
| regenerating | 5 | 5 | 6.25 | 7.5 | 4 | 14 | 48 |
| vampiric | 6 | 6 | 7.5 | 9 | 3 | 10 | 36 |
| brittle | −3 | −3 | −3.75 | −4.5 | −3 | −9 | −30 |
| cursed | 6 | 6 | 7.5 | 9 | 4 | 13 | 44 |
| berserker | 6 | 6 | 7.5 | 9 | 5 | 18 | 60 |

The current system significantly underestimates elite threat in Act 2 and Act 3. Act 3 recommended values are 4–10× higher than current passive-scaled values.

---

## 7. XP & Gold Impact Through a Run

### Path A: Blueprint scoring (used for challenge rating)

```
totalThreat  = baseThreat + visibleAffinity[act] + hiddenAffinity[act]
eliteReward  = threatToReward(totalThreat, floor)
  gold = max(5, round(totalThreat × 1.5) + floor × 0.5) ± 20%
  xp   = round(2.5 × totalThreat^0.65) ± 15%
```

### Path B: Runtime rewards (used at end of combat)

```
goldBase = gold from threatToReward(baseThreat)
finalGold = goldBase × goldMult_visible × goldMult_hidden
finalXP   = xp   × xpMult_visible  × xpMult_hidden
```

### The dual-reward discrepancy

The two paths are not aligned. Blueprint scoring rewards are threat-driven; runtime rewards are multiplier-driven. With corrected per-act affinities, the threat-driven path will produce substantially larger rewards in Acts 2–3 — but runtime rewards (goldMult/xpMult path) won't change.

**Recommendation:** Keep both systems as-is for now. The multipliers (`goldMult`, `xpMult` on each modifier) serve as **player-visible reward signals** — they tell the player roughly how rewarding an elite will be. Exact calibration lives in the affinity values. Accept the discrepancy as a known approximation and document it explicitly. See Section 9.

### Run-level XP and gold impact

**Current system (flat affinities, Acts 1–3):**

A standard run with ~4 elite fights (2 Act 2, 2 Act 3) produces roughly:
- Elite threat added: (10+10)×1.25×2 + (10+10)×1.5×2 = 50 + 60 = **+110 total elite threat across run**
- Gold bonus vs no-elite: approx 1.5 × 110 ≈ **+165 gold**
- XP bonus: modest due to sublinear curve

**Recommended system (per-act affinities):**

Same run, using Deadly + Berserker pair as an example:
- Act 2 elite (Goblin): (18+18) = +36 threat
- Act 3 elite (Orc): (74+83) = +157 threat
- Total elite threat: (36×2) + (157×2) = **+386 total elite threat across run**
- Gold bonus: 1.5 × 386 ≈ **+579 gold** (3.5× more than current)
- XP bonus: substantially higher due to larger totalThreat inputs

This changes the economy meaningfully. Elites in later acts become significantly more rewarding in blueprint terms. The `ELITE_NET_ADVANTAGE` values need review.

---

## 8. ELITE_NET_ADVANTAGE Recalibration

`ELITE_NET_ADVANTAGE = [8, 3, -5]` in `dungeonScoring.js` is **modifier-agnostic** and must remain so. Rationale:

1. **Variation is the point.** Some elite draws are brutal (Enraged + Berserker Orc), some are favourable (Brittle + Regenerating Goblin — where one is negative and the other is modest). The net advantage averages across this variation over a run.
2. **Blueprint-time integrity.** Challenge rating is computed before the player sees which modifiers appear. A modifier-dependent `ELITE_NET_ADVANTAGE` would make the rating unreliable.
3. **Player agency.** In Standard mode, players can choose Standard over Elite on any floor. ELITE_NET_ADVANTAGE captures the *expected* value of the elite strategy, not per-encounter optimisation.

### Recalibration formula

```
NET_ADVANTAGE[act] = REWARD_ADVANTAGES.eliteArtifact
                   - mean(eliteThreatAdded[act]) × ATTRITION_RATE
```

Where `ATTRITION_RATE` represents the fraction of extra threat that converts to actual player HP loss (expected value, not worst case). Approximately 0.3–0.5 for a skilled player.

**Current values review with corrected affinities:**

Using median modifier pair per act (two mid-range modifiers, no extreme synergies):
- Act 1 median pair: ~(5+5) = +10 elite threat
  - Artifact advantage: +25 (eliteArtifact)
  - Attrition cost: 10 × 0.4 = 4 threat-equiv
  - Net: 25 − 4 = **+21** → current +8 is very conservative. Recommend **+15**
- Act 2 median pair: ~(15+15) = +30 elite threat
  - Artifact advantage: +25
  - Attrition cost: 30 × 0.4 = 12
  - Net: 25 − 12 = **+13** → current +3 is conservative. Recommend **+8**
- Act 3 median pair: ~(55+55) = +110 elite threat
  - Artifact advantage: +25
  - Attrition cost: 110 × 0.4 = 44
  - Net: 25 − 44 = **−19** → current −5 is too generous. Recommend **−15**

**Proposed ELITE_NET_ADVANTAGE: [15, 8, -15]**

This maintains the same structure (Act 1 positive, Act 3 negative) but corrects the magnitude now that affinities are properly calibrated.

---

## 9. Difficulty Considerations

### Casual (max 10% elite rate; 1 modifier; always visible, no hidden)

- Only one modifier applies (no hidden second modifier).
- `eliteThreat` = single visible affinity (no hidden term in the sum).
- Brittle as sole modifier on Casual is player-favourable — enemy is explicitly easier. This is acceptable on Casual since: (a) elites are rare and optional, (b) the player always knows the full scope (no hidden modifier), (c) the rewards compensate for what is effectively a discounted fight.
- Challenge rating computation should still include `eliteThreat` as the single visible affinity when `floor.eliteModifiers.hidden` is absent.
- The 10% cap means elites contribute very little to Casual's challenge rating in practice.

**Implementation note:** The blueprint generator needs a Casual-mode path where `selectEliteModifiers` only returns a `visible` modifier (no `hidden`), and `scoreFloor` checks for `hidden` presence before summing.

### Standard (up to 2 modifiers; up to 1 hidden; 50% uptake assumption)

- Current behaviour is correct in structure; affinity recalibration is the main change.
- With corrected affinities, elite threat becomes a more meaningful input to challenge rating.
- The 50% uptake assumption in `scoreDungeon()` is a reasonable median; no change needed.

### Heroic (≥90% elite rate; 2 modifiers; forced; all elites engaged)

- All encounters are elite — player has no choice.
- Brittle as a modifier in Heroic is a free advantage (enemy weaker + gold/XP multiplier). This is currently accepted as-is (rare lucky draw).
- **Option for future consideration**: Exclude Brittle from the Heroic modifier pool (`ELITE_MODIFIERS.filter(m => m.id !== 'brittle')` in the seeded selection). This prevents an occasionally trivial forced fight in the hardest mode. This is a design decision, not a bug.
- With corrected affinities, Heroic's `effectiveChallenge` will increase substantially, pushing challenge ratings higher. The challenge rating bounds ([8,10]) may need the offset/step tuned in `scoreDungeon()`.

---

## 10. The Dual-Reward System

### Current state

| System | Path | Used for |
|---|---|---|
| Threat affinities | `scoreFloor()` → `threatToReward()` | Blueprint scoring, challenge rating, dungeon map display |
| goldMult / xpMult | `calculateRewardMultipliers()` → `enemy.eliteGoldMult/xpMult` | Actual combat reward grants |

These are not aligned. A Deadly + Berserker Goblin in Act 3 with corrected affinities would have `totalThreat = 200 + 60 + 60 = 320`, scoring a gold reward of ~480–576 gold. But the runtime path uses `goldMult = 2.0 × 2.0 = 4.0×` applied to the base gold from `threatToReward(200)` ≈ 300–360g, giving ~1200–1440g — far higher.

### Recommendation

**Accept the discrepancy; document the roles.**

- **Affinities = balance truth.** They drive the challenge rating and dungeon scoring. Calibrate these carefully.
- **goldMult/xpMult = narrative signals.** They tell the player "this fight rewards more" in a legible way. They don't need to exactly match the affinity-derived values.
- Label this explicitly in code comments so future maintainers don't try to "fix" the discrepancy.
- If alignment becomes important later, the cleanest fix is **Option C**: derive goldMult from the affinity factor (`goldMult ≈ 1 + factor × GOLD_SCALING_CONSTANT`) — but this is a significant rework and not needed for the immediate calibration.

---

## 11. Required CLAUDE.md Updates

Add to the **Key Design Decisions** section:

```
- **Elite modifier threat**: Per-enemy threat impact uses per-act affinity dicts
  (`eliteAffinities: { modifier: { 1: N, 2: N, 3: N } }`) rather than flat numbers.
  Boss affinities remain flat (one appearance each). `getEliteThreatForEnemy` accepts
  `act` parameter. `passiveScale` is removed from `scoreFloor()` once migration is complete.
  See `docs/elite-modifier-threat-analysis.md`.
- **Dual reward system**: `goldMult`/`xpMult` on modifiers are player-visible reward
  signals; actual balance lives in `eliteAffinities`. The two systems are intentionally
  not aligned — do not attempt to sync them.
- **ELITE_NET_ADVANTAGE**: [15, 8, -15] (post-affinity-calibration). Modifier-agnostic
  by design to allow elite experience variation and preserve challenge rating integrity.
  See `docs/elite-modifier-threat-analysis.md` for derivation.
- **Casual elite constraints**: max 10% elite rate; 1 modifier (visible only, no hidden).
  Brittle on Casual is accepted as player-favourable — rare, optional, always fully visible.
- **Brittle on Heroic**: Potentially player-favourable (weaker enemy, forced fight). Current
  design accepts this as an occasional lucky draw. Future option: exclude Brittle from
  Heroic modifier pool.
```

---

## 12. Required decisions.md Updates

Add the following entries:

### Elite modifier threat methodology
**Decision**: Elite modifier threat impact uses per-act affinity values derived from the threat formula `baseThreat = (durability × offense)^0.55 + disruption`. For each modifier, a factor represents the proportional threat increase, adjusted per enemy for synergies and disruption fraction. Per-act affinities replace the prior flat integers + `passiveScale` system. Boss affinities remain flat.

**Rationale**: Flat affinities combined with `passiveScale` (1.0/1.25/1.5) cannot bridge the ~12× baseThreat gap from Act 1 to Act 3. Per-act values derived from formula components correctly represent modifier impact at each act's enemy power level.

### Brittle as an elite modifier
**Decision**: Brittle (−20% HP, Brittle passive that helps player) is kept in the modifier pool with negative threat affinities. On Casual (max 10% rate, visible-only), it's a known player-favourable draw. On Heroic (forced elite), it's accepted as an occasional lucky outcome rather than excluded.

**Rationale**: Excluding Brittle from Heroic adds complexity (difficulty-specific modifier pools) for an infrequent edge case. The variation in elite experience (sometimes brutal, sometimes favourable) is a feature.

### ELITE_NET_ADVANTAGE as modifier-agnostic values
**Decision**: `ELITE_NET_ADVANTAGE = [15, 8, -15]` is a fixed per-act average, not computed per-modifier-pair. It represents the expected net value of the elite strategy (loot vs attrition) averaged over all possible modifier draws.

**Rationale**: Blueprint scoring happens before the player knows which specific modifiers will appear. A modifier-dependent value would require knowing which specific elite is drawn, coupling blueprint generation to encounter selection. Modifier-agnostic values preserve run-start integrity and allow natural variation in individual elite encounters.

### Dual-reward system (affinity scoring vs. goldMult/xpMult)
**Decision**: Two reward systems coexist without alignment. Threat affinities drive blueprint scoring and challenge rating. `goldMult`/`xpMult` drive actual combat reward grants. They are intentionally not aligned.

**Rationale**: Aligning them would require either rewriting runtime rewards to be threat-derived (breaking the legible multiplier UX) or computing goldMult from affinity factors (added complexity). The discrepancy is acceptable because: affinities are authoritative for balance, and multipliers are authoritative for player communication.

---

## 13. Implementation Checklist

When implementing the above:

- [ ] Change `eliteAffinities` in `bestiaryThreatData.js` from flat integers to per-act dicts for all 15 enemies
- [ ] Update boss affinities in `BOSS_PROFILES` to recommended flat values
- [ ] Update `getEliteThreatForEnemy(modId, enemyName, bossFloor, act)` to resolve per-act dicts
- [ ] Update `scoreFloor()` in `dungeonScoring.js` to pass `act` to `getEliteThreatForEnemy` and remove `passiveScale` multiplication
- [ ] Update `encounterFromBlueprint()` call sites in `dungeonBlueprint.js` to pass `act` through
- [ ] Update Casual elite generation to produce only 1 (visible) modifier — no hidden
- [ ] Update `scoreFloor()` to handle missing `hidden` modifier gracefully (Casual path)
- [ ] Update `ELITE_NET_ADVANTAGE` to `[15, 8, -15]`
- [ ] Update challenge rating offset/step in `scoreDungeon()` if Heroic ratings shift significantly
- [ ] Add new entries to `CLAUDE.md` and `decisions.md` as outlined above
