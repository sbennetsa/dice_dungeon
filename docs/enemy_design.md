## Dice Dungeon — Enemy Design Specification

---

### Enemy Data Structure

Each enemy needs:
```
{
  name, hp, atk, gold,
  abilities: [
    {
      name,
      type: 'passive' | 'active' | 'trigger',
      trigger: 'everyTurn' | 'everyNTurns' | 'onHpPercent' | 'firstTurn',
      cooldown,
      threshold,
      effect,
      value,
      duration,
      description
    }
  ],
  intent: { type, value, description }
}
```

The intent system already exists — it needs to expand to show ability-specific intents like "🔥 Winding up..." or "🟢 Releasing spores" instead of just flat attack numbers.

---

### New Player Debuff System

These are temporary effects applied to the player during combat, cleared when combat ends:

- **Poison (on player):** Take X damage at start of turn, lasts N turns
- **Slot disable:** A specific attack slot is unusable for N turns. Dice in it are returned to pool
- **Dice value reduction:** All dice roll results reduced by X (min 1) for the fight
- **Unblockable damage:** Damage that bypasses defense entirely, shown separately in the log
- **Overkill reflection:** Excess damage beyond enemy's remaining HP is dealt back to player

---

### Act 1 Enemies

The player has: 3×d6, 2 atk / 2 def slots, no mods, no passives. Max single die value is 6. Average 2-dice attack is 7.

Floor 1 should always be a Goblin. Floor 2 draws from the rest. Slime and Fungal Creep are better as later Act 1 encounters (post-shop or pre-boss).

| Enemy | HP | ATK | Gold | Abilities |
|-------|-----|-----|------|-----------|
| **Goblin** | 20 | 5 | 20 | None — vanilla enemy |
| **Dire Rat** | 14 | 4 | 18 | **Frenzy (passive):** Attacks twice per turn (4+4). Intent shows "⚔️⚔️ Strikes twice for 4" |
| **Fungal Creep** | 22 | 3 | 22 | **Spore Cloud (every 2 turns):** Instead of attacking, applies 2 poison/turn for 3 turns to the player. Intent alternates between "⚔️ Attacks for 3" and "🟢 Releasing spores" |
| **Slime** | 28 | 3 | 25 | **Mitosis (trigger: turn 3):** Transforms into "Slimeling Swarm" with 20 HP and 6 ATK. Same single enemy, new name and stats. Intent shows countdown: "⏳ Splitting in 2..." / "⏳ Splitting in 1..." on turns 1 and 2. If killed before turn 3, no split |
| **Skeleton** | 18 | 6 | 20 | **Brittle (passive):** Takes +3 bonus damage from every source of damage. Display this on the enemy panel permanently: "💀 Brittle: +3 damage taken" |

---

### Act 2 Enemies

The player has: 4-5 dice (some upgraded), 3-4 slots, 1-2 artifacts, face mods, a build direction.

| Enemy | HP | ATK | Gold | Abilities |
|-------|-----|-----|------|-----------|
| **Orc Warrior** | 45 | 11 | 25 | **War Cry (every 3 turns):** Next attack deals double damage. The turn before the double hit, intent shows "🔥 Winding up..." — the following turn shows "🔥 War Cry! Attacks for 22". Normal turns show standard attack intent |
| **Dark Mage** | 32 | 8 | 30 | **Curse (every 3 turns):** Disables the player's attack slot containing the most dice for 2 turns. Dice in the disabled slot return to pool. Intent shows "🟣 Casting Curse..." the turn it fires. **Penetration (passive):** All Dark Mage attacks ignore 3 points of block |
| **Troll** | 55 | 9 | 28 | **Thick Hide (passive):** Any single source of damage below 10 is completely ignored (reduced to 0). Display on enemy panel: "🛡️ Thick Hide: Ignores hits below 10". **Regenerate (passive):** Heals 3 HP at the start of each turn. Log the heal |
| **Vampire** | 38 | 12 | 35 | **Lifesteal (passive):** Heals for 50% of damage dealt to the player (after block). Log the heal. **Blood Frenzy (trigger: below 20% HP):** Attacks twice per turn for the rest of the fight. When triggered, log "🩸 Blood Frenzy!" and update intent to show double attack |
| **Mimic** | 35 | 10 | 30 | **Surprise (trigger: first turn):** Player does not get a roll phase on turn 1. Enemy immediately attacks and steals 15 gold. Log "💰 The Mimic strikes first! -15 gold". **Greed Tax (passive):** Gains +1 ATK for every 50 gold the player is currently holding. Recalculated each turn. Display current bonus on enemy panel |

---

### Act 3 Enemies

The player has: 5-7 dice (heavily upgraded), 5-6 slots, 3-4 artifacts, capstone passives, full build.

