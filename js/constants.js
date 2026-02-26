// ════════════════════════════════════════════════════════════
//  FLOOR LAYOUT
// ════════════════════════════════════════════════════════════
export function getFloorType(floor) {
    const layout = {
        1: 'combat', 2: 'combat', 3: 'event', 4: 'shop', 5: 'boss',
        6: 'combat', 7: 'event', 8: 'elite', 9: 'shop', 10: 'boss',
        11: 'combat', 12: 'elite', 13: 'event', 14: 'shop', 15: 'boss',
    };
    return layout[floor] || 'combat';
}

export function getAct(floor) {
    if (floor <= 5) return 1;
    if (floor <= 10) return 2;
    return 3;
}

// ════════════════════════════════════════════════════════════
//  ENEMIES
// ════════════════════════════════════════════════════════════
export const ENEMIES = {
    // Index order matters: [Goblin=0, Dire Rat=1, Fungal Creep=2, Slime=3, Skeleton=4]
    1: [
        {
            name: 'Goblin', hp: 20, atk: 5, gold: 17,
            abilities: []
        },
        {
            name: 'Dire Rat', hp: 14, atk: 4, gold: 15,
            abilities: [
                { name: 'Frenzy', icon: '⚔️', passive: true, desc: 'Attacks twice per turn (4+4)' }
            ]
        },
        {
            name: 'Fungal Creep', hp: 22, atk: 3, gold: 18,
            abilities: [
                { name: 'Spore Cloud', icon: '🟢', passive: false, desc: 'Every 2 turns: 2 poison/turn for 3 turns instead of attacking' }
            ]
        },
        {
            name: 'Slime', hp: 28, atk: 3, gold: 21,
            abilities: [
                { name: 'Mitosis', icon: '⏳', passive: false, desc: 'Turn 3: transforms into Slimeling Swarm (20 HP, 6 ATK)' }
            ]
        },
        {
            name: 'Skeleton', hp: 18, atk: 6, gold: 17,
            abilities: [
                { name: 'Brittle', icon: '💀', passive: true, desc: '+3 damage taken from every source' }
            ]
        },
    ],
    2: [
        {
            name: 'Orc Warrior', hp: 45, atk: 11, gold: 21,
            abilities: [
                { name: 'War Cry', icon: '🔥', passive: false, desc: 'Every 3 turns: next attack deals double damage' }
            ]
        },
        {
            name: 'Dark Mage', hp: 32, atk: 8, gold: 25,
            abilities: [
                { name: 'Penetration', icon: '🟣', passive: true, desc: 'All attacks ignore 3 block' },
                { name: 'Curse', icon: '🟣', passive: false, desc: 'Every 3 turns: disables your most-stacked slot for 2 turns' }
            ]
        },
        {
            name: 'Troll', hp: 55, atk: 9, gold: 23,
            abilities: [
                { name: 'Thick Hide', icon: '🛡️', passive: true, desc: 'Ignores hits below 10 damage' },
                { name: 'Regenerate', icon: '💚', passive: true, desc: 'Heals 3 HP at the start of each turn' }
            ]
        },
        {
            name: 'Vampire', hp: 38, atk: 12, gold: 29,
            abilities: [
                { name: 'Lifesteal', icon: '🩸', passive: true, desc: 'Heals 50% of damage dealt to you (after block)' },
                { name: 'Blood Frenzy', icon: '🩸', passive: false, desc: 'Below 20% HP: attacks twice per turn' }
            ]
        },
        {
            name: 'Mimic', hp: 35, atk: 10, gold: 25,
            abilities: [
                { name: 'Surprise', icon: '💰', passive: false, desc: 'Turn 1: attacks first and steals 15 gold' },
                { name: 'Greed Tax', icon: '💰', passive: true, desc: '+1 ATK per 50 gold you hold (recalculated each turn)' }
            ]
        },
    ],
    3: [
        {
            name: 'Demon', hp: 75, atk: 17, gold: 37,
            abilities: [
                { name: 'Hellfire', icon: '🔥', passive: true, desc: '5 unblockable damage to you every turn' },
                { name: 'Soul Pact', icon: '👹', passive: true, desc: 'Excess damage beyond remaining HP is reflected back to you' }
            ]
        },
        {
            name: 'Lich', hp: 65, atk: 14, gold: 42,
            abilities: [
                { name: 'Decay Aura', icon: '💀', passive: true, desc: 'All your dice are -1 after rolling (min 1)' },
                { name: 'Phylactery', icon: '💀', passive: false, desc: 'First death: revives at 26 HP — second kill is permanent' }
            ]
        },
        {
            name: 'Dragon Whelp', hp: 85, atk: 16, gold: 45,
            abilities: [
                { name: 'Scales', icon: '🐉', passive: true, desc: 'First 8 damage from your attack slot is ignored each turn' },
                { name: 'Breath', icon: '🔥', passive: false, desc: 'Every 4 turns: charges for 1 turn, then 30 damage' }
            ]
        },
        {
            name: 'Shadow Assassin', hp: 45, atk: 22, gold: 42,
            abilities: [
                { name: 'Evasion', icon: '💨', passive: true, desc: 'One random attack die is negated each turn' },
                { name: 'Expose', icon: '💨', passive: true, desc: '+5 damage per empty attack slot you have' }
            ]
        },
        {
            name: 'Iron Golem', hp: 100, atk: 12, gold: 45,
            abilities: [
                { name: 'Armor Plating', icon: '🛡️', passive: true, desc: '-5 to all damage taken (including poison)' },
                { name: 'Overcharge', icon: '⚡', passive: false, desc: 'If you deal 25+ damage in one turn: stunned, skips next attack' },
                { name: 'Escalate', icon: '⚙️', passive: true, desc: '+2 ATK every 2 turns' }
            ]
        },
    ]
};

