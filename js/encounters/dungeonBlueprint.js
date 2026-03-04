// ════════════════════════════════════════════════════════════
//  DUNGEON BLUEPRINT GENERATOR
//  Generates the complete dungeon structure at run start.
//  Every floor, enemy, environment, elite modifier, and event
//  is pre-determined from a seed for reproducible runs.
// ════════════════════════════════════════════════════════════

import { ENEMIES, BOSSES } from '../constants.js';
import { ENVIRONMENTS } from './environmentSystem.js';
import { ELITE_MODIFIERS, BOSS_ELITE_MODIFIERS } from './eliteModifierSystem.js';
import { ANOMALIES } from './anomalySystem.js';
import { scoreDungeon, ANOMALY_THREATS } from './dungeonScoring.js';
import { getEnemyProfile, getEnvThreatForEnemy } from './bestiaryThreatData.js';

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
    casual:   [550, 660],
    standard: [660, 790],
    heroic:   [790, 960],
};

/** Act distribution weights (Act 1 lightest, Act 3 heaviest) */
const ACT_BUDGET_WEIGHTS = [0.15, 0.30, 0.55];

/** Per-weight jitter magnitude (seeded) */
const ACT_BUDGET_JITTER = 0.04;

/** Elite offer scaling: budget fraction → base elite rate */
const ELITE_BUDGET_FLOOR   = 530;
const ELITE_BUDGET_CEILING = 980;
const ELITE_ACT_SCALES     = [0.5, 0.8, 1.0];

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
function quickThreat(enemy, environment, anomaly, bossFloor) {
    const profile = getEnemyProfile(enemy.name, bossFloor);
    let threat = profile ? profile.baseThreat : 15;
    if (environment) threat += getEnvThreatForEnemy(environment.id, enemy.name, bossFloor);
    if (anomaly) threat += (ANOMALY_THREATS[anomaly.id] || 0);
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
    if (floor === 1) return deepClone(ENEMIES[1][0]); // always Goblin

    const pool = ENEMIES[act] || ENEMIES[1];
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
    if (floor === 1) return deepClone(ENEMIES[1][0]); // always Goblin

    const pool = ENEMIES[act] || ENEMIES[1];

    // Weight each enemy: closer to target → higher weight
    const weights = pool.map(enemy => {
        const profile = getEnemyProfile(enemy.name);
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
function selectEnvironmentSeeded(floor, act, enemy, rng) {
    const chance = ENVIRONMENT_CHANCES[Math.min(act - 1, 2)];
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
function selectEnvironmentForBudget(floor, act, enemy, currentThreat, floorTarget, rng) {
    const gap = floorTarget - currentThreat;
    const baseChance = ENVIRONMENT_CHANCES[Math.min(act - 1, 2)];

    // Adjust spawn chance: under budget → more likely, over budget → less likely
    const adjustedChance = Math.max(0.10, Math.min(0.90, baseChance + gap * 0.008));
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
 * Select two non-conflicting elite modifiers using seeded RNG.
 * @param {boolean} isBoss
 * @param {object} rng
 * @returns {{ visible: object, hidden: object }}
 */
function selectEliteModifiersSeeded(isBoss, rng) {
    const pool = isBoss ? BOSS_ELITE_MODIFIERS : ELITE_MODIFIERS;

    const visible = rng.pick(pool);
    const validSecond = pool.filter(m =>
        m.id !== visible.id &&
        !visible.conflictsWith.includes(m.id) &&
        !m.conflictsWith.includes(visible.id)
    );
    const hidden = rng.pick(validSecond);

    return { visible, hidden };
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
//  Floor HP Scaling
// ────────────────────────────────────────────────────────────

/**
 * Apply HP scaling to an enemy based on floor.
 * Same formula as the original: 4% compound per floor above 1.
 * @param {object} enemy
 * @param {number} floor
 */
function applyHPScaling(enemy, floor) {
    const scale  = Math.pow(1.04, floor - 1);
    enemy.hp     = Math.round(enemy.hp * scale);
    enemy.maxHp  = enemy.hp;
}

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
 * @param {string} [options.anomalyRate] - 'normal' | 'high' | 'none'
 * @param {number} [options.floorTarget] - Target threat for this floor (budget mode)
 * @param {number} [options.eliteRate]   - Base elite offer rate (budget mode)
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

    // 2. Apply HP scaling
    applyHPScaling(enemy, floor);

    // 3. Roll for anomaly
    const anomaly = rollForAnomalySeeded(floor, rng, options.anomalyRate);

    // 4. Select environment
    let environment;
    if (hasBudget) {
        // Budget-aware: compute current threat so far, steer env choice
        const profile = getEnemyProfile(enemy.name, bossFloor);
        const baseThreat = profile ? profile.baseThreat : 15;
        const anomalyThreat = anomaly ? (ANOMALY_THREATS[anomaly.id] || 0) : 0;
        const currentThreat = baseThreat + anomalyThreat;
        environment = selectEnvironmentForBudget(floor, act, enemy, currentThreat, options.floorTarget, rng);
    } else {
        environment = selectEnvironmentSeeded(floor, act, enemy, rng);
    }

    // 5. Pre-select elite modifiers
    const eliteModifiers = selectEliteModifiersSeeded(isBoss, rng);

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
 * @param {string} [options.anomalyRate]
 * @param {number} [options.actBudget]  - Target total combat threat for this act
 * @param {number} [options.eliteRate]  - Base elite offer rate (budget mode)
 * @returns {object} Act blueprint
 */
function generateAct(actNum, baseFloor, rng, options = {}) {
    // Pick floor schedule — use forced index if provided, else random
    const schedule = options.forcedScheduleIndex != null
        ? FLOOR_SCHEDULES[options.forcedScheduleIndex]
        : rng.pick(FLOOR_SCHEDULES);
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
                anomalyRate: options.anomalyRate,
                floorTarget,
                eliteRate:   options.eliteRate,
            });

            // Track actual threat consumed
            if (hasBudget) {
                const bossFloor = isBoss ? absoluteFloor : null;
                const actual = quickThreat(floorBP.enemy, floorBP.environment, floorBP.anomaly, bossFloor);
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
    const seed      = options.seed ?? (Date.now() ^ (Math.random() * 0xFFFFFFFF));
    const schedules = options.schedules || [null, null, null];
    const rng       = createRNG(seed);

    // Budget-driven generation when difficulty or challengeTarget is provided
    const difficulty = options.difficulty || null;
    const hasBudget  = difficulty != null || options.challengeTarget != null;

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
        if (difficulty === 'casual')  eliteRate = Math.min(0.20, eliteRate);
    }

    const acts = [
        generateAct(1, 1,  rng, {
            forcedScheduleIndex: schedules[0],
            anomalyRate:         options.anomalyRate,
            actBudget:           actBudgets ? actBudgets[0] : undefined,
            eliteRate,
        }),
        generateAct(2, 6,  rng, {
            forcedScheduleIndex: schedules[1],
            anomalyRate:         options.anomalyRate,
            actBudget:           actBudgets ? actBudgets[1] : undefined,
            eliteRate,
        }),
        generateAct(3, 11, rng, {
            forcedScheduleIndex: schedules[2],
            anomalyRate:         options.anomalyRate,
            actBudget:           actBudgets ? actBudgets[2] : undefined,
            eliteRate,
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
