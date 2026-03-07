// ════════════════════════════════════════════════════════════
//  ENVIRONMENT
// ════════════════════════════════════════════════════════════
export const IS_DEV = document.documentElement.classList.contains('is-dev');

// ════════════════════════════════════════════════════════════
//  GAME STATE
// ════════════════════════════════════════════════════════════
export const GS = {
    floor: 1,
    act: 1,
    hp: 50,
    maxHp: 50,
    gold: 0,
    goldSpent: 0,           // cumulative gold spent by the player this run (for Merchant's Crown)
    level: 1,
    xp: 0,
    xpNext: 30,
    dice: [],
    slots: {
        strike: [{ id: 'str-0', rune: null }, { id: 'str-1', rune: null }],
        guard:  [{ id: 'grd-0', rune: null }, { id: 'grd-1', rune: null }],
    },
    pendingRunes: [],
    passives: {},
    unlockedNodes: [],
    rerolls: 0,
    rerollsLeft: 0,
    enemy: null,
    enemiesKilled: 0,
    totalGold: 0,
    artifacts: [],
    buffs: { damageBoost: 0, armor: 0 },
    allocated: { strike: [], guard: [] },
    rolled: false,
    challengeMode: false,
    challengeDmg: 0,
    challengeTurns: 0,
    playerDebuffs: {
        poison: 0,
        disabledSlots: [],
        diceReduction: 0,
    },
    tempBuffs: {
        poisonCombats: 0,    // remaining combats that apply +1 poison per attack
        armorCombats: 0,     // remaining combats with bonus armor
        armorBonus: 0,       // flat armor bonus while armorCombats > 0
        mastersHammer: false, // die upgrades give +2/+2 for the run
        shopReduced: false,  // next shop has 50% fewer items
        voidLordWeakened: false, // Void Lord starts at 90% HP
        foresight: false,    // see 2 turns of boss intent instead of 1
        merchantEscort: false,   // +10 gold per combat, shop prices halved
    },
    transformBuffs: {
        furyChambered: 1,    // attack multiplier (starts 1, ×1.5 per Fury Chamber, stacks multiplicatively)
        fortified: 1,        // defend multiplier (starts 1, ×1.5 per Fortification, stacks)
        conduit: 0,          // extra poison per attack die per turn (2 per Conduit, additive)
        goldForge: false,    // each attack die generates gold equal to its rolled value
        thornsAura: 0,       // reflect damage per hit taken (5 per Thorns Aura, additive)
        vampiricWard: false, // heal 25% of blocked amount
    },
    ascendedDice: [],        // [{label: 'Ascended d6 (1-6)', bonus: 2}]
    enemyStatus: {
        chill: 0,            // stacks (reduces enemy ATK by this amount)
        chillTurns: 0,
        freeze: 0,           // turns remaining (skip attack)
        mark: 0,             // stacks (+X dmg from all player sources)
        markTurns: 0,
        weaken: 0,           // turns remaining (enemy deals 25% less)
        burn: 0,             // stacks (dmg/turn to enemy)
        burnTurns: 0,
        stun: 0,             // turns remaining (skip attack)
        stunCooldown: 0,     // turns remaining on stun cooldown (can't re-stun while > 0)
    },
    echoStoneDieId: null,        // id of first die allocated this turn (Echo Stone artifact)
    gamblerCoinBonus: 0,         // +2 or -1 for this combat (Gambler's Coin artifact)
    eternalPactUsed: false,      // Eternal Pact legendary: cheat-death fires once per run
    // ── CONSUMABLE INVENTORY ──
    consumables: [],             // max length = consumableSlots; null entries = empty slots
    consumableSlots: 2,
    consumableBonus: 1,          // future hook: multiplier on consumable effects
    // ── PER-COMBAT CONSUMABLE FLAGS ──
    consumableUsedThisTurn: false,
    ironSkinActive: false,
    ragePotionActive: false,
    hasteDiceBonus: 0,
    // ── ENCOUNTER / ENVIRONMENT ──
    encounter: null,          // current encounter object (set before choice screen)
    environment: null,        // active environment during combat (for hook calls)
    _chaosStormActive: false, // set by chaosStorm environment onTurnEnd
    _firstAttacker: null,     // 'player' or 'enemy' — used by narrowCorridor env
    // ── DUNGEON BLUEPRINT ──
    blueprint: null,          // complete dungeon blueprint for current run
    seed: null,               // RNG seed for reproducible runs
    // ── NCE (Non-Combat Encounter) STATE ──
    lastFloorType:  null,     // 'combat' | 'boss' | 'shop' | 'event' | null
    encounterFlags: {},       // cross-encounter continuity flags
    seenEncounters: [],       // rolling window of last 8 NCE IDs
    // ── CAMPAIGN ──
    campaign: null,           // active campaign object (set by Game.start in campaign mode)
    _loopFavor: { warpack: 0, gilded: 0, runeforged: 0, brood: 0, ironward: 0 }, // accumulated per loop
};

// ════════════════════════════════════════════════════════════
//  UTILITY
// ════════════════════════════════════════════════════════════
export const $ = id => document.getElementById(id);
export const rand = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;
export const pick = arr => arr[Math.floor(Math.random() * arr.length)];
export const shuffle = arr => [...arr].sort(() => Math.random() - 0.5);

export function pickWeighted(pool, n, getWeight) {
    const results = [];
    const remaining = [...pool];
    for (let i = 0; i < n && remaining.length > 0; i++) {
        const total = remaining.reduce((s, x) => s + getWeight(x), 0);
        let r = Math.random() * total;
        const idx = remaining.findIndex(x => { r -= getWeight(x); return r <= 0; });
        results.push(...remaining.splice(idx < 0 ? remaining.length - 1 : idx, 1));
    }
    return results;
}

export function log(msg, type = '') {
    const c = $('combat-log');
    const d = document.createElement('div');
    d.className = 'log-entry' + (type ? ' ' + type : '');
    d.textContent = msg;
    c.appendChild(d);
    c.scrollTop = c.scrollHeight;
}

export function gainXP(amount) {
    GS.xp += amount;
    log(`+${amount} XP`, 'info');
    while (GS.xp >= GS.xpNext) {
        GS.xp -= GS.xpNext;
        GS.level++;
        GS.xpNext = Math.floor(GS.xpNext * 1.4);
        GS.maxHp += 5;
        GS.hp = Math.min(GS.hp + 5, GS.maxHp);
        GS.pendingSkillPoints = (GS.pendingSkillPoints || 0) + 1;
        log(`⭐ Level ${GS.level}! +5 Max HP — Skill point available!`, 'info');
    }
    // updateStats is called by callers
}

export function gainGold(amount) {
    GS.gold += amount;
    GS.totalGold += amount;
    return amount;
}

export function spendGold(amount) {
    GS.gold -= amount;
    GS.goldSpent = (GS.goldSpent || 0) + amount;
}

export function heal(amount) {
    const mult   = GS.environment?.healingMultiplier || 1.0;
    let scaled   = Math.floor(amount * mult);
    if (GS.passives?.lifeWeave) scaled *= (GS.passives.lifeWeaveMult || 2);
    const actual = Math.min(scaled, GS.maxHp - GS.hp);
    GS.hp += actual;
    return actual;
}