export const ELITES = [
    { prefix: '💀 Deadly', hpM: 1.3, atkM: 1.5, goldM: 2 },
    { prefix: '🛡️ Armored', hpM: 1.8, atkM: 1.0, goldM: 1.5 },
    { prefix: '⚡ Swift', hpM: 1.0, atkM: 1.8, goldM: 1.8 },
    { prefix: '🔥 Enraged', hpM: 1.2, atkM: 2.0, goldM: 2.5 },
];

export const BOSSES = {
    5:  {
        name: 'The Bone King', hp: 85, atk: 9, gold: 80,
        abilities: [
            { name: 'Bone Wall', icon: '🦴', passive: false, desc: 'Gains 15 shield that absorbs damage' },
            { name: 'Raise Dead', icon: '💀', passive: false, desc: 'ATK permanently +3 (represents summoned skeleton)' }
        ]
    },
    10: {
        name: 'Crimson Wyrm', hp: 250, atk: 18, gold: 120,
        abilities: [
            { name: 'Fire Breath', icon: '🔥', passive: false, desc: '18 damage + 3 burn/turn for 3 turns' },
            { name: 'Wing Buffet', icon: '💨', passive: false, desc: '10 damage + disables attack slot for 1 turn' }
        ]
    },
    15: {
        name: 'The Void Lord', hp: 450, atk: 25, gold: 200,
        abilities: [
            { name: 'Void Rift', icon: '🌀', passive: false, desc: 'Disables a random slot for 2 turns' },
            { name: 'Dark Pulse', icon: '🌀', passive: false, desc: '15 unblockable damage' },
            { name: 'Entropy', icon: '🌀', passive: false, desc: 'Phase 2: removes highest face value from a random die each turn' }
        ]
    },
};

// ════════════════════════════════════════════════════════════
//  ENCOUNTER SELECTION
// ════════════════════════════════════════════════════════════
export function pickEnemy(floor) {
    if (floor === 1) return { ...ENEMIES[1][0] };  // always Goblin
    if (floor === 2) {
        const idx = Math.random() < 0.5 ? 1 : 4;  // Dire Rat or Skeleton
        return { ...ENEMIES[1][idx] };
    }
    const act = getAct(floor);
    const pool = ENEMIES[act] || ENEMIES[1];
    return { ...pool[Math.floor(Math.random() * pool.length)] };
}

