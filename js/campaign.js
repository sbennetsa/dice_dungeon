// ════════════════════════════════════════════════════════════
//  CAMPAIGN — Ancient Order favor system and campaign loop manager.
//  Tracks per-campaign favor accumulation across loops,
//  resolves tier thresholds, applies node/artifact enhancements.
//  Favor gains and tier benefits are shown in BattleSummary and
//  Order Interaction screens.
// ════════════════════════════════════════════════════════════

import { CampaignHistory } from './persistence.js';
import { GS } from './state.js';

const CAMPAIGN_KEY = 'diceDungeon_v1_campaign';

// ── Orders ───────────────────────────────────────────────────

export const ORDERS = ['warpack', 'gilded', 'runeforged', 'brood', 'ironward'];

export const ORDER_DISPLAY_NAMES = {
    warpack: 'The Warpack', gilded: 'The Gilded Hand',
    runeforged: 'The Runeforged', brood: 'The Brood', ironward: 'The Ironward',
};

export const ORDER_ICONS = {
    warpack: '⚔️', gilded: '💰', runeforged: '🔮', brood: '☠️', ironward: '🛡️',
};

/** Player-facing tier benefit descriptions per order [Tier1, Tier2, Tier3]. */
export const ORDER_TIER_DESCRIPTIONS = {
    warpack: [
        'Pack Tactics: +2 dmg per die (was +1)',
        'Volley: triggers at 3+ dice (was 4+)',
        'Swarm Master: +3 dmg per die (was +2)',
    ],
    gilded: [
        'Prospector: +7 gold per combat (was +4)',
        'Gold Interest: 18% (was 10%)',
        'Golden Wrath: +1 dmg per 6 gold (was per 8)',
    ],
    runeforged: [
        'Threshold: triggers at 10+ (was 12+)',
        'Runeforger: 4 rune slots (was 3)',
        'Amplify: also grants Titan effect',
    ],
    brood: [
        'Venom: +2 poison per attack (was +1)',
        'Plague Lord: poison ×3 (was ×2)',
        'Gambler: +4 dmg per reroll + poison (was +2)',
    ],
    ironward: [
        'Fortify: +25 Max HP total (was +15)',
        'Convalescence: 35% recovery (was 25%)',
        'Life Weave: healing ×3 (was ×2)',
    ],
};

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
export const RANKS = [
    { id: 'wanderer', title: 'The Wanderer', flavour: 'Your path is your own.', unlockedDifficulties: ['casual', 'standard', 'heroic'] },
];
export const ACHIEVEMENTS = [];

// ════════════════════════════════════════════════════════════
//  Campaign object
// ════════════════════════════════════════════════════════════

