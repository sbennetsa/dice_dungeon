// ════════════════════════════════════════════════════════════
//  ENGINE — dice, rendering, drag-and-drop
// ════════════════════════════════════════════════════════════
import { GS, $, log, gainGold, rand } from './state.js';
import { getFloorType } from './constants.js';

export function getSlotById(id) {
    return GS.slots.attack.find(s => s.id === id)
        || GS.slots.defend.find(s => s.id === id)
        || null;
}

// ════════════════════════════════════════════════════════════
//  DICE CREATION & MANAGEMENT
// ════════════════════════════════════════════════════════════
let dieIdCounter = 0;
export function resetDieIdCounter(n = 0) { dieIdCounter = n; }

export function createDieFromFaces(faceValues) {
    const sorted = [...faceValues].sort((a, b) => a - b);
    return { id: dieIdCounter++, min: sorted[0], max: sorted[sorted.length - 1], sides: sorted.length, faceValues: sorted, value: 0, rolled: false, faces: [], location: 'pool' };
}

export function createDie(min = 1, max = 6, sides = 6) {
    const step = (max - min) / (sides - 1);
    const faceValues = Array.from({length: sides}, (_, i) => Math.round(min + step * i));
    return { id: dieIdCounter++, min, max, sides, faceValues, value: 0, rolled: false, faces: [], location: 'pool' };
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
    const slotsStr = `${GS.slots.attack.length}⚔️ ${GS.slots.defend.length}🛡️`;
    const runeCount = [...GS.slots.attack, ...GS.slots.defend].filter(s => s.rune).length;
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
    if (GS.artifacts && GS.artifacts.some(a => a.effect === 'battleFury') && (GS.furyCharges || 0) > 0) {
        const ready = GS.furyCharges >= 3;
        tags.push(`🔥 Fury ${GS.furyCharges}/3${ready ? ' ✓' : ''}`);
    }
    c.innerHTML = tags.map(t => `<span class="buff-tag">${t}</span>`).join('');
}

// ════════════════════════════════════════════════════════════
//  DRAG & DROP / TOUCH ALLOCATION
// ════════════════════════════════════════════════════════════
let dragDie = null;