| Enemy | HP | ATK | Gold | Abilities |
|-------|-----|-----|------|-----------|
| **Demon** | 75 | 17 | 45 | **Hellfire (passive):** Deals 5 unblockable damage to the player every turn in addition to its normal attack. Log separately: "🔥 Hellfire: 5 unblockable damage". **Soul Pact (passive):** If the player deals more damage than the Demon's remaining HP, excess damage is reflected back to the player. Log: "👹 Soul Pact: X reflected damage" |
| **Lich** | 65 | 14 | 50 | **Decay Aura (passive, entire fight):** All player dice values are reduced by 1 after rolling (min 1). This modifies the actual rolled value before allocation. Display on enemy panel: "💀 Decay Aura: All dice -1". **Phylactery (trigger: first death):** When HP reaches 0 the first time, revive at 40% HP (26 HP). Log "💀 The Phylactery pulses... The Lich reforms!" — second kill is permanent |
| **Dragon Whelp** | 85 | 16 | 55 | **Scales (passive):** The first 8 damage from each slot is ignored each turn. Only damage above 8 per slot counts. If attack slot total is 12, only 4 gets through. Display: "🐉 Scales: First 8 damage per slot ignored". **Breath (every 4 turns):** Charges for 1 turn (intent: "🔥 Inhaling..."), then hits for 30 damage on the next turn (intent: "🔥 Dragon Breath! 30 damage") |
| **Shadow Assassin** | 45 | 22 | 50 | **Evasion (passive):** Each turn, one random die allocated to attack has its value negated (set to 0 for damage calculation, visually show as "dodged"). Log "💨 Shadow dodges [die value]!". **Expose (passive):** For each empty attack slot (slots with no dice allocated), enemy deals +5 damage. Display current bonus on intent |
| **Iron Golem** | 100 | 12 | 55 | **Armor Plating (passive):** Reduces ALL damage from all sources by 5 (min 0). This includes poison ticks. Display: "🛡️ Armor: -5 all damage". **Overcharge (trigger: 25+ damage in one turn):** If player deals 25 or more total damage in a single turn (after armor), Golem is stunned and skips its next attack. Log "⚡ Overcharged! The Golem staggers!". **Escalate (passive):** Gains +2 ATK every 2 turns |

---

### Boss Adjustments

Bosses already exist but their mechanics should align with this system.

**The Bone King (Floor 5, 85 HP, 9 ATK):**
- Turn pattern cycles: Strike → Strike → **Bone Wall** (gains 15 shield that absorbs damage before HP) → **Raise Dead** (ATK permanently increases by 3, representing summoned skeleton — no separate targeting needed) → repeat
- Intent telegraphs each action one turn ahead
- Enrages every 3 turns as existing

**Crimson Wyrm (Floor 10, 250 HP, 18 ATK):**
- Turn pattern: Strike → **Fire Breath** (18 damage + applies 3 burn/turn for 3 turns to player) → Strike → **Wing Buffet** (10 damage + disables 1 random attack slot for 1 turn) → repeat
- **Phase 2 (below 50% HP):** ATK permanently +5. All attacks also apply 2 burn/turn for 2 turns. Log "🔥 The Wyrm erupts in flame!"
- Enrages every 3 turns as existing

**The Void Lord (Floor 15, 450 HP, 25 ATK):**
- **Phase 1 (above 50%):** Strike → **Void Rift** (disables 1 random slot for 2 turns) → **Dark Pulse** (15 unblockable damage) → Strike → repeat
- **Phase 2 (50-20%):** ATK +8. Adds **Entropy** — each turn, one random player die has its max face value reduced by 1 permanently (the die's faceValues array loses its highest value, minimum 3 faces). Log "🌀 Entropy consumes your [die]!"
- **Phase 3 (below 20%):** Attacks twice per turn but takes +50% damage from all sources. Log "💀 The Void Lord is desperate!"
- Enrages every 3 turns as existing, stacks with phase bonuses

---

### Encounter Selection Logic

**Act 1 floors:**
- Floor 1: Always Goblin
- Floor 2: Random from [Dire Rat, Skeleton]
- Floors after shop/event if fighting Act 1 enemies: Random from [Fungal Creep, Slime, Dire Rat, Skeleton]

**Act 2 and 3:** Random selection from the full pool for that act. No weighting, pure random. The counter-pick variance is intentional.

---

### Elite Modifiers

Existing elite prefixes (Deadly, Armored, Swift, Enraged) apply on top of enemy abilities. No changes needed. An Enraged Vampire (2× ATK multiplier bringing it to 24 ATK with lifesteal) or an Armored Iron Golem (180 HP with existing armor plating) are intended to be potential run-enders. 

---

### Scaling

Keep the existing `Math.pow(1.04, floor - 1)` exponential scaling applied to base HP, ATK, and gold. Enemy abilities use fixed values (not scaled) — the Troll's 10-damage threshold doesn't scale, the Golem's 5 armor doesn't scale. This means the abilities become relatively easier to deal with at higher player power, which is correct — the raw stats provide the pressure, the abilities provide the puzzle.

---

### Display Requirements

- Enemy panel should show passive abilities as permanent tags below the HP bar (e.g. "💀 Brittle: +3 damage taken", "🛡️ Thick Hide: Ignores hits below 10")
- Intent area expands to show ability-specific text and icons, not just "Attacks for X"
- Charging/countdown abilities show the countdown in intent ("⏳ Splitting in 2...")
- Phase transitions get a log message and visual flash on the enemy panel
- Burn/poison on the player should display as a debuff indicator near the HP bar, similar to how enemy poison already works