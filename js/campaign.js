// ════════════════════════════════════════════════════════════
//  CAMPAIGN — Persistent meta-progression (Ancient Order theme)
//  Tracks player rank and achievement unlocks across all runs.
//  Separate from RunHistory; gates content by rank.
// ════════════════════════════════════════════════════════════

const CAMPAIGN_KEY = 'diceDungeon_v1_campaign';

// ── Orders ───────────────────────────────────────────────────

export const ORDERS = ['warpack', 'gilded', 'runeforged', 'brood', 'ironward'];

const LOOP_DIFFICULTIES = ['casual', 'standard', 'heroic'];

// ── Tier thresholds (per Order) ───────────────────────────────
// Index 0 = Tier 1, 1 = Tier 2, 2 = Tier 3.
// Thresholds calibrated for difficulty-scaled baseThreat:
// Loop 1 (Casual) generates ~76% of Standard threat, Loop 3 (Heroic) ~121%.
// Tier 1 reduced ~27% to ensure crossing by Loop 1 end.
// Tier 2/3 reduced ~15-17% — Loops 2-3 partially/fully compensate via higher scaling.
const ORDER_TIERS = {
    warpack:    [2200,  7500, 15000],
    gilded:     [2200,  7000, 13500],
    runeforged: [2200,  7000, 14000],
    brood:      [1500,  5000, 10000],
    ironward:   [2200,  7500, 15000],
};

// ── Tier node enhancements ────────────────────────────────────
// Applied to GS.passives at dungeon start based on favor tiers.
// { tierIdx: 0-2, nodeId, passiveKey, value, extra? }
const TIER_NODE_ENHANCEMENTS = {
    warpack: [
        { tierIdx: 0, nodeId: 'w_b', passiveKey: 'packTactics',    value: 2 },
        { tierIdx: 1, nodeId: 'w_d', passiveKey: 'volleyThreshold', value: 3 },
        { tierIdx: 2, nodeId: 'w_n', passiveKey: 'swarmMaster',     value: 3 },
    ],
    gilded: [
        { tierIdx: 0, nodeId: 'g_a', passiveKey: 'goldPerCombat',   value: 7 },
        { tierIdx: 1, nodeId: 'g_d', passiveKey: 'goldInterest',     value: 0.18 },
        { tierIdx: 2, nodeId: 'g_n', passiveKey: 'goldDmg',          value: 6 },
    ],
    runeforged: [
        { tierIdx: 0, nodeId: 't_c', passiveKey: 'thresholdValue',   value: 10 },
        { tierIdx: 1, nodeId: 't_n', passiveKey: 'runeforgerSlotCap', value: 4 },
        { tierIdx: 2, nodeId: 't_d', passiveKey: 'amplifyGrantsTitan', value: true },
    ],
    brood: [
        { tierIdx: 0, nodeId: 'v_b', passiveKey: 'poisonOnAtk',     value: 2 },
        { tierIdx: 1, nodeId: 'v_n', passiveKey: 'plagueLordMult',   value: 3 },
        { tierIdx: 2, nodeId: 'v_c', passiveKey: 'rerollDmg',        value: 4, extra: { rerollPoison: 1 } },
    ],
    ironward: [
        { tierIdx: 0, nodeId: 'h_a', passiveKey: '_fortifyBoost',    value: 10 },  // extra 10 HP above base 15
        { tierIdx: 1, nodeId: 'h_b', passiveKey: 'postCombatRecovery', value: 0.35 },
        { tierIdx: 2, nodeId: 'h_n', passiveKey: 'lifeWeaveMult',    value: 3 },
    ],
};

// ── Narrative texts ───────────────────────────────────────────

const ORDER_INTERACTIONS = {
    warpack: [
        "Word of your campaigns has reached the Warpack's outriders. They've begun marking your kills alongside their own.",
        "A Warpack banner appears outside your camp one morning. No note. Just the pack's mark, and a sharpened blade left at the foot.",
        "The Warpack's elder sends a runner. The message is brief: 'Run with us. The hunt calls.'",
    ],
    gilded: [
        "A sealed letter arrives. Inside, a small coin and a note: 'We noticed. We always notice.'",
        "The merchant at the crossroads gives you a knowing look. 'Your credit is good here,' he says. 'The Hand sees to it.'",
        "A ledger arrives bearing the Gilded Hand's watermark. Your name is listed as a preferred client — and as a contractor.",
    ],
    runeforged: [
        "A diagram appears among your gear — unsigned, precise. Someone has mapped the resonance between your dice.",
        "The forge at the waystation is already hot when you arrive. 'We expected you,' says the smith. She doesn't elaborate.",
        "The Runeforged send no emissary. They send a rune — carved, not cast — etched with a pattern you've never seen. You understand it anyway.",
    ],
    brood: [
        "Something has been following you. You feel it at the edge of your vision. It hasn't attacked. It's studying.",
        "You wake to find a cluster of spores arranged at your bedside. A gift, or a test. You're not sure which.",
        "The rot in the deep places no longer feels hostile. It feels familiar. You wonder when that changed.",
    ],
    ironward: [
        "A veteran approaches after your victory. She studies your wounds, then nods. 'You endure. That is enough.'",
        "The Ironward's sigil appears carved into the stone above your camp entrance. You didn't put it there.",
        "An old shield is left at your door. No name. No mark beyond the Ironward's crest. It fits your arm exactly.",
    ],
};

