// ════════════════════════════════════════════════════════════
//  DUNGEON BLUEPRINT GENERATOR
//  Generates the complete dungeon structure at run start.
//  Every floor, enemy, environment, elite modifier, and event
//  is pre-determined from a seed for reproducible runs.
// ════════════════════════════════════════════════════════════

import { BOSSES, resolveEnemy, getEnemyPool } from '../constants.js';
import { ENVIRONMENTS } from './environmentSystem.js';
import { ELITE_MODIFIERS, BOSS_ELITE_MODIFIERS } from './eliteModifierSystem.js';
import { ANOMALIES } from './anomalySystem.js';
import { scoreDungeon, ANOMALY_THREAT_MULTS, threatToXPRange } from './dungeonScoring.js';
import { getEnemyProfile, getEnvThreatForEnemy, computeBaseThreat } from './bestiaryThreatData.js';

// ────────────────────────────────────────────────────────────
//  Seeded RNG (mulberry32)
// ────────────────────────────────────────────────────────────

/**
 * Create a seeded pseudo-random number generator.
 * Uses mulberry32 — fast, simple, good distribution.
 * @param {number} seed
 * @returns {{ next, random, randInt, pick, shuffle }}
 */
export function createRNG(seed) {
    let state = seed | 0;

    function next() {
        state |= 0;
        state  = state + 0x6D2B79F5 | 0;
        let t  = Math.imul(state ^ state >>> 15, 1 | state);
        t      = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
        return ((t ^ t >>> 14) >>> 0) / 4294967296;
    }

    return {
        next,
        /** Float in [0, 1) */
        random: next,
        /** Int in [min, max] inclusive */
        randInt(min, max) { return Math.floor(next() * (max - min + 1)) + min; },
        /** Pick random element from array */
        pick(arr) { return arr[Math.floor(next() * arr.length)]; },
        /** Shuffle array (returns new array) */
        shuffle(arr) {
            const a = [...arr];
            for (let i = a.length - 1; i > 0; i--) {
                const j = Math.floor(next() * (i + 1));
                [a[i], a[j]] = [a[j], a[i]];
            }
            return a;
        },
    };
}

// ────────────────────────────────────────────────────────────
//  Floor Schedule Templates
// ────────────────────────────────────────────────────────────

const FLOOR_SCHEDULES = [
    // Standard
    ['combat', 'event', 'combat', 'shop', 'boss'],
    // Front-loaded combat
    ['combat', 'combat', 'event', 'shop', 'boss'],
    // Event-heavy
    ['event', 'combat', 'event', 'shop', 'boss'],
    // Double shop (two chances to buy)
    ['combat', 'shop', 'combat', 'shop', 'boss'],
    // Gauntlet (3 combats, no event — harder)
    ['combat', 'combat', 'combat', 'shop', 'boss'],
];

// Event pools by act (event function names as IDs)
const EVENT_POOLS = {
    1: ['wanderingMerchant', 'cursedShrine', 'trappedChest', 'trainingGrounds'],
    2: ['alchemistsLab', 'gamblingDen', 'forgottenForge'],
    3: ['bloodAltar', 'oracle', 'merchantPrince'],
};

// ────────────────────────────────────────────────────────────
//  Deep Clone
// ────────────────────────────────────────────────────────────

function deepClone(obj) {
    if (typeof structuredClone === 'function') return structuredClone(obj);
    return JSON.parse(JSON.stringify(obj));
}

// ────────────────────────────────────────────────────────────
//  Challenge Budget System
//  Difficulty maps to a target combat threat range.
//  The budget distributes across acts (scaling upward) and
//  steers enemy, environment, and elite selection.
// ────────────────────────────────────────────────────────────

/**
 * Target total combat threat ranges per difficulty.
 * Combat threat = sum of (base enemy + env + anomaly) across all floors.
 * Higher budget → stronger enemies, more environments, more elite offers.
 */
export const CHALLENGE_BUDGETS = {
    casual:   [1000, 1150],
    standard: [1150, 1350],
    heroic:   [1350, 1550],
};

