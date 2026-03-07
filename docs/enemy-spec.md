# Dice Dungeon — Enemy Specification

> Enemies roll dice that fuel their abilities. Player sees intent + roll before assigning their own dice.

---

## CORE CONCEPT

Enemies are not stat blocks with fixed ATK. They have their own dice pools, abilities, and intent patterns. Each turn:

1. **Enemy declares intent** — shows which ability it will use next
2. **Enemy rolls dice** — player sees the exact result and what it means
3. **Player response** — player rolls their own dice and assigns to slots with full knowledge of incoming threat
4. **Resolution** — player attack hits enemy, enemy ability resolves against player block

This gives the player meaningful decisions every turn. "13 damage incoming — do I need 13 block or can I tank it and go all-in on attack?"

---

## ENEMY DATA STRUCTURE

```javascript
// Each enemy is defined as:
{
  name: 'Orc Warrior',
  hp: 45,
  dice: [6, 6, 6],           // 3×d6 — array of die sizes
  gold: [20, 30],             // [min, max] gold reward range
  xp: [14, 20],               // [min, max] xp reward range
  abilities: {
    strike:   { name: 'Strike', icon: '⚔️', type: 'attack', desc: 'Deal sum as damage' },
    warCry:   { name: 'War Cry', icon: '📯', type: 'buff', desc: 'Store sum, add to next Strike' },
  },
  passives: [],                // array of passive effect objects (see Passives section)
  pattern: ['strike', 'strike', 'warCry'],  // repeating cycle of ability keys
}
```

**At runtime, track per-combat state:**
```javascript
{
  currentEnemy: { ...enemyDef },   // copy of definition
  patternIndex: 0,                  // current position in pattern cycle
  diceResults: [],                  // this turn's roll results
  storedBonus: 0,                   // for buff abilities like War Cry
  turnsAlive: 0,                    // for time-based passives like Mitosis
  phaseTriggered: false,            // for boss phase transitions
  phylacteryUsed: false,            // for Lich-specific tracking
  extraDice: [],                    // dice added mid-fight (Raise Dead, Escalate, etc.)
  shield: 0,                        // Bone Wall etc.
  statusEffects: [],                // debuffs applied by player
}
```

---

## TURN FLOW

### Step 1: Enemy Intent
```
At the start of the turn (or carried from end of previous turn):
- Read pattern[patternIndex % pattern.length] to get ability key
- Display ability name, icon, and description to player
- Example: "⚔️ Orc Warrior intends Strike"
```

### Step 2: Enemy Rolls Dice
```
- Roll all dice in enemy's pool (base dice + any extraDice)
- Display individual results and sum
- Apply any stored bonuses (e.g. War Cry bonus added to Strike)
- Display final ability value: "⚔️ Strike: 4 + 6 + 3 = 13 damage incoming"
- If the ability is non-damaging, show what it does: "📯 War Cry: 4 + 6 + 3 = +13 to next Strike"
```

### Step 3: Player Response
```
- Player sees exact threat (e.g. "13 damage incoming")
- Player rolls their own dice
- Player assigns dice to attack/defend slots with full information
- Player may use ONE consumable during this phase (before resolution)
```

### Step 4: Resolution
```
- Calculate player attack total → apply to enemy HP (respecting enemy passives)
- Calculate player block total → subtract from enemy ability damage
- Apply remaining damage to player HP
- Process passive effects (poison ticks, regen, escalate, etc.)
- Advance patternIndex by 1
- Increment turnsAlive
- Check for phase transitions (bosses)
- Check for death (enemy or player)
```

---

## ABILITY TYPES

Each ability has a `type` that determines how the dice sum is used:

### attack
Deal dice sum as damage to player (reduced by player block).
```javascript
const damage = diceSum + storedBonus;
const blocked = Math.min(playerBlock, damage);
const playerTakes = damage - blocked;
```