// ════════════════════════════════════════════════════════════
//  FACE MODIFIERS
// ════════════════════════════════════════════════════════════
export const FACE_MODS = [
    // ── GENERAL ──
    { name: '×2 Strike', icon: '⚡', desc: 'Doubles total damage/block of this slot', effect: 'slotMultiply', value: 2, color: '#d4a534', autoFire: false },
    { name: '+5 Bonus', icon: '💎', desc: '+5 per die allocated alongside this one (this die contributes bonus only)', effect: 'slotAdd', value: 5, color: '#40a060', autoFire: false },
    { name: 'Shield', icon: '🛡', desc: 'Blocks 4 extra damage (defend slot only)', effect: 'defAdd', value: 4, color: '#4060c0', autoFire: false },

    // ── WIDE BUILD (many dice/slots) ──
    { name: 'Pack Tactics', icon: '🐺', desc: 'Each die in this slot gets +2 to its value (stacks with multiple Pack Tactics dice)', effect: 'packTactics', value: 2, color: '#6a8f3f', autoFire: false },
    { name: 'Volley', icon: '🏹', desc: 'If 3+ dice in this slot, +8 bonus', effect: 'volley', value: 8, color: '#7a6f3f', autoFire: false },

    // ── TALL BUILD (few big dice) ──
    { name: 'Threshold', icon: '🔶', desc: 'If this die rolled ≥8, double its value', effect: 'threshold', value: 8, color: '#c06020', autoFire: false },

    // ── UTILITY BUILD ──
    { name: 'Lucky', icon: '🎰', desc: 'When this face triggers, +1 reroll this combat', effect: 'lucky', value: 1, color: '#30a0a0', autoFire: false },

    // ── POISON BUILD ──
    { name: 'Poison Tip', icon: '☠️', desc: 'Apply 2 poison when this face triggers', effect: 'poison', value: 2, color: '#50a030', autoFire: false },

    // ── AUTO-FIRE (trigger on roll) ──
    { name: 'Rejuvenate', icon: '❤️', desc: 'Gain 5 regen (heals each turn, -1/turn)', effect: 'heal', value: 5, color: '#c44040', autoFire: true },
    { name: 'Lifesteal', icon: '🩸', desc: 'Heal 30% of attack damage (auto)', effect: 'lifesteal', value: 0.3, color: '#a03030', autoFire: true },
    { name: 'Gold Rush', icon: '💰', desc: 'Gain 10 gold (auto)', effect: 'gold', value: 10, color: '#d4a534', autoFire: true },
    { name: 'Scavenger', icon: '🪤', desc: 'Gain 5 gold per combat (auto). Stacks.', effect: 'scavGold', value: 5, color: '#8a7a30', autoFire: true },
    { name: 'Midas Touch', icon: '👑', desc: 'Gain gold equal to die value when triggered', effect: 'midasGold', value: 1, color: '#d4a534', autoFire: false },

    // ── STATUS EFFECT (apply on allocation) ──
    { name: 'Volatile',  icon: '🎰', desc: 'When this face triggers, replace die value with a random number 1 to max×2', effect: 'volatile',  color: '#d07020', autoFire: false },
    { name: 'Frostbite', icon: '❄️', desc: 'When in defend slot: apply 2 chill to enemy',  effect: 'frostbite', color: '#80c0e0', autoFire: false },
    { name: 'Searing',   icon: '🔥', desc: 'When in attack slot: apply 2 burn to enemy (3 turns)', effect: 'searing',   color: '#d06020', autoFire: false },
    { name: 'Marked',    icon: '🎯', desc: 'When in attack slot: apply 3 mark to enemy for 2 turns', effect: 'marked',    color: '#c04040', autoFire: false },
];

