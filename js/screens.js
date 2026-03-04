// ════════════════════════════════════════════════════════════
//  SCREENS — Game, Rewards, Shop, Events, Rest, Inventory
//  Entry point: exposes all modules on window for onclick handlers
// ════════════════════════════════════════════════════════════
import { FACE_MODS, ARTIFACT_POOL, LEGENDARY_ARTIFACT_POOL, RUNES, SKILL_TREE, CONSUMABLES, UTILITY_DICE, getAct, getFloorType, getArtifactPool, pickConsumablesForMarket, pickWeightedConsumable } from './constants.js';
import { GS, $, rand, pick, shuffle, pickWeighted, log, gainXP, gainGold, heal } from './state.js';
import { createDie, createDieFromFaces, createUtilityDie, upgradeDie, renderFaceStrip, renderDieCard, show, updateStats, resetDieIdCounter, renderCombatDice, renderConsumables, setupDropZones } from './engine.js';
import { Combat } from './combat.js';
import { generateEncounter, applyEliteChoice, calculateAvgDamage, deepClone } from './encounters/encounterGenerator.js';
import { applyEliteModifier, scaleElitePassives, calculateRewardMultipliers } from './encounters/eliteModifierSystem.js';
import { generateDungeonBlueprint } from './encounters/dungeonBlueprint.js';
import { scoreDungeon, scoreFloorDetailed, scorePlayerAdvantage, SHOP_ADVANTAGES, REST_ADVANTAGES } from './encounters/dungeonScoring.js';
import { RunHistory } from './persistence.js';
import { Campaign, RANKS, ACHIEVEMENTS } from './campaign.js';

// ════════════════════════════════════════════════════════════
//  CAMPAIGN STATE
// ════════════════════════════════════════════════════════════
// Achievements unlocked by the most recently completed run.
// Rendered on the game-over screen then cleared.
let _pendingUnlocks = [];

// ════════════════════════════════════════════════════════════
//  HELPERS
// ════════════════════════════════════════════════════════════

/** Populate #home-rank-display with the player's current campaign rank title. */
function _refreshHomeRank() {
    const el = document.getElementById('home-rank-display');
    if (!el) return;
    const rank = Campaign.getRank();
    el.textContent = rank.title;
}

/** Render any newly unlocked achievements into #go-unlocks on the game-over screen. */
function _renderUnlockNotification() {
    const el = document.getElementById('go-unlocks');
    if (!el) return;
    if (!_pendingUnlocks.length) {
        el.innerHTML = '';
        return;
    }
    const newRank = Campaign.getRank();
    const achHtml = _pendingUnlocks.map(a =>
        `<div class="unlock-achievement">
            <span class="unlock-ach-title">${a.title}</span>
            <span class="unlock-ach-desc">${a.description}</span>
        </div>`
    ).join('');
    el.innerHTML = `
        <div class="unlock-notification">
            <div class="unlock-header">The Order Stirs</div>
            ${achHtml}
            <div class="unlock-new-rank">Rank: <strong>${newRank.title}</strong></div>
            <div class="unlock-flavour">${newRank.flavour}</div>
        </div>`;
    _pendingUnlocks = [];
}

// Applies a die upgrade, doubling the effect if mastersHammer is active
function applyUpgrade(die) {
    upgradeDie(die);
    if (GS.tempBuffs && GS.tempBuffs.mastersHammer) upgradeDie(die);
}

// ── Artifact helpers ──

/**
 * Apply onAcquire side-effects for an artifact.
 * Called from every artifact acquisition site.
 */
function _applyArtifactOnAcquire(art) {
    if (art.effect === 'colossussBelt') {
        GS.dice.forEach(d => {
            if (d.max >= 9) {
                d.faceValues = d.faceValues.map(v => v + art.value);
                d.min += art.value; d.max += art.value;
            }
        });
        log(`🏋️ Colossus Belt: dice with max≥9 gained +${art.value} to all faces!`, 'info');
    } else if (art.effect === 'glassCannon') {
        GS.dice.forEach(d => {
            d.faceValues = d.faceValues.map(v => v + art.value);
            d.min += art.value; d.max += art.value;
        });
        GS.maxHp = Math.max(10, Math.floor(GS.maxHp / 2));
        GS.hp = Math.min(GS.hp, GS.maxHp);
        log(`💥 Glass Cannon: all dice +${art.value} faces, max HP halved to ${GS.maxHp}!`, 'damage');
    } else if (art.effect === 'titansDie') {
        GS.dice.push(createDieFromFaces([12, 12, 12, 12, 12, 12]));
        log(`🎲 Titan's Die: permanent d12 added to your pool!`, 'info');
    }
}

/**
 * Build 3 artifact choices for the current encounter, optionally injecting
 * one legendary artifact based on the encounter's legendaryChance.
 */
function _pickArtifactChoices() {
    const owned = new Set(GS.artifacts.map(a => a.name));
    const pool = getArtifactPool(GS.act);
    let available = pool.filter(a => !owned.has(a.name));
    if (available.length < 3) available = [...pool];
    const choices = shuffle(available).slice(0, 3);

    // Legendary injection: roll once per choice presentation
    const mods = GS.encounter?.enemy?.appliedModifiers || [];
    const legendaryChance = GS.encounter?.isElite && GS.encounter?.isBossFloor
        ? Math.max(0, ...mods.map(m => m.legendaryChance || 0))
        : 0;
    if (legendaryChance > 0 && Math.random() < legendaryChance && LEGENDARY_ARTIFACT_POOL.length > 0) {
        const ownedLegendary = new Set(GS.artifacts.filter(a => a.legendary).map(a => a.name));
        const availableLeg = LEGENDARY_ARTIFACT_POOL.filter(a => !ownedLegendary.has(a.name));
        if (availableLeg.length > 0) {
            const legendary = availableLeg[Math.floor(Math.random() * availableLeg.length)];
            choices[Math.floor(Math.random() * choices.length)] = legendary;
            log('✨ A legendary artifact has appeared!', 'info');
        }
    }
    return choices;
}

// ════════════════════════════════════════════════════════════
//  CONSUMABLE INVENTORY HELPER
// ════════════════════════════════════════════════════════════
function addConsumableToInventory(c, onDone) {
    const filled = GS.consumables.filter(x => x !== null).length;
    if (filled < GS.consumableSlots) {
        // Add to first empty slot
        let placed = false;
        for (let i = 0; i < GS.consumableSlots; i++) {
            if (!GS.consumables[i]) { GS.consumables[i] = c; placed = true; break; }
        }
        if (!placed) GS.consumables.push(c);
        renderConsumables();
        if (onDone) onDone();
        return;
    }
    // Inventory full: show swap overlay
    const overlay = document.getElementById('consumable-swap');
    const cardsEl = document.getElementById('consumable-swap-cards');
    const cancelBtn = document.getElementById('consumable-swap-cancel');
    if (!overlay) { if (onDone) onDone(); return; }

    const renderCard = (cons, label) => {
        const d = document.createElement('div');
        d.className = 'card';
        d.style.cssText = 'width:130px; cursor:pointer; text-align:center;';
        d.innerHTML = `<div style="font-size:1.5em; margin-bottom:4px;">${cons.icon}</div><div class="card-title" style="font-size:0.85em;">${cons.name}</div><div class="card-desc" style="font-size:0.75em;">${cons.description}</div><div style="margin-top:6px; font-size:0.7em; color:var(--text-dim);">${label}</div>`;
        return d;
    };

    cardsEl.innerHTML = '';
    const close = () => { overlay.style.display = 'none'; cancelBtn.onclick = null; if (onDone) onDone(); };
    cancelBtn.onclick = close;

    GS.consumables.forEach((existing, idx) => {
        if (!existing) return;
        const card = renderCard(existing, '← Replace this');
        card.onclick = () => {
            GS.consumables[idx] = c;
            renderConsumables();
            close();
        };
        cardsEl.appendChild(card);
    });

    // Show new item
    const newCard = renderCard(c, '(new item)');
    newCard.style.opacity = '0.5';
    newCard.style.cursor = 'default';
    cardsEl.appendChild(newCard);

    overlay.style.display = 'block';
}

// ════════════════════════════════════════════════════════════
//  RUNE ATTACHMENT — die picker shown on reward screen
// ════════════════════════════════════════════════════════════
function showRuneAttachment(rune, onDone) {
    $('reward-title').textContent = `🔮 Attach ${rune.icon} ${rune.name} to a Slot`;
    const c = $('reward-cards');
    c.innerHTML = '';

    const info = document.createElement('div');
    info.style.cssText = 'text-align:center; margin-bottom:16px; color:var(--text-dim); font-family:EB Garamond,serif;';
    info.innerHTML = `<strong style="color:${rune.color};">${rune.icon} ${rune.name}</strong>: ${rune.desc}<br><span style="font-size:0.85em; opacity:0.7;">Best for: ${rune.slot === 'either' ? 'any zone' : rune.slot + ' zone'}</span>`;
    c.appendChild(info);

    const grid = document.createElement('div');
    grid.style.cssText = 'display:flex; flex-wrap:wrap; gap:10px; justify-content:center;';

    const allSlots = [
        ...GS.slots.strike.map((s, i) => ({ ...s, type: 'strike', label: `⚔️ Strike Slot ${i + 1}` })),
        ...GS.slots.guard.map((s, i) => ({ ...s, type: 'guard', label: `🛡️ Guard Slot ${i + 1}` })),
    ];

    allSlots.forEach(slotInfo => {
        const compatible = rune.slot === 'either' || rune.slot === slotInfo.type;
        const card = document.createElement('div');
        card.className = 'card';
        card.style.cssText = `width:160px; cursor:pointer;${!compatible ? ' opacity:0.6;' : ''}`;
        const runeCount = slotInfo.runes?.length || 0;
        const maxRunes = GS.passives.runeforger ? 3 : 1;
        const willAdd = runeCount < maxRunes;
        const existingRuneNote = runeCount > 0
            ? (willAdd
                ? `<div style="color:var(--green-bright); font-size:0.78em; margin-top:4px;">✅ Adds (${runeCount}/${maxRunes} runes)</div>`
                : `<div style="color:#ff8080; font-size:0.78em; margin-top:4px;">⚠️ Full — replaces oldest rune</div>`)
            : '<div style="opacity:0.5; font-size:0.78em; margin-top:4px;">empty slot</div>';
        const compatNote = !compatible ? `<div style="color:#ff8080; font-size:0.78em; margin-top:4px;">⚠️ Not ideal for the ${slotInfo.type} zone</div>` : '';
        card.innerHTML = `
            <div class="card-title">${slotInfo.label}</div>
            ${existingRuneNote}${compatNote}
        `;
        card.onclick = () => {
            const slot = GS.slots[slotInfo.type].find(s => s.id === slotInfo.id);
            if (slot) {
                if (slot.runes.length < maxRunes) {
                    slot.runes.push({ ...rune });
                } else {
                    slot.runes.shift(); // remove oldest, add new
                    slot.runes.push({ ...rune });
                }
            }
            log(`🔮 ${rune.icon} ${rune.name} attached to ${slotInfo.label}!`, 'info');
            updateStats();
            onDone?.();
        };
        grid.appendChild(card);
    });

    c.appendChild(grid);
    show('screen-reward');
}

// ════════════════════════════════════════════════════════════
//  GAME CONTROLLER
// ════════════════════════════════════════════════════════════
const Game = {
    start() {
        resetDieIdCounter(0);
        Object.assign(GS, {
            floor: 1, act: 1, hp: 50, maxHp: 50, gold: 15,
            level: 1, xp: 0, xpNext: 50,
            dice: [createDie(1,6), createDie(1,6), createDie(1,6)],
            slots: {
                strike: [{ id: 'str-0', runes: [] }, { id: 'str-1', runes: [] }],
                guard:  [{ id: 'grd-0', runes: [] }, { id: 'grd-1', runes: [] }],
            },
            pendingRunes: [],
            enemyStatus: { chill: 0, chillTurns: 0, freeze: 0, mark: 0, markTurns: 0, weaken: 0, burn: 0, burnTurns: 0, stun: 0, stunCooldown: 0 },
            echoStoneDieId: null,
            gamblerCoinBonus: 0,
            hourglassFreeFirstTurn: false,
            huntersMarkFired: false,
            parasiteGoldPerCombat: 0,
            passives: {}, unlockedNodes: [],
            rerolls: 0, rerollsLeft: 0,
            enemy: null, enemiesKilled: 0, totalGold: 0,
            artifacts: [], buffs: { damageBoost: 0, armor: 0 },
            allocated: { strike: [], guard: [] }, rolled: false,
            tempBuffs: {
                poisonCombats: 0, armorCombats: 0, armorBonus: 0,
                mastersHammer: false, shopReduced: false,
                voidLordWeakened: false, foresight: false, merchantEscort: false,
            },
            transformBuffs: {
                furyChambered: 1, fortified: 1, conduit: 0,
                goldForge: false, thornsAura: 0, vampiricWard: false,
            },
            ascendedDice: [],
            consumables: [],
            consumableSlots: 2,
            consumableBonus: 1,
            consumableUsedThisTurn: false,
            ironSkinActive: false,
            ragePotionActive: false,
            hasteDiceBonus: 0,
            pendingSkillPoints: 0,
            encounter: null,
            environment: null,
            _chaosStormActive: false,
            _firstAttacker: null,
            blueprint: null,
            seed: null,
            runDifficulty: 'standard',
        });

        // Generate dungeon blueprint (all 15 floors pre-determined)
        const seedInput = $('seed-input');
        const seedStr = seedInput ? seedInput.value.trim() : '';
        let seedOption = {};
        if (seedStr) {
            const parsed = parseInt(seedStr.replace(/\s/g, ''), 16);
            if (!isNaN(parsed)) seedOption = { seed: parsed };
        }
        if (seedInput) seedInput.value = '';
        seedOption.difficulty = GS.runDifficulty || 'standard';
        const blueprint = generateDungeonBlueprint(seedOption);
        GS.blueprint = blueprint;
        GS.seed      = blueprint.seed;
        console.log(`[Dungeon] Seed: ${blueprint.seed} | Challenge Target: ${blueprint.challengeTarget || 'N/A'} | Challenge Rating: ${blueprint.scoring.challengeRating}/10`);
        console.log(`[Dungeon] Net Challenge: ${blueprint.scoring.netChallenge} (Combat: ${blueprint.scoring.totalCombatThreat}, Player Advantage: ${blueprint.scoring.totalPlayerAdvantage})`);
        if (blueprint.actBudgets) console.log(`[Dungeon] Act Budgets: ${blueprint.actBudgets.join(' / ')} (target: ${blueprint.challengeTarget})`);
        console.log(`[Dungeon] Schedules: ${blueprint.acts.map(a => a.schedule.join('-')).join(' | ')}`);

        // If the player has previously revealed the skill die, pre-apply the root node benefit.
        // This skips the reveal overlay and grants the permanent +1 Strike, +1 Guard slot from run start.
        if (Campaign.isSkillDieRevealed()) {
            GS.unlockedNodes.push('root');
            GS.slots.strike.push({ id: 'str-2', runes: [] });
            GS.slots.guard.push({ id: 'grd-2', runes: [] });
        }

        DifficultySelect.show();
    },

    enterFloor() {
        GS.act = getAct(GS.floor);
        const type = getFloorType(GS.floor);

        if (type === 'combat' || type === 'boss') {
            const encounter = generateEncounter(GS.floor);
            EncounterChoice.show(encounter);
        } else if (type === 'shop') {
            Shop.enter();
        } else if (type === 'event') {
            Events.enter();
        }
    },

    nextFloor() {
        GS.floor++;
        if (GS.floor > 15) {
            Game.victory();
            return;
        }
        if (GS.floor === 6 || GS.floor === 11) {
            Rest.enter();
            return;
        }
        Game.enterFloor();
    },

    defeat() {
        if (!GS.challengeMode) {
            const runData = {
                outcome:      'defeat',
                difficulty:   GS.runDifficulty,
                floor:        GS.floor,
                level:        GS.level,
                enemiesKilled: GS.enemiesKilled,
                totalGold:    GS.totalGold,
                seed:         GS.seed,
            };
            RunHistory.save(runData);
            _pendingUnlocks = Campaign.checkRun(runData);
        }
        const t = $('go-title');
        t.textContent = '💀 Defeated';
        t.className = 'defeat';
        $('go-stats').innerHTML = [
            ['Floor Reached', GS.floor],
            ['Level', GS.level],
            ['Enemies Slain', GS.enemiesKilled],
            ['Gold Earned', GS.totalGold],
            ['Seed', DungeonMap.formatSeed(GS.seed)],
        ].map(([k,v]) => `<div class="final-stat-row"><span>${k}</span><span>${v}</span></div>`).join('');
        _renderUnlockNotification();
        show('screen-gameover');
    },

    victory() {
        const runData = {
            outcome:      'victory',
            difficulty:   GS.runDifficulty,
            floor:        15,
            level:        GS.level,
            enemiesKilled: GS.enemiesKilled,
            totalGold:    GS.totalGold,
            seed:         GS.seed,
        };
        RunHistory.save(runData);
        _pendingUnlocks = Campaign.checkRun(runData);
        const t = $('go-title');
        t.textContent = '🏆 Victory!';
        t.className = 'victory';
        $('go-stats').innerHTML = [
            ['Floors Cleared', 15],
            ['Level', GS.level],
            ['Enemies Slain', GS.enemiesKilled],
            ['Gold Earned', GS.totalGold],
            ['Artifacts', GS.artifacts.map(a => a.icon).join(' ') || 'None'],
            ['Seed', DungeonMap.formatSeed(GS.seed)],
        ].map(([k,v]) => `<div class="final-stat-row"><span>${k}</span><span>${v}</span></div>`).join('');

        const btns = $('go-buttons');
        btns.innerHTML = '';
        const tryAgain = document.createElement('button');
        tryAgain.className = 'btn btn-primary';
        tryAgain.textContent = 'Try Again';
        tryAgain.onclick = () => Game.start();
        btns.appendChild(tryAgain);

        const challenge = document.createElement('button');
        challenge.className = 'btn btn-execute-main';
        challenge.textContent = '💀 Challenge the Eternal Guardian';
        challenge.onclick = () => {
            challenge.disabled = true;
            Game.startChallengeBoss();
        };
        btns.appendChild(challenge);

        _renderUnlockNotification();
        show('screen-gameover');
    },

    startChallengeBoss() {
        GS.challengePrep = 3;
        GS.hp = GS.maxHp;
        Game.showChallengePrep();
    },

    showChallengePrep() {
        updateStats();
        $('reward-title').textContent = `💀 Prepare for the Eternal Guardian — ${GS.challengePrep} choices remaining`;
        const c = $('reward-cards');
        c.innerHTML = '';

        const info = document.createElement('div');
        info.style.cssText = 'text-align:center; margin-bottom:12px; font-family:EB Garamond,serif; color:var(--text-dim); font-size:0.9em;';
        info.innerHTML = 'Strengthen your build before the final challenge. Choose wisely.';
        c.appendChild(info);

        const rewards = [];

        rewards.push({ title: '⭐ Skill Point', desc: 'Unlock a passive on the skill die', action: () => {
            GS.challengePrep--;
            GS.pendingSkillPoints = (GS.pendingSkillPoints || 0) + 1;
            Rewards.slotChoice(() => {
                if (GS.challengePrep > 0) Game.showChallengePrep();
                else Game.launchChallengeBoss();
            });
        }});

        rewards.push({ title: '✨ Artifact', desc: 'Choose from 3 artifacts', action: () => {
            GS.challengePrep--;
            Rewards.artifactChoice(false);
            const origNext = Game.nextFloor;
            Game.nextFloor = () => {
                Game.nextFloor = origNext;
                if (GS.challengePrep > 0) Game.showChallengePrep();
                else Game.launchChallengeBoss();
            };
        }});

        const totalSlots = GS.slots.strike.length + GS.slots.guard.length;
        rewards.push({ title: '🎲 New Die', desc: `Add a D6 (1-6) — ${GS.dice.length} dice, ${totalSlots} slots`, action: () => {
            GS.dice.push(createDie(1, 6));
            log('Added new D6!', 'info');
            GS.challengePrep--;
            if (GS.challengePrep > 0) Game.showChallengePrep();
            else Game.launchChallengeBoss();
        }});

        const hammer = GS.tempBuffs && GS.tempBuffs.mastersHammer;
        rewards.push({ title: `⬆️ Upgrade Die`, desc: `+${hammer ? '2' : '1'}/+${hammer ? '2' : '1'} to a die${hammer ? ' ⚒️' : ''}`, action: () => {
            GS.challengePrep--;
            $('reward-title').textContent = 'Choose a Die to Upgrade';
            const cc = $('reward-cards');
            cc.innerHTML = '';
            GS.dice.forEach(die => {
                const nextMin = die.min + (hammer ? 2 : 1);
                const nextMax = die.max + (hammer ? 2 : 1);
                const card = document.createElement('div');
                card.className = 'card';
                card.innerHTML = `<div class="card-title">${die.min}-${die.max} → ${nextMin}-${nextMax}</div>`;
                card.onclick = () => {
                    applyUpgrade(die);
                    log(`Upgraded to ${die.min}-${die.max}!${hammer ? ' (Master\'s Hammer)' : ''}`, 'info');
                    if (GS.challengePrep > 0) Game.showChallengePrep();
                    else Game.launchChallengeBoss();
                };
                cc.appendChild(card);
            });
            show('screen-reward');
        }});

        if (GS.dice.length >= 5) {
            rewards.push({ title: '🔨 Sacrifice Dice', desc: 'Destroy 3 dice → +1 slot', action: () => {
                GS.challengePrep--;
                Rewards.showDiceSacrifice(() => {
                    if (GS.challengePrep > 0) Game.showChallengePrep();
                    else Game.launchChallengeBoss();
                });
            }});
        }

        rewards.push({ title: '❤️ Full Heal', desc: `Restore to ${GS.maxHp} HP`, action: () => {
            GS.hp = GS.maxHp;
            log('Fully healed!', 'heal');
            GS.challengePrep--;
            updateStats();
            if (GS.challengePrep > 0) Game.showChallengePrep();
            else Game.launchChallengeBoss();
        }});

        rewards.forEach(r => {
            const card = document.createElement('div');
            card.className = 'card';
            card.innerHTML = `<div class="card-title">${r.title}</div><div class="card-desc">${r.desc}</div>`;
            card.onclick = r.action;
            c.appendChild(card);
        });

        const skip = document.createElement('div');
        skip.style.cssText = 'text-align:center; margin-top:12px;';
        const skipBtn = document.createElement('button');
        skipBtn.className = 'btn';
        skipBtn.textContent = '💀 Skip — Fight Now';
        skipBtn.onclick = () => Game.launchChallengeBoss();
        skip.appendChild(skipBtn);
        c.appendChild(skip);

        show('screen-reward');
    },

    launchChallengeBoss() {
        GS.hp = GS.maxHp;
        GS.challengeMode = true;
        GS.challengeDmg = 0;
        GS.challengeTurns = 0;

        const eDie = s => createDie(1, s, s);
        GS.enemy = {
            name: '💀 The Eternal Guardian',
            hp: 999999,
            maxHp: 999999,
            currentHp: 999999,
            dice: [10, 10, 10, 10].map(eDie),
            extraDice: [],
            abilities: {
                strike: { name: 'Guardian Strike', icon: '⚔️', type: 'attack', desc: 'Deal damage' },
                gather: { name: 'Gather Power', icon: '💪', type: 'buff', desc: 'Store dice sum for next attack' },
                crush:  { name: 'Crushing Blow', icon: '💥', type: 'attack', desc: 'Deal damage (3 pierce)', penetrate: 3 },
            },
            passives: [
                { id: 'escalate', name: 'Eternal Wrath', desc: '+1d12 every 2 turns', params: { interval: 2, dieSize: 12 } },
            ],
            pattern: ['strike', 'strike', 'gather', 'crush'],
            phases: null,
            patternIdx: 0,
            storedBonus: 0,
            turnsAlive: 0,
            phaseTriggered: [],
            phylacteryUsed: false,
            bloodFrenzyTriggered: false,
            _mitosisTriggered: false,
            _damageTakenMult: 1,
            _doubleAction: false,
            shield: 0,
            charged: false,
            immune: false,
            diceResults: [],
            intentValue: 0,
            currentAbilityKey: null,
            gold: 0,
            xp: 0,
            eliteGoldMult: 1,
            eliteXpMult: 1,
            isElite: false,
            isBoss: true,
            poison: 0,
        };

        // Reset combat state (mirrors Combat.start)
        GS.playerDebuffs = { poison: 0, poisonTurns: 0, disabledSlots: [], diceReduction: 0 };
        GS.enemyStatus = { chill: 0, chillTurns: 0, freeze: 0, mark: 0, markTurns: 0, weaken: 0, burn: 0, burnTurns: 0, stun: 0, stunCooldown: false };
        GS.echoStoneDieId = null;
        GS.gamblerCoinBonus = 0;
        GS.huntersMarkFired = false;
        GS.hourglassFreeFirstTurn = false;
        GS.furyCharges = 0;
        GS.ironSkinActive = false;
        GS.ragePotionActive = false;
        GS.hasteDiceBonus = 0;
        GS.consumableUsedThisTurn = false;
        GS.environment = null;
        GS._chaosStormActive = false;
        GS.isFirstTurn = true;

        // Reset dice and combat allocations
        GS.dice.forEach(d => { d.rolled = false; d.value = 0; d.rolledFaceIndex = -1; d.location = 'pool'; delete d.slotId; });
        GS.allocated = { strike: [], guard: [] };
        GS.rolled = false;
        GS.rerollsLeft = GS.rerolls;
        GS.autoLifesteal = 0;
        GS.regenStacks = 0;

        // Roll first enemy intent and render
        Combat._rollEnemyTurn();
        Combat.renderEnemy();
        renderCombatDice();
        renderConsumables();
        setupDropZones();
        updateStats();
        show('screen-combat');
        log('💀 The Eternal Guardian awakens. It cannot be killed — deal as much damage as you can!', 'damage');
        const diceDesc = GS.enemy.dice.map(d => `d${d.max}`).join('+');
        log(`💀 Challenge: The Eternal Guardian (${diceDesc} | Escalates every 3 turns)`, 'info');
        setTimeout(() => Combat.roll(), 300);
    },

    challengeResult() {
        const t = $('go-title');
        t.textContent = '💀 The Guardian Claims You';
        t.className = 'victory';
        const dpt = GS.challengeTurns > 0 ? Math.round(GS.challengeDmg / GS.challengeTurns) : 0;
        $('go-stats').innerHTML = [
            ['💥 Total Damage', GS.challengeDmg.toLocaleString()],
            ['⚔️ Damage/Turn', dpt.toLocaleString()],
            ['🔄 Turns Survived', GS.challengeTurns],
            ['Level', GS.level],
            ['Artifacts', GS.artifacts.map(a => a.icon).join(' ') || 'None'],
        ].map(([k,v]) => `<div class="final-stat-row"><span>${k}</span><span>${v}</span></div>`).join('');

        const btns = $('go-buttons');
        btns.innerHTML = '';
        const tryAgain = document.createElement('button');
        tryAgain.className = 'btn btn-primary';
        tryAgain.textContent = 'New Run';
        tryAgain.onclick = () => Game.start();
        btns.appendChild(tryAgain);

        GS.challengeMode = false;
        show('screen-gameover');
    }
};