### unblockable
Deal dice sum as damage, ignoring player block entirely.
```javascript
const damage = diceSum;
// Applied directly to player HP, block has no effect
```

### buff
Store dice sum as a bonus. Added to the next ability of a specified type.
```javascript
// On buff turn:
enemy.storedBonus += diceSum;
// On next attack turn:
const damage = diceSum + enemy.storedBonus;
enemy.storedBonus = 0;
```

### heal
Recover dice sum as enemy HP (capped at max HP).
```javascript
enemy.hp = Math.min(enemy.hp + diceSum, enemy.maxHp);
```

### shield
Gain dice sum as temporary shield. Shield absorbs damage before HP.
```javascript
enemy.shield += diceSum;
// When player deals damage:
const shieldAbsorb = Math.min(enemy.shield, incomingDamage);
enemy.shield -= shieldAbsorb;
enemy.hp -= (incomingDamage - shieldAbsorb);
```

### poison
Apply dice sum as poison stacks to player.
```javascript
player.statusEffects.push({ type: 'poison', value: diceSum, duration: null });
// Poison ticks at start of player's turn for value damage
```

### curse
Disable player's attack slot with most dice. Duration = Math.ceil(diceSum / X).
```javascript
// Find slot with most dice assigned
// Mark it as disabled for Math.ceil(diceSum / 3) turns
// Disabled slots: dice in them don't contribute
```

### steal
Take gold from player equal to dice sum.
```javascript
const stolen = Math.min(player.gold, diceSum);
player.gold -= stolen;
```

### charge
Skip this turn's action. Next turn's ability uses doubled dice pool.
```javascript
// On charge turn: no damage dealt, flag set
enemy.charged = true;
// On next ability turn: roll dice pool twice (or double the sum)
const sum = charged ? diceSum * 2 : diceSum;
enemy.charged = false;
```

### decay
Reduce all player dice maximum values by a fixed amount for this fight.
```javascript
// All player dice: die.max -= 1 (min value stays, so range shrinks)
// This is permanent for the fight, stacks on repeated casts
```

### summon_die
Enemy permanently gains additional dice to its pool.
```javascript
// Add die to enemy's extraDice array
enemy.extraDice.push(dieSize);
// All future rolls include these extra dice
```

---

## PASSIVE EFFECTS

Passives are always-on effects that don't consume dice. Defined as objects:

```javascript
{ id: 'thickHide', name: 'Thick Hide', desc: 'Ignores slot damage below 10', params: { threshold: 10 } }
```

| ID | Name | Effect | Params |
|----|------|--------|--------|
| `brittle` | Brittle | Takes +X bonus damage from every hit | `{ bonus: 3 }` |
| `thickHide` | Thick Hide | Ignore damage from any slot that totals less than X | `{ threshold: 10 }` |
| `regen` | Regeneration | Heal X HP at start of enemy turn | `{ amount: 3 }` |
| `lifesteal` | Lifesteal | Heal X% of damage dealt to player | `{ percent: 0.5 }` |
| `bloodFrenzy` | Blood Frenzy | Below X% HP, gain Y extra dice | `{ hpPercent: 0.2, extraDice: [6, 6] }` |
| `mitosis` | Mitosis | After X turns, transform: upgrade dice + gain HP | `{ turnTrigger: 3, newDice: [6, 6], bonusHp: 15 }` |
| `greedTax` | Greed Tax | Gain +1 die per X gold player holds | `{ goldPer: 100, dieSize: 6 }` |
| `evasion` | Evasion | One random player attack die is ignored each turn | `{}` |
| `expose` | Expose | Gain +1 die per empty player attack slot | `{ dieSize: 6 }` |
| `armor` | Armor | Reduce ALL incoming damage by X (including poison) | `{ reduction: 5 }` |
| `escalate` | Escalate | Gain +1 die every X turns | `{ interval: 3, dieSize: 6 }` |
| `overcharge` | Overcharge | If player deals X+ damage in one turn, enemy is stunned next turn | `{ threshold: 25 }` |
| `soulPact` | Soul Pact | Overkill damage reflects back to player | `{}` |
| `phylactery` | Phylactery | Revive once at X% HP | `{ revivePercent: 0.4 }` |
| `scales` | Scales | First X damage from each slot is ignored | `{ perSlot: 8 }` |
| `burnOnPhase` | Burn on Phase | All abilities also apply X burn (boss phase 2 trigger) | `{ burn: 2 }` |