// ════════════════════════════════════════════════════════════
//  ARTIFACTS
// ════════════════════════════════════════════════════════════
export const ARTIFACT_POOL = [
    // ── BUILD ENABLERS: WIDE ──
    { name: "Hydra's Crest",   icon: '🐉', desc: '+2 attack damage per die you own',                      effect: 'hydrasCrest',   value: 2,    category: 'enabler' },
    { name: 'Swarm Banner',    icon: '🚩', desc: '4+ attack dice: attack ×1.5; 4+ defend dice: defend ×1.5', effect: 'swarmBanner',   value: 1.5,  category: 'enabler' },
    { name: 'Echo Stone',      icon: '🔁', desc: 'The first die you allocate each turn is counted twice', effect: 'echoStone',     value: 0,    category: 'enabler' },

    // ── BUILD ENABLERS: TALL ──
    { name: 'Colossus Belt',   icon: '🏋️', desc: 'Dice with max face ≥9 gain +3 to all face values (applied immediately)', effect: 'colossussBelt', value: 3, category: 'enabler', onAcquire: true },
    { name: 'Precision Lens',  icon: '🔍', desc: 'All dice roll twice and keep the higher result',        effect: 'precisionLens', value: 0,    category: 'enabler' },
    { name: 'Sharpening Stone',icon: '⚔️', desc: 'All dice values gain +50% (round up) after runes',     effect: 'sharpeningStone',value: 0.5, category: 'enabler' },

    // ── BUILD ENABLERS: POISON ──
    { name: 'Venom Gland',     icon: '🧪', desc: 'All poison applied from any source is doubled',         effect: 'venomGland',    value: 2,    category: 'enabler' },
    { name: 'Festering Wound', icon: '🩸', desc: 'Enemy takes +1 damage per poison stack on them',        effect: 'festeringWound',value: 1,    category: 'enabler' },
    { name: 'Toxic Blood',     icon: '☠️', desc: 'When you take damage, apply 2 poison to the attacker', effect: 'toxicBlood',    value: 2,    category: 'enabler' },

    // ── BUILD ENABLERS: GOLD ──
    { name: "Merchant's Crown",icon: '💎', desc: '+1 attack damage per 20 gold held',                     effect: 'goldScaleDmg',  value: 20,   category: 'enabler' },
    { name: 'Golden Aegis',    icon: '🛡️', desc: '+1 block per 25 gold held',                             effect: 'goldenAegis',   value: 25,   category: 'enabler' },
    { name: 'Midas Die',       icon: '🎲', desc: 'At the start of each combat, gain a temporary d6 that auto-fires gold equal to its value', effect: 'midasDie', value: 0, category: 'enabler' },
    { name: 'Tax Collector',   icon: '💰', desc: 'Gain 7 gold after every combat',                        effect: 'goldPerKill',   value: 7,    category: 'enabler' },
    { name: 'Gilded Gauntlet', icon: '✨', desc: 'Start of combat: spend 50 gold → deal 15 damage',       effect: 'goldToDmg',     value: 1,    category: 'enabler' },

    // ── PROBLEM SOLVERS ──
    { name: 'Anchored Slots',  icon: '⚓', desc: 'Your slots cannot be disabled by enemy abilities',       effect: 'anchoredSlots', value: 0,    category: 'solver' },
    { name: 'Soul Mirror',     icon: '👻', desc: 'Unblockable damage is reduced by 50%',                  effect: 'soulMirror',    value: 0.5,  category: 'solver' },
    { name: 'Iron Will',       icon: '🧠', desc: 'Your dice values and face counts cannot be reduced by enemy effects', effect: 'ironWill', value: 0, category: 'solver' },
    { name: 'Burnproof Cloak', icon: '🧥', desc: 'Immune to burn; poison damage to you ticks for half (round down)', effect: 'burnproofCloak', value: 0, category: 'solver' },
    { name: 'Thorn Mail',      icon: '🌿', desc: 'When you take damage, deal 3 back to the attacker',     effect: 'thornMail',     value: 3,    category: 'solver' },
    { name: 'Overflow Chalice',icon: '🏆', desc: 'Overkill damage (beyond enemy remaining HP) heals you', effect: 'overflowChalice',value: 0,   category: 'solver' },

    // ── STATUS EFFECT ARTIFACTS ──
    { name: 'Frost Brand',     icon: '❄️', desc: 'When you block 10+ damage in a turn, apply 3 chill to the enemy', effect: 'frostBrand',   value: 3, category: 'status' },
    { name: 'Frozen Heart',    icon: '🧊', desc: 'At 6+ chill stacks, enemy is frozen (skip next attack); chill resets to 0', effect: 'frozenHeart', value: 6, category: 'status' },
    { name: "Hunter's Mark",   icon: '🎯', desc: 'First hit each combat applies 5 mark for 2 turns (+5 damage from all sources)', effect: 'huntersMark', value: 5, category: 'status' },
    { name: "Witch's Hex",     icon: '💔', desc: 'When you apply poison, also apply weaken for 1 turn (enemy deals 25% less)', effect: 'witchsHex', value: 1, category: 'status' },
    { name: 'Ember Crown',     icon: '🔥', desc: 'When you deal 15+ damage in a turn, apply 3 burn for 3 turns', effect: 'emberCrown', value: 3, category: 'status' },
    { name: 'Thunder Strike',  icon: '⚡', desc: 'When you deal 25+ damage in a turn, stun the enemy (cannot trigger 2 turns in a row)', effect: 'thunderStrike', value: 0, category: 'status' },

    // ── INTERESTING CHOICES ──
    { name: "Berserker's Mask",icon: '😤', desc: '+50% attack damage but you cannot allocate more than 1 die to defense', effect: 'berserkersMask', value: 1.5, category: 'choice' },
    { name: 'Glass Cannon',    icon: '💥', desc: 'All dice gain +3 to every face value permanently; max HP is halved (applied immediately)', effect: 'glassCannon', value: 3, category: 'choice', onAcquire: true },
    { name: 'Hourglass',       icon: '⏳', desc: 'You get a free turn at the start of every combat before the enemy acts', effect: 'hourglass', value: 0, category: 'choice' },
    { name: 'Parasite',        icon: '🦠', desc: 'Whenever you kill an enemy: +1 max HP and +1 gold per combat permanently', effect: 'parasite', value: 0, category: 'choice' },
    { name: 'Blood Pact',      icon: '💀', desc: 'At the start of each turn, lose 3 HP. All your damage is increased by 30%', effect: 'bloodPact', value: 0.3, category: 'choice' },
    { name: "Gambler's Coin",  icon: '🪙', desc: 'At the start of each combat: Heads = all dice +2 this fight, Tails = all dice -1 this fight', effect: 'gamblersCoin', value: 0, category: 'choice' },
    { name: 'Battle Fury',     icon: '🔥', desc: 'Each turn you survive, gain 1 Fury. At 3 Fury: your highest attack die is ×2 this turn, then Fury resets', effect: 'battleFury', value: 3, category: 'choice' },
];

