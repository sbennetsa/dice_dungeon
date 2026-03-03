# Change Request: Rune & Face Mod Rework

> **Applies to:** dice-dungeon-enemy-spec.md and dice-dungeon-design-spec.md
> **Scope:** Replaces the three-layer system (rune + whole-die mod + face mod) with a cleaner two-layer system.

---

## Summary

Each die has two mod layers:

1. **Rune** — always active, defines what the die *does* every roll. One per die (default), Tall capstone allows up to 3 on one die.
2. **Face mod** — placed on a single face, powerful effect that only triggers when that face is rolled. One per die.

---

## Layer 1: Runes (Die Identity)

Runes are always active. They define the die's role. One rune per die unless the Tall capstone (Runeforger) is unlocked, which allows up to 3 runes on a single die.

| Rune | Slot | Effect |
|------|------|--------|
| Amplifier | Either | ×2 all output from this die |
| Titan's Blow | Either | ×3 output if this die is alone in its slot |
| Poison Core | Attack | Every roll applies poison equal to die value |
| Gold Core | Either | Every roll generates gold equal to die value (replaces normal damage/block) |
| Siphon | Attack | This die's damage also heals player 100% |
| Mirror | Defend | This die's block is also dealt as damage to enemy |
| Leaden | Defend | ×2 block but this die cannot be rerolled |
| Steadfast | Defend | Block from this die cannot be reduced by enemy effects |
| Splinter | Attack | This die's value is split equally and added to every OTHER die in the slot |

**Archetype alignment:**
- Splinter is useless for Tall (no other dice in slot to split to)
- Titan's Blow is useless for Wide (never have a die alone)
- Runes self-select by build without needing restrictions

**Acquisition:** Skill tree (Amplify node gives free Amplifier), shops (60-80g), rest stop Engrave option, elite/boss rewards.

---

## Layer 2: Face Mods (Single-Face Spikes)

Face mods go on ONE face of a die. They only trigger when that specific face is rolled. Because they're unreliable, they can be very powerful. One face mod per die.

| Face Mod | Effect on trigger |
|----------|-------------------|
| Executioner | Permanently ×5 a face's value (no mod slot used) |
| Freeze Strike | Freeze enemy (skip next attack) |
| Jackpot | Gain 50 gold |
| Vampiric Strike | ×3 value + heal full amount |
| Chain Lightning | This die's value hits twice |
| Critical | This die's value added to ALL slots (attack and defend) |
| Poison Burst | Apply poison equal to ×3 die value |
| Shield Bash | Block from this die is also dealt as damage |

**Tall loves face mods** because they have rerolls to chase the right face. Wide doesn't care much — any single die is a small part of total output.

**Acquisition:** Shops (25-35g), events, combat drops. More available than runes.

---

## Skill Tree Change

Replace Tall capstone:

**Old:** `t5: Titan's Wrath — Single-die slots deal ×3`

**New:** `t5: Runeforger — Your dice can hold up to 3 runes each`

This is the Tall build's defining power. Stack Amplifier + Titan's Blow + Siphon on one mega-die. Completely useless to Wide (they'd rather spread runes across many dice).

Rest of skill tree unchanged. The Amplify node (t4) still gives a free Amplifier rune.

---

## Interaction: Rune Stacking Rules

With Runeforger capstone, multiple runes on one die stack multiplicatively for multipliers:

- Amplifier (×2) + Titan's Blow (×3, if alone) = ×6
- Amplifier (×2) + Siphon = ×2 damage AND heal for the full doubled amount
- Titan's Blow + Amplifier + Siphon (alone in slot) = ×6 damage, heal full amount

Non-multiplier runes just add their effects:
- Poison Core + Amplifier = apply poison equal to ×2 die value
- Gold Core + Amplifier = generate gold equal to ×2 die value

---

## Economy Rebalance

| Resource | Cost | Availability per run |
|----------|------|---------------------|
| Runes | 60-80g (shop), free (skill tree, some rewards) | 2-4 total |
| Face mods | 25-35g (shop), free (events, drops) | 4-6 total |

Wide spends on more dice + spread runes. Tall spends on die upgrades + stacking runes + the perfect face mod. Different shopping patterns from the same shops.

---

## Implementation Notes

- Die object: `{ ..., rune: null, faceMod: null }` → changes to `{ ..., runes: [], faceMod: { faceIndex: N, mod: {...} } }`
- Default max runes per die = 1. Runeforger capstone sets max to 3.
- During damage/block calc: iterate `die.runes`, apply each. Multipliers multiply together.
- Face mod: after rolling, check if `rolledValue === die.faceValues[faceMod.faceIndex]`, if so trigger effect.
- Face mod trigger check should happen AFTER rune multipliers are applied (runes scale the base, face mod triggers on top).