### Passive Processing Order (each turn):
1. **Start of enemy turn:** Process regen, escalate (check interval), mitosis (check timer), bloodFrenzy (check HP)
2. **During damage to enemy:** Apply brittle, thickHide, scales, armor, soulPact
3. **During damage to player:** Apply lifesteal
4. **After damage to enemy:** Check overcharge threshold, check phylactery on death
5. **Greed Tax and Expose:** Recalculate extra dice at start of combat and on relevant changes

---

## PLAYER DEBUFFS

Temporary effects applied to the player during combat, cleared when combat ends:

- **Poison:** Take X damage at start of turn, lasts N turns
- **Slot disable:** A specific attack slot is unusable for N turns. Dice in it are returned to pool
- **Dice value reduction:** All dice roll results reduced by X (min 1) for the fight
- **Unblockable damage:** Damage that bypasses defense entirely, shown separately in the log
- **Overkill reflection:** Excess damage beyond enemy's remaining HP is dealt back to player (Soul Pact)

All player debuff countdowns are decremented at the **start of `execute()`**, not in `newTurn()`. This ensures effects persist through the full allocation phase the turn they are applied, then expire at the moment the player submits.

---

## ENEMY ROSTER

### Act 1 — Tutorial Enemies

Player context: 3×d6, 2 strike / 2 guard slots, no mods, no passives. Max single die value is 6. Average 2-dice attack is 7. Floor 1 is always Goblin.

---

**Goblin**
```javascript
{
  name: 'Goblin',
  hp: 20,
  dice: [4, 4],
  gold: [15, 25],
  abilities: {
    strike: { name: 'Strike', icon: '⚔️', type: 'attack', desc: 'Deal damage' }
  },
  passives: [],
  pattern: ['strike']
}
```
*Design intent: Vanilla. Learn the combat system. Average damage: 5 per turn.*

---

**Dire Rat**
```javascript
{
  name: 'Dire Rat',
  hp: 14,
  dice: [3, 3, 3],
  gold: [12, 20],
  abilities: {
    frenzy: { name: 'Frenzy', icon: '🐀', type: 'attack', desc: 'Each die hits separately', multiHit: true }
  },
  passives: [],
  pattern: ['frenzy']
}
```
*Design intent: Multi-hit. Each d3 is a separate hit against total block pool. Average total: 6. Teaches that multiple hits exist as a mechanic. Low HP — dies fast.*

---

**Fungal Creep**
```javascript
{
  name: 'Fungal Creep',
  hp: 22,
  dice: [4, 4],
  gold: [15, 22],
  abilities: {
    strike: { name: 'Strike', icon: '⚔️', type: 'attack', desc: 'Deal damage' },
    spore:  { name: 'Spore Cloud', icon: '🍄', type: 'poison', desc: 'Apply poison equal to dice sum' }
  },
  passives: [],
  pattern: ['strike', 'spore']
}
```
*Design intent: Introduces poison. Alternates between direct damage and DoT. Average 5 damage or 5 poison per turn. Teaches that fights going long hurts when poison stacks.*

---

**Slime**
```javascript
{
  name: 'Slime',
  hp: 28,
  dice: [4, 4],
  gold: [18, 28],
  abilities: {
    strike: { name: 'Strike', icon: '⚔️', type: 'attack', desc: 'Deal damage' }
  },
  passives: [
    { id: 'mitosis', name: 'Mitosis', desc: 'After 3 turns, evolves: gains bigger dice and +15 HP',
      params: { turnTrigger: 3, newDice: [6, 6], bonusHp: 15 } }
  ],
  pattern: ['strike']
}
```
*Design intent: DPS check. Average 5 damage per turn, but if you don't kill it in 3 turns it transforms into a much scarier enemy (2×d6, +15 HP). Teaches urgency.*

