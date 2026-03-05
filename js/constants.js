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
//  ENEMIES — Per-Act Stat Blocks
//  Each enemy has explicit stats per act. No hidden multipliers.
//  Act 1: vanilla (basic stats)
//  Act 2: +1 ability or passive
//  Act 3: +dice mod (post-attack effect or defensive mechanic)
// ════════════════════════════════════════════════════════════
export const ENEMIES = {
    // ── UNIVERSAL ENEMIES (Acts 1–3) ────────────────────────

    goblin: {
        id: 'goblin', name: 'Goblin', image: 'assets/enemies/goblin.webp',
        act1: {
            hp: 16, dice: [6, 6, 6], gold: [15, 25], xp: [20, 30],
            abilities: {
                strike: { name: 'Strike', icon: '⚔️', type: 'attack', desc: 'Deal damage' },
            },
            passives: [],
            pattern: ['strike'],
        },
        act2: {
            hp: 80, dice: [10, 10, 10], gold: [22, 35], xp: [38, 55],
            abilities: {
                strike: { name: 'Strike', icon: '⚔️', type: 'attack', desc: 'Deal damage' },
            },
            passives: [
                { id: 'frenzy', name: 'Frenzy', desc: 'After taking damage, gains +1 die next turn', params: { extraDice: 1, duration: 1 } },
            ],
            pattern: ['strike'],
        },
        act3: {
            hp: 450, dice: [12, 12, 12, 12], gold: [40, 60], xp: [60, 85],
            abilities: {
                strike: { name: 'Strike', icon: '⚔️', type: 'attack', desc: 'Deal damage' },
            },
            passives: [
                { id: 'frenzy', name: 'Frenzy', desc: 'After taking damage, gains +1 die for 2 turns', params: { extraDice: 1, duration: 2 } },
                { id: 'shiv', name: 'Shiv', desc: 'After attacking, corrupt 1 player die (-1 max)', params: {} },
            ],
            pattern: ['strike'],
        },
    },

    dire_rat: {
        id: 'dire_rat', name: 'Dire Rat', image: 'assets/enemies/direrat.webp',
        act1: {
            hp: 14, dice: [4, 4, 4, 4], gold: [12, 20], xp: [15, 25],
            abilities: {
                frenzy: { name: 'Frenzy', icon: '🐀', type: 'attack', desc: 'Each die hits separately', multiHit: true },
            },
            passives: [],
            pattern: ['frenzy'],
        },
        act2: {
            hp: 90, dice: [6, 6, 6, 6], gold: [22, 35], xp: [38, 55],
            abilities: {
                frenzy: { name: 'Frenzy', icon: '🐀', type: 'attack', desc: 'Each die hits separately', multiHit: true },
            },
            passives: [
                { id: 'plague', name: 'Plague', desc: 'On hit, applies 2 poison for 2 turns', params: { poisonDmg: 2, duration: 2 } },
            ],
            pattern: ['frenzy'],
        },
        act3: {
            hp: 550, dice: [6, 6, 6, 6, 6, 6], gold: [42, 62], xp: [62, 88],
            abilities: {
                frenzy: { name: 'Frenzy', icon: '🐀', type: 'attack', desc: 'Each die hits separately', multiHit: true },
            },
            passives: [
                { id: 'plague', name: 'Plague', desc: 'On hit, applies 3 poison for 3 turns', params: { poisonDmg: 3, duration: 3 } },
                { id: 'gnaw', name: 'Gnaw', desc: 'Each hit locks 1 player die for 1 turn', params: {} },
            ],
            pattern: ['frenzy'],
        },
    },

    fungal_creep: {
        id: 'fungal_creep', name: 'Fungal Creep', image: 'assets/enemies/fungal_creep.webp',
        act1: {
            hp: 18, dice: [6, 6], gold: [15, 22], xp: [20, 35],
            abilities: {
                strike: { name: 'Strike', icon: '⚔️', type: 'attack', desc: 'Deal damage' },
                spore:  { name: 'Spore Cloud', icon: '🍄', type: 'poison', desc: 'Apply 1 poison for 2 turns', fixedPoison: 1, fixedDuration: 2 },
            },
            passives: [],
            pattern: ['strike', 'spore'],
        },
        act2: {
            hp: 120, dice: [8, 8], gold: [20, 32], xp: [35, 52],
            abilities: {
                strike: { name: 'Strike', icon: '⚔️', type: 'attack', desc: 'Deal damage' },
                spore:  { name: 'Spore Cloud', icon: '🍄', type: 'poison', desc: 'Apply 2 poison for 3 turns + heal self 3', fixedPoison: 2, fixedDuration: 3, selfHeal: 3 },
            },
            passives: [],
            pattern: ['strike', 'spore'],
        },
        act3: {
            hp: 600, dice: [10, 10, 10], gold: [38, 58], xp: [58, 82],
            abilities: {
                strike: { name: 'Strike', icon: '⚔️', type: 'attack', desc: 'Deal damage' },
                spore:  { name: 'Spore Cloud', icon: '🍄', type: 'poison', desc: 'Apply 3 poison for 3 turns + heal self 5', fixedPoison: 3, fixedDuration: 3, selfHeal: 5 },
            },
            passives: [
                { id: 'mycotoxin', name: 'Mycotoxin', desc: 'Poison ticks reduce 1 random player die max by 1', params: {} },
            ],
            pattern: ['strike', 'spore'],
        },
    },

    slime: {
        id: 'slime', name: 'Slime', image: 'assets/enemies/slime.webp',
        act1: {
            hp: 22, dice: [6, 6], gold: [14, 24], xp: [18, 30],
            abilities: {
                strike: { name: 'Strike', icon: '⚔️', type: 'attack', desc: 'Deal damage' },
            },
            passives: [],
            pattern: ['strike'],
        },
        act2: {
            hp: 130, dice: [8, 8], gold: [22, 35], xp: [38, 55],
            abilities: {
                strike: { name: 'Strike', icon: '⚔️', type: 'attack', desc: 'Deal damage' },
            },
            passives: [
                { id: 'engorge', name: 'Engorge', desc: 'After 3 turns, gains +6 HP and heals to full', params: { turnTrigger: 3, bonusHp: 6 } },
            ],
            pattern: ['strike'],
        },
        act3: {
            hp: 800, dice: [10, 10], gold: [38, 58], xp: [58, 82],
            abilities: {
                strike: { name: 'Strike', icon: '⚔️', type: 'attack', desc: 'Deal damage' },
            },
            passives: [
                { id: 'engorge', name: 'Engorge', desc: 'After 2 turns, gains +8 HP and heals to full', params: { turnTrigger: 2, bonusHp: 8 } },
                { id: 'absorb', name: 'Absorb', desc: 'While engorged, non-lethal strikes increase a die face by 1', params: {} },
            ],
            pattern: ['strike'],
        },
    },

    skeleton: {
        id: 'skeleton', name: 'Skeleton', image: 'assets/enemies/skeleton.webp',
        act1: {
            hp: 20, dice: [8, 8], gold: [14, 22], xp: [18, 28],
            abilities: {
                strike: { name: 'Strike', icon: '⚔️', type: 'attack', desc: 'Deal damage' },
            },
            passives: [
                { id: 'brittle', name: 'Brittle', desc: 'Per-slot damage above 4 is doubled', params: { threshold: 4 } },
            ],
            pattern: ['strike'],
        },
        act2: {
            hp: 95, dice: [10, 10], gold: [22, 34], xp: [36, 54],
            abilities: {
                strike: { name: 'Strike', icon: '⚔️', type: 'attack', desc: 'Deal damage' },
            },
            passives: [
                { id: 'reassemble', name: 'Reassemble', desc: 'Revives once at 50% HP', params: { revivePercent: 0.5 } },
            ],
            pattern: ['strike'],
        },
        act3: {
            hp: 500, dice: [12, 12, 12], gold: [42, 62], xp: [62, 88],
            abilities: {
                strike: { name: 'Strike', icon: '⚔️', type: 'attack', desc: 'Deal damage' },
            },
            passives: [
                { id: 'reassemble', name: 'Reassemble', desc: 'Revives once at 50% HP and gains +1 die', params: { revivePercent: 0.5, bonusDice: 1 } },
                { id: 'boneCage', name: 'Bone Cage', desc: 'On revive, locks all player dice for 1 turn', params: {} },
            ],
            pattern: ['strike'],
        },
    },

    dark_mage: {
        id: 'dark_mage', name: 'Dark Mage', image: 'assets/enemies/Dark_Mage.webp',
        act1: {
            hp: 14, dice: [10, 10], gold: [15, 25], xp: [20, 32],
            abilities: {
                strike: { name: 'Strike', icon: '⚔️', type: 'attack', desc: 'Deal damage' },
            },
            passives: [],
            pattern: ['strike'],
        },
        act2: {
            hp: 85, dice: [12, 12, 12], gold: [22, 35], xp: [40, 60],
            abilities: {
                bolt:  { name: 'Shadow Bolt', icon: '🔮', type: 'attack', desc: 'Deal damage (penetrates 5 block)', penetrate: 5 },
                curse: { name: 'Curse', icon: '💀', type: 'curse', desc: 'Reduce all player dice by 1 for 2 turns', diceCurse: 1, fixedDuration: 2 },
            },
            passives: [],
            pattern: ['bolt', 'bolt', 'curse'],
        },
        act3: {
            hp: 500, dice: [12, 12, 12, 12, 12], gold: [42, 62], xp: [62, 88],
            abilities: {
                bolt:  { name: 'Shadow Bolt', icon: '🔮', type: 'attack', desc: 'Deal damage (penetrates 5 block)', penetrate: 5 },
                curse: { name: 'Curse', icon: '💀', type: 'curse', desc: 'Reduce all player dice by 2 for 3 turns', diceCurse: 2, fixedDuration: 3 },
            },
            passives: [
                { id: 'hex', name: 'Hex', desc: 'Cursed dice that roll 1 are removed from pool', params: {} },
            ],
            pattern: ['bolt', 'bolt', 'curse'],
        },
    },

    orc_warrior: {
        id: 'orc_warrior', name: 'Orc Warrior', image: 'assets/enemies/orc_warrior.webp',
        act1: {
            hp: 20, dice: [8, 8], gold: [15, 25], xp: [20, 30],
            abilities: {
                strike: { name: 'Strike', icon: '⚔️', type: 'attack', desc: 'Deal damage' },
            },
            passives: [],
            pattern: ['strike'],
        },
        act2: {
            hp: 120, dice: [10, 10, 10], gold: [24, 38], xp: [40, 58],
            abilities: {
                strike: { name: 'Strike', icon: '⚔️', type: 'attack', desc: 'Deal damage' },
                warCry: { name: 'War Cry', icon: '📯', type: 'buff', desc: 'Gains +1 die for 2 turns', buffDice: 1, buffDuration: 2 },
            },
            passives: [],
            pattern: ['strike', 'strike', 'warCry'],
        },
        act3: {
            hp: 650, dice: [12, 12, 12, 12], gold: [45, 65], xp: [65, 92],
            abilities: {
                strike: { name: 'Strike', icon: '⚔️', type: 'attack', desc: 'Deal damage' },
                warCry: { name: 'War Cry', icon: '📯', type: 'buff', desc: 'Gains +2 dice for 2 turns', buffDice: 2, buffDuration: 2 },
            },
            passives: [
                { id: 'sunder', name: 'Sunder', desc: 'War Cry also reduces 1 player die max by 1', params: {} },
            ],
            pattern: ['strike', 'strike', 'warCry'],
        },
    },

    troll: {
        id: 'troll', name: 'Troll', image: 'assets/enemies/Troll.webp',
        act1: {
            hp: 26, dice: [6, 6], gold: [16, 26], xp: [20, 32],
            abilities: {
                strike: { name: 'Smash', icon: '💪', type: 'attack', desc: 'Deal damage' },
            },
            passives: [],
            pattern: ['strike'],
        },
        act2: {
            hp: 170, dice: [10, 10], gold: [22, 34], xp: [36, 55],
            abilities: {
                strike: { name: 'Smash', icon: '💪', type: 'attack', desc: 'Deal damage' },
                heal:   { name: 'Regenerate', icon: '💚', type: 'heal', desc: 'Heal HP equal to dice sum' },
            },
            passives: [
                { id: 'regen', name: 'Passive Regen', desc: 'Heals 3 HP per turn', params: { amount: 3 } },
            ],
            pattern: ['strike', 'strike', 'heal'],
        },
        act3: {
            hp: 900, dice: [12, 12], gold: [42, 62], xp: [62, 88],
            abilities: {
                strike: { name: 'Smash', icon: '💪', type: 'attack', desc: 'Deal damage' },
                heal:   { name: 'Regenerate', icon: '💚', type: 'heal', desc: 'Heal HP equal to dice sum' },
            },
            passives: [
                { id: 'regen', name: 'Passive Regen', desc: 'Heals 5 HP per turn', params: { amount: 5 } },
                { id: 'thickHide', name: 'Thick Hide', desc: 'Ignores slot damage below 10', params: { threshold: 10 } },
            ],
            pattern: ['strike', 'strike', 'heal'],
        },
    },

    vampire: {
        id: 'vampire', name: 'Vampire', image: 'assets/enemies/Vampire.webp',
        act1: {
            hp: 20, dice: [6, 6], gold: [14, 22], xp: [18, 28],
            abilities: {
                strike: { name: 'Strike', icon: '⚔️', type: 'attack', desc: 'Deal damage' },
            },
            passives: [],
            pattern: ['strike'],
        },
        act2: {
            hp: 100, dice: [8, 8, 8], gold: [25, 40], xp: [45, 65],
            abilities: {
                drain: { name: 'Drain', icon: '🩸', type: 'attack', desc: 'Deal damage and heal 50% of amount dealt' },
            },
            passives: [
                { id: 'lifesteal', name: 'Lifesteal', desc: 'Heals 50% of damage dealt to player', params: { percent: 0.5 } },
            ],
            pattern: ['drain'],
        },
        act3: {
            hp: 550, dice: [10, 10, 10, 10], gold: [44, 64], xp: [64, 90],
            abilities: {
                drain: { name: 'Drain', icon: '🩸', type: 'attack', desc: 'Deal damage and heal 75% of amount dealt' },
            },
            passives: [
                { id: 'lifesteal', name: 'Lifesteal', desc: 'Heals 75% of damage dealt to player', params: { percent: 0.75 } },
                { id: 'drainMod', name: 'Life Drain', desc: 'Drain also sets 1 player die to 1', params: {} },
            ],
            pattern: ['drain'],
        },
    },

    mimic: {
        id: 'mimic', name: 'Mimic', image: 'assets/enemies/Mimic.webp',
        act1: {
            hp: 18, dice: [6, 6], gold: [14, 22], xp: [18, 28],
            abilities: {
                strike: { name: 'Strike', icon: '⚔️', type: 'attack', desc: 'Deal damage' },
            },
            passives: [],
            pattern: ['strike'],
        },
        act2: {
            hp: 110, dice: [8, 8, 8], gold: [22, 35], xp: [38, 55],
            abilities: {
                strike: { name: 'Strike', icon: '⚔️', type: 'attack', desc: 'Deal damage' },
            },
            passives: [
                { id: 'greedTax', name: 'Greed Tax', desc: 'Steals 5 gold on hit', params: { goldSteal: 5 } },
            ],
            pattern: ['strike'],
        },
        act3: {
            hp: 800, dice: [10, 10, 10], gold: [40, 60], xp: [60, 85],
            abilities: {
                strike: { name: 'Strike', icon: '⚔️', type: 'attack', desc: 'Deal damage' },
            },
            passives: [
                { id: 'greedTax', name: 'Greed Tax', desc: 'Steals 8 gold on hit', params: { goldSteal: 8 } },
                { id: 'devour', name: 'Devour', desc: 'On hit, swallows 1 player die for 2 turns', params: { duration: 2 } },
            ],
            pattern: ['strike'],
        },
    },

    // ── SPECIALIST ENEMIES (Acts 2–3) ───────────────────────

    demon: {
        id: 'demon', name: 'Demon', image: 'assets/enemies/Demon.webp',
        act2: {
            hp: 110, dice: [10, 10], gold: [28, 42], xp: [42, 62],
            abilities: {
                strike:   { name: 'Strike', icon: '⚔️', type: 'attack', desc: 'Deal damage' },
                hellfire: { name: 'Hellfire', icon: '🔥', type: 'unblockable', desc: 'Deal unblockable damage (max 15)', maxDamage: 15 },
            },
            passives: [
                { id: 'soulPact', name: 'Soul Pact', desc: 'Overkill damage reflects back to player', params: {} },
            ],
            pattern: ['strike', 'hellfire'],
        },
        act3: {
            hp: 520, dice: [12, 12, 12, 12], gold: [45, 65], xp: [65, 92],
            abilities: {
                strike:   { name: 'Strike', icon: '⚔️', type: 'attack', desc: 'Deal damage' },
                hellfire: { name: 'Hellfire', icon: '🔥', type: 'unblockable', desc: 'Deal unblockable damage (max 20)', maxDamage: 20 },
            },
            passives: [
                { id: 'soulPact', name: 'Soul Pact', desc: 'Overkill damage reflects back to player', params: {} },
                { id: 'hellfireMod', name: 'Hellfire Corruption', desc: 'Each hit corrupts 1 player die (-1 max)', params: {} },
            ],
            pattern: ['strike', 'hellfire'],
        },
    },

    lich: {
        id: 'lich', name: 'Lich', image: 'assets/enemies/Lich.webp',
        act2: {
            hp: 65, dice: [12, 12, 12], gold: [28, 42], xp: [42, 62],
            abilities: {
                strike: { name: 'Strike', icon: '⚔️', type: 'attack', desc: 'Deal damage' },
            },
            passives: [
                { id: 'phylactery', name: 'Phylactery', desc: 'Revives once at 50% HP', params: { revivePercent: 0.5 } },
            ],
            pattern: ['strike'],
        },
        act3: {
            hp: 450, dice: [12, 12, 12, 12, 12], gold: [45, 65], xp: [65, 92],
            abilities: {
                strike: { name: 'Strike', icon: '⚔️', type: 'attack', desc: 'Deal damage' },
                decay:  { name: 'Decay', icon: '💀', type: 'decay', desc: 'All your dice permanently lose 1 max value this fight' },
            },
            passives: [
                { id: 'phylactery', name: 'Phylactery', desc: 'Revives once at 75% HP', params: { revivePercent: 0.75 } },
            ],
            pattern: ['strike', 'strike', 'decay'],
        },
    },

    dragon_whelp: {
        id: 'dragon_whelp', name: 'Dragon Whelp', image: 'assets/enemies/Dragon_Whelp.webp',
        act2: {
            hp: 105, dice: [10, 10, 10], gold: [30, 45], xp: [45, 65],
            abilities: {
                strike: { name: 'Strike', icon: '⚔️', type: 'attack', desc: 'Deal damage' },
                charge: { name: 'Breath Charge', icon: '🔥', type: 'charge', desc: 'Charging... immune to damage, next attack doubled!', immune: true },
            },
            passives: [],
            pattern: ['charge', 'strike'],
        },
        act3: {
            hp: 480, dice: [12, 12, 12, 12], gold: [48, 68], xp: [68, 95],
            abilities: {
                strike: { name: 'Strike', icon: '⚔️', type: 'attack', desc: 'Deal damage' },
                charge: { name: 'Breath Charge', icon: '🔥', type: 'charge', desc: 'Charging... immune to damage, next attack doubled!', immune: true },
            },
            passives: [
                { id: 'scales', name: 'Dragon Scales', desc: 'First 8 damage from each slot is ignored', params: { perSlot: 8 } },
            ],
            pattern: ['charge', 'strike'],
        },
    },

    shadow_assassin: {
        id: 'shadow_assassin', name: 'Shadow Assassin', image: 'assets/enemies/Shadow_Assassin.webp',
        act2: {
            hp: 75, dice: [12, 12, 12], gold: [24, 38], xp: [40, 58],
            abilities: {
                strike: { name: 'Strike', icon: '🗡️', type: 'attack', desc: 'Deal damage' },
                vanish: { name: 'Vanish', icon: '💨', type: 'charge', desc: 'Disappears — immune this turn. Next strike doubled.', immune: true },
            },
            passives: [],
            pattern: ['strike', 'strike', 'vanish'],
        },
        act3: {
            hp: 450, dice: [12, 12, 12, 12], gold: [44, 64], xp: [64, 90],
            abilities: {
                strike: { name: 'Strike', icon: '🗡️', type: 'attack', desc: 'Deal damage' },
                vanish: { name: 'Vanish', icon: '💨', type: 'charge', desc: 'Disappears — immune this turn. Next strike doubled.', immune: true },
            },
            passives: [
                { id: 'evasion', name: 'Evasion', desc: 'One random attack die is ignored each turn', params: {} },
            ],
            pattern: ['strike', 'vanish'],
        },
    },

    iron_golem: {
        id: 'iron_golem', name: 'Iron Golem', image: 'assets/enemies/Iron_Golem.webp',
        act2: {
            hp: 170, dice: [8, 8], gold: [25, 38], xp: [40, 58],
            abilities: {
                strike: { name: 'Strike', icon: '⚔️', type: 'attack', desc: 'Deal damage' },
            },
            passives: [
                { id: 'armor', name: 'Iron Armor', desc: 'Reduces ALL incoming damage by 2', params: { reduction: 2 } },
            ],
            pattern: ['strike'],
        },
        act3: {
            hp: 1000, dice: [12, 12], gold: [50, 70], xp: [70, 95],
            abilities: {
                strike: { name: 'Strike', icon: '⚔️', type: 'attack', desc: 'Deal damage' },
            },
            passives: [
                { id: 'armor', name: 'Iron Armor', desc: 'Reduces ALL incoming damage by 3', params: { reduction: 3 } },
                { id: 'escalate', name: 'Escalate', desc: 'Gains +1d8 every 3 turns', params: { interval: 3, dieSize: 8 } },
            ],
            pattern: ['strike'],
        },
    },
};

