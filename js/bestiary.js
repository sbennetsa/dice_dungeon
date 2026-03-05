// ════════════════════════════════════════════════════════════
//  BESTIARY — Field Compendium data + UI controller
//  Lore and ability descriptions are flavour/tutorial text;
//  mechanical values come from constants.js / combat.js.
// ════════════════════════════════════════════════════════════

import { ENEMIES, BOSSES } from './constants.js';

// ════════════════════════════════════════════════════════════
//  BESTIARY DATA
//  Entry shape:
//  {
//    id:             string   — matches enemy id in constants.js
//    name:           string
//    act:            1 | 2 | 3 | 'boss'
//    artSrc:         string | null
//    artCaption:     string | null
//    annotations:    Array<{label, value}>
//    classification: { threat, habitat }
//    lore:           string   — first letter gets drop-cap treatment
//    abilities:      Array<{name, type, description}>
//  }
//  Runtime fields `unlocked` and `encounters` are injected from
//  BestiaryProgress before constructing BestiaryUI.
// ════════════════════════════════════════════════════════════

export const BESTIARY_DATA = [

    // ── ACT I ────────────────────────────────────────────────

    {
        id: 'goblin', name: 'Goblin', act: 1,
        artSrc: 'assets/enemies/card/goblin.webp', sketchSrc: 'assets/enemies/sketch/goblin_sketch.webp',
        artCaption: 'Field sketch — note the improvised armour and stolen equipment.',
        annotations: [
            { label: 'Height',    value: 'Three to four feet. Poor posture. Eyes that catch torchlight from improbable angles.' },
            { label: 'Tactics',   value: 'Commit everything, hit fast. No patience, no strategy. Effective in the opening floors.' },
            { label: 'Weakness',  value: 'Thin skin and no staying power — sustain your guard and they crumble.' },
        ],
        classification: { threat: 'Common', habitat: 'Dungeon Upper Reaches' },
        lore: 'Goblins haunt the dungeon\'s upper reaches in search of anything worth taking or breaking. Their dice — two clumsy four-sided affairs — don\'t suggest sophistication, but they don\'t need it. A goblin\'s advantage is that it never hesitates: it commits everything to a rush, accepts that it will probably hurt itself in the process, and hopes the adventurer isn\'t ready. Most experienced delvers aren\'t threatened by goblins. The ones who were didn\'t become experienced.',
        abilities: [
            { name: 'Frenzied Rush', type: 'Active',  description: 'Strikes with its full dice pool. What it lacks in precision it makes up in willingness.' },
        ],
    },

    {
        id: 'dire_rat', name: 'Dire Rat', act: 1,
        artSrc: 'assets/enemies/card/direrat.webp', sketchSrc: 'assets/enemies/sketch/dire_rat.webp',
        artCaption: 'Highly adaptable. Specimens observed across all three acts.',
        annotations: [
            { label: 'Behaviour', value: 'Three strikes in the time a sword swings once. Speed, not strength.' },
            { label: 'Frenzy',    value: 'Each die in its pool lands as a separate hit. Your guard is tested individually, not once.' },
            { label: 'Note',      value: 'The name refers to temperament, not dimensions. It is about the size of a large cat.' },
        ],
        classification: { threat: 'Common', habitat: 'Sewers & Rubble' },
        lore: 'Where a common rat bites once and scurries, the Dire Rat commits entirely — a flurry of bites in rapid succession, each die hitting separately, each individually minor but collectively punishing. They are drawn to motion and sound. Experienced delvers have learned to step carefully: a rattling dice bag will attract a pack before a torch ever would. The name refers to temperament, not dimensions. This does not make it less dangerous.',
        abilities: [
            { name: 'Frenzy', type: 'Active', description: 'Each die in its pool hits separately. Multiple small strikes rather than one large one — tests guard across multiple impacts.' },
        ],
    },

    {
        id: 'fungal_creep', name: 'Fungal Creep', act: 1,
        artSrc: 'assets/enemies/card/fungal_creep.webp', sketchSrc: 'assets/enemies/sketch/fungal_spore.webp',
        artCaption: 'Fruiting bodies have been found on adventurers who rested too long.',
        annotations: [
            { label: 'Origin',   value: 'Believed to grow from adventurers who rested too long in wet chambers.' },
            { label: 'Spores',   value: 'Inhaled spores persist as poison. The pain accumulates with each breath.' },
            { label: 'Strategy', value: 'End it quickly. Every turn it breathes, you pay a cost that stacks.' },
        ],
        classification: { threat: 'Common', habitat: 'Flooded Passages' },
        lore: 'The Fungal Creep does not think. It spreads. Found in the dungeon\'s damp lower passages, it shambles toward warmth and light, exhaling clouds of spores that foul the lungs and cloud the mind. Adventurers who survive an encounter consistently report that the worst part was the smell — a sweetness that persists in the throat for days, making every roll feel slightly less reliable. Naturalists who have catalogued it note, without sentiment, that it is almost certainly growing from something that used to be a person.',
        abilities: [
            { name: 'Strike',      type: 'Active', description: 'A lumbering blow. Unsubtle.' },
            { name: 'Spore Cloud', type: 'Active', description: 'Exhales a cloud of fungal spores — applies poison equal to its dice sum. Alternates with its strike.' },
        ],
    },

    {
        id: 'slime', name: 'Slime', act: 1,
        artSrc: 'assets/enemies/card/slime.webp', sketchSrc: 'assets/enemies/sketch/slime.webp',
        artCaption: 'Neither liquid nor solid. Strikes without committing shape.',
        annotations: [
            { label: 'Consistency', value: 'Neither liquid nor solid. Strikes without committing shape.' },
            { label: 'Behaviour',   value: 'Slow and patient. If it is not dying, it is growing.' },
            { label: 'Critical',    value: 'Three turns. That is all you have before the nature of the fight changes entirely.' },
        ],
        classification: { threat: 'Common', habitat: 'Flooded Chambers' },
        lore: 'A Slime encountered at the start of a fight is a manageable nuisance. A Slime that has been given three turns to grow is something else entirely. Naturalists have documented the mitosis event — the creature simply divides its mass, reorganises, and emerges larger and more resilient, with bigger dice and additional hit points. The only effective approach is aggression. Those who play carefully against slimes, parcelling out damage, measuring their resources, rarely need to file a second report.',
        abilities: [
            { name: 'Strike',   type: 'Active',  description: 'Strikes repeatedly. The damage is unremarkable until mitosis completes.' },
            { name: 'Mitosis',  type: 'Passive', description: 'After three turns, evolves — gains larger dice and additional HP. The fight becomes significantly harder if this triggers.' },
        ],
    },

    {
        id: 'skeleton', name: 'Skeleton', act: 1,
        artSrc: 'assets/enemies/card/skeleton.webp', sketchSrc: 'assets/enemies/sketch/skeleton.webp',
        artCaption: 'Armed with weapons from a forgotten war; their cause long since dissolved.',
        annotations: [
            { label: 'Origin',        value: 'Reanimated soldiers of the pre-dungeon garrison. Loyalty persists beyond death.' },
            { label: 'Brittleness',   value: 'Takes 3 additional damage from every strike. They crack easily under sustained pressure.' },
            { label: 'Armament',      value: 'Two heavy dice, legacy of actual combat training. Do not underestimate the rolls.' },
        ],
        classification: { threat: 'Common', habitat: 'Barracks & Armories' },
        lore: 'Skeleton Guards march in silence, following patrol routes set centuries before any living soul walked these halls. Their bones crack loudly under pressure — brittle from long years of dry dungeon air — and this is the critical tactical detail: the same brittleness that makes them sound dangerous makes every hit you land count for more. They carry heavy dice, d6s from a life of genuine soldiering. The trick is to survive long enough to exploit the vulnerability.',
        abilities: [
            { name: 'Strike',  type: 'Active',  description: 'A disciplined blow from an old soldier. The d6 dice are larger than the opener suggests.' },
            { name: 'Brittle', type: 'Passive', description: 'The skeleton\'s bones are desiccated and fragile. Every hit it takes deals 3 additional damage.' },
        ],
    },

    // ── ACT II ───────────────────────────────────────────────

    {
        id: 'orc_warrior', name: 'Orc Warrior', act: 2,
        artSrc: 'assets/enemies/card/orc_warrior.webp', sketchSrc: 'assets/enemies/sketch/orc_warrior.webp', artCaption: 'The cry is not for show. Brace for what follows.',
        annotations: [
            { label: 'Build',    value: 'Dense muscle over a frame that has absorbed considerable damage in a previous career.' },
            { label: 'War Cry',  value: 'Stores its entire dice pool. The next strike lands with that surplus added.' },
            { label: 'Cycle',    value: 'Strike, strike, war cry. The pattern does not vary. Read it and guard accordingly.' },
        ],
        classification: { threat: 'Elite', habitat: 'Stone Halls' },
        lore: 'The Orc Warrior does not feint. It builds. Every swing is a declaration; the war cry that follows charges something deep in its blood — stored fury that amplifies the next blow. Adventurers who have survived multiple encounters in the second act describe a simple discipline: block the first two strikes, worry about the cry, and accept that the strike after the cry will be the worst thing in the room. The third action in every cycle is the dangerous one. The first two exist to set it up.',
        abilities: [
            { name: 'Strike',  type: 'Active', description: 'Standard attack. Heavy, but readable.' },
            { name: 'War Cry', type: 'Active', description: 'Stores its dice sum and adds it to the next strike. The following attack is notably larger.' },
        ],
    },

    {
        id: 'dark_mage', name: 'Dark Mage', act: 2,
        artSrc: 'assets/enemies/card/Dark_Mage.webp', sketchSrc: 'assets/enemies/sketch/dark_mage.webp',
        artCaption: 'The dice it rolls are the colour of smoke.',
        annotations: [
            { label: 'Appearance',   value: 'Hunched, robed. The dice it rolls are the colour of smoke.' },
            { label: 'Shadow Bolt',  value: 'Penetrates 3 points of block. Your guard dice are partially irrelevant against this.' },
            { label: 'Curse',        value: 'Seals your strike zone for two turns. Your offence becomes unavailable at the worst moment.' },
        ],
        classification: { threat: 'Elite', habitat: 'Cursed Chambers' },
        lore: 'The Dark Mage does not fight fairly, and this is not an insult — it is a tactical observation. Its shadow bolts punch through guard by design, seeking flesh past the armour you\'ve allocated. The curse it weaves is subtler: two turns with a sealed strike zone, forcing the hand toward defence at precisely the moment the adventurer wishes to press forward. Scholars classify it as a control opponent. This is another way of saying it wins if you play into it.',
        abilities: [
            { name: 'Shadow Bolt', type: 'Active', description: 'Deals damage and penetrates 3 block. A portion of your guard allocation is meaningless against this.' },
            { name: 'Curse',       type: 'Active', description: 'Seals the player\'s strike zone for 2 turns. Removes the offensive option entirely.' },
        ],
    },

    {
        id: 'troll', name: 'Troll', act: 2,
        artSrc: 'assets/enemies/card/Troll.webp', sketchSrc: 'assets/enemies/sketch/troll.webp',
        artCaption: 'The dungeon floor shows stress marks in rooms where they patrol.',
        annotations: [
            { label: 'Mass',              value: 'Considerable. The dungeon floor bears stress marks in rooms where they patrol.' },
            { label: 'Thick Hide',        value: 'Slot damage below 10 is ignored entirely. Small hits are not hits.' },
            { label: 'Passive Recovery',  value: '3 HP returned each turn, regardless of action. It is always getting better.' },
        ],
        classification: { threat: 'Elite', habitat: 'Stone Halls & Waterways' },
        lore: 'A Troll brought to half health is still a Troll, and a Troll that is regenerating is harder to kill than one at full strength. The thick hide that sheaths its frame renders minor damage meaningless — anything below a threshold per slot simply does not register. Three health points return to it passively every turn, regardless of what it is doing. Adventurers who have learned to read its pattern report the same insight consistently: the heal action is the turning point. Survive it, deal enough to punish the recovery, and the thing will eventually stay down. Eventually.',
        abilities: [
            { name: 'Smash',       type: 'Active',  description: 'A heavy, straightforward blow. The d8 dice hurt.' },
            { name: 'Regenerate',  type: 'Active',  description: 'Heals HP equal to its dice sum. This is the dangerous action in its rotation.' },
            { name: 'Thick Hide',  type: 'Passive', description: 'Ignores all slot damage below 10. You need to commit to large strikes to make progress.' },
            { name: 'Regen',       type: 'Passive', description: 'Recovers 3 HP at the start of every turn. Attrition favours the troll.' },
        ],
    },

    {
        id: 'vampire', name: 'Vampire', act: 2,
        artSrc: 'assets/enemies/card/Vampire.webp', sketchSrc: 'assets/enemies/sketch/vampire.webp',
        artCaption: 'Feeds on vitality exchanged in combat. The old name is imprecise but has stuck.',
        annotations: [
            { label: 'Nature',       value: 'Feeds on vitality exchanged in combat. The old name is imprecise but has stuck.' },
            { label: 'Drain',        value: 'Each point of damage it deals returns to it, halved. Trading evenly is a net loss.' },
            { label: 'Blood Frenzy', value: 'Below 20% HP, gains 2 additional d6. Do not let it reach this state.' },
        ],
        classification: { threat: 'Elite', habitat: 'Cursed Crypts' },
        lore: 'The Vampire does not merely deal damage — it transfers it. Every wound it inflicts returns to it as vitality, making sustained trading a losing proposition. Veterans of the middle floors describe a second danger: drive it low enough, and the blood frenzy activates. Below one-fifth health, two additional dice appear from nowhere, and the creature that was almost dead becomes temporarily formidable again. The moment to kill a vampire is not when it\'s weak. It\'s the moment before it knows it\'s weak.',
        abilities: [
            { name: 'Drain',        type: 'Active',  description: 'Deals damage and heals 50% of the amount dealt. Every hit it lands is also a heal.' },
            { name: 'Lifesteal',    type: 'Passive', description: 'All damage dealt to the player heals the vampire for 50%.' },
            { name: 'Blood Frenzy', type: 'Passive', description: 'Below 20% HP, immediately gains 2 additional d6 dice.' },
        ],
    },

    {
        id: 'mimic', name: 'Mimic', act: 2,
        artSrc: 'assets/enemies/card/Mimic.webp', sketchSrc: 'assets/enemies/sketch/mimic.webp',
        artCaption: 'Indistinguishable from a chest until it moves.',
        annotations: [
            { label: 'Detection',  value: 'Indistinguishable from a chest until it moves. By then, it has already acted.' },
            { label: 'Gold Snatch', value: 'Opens combat by stealing gold equal to its dice sum. The strikes that follow are well-funded.' },
            { label: 'Greed Tax',  value: 'Every 100 gold you carry adds another d6 to its pool. It scales with your wealth.' },
        ],
        classification: { threat: 'Common', habitat: 'Treasure Rooms' },
        lore: 'A Mimic that has sat in a dungeon long enough has learned to wait. It knows the treasure room routes, knows what adventurers carry, and knows exactly how much gold makes a target worth engaging. The wealthier the player, the larger the dice pool it produces — as if the smell of coin physically strengthens it. Experienced delvers empty their purses before the deeper floors. The ones who don\'t tend to feed it.',
        abilities: [
            { name: 'Gold Snatch', type: 'Active',  description: 'Steals gold equal to its dice sum. Opens every encounter with this.' },
            { name: 'Strike',      type: 'Active',  description: 'Follows the theft with standard attacks.' },
            { name: 'Greed Tax',   type: 'Passive', description: 'Gains +1d6 for every 100 gold the player is carrying when combat starts.' },
        ],
    },

    // ── ACT III ──────────────────────────────────────────────

    {
        id: 'demon', name: 'Demon', act: 3,
        artSrc: 'assets/enemies/card/Demon.webp', sketchSrc: 'assets/enemies/sketch/demon.webp',
        artCaption: 'The dungeon generates them as reliably as it generates rats, further down.',
        annotations: [
            { label: 'Origin',    value: 'Unknown. The dungeon generates them as reliably as it generates rats, further down.' },
            { label: 'Hellfire',  value: 'Maximum 20 damage, bypasses all block. Guard dice are irrelevant against this action.' },
            { label: 'Soul Pact', value: 'Overkill damage reflects back. There is a cost to landing more than it has HP remaining.' },
        ],
        classification: { threat: 'Elite', habitat: 'The Burning Corridors' },
        lore: 'The Demon burns with purpose. Its standard strikes are terrible enough — three d12 dice against a tired adventurer is a reckoning in itself — but the hellfire it calls down does not care where you have placed your guard dice. Unblockable damage in the third act. The soulPact passive is subtler and crueller: deal too much damage at once, and the excess reflects. It has made a bargain that punishes overextension. Read the intention carefully before you commit to your strike allocation.',
        abilities: [
            { name: 'Strike',    type: 'Active',  description: 'A direct attack with three d12 dice. Substantial.' },
            { name: 'Hellfire',  type: 'Active',  description: 'Deals unblockable damage up to a maximum of 20. Guard allocation is meaningless against this.' },
            { name: 'Soul Pact', type: 'Passive', description: 'Overkill damage is reflected back to the player.' },
        ],
    },

    {
        id: 'lich', name: 'Lich', act: 3,
        artSrc: 'assets/enemies/card/Lich.webp', sketchSrc: 'assets/enemies/sketch/lich.webp',
        artCaption: 'Has refused death long enough that death no longer applies directly.',
        annotations: [
            { label: 'Classification', value: 'Undead spellcaster. Has refused death long enough that death no longer applies directly.' },
            { label: 'Decay',          value: 'Permanently reduces your dice ceiling this combat. It compounds with each cast.' },
            { label: 'Phylactery',     value: 'It will return once, at 40% HP. Assume a second phase and plan accordingly.' },
        ],
        classification: { threat: 'Elite', habitat: 'The Ossuary Depths' },
        lore: 'The Lich has outlasted death once already. Its phylactery will carry it back from 0 HP to 40%, and by the time a second killing blow lands, its Decay ability will have reduced your dice to something diminished. Each cast of Decay permanently trims the maximum face value of every die in your pool for the remainder of the fight. The Lich wins patience games. Burn it down fast, keep enough left to finish the job when it rises — because it will rise.',
        abilities: [
            { name: 'Strike',      type: 'Active',  description: 'A direct attack. Standard, but with d12 dice it demands respect.' },
            { name: 'Decay',       type: 'Active',  description: 'Permanently reduces the maximum face value of all player dice for this combat. Cumulative.' },
            { name: 'Phylactery',  type: 'Passive', description: 'Upon reaching 0 HP, revives once at 40% of maximum HP.' },
        ],
    },

    {
        id: 'dragon_whelp', name: 'Dragon Whelp', act: 3,
        artSrc: 'assets/enemies/card/Dragon_Whelp.webp', sketchSrc: 'assets/enemies/sketch/dragon_whelp.webp',
        artCaption: 'Not young by any measure that matters.',
        annotations: [
            { label: 'Scale density', value: 'The first 8 damage from each zone is absorbed entirely. You must push past this threshold.' },
            { label: 'Tell',          value: 'A charge action precedes fire breath. The next action is twice as damaging.' },
            { label: 'Burn',          value: 'Fire Breath applies 3 stacks of burn. Even after the hit, it keeps costing you.' },
        ],
        classification: { threat: 'Elite', habitat: 'The Burning Descent' },
        lore: 'The Dragon Whelp is not young by any measure that matters. Its scales have calcified into armour plating — the first significant damage from each slot simply does not penetrate. More dangerous is the pattern: it charges, and then it breathes. The breath is doubled. Adventurers who have cleared the third act consistently identify the whelp\'s tell — the long inhale before the fire — as the most important information in any encounter. The charge is the warning. What follows is the consequence.',
        abilities: [
            { name: 'Strike',         type: 'Active',  description: 'Leads the rotation with a direct blow from four d12 dice.' },
            { name: 'Breath Charge',  type: 'Active',  description: 'Telegraphs the next action. Whatever follows deals double damage.' },
            { name: 'Fire Breath',    type: 'Active',  description: 'Deals doubled damage and applies 3 burn stacks. Follows Breath Charge.' },
            { name: 'Dragon Scales',  type: 'Passive', description: 'The first 8 damage per slot is ignored each turn. Small allocations accomplish nothing.' },
        ],
    },

    {
        id: 'shadow_assassin', name: 'Shadow Assassin', act: 3,
        artSrc: 'assets/enemies/card/Shadow_Assassin.webp', sketchSrc: 'assets/enemies/sketch/shadow_assassin.webp',
        artCaption: 'The dice pool is larger than the silhouette suggests.',
        annotations: [
            { label: 'Profile', value: 'Difficult to track in dungeon lighting. The dice pool is larger than the silhouette suggests.' },
            { label: 'Vanish',  value: 'Immune this turn. Whatever follows will be doubled. Plan your guard before it re-emerges.' },
            { label: 'Evasion', value: 'One of your strike dice is ignored each round. Not resisted — ignored entirely.' },
        ],
        classification: { threat: 'Elite', habitat: 'Shadow Passages' },
        lore: 'The Shadow Assassin does not telegraph. It positions. A turn spent vanishing is a turn spent preparing — the immunity it gains while unseen resets into a doubled strike that arrives before the player has fully committed their guard allocation. Its evasion is structural: every turn, one of your attack dice is simply ignored, negated by movement the player cannot track. Fighting it requires accepting that some effort will be lost and planning around that loss.',
        abilities: [
            { name: 'Strike',  type: 'Active',  description: 'A direct blow when not vanishing. Three d12 dice.' },
            { name: 'Vanish',  type: 'Active',  description: 'Immune to damage this turn. The following strike is doubled.' },
            { name: 'Evasion', type: 'Passive', description: 'One random player attack die is ignored each turn, contributing nothing.' },
        ],
    },

    {
        id: 'iron_golem', name: 'Iron Golem', act: 3,
        artSrc: 'assets/enemies/card/Iron_Golem.webp', sketchSrc: 'assets/enemies/sketch/iron_golem.webp',
        artCaption: 'The runes on its chest predate the dungeon itself.',
        annotations: [
            { label: 'Construction', value: 'Pre-Collapse war-forging. The runes on its chest predate the dungeon itself.' },
            { label: 'Armour',       value: '5 damage absorbed from every source, every turn. Small, accumulating hits accomplish nothing.' },
            { label: 'Escalate',     value: 'Every 3 turns, gains +1 eight-sided die. The longer the fight, the worse it becomes.' },
        ],
        classification: { threat: 'Elite', habitat: 'The Iron Vaults' },
        lore: 'The Iron Golem was constructed to be unkillable by anything short of real commitment. Its iron frame reduces all damage by five — including poison, including environmental effects — and every three turns it adds another die to its pool, growing inexorably stronger. The one exploitable trait is overcharge: strike it for twenty-five or more in a single round, and the electrical buildup stuns it for a turn. The golem is patient. So is the dungeon. The question is whether you can match them long enough to exploit the vulnerability.',
        abilities: [
            { name: 'Strike',      type: 'Active',  description: 'A direct, repetitive assault. No abilities beyond the strike — just the dice, growing over time.' },
            { name: 'Iron Armor',  type: 'Passive', description: 'Reduces all incoming damage by 5, including poison and environmental sources.' },
            { name: 'Escalate',    type: 'Passive', description: 'Gains an additional d8 die every 3 turns.' },
            { name: 'Overcharge',  type: 'Passive', description: 'If hit for 25 or more damage in a single turn, is stunned the following turn.' },
        ],
    },

    // ── BOSSES ───────────────────────────────────────────────

    {
        id: 'bone_king', name: 'The Bone King', act: 'boss',
        artSrc: 'assets/enemies/card/boneking.webp', sketchSrc: 'assets/enemies/sketch/bone_king.webp',
        artCaption: 'He has been here longer than the dungeon itself. Perhaps he built it.',
        annotations: [
            { label: 'Title',     value: 'Sovereign of the First Ossuary. The Undying Throne.' },
            { label: 'Behaviour', value: 'Does not rush. Waits. As if he already knows the outcome.' },
            { label: 'Warning',   value: 'His crown is made from the dice of those who failed. Count the faces.' },
        ],
        classification: { threat: 'Boss — Act I', habitat: 'The Throne of Dust' },
        lore: 'The Bone King predates every map of the dungeon. Cartographers who survived encountering him report that he communicates — not in words, but in the sound of dice rolling across stone, each face a syllable in a language older than language itself. He builds walls of bone that absorb what would otherwise be fatal blows, and each time one of those walls falls, he raises dead dice from the floor — permanently adding to his pool. He is not cruel. He is simply inevitable.',
        abilities: [
            { name: 'Strike',     type: 'Active', description: 'A measured, deliberate blow from three d6 dice. Patient and heavy.' },
            { name: 'Bone Wall',  type: 'Active', description: 'Raises a shield equal to his full dice sum. Absorbs the next blow entirely.' },
            { name: 'Raise Dead', type: 'Active', description: 'Permanently adds a d6 to his pool. Each use makes everything that follows harder.' },
        ],
    },

    {
        id: 'crimson_wyrm', name: 'Crimson Wyrm', act: 'boss',
        artSrc: 'assets/enemies/card/Crimson_Dragon.webp', sketchSrc: 'assets/enemies/sketch/crimson_dragon.webp',
        artCaption: 'The dungeon widened the passage to fit it. This is not a young creature.',
        annotations: [
            { label: 'Scale',      value: 'The dungeon widened the passage to fit it. This is not a young creature.' },
            { label: 'Pattern',    value: 'Strike, breathe, buffet. Know what comes next and position accordingly.' },
            { label: 'Phase note', value: 'Below 50% HP, every attack applies burn. Your guard strategy changes at that threshold.' },
        ],
        classification: { threat: 'Boss — Act II', habitat: 'The Burning Descent' },
        lore: 'The Crimson Wyrm has colonised the Burning Descent since before any cartographer mapped it, and the dungeon has grown to accommodate it — passages widen, ceilings raise, stone floors bear the scorch marks of centuries of residency. At full strength it cycles through strike, breath, and wing buffet — predictable but punishing. Survive to its midpoint and the dynamic shifts entirely: it gains two dice and begins burning on every attack. The second half of the fight is a different fight.',
        abilities: [
            { name: 'Strike',      type: 'Active',  description: 'A direct blow from four d10 dice.' },
            { name: 'Fire Breath', type: 'Active',  description: 'Deals damage and applies 3 burn stacks.' },
            { name: 'Wing Buffet', type: 'Active',  description: 'Deals half damage and seals one random player zone for 1 turn.' },
            { name: 'Inferno',     type: 'Passive', description: 'Phase II — Unlocked at 50% HP. Every attack from this point applies 2 burn stacks.' },
        ],
    },

    {
        id: 'void_lord', name: 'The Void Lord', act: 'boss',
        artSrc: 'assets/enemies/card/The_Void_Lord.webp', sketchSrc: 'assets/enemies/sketch/void_lord.webp',
        artCaption: 'Not a creature. A convergence. The dungeon\'s accumulated pressure given form.',
        annotations: [
            { label: 'Nature',       value: 'Not a creature. A convergence. The dungeon\'s accumulated pressure given form.' },
            { label: 'Void Rift',    value: 'Seals two of your zones simultaneously. Dice allocated there become dead weight.' },
            { label: 'Phase II/III', value: 'At 50% your dice degrade each turn. At 20%, double actions begin — but it takes 50% more damage.' },
        ],
        classification: { threat: 'Boss — Act III', habitat: 'The Null Chamber' },
        lore: 'The Void Lord is the dungeon\'s final argument against survival. It rotates through actions that seal your zones and strike past your guard entirely — the dark pulse is unblockable at up to twenty-two damage. Adventurers who have reached it and returned describe a fight in three distinct phases: the opening, where it is merely overwhelming; the midpoint, where entropy begins consuming your dice one maximum value per turn; and the collapse, below twenty percent health, where it attacks twice per cycle but finally begins to fracture. That last phase is survivable. But only if you are still standing when it arrives.',
        abilities: [
            { name: 'Strike',     type: 'Active',  description: 'A direct blow from four d10 dice.' },
            { name: 'Void Rift',  type: 'Active',  description: 'Seals 2 random player zones for 1 turn. Multiple allocation options become unavailable.' },
            { name: 'Dark Pulse', type: 'Active',  description: 'Deals unblockable damage up to a maximum of 22. Guard allocation is irrelevant.' },
            { name: 'Entropy',    type: 'Passive', description: 'Phase II — Unlocked at 50% HP. All player dice lose 1 maximum face value each turn.' },
            { name: 'Phase III',  type: 'Passive', description: 'Below 20% HP, takes double actions each cycle but receives 50% additional damage.' },
        ],
    },

];

