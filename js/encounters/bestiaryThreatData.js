// ════════════════════════════════════════════════════════════
//  BESTIARY THREAT DATA
//  Per-enemy threat profiles used by dungeon scoring and the
//  bestiary UI. Each entry captures how dangerous an enemy is
//  across difficulty modes and elite modifier pairings.
//
//  Fields:
//    baseThreat       — computed from the threat formula (see computeBaseThreat)
//    eliteAffinities  — per-modifier threat delta for this enemy.
//                       Replaces the flat ELITE_THREATS lookup.
//                       Positive = modifier makes this enemy harder.
//                       Negative = modifier barely matters or helps player.
//    envAffinities    — per-environment threat delta for this enemy.
//                       Replaces the ad-hoc switch in scoreEnvironmentThreat.
//    notes            — short string for bestiary display
// ════════════════════════════════════════════════════════════

// ────────────────────────────────────────────────────────────
//  Base Threat Formula
//  baseThreat = (durability × offense) / K + disruption
//
//  durability = baseHP × armorMult × evasionMult × (1 + sustainFactor)
//  offense    = avgDPS × patternMult + bypassDamage
//  disruption = additive score for sealing/decay/DoTs/etc.
//
//  K adapts to the stat magnitude to normalize across the wide range
//  of enemy stats (14 HP goblin to 450 HP boss). Mathematically:
//  K = (dur×off)^(1−P) / C, which is equivalent to:
//  baseThreat = (dur×off)^P × C + disruption
//  where P = 0.55 and C = 1.0 (regular) or 1.35 (boss).
// ────────────────────────────────────────────────────────────

/**
 * Compute baseThreat from an enemy's stats using the threat formula.
 * @param {object} enemy - Enemy template from ENEMIES or BOSSES
 * @param {boolean} [isBoss=false] - Boss fights are longer, compounding mechanics matter more
 * @returns {{ baseThreat: number, components: object }} Rounded threat + breakdown
 */
