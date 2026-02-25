## Rest Stop Transformation System — Design Specification

---

### Overview

Rest stops occur after Act 1 boss (floor 5) and Act 2 boss (floor 10). Each rest stop offers two tiers:

**Maintenance tier:** Player can do one of these (same as current)
- Heal 30% max HP
- Upgrade a die +1/+1
- Trim a face from a die
- Forge merge two dice (if unlocked)

**Transformation tier:** Player chooses one of three paths. Each is irreversible. Player may skip the transformation entirely. This choice is presented BEFORE the maintenance tier so the player makes the big decision first, then patches up after.

---

### Path 1: Expand

Gain +1 attack or +1 defend slot.

**Sub-choice:** Player picks attack or defend.

**Constraints:** Maximum 6 attack slots, maximum 6 defend slots. If already at cap for one type, that option is greyed out.

**Display:** Show current slot counts and effective slots (minus runes) so the player can evaluate.

---

### Path 2: Sacrifice

Destroy a slot permanently in exchange for a powerful enhancement applied to your remaining slots or build.

**Constraints:** Cannot sacrifice below 1 attack slot and 1 defend slot. If at minimum for a type, those slots are not available to sacrifice.

**Sub-choice flow:** Pick attack or defend slot to sacrifice → choose an enhancement from the list below.

**Attack slot sacrifice enhancements:**

| Enhancement | Effect |
|-------------|--------|
| **Fury Chamber** | All remaining attack slots deal ×1.5 damage |
| **Conduit** | All dice allocated to attack apply 3 poison |
| **Gold Forge** | All dice allocated to attack also generate gold equal to their face value |

**Defend slot sacrifice enhancements:**

| Enhancement | Effect |
|-------------|--------|
| **Fortification** | All remaining defend slots block ×1.5 |
| **Thorns Aura** | Whenever you take damage, deal 5 back to the enemy |
| **Vampiric Ward** | All block also heals you for 25% of the amount blocked |

**Stacking:** Sacrificing multiple slots across the two rest stops stacks multiplicatively for Fury Chamber and Fortification (×1.5 × ×1.5 = ×2.25). Other enhancements stack additively (two Conduits = 6 poison per die, two Thorns Auras = 10 reflect damage).

**Display:** Show current slot counts, which slots are available to sacrifice, and preview the enhancement effect with actual numbers based on current build state. E.g. "Fury Chamber: Your 2 remaining attack slots will deal ×1.5 damage (currently averaging 18 → 27 per slot)."

---

### Path 3: Transform

Fundamentally alter one of your dice. The die is permanently changed.

**Sub-choice flow:** Pick a transformation type → pick which die to apply it to.

**Transformations:**

| Transformation | Effect | Best For |
|----------------|--------|----------|
| **Infuse** | Choose one face value on the die. That face is now guaranteed — whenever this die is rolled, if it would roll lower than the infused value, it rolls the infused value instead. Effectively sets a floor equal to the chosen face | Tall builds wanting consistency. Infuse the highest face on a trimmed die for a guaranteed big hit |
| **Fracture** | Destroy the die. Create two new dice, each with half the face count (round up) and half the range. A d6 [1-6] becomes two d3 [1-3]. A d8 [3-10] becomes two d4 [3-6]. Face mods on the original die are lost | Wide builds wanting more bodies. Trade quality for quantity |
| **Ascend** | Remove the die from your rollable pool. It becomes a permanent passive aura. Each turn it automatically adds half its average value (rounded up) to every attack slot AND every defend slot. A d6 averaging 3.5 becomes +2 to all slots. A d10 averaging 7.5 becomes +4 to all slots. The die no longer rolls, cannot be upgraded, and does not count toward die total | Builds that want guaranteed value. Fewer dice to roll but consistent passive bonus every turn |
| **Corrupt** | Double every face value on the die. A d6 [1,2,3,4,5,6] becomes [2,4,6,8,10,12]. Face mods are preserved and trigger on the new doubled values. However, every turn you roll this die, take 3 damage | Risk/reward. Massive power spike with a health cost. Pairs with regen and lifesteal |