// Reroll mode: player clicks which dice to reroll
let rerollMode = false;
export function enterRerollMode() { rerollMode = true; renderCombatDice(); }
export function exitRerollMode() { rerollMode = false; renderCombatDice(); }

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
    const effectiveAtkSlots = GS.slots.attack.length;
    const effectiveDefSlots = GS.slots.defend.length;
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
    GS.slots.attack.forEach(slot => {
        const slotEl = document.createElement('div');
        slotEl.className = 'individual-slot';
        if (slot.rune) {
            const ri = document.createElement('div');
            ri.className = 'slot-rune-indicator';
            ri.style.color = slot.rune.color;
            ri.title = `${slot.rune.name}: ${slot.rune.desc}`;
            ri.textContent = slot.rune.icon;
            slotEl.appendChild(ri);
        }
        const allocatedDie = GS.allocated.attack.find(d => d.slotId === slot.id);
        if (allocatedDie) {
            slotEl.appendChild(makeDieElement(allocatedDie, 'attack'));
        } else {
            const ph = document.createElement('div');
            ph.className = 'slot-placeholder';
            ph.innerHTML = '<span style="font-family: JetBrains Mono, monospace;">⚔️</span>';
            slotEl.appendChild(ph);
        }
        atkDice.appendChild(slotEl);
    });

    const defDice = $('slot-defend-dice');
    defDice.innerHTML = '';
    GS.slots.defend.forEach(slot => {
        const slotEl = document.createElement('div');
        slotEl.className = 'individual-slot';
        if (slot.rune) {
            const ri = document.createElement('div');
            ri.className = 'slot-rune-indicator';
            ri.style.color = slot.rune.color;
            ri.title = `${slot.rune.name}: ${slot.rune.desc}`;
            ri.textContent = slot.rune.icon;
            slotEl.appendChild(ri);
        }
        const allocatedDie = GS.allocated.defend.find(d => d.slotId === slot.id);
        if (allocatedDie) {
            slotEl.appendChild(makeDieElement(allocatedDie, 'defend'));
        } else {
            const ph = document.createElement('div');
            ph.className = 'slot-placeholder';
            ph.innerHTML = '<span style="font-family: JetBrains Mono, monospace;">🛡️</span>';
            slotEl.appendChild(ph);
        }
        defDice.appendChild(slotEl);
    });

    updateSlotTotals();

    const rerollBtn = $('btn-reroll-mode');
    const rerollCancelBtn = $('btn-reroll-cancel');
    const canReroll = GS.rolled && GS.rerollsLeft > 0;
    if (rerollBtn) {
        rerollBtn.style.display = (canReroll && !rerollMode) ? 'inline-block' : 'none';
        rerollBtn.textContent = `🔄 Reroll (${GS.rerollsLeft})`;
    }
    if (rerollCancelBtn) {
        rerollCancelBtn.style.display = rerollMode ? 'inline-block' : 'none';
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

    const tryReroll = () => {
        if (!die.rolled || GS.rerollsLeft <= 0) return false;
        if (die.slotId && getSlotById(die.slotId)?.rune?.effect === 'leaden') return false; // Leaden slot: cannot reroll
        GS.rerollsLeft--;
        if (GS.rerollsLeft === 0) rerollMode = false;
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
        el.title = 'Left-click → Attack | Right-click → Defend';

        el.onmousedown = e => {
            e.preventDefault();
            if (rerollMode) { tryReroll(); return; }
            if (e.button === 1 && tryReroll()) return;
            if (e.button === 0) allocateDie(die, 'attack');
            else if (e.button === 2) allocateDie(die, 'defend');
        };

        // Touch: tap=attack, long-press=defend, drag=drag-to-slot; in reroll mode: tap=reroll
        el.ontouchstart = e => {
            e.preventDefault();
            if (rerollMode) { tryReroll(); touchHandled = true; return; }
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
        el.title = 'Click to return to pool';
        el.onmousedown = e => {
            e.preventDefault();
            if (rerollMode) { tryReroll(); return; }
            if (e.button === 1 && tryReroll()) return;
            die.location = 'pool';
            GS.allocated.attack = GS.allocated.attack.filter(d => d.id !== die.id);
            GS.allocated.defend = GS.allocated.defend.filter(d => d.id !== die.id);
            renderCombatDice();
        };

        // Touch in slot: single-tap=return, drag=drag-to-pool; in reroll mode: tap=reroll
        let lastSlotTap = 0;
        el.ontouchstart = e => {
            e.preventDefault();
            if (rerollMode) { tryReroll(); touchHandled = true; return; }
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

    const inLeadenSlot = die.slotId && getSlotById(die.slotId)?.rune?.effect === 'leaden';
    if (rerollMode && die.rolled && context !== 'auto' && !inLeadenSlot) {
        el.classList.add('reroll-selectable');
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
    if (GS.allocated[slot].length >= GS.slots[slot].length) return;
    GS.allocated.attack = GS.allocated.attack.filter(d => d.id !== die.id);
    GS.allocated.defend = GS.allocated.defend.filter(d => d.id !== die.id);
    const occupiedIds = GS.allocated[slot].map(d => d.slotId);
    const targetSlot = GS.slots[slot].find(s => !occupiedIds.includes(s.id));
    if (!targetSlot) return;
    die.slotId = targetSlot.id;
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

    // Pack Tactics: pre-compute bonus per attack die (face mods + passive)
    const ptAtkFace = GS.allocated.attack.reduce((sum, d) => {
        const f = getActiveFace(d); const mo = f && !f.modifier.autoFire ? f.modifier : null;
        return mo?.effect === 'packTactics' ? sum + mo.value : sum;
    }, 0);
    const ptAtkPerDie = ptAtkFace + (GS.passives.packTactics || 0);
    // Non-utility attack count for Titan's Blow
    const nonUtilAtkCount = GS.allocated.attack.filter(d => { const f = getActiveFace(d); return !f?.modifier?.autoFire; }).length;

    GS.allocated.attack.forEach(d => {
        const face = getActiveFace(d);
        const m = face && !face.modifier.autoFire ? face.modifier : null;
        const baseVal = d.value + ptAtkPerDie;  // pack tactics lifts each die's effective value
        let dieContrib = 0;
        if (m) {
            if (m.effect === 'slotMultiply') { atkMultiplier *= m.value; dieContrib = baseVal; }
            else if (m.effect === 'slotAdd') { dieContrib = baseVal + m.value * atkCount; }
            else if (m.effect === 'packTactics') { dieContrib = baseVal; }  // bonus already in baseVal
            else if (m.effect === 'volley') { dieContrib = baseVal + (atkCount >= 3 ? m.value : 0); }
            else if (m.effect === 'threshold') { dieContrib = baseVal >= m.value ? baseVal * 2 : baseVal; }
            else { dieContrib = baseVal; }
        } else {
            dieContrib = baseVal;
        }
        // Per-slot rune effects
        const atkDieRune = getSlotById(d.slotId)?.rune;
        if (atkDieRune?.effect === 'amplifier') dieContrib *= 2;
        if (atkDieRune?.effect === 'titanBlow' && nonUtilAtkCount === 1) dieContrib *= 3;
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
    if (GS.passives.swarmMaster) atkTotal += GS.passives.swarmMaster * atkCount;
    if (GS.passives.volley && atkCount >= 3) atkTotal += GS.passives.volley;
    if (GS.passives.threshold) {
        GS.allocated.attack.forEach(d => { if (d.value >= 8) atkTotal += Math.floor(d.value * 0.5); });
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

    // Pack Tactics: pre-compute bonus per defend die (face mods only — passive is attack-side)
    const ptDefFace = GS.allocated.defend.reduce((sum, d) => {
        const f = getActiveFace(d); const mo = f && !f.modifier.autoFire ? f.modifier : null;
        return mo?.effect === 'packTactics' ? sum + mo.value : sum;
    }, 0);
    // Non-utility defend count for Titan's Blow
    const nonUtilDefCount = GS.allocated.defend.filter(d => { const f = getActiveFace(d); return !f?.modifier?.autoFire; }).length;

    GS.allocated.defend.forEach(d => {
        const face = getActiveFace(d);
        const m = face && !face.modifier.autoFire ? face.modifier : null;
        const baseVal = d.value + ptDefFace;
        let dieContrib = 0;
        if (m) {
            if (m.effect === 'slotMultiply') { defMultiplier *= m.value; dieContrib = baseVal; }
            else if (m.effect === 'slotAdd') { dieContrib = baseVal + m.value * defCount; }
            else if (m.effect === 'packTactics') { dieContrib = baseVal; }  // bonus already in baseVal
            else if (m.effect === 'volley') { dieContrib = baseVal + (defCount >= 3 ? m.value : 0); }
            else if (m.effect === 'threshold') { dieContrib = baseVal >= m.value ? baseVal * 2 : baseVal; }
            else if (m.effect === 'defAdd') { dieContrib = baseVal + m.value; }
            else { dieContrib = baseVal; }
        } else {
            dieContrib = baseVal;
        }
        // Per-slot rune effects
        const defDieRune = getSlotById(d.slotId)?.rune;
        if (defDieRune?.effect === 'amplifier') dieContrib *= 2;
        if (defDieRune?.effect === 'titanBlow' && nonUtilDefCount === 1) dieContrib *= 3;
        if (defDieRune?.effect === 'leaden') dieContrib *= 2;
        // Echo Stone: first allocated die counts twice
        if (hasEcho && echoId !== null && d.id === echoId) dieContrib += d.value;
        defTotal += dieContrib;
    });

    defBonus += GS.buffs.armor;
    defBonus += GS.artifacts.filter(a => a.effect === 'goldenAegis').reduce((s, a) => s + Math.floor(GS.gold / a.value), 0);
    if (GS.passives.swarmMaster) defTotal += GS.passives.swarmMaster * defCount;
    if (GS.passives.volley && defCount >= 3) defTotal += GS.passives.volley;
    if (GS.passives.threshold) {
        GS.allocated.defend.forEach(d => { if (d.value >= 8) defTotal += Math.floor(d.value * 0.5); });
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