export function computeBaseThreat(enemy, isBoss = false) {
    const passives = enemy.passives || [];
    const abilities = enemy.abilities || {};
    const pattern = enemy.pattern || ['strike'];
    const dice = enemy.dice || [];

    // ── DURABILITY ──────────────────────────────────────
    const baseHP = enemy.hp;
    let armorMult = 1.0;
    let evasionMult = 1.0;
    let sustainFactor = 0;

    for (const p of passives) {
        switch (p.id) {
            case 'thickHide':
                armorMult += 0.5;
                break;
            case 'armor':
                armorMult += 0.05 * (p.params.reduction || 5);
                break;
            case 'scales':
                armorMult += 0.04 * (p.params.perSlot || 8);
                break;
            case 'brittle':
                armorMult -= 0.25;
                break;
            case 'regen':
                sustainFactor += (p.params.amount || 3) * 0.05;
                break;
            case 'lifesteal':
                sustainFactor += (p.params.percent || 0.5) * 0.5;
                break;
            case 'evasion':
                evasionMult += 0.25;
                break;
            case 'phylactery':
                sustainFactor += (p.params.revivePercent || 0.4);
                break;
            case 'mitosis':
                sustainFactor += 0.4;
                break;
            case 'bloodFrenzy':
                sustainFactor += 0.1;
                break;
            case 'greedTax':
                sustainFactor += 0.1;
                break;
            case 'engorge':
                sustainFactor += (p.params.bonusHp || 6) * 0.03 + 0.2;
                break;
            case 'reassemble':
                sustainFactor += (p.params.revivePercent || 0.5);
                break;
            case 'absorb':
                sustainFactor += 0.15;
                break;
            // soulPact, escalate, overcharge handled elsewhere
        }
    }

    // Ability-based sustain
    for (const [key, ab] of Object.entries(abilities)) {
        const freq = pattern.filter(p => p === key).length / pattern.length;
        if (ab.type === 'heal') sustainFactor += freq * 0.4;
        if (ab.type === 'shield') sustainFactor += freq * 0.3;
        // Summon snowball: longer fight + growing dice pool
        if (ab.type === 'summon_die') sustainFactor += freq * 0.8;
        // Vanish/immune turns: enemy can't be hit = effective HP multiplier
        if (ab.type === 'charge' && ab.immune) evasionMult += freq * 0.5;
    }

    // Boss phases that add dice or enable double action
    if (enemy.phases) {
        for (const phase of enemy.phases) {
            if (phase.changes.addDice) sustainFactor += 0.1 * phase.changes.addDice.length;
            if (phase.changes.doubleAction) sustainFactor += 0.15;
        }
    }

    const durability = baseHP * Math.max(0.5, armorMult) * evasionMult * (1 + sustainFactor);

    // ── OFFENSE ─────────────────────────────────────────
    const avgDieSum = dice.reduce((s, d) => s + (d + 1) / 2, 0);

    // Pattern multiplier: fraction of turns that deal damage
    const damageTypes = ['attack', 'poison', 'unblockable'];
    const damageKeys = Object.entries(abilities)
        .filter(([_, ab]) => damageTypes.includes(ab.type))
        .map(([k]) => k);
    let patternMult = pattern.filter(p => damageKeys.includes(p)).length / pattern.length;

    // Buff abilities (war cry) store damage for spike turns
    const buffKeys = Object.entries(abilities)
        .filter(([_, ab]) => ab.type === 'buff')
        .map(([k]) => k);
    if (buffKeys.length) {
        patternMult += 0.15 * (pattern.filter(p => buffKeys.includes(p)).length / pattern.length);
    }

    // Charge cycles (non-immune): doubled attack next turn, small burst bonus
    const chargeKeys = Object.entries(abilities)
        .filter(([_, ab]) => ab.type === 'charge' && !ab.immune)
        .map(([k]) => k);
    if (chargeKeys.length) {
        patternMult += 0.05 * (pattern.filter(p => chargeKeys.includes(p)).length / pattern.length);
    }

    // Multi-hit bonus: each die hits separately, harder to block
    const hasMultiHit = Object.values(abilities).some(a => a.multiHit);
    const multiHitMult = hasMultiHit ? 1.15 : 1.0;

    // Bypass damage: penetrate or unblockable
    let bypassDamage = 0;
    for (const [key, ab] of Object.entries(abilities)) {
        const freq = pattern.filter(p => p === key).length / pattern.length;
        if (ab.penetrate) bypassDamage += ab.penetrate * freq;
        // Unblockable: 60% weight since it's capped and doesn't always max roll
        if (ab.type === 'unblockable') {
            bypassDamage += Math.min(avgDieSum, ab.maxDamage || Infinity) * freq * 0.6;
        }
    }

    // Summon die: snowball offense (avg ~4 summons over a boss fight)
    let summonBonus = 0;
    for (const [key, ab] of Object.entries(abilities)) {
        if (ab.type === 'summon_die') {
            const freq = pattern.filter(p => p === key).length / pattern.length;
            summonBonus += ((ab.dieSize + 1) / 2) * freq * 4;
        }
    }

    // Escalate: gains extra dice over time
    let escalateBonus = 0;
    const escalateP = passives.find(p => p.id === 'escalate');
    if (escalateP) {
        escalateBonus += (escalateP.params.dieSize + 1) / 2 * 0.4;
    }

    // Frenzy: extra dice after taking damage (~70–85% uptime depending on duration)
    const frenzyP = passives.find(p => p.id === 'frenzy');
    if (frenzyP) {
        const avgDie = dice.length > 0 ? (dice[0] + 1) / 2 : 3.5;
        const uptime = Math.min(0.85, 0.7 + (frenzyP.params.duration || 1) * 0.075);
        escalateBonus += avgDie * (frenzyP.params.extraDice || 1) * uptime;
    }

    // Greed tax: gold theft (disruption, not offense — scored below)

    const offense = avgDieSum * patternMult * multiHitMult + bypassDamage + escalateBonus + summonBonus;

    // ── DISRUPTION ──────────────────────────────────────
    let disruption = 0;

    for (const [key, ab] of Object.entries(abilities)) {
        const freq = pattern.filter(p => p === key).length / pattern.length;

        // Curse: diceCurse (reduce dice values) or slot sealing
        if (ab.type === 'curse') {
            if (ab.diceCurse) {
                disruption += ab.diceCurse * (ab.fixedDuration || 2) * 5 * freq;
            } else {
                disruption += (ab.slotsToSeal || 1) * (ab.fixedDuration || 1) * 8 * freq;
            }
        }

        // Decay: permanently shrinks player dice — extremely disruptive
        if (ab.type === 'decay') {
            disruption += 25 * freq;
        }

        // Poison: fixed poison (spore) or dice-scaled
        if (ab.type === 'poison') {
            if (ab.fixedPoison) {
                disruption += ab.fixedPoison * (ab.fixedDuration || 2) * 1.5 * freq;
                if (ab.selfHeal) disruption += ab.selfHeal * 0.5 * freq;
            } else {
                disruption += avgDieSum * 3.0 * freq;
            }
        }

        // Burn application
        if (ab.applyBurn) {
            disruption += ab.applyBurn * 2 * freq;
        }

        // Steal (gold theft)
        if (ab.type === 'steal') {
            disruption += 3 * freq;
        }

        // Slot seal on attack abilities (wing buffet)
        if (ab.sealSlot && ab.type === 'attack') {
            disruption += ab.sealSlot * 3 * freq;
        }
    }

    // Passive disruption
    for (const p of passives) {
        if (p.id === 'soulPact') disruption += 6;
        if (p.id === 'greedTax') disruption += (p.params.goldSteal || 5) * 0.6;
        if (p.id === 'plague') disruption += (p.params.poison || 2) * (p.params.duration || 2) * 1.5;
        if (p.id === 'shiv') disruption += 4;
        if (p.id === 'gnaw') disruption += 6;
        if (p.id === 'mycotoxin') disruption += 5;
        if (p.id === 'hex') disruption += 4;
        if (p.id === 'drainMod') disruption += 3;
        if (p.id === 'devour') disruption += (p.params.count || 1) * 6;
        if (p.id === 'hellfireMod') disruption += 6;
        if (p.id === 'sunder') disruption += 4;
        if (p.id === 'boneCage') disruption += 5;
    }

    // Boss phase disruption (entropy, burn-on-phase, etc.)
    if (enemy.phases) {
        for (const phase of enemy.phases) {
            if (phase.changes.addPassives) {
                for (const pp of phase.changes.addPassives) {
                    if (pp.id === 'entropy') disruption += 22;
                    if (pp.id === 'burnOnPhase') disruption += (pp.params.burn || 2) * 5;
                }
            }
        }
    }

    // ── COMPUTE ─────────────────────────────────────────
    // baseThreat = (durability × offense) / K + disruption
    // K adapts: K = product^(1−P) / C ⟹ baseThreat = product^P × C + disruption
    const P = 0.55;
    const C = isBoss ? 1.35 : 1.0;
    const product = durability * offense;
    const K = Math.pow(product, 1 - P) / C;
    const baseThreat = Math.round(product / K + disruption);

    return {
        baseThreat,
        components: { baseHP, armorMult, evasionMult, sustainFactor, durability, avgDieSum, patternMult, multiHitMult, bypassDamage, escalateBonus, summonBonus, offense, disruption, K },
    };
}