/**
 * Per-difficulty, per-act multipliers for enemy HP and dice face sizes.
 * Standard is always 1.0 (the baseline).
 * Act 1 has minimal scaling — small stat pools make large multipliers arbitrary.
 * Act 2–3 scale progressively to widen the difficulty gap.
 * HP is scaled more aggressively than dice (dice affect offense AND defense,
 * and must remain integers — rounding on small faces is coarse).
 *   hp:   [Act1, Act2, Act3]
 *   dice: [Act1, Act2, Act3]
 */
export const DIFFICULTY_SCALING = {
    casual:   { hp: [0.90, 0.80, 0.70], dice: [0.95, 0.85, 0.80] },
    standard: { hp: [1.00, 1.00, 1.00], dice: [1.00, 1.00, 1.00] },
    heroic:   { hp: [1.10, 1.20, 1.30], dice: [1.05, 1.10, 1.15] },
};

/** Act distribution weights (Act 1 lightest, Act 3 heaviest) */
const ACT_BUDGET_WEIGHTS = [0.15, 0.30, 0.55];

/** Per-weight jitter magnitude (seeded) */
const ACT_BUDGET_JITTER = 0.04;

/** Elite offer scaling: budget fraction → base elite rate */
const ELITE_BUDGET_FLOOR   = 960;
const ELITE_BUDGET_CEILING = 1580;
const ELITE_ACT_SCALES     = [0.5, 0.8, 1.0];

/** Acceptable challenge rating range per difficulty [min, max].
 *  If a generated dungeon scores outside the range, the seed is
 *  nudged and the dungeon is regenerated (up to MAX_RESEED_ATTEMPTS). */
const CHALLENGE_RATING_RANGE = {
    casual:   [1, 3],
    standard: [4, 7],
    heroic:   [8, 10],
};
const MAX_RESEED_ATTEMPTS = 5;

/** Allowed schedule indices per difficulty.
 *  Casual excludes gauntlet (4) — too many combats, not enough advantage.
 *  Heroic excludes event-heavy (2) — too much advantage, not enough pressure.
 *  Standard allows all schedules. */
const DIFFICULTY_SCHEDULES = {
    casual:   [0, 1, 2, 3],       // standard, front-loaded, event-heavy, double-shop
    standard: [0, 1, 2, 3, 4],    // all
    heroic:   [0, 1, 3, 4],       // standard, front-loaded, double-shop, gauntlet
};

/**
 * Pick a challenge target from the difficulty's budget range.
 * @param {string} difficulty - 'casual' | 'standard' | 'heroic'
 * @param {object} rng
 * @returns {number} Target total combat threat
 */
function pickChallengeTarget(difficulty, rng) {
    const [lo, hi] = CHALLENGE_BUDGETS[difficulty] || CHALLENGE_BUDGETS.standard;
    return Math.round(lo + rng.random() * (hi - lo));
}

/**
 * Distribute the dungeon challenge budget across 3 acts.
 * Weights favour later acts with seeded jitter for variety.
 * @param {number} totalBudget
 * @param {object} rng
 * @returns {number[]} Array of 3 act budgets
 */
function distributeActBudgets(totalBudget, rng) {
    const weights = ACT_BUDGET_WEIGHTS.map(w =>
        Math.max(0.08, w + (rng.random() - 0.5) * 2 * ACT_BUDGET_JITTER)
    );
    const sum = weights.reduce((a, b) => a + b, 0);
    return weights.map(w => Math.round(totalBudget * w / sum));
}

/**
 * Compute quick threat for a generated floor (base + env + anomaly, no elite).
 * Used during generation to track budget consumption.
 */
function quickThreat(enemy, environment, anomaly, bossFloor, act) {
    // Prefer pre-computed baseThreat on the enemy (reflects difficulty scaling)
    let threat = enemy.baseThreat;
    if (!threat) {
        const profile = getEnemyProfile(enemy.name, bossFloor, act);
        threat = profile ? profile.baseThreat : 15;
    }
    if (environment) threat += getEnvThreatForEnemy(environment.id, enemy.name, bossFloor);
    if (anomaly) threat = Math.round(threat * (ANOMALY_THREAT_MULTS[anomaly.id] ?? 1.0));
    return threat;
}