// ════════════════════════════════════════════════════════════
//  SKILL DIE — 3D CSS rotating d6
// ════════════════════════════════════════════════════════════
const SkillDie = (() => {
    // Face definitions: front=wide(+Z), right=gold(+X), back=tall(-Z), left=venom(-X)
    const SD_FACES = [
        { key: 'wide',  label: 'Wide',  color: '#5fa84f', icon: '🐺' },
        { key: 'gold',  label: 'Gold',  color: '#d4a534', icon: '💰' },
        { key: 'tall',  label: 'Tall',  color: '#d48830', icon: '🔨' },
        { key: 'venom', label: 'Venom', color: '#9050c0', icon: '🧪' },
        { key: 'heart', label: 'Heart', color: '#e05050', icon: '❤️' },
    ];
    const SD_NORMALS = [[0,0,1],[1,0,0],[0,0,-1],[-1,0,0],[0,1,0]];
    const SD_FACE_CSS = ['sd-face-front','sd-face-right','sd-face-back','sd-face-left','sd-face-top'];
    const SD_GRID = [[-1,-1],[1,-1],[-1,1],[1,1]]; // [col, row] offsets for passives
    const SD_HALF = 155, SD_GRID_PX = 98;

    let _built = false;
    let _cubeEl = null;
    let _nodeEls = {}; // id → { el, faceIdx, fData, sNode, isNotable }
    let _rotX = 0.18, _rotY = 0;
    let _velX = 0, _velY = 0;
    let _isDragging = false, _dragDist = 0;
    let _prevX = 0, _prevY = 0;
    let _pinching = false, _idleT = 0;
    let _selectedId = null;
    let _rafActive = false;
    let _callback = null, _viewMode = false, _backCallback = null;

    // ── State helpers ─────────────────────────────────────────
    const _isUnlocked = id => (GS.unlockedNodes || []).includes(id);
    const _sp = () => GS.pendingSkillPoints || 0;
    const _canAllocate = () => _sp() > 0;
    const _getSTNode = id => SKILL_TREE.find(n => n.id === id);
    const _facePrefix = fKey => fKey[0]; // 'wide'→'w', 'gold'→'g', etc.
    const _passiveIds = fKey => ['a','b','c','d'].map(s => `${_facePrefix(fKey)}_${s}`);
    const _notableId  = fKey => `${_facePrefix(fKey)}_n`;
    const _allPassives = fKey => _passiveIds(fKey).every(id => _isUnlocked(id));

    function _getAvail(id) {
        if (_isUnlocked(id) || !_canAllocate() || !_isUnlocked('root')) return false;
        const face = SD_FACES.find(f => _notableId(f.key) === id);
        return face ? _allPassives(face.key) : true; // notable needs all passives; passive is free
    }

    // ── Face visibility (dot product) ─────────────────────────
    function _faceVis() {
        const cx = Math.cos(_rotX), sx = Math.sin(_rotX);
        const cy = Math.cos(_rotY), sy = Math.sin(_rotY);
        return SD_NORMALS.map(([nx, ny, nz]) => {
            const z1 = -nx * sy + nz * cy;
            const z2 = ny * sx + z1 * cx;
            if (z2 > 0.2) return 1;
            if (z2 < -0.15) return 0;
            return (z2 + 0.15) / 0.35;
        });
    }
    function _frontFace() {
        const v = _faceVis(); let b = -1, idx = 0;
        v.forEach((x, i) => { if (x > b) { b = x; idx = i; } });
        return idx;
    }

    // ── Build DOM (once per page load) ────────────────────────
    function _build() {
        if (_built) return;
        _built = true;
        const screen = document.getElementById('screen-skill-die');

        // Reveal overlay
        const rev = document.createElement('div');
        rev.className = 'sd-reveal-overlay';
        rev.id = 'sd-reveal-overlay';
        rev.innerHTML = `
            <div class="sd-reveal-sp">⭐ <span id="sd-reveal-sp-count">0 SP</span></div>
            <div class="sd-reveal-shape" id="sd-reveal-btn">
                <div class="sd-reveal-glow"></div>
                <svg viewBox="0 0 140 140"><rect class="sd-reveal-outline" x="20" y="20" width="100" height="100" rx="8"/></svg>
                <div class="sd-reveal-emoji">🎲</div>
            </div>
            <div class="sd-reveal-title">Reveal the Die</div>
            <div class="sd-reveal-desc">Spend your first skill point to unlock the skill die</div>
            <div class="sd-reveal-effect">+1 Strike Slot · +1 Guard Slot</div>
            <div class="sd-reveal-cta">Tap to reveal</div>
            <button class="sd-done-btn sd-reveal-skip" id="sd-reveal-skip">Skip →</button>
        `;
        screen.appendChild(rev);

        document.getElementById('sd-reveal-skip').addEventListener('click', () => { _onDone(); });
        document.getElementById('sd-reveal-btn').addEventListener('click', () => {
            if (_sp() < 1) return;
            if (!_isUnlocked('root')) {
                GS.unlockedNodes.push('root');
                const rootNode = _getSTNode('root');
                if (rootNode) { rootNode.effect(GS); log(`🌟 ${rootNode.name}: ${rootNode.desc}`, 'info'); }
                GS.pendingSkillPoints = Math.max(0, _sp() - 1);
                updateStats();
                // Record as a one-time campaign milestone — next runs start with root pre-applied
                Campaign.setSkillDieRevealed();
            }
            document.getElementById('sd-reveal-overlay').classList.add('sd-hidden');
            document.getElementById('sd-main').classList.add('sd-visible');
            _updateBadge();
        });

        // Main die area
        const mainEl = document.createElement('div');
        mainEl.id = 'sd-main';
        mainEl.innerHTML = `
            <div class="sd-hud">
                <div class="sd-hud-title">⭐ Skill Die</div>
                <div class="sd-hud-badge">⭐ <span id="sd-sp-count">0 SP</span></div>
            </div>
            <div class="sd-face-indicator" id="sd-face-indicator">—</div>
            <div class="sd-hint" id="sd-hint">Drag to rotate · Tap a node to inspect</div>
            <div class="sd-scene"><div class="sd-cube" id="sd-cube"></div></div>
            <div class="sd-detail-bar" id="sd-detail-bar"></div>
        `;
        screen.appendChild(mainEl);

        _cubeEl = document.getElementById('sd-cube');
        _buildCube();
        _attachInputs(mainEl);
    }

    function _buildCube() {
        _cubeEl.innerHTML = '';
        _nodeEls = {};
        SD_FACES.forEach((fData, fi) => {
            const faceDiv = document.createElement('div');
            faceDiv.className = `sd-face ${SD_FACE_CSS[fi]}`;
            const nodesDiv = document.createElement('div');
            nodesDiv.className = 'sd-nodes';

            _passiveIds(fData.key).forEach((pid, pi) => {
                const sNode = _getSTNode(pid);
                if (!sNode) return;
                const [col, row] = SD_GRID[pi];
                const el = _makeNodeEl(pid, fData.icon, sNode.name, false);
                el.style.left = (SD_HALF + col * SD_GRID_PX) + 'px';
                el.style.top  = (SD_HALF + row * SD_GRID_PX) + 'px';
                nodesDiv.appendChild(el);
                _nodeEls[pid] = { el, faceIdx: fi, fData, sNode, isNotable: false };
            });

            const nid = _notableId(fData.key);
            const sNotable = _getSTNode(nid);
            if (sNotable) {
                const nel = _makeNodeEl(nid, '👑', sNotable.name, true);
                nel.style.left = SD_HALF + 'px';
                nel.style.top  = SD_HALF + 'px';
                nodesDiv.appendChild(nel);
                _nodeEls[nid] = { el: nel, faceIdx: fi, fData, sNode: sNotable, isNotable: true };
            }

            faceDiv.appendChild(nodesDiv);
            _cubeEl.appendChild(faceDiv);
        });

        const d = document.createElement('div');
        d.className = 'sd-face sd-face-bottom';
        d.innerHTML = `<span style="font-size:1.8em;opacity:0.12">🎲</span>`;
        _cubeEl.appendChild(d);
    }

    function _makeNodeEl(id, emoji, name, isNotable) {
        const el = document.createElement('div');
        el.className = `sd-node locked${isNotable ? ' sd-notable' : ''}`;
        if (isNotable) {
            // Capstone: SVG progress ring wrapping the circle
            el.innerHTML = `
                <div class="sd-capstone-wrap">
                    <svg class="sd-capstone-ring" viewBox="0 0 100 100">
                        <circle class="sd-ring-bg" cx="50" cy="50" r="44" />
                        <circle class="sd-ring-fill" cx="50" cy="50" r="44" />
                    </svg>
                    <div class="sd-node-diamond"><div class="sd-node-emoji">${emoji}</div></div>
                </div>
                <div class="sd-node-name">${name}</div>`;
        } else {
            el.innerHTML = `<div class="sd-node-diamond"><div class="sd-node-emoji">${emoji}</div></div><div class="sd-node-name">${name}</div>`;
        }
        el.addEventListener('click', e => { e.stopPropagation(); _handleNodeClick(id); });
        return el;
    }

    function _attachInputs(mainEl) {
        mainEl.addEventListener('mousedown', e => {
            _isDragging = true; _dragDist = 0; _velX = _velY = 0;
            _prevX = e.clientX; _prevY = e.clientY;
        });
        mainEl.addEventListener('mousemove', e => {
            if (!_isDragging) return;
            const dx = e.clientX - _prevX, dy = e.clientY - _prevY;
            _dragDist += Math.abs(dx) + Math.abs(dy);
            _velY = dx * 0.005; _velX = dy * 0.005;
            _rotY += _velY; _rotX += _velX;
            _prevX = e.clientX; _prevY = e.clientY;
        });
        mainEl.addEventListener('mouseup', e => {
            _isDragging = false;
            // Don't clear when clicking buttons inside the detail bar
            if (_dragDist < 6 && !e.target.closest('#sd-detail-bar')) {
                _selectedId = null; _clearDetail();
            }
        });
        mainEl.addEventListener('mouseleave', () => { _isDragging = false; });
        mainEl.addEventListener('touchstart', e => {
            if (e.touches.length === 2) { _pinching = true; return; }
            _isDragging = true; _dragDist = 0; _pinching = false; _velX = _velY = 0;
            _prevX = e.touches[0].clientX; _prevY = e.touches[0].clientY;
        }, { passive: false });
        mainEl.addEventListener('touchmove', e => {
            e.preventDefault();
            if (_pinching || !_isDragging || !e.touches.length) return;
            const dx = e.touches[0].clientX - _prevX, dy = e.touches[0].clientY - _prevY;
            _dragDist += Math.abs(dx) + Math.abs(dy);
            _velY = dx * 0.005; _velX = dy * 0.005;
            _rotY += _velY; _rotX += _velX;
            _prevX = e.touches[0].clientX; _prevY = e.touches[0].clientY;
        }, { passive: false });
        mainEl.addEventListener('touchend', e => {
            if (_pinching) { _pinching = false; return; }
            _isDragging = false;
            // Don't clear when tapping buttons inside the detail bar
            if (_dragDist < 12 && !e.target.closest('#sd-detail-bar')) {
                _selectedId = null; _clearDetail();
            }
        });
        mainEl.addEventListener('pointerdown', () => {
            const hint = document.getElementById('sd-hint');
            if (hint) hint.style.opacity = '0';
        }, { once: true });
    }

    // ── Node interaction ──────────────────────────────────────
    function _handleNodeClick(id) {
        if (_nodeEls[id].faceIdx !== _frontFace()) return;
        if (_selectedId === id) { _selectedId = null; _clearDetail(); return; }
        _selectedId = id;
        const { fData, sNode, isNotable } = _nodeEls[id];
        _showDetail(sNode, fData, _isUnlocked(id), _getAvail(id), isNotable);
    }

    function _doAllocate() {
        if (!_selectedId || !_getAvail(_selectedId)) return;
        const id = _selectedId;
        _selectedId = null;
        GS.unlockedNodes.push(id);
        GS.pendingSkillPoints = Math.max(0, _sp() - 1);
        const sNode = _getSTNode(id);
        if (sNode) { sNode.effect(GS); log(`🌟 ${sNode.name}: ${sNode.desc}`, 'info'); }
        updateStats();
        const { fData, isNotable } = _nodeEls[id];
        _showDetail(sNode, fData, true, false, isNotable);
        if (GS.pendingRunes && GS.pendingRunes.length > 0) {
            const rune = GS.pendingRunes.shift();
            _rafActive = false;
            showRuneAttachment(rune, _callback);
        }
    }

    // ── Detail bar ────────────────────────────────────────────
    function _showDetail(sNode, fData, isUnlocked, avail, isNotable) {
        const bar = document.getElementById('sd-detail-bar');
        if (!bar) return;
        const color = fData.color;
        const st = isUnlocked
            ? `<span class="sd-d-status" style="color:${color}">✓ UNLOCKED</span>`
            : avail
                ? `<span class="sd-d-status" style="color:#80ff80">⬆ AVAILABLE</span>`
                : `<span class="sd-d-status" style="opacity:.35">🔒 ${isNotable ? 'Need all 4 passives' : 'Locked'}</span>`;
        const allocBtn = avail ? `<button class="sd-alloc-btn" id="sd-alloc-btn">Allocate</button>` : '';
        const doneLabel = _viewMode ? '← Back' : (_sp() > 0 ? 'Skip →' : 'Continue →');
        bar.style.borderColor = isUnlocked ? color + '60' : avail ? color + '40' : 'rgba(255,255,255,.06)';
        bar.innerHTML = `
            <div class="sd-d-icon">${isNotable ? '👑' : fData.icon}</div>
            <div class="sd-d-body">
                <div><span class="sd-d-name" style="color:${color}">${sNode.name}</span>${st}</div>
                <div class="sd-d-desc">${sNode.desc}</div>
            </div>
            ${allocBtn}
            <button class="sd-done-btn" id="sd-done-btn">${doneLabel}</button>
        `;
        const aBtn = document.getElementById('sd-alloc-btn');
        if (aBtn) aBtn.addEventListener('click', _doAllocate);
        document.getElementById('sd-done-btn').addEventListener('click', _onDone);
    }

    function _clearDetail() {
        const bar = document.getElementById('sd-detail-bar');
        if (!bar) return;
        const doneLabel = _viewMode ? '← Back' : (_sp() > 0 ? 'Skip →' : 'Continue →');
        bar.style.borderColor = 'rgba(255,255,255,.06)';
        bar.innerHTML = `
            <span class="sd-placeholder">Drag to rotate · Tap a node to inspect</span>
            <button class="sd-done-btn" id="sd-done-btn">${doneLabel}</button>
        `;
        document.getElementById('sd-done-btn').addEventListener('click', _onDone);
    }

    function _onDone() { _rafActive = false; (_viewMode ? (_backCallback || _callback) : _callback)?.(); }

    // ── Visual update ─────────────────────────────────────────
    function _updateBadge() {
        const sp = _sp();
        const el = document.getElementById('sd-sp-count');
        const rel = document.getElementById('sd-reveal-sp-count');
        if (el) el.textContent = sp > 0 ? `${sp} SP` : 'No SP';
        if (rel) rel.textContent = `${sp} SP`;
    }

    // ── Capstone progress ring ──────────────────────────────
    const SD_RING_CIRC = 2 * Math.PI * 44; // circumference for r=44
    function _updateCapstoneRing(el, diamond, emojiEl, fData, state) {
        const color = fData.color;
        const nameEl = el.querySelector('.sd-node-name');
        const pIds = _passiveIds(fData.key);
        const lit = pIds.filter(pid => _isUnlocked(pid)).length;
        const frac = lit / 4;
        const ringFill = el.querySelector('.sd-ring-fill');
        const ringBg = el.querySelector('.sd-ring-bg');

        if (state === 'unlocked') {
            // Fully unlocked capstone — full ring, bright
            if (ringFill) { ringFill.style.stroke = color; ringFill.style.strokeDasharray = `${SD_RING_CIRC}`; ringFill.style.strokeDashoffset = '0'; ringFill.style.opacity = '1'; }
            if (ringBg) ringBg.style.stroke = color + '30';
            diamond.style.background = color + '55';
            diamond.style.border = `3px solid ${color}`;
            diamond.style.boxShadow = `0 0 18px ${color}66, 0 0 6px ${color}44, inset 0 0 10px ${color}22`;
            emojiEl.style.opacity = '1';
            if (nameEl) nameEl.style.color = color;
            return;
        }

        // Progress ring — fill proportional to passives unlocked
        if (ringFill) {
            ringFill.style.stroke = color;
            ringFill.style.strokeDasharray = `${SD_RING_CIRC}`;
            ringFill.style.strokeDashoffset = `${SD_RING_CIRC * (1 - frac)}`;
            ringFill.style.opacity = frac > 0 ? '1' : '0';
        }
        if (ringBg) ringBg.style.stroke = frac > 0 ? color + '18' : 'rgba(255,255,255,0.08)';

        // Inner circle background and border based on progress
        if (frac >= 1) {
            // All 4 passives — ready to allocate
            diamond.style.background = color + '20';
            diamond.style.border = `2px solid ${color}`;
            diamond.style.boxShadow = `0 0 12px ${color}55`;
            if (nameEl) nameEl.style.color = color + '99';
        } else if (frac > 0) {
            diamond.style.background = 'rgba(20,20,35,0.75)';
            diamond.style.border = `2px solid ${color}33`;
            diamond.style.boxShadow = 'none';
            if (nameEl) nameEl.style.color = color + '55';
        } else {
            diamond.style.background = 'rgba(20,20,35,0.75)';
            diamond.style.border = '2px solid rgba(255,255,255,0.10)';
            diamond.style.boxShadow = 'none';
            if (nameEl) nameEl.style.color = 'rgba(255,255,255,0.16)';
        }
        emojiEl.style.opacity = frac > 0 ? String(0.2 + frac * 0.6) : '0.12';
    }

    function _updateVisuals() {
        const vis = _faceVis();
        const ff = _frontFace();
        if (_cubeEl) _cubeEl.style.transform = `rotateX(${_rotX}rad) rotateY(${_rotY}rad)`;
        const fDef = SD_FACES[ff];
        const fiEl = document.getElementById('sd-face-indicator');
        if (fiEl) { fiEl.textContent = `▸ ${fDef.label}`; fiEl.style.color = fDef.color; }
        _updateBadge();

        Object.values(_nodeEls).forEach(({ el, faceIdx, fData, sNode, isNotable }) => {
            const v = vis[faceIdx];
            const id = sNode.id;
            const un = _isUnlocked(id);
            const avail = _getAvail(id);
            const state = un ? 'unlocked' : avail ? 'available' : 'locked';
            const color = fData.color;
            const diamond = el.querySelector('.sd-node-diamond');
            const nameEl = el.querySelector('.sd-node-name');
            const emojiEl = el.querySelector('.sd-node-emoji');

            el.style.opacity = v;
            el.style.pointerEvents = (faceIdx === ff && v > 0.5) ? 'auto' : 'none';
            el.classList.remove('locked', 'available', 'unlocked');
            el.classList.add(state);
            el.classList.toggle('sd-selected', id === _selectedId);

            if (state === 'unlocked') {
                diamond.style.background = color + '55';
                diamond.style.border = `3px solid ${color}`;
                diamond.style.boxShadow = `0 0 16px ${color}66, 0 0 4px ${color}44, inset 0 0 10px ${color}22`;
                nameEl.style.color = color;
                emojiEl.style.opacity = '1';
            } else if (state === 'available' && !isNotable) {
                diamond.style.background = color + '18';
                diamond.style.border = `2px solid ${color}88`;
                diamond.style.boxShadow = `0 0 10px ${color}44`;
                el.style.color = color; // for ::after border
                nameEl.style.color = color + '99';
                emojiEl.style.opacity = '0.85';
            } else {
                diamond.style.background = 'rgba(20,20,35,0.75)';
                diamond.style.border = '2px solid rgba(255,255,255,0.12)';
                diamond.style.boxShadow = 'none';
                nameEl.style.color = 'rgba(255,255,255,0.16)';
                emojiEl.style.opacity = '0.28';
            }

            // Notable: SVG progress ring (handled via _updateCapstoneRing)
            if (isNotable) {
                _updateCapstoneRing(el, diamond, emojiEl, fData, state);
            }
        });
    }

    // ── rAF loop ──────────────────────────────────────────────
    function _loop() {
        if (!_rafActive) return;
        if (!_isDragging && !_pinching) {
            _rotY += _velY; _rotX += _velX;
            _velX *= 0.96; _velY *= 0.96;
            if (Math.abs(_velX) < 0.0004 && Math.abs(_velY) < 0.0004) {
                _idleT += 0.002;
                _rotY += Math.sin(_idleT) * 0.0004;
            }
        }
        _updateVisuals();
        requestAnimationFrame(_loop);
    }

    // ── Public API ────────────────────────────────────────────
    function enter(callback, viewMode = false, backCallback = null) {
        _callback = callback;
        _viewMode = viewMode;
        _backCallback = backCallback;
        _build();
        // Sync reveal state with current GS
        const revealed = _isUnlocked('root');
        const revOverlay = document.getElementById('sd-reveal-overlay');
        const mainEl = document.getElementById('sd-main');
        if (revealed) {
            revOverlay.classList.add('sd-hidden');
            mainEl.classList.add('sd-visible');
        } else {
            revOverlay.classList.remove('sd-hidden');
            mainEl.classList.remove('sd-visible');
        }
        _updateBadge();
        _selectedId = null;
        _clearDetail();
        _rafActive = true;
        _loop();
        show('screen-skill-die');
    }

    function exit() { _rafActive = false; }

    return { enter, exit };
})();

