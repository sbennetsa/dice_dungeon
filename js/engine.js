// ════════════════════════════════════════════════════════════
//  ENGINE — dice, rendering, drag-and-drop
// ════════════════════════════════════════════════════════════
import { GS, $, log, gainGold, rand } from './state.js';
import { getFloorType } from './constants.js';

// ════════════════════════════════════════════════════════════
//  DICE CREATION & MANAGEMENT
// ════════════════════════════════════════════════════════════
let dieIdCounter = 0;
export function resetDieIdCounter(n = 0) { dieIdCounter = n; }

export function createDieFromFaces(faceValues) {
    const sorted = [...faceValues].sort((a, b) => a - b);
    return { id: dieIdCounter++, min: sorted[0], max: sorted[sorted.length - 1], sides: sorted.length, faceValues: sorted, value: 0, rolled: false, faces: [], location: 'pool', rune: null };
}

export function createDie(min = 1, max = 6, sides = 6) {
    const step = (max - min) / (sides - 1);
    const faceValues = Array.from({length: sides}, (_, i) => Math.round(min + step * i));
    return { id: dieIdCounter++, min, max, sides, faceValues, value: 0, rolled: false, faces: [], location: 'pool', rune: null };
}

export function upgradeDie(die) {
    if (die.max >= 12) return;
    die.min++; die.max++;
    const step = (die.max - die.min) / (die.faceValues.length - 1);
    die.faceValues = Array.from({length: die.faceValues.length}, (_, i) => Math.round(die.min + step * i));
    die.faces = die.faces.map(f => {
        const oldVal = f.faceValue;
        const closest = die.faceValues.reduce((best, v) => Math.abs(v - oldVal) < Math.abs(best - oldVal) ? v : best);
        return { ...f, faceValue: closest };
    });
}

export function rollSingleDie(die) {
    let fIdx = Math.floor(Math.random() * die.faceValues.length);
    let val = die.faceValues[fIdx];
    // Precision Lens: roll twice, keep higher
    if (GS.artifacts.some(a => a.effect === 'precisionLens')) {
        const fIdx2 = Math.floor(Math.random() * die.faceValues.length);
        const val2 = die.faceValues[fIdx2];
        if (val2 > val) { val = val2; fIdx = fIdx2; }
    }
    die.value = val;
    die.rolled = true;
    // Volatile face mod: replace value with random(1, max×2)
    const activeFace = die.faces.find(f => f.faceValue === val);
    if (activeFace && activeFace.modifier.effect === 'volatile') {
        die.value = rand(1, die.max * 2);
    }
    // Gambler's Coin: apply coin flip bonus/penalty
    if (GS.gamblerCoinBonus) die.value = Math.max(1, die.value + GS.gamblerCoinBonus);
    // infuseFloor: minimum roll floor
    if (die.infuseFloor && die.value < die.infuseFloor) {
        die.value = die.infuseFloor;
    }
}

export function getActiveFace(die) {
    if (!die.rolled || !die.faces.length) return null;
    return die.faces.find(f => f.faceValue === die.value) || null;
}

// ════════════════════════════════════════════════════════════
//  RENDERING
// ════════════════════════════════════════════════════════════
export function renderFaceStrip(die, opts = {}) {
    const { highlightVal, showArrow, arrowMod } = opts;
    return die.faceValues.map(v => {
        const existing = die.faces.find(f => f.faceValue === v);
        const isHighlight = highlightVal === v;
        const bg = isHighlight ? 'rgba(212,165,52,0.25)' : 'rgba(255,255,255,0.05)';
        const border = isHighlight ? 'var(--gold)' : existing ? existing.modifier.color + '66' : 'rgba(255,255,255,0.1)';
        const modIcon = existing ? `<div style="font-size:0.65em; margin-top:1px;">${existing.modifier.icon}</div>` : '';
        const arrow = isHighlight && showArrow && arrowMod ? `<div style="font-size:0.6em; color:var(--green-bright);">→${arrowMod.icon}</div>` : '';
        return `<div style="display:inline-flex; flex-direction:column; align-items:center; justify-content:center;
            width:38px; height:44px; border-radius:6px; border:1.5px solid ${border}; background:${bg};
            font-family:JetBrains Mono,monospace; font-weight:700; font-size:0.95em; margin:2px;">
            ${v}${modIcon}${arrow}
        </div>`;
    }).join('');
}