**Constraints:**
- Infuse: Die must have at least 4 faces (can't infuse a d3)
- Fracture: Die must have at least 4 faces. Resulting dice must each have at least 3 faces
- Ascend: Player must have at least 3 dice remaining after ascending. Cannot ascend if you'd drop below 2 rollable dice
- Corrupt: A die can only be corrupted once. Already corrupted dice show a visual indicator and are not eligible

**Fracture detail:** The two resulting dice split the original's face values. Sort the face values, odd-indexed values go to die A, even-indexed go to die B. Example: d6 [1,2,3,4,5,6] → die A [1,3,5] die B [2,4,6]. This preserves some of the range distribution rather than just halving everything.

**Ascend detail:** The aura die should appear in a separate display area (not the dice pool, not the auto-fire tray). Show it greyed out with its contribution: "🌟 Ascended d8: +4 to all slots." The value is calculated once at ascension and doesn't change. If the aura die had face mods, they are lost — only the raw average value matters.

**Corrupt detail:** The corrupted die gets a visual indicator — red glow, different border colour. The 3 damage per turn is taken at the start of each turn during combat, before rolling. It should log: "💀 Corruption: -3 HP." The damage cannot be blocked or reduced. Multiple corrupted dice stack (two corrupted = 6 damage per turn).

---

### Display and Flow

**Rest stop screen layout:**

```
Act Complete — Rest & Prepare
━━━━━━━━━━━━━━━━━━━━━━━━━━━━

⚡ FORGE YOUR PATH (choose one)
┌─────────────┐ ┌─────────────┐ ┌─────────────┐
│  ➕ Expand   │ │  🔥 Sacrifice│ │  ✨ Transform│
│  +1 Slot     │ │  Trade slot  │ │  Alter a die │
│              │ │  for power   │ │  permanently │
└─────────────┘ └─────────────┘ └─────────────┘

         [ Skip transformation ]

━━━━━━━━━━━━━━━━━━━━━━━━━━━━

🔧 MAINTENANCE (choose one)
┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐
│ ❤️ Heal  │ │ ⬆️ Train │ │ ✂️ Trim  │ │ 🔥 Merge│
└─────────┘ └─────────┘ └─────────┘ └─────────┘

         [ Continue → ]
```

Each transformation card should expand into its sub-choices when clicked. Back buttons return to the main three options.

When showing die selection for Transform, use the visual face strip (renderFaceStrip) so the player can see exactly what they're altering.

For Sacrifice, show a preview of the enhancement's impact on current stats before confirming.

**Continue button** only appears after the player has either chosen a transformation + maintenance, or explicitly skipped the transformation and chosen maintenance.

---

### Balance Notes

The transformation system creates exponential power when combined with other systems. Key interactions to be aware of:

- Fury Chamber ×1.5 stacks with rune multipliers and Titan's Wrath. A single attack slot with ×1.5 from Fury Chamber, ×2 from Amplifier rune, and ×3 from Titan's Wrath = ×9. A corrupted d6 rolling 12 in that slot deals 108 damage. This is intended as the ceiling for hyper-committed Tall builds
- Ascended dice provide flat additions to slots but these are small (2-4 per slot) and come at the cost of losing a rollable die. The passive value is intentionally modest
- Fracture into Sacrifice creates an interesting sequence: fracture a big die into two small dice, then sacrifice one of the small dice for slots via the existing dice-for-slots system. This is valid emergent strategy, not an exploit
- Corrupt pairs dangerously with Berserker's Mask (also costs survivability). Players stacking both are choosing maximum offense with minimum safety. The counter-pick enemies will punish this hard

---

### Rest Stop 1 vs Rest Stop 2

Both rest stops offer the same transformation options. However the value of each changes:

**After Act 1 (rest stop 1):** Player has 3-4 dice, 3-3 slots, early build. Expand is the safe choice. Transform is risky because dice aren't upgraded yet (corrupting a d6 gives you a 2-12 die, good but not amazing). Sacrifice is rarely worth it this early — you don't have enough slots to spare.

**After Act 2 (rest stop 2):** Player has 5-7 dice, 4-5 slots, mature build. All three options are viable. Corrupting an upgraded d10 gives you a 2-20 die. Sacrificing a slot when you have 5 attack slots is much less painful. This is where the big build-defining transformation happens.