export const Campaign = {

    // ── Internal defaults ─────────────────────────────────────

    _defaultMeta() {
        return { skillDieRevealed: false };
    },

    _defaultActive(campaignId) {
        return {
            campaignId:  campaignId || Date.now(),
            currentLoop: 1,
            orderFavor:  { warpack: 0, gilded: 0, runeforged: 0, brood: 0, ironward: 0 },
            outcome:     'active',
            defeatedAt:  null,
            loops:       [],
        };
    },

    // ── Persistence ───────────────────────────────────────────

    /** Load raw stored state from localStorage. */
    _loadRaw() {
        try {
            const raw = localStorage.getItem(CAMPAIGN_KEY);
            if (!raw) return null;
            return JSON.parse(raw);
        } catch {
            return null;
        }
    },

    /** Save raw state to localStorage. */
    _saveRaw(state) {
        try {
            localStorage.setItem(CAMPAIGN_KEY, JSON.stringify(state));
        } catch (e) {
            console.warn('[Campaign] Could not save:', e);
        }
    },

    /** Load persistent meta (skillDieRevealed). Migrates old format if needed. */
    _loadMeta() {
        const raw = this._loadRaw();
        if (!raw) return this._defaultMeta();
        // Old format migration: had rankIndex field
        if (raw.rankIndex !== undefined) {
            return { skillDieRevealed: raw.skillDieRevealed || false };
        }
        return { skillDieRevealed: raw.skillDieRevealed || false };
    },

    /** Load active campaign state, or null if none. */
    _loadActive() {
        const raw = this._loadRaw();
        if (!raw) return null;
        // Old format: had rankIndex → no active campaign
        if (raw.rankIndex !== undefined) return null;
        // No active campaign
        if (!raw.campaignId) return null;
        if (raw.outcome !== 'active') return null;
        return raw;
    },

    // ── Active campaign queries ───────────────────────────────

    /** True if there is an active campaign in progress. */
    isActive() {
        return this._loadActive() !== null;
    },

    /** Returns active campaign object, or null. */
    getActiveCampaign() {
        return this._loadActive();
    },

    /** Current loop number (1-3), or null if no active campaign. */
    getCurrentLoop() {
        const c = this._loadActive();
        return c ? c.currentLoop : null;
    },

    /** Difficulty for the current loop: 'casual'|'standard'|'heroic'. */
    getDifficulty() {
        const c = this._loadActive();
        if (!c) return 'casual';
        return LOOP_DIFFICULTIES[Math.min(c.currentLoop - 1, LOOP_DIFFICULTIES.length - 1)];
    },

    // ── Campaign lifecycle ────────────────────────────────────

    /** Start a new campaign. Returns the new campaign object. */
    startCampaign() {
        const meta = this._loadMeta();
        const campaign = this._defaultActive();
        campaign.skillDieRevealed = meta.skillDieRevealed;
        this._saveRaw(campaign);
        console.log('[Campaign] New campaign started:', campaign.campaignId);
        return campaign;
    },

    /**
     * End the current loop.
     * Records loop result, adds favor to running totals, checks tier crossings.
     * Returns { newTiers, newSynergies } — both arrays may be empty.
     */
    endLoop(favorEarned, outcome, stats) {
        const campaign = this._loadActive();
        if (!campaign) return { newTiers: [], newSynergies: [] };

        // Snapshot favor before adding this loop's earnings
        const favorBefore = { ...campaign.orderFavor };

        // Add earned favor
        for (const order of ORDERS) {
            campaign.orderFavor[order] = (campaign.orderFavor[order] || 0) + Math.round(favorEarned[order] || 0);
        }

        // Record loop
        campaign.loops.push({
            loop:          campaign.currentLoop,
            difficulty:    LOOP_DIFFICULTIES[campaign.currentLoop - 1] || 'casual',
            outcome,
            floor:         stats.floor || 15,
            enemiesKilled: stats.enemiesKilled || 0,
            totalGold:     stats.totalGold || 0,
            favorEarned:   { ...favorEarned },
        });

        // Compute new tiers and synergies
        const newTiers     = this._getTierCrossings(favorBefore, campaign.orderFavor);
        const synBefore    = this._getSynergiesFromFavor(favorBefore);
        const synAfter     = this._getSynergiesFromFavor(campaign.orderFavor);
        const newSynergies = synAfter.filter(s => !synBefore.includes(s));

        if (outcome === 'victory') {
            campaign.currentLoop++;
        } else {
            campaign.outcome    = 'defeated';
            campaign.defeatedAt = { loop: campaign.currentLoop, floor: stats.floor || 0 };
        }

        this._saveRaw(campaign);

        if (outcome !== 'victory') {
            this._archive(campaign);
        }

        return { newTiers, newSynergies };
    },

    /** Archive a completed (victory or defeat) campaign and clear active state. */
    endCampaign(outcome) {
        const campaign = this._loadActive();
        if (!campaign) return;
        campaign.outcome = outcome;
        const meta = this._loadMeta();
        this._saveRaw({ skillDieRevealed: meta.skillDieRevealed });
        this._archive(campaign);
    },

    /** Archive to CampaignHistory and clear active key. */
    _archive(campaign) {
        CampaignHistory.save(campaign);
        const meta = this._loadMeta();
        this._saveRaw({ skillDieRevealed: meta.skillDieRevealed });
        console.log('[Campaign] Campaign archived. Outcome:', campaign.outcome);
    },

    // ── Favor and tier helpers ────────────────────────────────

    /** Returns current cumulative favor per Order, or all zeros. */
    getOrderFavor() {
        const c = this._loadActive();
        if (!c) return { warpack: 0, gilded: 0, runeforged: 0, brood: 0, ironward: 0 };
        return { ...c.orderFavor };
    },

    /** Returns tier (0-3) for an Order given its current favor. */
    getOrderTier(order, favor) {
        const f = favor ?? (this._loadActive()?.orderFavor?.[order] || 0);
        const thresholds = ORDER_TIERS[order] || [];
        let tier = 0;
        for (const t of thresholds) {
            if (f >= t) tier++;
            else break;
        }
        return tier;
    },

    /** Live cumulative favor = saved campaign total + current loop's running total. */
    getLiveFavor() {
        const saved = this.getOrderFavor();
        for (const order of ORDERS) {
            saved[order] += Math.round(GS._loopFavor?.[order] || 0);
        }
        return saved;
    },

    /** Returns { nextTier, threshold } for the next uncrossed tier, or null if maxed. */
    getNextTierInfo(order, currentFavor) {
        const thresholds = ORDER_TIERS[order] || [];
        const tier = this.getOrderTier(order, currentFavor);
        if (tier >= thresholds.length) return null;
        return { nextTier: tier + 1, threshold: thresholds[tier] };
    },

    /** Returns list of { order, tier } for newly crossed thresholds between two favor states. */
    _getTierCrossings(before, after) {
        const crossings = [];
        for (const order of ORDERS) {
            const tierBefore = this.getOrderTier(order, before[order] || 0);
            const tierAfter  = this.getOrderTier(order, after[order]  || 0);
            for (let t = tierBefore + 1; t <= tierAfter; t++) {
                crossings.push({ order, tier: t });
            }
        }
        return crossings;
    },

    /** Returns synergy keys active when both Orders are ≥ Tier 2. */
    _getSynergiesFromFavor(favor) {
        const synergies = [];
        const atTier2 = ORDERS.filter(o => this.getOrderTier(o, favor[o] || 0) >= 2);
        const pairs = [
            ['warpack', 'ironward'],
            ['brood', 'ironward'],
            ['gilded', 'warpack'],
            ['brood', 'runeforged'],
            ['gilded', 'ironward'],
            ['warpack', 'runeforged'],
            ['gilded', 'runeforged'],
            ['brood', 'warpack'],
            ['gilded', 'brood'],
            ['ironward', 'runeforged'],
        ];
        for (const [a, b] of pairs) {
            if (atTier2.includes(a) && atTier2.includes(b)) {
                synergies.push(`${a}+${b}`);
            }
        }
        return synergies;
    },

    /** Returns list of active synergy keys for the current campaign. */
    getSynergies() {
        const c = this._loadActive();
        if (!c) return [];
        return this._getSynergiesFromFavor(c.orderFavor);
    },

    // ── Dungeon start: apply tier enhancements ─────────────────

    /**
     * Apply Order tier enhancements to gs.passives.
     * Call in Game.start() after blueprint is generated and root node applied.
     * Sets _campaignTier on passives for use by node effect functions,
     * then overrides passive values for already-unlocked nodes.
     */
    applyTierEnhancements(gs) {
        const campaign = this._loadActive();
        if (!campaign) return;

        const favor = campaign.orderFavor;

        // Compute current tier per Order
        const tier = {};
        for (const order of ORDERS) {
            tier[order] = this.getOrderTier(order, favor[order] || 0);
        }

        // Store on passives for node effect functions (future unlocks during the run)
        gs.passives._campaignTier = tier;

        const unlocked = gs.unlockedNodes || [];

        // ── Apply per-tier node enhancements ──────────────────
        for (const [order, enhancements] of Object.entries(TIER_NODE_ENHANCEMENTS)) {
            for (const enh of enhancements) {
                if (tier[order] <= enh.tierIdx) continue;        // tier not reached yet
                if (!unlocked.includes(enh.nodeId)) continue;    // node not unlocked

                // Special case: fortify HP boost (h_a tier 1 → +10 extra HP)
                if (enh.passiveKey === '_fortifyBoost') {
                    gs.maxHp += enh.value;
                    gs.hp = Math.min(gs.hp + enh.value, gs.maxHp);
                    continue;
                }

                // General: set passive to enhanced value (overrides node-set value)
                gs.passives[enh.passiveKey] = enh.value;
                if (enh.extra) {
                    for (const [k, v] of Object.entries(enh.extra)) {
                        gs.passives[k] = v;
                    }
                }
            }
        }

        // ── Apply artifact enhancements ────────────────────────
        this._applyArtifactEnhancements(gs, tier);

        // ── Apply cross-order synergies ────────────────────────
        this._applySynergies(gs, tier);

        console.log('[Campaign] Tier enhancements applied. Tiers:', tier);
    },

    /** Set artifact enhancement flags on gs.passives based on active tiers. */
    _applyArtifactEnhancements(gs, tier) {
        const arts = gs.artifacts || [];
        const has  = (effect) => arts.some(a => a.effect === effect);

        // ── The Warpack ───────────────────────────────────────
        if (tier.warpack >= 1) {
            if (has('hydraCrest'))  gs.passives._hydraCrestBonus   = 3;   // +2→+3/die
            if (has('swarmBanner')) gs.passives._swarmBannerBreak  = 3;   // 4+→3+
            if (has('echoStone'))   gs.passives._echoStoneDualDie  = true; // first two count twice
            if (has('battleFury'))  gs.passives._battleFuryThresh  = 2;   // 3 Fury→2
            if (has('berserkMask')) gs.passives._berserkMaskTier   = tier.warpack;
            if (has('huntersMark')) gs.passives._huntersMarkTurns  = 3;   // 2→3 turns
            if (has('thunderStrike')) gs.passives._thunderCooldown = 1;   // 2→1 turn
        }

        // ── The Gilded Hand ───────────────────────────────────
        if (tier.gilded >= 1) {
            if (has('merchantCrown'))  gs.passives._merchantCrownDiv  = 15;  // /20→/15
            if (has('goldenAegis'))    gs.passives._goldenAegisDiv    = 18;  // /25→/18
            if (has('midasDie'))       gs.passives._midasDieSides     = 8;   // d6→d8
            if (has('goldPerKill'))    gs.passives._taxCollectorBonus = 10;  // +7→+10
            if (has('gildedGauntlet')) gs.passives._guildedGauntletEnh = true; // cost 35, dmg 20
        }

        // ── The Runeforged ────────────────────────────────────
        if (tier.runeforged >= 1) {
            if (has('sharpeningStone'))  gs.passives._sharpeningMult  = 0.75; // +50%→+75%
            if (has('precisionLens'))    gs.passives._precisionRolls  = 3;    // 2→3
            if (has('colossusBelt'))     gs.passives._colossusThresh  = 7;    // 9→7
            if (has('glassCannon'))      gs.passives._glassCannonFaces = 4;   // +3→+4
            if (has('titansDie'))        gs.passives._titansDieMin    = 14;   // min 14
            if (has('echoChamber'))      gs.passives._echoChambMult   = 2.5;  // ×2→×2.5
        }

        // ── The Brood ─────────────────────────────────────────
        if (tier.brood >= 1) {
            if (has('venomGland'))     gs.passives._venomGlandMult   = 3;    // ×2→×3
            if (has('festerWound'))    gs.passives._festerWoundDmg   = 2;    // +1→+2/stack
            if (has('toxicBlood'))     gs.passives._toxicBloodStacks = 3;    // 2→3 poison
            if (has('witchHex'))       gs.passives._witchHexTurns    = 2;    // 1→2 turns weaken
            if (has('bloodPact'))      gs.passives._bloodPactCost    = 2;    // -3→-2 HP/turn
            if (has('emberCrown'))     gs.passives._emberCrownThresh = 10;   // 15→10 dmg
            if (has('gamblersCoin'))   gs.passives._gamblersCoinHead = 3;    // +2→+3
        }

        // ── The Ironward ──────────────────────────────────────
        if (tier.ironward >= 1) {
            if (has('overflowChalice'))  gs.passives._chaliceBlockHeal   = 0.15; // +15% block/turn
            if (has('bloodstone'))       gs.passives._bloodstonePct      = 0.40; // 30%→40%
            if (has('thornMail'))        gs.passives._thornMailDmg       = 5;    // 3→5
            if (has('frostBrand'))       gs.passives._frostBrandThresh   = 7;    // 10→7 block
            if (has('soulMirror'))       gs.passives._soulMirrorReduce   = 0.65; // 50%→65%
            if (has('eternalPact'))      gs.passives._eternalPactCount   = 2;    // 1→2 uses
            if (has('anchored'))         gs.passives._anchoredBlockBonus = 1;    // +1 block/turn
            if (has('ironWill'))         gs.passives._ironWillRegen      = 1;    // +1 regen
            if (has('burnproofCloak'))   gs.passives._burnproofReduce    = 0.75; // 50%→75%
            if (has('frozenHeart'))      gs.passives._frozenHeartTurns   = 2;    // 1→2 freeze turns
        }

        // ── Mixed: Parasite (Gilded + Ironward) ───────────────
        if (tier.gilded >= 1 && tier.ironward >= 1) {
            if (has('parasite')) gs.passives._parasiteEnh = true; // gold & HP +50%
        }
    },

    /** Apply cross-order synergy passives. Requires both Orders at Tier ≥ 2. */
    _applySynergies(gs, tier) {
        // Warpack + Ironward: Swarm Master guard zone clause
        if (tier.warpack >= 2 && tier.ironward >= 2) {
            gs.passives.swarmMasterGuardZone = true;
        }
        // Brood + Ironward: healing scales with active poison stacks
        if (tier.brood >= 2 && tier.ironward >= 2) {
            gs.passives.healScalesWithPoison = true;
        }
        // Gilded + Warpack: extra die = +1 gold at combat end
        if (tier.gilded >= 2 && tier.warpack >= 2) {
            gs.passives.goldPerExtraDie = true;
        }
        // Brood + Runeforged: PoisonCore extra stacks = die face value
        if (tier.brood >= 2 && tier.runeforged >= 2) {
            gs.passives.poisonCoreScalesFace = true;
        }
        // Gilded + Ironward: Overflow Chalice healing → 0.5 gold per HP healed
        if (tier.gilded >= 2 && tier.ironward >= 2) {
            gs.passives.chaliceHealingToGold = 0.5;
        }
        // Warpack + Runeforged: Echo Stone also applies to highest rune-enhanced die
        if (tier.warpack >= 2 && tier.runeforged >= 2) {
            gs.passives.echoStoneRuneBonus = true;
        }
        // Gilded + Runeforged: Sharpening Stone scales with gold (+1% per 10 gold, max double)
        if (tier.gilded >= 2 && tier.runeforged >= 2) {
            gs.passives.sharpeningGoldScale = true;
        }
        // Brood + Warpack: Battle Fury stacks also apply 1 poison
        if (tier.brood >= 2 && tier.warpack >= 2) {
            gs.passives.furyStacksPoison = true;
        }
        // Gilded + Brood: Toxic Blood poison also yields 1 gold per stack
        if (tier.gilded >= 2 && tier.brood >= 2) {
            gs.passives.toxicBloodGold = true;
        }
        // Ironward + Runeforged: Precision Lens heal 2 HP if kept > dropped by 4+
        if (tier.ironward >= 2 && tier.runeforged >= 2) {
            gs.passives.precisionLensHeal = 2;
        }
    },

    // ── Narrative interactions ────────────────────────────────

    /**
     * Returns array of interaction objects for the end-of-loop screen.
     * { text } — no order names or mechanics ever shown.
     * Falls back to a single atmospheric beat if no threshold crossed.
     */
    getLoopInteractions(newTiers, newSynergies) {
        const entries = [];

        for (const { order, tier } of newTiers) {
            const texts = ORDER_INTERACTIONS[order];
            if (texts && texts[tier - 1]) {
                entries.push({ text: texts[tier - 1] });
            }
        }

        for (const synergyKey of newSynergies) {
            const text = SYNERGY_INTERACTIONS[synergyKey];
            if (text) entries.push({ text });
        }

        if (!entries.length) {
            const beat = ATMOSPHERIC_BEATS[Math.floor(Math.random() * ATMOSPHERIC_BEATS.length)];
            entries.push({ text: beat });
        }

        return entries;
    },

    // ── Skill die persistence (legacy compat) ─────────────────

    /** True if the player has ever revealed the skill die. */
    isSkillDieRevealed() {
        const raw = this._loadRaw();
        if (!raw) return false;
        return raw.skillDieRevealed === true;
    },

    /** Record that the skill die has been revealed. Idempotent. */
    setSkillDieRevealed() {
        const raw = this._loadRaw() || {};
        if (raw.skillDieRevealed) return;
        raw.skillDieRevealed = true;
        this._saveRaw(raw);
    },

    // ── Legacy compat stubs ───────────────────────────────────

    /** All difficulties always available (rank gating removed). */
    isDifficultyUnlocked(_diff) { return true; },

    /** Simplified rank — returns a basic title object. */
    getRank() { return RANKS[0]; },

    /** Stub — campaign victory is handled in Game.victory() (Phase 7). */
    checkRun(_runData) { return []; },

    // ── Dev helpers ───────────────────────────────────────────

    /** Console: Campaign.reset() */
    reset() {
        const meta = this._loadMeta();
        this._saveRaw({ skillDieRevealed: meta.skillDieRevealed });
        console.log('[Campaign] Campaign reset.');
    },

    /** Console: Campaign.debugFavor() — logs current favor state. */
    debugFavor() {
        const c = this._loadActive();
        if (!c) { console.log('[Campaign] No active campaign.'); return; }
        console.log('[Campaign] Favor:', c.orderFavor);
        for (const order of ORDERS) {
            console.log(`  ${order}: ${c.orderFavor[order]} → Tier ${this.getOrderTier(order, c.orderFavor[order])}`);
        }
    },
};
