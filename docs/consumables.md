## Consumable System — Implementation Specification

---

### Core System

**Inventory:** 2 slots stored as `GS.consumableSlots = 2` and `GS.consumables = []` array capped at that value.

**Categories:** Three types — Potions (reactive, player-focused), Scrolls (proactive, enemy-focused), Charms (automatic trigger).

**One consumable per turn limit.** Player cannot stack multiple consumables in a single turn.

**Consumable data structure:**
```
{
  id,
  name,
  icon,
  category: 'potion' | 'scroll' | 'charm',
  rarity: 'common' | 'uncommon' | 'rare',
  price,
  description,
  trigger: null | { condition, threshold },
  usableOutsideCombat: boolean,
  usableOnBoss: boolean,
  effect: { type, value, duration }
}
```

---

### Consumable List

#### Potions

| ID | Name | Icon | Rarity | Price | Effect | Outside Combat | On Boss |
|----|------|------|--------|-------|--------|----------------|---------|
| `hp1` | Healing Potion | ❤️ | Common | 10g | Restore 20 HP | Yes | Yes |
| `hp2` | Greater Healing Potion | ❤️‍🔥 | Uncommon | 20g | Restore 40 HP | Yes | Yes |
| `iron` | Iron Skin Potion | 🛡️ | Rare | 20g | Completely block the next enemy attack this combat (100% damage reduction) | No | Yes |
| `cleanse` | Cleansing Tonic | ✨ | Uncommon | 15g | Remove all temporary debuffs from player: poison, burn, slot disable, temporary dice reduction. Does NOT remove permanent fight-long auras (Lich Decay) | No | Yes |
| `rage` | Rage Potion | 😤 | Rare | 25g | Total attack damage this turn is doubled. Applied as final multiplier after all runes and slot calculations. Must use before executing turn | No | Yes |
| `haste` | Haste Elixir | ⚡ | Uncommon | 20g | Gain 2 extra rerolls this turn. All dice values gain +1 for this turn only | No | Yes |

#### Scrolls

| ID | Name | Icon | Rarity | Price | Effect | Outside Combat | On Boss |
|----|------|------|--------|-------|--------|----------------|---------|
| `frost` | Frost Bomb | 🧊 | Rare | 25g | Apply 6 chill to enemy and freeze for 1 turn (enemy skips next attack) | No | Yes |
| `venom` | Venom Flask | 🧪 | Common | 15g | Apply 8 poison to enemy immediately | No | Yes |
| `fire` | Fire Scroll | 🔥 | Uncommon | 20g | Deal 15 damage to enemy and apply 4 burn per turn for 3 turns | No | Yes |
| `mark` | Scroll of Marking | 🎯 | Uncommon | 15g | Apply 8 mark to enemy for 3 turns (enemy takes +8 damage from all sources) | No | Yes |
| `weaken` | Scroll of Weakening | 💔 | Uncommon | 20g | Apply weaken to enemy for 3 turns (enemy deals 25% less damage) | No | Yes |
| `insight` | Scroll of Insight | 👁️ | Common | 10g | Reveal the next 3 floor types and which enemies will appear. Information persists on the floor progress bar | Yes | N/A |

#### Charms

| ID | Name | Icon | Rarity | Price | Effect | Trigger Condition |
|----|------|------|--------|-------|--------|-------------------|
| `ward` | Death Ward | 💀 | Rare | 25g | Prevent lethal damage. Set HP to 1 instead of dying | Player HP would reach 0 |
| `retrib` | Retribution Charm | ⚡ | Uncommon | 20g | Deal 20 damage to enemy and stun for 1 turn | Player takes 15+ damage in a single hit (after block) |
| `lucky` | Lucky Charm | 🍀 | Common | 15g | Reroll your lowest rolled die to match your highest rolled die's value | After rolling, lowest die shows 1 or 2 |
| `smoke` | Escape Smoke | 💨 | Uncommon | 15g | Flee combat. No rewards, no gold, no penalty except lost progress on that floor. Move to next floor | Player HP drops below 20%. NOT usable on bosses — greyed out during boss fights |

**Total: 16 consumables** — 6 potions, 6 scrolls, 4 charms.

---

### Rarity Weights

| Rarity | Drop Weight | Consumables |
|--------|------------|-------------|
| Common (40%) | Healing Potion, Venom Flask, Scroll of Insight, Lucky Charm |
| Uncommon (35%) | Greater Healing Potion, Cleansing Tonic, Haste Elixir, Fire Scroll, Scroll of Marking, Scroll of Weakening, Escape Smoke, Retribution Charm |
| Rare (25%) | Iron Skin Potion, Rage Potion, Frost Bomb, Death Ward |

---

### Usage Rules

**Potions and Scrolls:**
- Player clicks consumable slot during their combat turn
- Usable before rolling, after rolling, or before executing — any point during the player's turn
- Confirmation overlay: "Use [name]? [effect] — This cannot be undone" with Confirm / Cancel
- After use, slot empties. Combat log: "[icon] Used [name]: [effect]"
- One consumable per turn maximum. After using one, the other slot is greyed out for that turn