*Mitosis: On turn 3, log "The Slime shudders and splits!" Replace dice pool with newDice, add bonusHp to current and max HP.*

---

**Skeleton**
```javascript
{
  name: 'Skeleton',
  hp: 18,
  dice: [6, 6],
  gold: [14, 22],
  abilities: {
    strike: { name: 'Strike', icon: '⚔️', type: 'attack', desc: 'Deal damage' }
  },
  passives: [
    { id: 'brittle', name: 'Brittle', desc: 'Takes +3 damage from every hit', params: { bonus: 3 } }
  ],
  pattern: ['strike']
}
```
*Design intent: Glass cannon. 2×d6 averages 7 damage — highest in Act 1. But Brittle means it melts fast if you go aggressive. Teaches that aggression is sometimes the best defense.*

---

### Act 2 — Counter-Pick Enemies

Player context: 4–5 dice (some upgraded), 3–4 slots, 1–2 artifacts, face mods, a build direction.

---

**Orc Warrior**
```javascript
{
  name: 'Orc Warrior',
  hp: 45,
  dice: [6, 6, 6],
  gold: [20, 30],
  abilities: {
    strike: { name: 'Strike', icon: '⚔️', type: 'attack', desc: 'Deal damage' },
    warCry: { name: 'War Cry', icon: '📯', type: 'buff', desc: 'Store dice sum, add to next Strike', buffTarget: 'strike' }
  },
  passives: [],
  pattern: ['strike', 'strike', 'warCry']
}
```
*Design intent: Punishes low defense. 3×d6 averages 10.5 on Strike. War Cry stores ~10.5, so the buffed Strike averages ~21. Player sees War Cry intent, knows to stack heavy defense next turn. Counter: burst it down before the cycle completes, or save a defensive consumable for the spike.*

---

**Dark Mage**
```javascript
{
  name: 'Dark Mage',
  hp: 32,
  dice: [6, 6],
  gold: [22, 35],
  abilities: {
    bolt:  { name: 'Shadow Bolt', icon: '🔮', type: 'attack', desc: 'Deal damage (penetrates 3 block)', penetrate: 3 },
    curse: { name: 'Curse', icon: '💀', type: 'curse', desc: 'Disable your busiest attack slot', durationDivisor: 3 }
  },
  passives: [],
  pattern: ['bolt', 'bolt', 'curse']
}
```
*Design intent: Punishes Wide builds. Bolt penetrates 3 block. Curse disables the attack slot with the most dice — Wide players lose their stacked slot. Duration = ceil(diceSum / 3), so average 2×d6=7 → 3 turns disabled. Counter: spread dice evenly across slots, or kill fast.*

*Bolt penetrate: `effectiveBlock = Math.max(0, playerBlock - 3)`.*

*Curse: Find attack slot with highest dice count. Mark disabled for ceil(sum/3) turns.*

---

**Troll**
```javascript
{
  name: 'Troll',
  hp: 55,
  dice: [8, 8],
  gold: [20, 30],
  abilities: {
    strike: { name: 'Smash', icon: '💪', type: 'attack', desc: 'Deal damage' },
    heal:   { name: 'Regenerate', icon: '💚', type: 'heal', desc: 'Heal HP equal to dice sum' }
  },
  passives: [
    { id: 'thickHide', name: 'Thick Hide', desc: 'Ignores slot damage below 10', params: { threshold: 10 } },
    { id: 'regen', name: 'Passive Regen', desc: 'Heals 3 HP per turn', params: { amount: 3 } }
  ],
  pattern: ['strike', 'strike', 'heal']
}
```
*Design intent: Punishes low per-hit damage. Thick Hide means each attack SLOT must deal 10+ or it's ignored entirely. Passive regen + active heal makes it a war of attrition. Counter: Tall builds with big concentrated hits. Poison ignores Thick Hide.*

