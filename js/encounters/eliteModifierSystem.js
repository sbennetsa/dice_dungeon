// ════════════════════════════════════════════════════════════
//  ELITE MODIFIER SYSTEM
// ════════════════════════════════════════════════════════════

// ── Standard enemy modifiers ──
export const ELITE_MODIFIERS = [
    {
        id: 'deadly',
        prefix: '💀 Deadly',
        diceUpgrade: 2,
        hpMult: 1.3,
        goldMult: 2.0,
        xpMult: 1.5,
        conflictsWith: ['enraged'],
    },
    {
        id: 'armored',
        prefix: '🛡️ Armored',
        addPassive: {
            id: 'armor',
            name: 'Elite Armor',
            desc: 'Reduces ALL incoming damage by 3',
            params: { reduction: 3 },
        },
        hpMult: 1.5,
        goldMult: 1.5,
        xpMult: 1.5,
        conflictsWith: ['brittle'],
    },
    {
        id: 'swift',
        prefix: '⚡ Swift',
        extraDice: [6],
        hpMult: 1.0,
        goldMult: 1.8,
        xpMult: 1.5,
        conflictsWith: [],
    },
    {
        id: 'enraged',
        prefix: '🔥 Enraged',
        diceUpgrade: 4,
        hpMult: 1.0,
        goldMult: 2.5,
        xpMult: 2.0,
        conflictsWith: ['deadly'],
    },
    {
        id: 'regenerating',
        prefix: '💚 Regenerating',
        addPassive: {
            id: 'regen',
            name: 'Elite Regeneration',
            desc: 'Heal 5 HP at start of each turn',
            params: { amount: 5 },
        },
        hpMult: 1.2,
        goldMult: 1.6,
        xpMult: 1.4,
        conflictsWith: ['brittle'],
    },
    {
        id: 'vampiric',
        prefix: '🩸 Vampiric',
        addPassive: {
            id: 'lifesteal',
            name: 'Elite Lifesteal',
            desc: 'Heals 50% of damage dealt to player',
            params: { percent: 0.5 },
        },
        hpMult: 1.1,
        goldMult: 1.7,
        xpMult: 1.6,
        conflictsWith: [],
    },
    {
        id: 'brittle',
        prefix: '💎 Brittle',
        addPassive: {
            id: 'brittle',
            name: 'Elite Brittleness',
            desc: 'Takes +5 bonus damage from every hit',
            params: { bonus: 5 },
        },
        hpMult: 0.8,
        goldMult: 1.3,
        xpMult: 1.2,
        conflictsWith: ['armored', 'regenerating'],
    },
    {
        id: 'cursed',
        prefix: '💜 Cursed',
        applyStartingCurse: true,
        hpMult: 1.2,
        goldMult: 1.8,
        xpMult: 1.7,
        conflictsWith: [],
    },
    {
        id: 'berserker',
        prefix: '😈 Berserker',
        addPassive: {
            id: 'bloodFrenzy',
            name: 'Elite Frenzy',
            desc: 'Below 50% HP, gains 2d6',
            params: { hpPercent: 0.5, extraDice: [6, 6] },
        },
        hpMult: 1.3,
        goldMult: 2.0,
        xpMult: 1.8,
        conflictsWith: [],
    },
];

