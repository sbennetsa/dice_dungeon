## Runes & Artifacts — Complete Specification

---

### RUNES

Runes attach to individual dice, not slots. Each die can hold one rune. A rune amplifies or modifies what that specific die does. Runes affect everything the die produces — face values, face mod effects, gold generation, healing, poison application, multipliers. "This die does X" is the mental model.

Runes are acquired from: skill tree (Amplify node grants one), shop purchases, elite/boss reward cards, events.

**Rune attachment flow:** When acquiring a rune, player picks which die to attach it to using the visual face strip display. A die that already has a rune can have it replaced (old rune is lost). Runed dice show a visual indicator — a coloured border or glow matching the rune type.

---

#### Rune List

| Rune | Icon | Slot Type | Effect | Description shown to player |
|------|------|-----------|--------|-----------------------------|
| **Amplifier** | 🔮 | Either | Doubles this die's output. Values ×2, face mod effects ×2 (a ×2 Strike becomes ×4, heal 5 becomes heal 10, gold 10 becomes gold 20) | "Everything this die does is doubled" |
| **Titan's Blow** | 💪 | Either | If this die is the only die in its slot, its output is tripled. Same logic as Amplifier but ×3 and conditional | "If alone in its slot, this die's output is tripled" |
| **Siphon** | 🩸 | Attack | After damage is dealt, this die heals you for 100% of its contributed value | "This die's damage also heals you" |
| **Regen Core** | 💚 | Defend | This die heals you for 50% of its block value (round up) | "This die's block also heals you for half" |
| **Mirror** | 🪞 | Defend | This die's block value is also dealt as damage to the enemy | "Block from this die is also dealt as damage" |
| **Leaden** | ⚓ | Defend | This die's block value is doubled but it cannot be rerolled | "Double block, but locked — no rerolls" |
| **Steadfast** | 🛡️ | Defend | This die's block value cannot be reduced by any enemy effect — penetration, curses, debuffs | "This die's block ignores all enemy reduction" |

**7 total runes.** Weighted toward defend (4) vs attack (1) vs either (2). This is intentional — attack dice have face mods doing heavy lifting, defend dice need runes to be interesting.

---

#### Rune Interaction Rules

When a die with a rune rolls a face mod, the rune applies to the face mod's effect:

| Face Mod | Rune | Result |
|----------|------|--------|
| ×2 Strike | Amplifier | Slot multiplier becomes ×4 |
| ×2 Strike | Titan's Blow (alone in slot) | Slot multiplier becomes ×6 |
| +5 Bonus | Amplifier | +10 Bonus per die in slot |
| Heal 5 (Rejuvenate) | Amplifier | Gain 10 regen stacks |
| Gold Rush +10g | Amplifier | +20g |
| Poison 3 | Amplifier | Apply 6 poison |
| Normal face value 6 | Amplifier | Value becomes 12 |
| Normal face value 6 | Siphon | Deals 6 damage, heals 6 |
| Normal face value 6 | Mirror (defend) | Blocks 6, deals 6 to enemy |
| Normal face value 6 | Leaden (defend) | Blocks 12, cannot reroll |

When a die with a rune rolls a normal face (no face mod), the rune applies to the raw value only.

---

### ARTIFACTS

Artifacts are global effects. They do not attach to individual dice. They affect the player's whole build, interact with enemy mechanics, apply status effects, or trigger on conditions.

Artifacts are acquired from: boss rewards (pick 1 of 3), elite rewards (pick 1 of 3), events, shop (rare).

The player should end a run with 3-5 artifacts. Each pick-of-3 offering should aim for variety: one build-enabling artifact, one problem-solving artifact, one interesting-choice artifact.

---

#### Status Effects (New System)

Before the artifact list, these are the status effects artifacts can apply to enemies:

| Status | Effect | Stacking | Display |
|--------|--------|----------|---------|
| **Chill** | Reduces enemy ATK by the stack amount. Lasts 2 turns, then all stacks expire | Additive (3 chill + 2 chill = 5 chill = -5 ATK) | ❄️ 5 shown on enemy panel |
| **Freeze** | Enemy skips their next attack entirely. Consumed on use | Does not stack. Reapplying while frozen extends by 1 turn | 🧊 shown on enemy panel |
| **Mark** | Enemy takes +X damage from all sources. Lasts 2 turns | Additive | 🎯 5 shown on enemy panel |
| **Weaken** | Enemy deals 25% less damage. Lasts 2 turns | Does not stack. Reapplying refreshes duration | 💔 shown on enemy panel |
| **Burn** | Enemy takes X damage per turn. Works like poison but from a separate source. Lasts 3 turns | Additive with poison (both tick separately) | 🔥 3 shown on enemy panel |
| **Stun** | Enemy skips their next attack. Triggered by damage thresholds, not cold | Does not stack. Cannot stun same enemy two turns in a row | ⚡ shown on enemy panel |

Poison already exists in the game. Burn is a second DoT channel — enemies can have both poison and burn ticking simultaneously.

---

#### Artifact List

**Build Enablers** — amplify a specific strategy