const SYNERGY_INTERACTIONS = {
    'warpack+ironward':   "The Ironward and the Warpack rarely acknowledge the same fighter. Lately, both have been quiet about you.",
    'brood+ironward':     "Something in the deep places has begun to heal. You are not sure if it is the Brood's gift or the Ironward's — or whether the distinction matters.",
    'gilded+warpack':     "The Gilded Hand has begun routing supply lines through Warpack territory. Coincidentally, they always seem to arrive the day before you do.",
    'brood+runeforged':   "A rune surfaces on your die that you didn't place. It smells of spores. The Runeforged would disapprove, if they hadn't designed it.",
    'gilded+ironward':    "The Chalice has a new patron. The Gilded Hand's coin buys more healing than it should. Someone is subsidising the exchange.",
    'warpack+runeforged': "The Warpack's scouts have started carrying dice. The Runeforged sent diagrams — the Warpack sent back a tooth. An arrangement has been reached.",
    'gilded+runeforged':  "A ledger entry arrives: 'Consulting fee — resonance enhancement.' The Gilded Hand has found a way to monetise the Runeforged's craft.",
    'brood+warpack':      "The kills smell different now. Something rides the rage. The Warpack calls it fury. The Brood calls it harvest.",
    'gilded+brood':       "Poison is, in the end, a transaction. Someone in the Gilded Hand has started valuing it accordingly.",
    'ironward+runeforged':"The lens turns, and for a moment you see clearly. Then it heals. The Runeforged note this. The Ironward designed it that way.",
};

const ATMOSPHERIC_BEATS = [
    "You make camp in the silence after. The fire takes hold slowly. Tonight, nothing demands your attention.",
    "Rain falls. The dungeon recedes behind you. For a while, there is only the sound of water on stone.",
    "Your allies are quiet. So is the road ahead. You check your gear and rest.",
    "The stars tonight are very clear. You don't know their names. It doesn't matter.",
    "The body knows what the mind is slow to accept. You sleep, and the ache ebbs.",
];

// ── Campaign Codex — in-world Order lore ─────────────────────

export const ORDER_CODEX = [
    {
        key: 'warpack',
        name: 'The Warpack',
        lore: 'The Warpack does not recruit. It recognises. Those who fight with numbers, who trust the swarm over the singular blow, find themselves running alongside outriders they never met. The Warpack respects aggression not as chaos, but as method. They count their own alongside yours.',
    },
    {
        key: 'gilded',
        name: 'The Gilded Hand',
        lore: 'The Gilded Hand sees everything as leverage. Gold is not wealth to them — it is language. Those who speak it fluently, who understand that wealth applied in the right moment is indistinguishable from power, earn their notice. Their favour is never announced. It simply arrives.',
    },
    {
        key: 'runeforged',
        name: 'The Runeforged',
        lore: 'The Runeforged believe that a die is a tool, and a tool improperly understood is waste. They study those who treat their dice as instruments rather than chance. Precision, enhancement, mastery over the face — these are their values. They communicate in diagrams.',
    },
    {
        key: 'brood',
        name: 'The Brood',
        lore: 'The Brood does not explain itself. It watches those who use decay as a strategy, who understand that rot is patient and patient things win. Their gifts are indistinguishable from warnings. If you survive what they send, they consider the matter settled.',
    },
    {
        key: 'ironward',
        name: 'The Ironward',
        lore: 'The Ironward respects one thing above all others: the willingness to be hit and to stand again. They are not healers. They are witnesses. Those who invest in their own survival, who treat their HP as a resource worth protecting, earn the Ironward\'s quiet attention.',
    },
];

// ── Legacy stubs (kept for screens.js compatibility) ──────────
// Reworked in Phase 9 — CampaignScreen no longer uses RANKS/ACHIEVEMENTS.

// ── Rank definitions ─────────────────────────────────────────
// Each rank lists which difficulties are available.
export const RANKS = [
    {
        id: 'outsider',
        title: 'The Outsider',
        flavour: 'You stand before the dungeon gate, uninitiated.',
        unlockedDifficulties: ['casual'],
    },
    {
        id: 'descended',
        title: 'The Descended',
        flavour: 'You have touched the dungeon\'s shadow. The Order watches.',
        unlockedDifficulties: ['casual'],
    },
    {
        id: 'initiate',
        title: 'Initiate of the Order',
        flavour: 'You have proven your worth. The deeper paths are open to you.',
        unlockedDifficulties: ['casual', 'standard'],
    },
    {
        id: 'acolyte',
        title: 'The Acolyte',
        flavour: 'Few survive the Standard rites. The final gauntlet now awaits.',
        unlockedDifficulties: ['casual', 'standard', 'heroic'],
    },
    {
        id: 'adept',
        title: 'The Adept',
        flavour: 'The Order recognises no greater trial. You are its keeper.',
        unlockedDifficulties: ['casual', 'standard', 'heroic'],
    },
];