// ── Boss-specific modifiers ──
export const BOSS_ELITE_MODIFIERS = [
    {
        id: 'deadly',
        prefix: '💀 Deadly',
        diceUpgrade: 4,
        hpMult: 1.4,
        goldMult: 2.5,
        xpMult: 2.0,
        artifactPicks: 2,
        conflictsWith: ['enraged'],
    },
    {
        id: 'enraged',
        prefix: '🔥 Enraged',
        diceUpgrade: 6,
        hpMult: 1.2,
        goldMult: 3.0,
        xpMult: 2.5,
        artifactPicks: 2,
        conflictsWith: ['deadly'],
    },
    {
        id: 'phasing',
        prefix: '🌀 Phasing',
        addPassive: {
            id: 'phase',
            name: 'Phase Shift',
            desc: 'Alternates 50% damage resistance each turn',
            params: { resistPercent: 0.5 },
        },
        hpMult: 1.5,
        goldMult: 2.5,
        xpMult: 2.0,
        artifactPicks: 2,
        legendaryChance: 0.25,
        conflictsWith: [],
    },
    {
        id: 'timewarped',
        prefix: '⏰ Timewarped',
        doublePhases: true,
        hpMult: 1.3,
        goldMult: 2.8,
        xpMult: 2.2,
        artifactPicks: 2,
        legendaryChance: 0.20,
        conflictsWith: [],
    },
    {
        id: 'armored',
        prefix: '🛡️ Armored',
        addPassive: {
            id: 'armor',
            name: 'Boss Armor',
            desc: 'Reduces ALL incoming damage by 5',
            params: { reduction: 5 },
        },
        hpMult: 1.6,
        goldMult: 2.5,
        xpMult: 2.0,
        artifactPicks: 2,
        conflictsWith: ['brittle'],
    },
];

// ────────────────────────────────────────────────────────────
//  Selection
// ────────────────────────────────────────────────────────────

/**
 * Select two non-conflicting modifiers.
 * @param {boolean} isBoss
 * @returns {{ visible: object, hidden: object }}
 */
export function selectEliteModifiers(isBoss = false) {
    const pool = isBoss ? BOSS_ELITE_MODIFIERS : ELITE_MODIFIERS;

    const visible = pool[Math.floor(Math.random() * pool.length)];

    const validSecond = pool.filter(m =>
        m.id !== visible.id &&
        !visible.conflictsWith.includes(m.id) &&
        !m.conflictsWith.includes(visible.id)
    );

    const hidden = validSecond[Math.floor(Math.random() * validSecond.length)];

    return { visible, hidden };
}

/**
 * Convenience wrapper for boss modifiers.
 * @returns {{ visible: object, hidden: object }}
 */
export function selectBossEliteModifiers() {
    return selectEliteModifiers(true);
}

// ────────────────────────────────────────────────────────────
//  Application
// ────────────────────────────────────────────────────────────

/**
 * Apply a single elite modifier to an enemy template.
 * Enemy.dice is an array of numbers (die face sizes).
 * @param {object} enemy - Enemy template (mutable)
 * @param {object} modifier
 */
export function applyEliteModifier(enemy, modifier) {
    if (modifier.diceUpgrade) {
        enemy.dice = enemy.dice.map(d => d + modifier.diceUpgrade);
    }
    if (modifier.extraDice) {
        enemy.dice.push(...modifier.extraDice);
    }
    if (modifier.hpMult && modifier.hpMult !== 1.0) {
        enemy.hp    = Math.round(enemy.hp * modifier.hpMult);
        enemy.maxHp = enemy.hp;
    }
    if (modifier.addPassive) {
        if (!enemy.passives) enemy.passives = [];
        enemy.passives.push({ ...modifier.addPassive });
    }
    if (modifier.doublePhases && enemy.phases) {
        enemy.phases = enemy.phases.map(p => ({
            ...p,
            trigger: { hpPercent: Math.min(1.0, p.trigger.hpPercent + 0.25) },
        }));
    }
    if (modifier.applyStartingCurse) {
        enemy.cursePlayerOnStart = true;
    }
}

// ────────────────────────────────────────────────────────────
//  Reward multipliers
// ────────────────────────────────────────────────────────────

/**
 * Calculate combined reward multipliers from an array of modifiers.
 * @param {object[]} modifiers
 * @returns {{ gold: number, xp: number }}
 */
export function calculateRewardMultipliers(modifiers) {
    return modifiers.reduce((acc, mod) => ({
        gold: acc.gold * (mod.goldMult || 1.0),
        xp:   acc.xp   * (mod.xpMult   || 1.0),
    }), { gold: 1.0, xp: 1.0 });
}