// ────────────────────────────────────────────────────────────
//  Standard Enemy Profiles
// ────────────────────────────────────────────────────────────

export const ENEMY_PROFILES = {

    // ── UNIVERSAL ENEMIES (Acts 1–3) ─────────────────────

    'Goblin': {
        baseThreat: { 1: 17, 2: 59, 3: 200 },
        eliteAffinities: {
            deadly: 10, armored: 8, swift: 7, enraged: 10,
            regenerating: 5, vampiric: 6, brittle: -3, cursed: 6, berserker: 6,
        },
        envAffinities: {
            burningGround: -2, healingAura: 2, slipperyFloor: 0, arcaneNexus: 1,
            narrowCorridor: 2, thornsAura: 1, unstableGround: 0, consecratedGround: 5,
            voidZone: -1, bloodMoon: -2, chaosStorm: 1,
        },
        notes: 'Act 1: vanilla 3d6. Act 2: Frenzy (+1 die after hit). Act 3: Frenzy(2t) + Shiv (corrupt dice).',
    },

    'Dire Rat': {
        baseThreat: { 1: 16, 2: 60, 3: 202 },
        eliteAffinities: {
            deadly: 8, armored: 9, swift: 8, enraged: 10,
            regenerating: 4, vampiric: 7, brittle: -3, cursed: 5, berserker: 5,
        },
        envAffinities: {
            burningGround: -3, healingAura: 2, slipperyFloor: -1, arcaneNexus: 0,
            narrowCorridor: 2, thornsAura: 3, unstableGround: -1, consecratedGround: 4,
            voidZone: -3, bloodMoon: -2, chaosStorm: 0,
        },
        notes: 'Multi-hit swarm. Act 2: Plague (poison on hit). Act 3: Plague(3,3t) + Gnaw (locks dice).',
    },

    'Fungal Creep': {
        baseThreat: { 1: 18, 2: 57, 3: 195 },
        eliteAffinities: {
            deadly: 12, armored: 9, swift: 8, enraged: 14,
            regenerating: 10, vampiric: 6, brittle: -2, cursed: 10, berserker: 6,
        },
        envAffinities: {
            burningGround: -2, healingAura: 5, slipperyFloor: -1, arcaneNexus: 1,
            narrowCorridor: 3, thornsAura: 1, unstableGround: 0, consecratedGround: 5,
            voidZone: -2, bloodMoon: -2, chaosStorm: 1,
        },
        notes: 'Poison utility. Act 2: Sporadic (poison+heal). Act 3: Mycotoxin (poison ticks shrink dice).',
    },

    'Slime': {
        baseThreat: { 1: 16, 2: 59, 3: 194 },
        eliteAffinities: {
            deadly: 11, armored: 10, swift: 8, enraged: 14,
            regenerating: 10, vampiric: 6, brittle: -2, cursed: 8, berserker: 7,
        },
        envAffinities: {
            burningGround: -1, healingAura: 5, slipperyFloor: -1, arcaneNexus: 1,
            narrowCorridor: 2, thornsAura: 1, unstableGround: 1, consecratedGround: 5,
            voidZone: -2, bloodMoon: -2, chaosStorm: 2,
        },
        notes: 'Tank. Act 1: vanilla 2d6. Act 2: Engorge (HP+heal). Act 3: Engorge(2t) + Absorb (+die face).',
    },

    'Skeleton': {
        baseThreat: { 1: 15, 2: 58, 3: 210 },
        eliteAffinities: {
            deadly: 8, armored: 14, swift: 7, enraged: 10,
            regenerating: 8, vampiric: 7, brittle: -5, cursed: 7, berserker: 6,
        },
        envAffinities: {
            burningGround: -2, healingAura: 1, slipperyFloor: 0, arcaneNexus: 2,
            narrowCorridor: 2, thornsAura: 1, unstableGround: -1, consecratedGround: -8,
            voidZone: -1, bloodMoon: -2, chaosStorm: 1,
        },
        notes: 'Act 1: Brittle (tall builds rewarded). Act 2: Reassemble (revive 50%). Act 3: Reassemble+die + Bone Cage.',
    },

    'Dark Mage': {
        baseThreat: { 1: 16, 2: 57, 3: 201 },
        eliteAffinities: {
            deadly: 14, armored: 12, swift: 10, enraged: 18,
            regenerating: 8, vampiric: 10, brittle: -3, cursed: 18, berserker: 12,
        },
        envAffinities: {
            burningGround: -2, healingAura: 2, slipperyFloor: 0, arcaneNexus: 4,
            narrowCorridor: 4, thornsAura: -1, unstableGround: 0, consecratedGround: 5,
            voidZone: 1, bloodMoon: -2, chaosStorm: 1,
        },
        notes: 'Glass cannon. Act 1: vanilla 2d10. Act 2: Bolt(pen 5) + Curse(-1 dice). Act 3: Curse(-2,3t) + Hex.',
    },

    'Orc Warrior': {
        baseThreat: { 1: 17, 2: 62, 3: 219 },
        eliteAffinities: {
            deadly: 16, armored: 14, swift: 11, enraged: 20,
            regenerating: 9, vampiric: 12, brittle: -2, cursed: 14, berserker: 15,
        },
        envAffinities: {
            burningGround: 1, healingAura: 3, slipperyFloor: 0, arcaneNexus: 5,
            narrowCorridor: 3, thornsAura: 2, unstableGround: 1, consecratedGround: 5,
            voidZone: 1, bloodMoon: -2, chaosStorm: 1,
        },
        notes: 'Bruiser. Act 1: vanilla 2d8. Act 2: War Cry (+1 die 2t). Act 3: War Cry(+2,2t) + Sunder.',
    },

    'Troll': {
        baseThreat: { 1: 17, 2: 58, 3: 205 },
        eliteAffinities: {
            deadly: 14, armored: 18, swift: 10, enraged: 16,
            regenerating: 16, vampiric: 14, brittle: 0, cursed: 12, berserker: 12,
        },
        envAffinities: {
            burningGround: 3, healingAura: 6, slipperyFloor: 1, arcaneNexus: 5,
            narrowCorridor: 3, thornsAura: 2, unstableGround: 1, consecratedGround: 5,
            voidZone: 3, bloodMoon: 12, chaosStorm: 1,
        },
        notes: 'Healing wall. Act 1: vanilla tank. Act 2: Regen(3) + heal. Act 3: Regen(5) + Thick Hide + heal.',
    },

    'Vampire': {
        baseThreat: { 1: 15, 2: 60, 3: 215 },
        eliteAffinities: {
            deadly: 16, armored: 12, swift: 11, enraged: 18,
            regenerating: 14, vampiric: 2, brittle: -3, cursed: 14, berserker: 16,
        },
        envAffinities: {
            burningGround: -1, healingAura: 4, slipperyFloor: 0, arcaneNexus: 5,
            narrowCorridor: 3, thornsAura: -2, unstableGround: 0, consecratedGround: 5,
            voidZone: 0, bloodMoon: 14, chaosStorm: 0,
        },
        notes: 'Sustain. Act 1: vanilla. Act 2: Lifesteal(50%). Act 3: Lifesteal(75%) + Drain (sets die to 1).',
    },

    'Mimic': {
        baseThreat: { 1: 15, 2: 59, 3: 200 },
        eliteAffinities: {
            deadly: 11, armored: 9, swift: 9, enraged: 14,
            regenerating: 7, vampiric: 8, brittle: -3, cursed: 9, berserker: 9,
        },
        envAffinities: {
            burningGround: -1, healingAura: 2, slipperyFloor: 0, arcaneNexus: 3,
            narrowCorridor: 2, thornsAura: 1, unstableGround: 0, consecratedGround: 5,
            voidZone: 0, bloodMoon: -2, chaosStorm: 1,
        },
        notes: 'Utility. Act 1: vanilla. Act 2: Greed Tax (steal gold). Act 3: Greed Tax(8g) + Devour (swallow die).',
    },

    // ── SPECIALIST ENEMIES (Acts 2–3) ────────────────────

    'Demon': {
        baseThreat: { 2: 64, 3: 225 },
        eliteAffinities: {
            deadly: 18, armored: 16, swift: 14, enraged: 22,
            regenerating: 12, vampiric: 15, brittle: -2, cursed: 16, berserker: 16,
        },
        envAffinities: {
            burningGround: 3, healingAura: 5, slipperyFloor: 1, arcaneNexus: 6,
            narrowCorridor: 4, thornsAura: 3, unstableGround: 2, consecratedGround: 6,
            voidZone: 3, bloodMoon: -2, chaosStorm: 2,
        },
        notes: 'Hellfire (unblockable) + Soul Pact. Act 3: Hellfire Corruption (corrupt player dice on hit).',
    },

    'Lich': {
        baseThreat: { 2: 64, 3: 220 },
        eliteAffinities: {
            deadly: 18, armored: 16, swift: 12, enraged: 20,
            regenerating: 14, vampiric: 14, brittle: -1, cursed: 18, berserker: 14,
        },
        envAffinities: {
            burningGround: 2, healingAura: 4, slipperyFloor: 1, arcaneNexus: 5,
            narrowCorridor: 3, thornsAura: 2, unstableGround: 2, consecratedGround: -8,
            voidZone: 3, bloodMoon: -2, chaosStorm: 2,
        },
        notes: 'UNDEAD. Act 2: Phylactery(50%). Act 3: Phylactery(75%) + Decay. Consecrated Ground hard counter.',
    },

    'Dragon Whelp': {
        baseThreat: { 2: 68, 3: 236 },
        eliteAffinities: {
            deadly: 20, armored: 18, swift: 14, enraged: 24,
            regenerating: 14, vampiric: 16, brittle: -1, cursed: 16, berserker: 16,
        },
        envAffinities: {
            burningGround: 3, healingAura: 5, slipperyFloor: 1, arcaneNexus: 6,
            narrowCorridor: 4, thornsAura: 3, unstableGround: 2, consecratedGround: 6,
            voidZone: 3, bloodMoon: -2, chaosStorm: -1,
        },
        notes: 'Bruiser. Charge (immune + double next). Act 3: Dragon Scales (8 per-slot ignore). Highest Act 2 threat.',
    },

    'Shadow Assassin': {
        baseThreat: { 2: 61, 3: 216 },
        eliteAffinities: {
            deadly: 16, armored: 12, swift: 12, enraged: 20,
            regenerating: 10, vampiric: 12, brittle: -2, cursed: 14, berserker: 14,
        },
        envAffinities: {
            burningGround: 2, healingAura: 3, slipperyFloor: 1, arcaneNexus: 5,
            narrowCorridor: 4, thornsAura: -1, unstableGround: 1, consecratedGround: 6,
            voidZone: 3, bloodMoon: -2, chaosStorm: 1,
        },
        notes: 'Glass cannon. Vanish (immune + double). Act 3: shorter pattern + Evasion (ignore 1 die/turn).',
    },

    'Iron Golem': {
        baseThreat: { 2: 60, 3: 212 },
        eliteAffinities: {
            deadly: 18, armored: 20, swift: 12, enraged: 18,
            regenerating: 16, vampiric: 14, brittle: 2, cursed: 16, berserker: 14,
        },
        envAffinities: {
            burningGround: 3, healingAura: 6, slipperyFloor: 1, arcaneNexus: 5,
            narrowCorridor: 3, thornsAura: 3, unstableGround: 2, consecratedGround: 6,
            voidZone: 2, bloodMoon: -2, chaosStorm: 2,
        },
        notes: 'Tank. Act 2: Armor(2). Act 3: Armor(3) + Escalate (+1d8 every 3t). Armor + armored elite = brutal.',
    },
};

