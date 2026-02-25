// ════════════════════════════════════════════════════════════
//  COMBAT
// ════════════════════════════════════════════════════════════
import { BOSSES, ENEMIES, ELITES, pickEnemy } from './constants.js';
import { GS, $, log, gainXP, gainGold, heal, pick } from './state.js';
import { rollSingleDie, getActiveFace, renderCombatDice, updateStats, setupDropZones, show } from './engine.js';

// window.Game and window.Rewards are set by screens.js at load time
// to avoid circular module dependencies

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

        GS.dice.forEach(d => { d.rolled = false; d.value = 0; d.location = 'pool'; });
        GS.allocated = { attack: [], defend: [] };
        GS.rolled = false;
        GS.autoLifesteal = 0;
        GS.regenStacks = 0;
        GS.rerollsLeft = GS.rerolls;
        GS.rerollsLeft += GS.artifacts.filter(a => a.effect === 'bonusReroll').reduce((s, a) => s + a.value, 0);

        const combatHeal = GS.artifacts.filter(a => a.effect === 'combatHeal').reduce((s, a) => s + a.value, 0);
        if (combatHeal > 0) {
            const h = heal(combatHeal);
            if (h > 0) log(`🔥 Phoenix Heart: +${h} HP`, 'heal');
        }

        const gildedArtifact = GS.artifacts.find(a => a.effect === 'goldToDmg');
        if (gildedArtifact && GS.gold >= 50) {
            GS.gold -= 50;
            GS.enemy.currentHp -= 15;
            if (GS.challengeMode) GS.challengeDmg += 15;
            log(`✨ Gilded Gauntlet: Spent 50 gold, dealt 15 damage!`, 'damage');
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
            GS.dice.forEach(d => {
                if (d.rolled) d.value = Math.max(1, d.value - GS.playerDebuffs.diceReduction);
            });
        }

        GS.dice.forEach(d => {
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

    execute() {
        if ($('btn-execute')) $('btn-execute').style.display = 'none';
        if ($('btn-return-all')) $('btn-return-all').style.display = 'none';

        const eName = GS.enemy.name;
        const as = GS.enemy.abilityState;

        // ── MIMIC SURPRISE (turn 0 only) ──
        if ((eName === 'Mimic' || eName.includes('Mimic')) && GS.isFirstTurn && !as.surpriseDone) {
            as.surpriseDone = true;
            const stolen = Math.min(15, GS.gold);
            GS.gold -= stolen;
            const surpriseDmg = GS.enemy.intent;
            GS.hp = Math.max(0, GS.hp - surpriseDmg);
            log(`💰 The Mimic strikes first! Takes ${surpriseDmg} unblocked damage. -${stolen} gold stolen!`, 'damage');
            updateStats();
            if (GS.hp <= 0) {
                GS.hp = 0;
                updateStats();
                setTimeout(() => window.Game.defeat(), 1000);
                return;
            }
            Combat.newTurn();
            return;
        }

        // ── SHADOW ASSASSIN EVASION: negate one random attack die ──
        if (eName === 'Shadow Assassin' || eName.includes('Shadow Assassin')) {
            if (GS.allocated.attack.length > 0) {
                const dodgeDie = GS.allocated.attack[Math.floor(Math.random() * GS.allocated.attack.length)];
                const dodgedVal = dodgeDie.value;
                dodgeDie.value = 0;
                log(`💨 Shadow Assassin dodges — negates ${dodgedVal} from one die!`, 'info');
            }
        }

        const atkCount = GS.allocated.attack.length;
        const defCount = GS.allocated.defend.length;

        // ── ATTACK CALCULATION ──
        let atkBase = 0, atkMult = 1, atkBonus = 0;
        let poisonToApply = 0;

        GS.allocated.attack.forEach(d => {
            const face = getActiveFace(d);
            const m = face && !face.modifier.autoFire ? face.modifier : null;

            if (m) {
                if (m.effect === 'lucky') { GS.rerollsLeft += m.value; log(`🎰 Lucky! +${m.value} reroll`, 'info'); }
                if (m.effect === 'poison') { poisonToApply += m.value; }
                if (m.effect === 'midasGold') { const mg = gainGold(d.value); log(`👑 Midas: +${mg} gold`, 'info'); }

                if (m.effect === 'slotMultiply') { atkMult *= m.value; atkBase += d.value; }
                else if (m.effect === 'slotAdd') { atkBonus += m.value * atkCount; }
                else if (m.effect === 'packTactics') { atkBonus += m.value * atkCount; atkBase += d.value; }
                else if (m.effect === 'volley') { if (atkCount >= 3) atkBonus += m.value; atkBase += d.value; }
                else if (m.effect === 'threshold') { atkBase += d.value >= m.value ? d.value * 2 : d.value; }
                else if (m.effect === 'defAdd') { atkBase += d.value; }
                else if (m.effect === 'poison') { atkBase += d.value; }
                else { atkBase += d.value; }
            } else {
                atkBase += d.value;
            }
        });

        atkBonus += GS.buffs.damageBoost;
        atkBonus += GS.artifacts.filter(a => a.effect === 'flatAtk').reduce((s, a) => s + a.value, 0);
        const goldScale = GS.artifacts.filter(a => a.effect === 'goldScaleDmg').reduce((s, a) => s + Math.floor(GS.gold / a.value), 0);
        if (goldScale > 0) atkBonus += goldScale;
        if (GS.passives.goldDmg) atkBonus += Math.floor(GS.gold / GS.passives.goldDmg);
        atkBonus += GS.artifacts.filter(a => a.effect === 'dmgPerDie').reduce((s, a) => s + a.value, 0) * GS.dice.length;
        atkBonus += GS.artifacts.filter(a => a.effect === 'giantDmg').reduce((s, a) => s + a.value, 0) * GS.dice.filter(d => d.max >= 10).length;
        if (atkCount >= 4) atkBonus += GS.artifacts.filter(a => a.effect === 'swarmAtk').reduce((s, a) => s + a.value, 0);
        if (atkCount === 1) atkMult *= GS.artifacts.some(a => a.effect === 'executioner') ? 2 : 1;
        if (GS.passives.packTactics) atkBonus += GS.passives.packTactics * atkCount;
        if (GS.passives.swarmMaster) atkBonus += GS.passives.swarmMaster * atkCount;
        if (GS.passives.volley && atkCount >= 3) atkBonus += GS.passives.volley;
        if (GS.passives.threshold) {
            GS.allocated.attack.forEach(d => { if (d.value >= 8) atkBonus += Math.floor(d.value * 0.5); });
        }
        if (GS.passives.titanWrath && atkCount === 1) atkMult *= 3;
        const rerollsUsed = GS.rerolls - GS.rerollsLeft;
        if (rerollsUsed > 0) {
            let rerollDmg = GS.artifacts.filter(a => a.effect === 'rerollDmg').reduce((s, a) => s + a.value, 0) * rerollsUsed;
            if (GS.passives.rerollDmg) rerollDmg += GS.passives.rerollDmg * rerollsUsed;
            if (rerollDmg > 0) { atkBonus += rerollDmg; log(`🪙 Reroll damage: +${rerollDmg} (${rerollsUsed} rerolls)`, 'info'); }
        }

        if (GS.isFirstTurn) {
            const firstStrike = GS.artifacts.filter(a => a.effect === 'firstStrike').reduce((s, a) => s + a.value, 0);
            if (firstStrike > 0) {
                atkBonus += firstStrike;
                log(`🥁 War Drum: +${firstStrike} first strike damage!`, 'info');
            }
            GS.isFirstTurn = false;
        }

        const totalAtkBase = Math.floor(atkBase * atkMult) + atkBonus;

        let runeAtkMult = 1, runeAtkBonus = 0;
        GS.runes.attack.forEach(r => {
            if (r.effect === 'furyPerDie') runeAtkBonus += r.value * atkCount;
            if (r.effect === 'atkMultRune') runeAtkMult *= r.value;
            if (r.effect === 'amplifier') runeAtkMult *= r.value;
            if (r.effect === 'titanBlow' && atkCount === 1) runeAtkMult *= r.value;
            if (r.effect === 'poisonPerTurn') poisonToApply += r.value;
        });
        let totalAtk = Math.floor(totalAtkBase * runeAtkMult) + runeAtkBonus;

        // ── DEFEND CALCULATION ──
        let defBase = 0, defMult = 1, defBonus = 0;

        GS.allocated.defend.forEach(d => {
            const face = getActiveFace(d);
            const m = face && !face.modifier.autoFire ? face.modifier : null;

            if (m) {
                if (m.effect === 'lucky') { GS.rerollsLeft += m.value; log(`🎰 Lucky! +${m.value} reroll`, 'info'); }
                if (m.effect === 'poison') { poisonToApply += m.value; }
                if (m.effect === 'midasGold') { const mg = gainGold(d.value); log(`👑 Midas: +${mg} gold`, 'info'); }

                if (m.effect === 'slotMultiply') { defMult *= m.value; defBase += d.value; }
                else if (m.effect === 'slotAdd') { defBonus += m.value * defCount; }
                else if (m.effect === 'packTactics') { defBonus += m.value * defCount; defBase += d.value; }
                else if (m.effect === 'volley') { if (defCount >= 3) defBonus += m.value; defBase += d.value; }
                else if (m.effect === 'threshold') { defBase += d.value >= m.value ? d.value * 2 : d.value; }
                else if (m.effect === 'defAdd') { defBonus += m.value; defBase += d.value; }
                else if (m.effect === 'poison') { defBase += d.value; }
                else { defBase += d.value; }
            } else {
                defBase += d.value;
            }
        });

        defBonus += GS.buffs.armor;
        defBonus += GS.artifacts.filter(a => a.effect === 'permArmor').reduce((s, a) => s + a.value, 0);
        if (defCount >= 3) defBonus += GS.artifacts.filter(a => a.effect === 'swarmDef').reduce((s, a) => s + a.value, 0);
        if (GS.passives.swarmMaster) defBonus += GS.passives.swarmMaster * defCount;
        if (GS.passives.volley && defCount >= 3) defBonus += GS.passives.volley;
        if (GS.passives.threshold) {
            GS.allocated.defend.forEach(d => { if (d.value >= 8) defBonus += Math.floor(d.value * 0.5); });
        }
        if (GS.passives.titanWrath && defCount === 1) defMult *= 3;

        const totalDefBase = Math.floor(defBase * defMult) + defBonus;

        let runeDefMult = 1, runeDefBonus = 0;
        GS.runes.defend.forEach(r => {
            if (r.effect === 'flatBlock') runeDefBonus += r.value;
            if (r.effect === 'amplifier') runeDefMult *= r.value;
            if (r.effect === 'titanBlow' && defCount === 1) runeDefMult *= r.value;
        });
        const totalDef = Math.floor(totalDefBase * runeDefMult) + runeDefBonus;

        // ── ENEMY ABILITY MODIFIERS ON PLAYER ATTACK ──
        let finalAtk = totalAtk;
        const baseEName = eName.replace(/^(💀 Deadly|🛡️ Armored|⚡ Swift|🔥 Enraged) /, '');

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
            const bonuses = totalAtk - Math.floor(atkBase * runeAtkMult) - runeAtkBonus;
            const scaledBase = Math.max(0, Math.floor(atkBase * runeAtkMult) + runeAtkBonus - 8);
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

        // Apply poison from player
        const serpentPoison = GS.artifacts.filter(a => a.effect === 'poisonOnHit').reduce((s, a) => s + a.value, 0);
        if (serpentPoison > 0 && finalAtk > 0) poisonToApply += Math.floor(finalAtk * serpentPoison);
        if (GS.passives.poisonOnAtk) poisonToApply += GS.passives.poisonOnAtk;
        if (GS.passives.plagueLord) poisonToApply += 2;
        // tempBuff: poison coating
        if (GS.tempBuffs && GS.tempBuffs.poisonCombats > 0 && finalAtk > 0) poisonToApply += 1;
        if (poisonToApply > 0) {
            GS.enemy.poison += poisonToApply;
            log(`☠️ Applied ${poisonToApply} poison! (${GS.enemy.poison} stacks)`, 'info');
        }

        let lsPercent = GS.autoLifesteal || 0;
        lsPercent += GS.artifacts.filter(a => a.effect === 'permLifesteal').reduce((s, a) => s + a.value, 0);
        if (lsPercent > 0 && finalAtk > 0) {
            const lsHeal = heal(Math.floor(finalAtk * lsPercent));
            if (lsHeal > 0) log(`🩸 Lifesteal: +${lsHeal} HP`, 'heal');
        }

        // ── POST-ATTACK ABILITY CHECKS ──

        // Iron Golem Overcharge: stun if player dealt 25+ (before armor reduction, use totalAtk pre-armor for intent)
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
            Combat.enemyDefeated();
            return;
        }

        // ── POISON TICK ON ENEMY ──
        if (GS.enemy.poison > 0) {
            let poisonDmg = GS.enemy.poison;
            const poisonMult = GS.artifacts.filter(a => a.effect === 'poisonDouble').reduce((s, a) => s + a.value, 0);
            if (poisonMult > 0) poisonDmg = Math.floor(poisonDmg * poisonMult);
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

        // ── IRON GOLEM STUN: skip attack ──
        if (baseEName === 'Iron Golem' && as.stunned) {
            as.stunned = false;
            log(`⚡ The Golem is stunned and skips its attack!`, 'info');
            Combat.renderEnemy();
            Combat.newTurn();
            return;
        }

        // ── FUNGAL CREEP SPORE CLOUD: every 2nd player turn (turns 2, 4, 6...) ──
        const sporeOnThisTurn = baseEName === 'Fungal Creep' && GS.enemy.turn > 0 && GS.enemy.turn % 2 === 0;
        if (sporeOnThisTurn) {
            GS.playerDebuffs.poison = Math.max(GS.playerDebuffs.poison, 2);
            GS.playerDebuffs.poisonTurns = Math.max(GS.playerDebuffs.poisonTurns, 3);
            log(`🟢 Fungal Creep releases spores! (2 poison/turn for 3 turns)`, 'damage');
            Combat.renderEnemy();
            Combat.newTurn();
            return;
        }

        // ── DRAGON WHELP BREATH CHARGE: every 4 turns, turn 3 = charge ──
        if (baseEName === 'Dragon Whelp' && GS.enemy.turn % 4 === 3) {
            as.breathCharging = true;
            log(`🔥 Dragon Whelp inhales deeply...`, 'info');
            Combat.renderEnemy();
            Combat.newTurn();
            return;
        }

        // ── ENEMY ATTACKS PLAYER ──
        let enemyDmg = GS.enemy.intent;
        let attackTimes = 1;

        // Dark Mage: apply Curse first
        if (baseEName === 'Dark Mage' && GS.enemy.turn > 0 && GS.enemy.turn % 3 === 0) {
            const atkDice = GS.allocated.attack.length;
            const defDice = GS.allocated.defend.length;
            const targetSlot = atkDice >= defDice ? 'attack' : 'defend';
            GS.playerDebuffs.slotDisabled = targetSlot;
            GS.playerDebuffs.slotDisabledTurns = 2;
            GS.dice.filter(d => d.location === targetSlot).forEach(d => { d.location = 'pool'; });
            GS.allocated[targetSlot] = [];
            log(`🟣 Dark Mage casts Curse! Your ${targetSlot} slot is disabled for 2 turns!`, 'damage');
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
        if (eName === 'The Bone King') {
            const action = as.pattern[as.patternIdx % 4];
            as.patternIdx++;
            if (action === 'bonewall') {
                as.boneWallShield += 15;
                log(`🦴 Bone Wall! The Bone King gains 15 shield!`, 'info');
                Combat.renderEnemy();
                Combat.newTurn();
                return;
            } else if (action === 'raisedead') {
                GS.enemy.baseAtk += 3;
                GS.enemy.atk += 3;
                log(`💀 Raise Dead! Bone King ATK permanently +3 (now ${GS.enemy.baseAtk + GS.enemy.rage})!`, 'damage');
                Combat.renderEnemy();
                Combat.newTurn();
                return;
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
                Combat.newTurn();
                return;
            } else if (action === 'wingbuffet') {
                const buffetDmg = 10;
                GS.playerDebuffs.slotDisabled = 'attack';
                GS.playerDebuffs.slotDisabledTurns = 1;
                GS.dice.filter(d => d.location === 'attack').forEach(d => { d.location = 'pool'; });
                GS.allocated.attack = [];
                GS.hp = Math.max(0, GS.hp - buffetDmg);
                log(`💨 Wing Buffet! ${buffetDmg} damage + attack slot disabled 1 turn!`, 'damage');
                updateStats();
                if (GS.hp <= 0) { setTimeout(() => window.Game.defeat(), 1000); return; }
                Combat.renderEnemy();
                Combat.newTurn();
                return;
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
                const targetSlot = Math.random() < 0.5 ? 'attack' : 'defend';
                GS.playerDebuffs.slotDisabled = targetSlot;
                GS.playerDebuffs.slotDisabledTurns = 2;
                GS.dice.filter(d => d.location === targetSlot).forEach(d => { d.location = 'pool'; });
                GS.allocated[targetSlot] = [];
                log(`🌀 Void Rift! Your ${targetSlot} slot is disabled for 2 turns!`, 'damage');
                Combat.renderEnemy();
                Combat.newTurn();
                return;
            } else if (action === 'darkpulse') {
                const pulseDmg = 15;
                GS.hp = Math.max(0, GS.hp - pulseDmg);
                log(`🌀 Dark Pulse! ${pulseDmg} unblockable damage!`, 'damage');
                updateStats();
                if (GS.hp <= 0) { setTimeout(() => window.Game.defeat(), 1000); return; }
                // Entropy in phase 2
                if (as.phase >= 2) Combat._applyEntropy();
                Combat.renderEnemy();
                Combat.newTurn();
                return;
            }
            // Phase 2 Entropy on regular strike turns
            if (as.phase >= 2) Combat._applyEntropy();
        }

        // Dark Mage Penetration: reduce effective block by 3
        let effectiveDef = totalDef;
        if (baseEName === 'Dark Mage') effectiveDef = Math.max(0, totalDef - 3);

        // ── DEAL DAMAGE TO PLAYER (once per attackTimes) ──
        for (let i = 0; i < attackTimes; i++) {
            const mitigated = Math.max(0, enemyDmg - effectiveDef);
            const blocked = enemyDmg - mitigated;

            GS.hp -= mitigated;

            if (blocked > 0) {
                log(`${GS.enemy.name} attacks for ${enemyDmg} — you block ${blocked}, take ${mitigated} damage`, 'defend');
            } else {
                log(`${GS.enemy.name} attacks for ${enemyDmg} damage!`, 'damage');
            }

            if (mitigated > 0) {
                const thornsDmg = GS.runes.defend.filter(r => r.effect === 'thorns').reduce((s, r) => s + r.value, 0);
                if (thornsDmg > 0) {
                    GS.enemy.currentHp -= thornsDmg;
                    if (GS.challengeMode) GS.challengeDmg += thornsDmg;
                    log(`🌿 Thorns: reflect ${thornsDmg} damage!`, 'damage');
                    Combat.renderEnemy();
                    if (GS.enemy.currentHp <= 0) { Combat.enemyDefeated(); return; }
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
            GS.hp = Math.max(0, GS.hp - 5);
            log(`🔥 Hellfire: 5 unblockable damage!`, 'damage');
            if (GS.hp <= 0) {
                GS.hp = 0;
                updateStats();
                setTimeout(() => window.Game.defeat(), 1000);
                return;
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
        const rageAtk = e.baseAtk + e.rage;

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
            const emptySlots = Math.max(0, GS.slots.attack - GS.allocated.attack.length);
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

        e.intent = rageAtk;
        e.intentText = text;
    },

    newTurn() {
        // ── PLAYER POISON TICK ──
        if (GS.playerDebuffs.poison > 0 && GS.playerDebuffs.poisonTurns > 0) {
            const dmg = GS.playerDebuffs.poison;
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
        GS.dice.forEach(d => { d.rolled = false; d.value = 0; d.location = 'pool'; });
        GS.allocated = { attack: [], defend: [] };
        GS.rolled = false;
        GS.autoLifesteal = 0;
        GS.rerollsLeft = GS.rerolls;
        GS.rerollsLeft += GS.artifacts.filter(a => a.effect === 'bonusReroll').reduce((s, a) => s + a.value, 0);

        // ── PLAYER REGEN ──
        let regenAmt = GS.runes.defend.filter(r => r.effect === 'regenPerTurn').reduce((s, r) => s + r.value, 0);
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

        // ── ENEMY TURN COUNTER & ENRAGE ──
        GS.enemy.turn++;
        if (GS.challengeMode) {
            GS.challengeTurns++;
            const enrageEvery = GS.enemy.turn >= 6 ? 1 : 2;
            if (GS.enemy.turn > 0 && GS.enemy.turn % enrageEvery === 0) {
                GS.enemy.rage++;
                const warning = GS.enemy.turn >= 6 ? ' (accelerating!)' : '';
                log(`🔥 The Guardian grows stronger! (+${GS.enemy.rage} ATK)${warning}`, 'damage');
            }
        } else if ((GS.enemy.isBoss || GS.enemy.isElite) && GS.enemy.turn > 0 && GS.enemy.turn % 3 === 0) {
            GS.enemy.rage++;
            log(`🔥 ${GS.enemy.name} grows enraged! (+${GS.enemy.rage} ATK)`, 'damage');
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
            log(`⚙️ Iron Golem escalates! (+2 ATK, now ${GS.enemy.baseAtk + GS.enemy.rage})`, 'damage');
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
        const rageAtk = GS.enemy.baseAtk + GS.enemy.rage;
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
