// ════════════════════════════════════════════════════════════
//  BESTIARY THREAT DATA
//  Per-enemy threat profiles used by dungeon scoring and the
//  bestiary UI. Each entry captures how dangerous an enemy is
//  across difficulty modes and elite modifier pairings.
//
//  Fields:
//    baseThreat       — standalone threat (no environment, no elite)
//    eliteAffinities  — per-modifier threat delta for this enemy.
//                       Replaces the flat ELITE_THREATS lookup.
//                       Positive = modifier makes this enemy harder.
//                       Negative = modifier barely matters or helps player.
//    envAffinities    — per-environment threat delta for this enemy.
//                       Replaces the ad-hoc switch in scoreEnvironmentThreat.
//    notes            — short string for bestiary display
// ════════════════════════════════════════════════════════════

// ────────────────────────────────────────────────────────────
//  Standard Enemy Profiles
// ────────────────────────────────────────────────────────────

export const ENEMY_PROFILES = {

    // ── ACT 1 ──────────────────────────────────────────────

    'Goblin': {
        baseThreat: 10,   // 20 HP, 2d4, simple strike
        eliteAffinities: {
            deadly:        8,   // bigger dice help a little, but low HP pool limits impact
            armored:       6,   // reduction 2 is proportionally huge when player has small dice
            swift:         5,   // +1d6 on a 2d4 enemy is significant
            enraged:      10,   // +4 faces on d4 → d8 is a big relative jump
            regenerating:  4,   // 3 regen on 20 HP is decent but fight is short
            vampiric:      3,   // low damage dealt = low lifesteal
            brittle:      -2,   // already easy to kill
            cursed:        6,   // -1 dice hurts early when player has small dice
            berserker:     5,   // 2d6 at 50% of 20 HP = at 10 HP, moderate
        },
        envAffinities: {
            burningGround:    -3,   // 3/turn shreds a 20 HP enemy
            healingAura:       1,   // neutral — both heal, short fight
            slipperyFloor:    -1,   // -1 on d4 hurts goblin proportionally more
            arcaneNexus:      -1,   // max d4 = 4; player benefits more
            narrowCorridor:    2,   // enemy strikes first; flat +5 hurts
            thornsAura:        1,   // low damage both ways
            unstableGround:    0,   // random, short fight
            consecratedGround: 5,   // non-undead: +15% stats
            voidZone:         -2,   // d4 has 50% chance of <3
            bloodMoon:        -2,   // no healing; player can exploit heal items
            chaosStorm:        1,   // random reroll, minor
        },
        notes: 'Weak. Elite modifiers that boost dice hurt because d4→d8 is a big relative jump.',
    },

    'Dire Rat': {
        baseThreat: 12,   // 14 HP, 3d3, multi-hit frenzy
        eliteAffinities: {
            deadly:        6,   // +2 on d3 is huge (d3→d5), but 14 HP is paper
            armored:       8,   // reduction 2 makes this rat tanky relative to its HP
            swift:         7,   // +1d6 on a multi-hit enemy is strong
            enraged:       8,   // +4 on d3 → d7, triples avg damage
            regenerating:  3,   // 3/turn on 14 HP extends fight slightly
            vampiric:      5,   // multi-hit = multiple heal procs
            brittle:      -3,   // 14 HP + brittle = instant kill
            cursed:        5,   // -1 dice hurts player; rat has many small hits
            berserker:     4,   // low HP threshold triggers fast
        },
        envAffinities: {
            burningGround:    -4,   // 3/turn on 14 HP = dead in 5 turns
            healingAura:       2,   // helps rat survive slightly; multi-hit outpaces player heal
            slipperyFloor:    -2,   // d3-1 = d2, huge relative loss
            arcaneNexus:      -1,   // max d3 = 3, not scary
            narrowCorridor:    2,   // strikes first
            thornsAura:        2,   // multi-hit = multiple thorns procs on player
            unstableGround:   -1,   // 10 random damage often kills the rat
            consecratedGround: 3,   // non-undead: +15%
            voidZone:         -4,   // d3 dice have 67% chance of <3
            bloodMoon:        -2,   // no healing
            chaosStorm:        0,
        },
        notes: 'Fragile glass cannon. Multi-hit makes vampiric and thornsAura dangerous.',
    },

    'Fungal Creep': {
        baseThreat: 15,   // 22 HP, 2d4, poison pattern
        eliteAffinities: {
            deadly:        8,
            armored:       7,
            swift:         6,
            enraged:      10,   // bigger dice = more poison applied
            regenerating:  6,   // extends fight = more poison stacking
            vampiric:      4,   // low damage
            brittle:      -2,
            cursed:        8,   // -1 dice + poison = player loses value faster
            berserker:     5,
        },
        envAffinities: {
            burningGround:    -2,
            healingAura:       3,   // heals enemy while poison ticks on player
            slipperyFloor:    -1,
            arcaneNexus:       0,
            narrowCorridor:    2,
            thornsAura:        1,
            unstableGround:    0,
            consecratedGround: 5,
            voidZone:         -2,
            bloodMoon:        -2,
            chaosStorm:        1,
        },
        notes: 'Poison + time = danger. Anything extending the fight amplifies threat.',
    },

    'Slime': {
        baseThreat: 18,   // 28 HP, 2d4, mitosis at turn 3
        eliteAffinities: {
            deadly:       10,   // bigger starting dice + mitosis evolve = strong
            armored:       9,   // survives to mitosis more reliably
            swift:         7,
            enraged:      12,   // enraged + mitosis = massive damage post-evolve
            regenerating:  8,   // regen + mitosis = very hard to kill before evolve
            vampiric:      5,
            brittle:      -1,   // helps player kill before mitosis
            cursed:        7,
            berserker:     6,
        },
        envAffinities: {
            burningGround:    -1,   // helps player race to kill pre-mitosis
            healingAura:       5,   // heals to mitosis threshold
            slipperyFloor:    -1,
            arcaneNexus:       1,
            narrowCorridor:    2,
            thornsAura:        1,
            unstableGround:    1,
            consecratedGround: 5,
            voidZone:         -2,
            bloodMoon:        -2,
            chaosStorm:        2,   // rerolls add variance; mitosis race
        },
        notes: 'Mitosis is the threat. Anything that helps it survive 3 turns is dangerous.',
    },

    'Skeleton': {
        baseThreat: 11,   // 18 HP, 2d6, brittle -3
        eliteAffinities: {
            deadly:        7,
            armored:      12,   // armored negates the brittle weakness — huge synergy
            swift:         6,
            enraged:       9,
            regenerating:  7,   // regen + brittle partially cancels; extends fight
            vampiric:      6,
            brittle:      -6,   // double brittle = player crushes it
            cursed:        6,
            berserker:     5,
        },
        envAffinities: {
            burningGround:    -3,
            healingAura:       1,
            slipperyFloor:     0,
            arcaneNexus:       1,
            narrowCorridor:    2,
            thornsAura:        1,
            unstableGround:   -1,
            consecratedGround:-8,   // UNDEAD: -30% stats
            voidZone:         -1,
            bloodMoon:        -2,
            chaosStorm:        1,
        },
        notes: 'Brittle makes it weak; armored elite negates that weakness completely.',
    },

    // ── ACT 2 ──────────────────────────────────────────────

    'Orc Warrior': {
        baseThreat: 30,   // 45 HP, 3d6, war cry buff
        eliteAffinities: {
            deadly:       15,   // war cry + bigger dice = huge buffed strikes
            armored:      12,
            swift:        10,
            enraged:      18,   // +4 on d6→d10; war cry stores MORE damage
            regenerating:  8,
            vampiric:     10,   // high damage = good lifesteal
            brittle:      -3,
            cursed:       12,
            berserker:    14,   // war cry + berserker rage = spike damage
        },
        envAffinities: {
            burningGround:     1,   // 45 HP absorbs 3/turn well
            healingAura:       3,   // high HP benefits more from flat heal
            slipperyFloor:     0,
            arcaneNexus:       4,   // max d6 every turn; benefits the war cry cycle
            narrowCorridor:    3,   // +5 on already big hits
            thornsAura:        2,   // high damage = some recoil, but worth it
            unstableGround:    1,
            consecratedGround: 5,   // non-undead: +15%
            voidZone:          1,   // d6 has only 33% chance of <3
            bloodMoon:        -2,   // no healing
            chaosStorm:        1,
        },
        notes: 'War Cry stores damage for spike turns. Enraged + deadly amplify the burst.',
    },

    'Dark Mage': {
        baseThreat: 32,   // 32 HP, 2d6, penetrate + slot seal
        eliteAffinities: {
            deadly:       12,
            armored:      10,   // 32 HP is low; armor helps survive
            swift:         9,
            enraged:      14,   // penetrating d10s are devastating
            regenerating:  7,
            vampiric:      8,   // penetrate = guaranteed damage = guaranteed heal
            brittle:      -2,
            cursed:       16,   // curse + slot seal = player has very few functional dice
            berserker:    10,
        },
        envAffinities: {
            burningGround:    -1,   // 32 HP is vulnerable
            healingAura:       2,
            slipperyFloor:     0,
            arcaneNexus:       3,   // max d6 bolt with penetrate = strong
            narrowCorridor:    3,   // +5 on penetrating attacks
            thornsAura:       -1,   // penetrate still triggers thorns; mage is fragile
            unstableGround:    0,
            consecratedGround: 5,
            voidZone:          1,
            bloodMoon:        -2,
            chaosStorm:        1,
        },
        notes: 'Slot seal + curse elite = player lockdown. Penetrate bypasses guard.',
    },

    'Troll': {
        baseThreat: 38,   // 55 HP, 2d8, thick hide (10) + regen 3
        eliteAffinities: {
            deadly:       14,
            armored:      18,   // armor + thick hide + high HP = near-unkillable wall
            swift:        10,
            enraged:      16,   // d8→d12, smash hits are devastating
            regenerating: 16,   // regen 3 + regen 3 = 6/turn; with passive scale up to 9/turn
            vampiric:     14,   // heal ability + vampiric + regen = triple sustain
            brittle:       0,   // brittle helps player get past thick hide, but HP pool absorbs
            cursed:       12,   // thick hide means player needs big dice; curse shrinks them
            berserker:    12,
        },
        envAffinities: {
            burningGround:     3,   // 55 HP absorbs burn; 3/turn is noise
            healingAura:       6,   // heals BOTH: troll already heals, this adds more
            slipperyFloor:     1,   // d8-1 still good; player's small dice suffer more
            arcaneNexus:       5,   // max d8 = 8 guaranteed; huge with thick hide
            narrowCorridor:    3,
            thornsAura:        2,
            unstableGround:    1,
            consecratedGround: 5,
            voidZone:          3,   // d8 rarely <3; hurts player dice more
            bloodMoon:        12,   // DOUBLES heal ability AND regen — devastating
            chaosStorm:        1,
        },
        notes: 'The healing wall. Blood Moon + Troll is one of the most dangerous pairings.',
    },

    'Vampire': {
        baseThreat: 35,   // 38 HP, 3d6, lifesteal 50% + blood frenzy
        eliteAffinities: {
            deadly:       14,   // bigger dice = more lifesteal healing
            armored:      10,
            swift:        10,   // +1d6 = more drain hits
            enraged:      16,   // d6→d10 drains; massive heal per turn
            regenerating: 12,   // lifesteal + regen = very hard to out-damage
            vampiric:      2,   // already has lifesteal; stacking is marginal (35% + 35% not additive)
            brittle:      -3,   // helps player burst past blood frenzy threshold
            cursed:       12,   // weaker player dice = less damage through lifesteal
            berserker:    14,   // blood frenzy at 50% + berserker at 50% = same trigger, extra dice
        },
        envAffinities: {
            burningGround:    -1,   // 38 HP, but lifesteal compensates
            healingAura:       4,   // heals on top of lifesteal
            slipperyFloor:     0,
            arcaneNexus:       4,   // max d6 drain = guaranteed 6 heal
            narrowCorridor:    3,
            thornsAura:       -2,   // lifesteal partially counters, but thorns hits back
            unstableGround:    0,
            consecratedGround: 5,
            voidZone:          0,
            bloodMoon:        12,   // doubles lifesteal healing — devastating
            chaosStorm:        0,
        },
        notes: 'Lifesteal makes attrition impossible. Blood Moon doubles the sustain.',
    },

    'Mimic': {
        baseThreat: 28,   // 35 HP, 2d6, greed tax
        eliteAffinities: {
            deadly:       10,
            armored:       8,
            swift:         8,
            enraged:      12,   // bigger steal + bigger strikes
            regenerating:  6,
            vampiric:      7,
            brittle:      -3,
            cursed:        8,
            berserker:     8,
        },
        envAffinities: {
            burningGround:    -1,
            healingAura:       2,
            slipperyFloor:     0,
            arcaneNexus:       2,
            narrowCorridor:    2,
            thornsAura:        1,
            unstableGround:    0,
            consecratedGround: 5,
            voidZone:          0,
            bloodMoon:        -2,
            chaosStorm:        1,
        },
        notes: 'Greed Tax scales with player gold. Gold-heavy builds face a harder fight.',
    },

    // ── ACT 3 ──────────────────────────────────────────────

    'Demon': {
        baseThreat: 65,   // 90 HP, 3d12, unblockable hellfire + soul pact
        eliteAffinities: {
            deadly:       18,
            armored:      16,   // 90 HP + armor on d12 attacks = extreme
            swift:        14,
            enraged:      22,   // d12→d16; hellfire caps at 20 but strike doesn't
            regenerating: 12,
            vampiric:     15,   // high damage = massive lifesteal
            brittle:      -2,   // 90 HP means brittle barely matters
            cursed:       16,   // player needs big dice for 90 HP; curse shrinks them
            berserker:    16,
        },
        envAffinities: {
            burningGround:     3,   // 90 HP shrugs off 3/turn
            healingAura:       5,   // high HP benefits most from flat heal
            slipperyFloor:     1,   // d12-1 still strong
            arcaneNexus:       6,   // max d12 = 12 guaranteed per turn
            narrowCorridor:    4,   // +5 on d12 attacks
            thornsAura:        3,   // high damage = player takes thorns recoil
            unstableGround:    2,   // long fight = more procs
            consecratedGround: 6,   // non-undead: +15% on already massive stats
            voidZone:          3,   // d12 almost never <3; hurts player
            bloodMoon:        -2,   // no healing (soul pact is not heal)
            chaosStorm:        2,
        },
        notes: 'Unblockable hellfire ignores guard. Soul Pact punishes overkill. Huge HP pool.',
    },

    'Lich': {
        baseThreat: 68,   // 80 HP, 2d12, decay + phylactery revive at 40%
        eliteAffinities: {
            deadly:       18,
            armored:      16,   // 80 HP × revive + armor = enormous effective HP
            swift:        12,
            enraged:      20,   // d12→d16 + decay = player dice shrink while enemy grows
            regenerating: 14,   // regen + phylactery = multiple health bars
            vampiric:     14,   // lifesteal + revive = 3+ effective health bars
            brittle:      -1,   // 80 HP + revive means brittle is negligible
            cursed:       18,   // decay + curse = player dice collapse
            berserker:    14,
        },
        envAffinities: {
            burningGround:     2,
            healingAura:       4,   // heals through both health bars
            slipperyFloor:     1,
            arcaneNexus:       5,   // max d12 = 12
            narrowCorridor:    3,
            thornsAura:        2,
            unstableGround:    2,
            consecratedGround:-8,   // UNDEAD: -30% stats; massive relief
            voidZone:          3,
            bloodMoon:        -2,   // no healing ability (revive is not heal)
            chaosStorm:        2,
        },
        notes: 'Decay erodes player dice permanently. Phylactery means you kill it twice. Consecrated Ground is the hard counter.',
    },

    'Dragon Whelp': {
        baseThreat: 78,   // 110 HP, 4d12, charge/breath + dragon scales (8)
        eliteAffinities: {
            deadly:       20,   // 4d12+2 = 4d14 with scales; monstrous
            armored:      18,   // scales (8) + armor (2) = 10 reduction per slot
            swift:        14,   // +1d6 on a 4d12 is incremental but still strong
            enraged:      24,   // d12→d16 on a charge/breath cycle = potential 1-shot
            regenerating: 14,   // 110 HP + regen = extremely long fight
            vampiric:     16,   // 4d12 damage = massive lifesteal
            brittle:      -1,   // 110 HP + scales makes brittle negligible
            cursed:       16,   // player needs huge dice to get past scales; curse cripples that
            berserker:    16,   // already 4d12; berserker at 55 HP adds +2d6 for 6d dice
        },
        envAffinities: {
            burningGround:     3,   // 110 HP ignores 3/turn
            healingAura:       5,
            slipperyFloor:     1,
            arcaneNexus:       6,   // max d12 = 12; with charge → 24
            narrowCorridor:    4,
            thornsAura:        3,   // 4 dice = lots of recoil on player
            unstableGround:    2,
            consecratedGround: 6,
            voidZone:          3,
            bloodMoon:        -2,   // no healing
            chaosStorm:       -1,   // 4 dice means reroll is less impactful
        },
        notes: 'Highest raw stat block. Dragon Scales + armored elite = near-impervious.',
    },

    'Shadow Assassin': {
        baseThreat: 62,   // 70 HP, 3d12, evasion + vanish (immune turn)
        eliteAffinities: {
            deadly:       16,
            armored:      12,   // evasion already reduces incoming; armor stacks
            swift:        12,
            enraged:      20,   // d12→d16 on doubled vanish strikes = huge burst
            regenerating: 10,   // evasion + regen = hard to chip down
            vampiric:     12,   // high damage + lifesteal, but vanish turn has 0 drain
            brittle:      -2,   // 70 HP; brittle helps but evasion blocks a hit
            cursed:       14,   // fewer dice = evasion blocks a higher % of output
            berserker:    14,   // vanish + berserker = doubled burst from low HP
        },
        envAffinities: {
            burningGround:     2,
            healingAura:       3,
            slipperyFloor:     1,
            arcaneNexus:       5,
            narrowCorridor:    4,   // strikes first; +5 on doubled vanish hit
            thornsAura:       -1,   // evasion turn = no damage taken = no thorns
            unstableGround:    1,
            consecratedGround: 6,
            voidZone:          3,
            bloodMoon:        -2,
            chaosStorm:        1,
        },
        notes: 'Evasion wastes one attack die per turn. Vanish makes it immune then doubles next hit.',
    },

    'Iron Golem': {
        baseThreat: 72,   // 130 HP, 3d10, armor (5) + escalate + overcharge
        eliteAffinities: {
            deadly:       18,
            armored:      20,   // armor 5 + armor 2 = 7 flat reduction; brutal
            swift:        12,
            enraged:      18,   // d10→d14 with escalating dice
            regenerating: 16,   // 130 HP + regen + armor = eternal fight
            vampiric:     14,   // escalating damage = escalating lifesteal
            brittle:       2,   // brittle partially offsets armor 5; net still negative for player
            cursed:       16,   // overcharge threshold 25 is harder with cursed dice
            berserker:    14,   // 130 HP means berserker triggers at 65 HP; adds dice to escalation
        },
        envAffinities: {
            burningGround:     3,   // armor reduces burn (poison/dmg -5); 130 HP
            healingAura:       6,   // high HP benefits most; armor extends fight
            slipperyFloor:     1,
            arcaneNexus:       5,   // max d10 = 10, good
            narrowCorridor:    3,
            thornsAura:        3,   // player has to hit hard to get past armor; thorns punishes that
            unstableGround:    2,   // long fight = more procs
            consecratedGround: 6,
            voidZone:          2,
            bloodMoon:        -2,
            chaosStorm:        2,
        },
        notes: 'Armor stacking is the core problem. Armor 5 + armored elite = 7 flat reduction.',
    },
};