*Thick Hide: For each player attack slot, if slot total < threshold, set slot damage to 0.*

---

**Vampire**
```javascript
{
  name: 'Vampire',
  hp: 38,
  dice: [6, 6, 6],
  gold: [25, 40],
  abilities: {
    drain: { name: 'Drain', icon: '🩸', type: 'attack', desc: 'Deal damage and heal 50% of amount dealt' }
  },
  passives: [
    { id: 'lifesteal', name: 'Lifesteal', desc: 'Heals 50% of damage dealt to player', params: { percent: 0.5 } },
    { id: 'bloodFrenzy', name: 'Blood Frenzy', desc: 'Below 20% HP, gains 2 extra d6', params: { hpPercent: 0.2, extraDice: [6, 6] } }
  ],
  pattern: ['drain']
}
```
*Design intent: Punishes slow builds. 3×d6 averages 10.5, heals ~5 each turn. Blood Frenzy at 20% adds 2×d6 making it 5×d6 averaging 17.5. Counter: burst from above 20% to dead in one turn.*

*Lifesteal: Based on damage actually dealt to player (after block). `enemy.hp = Math.min(enemy.maxHp, enemy.hp + Math.floor(damageTaken * 0.5))`.*

*Blood Frenzy: At start of enemy turn, if hp < maxHp * 0.2 and not already triggered, add extraDice. Log "The Vampire enters a Blood Frenzy!" Flag so it only triggers once.*

---

**Mimic**
```javascript
{
  name: 'Mimic',
  hp: 35,
  dice: [6, 6],
  gold: [20, 30],
  abilities: {
    strike: { name: 'Strike', icon: '⚔️', type: 'attack', desc: 'Deal damage' },
    steal:  { name: 'Gold Snatch', icon: '💰', type: 'steal', desc: 'Steal gold equal to dice sum' }
  },
  passives: [
    { id: 'greedTax', name: 'Greed Tax', desc: 'Gains +1d6 per 100 gold player holds', params: { goldPer: 100, dieSize: 6 } }
  ],
  pattern: ['steal', 'strike', 'strike']
}
```
*Design intent: Punishes Gold builds. Opens with steal (loses you gold AND reduces gold scaling damage). Greed Tax means a player holding 300g faces 5 dice instead of 2. Counter: kill it fast before it steals too much.*

*Greed Tax: At start of combat, `bonusDice = Math.floor(player.gold / 100)`. Recalculate if gold changes mid-fight.*

---

### Act 3 — Hard Counter Enemies

Player context: 5–7 dice (heavily upgraded), 5–6 slots, 3–4 artifacts, capstone passives, full build.

---

**Demon**
```javascript
{
  name: 'Demon',
  hp: 75,
  dice: [8, 8, 8],
  gold: [35, 55],
  abilities: {
    strike:   { name: 'Strike', icon: '⚔️', type: 'attack', desc: 'Deal damage' },
    hellfire: { name: 'Hellfire', icon: '🔥', type: 'unblockable', desc: 'Deal unblockable damage' }
  },
  passives: [
    { id: 'soulPact', name: 'Soul Pact', desc: 'Overkill damage reflects back to player', params: {} }
  ],
  pattern: ['strike', 'hellfire']
}
```
*Design intent: Unblockable damage forces HP management. 3×d8 Hellfire averages 13.5 unblockable every other turn. Soul Pact means you can't nuke it carelessly. Counter: precise damage control, healing sustain.*

*Soul Pact: When enemy HP would go below 0, reflect `Math.abs(newHp)` as damage to player before setting enemy HP to 0.*

---