// ════════════════════════════════════════════════════════════
//  REWARDS
// ════════════════════════════════════════════════════════════
const Rewards = {
    slotChoice(callback, viewMode = false, backCallback = null) {
        SkillDie.enter(callback, viewMode, backCallback);
    },

    showMergeSelection(callback) {
        $('reward-title').textContent = '🔥 Dice Forge — Select 2 Dice';
        const c = $('reward-cards');
        c.innerHTML = '';
        const selected = [];

        const previewDiv = document.createElement('div');
        previewDiv.style.cssText = 'text-align:center; margin-bottom:16px; min-height:40px; font-family:JetBrains Mono, monospace; color:var(--gold);';
        previewDiv.id = 'merge-preview';
        c.appendChild(previewDiv);

        const grid = document.createElement('div');
        grid.style.cssText = 'display:flex; flex-wrap:wrap; gap:12px; justify-content:center; margin-bottom:16px;';
        GS.dice.forEach(die => {
            const el = document.createElement('div');
            el.className = 'die'; el.style.cursor = 'pointer'; el.style.width = '70px'; el.style.height = '70px'; el.style.fontSize = '1.1em';
            const facesStr = die.faceMods.length ? ` ${die.faceMods.map(m => m.mod.icon).join('')}` : '';
            el.innerHTML = `<span class="die-label">${die.min}-${die.max}</span>d${die.sides}${facesStr}`;
            el.onclick = () => {
                const idx = selected.indexOf(die);
                if (idx >= 0) { selected.splice(idx, 1); el.style.borderColor = ''; el.style.boxShadow = ''; }
                else if (selected.length < 2) { selected.push(die); el.style.borderColor = 'var(--gold)'; el.style.boxShadow = '0 0 12px var(--gold)'; }
                updatePreview();
            };
            grid.appendChild(el);
        });
        c.appendChild(grid);

        const confirmBtn = document.createElement('button');
        confirmBtn.className = 'btn'; confirmBtn.textContent = 'Forge These Dice';
        confirmBtn.disabled = true; confirmBtn.style.opacity = '0.5';
        confirmBtn.onclick = () => { if (selected.length === 2) Rewards.showForgeScreen(selected[0], selected[1], callback); };
        c.appendChild(confirmBtn);

        function updatePreview() {
            const preview = $('merge-preview');
            if (selected.length === 2) {
                const [d1, d2] = selected;
                const nMin = d1.min + d2.min, nMax = d1.max + d2.max, st = (nMax - nMin) / 5;
                const vals = Array.from({length: 6}, (_, i) => Math.round(nMin + st * i));
                const tf = d1.faceMods.length + d2.faceMods.length;
                preview.innerHTML = `[${d1.min}-${d1.max}] + [${d2.min}-${d2.max}] → <strong>[${nMin}-${nMax}]</strong> d6<br><span style="font-size:0.85em; opacity:0.7;">Values: ${vals.join(', ')} | ${tf} source face mod(s)</span>`;
                confirmBtn.disabled = false; confirmBtn.style.opacity = '1';
            } else if (selected.length === 1) {
                preview.textContent = `Selected: [${selected[0].min}-${selected[0].max}] — pick one more`;
                confirmBtn.disabled = true; confirmBtn.style.opacity = '0.5';
            } else {
                preview.textContent = 'Click 2 dice to forge'; confirmBtn.disabled = true; confirmBtn.style.opacity = '0.5';
            }
        }
        updatePreview();
        show('screen-reward');
    },

    showForgeScreen(d1, d2, callback) {
        $('reward-title').textContent = '🔥 Forge — Map Faces to New Die';
        const c = $('reward-cards');
        c.innerHTML = '';

        const newMin = d1.min + d2.min, newMax = d1.max + d2.max;
        const step = (newMax - newMin) / 5;
        const newValues = Array.from({length: 6}, (_, i) => Math.round(newMin + step * i));

        const slots = newValues.map(v => ({ value: v, mod: null }));
        const sourcePool = [];
        d1.faceMods.forEach((fm, i) => sourcePool.push({ id: `a${i}`, mod: { ...fm.mod }, fromDie: d1, assigned: -1 }));
        d2.faceMods.forEach((fm, i) => sourcePool.push({ id: `b${i}`, mod: { ...fm.mod }, fromDie: d2, assigned: -1 }));

        let selectedSrc = null;

        const info = document.createElement('div');
        info.style.cssText = 'text-align:center; margin-bottom:8px; font-family:EB Garamond, serif; color:var(--text-dim); font-size:0.85em;';
        info.innerHTML = `Forging: <strong style="color:var(--gold)">[${newMin}-${newMax}]</strong> d6<br>Click a source face mod, then a die face to place it on. One mod per face.`;
        c.appendChild(info);

        const poolLabel = document.createElement('div');
        poolLabel.style.cssText = 'font-family:JetBrains Mono, monospace; font-size:0.7em; color:var(--text-dim); margin:8px 0 4px; text-align:center;';
        poolLabel.textContent = 'SOURCE FACES — click to select';
        c.appendChild(poolLabel);
        const poolDiv = document.createElement('div');
        poolDiv.style.cssText = 'display:flex; flex-wrap:wrap; gap:8px; justify-content:center; margin-bottom:12px; min-height:50px;';
        c.appendChild(poolDiv);

        const slotLabel = document.createElement('div');
        slotLabel.style.cssText = 'font-family:JetBrains Mono, monospace; font-size:0.7em; color:var(--text-dim); margin:4px 0; text-align:center;';
        slotLabel.textContent = 'NEW DIE FACES — click to assign or remove';
        c.appendChild(slotLabel);
        const slotsDiv = document.createElement('div');
        slotsDiv.style.cssText = 'display:flex; flex-wrap:wrap; gap:8px; justify-content:center; margin-bottom:16px;';
        c.appendChild(slotsDiv);

        const forgeBtn = document.createElement('button');
        forgeBtn.className = 'btn';
        forgeBtn.textContent = 'Complete Forge';
        forgeBtn.style.cssText = 'display:block; margin:0 auto;';
        forgeBtn.onclick = () => {
            GS.dice = GS.dice.filter(d => d.id !== d1.id && d.id !== d2.id);
            const merged = createDie(newMin, newMax, 6);
            slots.forEach((slot, i) => {
                if (slot.mod) merged.faceMods.push({ faceIndex: i, mod: { ...slot.mod } });
            });
            GS.dice.push(merged);
            const fs = merged.faceMods.length ? ` [${merged.faceMods.map(m => `face${m.faceIndex}:${m.mod.icon}`).join(', ')}]` : '';
            log(`🔥 Forged: [${newMin}-${newMax}] d6${fs}`, 'info');
            updateStats();
            callback();
        };
        c.appendChild(forgeBtn);

        function render() {
            poolDiv.innerHTML = '';
            const unassigned = sourcePool.filter(s => s.assigned < 0);
            if (unassigned.length === 0) {
                poolDiv.innerHTML = `<div style="color:var(--text-dim); font-size:0.8em; padding:12px;">${sourcePool.length > 0 ? 'All faces assigned!' : 'No source faces — plain die'}</div>`;
            }
            unassigned.forEach(src => {
                const el = document.createElement('div');
                const isSel = selectedSrc === src.id;
                el.style.cssText = `width:58px; height:58px; border-radius:8px; display:flex; flex-direction:column; align-items:center; justify-content:center; cursor:pointer; border:2px solid ${isSel ? 'var(--gold)' : src.mod.color}; background:${isSel ? 'rgba(212,165,52,0.2)' : 'rgba(0,0,0,0.3)'}; box-shadow:${isSel ? '0 0 10px var(--gold)' : 'none'}; transition:all 0.15s;`;
                el.innerHTML = `<span style="font-size:1.2em;">${src.mod.icon}</span><span style="font-size:0.5em; opacity:0.6; text-align:center;">${src.mod.name}</span>`;
                el.title = `${src.mod.name}: ${src.mod.desc} (from [${src.fromDie.min}-${src.fromDie.max}])`;
                el.onclick = () => { selectedSrc = selectedSrc === src.id ? null : src.id; render(); };
                poolDiv.appendChild(el);
            });

            slotsDiv.innerHTML = '';
            slots.forEach((slot, si) => {
                const el = document.createElement('div');
                const has = slot.mod !== null;
                let content = `<div style="font-size:0.65em; opacity:0.4;">val ${slot.value}</div>`;
                if (!slot.mod) {
                    content += `<div style="font-size:1.1em; opacity:0.25;">—</div>`;
                } else {
                    content += `<div style="font-size:1.2em;">${slot.mod.icon}</div><div style="font-size:0.45em; color:${slot.mod.color};">${slot.mod.name}</div>`;
                }
                el.style.cssText = `width:68px; height:72px; border-radius:8px; display:flex; flex-direction:column; align-items:center; justify-content:center; cursor:pointer; border:2px solid ${has ? 'var(--gold)' : 'rgba(255,255,255,0.12)'}; background:${has ? 'rgba(212,165,52,0.08)' : 'rgba(0,0,0,0.3)'}; transition:all 0.15s;`;
                el.innerHTML = content;
                el.onclick = () => {
                    if (selectedSrc !== null && slot.mod === null) {
                        const src = sourcePool.find(s => s.id === selectedSrc);
                        if (src) { slot.mod = { ...src.mod }; src.assigned = si; selectedSrc = null; }
                    } else if (slot.mod !== null && selectedSrc === null) {
                        const src = sourcePool.find(s => s.assigned === si);
                        if (src) src.assigned = -1;
                        slot.mod = null;
                    }
                    render();
                };
                slotsDiv.appendChild(el);
            });
        }
        render();
        show('screen-reward');
    },

    showRuneSelection(callback) {
        $('reward-title').textContent = '🔮 Choose a Rune';
        const c = $('reward-cards');
        c.innerHTML = '';

        const info = document.createElement('div');
        info.style.cssText = 'text-align:center; margin-bottom:16px; color:var(--text-dim); font-family:EB Garamond,serif;';
        info.textContent = 'Pick a rune to attach to one of your dice.';
        c.appendChild(info);

        const runeGrid = document.createElement('div');
        runeGrid.style.cssText = 'display:flex; flex-wrap:wrap; gap:10px; justify-content:center;';

        const choices = shuffle([...RUNES]).slice(0, 3);
        choices.forEach(rune => {
            const card = document.createElement('div');
            card.className = 'card';
            card.style.cssText = `width:160px; border-color:${rune.color};`;
            card.innerHTML = `
                <div class="card-title" style="color:${rune.color};">${rune.icon} ${rune.name}</div>
                <div class="card-desc">${rune.desc}</div>
                <div class="card-effect" style="font-size:0.78em; opacity:0.7;">Best for: ${rune.slot === 'either' ? 'any zone' : rune.slot + ' zone'}</div>
            `;
            card.onclick = () => showRuneAttachment(rune, callback);
            runeGrid.appendChild(card);
        });

        c.appendChild(runeGrid);
        show('screen-reward');
    },

    show() {
        updateStats();
        $('reward-title').textContent = 'Victory — Choose Your Reward';
        const c = $('reward-cards');
        c.innerHTML = '';

        const rewards = [];

        const totalSlots = GS.slots.strike.length + GS.slots.guard.length;
        rewards.push({ title: '🎲 New Die', desc: `Add a D6 (1-6) — you have ${GS.dice.length} dice, ${totalSlots} slots`, action: () => {
            GS.dice.push(createDie(1, 6));
            log('Added new D6!', 'info');
            Game.nextFloor();
        }});

        const healAmt = Math.min(20, GS.maxHp - GS.hp);
        if (healAmt > 0) {
            rewards.push({ title: '❤️ Heal', desc: `Restore ${healAmt} HP`, action: () => {
                heal(healAmt);
                log(`Healed ${healAmt} HP`, 'heal');
                updateStats();
                Game.nextFloor();
            }});
        }

        rewards.push({ title: '⬆️ Upgrade Die', desc: 'Increase a die\'s range by +1/+1', action: () => {
            Rewards.showDieUpgrade();
        }});

        rewards.push({ title: '💰 Loot', desc: `Gain ${12 + GS.floor * 4} gold`, action: () => {
            const g = gainGold(12 + GS.floor * 4);
            log(`+${g} gold`, 'info');
            updateStats();
            Game.nextFloor();
        }});

        if (GS.dice.length >= 5) {
            rewards.push({ title: '🔨 Sacrifice Dice', desc: `Destroy 3 dice → +1 Strike or Guard slot (${GS.dice.length} dice)`, action: () => {
                Rewards.showDiceSacrifice(() => Game.nextFloor());
            }});
        }

        rewards.forEach(r => {
            const card = document.createElement('div');
            card.className = 'card';
            card.innerHTML = `<div class="card-title">${r.title}</div><div class="card-desc">${r.desc}</div>`;
            card.onclick = r.action;
            c.appendChild(card);
        });

        show('screen-reward');
    },

    showDieUpgrade() {
        $('reward-title').textContent = 'Choose a Die to Upgrade';
        const c = $('reward-cards');
        c.innerHTML = '';

        const hammer = GS.tempBuffs && GS.tempBuffs.mastersHammer;
        GS.dice.forEach((die, i) => {
            const nextMin = die.min + (hammer ? 2 : 1);
            const nextMax = die.max + (hammer ? 2 : 1);
            const card = document.createElement('div');
            card.className = 'card';
            card.innerHTML = renderDieCard(die, i, {
                extraDesc: `<div class="card-effect" style="text-align:center;">→ ${nextMin}–${nextMax}${hammer ? ' ⚒️' : ''}</div>`
            });
            card.onclick = () => {
                applyUpgrade(die);
                log(`Upgraded die to ${die.min}-${die.max}!${hammer ? ' (Master\'s Hammer)' : ''}`, 'info');
                Game.nextFloor();
            };
            c.appendChild(card);
        });

        const back = document.createElement('div');
        back.className = 'card';
        back.innerHTML = `<div class="card-title">← Back</div>`;
        back.onclick = () => Rewards.show();
        c.appendChild(back);

        show('screen-reward');
    },

    showDiceSacrifice(callback) {
        $('reward-title').textContent = '🔨 Sacrifice Dice — Select 3 to Destroy';
        const c = $('reward-cards');
        c.innerHTML = '';

        const selected = [];

        const info = document.createElement('div');
        info.style.cssText = 'text-align:center; margin-bottom:12px; font-family:EB Garamond, serif; color:var(--text-dim); font-size:0.9em;';
        info.innerHTML = `Destroy 3 dice to gain <strong style="color:var(--gold);">+1 slot</strong> of your choice. Pick wisely — they're gone forever.`;
        c.appendChild(info);

        const preview = document.createElement('div');
        preview.style.cssText = 'text-align:center; margin-bottom:8px; font-family:JetBrains Mono, monospace; color:var(--gold); min-height:24px; font-size:0.85em;';
        preview.textContent = 'Select 3 dice...';
        c.appendChild(preview);

        const grid = document.createElement('div');
        grid.style.cssText = 'display:flex; flex-wrap:wrap; gap:10px; justify-content:center; margin-bottom:16px;';

        GS.dice.forEach((die, idx) => {
            const el = document.createElement('div');
            el.className = 'die';
            el.style.cssText = 'cursor:pointer; width:65px; height:65px; font-size:1em;';
            const facesStr = die.faceMods.length ? ` ${die.faceMods.map(m => m.mod.icon).join('')}` : '';
            el.innerHTML = `<span class="die-label">${die.min}-${die.max}</span>${facesStr}`;
            el.onclick = () => {
                const i = selected.indexOf(idx);
                if (i >= 0) {
                    selected.splice(i, 1);
                    el.style.borderColor = '';
                    el.style.boxShadow = '';
                } else if (selected.length < 3) {
                    selected.push(idx);
                    el.style.borderColor = '#ff4444';
                    el.style.boxShadow = '0 0 10px rgba(255,60,60,0.5)';
                }
                preview.textContent = selected.length < 3
                    ? `Selected ${selected.length}/3 dice...`
                    : `3 dice selected — choose zone below`;
                slotBtns.style.display = selected.length === 3 ? 'flex' : 'none';
            };
            grid.appendChild(el);
        });
        c.appendChild(grid);

        const slotBtns = document.createElement('div');
        slotBtns.style.cssText = 'display:none; gap:12px; justify-content:center; margin-top:8px;';

        const makeBtn = (label, type) => {
            const btn = document.createElement('button');
            btn.className = 'btn btn-primary';
            btn.innerHTML = label;
            btn.onclick = () => {
                selected.sort((a, b) => b - a).forEach(i => GS.dice.splice(i, 1));
                if (type === 'strike') GS.slots.strike.push({ id: `str-${Date.now()}`, runes: [] });
                else GS.slots.guard.push({ id: `grd-${Date.now()}`, runes: [] });
                log(`🔨 Sacrificed 3 dice for +1 ${type} slot!`, 'info');
                updateStats();
                callback();
            };
            return btn;
        };
        slotBtns.appendChild(makeBtn(`⚔️ +1 Strike Slot (${GS.slots.strike.length} → ${GS.slots.strike.length + 1})`, 'strike'));
        slotBtns.appendChild(makeBtn(`🛡️ +1 Guard Slot (${GS.slots.guard.length} → ${GS.slots.guard.length + 1})`, 'guard'));
        c.appendChild(slotBtns);

        const back = document.createElement('div');
        back.className = 'card';
        back.style.cssText = 'margin-top:8px; max-width:120px; margin-left:auto; margin-right:auto;';
        back.innerHTML = `<div class="card-title">← Back</div>`;
        back.onclick = () => Rewards.show();
        c.appendChild(back);

        show('screen-reward');
    },

    artifactChoice(thenReward = false, picksRemaining = 1) {
        updateStats();
        const pickLabel = picksRemaining > 1 ? ` (Pick ${GS._artifactPickTotal - picksRemaining + 1} of ${GS._artifactPickTotal})` : '';
        $('reward-title').textContent = `✨ Artifact Drop${pickLabel}`;
        const c = $('reward-cards');
        c.innerHTML = '';

        const choices = _pickArtifactChoices();

        const afterPick = () => {
            updateStats();
            if (picksRemaining > 1) {
                Rewards.artifactChoice(thenReward, picksRemaining - 1);
            } else if (thenReward) {
                Rewards.show();
            } else {
                Game.nextFloor();
            }
        };

        choices.forEach(art => {
            const card = document.createElement('div');
            card.className = 'card';
            if (art.legendary) card.style.cssText = 'border-color: #d4a534; box-shadow: 0 0 12px rgba(212,165,52,0.4);';
            card.innerHTML = `
                <div class="card-title">${art.icon} ${art.name}${art.legendary ? ' <span style="color:#d4a534; font-size:0.75em;">✨ LEGENDARY</span>' : ''}</div>
                <div class="card-desc">${art.desc}</div>
            `;
            card.onclick = () => {
                GS.artifacts.push(art);
                _applyArtifactOnAcquire(art);
                log(`✨ Acquired ${art.icon} ${art.name}!`, 'info');
                afterPick();
            };
            c.appendChild(card);
        });

        show('screen-reward');
    }
};

// ════════════════════════════════════════════════════════════
//  BATTLE SUMMARY — Unified post-battle screen
// ════════════════════════════════════════════════════════════
const BattleSummary = {
    _pendingSections: 0,
    _consumableHandled: false,

    show() {
        const summary = GS.battleSummary;
        if (!summary) { Game.nextFloor(); return; }

        updateStats();
        $('bs-title').textContent = `${summary.enemyName} Defeated!`;
        const content = $('bs-content');
        content.innerHTML = '';

        BattleSummary._pendingSections = 0;
        BattleSummary._consumableHandled = false;

        // ── LOOT SECTION ──
        const lootSection = document.createElement('div');
        lootSection.className = 'bs-section';
        lootSection.innerHTML = `<div class="bs-section-title">Loot Earned</div>`;
        summary.loot.forEach(item => {
            const row = document.createElement('div');
            row.className = 'bs-loot-row' + (item.isConsumable ? ' bs-loot-consumable' : '');
            row.innerHTML = `<span style="font-size:1.2em;">${item.icon}</span><span>${item.text}</span>`;
            lootSection.appendChild(row);
        });
        if (summary.bonuses.length > 0) {
            const bonusDiv = document.createElement('div');
            bonusDiv.style.cssText = 'margin-top:8px; padding-top:8px; border-top:1px solid var(--border);';
            summary.bonuses.forEach(b => {
                const row = document.createElement('div');
                row.className = 'bs-loot-row';
                row.style.fontSize = '0.85em';
                row.style.color = 'var(--text-dim)';
                row.innerHTML = `<span style="font-size:1.1em;">${b.icon}</span><span>${b.text}</span>`;
                bonusDiv.appendChild(row);
            });
            lootSection.appendChild(bonusDiv);
        }
        content.appendChild(lootSection);

        // ── PLAYER STATE SECTION ──
        const stateSection = document.createElement('div');
        stateSection.className = 'bs-section';
        stateSection.innerHTML = `
            <div class="bs-section-title">Current State</div>
            <div class="bs-stat-grid">
                <span>❤️ HP: ${GS.hp}/${GS.maxHp}</span>
                <span>💰 Gold: ${GS.gold}</span>
                <span>⚔️ Strike Slots: ${GS.slots.strike.length}</span>
                <span>🛡️ Guard Slots: ${GS.slots.guard.length}</span>
                <span>🎲 Dice: ${GS.dice.length}</span>
                <span>⭐ Level: ${GS.level} (${GS.xp}/${GS.xpNext})</span>
            </div>
        `;
        content.appendChild(stateSection);

        // ── Handle consumable drop before showing reward sections ──
        if (summary.consumableDrop) {
            const filled = GS.consumables.filter(x => x !== null).length;
            if (filled < GS.consumableSlots) {
                addConsumableToInventory(summary.consumableDrop);
                BattleSummary._consumableHandled = true;
            }
            // If inventory is full, consumable swap overlay will appear later
            // We handle it after reward sections are built
        }

        // ── REWARD SECTIONS ──
        // Track how many reward sections need completion
        const hasSkillPoints = (GS.pendingSkillPoints || 0) > 0;
        const hasArtifact = summary.isElite || summary.isBoss;
        const hasGeneralReward = true; // always have a general reward choice

        if (hasSkillPoints) BattleSummary._pendingSections++;
        if (hasArtifact) BattleSummary._pendingSections++;
        BattleSummary._pendingSections++; // general reward

        // ── SKILL POINT SECTION ──
        if (hasSkillPoints) {
            const skillSection = document.createElement('div');
            skillSection.className = 'bs-reward-section';
            skillSection.id = 'bs-skill-section';
            const pointsAvail = GS.pendingSkillPoints || 0;
            skillSection.innerHTML = `
                <div class="bs-section-title">⭐ Skill Die (${pointsAvail} point${pointsAvail > 1 ? 's' : ''} available)</div>
                <div class="bs-locked-summary"></div>
                <div class="bs-reward-choices">
                    <div class="card" id="bs-skill-open" style="flex:1; text-align:center;">
                        <div class="card-title">⭐ Allocate Passives</div>
                        <div class="card-desc">${pointsAvail} skill point${pointsAvail > 1 ? 's' : ''} to spend on the skill die</div>
                    </div>
                </div>
            `;
            content.appendChild(skillSection);

            // Wire up skill allocation button
            setTimeout(() => {
                const openBtn = $('bs-skill-open');
                if (openBtn) openBtn.onclick = () => BattleSummary._openSkillDie();
            }, 0);
        }

        // ── ARTIFACT SECTION ──
        if (hasArtifact) {
            // Determine how many artifact picks (elite boss modifiers grant 2)
            const artMods = GS.encounter?.enemy?.appliedModifiers || [];
            const artPicks = GS.encounter?.isElite && GS.encounter?.isBossFloor
                ? Math.max(1, ...artMods.map(m => m.artifactPicks || 1))
                : 1;
            GS._artifactPickTotal = artPicks;

            const artSection = document.createElement('div');
            artSection.className = 'bs-reward-section';
            artSection.id = 'bs-artifact-section';
            artSection.innerHTML = `
                <div class="bs-section-title">✨ ${artPicks > 1 ? `Artifact Drops (${artPicks} picks)` : 'Artifact Drop'}</div>
                <div class="bs-locked-summary"></div>
                <div class="bs-reward-choices" id="bs-artifact-choices"></div>
            `;
            content.appendChild(artSection);
            BattleSummary._buildArtifactChoices(artPicks);
        }

        // ── GENERAL REWARD SECTION ──
        const generalSection = document.createElement('div');
        generalSection.className = 'bs-reward-section';
        generalSection.id = 'bs-general-section';
        generalSection.innerHTML = `
            <div class="bs-section-title">Reward Choice</div>
            <div class="bs-locked-summary"></div>
            <div class="bs-reward-choices" id="bs-general-choices"></div>
        `;
        content.appendChild(generalSection);
        BattleSummary._buildGeneralChoices();

        // ── CONTINUE BUTTON (hidden until all sections complete) ──
        const contRow = document.createElement('div');
        contRow.className = 'bs-continue-row';
        contRow.id = 'bs-continue-row';
        contRow.style.display = 'none';
        contRow.innerHTML = `<button class="btn btn-primary" id="bs-continue-btn">Continue →</button>`;
        content.appendChild(contRow);
        setTimeout(() => {
            const btn = $('bs-continue-btn');
            if (btn) btn.onclick = () => {
                GS.battleSummary = null;
                Game.nextFloor();
            };
        }, 0);

        // Now handle consumable swap if inventory was full
        if (summary.consumableDrop && !BattleSummary._consumableHandled) {
            setTimeout(() => {
                addConsumableToInventory(summary.consumableDrop);
            }, 100);
        }

        show('screen-battle-summary');
    },

    _openSkillDie() {
        const done = () => {
            const section = $('bs-skill-section');
            if (section) {
                section.classList.add('locked');
                const locked = section.querySelector('.bs-locked-summary');
                const unlocked = SKILL_TREE.filter(n => GS.unlockedNodes.includes(n.id));
                const recent = unlocked.slice(-3);
                locked.innerHTML = `✓ Passives allocated: ${recent.map(n => `${n.icon} ${n.name}`).join(', ')}${unlocked.length > 3 ? '...' : ''}`;
            }
            BattleSummary._pendingSections--;
            BattleSummary._checkComplete();
            updateStats();
            show('screen-battle-summary');
        };
        SkillDie.enter(done);
    },

    _buildArtifactChoices(picksRemaining = 1) {
        const choicesEl = $('bs-artifact-choices');
        if (!choicesEl) return;
        choicesEl.innerHTML = '';

        // Update section header if multiple picks
        if (GS._artifactPickTotal > 1) {
            const header = $('bs-artifact-section')?.querySelector('.bs-section-title');
            if (header) header.textContent = `✨ Choose Artifact (Pick ${GS._artifactPickTotal - picksRemaining + 1} of ${GS._artifactPickTotal})`;
        }

        const choices = _pickArtifactChoices();

        choices.forEach(art => {
            const card = document.createElement('div');
            card.className = 'card';
            if (art.legendary) card.style.cssText = 'border-color: #d4a534; box-shadow: 0 0 12px rgba(212,165,52,0.4);';
            card.innerHTML = `
                <div class="card-title">${art.icon} ${art.name}${art.legendary ? ' <span style="color:#d4a534; font-size:0.75em;">✨ LEGENDARY</span>' : ''}</div>
                <div class="card-desc">${art.desc}</div>
            `;
            card.onclick = () => {
                GS.artifacts.push(art);
                _applyArtifactOnAcquire(art);
                log(`✨ Acquired ${art.icon} ${art.name}!`, 'info');
                updateStats();

                if (picksRemaining > 1) {
                    // More picks remaining — re-render with next set of choices
                    BattleSummary._buildArtifactChoices(picksRemaining - 1);
                } else {
                    // Final pick — lock section
                    const section = $('bs-artifact-section');
                    if (section) {
                        section.classList.add('locked');
                        const locked = section.querySelector('.bs-locked-summary');
                        locked.textContent = `✓ Acquired: ${art.icon} ${art.name}`;
                    }
                    BattleSummary._pendingSections--;
                    BattleSummary._checkComplete();
                }
            };
            choicesEl.appendChild(card);
        });
    },

    _buildGeneralChoices() {
        const choicesEl = $('bs-general-choices');
        if (!choicesEl) return;

        const lockGeneral = (text) => {
            const section = $('bs-general-section');
            if (section) {
                section.classList.add('locked');
                const locked = section.querySelector('.bs-locked-summary');
                locked.textContent = `✓ ${text}`;
            }
            updateStats();
            BattleSummary._pendingSections--;
            BattleSummary._checkComplete();
        };

        const rewards = [];
        const totalSlots = GS.slots.strike.length + GS.slots.guard.length;

        rewards.push({ title: '🎲 New Die', desc: `Add a D6 (1-6) — ${GS.dice.length} dice, ${totalSlots} slots`, action: () => {
            GS.dice.push(createDie(1, 6));
            log('Added new D6!', 'info');
            lockGeneral('New D6 (1-6) added');
        }});

        const healAmt = Math.min(20, GS.maxHp - GS.hp);
        if (healAmt > 0) {
            rewards.push({ title: '❤️ Heal', desc: `Restore ${healAmt} HP`, action: () => {
                heal(healAmt);
                log(`Healed ${healAmt} HP`, 'heal');
                lockGeneral(`Healed ${healAmt} HP`);
            }});
        }

        rewards.push({ title: '⬆️ Upgrade Die', desc: 'Increase a die\'s range by +1/+1', action: () => {
            BattleSummary._showSubChoice('upgrade', lockGeneral);
        }});

        rewards.push({ title: '💰 Loot', desc: `Gain ${12 + GS.floor * 4} gold`, action: () => {
            const g = gainGold(12 + GS.floor * 4);
            log(`+${g} gold`, 'info');
            lockGeneral(`+${g} gold looted`);
        }});

        if (GS.dice.length >= 5) {
            rewards.push({ title: '🔨 Sacrifice Dice', desc: `Destroy 3 dice → +1 slot (${GS.dice.length} dice)`, action: () => {
                BattleSummary._showSubChoice('sacrifice', lockGeneral);
            }});
        }

        rewards.forEach(r => {
            const card = document.createElement('div');
            card.className = 'card';
            card.innerHTML = `<div class="card-title">${r.title}</div><div class="card-desc">${r.desc}</div>`;
            card.onclick = r.action;
            choicesEl.appendChild(card);
        });
    },

    _showSubChoice(type, lockCallback) {
        // Show die upgrade or sacrifice on the reward screen, then return
        if (type === 'upgrade') {
            Rewards.showDieUpgrade();
            // Override Game.nextFloor temporarily to return to summary
            const origNext = Game.nextFloor;
            Game.nextFloor = () => {
                Game.nextFloor = origNext;
                lockCallback('Die upgraded');
                show('screen-battle-summary');
            };
        } else if (type === 'sacrifice') {
            Rewards.showDiceSacrifice(() => {
                lockCallback('Dice sacrificed for +1 slot');
                show('screen-battle-summary');
            });
            // Override Game.nextFloor for the back button
            const origNext = Game.nextFloor;
            Game.nextFloor = () => {
                Game.nextFloor = origNext;
                lockCallback('Dice sacrificed for +1 slot');
                show('screen-battle-summary');
            };
        }
    },

    _checkComplete() {
        if (BattleSummary._pendingSections <= 0) {
            const contRow = $('bs-continue-row');
            if (contRow) contRow.style.display = 'block';
        }
    }
};

