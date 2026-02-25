// ════════════════════════════════════════════════════════════
//  SCREENS — Game, Rewards, Shop, Events, Rest, Inventory
//  Entry point: exposes all modules on window for onclick handlers
// ════════════════════════════════════════════════════════════
import { FACE_MODS, ARTIFACT_POOL, RUNES, SKILL_TREE, getAct, getFloorType } from './constants.js';
import { GS, $, rand, pick, shuffle, log, gainXP, gainGold, heal } from './state.js';
import { createDie, upgradeDie, renderFaceStrip, renderDieCard, show, updateStats, resetDieIdCounter, renderCombatDice } from './engine.js';
import { Combat } from './combat.js';

// ════════════════════════════════════════════════════════════
//  GAME CONTROLLER
// ════════════════════════════════════════════════════════════
const Game = {
    start() {
        Object.assign(GS, {
            floor: 1, act: 1, hp: 50, maxHp: 50, gold: 15,
            level: 1, xp: 0, xpNext: 50,
            dice: [createDie(1,6), createDie(1,6), createDie(1,6)],
            slots: { attack: 2, defend: 2 },
            runes: { attack: [], defend: [] },
            passives: {}, unlockedNodes: [],
            rerolls: 0, rerollsLeft: 0,
            enemy: null, enemiesKilled: 0, totalGold: 0,
            artifacts: [], buffs: { damageBoost: 0, armor: 0 },
            allocated: { attack: [], defend: [] }, rolled: false,
        });
        resetDieIdCounter(3);
        Game.enterFloor();
    },

    enterFloor() {
        GS.act = getAct(GS.floor);
        const type = getFloorType(GS.floor);

        if (type === 'combat' || type === 'elite') Combat.start(type === 'elite');
        else if (type === 'boss') Combat.start(false, true);
        else if (type === 'shop') Shop.enter();
        else if (type === 'event') Events.enter();
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

        const totalSlots = (GS.slots.attack - GS.runes.attack.length) + (GS.slots.defend - GS.runes.defend.length);
        rewards.push({ title: '🎲 New Die', desc: `Add a D6 (1-6) — ${GS.dice.length} dice, ${totalSlots} slots`, action: () => {
            GS.dice.push(createDie(1, 6));
            log('Added new D6!', 'info');
            GS.challengePrep--;
            if (GS.challengePrep > 0) Game.showChallengePrep();
            else Game.launchChallengeBoss();
        }});

        rewards.push({ title: '⬆️ Upgrade Die', desc: '+1/+1 to a die', action: () => {
            GS.challengePrep--;
            $('reward-title').textContent = 'Choose a Die to Upgrade';
            const cc = $('reward-cards');
            cc.innerHTML = '';
            GS.dice.forEach(die => {
                const canUp = die.max < 12;
                const card = document.createElement('div');
                card.className = 'card' + (canUp ? '' : ' disabled');
                card.innerHTML = `<div class="card-title">${die.min}-${die.max} → ${canUp ? `${die.min+1}-${die.max+1}` : 'MAX'}</div>`;
                if (canUp) card.onclick = () => {
                    upgradeDie(die);
                    log(`Upgraded to ${die.min}-${die.max}!`, 'info');
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
        GS.rerollsLeft = GS.rerolls + GS.artifacts.filter(a => a.effect === 'bonusReroll').reduce((s, a) => s + a.value, 0);
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
        GS.pendingSlotChoice = false;
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
                    callback();
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
                    callback();
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

    showRuneSelection(callback, canAtk, canDef) {
        $('reward-title').textContent = '🔮 Sacrifice Slot — Choose a Rune';
        const c = $('reward-cards');
        c.innerHTML = '';

        const info = document.createElement('div');
        info.style.cssText = 'text-align:center; margin-bottom:16px; color: var(--text-dim); font-family: EB Garamond, serif;';
        info.textContent = 'Choose a slot type to sacrifice, then pick a rune.';
        c.appendChild(info);

        let selectedSlotType = null;
        const runeGrid = document.createElement('div');
        runeGrid.style.cssText = 'display:flex; flex-wrap:wrap; gap:10px; justify-content:center;';

        const renderRunes = (slotType) => {
            selectedSlotType = slotType;
            runeGrid.innerHTML = '';
            const available = [...RUNES[slotType], ...RUNES.either];

            available.forEach(rune => {
                const card = document.createElement('div');
                card.className = 'card';
                card.style.width = '140px';
                card.innerHTML = `
                    <div class="card-title">${rune.icon} ${rune.name}</div>
                    <div class="card-desc">${rune.desc}</div>
                    <div class="card-effect" style="color:var(--text-dim); font-size:0.8em; margin-top:4px;">Costs 1 ${slotType} slot</div>
                `;
                card.onclick = () => {
                    GS.runes[slotType].push({ ...rune });
                    const effective = GS.slots[slotType] - GS.runes[slotType].length;
                    log(`🔮 ${rune.icon} ${rune.name} inscribed! (${effective} usable ${slotType} slots remain)`, 'info');
                    updateStats();
                    callback();
                };
                runeGrid.appendChild(card);
            });
        };

        const btnRow = document.createElement('div');
        btnRow.style.cssText = 'display:flex; gap:12px; justify-content:center; margin-bottom:16px;';

        if (canAtk) {
            const atkBtn = document.createElement('button');
            atkBtn.className = 'btn';
            const atkEffective = GS.slots.attack - GS.runes.attack.length;
            atkBtn.innerHTML = `⚔️ Attack Slot (${atkEffective} usable)`;
            atkBtn.onclick = () => renderRunes('attack');
            btnRow.appendChild(atkBtn);
        }
        if (canDef) {
            const defBtn = document.createElement('button');
            defBtn.className = 'btn';
            const defEffective = GS.slots.defend - GS.runes.defend.length;
            defBtn.innerHTML = `🛡️ Defend Slot (${defEffective} usable)`;
            defBtn.onclick = () => renderRunes('defend');
            btnRow.appendChild(defBtn);
        }

        c.appendChild(btnRow);
        c.appendChild(runeGrid);

        if (canAtk) renderRunes('attack');
        else renderRunes('defend');

        show('screen-reward');
    },

    show() {
        updateStats();
        $('reward-title').textContent = 'Victory — Choose Your Reward';
        const c = $('reward-cards');
        c.innerHTML = '';

        const rewards = [];

        const totalSlots = (GS.slots.attack - GS.runes.attack.length) + (GS.slots.defend - GS.runes.defend.length);
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

        rewards.push({ title: '💰 Loot', desc: `Gain ${20 + GS.floor * 5} gold`, action: () => {
            const g = gainGold(20 + GS.floor * 5);
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

        GS.dice.forEach((die, i) => {
            const canUp = die.max < 12;
            const card = document.createElement('div');
            card.className = 'card' + (canUp ? '' : ' disabled');
            card.innerHTML = renderDieCard(die, i, {
                extraDesc: canUp ? `<div class="card-effect" style="text-align:center;">→ ${die.min+1}–${die.max+1}</div>` : '<div class="card-effect" style="text-align:center; color:var(--text-dim);">Max level</div>'
            });
            if (canUp) {
                card.onclick = () => {
                    upgradeDie(die);
                    log(`Upgraded die to ${die.min}-${die.max}!`, 'info');
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

        const atkEff = GS.slots.attack - GS.runes.attack.length;
        const defEff = GS.slots.defend - GS.runes.defend.length;

        const makeBtn = (label, type) => {
            const btn = document.createElement('button');
            btn.className = 'btn btn-primary';
            btn.innerHTML = label;
            btn.onclick = () => {
                selected.sort((a, b) => b - a).forEach(i => GS.dice.splice(i, 1));
                if (type === 'attack') GS.slots.attack++;
                else GS.slots.defend++;
                log(`🔨 Sacrificed 3 dice for +1 ${type} slot!`, 'info');
                updateStats();
                callback();
            };
            return btn;
        };
        slotBtns.appendChild(makeBtn(`⚔️ +1 Attack Slot (${atkEff} usable)`, 'attack'));
        slotBtns.appendChild(makeBtn(`🛡️ +1 Defend Slot (${defEff} usable)`, 'defend'));
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
        let available = ARTIFACT_POOL.filter(a => !owned.has(a.name));
        if (available.length < 3) available = [...ARTIFACT_POOL];
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
                if (art.effect === 'permArmor') GS.buffs.armor += art.value;
                log(`Acquired ${art.name}!`, 'info');
                afterPick();
            };
            c.appendChild(card);
        });

        const effectiveAtk = GS.slots.attack - GS.runes.attack.length;
        const effectiveDef = GS.slots.defend - GS.runes.defend.length;
        const runePool = [];
        const ownedRuneKeys = new Set([
            ...GS.runes.attack.map(r => r.effect + ':attack'),
            ...GS.runes.defend.map(r => r.effect + ':defend'),
        ]);
        if (effectiveAtk >= 2) {
            RUNES.attack.forEach(r => { if (!ownedRuneKeys.has(r.effect+':attack')) runePool.push({ rune: r, slotType: 'attack' }); });
            RUNES.either.forEach(r => { if (!ownedRuneKeys.has(r.effect+':attack')) runePool.push({ rune: r, slotType: 'attack' }); });
        }
        if (effectiveDef >= 2) {
            RUNES.defend.forEach(r => { if (!ownedRuneKeys.has(r.effect+':defend')) runePool.push({ rune: r, slotType: 'defend' }); });
            RUNES.either.forEach(r => { if (!ownedRuneKeys.has(r.effect+':defend')) runePool.push({ rune: r, slotType: 'defend' }); });
        }
        if (runePool.length > 0) {
            const runeOfferItem = runePool[Math.floor(Math.random() * runePool.length)];  // renamed from 'pick' to avoid shadowing
            const card = document.createElement('div');
            card.className = 'card';
            card.style.borderColor = '#8040a0';
            card.innerHTML = `
                <div class="card-title" style="color:#c080ff;">${runeOfferItem.rune.icon} ${runeOfferItem.rune.name}</div>
                <div class="card-desc">RUNE (${runeOfferItem.slotType}) — ${runeOfferItem.rune.desc}<br><span style="color:#ff8080; font-size:0.85em;">Sacrifices 1 ${runeOfferItem.slotType} slot</span></div>
            `;
            card.onclick = () => {
                GS.runes[runeOfferItem.slotType].push({ ...runeOfferItem.rune });
                log(`Inscribed ${runeOfferItem.rune.name} on ${runeOfferItem.slotType}! ${runeOfferItem.rune.desc}`, 'info');
                afterPick();
            };
            c.appendChild(card);
        }

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

    enter() {
        Shop.purchased = new Set();
        Shop.refreshCount = 0;
        Shop.generateItems();
        Shop.render();
        show('screen-shop');
    },

    generateItems() {
        let discount = GS.artifacts.filter(a => a.effect === 'shopDiscount').reduce((s, a) => s + a.value, 0);
        if (GS.passives.shopDiscount) discount += GS.passives.shopDiscount;
        const applyDiscount = p => Math.floor(p * (1 - Math.min(discount, 0.5)));
        const totalSlots = (GS.slots.attack - GS.runes.attack.length) + (GS.slots.defend - GS.runes.defend.length);

        const all = [
            { title: '🎲 Weighted Die', desc: `A die that rolls 2-7 (${GS.dice.length} dice, ${totalSlots} slots)`, price: 35, type: 'DICE',
              effect: 'Adds 2-7 die to your pool',
              action: () => { GS.dice.push(createDie(2, 7)); log('Bought Weighted Die (2-7)!', 'info'); } },
            { title: '💎 Power Die', desc: `A die that rolls 4-9 (${GS.dice.length} dice, ${totalSlots} slots)`, price: 80, type: 'DICE',
              effect: 'Adds 4-9 die to your pool',
              action: () => { GS.dice.push(createDie(4, 9)); log('Bought Power Die (4-9)!', 'info'); } },
            { title: '⚔️ Blade Oil', desc: 'Permanent damage boost', price: 25, type: 'BUFF',
              effect: '+3 attack damage', action: () => { GS.buffs.damageBoost += 3; log('+3 damage!', 'info'); } },
            { title: '🛡️ Iron Plate', desc: 'Permanent damage reduction', price: 30, type: 'BUFF',
              effect: '+2 armor', action: () => { GS.buffs.armor += 2; log('+2 armor!', 'info'); } },
            { title: '❤️ Health Potion', desc: 'Restore vitality', price: 20, type: 'CONSUMABLE',
              effect: 'Heal 25 HP', action: () => { const h = heal(25); log(`Healed ${h} HP`, 'heal'); } },
            { title: '💪 Vitality Gem', desc: 'Increase your maximum', price: 35, type: 'BUFF',
              effect: '+12 Max HP', action: () => { GS.maxHp += 12; GS.hp += 12; log('+12 Max HP!', 'heal'); } },
            { title: '⬆️ Die Upgrade', desc: 'Improve one die\'s range', price: 50, type: 'UPGRADE',
              effect: '+1/+1 to a die', action: () => { Shop.showUpgrade(); return false; } },
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
                { title: '⚡ Titan Die', desc: 'A die that rolls 6-11', price: 150, type: 'DICE',
                  effect: 'Adds 6-11 die to your pool',
                  action: () => { GS.dice.push(createDie(6, 11)); log('Bought Titan Die (6-11)!', 'info'); } },
                { title: '🗡️ Vorpal Edge', desc: 'Massive permanent boost', price: 120, type: 'BUFF',
                  effect: '+6 attack damage', action: () => { GS.buffs.damageBoost += 6; log('+6 damage!', 'info'); } },
                { title: '🏰 Fortress', desc: 'Major defense upgrade', price: 100, type: 'BUFF',
                  effect: '+4 armor, +15 Max HP', action: () => { GS.buffs.armor += 4; GS.maxHp += 15; GS.hp += 15; log('+4 armor, +15 Max HP!', 'heal'); } },
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

        const effectiveAtk = GS.slots.attack - GS.runes.attack.length;
        const effectiveDef = GS.slots.defend - GS.runes.defend.length;
        const allRunes = [];
        if (effectiveAtk >= 2) {
            RUNES.attack.forEach(r => allRunes.push({ rune: r, slotType: 'attack' }));
            RUNES.either.forEach(r => allRunes.push({ rune: r, slotType: 'attack' }));
        }
        if (effectiveDef >= 2) {
            RUNES.defend.forEach(r => allRunes.push({ rune: r, slotType: 'defend' }));
            RUNES.either.forEach(r => allRunes.push({ rune: r, slotType: 'defend' }));
        }
        const ownedRuneKeys = new Set([
            ...GS.runes.attack.map(r => r.effect + ':attack'),
            ...GS.runes.defend.map(r => r.effect + ':defend'),
        ]);
        const availableRunes = allRunes.filter(r => !ownedRuneKeys.has(r.rune.effect + ':' + r.slotType));
        const runeOffers = shuffle(availableRunes).slice(0, GS.act >= 2 ? 2 : 1);
        runeOffers.forEach(({ rune, slotType }) => {
            const price = GS.act >= 2 ? 80 : 100;
            all.push({
                title: `${rune.icon} ${rune.name}`, desc: `Rune (${slotType}) — sacrifices 1 ${slotType} slot`, price,
                type: 'RUNE', effect: rune.desc,
                action: () => {
                    GS.runes[slotType].push({ ...rune });
                    log(`Inscribed ${rune.name} on ${slotType} slot! ${rune.desc}`, 'info');
                },
            });
        });

        Shop.items = shuffle(all).slice(0, 6).map(item => ({
            ...item,
            price: applyDiscount(item.price)
        }));
    },

    render() {
        updateStats();
        const c = $('shop-cards');
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
                        Shop.render();
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
            <div class="card-title">🔄 Refresh Shop</div>
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
                Shop.render();
                log(`🔄 Shop refreshed!${refreshCost > 0 ? ` (-${refreshCost} gold)` : ' (free!)'}`, 'info');
            };
        }
        c.appendChild(refreshCard);
    },

    showUpgrade() {
        const c = $('shop-cards');
        c.innerHTML = '';

        GS.dice.forEach((die, i) => {
            const canUp = die.max < 12;
            const card = document.createElement('div');
            card.className = 'card' + (canUp ? '' : ' disabled');
            card.innerHTML = renderDieCard(die, i, {
                extraDesc: canUp ? `<div class="card-effect" style="text-align:center;">→ ${die.min+1}–${die.max+1}</div>` : '<div class="card-effect" style="text-align:center; color:var(--text-dim);">Max level</div>'
            });
            if (canUp) {
                card.onclick = () => {
                    upgradeDie(die);
                    log(`Upgraded die to ${die.min}-${die.max}!`, 'info');
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
    pool: [
        {
            text: 'A weathered treasure chest sits at a crossroads. The lock is rusted — it could be forced open, but something shifts inside...',
            choices: [
                { text: 'Open carefully (+35 gold)', action: () => { const g = gainGold(35); log(`+${g} gold`, 'info'); updateStats(); Game.nextFloor(); }},
                { text: 'Force it open (50%: +80 gold or -12 HP)', action: () => {
                    if (Math.random() < 0.5) { const g = gainGold(80); log(`Jackpot! +${g} gold`, 'info'); }
                    else { GS.hp -= 12; log('Trap! -12 HP', 'damage'); }
                    updateStats(); Game.nextFloor();
                }},
            ]
        },
        {
            text: 'An ancient shrine pulses with dim light. You feel power radiating from its altar — but power always demands a price.',
            choices: [
                { text: 'Pray for vitality (+10 Max HP)', action: () => { GS.maxHp += 10; GS.hp += 10; log('+10 Max HP', 'heal'); updateStats(); Game.nextFloor(); }},
                { text: 'Sacrifice blood for power (-10 HP, upgrade a die)', action: () => {
                    GS.hp -= 10; updateStats();
                    Events.showDieUpgrade();
                }},
            ]
        },
        {
            text: 'A wandering alchemist offers you a bubbling flask. "Drink," she says, "and accept what fortune gives."',
            choices: [
                { text: 'Drink (random: +15 HP, +3 ATK, or -8 HP)', action: () => {
                    const r = Math.random();
                    if (r < 0.4) { const h = heal(15); log(`Refreshing! +${h} HP`, 'heal'); }
                    else if (r < 0.8) { GS.buffs.damageBoost += 3; log('Power surges! +3 ATK', 'info'); }
                    else { GS.hp -= 8; log('Poison! -8 HP', 'damage'); }
                    updateStats(); Game.nextFloor();
                }},
                { text: 'Decline politely', action: () => { log('You walk on.', 'info'); Game.nextFloor(); }},
            ]
        },
        {
            text: 'A spectral blacksmith materializes before you. "One die," he whispers. "I can reshape it — make one face extraordinary."',
            choices: [
                { text: 'Accept (add a random face modifier to a die)', action: () => {
                    Events.showFaceModEvent();
                }},
                { text: 'Decline (+15 gold instead)', action: () => { const g = gainGold(15); log(`+${g} gold`, 'info'); updateStats(); Game.nextFloor(); }},
            ]
        },
    ],

    enter() {
        updateStats();
        const event = pick(Events.pool);
        const panel = $('event-panel');
        panel.innerHTML = `<div class="event-text">${event.text}</div>`;

        event.choices.forEach(ch => {
            const btn = document.createElement('button');
            btn.className = 'btn';
            btn.style.cssText = 'width:100%; text-align:left; margin:6px 0; padding:12px 16px;';
            btn.textContent = ch.text;
            btn.onclick = ch.action;
            panel.appendChild(btn);
        });

        show('screen-event');
    },

    showDieUpgrade() {
        const panel = $('event-panel');
        panel.innerHTML = '<div class="event-text">Choose a die to upgrade:</div><div class="card-grid" id="event-dice-cards"></div>';
        const c = $('event-dice-cards');

        GS.dice.forEach((die, i) => {
            const canUp = die.max < 12;
            const card = document.createElement('div');
            card.className = 'card' + (canUp ? '' : ' disabled');
            card.innerHTML = renderDieCard(die, i, {
                extraDesc: canUp ? `<div class="card-effect" style="text-align:center;">→ ${die.min+1}–${die.max+1}</div>` : '<div class="card-effect" style="text-align:center; color:var(--text-dim);">Max level</div>'
            });
            if (canUp) card.onclick = () => { upgradeDie(die); log(`Upgraded to ${die.min}-${die.max}!`, 'info'); updateStats(); Game.nextFloor(); };
            c.appendChild(card);
        });
    },

    showFaceModEvent() {
        const mod = pick(FACE_MODS);
        const panel = $('event-panel');
        panel.innerHTML = `<div class="event-text">The blacksmith offers: <strong style="color:${mod.color}">${mod.icon} ${mod.name}</strong> — ${mod.desc}<br><br>Choose a die:</div><div class="card-grid" id="event-dice-cards"></div>`;
        const c = $('event-dice-cards');

        GS.dice.forEach((die, i) => {
            const card = document.createElement('div');
            card.className = 'card';
            card.innerHTML = renderDieCard(die, i);
            card.onclick = () => Events.pickFaceForMod(die, mod);
            c.appendChild(card);
        });
    },

    pickFaceForMod(die, mod) {
        const panel = $('event-panel');
        panel.innerHTML = `<div class="event-text">Choose which face gets <strong style="color:${mod.color}">${mod.icon} ${mod.name}</strong>:</div>`;

        const preview = document.createElement('div');
        preview.style.cssText = 'text-align:center; margin:8px 0 12px; padding:8px; background:var(--bg-surface); border:1px solid var(--border); border-radius:8px;';
        preview.innerHTML = `<div style="display:flex; gap:2px; flex-wrap:wrap; justify-content:center;">${renderFaceStrip(die)}</div>`;
        panel.appendChild(preview);

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
                </div>
            `;
            card.onclick = () => {
                die.faces = die.faces.filter(f => f.faceValue !== v);
                die.faces.push({ faceValue: v, modifier: mod });
                log(`Applied ${mod.name} to face ${v}!`, 'info');
                updateStats(); Game.nextFloor();
            };
            grid.appendChild(card);
        });
        panel.appendChild(grid);
    }
};

// ════════════════════════════════════════════════════════════
//  REST (between acts)
// ════════════════════════════════════════════════════════════
const Rest = {
    enter() {
        updateStats();
        $('rest-title').textContent = `Act ${GS.act - 1} Complete — Rest & Prepare`;

        const content = $('rest-content');
        content.innerHTML = '';

        const panel = document.createElement('div');
        panel.className = 'rest-panel';
        panel.innerHTML = `
            <h3>A moment of respite...</h3>
            <p>You find shelter between the dungeon's depths. Choose how to spend your time.</p>
        `;
        content.appendChild(panel);

        const grid = document.createElement('div');
        grid.className = 'card-grid';

        const healAmt = Math.floor(GS.maxHp * 0.4);
        const card1 = document.createElement('div');
        card1.className = 'card';
        card1.innerHTML = `<div class="card-title">🔥 Rest by the Fire</div><div class="card-desc">Heal ${healAmt} HP (40% of max)</div>`;
        card1.onclick = () => {
            const h = heal(healAmt);
            log(`Rested: +${h} HP`, 'heal');
            updateStats();
            Game.enterFloor();
        };
        grid.appendChild(card1);

        const hasTrimmable = GS.dice.some(d => d.faceValues && d.faceValues.length > 3);
        if (hasTrimmable) {
            const card2 = document.createElement('div');
            card2.className = 'card';
            card2.innerHTML = `<div class="card-title">✂️ Trim a Die</div><div class="card-desc">Remove a face from a die (increases consistency)</div>`;
            card2.onclick = () => Rest.showFaceTrim();
            grid.appendChild(card2);
        }

        const card3 = document.createElement('div');
        card3.className = 'card';
        card3.innerHTML = `<div class="card-title">⬆️ Train</div><div class="card-desc">Upgrade one die's range +1/+1</div>`;
        card3.onclick = () => Rest.showUpgrade();
        grid.appendChild(card3);

        if (GS.passives.canMerge && GS.dice.length >= 4) {
            const card4 = document.createElement('div');
            card4.className = 'card';
            card4.innerHTML = `<div class="card-title">🔥 Forge Merge</div><div class="card-desc">Fuse 2 dice into 1 powerful die</div>`;
            card4.onclick = () => {
                Rewards.showMergeSelection(() => Game.enterFloor());
            };
            grid.appendChild(card4);
        }

        if (GS.dice.length >= 5) {
            const card5 = document.createElement('div');
            card5.className = 'card';
            card5.innerHTML = `<div class="card-title">🔨 Sacrifice Dice</div><div class="card-desc">Destroy 3 dice → +1 Attack or Defend slot (${GS.dice.length} dice)</div>`;
            card5.onclick = () => {
                Rewards.showDiceSacrifice(() => Game.enterFloor());
            };
            grid.appendChild(card5);
        }

        content.appendChild(grid);
        show('screen-rest');
    },

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
        back.onclick = () => Rest.enter();
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
                Game.enterFloor();
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
        content.innerHTML = '<div class="section-title">Upgrade a Die</div>';
        const grid = document.createElement('div');
        grid.className = 'card-grid';

        GS.dice.forEach((die, i) => {
            const canUp = die.max < 12;
            const card = document.createElement('div');
            card.className = 'card' + (canUp ? '' : ' disabled');
            card.innerHTML = renderDieCard(die, i, {
                extraDesc: canUp ? `<div class="card-effect" style="text-align:center;">→ ${die.min+1}–${die.max+1}</div>` : '<div class="card-effect" style="text-align:center; color:var(--text-dim);">Max level</div>'
            });
            if (canUp) card.onclick = () => {
                upgradeDie(die);
                log(`Upgraded to ${die.min}-${die.max}!`, 'info');
                updateStats();
                Game.enterFloor();
            };
            grid.appendChild(card);
        });

        const back = document.createElement('div');
        back.className = 'card';
        back.innerHTML = `<div class="card-title">← Back</div>`;
        back.onclick = () => Rest.enter();
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
        const effectiveAtk = GS.slots.attack - GS.runes.attack.length;
        const effectiveDef = GS.slots.defend - GS.runes.defend.length;

        let html = '';

        html += `<div style="background:var(--bg-surface); border:1px solid var(--border); border-radius:8px; padding:14px; margin-bottom:12px;">
            <div style="font-family:JetBrains Mono,monospace; font-size:0.8em; color:var(--gold); margin-bottom:8px;">⚙️ STATS</div>
            <div style="display:grid; grid-template-columns:1fr 1fr; gap:4px 16px; font-size:0.85em;">
                <span>❤️ HP: ${GS.hp}/${GS.maxHp}${GS.regenStacks > 0 ? ` (+${GS.regenStacks} regen)` : ''}</span>
                <span>💰 Gold: ${GS.gold}</span>
                <span>⚔️ Atk Slots: ${effectiveAtk} (${GS.slots.attack} total)</span>
                <span>🛡️ Def Slots: ${effectiveDef} (${GS.slots.defend} total)</span>
                <span>🎲 Dice: ${GS.dice.length}</span>
                <span>🔄 Rerolls: ${GS.rerolls}</span>
                <span>⚔️ Dmg Boost: +${GS.buffs.damageBoost}</span>
                <span>🛡️ Armor: ${GS.buffs.armor}</span>
            </div>
        </div>`;

        html += `<div style="background:var(--bg-surface); border:1px solid var(--border); border-radius:8px; padding:14px; margin-bottom:12px;">
            <div style="font-family:JetBrains Mono,monospace; font-size:0.8em; color:var(--gold); margin-bottom:8px;">🎲 DICE (${GS.dice.length})</div>`;
        GS.dice.forEach((die, i) => {
            const faces = die.faceValues ? die.faceValues.join(', ') : `${die.min}-${die.max}`;
            const mods = die.faces.length ? die.faces.map(f => `<span style="color:${f.modifier.color};" title="${f.modifier.name}: ${f.modifier.desc}">  ${f.faceValue}:${f.modifier.icon}${f.modifier.name}</span>`).join('') : '<span style="opacity:0.4;">no mods</span>';
            html += `<div style="margin:4px 0; font-size:0.82em; padding:4px 0; border-bottom:1px solid rgba(255,255,255,0.05);">
                <strong>d${die.faceValues ? die.faceValues.length : die.sides}</strong> [${faces}] ${mods}
            </div>`;
        });
        html += `</div>`;

        if (GS.runes.attack.length > 0 || GS.runes.defend.length > 0) {
            html += `<div style="background:var(--bg-surface); border:1px solid #8040a0; border-radius:8px; padding:14px; margin-bottom:12px;">
                <div style="font-family:JetBrains Mono,monospace; font-size:0.8em; color:#bb77ff; margin-bottom:8px;">🔮 RUNES</div>`;
            GS.runes.attack.forEach(r => {
                html += `<div style="font-size:0.82em; margin:3px 0;">${r.icon} <strong>${r.name}</strong> <span style="color:var(--attack-color);">(attack)</span> — ${r.desc}</div>`;
            });
            GS.runes.defend.forEach(r => {
                html += `<div style="font-size:0.82em; margin:3px 0;">${r.icon} <strong>${r.name}</strong> <span style="color:var(--defend-color);">(defend)</span> — ${r.desc}</div>`;
            });
            html += `</div>`;
        }

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
//  INIT — expose modules on window for inline onclick handlers
// ════════════════════════════════════════════════════════════
window.Game = Game;
window.Combat = Combat;
window.Rewards = Rewards;
window.Shop = Shop;
window.Events = Events;
window.Rest = Rest;
window.Inventory = Inventory;

// Prevent right-click context menu on combat screen
document.getElementById('screen-combat').addEventListener('contextmenu', e => e.preventDefault());

updateStats();