// ════════════════════════════════════════════════════════════
//  COMBAT DATA HELPERS — pull live stats from constants.js
// ════════════════════════════════════════════════════════════

const ACT_NUMERALS = ['I', 'II', 'III'];

/** Format a dice array like [6,6,6] → "3d6", [6,6,8] → "2d6 + 1d8" */
function formatDice(arr) {
    const counts = {};
    for (const d of arr) counts[d] = (counts[d] || 0) + 1;
    return Object.entries(counts)
        .sort((a, b) => +b[0] - +a[0])
        .map(([sides, n]) => `${n}d${sides}`)
        .join(' + ');
}

/** Build the Combat Data HTML for a bestiary entry */
function buildCombatDataHTML(entry) {
    if (entry.act === 'boss') return _buildBossDataHTML(entry);
    const enemy = ENEMIES[entry.id];
    if (!enemy) return '';

    const allActs = [1, 2, 3].filter(a => enemy[`act${a}`]);
    const acts = allActs.filter(a => !entry.unlockedActs || entry.unlockedActs.has(a));
    if (!acts.length) return '';

    let prevAbilityKeys = new Set();
    let prevPassiveIds  = new Set();

    const rows = acts.map(a => {
        const block = enemy[`act${a}`];
        const abilityKeys = new Set(Object.keys(block.abilities || {}));
        const passiveIds  = new Set((block.passives || []).map(p => p.id));

        // Find new traits this act
        const newAbilities = [...abilityKeys].filter(k => !prevAbilityKeys.has(k));
        const newPassives  = [...passiveIds].filter(id => !prevPassiveIds.has(id));

        const traits = [];
        if (a === acts[0]) {
            // First act: show base abilities
            for (const k of abilityKeys) {
                const ab = block.abilities[k];
                traits.push(`${ab.name}${ab.desc ? ` \u2014 ${ab.desc}` : ''}`);
            }
            for (const p of block.passives || []) {
                traits.push(`${p.name}${p.desc ? ` \u2014 ${p.desc}` : ''}`);
            }
        } else {
            for (const k of newAbilities) {
                const ab = block.abilities[k];
                traits.push(`+ ${ab.name}${ab.desc ? ` \u2014 ${ab.desc}` : ''}`);
            }
            for (const p of (block.passives || []).filter(p => newPassives.includes(p.id))) {
                traits.push(`+ ${p.name}${p.desc ? ` \u2014 ${p.desc}` : ''}`);
            }
        }

        prevAbilityKeys = abilityKeys;
        prevPassiveIds  = passiveIds;

        const traitStr = traits.length
            ? traits.map(t => `<div class="bestiary-cd-trait-item">${t}</div>`).join('')
            : '\u2014';
        return `<tr>
            <td class="bestiary-cd-act">${ACT_NUMERALS[a - 1]}</td>
            <td class="bestiary-cd-num">${block.hp}</td>
            <td class="bestiary-cd-num">${formatDice(block.dice)}</td>
            <td class="bestiary-cd-traits">${traitStr}</td>
        </tr>`;
    }).join('');

    return `
        <div class="bestiary-combat-data">
            <div class="bestiary-cd-header">Combat Data</div>
            <table class="bestiary-cd-table">
                <thead><tr>
                    <th>Act</th><th>HP</th><th>Dice</th><th>Traits</th>
                </tr></thead>
                <tbody>${rows}</tbody>
            </table>
        </div>`;
}