export function renderDieCard(die, index, opts = {}) {
    const { clickable = true, extraDesc = '' } = opts;
    const facesHtml = renderFaceStrip(die);
    return `
        <div class="card-title">d${die.faceValues.length}: ${die.min}–${die.max}</div>
        <div style="display:flex; gap:2px; flex-wrap:wrap; justify-content:center; margin:8px 0;">${facesHtml}</div>
        ${extraDesc ? `<div class="card-desc">${extraDesc}</div>` : ''}
    `;
}

export function show(screenId) {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    $(screenId).classList.add('active');
}

export function updateStats() {
    const sets = [
        ['s-floor','s-level','s-xp','s-hp','s-gold'],
        ['r-floor',null,null,'r-hp','r-gold'],
        [null,null,null,'sh-hp','sh-gold'],
        ['e-floor',null,null,'e-hp','e-gold'],
        [null,null,null,'rest-hp','rest-gold'],
    ];
    sets.forEach(([fl,lv,xp,hp,gd]) => {
        if (fl) $(fl).textContent = GS.floor;
        if (lv) $(lv).textContent = GS.level;
        if (xp) $(xp).textContent = `${GS.xp}/${GS.xpNext}`;
        if (hp) {
            const el = $(hp);
            const regenStr = GS.regenStacks > 0 ? ` <span style="color:#60d080; font-size:0.8em;">+${GS.regenStacks}❤️</span>` : '';
            el.innerHTML = `${GS.hp}/${GS.maxHp}${regenStr}`;
        }
        if (gd) $(gd).textContent = GS.gold;
    });
    const slotsStr = `${GS.slots.attack}⚔️ ${GS.slots.defend}🛡️`;
    const runeCount = GS.dice.filter(d => d.rune).length;
    const runeStr = runeCount > 0 ? ` 🔮${runeCount}` : '';
    const diceStr = `${GS.dice.filter(d => !d.midasTemp).length}`;
    const rerollStr = GS.rerolls > 0 ? ` 🔄${GS.rerolls}` : '';
    ['s-dice', 'sh-dice'].forEach(id => { const el = $(id); if (el) el.innerHTML = `${diceStr} <span style="opacity:0.6; font-size:0.8em">(${slotsStr}${runeStr}${rerollStr})</span>`; });
    renderFloorProgress();
    renderArtifacts();
    renderBuffs();
}

export function renderFloorProgress() {
    const c = $('floor-progress');
    if (!c) return;
    let html = '<div class="floor-progress">';
    for (let act = 1; act <= 3; act++) {
        html += `<span class="act-label">Act ${act}</span>`;
        const start = (act - 1) * 5 + 1;
        for (let f = start; f < start + 5; f++) {
            const type = getFloorType(f);
            let cls = 'floor-pip';
            if (f < GS.floor) cls += ' completed';
            if (f === GS.floor) cls += ' current';
            if (type === 'boss') cls += ' boss';
            if (type === 'shop') cls += ' shop-pip';
            html += `<div class="${cls}" title="Floor ${f}: ${type}"></div>`;
        }
    }
    html += '</div>';
    c.outerHTML = html.replace('<div class="floor-progress"', `<div class="floor-progress" id="floor-progress"`);
}

export function renderArtifacts() {
    const c = $('artifacts-display');
    if (GS.artifacts.length === 0) { c.style.display = 'none'; return; }
    c.style.display = 'flex';
    c.innerHTML = '<span class="artifacts-label">Relics:</span>' +
        GS.artifacts.map(a => `<span class="tooltip-wrapper"><span class="artifact-pip">${a.icon}</span><span class="tooltip-text">${a.name}: ${a.desc}</span></span>`).join('');
}

export function renderBuffs() {
    const c = $('buffs-display');
    const tags = [];
    if (GS.buffs.damageBoost > 0) tags.push(`⚔️ +${GS.buffs.damageBoost} ATK`);
    if (GS.buffs.armor > 0) tags.push(`🛡️ ${GS.buffs.armor} Armor`);
    c.innerHTML = tags.map(t => `<span class="buff-tag">${t}</span>`).join('');
}

// ════════════════════════════════════════════════════════════
//  DRAG & DROP / TOUCH ALLOCATION
// ════════════════════════════════════════════════════════════
let dragDie = null;

