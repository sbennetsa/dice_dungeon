# NCE Balance Audit

*Audited March 2026. Changes implemented March 2026.*

---

## Design Intent (settled)

NCEs are **flavour with minor upside** — narrative texture between floors, not run-defining events. Dark bargains and major player-advantage events belong in the scheduled floor event system.

- **Structure**: each encounter offers a safe minor reward / gamble for more / walk away. No guaranteed punishments — risk is always probabilistic.
- **Act-scaling**: positive gold and HP rewards scale by act (`×1 / ×1.5 / ×2.5` gold; `×1 / ×1.2 / ×1.5` HP). Negative outcomes never scale.
- **XP**: base values raised to 20–30 range. No act-scaling — the XP threshold grows proportionally so a flat number stays relevant. Target: 2–3 NCEs over a run should contribute roughly one level if the player takes XP options.
- **Gambling**: bad outcomes are probabilistic, never certain. Losing gold or taking HP damage is the downside of a gamble, not a trap.

---

## Economy Reference

| Resource | Act 1 | Act 2 | Act 3 |
|---|---|---|---|
| Gold earned per act | ~180–195g | ~420–465g | ~1300–1690g |
| Threat-equiv per gold | 0.25 | 0.20 | 0.10 |
| Typical XP per act | ~130–180 | ~180–250 | ~200–350 |
| Threat-equiv per XP | 0.15 (flat) | 0.15 | 0.15 |
| Player max HP | 50–55 | 60–70 | 70–80 |
| Rest heal (30% maxHP) | ~15–17 HP | ~19–22 HP | ~22–25 HP |

**Key reference: a die upgrade (+1/+1) costs 50g in the shop = ~12.5 threat-equiv in Act 1, ~10 in Act 2, ~5 in Act 3.**

---

## Structural Changes (implemented)

### Act-scaling in `applyEncounterResult`
Positive deltaGold scales `[×1, ×1.5, ×2.5]` by act. Positive deltaHP scales `[×1, ×1.2, ×1.5]`. Negative outcomes (damage, gold costs) are never scaled. XP is not scaled — level thresholds grow proportionally.

---

## Encounter-by-Encounter Changes

### The Toll Collector (weight 6, Act 1 heavy)

| Choice | Before | After |
|---|---|---|
| Pay the toll | -15g, +1 XP (25:1 loss ratio) | -15g only — safe passage, no XP |
| Bluff (d6) | 50% chance, +3 XP or -8 HP | 50% chance, +20 XP or -8 HP |
| Turn back | +5 XP (inert) | +10g — found a stash in the back route |

---

### The Merchant's Favour (weight 5)

| Choice | Before | After |
|---|---|---|
| Accept the job | +25g (80%) or -15 HP (20%) | unchanged |
| Decline | nothing | unchanged |
| Inspect the crate | -5g bribe, +10 XP or nothing | -5g bribe, +15g or -5g (pure gold gamble — "valuables inside") |

*Inspect reframed from XP to gold to match the new narrative (no more artifact implication).*

---

### The Wounded Soldier (weight 4)

| Choice | Before | After |
|---|---|---|
| Tend to her wounds | -10 HP, +20g | unchanged |
| Ask what she knows | +15 XP | +20 XP |
| Leave her | nothing | unchanged |

---

### The Dice Shark (weight 5)

| Choice | Before | After |
|---|---|---|
| Wager 20g (50/50) | -20g or +35g | unchanged (EV +7.5g) |
| Wager everything | -all gold or +2× gold (EV 0, catastrophic in Act 3) | capped at 100g stake, **2:1 payout** — win +2× stake, lose -stake (EV +50g at cap) |
| Watch | +5 XP (inert) | +20 XP |
| Accuse (d6) | ≥5 to succeed (33%), +15g or -12 HP (EV −3.5 HP) | ≥4 to succeed (50%), +15g or -12 HP (EV neutral) |

*"Wager everything" now has meaningfully better EV than the 20g bet to justify the higher variance.*

---

### The Guild Recruiter (weight 4)

Redesigned from a two-choice transaction (pay or decline) into a three-choice encounter with a free floor.

| Choice | Before | After |
|---|---|---|
| Pay the fee | -30g, +25 XP (bad value) | -30g, +40 XP (decent value) |
| Negotiate | 50/50: -15g +25 XP or nothing | removed — replaced by "Challenge her" |
| Tell her about your fights | — (new) | free, +15 XP — always worth the stop |
| Challenge her (d6) | — | 50/50: free registration +40 XP, or -15g +20 XP penalty |
| Decline | nothing | unchanged |

*Free option ensures the encounter is never a dead stop. Challenge replaces Negotiate with asymmetric risk — potential free registration vs. a small penalty.*

---

### The Forgotten Cache (weight 6)

