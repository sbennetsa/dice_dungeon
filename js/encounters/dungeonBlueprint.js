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
import { scoreDungeon } from './dungeonScoring.js';

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
 * @param {number} floor - Absolute floor number (1-15)
 * @param {number} act
 * @param {boolean} isBoss
 * @param {object} rng
 * @param {object} [options]
 * @param {string} [options.anomalyRate] - 'normal' | 'high' | 'none'
 * @returns {object} Floor blueprint
 */
function generateCombatFloor(floor, act, isBoss, rng, options = {}) {
    // 1. Select enemy
    const enemy = isBoss ? pickBoss(floor) : pickEnemySeeded(floor, act, rng);

    // 2. Apply HP scaling
    applyHPScaling(enemy, floor);

    // 3. Roll for anomaly
    const anomaly = rollForAnomalySeeded(floor, rng, options.anomalyRate);

    // 4. Select environment (contextual with enemy)
    const environment = selectEnvironmentSeeded(floor, act, enemy, rng);

    // 5. Pre-select elite modifiers
    const eliteModifiers = selectEliteModifiersSeeded(isBoss, rng);

    // 6. Elite offer probability
    const eliteChance  = act >= 3 ? 1.0 : act / 3;
    const eliteOffered = rng.random() < eliteChance;

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
 * @param {number} actNum - 1, 2, or 3
 * @param {number} baseFloor - First floor in this act (1, 6, or 11)
 * @param {object} rng
 * @param {object} [options]
 * @param {number|null} [options.forcedScheduleIndex] - Override random schedule selection
 * @param {string} [options.anomalyRate]
 * @returns {object} Act blueprint
 */
function generateAct(actNum, baseFloor, rng, options = {}) {
    // Pick floor schedule — use forced index if provided, else random
    const schedule = options.forcedScheduleIndex != null
        ? FLOOR_SCHEDULES[options.forcedScheduleIndex]
        : rng.pick(FLOOR_SCHEDULES);
    const floors = [];

    for (let i = 0; i < schedule.length; i++) {
        const absoluteFloor = baseFloor + i;
        const type = schedule[i];

        if (type === 'boss') {
            floors.push(generateCombatFloor(absoluteFloor, actNum, true, rng, options));
        } else if (type === 'combat') {
            floors.push(generateCombatFloor(absoluteFloor, actNum, false, rng, options));
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
 * @param {object} [options]
 * @param {number}        [options.seed]      - RNG seed (random if omitted)
 * @param {Array<number|null>} [options.schedules] - Per-act forced schedule indices [act1, act2, act3]; null = random
 * @param {string}        [options.anomalyRate] - 'normal' | 'high' | 'none'
 * @returns {object} Complete dungeon blueprint
 */
export function generateDungeonBlueprint(options = {}) {
    const seed      = options.seed ?? (Date.now() ^ (Math.random() * 0xFFFFFFFF));
    const schedules = options.schedules || [null, null, null];
    const rng       = createRNG(seed);

    const acts = [
        generateAct(1, 1,  rng, { forcedScheduleIndex: schedules[0], anomalyRate: options.anomalyRate }),
        generateAct(2, 6,  rng, { forcedScheduleIndex: schedules[1], anomalyRate: options.anomalyRate }),
        generateAct(3, 11, rng, { forcedScheduleIndex: schedules[2], anomalyRate: options.anomalyRate }),
    ];

    const blueprint = { seed, acts };

    // Score the dungeon
    blueprint.scoring = scoreDungeon(blueprint);

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