// Touch drag state
let touchGhost = null;
let touchDragDie = null;
let touchOriginSlot = null;
let touchDragging = false;
let touchStartX = 0;
let touchStartY = 0;
let touchLongPressTimer = null;
let touchHandled = false;
let touchLastTap = {};  // keyed by die id

function _touchMove(e) {
    if (!touchDragDie) return;
    const touch = e.touches[0];
    const dx = touch.clientX - touchStartX;
    const dy = touch.clientY - touchStartY;
    if (!touchDragging && Math.sqrt(dx*dx + dy*dy) > 15) {
        // Entered drag mode — cancel long-press timer, create ghost
        clearTimeout(touchLongPressTimer);
        touchLongPressTimer = null;
        touchHandled = true;
        touchDragging = true;
        if (!touchGhost) {
            // Find the source element
            const srcEl = document.querySelector(`.die[data-die-id="${touchDragDie.id}"]`);
            touchGhost = (srcEl || document.createElement('div')).cloneNode(true);
            touchGhost.removeAttribute('data-die-id');
            touchGhost.style.cssText = `position:fixed; pointer-events:none; opacity:0.85; z-index:999;
                width:68px; height:68px; transform:scale(1.1);
                left:${touch.clientX - 34}px; top:${touch.clientY - 34}px;`;
            document.body.appendChild(touchGhost);
            if (srcEl) srcEl.style.opacity = '0.3';
        }
    }
    if (touchDragging && touchGhost) {
        e.preventDefault();
        touchGhost.style.left = `${touch.clientX - 34}px`;
        touchGhost.style.top  = `${touch.clientY - 34}px`;
    }
}

function _touchEnd(e) {
    if (!touchDragDie) return;
    clearTimeout(touchLongPressTimer);
    touchLongPressTimer = null;

    if (touchDragging && touchGhost) {
        touchGhost.remove(); touchGhost = null;
        // Restore opacity
        document.querySelectorAll('.die').forEach(d => { d.style.opacity = ''; });
        const touch = e.changedTouches[0];
        const target = document.elementFromPoint(touch.clientX, touch.clientY);
        const dropSlot = target?.closest('#slot-attack') ? 'attack'
                       : target?.closest('#slot-defend') ? 'defend'
                       : target?.closest('#dice-pool')   ? 'pool'
                       : null;
        if (dropSlot && dropSlot !== touchOriginSlot) {
            if (dropSlot === 'pool') {
                touchDragDie.location = 'pool';
                GS.allocated.attack = GS.allocated.attack.filter(d => d.id !== touchDragDie.id);
                GS.allocated.defend = GS.allocated.defend.filter(d => d.id !== touchDragDie.id);
                renderCombatDice();
            } else {
                allocateDie(touchDragDie, dropSlot);
            }
        }
    }

    touchDragDie = null;
    touchOriginSlot = null;
    touchDragging = false;
}

// Attach document-level touch listeners once
document.addEventListener('touchmove', _touchMove, { passive: false });
document.addEventListener('touchend', _touchEnd);

