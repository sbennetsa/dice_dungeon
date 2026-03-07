// ════════════════════════════════════════════════════════════
//  PERSISTENCE — localStorage run history
//  Stores up to MAX_RUNS completed run records.
//  Data format is intentionally minimal so it stays valid
//  across future patches (no serialised artifact/die objects).
// ════════════════════════════════════════════════════════════

const STORAGE_KEY         = 'diceDungeon_v1_runs';
const MAX_RUNS            = 100;
const BESTIARY_STORAGE_KEY = 'diceDungeon_v1_bestiary';

export const RunHistory = {

    // ── PUBLIC API ────────────────────────────────────────────

    /** Save a completed run. Call from Game.victory() / Game.defeat(). */
    save(runData) {
        const runs = this._load();
        runs.push({ ...runData, id: Date.now() });
        if (runs.length > MAX_RUNS) runs.splice(0, runs.length - MAX_RUNS);
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(runs));
        } catch (e) {
            console.warn('[Persistence] Could not save run history:', e);
        }
    },

    /** All saved runs, oldest first. */
    getAll() {
        return this._load();
    },

    /**
     * Aggregated stats object, or null if no runs recorded.
     * Shape:
     *   { totalRuns, totalWins, totalEnemies, totalGold,
     *     byDifficulty: { casual, standard, heroic: { total, wins, bestFloor } },
     *     recentRuns: Run[] (newest first, max 20) }
     */
    getStats() {
        const runs = this._load();
        if (!runs.length) return null;

        const byDiff = {};
        for (const d of ['casual', 'standard', 'heroic']) {
            const dr = runs.filter(r => r.difficulty === d);
            byDiff[d] = {
                total:     dr.length,
                wins:      dr.filter(r => r.outcome === 'victory').length,
                bestFloor: dr.length ? Math.max(...dr.map(r => r.floor)) : 0,
            };
        }

        return {
            totalRuns:    runs.length,
            totalWins:    runs.filter(r => r.outcome === 'victory').length,
            totalEnemies: runs.reduce((s, r) => s + (r.enemiesKilled || 0), 0),
            totalGold:    runs.reduce((s, r) => s + (r.totalGold    || 0), 0),
            byDifficulty: byDiff,
            recentRuns:   [...runs].reverse().slice(0, 20),
        };
    },

    /** Wipe all history. */
    clear() {
        localStorage.removeItem(STORAGE_KEY);
    },

    // ── PRIVATE ───────────────────────────────────────────────

    _load() {
        try {
            return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
        } catch {
            return [];
        }
    },
};

// ════════════════════════════════════════════════════════════
//  CAMPAIGN HISTORY — archives completed campaigns (top-level)
//  with nested loop records. Max 50 campaigns stored.
// ════════════════════════════════════════════════════════════

const CAMPAIGN_HISTORY_KEY = 'diceDungeon_v1_campaigns';
const MAX_CAMPAIGNS        = 50;

export const CampaignHistory = {

    /** Archive a completed campaign record. */
    save(campaign) {
        const all = this._load();
        all.push({ ...campaign, archivedAt: Date.now() });
        if (all.length > MAX_CAMPAIGNS) all.splice(0, all.length - MAX_CAMPAIGNS);
        try {
            localStorage.setItem(CAMPAIGN_HISTORY_KEY, JSON.stringify(all));
        } catch (e) {
            console.warn('[Persistence] Could not save campaign history:', e);
        }
    },

    /** All archived campaigns, oldest first. */
    getAll() {
        return this._load();
    },

    /** Aggregated campaign stats, or null if no campaigns recorded. */
    getStats() {
        const all = this._load();
        if (!all.length) return null;
        const completed = all.filter(c => c.outcome === 'completed');
        const defeated  = all.filter(c => c.outcome === 'defeated');
        const loopCounts = all.map(c => c.loops?.length || 0);
        return {
            totalCampaigns:  all.length,
            completed:       completed.length,
            defeated:        defeated.length,
            avgLoopsReached: loopCounts.length ? (loopCounts.reduce((a, b) => a + b, 0) / loopCounts.length).toFixed(1) : 0,
        };
    },

    /** Wipe all campaign history. */
    clear() {
        localStorage.removeItem(CAMPAIGN_HISTORY_KEY);
    },

    _load() {
        try {
            return JSON.parse(localStorage.getItem(CAMPAIGN_HISTORY_KEY) || '[]');
        } catch {
            return [];
        }
    },
};

// ════════════════════════════════════════════════════════════
//  BESTIARY PROGRESS — tracks unlocked entries and encounter
//  counts across all runs. Stored separately from run history.
// ════════════════════════════════════════════════════════════

export const BestiaryProgress = {

    /** Load progress from localStorage. Returns { unlocked: Set, encounters: Map }. */
    load() {
        try {
            const raw = JSON.parse(localStorage.getItem(BESTIARY_STORAGE_KEY) || '{}');
            return {
                unlocked:   new Set(raw.unlocked   || []),
                encounters: new Map(Object.entries(raw.encounters || {})),
            };
        } catch {
            return { unlocked: new Set(), encounters: new Map() };
        }
    },

    /** Build the storage key — 'id:act' for regular enemies, 'id' for bosses (act = null). */
    _key(id, act) {
        return act != null ? `${id}:${act}` : id;
    },

    /** Mark an enemy as permanently unlocked. act = null for bosses. */
    unlock(id, act = null) {
        if (!id) return;
        const key = this._key(id, act);
        const progress = this.load();
        if (progress.unlocked.has(key)) return;
        progress.unlocked.add(key);
        this._save(progress);
    },

    /** Increment encounter count for an enemy id. act = null for bosses. */
    increment(id, act = null) {
        if (!id) return;
        const key = this._key(id, act);
        const progress = this.load();
        progress.encounters.set(key, (progress.encounters.get(key) || 0) + 1);
        this._save(progress);
    },

    _save(progress) {
        try {
            localStorage.setItem(BESTIARY_STORAGE_KEY, JSON.stringify({
                unlocked:   [...progress.unlocked],
                encounters: Object.fromEntries(progress.encounters),
            }));
        } catch (e) {
            console.warn('[Bestiary] Could not save progress:', e);
        }
    },
};
