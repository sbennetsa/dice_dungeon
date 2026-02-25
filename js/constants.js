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
            name: 'Goblin', hp: 20, atk: 5, gold: 20,
            abilities: []
        },
        {
            name: 'Dire Rat', hp: 14, atk: 4, gold: 18,
            abilities: [
                { name: 'Frenzy', icon: '⚔️', passive: true, desc: 'Attacks twice per turn (4+4)' }
            ]
        },
        {
            name: 'Fungal Creep', hp: 22, atk: 3, gold: 22,
            abilities: [
                { name: 'Spore Cloud', icon: '🟢', passive: false, desc: 'Every 2 turns: 2 poison/turn for 3 turns instead of attacking' }
            ]
        },
        {
            name: 'Slime', hp: 28, atk: 3, gold: 25,
            abilities: [
                { name: 'Mitosis', icon: '⏳', passive: false, desc: 'Turn 3: transforms into Slimeling Swarm (20 HP, 6 ATK)' }
            ]
        },
        {
            name: 'Skeleton', hp: 18, atk: 6, gold: 20,
            abilities: [
                { name: 'Brittle', icon: '💀', passive: true, desc: '+3 damage taken from every source' }
            ]
        },
    ],
    2: [
        {
            name: 'Orc Warrior', hp: 45, atk: 11, gold: 25,
            abilities: [
                { name: 'War Cry', icon: '🔥', passive: false, desc: 'Every 3 turns: next attack deals double damage' }
            ]
        },
        {
            name: 'Dark Mage', hp: 32, atk: 8, gold: 30,
            abilities: [
                { name: 'Penetration', icon: '🟣', passive: true, desc: 'All attacks ignore 3 block' },
                { name: 'Curse', icon: '🟣', passive: false, desc: 'Every 3 turns: disables your most-stacked slot for 2 turns' }
            ]
        },
        {
            name: 'Troll', hp: 55, atk: 9, gold: 28,
            abilities: [
                { name: 'Thick Hide', icon: '🛡️', passive: true, desc: 'Ignores hits below 10 damage' },
                { name: 'Regenerate', icon: '💚', passive: true, desc: 'Heals 3 HP at the start of each turn' }
            ]
        },
        {
            name: 'Vampire', hp: 38, atk: 12, gold: 35,
            abilities: [
                { name: 'Lifesteal', icon: '🩸', passive: true, desc: 'Heals 50% of damage dealt to you (after block)' },
                { name: 'Blood Frenzy', icon: '🩸', passive: false, desc: 'Below 20% HP: attacks twice per turn' }
            ]
        },
        {
            name: 'Mimic', hp: 35, atk: 10, gold: 30,
            abilities: [
                { name: 'Surprise', icon: '💰', passive: false, desc: 'Turn 1: attacks first and steals 15 gold' },
                { name: 'Greed Tax', icon: '💰', passive: true, desc: '+1 ATK per 50 gold you hold (recalculated each turn)' }
            ]
        },
    ],
    3: [
        {
            name: 'Demon', hp: 75, atk: 17, gold: 45,
            abilities: [
                { name: 'Hellfire', icon: '🔥', passive: true, desc: '5 unblockable damage to you every turn' },
                { name: 'Soul Pact', icon: '👹', passive: true, desc: 'Excess damage beyond remaining HP is reflected back to you' }
            ]
        },
        {
            name: 'Lich', hp: 65, atk: 14, gold: 50,
            abilities: [
                { name: 'Decay Aura', icon: '💀', passive: true, desc: 'All your dice are -1 after rolling (min 1)' },
                { name: 'Phylactery', icon: '💀', passive: false, desc: 'First death: revives at 26 HP — second kill is permanent' }
            ]
        },
        {
            name: 'Dragon Whelp', hp: 85, atk: 16, gold: 55,
            abilities: [
                { name: 'Scales', icon: '🐉', passive: true, desc: 'First 8 damage from your attack slot is ignored each turn' },
                { name: 'Breath', icon: '🔥', passive: false, desc: 'Every 4 turns: charges for 1 turn, then 30 damage' }
            ]
        },
        {
            name: 'Shadow Assassin', hp: 45, atk: 22, gold: 50,
            abilities: [
                { name: 'Evasion', icon: '💨', passive: true, desc: 'One random attack die is negated each turn' },
                { name: 'Expose', icon: '💨', passive: true, desc: '+5 damage per empty attack slot you have' }
            ]
        },
        {
            name: 'Iron Golem', hp: 100, atk: 12, gold: 55,
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
        name: 'The Bone King', hp: 85, atk: 9, gold: 100,
        abilities: [
            { name: 'Bone Wall', icon: '🦴', passive: false, desc: 'Gains 15 shield that absorbs damage' },
            { name: 'Raise Dead', icon: '💀', passive: false, desc: 'ATK permanently +3 (represents summoned skeleton)' }
        ]
    },
    10: {
        name: 'Crimson Wyrm', hp: 250, atk: 18, gold: 150,
        abilities: [
            { name: 'Fire Breath', icon: '🔥', passive: false, desc: '18 damage + 3 burn/turn for 3 turns' },
            { name: 'Wing Buffet', icon: '💨', passive: false, desc: '10 damage + disables attack slot for 1 turn' }
        ]
    },
    15: {
        name: 'The Void Lord', hp: 450, atk: 25, gold: 250,
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
    { name: '+5 Bonus', icon: '💎', desc: '+5 per die in this slot (this die contributes bonus only)', effect: 'slotAdd', value: 5, color: '#40a060', autoFire: false },
    { name: 'Shield', icon: '🛡', desc: 'Blocks 4 extra damage (defend slot only)', effect: 'defAdd', value: 4, color: '#4060c0', autoFire: false },

    // ── WIDE BUILD (many dice/slots) ──
    { name: 'Pack Tactics', icon: '🐺', desc: '+2 per die in this slot (stacks with other dice)', effect: 'packTactics', value: 2, color: '#6a8f3f', autoFire: false },
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
];

// ════════════════════════════════════════════════════════════
//  ARTIFACTS
// ════════════════════════════════════════════════════════════
export const ARTIFACT_POOL = [
    // ── GENERAL ──
    { name: 'Heart of Phoenix', icon: '🔥', desc: 'Heal 8 HP at start of each combat', effect: 'combatHeal', value: 8 },
    { name: "Rabbit's Foot", icon: '🍀', desc: '+1 to all dice rolls', effect: 'diceFlat', value: 1 },
    { name: 'War Drum', icon: '🥁', desc: 'First attack each combat deals +10 damage', effect: 'firstStrike', value: 10 },
    { name: 'Vampiric Amulet', icon: '🩸', desc: '5% lifesteal on all attacks', effect: 'permLifesteal', value: 0.05 },
    { name: 'Whetstone', icon: '🪨', desc: '+3 flat attack damage', effect: 'flatAtk', value: 3 },
    { name: 'Iron Will', icon: '🛡️', desc: '+2 permanent armor', effect: 'permArmor', value: 2 },
    { name: 'Ancient Tome', icon: '📖', desc: '+50% XP from all sources', effect: 'xpMult', value: 0.5 },

    // ── WIDE BUILD ──
    { name: "Hydra's Crest", icon: '🐉', desc: '+1 damage per die you own', effect: 'dmgPerDie', value: 1 },
    { name: 'Swarm Banner', icon: '🚩', desc: 'If 4+ dice in attack slot, +10 damage', effect: 'swarmAtk', value: 10 },
    { name: 'Legion Shield', icon: '🏰', desc: 'If 3+ dice in defend slot, +6 block', effect: 'swarmDef', value: 6 },

    // ── TALL BUILD ──
    { name: "Giant's Belt", icon: '⛓️', desc: '+5 damage per die with max ≥10', effect: 'giantDmg', value: 5 },
    { name: 'Colossus Ring', icon: '💎', desc: 'Dice with range ≥10 get +3 to rolls', effect: 'colossusDice', value: 3 },
    { name: 'Executioner Blade', icon: '⚔️', desc: 'Single-die attacks deal double damage', effect: 'executioner', value: 2 },

    // ── UTILITY BUILD ──
    { name: "Gambler's Coin", icon: '🪙', desc: 'Each reroll used deals 3 damage', effect: 'rerollDmg', value: 3 },
    { name: 'Lucky Charm', icon: '🎲', desc: '+1 reroll per combat', effect: 'bonusReroll', value: 1 },
    { name: 'Merchant Ledger', icon: '📜', desc: 'Shop items cost 20% less', effect: 'shopDiscount', value: 0.2 },
    { name: 'Golden Crown', icon: '👑', desc: '+25% gold from all sources', effect: 'goldMult', value: 0.25 },
    { name: 'Gilded Gauntlet', icon: '✨', desc: 'Start of combat: spend 50 gold → deal 15 damage', effect: 'goldToDmg', value: 1 },
    { name: "Merchant's Crown", icon: '💎', desc: '+1 attack damage per 20 gold held', effect: 'goldScaleDmg', value: 20 },
    { name: 'Tax Collector', icon: '💰', desc: 'Gain 10 gold after every combat', effect: 'goldPerKill', value: 10 },

    // ── POISON BUILD ──
    { name: 'Serpent Fang', icon: '🐍', desc: 'All attacks apply poison equal to 10% of damage', effect: 'poisonOnHit', value: 0.1 },
    { name: 'Plague Bearer', icon: '🦠', desc: 'Poison ticks deal double damage', effect: 'poisonDouble', value: 2 },
];

// ════════════════════════════════════════════════════════════
//  SLOT RUNES
// ════════════════════════════════════════════════════════════
export const RUNES = {
    attack: [
        { name: 'Fury Rune', icon: '🔥', desc: 'Each attack die deals +3 damage', effect: 'furyPerDie', value: 3 },
        { name: 'Berserker Mark', icon: '⚔️', desc: '×1.5 to all attack damage', effect: 'atkMultRune', value: 1.5 },
        { name: 'Venom Edge', icon: '☠️', desc: 'Apply 3 poison every turn', effect: 'poisonPerTurn', value: 3 },
    ],
    defend: [
        { name: 'Stone Ward', icon: '🪨', desc: '+5 block every turn', effect: 'flatBlock', value: 5 },
        { name: 'Thorn Mantle', icon: '🌿', desc: 'Reflect 3 damage when hit', effect: 'thorns', value: 3 },
        { name: 'Regeneration', icon: '💚', desc: 'Heal 3 HP at start of each turn', effect: 'regenPerTurn', value: 3 },
    ],
    either: [
        { name: 'Amplifier', icon: '🔮', desc: '×2 to this slot\'s total', effect: 'amplifier', value: 2 },
        { name: "Titan's Blow", icon: '🔨', desc: 'If only 1 die in this slot, ×3 its value', effect: 'titanBlow', value: 3 },
    ]
};

// ════════════════════════════════════════════════════════════
//  PASSIVE SKILL TREE
// ════════════════════════════════════════════════════════════
export const SKILL_TREE = [
    // ── ROOT (row 0) ──
    { id: 'root', name: 'Adventurer', icon: '⭐', desc: '+1 Attack Slot, +1 Defend Slot', row: 0, col: 3, requires: [], effect: (gs) => { gs.slots.attack++; gs.slots.defend++; } },

    // ── WIDE BRANCH (left, col 0) ──
    { id: 'w1', name: 'Extra Arms', icon: '🐺', desc: '+1 Attack Slot', row: 1, col: 0, requires: ['root'], effect: (gs) => { gs.slots.attack++; } },
    { id: 'w2', name: 'Pack Tactics', icon: '🐺', desc: 'Passive: +1 dmg per die in attack slot', row: 2, col: 0, requires: ['w1'], effect: (gs) => { gs.passives.packTactics = (gs.passives.packTactics || 0) + 1; } },
    { id: 'w3', name: 'Shield Wall', icon: '🐺', desc: '+1 Defend Slot', row: 3, col: 0, requires: ['w2', 'wt'], requiresAny: true, effect: (gs) => { gs.slots.defend++; } },
    { id: 'w4', name: 'Volley', icon: '🐺', desc: 'Passive: 3+ dice in slot = +8 bonus', row: 4, col: 0, requires: ['w3'], effect: (gs) => { gs.passives.volley = (gs.passives.volley || 0) + 8; } },
    { id: 'w5', name: 'Swarm Master', icon: '👑', desc: 'Passive: +2 per die in ANY slot', row: 5, col: 0, requires: ['w4'], effect: (gs) => { gs.passives.swarmMaster = (gs.passives.swarmMaster || 0) + 2; } },

    // ── GOLD BRANCH (col 2) ──
    { id: 'g1', name: 'Prospector', icon: '💰', desc: '+15 gold immediately, +5 gold per combat', effect: (gs) => { gs.gold += 15; gs.passives.goldPerCombat = (gs.passives.goldPerCombat || 0) + 5; }, row: 1, col: 2, requires: ['root'] },
    { id: 'g2', name: 'Appraisal', icon: '💰', desc: 'Shop prices reduced by 15%', effect: (gs) => { gs.passives.shopDiscount = (gs.passives.shopDiscount || 0) + 0.15; }, row: 2, col: 2, requires: ['g1'] },
    { id: 'g3', name: 'Investment', icon: '💰', desc: '+1 atk damage per 15 gold held', effect: (gs) => { gs.passives.goldDmg = 15; }, row: 3, col: 2, requires: ['g2', 'wt', 'tv'], requiresAny: true },
    { id: 'g4', name: 'Compound Interest', icon: '💰', desc: 'Gain 10% of current gold after each combat', effect: (gs) => { gs.passives.goldInterest = (gs.passives.goldInterest || 0) + 0.1; }, row: 4, col: 2, requires: ['g3'] },
    { id: 'g5', name: 'Golden God', icon: '👑', desc: '+1 dmg per 8 gold held, free shop refresh', effect: (gs) => { gs.passives.goldDmg = 8; gs.passives.freeRefresh = true; }, row: 5, col: 2, requires: ['g4'] },

    // ── TALL BRANCH (center, col 4) ──
    { id: 't1', name: 'Precision', icon: '🔨', desc: '+1 Reroll per combat', row: 1, col: 4, requires: ['root'], effect: (gs) => { gs.rerolls++; } },
    { id: 't2', name: 'Forge', icon: '🔨', desc: 'Unlock Dice Merge at rest stops', row: 2, col: 4, requires: ['t1'], effect: (gs) => { gs.passives.canMerge = true; } },
    { id: 't3', name: 'Threshold', icon: '🔨', desc: 'Passive: dice ≥8 deal +50% value', row: 3, col: 4, requires: ['t2', 'wt', 'tv'], requiresAny: true, effect: (gs) => { gs.passives.threshold = true; } },
    { id: 't4', name: 'Amplify', icon: '🔨', desc: 'Free Amplifier on attack slot', row: 4, col: 4, requires: ['t3'], effect: (gs) => { gs.runes.attack.push({ ...RUNES.either[0] }); } },
    { id: 't5', name: "Titan's Wrath", icon: '👑', desc: 'Single-die slots deal ×3', row: 5, col: 4, requires: ['t4'], effect: (gs) => { gs.passives.titanWrath = true; } },

    // ── VENOM/UTILITY BRANCH (right, col 6) ──
    { id: 'v1', name: 'Vitality', icon: '🧪', desc: '+20 Max HP (heals too)', row: 1, col: 6, requires: ['root'], effect: (gs) => { gs.maxHp += 20; gs.hp = Math.min(gs.hp + 20, gs.maxHp); } },
    { id: 'v2', name: 'Venom', icon: '🧪', desc: 'All attacks apply 1 poison', row: 2, col: 6, requires: ['v1'], effect: (gs) => { gs.passives.poisonOnAtk = (gs.passives.poisonOnAtk || 0) + 1; } },
    { id: 'v3', name: "Gambler", icon: '🧪', desc: '+1 Reroll, rerolls deal 2 dmg', row: 3, col: 6, requires: ['v2', 'tv'], requiresAny: true, effect: (gs) => { gs.rerolls++; gs.passives.rerollDmg = (gs.passives.rerollDmg || 0) + 2; } },
    { id: 'v4', name: 'Regeneration', icon: '🧪', desc: 'Heal 3 HP at start of each turn', row: 4, col: 6, requires: ['v3'], effect: (gs) => { gs.passives.regen = (gs.passives.regen || 0) + 3; } },
    { id: 'v5', name: 'Plague Lord', icon: '👑', desc: 'Poison ×2, +2 poison/turn', row: 5, col: 6, requires: ['v4'], effect: (gs) => { gs.passives.plagueLord = true; } },

    // ── CROSS-BRANCH BRIDGES ──
    { id: 'wt', name: 'Battle Fury', icon: '🔗', desc: '+2 Dmg, +1 Reroll', row: 3, col: 1, requires: ['w2', 'g2'], requiresAny: true, effect: (gs) => { gs.buffs.damageBoost += 2; gs.rerolls++; } },
    { id: 'tv', name: 'Toxic Blade', icon: '🔗', desc: '+1 Atk Slot, apply 1 poison', row: 3, col: 5, requires: ['t2', 'v2'], requiresAny: true, effect: (gs) => { gs.slots.attack++; gs.passives.poisonOnAtk = (gs.passives.poisonOnAtk || 0) + 1; } },
    { id: 'wv', name: 'Endurance', icon: '🔗', desc: '+1 Def Slot, +15 Max HP', row: 5, col: 1, requires: ['w4', 'g4'], requiresAny: true, effect: (gs) => { gs.slots.defend++; gs.maxHp += 15; gs.hp = Math.min(gs.hp + 15, gs.maxHp); } },
    { id: 'gt', name: 'War Chest', icon: '🔗', desc: '+30 gold, +1 Reroll', row: 5, col: 3, requires: ['g4', 't4'], requiresAny: true, effect: (gs) => { gs.gold += 30; gs.rerolls++; } },
    { id: 'tv2', name: 'Versatility', icon: '🔗', desc: '+1 to both slot types', row: 5, col: 5, requires: ['t4', 'v4'], requiresAny: true, effect: (gs) => { gs.slots.attack++; gs.slots.defend++; } },
];