export function renderCombatDice() {
    const autoDice = GS.dice.filter(d => d.rolled && d.location === 'auto');
    const poolDice = GS.dice.filter(d => d.location === 'pool');

    const pool = $('dice-pool');
    pool.innerHTML = '';
    poolDice.forEach(d => pool.appendChild(makeDieElement(d, 'pool')));

    const rollHint = $('roll-hint');
    const allRolled = GS.dice.every(d => d.rolled);
    const effectiveAtkSlots = GS.slots.attack;
    const effectiveDefSlots = GS.slots.defend;
    const atkFull = GS.allocated.attack.length >= effectiveAtkSlots;
    const defFull = GS.allocated.defend.length >= effectiveDefSlots;
    const hasAttack = GS.allocated.attack.length > 0;
    const hasDefend = GS.allocated.defend.length > 0;
    const noneInPool = !GS.dice.some(d => d.location === 'pool');
    const allSlotsFull = atkFull && defFull;
    const hasAnyAllocated = hasAttack || hasDefend;
    const canExecute = allRolled && (hasAnyAllocated || noneInPool || allSlotsFull);

    const atkCountEl = $('atk-slot-count');
    const defCountEl = $('def-slot-count');
    if (atkCountEl) {
        atkCountEl.textContent = `(${GS.allocated.attack.length}/${effectiveAtkSlots})`;
        atkCountEl.className = atkFull ? 'slot-count full' : 'slot-count';
    }
    if (defCountEl) {
        defCountEl.textContent = `(${GS.allocated.defend.length}/${effectiveDefSlots})`;
        defCountEl.className = defFull ? 'slot-count full' : 'slot-count';
    }

    if (!GS.rolled) {
        pool.classList.add('clickable-roll');
        pool.classList.remove('clickable-execute');
        pool.onclick = (e) => { if (!GS.rolled && (e.target === pool || e.target.id === 'roll-hint')) window.Combat.roll(); };
        if (rollHint) { rollHint.style.display = 'block'; rollHint.textContent = 'Click here to roll'; rollHint.style.color = 'var(--gold)'; }
    } else {
        pool.classList.remove('clickable-roll');
        pool.classList.remove('clickable-execute');
        pool.onclick = null;
        const remaining = GS.dice.filter(d => d.location === 'pool').length;
        if (rollHint && remaining > 0) {
            rollHint.style.display = 'block';
            rollHint.textContent = `${remaining} dice to place`;
            rollHint.style.color = 'var(--text-dim)';
        } else if (rollHint) {
            rollHint.style.display = 'none';
        }
    }

    const execBtn = $('btn-execute');
    if (execBtn) execBtn.style.display = canExecute ? 'inline-block' : 'none';

    const returnBtn = $('btn-return-all');
    if (returnBtn) returnBtn.style.display = (allRolled && hasAnyAllocated) ? 'inline-block' : 'none';

    const autoTray = $('autofire-tray');
    const autoDiceEl = $('autofire-dice');
    if (autoDice.length > 0) {
        autoTray.style.display = 'block';
        autoDiceEl.innerHTML = '';
        autoDice.forEach(d => autoDiceEl.appendChild(makeDieElement(d, 'auto')));
    } else {
        autoTray.style.display = 'none';
    }

    const auraTray = $('aura-tray');
    const auraDiceEl = $('aura-dice');
    if (auraTray) {
        if (GS.ascendedDice && GS.ascendedDice.length > 0) {
            auraTray.style.display = 'block';
            auraDiceEl.innerHTML = GS.ascendedDice.map(a =>
                `<span style="background:rgba(255,200,0,0.08);border:1px solid rgba(255,200,0,0.2);border-radius:4px;padding:2px 8px;margin:2px;display:inline-block;">🌟 ${a.label}: +${a.bonus} all slots</span>`
            ).join('');
        } else {
            auraTray.style.display = 'none';
        }
    }

    const atkDice = $('slot-attack-dice');
    atkDice.innerHTML = '';
    GS.allocated.attack.forEach(d => atkDice.appendChild(makeDieElement(d, 'attack')));
    for (let i = GS.allocated.attack.length; i < effectiveAtkSlots; i++) {
        const ph = document.createElement('div');
        ph.className = 'slot-placeholder';
        ph.innerHTML = '<span style="font-family: JetBrains Mono, monospace;">⚔️</span>';
        atkDice.appendChild(ph);
    }

    const defDice = $('slot-defend-dice');
    defDice.innerHTML = '';
    GS.allocated.defend.forEach(d => defDice.appendChild(makeDieElement(d, 'defend')));
    for (let i = GS.allocated.defend.length; i < effectiveDefSlots; i++) {
        const ph = document.createElement('div');
        ph.className = 'slot-placeholder';
        ph.innerHTML = '<span style="font-family: JetBrains Mono, monospace;">🛡️</span>';
        defDice.appendChild(ph);
    }

    updateSlotTotals();

    const rerollEl = $('reroll-counter');
    if (rerollEl) {
        if (GS.rerolls > 0) {
            rerollEl.style.display = 'inline';
            rerollEl.textContent = `🔄 ${GS.rerollsLeft}/${GS.rerolls}`;
            rerollEl.style.color = GS.rerollsLeft > 0 ? 'var(--gold)' : 'var(--text-dim)';
        } else {
            rerollEl.style.display = 'none';
        }
    }
}

