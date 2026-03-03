// ════════════════════════════════════════════════════════════
//  CAMPAIGN — Persistent meta-progression (Ancient Order theme)
//  Tracks player rank and achievement unlocks across all runs.
//  Separate from RunHistory; gates content by rank.
// ════════════════════════════════════════════════════════════

const CAMPAIGN_KEY = 'diceDungeon_v1_campaign';

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
