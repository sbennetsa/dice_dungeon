// ════════════════════════════════════════════════════════════
//  DUNGEON SCORING SYSTEM
//  Threat/reward budget values for all game elements.
//  Used by the blueprint generator to score and balance dungeons.
// ════════════════════════════════════════════════════════════

// ────────────────────────────────────────────────────────────
//  Enemy Threat Values
//  Computed from: HP + avg damage/turn + passive difficulty
// ────────────────────────────────────────────────────────────

export const ENEMY_THREATS = {
    // Act 1
    'Goblin':       10,
    'Dire Rat':     12,
    'Fungal Creep': 15,
    'Slime':        18,
    'Skeleton':     11,
    // Act 2
    'Orc Warrior':  30,
    'Dark Mage':    32,
    'Troll':        38,
    'Vampire':      35,
    'Mimic':        28,
    // Act 3
    'Demon':           55,
    'Lich':            58,
    'Dragon Whelp':    65,
    'Shadow Assassin': 52,
    'Iron Golem':      60,
};

export const BOSS_THREATS = {
    5:  80,   // Bone King
    10: 150,  // Crimson Wyrm
    15: 250,  // Void Lord
};

// ────────────────────────────────────────────────────────────
//  Elite Modifier Threat Values
// ────────────────────────────────────────────────────────────

export const ELITE_THREATS = {
    deadly:       15,
    armored:      18,
    swift:        12,
    enraged:      20,
    regenerating: 10,
    vampiric:     12,
    brittle:      -5,
    cursed:       14,
    berserker:    16,
};

export const BOSS_ELITE_THREATS = {
    deadly:     25,
    enraged:    35,
    phasing:    28,
    timewarped: 22,
    armored:    30,
};

// ────────────────────────────────────────────────────────────
//  Environment Base Threat Values (before synergy)
// ────────────────────────────────────────────────────────────

export const ENV_BASE_THREATS = {
    burningGround:     3,
    healingAura:       0,
    slipperyFloor:     2,
    arcaneNexus:       1,
    narrowCorridor:    4,
    thornsAura:        1,
    unstableGround:    2,
    consecratedGround: 0,
    voidZone:          3,
    bloodMoon:         0,
    chaosStorm:        2,
};

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
//  Higher = more beneficial to the player
// ────────────────────────────────────────────────────────────

export const EVENT_ADVANTAGES = {
    wanderingMerchant: 5,
    cursedShrine:      6,
    trappedChest:      4,
    alchemistsLab:     7,
    gamblingDen:       3,
    forgottenForge:    8,
    bloodAltar:        10,
    oracle:            12,
    merchantPrince:    15,
};

export const SHOP_ADVANTAGE        = 8;
export const DOUBLE_SHOP_ADVANTAGE = 12;
export const REST_ADVANTAGES       = [15, 18]; // post-act-1, post-act-2

export const REWARD_ADVANTAGES = {
    bossArtifact:      10,
    eliteArtifact:      8,
    legendaryChance:   15,
    sacrificeOption:    5,
};

// ────────────────────────────────────────────────────────────
//  Contextual Environment Scoring
// ────────────────────────────────────────────────────────────

/**
 * Compute environment threat based on the enemy–environment pairing.
 * Blood Moon + Troll is far more dangerous than Blood Moon + Goblin.
 * @param {object|null} environment
 * @param {object} enemy - Enemy template with passives, abilities, dice, hp
 * @returns {number} Threat contribution (can be negative if environment helps player)
 */
export function scoreEnvironmentThreat(environment, enemy) {
    if (!environment) return 0;

    const base = ENV_BASE_THREATS[environment.id] || 0;
    let synergy = 0;

    const passiveIds   = (enemy.passives || []).map(p => p.id);
    const abilityTypes = Object.values(enemy.abilities || {}).map(a => a.type);
    const hasHeal      = abilityTypes.includes('heal')
                         || passiveIds.includes('regen')
                         || passiveIds.includes('lifesteal');
    const isUndead     = ['Skeleton', 'Lich', 'The Bone King'].includes(enemy.name);
    const hasHighHP    = enemy.hp >= 50;
    const hasManyDice  = (enemy.dice || []).length >= 4;
    const hasBigDice   = (enemy.dice || []).some(d => d >= 8);

    switch (environment.id) {
        case 'bloodMoon':
            // Doubles ALL healing — devastating with heal/regen/lifesteal enemies
            if (hasHeal) synergy += 12;
            else synergy += -2;
            break;

        case 'healingAura':
            // +4 HP/turn — benefits whoever has more HP (enemies usually)
            if (hasHighHP) synergy += 5;
            if (hasHeal) synergy += 3;
            else synergy += 1;
            break;

        case 'burningGround':
            // 3 damage/turn to both — hurts low-HP enemies, helps vs high-HP
            if (hasHighHP) synergy += 3;
            else synergy += -3;
            break;

        case 'arcaneNexus':
            // First die = max — benefits whoever has bigger dice
            if (hasBigDice) synergy += 5;
            else synergy += -1;
            break;

        case 'voidZone':
            // Dice < 3 become 0 — hurts small-dice enemies
            if (hasBigDice) synergy += 3;
            else synergy += -4;
            break;

        case 'consecratedGround':
            // Undead: -30% stats, Others: +15% stats
            if (isUndead) synergy += -8;
            else synergy += 5;
            break;

        case 'thornsAura':
            // 20% recoil — hurts whoever deals more damage
            if (passiveIds.includes('lifesteal')) synergy += -2;
            if (hasManyDice) synergy += 3;
            else synergy += 1;
            break;

        case 'narrowCorridor':
            // +5 to first attacker (enemy always first)
            synergy += 2;
            break;

        case 'chaosStorm':
            // Rerolls one random die
            if (hasManyDice) synergy += -1;
            else synergy += 2;
            break;

        case 'slipperyFloor':
            // -1 to all dice
            if (hasBigDice) synergy += 1;
            else synergy += -1;
            break;

        case 'unstableGround':
            // Random 10 damage — more threatening in long fights
            if (hasHighHP || hasHeal) synergy += 2;
            break;
    }

    return base + synergy;
}