export function makeDieElement(die, context) {
    const el = document.createElement('div');
    el.className = 'die';
    el.dataset.dieId = die.id;
    if (!die.rolled) el.classList.add('unrolled');

    const face = getActiveFace(die);
    if (face) {
        el.classList.add('special');
        el.style.borderColor = face.modifier.color;
        el.style.boxShadow = `0 0 10px ${face.modifier.color}40`;
    }

    const rangeLabel = `${die.min}-${die.max}`;
    let valueDisplay = die.rolled ? (face ? face.modifier.icon : die.value) : '?';

    let faceIcon = '';
    if (die.faces.length > 0) {
        if (!die.rolled) {
            faceIcon = `<span class="die-face-icon">${die.faces.map(f=>f.modifier.icon).join('')}</span>`;
        } else if (!face) {
            faceIcon = `<span class="die-face-icon" style="opacity:0.4">${die.faces.map(f=>f.modifier.icon).join('')}</span>`;
        }
    }

    el.innerHTML = `<span class="die-label">${rangeLabel}</span>${valueDisplay}${faceIcon}`;
    el.oncontextmenu = e => e.preventDefault();

    // Rune indicator: coloured outline + floating icon
    if (die.rune) {
        el.style.position = 'relative';
        el.style.overflow = 'visible';
        el.style.outline = `2px solid ${die.rune.color}`;
        el.style.boxShadow = (el.style.boxShadow || '') + `, 0 0 8px ${die.rune.color}60`;
        const runeLabel = document.createElement('div');
        runeLabel.style.cssText = `position:absolute;top:-9px;left:50%;transform:translateX(-50%);font-size:0.6em;z-index:5;line-height:1;pointer-events:none;`;
        runeLabel.title = `${die.rune.name}: ${die.rune.desc}`;
        runeLabel.textContent = die.rune.icon;
        el.appendChild(runeLabel);
    }

    const tryReroll = () => {
        if (!die.rolled || GS.rerollsLeft <= 0) return false;
        if (die.rune?.effect === 'leaden') return false; // Leaden: cannot reroll
        GS.rerollsLeft--;
        const oldVal = die.value;
        rollSingleDie(die);
        const newFace = getActiveFace(die);
        if (newFace && newFace.modifier.autoFire) {
            GS.allocated.attack = GS.allocated.attack.filter(d => d.id !== die.id);
            GS.allocated.defend = GS.allocated.defend.filter(d => d.id !== die.id);
            die.location = 'auto';
            const m = newFace.modifier;
            if (m.effect === 'heal') { if (!GS.regenStacks) GS.regenStacks = 0; GS.regenStacks += m.value; log(`${m.icon} Auto: +${m.value} regen (${GS.regenStacks} total)`, 'heal'); }
            if (m.effect === 'lifesteal') { GS.autoLifesteal += m.value; log(`${m.icon} Lifesteal ${Math.round(m.value * 100)}% armed`, 'info'); }
            if (m.effect === 'gold') { const g = gainGold(m.value); log(`${m.icon} Gold Rush: +${g} gold`, 'info'); }
            if (m.effect === 'scavGold') { const g = gainGold(m.value); log(`${m.icon} Scavenger: +${g} gold`, 'info'); }
        }
        log(`🔄 Reroll: ${oldVal} → ${die.value} (${GS.rerollsLeft} left)`, 'info');
        renderCombatDice();
        return true;
    };

    if (die.rolled && context === 'pool') {
        el.style.cursor = 'pointer';
        el.title = GS.rerollsLeft > 0 ? 'L-click → Attack | R-click → Defend | Tap 🔄 to Reroll' : 'Left-click → Attack | Right-click → Defend';

        el.onmousedown = e => {
            e.preventDefault();
            if (e.button === 1 && tryReroll()) return;
            if (e.button === 0) allocateDie(die, 'attack');
            else if (e.button === 2) allocateDie(die, 'defend');
        };

        // Touch: tap=attack, long-press=defend, double-tap=reroll, drag=drag-to-slot
        el.ontouchstart = e => {
            e.preventDefault();
            const now = Date.now();
            const lastTap = touchLastTap[die.id] || 0;
            if (now - lastTap < 300 && tryReroll()) {
                touchLastTap[die.id] = 0;
                touchHandled = true;
                return;
            }
            touchLastTap[die.id] = now;
            touchHandled = false;
            touchDragDie = die;
            touchOriginSlot = 'pool';
            touchDragging = false;
            touchStartX = e.touches[0].clientX;
            touchStartY = e.touches[0].clientY;
            touchLongPressTimer = setTimeout(() => {
                touchHandled = true;
                touchDragDie = null;
                allocateDie(die, 'defend');
            }, 400);
        };
        el.ontouchend = e => {
            e.preventDefault();
            if (touchDragging) return; // handled by _touchEnd
            clearTimeout(touchLongPressTimer);
            touchLongPressTimer = null;
            if (!touchHandled) allocateDie(die, 'attack');
            touchHandled = false;
            touchDragDie = null;
        };
        el.ontouchmove = () => { /* handled by document listener */ };

        el.draggable = true;
        el.ondragstart = e => {
            dragDie = die;
            el.classList.add('dragging');
            e.dataTransfer.effectAllowed = 'move';
        };
        el.ondragend = () => { el.classList.remove('dragging'); dragDie = null; };

    } else if (die.rolled && (context === 'attack' || context === 'defend')) {
        el.style.cursor = 'pointer';
        el.title = GS.rerollsLeft > 0 ? 'Click to return | Tap 🔄 to reroll' : 'Click to return to pool';
        el.onmousedown = e => {
            e.preventDefault();
            if (e.button === 1 && tryReroll()) return;
            die.location = 'pool';
            GS.allocated.attack = GS.allocated.attack.filter(d => d.id !== die.id);
            GS.allocated.defend = GS.allocated.defend.filter(d => d.id !== die.id);
            renderCombatDice();
        };

        // Touch in slot: double-tap=reroll, single-tap=return, drag=drag-to-pool
        let lastSlotTap = 0;
        el.ontouchstart = e => {
            e.preventDefault();
            const now = Date.now();
            if (now - lastSlotTap < 300 && tryReroll()) { lastSlotTap = 0; return; }
            lastSlotTap = now;
            touchDragDie = die;
            touchOriginSlot = context;
            touchDragging = false;
            touchStartX = e.touches[0].clientX;
            touchStartY = e.touches[0].clientY;
            touchHandled = false;
            touchLongPressTimer = null;
        };
        el.ontouchend = e => {
            e.preventDefault();
            if (touchDragging) return;
            if (!touchHandled) {
                setTimeout(() => {
                    if (lastSlotTap > 0) {
                        die.location = 'pool';
                        GS.allocated.attack = GS.allocated.attack.filter(d => d.id !== die.id);
                        GS.allocated.defend = GS.allocated.defend.filter(d => d.id !== die.id);
                        renderCombatDice();
                    }
                }, 320);
            }
            touchHandled = false;
            touchDragDie = null;
        };
        el.ontouchmove = () => { /* handled by document listener */ };

        el.draggable = true;
        el.ondragstart = e => {
            dragDie = die;
            el.classList.add('dragging');
            e.dataTransfer.effectAllowed = 'move';
        };
        el.ondragend = () => { el.classList.remove('dragging'); dragDie = null; };

    } else if (context === 'auto') {
        el.style.opacity = '0.7';
        el.style.cursor = 'default';
        el.title = 'Auto-triggered effect';
    }

    if (die.rolled && GS.rerollsLeft > 0 && context !== 'auto' && die.rune?.effect !== 'leaden') {
        const rerollBadge = document.createElement('div');
        rerollBadge.style.cssText = `
            position:absolute; bottom:-14px; right:-14px; width:36px; height:36px;
            background:rgba(212,165,52,0.95); border-radius:50%; display:flex;
            align-items:center; justify-content:center; font-size:0.85em;
            cursor:pointer; z-index:5; border:2px solid rgba(255,255,255,0.5);
            box-shadow: 0 0 8px rgba(212,165,52,0.7);
            touch-action:none;
        `;
        rerollBadge.textContent = '🔄';
        rerollBadge.title = `Reroll this die (${GS.rerollsLeft} left)`;
        rerollBadge.onclick = (e) => { e.stopPropagation(); e.preventDefault(); tryReroll(); };
        rerollBadge.onmousedown = (e) => { e.stopPropagation(); };
        rerollBadge.ontouchstart = (e) => { e.stopPropagation(); e.preventDefault(); tryReroll(); };
        el.style.position = 'relative';
        el.style.overflow = 'visible';
        el.appendChild(rerollBadge);
    }

    return el;
}

