// ════════════════════════════════════════════════════════════
//  DUNGEON SCORING SYSTEM
//  Threat/reward budget values for all game elements.
//  Uses per-enemy profiles from bestiaryThreatData for granular
//  environment, elite, and difficulty scoring.
// ════════════════════════════════════════════════════════════

import { getEnemyProfile, getEnvThreatForEnemy, getEliteThreatForEnemy } from './bestiaryThreatData.js';

// ────────────────────────────────────────────────────────────
//  Anomaly Threat Values
// ────────────────────────────────────────────────────────────

export const ANOMALY_THREATS = {
    perfectStorm:  10,
    wounded:       -8,
    enraged:        8,
    doubleTrouble: 20,
    glitched:       5,
};

// ────────────────────────────────────────────────────────────
//  Non-Combat Floor Player Advantage Values
//  All values expressed in threat-equivalent units — same scale
//  as baseThreat so net challenge (threat − advantage) is meaningful.
//
//  Anchor: die upgrade (+1/+1)
//    +1 avg damage/turn ≈ 5% DPS boost (player pool ~20 avg DPS).
//    Value = boost fraction × remaining combat threat.
//    Post-Act 1: 0.05 × 720  ≈ 36
//    Post-Act 2: 0.04 × 1220 ≈ 48
//
//  Heal (30% max HP) has the same face value as the upgrade —
//  they are meant to be equivalent maintenance choices. The heal
//  won't always be fully utilized (~60-70% uptime when damaged),
//  making both approximately equal in expected value.
//
//  Rest transformation tier (+1 slot / sacrifice / transform):
//    +1 slot adds a whole die, ≈ 3× the value of +1/+1 upgrade.
//    Best-of-three choices ≈ 2.5× upgrade.
//
//  Rest total = transform(2.5×) + maintenance(1×) + consumable(0.25×)
//             ≈ 3.75× upgrade value.
// ────────────────────────────────────────────────────────────

export const EVENT_ADVANTAGES = {
    wanderingMerchant: 15,   // small shop, limited selection
    cursedShrine:      18,   // gamble: buff or debuff
    trappedChest:      15,   // artifact or trap damage
    trainingGrounds:   12,   // 20-50 XP options, moderate skill point acceleration
    alchemistsLab:     20,   // consumable crafting, reliable value
    gamblingDen:       10,   // high variance, low expected value
    forgottenForge:    25,   // die upgrade (permanent)
    bloodAltar:        30,   // high risk / high reward
    oracle:            35,   // foresight + artifact choice
    merchantPrince:    40,   // premium shop, high spending power
};

export const SHOP_ADVANTAGES        = [20, 40, 55];   // per act (0-based): spending power × item efficiency
export const DOUBLE_SHOP_ADVANTAGES = [30, 60, 82];
export const REST_ADVANTAGES        = [135, 180];      // post-act-1, post-act-2

export const REWARD_ADVANTAGES = {
    bossArtifact:      35,   // permanent major upgrade, multiple acts of benefit
    eliteArtifact:     25,   // permanent moderate upgrade
    legendaryChance:   40,   // rare, very powerful
    sacrificeOption:   12,   // situational trade-off
};

// Net player advantage per elite fight, by act (0-indexed).
// Positive = elite rewards outweigh attrition cost.
// Act 1: cheap fights + valuable artifact = big net positive.
// Act 3: attrition from harder elites dominates reward value.
export const ELITE_NET_ADVANTAGE = [8, 3, -5];

// ────────────────────────────────────────────────────────────
//  Contextual Environment Scoring
// ────────────────────────────────────────────────────────────

/**
 * Compute environment threat based on the enemy–environment pairing.
 * Delegates to per-enemy bestiary profiles for granular synergy data.
 * @param {object|null} environment
 * @param {object} enemy - Enemy template
 * @param {number|null} [bossFloor] - Boss floor (5/10/15) or null
 * @returns {number} Threat contribution (can be negative if environment helps player)
 */
export function scoreEnvironmentThreat(environment, enemy, bossFloor = null) {
    if (!environment) return 0;
    return getEnvThreatForEnemy(environment.id, enemy.name, bossFloor);
}

// ────────────────────────────────────────────────────────────
//  Floor Scoring
// ────────────────────────────────────────────────────────────

/**
 * Score a single combat floor from its blueprint components.
 * Uses per-enemy bestiary profiles for base threat, elite affinities,
 * and environment synergies.
 * @param {object} floor - Floor blueprint
 * @returns {{ baseThreat, eliteThreat, totalThreat, baseReward, eliteReward }}
 */