// ────────────────────────────────────────────────────────────
//  Floor Scoring
// ────────────────────────────────────────────────────────────

/**
 * Score a single combat floor from its blueprint components.
 * @param {object} floor - Floor blueprint with enemy, environment, anomaly, eliteModifiers, eliteOffered
 * @returns {{ baseThreat, eliteThreat, totalThreat, baseReward, eliteReward }}
 */
export function scoreFloor(floor) {
    if (floor.type !== 'combat' && floor.type !== 'boss') {
        return { baseThreat: 0, eliteThreat: 0, totalThreat: 0, baseReward: 0, eliteReward: 0 };
    }

    const enemy = floor.enemy;

    // Base enemy threat
    const enemyThreat = floor.type === 'boss'
        ? (BOSS_THREATS[floor.floor] || 0)
        : (ENEMY_THREATS[enemy.name] || 0);

    // Contextual environment threat
    const envThreat = scoreEnvironmentThreat(floor.environment, enemy);

    // Anomaly threat
    const anomalyThreat = floor.anomaly
        ? (ANOMALY_THREATS[floor.anomaly.id] || 0)
        : 0;

    const baseThreat = enemyThreat + envThreat + anomalyThreat;

    // Elite threat (only if elite is offered on this floor)
    let eliteThreat = 0;
    if (floor.eliteOffered && floor.eliteModifiers) {
        const threats = floor.type === 'boss' ? BOSS_ELITE_THREATS : ELITE_THREATS;
        const visibleThreat = threats[floor.eliteModifiers.visible.id] || 0;
        const hiddenThreat  = threats[floor.eliteModifiers.hidden.id]  || 0;
        eliteThreat = visibleThreat + hiddenThreat;
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
 * @param {object} floor - Floor blueprint with enemy, environment, anomaly, eliteModifiers, eliteOffered
 * @returns {{ enemyThreat, envThreat, anomalyThreat, baseThreat, eliteThreat, totalThreat, baseReward, eliteReward }}
 */
export function scoreFloorDetailed(floor) {
    if (floor.type !== 'combat' && floor.type !== 'boss') {
        return { enemyThreat: 0, envThreat: 0, anomalyThreat: 0, baseThreat: 0, eliteThreat: 0, totalThreat: 0, baseReward: 0, eliteReward: 0 };
    }

    const enemy = floor.enemy;
    const enemyThreat = floor.type === 'boss'
        ? (BOSS_THREATS[floor.floor] || 0)
        : (ENEMY_THREATS[enemy.name] || 0);
    const envThreat = scoreEnvironmentThreat(floor.environment, enemy);
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
            return EVENT_ADVANTAGES[floor.eventId] || 5;
        case 'shop':
            return SHOP_ADVANTAGE;
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
 * @param {object} blueprint
 * @returns {object} Full scoring breakdown
 */
export function scoreDungeon(blueprint) {
    let totalCombatThreat   = 0;
    let totalEliteThreat    = 0;
    let totalPlayerAdvantage = 0;
    const threatByAct       = [0, 0, 0];

    for (const act of blueprint.acts) {
        let actThreat = 0;
        for (const floor of act.floors) {
            const floorScore = scoreFloor(floor);
            totalCombatThreat += floorScore.baseThreat;
            totalEliteThreat  += floorScore.eliteThreat;
            actThreat         += floorScore.baseThreat;

            totalPlayerAdvantage += scorePlayerAdvantage(floor);
        }
        threatByAct[act.actNumber - 1] = actThreat;
    }

    // Rest stop advantages
    totalPlayerAdvantage += REST_ADVANTAGES[0]; // post-act-1
    totalPlayerAdvantage += REST_ADVANTAGES[1]; // post-act-2

    // Boss artifact advantages
    totalPlayerAdvantage += REWARD_ADVANTAGES.bossArtifact * 3; // one per boss

    const netChallenge      = totalCombatThreat - totalPlayerAdvantage;
    const netEliteChallenge = netChallenge + totalEliteThreat;

    // Normalize to 1–10 scale
    // Expected range: netChallenge ~100 (easy) to ~500 (extreme)
    const challengeRating = Math.max(1, Math.min(10,
        Math.round((netChallenge / 50) + 1)
    ));

    return {
        totalCombatThreat,
        totalPlayerAdvantage,
        netChallenge,
        totalEliteThreat,
        netEliteChallenge,
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