// ════════════════════════════════════════════════════════════
//  SHOP
// ════════════════════════════════════════════════════════════
const Shop = {
    items: [],
    purchased: new Set(),
    refreshCount: 0,
    tab: 'forge',
    marketItems: [],
    marketPurchased: new Set(),
    marketRefreshCount: 0,

    enter() {
        Shop.purchased = new Set();
        Shop.refreshCount = 0;
        Shop.tab = 'forge';
        Shop.marketPurchased = new Set();
        Shop.marketRefreshCount = 0;
        Shop.generateItems();
        Shop.generateMarket();
        Shop.render();
        show('screen-shop');
    },

    switchTab(tab) {
        Shop.tab = tab;
        const forgeBtn = document.getElementById('tab-forge');
        const marketBtn = document.getElementById('tab-market');
        const forgeEl = document.getElementById('shop-forge-content');
        const marketEl = document.getElementById('shop-market-content');
        if (forgeBtn) forgeBtn.classList.toggle('active', tab === 'forge');
        if (marketBtn) marketBtn.classList.toggle('active', tab === 'market');
        if (forgeEl) forgeEl.style.display = tab === 'forge' ? '' : 'none';
        if (marketEl) marketEl.style.display = tab === 'market' ? '' : 'none';
    },

    generateMarket() {
        Shop.marketItems = pickConsumablesForMarket(5);
    },

    generateItems() {
        let discount = GS.passives.shopDiscount || 0;
        if (GS.tempBuffs && GS.tempBuffs.merchantEscort) discount += 0.5;
        const applyDiscount = p => Math.floor(p * (1 - Math.min(discount, 0.5)));
        const totalSlots = GS.slots.strike.length + GS.slots.guard.length;

        const RARITY_WEIGHTS = { common: 3, uncommon: 2, rare: 1 };

        const all = [
            { title: '🎲 Weighted Die', desc: `Rolls 2-7 (${GS.dice.length} dice, ${totalSlots} slots)`, price: 35, type: 'DICE', rarity: 'common',
              effect: 'Adds a 2-7 die to your pool',
              action: () => { GS.dice.push(createDie(2, 7)); log('Bought Weighted Die (2-7)!', 'info'); } },
            { title: '💎 Power Die', desc: `Rolls 4-9 (${GS.dice.length} dice, ${totalSlots} slots)`, price: 80, type: 'DICE', rarity: 'uncommon',
              effect: 'Adds a 4-9 die to your pool',
              action: () => { GS.dice.push(createDie(4, 9)); log('Bought Power Die (4-9)!', 'info'); } },
            { title: '⬆️ Die Upgrade', desc: 'Improve one die\'s range', price: 50, type: 'UPGRADE', rarity: 'uncommon',
              effect: '+1/+1 to a die', action: () => { Shop.showUpgrade(); return false; } },
            { title: '🗡️ Blade Oil', desc: 'Sharpen your blades permanently', price: 25, type: 'BUFF', rarity: 'common',
              effect: '+3 attack damage', action: () => { GS.buffs.damageBoost += 3; log('+3 attack damage!', 'info'); } },
            { title: '🛡️ Iron Plate', desc: 'Fortify your defences permanently', price: 30, type: 'BUFF', rarity: 'common',
              effect: '+2 armor', action: () => { GS.buffs.armor += 2; log('+2 armor!', 'info'); } },
        ];

        const hasTrimmable = GS.dice.some(d => d.faceValues && d.faceValues.length > 3);
        if (hasTrimmable) {
            all.push({
                title: '✂️ Face Trim', desc: 'Remove a face from a die (d6→d5)', price: 40, type: 'SERVICE', rarity: 'uncommon',
                effect: 'Reduce die sides, increase consistency', action: () => { Shop.showFaceRemoval(); return false; }
            });
        }

        if (GS.act >= 2) {
            all.push(
                { title: '⚡ Titan Die', desc: `Rolls 6-11 (${GS.dice.length} dice, ${totalSlots} slots)`, price: 150, type: 'DICE', rarity: 'rare',
                  effect: 'Adds a 6-11 die to your pool',
                  action: () => { GS.dice.push(createDie(6, 11)); log('Bought Titan Die (6-11)!', 'info'); } },
            );
        }

        FACE_MODS.forEach(mod => {
            all.push({
                title: `${mod.icon} ${mod.name} Face`, desc: `Add to any die face`, price: 35,
                type: 'FACE MOD', effect: mod.desc, rarity: mod.rarity,
                action: () => { Shop.showFaceModPurchase(mod); return false; },
                modifier: mod
            });
        });

        RUNES.forEach(rune => {
            all.push({
                title: `${rune.icon} ${rune.name}`, desc: `Rune — ${rune.desc}`, price: 80,
                type: 'RUNE', effect: rune.desc, rarity: rune.rarity,
                action: () => {
                    showRuneAttachment(rune, () => { Shop.render(); show('screen-shop'); });
                    return false;
                },
            });
        });

        UTILITY_DICE.forEach(utDef => {
            all.push({
                title: `${utDef.icon} ${utDef.name}`,
                desc: `Utility die (${utDef.zone}) — ${utDef.desc}`,
                price: utDef.price,
                type: 'UTILITY DIE', effect: utDef.desc, rarity: utDef.rarity,
                action: () => { GS.dice.push(createUtilityDie(utDef)); log(`Bought ${utDef.icon} ${utDef.name}!`, 'info'); },
            });
        });

        const shopSlots = (GS.tempBuffs && GS.tempBuffs.shopReduced) ? 3 : 6;
        if (GS.tempBuffs && GS.tempBuffs.shopReduced) GS.tempBuffs.shopReduced = false;
        Shop.items = pickWeighted(all, shopSlots, item => RARITY_WEIGHTS[item.rarity] ?? 2).map(item => ({
            ...item,
            price: applyDiscount(item.price)
        }));
    },

    render() {
        updateStats();
        Shop.switchTab(Shop.tab);
        Shop._renderForge();
        Shop._renderMarket();
    },

    _renderForge() {
        const c = $('shop-cards');
        if (!c) return;
        c.innerHTML = '';

        Shop.items.forEach((item, i) => {
            const bought = Shop.purchased.has(i);
            const canBuy = GS.gold >= item.price && !bought && !item.disabled;
            const card = document.createElement('div');
            card.className = 'card' + (canBuy ? '' : ' disabled');
            card.innerHTML = `
                <div class="card-title">${item.title}</div>
                <div class="card-desc">${item.desc}</div>
                <div class="card-effect">${item.effect}</div>
                <div class="card-price">${bought ? '✓ SOLD' : item.price + ' gold'}</div>
            `;
            if (canBuy) {
                card.onclick = () => {
                    GS.gold -= item.price;
                    Shop.purchased.add(i);
                    const result = item.action();
                    if (result !== false) {
                        updateStats();
                        Shop._renderForge();
                    }
                };
            }
            c.appendChild(card);
        });

        const isFreeRefresh = GS.passives.freeRefresh && Shop.refreshCount === 0;
        const refreshCost = isFreeRefresh ? 0 : 15 + Shop.refreshCount * 10;
        const canRefresh = GS.gold >= refreshCost;
        const refreshCard = document.createElement('div');
        refreshCard.className = 'card' + (canRefresh ? '' : ' disabled');
        refreshCard.style.borderColor = canRefresh ? 'var(--gold)' : '';
        refreshCard.innerHTML = `
            <div class="card-title">🔄 Refresh Forge</div>
            <div class="card-desc">Reroll all offerings</div>
            <div class="card-price">${isFreeRefresh ? '✨ FREE' : refreshCost + ' gold'}</div>
        `;
        if (canRefresh) {
            refreshCard.onclick = () => {
                GS.gold -= refreshCost;
                Shop.refreshCount++;
                Shop.purchased = new Set();
                Shop.generateItems();
                updateStats();
                Shop._renderForge();
                log(`🔄 Forge refreshed!${refreshCost > 0 ? ` (-${refreshCost} gold)` : ' (free!)'}`, 'info');
            };
        }
        c.appendChild(refreshCard);
    },

    _renderMarket() {
        const marketEl = document.getElementById('shop-market-content');
        if (!marketEl) return;
        marketEl.innerHTML = '';

        // Current inventory display
        const invBar = document.createElement('div');
        invBar.className = 'market-inventory';
        const invLabel = document.createElement('span');
        invLabel.style.cssText = 'color:var(--text-dim); flex-shrink:0;';
        invLabel.textContent = `🧴 Supplies (${GS.consumables.filter(x=>x).length}/${GS.consumableSlots}):`;
        invBar.appendChild(invLabel);
        for (let i = 0; i < GS.consumableSlots; i++) {
            const c = GS.consumables[i];
            const slot = document.createElement('div');
            slot.className = 'market-inv-slot' + (c ? '' : ' empty');
            slot.textContent = c ? `${c.icon} ${c.name}` : 'Empty';
            invBar.appendChild(slot);
        }
        marketEl.appendChild(invBar);

        // Consumable cards
        const grid = document.createElement('div');
        grid.className = 'card-grid';
        Shop.marketItems.forEach((item, i) => {
            const bought = Shop.marketPurchased.has(i);
            const canBuy = GS.gold >= item.price && !bought;
            const rarityColor = item.rarity === 'rare' ? '#e8c97a' : item.rarity === 'uncommon' ? '#7ab4e8' : '#aaa';
            const card = document.createElement('div');
            card.className = 'card' + (canBuy ? '' : ' disabled');
            card.innerHTML = `
                <div class="card-title">${item.icon} ${item.name}</div>
                <div class="card-desc" style="color:${rarityColor}; font-size:0.75em; margin-bottom:4px;">[${item.rarity}] ${item.category}</div>
                <div class="card-effect">${item.description}</div>
                <div class="card-price">${bought ? '✓ SOLD' : item.price + ' gold'}</div>
            `;
            if (canBuy) {
                card.onclick = () => {
                    GS.gold -= item.price;
                    Shop.marketPurchased.add(i);
                    updateStats();
                    addConsumableToInventory({ ...item }, () => Shop._renderMarket());
                };
            }
            grid.appendChild(card);
        });

        // Market refresh button (10g flat)
        const mRefreshCost = 10;
        const canMRefresh = GS.gold >= mRefreshCost;
        const mRefreshCard = document.createElement('div');
        mRefreshCard.className = 'card' + (canMRefresh ? '' : ' disabled');
        mRefreshCard.style.borderColor = canMRefresh ? 'var(--gold)' : '';
        mRefreshCard.innerHTML = `<div class="card-title">🔄 Refresh Market</div><div class="card-desc">Restock consumables</div><div class="card-price">${mRefreshCost} gold</div>`;
        if (canMRefresh) {
            mRefreshCard.onclick = () => {
                GS.gold -= mRefreshCost;
                Shop.marketRefreshCount++;
                Shop.marketPurchased = new Set();
                Shop.generateMarket();
                updateStats();
                Shop._renderMarket();
                log(`🔄 Market restocked! (-${mRefreshCost} gold)`, 'info');
            };
        }
        grid.appendChild(mRefreshCard);
        marketEl.appendChild(grid);
    },

    showUpgrade() {
        const c = $('shop-cards');
        c.innerHTML = '';

        const hammer = GS.tempBuffs && GS.tempBuffs.mastersHammer;
        GS.dice.forEach((die, i) => {
            const nextMin = die.min + (hammer ? 2 : 1);
            const nextMax = die.max + (hammer ? 2 : 1);
            const card = document.createElement('div');
            card.className = 'card';
            card.innerHTML = renderDieCard(die, i, {
                extraDesc: `<div class="card-effect" style="text-align:center;">→ ${nextMin}–${nextMax}${hammer ? ' ⚒️' : ''}</div>`
            });
            card.onclick = () => {
                applyUpgrade(die);
                log(`Upgraded die to ${die.min}-${die.max}!${hammer ? ' (Master\'s Hammer)' : ''}`, 'info');
                updateStats(); Shop.render();
            };
            c.appendChild(card);
        });

        const back = document.createElement('div');
        back.className = 'card';
        back.innerHTML = `<div class="card-title">← Back</div>`;
        back.onclick = () => Shop.render();
        c.appendChild(back);
    },

    showFaceModPurchase(mod) {
        const c = $('shop-cards');
        c.innerHTML = '';
        const title = document.createElement('div');
        title.className = 'section-title';
        title.innerHTML = `Apply ${mod.icon} ${mod.name} — Choose a Die`;
        c.parentNode.insertBefore(title, c);

        const utilityBlocked = ['critical', 'shieldBash'];
        GS.dice.forEach((die, i) => {
            const blocked = die.dieType && utilityBlocked.includes(mod.effect);
            const card = document.createElement('div');
            card.className = 'card' + (blocked ? ' disabled' : '');
            card.innerHTML = renderDieCard(die, i) + (blocked ? `<div style="font-size:0.75em;color:var(--red,#c04040);margin-top:4px;">${mod.name} cannot be applied to utility dice</div>` : '');
            if (!blocked) card.onclick = () => { if (title.parentNode) title.remove(); Shop.showFaceSlot(die, mod); };
            c.appendChild(card);
        });

        const back = document.createElement('div');
        back.className = 'card';
        back.innerHTML = `<div class="card-title">← Back</div>`;
        back.onclick = () => { if (title.parentNode) title.remove(); Shop.render(); };
        c.appendChild(back);
    },

    showFaceSlot(die, mod) {
        const c = $('shop-cards');
        c.innerHTML = '';

        const preview = document.createElement('div');
        preview.style.cssText = 'text-align:center; margin-bottom:12px; padding:10px; background:var(--bg-surface); border:1px solid var(--border); border-radius:8px;';
        preview.innerHTML = `<div style="font-family:Uncial Antiqua,cursive; color:var(--gold); margin-bottom:6px;">d${die.faceValues.length}: ${die.min}–${die.max}</div>
            <div style="display:flex; gap:2px; flex-wrap:wrap; justify-content:center;">${renderFaceStrip(die)}</div>`;
        c.appendChild(preview);

        die.faceValues.forEach((v, fIdx) => {
            const existingEntry = die.faceMods.find(m => m.faceIndex === fIdx);
            const card = document.createElement('div');
            card.className = 'card';
            if (mod.transform) {
                const newVal = v * mod.transform;
                card.innerHTML = `
                    <div class="card-title" style="display:flex; align-items:center; gap:8px; justify-content:center;">
                        <span style="font-size:1.3em; font-family:JetBrains Mono,monospace;">${v}</span>
                        <span style="color:var(--green-bright);">→ ${newVal}</span>
                    </div>`;
                card.onclick = () => {
                    die.faceValues[fIdx] = newVal;
                    die.min = Math.min(...die.faceValues);
                    die.max = Math.max(...die.faceValues);
                    log(`${mod.icon} ${mod.name}: face ${v} → ${newVal}!`, 'info');
                    updateStats(); Shop.render();
                };
            } else {
                const faceHtml = renderFaceStrip(die, { highlightVal: v, showArrow: true, arrowMod: mod });
                card.innerHTML = `
                    <div class="card-title" style="display:flex; align-items:center; gap:8px; justify-content:center;">
                        <span style="font-size:1.3em; font-family:JetBrains Mono,monospace;">${v}</span>
                        ${existingEntry ? `<span style="font-size:0.8em;">${existingEntry.mod.icon} ${existingEntry.mod.name}</span>` : '<span style="font-size:0.8em; opacity:0.4;">Empty</span>'}
                        <span style="color:var(--green-bright);">→ ${mod.icon} ${mod.name}</span>
                    </div>
                `;
                card.onclick = () => {
                    const eIdx = die.faceMods.findIndex(m => m.faceIndex === fIdx);
                    if (eIdx >= 0) die.faceMods[eIdx] = { faceIndex: fIdx, mod };
                    else die.faceMods.push({ faceIndex: fIdx, mod });
                    log(`Applied ${mod.name} to face ${v}!`, 'info');
                    updateStats(); Shop.render();
                };
            }
            c.appendChild(card);
        });

        const back = document.createElement('div');
        back.className = 'card';
        back.innerHTML = `<div class="card-title">← Back</div>`;
        back.onclick = () => Shop.showFaceModPurchase(mod);
        c.appendChild(back);
    },

    leave() {
        Game.nextFloor();
    },

    showFaceRemoval() {
        const c = $('shop-cards');
        c.innerHTML = '';

        const info = document.createElement('div');
        info.style.cssText = 'text-align:center; margin-bottom:12px; font-family:EB Garamond, serif; color:var(--text-dim); font-size:0.9em;';
        info.innerHTML = 'Choose a die, then pick a face value to <strong style="color:#ff6666;">permanently remove</strong>. The die loses one side.';
        c.appendChild(info);

        const trimmable = GS.dice.filter(d => d.faceValues.length > 3);
        if (trimmable.length === 0) {
            const msg = document.createElement('div');
            msg.style.cssText = 'text-align:center; color:var(--text-dim); padding:20px;';
            msg.textContent = 'No dice can be trimmed further (minimum 3 faces).';
            c.appendChild(msg);
        } else {
            trimmable.forEach((die, di) => {
                const card = document.createElement('div');
                card.className = 'card';
                card.innerHTML = renderDieCard(die, di);
                card.onclick = () => Shop.showFaceTrimChoice(die);
                c.appendChild(card);
            });
        }

        const back = document.createElement('div');
        back.className = 'card';
        back.innerHTML = `<div class="card-title">← Back</div>`;
        back.onclick = () => Shop.render();
        c.appendChild(back);
    },

    showFaceTrimChoice(die) {
        const c = $('shop-cards');
        c.innerHTML = '';

        const info = document.createElement('div');
        info.style.cssText = 'text-align:center; margin-bottom:12px; font-family:EB Garamond, serif; color:var(--text-dim); font-size:0.9em;';
        info.innerHTML = `d${die.faceValues.length} → d${die.faceValues.length - 1} — Pick a face to <strong style="color:#ff6666;">remove</strong>:`;
        c.appendChild(info);

        const preview = document.createElement('div');
        preview.style.cssText = 'text-align:center; margin-bottom:12px; padding:8px; background:var(--bg-surface); border:1px solid var(--border); border-radius:8px;';
        preview.innerHTML = `<div style="display:flex; gap:2px; flex-wrap:wrap; justify-content:center;">${renderFaceStrip(die)}</div>`;
        c.appendChild(preview);

        die.faceValues.forEach((val, idx) => {
            const lostMod = die.faceMods.find(m => m.faceIndex === idx);
            const card = document.createElement('div');
            card.className = 'card';
            card.innerHTML = `
                <div class="card-title" style="color:#ff6666; display:flex; align-items:center; gap:8px; justify-content:center;">
                    <span style="font-size:1.3em; font-family:JetBrains Mono,monospace;">✂️ ${val}</span>
                    ${lostMod ? `<span style="font-size:0.85em;">${lostMod.mod.icon} ${lostMod.mod.name} — also lost!</span>` : ''}
                </div>
                <div class="card-desc" style="text-align:center;">Die becomes d${die.faceValues.length - 1}</div>
            `;
            card.onclick = () => {
                die.faceValues.splice(idx, 1);
                die.sides = die.faceValues.length;
                die.min = Math.min(...die.faceValues);
                die.max = Math.max(...die.faceValues);
                die.faceMods = die.faceMods.filter(m => m.faceIndex !== idx).map(m => ({
                    ...m, faceIndex: m.faceIndex > idx ? m.faceIndex - 1 : m.faceIndex
                }));
                log(`Trimmed face ${val} from die — now d${die.sides} [${die.min}-${die.max}]`, 'info');
                updateStats();
                Shop.render();
            };
            c.appendChild(card);
        });

        const back = document.createElement('div');
        back.className = 'card';
        back.innerHTML = `<div class="card-title">← Back</div>`;
        back.onclick = () => Shop.showFaceRemoval();
        c.appendChild(back);
    }
};