**Lich**
```javascript
{
  name: 'Lich',
  hp: 65,
  dice: [8, 8],
  gold: [40, 60],
  abilities: {
    strike: { name: 'Strike', icon: '⚔️', type: 'attack', desc: 'Deal damage' },
    decay:  { name: 'Decay', icon: '💀', type: 'decay', desc: 'All your dice permanently lose 1 max value this fight' }
  },
  passives: [
    { id: 'phylactery', name: 'Phylactery', desc: 'Revives once at 40% HP', params: { revivePercent: 0.4 } }
  ],
  pattern: ['strike', 'strike', 'decay']
}
```
*Design intent: Time pressure. Every 3 turns your dice get weaker. Phylactery means you have to kill it twice. Counter: burst damage to kill fast.*

*Decay: For each player die, `die.max = Math.max(die.min, die.max - 1)`. Rebuild faceValues. Restored after combat.*

*Phylactery: On first death, set `enemy.hp = Math.floor(enemy.maxHp * 0.4)`, set flag. Log "The Lich's phylactery glows... it reforms!"*

---

**Dragon Whelp**
```javascript
{
  name: 'Dragon Whelp',
  hp: 85,
  dice: [8, 8, 8, 8],
  gold: [45, 65],
  abilities: {
    strike: { name: 'Strike', icon: '⚔️', type: 'attack', desc: 'Deal damage' },
    charge: { name: 'Breath Charge', icon: '🔥', type: 'charge', desc: 'Charging... next attack is doubled!' },
    breath: { name: 'Fire Breath', icon: '🐲', type: 'attack', desc: 'Deal DOUBLED damage + apply burn', applyBurn: 3 }
  },
  passives: [
    { id: 'scales', name: 'Dragon Scales', desc: 'First 8 damage from each slot is ignored', params: { perSlot: 8 } }
  ],
  pattern: ['strike', 'charge', 'breath']
}
```
*Design intent: Massive spike damage. 4×d8 averages 18 on Strike. Charge → Breath doubles to avg 36 + burn. Scales punishes Wide builds. Counter: see Charge intent and prepare massive defense. Tall builds punch through Scales. Stun/Freeze to skip the Breath turn.*

*Scales: For each player attack slot, `effectiveDamage = Math.max(0, slotTotal - 8)`.*

*Charge: On Charge turn, enemy does nothing, set charged flag. On Breath turn, double the dice sum.*

---

**Shadow Assassin**
```javascript
{
  name: 'Shadow Assassin',
  hp: 45,
  dice: [8, 8, 8],
  gold: [35, 55],
  abilities: {
    strike: { name: 'Strike', icon: '🗡️', type: 'attack', desc: 'Deal damage' },
    vanish: { name: 'Vanish', icon: '💨', type: 'charge', desc: 'Disappears — immune to damage this turn. Next strike is doubled.' }
  },
  passives: [
    { id: 'evasion', name: 'Evasion', desc: 'One random attack die is ignored each turn', params: {} },
    { id: 'expose', name: 'Expose', desc: 'Gains +1d6 per empty player attack slot', params: { dieSize: 6 } }
  ],
  pattern: ['strike', 'strike', 'vanish']
}
```
*Design intent: Elusive and punishing. Evasion wastes one of your dice every turn. Expose punishes empty attack slots. Vanish makes it immune + doubles next hit. Counter: fill all attack slots to minimize Expose. Poison/burn still tick during Vanish.*

*Evasion: After player assigns dice, pick one random die from attack slots and set its contributed value to 0.*

*Expose: At start of combat turn, count player attack slots with 0 dice assigned. Add that many d6 to enemy pool temporarily.*

*Vanish: On Vanish turn, enemy takes no damage. Set charged flag for next attack to be doubled.*

---