// ────────────────────────────────────────────────────────────
//  Boss Profiles
// ────────────────────────────────────────────────────────────

export const BOSS_PROFILES = {

    5: {   // The Bone King
        baseThreat: 80,
        eliteAffinities: {
            deadly:     20,
            enraged:    28,   // raiseDead + bigger dice = snowball
            phasing:    22,   // 50% resist alternating + bone wall = tanky
            timewarped: 18,   // earlier phases = faster raiseDead cycle
            armored:    20,   // bone wall + armor = stacking reduction
        },
        envAffinities: {
            burningGround:     1,
            healingAura:       3,
            slipperyFloor:     0,
            arcaneNexus:       3,
            narrowCorridor:    3,
            thornsAura:        2,
            unstableGround:    1,
            consecratedGround:-8,   // UNDEAD: -30% stats
            voidZone:          1,
            bloodMoon:        -2,
            chaosStorm:        2,
        },
        notes: 'Raise Dead snowballs. Undead: Consecrated Ground is the hard counter.',
    },

    10: {   // Crimson Wyrm
        baseThreat: 150,
        eliteAffinities: {
            deadly:     30,   // 4d10+4 = 4d14; fire breath with burn
            enraged:    40,   // d10→d16; inferno phase adds burn on all attacks
            phasing:    32,   // 300 HP + 50% resist = 600 effective HP
            timewarped: 28,   // inferno phase at 75% instead of 50% = much earlier
            armored:    30,   // 300 HP + armor = enormous wall
        },
        envAffinities: {
            burningGround:     3,
            healingAura:       5,
            slipperyFloor:     1,
            arcaneNexus:       6,
            narrowCorridor:    4,
            thornsAura:        3,
            unstableGround:    2,
            consecratedGround: 6,
            voidZone:          3,
            bloodMoon:        -2,
            chaosStorm:        1,
        },
        notes: 'Phase 2 adds burn-on-hit and +2d10. Enraged makes the phase transition devastating.',
    },

    15: {   // The Void Lord
        baseThreat: 250,
        eliteAffinities: {
            deadly:     35,
            enraged:    45,   // d10→d16 with double action at 20% = potential wipe
            phasing:    38,   // 450 HP + 50% resist + entropy
            timewarped: 32,   // entropy phase at 75%, double action at 45%
            armored:    34,   // 450 HP + armor; entropy erodes player dice
        },
        envAffinities: {
            burningGround:     3,
            healingAura:       5,
            slipperyFloor:     1,
            arcaneNexus:       6,
            narrowCorridor:    4,
            thornsAura:        3,
            unstableGround:    2,
            consecratedGround: 6,
            voidZone:          4,   // player dice lose low values; Void Lord's d10 unaffected
            bloodMoon:        -2,
            chaosStorm:        2,
        },
        notes: 'Entropy permanently shrinks player dice each turn. Double-action at 20% HP is lethal.',
    },
};

