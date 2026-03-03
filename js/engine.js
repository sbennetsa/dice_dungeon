// ════════════════════════════════════════════════════════════
//  ENGINE — dice, rendering, drag-and-drop
// ════════════════════════════════════════════════════════════
import { GS, $, log, gainGold, rand } from './state.js';
import { getFloorType } from './constants.js';

export function getSlotById(id) {
    return GS.slots.strike.find(s => s.id === id)
        || GS.slots.guard.find(s => s.id === id)
        || null;
}

export function getSlotRunes(slotId) {
    return getSlotById(slotId)?.runes || [];
}

// ════════════════════════════════════════════════════════════
//  DICE CREATION & MANAGEMENT
// ════════════════════════════════════════════════════════════
let dieIdCounter = 0;
export function resetDieIdCounter(n = 0) { dieIdCounter = n; }

export function createDieFromFaces(faceValues) {
    const sorted = [...faceValues].sort((a, b) => a - b);
    return { id: dieIdCounter++, min: sorted[0], max: sorted[sorted.length - 1], sides: sorted.length, faceValues: sorted, value: 0, rolled: false, rolledFaceIndex: -1, faceMods: [], location: 'pool' };
}

export function createDie(min = 1, max = 6, sides = 6) {
    const step = (max - min) / (sides - 1);
    const faceValues = Array.from({length: sides}, (_, i) => Math.round(min + step * i));
    return { id: dieIdCounter++, min, max, sides, faceValues, value: 0, rolled: false, rolledFaceIndex: -1, faceMods: [], location: 'pool' };
}

export function createUtilityDie(utDef) {
    const sorted = [...utDef.faceValues].sort((a, b) => a - b);
    return {
        id: dieIdCounter++, min: sorted[0], max: sorted[sorted.length - 1],
        sides: sorted.length, faceValues: sorted, value: 0, rolled: false, rolledFaceIndex: -1,
        faceMods: [], location: 'pool',
        dieType: utDef.id, name: utDef.name, icon: utDef.icon,
    };
}

export function upgradeDie(die) {
    die.min++; die.max++;
    const step = (die.max - die.min) / (die.faceValues.length - 1);
    die.faceValues = Array.from({length: die.faceValues.length}, (_, i) => Math.round(die.min + step * i));
    // faceMods use faceIndex (array position) so they survive upgrades with no remapping
}

export function rollSingleDie(die) {
    if (!die.faceValues || die.faceValues.length === 0) {
        die.value = 0;
        die.rolled = true;
        return;
    }
    // Mimic Die: copy a random non-mimic die's faceValues AND type, roll those faces
    if (die.dieType === 'mimic') {
        const others = GS.dice.filter(d => d.id !== die.id && d.dieType !== 'mimic' && d.faceValues?.length > 0);
        if (others.length > 0) {
            const target = others[Math.floor(Math.random() * others.length)];
            const fIdx = Math.floor(Math.random() * target.faceValues.length);
            die.value = target.faceValues[fIdx];
            die._mimickedType = target.dieType ?? null; // null = normal die
            die.rolled = true;
            die.rolledFaceIndex = fIdx;
            if (GS.gamblerCoinBonus) die.value = Math.max(1, die.value + GS.gamblerCoinBonus);
            if (die.infuseFloor && die.value < die.infuseFloor) die.value = die.infuseFloor;
            if (die.cursed) die.value = Math.max(1, die.value - 1);
            return;
        }
        die._mimickedType = null; // fallback: roll own faceValues below
    }
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
    die.rolledFaceIndex = fIdx;
    // Volatile face mod: if this roll landed on a face with the volatile mod, randomise
    const volatileMod = die.faceMods.find(m => m.mod.effect === 'volatile' && m.faceIndex === fIdx);
    if (volatileMod) {
        die.value = rand(1, die.max * 2);
    }
    // Gambler's Coin: apply coin flip bonus/penalty
    if (GS.gamblerCoinBonus) die.value = Math.max(1, die.value + GS.gamblerCoinBonus);
    // infuseFloor: minimum roll floor
    if (die.infuseFloor && die.value < die.infuseFloor) {
        die.value = die.infuseFloor;
    }
    // Starting Curse (Cursed elite modifier): all dice roll -1, minimum 1
    if (die.cursed) die.value = Math.max(1, die.value - 1);
}

export function getActiveFace(die) {
    if (!die.rolled || !die.faceMods.length) return null;
    const hit = die.faceMods.find(m => m.faceIndex === die.rolledFaceIndex);
    if (hit) return { faceValue: die.faceValues[hit.faceIndex], modifier: hit.mod };
    return null;
}