export function scoreFloor(floor) {
    if (floor.type !== 'combat' && floor.type !== 'boss') {
        return { baseThreat: 0, eliteThreat: 0, totalThreat: 0, baseReward: 0, eliteReward: 0 };
    }

    const enemy = floor.enemy;
    const isBoss = floor.type === 'boss';
    const bossFloor = isBoss ? floor.floor : null;

    // Base enemy threat from bestiary profile (per-act)
    const act = Math.ceil(floor.floor / 5);
    const profile = getEnemyProfile(enemy.name, bossFloor, act);
    const enemyThreat = profile ? profile.baseThreat : 0;

    // Contextual environment threat (per-enemy)
    const envThreat = scoreEnvironmentThreat(floor.environment, enemy, bossFloor);

    // Anomaly threat
    const anomalyThreat = floor.anomaly
        ? (ANOMALY_THREATS[floor.anomaly.id] || 0)
        : 0;

    const baseThreat = enemyThreat + envThreat + anomalyThreat;

    // Elite threat: per-enemy affinity for each modifier
    // scaleElitePassives scales passives by act: 1.0×/1.25×/1.5×
    let eliteThreat = 0;
    if (floor.eliteOffered && floor.eliteModifiers) {
        const visibleThreat = getEliteThreatForEnemy(
            floor.eliteModifiers.visible.id, enemy.name, bossFloor
        );
        const hiddenThreat = getEliteThreatForEnemy(
            floor.eliteModifiers.hidden.id, enemy.name, bossFloor
        );
        const act = Math.ceil(floor.floor / 5);
        const passiveScale = 1.0 + 0.25 * (act - 1); // 1.0 / 1.25 / 1.5
        eliteThreat = Math.round((visibleThreat + hiddenThreat) * passiveScale);
    }

    const totalThreat = baseThreat + eliteThreat;

    // Compute rewards from threat
    const baseReward  = threatToReward(baseThreat, floor.floor);
    const eliteReward = floor.eliteOffered
        ? threatToReward(totalThreat, floor.floor)
        : baseReward;

    return { baseThreat, eliteThreat, totalThreat, baseReward, eliteReward };
}

/**
 * Score a single combat floor with full component breakdown.
 * @param {object} floor - Floor blueprint
 * @returns {{ enemyThreat, envThreat, anomalyThreat, baseThreat, eliteThreat, totalThreat, baseReward, eliteReward }}
 */
export function scoreFloorDetailed(floor) {
    if (floor.type !== 'combat' && floor.type !== 'boss') {
        return { enemyThreat: 0, envThreat: 0, anomalyThreat: 0, baseThreat: 0, eliteThreat: 0, totalThreat: 0, baseReward: 0, eliteReward: 0 };
    }

    const enemy = floor.enemy;
    const isBoss = floor.type === 'boss';
    const bossFloor = isBoss ? floor.floor : null;

    const act = Math.ceil(floor.floor / 5);
    const profile = getEnemyProfile(enemy.name, bossFloor, act);
    const enemyThreat = profile ? profile.baseThreat : 0;
    const envThreat = scoreEnvironmentThreat(floor.environment, enemy, bossFloor);
    const anomalyThreat = floor.anomaly ? (ANOMALY_THREATS[floor.anomaly.id] || 0) : 0;

    const result = scoreFloor(floor);
    return { enemyThreat, envThreat, anomalyThreat, ...result };
}

/**
 * Score a non-combat floor's player advantage.
 * @param {object} floor - Floor blueprint
 * @returns {number} Player advantage (positive = helps player)
 */
export function scorePlayerAdvantage(floor) {
    switch (floor.type) {
        case 'event':
            return EVENT_ADVANTAGES[floor.eventId] || 15;
        case 'shop': {
            const actIndex = Math.min(Math.ceil(floor.floor / 5) - 1, 2);
            return SHOP_ADVANTAGES[actIndex];
        }
        case 'rest':
            return REST_ADVANTAGES[floor.restIndex] || 15;
        default:
            return 0;
    }
}

// ────────────────────────────────────────────────────────────
//  Dungeon Scoring
// ────────────────────────────────────────────────────────────