/**
 * Weighted random pick from an array using pre-computed weights.
 * @param {Array} items
 * @param {number[]} weights
 * @param {object} rng
 * @returns {*} Selected item
 */
function weightedPick(items, weights, rng) {
    const total = weights.reduce((s, w) => s + w, 0);
    let roll = rng.random() * total;
    for (let i = 0; i < items.length; i++) {
        roll -= weights[i];
        if (roll <= 0) return items[i];
    }
    return items[items.length - 1];
}

// ────────────────────────────────────────────────────────────
//  Enemy Selection (seeded)
// ────────────────────────────────────────────────────────────

/**
 * Pick an enemy for a combat floor using seeded RNG.
 * Floor 1 is always Goblin for the tutorial experience.
 * @param {number} floor
 * @param {number} act
 * @param {object} rng
 * @returns {object} Deep-cloned enemy template
 */
function pickEnemySeeded(floor, act, rng) {
    if (floor === 1) return deepClone(resolveEnemy('goblin', act));

    const pool = getEnemyPool(act);
    return deepClone(rng.pick(pool));
}

/**
 * Pick an enemy weighted toward a target threat value.
 * Enemies whose baseThreat is closer to the target are more likely.
 * Floor 1 is always Goblin (tutorial).
 * @param {number} floor
 * @param {number} act
 * @param {number} targetThreat - Desired base threat for this floor
 * @param {object} rng
 * @returns {object} Deep-cloned enemy template
 */
function pickEnemyForBudget(floor, act, targetThreat, rng) {
    if (floor === 1) return deepClone(resolveEnemy('goblin', act));

    const pool = getEnemyPool(act);

    // Weight each enemy: closer to target → higher weight
    const weights = pool.map(enemy => {
        const profile = getEnemyProfile(enemy.name, null, act);
        const baseThreat = profile ? profile.baseThreat : 15;
        const distance = Math.abs(baseThreat - targetThreat);
        return 1 / (1 + distance * 0.12);
    });

    return deepClone(weightedPick(pool, weights, rng));
}

/**
 * Pick a boss for a boss floor.
 * @param {number} floor
 * @returns {object} Deep-cloned boss template
 */
function pickBoss(floor) {
    return deepClone(BOSSES[floor]);
}

// ────────────────────────────────────────────────────────────
//  Environment Selection (seeded, contextual)
// ────────────────────────────────────────────────────────────

const ENVIRONMENT_CHANCES = [0.30, 0.50, 0.70]; // by act (0-indexed)

/**
 * Select an environment for a floor using seeded RNG.
 * Considers enemy synergy for contextual scoring.
 * @param {number} floor
 * @param {number} act
 * @param {object} enemy
 * @param {object} rng
 * @returns {object|null}
 */
function selectEnvironmentSeeded(floor, act, enemy, rng, chanceOverride = null) {
    const chance = chanceOverride ?? ENVIRONMENT_CHANCES[Math.min(act - 1, 2)];
    if (rng.random() > chance) return null;

    const available = Object.values(ENVIRONMENTS).filter(e => e.act <= act);
    if (available.length === 0) return null;

    // Return a serializable snapshot (no callback functions)
    const env = rng.pick(available);
    return { id: env.id, name: env.name, icon: env.icon, desc: env.desc, act: env.act };
}

/**
 * Select an environment steered by the floor's threat budget.
 * If the floor is below target, favour environments that add threat.
 * If above target, favour neutral or negative-threat environments (or skip).
 * @param {number} floor
 * @param {number} act
 * @param {object} enemy
 * @param {number} currentThreat - Threat so far (enemy base + anomaly)
 * @param {number} floorTarget   - Target threat for this floor
 * @param {object} rng
 * @returns {object|null}
 */