function _buildBossDataHTML(entry) {
    const boss = Object.values(BOSSES).find(b => b.id === entry.id);
    if (!boss) return '';

    const floor = Object.keys(BOSSES).find(f => BOSSES[f].id === entry.id);

    const abilities = Object.values(boss.abilities || {}).map(a => `${a.icon || ''} ${a.name}`).join(' · ');
    const passives = (boss.passives || []).map(p => p.name).join(', ');

    let phasesHTML = '';
    if (boss.phases && boss.phases.length) {
        phasesHTML = `<div class="bestiary-cd-phases">` +
            boss.phases.map((ph, i) => {
                const parts = [];
                const hpPct = Math.round(ph.trigger.hpPercent * 100);
                if (ph.changes.healToPercent !== undefined)
                    parts.push(`Heals to ${Math.round(ph.changes.healToPercent * 100)}%`);
                if (ph.changes.addDice)
                    parts.push(`+${formatDice(ph.changes.addDice)}`);
                if (ph.changes.addPassives)
                    parts.push(ph.changes.addPassives.map(p => `+${p.name}`).join(', '));
                if (ph.changes.removePassives)
                    parts.push(ph.changes.removePassives.map(p => `\u2013${p}`).join(', '));
                if (ph.changes.doubleAction)
                    parts.push('Double action');
                if (ph.changes.damageTakenMultiplier)
                    parts.push(`Takes \u00d7${ph.changes.damageTakenMultiplier} damage`);
                return `<div class="bestiary-cd-phase">
                    <span class="bestiary-cd-phase-trigger">Phase ${i + 2} (${hpPct}% HP)</span>
                    <span class="bestiary-cd-phase-detail">${parts.join(' · ')}</span>
                </div>`;
            }).join('') + `</div>`;
    }

    return `
        <div class="bestiary-combat-data">
            <div class="bestiary-cd-header">Combat Data</div>
            <div class="bestiary-cd-boss-stats">
                <span class="bestiary-cd-num">HP ${boss.hp}</span>
                <span class="bestiary-cd-divider">\u00b7</span>
                <span class="bestiary-cd-num">${formatDice(boss.dice)}</span>
                <span class="bestiary-cd-divider">\u00b7</span>
                <span>Floor ${floor}</span>
            </div>
            ${passives ? `<div class="bestiary-cd-passives">Passive: ${passives}</div>` : ''}
            <div class="bestiary-cd-abilities">${abilities}</div>
            ${phasesHTML}
        </div>`;
}

