## Artifact Design Pass

Current artifacts are mostly stat sticks — flat damage, flat HP, percentage gold. With the new enemy mechanics, artifacts need to do three things:

**1. Build enablers** — amplify a specific strategy so it feels broken when it comes together
**2. Problem solvers** — answer specific enemy mechanics so counter-pick fights become manageable
**3. Interesting choices** — create tension when you're offered one. "This is amazing for my build but that one patches my weakness"

Artifacts drop from bosses (pick 1 of 3), elites (pick 1 of 3), and events. The player should have 3-5 artifacts by the end of a run.

---

### Build Enabler Artifacts

These make a specific archetype sing. Getting the right one early can define the run.

**Wide Build:**

| Artifact | Effect | Why It Matters |
|----------|--------|----------------|
| **Hydra's Crest** | +2 damage for every die you own | Already exists. Scales directly with die count. 7 dice = +14 damage |
| **Swarm Banner** | When 4+ dice are allocated to a single slot, that slot deals double | Rewards stacking a massive attack. Turns 4 average dice into a devastating hit |
| **Echo Stone** | The first die you allocate each turn is duplicated (counts twice in its slot) | Effectively a free extra die every turn. Wide builds get more value because they allocate more dice |

**Tall Build:**

| Artifact | Effect | Why It Matters |
|----------|--------|----------------|
| **Vorpal Edge** | Single die dealing 10+ damage in a slot deals triple instead of normal | Already exists conceptually. The payoff for upgrading dice to d10-d11 |
| **Precision Lens** | Rerolls always improve — if the new roll is lower, keep the original | Eliminates reroll risk. Tall builds reroll their one big die without fear |
| **Colossus Belt** | Dice with max value 9+ gain +3 to all face values | Direct upgrade to big dice. A d10 (5-10) becomes effectively (8-13) |

**Poison Build:**

| Artifact | Effect | Why It Matters |
|----------|--------|----------------|
| **Venom Gland** | Poison applied by any source is doubled | Already exists as Plague Lord capstone. As an artifact it's available without committing to the full tree |
| **Festering Wound** | Enemies take +1 damage from all sources for each stack of poison on them | Poison becomes a damage amplifier, not just DoT. 5 poison stacks means your attacks deal +5. Synergises with everything |
| **Toxic Blood** | When you take damage, apply 2 poison to the attacker | Defensive poison generation. Turns getting hit into a strategy. Troll hitting you 6 times? That's 12 poison |

**Gold Build:**

| Artifact | Effect | Why It Matters |
|----------|--------|----------------|
| **Merchant's Crown** | +1 attack damage per 20 gold held | Already exists. Core gold scaling piece |
| **Golden Aegis** | +1 block per 25 gold held | The defensive counterpart. 200 gold = +8 block per turn passively. Gold builds can finally defend |
| **Midas Die** | At the start of each combat, gain a temporary d6 that awards gold equal to its value when rolled (auto-fire, disappears after combat) | Free gold generation that doesn't cost a real die. Feeds the gold engine |

---

### Problem Solver Artifacts

These answer specific enemy mechanics. Getting one before you hit the relevant counter-pick enemy can save a run.

| Artifact | Effect | Solves |
|----------|--------|--------|
| **Anchored Slots** | Your slots cannot be disabled by enemy abilities | Dark Mage curse, Void Lord Void Rift, Wyrm Wing Buffet. Build-agnostic defensive tool |
| **Soul Mirror** | Unblockable damage is reduced by 50% | Demon Hellfire, Void Lord Dark Pulse. Turns 5 unblockable into 2-3 |
| **Phase Cloak** | 30% chance to completely avoid any enemy ability (not basic attacks) | General purpose. Unreliable but covers everything. Lucky procs can trivialise a fight |
| **Iron Will** | Your dice values cannot be reduced by enemy effects | Lich Decay Aura, Void Lord Entropy. Tall builds especially need this |
| **Thorn Mail** | When you take damage, deal 3 back to the attacker | Dire Rat double hits, Vampire attacks, any high-frequency attacker. Passive damage that bypasses Golem armor and Troll threshold because it's not "a hit" |
| **Burnproof Cloak** | Immune to burn. Poison on you ticks for half value (round down) | Fungal Creep spores, Wyrm fire breath. Niche but game-saving when relevant |

---

### Interesting Choice Artifacts

These are powerful but come with a trade-off or require a specific situation to shine. They create the "hmm, which do I pick" moment.

| Artifact | Effect | The Tension |
|----------|--------|-------------|
| **Berserker's Mask** | +50% attack damage but you cannot allocate more than 1 die to defense | Enormous damage boost but your defense is capped at a single die. Do you trust your offense to end fights fast? |
| **Glass Cannon** | All dice gain +3 to every face value but your max HP is halved | Your d6 becomes effectively a d6 rolling 4-9. Incredible power but you're playing on 40 HP instead of 80. One bad turn kills you |
| **Gambler's Coin** | At the start of each combat, flip a coin. Heads: all dice gain +2 this fight. Tails: all dice get -1 this fight | Average outcome is positive (+0.5 per die) but the variance is wild. Some fights you're a god, some you're crippled |
| **Hourglass** | You get an extra turn at the start of every combat (roll and execute before the enemy acts) | A free opening salvo. Wide builds can burst something down immediately. But it's "just" one turn — is that better than a permanent stat boost? |
| **Parasite** | Whenever you kill an enemy, permanently gain +1 max HP and +1 to your gold earned. Stacks all run | Weak early, absurd late. By floor 15 you've killed ~8-10 enemies, so it's +8-10 HP and +8-10 gold per fight. The long game artifact |
| **Blood Pact** | At the start of each turn, lose 3 HP. All your damage is increased by 30% | Constant bleed for a massive damage multiplier. Regen builds can offset the cost. Everyone else is on a timer. Creates build-around moments — "I need healing to make this work" |

---

### Artifact Distribution

**Current drops:**
- Act 1 boss: pick 1 of 3
- Act 2 boss: pick 1 of 3
- Elites (floors 8, 12): pick 1 of 3
- Events: occasionally as a choice

That's 4 artifact opportunities per run (2 bosses + 2 elites), plus events. Player ends with 3-5 artifacts.

**Offering logic:**
Each pick-1-of-3 should offer variety. Ideally one build enabler, one problem solver, one interesting choice. This prevents the player from always seeing three stat sticks or three niche items.

The pool should be curated per act:
- **Act 1 offerings** draw from simpler artifacts — stat boosts, basic build enablers. No Berserker's Mask or Blood Pact yet
- **Act 2 offerings** introduce problem solvers and the first interesting choices. The player's build is forming so counter-pick solutions become valuable
- **Act 3 offerings** include everything. The endgame artifacts with big trade-offs appear here when the player can evaluate whether their build can handle the downside

---

### Artifacts to Retire or Rework

Looking at the current artifact list, some overlap with the new designs or are too bland:

- **Phoenix Heart** (heal 5 at combat start) — fine for Act 1, too weak later. Keep but restrict to Act 1 pool
- **Blade Oil** (+2 damage) — replaced by more interesting damage sources. Cut or fold into shop consumables
- **Lucky Charm** (+1 reroll) — fine as is, universally useful
- **Tax Collector** (+10 gold per kill) — keep, core gold build piece
- **Gilded Gauntlet** (spend 50g for 15 damage at combat start) — keep, interesting gold build burst option

---

Ready to move to something else, or want to refine any of these?