function selectEnvironmentForBudget(floor, act, enemy, currentThreat, floorTarget, rng, chanceOverride = null) {
    const gap = floorTarget - currentThreat;
    const baseChance = ENVIRONMENT_CHANCES[Math.min(act - 1, 2)];

    // When overridden (casual), use flat chance without budget adjustment
    const adjustedChance = chanceOverride != null
        ? chanceOverride
        : Math.max(0.10, Math.min(0.90, baseChance + gap * 0.008));
    if (rng.random() > adjustedChance) return null;

    const available = Object.values(ENVIRONMENTS).filter(e => e.act <= act);
    if (available.length === 0) return null;

    const bossFloor = BOSSES[floor] ? floor : null;

    // Weight environments by how well they fill the gap
    const weights = available.map(env => {
        const envThreat = getEnvThreatForEnemy(env.id, enemy.name, bossFloor);
        if (gap > 0) {
            // Need more threat: prefer positive-threat envs
            return Math.max(0.1, 1 + envThreat * 0.08);
        } else {
            // Need less threat: prefer negative or neutral envs
            return Math.max(0.1, 1 - envThreat * 0.08);
        }
    });

    const env = weightedPick(available, weights, rng);
    return { id: env.id, name: env.name, icon: env.icon, desc: env.desc, act: env.act };
}

// ────────────────────────────────────────────────────────────
//  Elite Modifier Selection (seeded)
// ────────────────────────────────────────────────────────────


/**
 * Select elite modifiers using seeded RNG.
 * In singleModifier mode (Casual difficulty), only the visible modifier is
 * picked — no hidden modifier. The RNG still consumes the same number of
 * calls for seed stability across difficulty changes on the same seed.
 * @param {boolean} isBoss
 * @param {object} rng
 * @param {boolean} [singleModifier] - When true, return only visible (no hidden)
 * @returns {{ visible: object, hidden: object|null }}
 */
function selectEliteModifiersSeeded(isBoss, rng, singleModifier = false) {
    const pool = isBoss ? BOSS_ELITE_MODIFIERS : ELITE_MODIFIERS;

    const visible = rng.pick(pool);
    const validSecond = pool.filter(m =>
        m.id !== visible.id &&
        !visible.conflictsWith.includes(m.id) &&
        !m.conflictsWith.includes(visible.id)
    );
    // Always consume RNG call for seed stability regardless of singleModifier
    const hiddenPick = rng.pick(validSecond);

    return { visible, hidden: singleModifier ? null : hiddenPick };
}

// ────────────────────────────────────────────────────────────
//  Anomaly Roll (seeded)
// ────────────────────────────────────────────────────────────

/**
 * Roll for anomaly using seeded RNG.
 * @param {number} floor
 * @param {object} rng
 * @param {string} [anomalyRate] - 'normal' | 'high' | 'none'
 * @returns {object|null}
 */
function rollForAnomalySeeded(floor, rng, anomalyRate = 'normal') {
    if (anomalyRate === 'none') { rng.random(); return null; } // consume RNG call for seed stability
    const actBonus = Math.ceil(floor / 5) * 0.01;
    const mult     = anomalyRate === 'high' ? 2 : 1;

    for (const anomaly of Object.values(ANOMALIES)) {
        if (rng.random() < (anomaly.chance + actBonus) * mult) {
            return { id: anomaly.id, name: anomaly.name, desc: anomaly.desc, rewardMult: anomaly.rewardMult };
        }
    }
    return null;
}

// ────────────────────────────────────────────────────────────
// ────────────────────────────────────────────────────────────
//  Generate a Single Combat Floor
// ────────────────────────────────────────────────────────────

/**
 * Generate a complete combat floor blueprint.
 * When a floorTarget is provided, steers enemy/environment selection
 * toward the budget. Without a target, falls back to pure random.
 * @param {number} floor - Absolute floor number (1-15)
 * @param {number} act
 * @param {boolean} isBoss
 * @param {object} rng
 * @param {object} [options]
 * @param {string}  [options.anomalyRate]    - 'normal' | 'high' | 'none'
 * @param {number}  [options.floorTarget]   - Target threat for this floor (budget mode)
 * @param {number}  [options.eliteRate]     - Base elite offer rate (budget mode)
 * @param {boolean} [options.singleModifier] - When true, elite has visible modifier only
 * @param {string}  [options.difficulty]     - 'casual' | 'standard' | 'heroic' (stat scaling)
 * @returns {object} Floor blueprint
 */