**Charms:**
- Cannot be clicked manually. Slot shows no interaction cursor
- Trigger is checked automatically at the relevant moment each turn
- When triggered: slot flashes with animation, combat log shows "[icon] [name] triggered! [effect]"
- Charm is consumed after triggering

**Charm trigger timing:**
- Death Ward: checked when player would take lethal damage, before death screen
- Retribution Charm: checked after enemy attack resolves and damage is calculated
- Lucky Charm: checked immediately after all dice are rolled, before allocation phase
- Escape Smoke: checked after enemy attack resolves and HP is updated

---

### Display

**Combat screen — next to HP bar:**
```
[HP BAR ████████░░░ 65/80]  [❤️] [🧊]
```
- Two square slots to the right of the HP bar, above the dice tray
- Show consumable icon in each slot. Empty slots show dashed border with faint "+" icon
- Hover/tap shows tooltip: name, category tag, full effect description
- Potions/Scrolls glow subtly during player turn to indicate usability
- Charms show no glow (not manually usable)
- When charm trigger condition is close (e.g. HP below 30% for Escape Smoke at 20% threshold), charm slot pulses gently as a visual hint
- After use or trigger, slot empties with a dissolve animation

**Build tab — consumable section:**
- New section in Build overlay between stats and dice sections
- Header: "🧴 SUPPLIES (X/2)"
- Shows both slots with icon, name, category tag (coloured: Potion red, Scroll blue, Charm purple), and effect description
- Empty slots shown as "Empty slot"

**Market tab — inline inventory:**
- Current consumable inventory shown at top of Market view:
```
Your supplies: [❤️ Healing Potion] [empty]
```
- Below that, purchasable consumable cards in a card grid
- Each card shows: icon, name, category tag, rarity indicator, effect description, price
- If inventory is full when buying, swap screen appears: "Replace which item?" showing current 2 items and new item as 3 cards. Player clicks one of the current items to discard, or clicks Cancel

---

### Acquisition Sources

**Shop Market tab:**
- 4-5 consumables per visit
- At least 1 common, at least 1 uncommon, rest rolled from weighted pool
- Refresh: 10g flat, rerolls market stock only (separate from Forge refresh)

**Combat drops:**
- 20% chance after any non-boss enemy defeat
- Rolls from common pool only: Healing Potion, Venom Flask, Scroll of Insight, Lucky Charm
- If inventory full, prompt swap or discard
- Log: "The enemy dropped a [icon] [name]!"

**Events:**
- Some event choices include a consumable as part of the reward
- One event option per act can be "choose 1 of 3 consumables" drawing from full weighted pool

**Rest stops:**
- After transformation and maintenance choices, offer a free consumable pick
- Show 3 random consumables from full weighted pool
- Player picks one or skips
- If inventory full, prompt swap
- Display: "🧴 Take a supply — choose one:" with 3 consumable cards

---

### Key Interactions

| Interaction | Ruling |
|-------------|--------|
| Rage Potion + runes + face mods | Rage Potion doubles total attack damage as the FINAL multiplier after all other calculations |
| Frost Bomb + Frozen Heart artifact | Frost Bomb's 6 chill counts toward Frozen Heart's threshold. If player has Frozen Heart, Frost Bomb guarantees a freeze (which it already does, but the chill stacks remain for future Frozen Heart triggers if enemy survives) |
| Death Ward + Demon Soul Pact | Soul Pact reflection that would kill triggers Death Ward. Player survives at 1 HP |
| Cleansing Tonic + Lich Decay Aura | Tonic does NOT remove Decay Aura. Decay is a permanent fight aura, not a debuff |
| Escape Smoke + bosses | Cannot trigger during boss fights. Slot appears greyed out with tooltip "Cannot flee from bosses" |
| Iron Skin Potion timing | Blocks the very next enemy attack after use. If used before enemy's turn, blocks that turn's attack. If enemy attacks twice (Blood Frenzy), only blocks the first hit |
| Lucky Charm + single low die | Triggers if lowest die shows 1 or 2. Rerolls ONLY that die to match highest die's value. If all dice show 1-2, rerolls the first one to 2 |
| Haste Elixir + rerolls | The 2 extra rerolls add to current reroll count for that turn only. The +1 to all dice applies after rolling, before allocation |
| One per turn rule | After using a potion or scroll, the other consumable slot is greyed out until next turn. Charms triggering does NOT count as "using" a consumable — the player can still manually use one on the same turn a charm fires |

---

### Future Expansion Hooks

- `GS.consumableSlots` is a variable, not hardcoded. Future equipment can increment it
- `GS.consumableBonus` multiplier (default 1) checked at use time. Future equipment like "potions are 50% more effective" sets this to 1.5
- Consumable objects are self-contained data — new consumables can be added to the pool arrays without changing system code
- Category field supports future categories beyond potion/scroll/charm if needed