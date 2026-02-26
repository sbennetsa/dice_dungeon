// ════════════════════════════════════════════════════════════
//  SCREENS — Game, Rewards, Shop, Events, Rest, Inventory
//  Entry point: exposes all modules on window for onclick handlers
// ════════════════════════════════════════════════════════════
import { FACE_MODS, ARTIFACT_POOL, RUNES, SKILL_TREE, CONSUMABLES, getAct, getFloorType, getArtifactPool, pickConsumablesForMarket, pickWeightedConsumable } from './constants.js';
import { GS, $, rand, pick, shuffle, log, gainXP, gainGold, heal } from './state.js';
import { createDie, createDieFromFaces, upgradeDie, renderFaceStrip, renderDieCard, show, updateStats, resetDieIdCounter, renderCombatDice, renderConsumables } from './engine.js';
import { Combat } from './combat.js';
import { generateEncounter, applyEliteChoice, calculateAvgDamage, deepClone } from './encounters/encounterGenerator.js';
import { applyEliteModifier, calculateRewardMultipliers } from './encounters/eliteModifierSystem.js';

// ════════════════════════════════════════════════════════════
//  HELPERS
// ════════════════════════════════════════════════════════════
// Applies a die upgrade, doubling the effect if mastersHammer is active
function applyUpgrade(die) {
    upgradeDie(die);
    if (GS.tempBuffs && GS.tempBuffs.mastersHammer) upgradeDie(die);
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
    info.innerHTML = `<strong style="color:${rune.color};">${rune.icon} ${rune.name}</strong>: ${rune.desc}<br><span style="font-size:0.85em; opacity:0.7;">Best for: ${rune.slot === 'either' ? 'any slot' : rune.slot + ' slot'}</span>`;
    c.appendChild(info);

    const grid = document.createElement('div');
    grid.style.cssText = 'display:flex; flex-wrap:wrap; gap:10px; justify-content:center;';

    const allSlots = [
        ...GS.slots.attack.map((s, i) => ({ ...s, type: 'attack', label: `⚔️ Attack Slot ${i + 1}` })),
        ...GS.slots.defend.map((s, i) => ({ ...s, type: 'defend', label: `🛡️ Defend Slot ${i + 1}` })),
    ];

    allSlots.forEach(slotInfo => {
        const compatible = rune.slot === 'either' || rune.slot === slotInfo.type;
        const card = document.createElement('div');
        card.className = 'card';
        card.style.cssText = `width:160px; cursor:pointer;${!compatible ? ' opacity:0.6;' : ''}`;
        const existingRuneNote = slotInfo.rune ? `<div style="color:#ff8080; font-size:0.78em; margin-top:4px;">⚠️ Replaces ${slotInfo.rune.icon} ${slotInfo.rune.name}</div>` : '<div style="opacity:0.5; font-size:0.78em; margin-top:4px;">empty slot</div>';
        const compatNote = !compatible ? `<div style="color:#ff8080; font-size:0.78em; margin-top:4px;">⚠️ Not ideal for ${slotInfo.type}</div>` : '';
        card.innerHTML = `
            <div class="card-title">${slotInfo.label}</div>
            ${existingRuneNote}${compatNote}
        `;
        card.onclick = () => {
            const slot = GS.slots[slotInfo.type].find(s => s.id === slotInfo.id);
            if (slot) slot.rune = { ...rune };
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
                attack: [{ id: 'atk-0', rune: null }, { id: 'atk-1', rune: null }],
                defend: [{ id: 'def-0', rune: null }, { id: 'def-1', rune: null }],
            },
            pendingRunes: [],
            enemyStatus: { chill: 0, chillTurns: 0, freeze: 0, mark: 0, markTurns: 0, weaken: 0, burn: 0, burnTurns: 0, stun: 0, stunCooldown: false },
            echoStoneDieId: null,
            gamblerCoinBonus: 0,
            hourglassFreeFirstTurn: false,
            huntersMarkFired: false,
            parasiteGoldPerCombat: 0,
            passives: {}, unlockedNodes: [],
            rerolls: 0, rerollsLeft: 0,
            enemy: null, enemiesKilled: 0, totalGold: 0,
            artifacts: [], buffs: { damageBoost: 0, armor: 0 },
            allocated: { attack: [], defend: [] }, rolled: false,
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
        });
        Game.enterFloor();
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
        const t = $('go-title');
        t.textContent = '💀 Defeated';
        t.className = 'defeat';
        $('go-stats').innerHTML = [
            ['Floor Reached', GS.floor],
            ['Level', GS.level],
            ['Enemies Slain', GS.enemiesKilled],
            ['Gold Earned', GS.totalGold],
        ].map(([k,v]) => `<div class="final-stat-row"><span>${k}</span><span>${v}</span></div>`).join('');
        show('screen-gameover');
    },

    victory() {
        const t = $('go-title');
        t.textContent = '🏆 Victory!';
        t.className = 'victory';
        $('go-stats').innerHTML = [
            ['Floors Cleared', 15],
            ['Level', GS.level],
            ['Enemies Slain', GS.enemiesKilled],
            ['Gold Earned', GS.totalGold],
            ['Artifacts', GS.artifacts.map(a => a.icon).join(' ') || 'None'],
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
        challenge.onclick = () => Game.startChallengeBoss();
        btns.appendChild(challenge);

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

        rewards.push({ title: '⭐ Skill Point', desc: 'Unlock a node on the passive tree', action: () => {
            GS.challengePrep--;
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

        const totalSlots = GS.slots.attack.length + GS.slots.defend.length;
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
                const canUp = die.max < 12;
                const nextMin = canUp ? die.min + (hammer ? 2 : 1) : die.min;
                const nextMax = canUp ? die.max + (hammer ? 2 : 1) : die.max;
                const card = document.createElement('div');
                card.className = 'card' + (canUp ? '' : ' disabled');
                card.innerHTML = `<div class="card-title">${die.min}-${die.max} → ${canUp ? `${nextMin}-${nextMax}` : 'MAX'}</div>`;
                if (canUp) card.onclick = () => {
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

        GS.enemy = {
            name: '💀 The Eternal Guardian',
            hp: 999999,
            currentHp: 999999,
            baseAtk: 8 + GS.level * 2,
            intent: 8 + GS.level * 2,
            gold: 0,
            turn: 0,
            rage: 0,
            poison: 0,
            isElite: false,
            isBoss: true,
        };

        GS.dice.forEach(d => { d.rolled = false; d.value = 0; d.location = 'pool'; });
        GS.allocated = { attack: [], defend: [] };
        GS.rolled = false;
        GS.rerollsLeft = GS.rerolls;
        GS.autoLifesteal = 0;

        Combat.renderEnemy();
        renderCombatDice();
        updateStats();
        show('screen-combat');
        log('💀 The Eternal Guardian awakens. It cannot be killed — deal as much damage as you can!', 'damage');
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
//  REWARDS
// ════════════════════════════════════════════════════════════
const Rewards = {
    slotChoice(callback) {
        GS.pendingSkillPoints = Math.max(0, (GS.pendingSkillPoints || 0) - 1);
        updateStats();
        $('reward-title').textContent = `⭐ Level ${GS.level} — Skill Tree`;
        const c = $('reward-cards');
        c.innerHTML = '';

        const BC = {
            w: { main: '#5fa84f', glow: '#7cdf68', dim: '#3a6830' },
            g: { main: '#d4a534', glow: '#ffe070', dim: '#8a6a1e' },
            t: { main: '#d48830', glow: '#ffaa44', dim: '#7a4e1c' },
            v: { main: '#9050c0', glow: '#bb77ff', dim: '#5a3078' },
            root: { main: '#d4a534', glow: '#ffe070', dim: '#8a6a1e' },
            bridge: { main: '#5588bb', glow: '#77bbee', dim: '#3a5a7a' },
        };
        const getBC = (id) => {
            if (id === 'root') return BC.root;
            if (id.startsWith('w')) return BC.w;
            if (id.startsWith('g')) return BC.g;
            if (id.startsWith('t')) return BC.t;
            if (id.startsWith('v')) return BC.v;
            return BC.bridge;
        };

        const wrapper = document.createElement('div');
        wrapper.style.cssText = `
            position:relative; border-radius:8px; overflow:hidden; padding:8px 4px 4px;
            background: radial-gradient(ellipse at 50% 30%, #1a1a2e 0%, #0d0d15 60%, #050508 100%);
            border: 1px solid rgba(212,165,52,0.15);
        `;

        const vig = document.createElement('div');
        vig.style.cssText = `position:absolute; inset:0; pointer-events:none; z-index:0;
            background: radial-gradient(ellipse at center, transparent 40%, rgba(0,0,0,0.6) 100%);`;
        wrapper.appendChild(vig);

        const detailPanel = document.createElement('div');
        detailPanel.style.cssText = `
            position:relative; z-index:2; margin:0 8px 8px;
            background:rgba(0,0,0,0.5); border:1px solid rgba(255,255,255,0.08); border-radius:6px;
            padding:8px 12px; min-height:42px; font-family:EB Garamond, serif;
            display:flex; align-items:center; gap:10px; font-size:0.95em;
        `;
        detailPanel.innerHTML = '<span style="color:rgba(255,255,255,0.35); font-size:0.85em;">Hover a node for details · Click a glowing node to unlock</span>';
        wrapper.appendChild(detailPanel);

        const W = 420, H = 320;
        const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
        svg.style.cssText = `position:relative; z-index:1; width:100%; max-width:600px; display:block; margin:0 auto;`;

        const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
        ['w','g','t','v','root','bridge'].forEach(key => {
            const filter = document.createElementNS('http://www.w3.org/2000/svg', 'filter');
            filter.setAttribute('id', `glow-${key}`);
            filter.setAttribute('x', '-50%'); filter.setAttribute('y', '-50%');
            filter.setAttribute('width', '200%'); filter.setAttribute('height', '200%');
            const blur = document.createElementNS('http://www.w3.org/2000/svg', 'feGaussianBlur');
            blur.setAttribute('in', 'SourceGraphic'); blur.setAttribute('stdDeviation', '3');
            filter.appendChild(blur);
            defs.appendChild(filter);
        });
        svg.appendChild(defs);

        const colX = [35, 90, 155, 210, 265, 330, 385];
        const rowY = [28, 78, 128, 178, 228, 278];
        const getPos = (row, col) => ({ x: colX[col], y: rowY[row] });
        const sizeFor = (node) => node.icon === '👑' ? 19 : (node.id.length <= 2 && node.id !== 'root' ? 13 : node.id === 'root' ? 16 : 12);

        SKILL_TREE.forEach(node => {
            const to = getPos(node.row, node.col);
            const bc = getBC(node.id);
            node.requires.forEach(reqId => {
                const req = SKILL_TREE.find(n => n.id === reqId);
                if (!req) return;
                const from = getPos(req.row, req.col);
                const bothUnlocked = GS.unlockedNodes.includes(node.id) && GS.unlockedNodes.includes(reqId);
                const oneUnlocked = GS.unlockedNodes.includes(reqId);
                const glowKey = node.id === 'root' ? 'root' : node.id[0] === 'w' ? 'w' : node.id[0] === 'g' ? 'g' : node.id[0] === 't' ? 't' : node.id[0] === 'v' ? 'v' : 'bridge';

                if (bothUnlocked) {
                    const gLine = document.createElementNS('http://www.w3.org/2000/svg', 'line');
                    gLine.setAttribute('x1', from.x); gLine.setAttribute('y1', from.y);
                    gLine.setAttribute('x2', to.x); gLine.setAttribute('y2', to.y);
                    gLine.setAttribute('stroke', bc.glow); gLine.setAttribute('stroke-width', '4');
                    gLine.setAttribute('opacity', '0.3');
                    gLine.setAttribute('filter', `url(#glow-${glowKey})`);
                    svg.appendChild(gLine);
                }

                const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
                line.setAttribute('x1', from.x); line.setAttribute('y1', from.y);
                line.setAttribute('x2', to.x); line.setAttribute('y2', to.y);
                line.setAttribute('stroke', bothUnlocked ? bc.main : oneUnlocked ? bc.dim : 'rgba(255,255,255,0.06)');
                line.setAttribute('stroke-width', bothUnlocked ? '2' : '1');
                if (!bothUnlocked && !oneUnlocked) line.setAttribute('stroke-dasharray', '3,3');
                svg.appendChild(line);
            });
        });

        SKILL_TREE.forEach(node => {
            const pos = getPos(node.row, node.col);
            const bc = getBC(node.id);
            const size = sizeFor(node);
            const isUnlocked = GS.unlockedNodes.includes(node.id);
            const meetsReqs = node.requires.length === 0 ||
                (node.requiresAny
                    ? node.requires.some(r => GS.unlockedNodes.includes(r))
                    : node.requires.every(r => GS.unlockedNodes.includes(r)));
            const isAvailable = !isUnlocked && meetsReqs;
            const isCapstone = node.icon === '👑';
            const glowKey = node.id === 'root' ? 'root' : node.id[0] === 'w' ? 'w' : node.id[0] === 'g' ? 'g' : node.id[0] === 't' ? 't' : node.id[0] === 'v' ? 'v' : 'bridge';

            const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
            g.style.cursor = isAvailable ? 'pointer' : 'default';

            if (isUnlocked || isAvailable) {
                const glowCirc = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
                glowCirc.setAttribute('cx', pos.x); glowCirc.setAttribute('cy', pos.y);
                glowCirc.setAttribute('r', size + 4);
                glowCirc.setAttribute('fill', isUnlocked ? bc.glow : bc.main);
                glowCirc.setAttribute('opacity', isUnlocked ? '0.15' : '0.08');
                glowCirc.setAttribute('filter', `url(#glow-${glowKey})`);
                g.appendChild(glowCirc);
                if (isAvailable) {
                    const anim = document.createElementNS('http://www.w3.org/2000/svg', 'animate');
                    anim.setAttribute('attributeName', 'opacity');
                    anim.setAttribute('values', '0.08;0.2;0.08');
                    anim.setAttribute('dur', '2s'); anim.setAttribute('repeatCount', 'indefinite');
                    glowCirc.appendChild(anim);
                }
            }

            const diamond = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
            const dSize = size * 1.45;
            diamond.setAttribute('x', pos.x - dSize/2); diamond.setAttribute('y', pos.y - dSize/2);
            diamond.setAttribute('width', dSize); diamond.setAttribute('height', dSize);
            diamond.setAttribute('rx', isCapstone ? 3 : 1.5);
            diamond.setAttribute('transform', `rotate(45 ${pos.x} ${pos.y})`);
            diamond.setAttribute('fill', isUnlocked ? bc.main + '40' : isAvailable ? bc.main + '20' : 'rgba(10,10,20,0.7)');
            diamond.setAttribute('stroke', isUnlocked ? bc.main : isAvailable ? bc.main + '99' : 'rgba(255,255,255,0.08)');
            diamond.setAttribute('stroke-width', isCapstone ? '1.5' : '1');
            g.appendChild(diamond);

            const txt = document.createElementNS('http://www.w3.org/2000/svg', 'text');
            txt.setAttribute('x', pos.x); txt.setAttribute('y', pos.y + 1);
            txt.setAttribute('text-anchor', 'middle'); txt.setAttribute('dominant-baseline', 'central');
            txt.setAttribute('font-size', isCapstone ? '14' : '11');
            txt.setAttribute('opacity', isUnlocked || isAvailable ? '1' : '0.25');
            txt.textContent = node.icon;
            g.appendChild(txt);

            const label = document.createElementNS('http://www.w3.org/2000/svg', 'text');
            label.setAttribute('x', pos.x); label.setAttribute('y', pos.y + size + 10);
            label.setAttribute('text-anchor', 'middle'); label.setAttribute('font-size', '7');
            label.setAttribute('font-family', 'JetBrains Mono, monospace');
            label.setAttribute('fill', isUnlocked ? bc.main : isAvailable ? bc.dim : 'rgba(255,255,255,0.12)');
            label.textContent = node.name;
            g.appendChild(label);

            const showDetail = () => {
                const statusText = isUnlocked ? `<span style="color:${bc.main};">✓ UNLOCKED</span>` :
                    isAvailable ? `<span style="color:#80ff80;">⬆ AVAILABLE</span>` :
                    `<span style="opacity:0.4;">🔒 Locked</span>`;
                detailPanel.innerHTML = `
                    <div style="font-size:1.5em; width:32px; text-align:center;">${node.icon}</div>
                    <div style="flex:1;">
                        <div style="color:${bc.main}; font-weight:bold; font-size:0.95em;">${node.name} ${statusText}</div>
                        <div style="color:rgba(255,255,255,0.55); font-size:0.8em; margin-top:1px;">${node.desc}</div>
                    </div>
                `;
            };

            const hitbox = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
            hitbox.setAttribute('cx', pos.x); hitbox.setAttribute('cy', pos.y);
            hitbox.setAttribute('r', size + 6); hitbox.setAttribute('fill', 'transparent');
            hitbox.setAttribute('style', 'cursor:' + (isAvailable ? 'pointer' : 'default'));
            g.appendChild(hitbox);

            hitbox.addEventListener('mouseenter', () => {
                showDetail();
                if (isAvailable) {
                    diamond.setAttribute('stroke-width', isCapstone ? '2.5' : '2');
                    diamond.setAttribute('fill', bc.main + '35');
                }
            });
            hitbox.addEventListener('mouseleave', () => {
                if (isAvailable) {
                    diamond.setAttribute('stroke-width', isCapstone ? '1.5' : '1');
                    diamond.setAttribute('fill', bc.main + '20');
                }
            });

            if (isAvailable) {
                hitbox.addEventListener('click', () => {
                    GS.unlockedNodes.push(node.id);
                    node.effect(GS);
                    log(`🌟 ${node.name}: ${node.desc}`, 'info');
                    updateStats();
                    if (GS.pendingRunes && GS.pendingRunes.length > 0) {
                        const rune = GS.pendingRunes.shift();
                        showRuneAttachment(rune, callback);
                    } else {
                        callback();
                    }
                });
            }

            let tapped = false;
            hitbox.addEventListener('touchstart', (e) => {
                e.preventDefault();
                showDetail();
                if (isAvailable && tapped) {
                    GS.unlockedNodes.push(node.id);
                    node.effect(GS);
                    log(`🌟 ${node.name}: ${node.desc}`, 'info');
                    updateStats();
                    if (GS.pendingRunes && GS.pendingRunes.length > 0) {
                        const rune = GS.pendingRunes.shift();
                        showRuneAttachment(rune, callback);
                    } else {
                        callback();
                    }
                }
                tapped = isAvailable;
            });

            svg.appendChild(g);
        });

        wrapper.appendChild(svg);
        c.appendChild(wrapper);
        show('screen-reward');
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
            const facesStr = die.faces.length > 0 ? ` ${die.faces.map(f => f.modifier.icon).join('')}` : '';
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
                const tf = d1.faces.length + d2.faces.length;
                preview.innerHTML = `[${d1.min}-${d1.max}] + [${d2.min}-${d2.max}] → <strong>[${nMin}-${nMax}]</strong> d6<br><span style="font-size:0.85em; opacity:0.7;">Values: ${vals.join(', ')} | ${tf} source face(s)</span>`;
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

        const slots = newValues.map(v => ({ value: v, faces: [] }));
        const sourcePool = [];
        d1.faces.forEach((f, i) => sourcePool.push({ id: 'a' + i, mod: { ...f.modifier }, fromDie: d1, assigned: -1 }));
        d2.faces.forEach((f, i) => sourcePool.push({ id: 'b' + i, mod: { ...f.modifier }, fromDie: d2, assigned: -1 }));

        let selectedSrc = null;

        const info = document.createElement('div');
        info.style.cssText = 'text-align:center; margin-bottom:8px; font-family:EB Garamond, serif; color:var(--text-dim); font-size:0.85em;';
        info.innerHTML = `Forging: <strong style="color:var(--gold)">[${newMin}-${newMax}]</strong> d6<br>Click a source face, then a die slot to assign. 2× same modifier on one slot = doubled effect.`;
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
            slots.forEach(slot => {
                if (slot.faces.length === 0) return;
                if (slot.faces.length === 1) {
                    merged.faces.push({ faceValue: slot.value, modifier: { ...slot.faces[0] } });
                } else if (slot.faces.length === 2) {
                    const [a, b] = slot.faces;
                    if (a.effect === b.effect) {
                        const doubled = { ...a, value: a.value + b.value, name: a.name + ' ×2' };
                        merged.faces.push({ faceValue: slot.value, modifier: doubled });
                    } else {
                        merged.faces.push({ faceValue: slot.value, modifier: { ...a } });
                    }
                }
            });
            GS.dice.push(merged);
            const fs = merged.faces.length > 0 ? ` [${merged.faces.map(f => f.faceValue + ':' + f.modifier.icon).join(' ')}]` : '';
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
                const has = slot.faces.length > 0;
                let content = `<div style="font-size:0.65em; opacity:0.4;">val ${slot.value}</div>`;
                if (slot.faces.length === 0) {
                    content += `<div style="font-size:1.1em; opacity:0.25;">—</div>`;
                } else if (slot.faces.length === 1) {
                    content += `<div style="font-size:1.2em;">${slot.faces[0].icon}</div><div style="font-size:0.45em; color:${slot.faces[0].color};">${slot.faces[0].name}</div>`;
                } else {
                    const [a, b] = slot.faces;
                    if (a.effect === b.effect) {
                        content += `<div style="font-size:1.2em;">${a.icon}×2</div><div style="font-size:0.45em; color:var(--gold);">DOUBLED</div>`;
                    } else {
                        content += `<div style="font-size:0.9em;">${a.icon}+${b.icon}</div><div style="font-size:0.45em; color:var(--red-bright);">keeps first</div>`;
                    }
                }
                el.style.cssText = `width:68px; height:72px; border-radius:8px; display:flex; flex-direction:column; align-items:center; justify-content:center; cursor:pointer; border:2px solid ${has ? 'var(--gold)' : 'rgba(255,255,255,0.12)'}; background:${has ? 'rgba(212,165,52,0.08)' : 'rgba(0,0,0,0.3)'}; transition:all 0.15s;`;
                el.innerHTML = content;
                el.onclick = () => {
                    if (selectedSrc !== null && slot.faces.length < 2) {
                        const src = sourcePool.find(s => s.id === selectedSrc);
                        if (src) { slot.faces.push({ ...src.mod }); src.assigned = si; selectedSrc = null; }
                    } else if (slot.faces.length > 0 && selectedSrc === null) {
                        const removed = slot.faces.pop();
                        for (let j = sourcePool.length - 1; j >= 0; j--) {
                            if (sourcePool[j].assigned === si && sourcePool[j].mod.effect === removed.effect) { sourcePool[j].assigned = -1; break; }
                        }
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
                <div class="card-effect" style="font-size:0.78em; opacity:0.7;">Best for: ${rune.slot === 'either' ? 'any slot' : rune.slot + ' slot'}</div>
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

        const totalSlots = GS.slots.attack.length + GS.slots.defend.length;
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
            rewards.push({ title: '🔨 Sacrifice Dice', desc: `Destroy 3 dice → +1 Attack or Defend slot (${GS.dice.length} dice)`, action: () => {
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
            const canUp = die.max < 12;
            const nextMin = canUp ? die.min + (hammer ? 2 : 1) : die.min;
            const nextMax = canUp ? die.max + (hammer ? 2 : 1) : die.max;
            const card = document.createElement('div');
            card.className = 'card' + (canUp ? '' : ' disabled');
            card.innerHTML = renderDieCard(die, i, {
                extraDesc: canUp ? `<div class="card-effect" style="text-align:center;">→ ${nextMin}–${nextMax}${hammer ? ' ⚒️' : ''}</div>` : '<div class="card-effect" style="text-align:center; color:var(--text-dim);">Max level</div>'
            });
            if (canUp) {
                card.onclick = () => {
                    applyUpgrade(die);
                    log(`Upgraded die to ${die.min}-${die.max}!${hammer ? ' (Master\'s Hammer)' : ''}`, 'info');
                    Game.nextFloor();
                };
            }
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
            const facesStr = die.faces.length > 0 ? ` ${die.faces.map(f => f.modifier.icon).join('')}` : '';
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
                    : `3 dice selected — choose slot type below`;
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
                if (type === 'attack') GS.slots.attack.push({ id: `atk-${Date.now()}`, rune: null });
                else GS.slots.defend.push({ id: `def-${Date.now()}`, rune: null });
                log(`🔨 Sacrificed 3 dice for +1 ${type} slot!`, 'info');
                updateStats();
                callback();
            };
            return btn;
        };
        slotBtns.appendChild(makeBtn(`⚔️ +1 Attack Slot (${GS.slots.attack.length} → ${GS.slots.attack.length + 1})`, 'attack'));
        slotBtns.appendChild(makeBtn(`🛡️ +1 Defend Slot (${GS.slots.defend.length} → ${GS.slots.defend.length + 1})`, 'defend'));
        c.appendChild(slotBtns);

        const back = document.createElement('div');
        back.className = 'card';
        back.style.cssText = 'margin-top:8px; max-width:120px; margin-left:auto; margin-right:auto;';
        back.innerHTML = `<div class="card-title">← Back</div>`;
        back.onclick = () => Rewards.show();
        c.appendChild(back);

        show('screen-reward');
    },

    artifactChoice(thenReward = false) {
        updateStats();
        $('reward-title').textContent = '✨ Artifact Drop';
        const c = $('reward-cards');
        c.innerHTML = '';

        const owned = new Set(GS.artifacts.map(a => a.name));
        const pool = getArtifactPool(GS.act);
        let available = pool.filter(a => !owned.has(a.name));
        if (available.length < 3) available = [...pool];
        const choices = shuffle(available).slice(0, 3);

        const afterPick = () => { updateStats(); if (thenReward) Rewards.show(); else Game.nextFloor(); };

        choices.forEach(art => {
            const card = document.createElement('div');
            card.className = 'card';
            card.innerHTML = `
                <div class="card-title">${art.icon} ${art.name}</div>
                <div class="card-desc">${art.desc}</div>
            `;
            card.onclick = () => {
                GS.artifacts.push(art);
                // onAcquire effects
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
                }
                log(`✨ Acquired ${art.icon} ${art.name}!`, 'info');
                afterPick();
            };
            c.appendChild(card);
        });

        show('screen-reward');
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
        const totalSlots = GS.slots.attack.length + GS.slots.defend.length;

        const all = [
            { title: '🎲 Weighted Die', desc: `Rolls 2-7 (${GS.dice.length} dice, ${totalSlots} slots)`, price: 35, type: 'DICE',
              effect: 'Adds a 2-7 die to your pool',
              action: () => { GS.dice.push(createDie(2, 7)); log('Bought Weighted Die (2-7)!', 'info'); } },
            { title: '💎 Power Die', desc: `Rolls 4-9 (${GS.dice.length} dice, ${totalSlots} slots)`, price: 80, type: 'DICE',
              effect: 'Adds a 4-9 die to your pool',
              action: () => { GS.dice.push(createDie(4, 9)); log('Bought Power Die (4-9)!', 'info'); } },
            { title: '⬆️ Die Upgrade', desc: 'Improve one die\'s range', price: 50, type: 'UPGRADE',
              effect: '+1/+1 to a die', action: () => { Shop.showUpgrade(); return false; } },
            { title: '🗡️ Blade Oil', desc: 'Sharpen your blades permanently', price: 25, type: 'BUFF',
              effect: '+3 attack damage', action: () => { GS.buffs.damageBoost += 3; log('+3 attack damage!', 'info'); } },
            { title: '🛡️ Iron Plate', desc: 'Fortify your defences permanently', price: 30, type: 'BUFF',
              effect: '+2 armor', action: () => { GS.buffs.armor += 2; log('+2 armor!', 'info'); } },
        ];

        const hasTrimmable = GS.dice.some(d => d.faceValues && d.faceValues.length > 3);
        if (hasTrimmable) {
            all.push({
                title: '✂️ Face Trim', desc: 'Remove a face from a die (d6→d5)', price: 40, type: 'SERVICE',
                effect: 'Reduce die sides, increase consistency', action: () => { Shop.showFaceRemoval(); return false; }
            });
        }

        if (GS.act >= 2) {
            all.push(
                { title: '⚡ Titan Die', desc: `Rolls 6-11 (${GS.dice.length} dice, ${totalSlots} slots)`, price: 150, type: 'DICE',
                  effect: 'Adds a 6-11 die to your pool',
                  action: () => { GS.dice.push(createDie(6, 11)); log('Bought Titan Die (6-11)!', 'info'); } },
            );
        }

        const mods = shuffle([...FACE_MODS]).slice(0, 2);
        mods.forEach(mod => {
            all.push({
                title: `${mod.icon} ${mod.name} Face`, desc: `Add to any die face`, price: 35,
                type: 'FACE MOD', effect: mod.desc,
                action: () => { Shop.showFaceModPurchase(mod); return false; },
                modifier: mod
            });
        });

        const runeOffers = shuffle([...RUNES]).slice(0, GS.act >= 2 ? 2 : 1);
        runeOffers.forEach(rune => {
            all.push({
                title: `${rune.icon} ${rune.name}`, desc: `Rune — ${rune.desc}`, price: 80,
                type: 'RUNE', effect: rune.desc,
                action: () => {
                    showRuneAttachment(rune, () => { Shop.render(); show('screen-shop'); });
                    return false;
                },
            });
        });

        const shopSlots = (GS.tempBuffs && GS.tempBuffs.shopReduced) ? 3 : 6;
        if (GS.tempBuffs && GS.tempBuffs.shopReduced) GS.tempBuffs.shopReduced = false;
        Shop.items = shuffle(all).slice(0, shopSlots).map(item => ({
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
            const canUp = die.max < 12;
            const nextMin = canUp ? die.min + (hammer ? 2 : 1) : die.min;
            const nextMax = canUp ? die.max + (hammer ? 2 : 1) : die.max;
            const card = document.createElement('div');
            card.className = 'card' + (canUp ? '' : ' disabled');
            card.innerHTML = renderDieCard(die, i, {
                extraDesc: canUp ? `<div class="card-effect" style="text-align:center;">→ ${nextMin}–${nextMax}${hammer ? ' ⚒️' : ''}</div>` : '<div class="card-effect" style="text-align:center; color:var(--text-dim);">Max level</div>'
            });
            if (canUp) {
                card.onclick = () => {
                    applyUpgrade(die);
                    log(`Upgraded die to ${die.min}-${die.max}!${hammer ? ' (Master\'s Hammer)' : ''}`, 'info');
                    updateStats(); Shop.render();
                };
            }
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

        GS.dice.forEach((die, i) => {
            const card = document.createElement('div');
            card.className = 'card';
            card.innerHTML = renderDieCard(die, i);
            card.onclick = () => { if (title.parentNode) title.remove(); Shop.showFaceSlot(die, mod); };
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

        die.faceValues.forEach(v => {
            const existing = die.faces.find(f => f.faceValue === v);
            const card = document.createElement('div');
            card.className = 'card';
            const faceHtml = renderFaceStrip(die, { highlightVal: v, showArrow: true, arrowMod: mod });
            card.innerHTML = `
                <div class="card-title" style="display:flex; align-items:center; gap:8px; justify-content:center;">
                    <span style="font-size:1.3em; font-family:JetBrains Mono,monospace;">${v}</span>
                    ${existing ? `<span style="font-size:0.8em;">${existing.modifier.icon} ${existing.modifier.name}</span>` : '<span style="font-size:0.8em; opacity:0.4;">Empty</span>'}
                    <span style="color:var(--green-bright);">→ ${mod.icon} ${mod.name}</span>
                </div>
            `;
            card.onclick = () => {
                die.faces = die.faces.filter(f => f.faceValue !== v);
                die.faces.push({ faceValue: v, modifier: mod });
                log(`Applied ${mod.name} to face ${v}!`, 'info');
                updateStats(); Shop.render();
            };
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
            const mod = die.faces.find(f => f.faceValue === val);
            const card = document.createElement('div');
            card.className = 'card';
            card.innerHTML = `
                <div class="card-title" style="color:#ff6666; display:flex; align-items:center; gap:8px; justify-content:center;">
                    <span style="font-size:1.3em; font-family:JetBrains Mono,monospace;">✂️ ${val}</span>
                    ${mod ? `<span style="font-size:0.85em;">${mod.modifier.icon} ${mod.modifier.name} — also lost!</span>` : ''}
                </div>
                <div class="card-desc" style="text-align:center;">Die becomes d${die.faceValues.length - 1}</div>
            `;
            card.onclick = () => {
                die.faceValues.splice(idx, 1);
                die.sides = die.faceValues.length;
                die.min = Math.min(...die.faceValues);
                die.max = Math.max(...die.faceValues);
                die.faces = die.faces.filter(f => f.faceValue !== val);
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

    enter() {
        updateStats();
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
        GS.dice.forEach((die, i) => {
            const card = document.createElement('div');
            card.className = 'card';
            card.innerHTML = renderDieCard(die, i);
            card.onclick = () => Events._pickFaceForModCb(die, mod, cb);
            $('event-dice-cards').appendChild(card);
        });
        show('screen-event');
    },

    _pickFaceForModCb(die, mod, cb) {
        const panel = $('event-panel');
        panel.innerHTML = `<div class="event-text">Apply <strong style="color:${mod.color}">${mod.icon} ${mod.name}</strong> — Choose a face:</div>`;
        const grid = document.createElement('div');
        grid.className = 'card-grid';
        die.faceValues.forEach(v => {
            const existing = die.faces.find(f => f.faceValue === v);
            const card = document.createElement('div');
            card.className = 'card';
            card.innerHTML = `
                <div class="card-title" style="display:flex; align-items:center; gap:8px; justify-content:center;">
                    <span style="font-size:1.3em; font-family:JetBrains Mono,monospace;">${v}</span>
                    ${existing ? `<span style="font-size:0.85em;">${existing.modifier.icon} ${existing.modifier.name}</span>` : '<span style="font-size:0.85em; opacity:0.4;">Empty</span>'}
                    <span style="color:var(--green-bright);">→ ${mod.icon} ${mod.name}</span>
                </div>`;
            card.onclick = () => {
                die.faces = die.faces.filter(f => f.faceValue !== v);
                die.faces.push({ faceValue: v, modifier: mod });
                log(`Applied ${mod.name} to face ${v}!`, 'info');
                cb();
            };
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
                                const newMin = Math.max(1, boostDie.min + 2);
                                const newMax = Math.min(12, boostDie.max + 2);
                                GS.dice = GS.dice.filter(d => d.id !== boostDie.id);
                                GS.dice.push(createDie(newMin, newMax));
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
                        const die = pick(GS.dice);
                        const v = pick(die.faceValues);
                        die.faces = die.faces.filter(f => f.faceValue !== v);
                        die.faces.push({ faceValue: v, modifier: mod });
                        log(`The shrine bestows ${mod.icon} ${mod.name} on face ${v}!`, 'info');
                        const dieIdx = GS.dice.indexOf(die);
                        Events._showOutcome('Cursed Shrine', [
                            `<span style="color:${mod.color}">${mod.icon} ${mod.name}</span> was placed on face <strong>${v}</strong> of Die #${dieIdx + 1} (d${die.max})`,
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
                        const upgradable = GS.dice.filter(d => d.max < 12);
                        if (upgradable.length > 0) {
                            const die = pick(upgradable);
                            upgradeDie(die);
                            log(`Smashed the chest! ${die.min}-${die.max} die upgraded!`, 'info');
                        } else {
                            log('Smashed the chest! (All dice already at max)', 'info');
                        }
                        updateStats(); Game.nextFloor();
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
        const hasRunes = GS.slots.attack.some(s => s.rune) || GS.slots.defend.some(s => s.rune);
        Events._render(
            'The Forgotten Forge',
            'An ancient forge still burns. Tools of remarkable craft surround it...',
            [
                {
                    text: 'Reforge a die — randomize all face values within its range',
                    action: () => {
                        Events._chooseDie('Choose a die to reforge:', die => {
                            const n = die.faceValues.length;
                            const modsByIdx = die.faceValues.map(v => die.faces.find(f => f.faceValue === v) || null);
                            const newVals = Array.from({length: n}, () => die.min + Math.floor(Math.random() * (die.max - die.min + 1))).sort((a, b) => a - b);
                            die.faceValues = newVals;
                            die.faces = modsByIdx.map((f, i) => f ? { faceValue: newVals[i], modifier: f.modifier } : null).filter(Boolean);
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
                            ...GS.slots.attack.map((s, i) => ({ slot: s, label: `⚔️ Attack Slot ${i + 1}` })),
                            ...GS.slots.defend.map((s, i) => ({ slot: s, label: `🛡️ Defend Slot ${i + 1}` })),
                        ].filter(x => x.slot.rune);
                        slotsWithRunes.forEach(({ slot, label }) => {
                            const card = document.createElement('div');
                            card.className = 'card';
                            card.innerHTML = `<div class="card-title" style="color:${slot.rune.color};">${slot.rune.icon} ${slot.rune.name}</div><div class="card-effect">${label} → rune value doubled</div>`;
                            card.onclick = () => {
                                slot.rune.value = (slot.rune.value || 1) * 2;
                                log(`Enhanced ${slot.rune.icon} ${slot.rune.name}! Value doubled.`, 'info');
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
                                d.faces = d.faces.map(f => ({ ...f, faceValue: f.faceValue + 1 }));
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
        $('rest-title').textContent = `Act ${GS.act - 1} Complete — Rest & Prepare`;
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
            const atkCap = GS.slots.attack.length >= 6, defCap = GS.slots.defend.length >= 6;
            expandCard.innerHTML = `<div class="card-title">➕ Expand</div><div class="card-desc">+1 slot<br>${atkCap && defCap ? '<span style="color:#ff8080;">Max slots reached</span>' : `${GS.slots.attack.length}⚔️ / ${GS.slots.defend.length}🛡️`}</div>`;
            if (!(atkCap && defCap)) expandCard.onclick = () => Rest.showExpand();
            else expandCard.classList.add('disabled');
            transGrid.appendChild(expandCard);

            const canSacAtk = GS.slots.attack.length > 1, canSacDef = GS.slots.defend.length > 1;
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
        content.innerHTML = '<div class="section-title">➕ Expand — Choose a slot type</div>';
        const info = document.createElement('div');
        info.style.cssText = 'text-align:center; margin-bottom:12px; font-size:0.85em; color:var(--text-dim);';
        info.innerHTML = `Current: ${GS.slots.attack.length} Attack slots / ${GS.slots.defend.length} Defend slots`;
        content.appendChild(info);

        const grid = document.createElement('div');
        grid.className = 'card-grid';

        const atkCapped = GS.slots.attack.length >= 6;
        const atkCard = document.createElement('div');
        atkCard.className = 'card' + (atkCapped ? ' disabled' : '');
        atkCard.innerHTML = `<div class="card-title">⚔️ +1 Attack Slot</div><div class="card-desc">${GS.slots.attack.length} → ${GS.slots.attack.length + 1}${atkCapped ? ' (MAX)' : ''}</div>`;
        if (!atkCapped) atkCard.onclick = () => { GS.slots.attack.push({ id: `atk-${Date.now()}`, rune: null }); log('➕ +1 attack slot!', 'info'); updateStats(); Rest._transformDone = true; Rest._render(); };
        grid.appendChild(atkCard);

        const defCapped = GS.slots.defend.length >= 6;
        const defCard = document.createElement('div');
        defCard.className = 'card' + (defCapped ? ' disabled' : '');
        defCard.innerHTML = `<div class="card-title">🛡️ +1 Defend Slot</div><div class="card-desc">${GS.slots.defend.length} → ${GS.slots.defend.length + 1}${defCapped ? ' (MAX)' : ''}</div>`;
        if (!defCapped) defCard.onclick = () => { GS.slots.defend.push({ id: `def-${Date.now()}`, rune: null }); log('➕ +1 defend slot!', 'info'); updateStats(); Rest._transformDone = true; Rest._render(); };
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
            ...GS.slots.attack.map((s, i) => ({ ...s, type: 'attack', label: `⚔️ Attack Slot ${i + 1}`, isMin: GS.slots.attack.length <= 1 })),
            ...GS.slots.defend.map((s, i) => ({ ...s, type: 'defend', label: `🛡️ Defend Slot ${i + 1}`, isMin: GS.slots.defend.length <= 1 })),
        ];

        allSlots.forEach(slotInfo => {
            const card = document.createElement('div');
            card.className = 'card' + (slotInfo.isMin ? ' disabled' : '');
            const runeNote = slotInfo.rune
                ? `<div style="color:${slotInfo.rune.color}; font-size:0.85em; margin-top:4px;">${slotInfo.rune.icon} ${slotInfo.rune.name} <span style="color:#ff8080;">(will be lost)</span></div>`
                : '<div style="opacity:0.5; font-size:0.85em; margin-top:4px;">no rune</div>';
            const slotTypeLabel = slotInfo.type === 'attack' ? 'attack' : 'defend';
            const enhancements = slotInfo.type === 'attack' ? '🔥 Fury Chamber · ☠️ Conduit · ⚒️ Gold Forge' : '🏰 Fortification · 🌿 Thorns Aura · 🧛 Vampiric Ward';
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

        const enhancements = slotType === 'attack' ? [
            { name: 'Fury Chamber', icon: '🔥', desc: `All ${remaining} remaining attack slots deal ×1.5 damage${GS.transformBuffs.furyChambered > 1 ? ' (stacks × existing)' : ''}`, effect: 'furyChambered', value: 1.5 },
            { name: 'Conduit', icon: '☠️', desc: `Each attack die applies +2 poison per turn (currently: ${GS.transformBuffs.conduit} → ${GS.transformBuffs.conduit + 2})`, effect: 'conduit', value: 2 },
            { name: 'Gold Forge', icon: '⚒️', desc: `Each attack die generates gold equal to its rolled value after you attack`, effect: 'goldForge', value: true },
        ] : [
            { name: 'Fortification', icon: '🏰', desc: `All ${remaining} remaining defend slots block ×1.5${GS.transformBuffs.fortified > 1 ? ' (stacks × existing)' : ''}`, effect: 'fortified', value: 1.5 },
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
            { name: 'Ascend', icon: '🌟', desc: 'Remove from dice pool — becomes a passive aura adding half its average to every attack and defend slot each turn. (Requires ≥3 dice remain)' },
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
                if (rollable.length - 1 < 2) { disabled = true; reason = 'Need ≥2 dice remaining'; }
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
            const mod = die.faces.find(f => f.faceValue === val);
            const card = document.createElement('div');
            card.className = 'card';
            card.innerHTML = `
                <div class="card-title" style="color:#ff6666; display:flex; align-items:center; gap:8px; justify-content:center;">
                    <span style="font-size:1.3em; font-family:JetBrains Mono,monospace;">✂️ ${val}</span>
                    ${mod ? `<span style="font-size:0.85em;">${mod.modifier.icon} ${mod.modifier.name} — also lost!</span>` : ''}
                </div>
                <div class="card-desc" style="text-align:center;">Die becomes d${die.faceValues.length - 1}</div>
            `;
            card.onclick = () => {
                die.faceValues.splice(idx, 1);
                die.sides = die.faceValues.length;
                die.min = Math.min(...die.faceValues);
                die.max = Math.max(...die.faceValues);
                die.faces = die.faces.filter(f => f.faceValue !== val);
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
            const canUp = die.max < 12;
            const nextMin = canUp ? die.min + (hammer ? 2 : 1) : die.min;
            const nextMax = canUp ? die.max + (hammer ? 2 : 1) : die.max;
            const card = document.createElement('div');
            card.className = 'card' + (canUp ? '' : ' disabled');
            card.innerHTML = renderDieCard(die, i, {
                extraDesc: canUp ? `<div class="card-effect" style="text-align:center;">→ ${nextMin}–${nextMax}${hammer ? ' ⚒️' : ''}</div>` : '<div class="card-effect" style="text-align:center; color:var(--text-dim);">Max level</div>'
            });
            if (canUp) card.onclick = () => {
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

        const runeCount = [...GS.slots.attack, ...GS.slots.defend].filter(s => s.rune).length;

        html += `<div style="background:var(--bg-surface); border:1px solid var(--border); border-radius:8px; padding:14px; margin-bottom:12px;">
            <div style="font-family:JetBrains Mono,monospace; font-size:0.8em; color:var(--gold); margin-bottom:8px;">⚙️ STATS</div>
            <div style="display:grid; grid-template-columns:1fr 1fr; gap:4px 16px; font-size:0.85em;">
                <span>❤️ HP: ${GS.hp}/${GS.maxHp}${GS.regenStacks > 0 ? ` (+${GS.regenStacks} regen)` : ''}</span>
                <span>💰 Gold: ${GS.gold}</span>
                <span>⚔️ Atk Slots: ${GS.slots.attack.length}</span>
                <span>🛡️ Def Slots: ${GS.slots.defend.length}</span>
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
        GS.dice.filter(d => !d.midasTemp).forEach((die, i) => {
            const faces = die.faceValues ? die.faceValues.join(', ') : `${die.min}-${die.max}`;
            const mods = die.faces.length ? die.faces.map(f => `<span style="color:${f.modifier.color};" title="${f.modifier.name}: ${f.modifier.desc}">  ${f.faceValue}:${f.modifier.icon}${f.modifier.name}</span>`).join('') : '<span style="opacity:0.4;">no mods</span>';
            html += `<div style="margin:4px 0; font-size:0.82em; padding:4px 0; border-bottom:1px solid rgba(255,255,255,0.05);">
                <strong>d${die.faceValues ? die.faceValues.length : die.sides}</strong> [${faces}] ${mods}
            </div>`;
        });
        html += `</div>`;

        html += `<div style="background:var(--bg-surface); border:1px solid var(--border); border-radius:8px; padding:14px; margin-bottom:12px;">
            <div style="font-family:JetBrains Mono,monospace; font-size:0.8em; color:var(--gold); margin-bottom:8px;">🔮 SLOT RUNES</div>`;
        GS.slots.attack.forEach((slot, i) => {
            const rs = slot.rune ? `<span style="color:${slot.rune.color};" title="${slot.rune.name}: ${slot.rune.desc}">${slot.rune.icon} ${slot.rune.name}</span>` : '<span style="opacity:0.4;">no rune</span>';
            html += `<div style="font-size:0.82em; margin:3px 0;">⚔️ Attack Slot ${i + 1}: ${rs}</div>`;
        });
        GS.slots.defend.forEach((slot, i) => {
            const rs = slot.rune ? `<span style="color:${slot.rune.color};" title="${slot.rune.name}: ${slot.rune.desc}">${slot.rune.icon} ${slot.rune.name}</span>` : '<span style="opacity:0.4;">no rune</span>';
            html += `<div style="font-size:0.82em; margin:3px 0;">🛡️ Defend Slot ${i + 1}: ${rs}</div>`;
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
        if (unlocked.length > 0) {
            html += `<div style="background:var(--bg-surface); border:1px solid var(--border); border-radius:8px; padding:14px; margin-bottom:12px;">
                <div style="font-family:JetBrains Mono,monospace; font-size:0.8em; color:var(--gold); margin-bottom:8px;">⭐ SKILL TREE (${unlocked.length} nodes)</div>`;
            unlocked.forEach(n => {
                html += `<div style="font-size:0.82em; margin:3px 0;">${n.icon} <strong>${n.name}</strong> — ${n.desc}</div>`;
            });
            html += `</div>`;
        }

        c.innerHTML = html;
    }
};

// ════════════════════════════════════════════════════════════
//  ENCOUNTER CHOICE SCREEN
// ════════════════════════════════════════════════════════════
const EncounterChoice = {
    show(encounter) {
        GS.encounter = encounter;
        const { enemy, environment, anomaly, eliteModifiers, floor, isBossFloor, eliteOffered, eliteChance } = encounter;

        $('encounter-header').innerHTML = this._buildHeader(floor, isBossFloor, anomaly, environment);
        $('encounter-standard-panel').innerHTML = this._buildStandardPanel(enemy, isBossFloor);
        $('encounter-elite-panel').innerHTML = eliteOffered
            ? this._buildElitePanel(enemy, eliteModifiers, isBossFloor)
            : this._buildLockedElitePanel(eliteChance);

        show('screen-encounter');
    },

    chooseStandard() {
        GS.encounter.isElite = false;
        Combat.start();
    },

    chooseElite() {
        const enc = GS.encounter;
        const revealData = applyEliteChoice(enc.enemy, enc.eliteModifiers);
        enc.isElite = true;
        this._showReveal(revealData, () => Combat.start());
    },

    _showReveal(revealData, onDone) {
        const { visibleModifier, hiddenModifier, finalStats } = revealData;
        const overlay = document.createElement('div');
        overlay.style.cssText = 'position:absolute; inset:0; background:rgba(0,0,0,0.85); display:flex; flex-direction:column; align-items:center; justify-content:center; gap:12px; z-index:10; padding:20px; text-align:center;';
        overlay.innerHTML = `
            <div style="font-size:1.1em; color:var(--gold); font-family:EB Garamond,serif;">⚔️ Elite Challenge Accepted!</div>
            <div style="display:flex; gap:16px; justify-content:center; flex-wrap:wrap;">
                <div style="background:var(--bg-surface); border:1px solid var(--gold); border-radius:8px; padding:12px; min-width:120px;">
                    <div style="color:var(--gold); margin-bottom:4px;">${visibleModifier.prefix}</div>
                    <div style="font-size:0.8em; color:var(--text-dim);">Known modifier</div>
                </div>
                <div style="background:var(--bg-surface); border:1px solid #c060ff; border-radius:8px; padding:12px; min-width:120px;">
                    <div style="color:#c060ff; margin-bottom:4px;">${hiddenModifier.prefix}</div>
                    <div style="font-size:0.8em; color:var(--text-dim);">Hidden modifier revealed!</div>
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
            ? `<span style="background:#663300; color:#ffaa44; border-radius:4px; padding:2px 8px; font-size:0.8em; margin-left:8px;">⚠️ ${anomaly.name}</span>`
            : '';
        const envBar = environment
            ? `<div style="background:rgba(255,255,255,0.05); border-radius:6px; padding:6px 10px; margin-top:6px; font-size:0.82em; text-align:left;">
                   <span style="color:var(--gold);">${environment.icon} ${environment.name}</span>
                   <span style="color:var(--text-dim); margin-left:6px;">· ${environment.desc}</span>
               </div>`
            : '';
        return `<div style="padding:12px 0 8px; font-family:EB Garamond,serif; font-size:1.1em; text-align:center;">${floorLabel}${anomalyBadge}</div>${envBar}`;
    },

    _buildStandardPanel(enemy, isBossFloor) {
        const diceStr    = this._formatDicePool(enemy.dice);
        const abilities  = Object.values(enemy.abilities || {}).map(a => `${a.icon} ${a.name}`).join(', ') || '—';
        const passives   = (enemy.passives || []).map(p => p.name).join(', ') || '—';
        const goldRange  = Array.isArray(enemy.gold) ? `${enemy.gold[0]}–${enemy.gold[1]}` : enemy.gold;
        const xpRange    = Array.isArray(enemy.xp)   ? `${enemy.xp[0]}–${enemy.xp[1]}`   : enemy.xp;

        const phaseSection = isBossFloor && enemy.phases && enemy.phases.length
            ? `<div style="font-size:0.8em; color:#ff8888; margin-top:4px;">📊 ${enemy.phases.length} phase(s)</div>`
            : '';

        return `
            <div style="background:var(--bg-surface); border:1px solid var(--border); border-radius:8px; padding:14px; flex:1;">
                <div style="font-size:1em; font-weight:bold; margin-bottom:10px; color:var(--text);">⚔️ Standard</div>
                <div style="font-size:1.05em; font-family:EB Garamond,serif; margin-bottom:6px;">${enemy.name}</div>
                <div style="font-size:0.85em; color:var(--text-dim); margin-bottom:4px;">❤️ ${enemy.hp} HP · 🎲 ${diceStr}</div>
                ${phaseSection}
                <div style="font-size:0.8em; color:var(--text-dim); margin-top:4px;">Abilities: ${abilities}</div>
                <div style="font-size:0.8em; color:var(--text-dim); margin-top:2px;">Passives: ${passives}</div>
                <div style="margin-top:10px; font-size:0.82em; color:var(--gold);">Rewards: ${goldRange}g · ${xpRange} XP${isBossFloor ? ' · Boss artifact' : ''}</div>
                <button class="btn btn-primary" style="width:100%; margin-top:12px;" onclick="EncounterChoice.chooseStandard()">Fight (Standard)</button>
            </div>`;
    },

    _buildElitePanel(enemy, eliteModifiers, isBossFloor) {
        const { visible, hidden } = eliteModifiers;
        const effects = this._formatModifierEffects(visible, enemy);

        // Preview stats with visible modifier only
        const previewEnemy = deepClone(enemy);
        applyEliteModifier(previewEnemy, visible);
        const previewDice = this._formatDicePool(previewEnemy.dice);
        const previewAvg  = calculateAvgDamage(previewEnemy);

        // Rewards with both modifiers applied
        const mults     = calculateRewardMultipliers([visible, hidden]);
        const goldRange = Array.isArray(enemy.gold) ? `${Math.floor(enemy.gold[0] * mults.gold)}–${Math.floor(enemy.gold[1] * mults.gold)}` : Math.floor(enemy.gold * mults.gold);
        const xpRange   = Array.isArray(enemy.xp)   ? `${Math.floor(enemy.xp[0] * mults.xp)}–${Math.floor(enemy.xp[1] * mults.xp)}`       : Math.floor(enemy.xp   * mults.xp);

        const artifactNote = isBossFloor
            ? (visible.artifactPicks ? `${visible.artifactPicks} boss artifacts` + (visible.legendaryChance ? ` + ${Math.round(visible.legendaryChance * 100)}% legendary` : '') : 'Boss artifact')
            : 'Artifact pick (1 of 3)';

        return `
            <div style="background:var(--bg-surface); border:1px solid #c060ff; border-radius:8px; padding:14px; flex:1;">
                <div style="font-size:1em; font-weight:bold; margin-bottom:10px; color:#c060ff;">💀 Elite</div>
                <div style="color:var(--gold); font-size:0.95em; margin-bottom:6px;">${visible.prefix}</div>
                ${effects.length ? `<div style="font-size:0.82em; color:var(--text-dim); margin-bottom:6px;">${effects.join(' · ')}</div>` : ''}
                <div style="font-size:0.8em; color:#c060ff; margin-bottom:8px;">+ 1 hidden modifier</div>
                <div style="font-size:0.82em; color:var(--text-dim);">Est: ${previewEnemy.hp} HP · ${previewDice} · ~${previewAvg} dmg/turn <span style="font-size:0.85em;">(+hidden)</span></div>
                <div style="margin-top:10px; font-size:0.82em; color:var(--gold);">Rewards: ${goldRange}g · ${xpRange} XP · ${artifactNote}</div>
                <button class="btn" style="width:100%; margin-top:12px; border-color:#c060ff; color:#c060ff;" onclick="EncounterChoice.chooseElite()">Fight (Elite)</button>
            </div>`;
    },

    _buildLockedElitePanel(eliteChance) {
        const pct = Math.round(eliteChance * 100);
        const nextAct = pct <= 33 ? 'Act 2' : 'Act 3';
        return `
            <div style="background:var(--bg-surface); border:1px solid #555; border-radius:8px; padding:14px; flex:1; opacity:0.5;">
                <div style="font-size:1em; font-weight:bold; margin-bottom:10px; color:#888;">💀 Elite</div>
                <div style="font-size:0.9em; color:#888; margin-bottom:8px;">No elite challenge this floor.</div>
                <div style="font-size:0.82em; color:var(--text-dim);">Elite encounters grow more common as you descend deeper.</div>
                <div style="font-size:0.8em; color:#888; margin-top:8px;">${nextAct}: ${Math.min(pct + 33, 100)}% chance · Act 3: always</div>
                <button class="btn" style="width:100%; margin-top:12px; border-color:#555; color:#555; cursor:not-allowed;" disabled>Not Available</button>
            </div>`;
    },

    _formatDicePool(dice) {
        const counts = {};
        dice.forEach(d => { counts[d] = (counts[d] || 0) + 1; });
        return Object.entries(counts).map(([d, n]) => `${n}×d${d}`).join(' + ') || '—';
    },

    _formatModifierEffects(modifier, enemy) {
        const effects = [];
        if (modifier.diceUpgrade) {
            const ex = enemy.dice[0] || '?';
            effects.push(`Dice: d${ex} → d${ex + modifier.diceUpgrade}`);
        }
        if (modifier.extraDice) {
            effects.push(`+${modifier.extraDice.map(d => `d${d}`).join(', ')}`);
        }
        if (modifier.hpMult && modifier.hpMult !== 1.0) {
            const pct = Math.round((modifier.hpMult - 1.0) * 100);
            effects.push(`HP ${pct > 0 ? '+' : ''}${pct}%`);
        }
        if (modifier.addPassive) effects.push(modifier.addPassive.desc);
        if (modifier.applyStartingCurse) effects.push('Curses player at start');
        if (modifier.doublePhases) effects.push('Phase triggers earlier');
        return effects;
    },
};

// ════════════════════════════════════════════════════════════
//  INIT — expose modules on window for inline onclick handlers
// ════════════════════════════════════════════════════════════
window.Game = Game;
window.Combat = Combat;
window.Rewards = Rewards;
window.Shop = Shop;
window.Events = Events;
window.Rest = Rest;
window.Inventory = Inventory;
window.addConsumableToInventory = addConsumableToInventory;
window.EncounterChoice = EncounterChoice;

// Prevent right-click context menu on combat screen
document.getElementById('screen-combat').addEventListener('contextmenu', e => e.preventDefault());

updateStats();