// ────────────────────────────────────────────────────────────
//  Lookup Helpers
// ────────────────────────────────────────────────────────────

/**
 * Get the threat profile for an enemy or boss.
 * @param {string} enemyName - Enemy name from constants.js (e.g. 'Troll')
 * @param {number|null} bossFloor - Boss floor number (5, 10, 15) or null for regular enemies
 * @returns {object|null} Profile with baseThreat, eliteAffinities, envAffinities, notes
 */
export function getEnemyProfile(enemyName, bossFloor = null) {
    if (bossFloor) return BOSS_PROFILES[bossFloor] || null;
    return ENEMY_PROFILES[enemyName] || null;
}

/**
 * Score environment threat for a specific enemy using bestiary data.
 * Falls back to 0 if no profile or environment data exists.
 * @param {string} envId - Environment ID from ENVIRONMENTS
 * @param {string} enemyName - Enemy name
 * @param {number|null} bossFloor
 * @returns {number} Threat delta (can be negative)
 */
export function getEnvThreatForEnemy(envId, enemyName, bossFloor = null) {
    const profile = getEnemyProfile(enemyName, bossFloor);
    if (!profile || !profile.envAffinities) return 0;
    return profile.envAffinities[envId] || 0;
}

/**
 * Score elite modifier threat for a specific enemy using bestiary data.
 * Replaces the flat ELITE_THREATS lookup with per-enemy values.
 * @param {string} modifierId - Elite modifier ID (e.g. 'armored')
 * @param {string} enemyName - Enemy name
 * @param {number|null} bossFloor
 * @returns {number} Threat delta
 */
export function getEliteThreatForEnemy(modifierId, enemyName, bossFloor = null) {
    const profile = getEnemyProfile(enemyName, bossFloor);
    if (!profile || !profile.eliteAffinities) return 0;
    return profile.eliteAffinities[modifierId] || 0;
}