// ════════════════════════════════════════════════════════════
//  ENEMY RESOLUTION HELPERS
// ════════════════════════════════════════════════════════════

/**
 * Resolve an enemy for a specific act.
 * Merges the enemy's identity (id, name, image) with act-specific stats
 * into a flat object matching the shape expected by combat/encounter systems.
 * @param {string} enemyId - Key in ENEMIES (e.g. 'goblin')
 * @param {number} act - Act number (1, 2, or 3)
 * @returns {object|null} Flat enemy template or null if not available in that act
 */
export function resolveEnemy(enemyId, act) {
    const entry = ENEMIES[enemyId];
    if (!entry) return null;
    const actBlock = entry[`act${act}`];
    if (!actBlock) return null;
    return {
        id: entry.id,
        name: entry.name,
        image: entry.image,
        ...actBlock,
    };
}

/**
 * Get all enemies available in a given act.
 * @param {number} act - Act number (1, 2, or 3)
 * @returns {object[]} Array of resolved enemy templates
 */
export function getEnemyPool(act) {
    return Object.keys(ENEMIES)
        .filter(id => ENEMIES[id][`act${act}`])
        .map(id => resolveEnemy(id, act));
}

export const BOSSES = {
    5: {
        id: 'bone_king',
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
        name: 'Crimson Wyrm', hp: 250, dice: [10, 10, 10, 10], gold: 150, xp: 80, image: 'assets/enemies/Crimson_Dragon.webp',
        id: 'crimson_wyrm',
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
                    addDice: [10, 10],
                    addPassives: [{ id: 'burnOnPhase', name: 'Inferno', desc: 'All attacks apply 2 burn', params: { burn: 2 } }],
                    log: 'The Crimson Wyrm roars with fury! Flames engulf its body!',
                },
            },
        ],
    },
    15: {
        name: 'The Void Lord', hp: 600, dice: [12, 12, 12, 12, 12, 12], gold: 250, xp: 120, image: 'assets/enemies/The_Void_Lord.webp',
        id: 'void_lord',
        abilities: {
            strike:    { name: 'Strike', icon: '⚔️', type: 'attack', desc: 'Deal damage' },
            voidRift:  { name: 'Void Rift', icon: '🌀', type: 'curse', desc: 'Seal 2 random slots for 1 turn', slotsToSeal: 2, fixedDuration: 1 },
            darkPulse: { name: 'Dark Pulse', icon: '💜', type: 'unblockable', desc: 'Deal unblockable damage (max 22)', maxDamage: 22 },
        },
        passives: [],
        pattern: ['strike', 'voidRift', 'darkPulse'],
        phases: [
            {
                trigger: { hpPercent: 0.5 },
                changes: {
                    addDice: [12, 12],
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
    const act = getAct(floor);
    if (floor === 1) return resolveEnemy('goblin', 1);  // always Goblin
    if (floor === 2) {
        const id = Math.random() < 0.5 ? 'dire_rat' : 'skeleton';
        return resolveEnemy(id, 1);
    }
    const pool = getEnemyPool(act);
    return pool[Math.floor(Math.random() * pool.length)];
}

// ════════════════════════════════════════════════════════════
//  FACE MODIFIERS
// ════════════════════════════════════════════════════════════
export const FACE_MODS = [
    // ── SPIKE TIER (high power, triggers ~1/N times) ──
    { name: 'Executioner',     icon: '⚔️', desc: 'Permanently ×5 a face\'s value (does not use the mod slot)',          effect: 'executioner',   color: '#d03030', transform: 5, rarity: 'uncommon' },
    { name: 'Freeze Strike',   icon: '🧊', desc: 'This face: freeze enemy (they skip their next attack)',                effect: 'freezeStrike',  color: '#60c0e0', rarity: 'uncommon' },
    { name: 'Jackpot',         icon: '💰', desc: 'This face: gain 50 gold',                                              effect: 'jackpot',       color: '#d4a534', rarity: 'common' },
    { name: 'Chain Lightning', icon: '⚡', desc: 'This face: the rolled face value is applied twice (×2)',                effect: 'chainLightning',color: '#8080e0', rarity: 'rare' },
    { name: 'Critical',        icon: '💥', desc: 'This face: rolled face value is added to ALL slots simultaneously',     effect: 'critical',      color: '#e0a020', rarity: 'rare' },
    { name: 'Shield Bash',     icon: '🛡️', desc: 'This face: block value also dealt as damage (guard only)',            effect: 'shieldBash',    color: '#4060c0', rarity: 'uncommon' },

    // ── STATUS TIER (apply status effects on trigger) ──
    { name: 'Volatile',  icon: '🎲', desc: 'This face: replace rolled value with rand(1, max×2)',           effect: 'volatile',  color: '#d07020', rarity: 'common' },
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
    { name: 'Amplifier',    icon: '🔮', color: '#9060d0', slot: 'either', desc: 'Everything this die does is doubled (value ×2, face mod effects ×2)',    effect: 'amplifier',  rarity: 'rare' },
    { name: "Titan's Blow", icon: '💪', color: '#d07030', slot: 'either', desc: 'If the only die in its slot, output is tripled',                          effect: 'titanBlow',  rarity: 'rare' },
    { name: 'Siphon',       icon: '🩸', color: '#c02020', slot: 'strike', desc: "This die's damage also heals you for 100% of its contribution",           effect: 'siphon',     rarity: 'uncommon' },
    { name: 'Regen Core',   icon: '💚', color: '#30a050', slot: 'guard',  desc: "This die's block also heals you for 50% (round up)",                      effect: 'regenCore',  rarity: 'uncommon' },
    { name: 'Mirror',       icon: '🪞', color: '#3060c0', slot: 'guard',  desc: "Block from this die is also dealt as damage to the enemy",                effect: 'mirror',     rarity: 'uncommon' },
    { name: 'Leaden',       icon: '⚓', color: '#606080', slot: 'guard',  desc: "Double block from this die, but it cannot be rerolled",                   effect: 'leaden',     rarity: 'common' },
    { name: 'Steadfast',    icon: '🛡️', color: '#4080b0', slot: 'guard',  desc: "This die's block ignores all enemy reduction effects",                   effect: 'steadfast',  rarity: 'common' },
    { name: 'Poison Core',  icon: '☠️', color: '#50a030', slot: 'strike', desc: "Every roll applies poison to the enemy equal to this die's rolled value", effect: 'poisonCore', rarity: 'uncommon' },
    { name: 'Lucky',        icon: '🎰', color: '#30a0a0', slot: 'either', desc: 'When a die is placed in this slot, gain +1 reroll this combat',           effect: 'lucky',      rarity: 'common' },
    { name: 'Splinter',     icon: '🔀', color: '#a06030', slot: 'strike', desc: "This die's value is split equally among all other dice in this slot; the die itself contributes 0", effect: 'splinter', rarity: 'uncommon' },
];

// ════════════════════════════════════════════════════════════
//  PASSIVE SKILL DIE
// ════════════════════════════════════════════════════════════
export const SKILL_TREE = [
    // ── ROOT ──
    { id: 'root', name: 'Adventurer', icon: '⭐', desc: '+1 Strike Slot, +1 Guard Slot', requires: [], effect: (gs) => { gs.slots.strike.push({ id: `str-${Date.now()}`, rune: null }); gs.slots.guard.push({ id: `grd-${Date.now()}`, rune: null }); } },

    // ── WIDE FACE 🐺 — slots & quantity ──
    { id: 'w_a', name: 'Extra Arms',   icon: '🐺', desc: '+1 Strike Slot',                          requires: ['root'], effect: (gs) => { gs.slots.strike.push({ id: `str-${Date.now()}`, rune: null }); } },
    { id: 'w_b', name: 'Pack Tactics', icon: '🐺', desc: 'Passive: +1 dmg per die in the strike zone', requires: ['root'], effect: (gs) => { gs.passives.packTactics = (gs.passives.packTactics || 0) + 1; } },
    { id: 'w_c', name: 'Shield Wall',  icon: '🐺', desc: '+1 Guard Slot',                           requires: ['root'], effect: (gs) => { gs.slots.guard.push({ id: `grd-${Date.now()}`, rune: null }); } },
    { id: 'w_d', name: 'Volley',       icon: '🐺', desc: 'Passive: 4+ dice in zone = +3 per die', requires: ['root'], effect: (gs) => { gs.passives.volley = (gs.passives.volley || 0) + 3; } },
    { id: 'w_n', name: 'Swarm Master', icon: '👑', desc: 'Passive: +2 per die in any zone',        requires: ['w_a', 'w_b', 'w_c', 'w_d'], effect: (gs) => { gs.passives.swarmMaster = (gs.passives.swarmMaster || 0) + 2; } },

    // ── GOLD FACE 💰 — economy ──
    { id: 'g_a', name: 'Prospector',    icon: '💰', desc: '+15 gold immediately, +4 gold per combat',   requires: ['root'], effect: (gs) => { gs.gold += 15; gs.passives.goldPerCombat = (gs.passives.goldPerCombat || 0) + 4; } },
    { id: 'g_b', name: 'Appraisal',     icon: '💰', desc: 'Shop prices reduced by 15%',                requires: ['root'], effect: (gs) => { gs.passives.shopDiscount = (gs.passives.shopDiscount || 0) + 0.15; } },
    { id: 'g_c', name: 'Investment',    icon: '💰', desc: '+1 atk damage per 15 gold held',            requires: ['root'], effect: (gs) => { gs.passives.goldDmg = 15; } },
    { id: 'g_d', name: 'Compound Int.', icon: '💰', desc: 'Gain 10% of current gold after each combat', requires: ['root'], effect: (gs) => { gs.passives.goldInterest = (gs.passives.goldInterest || 0) + 0.1; } },
    { id: 'g_n', name: 'Golden God',    icon: '👑', desc: '+1 dmg per 8 gold held, free shop refresh', requires: ['g_a', 'g_b', 'g_c', 'g_d'], effect: (gs) => { gs.passives.goldDmg = 8; gs.passives.freeRefresh = true; } },

    // ── TALL FACE 🔨 — dice quality ──
    { id: 't_a', name: 'Precision',     icon: '🔨', desc: '+1 Reroll per combat',                        requires: ['root'], effect: (gs) => { gs.rerolls++; } },
    { id: 't_b', name: 'Forge',         icon: '🔨', desc: 'Unlock Dice Merge at rest stops',             requires: ['root'], effect: (gs) => { gs.passives.canMerge = true; } },
    { id: 't_c', name: 'Threshold',     icon: '🔨', desc: 'Passive: dice ≥12 deal double value',         requires: ['root'], effect: (gs) => { gs.passives.threshold = true; } },
    { id: 't_d', name: 'Amplify',       icon: '🔨', desc: 'Gain a free Amplifier rune to attach to a slot', requires: ['root'], effect: (gs) => { gs.pendingRunes.push({...RUNES.find(r => r.effect === 'amplifier')}); } },
    { id: 't_n', name: 'Runeforger',   icon: '👑', desc: 'Your slots can hold up to 3 runes each',        requires: ['t_a', 't_b', 't_c', 't_d'], effect: (gs) => { gs.passives.runeforger = true; } },

    // ── VENOM FACE 🧪 — survival & poison ──
    { id: 'v_a', name: 'Vitality',     icon: '🧪', desc: '+20 Max HP (heals too)',          requires: ['root'], effect: (gs) => { gs.maxHp += 20; gs.hp = Math.min(gs.hp + 20, gs.maxHp); } },
    { id: 'v_b', name: 'Venom',        icon: '🧪', desc: 'All attacks apply 1 poison',      requires: ['root'], effect: (gs) => { gs.passives.poisonOnAtk = (gs.passives.poisonOnAtk || 0) + 1; } },
    { id: 'v_c', name: 'Gambler',      icon: '🧪', desc: '+1 Reroll, rerolls deal 2 dmg',   requires: ['root'], effect: (gs) => { gs.rerolls++; gs.passives.rerollDmg = (gs.passives.rerollDmg || 0) + 2; } },
    { id: 'v_d', name: 'Regeneration', icon: '🧪', desc: 'Heal 3 HP at start of each turn', requires: ['root'], effect: (gs) => { gs.passives.regen = (gs.passives.regen || 0) + 3; } },
    { id: 'v_n', name: 'Plague Lord',  icon: '👑', desc: 'Poison ×2, +2 poison/turn',       requires: ['v_a', 'v_b', 'v_c', 'v_d'], effect: (gs) => { gs.passives.plagueLord = true; } },

    // ── HEART FACE ❤️ — sustain ──
    { id: 'h_a', name: 'Fortify',       icon: '❤️', desc: '+15 Max HP; heal 8 HP at the start of each combat',          requires: ['root'], effect: (gs) => { gs.maxHp += 15; gs.hp = Math.min(gs.hp + 15, gs.maxHp); gs.passives.combatStartHeal = (gs.passives.combatStartHeal || 0) + 8; } },
    { id: 'h_b', name: 'Convalescence', icon: '❤️', desc: 'After each combat, heal 25% of missing HP',                   requires: ['root'], effect: (gs) => { gs.passives.postCombatRecovery = (gs.passives.postCombatRecovery || 0) + 0.25; } },
    { id: 'h_c', name: 'Iron Vitality', icon: '❤️', desc: '+1 regen/turn per 8 Max HP (scales with HP investment)',     requires: ['root'], effect: (gs) => { gs.passives.ironVitality = true; } },
    { id: 'h_d', name: 'Bulwark',       icon: '❤️', desc: 'While above 75% HP, guard dice each count +2 to their value', requires: ['root'], effect: (gs) => { gs.passives.bulwark = true; } },
    { id: 'h_n', name: 'Life Weave',    icon: '👑', desc: 'All healing is doubled',                                      requires: ['h_a', 'h_b', 'h_c', 'h_d'], effect: (gs) => { gs.passives.lifeWeave = true; } },
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
    { id: 'gold',      name: 'Gold Die',       icon: '💰', zone: 'either', price: 90,  rarity: 'uncommon',
      desc: 'Generates gold = other dice in zone × rolled %. Rune on this slot doubles the %. 0 damage/block.',
      faceValues: [5, 9, 13, 17, 21, 25] },
    { id: 'poison',    name: 'Poison Die',     icon: '☠️', zone: 'strike', price: 60,  rarity: 'uncommon',
      desc: 'Applies poison = other dice in zone × rolled %. Rune on this slot doubles the %. 0 damage.',
      faceValues: [5, 9, 13, 17, 21, 25] },
    { id: 'chill',     name: 'Chill Die',      icon: '❄️', zone: 'either', price: 60,  rarity: 'common',
      desc: 'Applies chill stacks equal to rolled value. Rune multipliers on this slot apply. 0 dmg/block.',
      faceValues: [1, 2, 2, 3, 3, 4] },
    { id: 'burn',      name: 'Burn Die',       icon: '🔥', zone: 'strike', price: 65,  rarity: 'common',
      desc: 'Applies burn stacks for 3 turns equal to rolled value. Rune multipliers on this slot apply. 0 dmg.',
      faceValues: [1, 1, 2, 2, 3, 3] },
    { id: 'shield',    name: 'Shield Die',     icon: '🛡️', zone: 'either', price: 80,  rarity: 'uncommon',
      desc: 'Contributes its value to BOTH Strike damage AND Guard block simultaneously.',
      faceValues: [2, 3, 4, 5, 6, 7] },
    { id: 'mark',      name: 'Mark Die',       icon: '🎯', zone: 'strike', price: 65,  rarity: 'common',
      desc: 'Applies mark for 2 turns equal to rolled value. Rune multipliers on this slot apply. 0 dmg.',
      faceValues: [1, 2, 2, 3, 3, 4] },
    { id: 'amplifier', name: 'Amplifier Die',  icon: '📡', zone: 'either', price: 100, rarity: 'rare',
      desc: 'Multiplies total output of all other dice in its zone. Useless alone.',
      faceValues: [150, 175, 200, 225, 250, 300] },  // values are percentages (150 = ×1.5)
    { id: 'mimic',     name: 'Mimic Die',      icon: '🪞', zone: 'either', price: 70,  rarity: 'uncommon',
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
