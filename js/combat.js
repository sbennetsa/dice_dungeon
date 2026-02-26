// ════════════════════════════════════════════════════════════
//  COMBAT
// ════════════════════════════════════════════════════════════
import { BOSSES, ENEMIES, ELITES, pickEnemy } from './constants.js';
import { GS, $, log, gainXP, gainGold, heal, pick } from './state.js';
import { rollSingleDie, getActiveFace, renderCombatDice, updateStats, setupDropZones, show, createDie, getSlotById, enterRerollMode, exitRerollMode } from './engine.js';

// window.Game and window.Rewards are set by screens.js at load time
// to avoid circular module dependencies

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

export const Combat = {
    start(isElite = false, isBoss = false) {
        let template;
        if (isBoss) {
            template = { ...BOSSES[GS.floor] };
        } else {
            template = pickEnemy(GS.floor);
        }

        const scale = Math.pow(1.04, GS.floor - 1);
        template.hp = Math.floor(template.hp * scale);
        template.atk = Math.floor(template.atk * scale);
        template.gold = Math.floor(template.gold * scale);

        let elite = null;
        if (isElite) {
            elite = pick(ELITES);
            template.hp = Math.floor(template.hp * elite.hpM);
            template.atk = Math.floor(template.atk * elite.atkM);
            template.gold = Math.floor(template.gold * elite.goldM);
            template.name = `${elite.prefix} ${template.name}`;
        }

        GS.enemy = {
            ...template,
            currentHp: template.hp,
            baseAtk: template.atk,
            isElite, isBoss,
            intent: template.atk,
            intentText: null,
            turn: 0,
            rage: 0,
            poison: 0,
            abilityState: {},
        };

        // Boss-specific ability state init
        const eName = GS.enemy.name;
        if (eName === 'The Bone King') {
            GS.enemy.abilityState.pattern = ['strike', 'strike', 'bonewall', 'raisedead'];
            GS.enemy.abilityState.patternIdx = 0;
            GS.enemy.abilityState.boneWallShield = 0;
        }
        if (eName === 'Crimson Wyrm') {
            GS.enemy.abilityState.pattern = ['strike', 'breath', 'strike', 'wingbuffet'];
            GS.enemy.abilityState.patternIdx = 0;
            GS.enemy.abilityState.phase2 = false;
        }
        if (eName === 'The Void Lord') {
            GS.enemy.abilityState.phase = 1;
            GS.enemy.abilityState.pattern = ['strike', 'voidrift', 'darkpulse', 'strike'];
            GS.enemy.abilityState.patternIdx = 0;
        }

        // Reset player debuffs for new combat
        GS.playerDebuffs = { poison: 0, poisonTurns: 0, slotDisabled: null, slotDisabledTurns: 0, diceReduction: 0 };

        // Reset enemy status effects for new combat
        GS.enemyStatus = { chill: 0, chillTurns: 0, freeze: 0, mark: 0, markTurns: 0, weaken: 0, burn: 0, burnTurns: 0, stun: 0, stunCooldown: false };
        GS.echoStoneDieId = null;
        GS.gamblerCoinBonus = 0;
        GS.huntersMarkFired = false;
        GS.hourglassFreeFirstTurn = false;
        GS.furyCharges = 0;
        exitRerollMode();

        // Remove Midas Die temp dice from previous combat
        GS.dice = GS.dice.filter(d => !d.midasTemp);

        // Lich: set decay aura immediately
        if (eName === 'Lich') GS.playerDebuffs.diceReduction = 1;

        // tempBuff: Void Lord weakened (Oracle: Defy)
        if (eName === 'The Void Lord' && GS.tempBuffs && GS.tempBuffs.voidLordWeakened) {
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
        GS.allocated = { attack: [], defend: [] };
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

        // Set initial intent text
        Combat.updateIntent();

        updateStats();
        setupDropZones();
        Combat.renderEnemy();
        renderCombatDice();

        const label = isBoss ? '👑 BOSS' : isElite ? '⚡ ELITE' : `Floor ${GS.floor}`;
        log(`${label}: ${GS.enemy.name} appears!`, 'info');
        log(`HP: ${GS.enemy.hp} | ATK: ${GS.enemy.atk}`, 'info');
        if (eName === 'Lich') log('💀 Decay Aura: All your dice are -1 after rolling!', 'damage');
        if (eName === 'Mimic') log('💰 A Mimic! It attacks first and steals gold!', 'damage');

        show('screen-combat');

        // Mimic Surprise: skip player roll on turn 0 — handle in execute
        GS.isFirstTurn = true;
        setTimeout(() => Combat.roll(), 300);
    },

    renderEnemy() {
        const e = GS.enemy;
        const nameCls = e.isElite ? 'enemy-name elite' : (e.isBoss ? 'enemy-name elite' : 'enemy-name');

        let statusIndicators = '';
        if (e.rage > 0) {
            statusIndicators += `<span style="color: var(--red-bright); font-size: 0.75em; margin-left: 8px;">🔥 Rage ×${e.rage}</span>`;
        }
        if (e.poison > 0) {
            statusIndicators += `<span style="color: #50a030; font-size: 0.75em; margin-left: 8px;">☠️ Poison ×${e.poison}</span>`;
        }
        if (e.abilityState && e.abilityState.boneWallShield > 0) {
            statusIndicators += `<span style="color: #8888cc; font-size: 0.75em; margin-left: 8px;">🦴 Shield ${e.abilityState.boneWallShield}</span>`;
        }
        if (e.abilityState && e.abilityState.bloodFrenzyActive) {
            statusIndicators += `<span style="color: var(--red-bright); font-size: 0.75em; margin-left: 8px;">🩸 Frenzied</span>`;
        }
        if (e.abilityState && e.abilityState.phase2 && e.name === 'The Void Lord') {
            const phaseLabel = e.abilityState.phase >= 3 ? 'Phase 3 💀' : 'Phase 2';
            statusIndicators += `<span style="color: #aa44ff; font-size: 0.75em; margin-left: 8px;">🌀 ${phaseLabel}</span>`;
        }
        // Enemy status effects
        const esDisplay = GS.enemyStatus;
        if (esDisplay) {
            if (esDisplay.chill > 0) statusIndicators += `<span style="color: #80c0e0; font-size: 0.75em; margin-left: 8px;">❄️ Chill ${esDisplay.chill}</span>`;
            if (esDisplay.freeze > 0) statusIndicators += `<span style="color: #60a0d0; font-size: 0.75em; margin-left: 8px;">🧊 Frozen ${esDisplay.freeze}</span>`;
            if (esDisplay.mark > 0) statusIndicators += `<span style="color: #cc4444; font-size: 0.75em; margin-left: 8px;">🎯 Mark +${esDisplay.mark}</span>`;
            if (esDisplay.weaken > 0) statusIndicators += `<span style="color: #c060a0; font-size: 0.75em; margin-left: 8px;">💔 Weakened</span>`;
            if (esDisplay.burn > 0) statusIndicators += `<span style="color: #d06020; font-size: 0.75em; margin-left: 8px;">🔥 Burn ${esDisplay.burn}</span>`;
            if (esDisplay.stun > 0) statusIndicators += `<span style="color: #d0d020; font-size: 0.75em; margin-left: 8px;">⚡ Stunned</span>`;
        }

        // Passive ability tags
        const passiveTags = (e.abilities || [])
            .filter(a => a.passive)
            .map(a => `<span class="passive-tag">${a.icon} ${a.name}: ${a.desc}</span>`)
            .join('');
        const passiveHtml = passiveTags ? `<div class="enemy-passive-tags">${passiveTags}</div>` : '';

        // Player debuff indicators (shown in enemy panel for visibility)
        let debuffHtml = '';
        if (GS.playerDebuffs.poison > 0) {
            debuffHtml += `<span class="passive-tag" style="color:#f07070;border-color:rgba(200,60,60,0.3)">☠️ You: Poison ×${GS.playerDebuffs.poison} (${GS.playerDebuffs.poisonTurns}t)</span>`;
        }
        if (GS.playerDebuffs.slotDisabled) {
            debuffHtml += `<span class="passive-tag" style="color:#f07070;border-color:rgba(200,60,60,0.3)">🔒 Your ${GS.playerDebuffs.slotDisabled} slot disabled (${GS.playerDebuffs.slotDisabledTurns}t)</span>`;
        }
        if (debuffHtml) debuffHtml = `<div class="enemy-passive-tags">${debuffHtml}</div>`;

        const intentDisplay = e.intentText || `⚔️ Attacks for ${e.intent}`;

        if (GS.challengeMode) {
            const dpt = GS.challengeTurns > 0 ? Math.round(GS.challengeDmg / GS.challengeTurns) : 0;
            $('enemy-panel').innerHTML = `
                <div class="${nameCls}">${e.name}${statusIndicators}</div>
                <div class="enemy-subtitle">💀 CHALLENGE — Survive and deal maximum damage</div>
                ${passiveHtml}${debuffHtml}
                <div style="text-align:center; margin:8px 0;">
                    <span style="font-size:1.4em; color:var(--gold); font-family:JetBrains Mono,monospace;">💥 ${GS.challengeDmg.toLocaleString()}</span>
                    <span style="font-size:0.8em; color:var(--text-dim); margin-left:8px;">(${dpt}/turn)</span>
                </div>
                <div class="enemy-intent">${intentDisplay}${e.rage > 0 ? ' 🔥' : ''}</div>
            `;
        } else {
            const pct = Math.max(0, (e.currentHp / e.hp) * 100);
            $('enemy-panel').innerHTML = `
                <div class="${nameCls}">${e.name}${statusIndicators}</div>
                <div class="enemy-subtitle">${e.isBoss ? '👑 BOSS' : e.isElite ? '⚡ ELITE' : 'Enemy'} — Floor ${GS.floor}, Act ${GS.act}</div>
                <div class="enemy-hp-bar"><div class="enemy-hp-fill" style="width:${pct}%"></div></div>
                <div class="enemy-hp-text">${e.currentHp} / ${e.hp}</div>
                ${passiveHtml}${debuffHtml}
                <div class="enemy-intent">${intentDisplay}${e.rage > 0 ? ' 🔥' : ''}</div>
            `;
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

        GS.dice.forEach(d => {
            // Midas Die: auto-fire gold on roll
            if (d.midasTemp && d.rolled && d.location !== 'auto') {
                const g = gainGold(d.value);
                d.location = 'auto';
                log(`🎲 Midas Die: +${g} gold!`, 'info');
                return;
            }
            const face = getActiveFace(d);
            if (face && face.modifier.autoFire) {
                d.location = 'auto';
                const m = face.modifier;
                if (m.effect === 'heal') {
                    if (!GS.regenStacks) GS.regenStacks = 0;
                    GS.regenStacks += m.value;
                    log(`${m.icon} Auto: +${m.value} regen (${GS.regenStacks} total)`, 'heal');
                } else if (m.effect === 'gold') {
                    const g = gainGold(m.value);
                    log(`${m.icon} Auto: +${g} gold`, 'info');
                } else if (m.effect === 'scavGold') {
                    const g = gainGold(m.value);
                    log(`${m.icon} Scavenger: +${g} gold`, 'info');
                } else if (m.effect === 'lifesteal') {
                    if (!GS.autoLifesteal) GS.autoLifesteal = 0;
                    GS.autoLifesteal += m.value;
                    log(`${m.icon} Auto: ${Math.round(m.value * 100)}% lifesteal active`, 'info');
                }
            }
        });

        const dieEls = document.querySelectorAll('.die');
        dieEls.forEach(el => el.classList.add('rolling'));
        setTimeout(() => {
            renderCombatDice();
            updateStats();
            log('Rolled: ' + GS.dice.map(d => d.value).join(', '), 'info');
        }, 400);
    },

    returnAll() {
        GS.dice.forEach(d => {
            if (d.location !== 'auto') d.location = 'pool';
        });
        GS.allocated = { attack: [], defend: [] };
        renderCombatDice();
    },

    enterRerollMode,
    exitRerollMode,

    execute() {
        if ($('btn-execute')) $('btn-execute').style.display = 'none';
        if ($('btn-return-all')) $('btn-return-all').style.display = 'none';
        exitRerollMode();

        const eName = GS.enemy.name;
        const as = GS.enemy.abilityState;
        const baseEName = eName.replace(/^(💀 Deadly|🛡️ Armored|⚡ Swift|🔥 Enraged) /, '');
        const es = GS.enemyStatus;

        // ── MIMIC SURPRISE (turn 0 only) ──
        let mimicSurprised = false;
        if ((eName === 'Mimic' || eName.includes('Mimic')) && GS.isFirstTurn && !as.surpriseDone) {
            as.surpriseDone = true;
            mimicSurprised = true;
            const stolen = Math.min(15, GS.gold);
            GS.gold -= stolen;
            let surpriseDmg = GS.enemy.intent;
            if (GS.artifacts.some(a => a.effect === 'soulMirror')) surpriseDmg = Math.floor(surpriseDmg * 0.5);
            GS.hp = Math.max(0, GS.hp - surpriseDmg);
            log(`💰 The Mimic strikes first! Takes ${surpriseDmg} unblocked damage. -${stolen} gold stolen!`, 'damage');
            updateStats();
            if (GS.hp <= 0) {
                GS.hp = 0;
                updateStats();
                setTimeout(() => window.Game.defeat(), 1000);
                return;
            }
            // Continue to normal combat — player's attack still resolves
        }

        const atkCount = GS.allocated.attack.length;
        const defCount = GS.allocated.defend.length;

        // ── DEFEND CALCULATION (before enemy attack for defense resolution) ──
        let defBase = 0, defMult = 1, defBonus = 0;
        let mirrorDmg = 0, regenCoreHeal = 0, steadfastContrib = 0;
        let poisonToApply = 0;
        let siphonHealing = 0;

        // Pack Tactics: pre-compute bonus per defend die (face mods only)
        const ptDefFace = GS.allocated.defend.reduce((sum, d) => {
            const f = getActiveFace(d); const mo = f && !f.modifier.autoFire ? f.modifier : null;
            return mo?.effect === 'packTactics' ? sum + mo.value : sum;
        }, 0);
        // Non-utility defend count for Titan's Blow
        const nonUtilDefCount = GS.allocated.defend.filter(d => { const f = getActiveFace(d); return !f?.modifier?.autoFire; }).length;

        GS.allocated.defend.forEach(d => {
            const face = getActiveFace(d);
            const m = face && !face.modifier.autoFire ? face.modifier : null;

            // Per-slot rune: apply before contributing to base
            const defRune = getSlotById(d.slotId)?.rune;
            let dieVal = d.value + ptDefFace;  // pack tactics lifts each defend die's value
            if (defRune?.effect === 'amplifier') dieVal *= 2;
            if (defRune?.effect === 'titanBlow' && nonUtilDefCount === 1) dieVal *= 3;
            if (defRune?.effect === 'leaden') dieVal *= 2;
            if (GS.artifacts.some(a => a.effect === 'echoStone') && d.id === GS.echoStoneDieId) dieVal += d.value;

            if (m) {
                if (m.effect === 'lucky') { GS.rerollsLeft += m.value; log(`🎰 Lucky! +${m.value} reroll`, 'info'); }
                if (m.effect === 'poison') { poisonToApply += m.value * (defRune?.effect === 'amplifier' ? 2 : 1); }
                if (m.effect === 'midasGold') { const mg = gainGold(dieVal); log(`👑 Midas: +${mg} gold`, 'info'); }
                if (m.effect === 'frostbite') { applyStatus('chill', 2); }

                if (m.effect === 'slotMultiply') { defMult *= m.value; defBase += dieVal; }
                else if (m.effect === 'slotAdd') { defBase += dieVal + m.value * defCount; }
                else if (m.effect === 'packTactics') { defBase += dieVal; }  // bonus already in dieVal
                else if (m.effect === 'volley') { defBase += dieVal + (defCount >= 3 ? m.value : 0); }
                else if (m.effect === 'threshold') { defBase += dieVal >= m.value ? dieVal * 2 : dieVal; }
                else if (m.effect === 'defAdd') { defBase += dieVal + m.value; }
                else if (m.effect === 'lucky' || m.effect === 'poison' || m.effect === 'midasGold'
                      || m.effect === 'searing' || m.effect === 'marked' || m.effect === 'frostbite') { /* utility: no value contribution */ }
                else { defBase += dieVal; }
            } else {
                defBase += dieVal;
            }
            // Track slot rune secondary effects
            if (defRune?.effect === 'regenCore') regenCoreHeal += Math.ceil(dieVal * 0.5);
            if (defRune?.effect === 'mirror') mirrorDmg += dieVal;
            if (defRune?.effect === 'steadfast') steadfastContrib += dieVal;
        });

        defBonus += GS.buffs.armor;
        // transformBuffs: Fortification defend multiplier
        if (GS.transformBuffs && GS.transformBuffs.fortified > 1) defMult *= GS.transformBuffs.fortified;
        // Ascended dice aura bonus to defend
        if (GS.ascendedDice && GS.ascendedDice.length > 0) {
            defBonus += GS.ascendedDice.reduce((s, a) => s + a.bonus, 0);
        }
        if (GS.passives.swarmMaster) defBase += GS.passives.swarmMaster * defCount;
        if (GS.passives.volley && defCount >= 3) defBase += GS.passives.volley;
        if (GS.passives.threshold) {
            GS.allocated.defend.forEach(d => { if (d.value >= 8) defBase += Math.floor(d.value * 0.5); });
        }
        if (GS.passives.titanWrath && defCount === 1) defMult *= 3;
        // New artifact defend bonuses
        defBonus += GS.artifacts.filter(a => a.effect === 'goldenAegis').reduce((s, a) => s + Math.floor(GS.gold / a.value), 0);
        if (defCount >= 4 && GS.artifacts.some(a => a.effect === 'swarmBanner')) defMult *= 1.5;

        const totalDef = Math.floor(defBase * defMult) + defBonus;

        // Frost Brand: block 10+ → apply chill
        if (totalDef >= 10 && GS.artifacts.some(a => a.effect === 'frostBrand')) applyStatus('chill', 3, 2);

        // ══════════════════════════════════════════════════════
        // ── ENEMY ATTACK PHASE (enemies attack first) ──
        // ══════════════════════════════════════════════════════
        let skipEnemyAttack = mimicSurprised;

        // ── IRON GOLEM STUN: skip attack ──
        if (baseEName === 'Iron Golem' && as.stunned) {
            as.stunned = false;
            log(`⚡ The Golem is stunned and skips its attack!`, 'info');
            Combat.renderEnemy();
            skipEnemyAttack = true;
        }

        // ── FUNGAL CREEP SPORE CLOUD: every 2nd player turn ──
        const sporeOnThisTurn = baseEName === 'Fungal Creep' && GS.enemy.turn > 0 && GS.enemy.turn % 2 === 0;
        if (sporeOnThisTurn) {
            GS.playerDebuffs.poison = Math.max(GS.playerDebuffs.poison, 2);
            GS.playerDebuffs.poisonTurns = Math.max(GS.playerDebuffs.poisonTurns, 3);
            log(`🟢 Fungal Creep releases spores! (2 poison/turn for 3 turns)`, 'damage');
            Combat.renderEnemy();
            skipEnemyAttack = true;
        }

        // ── DRAGON WHELP BREATH CHARGE: every 4 turns, turn 3 = charge ──
        if (baseEName === 'Dragon Whelp' && GS.enemy.turn % 4 === 3) {
            as.breathCharging = true;
            log(`🔥 Dragon Whelp inhales deeply...`, 'info');
            Combat.renderEnemy();
            skipEnemyAttack = true;
        }

        // ── HOURGLASS: free first turn ──
        if (GS.hourglassFreeFirstTurn) {
            GS.hourglassFreeFirstTurn = false;
            log('⏳ Hourglass: free turn! Enemy skips.', 'info');
            skipEnemyAttack = true;
        }

        // ── ENEMY STATUS: freeze/stun skip attack ──
        if (es && (es.freeze > 0 || es.stun > 0)) {
            log(`${es.freeze > 0 ? '🧊 Frozen' : '⚡ Stunned'} — enemy skips attack!`, 'info');
            Combat.renderEnemy();
            skipEnemyAttack = true;
        }

        if (!skipEnemyAttack) {
        let enemyDmg = GS.enemy.intent;
        // Chill: reduce ATK by chill stacks
        if (es && es.chill > 0) {
            enemyDmg = Math.max(0, enemyDmg - es.chill);
            log(`❄️ Chill reduces enemy ATK by ${es.chill}!`, 'info');
        }
        let attackTimes = 1;

        // Dark Mage: apply Curse (debuff affects next turn)
        if (baseEName === 'Dark Mage' && GS.enemy.turn > 0 && GS.enemy.turn % 3 === 0) {
            if (GS.artifacts.some(a => a.effect === 'anchoredSlots')) {
                log('⚓ Anchored Slots: Curse prevented!', 'info');
            } else {
                const atkDice = GS.allocated.attack.length;
                const defDice = GS.allocated.defend.length;
                const targetSlot = atkDice >= defDice ? 'attack' : 'defend';
                GS.playerDebuffs.slotDisabled = targetSlot;
                GS.playerDebuffs.slotDisabledTurns = 2;
                log(`🟣 Dark Mage casts Curse! Your ${targetSlot} slot is disabled for 2 turns!`, 'damage');
            }
        }

        // Orc Warrior War Cry
        if (baseEName === 'Orc Warrior' && as.warCryReady) {
            enemyDmg = enemyDmg * 2;
            as.warCryReady = false;
            log(`🔥 War Cry! The Orc attacks for ${enemyDmg}!`, 'damage');
        }

        // Dragon Whelp Breath fire
        if (baseEName === 'Dragon Whelp' && as.breathCharging) {
            enemyDmg = 30;
            as.breathCharging = false;
            log(`🔥 Dragon Breath! 30 damage incoming!`, 'damage');
        }

        // Mimic Greed Tax
        if (baseEName === 'Mimic') {
            const greedBonus = Math.floor(GS.gold / 50);
            if (greedBonus > 0) {
                enemyDmg += greedBonus;
                log(`💰 Greed Tax: +${greedBonus} ATK (you have ${GS.gold} gold)`, 'damage');
            }
        }

        // Vampire Blood Frenzy: double attacks
        if (baseEName === 'Vampire' && as.bloodFrenzyActive) attackTimes = 2;
        // Dire Rat Frenzy: always attacks twice
        if (baseEName === 'Dire Rat') attackTimes = 2;
        // Void Lord Phase 3: attack twice
        if (eName === 'The Void Lord' && as.phase >= 3) attackTimes = 2;

        // Boss pattern actions
        let bossSkippedNormalAttack = false;

        if (eName === 'The Bone King') {
            const action = as.pattern[as.patternIdx % 4];
            as.patternIdx++;
            if (action === 'bonewall') {
                as.boneWallShield += 15;
                log(`🦴 Bone Wall! The Bone King gains 15 shield!`, 'info');
                Combat.renderEnemy();
                bossSkippedNormalAttack = true;
            } else if (action === 'raisedead') {
                GS.enemy.baseAtk += 3;
                GS.enemy.atk += 3;
                log(`💀 Raise Dead! Bone King ATK permanently +3 (now ${Math.floor(GS.enemy.baseAtk * Math.pow(1.2, GS.enemy.rage))})!`, 'damage');
                Combat.renderEnemy();
                bossSkippedNormalAttack = true;
            }
            // else 'strike': normal attack (falls through)
        }

        if (eName === 'Crimson Wyrm') {
            const action = as.pattern[as.patternIdx % 4];
            as.patternIdx++;
            if (action === 'breath') {
                const breathDmg = 18;
                GS.playerDebuffs.poison = Math.max(GS.playerDebuffs.poison, 3);
                GS.playerDebuffs.poisonTurns = Math.max(GS.playerDebuffs.poisonTurns, 3);
                GS.hp = Math.max(0, GS.hp - breathDmg);
                log(`🔥 Fire Breath! ${breathDmg} damage + 3 burn/turn for 3 turns!`, 'damage');
                updateStats();
                if (GS.hp <= 0) { setTimeout(() => window.Game.defeat(), 1000); return; }
                Combat.renderEnemy();
                bossSkippedNormalAttack = true;
            } else if (action === 'wingbuffet') {
                const buffetDmg = 10;
                if (GS.artifacts.some(a => a.effect === 'anchoredSlots')) {
                    log('⚓ Anchored Slots: Wing Buffet slot disable prevented!', 'info');
                } else {
                    GS.playerDebuffs.slotDisabled = 'attack';
                    GS.playerDebuffs.slotDisabledTurns = 1;
                }
                GS.hp = Math.max(0, GS.hp - buffetDmg);
                log(`💨 Wing Buffet! ${buffetDmg} damage${!GS.artifacts.some(a => a.effect === 'anchoredSlots') ? ' + attack slot disabled 1 turn' : ''}!`, 'damage');
                updateStats();
                if (GS.hp <= 0) { setTimeout(() => window.Game.defeat(), 1000); return; }
                Combat.renderEnemy();
                bossSkippedNormalAttack = true;
            } else if (action === 'strike' && as.phase2) {
                // Phase 2 strikes also apply burn
                GS.playerDebuffs.poison = Math.max(GS.playerDebuffs.poison, 2);
                GS.playerDebuffs.poisonTurns = Math.max(GS.playerDebuffs.poisonTurns, 2);
            }
            // falls through to normal attack for 'strike'
        }

        if (eName === 'The Void Lord') {
            const action = as.pattern[as.patternIdx % 4];
            as.patternIdx++;
            if (action === 'voidrift') {
                if (GS.artifacts.some(a => a.effect === 'anchoredSlots')) {
                    log('⚓ Anchored Slots: Void Rift prevented!', 'info');
                } else {
                    const targetSlot = Math.random() < 0.5 ? 'attack' : 'defend';
                    GS.playerDebuffs.slotDisabled = targetSlot;
                    GS.playerDebuffs.slotDisabledTurns = 2;
                    log(`🌀 Void Rift! Your ${targetSlot} slot is disabled for 2 turns!`, 'damage');
                }
                Combat.renderEnemy();
                bossSkippedNormalAttack = true;
            } else if (action === 'darkpulse') {
                let pulseDmg = 15;
                if (GS.artifacts.some(a => a.effect === 'soulMirror')) pulseDmg = Math.floor(pulseDmg * 0.5);
                GS.hp = Math.max(0, GS.hp - pulseDmg);
                log(`🌀 Dark Pulse! ${pulseDmg} unblockable damage!`, 'damage');
                updateStats();
                if (GS.hp <= 0) { setTimeout(() => window.Game.defeat(), 1000); return; }
                // Entropy in phase 2
                if (as.phase >= 2) Combat._applyEntropy();
                Combat.renderEnemy();
                bossSkippedNormalAttack = true;
            }
            // Phase 2 Entropy on regular strike turns
            if (!bossSkippedNormalAttack && as.phase >= 2) Combat._applyEntropy();
        }

        // ── NORMAL ENEMY ATTACK (if not replaced by boss pattern) ──
        if (!bossSkippedNormalAttack) {
        // Dark Mage Penetration: reduce effective block by 3 (Steadfast block is immune)
        let effectiveDef = totalDef;
        if (baseEName === 'Dark Mage') {
            const reducible = totalDef - steadfastContrib;
            effectiveDef = Math.max(0, reducible - 3) + steadfastContrib;
        }

        // Weaken: enemy deals 25% less
        if (es && es.weaken > 0) {
            enemyDmg = Math.floor(enemyDmg * 0.75);
            log('💔 Weaken: enemy deals 25% less!', 'info');
        }

        // ── DEAL DAMAGE TO PLAYER (once per attackTimes) ──
        let remainingDef = effectiveDef;
        for (let i = 0; i < attackTimes; i++) {
            const blocked = Math.min(enemyDmg, remainingDef);
            const mitigated = enemyDmg - blocked;
            remainingDef -= blocked;

            GS.hp -= mitigated;

            if (blocked > 0) {
                log(`${GS.enemy.name} attacks for ${enemyDmg} — you block ${blocked}, take ${mitigated} damage`, 'defend');
            } else {
                log(`${GS.enemy.name} attacks for ${enemyDmg} damage!`, 'damage');
            }

            if (mitigated > 0) {
                // Thorn Mail artifact
                const thornMail = GS.artifacts.filter(a => a.effect === 'thornMail').reduce((s, a) => s + a.value, 0);
                if (thornMail > 0) {
                    GS.enemy.currentHp -= thornMail;
                    if (GS.challengeMode) GS.challengeDmg += thornMail;
                    log(`🌿 Thorn Mail: ${thornMail} back!`, 'info');
                    Combat.renderEnemy();
                    if (GS.enemy.currentHp <= 0) { Combat.enemyDefeated(); return; }
                }
                // transformBuffs: Thorns Aura
                if (GS.transformBuffs && GS.transformBuffs.thornsAura > 0) {
                    GS.enemy.currentHp -= GS.transformBuffs.thornsAura;
                    if (GS.challengeMode) GS.challengeDmg += GS.transformBuffs.thornsAura;
                    log(`🌿 Thorns Aura: ${GS.transformBuffs.thornsAura} reflect!`, 'damage');
                    Combat.renderEnemy();
                    if (GS.enemy.currentHp <= 0) { Combat.enemyDefeated(); return; }
                }
                // Toxic Blood: apply poison to attacker
                if (GS.artifacts.some(a => a.effect === 'toxicBlood')) applyEnemyPoison(2);
            }

            // transformBuffs: Vampiric Ward — heal from blocked damage
            if (GS.transformBuffs && GS.transformBuffs.vampiricWard && blocked > 0) {
                const vheal = Math.floor(blocked * 0.25);
                if (vheal > 0) {
                    const h = heal(vheal);
                    if (h > 0) { log(`🧛 Vampiric Ward: +${h} HP!`, 'heal'); updateStats(); }
                }
            }

            // Vampire Lifesteal: heals after each attack
            if (baseEName === 'Vampire' && mitigated > 0) {
                const lsHeal = Math.floor(mitigated * 0.5);
                if (lsHeal > 0) {
                    GS.enemy.currentHp = Math.min(GS.enemy.hp, GS.enemy.currentHp + lsHeal);
                    log(`🩸 Vampire lifesteals ${lsHeal} HP!`, 'info');
                    Combat.renderEnemy();
                }
            }

            if (GS.hp <= 0) {
                GS.hp = 0;
                updateStats();
                setTimeout(() => {
                    if (GS.challengeMode) window.Game.challengeResult();
                    else window.Game.defeat();
                }, 1000);
                return;
            }
        }

        // Demon Hellfire: 5 unblockable damage in addition to normal attack
        if (baseEName === 'Demon') {
            let hellfire = 5;
            if (GS.artifacts.some(a => a.effect === 'soulMirror')) hellfire = Math.floor(hellfire * 0.5);
            GS.hp = Math.max(0, GS.hp - hellfire);
            log(`🔥 Hellfire: ${hellfire} unblockable damage!`, 'damage');
            if (GS.hp <= 0) {
                GS.hp = 0;
                updateStats();
                setTimeout(() => window.Game.defeat(), 1000);
                return;
            }
        }
        } // end bossSkippedNormalAttack check

        updateStats();
        } // end !skipEnemyAttack

        // ══════════════════════════════════════════════════════
        // ── PLAYER ATTACK PHASE ──
        // ══════════════════════════════════════════════════════

        // ── SHADOW ASSASSIN EVASION: negate one random attack die ──
        if (eName === 'Shadow Assassin' || eName.includes('Shadow Assassin')) {
            if (GS.allocated.attack.length > 0) {
                const dodgeDie = GS.allocated.attack[Math.floor(Math.random() * GS.allocated.attack.length)];
                const dodgedVal = dodgeDie.value;
                dodgeDie.value = 0;
                log(`💨 Shadow Assassin dodges — negates ${dodgedVal} from one die!`, 'info');
            }
        }

        // ── ATTACK CALCULATION ──
        let atkBase = 0, atkMult = 1, atkBonus = 0;

        // Pack Tactics: pre-compute bonus per attack die (face mods + passive)
        const ptAtkFace = GS.allocated.attack.reduce((sum, d) => {
            const f = getActiveFace(d); const mo = f && !f.modifier.autoFire ? f.modifier : null;
            return mo?.effect === 'packTactics' ? sum + mo.value : sum;
        }, 0);
        const ptAtkPerDie = ptAtkFace + (GS.passives.packTactics || 0);
        // Non-utility attack count for Titan's Blow
        const nonUtilAtkCount = GS.allocated.attack.filter(d => { const f = getActiveFace(d); return !f?.modifier?.autoFire; }).length;

        // Battle Fury: boost highest attack die if 3+ fury charges
        let furyBoostDieId = null;
        if (GS.furyCharges >= 3 && atkCount > 0) {
            const topDie = GS.allocated.attack.reduce((best, d) => d.value > (best?.value || -1) ? d : best, null);
            furyBoostDieId = topDie?.id || null;
            if (furyBoostDieId) {
                log(`🔥 Battle Fury! Highest attack die ×2 this turn!`, 'info');
                GS.furyCharges = 0;
            }
        }

        GS.allocated.attack.forEach(d => {
            const face = getActiveFace(d);
            const m = face && !face.modifier.autoFire ? face.modifier : null;

            // Per-slot rune: apply before contributing to base
            const atkRune = getSlotById(d.slotId)?.rune;
            let dieVal = d.value + ptAtkPerDie;  // pack tactics lifts each die's effective value
            if (atkRune?.effect === 'amplifier') dieVal *= 2;
            if (atkRune?.effect === 'titanBlow' && nonUtilAtkCount === 1) dieVal *= 3;
            if (d.id === furyBoostDieId) dieVal *= 2;
            if (GS.artifacts.some(a => a.effect === 'echoStone') && d.id === GS.echoStoneDieId) dieVal += d.value;

            if (m) {
                if (m.effect === 'lucky') { GS.rerollsLeft += m.value; log(`🎰 Lucky! +${m.value} reroll`, 'info'); }
                if (m.effect === 'poison') { poisonToApply += m.value * (atkRune?.effect === 'amplifier' ? 2 : 1); }
                if (m.effect === 'midasGold') { const mg = gainGold(dieVal); log(`👑 Midas: +${mg} gold`, 'info'); }
                if (m.effect === 'searing') { applyStatus('burn', 2, 3); }
                if (m.effect === 'marked') { applyStatus('mark', 3, 2); }

                if (m.effect === 'slotMultiply') { atkMult *= m.value; atkBase += dieVal; }
                else if (m.effect === 'slotAdd') { atkBase += dieVal + m.value * atkCount; }
                else if (m.effect === 'packTactics') { atkBase += dieVal; }  // bonus already in dieVal
                else if (m.effect === 'volley') { atkBase += dieVal + (atkCount >= 3 ? m.value : 0); }
                else if (m.effect === 'threshold') { atkBase += dieVal >= m.value ? dieVal * 2 : dieVal; }
                else if (m.effect === 'defAdd') { atkBase += dieVal; }
                else if (m.effect === 'lucky' || m.effect === 'poison' || m.effect === 'midasGold'
                      || m.effect === 'searing' || m.effect === 'marked' || m.effect === 'frostbite') { /* utility: no value contribution */ }
                else { atkBase += dieVal; }
            } else {
                atkBase += dieVal;
            }
            if (atkRune?.effect === 'siphon') siphonHealing += dieVal;
        });

        atkBonus += GS.buffs.damageBoost;
        // transformBuffs: Fury Chamber attack multiplier
        if (GS.transformBuffs && GS.transformBuffs.furyChambered > 1) atkMult *= GS.transformBuffs.furyChambered;
        // Ascended dice aura bonus to attack
        if (GS.ascendedDice && GS.ascendedDice.length > 0) {
            atkBonus += GS.ascendedDice.reduce((s, a) => s + a.bonus, 0);
        }
        // Conduit: extra poison per attack die
        if (GS.transformBuffs && GS.transformBuffs.conduit > 0 && atkCount > 0) {
            poisonToApply += GS.transformBuffs.conduit * atkCount;
        }
        const goldScale = GS.artifacts.filter(a => a.effect === 'goldScaleDmg').reduce((s, a) => s + Math.floor(GS.gold / a.value), 0);
        if (goldScale > 0) atkBonus += goldScale;
        if (GS.passives.goldDmg) atkBonus += Math.floor(GS.gold / GS.passives.goldDmg);
        if (GS.passives.swarmMaster) atkBase += GS.passives.swarmMaster * atkCount;
        if (GS.passives.volley && atkCount >= 3) atkBase += GS.passives.volley;
        if (GS.passives.threshold) {
            GS.allocated.attack.forEach(d => { if (d.value >= 8) atkBase += Math.floor(d.value * 0.5); });
        }
        if (GS.passives.titanWrath && atkCount === 1) atkMult *= 3;
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

        let totalAtk = Math.floor(atkBase * atkMult) + atkBonus;
        // Sharpening Stone: +50% after all other bonuses
        if (GS.artifacts.some(a => a.effect === 'sharpeningStone')) totalAtk = Math.ceil(totalAtk * 1.5);

        // ── ENEMY ABILITY MODIFIERS ON PLAYER ATTACK ──
        let finalAtk = totalAtk;

        // Brittle Skeleton: +3 to incoming damage
        if (baseEName === 'Skeleton') {
            finalAtk += 3;
            log(`💀 Brittle: +3 bonus damage!`, 'info');
        }

        // Troll Thick Hide: ignore if raw dice base < 10
        if (baseEName === 'Troll' && atkBase < 10 && finalAtk > 0) {
            finalAtk = 0;
            log(`🛡️ Thick Hide: attack ignored (below 10 dice)!`, 'info');
        }

        // Dragon Whelp Scales: only damage above 8 from attack dice counts, bonuses pass through
        if (baseEName === 'Dragon Whelp') {
            const scaledBase = Math.max(0, atkBase - 8);
            const bonuses = totalAtk - atkBase;
            finalAtk = scaledBase + bonuses;
            if (scaledBase === 0) log(`🐉 Scales absorb all slot damage!`, 'info');
            else log(`🐉 Scales block 8 slot damage (${finalAtk} gets through)`, 'info');
        }

        // Iron Golem Armor Plating: -5 all damage
        if (baseEName === 'Iron Golem') {
            finalAtk = Math.max(0, finalAtk - 5);
            log(`🛡️ Armor Plating: -5 damage (${finalAtk} gets through)`, 'info');
        }

        // Bone King Bone Wall: shield absorbs damage first
        if (eName === 'The Bone King' && as.boneWallShield > 0) {
            const abs = Math.min(finalAtk, as.boneWallShield);
            as.boneWallShield -= abs;
            finalAtk -= abs;
            if (abs > 0) log(`🦴 Bone Wall absorbs ${abs} damage (${as.boneWallShield} remaining)`, 'info');
        }

        // Void Lord Phase 3: takes +50% damage
        if (eName === 'The Void Lord' && as.phase >= 3) {
            finalAtk = Math.floor(finalAtk * 1.5);
        }

        // ── PLAYER ATTACKS ENEMY ──
        GS.enemy.currentHp -= finalAtk;
        if (GS.challengeMode) GS.challengeDmg += finalAtk;
        log(`You deal ${finalAtk} damage!`, 'damage');

        // Gold Forge: each attack die generates gold equal to its rolled value
        if (GS.transformBuffs && GS.transformBuffs.goldForge && finalAtk > 0) {
            GS.allocated.attack.forEach(d => {
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
            if (sh > 0) { log(`🩸 Siphon: +${sh} HP`, 'heal'); updateStats(); }
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

        // ── POST-ATTACK ABILITY CHECKS ──

        // Iron Golem Overcharge: stun if player dealt 20+
        if (baseEName === 'Iron Golem' && finalAtk >= 20) {
            as.stunned = true;
            log(`⚡ Overcharged! The Golem staggers — skips next attack!`, 'damage');
        }

        // Slime Mitosis: transform on turn 3
        if (baseEName === 'Slime' && !as.transformed && GS.enemy.turn >= 3 && GS.enemy.currentHp > 0) {
            as.transformed = true;
            GS.enemy.name = 'Slimeling Swarm';
            GS.enemy.hp = 20;
            GS.enemy.currentHp = Math.min(GS.enemy.currentHp, 20);
            GS.enemy.baseAtk = 6;
            GS.enemy.atk = 6;
            GS.enemy.intent = 6;
            GS.enemy.intentText = `⚔️ Attacks for 6`;
            log(`🟢 The Slime splits into a Slimeling Swarm! (20 HP, 6 ATK)`, 'damage');
        }

        // Demon Soul Pact: reflect overkill damage
        if (baseEName === 'Demon' && GS.enemy.currentHp < 0) {
            const reflected = -GS.enemy.currentHp;
            GS.enemy.currentHp = 0;
            GS.hp = Math.max(0, GS.hp - reflected);
            log(`👹 Soul Pact: ${reflected} overkill reflected back to you!`, 'damage');
            updateStats();
            if (GS.hp <= 0) {
                setTimeout(() => window.Game.defeat(), 1000);
                return;
            }
        }

        // Lich Phylactery: revive on first death
        if (baseEName === 'Lich' && GS.enemy.currentHp <= 0 && !as.phylacteryUsed) {
            as.phylacteryUsed = true;
            GS.enemy.currentHp = 26;
            log(`💀 The Phylactery pulses... The Lich reforms at 26 HP!`, 'damage');
            Combat.renderEnemy();
            updateStats();
            // Don't call enemyDefeated — fall through to enemy attack
        }

        Combat.renderEnemy();
        updateStats();

        if (GS.enemy.currentHp <= 0) {
            // Overflow Chalice: overkill heals player
            if (GS.enemy.currentHp < 0 && GS.artifacts.some(a => a.effect === 'overflowChalice')) {
                const h = heal(-GS.enemy.currentHp);
                if (h > 0) { log(`🏆 Overflow Chalice: +${h} HP!`, 'heal'); updateStats(); }
            }
            Combat.enemyDefeated();
            return;
        }

        // ── POISON TICK ON ENEMY ──
        if (GS.enemy.poison > 0) {
            let poisonDmg = GS.enemy.poison;
            if (GS.passives.plagueLord) poisonDmg *= 2;
            // Iron Golem armor applies to poison too
            if (baseEName === 'Iron Golem') poisonDmg = Math.max(0, poisonDmg - 5);
            GS.enemy.currentHp -= poisonDmg;
            if (GS.challengeMode) GS.challengeDmg += poisonDmg;
            GS.enemy.poison = Math.max(0, GS.enemy.poison - 1);
            log(`☠️ Poison deals ${poisonDmg} damage! (${GS.enemy.poison} stacks remain)`, 'damage');
            Combat.renderEnemy();

            if (GS.enemy.currentHp <= 0) {
                // Check Phylactery again after poison
                if (baseEName === 'Lich' && !as.phylacteryUsed) {
                    as.phylacteryUsed = true;
                    GS.enemy.currentHp = 26;
                    log(`💀 The Phylactery pulses... The Lich reforms at 26 HP!`, 'damage');
                    Combat.renderEnemy();
                } else {
                    Combat.enemyDefeated();
                    return;
                }
            }
        }

        updateStats();

        if (GS.enemy.currentHp <= 0) {
            Combat.enemyDefeated();
            return;
        }

        Combat.newTurn();
    },

    // Apply Void Lord Entropy: remove highest face from a random die (min 3 faces)
    _applyEntropy() {
        if (GS.artifacts.some(a => a.effect === 'ironWill')) {
            log('🧠 Iron Will: Entropy resisted!', 'info');
            return;
        }
        const eligible = GS.dice.filter(d => d.faceValues.length > 3);
        if (eligible.length > 0) {
            const target = eligible[Math.floor(Math.random() * eligible.length)];
            const removed = target.faceValues.pop();
            target.max = target.faceValues[target.faceValues.length - 1];
            log(`🌀 Entropy consumes a die! Lost face value ${removed} from a d${target.sides}!`, 'damage');
        }
    },

    updateIntent() {
        const e = GS.enemy;
        if (!e) return;
        const eName = e.name;
        const as = e.abilityState || {};
        const rageAtk = Math.floor(e.baseAtk * Math.pow(1.2, e.rage));

        let text = `⚔️ Attacks for ${rageAtk}`;

        const baseEName = eName.replace(/^(💀 Deadly|🛡️ Armored|⚡ Swift|🔥 Enraged) /, '');

        if (baseEName === 'Dire Rat') {
            text = `⚔️⚔️ Strikes twice for ${rageAtk}`;
        }
        if (baseEName === 'Fungal Creep') {
            const nextTurn = e.turn + 1;
            if (nextTurn > 0 && nextTurn % 2 === 0) text = '🟢 Releasing spores...';
        }
        if ((baseEName === 'Slime' || eName === 'Slimeling Swarm') && !as.transformed && e.turn < 3) {
            const turnsLeft = 2 - e.turn;
            text = turnsLeft > 0 ? `⏳ Splitting in ${turnsLeft}...` : `⏳ Splitting now!`;
        }
        if (baseEName === 'Orc Warrior') {
            if (as.warCryReady) text = `🔥 War Cry! Attacks for ${rageAtk * 2}`;
            else if ((e.turn + 1) % 3 === 2) text = '🔥 Winding up...';
        }
        if (baseEName === 'Dark Mage') {
            if ((e.turn + 1) % 3 === 0) text = '🟣 Casting Curse...';
        }
        if (baseEName === 'Dragon Whelp') {
            if (as.breathCharging) text = '🔥 Dragon Breath! 30 damage!';
            else if ((e.turn + 1) % 4 === 3) text = '🔥 Inhaling...';
        }
        if (baseEName === 'Mimic') {
            const greedBonus = Math.floor(GS.gold / 50);
            text = `⚔️ Attacks for ${rageAtk + greedBonus}${greedBonus > 0 ? ` (+${greedBonus} Greed Tax)` : ''}`;
        }
        if (baseEName === 'Vampire' && as.bloodFrenzyActive) {
            text = `🩸 Blood Frenzy! Attacks twice for ${rageAtk}`;
        }
        if (baseEName === 'Shadow Assassin') {
            const emptySlots = Math.max(0, GS.slots.attack.length - GS.allocated.attack.length);
            const exposeBonus = emptySlots * 5;
            text = `⚔️ Attacks for ${rageAtk + exposeBonus}${exposeBonus > 0 ? ` (+${exposeBonus} Expose)` : ''}`;
        }

        // Boss patterns
        const foresight = GS.tempBuffs && GS.tempBuffs.foresight;
        const _bossActionLabel = (action, boss) => {
            if (boss === 'bone') {
                if (action === 'bonewall') return '🦴 Bone Wall';
                if (action === 'raisedead') return '💀 Raise Dead';
                return `⚔️ Strike (${rageAtk})`;
            }
            if (boss === 'wyrm') {
                if (action === 'breath') return '🔥 Fire Breath';
                if (action === 'wingbuffet') return '💨 Wing Buffet';
                return `⚔️ Strike (${rageAtk})`;
            }
            if (boss === 'void') {
                if (action === 'voidrift') return '🌀 Void Rift';
                if (action === 'darkpulse') return '🌀 Dark Pulse (15 dmg)';
                return `⚔️ Strike (${rageAtk})`;
            }
            return '?';
        };

        if (eName === 'The Bone King') {
            const idx = as.patternIdx || 0;
            const nextAction = as.pattern && as.pattern[idx % 4];
            if (nextAction === 'bonewall') text = '🦴 Bone Wall incoming...';
            else if (nextAction === 'raisedead') text = '💀 Raise Dead incoming...';
            else text = `⚔️ Attacks for ${rageAtk}${as.boneWallShield > 0 ? ` (🦴 Shield ${as.boneWallShield})` : ''}`;
            if (foresight && as.pattern) {
                const after = _bossActionLabel(as.pattern[(idx + 1) % 4], 'bone');
                text += ` | Then: ${after}`;
            }
        }
        if (eName === 'Crimson Wyrm') {
            const idx = as.patternIdx || 0;
            const nextAction = as.pattern && as.pattern[idx % 4];
            if (nextAction === 'breath') text = '🔥 Fire Breath incoming!';
            else if (nextAction === 'wingbuffet') text = '💨 Wing Buffet incoming!';
            else text = `⚔️ Attacks for ${rageAtk}${as.phase2 ? ' + burn' : ''}`;
            if (foresight && as.pattern) {
                const after = _bossActionLabel(as.pattern[(idx + 1) % 4], 'wyrm');
                text += ` | Then: ${after}`;
            }
        }
        if (eName === 'The Void Lord') {
            const idx = as.patternIdx || 0;
            const nextAction = as.pattern && as.pattern[idx % 4];
            if (nextAction === 'voidrift') text = '🌀 Void Rift incoming!';
            else if (nextAction === 'darkpulse') text = '🌀 Dark Pulse: 15 unblockable!';
            else if (as.phase >= 3) text = `⚔️⚔️ Desperate! Attacks twice for ${rageAtk} (takes +50% damage)`;
            else text = `⚔️ Attacks for ${rageAtk}${as.phase >= 2 ? ' + Entropy' : ''}`;
            if (foresight && as.pattern) {
                const after = _bossActionLabel(as.pattern[(idx + 1) % 4], 'void');
                text += ` | Then: ${after}`;
            }
        }

        // Enemy status modifiers on intent display
        const esIntent = GS.enemyStatus;
        if (esIntent) {
            const mods = [];
            if (esIntent.chill > 0) mods.push(`❄️−${esIntent.chill}`);
            if (esIntent.freeze > 0) mods.push('🧊FROZEN');
            if (esIntent.stun > 0) mods.push('⚡STUNNED');
            if (esIntent.weaken > 0) mods.push('💔WEAKENED');
            if (mods.length) text += ` [${mods.join(' ')}]`;
        }

        e.intent = rageAtk;
        e.intentText = text;
    },

    newTurn() {
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

        // ── SLOT DISABLE COUNTDOWN ──
        if (GS.playerDebuffs.slotDisabled) {
            GS.playerDebuffs.slotDisabledTurns--;
            if (GS.playerDebuffs.slotDisabledTurns <= 0) {
                log(`🔓 Your ${GS.playerDebuffs.slotDisabled} slot is no longer disabled.`, 'info');
                GS.playerDebuffs.slotDisabled = null;
                GS.playerDebuffs.slotDisabledTurns = 0;
            }
        }

        // ── RESET DICE FOR NEW TURN ──
        GS.dice.forEach(d => { d.rolled = false; d.value = 0; d.location = 'pool'; delete d.slotId; });
        GS.allocated = { attack: [], defend: [] };
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

        // ── ENEMY TURN COUNTER & ENRAGE ──
        GS.enemy.turn++;
        if (GS.challengeMode) {
            GS.challengeTurns++;
            const enrageEvery = GS.enemy.turn >= 6 ? 1 : 2;
            if (GS.enemy.turn > 0 && GS.enemy.turn % enrageEvery === 0) {
                GS.enemy.rage++;
                const newAtk = Math.floor(GS.enemy.baseAtk * Math.pow(1.2, GS.enemy.rage));
                const warning = GS.enemy.turn >= 6 ? ' (accelerating!)' : '';
                log(`🔥 The Guardian grows stronger! (ATK → ${newAtk})${warning}`, 'damage');
            }
        } else if ((GS.enemy.isBoss || GS.enemy.isElite) && GS.enemy.turn > 0 && GS.enemy.turn % 3 === 0) {
            GS.enemy.rage++;
            const newAtk = Math.floor(GS.enemy.baseAtk * Math.pow(1.2, GS.enemy.rage));
            log(`🔥 ${GS.enemy.name} grows enraged! (ATK → ${newAtk})`, 'damage');
        }

        // ── ENEMY PASSIVE/TURN EFFECTS ──
        const eName = GS.enemy.name;
        const baseEName = eName.replace(/^(💀 Deadly|🛡️ Armored|⚡ Swift|🔥 Enraged) /, '');
        const as = GS.enemy.abilityState;

        // Troll Regen
        if (baseEName === 'Troll') {
            const trollHeal = Math.min(3, GS.enemy.hp - GS.enemy.currentHp);
            if (trollHeal > 0) {
                GS.enemy.currentHp += trollHeal;
                log(`💚 Troll regenerates ${trollHeal} HP (${GS.enemy.currentHp}/${GS.enemy.hp})`, 'info');
            }
        }

        // Iron Golem Escalate: +2 ATK every 2 turns
        if (baseEName === 'Iron Golem' && GS.enemy.turn % 2 === 0) {
            GS.enemy.baseAtk += 2;
            GS.enemy.atk += 2;
            log(`⚙️ Iron Golem escalates! (+2 ATK, now ${Math.floor(GS.enemy.baseAtk * Math.pow(1.2, GS.enemy.rage))})`, 'damage');
        }

        // Orc Warrior War Cry wind-up
        if (baseEName === 'Orc Warrior' && GS.enemy.turn % 3 === 2) {
            as.warCryReady = true;
        }

        // Vampire Blood Frenzy trigger
        if (baseEName === 'Vampire' && !as.bloodFrenzyActive && GS.enemy.currentHp / GS.enemy.hp < 0.2) {
            as.bloodFrenzyActive = true;
            log(`🩸 Blood Frenzy! The Vampire attacks twice for the rest of the fight!`, 'damage');
        }

        // Lich Decay Aura: maintain dice reduction
        if (baseEName === 'Lich') {
            GS.playerDebuffs.diceReduction = 1;
        }

        // Void Lord phase transitions
        if (eName === 'The Void Lord') {
            const hpPct = GS.enemy.currentHp / GS.enemy.hp;
            if (as.phase < 3 && hpPct < 0.2) {
                as.phase = 3;
                log(`💀 The Void Lord is desperate! Attacks twice, takes +50% damage!`, 'damage');
            } else if (as.phase < 2 && hpPct < 0.5) {
                as.phase = 2;
                GS.enemy.baseAtk += 8;
                GS.enemy.atk += 8;
                GS.enemy.pattern = ['strike', 'voidrift', 'darkpulse', 'strike'];
                log(`🌀 The Void Lord enters Phase 2! ATK +8, Entropy begins...`, 'damage');
            }
        }

        // Crimson Wyrm Phase 2 trigger
        if (eName === 'Crimson Wyrm' && !as.phase2 && GS.enemy.currentHp / GS.enemy.hp < 0.5) {
            as.phase2 = true;
            GS.enemy.baseAtk += 5;
            GS.enemy.atk += 5;
            log(`🔥 The Wyrm erupts in flame! ATK +5, all attacks now burn!`, 'damage');
        }

        // Update intent for upcoming turn
        const rageAtk = Math.floor(GS.enemy.baseAtk * Math.pow(1.2, GS.enemy.rage));
        GS.enemy.intent = rageAtk;
        Combat.updateIntent();

        Combat.renderEnemy();
        renderCombatDice();
        setTimeout(() => Combat.roll(), 300);
    },

    enemyDefeated() {
        GS.enemiesKilled++;
        const g = gainGold(GS.enemy.gold);
        log(`${GS.enemy.name} defeated! +${g} gold`, 'info');

        // Parasite: gain +1 max HP and +1 gold/combat per kill
        if (GS.artifacts.some(a => a.effect === 'parasite')) {
            GS.maxHp++;
            GS.hp = Math.min(GS.hp + 1, GS.maxHp);
            GS.parasiteGoldPerCombat += GS.artifacts.filter(a => a.effect === 'parasite').length;
            log(`🦠 Parasite: +1 max HP (${GS.maxHp}), gold/combat now +${GS.parasiteGoldPerCombat}`, 'info');
        }

        const taxGold = GS.artifacts.filter(a => a.effect === 'goldPerKill').reduce((s, a) => s + a.value, 0);
        if (taxGold > 0) {
            const tg = gainGold(taxGold);
            log(`💰 Tax Collector: +${tg} gold`, 'info');
        }
        if (GS.passives.goldPerCombat) {
            const pg = gainGold(GS.passives.goldPerCombat);
            log(`💰 Prospector: +${pg} gold`, 'info');
        }
        if (GS.passives.goldInterest) {
            const interest = Math.floor(GS.gold * GS.passives.goldInterest);
            if (interest > 0) {
                const ig = gainGold(interest);
                log(`💰 Interest: +${ig} gold (${Math.round(GS.passives.goldInterest * 100)}%)`, 'info');
            }
        }
        gainXP(Math.floor(GS.enemy.hp * 2.5));
        updateStats();

        // Clear player debuffs at end of combat
        GS.playerDebuffs = { poison: 0, poisonTurns: 0, slotDisabled: null, slotDisabledTurns: 0, diceReduction: 0 };

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
                log(`Merchant's Escort: +${eg} gold!`, 'info');
            }
        }

        if (GS.enemy.isBoss && GS.floor >= 15) {
            setTimeout(() => window.Game.victory(), 1200);
            return;
        }

        setTimeout(() => {
            if (GS.pendingSlotChoice) {
                window.Rewards.slotChoice(() => {
                    if (GS.enemy.isElite) window.Rewards.artifactChoice();
                    else if (GS.enemy.isBoss) window.Rewards.artifactChoice(true);
                    else window.Rewards.show();
                });
            } else if (GS.enemy.isElite) {
                window.Rewards.artifactChoice();
            } else if (GS.enemy.isBoss) {
                window.Rewards.artifactChoice(true);
            } else {
                window.Rewards.show();
            }
        }, 1200);
    }
};