/**
 * Score an entire dungeon blueprint.
 * Combines combat threats and player advantages for net challenge.
 * Optionally takes difficulty to compute a difficulty-aware rating.
 * @param {object} blueprint
 * @param {string} [difficulty] - 'casual' | 'standard' | 'heroic'
 * @returns {object} Full scoring breakdown
 */
export function scoreDungeon(blueprint, difficulty) {
    let totalCombatThreat   = 0;
    let totalEliteThreat    = 0;
    let totalPlayerAdvantage = 0;
    const threatByAct       = [0, 0, 0];
    const elitesPerAct      = [0, 0, 0]; // count elite offers per act

    for (const act of blueprint.acts) {
        let actThreat = 0;
        const actIdx  = act.actNumber - 1;
        for (const floor of act.floors) {
            const floorScore = scoreFloor(floor);
            totalCombatThreat += floorScore.baseThreat;
            totalEliteThreat  += floorScore.eliteThreat;
            actThreat         += floorScore.baseThreat;

            if (floor.eliteOffered) elitesPerAct[actIdx]++;

            totalPlayerAdvantage += scorePlayerAdvantage(floor);
        }
        threatByAct[actIdx] = actThreat;
    }

    // Rest stop advantages
    totalPlayerAdvantage += REST_ADVANTAGES[0]; // post-act-1
    totalPlayerAdvantage += REST_ADVANTAGES[1]; // post-act-2

    // Boss artifact advantages
    totalPlayerAdvantage += REWARD_ADVANTAGES.bossArtifact * 3; // one per boss

    const netChallenge      = totalCombatThreat - totalPlayerAdvantage;
    const netEliteChallenge = netChallenge + totalEliteThreat;

    // Elite reward advantage: elites raise both threat AND player power.
    // ELITE_NET_ADVANTAGE captures the net effect per elite fight per act.
    // Positive values mean rewards outweigh attrition (player gets stronger).
    let totalEliteAdvantage = 0;
    for (let i = 0; i < 3; i++) {
        totalEliteAdvantage += elitesPerAct[i] * ELITE_NET_ADVANTAGE[i];
    }

    // Difficulty-aware effective challenge:
    // Casual: no elites ever → base combat threat only
    // Standard: elites where offered → base + partial elite threat, offset by partial reward advantage
    // Heroic: all encounters forced elite → base + full elite threat, offset by full reward advantage
    let effectiveChallenge;
    if (difficulty === 'casual') {
        effectiveChallenge = netChallenge;
    } else if (difficulty === 'heroic') {
        effectiveChallenge = netEliteChallenge - totalEliteAdvantage;
    } else {
        // Standard: elites are optional where offered, assume ~50% uptake
        effectiveChallenge = netChallenge
            + Math.round(totalEliteThreat * 0.5)
            - Math.round(totalEliteAdvantage * 0.5);
    }

    // Normalize to 1–10 scale
    // With threat-equivalent advantages, expected range is:
    //   ~700 (casual/low-budget) to ~1900 (heroic/high-budget)
    // Step size 120 gives a clean 1–10 distribution.
    const challengeRating = Math.max(1, Math.min(10,
        Math.round((effectiveChallenge - 700) / 120)
    ));

    return {
        totalCombatThreat,
        totalPlayerAdvantage,
        netChallenge,
        totalEliteThreat,
        netEliteChallenge,
        totalEliteAdvantage,
        elitesPerAct,
        effectiveChallenge,
        threatByAct,
        challengeRating,
    };
}

// ────────────────────────────────────────────────────────────
//  Threat → Reward Conversion
// ────────────────────────────────────────────────────────────

/**
 * Convert a threat score to gold/XP rewards.
 * Higher threat = proportionally higher rewards.
 * @param {number} threat
 * @param {number} floor
 * @returns {{ gold: [number, number], xp: [number, number] }}
 */
export function threatToReward(threat, floor) {
    // Base conversion: ~1.5 gold per threat, ~2 XP per threat
    // Floor adds a small bonus to keep later floors rewarding
    const floorBonus = Math.floor(floor * 0.5);

    const goldBase = Math.max(5, Math.round(threat * 1.5) + floorBonus);
    const xpBase   = Math.max(5, Math.round(threat * 2.0) + floorBonus);

    // ±20% spread
    const goldMin = Math.round(goldBase * 0.8);
    const goldMax = Math.round(goldBase * 1.2);
    const xpMin   = Math.round(xpBase * 0.8);
    const xpMax   = Math.round(xpBase * 1.2);

    return { gold: [goldMin, goldMax], xp: [xpMin, xpMax] };
}