// ── Achievement definitions ───────────────────────────────────
// check(runData) → true when this achievement should be granted.
export const ACHIEVEMENTS = [
    {
        id: 'first_descent',
        title: 'First Descent',
        description: 'Complete your first dungeon run.',
        grantsRank: 1,
        check: (_runData) => true,   // any completed run qualifies
    },
    {
        id: 'casual_victory',
        title: 'Marked by Shadows',
        description: 'Conquer the Casual dungeon.',
        grantsRank: 2,
        check: (runData) => runData.outcome === 'victory' && runData.difficulty === 'casual',
    },
    {
        id: 'standard_victory',
        title: 'Ordained by Flame',
        description: 'Conquer the Standard dungeon.',
        grantsRank: 3,
        check: (runData) => runData.outcome === 'victory' && runData.difficulty === 'standard',
    },
    {
        id: 'heroic_victory',
        title: 'Keeper of the Deep',
        description: 'Conquer the Heroic dungeon.',
        grantsRank: 4,
        check: (runData) => runData.outcome === 'victory' && runData.difficulty === 'heroic',
    },
];

// ── Campaign object ───────────────────────────────────────────
export const Campaign = {

    // ── Persistence ──────────────────────────────────────────

    _defaultState() {
        return { rankIndex: 0, achievements: [], skillDieRevealed: false };
    },

    load() {
        try {
            const raw = localStorage.getItem(CAMPAIGN_KEY);
            if (!raw) return this._defaultState();
            const parsed = JSON.parse(raw);
            return {
                rankIndex:        parsed.rankIndex        ?? 0,
                achievements:     parsed.achievements     ?? [],
                skillDieRevealed: parsed.skillDieRevealed ?? false,
            };
        } catch {
            return this._defaultState();
        }
    },

    save(state) {
        try {
            localStorage.setItem(CAMPAIGN_KEY, JSON.stringify(state));
        } catch (e) {
            console.warn('[Campaign] Could not save:', e);
        }
    },

    getState() {
        return this.load();
    },

    // ── Rank queries ─────────────────────────────────────────

    /** Current rank object from RANKS[]. */
    getRank() {
        const { rankIndex } = this.load();
        return RANKS[Math.min(rankIndex, RANKS.length - 1)];
    },

    /** True if the given difficulty ('casual'|'standard'|'heroic') is unlocked. */
    isDifficultyUnlocked(diff) {
        return this.getRank().unlockedDifficulties.includes(diff);
    },

    // ── Skill die ─────────────────────────────────────────────

    /** True if the player has ever revealed the skill die (one-time event). */
    isSkillDieRevealed() {
        return this.load().skillDieRevealed === true;
    },

    /** Record that the skill die has been revealed. Idempotent. */
    setSkillDieRevealed() {
        const state = this.load();
        if (state.skillDieRevealed) return;
        state.skillDieRevealed = true;
        this.save(state);
    },

    // ── Achievement checking ──────────────────────────────────

    /**
     * Call after a run completes. Evaluates all un-earned achievements
     * against runData, advances rank, saves, and returns newly unlocked
     * achievement objects (array, may be empty).
     */
    checkRun(runData) {
        const state = this.load();
        const earned = new Set(state.achievements.map(a => a.id));
        const newlyUnlocked = [];

        for (const ach of ACHIEVEMENTS) {
            if (earned.has(ach.id)) continue;
            if (!ach.check(runData)) continue;

            state.achievements.push({ id: ach.id, completedAt: Date.now() });
            earned.add(ach.id);

            // Advance rank to the maximum granted by any new achievement
            if (ach.grantsRank > state.rankIndex) {
                state.rankIndex = ach.grantsRank;
            }
            newlyUnlocked.push(ach);
        }

        if (newlyUnlocked.length) this.save(state);
        return newlyUnlocked;
    },

    // ── Tester / dev helpers ──────────────────────────────────

    /** Unlock everything. Call from browser console: Campaign.unlockAll() */
    unlockAll() {
        const state = {
            rankIndex: RANKS.length - 1,
            achievements: ACHIEVEMENTS.map(a => ({ id: a.id, completedAt: Date.now() })),
        };
        this.save(state);
        _refreshHomeRank();
        console.log(`[Campaign] All ranks unlocked. Rank: ${RANKS[state.rankIndex].title}`);
    },

    /** Reset to first-time state. Call from browser console: Campaign.reset() */
    reset() {
        this.save(this._defaultState());
        _refreshHomeRank();
        console.log('[Campaign] Campaign reset to The Outsider.');
    },
};

// ── Home-screen rank refresh (called by tester helpers) ───────
function _refreshHomeRank() {
    const el = document.getElementById('home-rank-display');
    if (el) el.textContent = Campaign.getRank().title;
}