// ════════════════════════════════════════════════════════════
//  EVENTS
// ════════════════════════════════════════════════════════════
const Events = {

    // ── Per-act event pools ──
    pools: {
        1: [
            () => Events._wanderingMerchant(),
            () => Events._cursedShrine(),
            () => Events._trappedChest(),
            () => Events._trainingGrounds(),
        ],
        2: [
            () => Events._alchemistsLab(),
            () => Events._gamblingDen(),
            () => Events._forgottenForge(),
        ],
        3: [
            () => Events._bloodAltar(),
            () => Events._oracle(),
            () => Events._merchantPrince(),
        ],
    },

    // Map from eventId → event function for blueprint-driven events
    _eventMap: {
        wanderingMerchant: () => Events._wanderingMerchant(),
        cursedShrine:      () => Events._cursedShrine(),
        trappedChest:      () => Events._trappedChest(),
        trainingGrounds:   () => Events._trainingGrounds(),
        alchemistsLab:     () => Events._alchemistsLab(),
        gamblingDen:       () => Events._gamblingDen(),
        forgottenForge:    () => Events._forgottenForge(),
        bloodAltar:        () => Events._bloodAltar(),
        oracle:            () => Events._oracle(),
        merchantPrince:    () => Events._merchantPrince(),
    },

    enter() {
        updateStats();

        // Blueprint path: use pre-selected event
        if (GS.blueprint) {
            const actIndex  = Math.min(Math.ceil(GS.floor / 5) - 1, 2);
            const act       = GS.blueprint.acts[actIndex];
            const baseFloor = actIndex * 5 + 1;
            const fb        = act?.floors[GS.floor - baseFloor];
            if (fb && fb.eventId && Events._eventMap[fb.eventId]) {
                Events._eventMap[fb.eventId]();
                return;
            }
        }

        // Legacy path: random from act pool
        const act = getAct(GS.floor);
        const pool = Events.pools[act] || Events.pools[1];
        pick(pool)();
    },

    // ── Shared render helper ──
    _render(title, text, choices) {
        const panel = $('event-panel');
        panel.innerHTML = `
            <div style="font-size:1.15em; font-family:EB Garamond,serif; color:var(--gold); margin-bottom:10px; font-weight:bold;">${title}</div>
            <div class="event-text" style="margin-bottom:12px;">${text}</div>
        `;
        choices.forEach(ch => {
            const btn = document.createElement('button');
            btn.className = 'btn';
            btn.style.cssText = 'width:100%; text-align:left; margin:5px 0; padding:11px 16px;';
            if (ch.disabled) btn.style.cssText += 'opacity:0.45; cursor:not-allowed;';
            btn.textContent = ch.text;
            if (!ch.disabled) btn.onclick = () => {
                panel.querySelectorAll('button').forEach(b => { b.disabled = true; b.style.opacity = '0.5'; });
                ch.action();
            };
            panel.appendChild(btn);
        });
        show('screen-event');
    },

    // ── Utility helpers ──
    _gainArtifact(art) {
        GS.artifacts.push({ ...art });
        if (art.effect === 'colossussBelt') {
            GS.dice.forEach(d => {
                if (d.max >= 9) { d.faceValues = d.faceValues.map(v => v + art.value); d.min += art.value; d.max += art.value; }
            });
            log(`🏋️ Colossus Belt: dice with max≥9 gained +${art.value} to all faces!`, 'info');
        } else if (art.effect === 'glassCannon') {
            GS.dice.forEach(d => { d.faceValues = d.faceValues.map(v => v + art.value); d.min += art.value; d.max += art.value; });
            GS.maxHp = Math.max(10, Math.floor(GS.maxHp / 2)); GS.hp = Math.min(GS.hp, GS.maxHp);
            log(`💥 Glass Cannon: all dice +${art.value} faces, max HP halved!`, 'damage');
        } else if (art.effect === 'titansDie') {
            GS.dice.push(createDie(1, art.value));
            log(`🎲 Titan's Die: permanent d${art.value} added to your pool!`, 'info');
        }
        log(`Found ${art.icon} ${art.name}!`, 'info');
    },

    _gainRandomArtifacts(n) {
        const owned = new Set(GS.artifacts.map(a => a.name));
        const actPool = getArtifactPool(GS.act);
        let pool = actPool.filter(a => !owned.has(a.name));
        if (pool.length < n) pool = [...actPool];
        const gained = shuffle([...pool]).slice(0, n);
        gained.forEach(art => Events._gainArtifact(art));
        return gained;
    },

    // Show an outcome screen on the event panel before proceeding
    _showOutcome(title, lines, callback) {
        const panel = $('event-panel');
        panel.innerHTML = '';
        const titleEl = document.createElement('div');
        titleEl.style.cssText = 'font-size:1.15em; font-family:EB Garamond,serif; color:var(--gold); margin-bottom:10px; font-weight:bold;';
        titleEl.textContent = title;
        panel.appendChild(titleEl);
        const body = document.createElement('div');
        body.style.cssText = 'padding: 16px 8px; text-align: center;';
        lines.forEach(line => {
            const p = document.createElement('div');
            p.innerHTML = line;
            p.style.cssText = 'margin: 10px 0; font-size: 1.05em;';
            body.appendChild(p);
        });
        panel.appendChild(body);
        const btn = document.createElement('button');
        btn.className = 'btn';
        btn.textContent = 'Continue';
        btn.style.cssText = 'margin-top: 12px;';
        btn.onclick = () => { updateStats(); callback(); };
        panel.appendChild(btn);
        show('screen-event');
    },

    // Show 3 random face mod choices, call cb(mod)
    _chooseFaceMod(cb) {
        const mods = shuffle([...FACE_MODS]).slice(0, 3);
        const panel = $('event-panel');
        panel.innerHTML = '<div class="event-text">Choose a face modifier:</div><div class="card-grid" id="event-mod-cards"></div>';
        mods.forEach(mod => {
            const card = document.createElement('div');
            card.className = 'card';
            card.innerHTML = `<div class="card-title" style="color:${mod.color}">${mod.icon} ${mod.name}</div><div class="card-effect">${mod.desc}</div>`;
            card.onclick = () => cb(mod);
            $('event-mod-cards').appendChild(card);
        });
        show('screen-event');
    },

    // Show die picker then face picker for a given mod, call cb() when done
    _applyModFlow(mod, cb) {
        const panel = $('event-panel');
        panel.innerHTML = `<div class="event-text">Apply <strong style="color:${mod.color}">${mod.icon} ${mod.name}</strong> — Choose a die:</div><div class="card-grid" id="event-dice-cards"></div>`;
        const utilityBlocked = ['critical', 'shieldBash'];
        GS.dice.forEach((die, i) => {
            const blocked = die.dieType && utilityBlocked.includes(mod.effect);
            const card = document.createElement('div');
            card.className = 'card' + (blocked ? ' disabled' : '');
            card.innerHTML = renderDieCard(die, i) + (blocked ? `<div style="font-size:0.75em;color:var(--red,#c04040);margin-top:4px;">${mod.name} cannot be applied to utility dice</div>` : '');
            if (!blocked) card.onclick = () => Events._pickFaceForModCb(die, mod, cb);
            $('event-dice-cards').appendChild(card);
        });
        show('screen-event');
    },

    _pickFaceForModCb(die, mod, cb) {
        const panel = $('event-panel');
        panel.innerHTML = `<div class="event-text">Apply <strong style="color:${mod.color}">${mod.icon} ${mod.name}</strong> — Choose a face:</div>`;
        const grid = document.createElement('div');
        grid.className = 'card-grid';
        die.faceValues.forEach((v, fIdx) => {
            const existingEntry = die.faceMods.find(m => m.faceIndex === fIdx);
            const card = document.createElement('div');
            card.className = 'card';
            if (mod.transform) {
                const newVal = v * mod.transform;
                card.innerHTML = `
                    <div class="card-title" style="display:flex; align-items:center; gap:8px; justify-content:center;">
                        <span style="font-size:1.3em; font-family:JetBrains Mono,monospace;">${v}</span>
                        <span style="color:var(--green-bright);">→ ${newVal}</span>
                    </div>`;
                card.onclick = () => {
                    die.faceValues[fIdx] = newVal;
                    die.min = Math.min(...die.faceValues);
                    die.max = Math.max(...die.faceValues);
                    log(`${mod.icon} ${mod.name}: face ${v} → ${newVal}!`, 'info');
                    cb();
                };
            } else {
                card.innerHTML = `
                    <div class="card-title" style="display:flex; align-items:center; gap:8px; justify-content:center;">
                        <span style="font-size:1.3em; font-family:JetBrains Mono,monospace;">${v}</span>
                        ${existingEntry ? `<span style="font-size:0.85em;">${existingEntry.mod.icon} ${existingEntry.mod.name}</span>` : '<span style="font-size:0.85em; opacity:0.4;">Empty</span>'}
                        <span style="color:var(--green-bright);">→ ${mod.icon} ${mod.name}</span>
                    </div>`;
                card.onclick = () => {
                    const eIdx = die.faceMods.findIndex(m => m.faceIndex === fIdx);
                    if (eIdx >= 0) die.faceMods[eIdx] = { faceIndex: fIdx, mod };
                    else die.faceMods.push({ faceIndex: fIdx, mod });
                    log(`Applied ${mod.name} to face ${v}!`, 'info');
                    cb();
                };
            }
            grid.appendChild(card);
        });
        panel.appendChild(grid);
        show('screen-event');
    },

    // Show die picker, call cb(die)
    _chooseDie(prompt, cb) {
        const panel = $('event-panel');
        panel.innerHTML = `<div class="event-text">${prompt}</div><div class="card-grid" id="event-dice-cards"></div>`;
        GS.dice.forEach((die, i) => {
            const card = document.createElement('div');
            card.className = 'card';
            card.innerHTML = renderDieCard(die, i);
            card.onclick = () => cb(die);
            $('event-dice-cards').appendChild(card);
        });
        show('screen-event');
    },

    // Show N artifacts from pool, call cb(art)
    _chooseArtifact(n, cb) {
        const owned = new Set(GS.artifacts.map(a => a.name));
        const actPool = getArtifactPool(GS.act);
        let pool = actPool.filter(a => !owned.has(a.name));
        if (pool.length < n) pool = [...actPool];
        const choices = shuffle([...pool]).slice(0, n);
        const panel = $('event-panel');
        panel.innerHTML = '<div class="event-text">Choose an artifact:</div><div class="card-grid" id="event-art-cards"></div>';
        choices.forEach(art => {
            const card = document.createElement('div');
            card.className = 'card';
            card.innerHTML = `<div class="card-title">${art.icon} ${art.name}</div><div class="card-effect">${art.desc}</div>`;
            card.onclick = () => cb(art);
            $('event-art-cards').appendChild(card);
        });
        show('screen-event');
    },

    // Show owned artifacts for selection, call cb(art)
    _chooseOwnedArtifact(prompt, cb) {
        const panel = $('event-panel');
        panel.innerHTML = `<div class="event-text">${prompt}</div><div class="card-grid" id="event-art-cards"></div>`;
        GS.artifacts.forEach(art => {
            const card = document.createElement('div');
            card.className = 'card';
            card.innerHTML = `<div class="card-title">${art.icon} ${art.name}</div><div class="card-effect">${art.desc}</div>`;
            card.onclick = () => cb(art);
            $('event-art-cards').appendChild(card);
        });
        show('screen-event');
    },

    // ─────────────────────────────────────────
    //  ACT 1 EVENTS (Floor 3)
    // ─────────────────────────────────────────

    _wanderingMerchant() {
        Events._render(
            'Wandering Merchant',
            'A hooded figure offers you a trade from their cart...',
            [
                {
                    text: GS.gold >= 30 ? 'Buy a mystery die (30g) — random between d4 and d8' : 'Buy a mystery die (30g) — Not enough gold',
                    disabled: GS.gold < 30,
                    action: () => {
                        GS.gold -= 30;
                        const opts = [{min:1,max:4},{min:2,max:6},{min:1,max:6},{min:2,max:8},{min:1,max:8}];
                        const {min, max} = pick(opts);
                        GS.dice.push(createDie(min, max));
                        Events._showOutcome('🎲 Mystery Die Revealed!', [
                            `You received: <strong>d${max} (${min}–${max})</strong>`,
                            `<span style="color:var(--text-dim); font-size:0.9em;">Added to your dice pool</span>`
                        ], () => Game.nextFloor());
                    }
                },
                {
                    text: GS.dice.length >= 2 ? 'Trade a die — sacrifice one, boost another +2/+2' : 'Trade a die — need 2+ dice',
                    disabled: GS.dice.length < 2,
                    action: () => {
                        Events._chooseDie('Choose a die to sacrifice:', sacDie => {
                            GS.dice = GS.dice.filter(d => d.id !== sacDie.id);
                            Events._chooseDie('Choose a die to boost (+2/+2):', boostDie => {
                                const newMin = boostDie.min + 2;
                                const newMax = boostDie.max + 2;
                                const step = (newMax - newMin) / (boostDie.faceValues.length - 1);
                                boostDie.faceValues = Array.from({length: boostDie.faceValues.length}, (_, i) => Math.round(newMin + step * i));
                                boostDie.min = newMin; boostDie.max = newMax;
                                log(`Traded ${sacDie.min}-${sacDie.max} die, boosted to ${newMin}-${newMax}!`, 'info');
                                updateStats(); Game.nextFloor();
                            });
                        });
                    }
                },
                {
                    text: 'Decline and pickpocket (50%: +25 gold | 50%: -10 HP)',
                    action: () => {
                        let lines;
                        if (Math.random() < 0.5) {
                            const g = gainGold(25);
                            lines = [`<span style="color:var(--gold)">🤫 Nimble fingers! +${g} gold!</span>`];
                        } else {
                            GS.hp = Math.max(1, GS.hp - 10);
                            lines = [`<span style="color:var(--red-bright)">😤 Caught! -10 HP</span>`];
                        }
                        Events._showOutcome('🎲 Pickpocket Attempt', lines, () => Game.nextFloor());
                    }
                },
            ]
        );
    },

    _cursedShrine() {
        Events._render(
            'Cursed Shrine',
            'A stone altar pulses with dark energy. Offerings seem welcome...',
            [
                {
                    text: GS.hp > 15 ? 'Offer 15 HP — random face mod on a random die & face' : 'Offer 15 HP — Too low HP',
                    disabled: GS.hp <= 15,
                    action: () => {
                        GS.hp -= 15;
                        const mod = pick(FACE_MODS);
                        const utilityBlocked = ['critical', 'shieldBash'];
                        const eligibleDice = (mod.effect && utilityBlocked.includes(mod.effect)) ? GS.dice.filter(d => !d.dieType) : GS.dice;
                        const die = pick(eligibleDice.length ? eligibleDice : GS.dice);
                        const fIdx = Math.floor(Math.random() * die.faceValues.length);
                        const eIdx = die.faceMods.findIndex(m => m.faceIndex === fIdx);
                        if (eIdx >= 0) die.faceMods[eIdx] = { faceIndex: fIdx, mod };
                        else die.faceMods.push({ faceIndex: fIdx, mod });
                        log(`The shrine bestows ${mod.icon} ${mod.name} on face ${die.faceValues[fIdx]}!`, 'info');
                        const dieIdx = GS.dice.indexOf(die);
                        Events._showOutcome('Cursed Shrine', [
                            `<span style="color:${mod.color}">${mod.icon} ${mod.name}</span> was placed on face <strong>${die.faceValues[fIdx]}</strong> of Die #${dieIdx + 1} (d${die.max})`,
                            `<span style="font-size:0.9em; opacity:0.8;">${mod.desc}</span>`
                        ], () => Game.nextFloor());
                    }
                },
                {
                    text: GS.gold >= 25 ? 'Offer 25 gold — choose face mod, die, and face' : 'Offer 25 gold — Not enough gold',
                    disabled: GS.gold < 25,
                    action: () => {
                        GS.gold -= 25;
                        updateStats();
                        Events._chooseFaceMod(mod => {
                            Events._applyModFlow(mod, () => { updateStats(); Game.nextFloor(); });
                        });
                    }
                },
                {
                    text: 'Pray — +10 Max HP permanently (safe option)',
                    action: () => {
                        GS.maxHp += 10;
                        GS.hp += 10;
                        log('+10 Max HP from the shrine!', 'heal');
                        updateStats(); Game.nextFloor();
                    }
                },
            ]
        );
    },

    _trappedChest() {
        Events._render(
            'Trapped Chest',
            'A chest sits in the corridor. The lock is rigged — you can see the mechanism...',
            [
                {
                    text: 'Force it open (-8 HP, gain a random artifact)',
                    action: () => {
                        GS.hp = Math.max(1, GS.hp - 8);
                        const gained = Events._gainRandomArtifacts(1);
                        const art = gained[0];
                        Events._showOutcome('🎁 Chest Forced Open!', [
                            `<span style="color:var(--red-bright)">-8 HP</span>`,
                            art ? `Found: <strong>${art.icon} ${art.name}</strong><br><span style="opacity:0.8; font-size:0.9em">${art.desc}</span>` : 'Nothing inside...'
                        ], () => Game.nextFloor());
                    }
                },
                {
                    text: 'Disarm carefully (+20 gold, no risk)',
                    action: () => {
                        const g = gainGold(20);
                        log(`Carefully disarmed! +${g} gold!`, 'info');
                        updateStats(); Game.nextFloor();
                    }
                },
                {
                    text: 'Smash it — a random die gains +1/+1',
                    action: () => {
                        const die = pick(GS.dice);
                        upgradeDie(die);
                        log(`Smashed the chest! ${die.min}-${die.max} die upgraded!`, 'info');
                        updateStats(); Game.nextFloor();
                    }
                },
            ]
        );
    },

    _trainingGrounds() {
        const _afterXP = () => {
            updateStats();
            if ((GS.pendingSkillPoints || 0) > 0) {
                Rewards.slotChoice(() => { updateStats(); Game.nextFloor(); });
            } else {
                Game.nextFloor();
            }
        };
        Events._render(
            'Training Grounds',
            'An old training yard carved into the dungeon rock. Straw dummies and sparring marks line the floor...',
            [
                {
                    text: 'Light training — gain 20 XP (safe)',
                    action: () => {
                        gainXP(20);
                        Events._showOutcome('Light Training', [
                            '<span style="color:var(--gold);">+20 XP</span>',
                            'A quick warm-up sharpens your instincts.'
                        ], _afterXP);
                    }
                },
                {
                    text: GS.hp > 10 ? 'Intense drill (-10 HP) — gain 35 XP' : 'Intense drill (-10 HP) — Too low HP',
                    disabled: GS.hp <= 10,
                    action: () => {
                        GS.hp -= 10;
                        gainXP(35);
                        Events._showOutcome('Intense Drill', [
                            '<span style="color:var(--red-bright);">-10 HP</span>',
                            '<span style="color:var(--gold);">+35 XP</span>',
                            'Bruised but battle-ready.'
                        ], _afterXP);
                    }
                },
                {
                    text: 'Trial by fire — 50/50: gain 50 XP or 10 XP',
                    action: () => {
                        const success = Math.random() < 0.5;
                        const xp = success ? 50 : 10;
                        gainXP(xp);
                        Events._showOutcome('Trial by Fire', [
                            success
                                ? '<span style="color:var(--gold);">+50 XP!</span><br>You dominated the trial.'
                                : '<span style="color:var(--text-dim);">+10 XP</span><br>The trial got the better of you.'
                        ], _afterXP);
                    }
                },
            ]
        );
    },

    // ─────────────────────────────────────────
    //  ACT 2 EVENTS (Floor 7)
    // ─────────────────────────────────────────

    _alchemistsLab() {
        Events._render(
            "The Alchemist's Lab",
            'Bubbling vials line the shelves. The alchemist is long gone but the reagents remain...',
            [
                {
                    text: 'Brew poison coating — next 2 combats: +1 poison per attack',
                    action: () => {
                        GS.tempBuffs.poisonCombats = 2;
                        log('Poison coating brewed! (+1 poison per attack for 2 combats)', 'info');
                        updateStats(); Game.nextFloor();
                    }
                },
                {
                    text: 'Brew fortification elixir — next 2 combats: +8 armor',
                    action: () => {
                        GS.tempBuffs.armorCombats = 2;
                        GS.tempBuffs.armorBonus = 8;
                        log('Fortification elixir brewed! (+8 armor for 2 combats)', 'info');
                        updateStats(); Game.nextFloor();
                    }
                },
                {
                    text: 'Sell the reagents (+50 gold)',
                    action: () => {
                        const g = gainGold(50);
                        log(`Sold the reagents for ${g} gold!`, 'info');
                        updateStats(); Game.nextFloor();
                    }
                },
            ]
        );
    },

    _gamblingDen() {
        Events._render(
            'The Gambling Den',
            'A circle of shadowy figures beckon you to play...',
            [
                {
                    text: 'Bet a die — sacrifice it: above avg → 2 artifacts, else nothing',
                    action: () => {
                        Events._chooseDie('Which die will you sacrifice?', die => {
                            GS.dice = GS.dice.filter(d => d.id !== die.id);
                            const fv = die.faceValues;
                            const avg = fv.reduce((s, v) => s + v, 0) / fv.length;
                            const roll = fv[Math.floor(Math.random() * fv.length)];
                            const won = roll > avg;
                            const gained = won ? Events._gainRandomArtifacts(2) : [];
                            const outcomeLines = [
                                `Rolled <strong>${roll}</strong> on your ${die.min}–${die.max} die (avg ${avg.toFixed(1)})`,
                                won
                                    ? `<span style="color:var(--gold)">🎉 Above average! Won 2 artifacts!</span><br>${gained.map(a => `${a.icon} <strong>${a.name}</strong>`).join(' · ')}`
                                    : `<span style="color:var(--red-bright)">💀 Below average... got nothing.</span>`
                            ];
                            Events._showOutcome('🎲 The Die is Cast', outcomeLines, () => Game.nextFloor());
                        });
                    }
                },
                {
                    text: GS.gold >= 50 ? 'Bet 50 gold (50%: +100 gold, 50%: lose it all)' : 'Bet 50 gold — Not enough gold',
                    disabled: GS.gold < 50,
                    action: () => {
                        GS.gold -= 50;
                        let outcomeLines;
                        if (Math.random() < 0.5) {
                            const g = gainGold(100);
                            outcomeLines = [`<span style="color:var(--gold)">🎉 Heads! Won +${g} gold!</span>`, `Gold: ${GS.gold}`];
                        } else {
                            outcomeLines = [`<span style="color:var(--red-bright)">💀 Tails! Lost everything.</span>`, `Gold: ${GS.gold}`];
                        }
                        Events._showOutcome('🪙 The Coin Flip', outcomeLines, () => Game.nextFloor());
                    }
                },
                {
                    text: 'Rob the place (+30 gold, -12 HP, next shop has fewer items)',
                    action: () => {
                        const g = gainGold(30);
                        GS.hp = Math.max(1, GS.hp - 12);
                        GS.tempBuffs.shopReduced = true;
                        log(`Grabbed ${g} gold and ran! Took 12 damage and left suspicion behind.`, 'damage');
                        updateStats(); Game.nextFloor();
                    }
                },
            ]
        );
    },

    _forgottenForge() {
        const hasRunes = GS.slots.strike.some(s => s.runes?.length) || GS.slots.guard.some(s => s.runes?.length);
        Events._render(
            'The Forgotten Forge',
            'An ancient forge still burns. Tools of remarkable craft surround it...',
            [
                {
                    text: 'Reforge a die — randomize all face values within its range',
                    action: () => {
                        Events._chooseDie('Choose a die to reforge:', die => {
                            const n = die.faceValues.length;
                            const newVals = Array.from({length: n}, () => die.min + Math.floor(Math.random() * (die.max - die.min + 1))).sort((a, b) => a - b);
                            die.faceValues = newVals;
                            // faceMods faceIndex stays valid — same position, different value
                            log(`Reforged die! New faces: [${newVals.join(', ')}]`, 'info');
                            updateStats(); Game.nextFloor();
                        });
                    }
                },
                {
                    text: hasRunes ? 'Enhance a rune — choose a slot\'s rune to double its value' : 'Enhance a rune — No runes on slots',
                    disabled: !hasRunes,
                    action: () => {
                        const panel = $('event-panel');
                        panel.innerHTML = '<div class="event-text">Choose a slot whose rune to enhance:</div><div class="card-grid" id="event-rune-cards"></div>';
                        const slotsWithRunes = [
                            ...GS.slots.strike.map((s, i) => ({ slot: s, label: `⚔️ Strike Slot ${i + 1}` })),
                            ...GS.slots.guard.map((s, i) => ({ slot: s, label: `🛡️ Guard Slot ${i + 1}` })),
                        ].filter(x => x.slot.runes?.length);
                        slotsWithRunes.forEach(({ slot, label }) => {
                            const card = document.createElement('div');
                            card.className = 'card';
                            const firstRune = slot.runes[0];
                            card.innerHTML = `<div class="card-title" style="color:${firstRune.color};">${slot.runes.map(r => r.icon).join('')} ${slot.runes.map(r => r.name).join(', ')}</div><div class="card-effect">${label} → all rune values doubled</div>`;
                            card.onclick = () => {
                                slot.runes.forEach(r => { r.value = (r.value || 1) * 2; });
                                log(`Enhanced ${slot.runes.map(r => r.name).join(', ')}! Values doubled.`, 'info');
                                updateStats(); Game.nextFloor();
                            };
                            $('event-rune-cards').appendChild(card);
                        });
                        show('screen-event');
                    }
                },
                {
                    text: "Take the master's hammer — die upgrades give +2/+2 for this run",
                    action: () => {
                        GS.tempBuffs.mastersHammer = true;
                        log("Master's Hammer acquired! Die upgrades now give +2/+2 for the rest of the run!", 'info');
                        updateStats(); Game.nextFloor();
                    }
                },
            ]
        );
    },

    // ─────────────────────────────────────────
    //  ACT 3 EVENTS (Floor 13)
    // ─────────────────────────────────────────

    _bloodAltar() {
        Events._render(
            'The Blood Altar',
            'The altar demands sacrifice. It promises power in return...',
            [
                {
                    text: GS.hp > 30 ? 'Sacrifice 30 HP → +5 permanent damage boost' : 'Sacrifice 30 HP — Too risky (low HP)',
                    disabled: GS.hp <= 30,
                    action: () => {
                        GS.hp -= 30;
                        GS.buffs.damageBoost += 5;
                        log('Blood offered! +5 permanent damage!', 'info');
                        updateStats(); Game.nextFloor();
                    }
                },
                {
                    text: GS.artifacts.length > 0 ? 'Sacrifice an artifact → gain 2 skill points' : 'Sacrifice an artifact — No artifacts',
                    disabled: GS.artifacts.length === 0,
                    action: () => {
                        Events._chooseOwnedArtifact('Choose an artifact to sacrifice:', art => {
                            GS.artifacts = GS.artifacts.filter(a => a !== art);
                            if (art.effect === 'permArmor') GS.buffs.armor -= art.value;
                            GS.pendingSkillPoints = (GS.pendingSkillPoints || 0) + 2;
                            log(`Sacrificed ${art.icon} ${art.name}! Gaining 2 skill points...`, 'info');
                            updateStats();
                            Rewards.slotChoice(() => {
                                Rewards.slotChoice(() => { updateStats(); Game.nextFloor(); });
                            });
                        });
                    }
                },
                {
                    text: GS.dice.length > 1 ? 'Sacrifice a die → all remaining dice gain +1 to every face' : 'Sacrifice a die — Need 2+ dice',
                    disabled: GS.dice.length <= 1,
                    action: () => {
                        Events._chooseDie('Choose a die to sacrifice:', die => {
                            GS.dice = GS.dice.filter(d => d.id !== die.id);
                            GS.dice.forEach(d => {
                                d.faceValues = d.faceValues.map(v => v + 1);
                                d.min = d.faceValues[0];
                                d.max = d.faceValues[d.faceValues.length - 1];
                            });
                            log(`Sacrificed die! All remaining dice face values +1!`, 'info');
                            updateStats(); Game.nextFloor();
                        });
                    }
                },
            ]
        );
    },

    _oracle() {
        Events._render(
            'The Oracle',
            'She sees your death at the hands of the Void Lord. But she offers alternatives...',
            [
                {
                    text: 'Accept the vision — Foresight: see 2 turns ahead for bosses',
                    action: () => {
                        GS.tempBuffs.foresight = true;
                        log('Foresight granted! You see further into battle...', 'info');
                        log('The Void Lord cycles: Strike, Void Rift, Dark Pulse, Strike. Phase 2 adds Entropy. Phase 3 attacks twice.', 'info');
                        updateStats(); Game.nextFloor();
                    }
                },
                {
                    text: 'Reject fate — +15 Max HP, full heal (the practical choice)',
                    action: () => {
                        GS.maxHp += 15;
                        GS.hp = GS.maxHp;
                        log('+15 Max HP and fully healed!', 'heal');
                        updateStats(); Game.nextFloor();
                    }
                },
                {
                    text: 'Defy the Oracle — Void Lord starts at 90% HP',
                    action: () => {
                        GS.tempBuffs.voidLordWeakened = true;
                        log('You defy fate! The Void Lord will begin weakened...', 'info');
                        updateStats(); Game.nextFloor();
                    }
                },
            ]
        );
    },

    _merchantPrince() {
        Events._render(
            'The Merchant Prince',
            'The wealthiest trader in the dungeon offers one final deal...',
            [
                {
                    text: GS.gold >= 100 ? 'Buy everything (100g) — gain 3 random artifacts' : 'Buy everything (100g) — Not enough gold',
                    disabled: GS.gold < 100,
                    action: () => {
                        GS.gold -= 100;
                        const gained = Events._gainRandomArtifacts(3);
                        Events._showOutcome('💎 Merchant Prince Deal', [
                            `<span style="color:var(--gold)">You received 3 artifacts:</span>`,
                            ...gained.map(a => `${a.icon} <strong>${a.name}</strong> — <span style="opacity:0.8; font-size:0.9em">${a.desc}</span>`)
                        ], () => Game.nextFloor());
                    }
                },
                {
                    text: GS.gold >= 60 ? 'Exclusive stock (60g) — choose 1 artifact from 5' : 'Exclusive stock (60g) — Not enough gold',
                    disabled: GS.gold < 60,
                    action: () => {
                        GS.gold -= 60;
                        updateStats();
                        Events._chooseArtifact(5, art => {
                            Events._gainArtifact(art);
                            updateStats(); Game.nextFloor();
                        });
                    }
                },
                {
                    text: "A proposition — Merchant's Escort: +10 gold per combat, shop prices halved",
                    action: () => {
                        GS.tempBuffs.merchantEscort = true;
                        log("The Merchant joins your cause! +10 gold per combat, shop prices halved!", 'info');
                        updateStats(); Game.nextFloor();
                    }
                },
            ]
        );
    },
};

