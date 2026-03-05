// ════════════════════════════════════════════════════════════
//  DUNGEON SCORING SYSTEM
//  Threat/reward budget values for all game elements.
//  Uses per-enemy profiles from bestiaryThreatData for granular
//  environment, elite, and difficulty scoring.
// ════════════════════════════════════════════════════════════

import { getEnemyProfile, getEnvThreatForEnemy, getEliteThreatForEnemy } from './bestiaryThreatData.js';

// ────────────────────────────────────────────────────────────
//  Anomaly Threat Multipliers
//  Derived from the baseThreat formula (D×O)^0.55.
//  anomalyThreat = Math.round(enemyThreat × (mult − 1))
//
//  wounded:       0.70^0.55 — HP reduced to 70% → −17.8% durability
//  enraged:       1.25^0.55 — dice +~25% avg → +13.1% offense
//  doubleTrouble: 2.00^0.55 — acts twice → +46.4% offense
//  glitched:      ~1.06 empirical — 1 utility→random, small positive bias
//  perfectStorm:  1.000 — env system handles it via envThreat; no enemy-side delta
//
//  See docs/anomaly-threat-design.md for full derivation.
// ────────────────────────────────────────────────────────────

export const ANOMALY_THREAT_MULTS = {
    perfectStorm:  1.000,
    wounded:       0.822,
    enraged:       1.131,
    doubleTrouble: 1.464,
    glitched:      1.060,
};

// ────────────────────────────────────────────────────────────
//  Player Advantage Values
//  All values expressed in threat-equivalent units — same scale
//  as baseThreat so net challenge (threat − advantage) is meaningful.
//
//  Anchor: die upgrade (+1/+1)
//    +1 avg damage/turn ≈ 5% DPS boost (player pool ~20 avg DPS).
//    Value = boost fraction × remaining combat threat.
//    Post-Act 1: 0.05 × 720  ≈ 36
//    Post-Act 2: 0.04 × 1220 ≈ 48
//
//  Gold advantage (per combat, optimal spend):
//    Die upgrade: 50g → 36 (Act 1) / 48 (Act 2/3) threat-equiv.
//    Naive rate: 0.72 / 0.96 per gold.
//    Structural discount: shop capacity, timing, unspendable late gold.
//    Act 1 gold benefits the whole run (high utilization) → 0.25.
//    Act 2 moderate utilization → 0.20.
//    Act 3 few remaining fights → 0.10.
//
//  XP advantage (per combat):
//    Level-up ≈ +5 HP (permanent durability) + skill point ≈ 80 threat-equiv.
//    Avg 82 XP/level → ~1.0/XP naive.
//    Structural discount: diminishing level value, end-of-run waste → 0.15.
//
//  Heal (30% max HP) has the same face value as the upgrade —
//  they are meant to be equivalent maintenance choices.
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

// Gold → threat-equiv per unit, by act (0-indexed).
// Anchored to die upgrade at optimal spend, discounted for structural constraints
// (limited shop visits, timing, unspendable late-run gold).
// Per-combat advantage/threat ratio check (must stay < 1):
//   Act 1 (threat 17): goldAdv 6.5 + xpAdv 2.6 = 9.1 → 53% ✓
//   Act 2 (threat 60): goldAdv 18   + xpAdv 5.4 = 23.4 → 39% ✓
//   Act 3 (threat 210): goldAdv 32  + xpAdv 11.7 = 43.7 → 21% ✓
export const GOLD_ADVANTAGE_RATE = [0.25, 0.20, 0.10];

// XP → threat-equiv per unit (flat).
// Level-up ≈ 80 threat-equiv, avg ~81 XP/level (30/×1.4 curve) → ~1.0 naive.
// Discounted for diminishing level value and end-of-run XP waste.
export const XP_ADVANTAGE_RATE = 0.15;

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

    // Anomaly threat: proportional to enemyThreat via derived multiplier
    const anomalyMult = floor.anomaly
        ? (ANOMALY_THREAT_MULTS[floor.anomaly.id] ?? 1.0)
        : 1.0;
    const anomalyThreat = Math.round(enemyThreat * (anomalyMult - 1));

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
    const anomalyMult2 = floor.anomaly ? (ANOMALY_THREAT_MULTS[floor.anomaly.id] ?? 1.0) : 1.0;
    const anomalyThreat = Math.round(enemyThreat * (anomalyMult2 - 1));

    const result = scoreFloor(floor);
    return { enemyThreat, envThreat, anomalyThreat, ...result };
}

/**
 * Compute gold + XP advantage from a combat reward object.
 * @param {{ gold: [number, number], xp: [number, number] }} reward
 * @param {number} act - Act number (1, 2, or 3)
 * @returns {number} Threat-equivalent advantage
 */