function generateCombatFloor(floor, act, isBoss, rng, options = {}) {
    const hasBudget = options.floorTarget != null;
    const bossFloor = isBoss ? floor : null;

    // 1. Select enemy
    let enemy;
    if (isBoss) {
        enemy = pickBoss(floor);
    } else if (hasBudget) {
        enemy = pickEnemyForBudget(floor, act, options.floorTarget, rng);
    } else {
        enemy = pickEnemySeeded(floor, act, rng);
    }

    // 2. Set maxHp from baked HP
    enemy.maxHp = enemy.hp;

    // 2a. Apply difficulty-based stat scaling (Casual easier, Heroic harder)
    const diffScale = options.difficulty && DIFFICULTY_SCALING[options.difficulty];
    if (diffScale) {
        const actIdx   = act - 1;
        const hpMult   = diffScale.hp[actIdx]   ?? 1.0;
        const diceMult = diffScale.dice[actIdx] ?? 1.0;

        if (hpMult !== 1.0) {
            enemy.hp    = Math.round(enemy.hp * hpMult);
            enemy.maxHp = enemy.hp;
        }
        if (diceMult !== 1.0) {
            enemy.dice = enemy.dice.map(d => Math.max(2, Math.round(d * diceMult)));
        }
    }

    // 2b. Compute baseThreat from (possibly scaled) stats
    const scaledThreat = (diffScale && options.difficulty !== 'standard')
        ? computeBaseThreat(enemy, isBoss).baseThreat
        : (getEnemyProfile(enemy.name, isBoss ? floor : null, act)?.baseThreat ?? 15);
    enemy.xp = threatToXPRange(scaledThreat);
    enemy.baseThreat = scaledThreat; // used by scoring + campaign favor

    // 3. Roll for anomaly
    const anomaly = rollForAnomalySeeded(floor, rng, options.anomalyRate);
    // Pre-compute glitched ability swap using seeded RNG so replaying same seed yields same result
    if (anomaly && anomaly.id === 'glitched') {
        const eligible = Object.keys(enemy.abilities || {})
            .filter(k => enemy.abilities[k].type !== 'attack');
        if (eligible.length > 0) {
            const randomKey = eligible[Math.floor(rng.random() * eligible.length)];
            const oldType   = enemy.abilities[randomKey].type;
            const types     = ['attack', 'heal', 'buff', 'poison', 'shield'].filter(t => t !== oldType);
            anomaly.glitchedKey    = randomKey;
            anomaly.glitchedToType = types[Math.floor(rng.random() * types.length)];
        }
    }

    // 4. Select environment
    // Casual: 10% flat chance (very rare), never on boss floors
    const casualEnv = options.difficulty === 'casual';
    const envChanceOverride = casualEnv ? 0.10 : null;

    let environment;
    if (hasBudget) {
        // Budget-aware: compute current threat so far, steer env choice
        const profile = getEnemyProfile(enemy.name, bossFloor, act);
        const baseThreat = profile ? profile.baseThreat : 15;
        const anomalyMult = anomaly ? (ANOMALY_THREAT_MULTS[anomaly.id] ?? 1.0) : 1.0;
        const anomalyThreat = Math.round(baseThreat * (anomalyMult - 1));
        const currentThreat = baseThreat + anomalyThreat;
        environment = selectEnvironmentForBudget(floor, act, enemy, currentThreat, options.floorTarget, rng, envChanceOverride);
    } else {
        environment = selectEnvironmentSeeded(floor, act, enemy, rng, envChanceOverride);
    }

    // Casual: never on boss floors (selection still ran to preserve seed stability)
    if (casualEnv && isBoss) environment = null;

    // 5. Pre-select elite modifiers.
    // Casual (singleModifier) shows only the visible modifier — no hidden.
    const eliteModifiers = selectEliteModifiersSeeded(isBoss, rng, options.singleModifier);

    // 6. Elite offer probability — budget-driven or legacy
    let eliteChance, eliteOffered;
    if (hasBudget && options.eliteRate != null) {
        // Budget-driven: base rate scaled by act.
        // When rate is high (heroic), compress act scaling so even Act 1 stays high.
        // lerp from full act scaling at rate=0 to flat at rate=1.
        const actScale = 1 - (1 - ELITE_ACT_SCALES[act - 1]) * (1 - options.eliteRate);
        eliteChance  = Math.min(1.0, options.eliteRate * actScale);
        eliteOffered = rng.random() < eliteChance;
    } else {
        eliteChance  = act >= 3 ? 1.0 : act / 3;
        eliteOffered = rng.random() < eliteChance;
    }

    return {
        floor,
        type: isBoss ? 'boss' : 'combat',
        enemy,
        environment,
        anomaly,
        eliteModifiers,
        eliteOffered,
        eliteChance,
    };
}