// ════════════════════════════════════════════════════════════
//  REST (between acts) — two-tier: Transformation then Maintenance
// ════════════════════════════════════════════════════════════
const Rest = {
    _transformDone: false,
    _maintenanceDone: false,

    _consumablePicked: false,

    enter() {
        Rest._transformDone = false;
        Rest._maintenanceDone = false;
        Rest._consumablePicked = false;
        Rest._render();
    },

    _render() {
        updateStats();
        $('rest-title').textContent = `Act ${GS.act} Complete — Rest & Prepare`;
        const content = $('rest-content');
        content.innerHTML = '';

        // ── TRANSFORMATION TIER ──
        const transHeader = document.createElement('div');
        transHeader.className = 'section-title';
        transHeader.textContent = '⚡ FORGE YOUR PATH';
        content.appendChild(transHeader);

        if (Rest._transformDone) {
            const done = document.createElement('div');
            done.style.cssText = 'text-align:center; color:var(--text-dim); font-size:0.85em; margin-bottom:16px;';
            done.textContent = '✓ Transformation chosen';
            content.appendChild(done);
        } else {
            const transGrid = document.createElement('div');
            transGrid.style.cssText = 'display:flex; gap:10px; justify-content:center; flex-wrap:wrap; margin-bottom:8px;';

            const expandCard = document.createElement('div');
            expandCard.className = 'card';
            expandCard.style.cssText = 'width:140px; cursor:pointer;';
            const atkCap = GS.slots.strike.length >= 6, defCap = GS.slots.guard.length >= 6;
            expandCard.innerHTML = `<div class="card-title">➕ Expand</div><div class="card-desc">+1 slot<br>${atkCap && defCap ? '<span style="color:#ff8080;">Max slots reached</span>' : `${GS.slots.strike.length}⚔️ / ${GS.slots.guard.length}🛡️`}</div>`;
            if (!(atkCap && defCap)) expandCard.onclick = () => Rest.showExpand();
            else expandCard.classList.add('disabled');
            transGrid.appendChild(expandCard);

            const canSacAtk = GS.slots.strike.length > 1, canSacDef = GS.slots.guard.length > 1;
            const sacCard = document.createElement('div');
            sacCard.className = 'card' + (canSacAtk || canSacDef ? '' : ' disabled');
            sacCard.style.cssText = 'width:140px; cursor:pointer;';
            sacCard.innerHTML = `<div class="card-title">🔥 Sacrifice</div><div class="card-desc">Destroy a slot for a powerful enhancement</div>`;
            if (canSacAtk || canSacDef) sacCard.onclick = () => Rest.showSacrifice();
            transGrid.appendChild(sacCard);

            const transCard = document.createElement('div');
            transCard.className = 'card';
            transCard.style.cssText = 'width:140px; cursor:pointer;';
            transCard.innerHTML = `<div class="card-title">✨ Transform</div><div class="card-desc">Permanently alter one of your dice</div>`;
            transCard.onclick = () => Rest.showTransform();
            transGrid.appendChild(transCard);

            content.appendChild(transGrid);

            const skipDiv = document.createElement('div');
            skipDiv.style.cssText = 'text-align:center; margin-bottom:16px;';
            const skipBtn = document.createElement('button');
            skipBtn.className = 'btn';
            skipBtn.textContent = 'Skip transformation';
            skipBtn.onclick = () => { Rest._transformDone = true; Rest._render(); };
            skipDiv.appendChild(skipBtn);
            content.appendChild(skipDiv);
        }

        // ── SEPARATOR ──
        const sep = document.createElement('hr');
        sep.style.cssText = 'border:none; border-top:1px solid var(--border); margin:8px 0 16px;';
        content.appendChild(sep);

        // ── MAINTENANCE TIER ──
        const maintHeader = document.createElement('div');
        maintHeader.className = 'section-title';
        maintHeader.textContent = '🔧 MAINTENANCE';
        if (!Rest._transformDone) maintHeader.style.opacity = '0.4';
        content.appendChild(maintHeader);

        const maintGrid = document.createElement('div');
        maintGrid.className = 'card-grid';

        if (!Rest._maintenanceDone) {
            const healAmt = Math.floor(GS.maxHp * 0.3);
            const healCard = document.createElement('div');
            healCard.className = 'card' + (!Rest._transformDone ? ' disabled' : '');
            healCard.innerHTML = `<div class="card-title">❤️ Heal</div><div class="card-desc">Restore ${healAmt} HP (30% max)</div>`;
            if (Rest._transformDone) healCard.onclick = () => {
                const h = heal(healAmt);
                log(`Rested: +${h} HP`, 'heal');
                updateStats();
                Rest._maintenanceDone = true;
                Rest._render();
            };
            maintGrid.appendChild(healCard);

            const upCard = document.createElement('div');
            upCard.className = 'card' + (!Rest._transformDone ? ' disabled' : '');
            upCard.innerHTML = `<div class="card-title">⬆️ Train</div><div class="card-desc">Upgrade one die +1/+1</div>`;
            if (Rest._transformDone) upCard.onclick = () => Rest.showUpgrade();
            maintGrid.appendChild(upCard);

            const hasTrimmable = GS.dice.some(d => d.faceValues && d.faceValues.length > 3);
            if (hasTrimmable) {
                const trimCard = document.createElement('div');
                trimCard.className = 'card' + (!Rest._transformDone ? ' disabled' : '');
                trimCard.innerHTML = `<div class="card-title">✂️ Trim</div><div class="card-desc">Remove a face from a die</div>`;
                if (Rest._transformDone) trimCard.onclick = () => Rest.showFaceTrim();
                maintGrid.appendChild(trimCard);
            }

            if (GS.passives.canMerge && GS.dice.length >= 4) {
                const mergeCard = document.createElement('div');
                mergeCard.className = 'card' + (!Rest._transformDone ? ' disabled' : '');
                mergeCard.innerHTML = `<div class="card-title">🔥 Forge Merge</div><div class="card-desc">Fuse 2 dice into 1</div>`;
                if (Rest._transformDone) mergeCard.onclick = () => {
                    Rewards.showMergeSelection(() => { Rest._maintenanceDone = true; Rest._render(); });
                };
                maintGrid.appendChild(mergeCard);
            }
        } else {
            const doneDiv = document.createElement('div');
            doneDiv.style.cssText = 'text-align:center; color:var(--text-dim); font-size:0.85em; padding:8px;';
            doneDiv.textContent = '✓ Maintenance complete';
            maintGrid.appendChild(doneDiv);
        }

        content.appendChild(maintGrid);

        if (Rest._transformDone && Rest._maintenanceDone) {
            // ── CONSUMABLE PICK ──
            if (!Rest._consumablePicked) {
                const sep2 = document.createElement('hr');
                sep2.style.cssText = 'border:none; border-top:1px solid var(--border); margin:12px 0;';
                content.appendChild(sep2);

                const supHeader = document.createElement('div');
                supHeader.className = 'section-title';
                supHeader.textContent = '🧴 TAKE A SUPPLY — Choose one (or skip)';
                content.appendChild(supHeader);

                const supGrid = document.createElement('div');
                supGrid.style.cssText = 'display:flex; gap:8px; flex-wrap:wrap; justify-content:center; margin-bottom:8px;';
                const offers = [pickWeightedConsumable(), pickWeightedConsumable(), pickWeightedConsumable()];
                offers.forEach(item => {
                    const rarityColor = item.rarity === 'rare' ? '#e8c97a' : item.rarity === 'uncommon' ? '#7ab4e8' : '#aaa';
                    const card = document.createElement('div');
                    card.className = 'card';
                    card.style.cssText = 'width:140px; cursor:pointer;';
                    card.innerHTML = `<div style="font-size:1.4em; text-align:center;">${item.icon}</div><div class="card-title" style="font-size:0.85em;">${item.name}</div><div class="card-desc" style="color:${rarityColor}; font-size:0.7em;">[${item.rarity}]</div><div class="card-effect" style="font-size:0.78em;">${item.description}</div>`;
                    card.onclick = () => {
                        addConsumableToInventory({ ...item });
                        Rest._consumablePicked = true;
                        Rest._render();
                    };
                    supGrid.appendChild(card);
                });
                content.appendChild(supGrid);

                const skipSupBtn = document.createElement('button');
                skipSupBtn.className = 'btn';
                skipSupBtn.textContent = 'Skip supply';
                skipSupBtn.style.cssText = 'display:block; margin:0 auto 12px;';
                skipSupBtn.onclick = () => { Rest._consumablePicked = true; Rest._render(); };
                content.appendChild(skipSupBtn);
            }

            // Only show Continue after supply pick (or skip)
            if (Rest._consumablePicked) {
                const contDiv = document.createElement('div');
                contDiv.style.cssText = 'text-align:center; margin-top:16px;';
                const contBtn = document.createElement('button');
                contBtn.className = 'btn btn-primary';
                contBtn.textContent = 'Continue →';
                contBtn.onclick = () => Game.enterFloor();
                contDiv.appendChild(contBtn);
                content.appendChild(contDiv);
            }
        }

        show('screen-rest');
    },

    // ── EXPAND ──
    showExpand() {
        const content = $('rest-content');
        content.innerHTML = '<div class="section-title">➕ Expand — Choose a zone</div>';
        const info = document.createElement('div');
        info.style.cssText = 'text-align:center; margin-bottom:12px; font-size:0.85em; color:var(--text-dim);';
        info.innerHTML = `Current: ${GS.slots.strike.length} Strike slots / ${GS.slots.guard.length} Guard slots`;
        content.appendChild(info);

        const grid = document.createElement('div');
        grid.className = 'card-grid';

        const atkCapped = GS.slots.strike.length >= 6;
        const atkCard = document.createElement('div');
        atkCard.className = 'card' + (atkCapped ? ' disabled' : '');
        atkCard.innerHTML = `<div class="card-title">⚔️ +1 Strike Slot</div><div class="card-desc">${GS.slots.strike.length} → ${GS.slots.strike.length + 1}${atkCapped ? ' (MAX)' : ''}</div>`;
        if (!atkCapped) atkCard.onclick = () => { GS.slots.strike.push({ id: `str-${Date.now()}`, rune: null }); log('➕ +1 strike slot!', 'info'); updateStats(); Rest._transformDone = true; Rest._render(); };
        grid.appendChild(atkCard);

        const defCapped = GS.slots.guard.length >= 6;
        const defCard = document.createElement('div');
        defCard.className = 'card' + (defCapped ? ' disabled' : '');
        defCard.innerHTML = `<div class="card-title">🛡️ +1 Guard Slot</div><div class="card-desc">${GS.slots.guard.length} → ${GS.slots.guard.length + 1}${defCapped ? ' (MAX)' : ''}</div>`;
        if (!defCapped) defCard.onclick = () => { GS.slots.guard.push({ id: `grd-${Date.now()}`, rune: null }); log('➕ +1 guard slot!', 'info'); updateStats(); Rest._transformDone = true; Rest._render(); };
        grid.appendChild(defCard);

        const back = document.createElement('div');
        back.className = 'card';
        back.innerHTML = `<div class="card-title">← Back</div>`;
        back.onclick = () => Rest._render();
        grid.appendChild(back);
        content.appendChild(grid);
    },

    // ── SACRIFICE ──
    showSacrifice() {
        const content = $('rest-content');
        content.innerHTML = '<div class="section-title">🔥 Sacrifice — Choose a specific slot to destroy</div>';
        const info = document.createElement('div');
        info.style.cssText = 'text-align:center; margin-bottom:14px; font-size:0.85em; color:var(--text-dim); line-height:1.5;';
        info.innerHTML = `
            Pick the exact slot you want to sacrifice.<br>
            Any rune on that slot is also lost.<br>
            <span style="color:var(--gold);">In return, choose a permanent buff for the remaining slots.</span>
        `;
        content.appendChild(info);

        const grid = document.createElement('div');
        grid.className = 'card-grid';

        const allSlots = [
            ...GS.slots.strike.map((s, i) => ({ ...s, type: 'strike', label: `⚔️ Strike Slot ${i + 1}`, isMin: GS.slots.strike.length <= 1 })),
            ...GS.slots.guard.map((s, i) => ({ ...s, type: 'guard', label: `🛡️ Guard Slot ${i + 1}`, isMin: GS.slots.guard.length <= 1 })),
        ];

        allSlots.forEach(slotInfo => {
            const card = document.createElement('div');
            card.className = 'card' + (slotInfo.isMin ? ' disabled' : '');
            const runeNote = slotInfo.runes?.length
                ? `<div style="color:${slotInfo.runes[0].color}; font-size:0.85em; margin-top:4px;">${slotInfo.runes.map(r => r.icon).join('')} ${slotInfo.runes.map(r => r.name).join(', ')} <span style="color:#ff8080;">(will be lost)</span></div>`
                : '<div style="opacity:0.5; font-size:0.85em; margin-top:4px;">no rune</div>';
            const slotTypeLabel = slotInfo.type === 'strike' ? 'strike' : 'guard';
            const enhancements = slotInfo.type === 'strike' ? '🔥 Fury Chamber · ☠️ Conduit · ⚒️ Gold Forge' : '🏰 Fortification · 🌿 Thorns Aura · 🧛 Vampiric Ward';
            card.innerHTML = `
                <div class="card-title">${slotInfo.label}</div>
                ${runeNote}
                ${!slotInfo.isMin ? `<div class="card-effect" style="font-size:0.8em; margin-top:6px; color:var(--${slotTypeLabel}-color);">Gain: ${enhancements}</div>` : '<div style="color:#ff8080; font-size:0.8em; margin-top:4px;">MINIMUM — cannot sacrifice</div>'}
            `;
            if (!slotInfo.isMin) card.onclick = () => Rest.showSacrificeEnhancements(slotInfo.type, slotInfo.id);
            grid.appendChild(card);
        });

        const back = document.createElement('div');
        back.className = 'card';
        back.innerHTML = `<div class="card-title">← Back</div>`;
        back.onclick = () => Rest._render();
        grid.appendChild(back);
        content.appendChild(grid);
    },

    showSacrificeEnhancements(slotType, slotId) {
        const content = $('rest-content');
        content.innerHTML = `<div class="section-title">🔥 Sacrifice ${slotType} slot — Choose Enhancement</div>`;
        const remaining = GS.slots[slotType].length - 1;

        const enhancements = slotType === 'strike' ? [
            { name: 'Fury Chamber', icon: '🔥', desc: `All ${remaining} remaining strike slots deal ×1.5 damage${GS.transformBuffs.furyChambered > 1 ? ' (stacks × existing)' : ''}`, effect: 'furyChambered', value: 1.5 },
            { name: 'Conduit', icon: '☠️', desc: `Each strike die applies +2 poison per turn (currently: ${GS.transformBuffs.conduit} → ${GS.transformBuffs.conduit + 2})`, effect: 'conduit', value: 2 },
            { name: 'Gold Forge', icon: '⚒️', desc: `Each strike die generates gold equal to its rolled value after you attack`, effect: 'goldForge', value: true },
        ] : [
            { name: 'Fortification', icon: '🏰', desc: `All ${remaining} remaining guard slots block ×1.5${GS.transformBuffs.fortified > 1 ? ' (stacks × existing)' : ''}`, effect: 'fortified', value: 1.5 },
            { name: 'Thorns Aura', icon: '🌿', desc: `When you take damage, reflect ${GS.transformBuffs.thornsAura + 5} back to the enemy (currently: ${GS.transformBuffs.thornsAura} → ${GS.transformBuffs.thornsAura + 5})`, effect: 'thornsAura', value: 5 },
            { name: 'Vampiric Ward', icon: '🧛', desc: `All blocked damage heals you for 25% of the amount blocked`, effect: 'vampiricWard', value: true },
        ];

        const grid = document.createElement('div');
        grid.className = 'card-grid';

        enhancements.forEach(enh => {
            const card = document.createElement('div');
            card.className = 'card';
            card.innerHTML = `<div class="card-title">${enh.icon} ${enh.name}</div><div class="card-desc">${enh.desc}</div>`;
            card.onclick = () => {
                GS.slots[slotType] = GS.slots[slotType].filter(s => s.id !== slotId);
                if (enh.effect === 'furyChambered') GS.transformBuffs.furyChambered *= enh.value;
                else if (enh.effect === 'conduit') GS.transformBuffs.conduit += enh.value;
                else if (enh.effect === 'goldForge') GS.transformBuffs.goldForge = true;
                else if (enh.effect === 'fortified') GS.transformBuffs.fortified *= enh.value;
                else if (enh.effect === 'thornsAura') GS.transformBuffs.thornsAura += enh.value;
                else if (enh.effect === 'vampiricWard') GS.transformBuffs.vampiricWard = true;
                log(`🔥 Sacrificed ${slotType} slot for ${enh.name}!`, 'info');
                updateStats();
                Rest._transformDone = true;
                Rest._render();
            };
            grid.appendChild(card);
        });

        const back = document.createElement('div');
        back.className = 'card';
        back.innerHTML = `<div class="card-title">← Back</div>`;
        back.onclick = () => Rest.showSacrifice();
        grid.appendChild(back);
        content.appendChild(grid);
    },

    // ── TRANSFORM ──
    showTransform() {
        const content = $('rest-content');
        content.innerHTML = '<div class="section-title">✨ Transform — Choose a transformation</div>';

        const transforms = [
            { name: 'Infuse', icon: '⚡', desc: 'Set a minimum face value on a die. Rolls below the chosen value are raised to it. (Requires ≥4 faces)' },
            { name: 'Fracture', icon: '💥', desc: 'Split a die into two smaller dice by interleaving face values. Face mods are lost. (Requires ≥6 faces)' },
            { name: 'Ascend', icon: '🌟', desc: 'Remove from dice pool — becomes a passive aura adding half its average to every strike and guard slot each turn. (Requires ≥3 dice remain)' },
            { name: 'Corrupt', icon: '💀', desc: 'Double all face values on the die. Powerful, but deals 3 unblockable damage to you at the start of each combat turn. (Cannot re-corrupt)' },
        ];

        const grid = document.createElement('div');
        grid.className = 'card-grid';

        transforms.forEach(tr => {
            const card = document.createElement('div');
            card.className = 'card';
            card.innerHTML = `<div class="card-title">${tr.icon} ${tr.name}</div><div class="card-desc">${tr.desc}</div>`;
            card.onclick = () => Rest.showTransformDiePicker(tr.name.toLowerCase());
            grid.appendChild(card);
        });

        const back = document.createElement('div');
        back.className = 'card';
        back.innerHTML = `<div class="card-title">← Back</div>`;
        back.onclick = () => Rest._render();
        grid.appendChild(back);
        content.appendChild(grid);
    },

    showTransformDiePicker(type) {
        const content = $('rest-content');
        const typeLabel = { infuse: '⚡ Infuse', fracture: '💥 Fracture', ascend: '🌟 Ascend', corrupt: '💀 Corrupt' };
        content.innerHTML = `<div class="section-title">${typeLabel[type]} — Choose a die</div>`;

        const grid = document.createElement('div');
        grid.className = 'card-grid';

        const rollable = GS.dice.filter(d => !d.ascended);

        GS.dice.forEach((die, idx) => {
            let disabled = false, reason = '';
            if (type === 'infuse') {
                if (die.faceValues.length < 4) { disabled = true; reason = 'Needs ≥4 faces'; }
            } else if (type === 'fracture') {
                if (die.faceValues.length < 6) { disabled = true; reason = 'Needs ≥6 faces'; }
            } else if (type === 'ascend') {
                if (die.dieType) { disabled = true; reason = 'Cannot ascend utility dice'; }
                else if (rollable.length - 1 < 2) { disabled = true; reason = 'Need ≥2 dice remaining'; }
            } else if (type === 'corrupt') {
                if (die.corrupted) { disabled = true; reason = 'Already corrupted'; }
            }

            const card = document.createElement('div');
            card.className = 'card' + (disabled ? ' disabled' : '');
            const faces = renderFaceStrip(die);
            card.innerHTML = `
                <div class="card-title">d${die.faceValues.length}: ${die.min}–${die.max}${die.corrupted ? ' 💀' : ''}${die.infuseFloor ? ` ⚡≥${die.infuseFloor}` : ''}</div>
                <div style="display:flex; gap:2px; flex-wrap:wrap; justify-content:center; margin:6px 0;">${faces}</div>
                ${disabled ? `<div class="card-desc" style="color:#ff8080; text-align:center;">${reason}</div>` : ''}
            `;
            if (!disabled) card.onclick = () => Rest._applyTransform(type, die, idx);
            grid.appendChild(card);
        });

        const back = document.createElement('div');
        back.className = 'card';
        back.innerHTML = `<div class="card-title">← Back</div>`;
        back.onclick = () => Rest.showTransform();
        grid.appendChild(back);
        content.appendChild(grid);
    },

    _applyTransform(type, die, idx) {
        if (type === 'infuse') { Rest.showInfusePicker(die); return; }

        if (type === 'fracture') {
            const sorted = [...die.faceValues].sort((a, b) => a - b);
            const facesA = sorted.filter((_, i) => i % 2 === 0);
            const facesB = sorted.filter((_, i) => i % 2 === 1);
            const dieA = createDieFromFaces(facesA);
            const dieB = createDieFromFaces(facesB);
            // Distribute face mods to the split dice (even-indexed → dieA, odd-indexed → dieB)
            die.faceMods.forEach(fm => {
                if (fm.faceIndex % 2 === 0) {
                    dieA.faceMods.push({ faceIndex: Math.floor(fm.faceIndex / 2), mod: { ...fm.mod } });
                } else {
                    dieB.faceMods.push({ faceIndex: Math.floor(fm.faceIndex / 2), mod: { ...fm.mod } });
                }
            });
            GS.dice.splice(idx, 1, dieA, dieB);
            log(`💥 Fractured! d${sorted.length} → d${facesA.length} [${dieA.min}-${dieA.max}] + d${facesB.length} [${dieB.min}-${dieB.max}]`, 'info');
            updateStats();
            Rest._transformDone = true;
            Rest._render();
            return;
        }

        if (type === 'ascend') {
            const avg = die.faceValues.reduce((s, v) => s + v, 0) / die.faceValues.length;
            const bonus = Math.ceil(avg / 2);
            const label = `Ascended d${die.faceValues.length} (${die.min}-${die.max})`;
            GS.ascendedDice.push({ label, bonus });
            GS.dice.splice(idx, 1);
            log(`🌟 ${label} ascended! +${bonus} to all slots each turn.`, 'info');
            updateStats();
            Rest._transformDone = true;
            Rest._render();
            return;
        }

        if (type === 'corrupt') {
            die.faceValues = die.faceValues.map(v => v * 2);
            die.min = die.faceValues[0];
            die.max = die.faceValues[die.faceValues.length - 1];
            die.corrupted = true;
            log(`💀 Die corrupted! All face values doubled. Takes 3 damage/turn in combat.`, 'damage');
            updateStats();
            Rest._transformDone = true;
            Rest._render();
            return;
        }
    },

    showInfusePicker(die) {
        const content = $('rest-content');
        content.innerHTML = `<div class="section-title">⚡ Infuse — Choose a minimum value</div>`;

        const preview = document.createElement('div');
        preview.style.cssText = 'text-align:center; margin:8px 0 12px; padding:8px; background:var(--bg-surface); border:1px solid var(--border); border-radius:8px;';
        preview.innerHTML = `<div style="display:flex; gap:2px; flex-wrap:wrap; justify-content:center;">${renderFaceStrip(die)}</div>`;
        content.appendChild(preview);

        const info = document.createElement('div');
        info.style.cssText = 'text-align:center; margin-bottom:12px; font-size:0.85em; color:var(--text-dim);';
        info.textContent = 'Choose a face value. Rolls below this value will always be raised to it.';
        content.appendChild(info);

        const grid = document.createElement('div');
        grid.className = 'card-grid';

        die.faceValues.slice(1).forEach(val => {
            const lowCount = die.faceValues.filter(v => v < val).length;
            const card = document.createElement('div');
            card.className = 'card';
            card.innerHTML = `
                <div class="card-title">⚡ ${val}</div>
                <div class="card-desc">Guaranteed minimum: ${val}<br>(${lowCount} lower value${lowCount !== 1 ? 's' : ''} raised)</div>
            `;
            card.onclick = () => {
                die.infuseFloor = val;
                log(`⚡ Infused! This die rolls minimum ${val}.`, 'info');
                Rest._transformDone = true;
                Rest._render();
            };
            grid.appendChild(card);
        });

        const back = document.createElement('div');
        back.className = 'card';
        back.innerHTML = `<div class="card-title">← Back</div>`;
        back.onclick = () => Rest.showTransformDiePicker('infuse');
        grid.appendChild(back);
        content.appendChild(grid);
    },

    // ── MAINTENANCE HELPERS ──
    showFaceTrim() {
        const content = $('rest-content');
        content.innerHTML = '<div class="section-title">✂️ Trim a Die Face</div>';
        const grid = document.createElement('div');
        grid.className = 'card-grid';

        const trimmable = GS.dice.filter(d => d.faceValues && d.faceValues.length > 3);
        trimmable.forEach(die => {
            const card = document.createElement('div');
            card.className = 'card';
            card.innerHTML = renderDieCard(die, 0);
            card.onclick = () => Rest.showFaceTrimChoice(die);
            grid.appendChild(card);
        });

        const back = document.createElement('div');
        back.className = 'card';
        back.innerHTML = `<div class="card-title">← Back</div>`;
        back.onclick = () => Rest._render();
        grid.appendChild(back);
        content.appendChild(grid);
    },

    showFaceTrimChoice(die) {
        const content = $('rest-content');
        content.innerHTML = `<div class="section-title">✂️ d${die.faceValues.length} → d${die.faceValues.length - 1} — Pick a face to remove</div>`;

        const preview = document.createElement('div');
        preview.style.cssText = 'text-align:center; margin:8px 0 12px; padding:8px; background:var(--bg-surface); border:1px solid var(--border); border-radius:8px;';
        preview.innerHTML = `<div style="display:flex; gap:2px; flex-wrap:wrap; justify-content:center;">${renderFaceStrip(die)}</div>`;
        content.appendChild(preview);

        const grid = document.createElement('div');
        grid.className = 'card-grid';

        die.faceValues.forEach((val, idx) => {
            const lostMod = die.faceMods.find(m => m.faceIndex === idx);
            const card = document.createElement('div');
            card.className = 'card';
            card.innerHTML = `
                <div class="card-title" style="color:#ff6666; display:flex; align-items:center; gap:8px; justify-content:center;">
                    <span style="font-size:1.3em; font-family:JetBrains Mono,monospace;">✂️ ${val}</span>
                    ${lostMod ? `<span style="font-size:0.85em;">${lostMod.mod.icon} ${lostMod.mod.name} — also lost!</span>` : ''}
                </div>
                <div class="card-desc" style="text-align:center;">Die becomes d${die.faceValues.length - 1}</div>
            `;
            card.onclick = () => {
                die.faceValues.splice(idx, 1);
                die.sides = die.faceValues.length;
                die.min = Math.min(...die.faceValues);
                die.max = Math.max(...die.faceValues);
                die.faceMods = die.faceMods.filter(m => m.faceIndex !== idx).map(m => ({
                    ...m, faceIndex: m.faceIndex > idx ? m.faceIndex - 1 : m.faceIndex
                }));
                log(`Trimmed face ${val} — now d${die.sides} [${die.min}-${die.max}]`, 'info');
                updateStats();
                Rest._maintenanceDone = true;
                Rest._render();
            };
            grid.appendChild(card);
        });

        const back = document.createElement('div');
        back.className = 'card';
        back.innerHTML = `<div class="card-title">← Back</div>`;
        back.onclick = () => Rest.showFaceTrim();
        grid.appendChild(back);
        content.appendChild(grid);
    },

    showUpgrade() {
        const content = $('rest-content');
        content.innerHTML = '<div class="section-title">⬆️ Train — Upgrade a Die</div>';
        const grid = document.createElement('div');
        grid.className = 'card-grid';

        const hammer = GS.tempBuffs && GS.tempBuffs.mastersHammer;
        GS.dice.forEach((die, i) => {
            const nextMin = die.min + (hammer ? 2 : 1);
            const nextMax = die.max + (hammer ? 2 : 1);
            const card = document.createElement('div');
            card.className = 'card';
            card.innerHTML = renderDieCard(die, i, {
                extraDesc: `<div class="card-effect" style="text-align:center;">→ ${nextMin}–${nextMax}${hammer ? ' ⚒️' : ''}</div>`
            });
            card.onclick = () => {
                applyUpgrade(die);
                log(`Upgraded to ${die.min}-${die.max}!${hammer ? ' (Master\'s Hammer)' : ''}`, 'info');
                updateStats();
                Rest._maintenanceDone = true;
                Rest._render();
            };
            grid.appendChild(card);
        });

        const back = document.createElement('div');
        back.className = 'card';
        back.innerHTML = `<div class="card-title">← Back</div>`;
        back.onclick = () => Rest._render();
        grid.appendChild(back);
        content.appendChild(grid);
    }
};