| Artifact | Icon | Effect | Best For |
|----------|------|--------|----------|
| **Hydra's Crest** | 🐉 | +2 attack damage for every die you own | Wide |
| **Swarm Banner** | 🚩 | When 4+ dice are allocated to a single slot, that slot deals ×1.5 | Wide |
| **Echo Stone** | 🔁 | The first die you allocate each turn is counted twice in its slot (value added again) | Wide |
| **Colossus Belt** | 🏋️ | Dice with max face value 9+ gain +3 to all face values permanently when this artifact is acquired | Tall |
| **Precision Lens** | 🔍 | All dice roll twice and keep the higher result | Tall |
| **Sharpening Stone** | ⚔️ | All dice values gain +50% (round up) after runes apply | Tall / general |
| **Venom Gland** | 🧪 | All poison applied from any source is doubled | Poison |
| **Festering Wound** | 🩸 | Enemies take +1 damage from all sources for each stack of poison on them | Poison |
| **Toxic Blood** | ☠️ | When you take damage, apply 2 poison to the attacker | Poison |
| **Merchant's Crown** | 💎 | +1 attack damage per 20 gold held | Gold |
| **Golden Aegis** | 🛡️ | +1 block per 25 gold held | Gold |
| **Midas Die** | 🎲 | At the start of each combat, gain a temporary d6 that generates gold equal to its value (auto-fire, disappears after combat) | Gold |

**Problem Solvers** — answer specific enemy mechanics

| Artifact | Icon | Effect | Solves |
|----------|------|--------|--------|
| **Anchored Slots** | ⚓ | Your slots cannot be disabled by enemy abilities | Dark Mage, Void Lord, Wyrm |
| **Soul Mirror** | 👻 | Unblockable damage is reduced by 50% | Demon Hellfire, Void Lord Dark Pulse |
| **Iron Will** | 🧠 | Your dice values and face counts cannot be reduced by enemy effects | Lich Decay Aura, Void Lord Entropy |
| **Burnproof Cloak** | 🧥 | Immune to burn. Poison on you ticks for half (round down) | Fungal Creep, Crimson Wyrm |
| **Thorn Mail** | 🌿 | When you take damage, deal 3 back to the attacker | Dire Rat, Vampire, multi-hit enemies |
| **Overflow Chalice** | 🏆 | Overkill damage (beyond enemy remaining HP) heals you instead | Demon Soul Pact, general sustain |

**Status Effect Artifacts** — interact with the fight through debuffs

| Artifact | Icon | Effect | Creates |
|----------|------|--------|---------|
| **Frost Brand** | ❄️ | When you block 10+ damage in a single turn, apply 3 chill to the enemy for 2 turns | Defensive status play — your block weakens the enemy |
| **Frozen Heart** | 🧊 | When an enemy has 6+ chill stacks, they are frozen (skip next attack). Chill resets to 0 after freeze triggers | Build-around: stack chill to earn freezes |
| **Hunter's Mark** | 🎯 | First hit each combat applies 5 mark to the enemy for 2 turns (+5 damage from all sources) | Opening burst amplifier |
| **Witch's Hex** | 💔 | When you apply poison, also apply weaken for 1 turn (enemy deals 25% less) | Poison builds gain defensive utility |
| **Ember Crown** | 🔥 | When you deal 15+ damage in a single turn, apply 3 burn to the enemy for 3 turns | Offensive DoT for damage builds |
| **Thunder Strike** | ⚡ | When you deal 25+ damage in a single turn, stun the enemy (skip next attack). Cannot trigger two turns in a row | Burst reward — big hit earns a free turn |

**Interesting Choices** — powerful but with a cost or condition

| Artifact | Icon | Effect | The Tension |
|----------|------|--------|-------------|
| **Berserker's Mask** | 😤 | +50% attack damage but you cannot allocate more than 1 die to defense | Enormous damage, crippled defense |
| **Glass Cannon** | 💥 | All dice gain +3 to every face value permanently but max HP is halved | Power spike with survivability cost |
| **Hourglass** | ⏳ | You get a free turn at the start of every combat (roll and execute before enemy acts) | A free opening salvo vs permanent stat boost |
| **Parasite** | 🦠 | Whenever you kill an enemy, permanently gain +1 max HP and +1 gold per combat. Stacks all run | Weak early, strong late. The patient choice |
| **Blood Pact** | 💀 | At the start of each turn, lose 3 HP. All your damage is increased by 30% | Constant bleed for massive multiplier. Needs regen to sustain |
| **Gambler's Coin** | 🪙 | At the start of each combat, coin flip. Heads: all dice gain +2 this fight. Tails: all dice get -1 this fight | High variance. Average outcome positive but some fights you're crippled |

---

#### Total Count

- Build Enablers: 12
- Problem Solvers: 6
- Status Effect: 6
- Interesting Choices: 6
- **Total: 30 artifacts**

---

#### Artifact Offering Pools

Artifacts are divided into act pools to control when they appear:

**Act 1 pool (Bone King + floor 8 elite if encountered early):**
All Build Enablers, Problem Solvers, and: Hourglass, Parasite, Gambler's Coin.
No Blood Pact, Berserker's Mask, or Glass Cannon — these are too punishing before the player's build can handle the downside.

