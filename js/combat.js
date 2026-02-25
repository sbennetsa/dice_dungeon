// ════════════════════════════════════════════════════════════
//  COMBAT
// ════════════════════════════════════════════════════════════
import { BOSSES, ENEMIES, ELITES } from './constants.js';
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
            const pool = ENEMIES[GS.act] || ENEMIES[1];
            template = { ...pick(pool) };
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
            turn: 0,
            rage: 0,
            poison: 0,
        };

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

        updateStats();
        setupDropZones();
        Combat.renderEnemy();
        renderCombatDice();

        const label = isBoss ? '👑 BOSS' : isElite ? '⚡ ELITE' : `Floor ${GS.floor}`;
        log(`${label}: ${GS.enemy.name} appears!`, 'info');
        log(`HP: ${GS.enemy.hp} | ATK: ${GS.enemy.atk}`, 'info');

        show('screen-combat');
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

        if (GS.challengeMode) {
            const dpt = GS.challengeTurns > 0 ? Math.round(GS.challengeDmg / GS.challengeTurns) : 0;
            $('enemy-panel').innerHTML = `
                <div class="${nameCls}">${e.name}${statusIndicators}</div>
                <div class="enemy-subtitle">💀 CHALLENGE — Survive and deal maximum damage</div>
                <div style="text-align:center; margin:8px 0;">
                    <span style="font-size:1.4em; color:var(--gold); font-family:JetBrains Mono,monospace;">💥 ${GS.challengeDmg.toLocaleString()}</span>
                    <span style="font-size:0.8em; color:var(--text-dim); margin-left:8px;">(${dpt}/turn)</span>
                </div>
                <div class="enemy-intent">Intent: Attack for <strong>${e.intent}</strong> damage${e.rage > 0 ? ' (enraged)' : ''}</div>
            `;
        } else {
            const pct = Math.max(0, (e.currentHp / e.hp) * 100);
            $('enemy-panel').innerHTML = `
                <div class="${nameCls}">${e.name}${statusIndicators}</div>
                <div class="enemy-subtitle">${e.isBoss ? '👑 BOSS' : e.isElite ? '⚡ ELITE' : 'Enemy'} — Floor ${GS.floor}, Act ${GS.act}</div>
                <div class="enemy-hp-bar"><div class="enemy-hp-fill" style="width:${pct}%"></div></div>
                <div class="enemy-hp-text">${e.currentHp} / ${e.hp}</div>
                <div class="enemy-intent">Intent: Attack for <strong>${e.intent}</strong> damage${e.rage > 0 ? ' (enraged)' : ''}</div>
            `;
        }
    },

    roll() {
        GS.dice.forEach(d => {
            if (!d.rolled) rollSingleDie(d);
        });
        GS.rolled = true;

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
        const totalAtk = Math.floor(totalAtkBase * runeAtkMult) + runeAtkBonus;

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

        // ── PLAYER ATTACKS ──
        GS.enemy.currentHp -= totalAtk;
        if (GS.challengeMode) GS.challengeDmg += totalAtk;
        log(`You deal ${totalAtk} damage!`, 'damage');

        const serpentPoison = GS.artifacts.filter(a => a.effect === 'poisonOnHit').reduce((s, a) => s + a.value, 0);
        if (serpentPoison > 0 && totalAtk > 0) poisonToApply += Math.floor(totalAtk * serpentPoison);
        if (GS.passives.poisonOnAtk) poisonToApply += GS.passives.poisonOnAtk;
        if (GS.passives.plagueLord) poisonToApply += 2;
        if (poisonToApply > 0) {
            GS.enemy.poison += poisonToApply;
            log(`☠️ Applied ${poisonToApply} poison! (${GS.enemy.poison} stacks)`, 'info');
        }

        let lsPercent = GS.autoLifesteal || 0;
        lsPercent += GS.artifacts.filter(a => a.effect === 'permLifesteal').reduce((s, a) => s + a.value, 0);
        if (lsPercent > 0 && totalAtk > 0) {
            const lsHeal = heal(Math.floor(totalAtk * lsPercent));
            if (lsHeal > 0) log(`🩸 Lifesteal: +${lsHeal} HP`, 'heal');
        }

        Combat.renderEnemy();
        updateStats();

        if (GS.enemy.currentHp <= 0) {
            Combat.enemyDefeated();
            return;
        }

        // ── POISON TICK ──
        if (GS.enemy.poison > 0) {
            let poisonDmg = GS.enemy.poison;
            const poisonMult = GS.artifacts.filter(a => a.effect === 'poisonDouble').reduce((s, a) => s + a.value, 0);
            if (poisonMult > 0) poisonDmg = Math.floor(poisonDmg * poisonMult);
            if (GS.passives.plagueLord) poisonDmg *= 2;
            GS.enemy.currentHp -= poisonDmg;
            if (GS.challengeMode) GS.challengeDmg += poisonDmg;
            GS.enemy.poison = Math.max(0, GS.enemy.poison - 1);
            log(`☠️ Poison deals ${poisonDmg} damage! (${GS.enemy.poison} stacks remain)`, 'damage');
            Combat.renderEnemy();

            if (GS.enemy.currentHp <= 0) {
                Combat.enemyDefeated();
                return;
            }
        }

        // ── ENEMY ATTACKS ──
        const enemyDamage = GS.enemy.intent;
        const mitigated = Math.max(0, enemyDamage - totalDef);
        const blocked = enemyDamage - mitigated;

        GS.hp -= mitigated;
        if (blocked > 0) {
            log(`${GS.enemy.name} attacks for ${enemyDamage} — you block ${blocked}, take ${mitigated} damage`, 'defend');
        } else {
            log(`${GS.enemy.name} attacks for ${enemyDamage} damage!`, 'damage');
        }

        if (mitigated > 0) {
            const thornsDmg = GS.runes.defend.filter(r => r.effect === 'thorns').reduce((s, r) => s + r.value, 0);
            if (thornsDmg > 0) {
                GS.enemy.currentHp -= thornsDmg;
                if (GS.challengeMode) GS.challengeDmg += thornsDmg;
                log(`🌿 Thorns: reflect ${thornsDmg} damage!`, 'damage');
                Combat.renderEnemy();
            }
        }

        updateStats();

        if (GS.hp <= 0) {
            GS.hp = 0;
            updateStats();
            if (GS.challengeMode) {
                setTimeout(() => window.Game.challengeResult(), 1000);
            } else {
                setTimeout(() => window.Game.defeat(), 1000);
            }
            return;
        }

        if (GS.enemy.currentHp <= 0) {
            Combat.enemyDefeated();
            return;
        }

        Combat.newTurn();
    },

    newTurn() {
        GS.dice.forEach(d => { d.rolled = false; d.value = 0; d.location = 'pool'; });
        GS.allocated = { attack: [], defend: [] };
        GS.rolled = false;
        GS.autoLifesteal = 0;
        GS.rerollsLeft = GS.rerolls;
        GS.rerollsLeft += GS.artifacts.filter(a => a.effect === 'bonusReroll').reduce((s, a) => s + a.value, 0);

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

        const rageAtk = GS.enemy.baseAtk + GS.enemy.rage;
        if (GS.enemy.isBoss) {
            const variation = Math.random() < 0.3 ? 1.5 : 1.0;
            GS.enemy.intent = Math.floor(rageAtk * variation);
        } else {
            GS.enemy.intent = rageAtk;
        }

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
