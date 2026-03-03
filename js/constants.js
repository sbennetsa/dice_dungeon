// ════════════════════════════════════════════════════════════
//  FLOOR LAYOUT
// ════════════════════════════════════════════════════════════
import { GS } from './state.js';

export function getFloorType(floor) {
    // Use blueprint if available (procedural dungeon)
    if (GS.blueprint) {
        const actIndex  = Math.min(Math.ceil(floor / 5) - 1, 2);
        const act       = GS.blueprint.acts[actIndex];
        if (act) {
            const baseFloor = actIndex * 5 + 1;
            const fb = act.floors[floor - baseFloor];
            if (fb) return fb.type;
        }
    }
    // Fallback: hardcoded layout
    const layout = {
        1: 'combat', 2: 'event', 3: 'combat', 4: 'shop',  5: 'boss',
        6: 'event',  7: 'combat', 8: 'combat', 9: 'shop', 10: 'boss',
        11: 'event', 12: 'combat', 13: 'combat', 14: 'shop', 15: 'boss',
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
    // ── ACT 1 ──
    1: [
        {
            name: 'Goblin', hp: 20, dice: [4, 4], gold: [15, 25], xp: [20, 30],
            image: 'assets/enemies/goblin.webp',
            abilities: {
                strike: { name: 'Strike', icon: '⚔️', type: 'attack', desc: 'Deal damage' },
            },
            passives: [],
            pattern: ['strike'],
        },
        {
            name: 'Dire Rat', hp: 14, dice: [3, 3, 3], gold: [12, 20], xp: [15, 25],
            image: 'assets/enemies/direrat.webp',
            abilities: {
                frenzy: { name: 'Frenzy', icon: '🐀', type: 'attack', desc: 'Each die hits separately', multiHit: true },
            },
            passives: [],
            pattern: ['frenzy'],
        },
        {
            name: 'Fungal Creep', hp: 22, dice: [4, 4], gold: [15, 22], xp: [20, 35],
            image: 'assets/enemies/fungal_creep.webp',
            abilities: {
                strike: { name: 'Strike', icon: '⚔️', type: 'attack', desc: 'Deal damage' },
                spore:  { name: 'Spore Cloud', icon: '🍄', type: 'poison', desc: 'Apply poison equal to dice sum' },
            },
            passives: [],
            pattern: ['strike', 'spore'],
        },
        {
            name: 'Slime', hp: 28, dice: [4, 4], gold: [18, 28], xp: [25, 40],
            image: 'assets/enemies/slime.webp',
            abilities: {
                strike: { name: 'Strike', icon: '⚔️', type: 'attack', desc: 'Deal damage' },
            },
            passives: [
                { id: 'mitosis', name: 'Mitosis', desc: 'After 3 turns, evolves: gains bigger dice and +15 HP',
                  params: { turnTrigger: 3, newDice: [6, 6], bonusHp: 15 } },
            ],
            pattern: ['strike'],
        },
        {
            name: 'Skeleton', hp: 18, dice: [6, 6], gold: [14, 22], xp: [20, 30], image: 'assets/enemies/skeleton.webp',
            abilities: {
                strike: { name: 'Strike', icon: '⚔️', type: 'attack', desc: 'Deal damage' },
            },
            passives: [
                { id: 'brittle', name: 'Brittle', desc: 'Takes +3 damage from every hit', params: { bonus: 3 } },
            ],
            pattern: ['strike'],
        },
    ],
    // ── ACT 2 ──
    2: [
        {
            name: 'Orc Warrior', hp: 45, dice: [6, 6, 6], gold: [20, 30], xp: [35, 50], image: 'assets/enemies/orc_warrior.webp',
            abilities: {
                strike: { name: 'Strike', icon: '⚔️', type: 'attack', desc: 'Deal damage' },
                warCry: { name: 'War Cry', icon: '📯', type: 'buff', desc: 'Store dice sum, add to next Strike', buffTarget: 'strike' },
            },
            passives: [],
            pattern: ['strike', 'strike', 'warCry'],
        },
        {
            name: 'Dark Mage', hp: 32, dice: [6, 6], gold: [22, 35], xp: [40, 60], image: 'assets/enemies/Dark_Mage.webp',
            abilities: {
                bolt:  { name: 'Shadow Bolt', icon: '🔮', type: 'attack', desc: 'Deal damage (penetrates 3 block)', penetrate: 3 },
                curse: { name: 'Curse', icon: '💀', type: 'curse', desc: 'Seal 1 strike slot for 2 turns', slotsToSeal: 1, slotTarget: 'strike', fixedDuration: 2 },
            },
            passives: [],
            pattern: ['bolt', 'bolt', 'curse'],
        },
        {
            name: 'Troll', hp: 55, dice: [8, 8], gold: [20, 30], xp: [35, 55], image: 'assets/enemies/Troll.webp',
            abilities: {
                strike: { name: 'Smash', icon: '💪', type: 'attack', desc: 'Deal damage' },
                heal:   { name: 'Regenerate', icon: '💚', type: 'heal', desc: 'Heal HP equal to dice sum' },
            },
            passives: [
                { id: 'thickHide', name: 'Thick Hide', desc: 'Ignores slot damage below 10', params: { threshold: 10 } },
                { id: 'regen', name: 'Passive Regen', desc: 'Heals 3 HP per turn', params: { amount: 3 } },
            ],
            pattern: ['strike', 'strike', 'heal'],
        },
        {
            name: 'Vampire', hp: 38, dice: [6, 6, 6], gold: [25, 40], xp: [45, 65], image: 'assets/enemies/Vampire.webp',
            abilities: {
                drain: { name: 'Drain', icon: '🩸', type: 'attack', desc: 'Deal damage and heal 50% of amount dealt' },
            },
            passives: [
                { id: 'lifesteal', name: 'Lifesteal', desc: 'Heals 50% of damage dealt to player', params: { percent: 0.5 } },
                { id: 'bloodFrenzy', name: 'Blood Frenzy', desc: 'Below 20% HP, gains 2 extra d6', params: { hpPercent: 0.2, extraDice: [6, 6] } },
            ],
            pattern: ['drain'],
        },
        {
            name: 'Mimic', hp: 35, dice: [6, 6], gold: [20, 30], xp: [35, 50], image: 'assets/enemies/Mimic.webp',
            abilities: {
                strike: { name: 'Strike', icon: '⚔️', type: 'attack', desc: 'Deal damage' },
                steal:  { name: 'Gold Snatch', icon: '💰', type: 'steal', desc: 'Steal gold equal to dice sum' },
            },
            passives: [
                { id: 'greedTax', name: 'Greed Tax', desc: 'Gains +1d6 per 100 gold player holds', params: { goldPer: 100, dieSize: 6 } },
            ],
            pattern: ['steal', 'strike', 'strike'],
        },
    ],
    // ── ACT 3 ──
    3: [
        {
            name: 'Demon', hp: 75, dice: [8, 8, 8], gold: [35, 55], xp: [55, 80], image: 'assets/enemies/Demon.webp',
            abilities: {
                strike:   { name: 'Strike', icon: '⚔️', type: 'attack', desc: 'Deal damage' },
                hellfire: { name: 'Hellfire', icon: '🔥', type: 'unblockable', desc: 'Deal unblockable damage' },
            },
            passives: [
                { id: 'soulPact', name: 'Soul Pact', desc: 'Overkill damage reflects back to player', params: {} },
            ],
            pattern: ['strike', 'hellfire'],
        },
        {
            name: 'Lich', hp: 65, dice: [8, 8], gold: [40, 60], xp: [60, 85], image: 'assets/enemies/Lich.webp',
            abilities: {
                strike: { name: 'Strike', icon: '⚔️', type: 'attack', desc: 'Deal damage' },
                decay:  { name: 'Decay', icon: '💀', type: 'decay', desc: 'All your dice permanently lose 1 max value this fight' },
            },
            passives: [
                { id: 'phylactery', name: 'Phylactery', desc: 'Revives once at 40% HP', params: { revivePercent: 0.4 } },
            ],
            pattern: ['strike', 'strike', 'decay'],
        },
        {
            name: 'Dragon Whelp', hp: 85, dice: [8, 8, 8, 8], gold: [45, 65], xp: [65, 90], image: 'assets/enemies/Dragon_Whelp.webp',
            abilities: {
                strike: { name: 'Strike', icon: '⚔️', type: 'attack', desc: 'Deal damage' },
                charge: { name: 'Breath Charge', icon: '🔥', type: 'charge', desc: 'Charging... next attack is doubled!' },
                breath: { name: 'Fire Breath', icon: '🐲', type: 'attack', desc: 'Deal DOUBLED damage + apply burn', applyBurn: 3 },
            },
            passives: [
                { id: 'scales', name: 'Dragon Scales', desc: 'First 8 damage from each slot is ignored', params: { perSlot: 8 } },
            ],
            pattern: ['strike', 'charge', 'breath'],
        },
        {
            name: 'Shadow Assassin', hp: 45, dice: [8, 8, 8], gold: [35, 55], xp: [55, 85], image: 'assets/enemies/Shadow_Assassin.webp',
            abilities: {
                strike: { name: 'Strike', icon: '🗡️', type: 'attack', desc: 'Deal damage' },
                vanish: { name: 'Vanish', icon: '💨', type: 'charge', desc: 'Disappears — immune to damage this turn. Next strike is doubled.', immune: true },
            },
            passives: [
                { id: 'evasion', name: 'Evasion', desc: 'One random attack die is ignored each turn', params: {} },
                { id: 'expose', name: 'Expose', desc: 'Gains +1d6 per player strike slot', params: { dieSize: 6 } },
            ],
            pattern: ['strike', 'strike', 'vanish'],
        },
        {
            name: 'Iron Golem', hp: 100, dice: [6, 6], gold: [50, 70], xp: [70, 95], image: 'assets/enemies/Iron_Golem.webp',
            abilities: {
                strike: { name: 'Strike', icon: '⚔️', type: 'attack', desc: 'Deal damage' },
            },
            passives: [
                { id: 'armor', name: 'Iron Armor', desc: 'Reduces ALL incoming damage by 5 (including poison)', params: { reduction: 5 } },
                { id: 'escalate', name: 'Escalate', desc: 'Gains +1d6 every 3 turns', params: { interval: 3, dieSize: 6 } },
                { id: 'overcharge', name: 'Overcharge', desc: 'If hit for 25+ in one turn, stunned next turn', params: { threshold: 25 } },
            ],
            pattern: ['strike'],
        },
    ],
};

// ELITES removed — replaced by ELITE_MODIFIERS in js/encounters/eliteModifierSystem.js

export const BOSSES = {
    5: {
        name: 'The Bone King', hp: 85, dice: [6, 6, 6], gold: 100, xp: 50,
        image: 'assets/enemies/boneking.webp',
        abilities: {
            strike:    { name: 'Strike', icon: '⚔️', type: 'attack', desc: 'Deal damage' },
            boneWall:  { name: 'Bone Wall', icon: '🛡️', type: 'shield', desc: 'Gain shield equal to dice sum' },
            raiseDead: { name: 'Raise Dead', icon: '💀', type: 'summon_die', desc: 'Permanently gain +1d6', dieSize: 6 },
        },
        passives: [],
        pattern: ['strike', 'strike', 'boneWall', 'raiseDead'],
        phases: null,
    },
    10: {
        name: 'Crimson Wyrm', hp: 250, dice: [8, 8, 8, 8], gold: 150, xp: 80, image: 'assets/enemies/Crimson_Dragon.webp',
        abilities: {
            strike:  { name: 'Strike', icon: '⚔️', type: 'attack', desc: 'Deal damage' },
            breath:  { name: 'Fire Breath', icon: '🔥', type: 'attack', desc: 'Deal damage + apply burn', applyBurn: 3 },
            buffet:  { name: 'Wing Buffet', icon: '💨', type: 'attack', desc: 'Deal half damage + seal 1 random slot for 1 turn', halfDamage: true, sealSlot: 1 },
        },
        passives: [],
        pattern: ['strike', 'breath', 'strike', 'buffet'],
        phases: [
            {
                trigger: { hpPercent: 0.5 },
                changes: {
                    addDice: [8, 8],
                    addPassives: [{ id: 'burnOnPhase', name: 'Inferno', desc: 'All attacks apply 2 burn', params: { burn: 2 } }],
                    log: 'The Crimson Wyrm roars with fury! Flames engulf its body!',
                },
            },
        ],
    },
    15: {
        name: 'The Void Lord', hp: 450, dice: [10, 10, 10, 10], gold: 250, xp: 120, image: 'assets/enemies/The_Void_Lord.webp',
        abilities: {
            strike:    { name: 'Strike', icon: '⚔️', type: 'attack', desc: 'Deal damage' },
            voidRift:  { name: 'Void Rift', icon: '🌀', type: 'curse', desc: 'Seal 2 random slots for 1 turn', slotsToSeal: 2, fixedDuration: 1 },
            darkPulse: { name: 'Dark Pulse', icon: '💜', type: 'unblockable', desc: 'Deal unblockable damage' },
        },
        passives: [],
        pattern: ['strike', 'voidRift', 'darkPulse'],
        phases: [
            {
                trigger: { hpPercent: 0.5 },
                changes: {
                    addDice: [10, 10],
                    addPassives: [{ id: 'entropy', name: 'Entropy', desc: 'Each turn, all player dice lose 1 max value', params: {} }],
                    log: 'Reality fractures around the Void Lord! Your dice begin to decay...',
                },
            },
            {
                trigger: { hpPercent: 0.2 },
                changes: {
                    doubleAction: true,
                    damageTakenMultiplier: 1.5,
                    log: 'The Void Lord tears apart at the seams! It attacks wildly but exposes its core!',
                },
            },
        ],
    },
};

// ════════════════════════════════════════════════════════════
//  ENCOUNTER SELECTION
// ════════════════════════════════════════════════════════════
export function pickEnemy(floor) {
    if (floor === 1) return ENEMIES[1][0];  // always Goblin
    if (floor === 2) {
        const idx = Math.random() < 0.5 ? 1 : 4;  // Dire Rat or Skeleton
        return ENEMIES[1][idx];
    }
    const act = getAct(floor);
    const pool = ENEMIES[act] || ENEMIES[1];
    return pool[Math.floor(Math.random() * pool.length)];
}

// ════════════════════════════════════════════════════════════
//  FACE MODIFIERS
// ════════════════════════════════════════════════════════════
export const FACE_MODS = [
    // ── SPIKE TIER (high power, triggers ~1/N times) ──
    { name: 'Executioner',     icon: '⚔️', desc: 'This face: ×5 this die\'s value',                                     effect: 'executioner',   color: '#d03030' },
    { name: 'Freeze Strike',   icon: '🧊', desc: 'This face: freeze enemy (they skip their next attack)',                effect: 'freezeStrike',  color: '#60c0e0' },
    { name: 'Jackpot',         icon: '💰', desc: 'This face: gain 50 gold',                                              effect: 'jackpot',       color: '#d4a534' },
    { name: 'Vampiric Strike', icon: '🩸', desc: 'This face: ×3 this die\'s value AND heal that amount',                 effect: 'vampiricStrike',color: '#c02060' },
    { name: 'Chain Lightning', icon: '⚡', desc: 'This face: this die\'s value is applied twice (×2)',                   effect: 'chainLightning',color: '#8080e0' },
    { name: 'Critical',        icon: '💥', desc: 'This face: die\'s value is added to ALL slots simultaneously',         effect: 'critical',      color: '#e0a020' },
    { name: 'Poison Burst',    icon: '☠️', desc: 'This face: apply poison equal to ×3 this die\'s value (strike only)', effect: 'poisonBurst',   color: '#50a030' },
    { name: 'Shield Bash',     icon: '🛡️', desc: 'This face: block value also dealt as damage (guard only)',            effect: 'shieldBash',    color: '#4060c0' },

    // ── STATUS TIER (apply status effects on trigger) ──
    { name: 'Volatile',  icon: '🎲', desc: 'This face: replace die value with rand(1, max×2)',              effect: 'volatile',  color: '#d07020' },
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
    { name: 'Midas Die',       icon: '🎲', desc: 'At the start of each combat, gain gold equal to a d6 roll.',                                 effect: 'midasDie', value: 0, category: 'enabler' },
    { name: 'Tax Collector',   icon: '💰', desc: 'Gain 7 gold after every combat',                        effect: 'goldPerKill',   value: 7,    category: 'enabler' },
    { name: 'Gilded Gauntlet', icon: '✨', desc: 'Start of combat: spend 50 gold → deal 15 damage',       effect: 'goldToDmg',     value: 1,    category: 'enabler' },

    // ── PROBLEM SOLVERS ──
    { name: 'Anchored Slots',  icon: '⚓', desc: 'Your slots cannot be sealed by enemy abilities',        effect: 'anchoredSlots', value: 0,    category: 'solver' },
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
    { name: 'Thunder Strike',  icon: '⚡', desc: 'When you deal 25%+ of enemy max HP in a turn, stun the enemy (cannot trigger 2 turns in a row)', effect: 'thunderStrike', value: 0.25, category: 'status' },

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
//  LEGENDARY ARTIFACT POOL
//  Only available via legendaryChance on elite boss fights.
// ════════════════════════════════════════════════════════════
export const LEGENDARY_ARTIFACT_POOL = [
    {
        name: "Titan's Die",
        icon: '🎲',
        desc: 'Permanently add a die that always rolls 12 to your pool.',
        effect: 'titansDie',
        value: 12,
        category: 'enabler',
        legendary: true,
        onAcquire: true,
    },
    {
        name: 'Echo Chamber',
        icon: '🔊',
        desc: 'Your highest-value attack die counts twice each turn.',
        effect: 'echoChamber',
        value: 0,
        category: 'enabler',
        legendary: true,
    },
    {
        name: 'Bloodstone',
        icon: '💎',
        desc: 'Heal 30% of damage dealt to the enemy each turn.',
        effect: 'bloodstone',
        value: 0,
        category: 'solver',
        legendary: true,
    },
    {
        name: 'Eternal Pact',
        icon: '💀',
        desc: 'Once per run, survive a lethal hit with 1 HP instead of dying.',
        effect: 'eternalPact',
        value: 0,
        category: 'solver',
        legendary: true,
    },
];

// ════════════════════════════════════════════════════════════
//  DIE RUNES (attach to individual dice)
// ════════════════════════════════════════════════════════════
export const RUNES = [
    { name: 'Amplifier',    icon: '🔮', color: '#9060d0', slot: 'either', desc: 'Everything this die does is doubled (value ×2, face mod effects ×2)',    effect: 'amplifier' },
    { name: "Titan's Blow", icon: '💪', color: '#d07030', slot: 'either', desc: 'If the only die in its slot, output is tripled',                          effect: 'titanBlow' },
    { name: 'Siphon',       icon: '🩸', color: '#c02020', slot: 'strike', desc: "This die's damage also heals you for 100% of its contribution",           effect: 'siphon' },
    { name: 'Regen Core',   icon: '💚', color: '#30a050', slot: 'guard',  desc: "This die's block also heals you for 50% (round up)",                      effect: 'regenCore' },
    { name: 'Mirror',       icon: '🪞', color: '#3060c0', slot: 'guard',  desc: "Block from this die is also dealt as damage to the enemy",                effect: 'mirror' },
    { name: 'Leaden',       icon: '⚓', color: '#606080', slot: 'guard',  desc: "Double block from this die, but it cannot be rerolled",                   effect: 'leaden' },
    { name: 'Steadfast',    icon: '🛡️', color: '#4080b0', slot: 'guard',  desc: "This die's block ignores all enemy reduction effects",                   effect: 'steadfast' },
    { name: 'Poison Core',  icon: '☠️', color: '#50a030', slot: 'strike', desc: "Every roll applies poison to the enemy equal to this die's rolled value", effect: 'poisonCore' },
    { name: 'Lucky',        icon: '🎰', color: '#30a0a0', slot: 'either', desc: 'When a die is placed in this slot, gain +1 reroll this combat',           effect: 'lucky' },
    { name: 'Splinter',     icon: '🔀', color: '#a06030', slot: 'strike', desc: "This die's value is split equally among all other dice in this slot; the die itself contributes 0", effect: 'splinter' },
];

// ════════════════════════════════════════════════════════════
//  PASSIVE SKILL DIE
// ════════════════════════════════════════════════════════════
export const SKILL_TREE = [
    // ── ROOT ──
    { id: 'root', name: 'Adventurer', icon: '⭐', desc: '+1 Strike Slot, +1 Guard Slot', requires: [], effect: (gs) => { gs.slots.strike.push({ id: `str-${Date.now()}`, rune: null }); gs.slots.guard.push({ id: `grd-${Date.now()}`, rune: null }); } },

    // ── WIDE FACE 🐺 — slots & quantity ──
    { id: 'w_a', name: 'Extra Arms',   icon: '🐺', desc: '+1 Strike Slot',                          requires: ['root'], effect: (gs) => { gs.slots.strike.push({ id: `str-${Date.now()}`, rune: null }); } },
    { id: 'w_b', name: 'Pack Tactics', icon: '🐺', desc: 'Passive: +1 dmg per die in strike slot', requires: ['root'], effect: (gs) => { gs.passives.packTactics = (gs.passives.packTactics || 0) + 1; } },
    { id: 'w_c', name: 'Shield Wall',  icon: '🐺', desc: '+1 Guard Slot',                           requires: ['root'], effect: (gs) => { gs.slots.guard.push({ id: `grd-${Date.now()}`, rune: null }); } },
    { id: 'w_d', name: 'Volley',       icon: '🐺', desc: 'Passive: 4+ dice in zone = +3 per die', requires: ['root'], effect: (gs) => { gs.passives.volley = (gs.passives.volley || 0) + 3; } },
    { id: 'w_n', name: 'Swarm Master', icon: '👑', desc: 'Passive: +2 per die in ANY slot',        requires: ['w_a', 'w_b', 'w_c', 'w_d'], effect: (gs) => { gs.passives.swarmMaster = (gs.passives.swarmMaster || 0) + 2; } },

    // ── GOLD FACE 💰 — economy ──
    { id: 'g_a', name: 'Prospector',    icon: '💰', desc: '+15 gold immediately, +4 gold per combat',   requires: ['root'], effect: (gs) => { gs.gold += 15; gs.passives.goldPerCombat = (gs.passives.goldPerCombat || 0) + 4; } },
    { id: 'g_b', name: 'Appraisal',     icon: '💰', desc: 'Shop prices reduced by 15%',                requires: ['root'], effect: (gs) => { gs.passives.shopDiscount = (gs.passives.shopDiscount || 0) + 0.15; } },
    { id: 'g_c', name: 'Investment',    icon: '💰', desc: '+1 atk damage per 15 gold held',            requires: ['root'], effect: (gs) => { gs.passives.goldDmg = 15; } },
    { id: 'g_d', name: 'Compound Int.', icon: '💰', desc: 'Gain 10% of current gold after each combat', requires: ['root'], effect: (gs) => { gs.passives.goldInterest = (gs.passives.goldInterest || 0) + 0.1; } },
    { id: 'g_n', name: 'Golden God',    icon: '👑', desc: '+1 dmg per 8 gold held, free shop refresh', requires: ['g_a', 'g_b', 'g_c', 'g_d'], effect: (gs) => { gs.passives.goldDmg = 8; gs.passives.freeRefresh = true; } },

    // ── TALL FACE 🔨 — dice quality ──
    { id: 't_a', name: 'Precision',     icon: '🔨', desc: '+1 Reroll per combat',                        requires: ['root'], effect: (gs) => { gs.rerolls++; } },
    { id: 't_b', name: 'Forge',         icon: '🔨', desc: 'Unlock Dice Merge at rest stops',             requires: ['root'], effect: (gs) => { gs.passives.canMerge = true; } },
    { id: 't_c', name: 'Threshold',     icon: '🔨', desc: 'Passive: dice ≥8 deal +50% value',            requires: ['root'], effect: (gs) => { gs.passives.threshold = true; } },
    { id: 't_d', name: 'Amplify',       icon: '🔨', desc: 'Gain a free Amplifier rune to attach to a slot', requires: ['root'], effect: (gs) => { gs.pendingRunes.push({...RUNES.find(r => r.effect === 'amplifier')}); } },
    { id: 't_n', name: 'Runeforger',   icon: '👑', desc: 'Your slots can hold up to 3 runes each',        requires: ['t_a', 't_b', 't_c', 't_d'], effect: (gs) => { gs.passives.runeforger = true; } },

    // ── VENOM FACE 🧪 — survival & poison ──
    { id: 'v_a', name: 'Vitality',     icon: '🧪', desc: '+20 Max HP (heals too)',          requires: ['root'], effect: (gs) => { gs.maxHp += 20; gs.hp = Math.min(gs.hp + 20, gs.maxHp); } },
    { id: 'v_b', name: 'Venom',        icon: '🧪', desc: 'All attacks apply 1 poison',      requires: ['root'], effect: (gs) => { gs.passives.poisonOnAtk = (gs.passives.poisonOnAtk || 0) + 1; } },
    { id: 'v_c', name: 'Gambler',      icon: '🧪', desc: '+1 Reroll, rerolls deal 2 dmg',   requires: ['root'], effect: (gs) => { gs.rerolls++; gs.passives.rerollDmg = (gs.passives.rerollDmg || 0) + 2; } },
    { id: 'v_d', name: 'Regeneration', icon: '🧪', desc: 'Heal 3 HP at start of each turn', requires: ['root'], effect: (gs) => { gs.passives.regen = (gs.passives.regen || 0) + 3; } },
    { id: 'v_n', name: 'Plague Lord',  icon: '👑', desc: 'Poison ×2, +2 poison/turn',       requires: ['v_a', 'v_b', 'v_c', 'v_d'], effect: (gs) => { gs.passives.plagueLord = true; } },
];

// ════════════════════════════════════════════════════════════
//  CONSUMABLES
// ════════════════════════════════════════════════════════════
export const CONSUMABLES = [
    // ── POTIONS ──
    { id: 'hp1',    name: 'Healing Potion',         icon: '❤️',    category: 'potion',  rarity: 'common',   price: 10,
      description: 'Restore 20 HP', usableOutsideCombat: true,  usableOnBoss: true },
    { id: 'hp2',    name: 'Greater Healing Potion',  icon: '❤️‍🔥', category: 'potion',  rarity: 'uncommon', price: 20,
      description: 'Restore 40 HP', usableOutsideCombat: true,  usableOnBoss: true },
    { id: 'iron',   name: 'Iron Skin Potion',        icon: '🛡️',   category: 'potion',  rarity: 'rare',     price: 20,
      description: 'Completely block the next enemy attack', usableOutsideCombat: false, usableOnBoss: true },
    { id: 'cleanse',name: 'Cleansing Tonic',         icon: '✨',    category: 'potion',  rarity: 'uncommon', price: 15,
      description: 'Remove all temporary debuffs (poison, burn, sealed slots, dice reduction)', usableOutsideCombat: false, usableOnBoss: true },
    { id: 'rage',   name: 'Rage Potion',             icon: '😤',    category: 'potion',  rarity: 'rare',     price: 25,
      description: 'Double total attack damage this turn (final multiplier)', usableOutsideCombat: false, usableOnBoss: true },
    { id: 'haste',  name: 'Haste Elixir',            icon: '⚡',    category: 'potion',  rarity: 'uncommon', price: 20,
      description: '+2 rerolls and +1 to all dice values this turn', usableOutsideCombat: false, usableOnBoss: true },
    // ── SCROLLS ──
    { id: 'frost',  name: 'Frost Bomb',              icon: '🧊',    category: 'scroll',  rarity: 'rare',     price: 25,
      description: 'Apply 6 Chill and Freeze to enemy (enemy skips next attack)', usableOutsideCombat: false, usableOnBoss: true },
    { id: 'venom',  name: 'Venom Flask',             icon: '🧪',    category: 'scroll',  rarity: 'common',   price: 15,
      description: 'Apply 8 poison to enemy immediately', usableOutsideCombat: false, usableOnBoss: true },
    { id: 'fire',   name: 'Fire Scroll',             icon: '🔥',    category: 'scroll',  rarity: 'uncommon', price: 20,
      description: 'Deal 15 damage and apply 4 burn/turn for 3 turns', usableOutsideCombat: false, usableOnBoss: true },
    { id: 'mark',   name: 'Scroll of Marking',       icon: '🎯',    category: 'scroll',  rarity: 'uncommon', price: 15,
      description: 'Apply 8 Mark to enemy for 3 turns (+8 damage from all sources)', usableOutsideCombat: false, usableOnBoss: true },
    { id: 'weaken', name: 'Scroll of Weakening',     icon: '💔',    category: 'scroll',  rarity: 'uncommon', price: 20,
      description: 'Apply Weaken to enemy for 3 turns (enemy deals 25% less damage)', usableOutsideCombat: false, usableOnBoss: true },
    // ── CHARMS (auto-trigger) ──
    { id: 'ward',   name: 'Death Ward',              icon: '💀',    category: 'charm',   rarity: 'rare',     price: 25,
      description: 'Prevent lethal damage — survive at 1 HP instead of dying', usableOutsideCombat: false, usableOnBoss: true,
      trigger: { condition: 'lethal' } },
    { id: 'retrib', name: 'Retribution Charm',       icon: '⚡',    category: 'charm',   rarity: 'uncommon', price: 20,
      description: 'When hit for 15+ damage: deal 20 damage and stun enemy', usableOutsideCombat: false, usableOnBoss: true,
      trigger: { condition: 'hit', threshold: 15 } },
    { id: 'lucky',  name: 'Lucky Charm',             icon: '🍀',    category: 'charm',   rarity: 'common',   price: 15,
      description: 'After rolling: if your lowest die shows 1 or 2, reroll it to match your highest', usableOutsideCombat: false, usableOnBoss: true,
      trigger: { condition: 'lowRoll', threshold: 2 } },
    { id: 'smoke',  name: 'Escape Smoke',            icon: '💨',    category: 'charm',   rarity: 'uncommon', price: 15,
      description: 'At 20% HP or below: flee combat (no rewards). Cannot flee bosses', usableOutsideCombat: false, usableOnBoss: false,
      trigger: { condition: 'lowHp', threshold: 0.20 } },
];

// ════════════════════════════════════════════════════════════
//  UTILITY DICE
// ════════════════════════════════════════════════════════════
export const UTILITY_DICE = [
    { id: 'gold',      name: 'Gold Die',       icon: '💰', zone: 'either', price: 90,
      desc: 'Generates gold = other dice in zone × rolled %. Rune on this slot doubles the %. 0 damage/block.',
      faceValues: [5, 9, 13, 17, 21, 25] },
    { id: 'poison',    name: 'Poison Die',     icon: '☠️', zone: 'strike', price: 60,
      desc: 'Applies poison = other dice in zone × rolled %. Rune on this slot doubles the %. 0 damage.',
      faceValues: [5, 9, 13, 17, 21, 25] },
    { id: 'chill',     name: 'Chill Die',      icon: '❄️', zone: 'either', price: 60,
      desc: 'Applies chill stacks equal to rolled value. Rune multipliers on this slot apply. 0 dmg/block.',
      faceValues: [1, 2, 2, 3, 3, 4] },
    { id: 'burn',      name: 'Burn Die',       icon: '🔥', zone: 'strike', price: 65,
      desc: 'Applies burn stacks for 3 turns equal to rolled value. Rune multipliers on this slot apply. 0 dmg.',
      faceValues: [1, 1, 2, 2, 3, 3] },
    { id: 'shield',    name: 'Shield Die',     icon: '🛡️', zone: 'either', price: 80,
      desc: 'Contributes its value to BOTH Strike damage AND Guard block simultaneously.',
      faceValues: [2, 3, 4, 5, 6, 7] },
    { id: 'mark',      name: 'Mark Die',       icon: '🎯', zone: 'strike', price: 65,
      desc: 'Applies mark for 2 turns equal to rolled value. Rune multipliers on this slot apply. 0 dmg.',
      faceValues: [1, 2, 2, 3, 3, 4] },
    { id: 'amplifier', name: 'Amplifier Die',  icon: '📡', zone: 'either', price: 100,
      desc: 'Multiplies total output of all other dice in its zone. Useless alone.',
      faceValues: [150, 175, 200, 225, 250, 300] },  // values are percentages (150 = ×1.5)
    { id: 'mimic',     name: 'Mimic Die',      icon: '🪞', zone: 'either', price: 70,
      desc: 'At roll time, copies a random die from your pool and rolls as if it were that die. Re-picks each turn.',
      faceValues: [1, 2, 3, 4, 5, 6] },
];

// Common pool for weighted random
const _COMMON_POOL    = CONSUMABLES.filter(c => c.rarity === 'common');
const _UNCOMMON_POOL  = CONSUMABLES.filter(c => c.rarity === 'uncommon');
const _RARE_POOL      = CONSUMABLES.filter(c => c.rarity === 'rare');

export function pickWeightedConsumable(forceRarity) {
    let pool;
    if (forceRarity === 'common') {
        pool = _COMMON_POOL;
    } else {
        const roll = Math.random() * 100;
        if (roll < 40)       pool = _COMMON_POOL;
        else if (roll < 75)  pool = _UNCOMMON_POOL;
        else                 pool = _RARE_POOL;
    }
    const template = pool[Math.floor(Math.random() * pool.length)];
    return { ...template };
}

// Generate market stock: at least 1 common, 1 uncommon, rest weighted
export function pickConsumablesForMarket(n = 5) {
    const result = [];
    const used = new Set();
    const addFrom = (pool) => {
        const avail = pool.filter(c => !used.has(c.id));
        if (!avail.length) return;
        const pick = avail[Math.floor(Math.random() * avail.length)];
        used.add(pick.id);
        result.push({ ...pick });
    };
    addFrom(_COMMON_POOL);
    addFrom(_UNCOMMON_POOL);
    while (result.length < n) {
        const roll = Math.random() * 100;
        let pool = roll < 40 ? _COMMON_POOL : roll < 75 ? _UNCOMMON_POOL : _RARE_POOL;
        const avail = pool.filter(c => !used.has(c.id));
        if (!avail.length) {
            // fallback: pick any unused
            const allUnused = CONSUMABLES.filter(c => !used.has(c.id));
            if (!allUnused.length) break;
            const pick = allUnused[Math.floor(Math.random() * allUnused.length)];
            used.add(pick.id);
            result.push({ ...pick });
        } else {
            const pick = avail[Math.floor(Math.random() * avail.length)];
            used.add(pick.id);
            result.push({ ...pick });
        }
    }
    return result;
}
