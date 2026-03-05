// ════════════════════════════════════════════════════════════
//  ANOMALY SYSTEM
//  Rare encounter variations that override normal generation
// ════════════════════════════════════════════════════════════
import { getEnvironmentById } from './environmentSystem.js';

export const ANOMALIES = {
    perfectStorm: {
        id: 'perfectStorm',
        name: 'Perfect Storm',
        desc: 'Environment shifts to synergize with the enemy. +50% rewards.',
        chance: 0.05,
        rewardMult: 1.5,
        apply(enemy, currentEnvironment) {
            let synergyEnv = null;

            if (enemy.passives && enemy.passives.some(p => p.id === 'regen')) {
                synergyEnv = getEnvironmentById('healingAura');
            } else if (enemy.abilities && Object.values(enemy.abilities).some(a => a.type === 'poison')) {
                synergyEnv = getEnvironmentById('thornsAura');
            } else if (enemy.dice && enemy.dice.length >= 4) {
                synergyEnv = getEnvironmentById('arcaneNexus');
            }

            return {
                environment: synergyEnv || currentEnvironment,
                logMessage: `The stars align — a perfect storm of power!`,
            };
        },
    },

    wounded: {
        id: 'wounded',
        name: 'Wounded Prey',
        desc: 'Enemy starts at 70% HP. −20% rewards.',
        chance: 0.08,
        rewardMult: 0.8,
        apply(enemy) {
            enemy.hp    = Math.floor(enemy.hp * 0.7);
            enemy.maxHp = enemy.hp;
            return { logMessage: `The ${enemy.name} is already wounded!` };
        },
    },

    enraged: {
        id: 'enraged',
        name: 'Enraged Beast',
        desc: 'All enemy dice upgraded by +2. +40% rewards.',
        chance: 0.06,
        rewardMult: 1.4,
        apply(enemy) {
            enemy.dice = enemy.dice.map(d => d + 2);
            return { logMessage: `The ${enemy.name} is consumed by fury!` };
        },
    },

    doubleTrouble: {
        id: 'doubleTrouble',
        name: 'Double Trouble',
        desc: 'Enemy acts twice per turn. ×2 rewards.',
        chance: 0.03,
        rewardMult: 2.0,
        apply(enemy) {
            enemy.doubleAction = true;
            return { logMessage: `Two ${enemy.name}s coordinate their assault!` };
        },
    },

    glitched: {
        id: 'glitched',
        name: 'Reality Glitch',
        desc: 'One enemy ability randomly changes type. +60% rewards.',
        chance: 0.04,
        rewardMult: 1.6,
        apply(enemy) {
            const keys = Object.keys(enemy.abilities || {});
            if (keys.length === 0) return { logMessage: `Reality flickers around the ${enemy.name}...` };

            // Only glitch non-attack abilities so the enemy always retains damage capability
            const eligible = keys.filter(k => enemy.abilities[k].type !== 'attack');
            if (eligible.length === 0) return { logMessage: `Reality flickers around the ${enemy.name}...` };

            const randomKey = eligible[Math.floor(Math.random() * eligible.length)];
            const oldType   = enemy.abilities[randomKey].type;
            const types     = ['attack', 'heal', 'buff', 'poison', 'shield'].filter(t => t !== oldType);
            const newType   = types[Math.floor(Math.random() * types.length)];
            enemy.abilities[randomKey] = { ...enemy.abilities[randomKey], type: newType };

            return { logMessage: `Reality fractures — the ${enemy.name}'s abilities shift unpredictably!` };
        },
    },
};

// ────────────────────────────────────────────────────────────
//  Rolling
// ────────────────────────────────────────────────────────────

/**
 * Roll to see if an anomaly occurs.
 * @param {number} floor
 * @returns {object|null} Anomaly definition or null
 */
export function rollForAnomaly(floor) {
    const actBonus = Math.ceil(floor / 5) * 0.01;

    for (const anomaly of Object.values(ANOMALIES)) {
        if (Math.random() < anomaly.chance + actBonus) {
            return anomaly;
        }
    }
    return null;
}

/**
 * Apply an anomaly to the enemy template.
 * @param {object} enemy - Mutable enemy template
 * @param {object} anomaly
 * @param {object|null} currentEnvironment
 * @returns {{ environment?: object, logMessage: string }}
 */
export function applyAnomaly(enemy, anomaly, currentEnvironment = null) {
    return anomaly.apply(enemy, currentEnvironment);
}
