// ════════════════════════════════════════════════════════════
//  GAME STATE
// ════════════════════════════════════════════════════════════
export const GS = {
    floor: 1,
    act: 1,
    hp: 50,
    maxHp: 50,
    gold: 0,
    level: 1,
    xp: 0,
    xpNext: 50,
    dice: [],
    slots: { attack: 2, defend: 2 },
    runes: { attack: [], defend: [] },
    passives: {},
    unlockedNodes: [],
    rerolls: 0,
    rerollsLeft: 0,
    enemy: null,
    enemiesKilled: 0,
    totalGold: 0,
    artifacts: [],
    buffs: { damageBoost: 0, armor: 0 },
    allocated: { attack: [], defend: [] },
    rolled: false,
    challengeMode: false,
    challengeDmg: 0,
    challengeTurns: 0,
};

// ════════════════════════════════════════════════════════════
//  UTILITY
// ════════════════════════════════════════════════════════════
export const $ = id => document.getElementById(id);
export const rand = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;
export const pick = arr => arr[Math.floor(Math.random() * arr.length)];
export const shuffle = arr => [...arr].sort(() => Math.random() - 0.5);

export function log(msg, type = '') {
    const c = $('combat-log');
    const d = document.createElement('div');
    d.className = 'log-entry' + (type ? ' ' + type : '');
    d.textContent = msg;
    c.appendChild(d);
    c.scrollTop = c.scrollHeight;
}

export function gainXP(amount) {
    const xpMult = GS.artifacts.filter(a => a.effect === 'xpMult').reduce((s, a) => s + a.value, 0);
    amount = Math.floor(amount * (1 + xpMult));
    GS.xp += amount;
    log(`+${amount} XP`, 'info');
    while (GS.xp >= GS.xpNext) {
        GS.xp -= GS.xpNext;
        GS.level++;
        GS.xpNext = Math.floor(GS.xpNext * 1.25);
        GS.maxHp += 5;
        GS.hp = Math.min(GS.hp + 5, GS.maxHp);
        GS.pendingSlotChoice = true;
        log(`⭐ Level ${GS.level}! +5 Max HP — Skill point available!`, 'info');
    }
    // updateStats is called by callers
}

export function gainGold(amount) {
    const goldMult = GS.artifacts.filter(a => a.effect === 'goldMult').reduce((s, a) => s + a.value, 0);
    amount = Math.floor(amount * (1 + goldMult));
    GS.gold += amount;
    GS.totalGold += amount;
    return amount;
}

export function heal(amount) {
    const actual = Math.min(amount, GS.maxHp - GS.hp);
    GS.hp += actual;
    return actual;
}