// ════════════════════════════════════════════════════════════
//  RENDERING
// ════════════════════════════════════════════════════════════
export function renderFaceStrip(die, opts = {}) {
    const { highlightVal, showArrow, arrowMod } = opts;
    const isAmp = die.dieType === 'amplifier';
    const isPct = ['gold','poison'].includes(die.dieType);
    return die.faceValues.map((v, i) => {
        const modEntry = die.faceMods.find(m => m.faceIndex === i);
        const hasMod = !!modEntry;
        const mod = hasMod ? modEntry.mod : null;
        const isHighlight = highlightVal === v;
        const bg = isHighlight ? 'rgba(212,165,52,0.25)' : 'rgba(255,255,255,0.05)';
        const border = isHighlight ? 'var(--gold)' : mod ? mod.color + '66' : 'rgba(255,255,255,0.1)';
        const modIcon = mod ? `<div style="font-size:0.65em; margin-top:1px;">${mod.icon}</div>` : '';
        const arrow = isHighlight && showArrow && arrowMod ? `<div style="font-size:0.6em; color:var(--green-bright);">→${arrowMod.icon}</div>` : '';
        const label = isAmp ? `×${v / 100}` : isPct ? `${v}%` : v;
        return `<div style="display:inline-flex; flex-direction:column; align-items:center; justify-content:center;
            width:38px; height:44px; border-radius:6px; border:1.5px solid ${border}; background:${bg};
            font-family:JetBrains Mono,monospace; font-weight:700; font-size:${(isAmp || isPct) ? '0.8em' : '0.95em'}; margin:2px;">
            ${label}${modIcon}${arrow}
        </div>`;
    }).join('');
}

export function renderDieCard(die, index, opts = {}) {
    const { clickable = true, extraDesc = '' } = opts;
    const facesHtml = renderFaceStrip(die);
    const utLabel = die.dieType ? `<div style="font-size:0.7em; color:var(--gold); font-family:JetBrains Mono,monospace; margin-bottom:2px;">${die.icon || ''} ${die.name || die.dieType.toUpperCase()}</div>` : '';
    const rangeText = die.dieType === 'amplifier' ? `×${die.min / 100}–×${die.max / 100}` : (die.dieType === 'gold' || die.dieType === 'poison') ? `${die.min}%–${die.max}%` : `d${die.faceValues.length}: ${die.min}–${die.max}`;
    return `
        ${utLabel}
        <div class="card-title">${rangeText}</div>
        <div style="display:flex; gap:2px; flex-wrap:wrap; justify-content:center; margin:8px 0;">${facesHtml}</div>
        ${extraDesc ? `<div class="card-desc">${extraDesc}</div>` : ''}
    `;
}

export function show(screenId) {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    $(screenId).classList.add('active');
}

export function renderConsumables() {
    for (let i = 0; i < GS.consumableSlots; i++) {
        const slot = document.getElementById(`cslot-${i}`);
        if (!slot) continue;
        const c = GS.consumables[i] || null;
        slot.innerHTML = '';
        slot.className = 'consumable-slot';
        slot.onclick = null;

        if (!c) {
            slot.innerHTML = '<span style="opacity:0.2; font-size:0.7em; font-family:JetBrains Mono,monospace;">+</span>';
            continue;
        }

        slot.classList.add('filled');

        const rarityColor = c.rarity === 'rare' ? '#e8c97a' : c.rarity === 'uncommon' ? '#7ab4e8' : '#aaa';
        const catTag = c.category === 'potion' ? 'Potion' : c.category === 'scroll' ? 'Scroll' : 'Charm';

        slot.innerHTML = `${c.icon}<span class="c-tooltip"><span style="color:${rarityColor}; font-size:0.85em;">[${catTag}]</span> <b>${c.name}</b><br><span style="opacity:0.75;">${c.description}</span></span>`;

        if (c.category === 'charm') {
            slot.classList.add('charm-slot');
            // Pulse when close to trigger threshold
            if (c.id === 'smoke' && GS.hp > 0 && GS.hp / GS.maxHp < 0.30) slot.classList.add('pulse');
            if (c.id === 'ward'  && GS.hp > 0 && GS.hp / GS.maxHp < 0.25) slot.classList.add('pulse');
        } else {
            // Glow when player's turn is active and consumable not yet used
            if (GS.rolled && !GS.consumableUsedThisTurn) {
                slot.classList.add('usable');
            }
            slot.onclick = () => {
                if (window.Combat && typeof window.Combat.promptUseConsumable === 'function') {
                    window.Combat.promptUseConsumable(i);
                }
            };
        }
    }
}

