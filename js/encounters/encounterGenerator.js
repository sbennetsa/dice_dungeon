// ════════════════════════════════════════════════════════════
//  ENCOUNTER GENERATOR
// ════════════════════════════════════════════════════════════
import { pickEnemy, BOSSES } from '../constants.js';
import { GS } from '../state.js';
import { selectEnvironment } from './environmentSystem.js';
import { selectEliteModifiers, selectBossEliteModifiers, applyEliteModifier, calculateRewardMultipliers } from './eliteModifierSystem.js';
import { rollForAnomaly, applyAnomaly, ANOMALIES } from './anomalySystem.js';
import { getFloorBlueprint, encounterFromBlueprint } from './dungeonBlueprint.js';

const BOSS_FLOORS = [5, 10, 15];

// ────────────────────────────────────────────────────────────
//  Main entry point
// ────────────────────────────────────────────────────────────

/**
 * Generate a complete encounter for the given floor.
 * If a dungeon blueprint exists, returns the pre-built encounter from it.
 * Otherwise falls back to the original random generation.
 * @param {number} floor
 * @returns {object} Encounter
 */
export function generateEncounter(floor) {
    // ── Blueprint path: use pre-generated encounter ──
    if (GS.blueprint) {
        const floorBP = getFloorBlueprint(GS.blueprint, floor);
        if (floorBP && (floorBP.type === 'combat' || floorBP.type === 'boss')) {
            const encounter = encounterFromBlueprint(floorBP);

            // Apply anomaly effects (modifies enemy in place, same as original)
            if (encounter.anomaly) {
                const anomalyDef = _getAnomalyDef(encounter.anomaly.id);
                if (anomalyDef) {
                    const result = applyAnomaly(encounter.enemy, anomalyDef, encounter.environment);
                    if (result.environment !== undefined) encounter.environment = result.environment;
                    encounter.enemy._anomalyLog = result.logMessage;
                }
            }

            return encounter;
        }
    }

    // ── Legacy path: generate on the fly ──
    return _generateEncounterLegacy(floor);
}

/**
 * Original encounter generation (pre-blueprint).
 * Kept as fallback for backwards compatibility.
 */
function _generateEncounterLegacy(floor) {
    const isBossFloor = BOSS_FLOORS.includes(floor);

    const src      = isBossFloor ? BOSSES[floor] : pickEnemy(floor);
    const enemy    = deepClone(src);

    applyFloorScaling(enemy, floor);

    const anomaly = rollForAnomaly(floor);
    let environment = selectEnvironment(floor);

    if (anomaly) {
        const result = applyAnomaly(enemy, anomaly, environment);
        if (result.environment !== undefined) environment = result.environment;
        enemy._anomalyLog = result.logMessage;
    }

    const eliteModifiers = isBossFloor
        ? selectBossEliteModifiers()
        : selectEliteModifiers();

    const act          = Math.ceil(floor / 5);
    const eliteChance  = act >= 3 ? 1.0 : act / 3;
    const eliteOffered = Math.random() < eliteChance;

    return {
        enemy,
        environment,
        anomaly,
        eliteModifiers,
        floor,
        isBossFloor,
        isElite:      false,
        eliteOffered,
        eliteChance,
    };
}

/** Look up full anomaly definition by id (for applying effects). */
function _getAnomalyDef(id) {
    return ANOMALIES[id] || Object.values(ANOMALIES).find(a => a.id === id) || null;
}

// ────────────────────────────────────────────────────────────
//  Player choice handler
// ────────────────────────────────────────────────────────────

/**
 * Apply elite modifiers after the player opts in to Elite difficulty.
 * Mutates encounter.enemy in place.
 * @param {object} enemy - The encounter's enemy (mutable)
 * @param {{ visible: object, hidden: object }} eliteModifiers
 * @returns {{ visibleModifier, hiddenModifier, finalStats }}
 */
export function applyEliteChoice(enemy, eliteModifiers) {
    applyEliteModifier(enemy, eliteModifiers.visible);
    applyEliteModifier(enemy, eliteModifiers.hidden);
    scaleElitePassives(enemy);

    enemy.isElite          = true;
    enemy.appliedModifiers = [eliteModifiers.visible, eliteModifiers.hidden];
    // Name prefix from visible modifier
    enemy.name = `${eliteModifiers.visible.prefix} ${enemy.name}`;

    return {
        visibleModifier: eliteModifiers.visible,
        hiddenModifier:  eliteModifiers.hidden,
        finalStats: {
            hp:        enemy.hp,
            dice:      enemy.dice,
            avgDamage: calculateAvgDamage(enemy),
            passives:  enemy.passives || [],
        },
    };
}

// ────────────────────────────────────────────────────────────
//  Helpers
// ────────────────────────────────────────────────────────────

/**
 * Scale enemy HP by floor (4% compound per floor above 1).
 * @param {object} enemy
 * @param {number} floor
 */
export function applyFloorScaling(enemy, floor) {
    const scale  = Math.pow(1.04, floor - 1);
    enemy.hp     = Math.round(enemy.hp * scale);
    enemy.maxHp  = enemy.hp;
}

/**
 * Calculate the average total damage per turn from the enemy's dice pool.
 * @param {object} enemy
 * @returns {number}
 */
export function calculateAvgDamage(enemy) {
    const dice = enemy.dice || [];
    const total = dice.reduce((sum, d) => sum + (d + 1) / 2, 0);
    return Math.round(total);
}

/**
 * Deep-clone an object.
 * Uses structuredClone if available (Node 17+ / modern browsers), else JSON round-trip.
 * @param {object} obj
 * @returns {object}
 */
export function deepClone(obj) {
    if (typeof structuredClone === 'function') return structuredClone(obj);
    return JSON.parse(JSON.stringify(obj));
}

export { calculateRewardMultipliers };