// ────────────────────────────────────────────────────────────
//  Boss Profiles
// ────────────────────────────────────────────────────────────

export const BOSS_PROFILES = {

    5: {   // The Bone King
        baseThreat: 59,   // formula (boss C=1.35): dur=108 (summon +0.2, shield +0.08) × off=8.8
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
        baseThreat: 183,  // formula (boss C=1.35): dur=300 (phase +0.2) × off=22, disruption=12.3
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
        baseThreat: 420,  // HP 700, Void Aura from turn 1, Void Drain lifesteal sustain, Entropy at 50%
        eliteAffinities: {
            deadly:     38,
            enraged:    48,   // d10→d16 with double action at 20% = potential wipe
            phasing:    40,   // 450 HP + 50% resist + entropy
            timewarped: 35,   // entropy phase at 75%, double action at 45%
            armored:    36,   // 450 HP + armor; entropy erodes player dice
        },
        envAffinities: {
            burningGround:     3,
            healingAura:       7,   // Void Drain + healing aura = high sustain
            slipperyFloor:     1,
            arcaneNexus:       6,
            narrowCorridor:    4,
            thornsAura:        3,
            unstableGround:    2,
            consecratedGround: 6,
            voidZone:          5,   // player dice lose low values; Void Aura compounds
            bloodMoon:        -2,
            chaosStorm:        2,
        },
        notes: 'Void Aura drains 1 die/turn from start; upgrades to full Entropy at 50%. Void Drain heals from damage dealt. Double-action at 20% HP is lethal.',
    },
};

// ────────────────────────────────────────────────────────────
//  Lookup Helpers
// ────────────────────────────────────────────────────────────

/**
 * Get the threat profile for an enemy or boss.
 * When act is provided, resolves per-act baseThreat to a single number.
 * @param {string} enemyName - Enemy name from constants.js (e.g. 'Troll')
 * @param {number|null} bossFloor - Boss floor number (5, 10, 15) or null for regular enemies
 * @param {number|null} [act] - Act number (1, 2, or 3) for per-act baseThreat resolution
 * @returns {object|null} Profile with baseThreat, eliteAffinities, envAffinities, notes
 */
export function getEnemyProfile(enemyName, bossFloor = null, act = null) {
    if (bossFloor) return BOSS_PROFILES[bossFloor] || null;
    const profile = ENEMY_PROFILES[enemyName];
    if (!profile) return null;
    // Resolve per-act baseThreat when act is specified
    if (act && typeof profile.baseThreat === 'object') {
        return { ...profile, baseThreat: profile.baseThreat[act] || 0 };
    }
    return profile;
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