export function setupDropZones() {
    ['slot-attack', 'slot-defend'].forEach(slotId => {
        const slot = $(slotId);
        const type = slotId === 'slot-attack' ? 'attack' : 'defend';
        slot.ondragover = e => { e.preventDefault(); slot.classList.add('drag-over'); };
        slot.ondragleave = () => slot.classList.remove('drag-over');
        slot.ondrop = e => {
            e.preventDefault();
            slot.classList.remove('drag-over');
            if (dragDie) allocateDie(dragDie, type);
        };
    });

    const pool = $('dice-pool');
    pool.ondragover = e => { e.preventDefault(); pool.classList.add('drag-over'); };
    pool.ondragleave = () => pool.classList.remove('drag-over');
    pool.ondrop = e => {
        e.preventDefault();
        pool.classList.remove('drag-over');
        if (dragDie) {
            dragDie.location = 'pool';
            GS.allocated.attack = GS.allocated.attack.filter(d => d.id !== dragDie.id);
            GS.allocated.defend = GS.allocated.defend.filter(d => d.id !== dragDie.id);
            renderCombatDice();
        }
    };
}

export function allocateDie(die, slot) {
    if (GS.playerDebuffs && GS.playerDebuffs.slotDisabled === slot) {
        log(`🔒 ${slot} slot is disabled!`, 'damage');
        return;
    }
    // Berserker's Mask: max 1 die in defend
    if (slot === 'defend' && GS.artifacts.some(a => a.effect === 'berserkersMask') && GS.allocated.defend.length >= 1) {
        log("😤 Berserker's Mask: only 1 die in defense!", 'damage');
        return;
    }
    const effectiveSlots = GS.slots[slot];
    if (GS.allocated[slot].length >= effectiveSlots) return;
    GS.allocated.attack = GS.allocated.attack.filter(d => d.id !== die.id);
    GS.allocated.defend = GS.allocated.defend.filter(d => d.id !== die.id);
    die.location = slot;
    GS.allocated[slot].push(die);
    // Echo Stone: track first die allocated this turn
    if (GS.artifacts.some(a => a.effect === 'echoStone') && GS.echoStoneDieId === null) {
        GS.echoStoneDieId = die.id;
    }
    renderCombatDice();
}

