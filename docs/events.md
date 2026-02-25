## Event System Overhaul

Current events are floor 3, 7, and 13. One per act. These are the breather moments between combat — the player is making build decisions, not fighting. But right now they're just flat rewards with no real choice tension.

**Design Goals:**
- Every event should present a **trade-off**, not a free gift
- Options should have different value depending on your build
- Some events should have a risk element — gambling for high reward
- Events should feel thematic, like things happening in a dungeon

**Structure:** Each event presents a narrative moment with 2-3 choices. Each choice has a clear cost/benefit. No choice is universally best.

---

### Act 1 Events (Floor 3)

The player has beaten 2 fights. They have ~40 HP, ~35-55 gold, 3 dice, no upgrades. These events should offer the first taste of build direction — nudging the player toward a path without locking them in.

**Wandering Merchant**
- *"A hooded figure offers you a trade from their cart..."*
- **Buy a mystery die** (30g) → Random die between d4(3-6) and d8(1-8). Could be great or mediocre. Rewards gold-rich players willing to gamble
- **Trade a die** → Sacrifice your worst die, receive one that's +2/+2 to your best die's range. Guaranteed upgrade but you lose a die. Tall build nudge
- **Decline and pickpocket** → 50% chance gain 25g, 50% chance lose 10 HP. Risk/reward for gold builds

**Cursed Shrine**
- *"A stone altar pulses with dark energy. Offerings seem welcome..."*
- **Offer 15 HP** → Gain a random face mod applied to a random face on a random die. Powerful but uncontrolled. Health-for-power trade
- **Offer 25 gold** → Choose a face mod from 3 options, apply to a die and face of your choice. Expensive but precise
- **Pray** → Gain 10 max HP permanently. The safe option. Defensive builds love this, aggressive builds find it boring

**Trapped Chest**
- *"A chest sits in the corridor. The lock is rigged — you can see the mechanism..."*
- **Force it open** → Take 8 damage, gain a random artifact. High value if your HP is healthy, dangerous if you're already hurting from floor 2
- **Disarm carefully** → Gain 20 gold, no risk. The safe play
- **Smash it** → Destroy the chest. One random die gains +1/+1. No gold but guaranteed upgrade. Players with gold already prefer this

---

### Act 2 Events (Floor 7)

The player has a build forming. 4-5 dice, a skill node or two, an artifact. These events should test commitment to the build — offering powerful rewards that favour specific strategies, or tempting the player to pivot.

**The Alchemist's Lab**
- *"Bubbling vials line the shelves. The alchemist is long gone but the reagents remain..."*
- **Brew poison coating** → All your dice gain "apply 1 poison on attack" for the next 2 combats (temporary buff). Massive for poison builds, still useful for others as supplementary damage
- **Brew fortification elixir** → Gain 8 armor for the next 2 combats (temporary buff). Defensive builds love this heading into the elite on floor 8
- **Sell the reagents** → Gain 50 gold. Gold builds take this every time

**The Gambling Den**
- *"A circle of shadowy figures beckon you to play..."*
- **Bet a die** → Sacrifice a die. Roll it one last time. If it rolls above average, gain 2 random artifacts. If below, gain nothing. Enormous swing. Wide builds can afford to risk a spare die. Tall builds can't
- **Bet gold (50g)** → 50% chance double it to 100g, 50% chance lose it all. Pure gold gamble
- **Rob the place** → Gain 30g guaranteed but take 12 damage and your next shop has 50% fewer items. Short-term gain, long-term cost

**The Forgotten Forge**
- *"An ancient forge still burns. Tools of remarkable craft surround it..."*
- **Reforge a die** → Pick a die. Reroll all its face values randomly within its range. Could improve your worst faces or ruin your best. Risk play that rewards dice with bad face distributions
- **Enhance a rune** → If you have any runes, double one rune's effect value permanently. If no runes, this option is greyed out. Rewards rune investment
- **Take the master's hammer** → Gain a unique artifact: "Master's Hammer — dice upgrades give +2/+2 instead of +1/+1 for the rest of the run." Only useful if you plan to upgrade more dice. Tall build dream item

---

### Act 3 Events (Floor 13)

The player's build is nearly complete. These events should offer final power spikes or desperate trades. The stakes are higher — the Void Lord is 2 floors away.

**The Blood Altar**
- *"The altar demands sacrifice. It promises power in return..."*
- **Sacrifice 30 HP** → Gain +5 permanent damage boost. Enormous offensive spike but you're heading into floor 14 shop and floor 15 boss with 30 less HP. Only take this if your defense is solid
- **Sacrifice an artifact** → Choose an artifact to destroy. Gain 2 skill points (2 additional skill tree nodes). Pivotal moment — trading a known quantity for build flexibility. Could unlock a capstone
- **Sacrifice a die** → Destroy a die. All remaining dice gain +1 to every face value permanently. Tall builds love this — fewer, stronger dice. Wide builds hate losing a die

**The Oracle**
- *"She sees your death at the hands of the Void Lord. But she offers alternatives..."*
- **Accept the vision** → The Oracle reveals the Void Lord's phase 2 and 3 triggers and abilities. Also grants "Foresight" — you see enemy intents 2 turns ahead instead of 1 for the rest of the run. Information advantage, no stats
- **Reject fate** → Gain +15 max HP and full heal. The practical choice. You're about to fight the hardest content in the game
- **Defy the Oracle** → Start the Void Lord fight with the boss at 90% HP instead of 100%. Saves ~2 turns of fighting. Aggressive players who trust their build take this

**The Merchant Prince**
- *"The wealthiest trader in the dungeon offers one final deal..."*
- **Buy everything** (100g) → Gain 3 random artifacts. Massive haul if you have the gold. Gold builds have been saving for this moment
- **Exclusive stock** (60g) → Choose 1 artifact from 5 options (instead of the usual 3). Better selection, lower cost. For players who need a specific piece
- **A proposition** → The merchant joins your cause. Gain "Merchant's Escort — gain 10 gold every combat for the rest of the run and shop prices are halved." Only valuable if there's a shop on floor 14 to exploit, but the gold per combat helps with gold scaling damage

---

### Event Selection

Each floor should randomly pick from its act's event pool. 3 events per act means each run you see one of three options. Over multiple runs the player sees different events, keeping the experience fresh.

If we want more variety later, expanding to 5-6 events per act pool is easy since the structure is established.

---

Does this feel right before we move to artifacts? Anything to adjust?