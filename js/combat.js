// ════════════════════════════════════════════════════════════
//  COMBAT
// ════════════════════════════════════════════════════════════
import { pickWeightedConsumable } from './constants.js';
import { calculateRewardMultipliers } from './encounters/eliteModifierSystem.js';
import { GS, $, log, gainXP, gainGold, heal, pick, rand } from './state.js';
import { rollSingleDie, getActiveFace, renderCombatDice, renderConsumables, updateStats, setupDropZones, show, createDie, getSlotById, enterRerollMode, exitRerollMode, sortPoolDice, resetSortMode } from './engine.js';

// window.Game and window.Rewards are set by screens.js at load time
// to avoid circular module dependencies

// Helper: create a die object from a raw die size (e.g. 6 → d6 with faces 1-6)
const enemyDie = sides => createDie(1, sides, sides);

// ── STATUS HELPERS ──
function applyEnemyPoison(amount) {
    if (GS.artifacts.some(a => a.effect === 'venomGland')) amount *= 2;
    GS.enemy.poison = (GS.enemy.poison || 0) + amount;
    if (GS.artifacts.some(a => a.effect === 'witchsHex')) applyStatus('weaken', 1);
    log(`☠️ Applied ${amount} poison! (${GS.enemy.poison} stacks)`, 'info');
}

function applyStatus(type, stacks, turns = 2) {
    const es = GS.enemyStatus;
    if (!es) return;
    if (type === 'chill') {
        es.chill += stacks; es.chillTurns = 2;
        log(`❄️ Chill: ${es.chill} stacks!`, 'info');
        if (GS.artifacts.some(a => a.effect === 'frozenHeart') && es.chill >= 6) {
            es.freeze = es.freeze > 0 ? es.freeze + 1 : 1;
            es.chill = 0;
            log('🧊 Frozen Heart: Freeze!', 'info');
        }
    } else if (type === 'freeze') {
        es.freeze = es.freeze > 0 ? es.freeze + 1 : 1;
        log('🧊 Frozen!', 'info');
    } else if (type === 'mark') {
        es.mark += stacks; es.markTurns = turns;
        log(`🎯 Mark +${stacks} (${es.mark} total)`, 'info');
    } else if (type === 'weaken') {
        es.weaken = turns;
        log('💔 Weaken! Enemy deals 25% less.', 'info');
    } else if (type === 'burn') {
        es.burn += stacks; es.burnTurns = turns;
        log(`🔥 Burn: ${es.burn} stacks!`, 'damage');
    } else if (type === 'stun') {
        if (!es.stunCooldown) {
            es.stun = 1; es.stunCooldown = true;
            log('⚡ Stunned!', 'info');
        }
    }
}

// ── CONSUMABLE HELPERS ──
function findConsumableIdx(id) { return GS.consumables.findIndex(c => c && c.id === id); }
function findConsumable(id) { return GS.consumables.find(c => c && c.id === id); }
function removeConsumableByIdx(i) {
    GS.consumables[i] = null;
    // trim trailing nulls
    while (GS.consumables.length > 0 && GS.consumables[GS.consumables.length - 1] === null) {
        GS.consumables.pop();
    }
    renderConsumables();
}

// ── ENVIRONMENT HELPERS ──

/**
 * Build the combat context object passed to environment callbacks.
 * player.hp is a live getter/setter over GS.hp.
 */
function combatCtx() {
    const playerProxy = {
        get hp()      { return GS.hp; },
        set hp(v)     { GS.hp = v; },
        get maxHp()   { return GS.maxHp; },
        name: 'Player',
        dice: GS.dice,
    };
    return {
        player:       playerProxy,
        enemy:        GS.enemy,
        environment:  GS.environment,
        firstAttacker: GS._firstAttacker,
        get chaosStormActive()  { return GS._chaosStormActive; },
        set chaosStormActive(v) { GS._chaosStormActive = v; },
        log: (msg) => log(msg, 'info'),
    };
}

/**
 * Apply consecrated ground modifier to enemy HP and dice at combat start.
 * Undead enemies are weakened; all others are empowered.
 */
function applyConsecratedGround(enemy) {
    const UNDEAD = ['Skeleton', 'Lich', 'The Bone King'];
    const isUndead = UNDEAD.some(n => enemy.name.includes(n));
    if (isUndead) {
        enemy.hp       = Math.floor(enemy.hp * 0.7);
        enemy.maxHp    = enemy.hp;
        enemy.currentHp = enemy.hp;
        enemy.dice     = enemy.dice.map(d => enemyDie(Math.max(1, Math.floor(d.max * 0.7))));
        log('✝️ Consecrated Ground: undead weakened! (−30%)', 'info');
    } else {
        enemy.hp       = Math.floor(enemy.hp * 1.15);
        enemy.maxHp    = enemy.hp;
        enemy.currentHp = enemy.hp;
        enemy.dice     = enemy.dice.map(d => enemyDie(Math.floor(d.max * 1.15)));
        log('✝️ Consecrated Ground: enemy empowered! (+15%)', 'info');
    }
}

/**
 * Apply starting curse from the 'cursed' elite modifier.
 * All player dice are penalised by −1 this fight.
 */
function applyStartingCurse() {
    GS.dice.forEach(d => { d.cursed = true; });
    log('💜 Cursed! All your dice show −1 this fight.', 'damage');
}