export function rewardToAdvantage(reward, act) {
    if (!reward || !reward.gold) return 0;
    const goldMid = (reward.gold[0] + reward.gold[1]) / 2;
    const xpMid   = (reward.xp[0] + reward.xp[1]) / 2;
    return Math.round(goldMid * GOLD_ADVANTAGE_RATE[act - 1] + xpMid * XP_ADVANTAGE_RATE);
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
    let totalCombatThreat    = 0;
    let totalEliteThreat     = 0;
    let totalPlayerAdvantage = 0;
    let totalGoldXpAdvantage = 0;     // gold + XP from base combat rewards
    let totalEliteRewardBonus = 0;    // extra gold + XP from taking elite
    const threatByAct        = [0, 0, 0];
    const elitesPerAct       = [0, 0, 0];

    for (const act of blueprint.acts) {
        let actThreat = 0;
        const actIdx  = act.actNumber - 1;
        for (const floor of act.floors) {
            const floorScore = scoreFloor(floor);
            totalCombatThreat += floorScore.baseThreat;
            totalEliteThreat  += floorScore.eliteThreat;
            actThreat         += floorScore.baseThreat;

            if (floor.eliteOffered) elitesPerAct[actIdx]++;

            // Gold + XP advantage from combat rewards
            if (floor.type === 'combat' || floor.type === 'boss') {
                const baseAdv = rewardToAdvantage(floorScore.baseReward, act.actNumber);
                totalGoldXpAdvantage += baseAdv;
                if (floor.eliteOffered) {
                    totalEliteRewardBonus += rewardToAdvantage(floorScore.eliteReward, act.actNumber) - baseAdv;
                }
            }

            // Non-combat floor advantages (events, rests — no shops)
            totalPlayerAdvantage += scorePlayerAdvantage(floor);
        }
        threatByAct[actIdx] = actThreat;
    }

    // Gold + XP from combat is player advantage
    totalPlayerAdvantage += totalGoldXpAdvantage;

    // Rest stop advantages
    totalPlayerAdvantage += REST_ADVANTAGES[0]; // post-act-1
    totalPlayerAdvantage += REST_ADVANTAGES[1]; // post-act-2

    // Boss artifact advantages
    totalPlayerAdvantage += REWARD_ADVANTAGES.bossArtifact * 3; // one per boss

    const netChallenge      = totalCombatThreat - totalPlayerAdvantage;
    const netEliteChallenge = netChallenge + totalEliteThreat;

    // Elite reward advantage: elites raise both threat AND player power.
    // ELITE_NET_ADVANTAGE captures the net effect of elite loot per act.
    // totalEliteRewardBonus captures the extra gold/XP from elite combat.
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
        effectiveChallenge = netEliteChallenge - totalEliteAdvantage - totalEliteRewardBonus;
    } else {
        // Standard: elites are optional where offered, assume ~50% uptake
        effectiveChallenge = netChallenge
            + Math.round((totalEliteThreat - totalEliteAdvantage - totalEliteRewardBonus) * 0.5);
    }

    // Normalize to 1–10 scale
    // With gold+XP scored per combat, effective challenge range is:
    //   ~-50 (casual/event-heavy) to ~400 (heroic/gauntlet)
    // Step size 45, offset +65 gives clean 1–10 distribution:
    //   Casual ≈ 1–3, Standard ≈ 4–7, Heroic ≈ 8–10
    const challengeRating = Math.max(1, Math.min(10,
        Math.round((effectiveChallenge + 65) / 45)
    ));

    return {
        totalCombatThreat,
        totalPlayerAdvantage,
        totalGoldXpAdvantage,
        netChallenge,
        totalEliteThreat,
        netEliteChallenge,
        totalEliteAdvantage,
        totalEliteRewardBonus,
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
 * Convert a threat value to an XP reward.
 * Uses a sublinear power curve: XP = k × threat^p
 * This compresses the ~12× threat range (Act 1→3) into ~5× XP range,
 * so higher-act enemies reward more XP but don't completely dwarf Act 1.
 *
 * Calibrated for 6–7 levels per standard run (2 combats + boss per act).
 * @param {number} threat - baseThreat value
 * @returns {number} Base XP value (before ±15% spread)
 */
const XP_K = 2.5;
const XP_P = 0.65;
export function threatToXP(threat) {
    return Math.max(5, Math.round(XP_K * Math.pow(Math.max(1, threat), XP_P)));
}

/**
 * Convert a threat value to an XP reward range (±15%).
 * @param {number} threat - baseThreat value
 * @returns {[number, number]} [min, max] XP range
 */
export function threatToXPRange(threat) {
    const base = threatToXP(threat);
    return [Math.round(base * 0.85), Math.round(base * 1.15)];
}

/**
 * Convert a threat score to gold/XP rewards.
 * Gold uses a linear conversion; XP uses the sublinear threatToXP curve.
 * @param {number} threat
 * @param {number} floor
 * @returns {{ gold: [number, number], xp: [number, number] }}
 */
export function threatToReward(threat, floor) {
    // Gold: ~1.5 per threat + small floor bonus
    const floorBonus = Math.floor(floor * 0.5);
    const goldBase = Math.max(5, Math.round(threat * 1.5) + floorBonus);

    // ±20% gold spread
    const goldMin = Math.round(goldBase * 0.8);
    const goldMax = Math.round(goldBase * 1.2);

    // XP: sublinear power curve (shared with actual combat rewards)
    const xpRange = threatToXPRange(threat);

    return { gold: [goldMin, goldMax], xp: xpRange };
}