// ════════════════════════════════════════════════════════════
//  DUNGEON MAP OVERLAY
// ════════════════════════════════════════════════════════════
const DungeonMap = {
    visible: false,

    toggle() {
        DungeonMap.visible = !DungeonMap.visible;
        const overlay = $('dungeon-map-overlay');
        if (DungeonMap.visible) {
            if (Inventory.visible) Inventory.toggle();
            DungeonMap.render();
            overlay.style.display = 'block';
        } else {
            overlay.style.display = 'none';
        }
    },

    render(seedContainerId = 'dungeon-map-seed', contentContainerId = 'dungeon-map-content', options = {}) {
        const bp = GS.blueprint;
        const seedEl = $(seedContainerId);
        const contentEl = $(contentContainerId);
        if (!bp) {
            contentEl.innerHTML = '<div style="color:var(--text-dim); text-align:center; padding:40px 0;">No dungeon generated yet.</div>';
            seedEl.innerHTML = '';
            return;
        }

        const showAll    = options.showAll || false;
        const difficulty = options.difficulty || GS.runDifficulty || 'standard';
        const s = scoreDungeon(bp, difficulty);
        const seedHex = DungeonMap.formatSeed(bp.seed);
        const copyId = `map-seed-copyable-${seedContainerId}`;

        seedEl.innerHTML = `
            <div class="map-seed-row">
                <span class="map-seed-label">SEED</span>
                <span class="map-seed-value" id="${copyId}" title="Click to copy">${seedHex}</span>
                <span class="map-seed-rating">\u2694\uFE0F CR ${s.challengeRating}/10</span>
            </div>
            <div class="map-scoring-breakdown">
                <span class="threat">\u26A0 Threat ${s.totalCombatThreat}</span>
                <span class="advantage">\u2726 Advantage ${s.totalPlayerAdvantage}</span>
                <span class="net">Net ${s.netChallenge}</span>
            </div>`;
        const copyEl = $(copyId);
        copyEl.onclick = () => DungeonMap.copySeed(seedHex, copyEl);

        let html = '';
        for (let actIdx = 0; actIdx < bp.acts.length; actIdx++) {
            const act = bp.acts[actIdx];

            // Compute act threat subtotal
            let actThreat = 0;
            for (const f of act.floors) {
                if (f.type === 'combat' || f.type === 'boss') {
                    actThreat += scoreFloorDetailed(f).baseThreat;
                }
            }

            html += `<div class="map-act">`;
            html += `<div class="map-act-label"><span>Act ${act.actNumber}</span><span class="map-act-threat">\u26A0 ${actThreat}</span></div>`;
            html += `<div class="map-act-path">`;

            for (const floor of act.floors) {
                const state = floor.floor < GS.floor ? 'completed'
                            : floor.floor === GS.floor ? 'current'
                            : 'locked';
                const icon = DungeonMap._typeIcon(floor.type);
                const visited = floor.floor <= GS.floor;
                const reveal = visited || showAll;

                let infoHtml = '';
                let scoreHtml = '';

                if (floor.type === 'combat' || floor.type === 'boss') {
                    // Enemy name + environment
                    if (reveal && floor.enemy) {
                        infoHtml = `<div class="map-node-detail">${floor.enemy.name}</div>`;
                        if (floor.environment) {
                            infoHtml += `<div class="map-node-env">${floor.environment.icon} ${floor.environment.name}</div>`;
                        }
                        if (floor.anomaly) {
                            infoHtml += `<div class="map-node-anomaly">\u26A1 ${floor.anomaly.name}</div>`;
                        }
                    } else {
                        infoHtml = `<div class="map-node-detail map-node-hidden">???</div>`;
                    }

                    // Threat breakdown
                    const det = scoreFloorDetailed(floor);
                    const showElite = difficulty === 'heroic' || (difficulty === 'standard' && floor.eliteOffered);
                    const totalForDisplay = showElite ? det.totalThreat : det.baseThreat;
                    let parts = [`Enemy ${det.enemyThreat}`];
                    if (det.envThreat !== 0) parts.push(`Env ${det.envThreat > 0 ? '+' : ''}${det.envThreat}`);
                    if (det.anomalyThreat !== 0) parts.push(`Anomaly ${det.anomalyThreat > 0 ? '+' : ''}${det.anomalyThreat}`);
                    if (showElite && det.eliteThreat > 0) parts.push(`Elite +${det.eliteThreat}`);
                    scoreHtml = `<div class="map-node-threat">
                        <span class="map-threat-total">\u26A0 ${totalForDisplay}</span>
                        <div class="map-threat-breakdown">${parts.join(' \u00B7 ')}</div>
                    </div>`;

                } else if (floor.type === 'event') {
                    infoHtml = `<div class="map-node-detail">${reveal ? 'Event' : '???'}</div>`;
                    const adv = scorePlayerAdvantage(floor);
                    if (adv > 0) scoreHtml = `<div class="map-node-advantage"><span class="map-advantage-value">\u2726 +${adv}</span></div>`;

                } else if (floor.type === 'shop') {
                    infoHtml = `<div class="map-node-detail">Shop</div>`;
                    const shopAdv = SHOP_ADVANTAGES[Math.min(Math.ceil(floor.floor / 5) - 1, 2)];
                    scoreHtml = `<div class="map-node-advantage"><span class="map-advantage-value">\u2726 +${shopAdv}</span></div>`;
                }

                html += `<div class="map-node map-node--${state} map-node--${floor.type}">
                    <div class="map-node-icon">${icon}</div>
                    <div class="map-node-floor">F${floor.floor}</div>
                    <div class="map-node-info">${infoHtml}</div>
                    ${scoreHtml}
                </div>`;
            }

            html += `</div></div>`;

            if (actIdx < 2) {
                const restState = GS.floor > (actIdx + 1) * 5 ? 'completed' : 'locked';
                const restAdv = REST_ADVANTAGES[actIdx] || 15;
                html += `<div class="map-rest-stop map-rest-stop--${restState}">
                    <span class="map-rest-icon">\uD83C\uDFD5\uFE0F</span>
                    <span class="map-rest-label">Rest Stop</span>
                    <span class="map-advantage-value">\u2726 +${restAdv}</span>
                </div>`;
            }
        }

        contentEl.innerHTML = html;
    },

    _typeIcon(type) {
        switch (type) {
            case 'combat': return '\u2694\uFE0F';
            case 'boss':   return '\uD83D\uDC80';
            case 'event':  return '\u2753';
            case 'shop':   return '\uD83D\uDED2';
            default:       return '\u00B7';
        }
    },

    formatSeed(seed) {
        if (seed == null) return '--------';
        return (seed >>> 0).toString(16).toUpperCase().padStart(8, '0');
    },

    copySeed(seedHex, targetEl) {
        navigator.clipboard.writeText(seedHex).then(() => {
            if (!targetEl) return;
            const original = targetEl.textContent;
            targetEl.textContent = 'Copied!';
            targetEl.classList.add('map-seed-copied');
            setTimeout(() => {
                targetEl.textContent = original;
                targetEl.classList.remove('map-seed-copied');
            }, 1500);
        }).catch(() => {});
    },
};

// ════════════════════════════════════════════════════════════
//  DUNGEON PATH SCREEN
// ════════════════════════════════════════════════════════════

const SCHEDULE_NAMES = ['Standard', 'Front-loaded', 'Event-heavy', 'Double shop', 'Gauntlet'];

// ════════════════════════════════════════════════════════════
//  DIFFICULTY SELECT SCREEN
// ════════════════════════════════════════════════════════════
const DifficultySelect = {
    show() {
        // Reset any leftover animation classes from a previous pick
        document.querySelectorAll('.diff-card').forEach(c => {
            c.classList.remove('diff-card--door-open', 'diff-card--exit-left', 'diff-card--exit-right');
        });

        // Update last-run bar
        const lastRunEl = $('diff-select-last-run');
        if (lastRunEl) {
            const runs = RunHistory.getAll();
            const last = runs.length ? runs[runs.length - 1] : null;
            if (last) {
                const isVictory = last.outcome === 'victory';
                const diff = last.difficulty || 'standard';
                lastRunEl.innerHTML = `
                    <div class="last-run-bar">
                        <span class="last-run-outcome ${isVictory ? 'victory' : 'defeat'}">${isVictory ? '🏆 Victory' : '💀 Defeated'}</span>
                        <span class="last-run-stat">Floor ${last.floor}/15</span>
                        <span class="last-run-stat">Lvl ${last.level}</span>
                        <span class="last-run-stat">⚔️ ${last.enemiesKilled || 0}</span>
                        <span class="last-run-stat">💰 ${last.totalGold || 0}g</span>
                        <span class="last-run-diff last-run-diff--${diff}">${diff.charAt(0).toUpperCase() + diff.slice(1)}</span>
                    </div>`;
            } else {
                lastRunEl.innerHTML = '';
            }
        }

        // Apply campaign locks to difficulty cards
        const LOCK_HINTS = {
            standard: 'Win a Casual run to unlock',
            heroic:   'Win a Standard run to unlock',
        };
        for (const diff of ['standard', 'heroic']) {
            const card = document.querySelector(`.diff-card--${diff}`);
            if (!card) continue;
            const locked = !Campaign.isDifficultyUnlocked(diff);
            card.classList.toggle('diff-card--locked', locked);
            // Inject or remove the lock overlay
            let overlay = card.querySelector('.diff-card__lock-overlay');
            if (locked) {
                if (!overlay) {
                    overlay = document.createElement('div');
                    overlay.className = 'diff-card__lock-overlay';
                    card.prepend(overlay);
                }
                overlay.innerHTML = `<span class="lock-icon">🔒</span><span class="lock-hint">${LOCK_HINTS[diff]}</span>`;
            } else if (overlay) {
                overlay.remove();
            }
        }

        show('screen-difficulty-select');
    },

    pick(difficulty) {
        // Block locked difficulties
        if (!Campaign.isDifficultyUnlocked(difficulty)) return;

        const cards = Array.from(document.querySelectorAll('.diff-card'));
        const selectedIdx = cards.findIndex(c => c.classList.contains(`diff-card--${difficulty}`));
        cards.forEach((card, i) => {
            if (i === selectedIdx) {
                card.classList.add('diff-card--door-open');
            } else if (i < selectedIdx) {
                card.classList.add('diff-card--exit-left');
            } else {
                card.classList.add('diff-card--exit-right');
            }
        });
        setTimeout(() => {
            GS.runDifficulty = difficulty;
            DungeonPath.show(difficulty);
        }, 650);
    },
};

const DungeonPath = {
    _settings: { schedules: [null, null, null], difficulty: 'standard', anomalyRate: 'normal' },
    _open: false,

    show(difficulty) {
        const chosenDifficulty = difficulty || 'standard';
        DungeonPath._settings = { schedules: [null, null, null], difficulty: chosenDifficulty, anomalyRate: 'normal' };
        DungeonPath._open = false;
        GS.runDifficulty = chosenDifficulty;

        DungeonPath._renderSettings();
        DungeonMap.render('dungeon-path-seed', 'dungeon-path-content', { showAll: true, difficulty: chosenDifficulty });
        show('screen-dungeon-path');
    },

    proceed() {
        Game.enterFloor();
    },

    regenerate() {
        const s = DungeonPath._settings;
        GS.runDifficulty = s.difficulty;
        const bp = generateDungeonBlueprint({
            seed:        GS.seed,
            schedules:   s.schedules,
            anomalyRate: s.anomalyRate,
            difficulty:  s.difficulty,
        });
        GS.blueprint = bp;
        GS.seed = bp.seed;
        DungeonMap.render('dungeon-path-seed', 'dungeon-path-content', { showAll: true, difficulty: s.difficulty });
        DungeonPath._renderSettings();
    },

    setSeed(value) {
        const trimmed = (value || '').replace(/[\s\-]/g, '');
        const parsed = trimmed ? parseInt(trimmed, 16) : NaN;
        GS.seed = !isNaN(parsed) ? parsed : null;
        DungeonPath.regenerate();
    },

    toggleSettings() {
        DungeonPath._open = !DungeonPath._open;
        const body = $('run-settings-body');
        if (body) body.classList.toggle('open', DungeonPath._open);
        const btn = $('run-settings-toggle');
        if (btn) btn.textContent = (DungeonPath._open ? '\u25BC' : '\u25BA') + ' Run Settings';
    },

    setSchedule(actIndex, value) {
        DungeonPath._settings.schedules[actIndex] = value === '' ? null : parseInt(value);
        DungeonPath.regenerate();
    },

    setModifier(key, value) {
        DungeonPath._settings[key] = value;
        DungeonPath.regenerate();
    },

    _renderSettings() {
        const el = $('dungeon-path-settings');
        if (!el) return;
        const s = DungeonPath._settings;

        const scheduleSelects = [0, 1, 2].map(i => `
            <div class="run-schedule-col">
                <div class="run-schedule-col-label">Act ${i + 1}</div>
                <select class="run-schedule-select" onchange="DungeonPath.setSchedule(${i}, this.value)">
                    <option value="">Random</option>
                    ${SCHEDULE_NAMES.map((name, idx) => `<option value="${idx}" ${s.schedules[i] === idx ? 'selected' : ''}>${name}</option>`).join('')}
                </select>
            </div>`).join('');

        const diffBtns = ['casual', 'standard', 'heroic'].map(d =>
            `<button class="run-modifier-btn ${d} ${s.difficulty === d ? 'active' : ''}"
                onclick="DungeonPath.setModifier('difficulty','${d}')">${d.charAt(0).toUpperCase() + d.slice(1)}</button>`
        ).join('');

        const anomalyBtns = ['none', 'normal', 'high'].map(a =>
            `<button class="run-modifier-btn ${s.anomalyRate === a ? 'active' : ''}"
                onclick="DungeonPath.setModifier('anomalyRate','${a}')">${a.charAt(0).toUpperCase() + a.slice(1)}</button>`
        ).join('');

        el.innerHTML = `
            <button class="run-settings-toggle" id="run-settings-toggle" onclick="DungeonPath.toggleSettings()">
                \u25BA Run Settings
            </button>
            <div class="run-settings-body ${DungeonPath._open ? 'open' : ''}" id="run-settings-body">
                <div class="run-settings-row">
                    <span class="run-settings-label">Difficulty</span>
                    ${diffBtns}
                </div>
                <div class="run-settings-row">
                    <span class="run-settings-label">Anomalies</span>
                    ${anomalyBtns}
                </div>
                <div class="run-schedules-row">${scheduleSelects}</div>
                <div class="run-settings-row run-seed-row">
                    <span class="run-settings-label">Seed</span>
                    <input type="text" class="run-seed-input" value="${DungeonMap.formatSeed(GS.seed)}"
                        placeholder="hex seed…"
                        onchange="DungeonPath.setSeed(this.value)"
                        onkeydown="if(event.key==='Enter'){this.blur();}">
                    <button class="run-modifier-btn" onclick="DungeonPath.setSeed('')" title="Generate new random seed">🎲 Random</button>
                </div>
            </div>`;
    },
};

// ════════════════════════════════════════════════════════════
//  INVENTORY / BUILD OVERVIEW
// ════════════════════════════════════════════════════════════
const Inventory = {
    visible: false,
    toggle() {
        Inventory.visible = !Inventory.visible;
        const overlay = $('inventory-overlay');
        if (Inventory.visible) {
            Inventory.render();
            overlay.style.display = 'block';
        } else {
            overlay.style.display = 'none';
        }
    },
    render() {
        const c = $('inventory-content');

        let html = '';

        const runeCount = [...GS.slots.strike, ...GS.slots.guard].reduce((n, s) => n + (s.runes?.length || 0), 0);

        html += `<div style="background:var(--bg-surface); border:1px solid var(--border); border-radius:8px; padding:14px; margin-bottom:12px;">
            <div style="font-family:JetBrains Mono,monospace; font-size:0.8em; color:var(--gold); margin-bottom:8px;">⚙️ STATS</div>
            <div style="display:grid; grid-template-columns:1fr 1fr; gap:4px 16px; font-size:0.85em;">
                <span>❤️ HP: ${GS.hp}/${GS.maxHp}${GS.regenStacks > 0 ? ` (+${GS.regenStacks} regen)` : ''}</span>
                <span>💰 Gold: ${GS.gold}</span>
                <span>⚔️ Strike Slots: ${GS.slots.strike.length}</span>
                <span>🛡️ Guard Slots: ${GS.slots.guard.length}</span>
                <span>🎲 Dice: ${GS.dice.length}</span>
                <span>🔮 Runes: ${runeCount}</span>
                <span>⚔️ Dmg Boost: +${GS.buffs.damageBoost}</span>
                <span>🛡️ Armor: ${GS.buffs.armor}</span>
            </div>
        </div>`;

        // ── CONSUMABLES ──
        const filledSlots = GS.consumables.filter(x => x);
        html += `<div style="background:var(--bg-surface); border:1px solid var(--border); border-radius:8px; padding:14px; margin-bottom:12px;">
            <div style="font-family:JetBrains Mono,monospace; font-size:0.8em; color:var(--gold); margin-bottom:8px;">🧴 SUPPLIES (${filledSlots.length}/${GS.consumableSlots})</div>`;
        for (let i = 0; i < GS.consumableSlots; i++) {
            const c = GS.consumables[i];
            if (c) {
                const rarityColor = c.rarity === 'rare' ? '#e8c97a' : c.rarity === 'uncommon' ? '#7ab4e8' : '#aaa';
                html += `<div style="display:flex; align-items:center; gap:8px; font-size:0.82em; margin:4px 0; padding:4px 0; border-bottom:1px solid rgba(255,255,255,0.05);">
                    <span style="font-size:1.2em;">${c.icon}</span>
                    <div>
                        <strong>${c.name}</strong> <span style="color:${rarityColor}; font-size:0.8em;">[${c.rarity}]</span><br>
                        <span style="opacity:0.7;">${c.description}</span>
                    </div>`;
                if (c.usableOutsideCombat && !GS.enemy) {
                    html += `<button class="btn" style="font-size:0.7em; padding:3px 8px; margin-left:auto;" onclick="Combat._applyConsumable(${i}); Inventory.render();">Use</button>`;
                }
                html += `</div>`;
            } else {
                html += `<div style="font-size:0.82em; margin:3px 0; opacity:0.4;">Slot ${i+1}: Empty</div>`;
            }
        }
        html += `</div>`;

        html += `<div style="background:var(--bg-surface); border:1px solid var(--border); border-radius:8px; padding:14px; margin-bottom:12px;">
            <div style="font-family:JetBrains Mono,monospace; font-size:0.8em; color:var(--gold); margin-bottom:8px;">🎲 DICE (${GS.dice.length})</div>`;
        GS.dice.forEach((die, i) => {
            const faces = die.faceValues ? die.faceValues.join(', ') : `${die.min}-${die.max}`;
            const mods = die.faceMods.length ? die.faceMods.map(m => `<span style="color:${m.mod.color};" title="${m.mod.name}: ${m.mod.desc}"> face${m.faceIndex + 1}(${die.faceValues[m.faceIndex]}):${m.mod.icon}${m.mod.name}</span>`).join(' ') : '<span style="opacity:0.4;">no mod</span>';
            html += `<div style="margin:4px 0; font-size:0.82em; padding:4px 0; border-bottom:1px solid rgba(255,255,255,0.05);">
                <strong>d${die.faceValues ? die.faceValues.length : die.sides}</strong> [${faces}] ${mods}
            </div>`;
        });
        html += `</div>`;

        html += `<div style="background:var(--bg-surface); border:1px solid var(--border); border-radius:8px; padding:14px; margin-bottom:12px;">
            <div style="font-family:JetBrains Mono,monospace; font-size:0.8em; color:var(--gold); margin-bottom:8px;">🔮 SLOT RUNES</div>`;
        GS.slots.strike.forEach((slot, i) => {
            const rs = slot.runes?.length
                ? slot.runes.map(r => `<span style="color:${r.color};" title="${r.name}: ${r.desc}">${r.icon} ${r.name}</span>`).join(' ')
                : '<span style="opacity:0.4;">no rune</span>';
            html += `<div style="font-size:0.82em; margin:3px 0;">⚔️ Strike Slot ${i + 1}: ${rs}</div>`;
        });
        GS.slots.guard.forEach((slot, i) => {
            const rs = slot.runes?.length
                ? slot.runes.map(r => `<span style="color:${r.color};" title="${r.name}: ${r.desc}">${r.icon} ${r.name}</span>`).join(' ')
                : '<span style="opacity:0.4;">no rune</span>';
            html += `<div style="font-size:0.82em; margin:3px 0;">🛡️ Guard Slot ${i + 1}: ${rs}</div>`;
        });
        html += `</div>`;

        if (GS.artifacts.length > 0) {
            html += `<div style="background:var(--bg-surface); border:1px solid var(--gold); border-radius:8px; padding:14px; margin-bottom:12px;">
                <div style="font-family:JetBrains Mono,monospace; font-size:0.8em; color:var(--gold); margin-bottom:8px;">✨ ARTIFACTS (${GS.artifacts.length})</div>`;
            GS.artifacts.forEach(a => {
                html += `<div style="font-size:0.82em; margin:3px 0;">${a.icon} <strong>${a.name}</strong> — ${a.desc}</div>`;
            });
            html += `</div>`;
        }

        const unlocked = SKILL_TREE.filter(n => GS.unlockedNodes.includes(n.id));
        const pendingPts = GS.pendingSkillPoints || 0;
        const treeBorder = pendingPts > 0 ? 'border:1px solid #80ff80;' : 'border:1px solid var(--border);';
        html += `<div style="background:var(--bg-surface); ${treeBorder} border-radius:8px; padding:14px; margin-bottom:12px;">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
                <div style="font-family:JetBrains Mono,monospace; font-size:0.8em; color:var(--gold);">⭐ SKILL DIE (${unlocked.length} nodes)</div>
                <button class="btn" style="font-size:0.72em; padding:3px 10px;" onclick="Inventory._openSkillDie()">🎲 View Die</button>
            </div>`;
        if (pendingPts > 0) {
            html += `<div style="color:#80ff80; font-size:0.82em; margin-bottom:6px; font-weight:bold;">⬆ ${pendingPts} skill point${pendingPts > 1 ? 's' : ''} available — tap View Die to allocate</div>`;
        }
        if (unlocked.length > 0) {
            unlocked.forEach(n => {
                html += `<div style="font-size:0.82em; margin:3px 0;">${n.icon} <strong>${n.name}</strong> — ${n.desc}</div>`;
            });
        } else {
            html += `<div style="font-size:0.82em; margin:3px 0; opacity:0.5;">No nodes unlocked yet</div>`;
        }
        html += `</div>`;

        c.innerHTML = html;
    },
    _openSkillDie() {
        const prevScreen = document.querySelector('.screen.active');
        const prevScreenId = prevScreen ? prevScreen.id : 'screen-combat';
        Inventory.visible = false;
        $('inventory-overlay').style.display = 'none';

        const goBack = () => {
            show(prevScreenId);
            Inventory.visible = true;
            Inventory.render();
            $('inventory-overlay').style.display = 'block';
        };
        SkillDie.enter(goBack, true, goBack);
    }
};