export const Combat = {
    start() {
        resetSortMode();
        const enc      = GS.encounter;  // always set by EncounterChoice before calling start()
        const template = enc.enemy;     // already deep-cloned, floor-scaled, elite mods applied
        const isElite  = enc.isElite;
        const isBoss   = enc.isBossFloor;

        // Reward multipliers from applied elite modifiers
        let eliteGoldMult = 1, eliteXpMult = 1;
        if (isElite && template.appliedModifiers && template.appliedModifiers.length) {
            const mults   = calculateRewardMultipliers(template.appliedModifiers);
            eliteGoldMult = mults.gold;
            eliteXpMult   = mults.xp;
        }

        GS.enemy = {
            name:        template.name,
            hp:          template.hp,
            maxHp:       template.hp,
            currentHp:   template.hp,
            dice:        template.dice.map(enemyDie),
            extraDice:   [],
            abilities:   template.abilities,
            passives:    [...(template.passives || [])],
            pattern:     template.pattern,
            phases:      template.phases ? JSON.parse(JSON.stringify(template.phases)) : null,
            patternIdx:  0,
            storedBonus: 0,
            turnsAlive:  0,
            phaseTriggered: [],
            phylacteryUsed: false,
            bloodFrenzyTriggered: false,
            _mitosisTriggered: false,
            _damageTakenMult: 1,
            _doubleAction: template.doubleAction || false,
            shield:      0,
            charged:     false,
            immune:      false,
            diceResults: [],
            intentValue: 0,
            currentAbilityKey: null,
            gold:        template.gold,
            xp:          template.xp,
            eliteGoldMult,
            eliteXpMult,
            isElite, isBoss,
            poison: 0,
        };

        // Set active environment for hook calls during combat
        GS.environment        = enc.environment || null;
        GS._chaosStormActive  = false;
        GS._firstAttacker     = 'enemy'; // enemy always acts first in execute()

        // Apply consecrated ground stat modifier at combat init
        if (GS.environment?.id === 'consecratedGround') {
            applyConsecratedGround(GS.enemy);
        }

        // Apply starting curse from elite modifier
        if (template.cursePlayerOnStart) {
            applyStartingCurse();
        }

        // Reset player debuffs for new combat
        GS.playerDebuffs = { poison: 0, poisonTurns: 0, disabledSlots: [], diceReduction: 0 };

        // Reset enemy status effects for new combat
        GS.enemyStatus = { chill: 0, chillTurns: 0, freeze: 0, mark: 0, markTurns: 0, weaken: 0, burn: 0, burnTurns: 0, stun: 0, stunCooldown: false };
        GS.echoStoneDieId = null;
        GS.gamblerCoinBonus = 0;
        GS.huntersMarkFired = false;
        GS.hourglassFreeFirstTurn = false;
        GS.furyCharges = 0;
        // Reset per-combat consumable flags
        GS.ironSkinActive = false;
        GS.ragePotionActive = false;
        GS.hasteDiceBonus = 0;
        GS.consumableUsedThisTurn = false;
        exitRerollMode();

        // Remove Midas Die temp dice from previous combat
        GS.dice = GS.dice.filter(d => !d.midasTemp);

        // tempBuff: Void Lord weakened (Oracle: Defy)
        if (GS.enemy.name.includes('Void Lord') && GS.tempBuffs && GS.tempBuffs.voidLordWeakened) {
            GS.enemy.currentHp = Math.floor(GS.enemy.hp * 0.9);
            GS.tempBuffs.voidLordWeakened = false;
            log('The Void Lord begins weakened! (90% HP)', 'info');
        }

        // tempBuff: armor elixir
        if (GS.tempBuffs && GS.tempBuffs.armorCombats > 0) {
            GS.buffs.armor += GS.tempBuffs.armorBonus;
            log(`Fortification Elixir: +${GS.tempBuffs.armorBonus} armor this combat! (${GS.tempBuffs.armorCombats} combats remain)`, 'info');
        }

        GS.dice.forEach(d => { d.rolled = false; d.value = 0; d.location = 'pool'; delete d.slotId; });
        GS.allocated = { strike: [], guard: [] };
        GS.rolled = false;
        GS.autoLifesteal = 0;
        GS.regenStacks = 0;
        GS.rerollsLeft = GS.rerolls;

        const gildedArtifact = GS.artifacts.find(a => a.effect === 'goldToDmg');
        if (gildedArtifact && GS.gold >= 50) {
            GS.gold -= 50;
            GS.enemy.currentHp -= 15;
            if (GS.challengeMode) GS.challengeDmg += 15;
            log(`✨ Gilded Gauntlet: Spent 50 gold, dealt 15 damage!`, 'damage');
        }

        // Midas Die: add temp d6 that auto-fires gold
        if (GS.artifacts.some(a => a.effect === 'midasDie')) {
            const md = createDie(1, 6, 6);
            md.midasTemp = true;
            GS.dice.push(md);
        }

        // Gambler's Coin: flip at combat start
        if (GS.artifacts.some(a => a.effect === 'gamblersCoin')) {
            GS.gamblerCoinBonus = Math.random() < 0.5 ? 2 : -1;
            log(GS.gamblerCoinBonus > 0 ? '🪙 Heads! All dice +2 this combat!' : '🪙 Tails! All dice -1 this combat!', 'info');
        }

        // Hourglass: free first turn
        if (GS.artifacts.some(a => a.effect === 'hourglass')) GS.hourglassFreeFirstTurn = true;

        // Parasite: gold per combat
        if (GS.parasiteGoldPerCombat > 0) {
            const pg = gainGold(GS.parasiteGoldPerCombat);
            log(`🦠 Parasite: +${pg} gold`, 'info');
        }

        GS.isFirstTurn = true;
        $('combat-log').innerHTML = '';

        // Roll enemy intent for first turn
        Combat._rollEnemyTurn();

        updateStats();
        setupDropZones();
        Combat.renderEnemy();
        renderCombatDice();
        renderConsumables();
        Combat.renderEnvironmentBar();

        const label = isBoss ? '👑 BOSS' : isElite ? '⚡ ELITE' : `Floor ${GS.floor}`;
        const diceDesc = GS.enemy.dice.map(d => `d${d.max}`).join('+');
        log(`${label}: ${GS.enemy.name} appears! (${GS.enemy.hp} HP | Dice: ${diceDesc})`, 'info');

        show('screen-combat');
        setTimeout(() => Combat.roll(), 300);
    },

    renderEnvironmentBar() {
        const bar = document.getElementById('combat-environment-bar');
        const env = GS.environment;
        if (!env) { bar.style.display = 'none'; bar.innerHTML = ''; return; }
        bar.style.display = 'block';
        bar.innerHTML = `<div style="background:rgba(212,165,52,0.08); border:1px solid rgba(212,165,52,0.4); border-radius:6px; padding:6px 12px; font-size:0.82em; display:flex; align-items:center; gap:8px;">
            <span style="color:var(--gold); font-weight:600; white-space:nowrap; letter-spacing:0.03em;">${env.icon} ${env.name}</span>
            <span style="color:var(--text-bright); opacity:0.85;">— ${env.desc}</span>
        </div>`;
    },

    renderEnemy() {
        const e = GS.enemy;
        const nameCls = (e.isElite || e.isBoss) ? 'enemy-name elite' : 'enemy-name';

        // Dice pool display
        const allDice = [...e.dice, ...e.extraDice];
        const counts = {};
        allDice.forEach(d => { counts[d.max] = (counts[d.max] || 0) + 1; });
        const diceDesc = Object.entries(counts).map(([d, n]) => `${n}×d${d}`).join(' + ');
        const diceIcons = '🎲'.repeat(Math.min(allDice.length, 6));
        const shieldPart = e.shield > 0 ? ` &nbsp;🛡️ Shield: ${e.shield}` : '';
        const diceHtml = `<div class="enemy-dice-pool" style="font-size:0.8em;color:var(--text-dim);margin:4px 0;">${diceIcons} ${diceDesc}${shieldPart}</div>`;

        // Status indicators
        let statusIndicators = '';
        if (e.poison > 0) statusIndicators += `<span style="color:#50a030;font-size:0.75em;margin-left:8px;">☠️ Poison ×${e.poison}</span>`;
        if (e.phaseTriggered && e.phaseTriggered.length > 0) {
            statusIndicators += `<span style="color:#aa44ff;font-size:0.75em;margin-left:8px;">⚡ Phase ${e.phaseTriggered.length + 1}</span>`;
        }
        const es = GS.enemyStatus;
        if (es) {
            if (es.chill > 0)  statusIndicators += `<span style="color:#80c0e0;font-size:0.75em;margin-left:8px;">❄️ Chill ${es.chill}</span>`;
            if (es.freeze > 0) statusIndicators += `<span style="color:#60a0d0;font-size:0.75em;margin-left:8px;">🧊 Frozen ${es.freeze}</span>`;
            if (es.mark > 0)   statusIndicators += `<span style="color:#cc4444;font-size:0.75em;margin-left:8px;">🎯 Mark +${es.mark}</span>`;
            if (es.weaken > 0) statusIndicators += `<span style="color:#c060a0;font-size:0.75em;margin-left:8px;">💔 Weakened</span>`;
            if (es.burn > 0)   statusIndicators += `<span style="color:#d06020;font-size:0.75em;margin-left:8px;">🔥 Burn ${es.burn}</span>`;
            if (es.stun > 0)   statusIndicators += `<span style="color:#d0d020;font-size:0.75em;margin-left:8px;">⚡ Stunned</span>`;
        }

        // Passive tags
        const passiveHtml = e.passives && e.passives.length > 0
            ? `<div class="enemy-passive-tags">${e.passives.map(p => `<span class="passive-tag">${p.name}: ${p.desc}</span>`).join('')}</div>`
            : '';

        // Player debuff indicators
        let debuffHtml = '';
        if (GS.playerDebuffs.poison > 0)
            debuffHtml += `<span class="passive-tag" style="color:#f07070;border-color:rgba(200,60,60,0.3)">☠️ You: Poison ×${GS.playerDebuffs.poison} (${GS.playerDebuffs.poisonTurns}t)</span>`;
        if (GS.playerDebuffs.disabledSlots && GS.playerDebuffs.disabledSlots.length > 0)
            GS.playerDebuffs.disabledSlots.forEach(ds => {
                const slotType = ds.slotId.startsWith('str') ? 'strike' : 'guard';
                debuffHtml += `<span class="passive-tag" style="color:#f07070;border-color:rgba(200,60,60,0.3)">🔒 ${slotType} slot sealed (${ds.turnsLeft}t)</span>`;
            });
        if (debuffHtml) debuffHtml = `<div class="enemy-passive-tags">${debuffHtml}</div>`;

        const intentDisplay = Combat._buildIntentText();

        if (GS.challengeMode) {
            const dpt = GS.challengeTurns > 0 ? Math.round(GS.challengeDmg / GS.challengeTurns) : 0;
            $('enemy-panel').innerHTML = `
                <div class="${nameCls}">${e.name}${statusIndicators}</div>
                <div class="enemy-subtitle">💀 CHALLENGE — Survive and deal maximum damage</div>
                ${diceHtml}${passiveHtml}${debuffHtml}
                <div style="text-align:center;margin:8px 0;">
                    <span style="font-size:1.4em;color:var(--gold);font-family:JetBrains Mono,monospace;">💥 ${GS.challengeDmg.toLocaleString()}</span>
                    <span style="font-size:0.8em;color:var(--text-dim);margin-left:8px;">(${dpt}/turn)</span>
                </div>
                <div class="enemy-intent">${intentDisplay}</div>
            `;
        } else {
            const pct = Math.max(0, (e.currentHp / e.hp) * 100);
            const anomaly = GS.encounter?.anomaly;
            const anomalyTag = anomaly
                ? `<span title="${anomaly.desc || ''}" style="margin-left:8px;background:#663300;color:#ffaa44;border-radius:4px;padding:1px 6px;font-size:0.7em;cursor:help;">⚠️ ${anomaly.name}</span>`
                : '';
            $('enemy-panel').innerHTML = `
                <div class="${nameCls}">${e.name}${statusIndicators}</div>
                <div class="enemy-subtitle">${e.isBoss ? '👑 BOSS' : e.isElite ? '⚡ ELITE' : 'Enemy'} — Floor ${GS.floor}, Act ${GS.act}${anomalyTag}</div>
                ${diceHtml}
                <div class="enemy-hp-bar"><div class="enemy-hp-fill" style="width:${pct}%"></div></div>
                <div class="enemy-hp-text">${e.currentHp} / ${e.hp}</div>
                ${passiveHtml}${debuffHtml}
                <div class="enemy-intent">${intentDisplay}</div>
            `;
        }
    },

    // Ability types that don't scale with dice — skip rolling entirely for these.
    _abilityNeedsRoll(type) {
        return type !== 'charge' && type !== 'summon_die' && type !== 'decay';
    },

    _rollEnemyTurn() {
        const e = GS.enemy;
        const abilityKey = e.pattern[e.patternIdx % e.pattern.length];
        e.currentAbilityKey = abilityKey;
        const ability = e.abilities[abilityKey];

        // Abilities with fixed effects don't roll dice
        if (!Combat._abilityNeedsRoll(ability.type)) {
            e.diceResults = [];
            e.intentValue = 0;
            e.charged = false; // still consume charge token if pending
            return;
        }

        // Turn-temporary bonus dice (not stored in extraDice)
        const turnBonusDice = [];

        // Expose: +1 die per attack slot (always empty at roll time since player hasn't allocated yet)
        const exposeP = e.passives.find(p => p.id === 'expose');
        if (exposeP) {
            const slotCount = GS.slots.strike.length;
            for (let i = 0; i < slotCount; i++) turnBonusDice.push(enemyDie(exposeP.params.dieSize));
        }

        // Greed Tax: +1 die per goldPer gold held (re-computed each turn)
        const greedP = e.passives.find(p => p.id === 'greedTax');
        const greedExtra = greedP ? Array.from({length: Math.floor(GS.gold / greedP.params.goldPer)}, () => enemyDie(greedP.params.dieSize)) : [];

        // Assemble pool; if charged, double it
        const pool = [...e.dice, ...e.extraDice, ...greedExtra, ...turnBonusDice];
        const effectivePool = e.charged ? [...pool, ...pool] : pool;
        e.charged = false;

        e.diceResults = effectivePool.map(d => rand(d.min, d.max));

        // Environment: modify enemy dice results
        if (GS.environment?.onDiceRoll) {
            e.diceResults = GS.environment.onDiceRoll([...e.diceResults], false, combatCtx());
        }

        // Chaos Storm: reroll one random enemy die
        if (GS._chaosStormActive) {
            const idx = Math.floor(Math.random() * e.diceResults.length);
            if (effectivePool[idx]) {
                e.diceResults[idx] = rand(effectivePool[idx].min, effectivePool[idx].max);
                log(`⚡ Chaos storm rerolls enemy die ${idx + 1}: ${e.diceResults[idx]}`, 'info');
            }
            // Don't reset here — reset after player dice roll (both combatants processed)
        }

        const rawSum = e.diceResults.reduce((a, b) => a + b, 0);
        const chillReduction = GS.enemyStatus ? (GS.enemyStatus.chill || 0) : 0;

        if (ability.type === 'buff') {
            e.storedBonus += rawSum;
            e.intentValue = rawSum;
        } else if (ability.type === 'attack' || ability.type === 'unblockable') {
            e.intentValue = Math.max(0, rawSum + e.storedBonus - chillReduction);
            e.storedBonus = 0;
        } else {
            e.intentValue = rawSum;
        }

        // halfDamage (Wing Buffet): halve the intent after computing
        if (ability.halfDamage) e.intentValue = Math.floor(e.intentValue / 2);
    },

    _buildIntentText() {
        const e = GS.enemy;
        if (!e || !e.currentAbilityKey) return '...';
        const ab = e.abilities[e.currentAbilityKey];
        if (!ab) return '...';

        const es = GS.enemyStatus;
        if (es && (es.freeze > 0 || es.stun > 0)) return '⚡ STUNNED — Skips this turn!';

        const diceStr = e.diceResults.join(' + ');
        const sum = e.diceResults.reduce((a, b) => a + b, 0);
        const iv = e.intentValue;

        let mods = [];
        if (es && es.chill > 0 && (ab.type === 'attack' || ab.type === 'unblockable')) mods.push(`❄️−${es.chill}`);
        if (es && es.weaken > 0 && (ab.type === 'attack' || ab.type === 'unblockable')) mods.push('💔×0.75');
        // Phase passive: show resist indicator on protected turns
        const phasePassive = e.passives.find(p => p.id === 'phase');
        if (phasePassive && e.turnsAlive % 2 === 0) mods.push('🌀 RESIST TURN');
        const modStr = mods.length ? ` [${mods.join(' ')}]` : '';

        switch (ab.type) {
            case 'attack':
                if (ab.multiHit) return `${ab.icon} ${ab.name}: ${diceStr} → each die hits separately${modStr}`;
                if (ab.penetrate) return `${ab.icon} ${ab.name}: ${diceStr} = ${sum} → ${iv} damage (${ab.penetrate} pierce)${modStr}`;
                return `${ab.icon} ${ab.name}: ${diceStr} = ${sum} → ${iv} damage incoming${modStr}`;
            case 'unblockable':
                return `${ab.icon} ${ab.name}: ${diceStr} = ${sum} → ${iv} unblockable!`;
            case 'buff':
                return `${ab.icon} ${ab.name}: ${diceStr} = ${sum} → +${sum} stored for next attack`;
            case 'heal':
                return `${ab.icon} ${ab.name}: ${diceStr} = ${sum} → heals ${sum} HP`;
            case 'shield':
                return `${ab.icon} ${ab.name}: ${diceStr} = ${sum} → gains ${sum} shield`;
            case 'poison':
                return `${ab.icon} ${ab.name}: ${diceStr} = ${sum} → apply ${sum} poison stacks`;
            case 'curse': {
                const sealCount = ab.slotsToSeal || 1;
                const sealDur = ab.fixedDuration || 1;
                return `${ab.icon} ${ab.name}: ${diceStr} = ${sum} → seal ${sealCount} slot${sealCount > 1 ? 's' : ''} for ${sealDur} turn${sealDur > 1 ? 's' : ''}`;
            }
            case 'steal':
                return `${ab.icon} ${ab.name}: ${diceStr} = ${sum} → steal up to ${sum} gold`;
            case 'charge':
                if (ab.immune) return `${ab.icon} ${ab.name}: Vanishes! Immune this turn — next strike DOUBLED`;
                return `${ab.icon} ${ab.name}: Charging... next attack DOUBLED`;
            case 'decay':
                return `${ab.icon} ${ab.name}: All your dice lose 1 max value!`;
            case 'summon_die':
                return `${ab.icon} ${ab.name}: Permanently gains +1d${ab.dieSize || 6}!`;
            default:
                return `${ab.icon} ${ab.name}: ${diceStr} = ${sum}`;
        }
    },

    roll() {
        GS.dice.forEach(d => {
            if (!d.rolled) rollSingleDie(d);
        });
        GS.rolled = true;

        // Lich Decay Aura: reduce all dice by 1 after rolling (min 1)
        if (GS.playerDebuffs.diceReduction > 0) {
            if (GS.artifacts.some(a => a.effect === 'ironWill')) {
                log('🧠 Iron Will: dice unaffected by Decay Aura!', 'info');
            } else {
                GS.dice.forEach(d => {
                    if (d.rolled) d.value = Math.max(1, d.value - GS.playerDebuffs.diceReduction);
                });
            }
        }

        // Haste Elixir: +1 to all dice values this turn
        if (GS.hasteDiceBonus > 0) {
            GS.dice.forEach(d => {
                if (d.rolled) d.value = Math.min(d.max, d.value + GS.hasteDiceBonus);
            });
        }

        // Lucky Charm: if lowest die ≤ 2, reroll it to match highest
        const luckyIdx = findConsumableIdx('lucky');
        if (luckyIdx >= 0) {
            const rolledDice = GS.dice.filter(d => d.rolled && d.location !== 'auto');
            const hasLow = rolledDice.some(d => d.value <= 2);
            if (hasLow) {
                const lowest = rolledDice.reduce((a, b) => a.value <= b.value ? a : b);
                const highest = rolledDice.reduce((a, b) => a.value >= b.value ? a : b);
                const newVal = Math.max(highest.value, 1);
                lowest.value = newVal;
                log(`🍀 Lucky Charm triggered! Die rerolled to ${newVal}!`, 'info');
                removeConsumableByIdx(luckyIdx);
            }
        }

        // Auto-tray retired — no auto-fire face mods or Midas Die in new system

        // Environment: modify player dice results
        if (GS.environment?.onDiceRoll) {
            const rollable = GS.dice.filter(d => d.rolled && d.location !== 'auto');
            const raw      = rollable.map(d => d.value);
            const modified = GS.environment.onDiceRoll(raw, true, combatCtx());
            modified.forEach((v, i) => { if (rollable[i]) rollable[i].value = v; });
        }

        // Chaos Storm: reroll one player die (resets the flag after both combatants processed)
        if (GS._chaosStormActive) {
            const rollable = GS.dice.filter(d => d.rolled && d.location !== 'auto');
            if (rollable.length > 0) {
                const idx = Math.floor(Math.random() * rollable.length);
                rollable[idx].value = rand(1, rollable[idx].max);
                log(`⚡ Chaos storm rerolls your die ${idx + 1}: ${rollable[idx].value}`, 'info');
            }
            GS._chaosStormActive = false;
        }

        const dieEls = document.querySelectorAll('.die');
        dieEls.forEach(el => el.classList.add('rolling'));
        setTimeout(() => {
            renderCombatDice();
            updateStats();
            renderConsumables();
            log('Rolled: ' + GS.dice.map(d => d.value).join(', '), 'info');
        }, 400);
    },

    returnAll() {
        GS.dice.forEach(d => { d.location = 'pool'; });
        GS.allocated = { strike: [], guard: [] };
        renderCombatDice();
    },

    enterRerollMode,
    exitRerollMode,
    sortDice: sortPoolDice,

    execute() {
        if ($('btn-execute')) $('btn-execute').style.display = 'none';
        if ($('btn-return-all')) $('btn-return-all').style.display = 'none';
        exitRerollMode();

        const e = GS.enemy;
        const es = GS.enemyStatus;

        const atkCount = GS.allocated.strike.length;
        const defCount = GS.allocated.guard.length;

        // ── DEFEND CALCULATION (before enemy attack for defense resolution) ──
        let defBase = 0, defMult = 1, defBonus = 0;
        let mirrorDmg = 0, regenCoreHeal = 0, steadfastContrib = 0;
        let poisonToApply = 0;
        let siphonHealing = 0;
        let crossSlotBonusAtk = 0; // from guard-slot critical face mods

        // Ascend aura: pre-compute per-die bonus (applied to each die so runes amplify it)
        const defAscendBonus = (GS.ascendedDice && GS.ascendedDice.length > 0) ? GS.ascendedDice.reduce((s, a) => s + a.bonus, 0) : 0;

        // Utility die pre-passes (guard): Amplifier Die slot multipliers, Gold Die slot totals
        const defAmpDieMul = {}; // slotId → multiplier from Amplifier Die (dieType='amplifier')
        const defGoldSlotTotal = {}; // slotId → sum of non-gold, non-amplifier guard dice values
        GS.allocated.guard.forEach(d => {
            if (d.dieType === 'amplifier') defAmpDieMul[d.slotId] = d.value / 100;
            else if (d.dieType !== 'gold') defGoldSlotTotal[d.slotId] = (defGoldSlotTotal[d.slotId] || 0) + d.value;
        });

        GS.allocated.guard.forEach(d => {
            const face = getActiveFace(d);
            const m = face ? face.modifier : null;

            const defRune = getSlotById(d.slotId)?.rune;
            const isAmplified = defRune?.effect === 'amplifier';
            const ampMul = isAmplified ? 2 : 1;
            let dieVal = d.value + (GS.passives.swarmMaster || 0) + defAscendBonus;
            if (isAmplified) dieVal *= 2;
            if (defRune?.effect === 'titanBlow' && defCount === 1) dieVal *= 3;
            if (defRune?.effect === 'leaden') dieVal *= 2;
            if (GS.artifacts.some(a => a.effect === 'echoStone') && d.id === GS.echoStoneDieId) dieVal += d.value;
            // Amplifier Die in this slot boosts this die (if this die isn't the amplifier)
            if (d.dieType !== 'amplifier' && defAmpDieMul[d.slotId]) dieVal = Math.floor(dieVal * defAmpDieMul[d.slotId]);

            // Utility die types — handle effect and skip normal contribution
            if (d.dieType === 'amplifier') return; // contributes via multiplier pre-pass
            if (d.dieType === 'gold') {
                const slotTotal = defGoldSlotTotal[d.slotId] || 0;
                const goldGain = Math.floor(slotTotal * (d.value / 100));
                if (goldGain > 0) { gainGold(goldGain); log(`💰 Gold Die: +${goldGain} gold!`, 'info'); }
                return;
            }
            if (d.dieType === 'chill') { applyStatus('chill', dieVal); return; }
            if (d.dieType === 'weaken') { applyStatus('weaken', 1, dieVal); return; }
            if (d.dieType === 'shield') { defBase += dieVal; crossSlotBonusAtk += dieVal; return; }
            if (d.dieType === 'mimic') {
                const others = GS.dice.filter(x => x.id !== d.id && x.rolled && x.value > 0);
                if (others.length) dieVal = others[Math.floor(Math.random() * others.length)].value;
                defBase += dieVal; return;
            }
            if (d.dieType) return; // unknown utility die: contribute 0

            if (m) {
                if (m.effect === 'frostbite') { applyStatus('chill', 2 * ampMul); defBase += dieVal; }
                else if (m.effect === 'shieldBash') { mirrorDmg += dieVal; defBase += dieVal; }
                else if (m.effect === 'executioner') { defBase += dieVal * 5; }
                else if (m.effect === 'chainLightning') { defBase += dieVal * 2; }
                else if (m.effect === 'vampiricStrike') { const vVal = dieVal * 3; defBase += vVal; siphonHealing += vVal; }
                else if (m.effect === 'freezeStrike') { applyStatus('freeze', 1); defBase += dieVal; }
                else if (m.effect === 'jackpot') { gainGold(50); log('💰 Jackpot! +50 gold!', 'info'); defBase += dieVal; }
                else if (m.effect === 'critical') { defBase += dieVal; crossSlotBonusAtk += dieVal; }
                else { defBase += dieVal; }
            } else {
                defBase += dieVal;
            }
            if (defRune?.effect === 'regenCore') regenCoreHeal += Math.ceil(dieVal * 0.5);
            if (defRune?.effect === 'mirror') mirrorDmg += dieVal;
            if (defRune?.effect === 'steadfast') steadfastContrib += dieVal;
            if (defRune?.effect === 'poisonCore') applyEnemyPoison(dieVal);
        });

        defBonus += GS.buffs.armor;
        // transformBuffs: Fortification defend multiplier
        if (GS.transformBuffs && GS.transformBuffs.fortified > 1) defMult *= GS.transformBuffs.fortified;
        if (GS.passives.volley && defCount >= 3) defBase += GS.passives.volley;
        if (GS.passives.threshold) {
            GS.allocated.guard.forEach(d => { if (d.value >= 8) defBase += Math.floor(d.value * 0.5); });
        }
        // New artifact defend bonuses
        defBonus += GS.artifacts.filter(a => a.effect === 'goldenAegis').reduce((s, a) => s + Math.floor(GS.gold / a.value), 0);
        if (defCount >= 4 && GS.artifacts.some(a => a.effect === 'swarmBanner')) defMult *= 1.5;

        const totalDef = Math.floor(defBase * defMult) + defBonus;

        // Frost Brand: block 10+ → apply chill
        if (totalDef >= 10 && GS.artifacts.some(a => a.effect === 'frostBrand')) applyStatus('chill', 3, 2);

        // ══════════════════════════════════════════════════════
        // ── ENEMY TURN ──
        // ══════════════════════════════════════════════════════
        e.immune = false; // reset from previous charge/vanish

        if (GS.hourglassFreeFirstTurn) {
            GS.hourglassFreeFirstTurn = false;
            log('⏳ Hourglass: free turn! Enemy skips.', 'info');
        } else if (es && es.freeze > 0) {
            log(`🧊 Frozen — ${e.name} skips their turn!`, 'info');
            Combat.renderEnemy();
        } else if (es && es.stun > 0) {
            log(`⚡ Stunned — ${e.name} skips their turn!`, 'info');
            Combat.renderEnemy();
        } else {
            if (Combat._resolveEnemyAbility(e, es, totalDef, steadfastContrib)) return;
            // Double Action (doubleTrouble anomaly / Void Lord phase 3): second strike
            if (e._doubleAction) {
                Combat._rollEnemyTurn();
                log(`⚡ ${e.name} strikes again!`, 'damage');
                if (Combat._resolveEnemyAbility(e, es, totalDef, steadfastContrib)) return;
            }
        }

        const isImmune = e.immune; // Vanish sets this during ability resolve
        e.immune = false;

        updateStats();

        // ══════════════════════════════════════════════════════
        // ── PLAYER ATTACK PHASE ──
        // ══════════════════════════════════════════════════════
        if (isImmune) {
            log(`${e.name} is immune to damage this turn!`, 'info');
        }

        if (!isImmune) {
        // ── EVASION PASSIVE: negate one random attack die ──
        const evasionP = e.passives.find(p => p.id === 'evasion');
        if (evasionP && GS.allocated.strike.length > 0) {
            const dodgeDie = GS.allocated.strike[Math.floor(Math.random() * GS.allocated.strike.length)];
            const dodgedVal = dodgeDie.value;
            dodgeDie.value = 0;
            log(`💨 ${e.name} evades — negates ${dodgedVal} from one attack die!`, 'info');
        }

        // ── ATTACK CALCULATION ──
        let atkBase = 0, atkMult = 1, atkBonus = 0;
        let crossSlotBonusDef = 0; // from strike-slot critical face mods

        const ptAtkPerDie = GS.passives.packTactics || 0;

        // Battle Fury: boost highest attack die if 3+ fury charges
        let furyBoostDieId = null;
        if (GS.furyCharges >= 3 && atkCount > 0) {
            const topDie = GS.allocated.strike.reduce((best, d) => d.value > (best?.value || -1) ? d : best, null);
            furyBoostDieId = topDie?.id || null;
            if (furyBoostDieId) {
                log(`🔥 Battle Fury! Highest attack die ×2 this turn!`, 'info');
                GS.furyCharges = 0;
            }
        }

        // Ascend aura: pre-compute per-die bonus (applied to each die so runes amplify it)
        const atkAscendBonus = (GS.ascendedDice && GS.ascendedDice.length > 0) ? GS.ascendedDice.reduce((s, a) => s + a.bonus, 0) : 0;

        // Splinter rune: pre-compute bonus per die from Splinter dice in the same slot
        const splinterBonus = {};
        GS.allocated.strike.forEach(d => {
            const rune = getSlotById(d.slotId)?.rune;
            if (rune?.effect === 'splinter') {
                const others = GS.allocated.strike.filter(x => x.slotId === d.slotId && x.id !== d.id);
                if (others.length > 0) {
                    const share = Math.floor(d.value / others.length);
                    others.forEach(x => { splinterBonus[x.id] = (splinterBonus[x.id] || 0) + share; });
                }
            }
        });

        // Utility die pre-passes (strike): Amplifier Die slot multipliers, Gold Die slot totals
        const atkAmpDieMul = {}; // slotId → multiplier from Amplifier Die
        const atkGoldSlotTotal = {}; // slotId → sum of non-gold, non-amplifier strike dice values
        GS.allocated.strike.forEach(d => {
            if (d.dieType === 'amplifier') atkAmpDieMul[d.slotId] = d.value / 100;
            else if (d.dieType !== 'gold') atkGoldSlotTotal[d.slotId] = (atkGoldSlotTotal[d.slotId] || 0) + d.value;
        });

        GS.allocated.strike.forEach(d => {
            const face = getActiveFace(d);
            const m = face ? face.modifier : null;

            const atkRune = getSlotById(d.slotId)?.rune;
            const isAmplified = atkRune?.effect === 'amplifier';
            const ampMul = isAmplified ? 2 : 1;

            // Splinter rune: die's value was distributed to others — skip own contribution
            if (atkRune?.effect === 'splinter') return;

            let dieVal = d.value + ptAtkPerDie + (GS.passives.swarmMaster || 0) + atkAscendBonus + (splinterBonus[d.id] || 0);
            if (isAmplified) dieVal *= 2;
            if (atkRune?.effect === 'titanBlow' && atkCount === 1) dieVal *= 3;
            if (d.id === furyBoostDieId) dieVal *= 2;
            if (GS.artifacts.some(a => a.effect === 'echoStone') && d.id === GS.echoStoneDieId) dieVal += d.value;
            // Amplifier Die in this slot boosts this die
            if (d.dieType !== 'amplifier' && atkAmpDieMul[d.slotId]) dieVal = Math.floor(dieVal * atkAmpDieMul[d.slotId]);

            // Utility die types — handle effect and skip normal contribution
            if (d.dieType === 'amplifier') return; // contributes via multiplier pre-pass
            if (d.dieType === 'gold') {
                const slotTotal = atkGoldSlotTotal[d.slotId] || 0;
                const goldGain = Math.floor(slotTotal * (d.value / 100));
                if (goldGain > 0) { gainGold(goldGain); log(`💰 Gold Die: +${goldGain} gold!`, 'info'); }
                return;
            }
            if (d.dieType === 'poison') { applyEnemyPoison(dieVal); return; }
            if (d.dieType === 'chill') { applyStatus('chill', dieVal); return; }
            if (d.dieType === 'burn') { applyStatus('burn', dieVal, 3); return; }
            if (d.dieType === 'mark') { applyStatus('mark', dieVal, 2); return; }
            if (d.dieType === 'weaken') { applyStatus('weaken', 1, dieVal); return; }
            if (d.dieType === 'shield') { atkBase += dieVal; crossSlotBonusDef += dieVal; return; }
            if (d.dieType === 'drain') { atkBase += dieVal; siphonHealing += dieVal; return; }
            if (d.dieType === 'mimic') {
                const others = GS.dice.filter(x => x.id !== d.id && x.rolled && x.value > 0);
                if (others.length) dieVal = others[Math.floor(Math.random() * others.length)].value;
                atkBase += dieVal; return;
            }
            if (d.dieType) return; // unknown utility die: contribute 0

            if (atkRune?.effect === 'siphon') siphonHealing += dieVal;
            if (atkRune?.effect === 'poisonCore') applyEnemyPoison(dieVal);

            if (m) {
                if (m.effect === 'searing') { applyStatus('burn', 2 * ampMul, 3); atkBase += dieVal; }
                else if (m.effect === 'marked') { applyStatus('mark', 3 * ampMul, 2); atkBase += dieVal; }
                else if (m.effect === 'frostbite') { applyStatus('chill', 2 * ampMul); atkBase += dieVal; }
                else if (m.effect === 'executioner') { atkBase += dieVal * 5; }
                else if (m.effect === 'chainLightning') { atkBase += dieVal * 2; }
                else if (m.effect === 'vampiricStrike') { const vVal = dieVal * 3; atkBase += vVal; siphonHealing += vVal; }
                else if (m.effect === 'freezeStrike') { applyStatus('freeze', 1); atkBase += dieVal; }
                else if (m.effect === 'jackpot') { gainGold(50); log('💰 Jackpot! +50 gold!', 'info'); atkBase += dieVal; }
                else if (m.effect === 'poisonBurst') { applyEnemyPoison(dieVal * 3); atkBase += dieVal; }
                else if (m.effect === 'critical') { atkBase += dieVal; crossSlotBonusDef += dieVal; }
                else { atkBase += dieVal; }
            } else {
                atkBase += dieVal;
            }
        });

        // Apply cross-slot bonuses from critical face mods
        atkBase += crossSlotBonusAtk;
        defBase += crossSlotBonusDef;

        atkBonus += GS.buffs.damageBoost;
        // transformBuffs: Fury Chamber attack multiplier
        if (GS.transformBuffs && GS.transformBuffs.furyChambered > 1) atkMult *= GS.transformBuffs.furyChambered;
        // Conduit: extra poison per attack die
        if (GS.transformBuffs && GS.transformBuffs.conduit > 0 && atkCount > 0) {
            poisonToApply += GS.transformBuffs.conduit * atkCount;
        }
        const goldScale = GS.artifacts.filter(a => a.effect === 'goldScaleDmg').reduce((s, a) => s + Math.floor(GS.gold / a.value), 0);
        if (goldScale > 0) atkBonus += goldScale;
        if (GS.passives.goldDmg) atkBonus += Math.floor(GS.gold / GS.passives.goldDmg);
        if (GS.passives.volley && atkCount >= 3) atkBase += GS.passives.volley;
        if (GS.passives.threshold) {
            GS.allocated.strike.forEach(d => { if (d.value >= 8) atkBase += Math.floor(d.value * 0.5); });
        }
        const rerollsUsed = GS.rerolls - GS.rerollsLeft;
        if (rerollsUsed > 0) {
            let rerollDmg = GS.artifacts.filter(a => a.effect === 'rerollDmg').reduce((s, a) => s + a.value, 0) * rerollsUsed;
            if (GS.passives.rerollDmg) rerollDmg += GS.passives.rerollDmg * rerollsUsed;
            if (rerollDmg > 0) { atkBonus += rerollDmg; log(`🪙 Reroll damage: +${rerollDmg} (${rerollsUsed} rerolls)`, 'info'); }
        }

        if (GS.isFirstTurn) GS.isFirstTurn = false;

        // New artifact attack bonuses
        atkBonus += GS.artifacts.filter(a => a.effect === 'hydrasCrest').reduce((s, a) => s + a.value * GS.dice.filter(d => !d.midasTemp).length, 0);
        atkBonus += GS.enemyStatus?.mark || 0;
        atkBonus += GS.artifacts.filter(a => a.effect === 'festeringWound').reduce((s, a) => s + a.value * (GS.enemy.poison || 0), 0);
        if (GS.artifacts.some(a => a.effect === 'berserkersMask')) atkMult *= 1.5;
        if (GS.artifacts.some(a => a.effect === 'bloodPact')) atkMult *= 1.3;
        if (atkCount >= 4 && GS.artifacts.some(a => a.effect === 'swarmBanner')) atkMult *= 1.5;
        // Echo Chamber: highest attack die counted twice
        if (GS.artifacts.some(a => a.effect === 'echoChamber') && GS.allocated.strike.length > 0) {
            const top = GS.allocated.strike.reduce((b, d) => d.value > (b?.value || -1) ? d : b, null);
            if (top && top.value > 0) { atkBonus += top.value; log(`🔊 Echo Chamber: +${top.value} echoes!`, 'info'); }
        }

        let totalAtk = Math.floor(atkBase * atkMult) + atkBonus;
        // Sharpening Stone: +50% after all other bonuses
        if (GS.artifacts.some(a => a.effect === 'sharpeningStone')) totalAtk = Math.ceil(totalAtk * 1.5);

        // Rage Potion: double attack damage as FINAL multiplier
        if (GS.ragePotionActive) {
            totalAtk = Math.floor(totalAtk * 2);
            GS.ragePotionActive = false;
            log(`😤 Rage Potion: attack damage doubled!`, 'info');
        }

        // ── ENEMY PASSIVE MODIFIERS ON PLAYER ATTACK ──
        let finalAtk = totalAtk;

        // Brittle: +bonus damage
        const brittleP = e.passives.find(p => p.id === 'brittle');
        if (brittleP && finalAtk > 0) {
            finalAtk += brittleP.params.bonus;
            log(`💀 ${e.name} is Brittle: +${brittleP.params.bonus} bonus damage!`, 'info');
        }

        // Thick Hide: ignore attack if below threshold
        const thickHideP = e.passives.find(p => p.id === 'thickHide');
        if (thickHideP && atkBase < thickHideP.params.threshold && finalAtk > 0) {
            log(`🛡️ Thick Hide ignores attack! (${atkBase} dice total < ${thickHideP.params.threshold})`, 'info');
            finalAtk = 0;
        }

        // Scales: absorb perSlot damage from attack dice
        const scalesP = e.passives.find(p => p.id === 'scales');
        if (scalesP && atkBase > 0) {
            const absorbed = Math.min(atkBase, scalesP.params.perSlot);
            if (absorbed > 0) {
                const scaledBase = Math.max(0, atkBase - absorbed);
                finalAtk = scaledBase + (totalAtk - atkBase);
                if (scaledBase === 0) log(`🐉 Dragon Scales absorb all slot damage!`, 'info');
                else log(`🐉 Dragon Scales absorb ${absorbed} (${finalAtk} gets through)`, 'info');
            }
        }

        // Armor: reduce all incoming damage
        const armorP = e.passives.find(p => p.id === 'armor');
        if (armorP && finalAtk > 0) {
            finalAtk = Math.max(0, finalAtk - armorP.params.reduction);
            if (armorP.params.reduction > 0) log(`🛡️ ${e.name} Armor: -${armorP.params.reduction} (${finalAtk} gets through)`, 'info');
        }

        // Shield: absorb damage before HP
        if (e.shield > 0) {
            const absorbed = Math.min(e.shield, finalAtk);
            e.shield -= absorbed;
            finalAtk -= absorbed;
            if (absorbed > 0) log(`🛡️ Shield absorbs ${absorbed}! (${e.shield} remaining)`, 'info');
        }

        // Phase damage multiplier (Void Lord Phase 3)
        if (e._damageTakenMult && e._damageTakenMult !== 1) {
            finalAtk = Math.floor(finalAtk * e._damageTakenMult);
        }

        // Phase passive (Phasing boss elite modifier): 50% resist on alternating turns
        const phaseP = e.passives.find(p => p.id === 'phase');
        if (phaseP && finalAtk > 0) {
            if (e.turnsAlive % 2 === 0) {
                finalAtk = Math.floor(finalAtk * (1 - phaseP.params.resistPercent));
                log(`🌀 Phase Shift! ${e.name} resists — damage halved (${finalAtk})`, 'info');
            }
        }

        // Soul Pact: overkill reflects back to player
        const soulPactP = e.passives.find(p => p.id === 'soulPact');
        if (soulPactP && finalAtk > e.currentHp && finalAtk > 0) {
            const reflected = finalAtk - e.currentHp;
            GS.hp = Math.max(0, GS.hp - reflected);
            log(`👹 Soul Pact! ${reflected} overkill reflected to you!`, 'damage');
            updateStats();
            if (GS.hp <= 0) {
                GS.hp = 0; updateStats();
                setTimeout(() => { if (GS.challengeMode) window.Game.challengeResult(); else window.Game.defeat(); }, 1000);
                return;
            }
        }

        // ── PLAYER ATTACKS ENEMY ──
        // Environment: modify damage before applying (e.g. narrowCorridor +5, thornsAura recoil)
        if (GS.environment?.onDamageDealt && finalAtk > 0) {
            const ctx = combatCtx();
            finalAtk = GS.environment.onDamageDealt(finalAtk, ctx.player, GS.enemy, ctx) ?? finalAtk;
            updateStats();
        }
        e.currentHp -= finalAtk;
        if (GS.challengeMode) GS.challengeDmg += finalAtk;
        if (finalAtk > 0) log(`You deal ${finalAtk} damage to ${e.name}!`, 'damage');
        // Bloodstone: heal 30% of damage dealt
        if (GS.artifacts.some(a => a.effect === 'bloodstone') && finalAtk > 0) {
            const bsHeal = heal(Math.floor(finalAtk * 0.3));
            if (bsHeal > 0) { log(`💎 Bloodstone: +${bsHeal} HP`, 'heal'); updateStats(); }
        }

        // Gold Forge: each attack die generates gold equal to its rolled value
        if (GS.transformBuffs && GS.transformBuffs.goldForge && finalAtk > 0) {
            GS.allocated.strike.forEach(d => {
                if (d.value > 0) {
                    const g = gainGold(d.value);
                    log(`⚒️ Gold Forge: +${g} gold!`, 'info');
                }
            });
        }

        // Apply poison from player (via centralized helper)
        if (GS.passives.poisonOnAtk) poisonToApply += GS.passives.poisonOnAtk;
        if (GS.passives.plagueLord) poisonToApply += 2;
        // tempBuff: poison coating
        if (GS.tempBuffs && GS.tempBuffs.poisonCombats > 0 && finalAtk > 0) poisonToApply += 1;
        if (poisonToApply > 0) applyEnemyPoison(poisonToApply);

        const lsPercent = GS.autoLifesteal || 0;
        if (lsPercent > 0 && finalAtk > 0) {
            const lsHeal = heal(Math.floor(finalAtk * lsPercent));
            if (lsHeal > 0) log(`🩸 Lifesteal: +${lsHeal} HP`, 'heal');
        }

        // Siphon: heal from attack damage
        if (siphonHealing > 0 && finalAtk > 0) {
            const sh = heal(siphonHealing);
            if (sh > 0) { log(`🩸 Siphon: +${sh} HP${siphonHealing !== sh ? ` (${siphonHealing} base)` : ''}`, 'heal'); updateStats(); }
        }
        // Hunter's Mark: first hit applies mark
        if (!GS.huntersMarkFired && finalAtk > 0 && GS.artifacts.some(a => a.effect === 'huntersMark')) {
            applyStatus('mark', 5, 2); GS.huntersMarkFired = true;
        }
        // Ember Crown: 15+ damage → 3 burn
        if (finalAtk >= 15 && GS.artifacts.some(a => a.effect === 'emberCrown')) applyStatus('burn', 3, 3);
        // Thunder Strike: 25%+ of enemy max HP → stun
        const tsArt = GS.artifacts.find(a => a.effect === 'thunderStrike');
        if (tsArt && finalAtk >= Math.ceil(GS.enemy.hp * tsArt.value)) applyStatus('stun', 1);
        // Mirror: deal block as damage
        if (mirrorDmg > 0) {
            GS.enemy.currentHp = Math.max(0, GS.enemy.currentHp - mirrorDmg);
            if (GS.challengeMode) GS.challengeDmg += mirrorDmg;
            log(`🪞 Mirror: ${mirrorDmg} damage to enemy!`, 'damage');
        }
        // Regen Core: heal from block
        if (regenCoreHeal > 0) {
            const h = heal(regenCoreHeal);
            if (h > 0) { log(`💚 Regen Core: +${h} HP`, 'heal'); updateStats(); }
        }

        // ── POST-ATTACK PASSIVE CHECKS ──

        // Overcharge: stun if hit for threshold+
        const overchargeP = e.passives.find(p => p.id === 'overcharge');
        if (overchargeP && finalAtk >= overchargeP.params.threshold && !es.stunCooldown) {
            es.stun = 1; es.stunCooldown = true;
            log(`⚡ Overcharge! ${e.name} staggers — skips next attack!`, 'damage');
        }

        // Check phase transitions
        Combat._checkPhaseTransitions();

        // Phylactery: intercept first death
        if (e.currentHp <= 0) {
            const phylP = e.passives.find(p => p.id === 'phylactery');
            if (phylP && !e.phylacteryUsed) {
                e.phylacteryUsed = true;
                e.currentHp = Math.floor(e.maxHp * phylP.params.revivePercent);
                log(`💀 The Phylactery pulses... ${e.name} reforms!`, 'damage');
                Combat.renderEnemy(); updateStats();
            }
        }

        Combat.renderEnemy();
        updateStats();

        if (e.currentHp <= 0) {
            if (e.currentHp < 0 && GS.artifacts.some(a => a.effect === 'overflowChalice')) {
                const h = heal(-e.currentHp);
                if (h > 0) { log(`🏆 Overflow Chalice: +${h} HP!`, 'heal'); updateStats(); }
            }
            Combat.enemyDefeated(); return;
        }

        } // end !isImmune player attack block

        // ── POISON TICK ON ENEMY ──
        if (e.poison > 0) {
            let poisonDmg = e.poison;
            if (GS.passives.plagueLord) poisonDmg *= 2;
            const armorP2 = e.passives.find(p => p.id === 'armor');
            if (armorP2) poisonDmg = Math.max(0, poisonDmg - armorP2.params.reduction);
            e.currentHp -= poisonDmg;
            if (GS.challengeMode) GS.challengeDmg += poisonDmg;
            e.poison = Math.max(0, e.poison - 1);
            log(`☠️ Poison deals ${poisonDmg} to ${e.name}! (${e.poison} stacks remain)`, 'damage');
            Combat.renderEnemy();

            if (e.currentHp <= 0) {
                const phylP2 = e.passives.find(p => p.id === 'phylactery');
                if (phylP2 && !e.phylacteryUsed) {
                    e.phylacteryUsed = true;
                    e.currentHp = Math.floor(e.maxHp * phylP2.params.revivePercent);
                    log(`💀 The Phylactery pulses... ${e.name} reforms!`, 'damage');
                    Combat.renderEnemy();
                } else {
                    Combat.enemyDefeated(); return;
                }
            }
        }

        updateStats();
        if (e.currentHp <= 0) { Combat.enemyDefeated(); return; }

        // Environment: end-of-turn hook (e.g. burning ground damage, chaos storm flag)
        if (GS.environment?.onTurnEnd) {
            GS.environment.onTurnEnd(combatCtx());
            updateStats();
            // Re-check for combat end after environment effects
            if (GS.hp <= 0) {
                GS.hp = 0; updateStats();
                setTimeout(() => window.Game.defeat(), 1000); return;
            }
            if (GS.enemy.currentHp <= 0) { Combat.enemyDefeated(); return; }
        }

        Combat.newTurn();
    },

    // ── ENEMY ABILITY DISPATCHER ──
    // Returns true if combat ended (enemy died from reflect/retribution mid-ability)
    _resolveEnemyAbility(e, es, totalDef, steadfastContrib) {
        const ab = e.abilities[e.currentAbilityKey];
        if (!ab) return false;

        switch (ab.type) {
            case 'attack':
                return Combat._resolveEnemyAttack(ab, e, es, totalDef, steadfastContrib);

            case 'unblockable': {
                let dmg = e.intentValue;
                if (GS.artifacts.some(a => a.effect === 'soulMirror')) dmg = Math.floor(dmg * 0.5);
                if (es && es.weaken > 0) { dmg = Math.floor(dmg * 0.75); log('💔 Weaken: 25% less!', 'info'); }
                GS.hp = Math.max(0, GS.hp - dmg);
                log(`${ab.icon} ${ab.name}! ${dmg} unblockable damage!`, 'damage');
                updateStats();
                if (GS.hp <= 0) {
                    const wardIdx = findConsumableIdx('ward');
                    if (wardIdx >= 0) { GS.hp = 1; log('💀 Death Ward!', 'heal'); removeConsumableByIdx(wardIdx); updateStats(); }
                    else if (!GS.eternalPactUsed && GS.artifacts.some(a => a.effect === 'eternalPact')) { GS.hp = 1; GS.eternalPactUsed = true; log('💀 Eternal Pact activates — death cheated!', 'damage'); updateStats(); }
                    else { GS.hp = 0; updateStats(); setTimeout(() => { if (GS.challengeMode) window.Game.challengeResult(); else window.Game.defeat(); }, 1000); return true; }
                }
                const burnOnP = e.passives.find(p => p.id === 'burnOnPhase');
                if (burnOnP) applyStatus('burn', burnOnP.params.burn, 3);
                break;
            }

            case 'buff':
                log(`${e.name} uses ${ab.name}! (+${e.diceResults.reduce((a,b)=>a+b,0)} stored for next attack)`, 'info');
                break;

            case 'heal':
                e.currentHp = Math.min(e.maxHp, e.currentHp + e.intentValue);
                log(`${e.name} ${ab.name}! Heals ${e.intentValue} HP.`, 'heal');
                Combat.renderEnemy();
                break;

            case 'shield':
                e.shield += e.intentValue;
                log(`${e.name} ${ab.name}! Gains ${e.intentValue} shield.`, 'info');
                Combat.renderEnemy();
                break;

            case 'poison': {
                const stacks = e.intentValue;
                GS.playerDebuffs.poison += stacks;
                GS.playerDebuffs.poisonTurns = Math.max(GS.playerDebuffs.poisonTurns, 3);
                log(`${ab.icon} ${ab.name}! ${stacks} poison applied!`, 'damage');
                break;
            }

            case 'curse': {
                if (GS.artifacts.some(a => a.effect === 'anchoredSlots')) {
                    log('⚓ Anchored Slots: Curse prevented!', 'info');
                } else {
                    const sealCount = ab.slotsToSeal || 1;
                    const duration = ab.fixedDuration || 1;
                    // Build pool of candidate slots, optionally filtered by slotTarget
                    let candidates = [
                        ...GS.slots.strike.map(s => s.id),
                        ...GS.slots.guard.map(s => s.id),
                    ];
                    if (ab.slotTarget === 'strike') candidates = GS.slots.strike.map(s => s.id);
                    else if (ab.slotTarget === 'guard') candidates = GS.slots.guard.map(s => s.id);
                    // Exclude already-sealed slots
                    const alreadySealed = (GS.playerDebuffs.disabledSlots || []).map(ds => ds.slotId);
                    candidates = candidates.filter(id => !alreadySealed.includes(id));
                    // Shuffle and pick up to sealCount
                    for (let i = candidates.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [candidates[i], candidates[j]] = [candidates[j], candidates[i]]; }
                    const toSeal = candidates.slice(0, sealCount);
                    if (!GS.playerDebuffs.disabledSlots) GS.playerDebuffs.disabledSlots = [];
                    toSeal.forEach(slotId => GS.playerDebuffs.disabledSlots.push({ slotId, turnsLeft: duration }));
                    if (toSeal.length > 0) {
                        const names = toSeal.map(id => id.startsWith('str') ? 'strike' : 'guard');
                        log(`${ab.icon} ${ab.name}! ${toSeal.length} slot${toSeal.length > 1 ? 's' : ''} sealed (${names.join(', ')}) for ${duration} turn${duration > 1 ? 's' : ''}!`, 'damage');
                    }
                }
                break;
            }

            case 'steal': {
                const stolen = Math.min(GS.gold, e.intentValue);
                GS.gold -= stolen;
                log(`${ab.icon} ${ab.name}! ${stolen} gold stolen!`, 'damage');
                updateStats();
                break;
            }

            case 'charge':
                e.charged = true;
                if (ab.immune) e.immune = true; // Vanish: immune to player damage this turn
                log(`${ab.icon} ${ab.name}! ${e.name} charges — next attack DOUBLED!`, 'info');
                Combat.renderEnemy();
                break;

            case 'decay':
                GS.dice.forEach(d => {
                    if (d._savedMax === undefined) d._savedMax = d.max;
                    if (d._savedMin === undefined) d._savedMin = d.min;
                    d.max = Math.max(1, d.max - 1);
                    if (d.faceValues) {
                        d.faceValues = d.faceValues.filter(v => v <= d.max);
                        if (d.faceValues.length === 0) d.faceValues = [0];
                    }
                    d.min = d.faceValues ? d.faceValues[0] : 0;
                });
                log(`${ab.icon} ${ab.name}! All your dice lose 1 max value!`, 'damage');
                break;

            case 'summon_die': {
                const newSize = ab.dieSize || 6;
                e.extraDice.push(enemyDie(newSize));
                log(`${ab.icon} ${ab.name}! ${e.name} permanently gains +1d${newSize}!`, 'damage');
                Combat.renderEnemy();
                break;
            }
        }
        return false;
    },

    // Returns true if combat ended mid-attack (reflect/retribution killed enemy)
    _resolveEnemyAttack(ab, e, es, totalDef, steadfastContrib) {
        // Iron Skin: block the first hit entirely
        if (GS.ironSkinActive) {
            GS.ironSkinActive = false;
            log(`🛡️ Iron Skin blocked the attack!`, 'info');
            return false;
        }

        let enemyDmg = e.intentValue;

        // Weaken: enemy deals 25% less
        if (es && es.weaken > 0) {
            enemyDmg = Math.floor(enemyDmg * 0.75);
            log('💔 Weaken: enemy deals 25% less!', 'info');
        }

        // Penetrate: reduce effective block
        let effectiveDef = totalDef;
        if (ab.penetrate) {
            const reducible = totalDef - steadfastContrib;
            effectiveDef = Math.max(0, reducible - ab.penetrate) + steadfastContrib;
        }

        if (ab.multiHit) {
            // Each die is a separate hit against the block pool
            let remaining = effectiveDef;
            for (const dieVal of e.diceResults) {
                const blocked = Math.min(dieVal, remaining);
                const mitigated = dieVal - blocked;
                remaining = Math.max(0, remaining - dieVal);
                GS.hp -= mitigated;
                if (blocked > 0) log(`${e.name} hits for ${dieVal} — blocked ${blocked}, took ${mitigated}`, 'defend');
                else log(`${e.name} hits for ${dieVal} damage!`, 'damage');

                if (GS.hp <= 0) {
                    const wardIdx = findConsumableIdx('ward');
                    if (wardIdx >= 0) { GS.hp = 1; log('💀 Death Ward!', 'heal'); removeConsumableByIdx(wardIdx); updateStats(); }
                    else if (!GS.eternalPactUsed && GS.artifacts.some(a => a.effect === 'eternalPact')) { GS.hp = 1; GS.eternalPactUsed = true; log('💀 Eternal Pact activates — death cheated!', 'damage'); updateStats(); }
                    else { GS.hp = 0; updateStats(); setTimeout(() => { if (GS.challengeMode) window.Game.challengeResult(); else window.Game.defeat(); }, 1000); return true; }
                }
            }
        } else {
            const blocked = Math.min(enemyDmg, effectiveDef);
            let mitigated = enemyDmg - blocked;

            // Environment: modify enemy damage before applying
            if (GS.environment?.onDamageDealt && mitigated > 0) {
                const ctx = combatCtx();
                mitigated = GS.environment.onDamageDealt(mitigated, GS.enemy, ctx.player, ctx) ?? mitigated;
            }
            GS.hp -= mitigated;

            if (blocked > 0) log(`${e.name} attacks for ${enemyDmg} — you block ${blocked}, take ${mitigated}`, 'defend');
            else log(`${e.name} attacks for ${enemyDmg} damage!`, 'damage');

            if (mitigated > 0) {
                // Thorn Mail
                const thornMail = GS.artifacts.filter(a => a.effect === 'thornMail').reduce((s, a) => s + a.value, 0);
                if (thornMail > 0) {
                    e.currentHp -= thornMail;
                    if (GS.challengeMode) GS.challengeDmg += thornMail;
                    log(`🌿 Thorn Mail: ${thornMail} back!`, 'info');
                    Combat.renderEnemy();
                    if (e.currentHp <= 0) { Combat.enemyDefeated(); return true; }
                }
                // Thorns Aura
                if (GS.transformBuffs && GS.transformBuffs.thornsAura > 0) {
                    e.currentHp -= GS.transformBuffs.thornsAura;
                    if (GS.challengeMode) GS.challengeDmg += GS.transformBuffs.thornsAura;
                    log(`🌿 Thorns Aura: ${GS.transformBuffs.thornsAura} reflect!`, 'damage');
                    Combat.renderEnemy();
                    if (e.currentHp <= 0) { Combat.enemyDefeated(); return true; }
                }
                // Toxic Blood
                if (GS.artifacts.some(a => a.effect === 'toxicBlood')) applyEnemyPoison(2);
            }

            // Vampiric Ward: heal from blocked
            if (GS.transformBuffs && GS.transformBuffs.vampiricWard && blocked > 0) {
                const vheal = Math.floor(blocked * 0.25);
                if (vheal > 0) { const h = heal(vheal); if (h > 0) { log(`🧛 Vampiric Ward: +${h} HP!`, 'heal'); updateStats(); } }
            }

            // Lifesteal passive
            const lifestealP = e.passives.find(p => p.id === 'lifesteal');
            if (lifestealP && mitigated > 0) {
                const ls = Math.floor(mitigated * lifestealP.params.percent);
                e.currentHp = Math.min(e.maxHp, e.currentHp + ls);
                log(`🩸 ${e.name} lifesteals ${ls} HP!`, 'info');
                Combat.renderEnemy();
            }

            // Death Ward / Eternal Pact
            if (GS.hp <= 0) {
                const wardIdx = findConsumableIdx('ward');
                if (wardIdx >= 0) { GS.hp = 1; log('💀 Death Ward activated! Survived with 1 HP!', 'heal'); removeConsumableByIdx(wardIdx); updateStats(); }
                else if (!GS.eternalPactUsed && GS.artifacts.some(a => a.effect === 'eternalPact')) { GS.hp = 1; GS.eternalPactUsed = true; log('💀 Eternal Pact activates — death cheated!', 'damage'); updateStats(); }
                else { GS.hp = 0; updateStats(); setTimeout(() => { if (GS.challengeMode) window.Game.challengeResult(); else window.Game.defeat(); }, 1000); return true; }
            }

            // Retribution Charm
            if (mitigated >= 15) {
                const retribIdx = findConsumableIdx('retrib');
                if (retribIdx >= 0) {
                    e.currentHp = Math.max(0, e.currentHp - 20);
                    if (GS.challengeMode) GS.challengeDmg += 20;
                    applyStatus('stun', 1);
                    log(`⚡ Retribution Charm! 20 damage + stun!`, 'damage');
                    removeConsumableByIdx(retribIdx);
                    Combat.renderEnemy();
                    if (e.currentHp <= 0) { Combat.enemyDefeated(); return true; }
                }
            }
        }

        // Escape Smoke: flee when HP below 20%
        if (!e.isBoss) {
            const smokeIdx = findConsumableIdx('smoke');
            if (smokeIdx >= 0 && GS.hp > 0 && GS.hp / GS.maxHp < 0.20) {
                log(`💨 Escape Smoke! Fled the battle!`, 'info');
                removeConsumableByIdx(smokeIdx);
                updateStats();
                setTimeout(() => window.Game.nextFloor(), 800);
                return true;
            }
        }

        // applyBurn from ability
        if (ab.applyBurn) applyStatus('burn', ab.applyBurn, 3);
        // burnOnPhase passive (Crimson Wyrm Phase 2)
        const burnOnP = e.passives.find(p => p.id === 'burnOnPhase');
        if (burnOnP) applyStatus('burn', burnOnP.params.burn, 3);

        // sealSlot (Wing Buffet)
        if (ab.sealSlot) {
            if (GS.artifacts.some(a => a.effect === 'anchoredSlots')) {
                log('⚓ Anchored Slots: seal prevented!', 'info');
            } else {
                if (!GS.playerDebuffs.disabledSlots) GS.playerDebuffs.disabledSlots = [];
                const alreadySealed = GS.playerDebuffs.disabledSlots.map(ds => ds.slotId);
                const allSlots = [...GS.slots.strike.map(s => s.id), ...GS.slots.guard.map(s => s.id)];
                const candidates = allSlots.filter(id => !alreadySealed.includes(id));
                if (candidates.length > 0) {
                    const pick = candidates[Math.floor(Math.random() * candidates.length)];
                    GS.playerDebuffs.disabledSlots.push({ slotId: pick, turnsLeft: 1 });
                    const slotType = pick.startsWith('str') ? 'strike' : 'guard';
                    log(`💨 Wing Buffet! ${slotType} slot sealed for 1 turn!`, 'damage');
                }
            }
        }

        return false;
    },

    _checkPhaseTransitions() {
        const e = GS.enemy;
        if (!e.phases) return;
        e.phases.forEach((phase, idx) => {
            if (e.phaseTriggered.includes(idx)) return;
            if (e.currentHp / e.maxHp > phase.trigger.hpPercent) return;
            e.phaseTriggered.push(idx);
            const ch = phase.changes;
            if (ch.addDice)               e.extraDice.push(...ch.addDice.map(enemyDie));
            if (ch.addPassives)           e.passives.push(...ch.addPassives);
            if (ch.doubleAction)          e._doubleAction = true;
            if (ch.damageTakenMultiplier) e._damageTakenMult = ch.damageTakenMultiplier;
            if (ch.log)                   log(ch.log, 'damage');
            Combat.renderEnemy();
        });
    },

    // ── CONSUMABLE USE ──
    promptUseConsumable(slotIndex) {
        const c = GS.consumables[slotIndex];
        if (!c) return;
        if (c.category === 'charm') return; // charms are auto-trigger only

        if (GS.consumableUsedThisTurn) {
            log('⚠️ Already used a consumable this turn!', 'info');
            return;
        }
        if (!GS.enemy) {
            // Outside combat: only usableOutsideCombat items
            if (!c.usableOutsideCombat) { log('⚠️ Cannot use this outside combat.', 'info'); return; }
            Combat._applyConsumable(slotIndex);
            return;
        }
        if (GS.enemy.isBoss && !c.usableOnBoss) {
            log('⚠️ Cannot use this on a boss!', 'info');
            return;
        }

        const overlay = document.getElementById('consumable-confirm');
        const textEl = document.getElementById('consumable-confirm-text');
        const descEl = document.getElementById('consumable-confirm-desc');
        if (!overlay) { Combat._applyConsumable(slotIndex); return; }

        textEl.innerHTML = `${c.icon} <b>${c.name}</b>`;
        descEl.textContent = c.description + ' — This cannot be undone.';
        overlay.style.display = 'block';

        const yesBtn = document.getElementById('consumable-confirm-yes');
        const noBtn = document.getElementById('consumable-confirm-no');
        const close = () => { overlay.style.display = 'none'; yesBtn.onclick = null; noBtn.onclick = null; };
        yesBtn.onclick = () => { close(); Combat._applyConsumable(slotIndex); };
        noBtn.onclick = close;
    },

    _applyConsumable(slotIndex) {
        const c = GS.consumables[slotIndex];
        if (!c) return;
        const bonus = GS.consumableBonus || 1;
        log(`${c.icon} Used ${c.name}: ${c.description}`, 'info');

        switch (c.id) {
            case 'hp1': {
                const h = heal(Math.floor(20 * bonus));
                log(`❤️ Healed ${h} HP`, 'heal');
                break;
            }
            case 'hp2': {
                const h = heal(Math.floor(40 * bonus));
                log(`❤️ Healed ${h} HP`, 'heal');
                break;
            }
            case 'iron':
                GS.ironSkinActive = true;
                break;
            case 'cleanse':
                GS.playerDebuffs.poison = 0;
                GS.playerDebuffs.poisonTurns = 0;
                GS.playerDebuffs.disabledSlots = [];
                GS.playerDebuffs.diceReduction = 0;
                log(`✨ Cleansed all debuffs!`, 'heal');
                break;
            case 'rage':
                GS.ragePotionActive = true;
                break;
            case 'haste':
                GS.rerollsLeft += 2;
                GS.hasteDiceBonus = 1;
                log(`⚡ +2 rerolls and +1 to all dice this turn!`, 'info');
                renderCombatDice();
                break;
            case 'frost':
                applyStatus('chill', 6, 2);
                applyStatus('freeze', 1, 1);
                break;
            case 'venom':
                applyEnemyPoison(8);
                break;
            case 'fire': {
                const dmg = 15;
                GS.enemy.currentHp = Math.max(0, GS.enemy.currentHp - dmg);
                if (GS.challengeMode) GS.challengeDmg += dmg;
                log(`🔥 Fire Scroll: ${dmg} damage!`, 'damage');
                applyStatus('burn', 4, 3);
                Combat.renderEnemy();
                if (GS.enemy.currentHp <= 0) {
                    GS.consumables[slotIndex] = null;
                    while (GS.consumables.length > 0 && GS.consumables[GS.consumables.length - 1] === null) GS.consumables.pop();
                    Combat.enemyDefeated();
                    return;
                }
                break;
            }
            case 'mark':
                applyStatus('mark', 8, 3);
                break;
            case 'weaken':
                applyStatus('weaken', 1, 3);
                break;
        }

        GS.consumables[slotIndex] = null;
        while (GS.consumables.length > 0 && GS.consumables[GS.consumables.length - 1] === null) GS.consumables.pop();
        GS.consumableUsedThisTurn = true;
        renderConsumables();
        updateStats();
    },

    newTurn() {
        // ── ENVIRONMENT: TURN START ──
        if (GS.environment?.onTurnStart) {
            GS.environment.onTurnStart(combatCtx());
            updateStats();
            if (GS.hp <= 0) {
                GS.hp = 0; updateStats();
                setTimeout(() => window.Game.defeat(), 1000); return;
            }
            if (GS.enemy && GS.enemy.currentHp <= 0) { Combat.enemyDefeated(); return; }
        }

        // ── BLOOD PACT DRAIN ──
        if (GS.artifacts.some(a => a.effect === 'bloodPact')) {
            GS.hp = Math.max(0, GS.hp - 3);
            log('💀 Blood Pact: -3 HP', 'damage');
            updateStats();
            if (GS.hp <= 0) {
                GS.hp = 0; updateStats();
                setTimeout(() => window.Game.defeat(), 1000);
                return;
            }
        }

        // ── CORRUPT DAMAGE ──
        if (GS.dice && GS.dice.length > 0) {
            const corruptCount = GS.dice.filter(d => d.corrupted).length;
            if (corruptCount > 0) {
                const cdmg = corruptCount * 3;
                GS.hp = Math.max(0, GS.hp - cdmg);
                log(`💀 Corruption: -${cdmg} HP.`, 'damage');
                updateStats();
                if (GS.hp <= 0) {
                    GS.hp = 0; updateStats();
                    setTimeout(() => window.Game.defeat(), 1000);
                    return;
                }
            }
        }

        // ── PLAYER POISON TICK ──
        if (GS.playerDebuffs.poison > 0 && GS.playerDebuffs.poisonTurns > 0) {
            let dmg = GS.playerDebuffs.poison;
            if (GS.artifacts.some(a => a.effect === 'burnproofCloak')) dmg = Math.floor(dmg * 0.5);
            GS.hp = Math.max(0, GS.hp - dmg);
            GS.playerDebuffs.poisonTurns--;
            if (GS.playerDebuffs.poisonTurns <= 0) {
                GS.playerDebuffs.poison = 0;
                GS.playerDebuffs.poisonTurns = 0;
            }
            log(`☠️ Poison deals ${dmg} damage! (${GS.playerDebuffs.poisonTurns} turns remain)`, 'damage');
            updateStats();
            if (GS.hp <= 0) {
                GS.hp = 0;
                updateStats();
                setTimeout(() => window.Game.defeat(), 1000);
                return;
            }
        }

        // ── ENEMY BURN TICK ──
        const esBurn = GS.enemyStatus;
        if (esBurn && esBurn.burn > 0 && esBurn.burnTurns > 0) {
            const bdmg = esBurn.burn;
            GS.enemy.currentHp = Math.max(0, GS.enemy.currentHp - bdmg);
            if (GS.challengeMode) GS.challengeDmg += bdmg;
            esBurn.burnTurns--;
            if (esBurn.burnTurns <= 0) esBurn.burn = 0;
            log(`🔥 Enemy burn: ${bdmg} damage (${esBurn.burnTurns} turns remain)`, 'damage');
            Combat.renderEnemy();
            if (GS.enemy.currentHp <= 0) {
                Combat.enemyDefeated();
                return;
            }
        }

        // ── ENEMY STATUS COUNTDOWNS ──
        if (GS.enemyStatus) {
            const esc = GS.enemyStatus;
            if (esc.chillTurns > 0) { esc.chillTurns--; if (esc.chillTurns <= 0) esc.chill = 0; }
            if (esc.markTurns > 0) { esc.markTurns--; if (esc.markTurns <= 0) esc.mark = 0; }
            if (esc.weaken > 0) esc.weaken--;
            if (esc.freeze > 0) esc.freeze--;
            if (esc.stun > 0) esc.stun--;
            esc.stunCooldown = false;
        }

        // Reset Echo Stone tracking for new turn
        GS.echoStoneDieId = null;

        // ── SEALED SLOT COUNTDOWN ──
        if (GS.playerDebuffs.disabledSlots && GS.playerDebuffs.disabledSlots.length > 0) {
            const expired = [];
            GS.playerDebuffs.disabledSlots.forEach(ds => {
                ds.turnsLeft--;
                if (ds.turnsLeft <= 0) expired.push(ds);
            });
            if (expired.length > 0) {
                GS.playerDebuffs.disabledSlots = GS.playerDebuffs.disabledSlots.filter(ds => ds.turnsLeft > 0);
                const names = expired.map(ds => ds.slotId.startsWith('str') ? 'strike' : 'guard');
                log(`🔓 ${expired.length} slot${expired.length > 1 ? 's' : ''} unsealed (${names.join(', ')}).`, 'info');
            }
        }

        // ── RESET PER-TURN CONSUMABLE FLAGS ──
        GS.consumableUsedThisTurn = false;
        GS.ragePotionActive = false;
        GS.hasteDiceBonus = 0;

        // ── RESET DICE FOR NEW TURN ──
        GS.dice.forEach(d => { d.rolled = false; d.value = 0; d.location = 'pool'; delete d.slotId; });
        GS.allocated = { strike: [], guard: [] };
        GS.rolled = false;
        GS.autoLifesteal = 0;
        GS.rerollsLeft = GS.rerolls;
        GS.rerollsLeft += GS.artifacts.filter(a => a.effect === 'bonusReroll').reduce((s, a) => s + a.value, 0);

        // ── PLAYER REGEN ──
        let regenAmt = 0; // regen rune removed; regen from passives only
        if (GS.passives.regen) regenAmt += GS.passives.regen;
        if (regenAmt > 0) {
            const h = heal(regenAmt);
            if (h > 0) log(`💚 Regen: +${h} HP`, 'heal');
        }

        if (GS.regenStacks && GS.regenStacks > 0) {
            const h = heal(GS.regenStacks);
            if (h > 0) log(`❤️ Rejuvenate: +${h} HP (${GS.regenStacks - 1} next turn)`, 'heal');
            GS.regenStacks--;
        }

        // ── BATTLE FURY CHARGE ──
        if (GS.artifacts.some(a => a.effect === 'battleFury')) {
            GS.furyCharges = (GS.furyCharges || 0) + 1;
            const needed = 3;
            log(`🔥 Fury: ${GS.furyCharges}/${needed}${GS.furyCharges >= needed ? ' — READY!' : ''}`, 'info');
        }

        // ── ENEMY TURN COUNTER ──
        const e = GS.enemy;
        e.turnsAlive++;
        e.patternIdx++;
        if (GS.challengeMode) GS.challengeTurns++;

        // ── GENERIC PASSIVE PROCESSING ──

        // Regen
        const regenP = e.passives.find(p => p.id === 'regen');
        if (regenP) {
            const amt = Math.min(regenP.params.amount, e.maxHp - e.currentHp);
            if (amt > 0) {
                e.currentHp += amt;
                log(`💚 ${e.name} regenerates ${amt} HP (${e.currentHp}/${e.maxHp})`, 'heal');
            }
        }

        // Escalate: +1 die every N turns
        const escalateP = e.passives.find(p => p.id === 'escalate');
        if (escalateP && e.turnsAlive % escalateP.params.interval === 0) {
            e.extraDice.push(enemyDie(escalateP.params.dieSize));
            log(`⚙️ ${e.name} powers up! +1d${escalateP.params.dieSize}`, 'damage');
        }

        // Mitosis: evolve after N turns
        const mitosisP = e.passives.find(p => p.id === 'mitosis');
        if (mitosisP && !e._mitosisTriggered && e.turnsAlive >= mitosisP.params.turnTrigger) {
            e._mitosisTriggered = true;
            e.dice = mitosisP.params.newDice.map(enemyDie);
            e.extraDice = [];
            e.currentHp += mitosisP.params.bonusHp;
            e.maxHp += mitosisP.params.bonusHp;
            e.hp = e.maxHp;
            log(`🟢 ${e.name} shudders and evolves! Gains bigger dice and +${mitosisP.params.bonusHp} HP!`, 'damage');
        }

        // Blood Frenzy: trigger below HP threshold
        const frenzyP = e.passives.find(p => p.id === 'bloodFrenzy');
        if (frenzyP && !e.bloodFrenzyTriggered && e.currentHp < e.maxHp * frenzyP.params.hpPercent) {
            e.bloodFrenzyTriggered = true;
            e.extraDice.push(...frenzyP.params.extraDice.map(enemyDie));
            log(`🩸 ${e.name} enters a Blood Frenzy!`, 'damage');
        }

        // Entropy: shrink player dice each turn (Void Lord Phase 2+)
        const entropyP = e.passives.find(p => p.id === 'entropy');
        if (entropyP) {
            if (GS.artifacts.some(a => a.effect === 'ironWill')) {
                log('🧠 Iron Will: Entropy resisted!', 'info');
            } else {
                GS.dice.forEach(d => {
                    if (d._savedMax === undefined) d._savedMax = d.max;
                    if (d._savedMin === undefined) d._savedMin = d.min;
                    d.max = Math.max(1, d.max - 1);
                    if (d.faceValues) {
                        d.faceValues = d.faceValues.filter(v => v <= d.max);
                        if (d.faceValues.length === 0) d.faceValues = [0];
                    }
                    d.min = d.faceValues ? d.faceValues[0] : 0;
                });
                log(`🌀 Entropy! All your dice shrink by 1 max value.`, 'damage');
            }
        }

        // Check phase transitions at start of turn too
        Combat._checkPhaseTransitions();

        // Roll enemy dice for this turn
        Combat._rollEnemyTurn();

        Combat.renderEnemy();
        renderCombatDice();
        renderConsumables();
        setTimeout(() => Combat.roll(), 300);
    },

    enemyDefeated() {
        GS.enemiesKilled++;
        const e = GS.enemy;

        // Restore player dice max values reduced by Decay / Entropy
        GS.dice.forEach(d => {
            if (d._savedMax !== undefined) {
                d.max = d._savedMax;
                delete d._savedMax;
                if (d._savedMin !== undefined) {
                    d.min = d._savedMin;
                    delete d._savedMin;
                }
                // Rebuild face values from scratch up to restored max
                if (d.faceValues && d.sides) {
                    const step = (d.max - d.min) / (d.sides - 1);
                    d.faceValues = Array.from({ length: d.sides }, (_, i) => Math.round(d.min + step * i));
                }
            }
        });

        // Collect battle summary data
        const summary = { loot: [], bonuses: [] };

        // Roll gold & XP — bosses use fixed values, others roll from range
        let earnedGold, earnedXP;
        if (e.isBoss) {
            earnedGold = typeof e.gold === 'number' ? e.gold : rand(e.gold[0], e.gold[1]);
            earnedXP   = typeof e.xp   === 'number' ? e.xp   : rand(e.xp[0],   e.xp[1]);
        } else {
            const baseGold = Array.isArray(e.gold) ? rand(e.gold[0], e.gold[1]) : e.gold;
            const baseXP   = Array.isArray(e.xp)   ? rand(e.xp[0],  e.xp[1])  : e.xp;
            earnedGold = e.isElite ? Math.floor(baseGold * (e.eliteGoldMult || 1)) : baseGold;
            earnedXP   = e.isElite ? Math.floor(baseXP   * (e.eliteXpMult   || 1)) : baseXP;
            // Gold and XP both scale with floor (4% compound per floor)
            const floorScale = Math.pow(1.04, GS.floor - 1);
            earnedGold = Math.floor(earnedGold * floorScale);
            earnedXP   = Math.floor(earnedXP   * floorScale);
        }

        const g = gainGold(earnedGold);
        summary.loot.push({ icon: '💰', text: `+${g} Gold` });
        summary.loot.push({ icon: '✨', text: `+${earnedXP} XP` });
        log(`${e.name} defeated! +${g} gold, +${earnedXP} XP`, 'info');

        // Parasite: gain +1 max HP and +1 gold/combat per kill
        if (GS.artifacts.some(a => a.effect === 'parasite')) {
            GS.maxHp++;
            GS.hp = Math.min(GS.hp + 1, GS.maxHp);
            GS.parasiteGoldPerCombat += GS.artifacts.filter(a => a.effect === 'parasite').length;
            summary.bonuses.push({ icon: '🦠', text: `Parasite: +1 max HP (${GS.maxHp})` });
            log(`🦠 Parasite: +1 max HP (${GS.maxHp}), gold/combat now +${GS.parasiteGoldPerCombat}`, 'info');
        }

        const taxGold = GS.artifacts.filter(a => a.effect === 'goldPerKill').reduce((s, a) => s + a.value, 0);
        if (taxGold > 0) {
            const tg = gainGold(taxGold);
            summary.bonuses.push({ icon: '💰', text: `Tax Collector: +${tg} gold` });
            log(`💰 Tax Collector: +${tg} gold`, 'info');
        }
        if (GS.passives.goldPerCombat) {
            const pg = gainGold(GS.passives.goldPerCombat);
            summary.bonuses.push({ icon: '💰', text: `Prospector: +${pg} gold` });
            log(`💰 Prospector: +${pg} gold`, 'info');
        }
        if (GS.passives.goldInterest) {
            const interest = Math.floor(GS.gold * GS.passives.goldInterest);
            if (interest > 0) {
                const ig = gainGold(interest);
                summary.bonuses.push({ icon: '💰', text: `Interest: +${ig} gold` });
                log(`💰 Interest: +${ig} gold (${Math.round(GS.passives.goldInterest * 100)}%)`, 'info');
            }
        }

        // Track level before XP so we can note level-ups
        const levelBefore = GS.level;
        gainXP(earnedXP);
        if (GS.level > levelBefore) {
            summary.loot.push({ icon: '⭐', text: `Level Up! → Level ${GS.level}` });
        }
        updateStats();

        // Consumable drop: 20% chance from non-boss, non-elite enemies (common pool only)
        let consumableDrop = null;
        if (!e.isBoss && !e.isElite && Math.random() < 0.20) {
            consumableDrop = pickWeightedConsumable('common');
            summary.loot.push({ icon: consumableDrop.icon, text: `Found: ${consumableDrop.name}`, isConsumable: true });
            log(`The enemy dropped a ${consumableDrop.icon} ${consumableDrop.name}!`, 'info');
        }

        // Clear player debuffs at end of combat
        GS.playerDebuffs = { poison: 0, poisonTurns: 0, disabledSlots: [], diceReduction: 0 };

        // Decrement tempBuff combat counters
        if (GS.tempBuffs) {
            if (GS.tempBuffs.armorCombats > 0) {
                GS.buffs.armor -= GS.tempBuffs.armorBonus;
                GS.tempBuffs.armorCombats--;
                if (GS.tempBuffs.armorCombats <= 0) {
                    GS.tempBuffs.armorBonus = 0;
                    log('Fortification Elixir wore off.', 'info');
                } else {
                    log(`Fortification Elixir: ${GS.tempBuffs.armorCombats} combat(s) remaining.`, 'info');
                }
            }
            if (GS.tempBuffs.poisonCombats > 0) {
                GS.tempBuffs.poisonCombats--;
                if (GS.tempBuffs.poisonCombats <= 0) log('Poison Coating wore off.', 'info');
                else log(`Poison Coating: ${GS.tempBuffs.poisonCombats} combat(s) remaining.`, 'info');
            }
            if (GS.tempBuffs.merchantEscort) {
                const eg = gainGold(10);
                summary.bonuses.push({ icon: '🤝', text: `Merchant Escort: +${eg} gold` });
                log(`Merchant's Escort: +${eg} gold!`, 'info');
            }
        }

        // Store summary data and determine reward type
        summary.enemyName = e.name;
        summary.isElite = e.isElite;
        summary.isBoss = e.isBoss;
        summary.consumableDrop = consumableDrop;
        summary.skillPoints = GS.pendingSkillPoints || 0;
        GS.battleSummary = summary;

        if (GS.challengeMode) {
            setTimeout(() => window.Game.challengeResult(), 1200);
            return;
        }
        if (GS.enemy.isBoss && GS.floor >= 15) {
            setTimeout(() => window.Game.victory(), 1200);
            return;
        }

        setTimeout(() => {
            if (window.BattleSummary) {
                window.BattleSummary.show();
            } else {
                // Fallback to old flow
                const finalReward = () => {
                    if (GS.enemy.isElite || GS.enemy.isBoss) {
                        const artMods = GS.encounter?.enemy?.appliedModifiers || [];
                        const artPicks = (GS.enemy.isBoss && GS.enemy.isElite)
                            ? Math.max(1, ...artMods.map(m => m.artifactPicks || 1))
                            : 1;
                        GS._artifactPickTotal = artPicks;
                        window.Rewards.artifactChoice(GS.enemy.isBoss, artPicks);
                    } else {
                        window.Rewards.show();
                    }
                };
                const drainSkillPoints = () => {
                    if (GS.pendingSkillPoints > 0) window.Rewards.slotChoice(drainSkillPoints);
                    else finalReward();
                };
                if (GS.pendingSkillPoints > 0) window.Rewards.slotChoice(drainSkillPoints);
                else finalReward();
            }
        }, 1200);
    }
};
