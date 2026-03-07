// ════════════════════════════════════════════════════════════
//  ENCOUNTER GENERATOR
// ════════════════════════════════════════════════════════════
import { pickEnemy, BOSSES } from '../constants.js';
import { GS } from '../state.js';
import { selectEnvironment } from './environmentSystem.js';
import { selectEliteModifiers, selectBossEliteModifiers, applyEliteModifier, scaleElitePassives, calculateRewardMultipliers } from './eliteModifierSystem.js';
import { rollForAnomaly, applyAnomaly, ANOMALIES } from './anomalySystem.js';
import { getFloorBlueprint, encounterFromBlueprint } from './dungeonBlueprint.js';
import { pickNonCombatEncounter, applyEncounterResult, markEncounterSeen } from './nonCombatEncounters.js';
import { threatToXPRange } from './dungeonScoring.js';
import { getEnemyProfile } from './bestiaryThreatData.js';

const BOSS_FLOORS = [5, 10, 15];

// ────────────────────────────────────────────────────────────
//  Non-Combat Encounter (NCE) corridor events
// ────────────────────────────────────────────────────────────

/**
 * Roll for a random NCE corridor encounter based on what type of floor
 * just resolved. Returns true if an NCE should fire before the next floor.
 *
 * Probabilities are intentionally asymmetric:
 *  - after_boss:   0.50  — the dungeon exhales; corridor feels alive
 *  - after_combat: 0.30  — standard
 *  - after_event:  0.25  — set-piece just fired; normal cadence resumes
 *  - after_shop:   0.10  — player just had a resource beat; cool down
 *  - null / other: 0.00  — no previous floor (run start), never fire
 *
 * @returns {boolean}
 */
function _shouldGenerateNCE() {
    const chances = {
        boss:   0.50,
        combat: 0.30,
        event:  0.25,
        shop:   0.10,
    };
    const chance = chances[GS.lastFloorType] ?? 0.00;
    return Math.random() < chance;
}

/**
 * Generate a random NCE corridor encounter.
 * Returns null if the pool is empty (caller must handle gracefully).
 * @param {number} floor — current floor number, for context only
 * @returns {object|null}
 */
function _generateNCE(floor) {
    const event = pickNonCombatEncounter();
    if (!event) return null;

    return {
        type:  'nce',       // distinct from blueprint 'event' slots
        floor,              // floor the player is currently on (does not advance)
        event,
    };
}

/**
 * After a floor resolves, check whether a random NCE fires.
 * Call this from screens.js immediately after combat/shop/event completion,
 * before advancing GS.floor.
 *
 * Updates GS.lastFloorType as a side effect so subsequent calls reflect
 * the current floor's type.
 *
 * @param {string} resolvedFloorType — the type of floor that just finished
 * @returns {object|null} NCE encounter object, or null if nothing fires
 */
export function checkForNCE(resolvedFloorType) {
    // NCE system disabled — encounters need rework before re-enabling
    return null;
}

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

        // Set-piece event floors — pass through eventId for screens.js routing
        if (floorBP && floorBP.type === 'event') {
            return { type: 'event', floor, eventId: floorBP.eventId };
        }

        if (floorBP && (floorBP.type === 'combat' || floorBP.type === 'boss')) {
            const encounter = encounterFromBlueprint(floorBP);

            // Apply anomaly effects (modifies enemy in place, same as original)
            if (encounter.anomaly) {
                const anomalyDef = _getAnomalyDef(encounter.anomaly.id);
                if (anomalyDef) {
                    // Pass the blueprint snapshot so glitched can use its pre-computed seeded values
                    const result = applyAnomaly(encounter.enemy, anomalyDef, encounter.environment, encounter.anomaly);
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

    enemy.maxHp = enemy.hp; // no scaling — stats are per-act

    // Compute XP from baseThreat (links reward to challenge)
    const act          = Math.ceil(floor / 5);
    const profile = getEnemyProfile(enemy.name, isBossFloor ? floor : null, act);
    const xpThreat = profile ? profile.baseThreat : 15;
    enemy.xp = threatToXPRange(xpThreat);
    enemy.baseThreat = xpThreat; // used by campaign favor accumulation

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
 * @param {number} [floor=15] - Current floor (for act-based passive scaling)
 * @returns {{ visibleModifier, hiddenModifier, finalStats }}
 */
export function applyEliteChoice(enemy, eliteModifiers, floor = 15) {
    applyEliteModifier(enemy, eliteModifiers.visible);
    applyEliteModifier(enemy, eliteModifiers.hidden);
    scaleElitePassives(enemy, floor);

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

// Re-exported from nonCombatEncounters for screens.js convenience
export { applyEncounterResult, markEncounterSeen };