**Act 2 pool (Crimson Wyrm + floor 12 elite):**
Everything from Act 1 pool plus: Blood Pact, Berserker's Mask, Glass Cannon, all Status Effect artifacts.

**Act 3 pool (if any artifact opportunities exist via events):**
Full pool. All 30 artifacts available.

**Offering logic:** When presenting pick-1-of-3, select one from each category where possible (enabler, solver, choice/status). Avoid offering three of the same category. If the player already owns an artifact, it cannot be offered again.

---

#### Artifacts to Remove from Current Game

These are replaced or made redundant by the new system:

| Current Artifact | Reason |
|------------------|--------|
| **Blade Oil** (+2 dmg) | Too bland. Replaced by more interesting enablers |
| **Phoenix Heart** (heal 5 at combat start) | Too weak. Regen Core rune and Overflow Chalice cover healing |
| **Lucky Charm** (+1 reroll) | Rerolls are covered by skill tree and events. Not interesting enough as artifact slot |
| **Tax Collector** (+10g per kill) | Keep — core gold build piece. Rename to **Tax Collector** and keep as-is |
| **Gilded Gauntlet** (spend 50g for 15 damage) | Keep — interesting gold burst option |

**Final current artifacts to keep:** Tax Collector, Gilded Gauntlet. These slot into the Build Enablers (Gold) section alongside Merchant's Crown, Golden Aegis, and Midas Die.

---

#### Rune + Artifact Interaction Examples

These demonstrate how the two systems layer:

**Example 1: Frost Tank build**
- Die A: high-value d8, Mirror rune (defend). Blocks 7, also deals 7 damage
- Die B: d6 with Rejuvenate face, Regen Core rune (defend). When heal face triggers, heals double (rune + face)
- Artifact: Frost Brand (block 10+ = apply chill)
- Artifact: Frozen Heart (6+ chill = freeze)
- Play pattern: Stack both dice in defend. Block 13+, deal 7 back, heal, apply chill. Every 2 turns the enemy freezes. Offense comes from Mirror and chill/freeze control

**Example 2: Glass Cannon Tall build**
- Die A: Corrupted d10 [2-20], Amplifier rune (attack). Values doubled to 4-40
- Slot sacrifice: Fury Chamber (×1.5 on remaining attack slots)
- Face mod: ×2 Strike on one face
- Artifact: Glass Cannon (+3 all faces, half HP)
- Artifact: Thunder Strike (25+ damage = stun)
- Play pattern: One die in one attack slot. Normal face rolls 7-23 after corruption + amplifier. ×2 Strike face rolls produce ×4 on the slot (amplified ×2 face). Regularly hitting 25+ to stun. But playing on 40 HP with 3 corruption damage per turn

**Example 3: Poison control**
- Multiple dice with poison face mods
- Artifact: Venom Gland (double poison)
- Artifact: Festering Wound (+1 damage per poison stack)
- Artifact: Witch's Hex (poison also weakens)
- Play pattern: Apply 6-10 poison per turn (doubled). Enemy takes escalating DoT, takes +6-10 damage from all sources, and deals 25% less. The dice values almost don't matter — the face mods and artifacts are running the show through status effects

---

### Face Mods — Additions

Two new face mods to support the status effect system:

| Face Mod | Icon | Effect | Auto-fire | Colour |
|----------|------|--------|-----------|--------|
| **Volatile** | 🎰 | When this face is rolled, replace the value with a random number between 1 and double the die's max value | No | Orange |
| **Frostbite** | ❄️ | When this face is rolled and allocated to defend, apply 2 chill to the enemy | No | Light blue |
| **Searing** | 🔥 | When this face is rolled and allocated to attack, apply 2 burn to the enemy in addition to damage | No | Red-orange |
| **Marked** | 🎯 | When this face is rolled and allocated to attack, apply 3 mark to the enemy for 2 turns | No | Red |

These give the player ways to apply status effects through their dice — the core mechanic stays central. Artifacts then amplify these applications (Venom Gland doubles poison, Frozen Heart converts chill stacks to freezes).

---

### Summary of System Boundaries

| System | Scope | Examples |
|--------|-------|---------|
| **Dice faces** | Base values and per-face triggered effects | Roll a 6, trigger ×2 Strike, trigger Frostbite |
| **Runes** | Per-die amplification of whatever that die does | Amplifier doubles value/effects, Mirror converts block to damage |
| **Face mods** | Per-face effects replacing or augmenting the face value | ×2 Strike, Heal, Gold Rush, Frostbite, Poison |
| **Passives (skill tree)** | Systemic rules changes — slots, thresholds, scaling formulas | Pack Tactics, Titan's Wrath, Volley, gold scaling |
| **Artifacts** | Global effects — triggers, status application, build enabling, problem solving | Frost Brand, Sharpening Stone, Berserker's Mask |
| **Slot sacrifices** | Permanent slot-level enhancements from the transformation system | Fury Chamber ×1.5, Conduit poison, Mirror on all defend |