**Iron Golem**
```javascript
{
  name: 'Iron Golem',
  hp: 100,
  dice: [6, 6],
  gold: [50, 70],
  abilities: {
    strike: { name: 'Strike', icon: '⚔️', type: 'attack', desc: 'Deal damage' }
  },
  passives: [
    { id: 'armor', name: 'Iron Armor', desc: 'Reduces ALL incoming damage by 5 (including poison)', params: { reduction: 5 } },
    { id: 'escalate', name: 'Escalate', desc: 'Gains +1d6 every 3 turns', params: { interval: 3, dieSize: 6 } },
    { id: 'overcharge', name: 'Overcharge', desc: 'If hit for 25+ in one turn, stunned next turn', params: { threshold: 25 } }
  ],
  pattern: ['strike']
}
```
*Design intent: Inevitable doom. Starts weak (2×d6 avg 7) but gains a die every 3 turns. By turn 9 it's rolling 5×d6 avg 17.5. Armor makes chip damage useless. Overcharge is the relief valve: burst 25+ to stun it and buy a turn. Counter: Tall builds that can burst through armor.*

*Armor: ALL damage to this enemy (dice, poison, burn, reflect, etc.) is reduced by `reduction`, minimum 0.*

*Escalate: Every `interval` turns, push a new die to extraDice. Log "The Iron Golem powers up! +1d6"*

*Overcharge: Track total damage dealt to Golem this turn. If ≥ threshold, stun next turn.*

---

### Bosses

Bosses use the same dice + ability + pattern system but with **phase transitions** that change their pattern and/or dice pool.

---

**Bone King (Floor 5)**
```javascript
{
  name: 'The Bone King',
  hp: 85,
  dice: [6, 6, 6],
  gold: 100,
  xp: 50,
  abilities: {
    strike:    { name: 'Strike', icon: '⚔️', type: 'attack', desc: 'Deal damage' },
    boneWall:  { name: 'Bone Wall', icon: '🛡️', type: 'shield', desc: 'Gain shield equal to dice sum' },
    raiseDead: { name: 'Raise Dead', icon: '💀', type: 'summon_die', desc: 'Permanently gain +1d6', dieSize: 6 }
  },
  passives: [],
  pattern: ['strike', 'strike', 'boneWall', 'raiseDead'],
  phases: null
}
```
*Design intent: Escalating threat. Each full cycle (4 turns) it gains a die. By cycle 2 it's rolling 4×d6 (avg 14). Bone Wall provides shield that must be chewed through. Ideal kill time: 2 cycles (8 turns).*

---

**Crimson Wyrm (Floor 10)**
```javascript
{
  name: 'Crimson Wyrm',
  hp: 250,
  dice: [8, 8, 8, 8],
  gold: 150,
  xp: 80,
  abilities: {
    strike:  { name: 'Strike', icon: '⚔️', type: 'attack', desc: 'Deal damage' },
    breath:  { name: 'Fire Breath', icon: '🔥', type: 'attack', desc: 'Deal damage + apply burn', applyBurn: 3 },
    buffet:  { name: 'Wing Buffet', icon: '💨', type: 'attack', desc: 'Deal half damage + disable 1 random slot for 1 turn', halfDamage: true, disableSlot: 1 }
  },
  passives: [],
  pattern: ['strike', 'breath', 'strike', 'buffet'],
  phases: [
    {
      trigger: { hpPercent: 0.5 },
      changes: {
        addDice: [8, 8],
        addPassives: [{ id: 'burnOnPhase', name: 'Inferno', desc: 'All attacks apply 2 burn', params: { burn: 2 } }],
        log: 'The Crimson Wyrm roars with fury! Flames engulf its body!'
      }
    }
  ]
}
```
*Design intent: Phase transition is a dramatic power spike. Phase 1: 4×d8 (avg 18) with burn and slot disruption. At 50%: gains 2 more dice (6×d8, avg 27) and all attacks burn.*

*Wing Buffet halfDamage: `damage = Math.floor(diceSum / 2)`. Then disable 1 random player slot for 1 turn.*

*Phase: After damage is dealt to boss, check if HP crossed threshold. If so, apply changes once.*