| Choice | Before | After |
|---|---|---|
| Take everything | +20g +5 XP (85%) or +20g +5 XP -8 HP (15%) | +20g +8 XP (85%) or same -8 HP (15%) |
| Take carefully | +15g +3 XP | +15g +5 XP |
| Leave it | nothing | unchanged |

*XP gap between options widened slightly so the risk/safe choice is more legible.*

---

### The Lucky Coin (weight 8 — most common)

| Choice | Before | After |
|---|---|---|
| Pocket it (50/50) | +15g or +3g | unchanged |
| Leave it | nothing | unchanged |
| Examine it (50/50) | +10 HP +5 XP or +3g (lucky branch was free double-dip) | +10 HP only or +3g |

*Removed XP from examine lucky branch — was strictly better than pocketing for no reason.*

---

### The Collapsed Shrine (weight 5)

No changes. Well-designed: three prayer outcomes are roughly equal value, uncertainty is the interesting element.

---

### The Cartographer's Mistake (weight 4)

| Choice | Before | After |
|---|---|---|
| Follow the map (60/40) | +20 XP or -8 HP | +30 XP or -8 HP |
| Sell the map | +15g | unchanged |
| Leave it | nothing | unchanged |

---

### The Echoing Whisper (weight 3 — rare)

| Choice | Before | After |
|---|---|---|
| Answer it | +20 XP | unchanged |
| Ignore it | nothing or -5 HP (33%) | unchanged |
| Shout back | +10 XP (dominated by Answer) | 50/50 gamble: +30 XP or -10 HP |

*Shout back is now the high-ceiling risky option vs. Answer's safe modest reward.*

---

### The Healer's Camp (weight 5, HP-biased)

| Choice | Before | After |
|---|---|---|
| Full restoration | -25g, heal to full | unchanged |
| Partial treatment | -10g, +20 HP | unchanged |
| Donate blood | -8 HP, +15 XP | -8 HP, +25 XP |

---

### The Bone Altar (weight 3, HP filter)

| Choice | Before | After |
|---|---|---|
| Offer blood (20 HP) | +40 XP (modest for the cost) | +60 XP |
| Offer gold (30g) | +25 XP +10 HP | unchanged |
| Smash it (50/50) | +10 XP or -15 HP (bad EV) | +25 XP or -15 HP |

---

### The Whispering Fungus (weight 4)

| Choice | Before | After |
|---|---|---|
| Eat a sample (random) | +20 HP, +25 XP, -10 HP, +20g, or nothing | unchanged |
| Inhale the spores | +15 XP (inert) | +25 XP |
| Burn it | +5g (trivial) | +15g |

---

### The Mirror Pool (weight 3 — rare)

| Choice | Before | After |
|---|---|---|
| Gaze into it | +30 XP | unchanged |
| Reach in (d6) | +20g (33%), +10 HP (33%), -10 HP (33%) — EV neutral | +25g (33%), +15 HP (33%), -10 HP (33%) — EV slightly positive |
| Drink from it | +15 HP | unchanged |

---

### The Dark Bargain (weight 2 — rare)

Fully redesigned. Original version had run-defining stakes (trade half gold, 25 HP costs) that fit events better than NCEs, and all trade options had poor-to-negative value. Redesigned as small-stakes mysterious trades consistent with NCE scope.

| Choice | Before | After |
|---|---|---|
| Trade half your gold | -50% gold, +50 XP (terrible in Act 3) | removed |
| Trade your blood (25 HP) | -25 HP, +40g (50% starting HP cost) | removed |
| Trade your vitality | -15 HP, +30 XP +15g | removed |
| Trade some luck (new) | — | 50/50 gamble: +20 HP or -20g |
| Trade something small (new) | — | -10 HP, +25 XP |
| Trade some gold (new) | — | -25g, +30 XP |
| Refuse | nothing | unchanged |

*Body text updated: "The exchange is modest. The reasons remain opaque." — theme preserved, stakes appropriate for NCE context.*

---

## Final State Summary

| Encounter | Status |
|---|---|
| Toll Collector | ✅ Fixed |
| Merchant's Favour | ✅ Fixed |
| Wounded Soldier | ✅ Minor bump |
| Dice Shark | ✅ Fixed |
| Guild Recruiter | ✅ Redesigned |
| Forgotten Cache | ✅ Minor bump |
| Lucky Coin | ✅ Fixed |
| Collapsed Shrine | ✅ No changes needed |
| Cartographer's Mistake | ✅ Fixed |
| Echoing Whisper | ✅ Fixed |
| Healer's Camp | ✅ Fixed |
| Bone Altar | ✅ Fixed |
| Whispering Fungus | ✅ Fixed |
| Mirror Pool | ✅ Minor improvement |
| Dark Bargain | ✅ Redesigned |
