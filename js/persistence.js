// ════════════════════════════════════════════════════════════
//  PERSISTENCE — localStorage run history
//  Stores up to MAX_RUNS completed run records.
//  Data format is intentionally minimal so it stays valid
//  across future patches (no serialised artifact/die objects).
// ════════════════════════════════════════════════════════════

const STORAGE_KEY = 'diceDungeon_v1_runs';
const MAX_RUNS    = 100;

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