---

**Void Lord (Floor 15)**
```javascript
{
  name: 'The Void Lord',
  hp: 450,
  dice: [10, 10, 10, 10],
  gold: 250,
  xp: 120,
  abilities: {
    strike:    { name: 'Strike', icon: '⚔️', type: 'attack', desc: 'Deal damage' },
    voidRift:  { name: 'Void Rift', icon: '🌀', type: 'curse', desc: 'Disable a slot for ceil(sum/5) turns', durationDivisor: 5 },
    darkPulse: { name: 'Dark Pulse', icon: '💜', type: 'unblockable', desc: 'Deal unblockable damage' }
  },
  passives: [],
  pattern: ['strike', 'voidRift', 'darkPulse'],
  phases: [
    {
      trigger: { hpPercent: 0.5 },
      changes: {
        addDice: [10, 10],
        addPassives: [{ id: 'entropy', name: 'Entropy', desc: 'Each turn, all player dice lose 1 max value', params: {} }],
        log: 'Reality fractures around the Void Lord! Your dice begin to decay...'
      }
    },
    {
      trigger: { hpPercent: 0.2 },
      changes: {
        doubleAction: true,
        damageTakenMultiplier: 1.5,
        log: 'The Void Lord tears apart at the seams! It attacks wildly but exposes its core!'
      }
    }
  ]
}
```
*Design intent: Three-phase final boss. Phase 1: 4×d10 (avg 22) with slot disable and unblockable. Phase 2 (50%): gains 2 dice (6×d10, avg 33) and Entropy starts shrinking player dice — hard timer. Phase 3 (20%): attacks twice per turn but takes +50% damage — desperate race to finish it.*

*Entropy: At start of each player turn (while in phase 2+), for each player die: `die.max = Math.max(die.min, die.max - 1)`. Restored after combat.*

*doubleAction: Enemy executes two abilities per turn. Advance pattern index twice, roll dice twice.*

*damageTakenMultiplier: All damage to boss is multiplied by 1.5.*

---

## SCALING

```javascript
const scale = Math.pow(1.04, floor - 1);
// Applied to HP only. Dice provide natural damage scaling through pool size.
// Ability params (thresholds, burn amounts, etc.) do NOT scale.
const scaledHp = Math.round(enemy.hp * scale);
```

Dice pools are fixed per enemy definition — act progression (d3–d6 → d6–d8 → d8–d10) provides the natural damage curve rather than scaling individual dice.

---

## DISPLAY / UI REQUIREMENTS

### Enemy Info Panel (during combat)
```
[Enemy Name] — HP: XX/XX [shield if any]
[Dice visual: show dice count and sizes, e.g. "🎲🎲🎲 3×d8"]
[Active passives listed with icons]
[Status effects on enemy: poison stacks, burn, chill, etc.]
```

### Intent Display (before player acts)
```
[Intent icon] [Ability name]: [description]
After roll: [Ability name]: [die1] + [die2] + [die3] = [sum] → [effect description]
Example: "⚔️ Strike: 4 + 6 + 5 = 15 damage incoming"
Example: "💚 Regenerate: 7 + 3 = 10 HP heal"
Example: "📯 War Cry: 2 + 5 + 6 = +13 to next Strike"
Example: "🔥 Breath Charge: Charging... next attack will be doubled!"
```

### On Turn Resolution
```
Log each step clearly:
"Orc Warrior uses Strike for 15 damage!"
"You block 12 → take 3 damage"
"Your attack deals 22 damage to Orc Warrior"
"Thick Hide absorbs slot 2 (only 8 damage — below threshold)"
"Poison ticks for 5 on Orc Warrior"
```

Passive abilities display as permanent tags below the HP bar (e.g. "💀 Brittle: +3 damage taken", "🛡️ Thick Hide: Ignores hits below 10"). Phase transitions get a log message and visual flash on the enemy panel.