// ────────────────────────────────────────────────────────────
//  Generate a Single Act
// ────────────────────────────────────────────────────────────

/**
 * Generate a complete act with floor schedule.
 * When actBudget is provided, distributes threat across combat floors
 * using an adaptive running-budget approach.
 * @param {number} actNum - 1, 2, or 3
 * @param {number} baseFloor - First floor in this act (1, 6, or 11)
 * @param {object} rng
 * @param {object} [options]
 * @param {number|null} [options.forcedScheduleIndex] - Override random schedule selection
 * @param {number[]}   [options.allowedSchedules]    - Indices to pick from (difficulty filtering)
 * @param {string} [options.anomalyRate]
 * @param {number}  [options.actBudget]     - Target total combat threat for this act
 * @param {number}  [options.eliteRate]     - Base elite offer rate (budget mode)
 * @param {boolean} [options.singleModifier] - When true, elites have only 1 (visible) modifier
 * @param {string}  [options.difficulty]     - 'casual' | 'standard' | 'heroic' (stat scaling)
 * @returns {object} Act blueprint
 */
function generateAct(actNum, baseFloor, rng, options = {}) {
    // Pick floor schedule — forced > allowed pool > all
    let schedule;
    if (options.forcedScheduleIndex != null) {
        schedule = FLOOR_SCHEDULES[options.forcedScheduleIndex];
    } else if (options.allowedSchedules) {
        schedule = FLOOR_SCHEDULES[rng.pick(options.allowedSchedules)];
    } else {
        schedule = rng.pick(FLOOR_SCHEDULES);
    }
    const floors = [];

    const hasBudget = options.actBudget != null;
    let remainingBudget = options.actBudget || 0;

    // Count combat floors for adaptive per-floor target
    const combatSlots = schedule.filter(t => t === 'combat' || t === 'boss').length;
    let combatsGenerated = 0;

    for (let i = 0; i < schedule.length; i++) {
        const absoluteFloor = baseFloor + i;
        const type = schedule[i];

        if (type === 'boss' || type === 'combat') {
            const isBoss = type === 'boss';

            // Compute per-floor target from remaining budget
            let floorTarget = undefined;
            if (hasBudget) {
                const combatsLeft = combatSlots - combatsGenerated;
                floorTarget = combatsLeft > 0 ? Math.round(remainingBudget / combatsLeft) : remainingBudget;
            }

            const floorBP = generateCombatFloor(absoluteFloor, actNum, isBoss, rng, {
                anomalyRate:    options.anomalyRate,
                floorTarget,
                eliteRate:      options.eliteRate,
                singleModifier: options.singleModifier,
                difficulty:     options.difficulty,
            });

            // Track actual threat consumed
            if (hasBudget) {
                const bossFloor = isBoss ? absoluteFloor : null;
                const actual = quickThreat(floorBP.enemy, floorBP.environment, floorBP.anomaly, bossFloor, actNum);
                remainingBudget -= actual;
                combatsGenerated++;
            }

            floors.push(floorBP);

        } else if (type === 'event') {
            const pool = EVENT_POOLS[actNum] || EVENT_POOLS[1];
            const eventId = rng.pick(pool);
            floors.push({ floor: absoluteFloor, type: 'event', eventId });
        } else if (type === 'shop') {
            floors.push({ floor: absoluteFloor, type: 'shop' });
        }
    }

    return { actNumber: actNum, schedule, floors };
}