// ════════════════════════════════════════════════════════════
//  BESTIARY UI CONTROLLER
//  Receives a merged data array where each entry has the static
//  fields above plus runtime fields:
//    unlocked:   boolean
//    encounters: number
// ════════════════════════════════════════════════════════════

export class BestiaryUI {
    constructor(data) {
        this.data      = data;
        this.filtered  = [...data];
        this.activeId  = null;
        this.activeAct = 'all';
        this.query     = '';

        this.$list   = document.getElementById('bestiary-index-list');
        this.$page   = document.getElementById('bestiary-parchment');
        this.$count  = document.getElementById('bestiary-index-count');
        this.$search = document.getElementById('bestiary-search-input');

        this._bindEvents();
        this._applyFilter();

        // Auto-open first unlocked entry
        const first = data.find(e => e.unlocked);
        if (first) this._openEntry(first.id);
    }

    _bindEvents() {
        document.querySelectorAll('.bestiary-filter-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                document.querySelectorAll('.bestiary-filter-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                this.activeAct = btn.dataset.act;
                this._applyFilter();
            });
        });
        this.$search.addEventListener('input', e => {
            this.query = e.target.value.toLowerCase().trim();
            this._applyFilter();
        });
    }

    _applyFilter() {
        this.filtered = this.data.filter(e => {
            if (e.act === 'boss' && !e.unlocked) return false;
            const actMatch = this.activeAct === 'all' || String(e.act) === this.activeAct;
            const qMatch   = !this.query || e.name.toLowerCase().includes(this.query);
            return actMatch && qMatch;
        });
        this._renderIndex();
        const discovered = this.filtered.filter(e => e.unlocked).length;
        this.$count.textContent = `${discovered} / ${this.filtered.length} discovered`;
    }

    _renderIndex() {
        this.$list.innerHTML = '';
        this.filtered.forEach(entry => {
            const isActive = entry.id === this.activeId;
            const el = document.createElement('div');
            el.className = `bestiary-index-entry${entry.unlocked ? '' : ' locked'}${isActive ? ' active' : ''}`;
            el.dataset.id = entry.id;

            let thumbHTML;
            if (entry.unlocked && entry.artSrc) {
                thumbHTML = `<div class="bestiary-entry-thumb"><img src="${entry.artSrc}" alt="${entry.name}"/></div>`;
            } else if (entry.unlocked) {
                thumbHTML = `<div class="bestiary-entry-thumb" style="font-family:var(--font-heading);font-size:1.1rem;font-weight:700;color:#4a3820;opacity:0.55">${entry.name[0]}</div>`;
            } else {
                thumbHTML = `<div class="bestiary-entry-thumb bestiary-locked-thumb">
                    <svg width="22" height="28" viewBox="0 0 22 28" fill="none">
                        <ellipse cx="11" cy="8" rx="6" ry="7" fill="rgba(50,30,10,0.28)"/>
                        <path d="M2 28 Q4 17 11 15 Q18 17 20 28Z" fill="rgba(50,30,10,0.28)"/>
                    </svg></div>`;
            }

            el.innerHTML = `${thumbHTML}
                <div class="bestiary-entry-info">
                    <div class="bestiary-entry-name${entry.unlocked ? '' : ' locked'}">${entry.unlocked ? entry.name : '??? Unknown ???'}</div>
                </div>`;

            if (entry.unlocked) el.addEventListener('click', () => this._openEntry(entry.id));
            this.$list.appendChild(el);
        });
    }

    _openEntry(id) {
        this.activeId = id;
        document.querySelectorAll('.bestiary-index-entry').forEach(el =>
            el.classList.toggle('active', el.dataset.id === id)
        );
        const entry = this.data.find(e => e.id === id);
        if (!entry) return;
        entry.unlocked ? this._renderEntry(entry) : this._renderLocked(entry);
        document.getElementById('bestiary-page').scrollTop = 0;
    }

    _renderLocked(entry) {
        this.$page.innerHTML = `
            <div class="bestiary-page-border"></div>
            <div class="bestiary-corner tl">❧</div><div class="bestiary-corner tr">❧</div>
            <div class="bestiary-corner bl">❧</div><div class="bestiary-corner br">❧</div>
            <div class="bestiary-locked-page-content">
                <div class="bestiary-lock-sigil">⧖</div>
                <div class="bestiary-locked-name-hint">? ? ? ? ? ? ?</div>
                <div class="bestiary-locked-flavour">This creature has not yet been encountered. Venture deeper into the dungeon to reveal its secrets.</div>
            </div>`;
    }

    _renderEntry(entry) {
        const tierClass = entry.act === 'boss' ? 'boss' : 'elite';
        const tierLabel = entry.act === 'boss' ? 'Boss Encounter' : 'Elite';
        const showTierTag = entry.act === 'boss' || entry.classification.threat === 'Elite';
        const unlocked = this.data.filter(e => e.unlocked);
        const entryNum = unlocked.findIndex(e => e.id === entry.id) + 1;

        const imgSrc = entry.sketchSrc || entry.artSrc;
        const hasSketch = !!entry.sketchSrc;
        const rotations = [-1.2, 0.7, -0.6, 1.0, -0.9, 0.5];

        const renderNote = (a, idx) => {
            const rot = rotations[(idx * 2) % rotations.length];
            return `<div class="bestiary-field-note" style="transform:rotate(${rot}deg)">
                <div class="bestiary-field-note-label">${a.label}</div>
                <div class="bestiary-field-note-value">${a.value}</div>
            </div>`;
        };

        const artClass = hasSketch ? 'bestiary-creature-art has-sketch' : 'bestiary-creature-art';
        const artInner = imgSrc
            ? `<img src="${imgSrc}" alt="${entry.name}">`
            : `<div class="bestiary-art-placeholder">${entry.name[0]}</div>`;

        const captionHTML = entry.artCaption
            ? `<div class="bestiary-art-caption">${entry.artCaption}</div>` : '';

        const abilitiesColHTML = entry.abilities.length
            ? `<div class="bestiary-abilities-title" style="margin-bottom:10px">Observed Abilities</div>
               ${entry.abilities.map(a => `
                 <div class="bestiary-ability-entry">
                   <div class="bestiary-ability-name">${a.name}<span class="bestiary-ability-type">[${a.type}]</span></div>
                   <div class="bestiary-ability-desc">${a.description}</div>
                 </div>`).join('')}`
            : '';

        const fieldNotesHTML = `
            <div class="bestiary-field-notes${hasSketch ? ' has-sketch' : ''}">
                <div class="bestiary-notes-column left">
                    ${entry.annotations.map((a, i) => renderNote(a, i)).join('')}
                </div>
                <div class="bestiary-field-image">
                    <div class="${artClass}">${artInner}</div>
                    ${captionHTML}
                </div>
                <div class="bestiary-notes-column right">
                    ${abilitiesColHTML}
                </div>
            </div>`;

        const encounterText = entry.encounters === 1 ? '1 recorded' : `${entry.encounters} recorded`;

        this.$page.innerHTML = `
            <div class="bestiary-page-border"></div>
            <div class="bestiary-corner tl">❧</div><div class="bestiary-corner tr">❧</div>
            <div class="bestiary-corner bl">❧</div><div class="bestiary-corner br">❧</div>

            <div class="bestiary-page-header">
                <div class="bestiary-header-rule"><span class="bestiary-creature-name">${entry.name}</span></div>
            </div>

            ${fieldNotesHTML}

            <div class="bestiary-classification-strip">
                <span class="bestiary-classif-tag"><strong>Threat</strong> ${entry.classification.threat}</span>
                <span class="bestiary-classif-divider">·</span>
                <span class="bestiary-classif-tag"><strong>Habitat</strong> ${entry.classification.habitat}</span>
                <span class="bestiary-classif-divider">·</span>
                <span class="bestiary-classif-tag"><strong>Encounters</strong> ${encounterText}</span>
            </div>

            <div class="bestiary-lore-section">
                <p class="bestiary-lore-text">${entry.lore}</p>
            </div>

            ${buildCombatDataHTML(entry)}

            <div class="bestiary-page-footer">
                ${showTierTag ? `<span class="bestiary-act-tag ${tierClass}" style="padding:2px 8px">${tierLabel}</span>` : ''}
                <span class="bestiary-footer-entry-num">Entry ${entryNum} of ${unlocked.length} discovered</span>
            </div>`;
    }
}
