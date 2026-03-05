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
            deadly:      { 1:  5, 2: 18, 3:  60 },
            armored:     { 1:  5, 2: 18, 3:  60 },
            swift:       { 1:  3, 2: 10, 3:  35 },
            enraged:     { 1:  5, 2: 19, 3:  64 },
            regenerating:{ 1:  4, 2: 14, 3:  48 },
            vampiric:    { 1:  3, 2: 10, 3:  36 },
            brittle:     { 1: -3, 2: -9, 3: -30 },
            cursed:      { 1:  4, 2: 13, 3:  44 },
            berserker:   { 1:  5, 2: 18, 3:  60 },
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
            deadly:      { 1:  5, 2: 18, 3:  61 },
            armored:     { 1:  5, 2: 18, 3:  60 },
            swift:       { 1:  4, 2: 13, 3:  44 },
            enraged:     { 1:  5, 2: 19, 3:  65 },
            regenerating:{ 1:  4, 2: 14, 3:  48 },
            vampiric:    { 1:  3, 2: 11, 3:  38 },
            brittle:     { 1: -3, 2: -9, 3: -30 },
            cursed:      { 1:  4, 2: 13, 3:  44 },
            berserker:   { 1:  5, 2: 18, 3:  61 },
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
            deadly:      { 1:  5, 2: 16, 3:  55 },
            armored:     { 1:  5, 2: 17, 3:  58 },
            swift:       { 1:  4, 2: 11, 3:  39 },
            enraged:     { 1:  6, 2: 18, 3:  63 },
            regenerating:{ 1:  6, 2: 20, 3:  68 },
            vampiric:    { 1:  3, 2: 10, 3:  35 },
            brittle:     { 1: -2, 2: -8, 3: -29 },
            cursed:      { 1:  4, 2: 14, 3:  49 },
            berserker:   { 1:  5, 2: 16, 3:  55 },
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
            deadly:      { 1:  5, 2: 17, 3:  54 },
            armored:     { 1:  6, 2: 21, 3:  68 },
            swift:       { 1:  3, 2: 10, 3:  35 },
            enraged:     { 1:  5, 2: 18, 3:  62 },
            regenerating:{ 1:  5, 2: 19, 3:  62 },
            vampiric:    { 1:  3, 2: 10, 3:  35 },
            brittle:     { 1: -2, 2: -9, 3: -29 },
            cursed:      { 1:  4, 2: 17, 3:  54 },
            berserker:   { 1:  5, 2: 18, 3:  58 },
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
            deadly:      { 1:  4, 2: 16, 3:  59 },
            armored:     { 1:  4, 2: 17, 3:  63 },
            swift:       { 1:  3, 2: 10, 3:  38 },
            enraged:     { 1:  5, 2: 17, 3:  60 },
            regenerating:{ 1:  5, 2: 19, 3:  67 },
            vampiric:    { 1:  3, 2: 10, 3:  38 },
            brittle:     { 1: -2, 2: -9, 3: -32 },
            cursed:      { 1:  4, 2: 14, 3:  48 },
            berserker:   { 1:  5, 2: 17, 3:  59 },
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
            deadly:      { 1:  3, 2: 11, 3:  40 },
            armored:     { 1:  4, 2: 14, 3:  50 },
            swift:       { 1:  3, 2:  9, 3:  32 },
            enraged:     { 1:  4, 2: 14, 3:  50 },
            regenerating:{ 1:  3, 2: 11, 3:  40 },
            vampiric:    { 1:  3, 2: 11, 3:  40 },
            brittle:     { 1: -2, 2: -8, 3: -30 },
            cursed:      { 1:  6, 2: 20, 3:  70 },
            berserker:   { 1:  4, 2: 14, 3:  50 },
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
            deadly:      { 1:  6, 2: 21, 3:  74 },
            armored:     { 1:  5, 2: 19, 3:  66 },
            swift:       { 1:  4, 2: 12, 3:  44 },
            enraged:     { 1:  6, 2: 24, 3:  83 },
            regenerating:{ 1:  4, 2: 15, 3:  53 },
            vampiric:    { 1:  5, 2: 17, 3:  61 },
            brittle:     { 1: -2, 2: -9, 3: -33 },
            cursed:      { 1:  5, 2: 20, 3:  70 },
            berserker:   { 1:  6, 2: 24, 3:  83 },
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
            deadly:      { 1:  5, 2: 16, 3:  57 },
            armored:     { 1:  7, 2: 23, 3:  82 },
            swift:       { 1:  4, 2: 12, 3:  41 },
            enraged:     { 1:  5, 2: 17, 3:  62 },
            regenerating:{ 1:  8, 2: 26, 3:  92 },
            vampiric:    { 1:  5, 2: 19, 3:  66 },
            brittle:     { 1: -1, 2: -3, 3: -10 },
            cursed:      { 1:  4, 2: 16, 3:  56 },
            berserker:   { 1:  6, 2: 20, 3:  72 },
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
            deadly:      { 1:  4, 2: 15, 3:  54 },
            armored:     { 1:  5, 2: 18, 3:  65 },
            swift:       { 1:  3, 2: 10, 3:  37 },
            enraged:     { 1:  5, 2: 19, 3:  69 },
            regenerating:{ 1:  5, 2: 18, 3:  65 },
            vampiric:    { 1:  1, 2:  3, 3:  11 },
            brittle:     { 1: -2, 2: -9, 3: -32 },
            cursed:      { 1:  5, 2: 18, 3:  65 },
            berserker:   { 1:  5, 2: 21, 3:  75 },
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
            deadly:      { 1:  4, 2: 15, 3:  50 },
            armored:     { 1:  5, 2: 18, 3:  60 },
            swift:       { 1:  3, 2: 10, 3:  35 },
            enraged:     { 1:  5, 2: 17, 3:  60 },
            regenerating:{ 1:  4, 2: 14, 3:  48 },
            vampiric:    { 1:  3, 2: 10, 3:  36 },
            brittle:     { 1: -2, 2: -9, 3: -30 },
            cursed:      { 1:  4, 2: 14, 3:  50 },
            berserker:   { 1:  5, 2: 18, 3:  60 },
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
            deadly:      { 2: 14, 3:  50 },
            armored:     { 2: 19, 3:  68 },
            swift:       { 2: 11, 3:  38 },
            enraged:     { 2: 16, 3:  58 },
            regenerating:{ 2: 16, 3:  56 },
            vampiric:    { 2: 19, 3:  68 },
            brittle:     { 2:-10, 3: -34 },
            cursed:      { 2: 19, 3:  68 },
            berserker:   { 2: 19, 3:  68 },
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
            deadly:      { 2: 13, 3:  44 },
            armored:     { 2: 19, 3:  66 },
            swift:       { 2: 10, 3:  35 },
            enraged:     { 2: 12, 3:  40 },
            regenerating:{ 2: 16, 3:  55 },
            vampiric:    { 2: 13, 3:  44 },
            brittle:     { 2:-10, 3: -33 },
            cursed:      { 2: 20, 3:  70 },
            berserker:   { 2: 16, 3:  55 },
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
            deadly:      { 2: 22, 3:  76 },
            armored:     { 2: 24, 3:  83 },
            swift:       { 2: 12, 3:  42 },
            enraged:     { 2: 29, 3:  99 },
            regenerating:{ 2: 20, 3:  71 },
            vampiric:    { 2: 20, 3:  71 },
            brittle:     { 2: -8, 3: -28 },
            cursed:      { 2: 17, 3:  59 },
            berserker:   { 2: 27, 3:  94 },
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
            deadly:      { 2: 17, 3:  61 },
            armored:     { 2: 21, 3:  76 },
            swift:       { 2: 11, 3:  39 },
            enraged:     { 2: 18, 3:  65 },
            regenerating:{ 2: 15, 3:  54 },
            vampiric:    { 2: 12, 3:  43 },
            brittle:     { 2: -9, 3: -32 },
            cursed:      { 2: 18, 3:  65 },
            berserker:   { 2: 19, 3:  65 },
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
            deadly:      { 2: 17, 3:  59 },
            armored:     { 2: 27, 3:  95 },
            swift:       { 2: 10, 3:  36 },
            enraged:     { 2: 18, 3:  64 },
            regenerating:{ 2: 18, 3:  62 },
            vampiric:    { 2: 16, 3:  57 },
            brittle:     { 2:  1, 3:   4 },
            cursed:      { 2: 18, 3:  64 },
            berserker:   { 2: 18, 3:  64 },
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
            deadly:     24,   // +4d upgrade + HP×1.4; raiseDead snowballs with bigger dice
            enraged:    30,   // +6d upgrade; fastest-growing dice pool in Act 1
            phasing:    27,   // 50% resist alternating + bone wall = tanky; HP×1.5
            timewarped: 21,   // earlier phases = faster raiseDead cycle
            armored:    25,   // bone wall + armor = stacking reduction; HP×1.6
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
            deadly:     70,   // +4d upgrade + HP×1.4; fire breath dice jump dramatically
            enraged:    82,   // +6d upgrade; Inferno Phase burn scales with bigger dice
            phasing:    77,   // 300 HP + 50% resist = 600 effective HP; HP×1.5
            timewarped: 70,   // Inferno Phase at 75% HP instead of 50% = extended burn window
            armored:    73,   // 300 HP + armor(4) = enormous wall
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
            deadly:    147,   // +4d upgrade + HP×1.4; Void Drain heals more per hit
            enraged:   176,   // +6d upgrade; double action at 20% with d16 pool = potential wipe
            phasing:   168,   // 700→1050 HP + 50% resist + Entropy = near-unkillable
            timewarped:168,   // Entropy at 75%, double action at 45%; extended endgame pressure
            armored:   160,   // 700→1120 HP + armor(4); Entropy still erodes player dice
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
 * Regular enemies use per-act affinity dicts ({ 1: N, 2: N, 3: N });
 * bosses use flat numbers (one appearance each, no act ambiguity).
 * @param {string} modifierId - Elite modifier ID (e.g. 'armored')
 * @param {string} enemyName - Enemy name
 * @param {number|null} bossFloor - Boss floor (5/10/15) or null
 * @param {number|null} [act] - Act number (1/2/3) for per-act resolution
 * @returns {number} Threat delta
 */
export function getEliteThreatForEnemy(modifierId, enemyName, bossFloor = null, act = null) {
    const profile = getEnemyProfile(enemyName, bossFloor);
    if (!profile || !profile.eliteAffinities) return 0;
    const affinity = profile.eliteAffinities[modifierId];
    if (affinity == null) return 0;
    // Boss affinities are flat numbers; regular enemy affinities are per-act dicts
    if (typeof affinity === 'object' && act) return affinity[act] ?? 0;
    if (typeof affinity === 'number') return affinity;
    return 0;
}