// ────────────────────────────────────────────────────────────
//  Main Blueprint Generator
// ────────────────────────────────────────────────────────────

/**
 * Generate a complete dungeon blueprint for a full run.
 * All 15 floors (3 acts × 5 floors) are pre-determined.
 *
 * When difficulty is provided, generation is budget-driven:
 * a challenge target is picked from the difficulty's range,
 * distributed across acts with smooth scaling, and used to
 * steer enemy/environment/elite selection procedurally.
 *
 * @param {object} [options]
 * @param {number}             [options.seed]            - RNG seed (random if omitted)
 * @param {Array<number|null>} [options.schedules]       - Per-act forced schedule indices; null = random
 * @param {string}             [options.anomalyRate]     - 'normal' | 'high' | 'none'
 * @param {string}             [options.difficulty]      - 'casual' | 'standard' | 'heroic'
 * @param {number}             [options.challengeTarget] - Direct override (bypasses difficulty range)
 * @returns {object} Complete dungeon blueprint
 */
export function generateDungeonBlueprint(options = {}) {
    const baseSeed  = options.seed ?? (Date.now() ^ (Math.random() * 0xFFFFFFFF));
    const schedules = options.schedules || [null, null, null];
    const difficulty = options.difficulty || null;
    const [minRating, maxRating] = (difficulty && CHALLENGE_RATING_RANGE[difficulty]) || [0, 10];

    // Rejection loop: regenerate with nudged seed if rating is outside range
    for (let attempt = 0; attempt <= MAX_RESEED_ATTEMPTS; attempt++) {
        const seed = baseSeed + attempt;
        const blueprint = _generateBlueprint(seed, schedules, difficulty, options);
        const rating = blueprint.scoring.challengeRating;

        if ((rating >= minRating && rating <= maxRating) || attempt === MAX_RESEED_ATTEMPTS) {
            if (attempt > 0) blueprint.reseedAttempts = attempt;
            return blueprint;
        }
    }
}

/** Internal: generate and score a single blueprint for a given seed. */
function _generateBlueprint(seed, schedules, difficulty, options) {
    const rng = createRNG(seed);

    // Budget-driven generation when difficulty or challengeTarget is provided
    const hasBudget = difficulty != null || options.challengeTarget != null;

    let challengeTarget = null;
    let actBudgets      = null;
    let eliteRate       = null;

    if (hasBudget) {
        challengeTarget = options.challengeTarget ?? pickChallengeTarget(difficulty, rng);
        actBudgets      = distributeActBudgets(challengeTarget, rng);

        // Elite rate derived from where the budget sits in the overall range
        const fraction = Math.max(0, Math.min(1,
            (challengeTarget - ELITE_BUDGET_FLOOR) / (ELITE_BUDGET_CEILING - ELITE_BUDGET_FLOOR)
        ));
        eliteRate = 0.05 + fraction * 0.85;

        // Difficulty-based floor/ceiling on elite rate
        if (difficulty === 'heroic')  eliteRate = Math.max(0.90, eliteRate);
        if (difficulty === 'casual')  eliteRate = Math.min(0.10, eliteRate);
    }

    // Difficulty-aware schedule pool (prevents mismatched schedules like
    // casual gauntlets or heroic event-heavy floors)
    const allowedSchedules = difficulty ? DIFFICULTY_SCHEDULES[difficulty] : undefined;

    // Casual elites show only one (visible) modifier — no hidden modifier.
    const singleModifier = difficulty === 'casual';

    const acts = [
        generateAct(1, 1,  rng, {
            forcedScheduleIndex: schedules[0],
            allowedSchedules,
            anomalyRate:         options.anomalyRate,
            actBudget:           actBudgets ? actBudgets[0] : undefined,
            eliteRate,
            singleModifier,
            difficulty,
        }),
        generateAct(2, 6,  rng, {
            forcedScheduleIndex: schedules[1],
            allowedSchedules,
            anomalyRate:         options.anomalyRate,
            actBudget:           actBudgets ? actBudgets[1] : undefined,
            eliteRate,
            singleModifier,
            difficulty,
        }),
        generateAct(3, 11, rng, {
            forcedScheduleIndex: schedules[2],
            allowedSchedules,
            anomalyRate:         options.anomalyRate,
            actBudget:           actBudgets ? actBudgets[2] : undefined,
            eliteRate,
            singleModifier,
            difficulty,
        }),
    ];

    const blueprint = { seed, acts };

    // Store budget metadata if budget-driven
    if (hasBudget) {
        blueprint.challengeTarget = challengeTarget;
        blueprint.actBudgets      = actBudgets;
        blueprint.difficulty      = difficulty;
    }

    // Score the dungeon
    blueprint.scoring = scoreDungeon(blueprint, difficulty);

    return blueprint;
}

