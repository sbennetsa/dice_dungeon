# Dice Dungeon — Threat Calculations Reference

Covers the shared threat formula, anomaly threat multipliers, and elite modifier threat analysis. All values implemented in `dungeonScoring.js` and `bestiaryThreatData.js`.

---

## 1. Threat Formula

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
Δ_threat = (D × O)^0.55 × ((f_d × f_o)^0.55 − 1) + Δd
```

Key consequence: the `(D × O)^0.55` component is **smaller** than `baseThreat` for disruption-heavy enemies. Modifiers that only affect HP/dice contribute proportionally less on enemies where disruption is a large fraction of baseThreat.

**Disruption fraction estimates:**

| Enemies | Disruption % of baseThreat |
|---|---|
| Goblin, Dire Rat, Slime, Orc Warrior, Dragon Whelp | ~5–10% |
| Skeleton, Fungal Creep, Troll, Vampire | ~10–15% |
| Dark Mage, Mimic, Shadow Assassin | ~25–35% |
| Lich, Demon | ~35–45% |

### The act-scaling problem

`baseThreat` spans ~12× from Act 1 to Act 3. The old `passiveScale = 1.0 + 0.25 × (act−1)` only covered a 1.5× range. Solution: per-act affinity dicts for regular enemies; flat values for bosses (one appearance each). `passiveScale` is removed from `scoreFloor()`.

```javascript
// Regular enemies — per-act dicts
eliteAffinities: { deadly: { 1: 5, 2: 18, 3: 60 } }

