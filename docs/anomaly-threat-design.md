# Anomaly Threat Design

**Date:** 2026-03-05
**Status:** Proposed — pending review

---

## Problem

`ANOMALY_THREATS` in `dungeonScoring.js` stores flat threat deltas that are independent of the enemy's strength:

```js
export const ANOMALY_THREATS = {
    perfectStorm:  10,
    wounded:       -8,
    enraged:        8,
    doubleTrouble: 20,
    glitched:       5,
};
```

These values were calibrated by intuition, not from the threat formula. The result is severe act-based miscalibration.

### Concrete failure case — `doubleTrouble`

| Act | Enemy | baseThreat | Old anomaly delta | Old total | % change |
|-----|-------|-----------|-------------------|-----------|----------|
| 1   | Goblin | 17       | +20               | 37        | **+118%** |
| 2   | Orc Warrior | 62  | +20               | 82        | +32%     |
| 3   | Orc Warrior | 219 | +20              | 239       | **+9%** |

The same flat +20 makes `doubleTrouble` wildly over-threat in Act 1 (disrupts budget, forces extreme environment compensation) and nearly invisible in Act 3 (budget barely notices it).

The same distortion exists for every anomaly in both directions.

---

## Threat Formula Background

The bestiary derives enemy threat from:

```
baseThreat = (durability × offense)^P × C + disruption
```

where **P = 0.55** (power exponent).

This means when an anomaly multiplies a stat by factor **F**, the resulting threat is:

```
newThreat = (F·D × O)^P = F^P × (D × O)^P = F^P × baseThreat
```

The threat multiplier is `F^P`, independent of the enemy's absolute strength. A `+25%` offense boost raises threat by the same **percentage** whether the enemy is a Goblin or a Void Lord.

---

## Derived Threat Multipliers

### `wounded` — HP reduced to 70%

**Mechanical effect:** `enemy.hp = Math.floor(enemy.hp * 0.7)` before combat.

- Durability factor: `F = 0.70`
- Threat multiplier: `0.70^0.55 = 0.822`
- **Threat delta: −17.8% of enemy baseThreat**

*Note: wounded only reduces HP, not armor/evasion/sustain passives. The 30% HP cut doesn't reduce full durability by 30% for enemies with passives. 0.822 is a conservative estimate; enemies with heavy sustain benefit slightly less from the wound.*

---

### `enraged` — dice upgraded ~+25%

**Mechanical effect:** `enemy.dice = enemy.dice.map(d => d + Math.max(1, Math.round(d / 4)))`

Avg damage per die is `(sides+1)/2`. Upgrade impact:

| Die | Upgraded | Avg before | Avg after | Offense Δ |
|-----|----------|-----------|-----------|-----------|
| d4  | d5       | 2.5       | 3.0       | +20%      |
| d6  | d8       | 3.5       | 4.5       | +29%      |
| d8  | d10      | 4.5       | 5.5       | +22%      |
| d10 | d13      | 5.5       | 7.0       | +27%      |
| d12 | d15      | 6.5       | 8.0       | +23%      |

Typical enemy dice pools blend these; weighted average offense gain ≈ **+25%**.

- Offense factor: `F = 1.25`
- Threat multiplier: `1.25^0.55 = 1.131`
- **Threat delta: +13.1% of enemy baseThreat**

---

### `doubleTrouble` — enemy acts twice per turn

**Mechanical effect:** `enemy.doubleAction = true` → `Combat.execute()` triggers a second full enemy action.

The enemy's entire offense fires twice per turn; the player's defenses and actions remain unchanged.

- Offense factor: `F = 2.0`
- Threat multiplier: `2.0^0.55 = 1.464`
- **Threat delta: +46.4% of enemy baseThreat**

*Note: this is slightly conservative — `doubleTrouble` also removes the player's opportunity to act in between attacks, which is worth additional threat not captured by the offense-only model. +46% is a principled floor; the true value may be slightly higher.*

---

### `glitched` — one utility ability changes type

**Mechanical effect:** One non-attack ability is randomly reassigned to a different type (attack, heal, buff, poison, or shield).

This cannot be modelled analytically without per-enemy ability knowledge — by design it is enemy-agnostic. Qualitative reasoning:

- P(utility → attack) = 1/4 chance: enemy gains extra offense at cost of a utility
- P(utility → different utility type): minor type-swap, near-neutral
- Average: small positive bias for offense (attack upgrades outweigh utility losses in short combats)
- Practical calibration vs. other anomalies: `glitched` is high variance but lower average threat than `enraged`

**Empirical multiplier: 1.06**
**Threat delta: +6% of enemy baseThreat**

The large `rewardMult: 1.6` (+60% rewards) is intentional player incentive — the combat is unpredictable, not necessarily harder, so extra reward compensates for the risk of an unfamiliar fight pattern.

---

### `perfectStorm` — environment forced to synergy

**Mechanical effect:** `apply()` selects a synergy environment (`healingAura`, `thornsAura`, or `arcaneNexus`) that complements the enemy's abilities.

**No anomaly threat multiplier needed.** The synergy environment's threat is already captured by `envThreat = scoreEnvironmentThreat(floor.environment, enemy, ...)` in `scoreFloor()`. Adding an anomaly delta on top would double-count.

The anomaly's value is the *guarantee* of a positive environment rather than the budget-steered default, but:
- The environment is always selected after accounting for budget gap
- Budget steering already biases toward positive envs when threat is low and negative when high
- The forced synergy adds marginal extra threat over what the budget system would have selected anyway

**Anomaly threat multiplier: 1.000 (neutral — no change to enemy baseThreat)**

---

## Summary Table

