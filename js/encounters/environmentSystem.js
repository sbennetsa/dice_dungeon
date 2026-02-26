// ════════════════════════════════════════════════════════════
//  ENVIRONMENT SYSTEM
// ════════════════════════════════════════════════════════════

export const ENVIRONMENTS = {
    // ── ACT 1: Simple, direct effects ──

    burningGround: {
        id: 'burningGround',
        name: 'Burning Ground',
        icon: '🔥',
        desc: 'Both combatants take 3 damage at end of turn',
        act: 1,
        onTurnEnd(combat) {
            combat.player.hp = Math.max(0, combat.player.hp - 3);
            combat.enemy.currentHp = Math.max(0, combat.enemy.currentHp - 3);
            combat.log('The flames sear both fighters for 3 damage');
        },
    },

    healingAura: {
        id: 'healingAura',
        name: 'Healing Aura',
        icon: '💚',
        desc: 'Both combatants heal 4 HP at start of turn',
        act: 1,
        onTurnStart(combat) {
            const playerHeal = Math.min(4, combat.player.maxHp - combat.player.hp);
            const enemyHeal  = Math.min(4, combat.enemy.maxHp  - combat.enemy.currentHp);
            combat.player.hp         = Math.min(combat.player.maxHp, combat.player.hp + 4);
            combat.enemy.currentHp   = Math.min(combat.enemy.maxHp,  combat.enemy.currentHp + 4);
            if (playerHeal > 0 || enemyHeal > 0) {
                combat.log(`The aura mends wounds (Player: +${playerHeal}, Enemy: +${enemyHeal})`);
            }
        },
    },

    slipperyFloor: {
        id: 'slipperyFloor',
        name: 'Slippery Floor',
        icon: '💧',
        desc: 'All dice show −1 result (minimum 1)',
        act: 1,
        onDiceRoll(dice, isPlayer, combat) {
            const modified = dice.map(d => Math.max(1, d - 1));
            combat.log(`The slippery floor disrupts precision (−1 to all dice)`);
            return modified;
        },
    },

    // ── ACT 2: Interactive effects ──

    arcaneNexus: {
        id: 'arcaneNexus',
        name: 'Arcane Nexus',
        icon: '✨',
        desc: 'First die rolled each turn is automatically maximum value',
        act: 2,
        onDiceRoll(dice, isPlayer, combat) {
            if (dice.length === 0) return dice;
            const modified = [...dice];
            // Max value = the die size (for enemy: combat.enemy.dice[0]; for player, use highest seen value)
            const allDice  = isPlayer ? combat.player.dice : [...combat.enemy.dice, ...combat.enemy.extraDice];
            const maxValue = allDice[0] || dice[0];
            modified[0] = maxValue;
            combat.log(`Arcane energy surges — first die is maximum! (${maxValue})`);
            return modified;
        },
    },

    narrowCorridor: {
        id: 'narrowCorridor',
        name: 'Narrow Corridor',
        icon: '🚪',
        desc: 'First attacker each turn deals +5 damage',
        act: 2,
        onDamageDealt(damage, attacker, defender, combat) {
            // combat.firstAttacker is 'enemy' (enemy always acts first in this game)
            const attackerIsEnemy = attacker.currentHp !== undefined;
            const firstIsEnemy    = combat.firstAttacker === 'enemy';
            if (attackerIsEnemy === firstIsEnemy) {
                combat.log('Initiative advantage in the narrow space! (+5 damage)');
                return damage + 5;
            }
            return damage;
        },
    },

    thornsAura: {
        id: 'thornsAura',
        name: 'Thorns Aura',
        icon: '🌿',
        desc: 'Attacker takes 20% of damage dealt as recoil',
        act: 2,
        onDamageDealt(damage, attacker, defender, combat) {
            const recoil = Math.floor(damage * 0.2);
            if (recoil > 0) {
                // Enemy has currentHp; player uses hp via the combatCtx getter
                if (attacker.currentHp !== undefined) {
                    attacker.currentHp = Math.max(0, attacker.currentHp - recoil);
                } else {
                    attacker.hp = Math.max(0, attacker.hp - recoil);
                }
                combat.log(`Thorns recoil: ${recoil} damage to ${attacker.name || 'Player'}`);
            }
            return damage;
        },
    },

    unstableGround: {
        id: 'unstableGround',
        name: 'Unstable Ground',
        icon: '💥',
        desc: 'Each turn, 25% chance for 10 damage to a random combatant',
        act: 2,
        onTurnEnd(combat) {
            if (Math.random() < 0.25) {
                if (Math.random() < 0.5) {
                    combat.player.hp = Math.max(0, combat.player.hp - 10);
                    combat.log('The ground collapses! Player takes 10 damage!');
                } else {
                    combat.enemy.currentHp = Math.max(0, combat.enemy.currentHp - 10);
                    combat.log(`The ground collapses! ${combat.enemy.name} takes 10 damage!`);
                }
            }
        },
    },

    consecratedGround: {
        id: 'consecratedGround',
        name: 'Consecrated Ground',
        icon: '✝️',
        desc: 'Undead enemies weakened (−30% stats); others empowered (+15% stats)',
        act: 2,
        // Applied at combat init via applyConsecratedGround() in combat.js — no turn hooks needed
    },

    // ── ACT 3: Complex effects ──

    voidZone: {
        id: 'voidZone',
        name: 'Void Zone',
        icon: '🌑',
        desc: 'All dice faces below 3 become 0',
        act: 3,
        onDiceRoll(dice, isPlayer, combat) {
            const modified = dice.map(d => d < 3 ? 0 : d);
            const voided   = dice.filter(d => d < 3).length;
            if (voided > 0) combat.log(`The void consumes ${voided} weak roll(s)`);
            return modified;
        },
    },

    bloodMoon: {
        id: 'bloodMoon',
        name: 'Blood Moon',
        icon: '🌙',
        desc: 'All healing effects doubled',
        act: 3,
        healingMultiplier: 2.0,
        // Applied via applyHealingMultiplier() wrapper — no turn hooks needed
    },

    chaosStorm: {
        id: 'chaosStorm',
        name: 'Chaos Storm',
        icon: '⚡',
        desc: 'After each turn, one random die for each combatant is rerolled',
        act: 3,
        onTurnEnd(combat) {
            combat.chaosStormActive = true;
            combat.log('The chaos storm warps reality...');
        },
    },
};

// ────────────────────────────────────────────────────────────
//  Selection
// ────────────────────────────────────────────────────────────

const ENVIRONMENT_CHANCES = [0.30, 0.50, 0.70]; // by act index (0-based)

/**
 * Select an environment for the given floor.
 * @param {number} floor
 * @returns {object|null} Environment definition or null
 */
export function selectEnvironment(floor) {
    const act     = Math.ceil(floor / 5);
    const chance  = ENVIRONMENT_CHANCES[Math.min(act - 1, 2)];
    if (Math.random() > chance) return null;

    const available = Object.values(ENVIRONMENTS).filter(e => e.act <= act);
    return available[Math.floor(Math.random() * available.length)];
}

/**
 * Get environment by ID.
 * @param {string} id
 * @returns {object|null}
 */
export function getEnvironmentById(id) {
    return ENVIRONMENTS[id] || null;
}