export function updateSlotTotals() {
    // ── ATTACK TOTAL ──
    let atkTotal = 0;
    let atkMultiplier = 1;
    let atkBonus = 0;
    const atkCount = GS.allocated.attack.length;
    const echoId = GS.echoStoneDieId;
    const hasEcho = GS.artifacts.some(a => a.effect === 'echoStone');

    GS.allocated.attack.forEach(d => {
        const face = getActiveFace(d);
        const m = face && !face.modifier.autoFire ? face.modifier : null;
        let dieContrib = 0;
        if (m) {
            if (m.effect === 'slotMultiply') { atkMultiplier *= m.value; dieContrib = d.value; }
            else if (m.effect === 'slotAdd') { atkBonus += m.value * atkCount; }
            else if (m.effect === 'packTactics') { atkBonus += m.value * atkCount; dieContrib = d.value; }
            else if (m.effect === 'volley') { if (atkCount >= 3) atkBonus += m.value; dieContrib = d.value; }
            else if (m.effect === 'threshold') { dieContrib = d.value >= m.value ? d.value * 2 : d.value; }
            else { dieContrib = d.value; }
        } else {
            dieContrib = d.value;
        }
        // Per-die rune effects
        if (d.rune?.effect === 'amplifier') dieContrib *= 2;
        if (d.rune?.effect === 'titanBlow' && atkCount === 1) dieContrib *= 3;
        // Echo Stone: first allocated die counts twice
        if (hasEcho && echoId !== null && d.id === echoId) dieContrib += d.value;
        atkTotal += dieContrib;
    });

    atkBonus += GS.buffs.damageBoost;
    const goldScalePreview = GS.artifacts.filter(a => a.effect === 'goldScaleDmg').reduce((s, a) => s + Math.floor(GS.gold / a.value), 0);
    if (goldScalePreview > 0) atkBonus += goldScalePreview;
    if (GS.passives.goldDmg) atkBonus += Math.floor(GS.gold / GS.passives.goldDmg);
    atkBonus += GS.artifacts.filter(a => a.effect === 'hydrasCrest').reduce((s, a) => s + a.value * GS.dice.length, 0);
    atkBonus += GS.enemyStatus?.mark || 0;
    atkBonus += GS.artifacts.filter(a => a.effect === 'festeringWound').reduce((s, a) => s + a.value * (GS.enemy?.poison || 0), 0);
    if (GS.passives.packTactics) atkBonus += GS.passives.packTactics * atkCount;
    if (GS.passives.swarmMaster) atkBonus += GS.passives.swarmMaster * atkCount;
    if (GS.passives.volley && atkCount >= 3) atkBonus += GS.passives.volley;
    if (GS.passives.threshold) {
        GS.allocated.attack.forEach(d => { if (d.value >= 8) atkBonus += Math.floor(d.value * 0.5); });
    }
    if (GS.passives.titanWrath && atkCount === 1) atkMultiplier *= 3;
    if (GS.artifacts.some(a => a.effect === 'berserkersMask')) atkMultiplier *= 1.5;
    if (GS.artifacts.some(a => a.effect === 'bloodPact')) atkMultiplier *= 1.3;
    if (atkCount >= 4 && GS.artifacts.some(a => a.effect === 'swarmBanner')) atkMultiplier *= 1.5;

    // TransformBuffs
    atkMultiplier *= (GS.transformBuffs?.furyChambered || 1);

    let finalAtk = Math.floor(atkTotal * atkMultiplier) + atkBonus;
    if (GS.artifacts.some(a => a.effect === 'sharpeningStone')) finalAtk = Math.ceil(finalAtk * 1.5);
    $('attack-total').textContent = finalAtk;

    let atkSummary = '';
    if (atkMultiplier > 1) atkSummary += `×${atkMultiplier.toFixed(1).replace('.0','')} `;
    if (atkBonus > 0) atkSummary += `+${atkBonus} bonus `;
    $('attack-summary').textContent = atkSummary;

    // ── DEFEND TOTAL ──
    let defTotal = 0;
    let defMultiplier = 1;
    let defBonus = 0;
    const defCount = GS.allocated.defend.length;

    GS.allocated.defend.forEach(d => {
        const face = getActiveFace(d);
        const m = face && !face.modifier.autoFire ? face.modifier : null;
        let dieContrib = 0;
        if (m) {
            if (m.effect === 'slotMultiply') { defMultiplier *= m.value; dieContrib = d.value; }
            else if (m.effect === 'slotAdd') { defBonus += m.value * defCount; }
            else if (m.effect === 'packTactics') { defBonus += m.value * defCount; dieContrib = d.value; }
            else if (m.effect === 'volley') { if (defCount >= 3) defBonus += m.value; dieContrib = d.value; }
            else if (m.effect === 'threshold') { dieContrib = d.value >= m.value ? d.value * 2 : d.value; }
            else if (m.effect === 'defAdd') { defBonus += m.value; dieContrib = d.value; }
            else { dieContrib = d.value; }
        } else {
            dieContrib = d.value;
        }
        // Per-die rune effects
        if (d.rune?.effect === 'amplifier') dieContrib *= 2;
        if (d.rune?.effect === 'titanBlow' && defCount === 1) dieContrib *= 3;
        if (d.rune?.effect === 'leaden') dieContrib *= 2;
        // Echo Stone: first allocated die counts twice
        if (hasEcho && echoId !== null && d.id === echoId) dieContrib += d.value;
        defTotal += dieContrib;
    });

    defBonus += GS.buffs.armor;
    defBonus += GS.artifacts.filter(a => a.effect === 'goldenAegis').reduce((s, a) => s + Math.floor(GS.gold / a.value), 0);
    if (GS.passives.swarmMaster) defBonus += GS.passives.swarmMaster * defCount;
    if (GS.passives.volley && defCount >= 3) defBonus += GS.passives.volley;
    if (GS.passives.threshold) {
        GS.allocated.defend.forEach(d => { if (d.value >= 8) defBonus += Math.floor(d.value * 0.5); });
    }
    if (GS.passives.titanWrath && defCount === 1) defMultiplier *= 3;
    if (defCount >= 4 && GS.artifacts.some(a => a.effect === 'swarmBanner')) defMultiplier *= 1.5;

    // TransformBuffs
    defMultiplier *= (GS.transformBuffs?.fortified || 1);

    const finalDef = Math.floor(defTotal * defMultiplier) + defBonus;
    $('defend-total').textContent = finalDef;

    let defSummary = '';
    if (defMultiplier > 1) defSummary += `×${defMultiplier.toFixed(1).replace('.0','')} `;
    if (defBonus > 0) defSummary += `+${defBonus} armor `;
    $('defend-summary').textContent = defSummary;
}