export function updateStats() {
    const sets = [
        ['s-floor','s-level','s-xp','s-hp','s-gold'],
        ['r-floor',null,null,'r-hp','r-gold'],
        ['bs-floor',null,null,'bs-hp','bs-gold'],
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
    const hpFill = $('player-hp-fill');
    if (hpFill) {
        hpFill.style.width = `${Math.max(0, (GS.hp / GS.maxHp) * 100)}%`;
        $('player-hp-text').textContent = `${GS.hp}/${GS.maxHp}`;
    }
    const slotsStr = `${GS.slots.strike.length}⚔️ ${GS.slots.guard.length}🛡️`;
    const runeCount = [...GS.slots.strike, ...GS.slots.guard].reduce((n, s) => n + (s.runes?.length || 0), 0);
    const runeStr = runeCount > 0 ? ` 🔮${runeCount}` : '';
    const diceStr = `${GS.dice.length}`;
    const rerollStr = GS.rerolls > 0 ? ` 🔄${GS.rerolls}` : '';
    ['s-dice', 'sh-dice'].forEach(id => { const el = $(id); if (el) el.innerHTML = `${diceStr} <span style="opacity:0.6; font-size:0.8em">(${slotsStr}${runeStr}${rerollStr})</span>`; });
    renderFloorProgress();
    renderArtifacts();
    renderBuffs();
}

export function renderFloorProgress() {
    const c = $('floor-progress');
    if (!c) return;
    const typeIcons = { combat: '\u2694\uFE0F', boss: '\uD83D\uDC80', event: '\u2753', shop: '\uD83D\uDED2' };
    let html = '<div class="floor-progress" id="floor-progress">';
    for (let act = 1; act <= 3; act++) {
        html += `<span class="act-label">A${act}</span>`;
        const start = (act - 1) * 5 + 1;
        for (let f = start; f < start + 5; f++) {
            const type = getFloorType(f);
            let cls = 'floor-pip';
            if (f < GS.floor) cls += ' completed';
            if (f === GS.floor) cls += ' current';
            cls += ` floor-pip--${type}`;

            let tooltip = `Floor ${f}: ${type}`;
            const fb = _getFloorBP(f);
            if (fb && fb.enemy && f <= GS.floor) {
                tooltip = `F${f}: ${fb.enemy.name}`;
                if (fb.environment) tooltip += ` (${fb.environment.icon} ${fb.environment.name})`;
            }

            const icon = typeIcons[type] || '';
            html += `<div class="${cls}" title="${tooltip}"><span class="floor-pip-icon">${icon}</span></div>`;
        }
        if (act < 3) {
            const restDone = GS.floor > act * 5;
            html += `<span class="floor-rest-pip${restDone ? ' completed' : ''}">🏕️</span>`;
        }
    }
    html += '</div>';
    c.outerHTML = html;
}

function _getFloorBP(floor) {
    if (!GS.blueprint) return null;
    const actIndex = Math.min(Math.ceil(floor / 5) - 1, 2);
    const act = GS.blueprint.acts[actIndex];
    if (!act) return null;
    const baseFloor = actIndex * 5 + 1;
    return act.floors[floor - baseFloor] || null;
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

// Sort mode: cycles through 'none' → 'desc' → 'asc'
let sortMode = 'none';
export function sortPoolDice() {
    if (sortMode === 'none') sortMode = 'desc';
    else if (sortMode === 'desc') sortMode = 'asc';
    else sortMode = 'none';
    renderCombatDice();
}
export function resetSortMode() { sortMode = 'none'; }

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
        const dropSlot = target?.closest('#slot-attack') ? 'strike'
                       : target?.closest('#slot-defend') ? 'guard'
                       : target?.closest('#dice-pool')   ? 'pool'
                       : null;
        if (dropSlot && dropSlot !== touchOriginSlot) {
            if (dropSlot === 'pool') {
                touchDragDie.location = 'pool';
                GS.allocated.strike = GS.allocated.strike.filter(d => d.id !== touchDragDie.id);
                GS.allocated.guard = GS.allocated.guard.filter(d => d.id !== touchDragDie.id);
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
    const sortedPool = sortMode === 'none' ? poolDice
        : [...poolDice].sort((a, b) => sortMode === 'desc' ? b.value - a.value : a.value - b.value);
    sortedPool.forEach(d => pool.appendChild(makeDieElement(d, 'pool')));

    const rollHint = $('roll-hint');
    const allRolled = GS.dice.every(d => d.rolled);
    const effectiveStrSlots = GS.slots.strike.length;
    const effectiveGrdSlots = GS.slots.guard.length;
    const strFull = GS.allocated.strike.length >= effectiveStrSlots;
    const grdFull = GS.allocated.guard.length >= effectiveGrdSlots;
    const hasStrike = GS.allocated.strike.length > 0;
    const hasGuard = GS.allocated.guard.length > 0;
    const noneInPool = !GS.dice.some(d => d.location === 'pool');
    const allSlotsFull = strFull && grdFull;
    const hasAnyAllocated = hasStrike || hasGuard;
    const canExecute = allRolled && (hasAnyAllocated || noneInPool || allSlotsFull);

    const atkCountEl = $('atk-slot-count');
    const defCountEl = $('def-slot-count');
    if (atkCountEl) {
        atkCountEl.textContent = `(${GS.allocated.strike.length}/${effectiveStrSlots})`;
        atkCountEl.className = strFull ? 'slot-count full' : 'slot-count';
    }
    if (defCountEl) {
        defCountEl.textContent = `(${GS.allocated.guard.length}/${effectiveGrdSlots})`;
        defCountEl.className = grdFull ? 'slot-count full' : 'slot-count';
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

    // Auto-tray retired (no auto-fire face mods remain)
    const autoTray = $('autofire-tray');
    if (autoTray) autoTray.style.display = 'none';

    // Ascended aura — slim inline bar
    const auraTray = $('aura-tray');
    const auraDiceEl = $('aura-dice');
    if (auraTray) {
        if (GS.ascendedDice && GS.ascendedDice.length > 0) {
            auraTray.style.display = 'flex';
            const totalBonus = GS.ascendedDice.reduce((s, a) => s + a.bonus, 0);
            auraDiceEl.innerHTML = `<span class="aura-chip">🌟 +${totalBonus} all slots</span>`;
        } else {
            auraTray.style.display = 'none';
        }
    }

    const sealedIds = (GS.playerDebuffs?.disabledSlots || []).map(ds => ds.slotId);

    const atkDice = $('slot-attack-dice');
    atkDice.innerHTML = '';
    GS.slots.strike.forEach(slot => {
        const slotEl = document.createElement('div');
        const isSealed = sealedIds.includes(slot.id);
        slotEl.className = 'individual-slot' + (isSealed ? ' slot-sealed' : '');
        if (slot.runes?.length && !isSealed) {
            const ri = document.createElement('div');
            ri.className = 'slot-rune-indicator';
            ri.style.color = slot.runes[0].color;
            ri.title = slot.runes.map(r => `${r.name}: ${r.desc}`).join(' | ');
            ri.textContent = slot.runes.map(r => r.icon).join('');
            slotEl.appendChild(ri);
        }
        if (isSealed) {
            const ph = document.createElement('div');
            ph.className = 'slot-placeholder';
            ph.innerHTML = '<span style="font-family: JetBrains Mono, monospace;">🔒</span>';
            ph.title = 'Sealed!';
            slotEl.appendChild(ph);
        } else {
            const allocatedDie = GS.allocated.strike.find(d => d.slotId === slot.id);
            if (allocatedDie) {
                slotEl.appendChild(makeDieElement(allocatedDie, 'strike'));
            } else {
                const ph = document.createElement('div');
                ph.className = 'slot-placeholder';
                ph.innerHTML = '<span style="font-family: JetBrains Mono, monospace;">⚔️</span>';
                slotEl.appendChild(ph);
            }
        }
        atkDice.appendChild(slotEl);
    });

    const defDice = $('slot-defend-dice');
    defDice.innerHTML = '';
    GS.slots.guard.forEach(slot => {
        const slotEl = document.createElement('div');
        const isSealed = sealedIds.includes(slot.id);
        slotEl.className = 'individual-slot' + (isSealed ? ' slot-sealed' : '');
        if (slot.runes?.length && !isSealed) {
            const ri = document.createElement('div');
            ri.className = 'slot-rune-indicator';
            ri.style.color = slot.runes[0].color;
            ri.title = slot.runes.map(r => `${r.name}: ${r.desc}`).join(' | ');
            ri.textContent = slot.runes.map(r => r.icon).join('');
            slotEl.appendChild(ri);
        }
        if (isSealed) {
            const ph = document.createElement('div');
            ph.className = 'slot-placeholder';
            ph.innerHTML = '<span style="font-family: JetBrains Mono, monospace;">🔒</span>';
            ph.title = 'Sealed!';
            slotEl.appendChild(ph);
        } else {
            const allocatedDie = GS.allocated.guard.find(d => d.slotId === slot.id);
            if (allocatedDie) {
                slotEl.appendChild(makeDieElement(allocatedDie, 'guard'));
            } else {
                const ph = document.createElement('div');
                ph.className = 'slot-placeholder';
                ph.innerHTML = '<span style="font-family: JetBrains Mono, monospace;">🛡️</span>';
                slotEl.appendChild(ph);
            }
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

    const sortBtn = $('btn-sort-dice');
    if (sortBtn) {
        const showSort = GS.rolled && poolDice.length >= 2;
        sortBtn.style.display = showSort ? 'inline-block' : 'none';
        sortBtn.textContent = sortMode === 'desc' ? '⇅ Value ↓' : sortMode === 'asc' ? '⇅ Value ↑' : '⇅ Sort';
        sortBtn.classList.toggle('sort-active', sortMode !== 'none');
    }
}

export function makeDieElement(die, context) {
    const el = document.createElement('div');
    el.className = 'die';
    el.dataset.dieId = die.id;
    if (!die.rolled) el.classList.add('unrolled');
    if (die.dieType) el.classList.add(`die-type-${die.dieType}`);

    const face = getActiveFace(die);
    if (face) {
        el.classList.add('special');
        el.style.borderColor = face.modifier.color;
        el.style.boxShadow = `0 0 10px ${face.modifier.color}40`;
        el.title = `${face.modifier.name}: ${face.modifier.desc}`;
    } else if (die.faceMods.length) {
        el.title = die.faceMods.map(m => `${m.mod.icon} ${m.mod.name}: ${m.mod.desc}`).join(' | ');
    }

    const isAmpDie = die.dieType === 'amplifier';
    const isPctDie = die.dieType === 'gold' || die.dieType === 'poison';
    const rangeLabel = isAmpDie ? `×${die.min / 100}-×${die.max / 100}`
        : isPctDie ? `${die.min}%-${die.max}%`
        : `${die.min}-${die.max}`;
    let valueDisplay = die.rolled ? (face ? `<span title="${face.modifier.name}: ${face.modifier.desc}">${face.modifier.icon}</span>` : (isAmpDie ? `×${die.value / 100}` : isPctDie ? `${die.value}%` : die.value)) : '?';

    // Per-die bonuses: ascend aura + volley + packTactics + swarmMaster (skip utility dice)
    let ascendBonus = 0, volleyBonus = 0, ptBonus = 0, swBonus = 0;
    if (die.rolled && !die.dieType) {
        if (GS.ascendedDice && GS.ascendedDice.length > 0)
            ascendBonus = GS.ascendedDice.reduce((s, a) => s + a.bonus, 0);
        if (GS.passives.volley && die.slotId) {
            const zone = die.slotId.startsWith('str') ? GS.allocated.strike : GS.allocated.guard;
            if (zone.length >= 4) volleyBonus = GS.passives.volley;
        }
        ptBonus = GS.passives.packTactics || 0;
        swBonus = GS.passives.swarmMaster || 0;
    }
    const passiveBonus = ptBonus + swBonus;
    const totalBonus = ascendBonus + volleyBonus + passiveBonus;
    let badges = '';
    if (totalBonus > 0 && !face) {
        valueDisplay = die.value + totalBonus;
    }
    if (ascendBonus > 0) {
        badges += `<span class="die-aura-badge">+${ascendBonus}</span>`;
        el.classList.add('aura-boosted');
    }
    if (volleyBonus > 0) {
        badges += `<span class="die-volley-badge">+${volleyBonus}</span>`;
        el.classList.add('volley-boosted');
    }
    if (passiveBonus > 0) {
        badges += `<span class="die-passive-badge">+${passiveBonus}</span>`;
    }

    let faceIcon = '';
    if (die.faceMods.length && !face) {
        const icons = die.faceMods.map(m => m.mod.icon).join('');
        const titles = die.faceMods.map(m => `${m.mod.name}: ${m.mod.desc}`).join(' | ');
        faceIcon = `<span class="die-face-icon" style="opacity:${die.rolled ? '0.4' : '1'}" title="${titles}">${icons}</span>`;
    }

    const rawDisplayLen = String(valueDisplay).replace(/<[^>]*>/g, '').length;
    if (rawDisplayLen >= 4) el.classList.add('die--xs');
    else if (rawDisplayLen >= 3) el.classList.add('die--sm');

    el.innerHTML = `<span class="die-label">${rangeLabel}</span>${valueDisplay}${faceIcon}${badges}`;
    el.oncontextmenu = e => e.preventDefault();

    const tryReroll = () => {
        if (!die.rolled || GS.rerollsLeft <= 0) return false;
        if (die.slotId && getSlotRunes(die.slotId).some(r => r.effect === 'leaden')) return false; // Leaden slot: cannot reroll
        GS.rerollsLeft--;
        if (GS.rerollsLeft === 0) rerollMode = false;
        const oldVal = die.value;
        rollSingleDie(die);
        log(`🔄 Reroll: ${oldVal} → ${die.value} (${GS.rerollsLeft} left)`, 'info');
        renderCombatDice();
        return true;
    };

    if (die.rolled && context === 'pool') {
        el.style.cursor = 'pointer';
        el.title = (el.title ? el.title + '\n\n' : '') + 'Left-click → Attack | Right-click → Defend';

        el.onmousedown = e => {
            e.preventDefault();
            if (rerollMode) { tryReroll(); return; }
            if (e.button === 1 && tryReroll()) return;
            if (e.button === 0) allocateDie(die, 'strike');
            else if (e.button === 2) allocateDie(die, 'guard');
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
                allocateDie(die, 'guard');
            }, 400);
        };
        el.ontouchend = e => {
            e.preventDefault();
            if (touchDragging) return; // handled by _touchEnd
            clearTimeout(touchLongPressTimer);
            touchLongPressTimer = null;
            if (!touchHandled) allocateDie(die, 'strike');
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

    } else if (die.rolled && (context === 'strike' || context === 'guard')) {
        el.style.cursor = 'pointer';
        el.title = 'Click to return to pool';
        el.onmousedown = e => {
            e.preventDefault();
            if (rerollMode) { tryReroll(); return; }
            if (e.button === 1 && tryReroll()) return;
            die.location = 'pool';
            GS.allocated.strike = GS.allocated.strike.filter(d => d.id !== die.id);
            GS.allocated.guard = GS.allocated.guard.filter(d => d.id !== die.id);
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
                        GS.allocated.strike = GS.allocated.strike.filter(d => d.id !== die.id);
                        GS.allocated.guard = GS.allocated.guard.filter(d => d.id !== die.id);
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

    const inLeadenSlot = die.slotId && getSlotRunes(die.slotId).some(r => r.effect === 'leaden');
    if (rerollMode && die.rolled && context !== 'auto' && !inLeadenSlot) {
        el.classList.add('reroll-selectable');
    }

    return el;
}

export function setupDropZones() {
    ['slot-attack', 'slot-defend'].forEach(slotId => {
        const slot = $(slotId);
        const type = slotId === 'slot-attack' ? 'strike' : 'guard';
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
            GS.allocated.strike = GS.allocated.strike.filter(d => d.id !== dragDie.id);
            GS.allocated.guard = GS.allocated.guard.filter(d => d.id !== dragDie.id);
            renderCombatDice();
        }
    };
}

export function allocateDie(die, slot) {
    // Berserker's Mask: max 1 die in guard
    if (slot === 'guard' && GS.artifacts.some(a => a.effect === 'berserkersMask') && GS.allocated.guard.length >= 1) {
        log("😤 Berserker's Mask: only 1 die in defense!", 'damage');
        return;
    }
    if (GS.allocated[slot].length >= GS.slots[slot].length) return;
    GS.allocated.strike = GS.allocated.strike.filter(d => d.id !== die.id);
    GS.allocated.guard = GS.allocated.guard.filter(d => d.id !== die.id);
    const sealedIds = (GS.playerDebuffs?.disabledSlots || []).map(ds => ds.slotId);
    const occupiedIds = GS.allocated[slot].map(d => d.slotId);
    const targetSlot = GS.slots[slot].find(s => !occupiedIds.includes(s.id) && !sealedIds.includes(s.id));
    if (!targetSlot) {
        if (sealedIds.some(id => GS.slots[slot].some(s => s.id === id))) {
            log(`🔒 No open ${slot} slots — some are sealed!`, 'damage');
        }
        return;
    }
    die.slotId = targetSlot.id;
    die.location = slot;
    GS.allocated[slot].push(die);
    // Lucky rune: +1 reroll per lucky rune when die is placed in a slot
    const luckyCount = (targetSlot.runes || []).filter(r => r.effect === 'lucky').length;
    if (luckyCount > 0) { GS.rerollsLeft += luckyCount; log(`🎰 Lucky rune: +${luckyCount} reroll!`, 'info'); }
    // Echo Stone: track first die allocated this turn
    if (GS.artifacts.some(a => a.effect === 'echoStone') && GS.echoStoneDieId === null) {
        GS.echoStoneDieId = die.id;
    }
    renderCombatDice();
}

function calcUtilityPreviews(allocated, isStrike = false) {
    let ampMul = 0;
    allocated.forEach(d => { if (d.dieType === 'amplifier') ampMul = Math.max(ampMul, d.value / 100); });
    const nonUtilCount = allocated.filter(d => !d.dieType).length;
    const ascendBonus = (GS.ascendedDice && GS.ascendedDice.length > 0) ? GS.ascendedDice.reduce((s, a) => s + a.bonus, 0) : 0;
    const volley = (GS.passives.volley && allocated.length >= 4) ? GS.passives.volley : 0;
    const packTactics = isStrike ? (GS.passives.packTactics || 0) : 0;
    const swarmMaster = GS.passives.swarmMaster || 0;
    let zoneBase = 0;
    allocated.forEach(d => {
        if (d.dieType) return;
        const runes = getSlotRunes(d.slotId);
        let val = d.value + packTactics + swarmMaster + ascendBonus + volley;
        let runeMul = 1;
        for (const r of runes) {
            if (r.effect === 'amplifier') runeMul *= 2;
            else if (r.effect === 'titanBlow' && nonUtilCount === 1) runeMul *= 3;
            else if (r.effect === 'leaden') runeMul *= 2;
        }
        val *= runeMul;
        if (ampMul > 0) val = Math.floor(val * ampMul);
        zoneBase += val;
    });
    let gold = 0, poison = 0, chill = 0, burn = 0, mark = 0;
    allocated.forEach(d => {
        const runes = getSlotRunes(d.slotId);
        const face = getActiveFace(d);
        const chainMul = face?.modifier?.effect === 'chainLightning' ? 2 : 1;
        if (d.dieType === 'gold' || d.dieType === 'poison') {
            const isAmplified = runes.some(r => r.effect === 'amplifier');
            let pct = (d.value / 100) * (isAmplified ? 2 : 1) * chainMul;
            const amount = Math.floor(zoneBase * pct);
            if (d.dieType === 'gold') gold += amount;
            else poison += amount;
        } else if (d.dieType === 'chill' || d.dieType === 'burn' || d.dieType === 'mark') {
            let val = d.value;
            let runeMul = 1;
            for (const r of runes) {
                if (r.effect === 'amplifier') runeMul *= 2;
                else if (r.effect === 'titanBlow' && nonUtilCount === 1) runeMul *= 3;
                else if (r.effect === 'leaden') runeMul *= 2;
            }
            val *= runeMul;
            val *= chainMul;
            if (d.dieType === 'chill') chill += val;
            else if (d.dieType === 'burn') burn += val;
            else mark += val;
        }
    });
    return { gold, poison, chill, burn, mark };
}

export function updateSlotTotals() {
    const echoId = GS.echoStoneDieId;
    const hasEcho = GS.artifacts.some(a => a.effect === 'echoStone');
    const ascendBonus = (GS.ascendedDice && GS.ascendedDice.length > 0) ? GS.ascendedDice.reduce((s, a) => s + a.bonus, 0) : 0;
    const nonUtilCount = (allocated) => allocated.filter(d => {
        const m = getActiveFace(d)?.modifier;
        return !m || !['freezeStrike','jackpot','shieldBash'].includes(m.effect);
    }).length;

    // Helper: compute a single die's contribution and tooltip
    function dieContribution(d, zoneAllocated, zoneAscend) {
        if (d.dieType) return { val: 0, tip: '', skip: true }; // utility dice don't contribute to zone total
        const runes = getSlotRunes(d.slotId);
        const nonUtil = zoneAllocated.filter(x => !x.dieType).length;
        const zoneCount = zoneAllocated.length;
        let val = d.value;
        const parts = [`roll: ${d.value}`];
        const pt = GS.passives.packTactics || 0;
        const sw = GS.passives.swarmMaster || 0;
        const vy = (GS.passives.volley && zoneCount >= 4) ? GS.passives.volley : 0;
        if (pt) { val += pt; parts.push(`packTactics: +${pt}`); }
        if (sw) { val += sw; parts.push(`swarmMaster: +${sw}`); }
        if (vy) { val += vy; parts.push(`volley: +${vy}`); }
        if (zoneAscend) { val += zoneAscend; parts.push(`ascend: +${zoneAscend}`); }
        for (const r of runes) {
            if (r.effect === 'amplifier') { val *= 2; parts.push('amplifier rune: ×2'); }
            if (r.effect === 'titanBlow' && nonUtil === 1) { val *= 3; parts.push('titan blow: ×3'); }
            if (r.effect === 'leaden') { val *= 2; parts.push('leaden: ×2'); }
        }
        if (hasEcho && echoId !== null && d.id === echoId) { val += d.value; parts.push(`echo: +${d.value}`); }
        const m = getActiveFace(d)?.modifier;
        if (m?.effect === 'executioner') { val *= 5; parts.push('executioner: ×5'); }
        else if (m?.effect === 'chainLightning') { val *= 2; parts.push('chain: ×2'); }
        const utilFx = new Set(['freezeStrike','jackpot','shieldBash','critical']);
        const isUtil = m && utilFx.has(m.effect);
        if (isUtil) { parts.push(`${m.effect}: status only`); val = 0; }
        return { val, tip: parts.join(' | '), skip: false };
    }

    // ── STRIKE TOTAL ──
    let atkTotal = 0, atkMultiplier = 1, atkBonus = 0;
    const atkCount = GS.allocated.strike.length;
    const atkTipLines = [];

    // Amplifier zone multiplier (preview)
    let atkAmpMul = 0;
    GS.allocated.strike.forEach(d => {
        if (d.dieType === 'amplifier') {
            const face = getActiveFace(d);
            const chainMul = face?.modifier?.effect === 'chainLightning' ? 2 : 1;
            atkAmpMul = Math.max(atkAmpMul, (d.value / 100) * chainMul);
        }
    });

    GS.allocated.strike.forEach(d => {
        if (d.dieType === 'amplifier') {
            const face = getActiveFace(d);
            const chainMul = face?.modifier?.effect === 'chainLightning' ? 2 : 1;
            const dispMul = (d.value / 100) * chainMul;
            atkTipLines.push(`amplifier: ×${dispMul}` + (chainMul > 1 ? ' (⚡×2)' : '') + ' zone');
            return;
        }
        if (d.dieType) return; // other utility dice: handled by calcUtilityPreviews
        const c = dieContribution(d, GS.allocated.strike, ascendBonus);
        let val = c.val;
        if (atkAmpMul && val > 0) { val = Math.floor(val * atkAmpMul); }
        atkTotal += val;
        if (!c.skip) atkTipLines.push(`die[${d.value}] → ${val}` + (atkAmpMul ? ` (×${atkAmpMul} amp)` : ''));
        // Set tooltip on the die element
        const el = document.querySelector(`.die[data-die-id="${d.id}"]`);
        if (el && d.rolled) el.title = c.tip + (atkAmpMul ? ` | amp zone: ×${atkAmpMul}` : '') + ` = ${val}`;
    });

    if (GS.passives.threshold) {
        GS.allocated.strike.forEach(d => {
            if (!d.dieType && d.value >= 8) {
                const t = Math.floor(d.value * 0.5);
                atkTotal += t;
                atkTipLines.push(`threshold[${d.value}]: +${t}`);
            }
        });
    }

    atkBonus += GS.buffs.damageBoost;
    const goldScalePreview = GS.artifacts.filter(a => a.effect === 'goldScaleDmg').reduce((s, a) => s + Math.floor(GS.gold / a.value), 0);
    if (goldScalePreview > 0) atkBonus += goldScalePreview;
    if (GS.passives.goldDmg) atkBonus += Math.floor(GS.gold / GS.passives.goldDmg);
    atkBonus += GS.artifacts.filter(a => a.effect === 'hydrasCrest').reduce((s, a) => s + a.value * GS.dice.length, 0);
    atkBonus += GS.enemyStatus?.mark || 0;
    atkBonus += GS.artifacts.filter(a => a.effect === 'festeringWound').reduce((s, a) => s + a.value * (GS.enemy?.poison || 0), 0);
    if (GS.artifacts.some(a => a.effect === 'berserkersMask')) atkMultiplier *= 1.5;
    if (GS.artifacts.some(a => a.effect === 'bloodPact')) atkMultiplier *= 1.3;
    if (atkCount >= 4 && GS.artifacts.some(a => a.effect === 'swarmBanner')) atkMultiplier *= 1.5;
    atkMultiplier *= (GS.transformBuffs?.furyChambered || 1);

    let finalAtk = Math.floor(atkTotal * atkMultiplier) + atkBonus;
    if (GS.artifacts.some(a => a.effect === 'sharpeningStone')) finalAtk = Math.ceil(finalAtk * 1.5);

    if (atkMultiplier > 1) atkTipLines.push(`multiplier: ×${atkMultiplier.toFixed(2).replace(/\.?0+$/, '')}`);
    if (atkBonus > 0) atkTipLines.push(`bonus: +${atkBonus}`);
    atkTipLines.push(`total: ${finalAtk}`);

    $('attack-total').textContent = finalAtk;
    $('attack-total').title = atkTipLines.join('\n');
    const { gold: atkGold, poison: atkPoison, chill: atkChill, burn: atkBurn, mark: atkMark } = calcUtilityPreviews(GS.allocated.strike, true);
    $('attack-gold').textContent   = atkGold   > 0 ? `💰${atkGold}g`  : '';
    $('attack-poison').textContent = atkPoison > 0 ? `☠️${atkPoison}p` : '';
    $('attack-chill').textContent  = atkChill  > 0 ? `❄️${atkChill}`   : '';
    $('attack-burn').textContent   = atkBurn   > 0 ? `🔥${atkBurn}`    : '';
    $('attack-mark').textContent   = atkMark   > 0 ? `🎯${atkMark}`    : '';

    let atkSummary = '';
    if (atkAmpMul > 0) atkSummary += `×${atkAmpMul} amp `;
    if (atkMultiplier > 1) atkSummary += `×${atkMultiplier.toFixed(1).replace('.0','')} `;
    if (atkBonus > 0) atkSummary += `+${atkBonus} bonus `;
    $('attack-summary').textContent = atkSummary;

    // ── GUARD TOTAL ──
    let defTotal = 0, defMultiplier = 1, defBonus = 0;
    const defCount = GS.allocated.guard.length;
    const defTipLines = [];

    // Amplifier zone multiplier (preview)
    let defAmpMul = 0;
    GS.allocated.guard.forEach(d => {
        if (d.dieType === 'amplifier') {
            const face = getActiveFace(d);
            const chainMul = face?.modifier?.effect === 'chainLightning' ? 2 : 1;
            defAmpMul = Math.max(defAmpMul, (d.value / 100) * chainMul);
        }
    });

    GS.allocated.guard.forEach(d => {
        if (d.dieType === 'amplifier') {
            const face = getActiveFace(d);
            const chainMul = face?.modifier?.effect === 'chainLightning' ? 2 : 1;
            const dispMul = (d.value / 100) * chainMul;
            defTipLines.push(`amplifier: ×${dispMul}` + (chainMul > 1 ? ' (⚡×2)' : '') + ' zone');
            return;
        }
        if (d.dieType) return;
        const c = dieContribution(d, GS.allocated.guard, ascendBonus);
        let val = c.val;
        if (defAmpMul && val > 0) { val = Math.floor(val * defAmpMul); }
        defTotal += val;
        if (!c.skip) defTipLines.push(`die[${d.value}] → ${val}` + (defAmpMul ? ` (×${defAmpMul} amp)` : ''));
        const el = document.querySelector(`.die[data-die-id="${d.id}"]`);
        if (el && d.rolled) el.title = c.tip + (defAmpMul ? ` | amp zone: ×${defAmpMul}` : '') + ` = ${val}`;
    });

    if (GS.passives.threshold) {
        GS.allocated.guard.forEach(d => {
            if (!d.dieType && d.value >= 8) {
                const t = Math.floor(d.value * 0.5);
                defTotal += t;
                defTipLines.push(`threshold[${d.value}]: +${t}`);
            }
        });
    }

    defBonus += GS.buffs.armor;
    defBonus += GS.artifacts.filter(a => a.effect === 'goldenAegis').reduce((s, a) => s + Math.floor(GS.gold / a.value), 0);
    if (defCount >= 4 && GS.artifacts.some(a => a.effect === 'swarmBanner')) defMultiplier *= 1.5;
    defMultiplier *= (GS.transformBuffs?.fortified || 1);

    const finalDef = Math.floor(defTotal * defMultiplier) + defBonus;

    if (defMultiplier > 1) defTipLines.push(`multiplier: ×${defMultiplier.toFixed(2).replace(/\.?0+$/, '')}`);
    if (defBonus > 0) defTipLines.push(`bonus: +${defBonus}`);
    defTipLines.push(`total: ${finalDef}`);

    $('defend-total').textContent = finalDef;
    $('defend-total').title = defTipLines.join('\n');
    const { gold: defGold, chill: defChill } = calcUtilityPreviews(GS.allocated.guard);
    $('defend-gold').textContent  = defGold  > 0 ? `💰${defGold}g` : '';
    $('defend-chill').textContent = defChill > 0 ? `❄️${defChill}` : '';

    let defSummary = '';
    if (defAmpMul > 0) defSummary += `×${defAmpMul} amp `;
    if (defMultiplier > 1) defSummary += `×${defMultiplier.toFixed(1).replace('.0','')} `;
    if (defBonus > 0) defSummary += `+${defBonus} armor `;
    $('defend-summary').textContent = defSummary;
}