| Anomaly | Old flat delta | New formula | Mult | % delta |
|---------|---------------|-------------|------|---------|
| `wounded` | −8 | `Math.round(enemyThreat × (0.822 − 1))` | 0.822 | −17.8% |
| `enraged` | +8 | `Math.round(enemyThreat × (1.131 − 1))` | 1.131 | +13.1% |
| `doubleTrouble` | +20 | `Math.round(enemyThreat × (1.464 − 1))` | 1.464 | +46.4% |
| `glitched` | +5 | `Math.round(enemyThreat × (1.060 − 1))` | 1.060 | +6.0% |
| `perfectStorm` | +10 | `0` | 1.000 | 0% |

---

## Act-by-Act Comparison

Using representative baseThreat values (Goblin 17, Orc Warrior 62/219):

### `wounded`
| Act | baseThreat | Old delta | New delta |
|-----|-----------|-----------|-----------|
| 1   | 17        | −8 (−47%) | **−3 (−18%)** |
| 2   | 62        | −8 (−13%) | **−11 (−18%)** |
| 3   | 219       | −8 (−4%)  | **−39 (−18%)** |

### `enraged`
| Act | baseThreat | Old delta | New delta |
|-----|-----------|-----------|-----------|
| 1   | 17        | +8 (+47%) | **+2 (+13%)** |
| 2   | 62        | +8 (+13%) | **+8 (+13%)** |
| 3   | 219       | +8 (+4%)  | **+29 (+13%)** |

### `doubleTrouble`
| Act | baseThreat | Old delta | New delta |
|-----|-----------|-----------|-----------|
| 1   | 17        | +20 (+118%) | **+8 (+46%)** |
| 2   | 62        | +20 (+32%)  | **+29 (+46%)** |
| 3   | 219       | +20 (+9%)   | **+101 (+46%)** |

### `glitched`
| Act | baseThreat | Old delta | New delta |
|-----|-----------|-----------|-----------|
| 1   | 17        | +5 (+29%) | **+1 (+6%)** |
| 2   | 62        | +5 (+8%)  | **+4 (+6%)** |
| 3   | 219       | +5 (+2%)  | **+13 (+6%)** |

---

## Reward Multiplier Note

`rewardMult` values in `ANOMALIES` are **not** calibrated to the threat multiplier — they are **player incentive values** designed to make risky encounters feel rewarding. They are intentionally higher than the threat multiplier to encourage engagement.

| Anomaly | threatMult | rewardMult | Incentive premium |
|---------|-----------|-----------|------------------|
| wounded | 0.822 | 0.80 | close (−2%)     |
| enraged | 1.131 | 1.40 | +24%            |
| doubleTrouble | 1.464 | 2.00 | +37%       |
| glitched | 1.060 | 1.60 | +51%           |
| perfectStorm | 1.000 | 1.50 | N/A (env-based) |

These are not changed by this proposal.

---

## Code Changes Required

### `js/encounters/dungeonScoring.js`

Replace:
```js
export const ANOMALY_THREATS = {
    perfectStorm:  10,
    wounded:       -8,
    enraged:        8,
    doubleTrouble: 20,
    glitched:       5,
};
```

With:
```js
// Threat multipliers derived from the baseThreat formula (D×O)^0.55.
// anomalyThreat = Math.round(enemyThreat × (mult − 1))
// perfectStorm has no enemy-side mult (its threat is fully captured by envThreat).
export const ANOMALY_THREAT_MULTS = {
    perfectStorm:  1.000,   // env system handles it
    wounded:       0.822,   // 0.70^0.55 — HP reduced to 70%
    enraged:       1.131,   // 1.25^0.55 — dice +~25%
    doubleTrouble: 1.464,   // 2.00^0.55 — acts twice
    glitched:      1.060,   // empirical — one ability type-swap, small positive bias
};
```

In `scoreFloor()` and `scoreFloorDetailed()`, replace:
```js
const anomalyThreat = floor.anomaly
    ? (ANOMALY_THREATS[floor.anomaly.id] || 0)
    : 0;
const baseThreat = enemyThreat + envThreat + anomalyThreat;
```

With:
```js
const anomalyMult = floor.anomaly
    ? (ANOMALY_THREAT_MULTS[floor.anomaly.id] ?? 1.0)
    : 1.0;
const anomalyThreat = Math.round(enemyThreat * (anomalyMult - 1));
const baseThreat = enemyThreat + envThreat + anomalyThreat;
```

### `js/encounters/dungeonBlueprint.js` — `generateCombatFloor()`

Replace:
```js
const anomalyThreat = anomaly ? (ANOMALY_THREATS[anomaly.id] || 0) : 0;
const currentThreat = baseThreat + anomalyThreat;
```

With:
```js
const anomalyMult = anomaly ? (ANOMALY_THREAT_MULTS[anomaly.id] ?? 1.0) : 1.0;
const anomalyThreat = Math.round(baseThreat * (anomalyMult - 1));
const currentThreat = baseThreat + anomalyThreat;
```

Import `ANOMALY_THREAT_MULTS` from `dungeonScoring.js` instead of `ANOMALY_THREATS`.

---

## Summary of Design Principles

1. **Proportional, not additive.** Anomaly threat is a percentage of enemy base threat, not a flat number. This ensures consistent relative challenge regardless of act.
2. **Formula-derived, not tuned.** Multipliers come from `F^0.55` applied to the stat factor each anomaly changes. Only `glitched` uses an empirical value (its effect is stochastic by design).
3. **Environment stays separate.** `perfectStorm` delegates entirely to the `envThreat` component, avoiding double-counting.
4. **Reward multipliers are decoupled.** `rewardMult` in `ANOMALIES` is an incentive value, not a threat measure. It stays unchanged.