// ────────────────────────────────────────────────────────────
//  Blueprint Lookup Helpers
// ────────────────────────────────────────────────────────────

/**
 * Get the floor blueprint for a given absolute floor number.
 * @param {object} blueprint
 * @param {number} floor - 1-15
 * @returns {object|null} Floor blueprint
 */
export function getFloorBlueprint(blueprint, floor) {
    if (!blueprint) return null;
    const actIndex  = Math.min(Math.ceil(floor / 5) - 1, 2);
    const act       = blueprint.acts[actIndex];
    if (!act) return null;
    const baseFloor = actIndex * 5 + 1;
    const floorIdx  = floor - baseFloor;
    return act.floors[floorIdx] || null;
}

/**
 * Get the floor type from a blueprint for a given floor number.
 * Falls back to the original hardcoded layout if no blueprint exists.
 * @param {object|null} blueprint
 * @param {number} floor
 * @returns {string} Floor type (combat, boss, event, shop)
 */
export function getFloorTypeFromBlueprint(blueprint, floor) {
    const fb = getFloorBlueprint(blueprint, floor);
    if (fb) return fb.type;

    // Fallback to original layout
    const layout = {
        1: 'combat', 2: 'event', 3: 'combat', 4: 'shop',  5: 'boss',
        6: 'event',  7: 'combat', 8: 'combat', 9: 'shop', 10: 'boss',
        11: 'event', 12: 'combat', 13: 'combat', 14: 'shop', 15: 'boss',
    };
    return layout[floor] || 'combat';
}

/**
 * Build an encounter object from a floor blueprint, compatible with
 * the existing EncounterChoice / Combat system.
 * Resolves the serialized environment snapshot back to the full
 * ENVIRONMENTS definition (with callback functions for combat hooks).
 * @param {object} floorBP - Floor blueprint from getFloorBlueprint
 * @returns {object} Encounter object matching generateEncounter() output
 */
export { EVENT_POOLS };

export function encounterFromBlueprint(floorBP) {
    // Resolve environment: blueprint stores {id, name, ...} snapshot,
    // but combat needs the full object with onTurnStart/onDiceRoll/etc callbacks
    let fullEnvironment = null;
    if (floorBP.environment && floorBP.environment.id) {
        fullEnvironment = ENVIRONMENTS[floorBP.environment.id] || null;
    }

    // Deep-clone enemy so combat mutations don't corrupt the blueprint
    const enemy = deepClone(floorBP.enemy);

    return {
        enemy,
        environment:    fullEnvironment,
        anomaly:        floorBP.anomaly ? { ...floorBP.anomaly } : null,
        eliteModifiers: floorBP.eliteModifiers,
        floor:          floorBP.floor,
        isBossFloor:    floorBP.type === 'boss',
        isElite:        false,
        eliteOffered:   floorBP.eliteOffered,
        eliteChance:    floorBP.eliteChance,
    };
}