export function getArtifactPool(act) {
    if (act === 1) return ARTIFACT_POOL.filter(a =>
        !['berserkersMask', 'glassCannon', 'bloodPact', 'battleFury'].includes(a.effect));
    return ARTIFACT_POOL;
}

// ════════════════════════════════════════════════════════════
//  DIE RUNES (attach to individual dice)
// ════════════════════════════════════════════════════════════
export const RUNES = [
    { name: 'Amplifier',    icon: '🔮', color: '#9060d0', slot: 'either', desc: 'Everything this die does is doubled (value ×2, face mod effects ×2)', effect: 'amplifier' },
    { name: "Titan's Blow", icon: '💪', color: '#d07030', slot: 'either', desc: "If the only non-utility die in its slot, output is tripled (utility/auto-fire dice don't count)", effect: 'titanBlow' },
    { name: 'Siphon',       icon: '🩸', color: '#c02020', slot: 'attack', desc: "This die's damage also heals you for 100% of its contribution",        effect: 'siphon' },
    { name: 'Regen Core',   icon: '💚', color: '#30a050', slot: 'defend', desc: "This die's block also heals you for 50% (round up)",                   effect: 'regenCore' },
    { name: 'Mirror',       icon: '🪞', color: '#3060c0', slot: 'defend', desc: "Block from this die is also dealt as damage to the enemy",             effect: 'mirror' },
    { name: 'Leaden',       icon: '⚓', color: '#606080', slot: 'defend', desc: "Double block from this die, but it cannot be rerolled",                effect: 'leaden' },
    { name: 'Steadfast',    icon: '🛡️', color: '#4080b0', slot: 'defend', desc: "This die's block ignores all enemy reduction effects",                effect: 'steadfast' },
];