// Bosses — flat values
eliteAffinities: { deadly: 24 }
```

`getEliteThreatForEnemy(modId, enemyName, bossFloor, act)` resolves the correct value.

---

## 2. Anomaly Threat Multipliers

```
anomalyThreat = Math.round(enemyThreat × (mult − 1))
```

`ANOMALY_THREAT_MULTS` in `dungeonScoring.js`:

| Anomaly | Mult | % delta | Derivation |
|---------|------|---------|-----------|
| `wounded` | 0.822 | −17.8% | `0.70^0.55` — HP reduced to 70% |
| `enraged` | 1.131 | +13.1% | `1.25^0.55` — dice +~25% avg |
| `doubleTrouble` | 1.464 | +46.4% | `2.00^0.55` — acts twice per turn |
| `glitched` | 1.060 | +6.0% | Empirical — one ability type-swap, small positive bias |
| `perfectStorm` | 1.000 | 0% | Env system handles threat; no double-count |

**Notes:**
- `wounded`: Only reduces HP, not armor/evasion/sustain passives. 0.822 is conservative.
- `doubleTrouble`: Also removes the player's opportunity to act between attacks — +46% is a principled floor.
- `glitched`: Large `rewardMult: 1.6` is intentional incentive — combat is unpredictable, not necessarily harder.
- `perfectStorm`: Forces a synergy environment. Threat fully captured by `envThreat` in `scoreFloor()`.

### Reward multipliers are decoupled

`rewardMult` in `ANOMALIES` is a player incentive value, not a threat measure:

| Anomaly | threatMult | rewardMult | Incentive premium |
|---------|-----------|-----------|------------------|
| wounded | 0.822 | 0.80 | close (−2%) |
| enraged | 1.131 | 1.40 | +24% |
| doubleTrouble | 1.464 | 2.00 | +37% |
| glitched | 1.060 | 1.60 | +51% |
| perfectStorm | 1.000 | 1.50 | N/A (env-based) |

---

## 3. Elite Modifier Analysis

### 3.1 💀 Deadly (+2 diceUpgrade, ×1.3 HP)

- `f_d = 1.30`; `f_o`: d6→d8 = 1.286, d8→d10 = 1.222, d10→d12 = 1.182
- Combined factor: 3d6 ≈ **0.327**, 2d8 ≈ **0.290**, 2d10 ≈ **0.266**
- Synergies: Orc Warrior War Cry +0.03; Dragon Whelp 0.32; disruption-heavy enemies 0.20
- Conflicts: `enraged`

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

### 3.2 🛡️ Armored (×1.5 HP, Armor passive −2 damage reduction)

- `f_d_eff ≈ 1.60` (HP + armor passive), `f_o = 1.0`; factor **0.326**
- Synergies: Iron Golem stacking armor 0.45; Troll sustain 0.40; Dragon Whelp 0.35
- Conflicts: `brittle`

| Enemy | Act 1 | Act 2 | Act 3 | Factor |
|---|---|---|---|---|
| Goblin | 5 | 18 | 60 | 0.30 |
| Dire Rat | 5 | 18 | 60 | 0.30 |
| Fungal Creep | 5 | 17 | 58 | 0.30 |
| Slime | 6 | 21 | 68 | 0.35 |
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

### 3.3 ⚡ Swift (+1 d6 extraDie)

- `f_d = 1.0`; `f_o = (avgDieSum + 3.5) / avgDieSum`
- 3d6: **0.175**; 2d8: **0.207**; 2d10: **0.166**; Dire Rat multi-hit +0.05 bonus
- Conflicts: none

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

### 3.4 🔥 Enraged (+4 diceUpgrade, ×1.0 HP)

- `f_d = 1.0`; d6→d10: **0.286**, d8→d12: **0.235**, d10→d14: **0.201**
- Despite higher goldMult/xpMult than Deadly, Enraged produces slightly less combined threat (offense only, not durability). Higher multipliers reflect *perceived* danger — intentional, see Section 5.
- Synergies: Dragon Whelp 0.42; Orc Warrior War Cry 0.38; Dire Rat multi-hit 0.32
- Conflicts: `deadly`

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

### 3.5 💚 Regenerating (×1.2 HP, Regen passive +3 HP/turn)

- Regen scales with `scaleElitePassives`: 3/3.75/4.5 HP/turn in Acts 1/2/3
- `sustainFactor += amount × 0.05`; `f_d_eff ≈ 1.38–1.48`; factor **0.19–0.25**
- Synergies: Troll stacking regen 0.45; Fungal Creep 0.35; Skeleton 0.32
- Conflicts: `brittle`

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

### 3.6 🩸 Vampiric (×1.1 HP, Lifesteal passive 35%)

- Lifesteal scales: 35%/44%/52.5% Acts 1/2/3 (capped at 75%)
- `sustainFactor += 0.175`; `f_d_eff ≈ 1.29`; factor **0.153**
- Vampire already has Lifesteal(50–75%) — redundancy reduces factor to ~0.05
- Synergies: Demon Hellfire triggers lifesteal 0.30; Troll double-sustain 0.32
- Conflicts: none

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

### 3.7 💎 Brittle (×0.8 HP, Brittle passive — per-slot damage above 4 doubled)

- `f_d_eff ≈ 0.75–0.80`; factor **−0.148** (negative — enemy becomes easier)
- Iron Golem: Armor may negate Brittle bonus entirely → factor **+0.02**
- Brittle on Casual: accepted player-favourable (rare, optional, fully visible)
- Brittle on Heroic: accepted as occasional lucky outcome
- Conflicts: `armored`, `regenerating`

| Enemy | Act 1 | Act 2 | Act 3 | Factor |
|---|---|---|---|---|
| Goblin | −3 | −9 | −30 | −0.15 |
| Dire Rat | −3 | −9 | −30 | −0.15 |
| Fungal Creep | −2 | −8 | −29 | −0.15 |
| Slime | −2 | −9 | −29 | −0.15 |
| Skeleton | −2 | −9 | −32 | −0.15 (passive redundant) |
| Dark Mage | −2 | −8 | −30 | −0.15 |
| Orc Warrior | −2 | −9 | −33 | −0.15 |
| Troll | −1 | −3 | −10 | −0.05 (regen absorbs) |
| Vampire | −2 | −9 | −32 | −0.15 |
| Mimic | −2 | −9 | −30 | −0.15 |
| Demon | — | −10 | −34 | −0.15 |
| Lich | — | −10 | −33 | −0.15 |
| Dragon Whelp | — | −8 | −28 | −0.12 |
| Shadow Assassin | — | −9 | −32 | −0.15 |
| Iron Golem | — | +1 | +4 | +0.02 (armor negates bonus) |

---

### 3.8 💜 Cursed (×1.2 HP, applies starting curse before first player turn)

- `f_d = 1.20` + disruption delta from starting curse ≈ 5–8; combined factor ≈ **0.20–0.30**
- Synergies: Dark Mage (native curse) 0.35; Orc Warrior War Cry timing 0.32
- Conflicts: none

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

### 3.9 😈 Berserker (×1.3 HP, BloodFrenzy passive — below 50% gains 2d6)

- `f_d_eff ≈ 1.43`; berserk phase net offense factor ≈ 1.17; combined **0.30**
- Synergies: Dragon Whelp charge+burst 0.40; Orc Warrior War Cry 0.38; Vampire drain 0.35
- Conflicts: none

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

## 4. Boss Modifier Analysis

Boss affinities are flat (one appearance each). Base threats: Bone King 59, Crimson Wyrm 183, Void Lord 420.

### 4.1 💀 Deadly — Boss (+4 diceUpgrade, ×1.4 HP)

| Boss | Floor | Factor | Affinity |
|---|---|---|---|
| Bone King | 5 | 0.40 | 24 |
| Crimson Wyrm | 10 | 0.38 | 70 |
| Void Lord | 15 | 0.35 | 147 |

### 4.2 🔥 Enraged — Boss (+6 diceUpgrade, ×1.2 HP)

Bone King: Raise Dead snowball amplified. Crimson Wyrm: Fire Breath + Inferno Phase catastrophic in Phase 2. Void Lord: double-action at 20% with d16 dice.

| Boss | Floor | Factor | Affinity |
|---|---|---|---|
| Bone King | 5 | 0.50 | 30 |
| Crimson Wyrm | 10 | 0.45 | 82 |
| Void Lord | 15 | 0.42 | 176 |

### 4.3 🌀 Phasing (×1.5 HP, 50% resist alternating each turn)

`f_d_eff ≈ 2.25` (effective HP doubled on resist turns); factor **0.47**.

| Boss | Floor | Factor | Affinity |
|---|---|---|---|
| Bone King | 5 | 0.45 | 27 |
| Crimson Wyrm | 10 | 0.42 | 77 |
| Void Lord | 15 | 0.40 | 168 |

### 4.4 ⏰ Timewarped (×1.3 HP, phase triggers 25% sooner)

Crimson Wyrm Inferno at 75% HP. Void Lord Entropy at 75%, double-action at 45%.

| Boss | Floor | Factor | Affinity |
|---|---|---|---|
| Bone King | 5 | 0.35 | 21 |
| Crimson Wyrm | 10 | 0.38 | 70 |
| Void Lord | 15 | 0.40 | 168 |

### 4.5 🛡️ Armored — Boss (×1.6 HP, Armor passive −4 damage reduction)

| Boss | Floor | Factor | Affinity |
|---|---|---|---|
| Bone King | 5 | 0.42 | 25 |
| Crimson Wyrm | 10 | 0.40 | 73 |
| Void Lord | 15 | 0.38 | 160 |

---

## 5. Master Affinity Tables

### Standard Enemies — Per-Act Affinities

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

### Bosses — Flat Affinities

| Boss | deadly | enraged | phasing | timewarped | armored |
|---|---|---|---|---|---|
| Bone King (floor 5) | 24 | 30 | 27 | 21 | 25 |
| Crimson Wyrm (floor 10) | 70 | 82 | 77 | 70 | 73 |
| Void Lord (floor 15) | 147 | 176 | 168 | 168 | 160 |

---

## 6. ELITE_NET_ADVANTAGE

`ELITE_NET_ADVANTAGE = [15, 8, -15]` in `dungeonScoring.js` — modifier-agnostic net advantage per elite fight per act.

**Why modifier-agnostic:** Blueprint scoring happens before the player knows which modifiers appear. Variation in individual encounters is by design. Derivation (median modifier pair):

- Act 1: ~+10 elite threat → artifact advantage +25, attrition ~4 → net +21 (conservative = **+15**)
- Act 2: ~+30 elite threat → artifact advantage +25, attrition ~12 → net +13 (conservative = **+8**)
- Act 3: ~+110 elite threat → artifact advantage +25, attrition ~44 → net −19 (conservative = **−15**)

---

## 7. Dual-Reward System

Two reward paths coexist without alignment:

| System | Path | Used for |
|---|---|---|
| Threat affinities | `scoreFloor()` → `threatToReward()` | Blueprint scoring, challenge rating, dungeon map |
| goldMult / xpMult | `calculateRewardMultipliers()` → `enemy.eliteGoldMult/xpMult` | Actual combat reward grants |

**Affinities = balance truth.** Calibrate these carefully. **goldMult/xpMult = narrative signals.** The discrepancy is accepted and intentional — do not attempt to align them.
