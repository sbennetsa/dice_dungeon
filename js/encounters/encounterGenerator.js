// ════════════════════════════════════════════════════════════
//  ENCOUNTER GENERATOR
// ════════════════════════════════════════════════════════════
import { pickEnemy, BOSSES } from '../constants.js';
import { selectEnvironment } from './environmentSystem.js';
import { selectEliteModifiers, selectBossEliteModifiers, applyEliteModifier, scaleElitePassives, calculateRewardMultipliers } from './eliteModifierSystem.js';
import { rollForAnomaly, applyAnomaly } from './anomalySystem.js';

const BOSS_FLOORS = [5, 10, 15];

// ────────────────────────────────────────────────────────────
//  Main entry point
// ────────────────────────────────────────────────────────────

/**
 * Generate a complete encounter for the given floor.
 * Returns a fully-prepared encounter object ready for the choice screen.
 * Elite modifiers are pre-selected but NOT applied — applied only if player chooses Elite.
 * @param {number} floor
 * @returns {object} Encounter
 */
export function generateEncounter(floor) {
    const isBossFloor = BOSS_FLOORS.includes(floor);

    // 1. Deep-clone the base enemy template
    const src      = isBossFloor ? BOSSES[floor] : pickEnemy(floor);
    const enemy    = deepClone(src);

    // 2. Apply floor HP scaling
    applyFloorScaling(enemy, floor);

    // 3. Roll for anomaly
    const anomaly = rollForAnomaly(floor);
    let environment = selectEnvironment(floor);

    if (anomaly) {
        const result = applyAnomaly(enemy, anomaly, environment);
        if (result.environment !== undefined) environment = result.environment;
        // logMessage is stored for display on the encounter screen
        enemy._anomalyLog = result.logMessage;
    }

    // 4. Pre-select elite modifiers (not applied yet)
    const eliteModifiers = isBossFloor
        ? selectBossEliteModifiers()
        : selectEliteModifiers();

    // Elite offer probability scales with act: 33% → 67% → 100%
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
        isElite:      false, // set by player choice
        eliteOffered,
        eliteChance,  // stored for display on choice screen
    };
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