// ════════════════════════════════════════════════════════════
//  PASSIVE SKILL TREE
// ════════════════════════════════════════════════════════════
export const SKILL_TREE = [
    // ── ROOT (row 0) ──
    { id: 'root', name: 'Adventurer', icon: '⭐', desc: '+1 Attack Slot, +1 Defend Slot', row: 0, col: 3, requires: [], effect: (gs) => { gs.slots.attack.push({ id: `atk-${Date.now()}`, rune: null }); gs.slots.defend.push({ id: `def-${Date.now()}`, rune: null }); } },

    // ── WIDE BRANCH (left, col 0) ──
    { id: 'w1', name: 'Extra Arms', icon: '🐺', desc: '+1 Attack Slot', row: 1, col: 0, requires: ['root'], effect: (gs) => { gs.slots.attack.push({ id: `atk-${Date.now()}`, rune: null }); } },
    { id: 'w2', name: 'Pack Tactics', icon: '🐺', desc: 'Passive: +1 dmg per die in attack slot', row: 2, col: 0, requires: ['w1'], effect: (gs) => { gs.passives.packTactics = (gs.passives.packTactics || 0) + 1; } },
    { id: 'w3', name: 'Shield Wall', icon: '🐺', desc: '+1 Defend Slot', row: 3, col: 0, requires: ['w2', 'wt'], requiresAny: true, effect: (gs) => { gs.slots.defend.push({ id: `def-${Date.now()}`, rune: null }); } },
    { id: 'w4', name: 'Volley', icon: '🐺', desc: 'Passive: 3+ dice in slot = +8 bonus', row: 4, col: 0, requires: ['w3'], effect: (gs) => { gs.passives.volley = (gs.passives.volley || 0) + 8; } },
    { id: 'w5', name: 'Swarm Master', icon: '👑', desc: 'Passive: +2 per die in ANY slot', row: 5, col: 0, requires: ['w4'], effect: (gs) => { gs.passives.swarmMaster = (gs.passives.swarmMaster || 0) + 2; } },

    // ── GOLD BRANCH (col 2) ──
    { id: 'g1', name: 'Prospector', icon: '💰', desc: '+15 gold immediately, +4 gold per combat', effect: (gs) => { gs.gold += 15; gs.passives.goldPerCombat = (gs.passives.goldPerCombat || 0) + 4; }, row: 1, col: 2, requires: ['root'] },
    { id: 'g2', name: 'Appraisal', icon: '💰', desc: 'Shop prices reduced by 15%', effect: (gs) => { gs.passives.shopDiscount = (gs.passives.shopDiscount || 0) + 0.15; }, row: 2, col: 2, requires: ['g1'] },
    { id: 'g3', name: 'Investment', icon: '💰', desc: '+1 atk damage per 15 gold held', effect: (gs) => { gs.passives.goldDmg = 15; }, row: 3, col: 2, requires: ['g2', 'wt', 'tv'], requiresAny: true },
    { id: 'g4', name: 'Compound Interest', icon: '💰', desc: 'Gain 10% of current gold after each combat', effect: (gs) => { gs.passives.goldInterest = (gs.passives.goldInterest || 0) + 0.1; }, row: 4, col: 2, requires: ['g3'] },
    { id: 'g5', name: 'Golden God', icon: '👑', desc: '+1 dmg per 8 gold held, free shop refresh', effect: (gs) => { gs.passives.goldDmg = 8; gs.passives.freeRefresh = true; }, row: 5, col: 2, requires: ['g4'] },

    // ── TALL BRANCH (center, col 4) ──
    { id: 't1', name: 'Precision', icon: '🔨', desc: '+1 Reroll per combat', row: 1, col: 4, requires: ['root'], effect: (gs) => { gs.rerolls++; } },
    { id: 't2', name: 'Forge', icon: '🔨', desc: 'Unlock Dice Merge at rest stops', row: 2, col: 4, requires: ['t1'], effect: (gs) => { gs.passives.canMerge = true; } },
    { id: 't3', name: 'Threshold', icon: '🔨', desc: 'Passive: dice ≥8 deal +50% value', row: 3, col: 4, requires: ['t2', 'wt', 'tv'], requiresAny: true, effect: (gs) => { gs.passives.threshold = true; } },
    { id: 't4', name: 'Amplify', icon: '🔨', desc: 'Gain a free Amplifier rune to attach to a die', row: 4, col: 4, requires: ['t3'], effect: (gs) => { gs.pendingRunes.push({...RUNES.find(r => r.effect === 'amplifier')}); } },
    { id: 't5', name: "Titan's Wrath", icon: '👑', desc: 'Single-die slots deal ×3', row: 5, col: 4, requires: ['t4'], effect: (gs) => { gs.passives.titanWrath = true; } },

    // ── VENOM/UTILITY BRANCH (right, col 6) ──
    { id: 'v1', name: 'Vitality', icon: '🧪', desc: '+20 Max HP (heals too)', row: 1, col: 6, requires: ['root'], effect: (gs) => { gs.maxHp += 20; gs.hp = Math.min(gs.hp + 20, gs.maxHp); } },
    { id: 'v2', name: 'Venom', icon: '🧪', desc: 'All attacks apply 1 poison', row: 2, col: 6, requires: ['v1'], effect: (gs) => { gs.passives.poisonOnAtk = (gs.passives.poisonOnAtk || 0) + 1; } },
    { id: 'v3', name: "Gambler", icon: '🧪', desc: '+1 Reroll, rerolls deal 2 dmg', row: 3, col: 6, requires: ['v2', 'tv'], requiresAny: true, effect: (gs) => { gs.rerolls++; gs.passives.rerollDmg = (gs.passives.rerollDmg || 0) + 2; } },
    { id: 'v4', name: 'Regeneration', icon: '🧪', desc: 'Heal 3 HP at start of each turn', row: 4, col: 6, requires: ['v3'], effect: (gs) => { gs.passives.regen = (gs.passives.regen || 0) + 3; } },
    { id: 'v5', name: 'Plague Lord', icon: '👑', desc: 'Poison ×2, +2 poison/turn', row: 5, col: 6, requires: ['v4'], effect: (gs) => { gs.passives.plagueLord = true; } },

    // ── CROSS-BRANCH BRIDGES ──
    { id: 'wt', name: 'Battle Fury', icon: '🔗', desc: '+2 Dmg, +1 Reroll', row: 3, col: 1, requires: ['w2', 'g2'], requiresAny: true, effect: (gs) => { gs.buffs.damageBoost += 2; gs.rerolls++; } },
    { id: 'tv', name: 'Toxic Blade', icon: '🔗', desc: '+1 Atk Slot, apply 1 poison', row: 3, col: 5, requires: ['t2', 'v2'], requiresAny: true, effect: (gs) => { gs.slots.attack.push({ id: `atk-${Date.now()}`, rune: null }); gs.passives.poisonOnAtk = (gs.passives.poisonOnAtk || 0) + 1; } },
    { id: 'wv', name: 'Endurance', icon: '🔗', desc: '+1 Def Slot, +15 Max HP', row: 5, col: 1, requires: ['w4', 'g4'], requiresAny: true, effect: (gs) => { gs.slots.defend.push({ id: `def-${Date.now()}`, rune: null }); gs.maxHp += 15; gs.hp = Math.min(gs.hp + 15, gs.maxHp); } },
    { id: 'gt', name: 'War Chest', icon: '🔗', desc: '+30 gold, +1 Reroll', row: 5, col: 3, requires: ['g4', 't4'], requiresAny: true, effect: (gs) => { gs.gold += 30; gs.rerolls++; } },
    { id: 'tv2', name: 'Versatility', icon: '🔗', desc: '+1 to both slot types', row: 5, col: 5, requires: ['t4', 'v4'], requiresAny: true, effect: (gs) => { gs.slots.attack.push({ id: `atk-${Date.now()}`, rune: null }); gs.slots.defend.push({ id: `def-${Date.now()}`, rune: null }); } },
];