// ════════════════════════════════════════════════════════════
//  ENCOUNTER CHOICE SCREEN
// ════════════════════════════════════════════════════════════
const EncounterChoice = {
    show(encounter) {
        GS.encounter = encounter;
        const { enemy, environment, anomaly, eliteModifiers, floor, isBossFloor, eliteOffered } = encounter;
        const diff = GS.runDifficulty || 'standard';

        $('encounter-header').innerHTML = this._buildHeader(floor, isBossFloor, anomaly, environment);

        const body = $('encounter-body');

        if (diff === 'heroic') {
            // Heroic: apply elite immediately, show only elite panel, no tab strip
            applyEliteChoice(encounter.enemy, encounter.eliteModifiers, encounter.floor);
            encounter.isElite = true;
            body.innerHTML = this._buildElitePanel(enemy, eliteModifiers, isBossFloor, floor);
            const footerBtn = body.querySelector('.encounter-card__footer .btn');
            if (footerBtn) {
                footerBtn.textContent = 'Fight';
                footerBtn.onclick = () => Combat.start();
            }
        } else if (diff === 'casual' || !eliteOffered) {
            // Casual or no elite offered: standard panel only
            body.innerHTML = this._buildStandardPanel(enemy, isBossFloor);
        } else {
            // Standard: full tab strip
            const standardHtml = this._buildStandardPanel(enemy, isBossFloor);
            const eliteHtml = this._buildElitePanel(enemy, eliteModifiers, isBossFloor, floor);
            body.innerHTML = `
                <div class="encounter-card-flipper">
                    <div class="encounter-tab-strip">
                        <button class="encounter-tab encounter-tab--standard active" data-side="standard">Standard</button>
                        <button class="encounter-tab encounter-tab--elite" data-side="elite">Elite</button>
                    </div>
                    <div class="encounter-card-flipper__inner">
                        <div class="encounter-card-flipper__face encounter-card-flipper__front">
                            ${standardHtml}
                        </div>
                        <div class="encounter-card-flipper__face encounter-card-flipper__back">
                            ${eliteHtml}
                        </div>
                    </div>
                </div>`;

            const flipper = body.querySelector('.encounter-card-flipper');
            const stdTab = body.querySelector('.encounter-tab--standard');
            const eliteTab = body.querySelector('.encounter-tab--elite');
            function setFlipState(showElite) {
                flipper.classList.toggle('flipped', showElite);
                stdTab.classList.toggle('active', !showElite);
                eliteTab.classList.toggle('active', showElite);
                const inner = flipper.querySelector('.encounter-card-flipper__inner');
                const front = flipper.querySelector('.encounter-card-flipper__front');
                const back = flipper.querySelector('.encounter-card-flipper__back');
                inner.style.height = (showElite ? back.offsetHeight : front.offsetHeight) + 'px';
            }
            stdTab.addEventListener('click', () => setFlipState(false));
            eliteTab.addEventListener('click', () => setFlipState(true));
            requestAnimationFrame(() => {
                const inner = flipper.querySelector('.encounter-card-flipper__inner');
                const front = flipper.querySelector('.encounter-card-flipper__front');
                inner.style.height = front.offsetHeight + 'px';
            });
        }

        show('screen-encounter');
    },

    chooseStandard() {
        GS.encounter.isElite = false;
        Combat.start();
    },

    chooseElite() {
        const enc = GS.encounter;
        const revealData = applyEliteChoice(enc.enemy, enc.eliteModifiers, enc.floor);
        enc.isElite = true;
        this._showReveal(revealData, () => Combat.start());
    },

    _showReveal(revealData, onDone) {
        const { visibleModifier, hiddenModifier, finalStats } = revealData;
        const fmtMod = (mod) => {
            const lines = [];
            if (mod.diceUpgrade) lines.push(`Each die +${mod.diceUpgrade} faces`);
            if (mod.extraDice) {
                const counts = {};
                mod.extraDice.forEach(d => { counts[d] = (counts[d] || 0) + 1; });
                Object.entries(counts).forEach(([d, n]) => lines.push(`+${n}×d${d}`));
            }
            if (mod.hpMult && mod.hpMult !== 1.0) {
                const pct = Math.round((mod.hpMult - 1) * 100);
                lines.push(`HP ${pct > 0 ? '+' : ''}${pct}%`);
            }
            if (mod.addPassive) lines.push(mod.addPassive.desc);
            if (mod.applyStartingCurse) lines.push('All your dice roll −1');
            if (mod.doublePhases) lines.push('Phases trigger earlier');
            return lines.map(l => `<div style="font-size:0.75em; color:var(--text-dim); margin-top:3px;">${l}</div>`).join('');
        };
        const overlay = document.createElement('div');
        overlay.style.cssText = 'position:absolute; inset:0; background:rgba(0,0,0,0.85); display:flex; flex-direction:column; align-items:center; justify-content:center; gap:12px; z-index:10; padding:20px; text-align:center; overflow-y:auto;';
        overlay.innerHTML = `
            <div style="font-size:1.1em; color:var(--gold); font-family:EB Garamond,serif;">⚔️ Elite Challenge Accepted!</div>
            <div style="display:flex; gap:16px; justify-content:center; flex-wrap:wrap;">
                <div style="background:var(--bg-surface); border:1px solid var(--gold); border-radius:8px; padding:12px; min-width:140px; max-width:200px;">
                    <div style="color:var(--gold); margin-bottom:4px;">${visibleModifier.prefix}</div>
                    ${fmtMod(visibleModifier)}
                </div>
                <div style="background:var(--bg-surface); border:1px solid #c060ff; border-radius:8px; padding:12px; min-width:140px; max-width:200px;">
                    <div style="color:#c060ff; margin-bottom:4px;">${hiddenModifier.prefix}</div>
                    ${fmtMod(hiddenModifier)}
                </div>
            </div>
            <div style="font-size:0.85em; color:var(--text-dim);">
                Final: ${finalStats.hp} HP · ${this._formatDicePool(finalStats.dice)} · ~${finalStats.avgDamage} dmg/turn
            </div>
            <button class="btn btn-primary" style="margin-top:8px;">Fight!</button>
        `;
        overlay.querySelector('button').onclick = () => {
            overlay.remove();
            onDone();
        };
        $('screen-encounter').style.position = 'relative';
        $('screen-encounter').appendChild(overlay);
    },

    _buildHeader(floor, isBossFloor, anomaly, environment) {
        const floorLabel = isBossFloor ? `⚔️ Floor ${floor} — BOSS` : `⚔️ Floor ${floor}`;
        const anomalyBadge = anomaly
            ? `<span class="encounter-anomaly-badge">⚠️ ${anomaly.name}<span class="enc-tooltip">${anomaly.desc || anomaly.name}</span></span>`
            : '';
        let envBar = '';
        if (environment) {
            // Determine what the environment affects
            const effects = [];
            if (environment.onTurnStart) effects.push('Triggers at start of each turn');
            if (environment.onTurnEnd) effects.push('Triggers at end of each turn');
            if (environment.onDiceRoll) effects.push('Modifies dice rolls');
            if (environment.onDamageDealt) effects.push('Modifies damage dealt');
            if (environment.healingMultiplier) effects.push(`Healing multiplied by ${environment.healingMultiplier}x`);
            const effectsStr = effects.length > 0 ? `<div style="font-size:0.9em; color:var(--text-dim); margin-top:4px;">${effects.join(' · ')}</div>` : '';
            envBar = `<div class="encounter-env-bar">
                <span class="env-name">${environment.icon} ${environment.name}</span>
                <span class="env-desc">· ${environment.desc}</span>
                ${effectsStr}
            </div>`;
        }
        return `<div style="padding:12px 0 8px; font-family:EB Garamond,serif; font-size:1.1em; text-align:center;">${floorLabel}${anomalyBadge}</div>${envBar}`;
    },

    _buildStandardPanel(enemy, isBossFloor) {
        const diceStr    = this._formatDicePool(enemy.dice);
        const goldRange  = Array.isArray(enemy.gold) ? `${enemy.gold[0]}–${enemy.gold[1]}` : enemy.gold;
        const xpRange    = Array.isArray(enemy.xp)   ? `${enemy.xp[0]}–${enemy.xp[1]}`   : enemy.xp;

        // Build ability tags with hover tooltips
        const abilityTags = Object.values(enemy.abilities || {}).map(a => {
            const typeLabel = { attack: 'Attack', poison: 'Poison', curse: 'Curse', buff: 'Buff', heal: 'Heal', debuff: 'Debuff' }[a.type] || a.type || 'Special';
            const extraInfo = [];
            if (a.multiHit) extraInfo.push('Multi-hit');
            if (a.penetrate) extraInfo.push(`Penetrates ${a.penetrate} block`);
            if (a.buffTarget) extraInfo.push(`Buffs next ${a.buffTarget}`);
            const extras = extraInfo.length ? `<br><span style="color:var(--gold); font-size:0.9em;">${extraInfo.join(' · ')}</span>` : '';
            return `<span class="encounter-ability-tag">${a.icon} ${a.name}<span class="enc-tooltip"><strong>${a.icon} ${a.name}</strong> (${typeLabel})<br>${a.desc}${extras}</span></span>`;
        }).join(' ') || '<span style="opacity:0.5;">None</span>';

        // Build passive tags with hover tooltips
        const passiveTags = (enemy.passives || []).map(p => {
            return `<span class="encounter-passive-tag">${p.name}<span class="enc-tooltip"><strong>${p.name}</strong><br>${p.desc}</span></span>`;
        }).join(' ') || '<span style="opacity:0.5;">None</span>';

        const phaseSection = isBossFloor && enemy.phases && enemy.phases.length
            ? `<span style="color:#ff8888;">📊 ${enemy.phases.length} phase(s)</span>`
            : '';

        // Build attack pattern display
        const pattern = enemy.pattern || [];
        const patternStr = pattern.length > 0
            ? pattern.map(key => {
                const ab = (enemy.abilities || {})[key];
                return ab ? `${ab.icon}` : '?';
            }).join(' → ')
            : '';
        const patternDiv = patternStr ? `<div style="font-size:0.8em; color:var(--text-dim); margin-top:4px;">Pattern: ${patternStr}</div>` : '';

        const cardVariant = isBossFloor ? 'encounter-card--boss' : 'encounter-card--standard';
        return `
            <div class="encounter-card ${cardVariant}">
              <div class="encounter-card__inner">
                <div class="encounter-card__title">${enemy.name}</div>
                ${enemy.image ? `<div class="encounter-card__art"><img class="encounter-card__art-img" src="${enemy.image}" alt="${enemy.name}"></div>` : ''}
                <div class="encounter-card__type-bar">
                    ${isBossFloor ? '💀 Boss' : '⚔️ Standard'} &nbsp;·&nbsp; ❤️ ${enemy.hp} HP &nbsp;·&nbsp; 🎲 ${diceStr}${phaseSection ? ' &nbsp;·&nbsp; ' + phaseSection : ''}
                </div>
                <div class="encounter-card__body">
                    <div>
                        <div class="encounter-card__section-label">Abilities</div>
                        <div class="encounter-card__tags">${abilityTags}</div>
                    </div>
                    <div>
                        <div class="encounter-card__section-label">Passives</div>
                        <div class="encounter-card__tags">${passiveTags}</div>
                    </div>
                    ${patternDiv}
                    <div class="encounter-card__rewards">Rewards: ${goldRange}g · ${xpRange} XP${isBossFloor ? ' · Boss artifact' : ''}</div>
                </div>
                <div class="encounter-card__footer">
                    <button class="btn" onclick="EncounterChoice.chooseStandard()">Fight (Standard)</button>
                </div>
              </div>
            </div>`;
    },

    _buildElitePanel(enemy, eliteModifiers, isBossFloor, floor = 15) {
        const { visible, hidden } = eliteModifiers;
        const purple = '#c060ff';

        // --- Build preview enemy (apply visible modifier + scaling) FIRST ---
        const previewEnemy = deepClone(enemy);
        applyEliteModifier(previewEnemy, visible);
        scaleElitePassives(previewEnemy, floor);

        // --- Visible modifier effect bullets (use scaled values from preview) ---
        const effectBullets = this._formatVisibleEffects(visible, enemy, previewEnemy);
        const effectsHtml = effectBullets.length
            ? effectBullets.map(b => `<div style="font-size:0.82em; color:${purple}; margin:2px 0;">${b}</div>`).join('')
            : '';
        const basePassiveIds = new Set((enemy.passives || []).map(p => p.id || p.name));
        const passiveTags = (previewEnemy.passives || []).map(p => {
            const isNew = !basePassiveIds.has(p.id || p.name);
            const border = isNew ? `border:1px solid ${purple};` : '';
            const newBadge = isNew ? `<span style="color:${purple}; font-weight:bold; margin-left:4px;">NEW</span>` : '';
            return `<span class="encounter-passive-tag" style="${border}">${p.name}${newBadge}<span class="enc-tooltip"><strong>${p.name}</strong><br>${p.desc}</span></span>`;
        }).join(' ') || '<span style="opacity:0.5;">None</span>';

        // --- Abilities (unchanged from base enemy) ---
        const abilityTags = Object.values(enemy.abilities || {}).map(a => {
            const typeLabel = { attack: 'Attack', poison: 'Poison', curse: 'Curse', buff: 'Buff', heal: 'Heal', debuff: 'Debuff' }[a.type] || a.type || 'Special';
            const extraInfo = [];
            if (a.multiHit) extraInfo.push('Multi-hit');
            if (a.penetrate) extraInfo.push(`Penetrates ${a.penetrate} block`);
            if (a.buffTarget) extraInfo.push(`Buffs next ${a.buffTarget}`);
            const extras = extraInfo.length ? `<br><span style="color:var(--gold); font-size:0.9em;">${extraInfo.join(' · ')}</span>` : '';
            return `<span class="encounter-ability-tag">${a.icon} ${a.name}<span class="enc-tooltip"><strong>${a.icon} ${a.name}</strong> (${typeLabel})<br>${a.desc}${extras}</span></span>`;
        }).join(' ') || '<span style="opacity:0.5;">None</span>';

        const phaseSection = isBossFloor && enemy.phases && enemy.phases.length
            ? `<span style="color:#ff8888;">📊 ${enemy.phases.length} phase(s)</span>`
            : '';

        // --- Attack pattern (same as base) ---
        const pattern = enemy.pattern || [];
        const patternStr = pattern.length > 0
            ? pattern.map(key => { const ab = (enemy.abilities || {})[key]; return ab ? ab.icon : '?'; }).join(' → ')
            : '';
        const patternDiv = patternStr ? `<div style="font-size:0.8em; color:var(--text-dim); margin-top:4px;">Pattern: ${patternStr}</div>` : '';

        // --- Rewards: gold/XP with both mults compounded (accurate — player gets both modifiers) ---
        const mults     = calculateRewardMultipliers([visible, hidden]);
        const eliteGold = Array.isArray(enemy.gold) ? `${Math.floor(enemy.gold[0] * mults.gold)}–${Math.floor(enemy.gold[1] * mults.gold)}` : Math.floor(enemy.gold * mults.gold);
        const eliteXp   = Array.isArray(enemy.xp)   ? `${Math.floor(enemy.xp[0] * mults.xp)}–${Math.floor(enemy.xp[1] * mults.xp)}`       : Math.floor(enemy.xp   * mults.xp);
        const hasLegendary = visible.legendaryChance || hidden.legendaryChance;
        const artifactNote = isBossFloor
            ? `<span style="color:${purple};">2 boss artifacts</span>${hasLegendary ? ` <span style="color:var(--gold); font-size:0.85em;">+ ✨ legendary chance</span>` : ''}`
            : `<span style="color:${purple};">Artifact pick (1 of 3)</span>`;

        return `
            <div class="encounter-card encounter-card--elite">
              <div class="encounter-card__inner">
                <div class="encounter-card__title">${enemy.name}</div>
                ${enemy.image ? `<div class="encounter-card__art"><img class="encounter-card__art-img" src="${enemy.image}" alt="${enemy.name}"></div>` : ''}
                <div class="encounter-card__type-bar">
                    💀 Elite &nbsp;·&nbsp; <span style="font-weight:bold;">${visible.prefix}</span> &nbsp;·&nbsp; ❤️ ??? HP &nbsp;·&nbsp; 🎲 ??? dice${phaseSection ? ' &nbsp;·&nbsp; ' + phaseSection : ''}
                </div>
                <div class="encounter-card__body">
                    ${effectsHtml ? `<div style="padding:6px 8px; background:rgba(192,96,255,0.08); border-radius:4px; border-left:2px solid ${purple};"><div style="font-size:0.72em; color:var(--text-dim); margin-bottom:3px; text-transform:uppercase; letter-spacing:0.05em;">${visible.prefix} grants:</div>${effectsHtml}</div>` : ''}
                    <div style="display:inline-flex; align-items:center; gap:6px; margin:6px 0; padding:5px 10px; background:rgba(100,80,140,0.25); border:1px dashed rgba(192,96,255,0.45); border-radius:6px; font-size:0.82em; color:${purple};">🔮 <strong>+ 1 hidden modifier</strong> &nbsp;— revealed on accept</div>
                    <div>
                        <div class="encounter-card__section-label">Abilities</div>
                        <div class="encounter-card__tags">${abilityTags}</div>
                    </div>
                    <div>
                        <div class="encounter-card__section-label">Passives</div>
                        <div class="encounter-card__tags">${passiveTags}</div>
                    </div>
                    ${patternDiv}
                    <div class="encounter-card__rewards">Rewards: <span style="color:${purple};">${eliteGold}g</span> · <span style="color:${purple};">${eliteXp} XP</span> · ${artifactNote}</div>
                </div>
                <div class="encounter-card__footer">
                    <button class="btn" onclick="EncounterChoice.chooseElite()">Fight (Elite)</button>
                </div>
              </div>
            </div>`;
    },

    _formatVisibleEffects(modifier, baseEnemy, previewEnemy) {
        const bullets = [];
        if (modifier.diceUpgrade) {
            const ex = baseEnemy.dice[0];
            bullets.push(`• Each die: +${modifier.diceUpgrade} faces${ex ? ` (e.g. d${ex} → d${ex + modifier.diceUpgrade})` : ''}`);
        }
        if (modifier.extraDice) {
            const counts = {};
            modifier.extraDice.forEach(d => { counts[d] = (counts[d] || 0) + 1; });
            Object.entries(counts).forEach(([d, n]) => bullets.push(`• Gains: +${n}×d${d}`));
        }
        if (modifier.hpMult && modifier.hpMult !== 1.0) {
            const pct = Math.round((modifier.hpMult - 1) * 100);
            bullets.push(`• HP: ${pct > 0 ? '+' : ''}${pct}%`);
        }
        if (modifier.addPassive) {
            // Use scaled passive desc from preview so bullet matches tooltip
            const scaledP = previewEnemy && (previewEnemy.passives || []).find(p => p.id === modifier.addPassive.id);
            const name = scaledP ? scaledP.name : modifier.addPassive.name;
            const desc = scaledP ? scaledP.desc : modifier.addPassive.desc;
            bullets.push(`• ${name}: ${desc}`);
        }
        if (modifier.applyStartingCurse) bullets.push(`• 💜 All your dice roll −1 this fight`);
        if (modifier.doublePhases)       bullets.push(`• 🌀 Phase transitions trigger earlier`);
        return bullets;
    },

    _buildLockedElitePanel(eliteChance) {
        const pct = Math.round(eliteChance * 100);
        const nextAct = pct <= 33 ? 'Act 2' : 'Act 3';
        return `
            <div class="encounter-card encounter-card--locked">
              <div class="encounter-card__inner">
                <div class="encounter-card__title">💀 Elite</div>
                <div class="encounter-card__art">
                    <div class="encounter-card__name" style="color:#666;">No elite challenge</div>
                    <div class="encounter-card__stats" style="color:#555;">this floor</div>
                </div>
                <div class="encounter-card__body">
                    <div style="font-size:0.9em; color:#666;">Elite encounters grow more common as you descend deeper.</div>
                    <div style="font-size:0.85em; color:#555;">${nextAct}: ${Math.min(pct + 33, 100)}% chance · Act 3: always</div>
                </div>
                <div class="encounter-card__footer">
                    <button class="btn" disabled>Not Available</button>
                </div>
              </div>
            </div>`;
    },

    _formatDicePool(dice) {
        const counts = {};
        dice.forEach(d => { counts[d] = (counts[d] || 0) + 1; });
        return Object.entries(counts).map(([d, n]) => `${n}×d${d}`).join(' + ') || '—';
    },

};

// ════════════════════════════════════════════════════════════
//  CAMPAIGN SCREEN — The Ancient Order progression view
// ════════════════════════════════════════════════════════════
const CampaignScreen = {

    show() {
        this._render();
        show('screen-campaign');
    },

    back() {
        _refreshHomeRank();
        show('screen-start');
    },

    _render() {
        const el = document.getElementById('campaign-content');
        if (!el) return;

        const state     = Campaign.getState();
        const earned    = new Set(state.achievements.map(a => a.id));
        const earnedMap = Object.fromEntries(state.achievements.map(a => [a.id, a.completedAt]));
        const current   = state.rankIndex;

        // ── Rank path ──────────────────────────────────────────
        const UNLOCK_HINTS = [
            '',                              // The Outsider — starting rank
            'Complete any run',              // The Descended
            'Win a Casual run',              // Initiate of the Order
            'Win a Standard run',            // The Acolyte
            'Win a Heroic run',              // The Adept
        ];

        const steps = RANKS.map((rank, i) => {
            const isDone    = i < current;
            const isCurrent = i === current;
            const isLocked  = i > current;

            let cls, icon, hint;
            if (isDone)    { cls = 'campaign-step--done';    icon = '✓'; hint = ''; }
            else if (isCurrent) { cls = 'campaign-step--current'; icon = '★'; hint = rank.flavour; }
            else           { cls = 'campaign-step--locked';  icon = '🔒'; hint = UNLOCK_HINTS[i] ? `Unlock: ${UNLOCK_HINTS[i]}` : ''; }

            const connector = i < RANKS.length - 1
                ? `<div class="campaign-step-connector ${isDone ? 'campaign-step-connector--done' : ''}"></div>`
                : '';

            return `
                <div class="campaign-step ${cls}">
                    <div class="campaign-step-icon">${icon}</div>
                    <div class="campaign-step-body">
                        <div class="campaign-step-title">${rank.title}</div>
                        ${hint ? `<div class="campaign-step-hint">${hint}</div>` : ''}
                    </div>
                </div>
                ${connector}`;
        }).join('');

        // ── Milestones ─────────────────────────────────────────
        const milestoneRows = ACHIEVEMENTS.map(ach => {
            const ts = earnedMap[ach.id];
            if (ts) {
                const d = new Date(ts);
                const dateStr = d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
                return `
                    <div class="campaign-milestone campaign-milestone--earned">
                        <span class="milestone-icon">✓</span>
                        <div class="milestone-body">
                            <span class="milestone-title">${ach.title}</span>
                            <span class="milestone-desc">${ach.description}</span>
                        </div>
                        <span class="milestone-date">${dateStr}</span>
                    </div>`;
            } else {
                return `
                    <div class="campaign-milestone campaign-milestone--locked">
                        <span class="milestone-icon">🔒</span>
                        <div class="milestone-body">
                            <span class="milestone-title">${ach.title}</span>
                            <span class="milestone-desc">${ach.description}</span>
                        </div>
                    </div>`;
            }
        }).join('');

        // ── Skill die milestone ────────────────────────────────
        const skillDieEarned = state.skillDieRevealed;
        const skillDieRow = `
            <div class="campaign-milestone ${skillDieEarned ? 'campaign-milestone--earned' : 'campaign-milestone--locked'}">
                <span class="milestone-icon">${skillDieEarned ? '✓' : '🔒'}</span>
                <div class="milestone-body">
                    <span class="milestone-title">The Die Awakens</span>
                    <span class="milestone-desc">Reveal the skill die for the first time. It will be pre-allocated in all future runs.</span>
                </div>
            </div>`;

        el.innerHTML = `
            <div class="campaign-path">${steps}</div>
            <div class="campaign-milestones">
                <h3 class="campaign-milestones-title">Milestones</h3>
                ${milestoneRows}
                ${skillDieRow}
            </div>`;
    },
};

// ════════════════════════════════════════════════════════════
//  STATS — run history screen
// ════════════════════════════════════════════════════════════
const Stats = {

    show() {
        const stats = RunHistory.getStats();
        $('stats-content').innerHTML = stats ? this._render(stats) : this._empty();
        show('screen-stats');
    },

    back() {
        _refreshHomeRank();
        show('screen-start');
    },

    clearHistory() {
        if (!confirm('Clear all run history? This cannot be undone.')) return;
        RunHistory.clear();
        this.show();
    },

    _empty() {
        return '<p style="color:var(--text-dim); text-align:center; padding:40px 0; font-family:EB Garamond,serif;">No runs recorded yet.<br>Enter the dungeon!</p>';
    },

    _render(stats) {
        const pct = (w, t) => t ? Math.round(w / t * 100) + '%' : '—';
        const fmt = n => n.toLocaleString();

        const diffLabels = { casual: 'Casual', standard: 'Standard', heroic: 'Heroic' };
        const diffRows = ['casual', 'standard', 'heroic']
            .filter(d => stats.byDifficulty[d].total > 0)
            .map(d => {
                const s = stats.byDifficulty[d];
                return `<tr>
                    <td>${diffLabels[d]}</td>
                    <td>${s.total}</td>
                    <td>${s.wins}</td>
                    <td>${pct(s.wins, s.total)}</td>
                    <td>Floor ${s.bestFloor}</td>
                </tr>`;
            }).join('');

        const recentRows = stats.recentRuns.map(r => {
            const date = new Date(r.id).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
            const winCss = r.outcome === 'victory' ? 'color:var(--gold)' : 'color:var(--red)';
            const result = r.outcome === 'victory' ? '✓ Win' : '✗ Loss';
            const diff   = r.difficulty.charAt(0).toUpperCase() + r.difficulty.slice(1);
            const seed   = r.seed
                ? (r.seed >>> 0).toString(16).toUpperCase().padStart(8, '0').replace(/(.{4})(.{4})/, '$1 $2')
                : '—';
            return `<tr>
                <td style="color:var(--text-dim)">${date}</td>
                <td>${diff}</td>
                <td style="${winCss}">${result}</td>
                <td>Floor ${r.floor}</td>
                <td>${r.enemiesKilled}</td>
                <td style="color:var(--text-dim); font-size:0.8em; font-family:'JetBrains Mono',monospace">${seed}</td>
            </tr>`;
        }).join('');

        return `
<div class="stats-section">
    <h3>Lifetime</h3>
    <div class="stats-grid">
        <div class="stats-kv"><span>Total Runs</span><span>${stats.totalRuns}</span></div>
        <div class="stats-kv"><span>Victories</span><span>${stats.totalWins} (${pct(stats.totalWins, stats.totalRuns)})</span></div>
        <div class="stats-kv"><span>Enemies Slain</span><span>${fmt(stats.totalEnemies)}</span></div>
        <div class="stats-kv"><span>Gold Earned</span><span>${fmt(stats.totalGold)}</span></div>
    </div>
</div>
<div class="stats-section">
    <h3>By Difficulty</h3>
    ${diffRows
        ? `<table class="stats-table">
            <thead><tr><th>Difficulty</th><th>Runs</th><th>Wins</th><th>Win%</th><th>Best</th></tr></thead>
            <tbody>${diffRows}</tbody>
           </table>`
        : '<p style="color:var(--text-dim); font-size:0.85em">No data yet.</p>'}
</div>
<div class="stats-section">
    <h3>Recent Runs</h3>
    ${recentRows
        ? `<table class="stats-table">
            <thead><tr><th>Date</th><th>Difficulty</th><th>Result</th><th>Floor</th><th>Kills</th><th>Seed</th></tr></thead>
            <tbody>${recentRows}</tbody>
           </table>`
        : '<p style="color:var(--text-dim); font-size:0.85em">No runs yet.</p>'}
</div>`;
    },
};

// ════════════════════════════════════════════════════════════
//  INIT — expose modules on window for inline onclick handlers
// ════════════════════════════════════════════════════════════
window.Game = Game;
window.Combat = Combat;
window.Rewards = Rewards;
window.SkillDie = SkillDie;
window.BattleSummary = BattleSummary;
window.Shop = Shop;
window.Events = Events;
window.Rest = Rest;
window.Inventory = Inventory;
window.DungeonMap = DungeonMap;
window.DungeonPath = DungeonPath;
window.DifficultySelect = DifficultySelect;
window.addConsumableToInventory = addConsumableToInventory;
window.EncounterChoice = EncounterChoice;
window.Stats = Stats;
window.CampaignScreen = CampaignScreen;

// Prevent right-click context menu on combat screen
document.getElementById('screen-combat').addEventListener('contextmenu', e => e.preventDefault());

updateStats();
_refreshHomeRank();

// Expose Campaign on window for tester console access
window.Campaign = Campaign;
