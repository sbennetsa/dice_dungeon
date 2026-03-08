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
            die._animateLanding = true;
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
    die._animateLanding = true;
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
//  3D DIE GEOMETRY
// ════════════════════════════════════════════════════════════
// Die cube: 56×56px, half = 28px → translateZ(28px)
// GEOM_FACES[i] = CSS transform that places face i on that cube side
const GEOM_FACES = [
    'rotateY(0deg) translateZ(28px)',     // 0: front
    'rotateY(90deg) translateZ(28px)',    // 1: right
    'rotateX(-90deg) translateZ(28px)',   // 2: top
    'rotateX(90deg) translateZ(28px)',    // 3: bottom
    'rotateY(-90deg) translateZ(28px)',   // 4: left
    'rotateY(180deg) translateZ(28px)',   // 5: back
];
// GEOM_ROTS[i] = cube rotation that brings face i to face the viewer
const GEOM_ROTS = [
    { x: 0,   y: 0   },
    { x: 0,   y: -90 },
    { x: 90,  y: 0   },
    { x: -90, y: 0   },
    { x: 0,   y: 90  },
    { x: 0,   y: 180 },
];
const IDLE_ROT = { x: -22, y: 25 };

// Utility die colors for face tinting
const UTIL_COLORS = {
    gold: '#f0c040', poison: '#60d080', chill: '#60a0e0',
    burn: '#e85d30', shield: '#4a9eff', mark: '#e05060',
    amplifier: '#b464dc', mimic: '#a0a050',
    drain: '#6450b4', weaken: '#c87850',
};

// Lazy die face tooltip (shared singleton)
function _getDieTip() {
    let tip = document.getElementById('die-face-tip');
    if (!tip) {
        tip = document.createElement('div');
        tip.id = 'die-face-tip';
        tip.className = 'die-face-tip';
        document.body.appendChild(tip);
    }
    return tip;
}
function _showDieTip(el, die) {
    const tip = _getDieTip();
    tip.innerHTML = renderFaceStrip(die, { highlightVal: die.rolled ? die.value : undefined });
    tip.style.display = 'flex';
    const rect = el.getBoundingClientRect();
    const tipH = tip.offsetHeight || 60;
    tip.style.left = Math.max(4, rect.left + rect.width / 2 - tip.offsetWidth / 2) + 'px';
    tip.style.top  = (rect.top - tipH - 6) + 'px';
}
function _hideDieTip() {
    const tip = document.getElementById('die-face-tip');
    if (tip) tip.style.display = 'none';
}

function _buildFaceNum(v) {
    const el = document.createElement('div');
    el.className = String(v).length >= 3 ? 'face-num face-num--sm' : 'face-num';
    el.textContent = v;
    return el;
}

function _buildDie3DFaces(cubeEl, die) {
    cubeEl.innerHTML = '';
    const fc = die.faceValues ? die.faceValues.length : 0;
    const isUtil = !!die.dieType;
    const rolledGeo = (die.rolled && die.rolledFaceIndex >= 0) ? die.rolledFaceIndex % 6 : -1;

    for (let geoIdx = 0; geoIdx < 6; geoIdx++) {
        const face = document.createElement('div');
        face.className = 'die-face';
        face.style.transform = GEOM_FACES[geoIdx];
        face.dataset.faceIndex = geoIdx;
        const isLanded = geoIdx === rolledGeo;
        if (isLanded) face.classList.add('die-face--landed');

        // Void face: die has fewer sides than 6 and this geo slot has no value
        if (fc === 0 || (!isLanded && geoIdx >= fc)) {
            face.classList.add('die-face--void');
            cubeEl.appendChild(face);
            continue;
        }

        // For the landed face use die.value (accounts for volatile/infuse/curse mods)
        const faceValIdx = isLanded ? die.rolledFaceIndex : geoIdx;
        const fv = isLanded ? die.value : die.faceValues[Math.min(faceValIdx, fc - 1)];
        const modEntry = die.faceMods?.find(m => m.faceIndex === faceValIdx);
        const mod = modEntry?.mod || null;

        if (isUtil) {
            const isAmp = die.dieType === 'amplifier';
            const isPct = die.dieType === 'gold' || die.dieType === 'poison';
            const dispVal = isAmp ? `×${fv / 100}` : isPct ? `${fv}%` : fv;
            const dispStr = String(dispVal);
            const color = UTIL_COLORS[die.dieType] || 'var(--gold-bright)';
            face.style.borderColor = color + '88';

            const tint = document.createElement('div');
            tint.className = 'die-face-tint';
            tint.style.cssText = `position:absolute;inset:0;border-radius:inherit;opacity:0.08;pointer-events:none;background:radial-gradient(ellipse at center,${color},transparent 70%)`;
            face.appendChild(tint);

            const wm = document.createElement('div');
            wm.className = 'die-face-watermark';
            wm.textContent = die.icon || '';
            face.appendChild(wm);

            const num = document.createElement('div');
            num.className = dispStr.length >= 4 ? 'face-num face-num--sm' : 'face-num';
            num.style.color = color;
            num.textContent = dispVal;
            face.appendChild(num);
        } else {
            face.appendChild(_buildFaceNum(fv));
        }

        if (mod) {
            face.dataset.mod = mod.effect;
            const modWm = document.createElement('div');
            modWm.className = 'die-face-watermark die-face-watermark--mod';
            modWm.textContent = mod.icon || '';
            face.appendChild(modWm);
        }

        cubeEl.appendChild(face);
    }
}

function _animateDieLanding(cubeEl, die) {
    const geoIdx = die.rolledFaceIndex >= 0 ? die.rolledFaceIndex % 6 : 0;
    const target = GEOM_ROTS[geoIdx];
    const spX = (Math.random() > 0.5 ? 1 : -1) * (720 + Math.floor(Math.random() * 360));
    const spY = (Math.random() > 0.5 ? 1 : -1) * (1080 + Math.floor(Math.random() * 360));

    // Start at idle, then spin to target + full spins (lands on correct face)
    cubeEl.style.transition = 'none';
    cubeEl.style.transform = `rotateX(${IDLE_ROT.x}deg) rotateY(${IDLE_ROT.y}deg)`;
    requestAnimationFrame(() => {
        requestAnimationFrame(() => {
            cubeEl.style.transition = 'transform 0.9s cubic-bezier(0.12,0.8,0.3,1)';
            cubeEl.style.transform = `rotateX(${target.x + spX}deg) rotateY(${target.y + spY}deg)`;
            setTimeout(() => {
                // Snap to clean target rotation (no accumulated spin degrees)
                cubeEl.style.transition = 'none';
                cubeEl.style.transform = `rotateX(${target.x}deg) rotateY(${target.y}deg)`;
                cubeEl.dataset.rx = target.x;
                cubeEl.dataset.ry = target.y;
                // Landing flash on the face that landed
                const landFace = cubeEl.querySelector(`[data-face-index="${geoIdx}"]`);
                if (landFace) {
                    const cls = landFace.dataset.mod ? 'landed-mod' : 'landed-face';
                    landFace.classList.add(cls);
                    setTimeout(() => landFace.classList.remove('landed-face', 'landed-mod'), 700);
                }
            }, 950);
        });
    });
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
    _hideDieTip();
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
        ['s-floor','s-hp','s-gold'],
        ['r-floor','r-hp','r-gold'],
        ['bs-floor','bs-hp','bs-gold'],
        [null,'sh-hp','sh-gold'],
        ['e-floor','e-hp','e-gold'],
        [null,'rest-hp','rest-gold'],
    ];
    sets.forEach(([fl,hp,gd]) => {
        if (fl) $(fl).textContent = GS.floor;
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
    ['sh-dice'].forEach(id => { const el = $(id); if (el) el.innerHTML = `${diceStr} <span style="opacity:0.6; font-size:0.8em">(${slotsStr}${runeStr}${rerollStr})</span>`; });
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
    sortedPool.forEach(d => {
        const el = makeDieElement(d, 'pool');
        pool.appendChild(el);
        if (d._animateLanding) {
            const cubeEl = el.querySelector('.die-cube');
            if (cubeEl) _animateDieLanding(cubeEl, d);
            d._animateLanding = false;
        }
    });

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
                const dieEl = makeDieElement(allocatedDie, 'strike');
                slotEl.appendChild(dieEl);
                if (allocatedDie._animateLanding) {
                    const cubeEl = dieEl.querySelector('.die-cube');
                    if (cubeEl) _animateDieLanding(cubeEl, allocatedDie);
                    allocatedDie._animateLanding = false;
                }
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
                const dieEl = makeDieElement(allocatedDie, 'guard');
                slotEl.appendChild(dieEl);
                if (allocatedDie._animateLanding) {
                    const cubeEl = dieEl.querySelector('.die-cube');
                    if (cubeEl) _animateDieLanding(cubeEl, allocatedDie);
                    allocatedDie._animateLanding = false;
                }
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

    // Per-die bonuses — shown as badge overlays on the landed face (not folded into value,
    // so the number always reflects the raw roll and the badge shows the additive bonus clearly)
    // Zone-specific bonuses (volley, packTactics, swarmMaster) must not bleed onto pool dice
    const inZone = context === 'strike' || context === 'guard';
    let ascendBonus = 0, volleyBonus = 0, ptBonus = 0, swBonus = 0;
    if (die.rolled && !die.dieType) {
        if (GS.ascendedDice && GS.ascendedDice.length > 0)
            ascendBonus = GS.ascendedDice.reduce((s, a) => s + a.bonus, 0);
        if (inZone) {
            if (GS.passives.volley && die.slotId) {
                const zone = die.slotId.startsWith('str') ? GS.allocated.strike : GS.allocated.guard;
                if (zone.length >= 4) volleyBonus = GS.passives.volley;
            }
            ptBonus = (context === 'strike') ? (GS.passives.packTactics || 0) : 0;
            swBonus = GS.passives.swarmMaster || 0;
        }
    }
    const passiveBonus = ptBonus + swBonus;
    let badges = '';
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

    // 3D cube rendering
    el.classList.add('die-3d', `die-ctx--${context}`);
    const cube = document.createElement('div');
    cube.className = 'die-cube';
    _buildDie3DFaces(cube, die);

    // Overlay badges onto the landed face
    if (badges && die.rolled && die.rolledFaceIndex >= 0) {
        const landGeo = die.rolledFaceIndex % 6;
        const landedFaceEl = cube.querySelector(`[data-face-index="${landGeo}"]`);
        if (landedFaceEl) {
            const badgeWrap = document.createElement('div');
            badgeWrap.className = 'die-badges';
            badgeWrap.innerHTML = badges;
            landedFaceEl.appendChild(badgeWrap);
        }
    }

    // Set initial cube rotation; animation is driven separately via _animateDieLanding
    if (die.rolled && !die._animateLanding) {
        const t = GEOM_ROTS[die.rolledFaceIndex >= 0 ? die.rolledFaceIndex % 6 : 0];
        cube.style.transform = `rotateX(${t.x}deg) rotateY(${t.y}deg)`;
        cube.dataset.rx = t.x;
        cube.dataset.ry = t.y;
    } else {
        cube.style.transform = `rotateX(${IDLE_ROT.x}deg) rotateY(${IDLE_ROT.y}deg)`;
        cube.dataset.rx = IDLE_ROT.x;
        cube.dataset.ry = IDLE_ROT.y;
    }

    // Hover: tilt to show more faces — only outside combat
    // Inside combat: show face-strip tooltip after 4s hold for auditing
    let _tipTimer = null;
    el.addEventListener('mouseenter', () => {
        if (el.closest('#screen-combat')) {
            _tipTimer = setTimeout(() => _showDieTip(el, die), 4000);
            return;
        }
        cube.style.transition = 'transform 0.25s ease';
        cube.style.transform = 'rotateX(-30deg) rotateY(42deg)';
    });
    el.addEventListener('mouseleave', () => {
        if (el.closest('#screen-combat')) {
            clearTimeout(_tipTimer);
            _hideDieTip();
            return;
        }
        cube.style.transition = 'transform 0.25s ease';
        cube.style.transform = `rotateX(${cube.dataset.rx || IDLE_ROT.x}deg) rotateY(${cube.dataset.ry || IDLE_ROT.y}deg)`;
    });

    const scene = document.createElement('div');
    scene.className = 'die-scene';
    scene.appendChild(cube);
    el.appendChild(scene);
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


// Creates a standalone 3D die element with drag-to-rotate (for edit/inspect screens, no allocation)
export function makeDie3DPreview(die) {
    const rx = IDLE_ROT.x, ry = IDLE_ROT.y;
    const cube = document.createElement('div');
    cube.className = 'die-cube';
    _buildDie3DFaces(cube, die);
    cube.style.transform = `rotateX(${rx}deg) rotateY(${ry}deg)`;
    cube.dataset.rx = rx;
    cube.dataset.ry = ry;

    const scene = document.createElement('div');
    scene.className = 'die-scene';
    scene.style.cursor = 'grab';
    scene.appendChild(cube);

    const wrap = document.createElement('div');
    wrap.className = 'die die-3d die-ctx--pool die-3d-preview';
    wrap.appendChild(scene);

    // Pointer-drag rotation (no allocation logic)
    let dragging = false, dsx, dsy, srx, sry;
    scene.addEventListener('pointerdown', e => {
        dragging = true;
        dsx = e.clientX; dsy = e.clientY;
        srx = parseFloat(cube.dataset.rx); sry = parseFloat(cube.dataset.ry);
        scene.setPointerCapture(e.pointerId);
        scene.style.cursor = 'grabbing';
        cube.style.transition = 'none';
    });
    scene.addEventListener('pointermove', e => {
        if (!dragging) return;
        const rx = srx - (e.clientY - dsy) * 0.5;
        const ry = sry + (e.clientX - dsx) * 0.5;
        cube.dataset.rx = rx; cube.dataset.ry = ry;
        cube.style.transform = `rotateX(${rx}deg) rotateY(${ry}deg)`;
    });
    scene.addEventListener('pointerup', () => {
        dragging = false;
        scene.style.cursor = 'grab';
        cube.style.transition = 'transform 0.3s ease';
    });

    return wrap;
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

    // Helper: compute a single die's contribution
    function dieContribution(d, zoneAllocated, zoneAscend, isStrike) {
        if (d.dieType) return { val: 0, displayVal: 0, perDieMults: [], echoAdd: 0, isStatus: false, skip: true };
        const runes = getSlotRunes(d.slotId);
        const nonUtil = zoneAllocated.filter(x => !x.dieType).length;
        const zoneCount = zoneAllocated.length;
        const pt = isStrike ? (GS.passives.packTactics || 0) : 0;
        const sw = GS.passives.swarmMaster || 0;
        const vy = (GS.passives.volley && zoneCount >= 4) ? GS.passives.volley : 0;
        const displayVal = d.value + pt + sw + vy + (zoneAscend || 0);
        let val = displayVal;
        const perDieMults = [];
        for (const r of runes) {
            if (r.effect === 'amplifier') { val *= 2; perDieMults.push({ mult: 2, label: 'Amp Rune' }); }
            else if (r.effect === 'titanBlow' && nonUtil === 1) { val *= 3; perDieMults.push({ mult: 3, label: 'Titan Blow' }); }
            else if (r.effect === 'leaden') { val *= 2; perDieMults.push({ mult: 2, label: 'Leaden' }); }
        }
        let echoAdd = 0;
        if (hasEcho && echoId !== null && d.id === echoId) { echoAdd = d.value; val += echoAdd; }
        const m = getActiveFace(d)?.modifier;
        if (m?.effect === 'executioner') { val *= 5; perDieMults.push({ mult: 5, label: 'Executioner' }); }
        else if (m?.effect === 'chainLightning') { val *= 2; perDieMults.push({ mult: 2, label: 'Chain Lightning' }); }
        const utilFx = new Set(['freezeStrike', 'jackpot', 'critical']);
        const isStatus = !!(m && utilFx.has(m.effect));
        if (isStatus) val = 0;
        return { val, displayVal, perDieMults, echoAdd, isStatus, skip: false };
    }

    // Helper: build structured zone tooltip
    function buildZoneTip({ contribs, normalDice, ampMul, preMultBonuses, zoneMults, bonuses, final, sharpeningStone }) {
        const lines = [];
        if (normalDice.length > 0) {
            const anyComplex = contribs.some(c => c.perDieMults.length > 0 || c.echoAdd > 0 || c.isStatus);
            if (!anyComplex) {
                lines.push('Dice: ' + contribs.map(c => c.displayVal).join('  '));
            } else {
                contribs.forEach((c, i) => {
                    const d = normalDice[i];
                    if (c.isStatus) {
                        const m = getActiveFace(d)?.modifier;
                        lines.push(`${c.displayVal} [${m?.effect || 'status'}]`);
                    } else {
                        let desc = `${c.displayVal}`;
                        c.perDieMults.forEach(pm => { desc += ` ×${pm.mult} ${pm.label}`; });
                        if (c.echoAdd > 0) desc += ` +${c.echoAdd} Echo`;
                        if (c.perDieMults.length > 0 || c.echoAdd > 0) desc += ` → ${c.val}`;
                        lines.push(desc);
                    }
                });
            }
        }
        const preAmpBase = contribs.reduce((s, c) => s + c.val, 0);
        const hasSteps = ampMul > 0 || preMultBonuses.some(b => b.amount > 0) || zoneMults.length > 0 || bonuses.some(b => b.amount > 0) || sharpeningStone;
        if (normalDice.length > 1 || hasSteps) lines.push(`base: ${preAmpBase}`);
        let running = preAmpBase;
        if (ampMul > 0) {
            running = Math.floor(running * ampMul);
            lines.push(`×${ampMul} amp → ${running}`);
        }
        for (const { amount, label } of preMultBonuses) {
            if (amount > 0) { running += amount; lines.push(`+${amount} ${label}`); }
        }
        for (const { mul, label } of zoneMults) {
            running = Math.floor(running * mul);
            lines.push(`×${mul.toFixed(2).replace(/\.?0+$/, '')} ${label} → ${running}`);
        }
        for (const { amount, label } of bonuses) {
            if (amount > 0) { running += amount; lines.push(`+${amount} ${label}`); }
        }
        if (sharpeningStone) lines.push(`×1.5 Sharpening → ${final}`);
        lines.push(`= ${final}`);
        return lines.join('\n');
    }

    // ── STRIKE TOTAL ──
    let atkTotal = 0, atkMultiplier = 1, atkBonus = 0;
    const atkCount = GS.allocated.strike.length;
    let atkAmpMul = 0;
    GS.allocated.strike.forEach(d => {
        if (d.dieType === 'amplifier') {
            const face = getActiveFace(d);
            const chainMul = face?.modifier?.effect === 'chainLightning' ? 2 : 1;
            atkAmpMul = Math.max(atkAmpMul, (d.value / 100) * chainMul);
        }
    });

    const atkNormal = GS.allocated.strike.filter(d => !d.dieType);
    const atkContribs = atkNormal.map(d => dieContribution(d, GS.allocated.strike, ascendBonus, true));
    atkNormal.forEach((d, i) => {
        const c = atkContribs[i];
        let val = c.val;
        if (atkAmpMul && val > 0) val = Math.floor(val * atkAmpMul);
        atkTotal += val;
        const el = document.querySelector(`.die[data-die-id="${d.id}"]`);
        if (el && d.rolled) {
            let brief = `${c.displayVal}`;
            if (c.perDieMults.length > 0) { c.perDieMults.forEach(pm => { brief += ` ×${pm.mult} ${pm.label}`; }); brief += ` → ${c.val}`; }
            if (atkAmpMul > 0) brief += ` ×${atkAmpMul} amp = ${val}`;
            el.title = brief;
        }
    });

    const atkPreMultBonuses = [];
    if (GS.passives.threshold) {
        GS.allocated.strike.forEach(d => {
            if (!d.dieType && d.value >= 12) {
                const t = d.value;
                atkTotal += t;
                atkPreMultBonuses.push({ amount: t, label: `threshold[${d.value}]` });
            }
        });
    }

    // Battle Fury: if charges ready, highest attack die is doubled — reflect in preview (pre-mult)
    if ((GS.furyCharges || 0) >= 3 && atkNormal.length > 0) {
        let topIdx = 0;
        for (let i = 1; i < atkNormal.length; i++) {
            if (atkNormal[i].value > atkNormal[topIdx].value) topIdx = i;
        }
        const extra = atkContribs[topIdx].val;
        atkTotal += extra;
        atkPreMultBonuses.push({ amount: extra, label: '🔥 Fury ×2' });
    }

    const atkZoneMults = [];
    if (GS.artifacts.some(a => a.effect === 'berserkersMask')) { atkMultiplier *= 1.5; atkZoneMults.push({ mul: 1.5, label: "Berserker's Mask" }); }
    if (GS.artifacts.some(a => a.effect === 'bloodPact')) { atkMultiplier *= 1.3; atkZoneMults.push({ mul: 1.3, label: 'Blood Pact' }); }
    if (atkCount >= 4 && GS.artifacts.some(a => a.effect === 'swarmBanner')) { atkMultiplier *= 1.5; atkZoneMults.push({ mul: 1.5, label: 'Swarm Banner' }); }
    const furyMul = GS.transformBuffs?.furyChambered || 1;
    if (furyMul > 1) { atkMultiplier *= furyMul; atkZoneMults.push({ mul: furyMul, label: 'Fury Chamber' }); }

    const atkBonuses = [];
    const db = GS.buffs.damageBoost; atkBonus += db; if (db > 0) atkBonuses.push({ amount: db, label: 'damage boost' });
    const goldScale = GS.artifacts.filter(a => a.effect === 'goldScaleDmg').reduce((s, a) => s + Math.floor((GS.goldSpent || 0) / a.value), 0);
    atkBonus += goldScale; if (goldScale > 0) atkBonuses.push({ amount: goldScale, label: 'gold scale' });
    const goldDmg = GS.passives.goldDmg ? Math.floor(GS.gold / GS.passives.goldDmg) : 0;
    atkBonus += goldDmg; if (goldDmg > 0) atkBonuses.push({ amount: goldDmg, label: 'gold dmg' });
    const hydra = GS.artifacts.filter(a => a.effect === 'hydrasCrest').reduce((s, a) => s + a.value * GS.dice.length, 0);
    atkBonus += hydra; if (hydra > 0) atkBonuses.push({ amount: hydra, label: "Hydra's Crest" });
    const markB = GS.enemyStatus?.mark || 0; atkBonus += markB; if (markB > 0) atkBonuses.push({ amount: markB, label: 'mark' });
    const fester = GS.artifacts.filter(a => a.effect === 'festeringWound').reduce((s, a) => s + a.value * (GS.enemy?.poison || 0), 0);
    atkBonus += fester; if (fester > 0) atkBonuses.push({ amount: fester, label: 'festering wound' });

    let finalAtk = Math.floor(atkTotal * atkMultiplier) + atkBonus;
    const sharpeningAtk = atkNormal.length === 1 && GS.artifacts.some(a => a.effect === 'sharpeningStone');
    if (sharpeningAtk) finalAtk = Math.ceil(finalAtk * 1.5);

    $('attack-total').textContent = finalAtk;
    $('attack-total').title = buildZoneTip({ contribs: atkContribs, normalDice: atkNormal, ampMul: atkAmpMul, preMultBonuses: atkPreMultBonuses, zoneMults: atkZoneMults, bonuses: atkBonuses, final: finalAtk, sharpeningStone: sharpeningAtk });

    // Set utility die titles (strike)
    GS.allocated.strike.forEach(d => {
        if (!d.dieType) return;
        const el = document.querySelector(`.die[data-die-id="${d.id}"]`);
        if (!el || !d.rolled) return;
        if (d.dieType === 'amplifier') {
            const face = getActiveFace(d);
            const chainMul = face?.modifier?.effect === 'chainLightning' ? 2 : 1;
            el.title = `amplifier: ×${(d.value / 100) * chainMul} zone${chainMul > 1 ? ' (⚡×2)' : ''}`;
        } else if (d.dieType === 'gold' || d.dieType === 'poison') {
            const zoneBase = atkContribs.reduce((s, c) => s + (atkAmpMul > 0 ? Math.floor(c.val * atkAmpMul) : c.val), 0);
            const runes = getSlotRunes(d.slotId);
            const isAmplified = runes.some(r => r.effect === 'amplifier');
            const face = getActiveFace(d);
            const chainMul = face?.modifier?.effect === 'chainLightning' ? 2 : 1;
            const pct = (d.value / 100) * (isAmplified ? 2 : 1) * chainMul;
            el.title = `${d.dieType}: ${zoneBase} × ${d.value}%${isAmplified ? ' ×2 amp' : ''} = ${Math.floor(zoneBase * pct)}`;
        } else {
            el.title = `${d.dieType}: ${d.value}`;
        }
    });

    const { gold: atkGold, poison: atkPoison, chill: atkChill, burn: atkBurn, mark: atkMark } = calcUtilityPreviews(GS.allocated.strike, true);
    $('attack-gold').textContent   = atkGold   > 0 ? `💰${atkGold}g`  : '';
    $('attack-poison').textContent = atkPoison > 0 ? `☠️${atkPoison}p` : '';
    $('attack-chill').textContent  = atkChill  > 0 ? `❄️${atkChill}`   : '';
    $('attack-burn').textContent   = atkBurn   > 0 ? `🔥${atkBurn}`    : '';
    $('attack-mark').textContent   = atkMark   > 0 ? `🎯${atkMark}`    : '';

    let atkSummary = '';
    if (atkAmpMul > 0) atkSummary += `×${atkAmpMul} amp `;
    if (atkMultiplier > 1) atkSummary += `×${atkMultiplier.toFixed(1).replace('.0', '')} `;
    if (atkBonus > 0) atkSummary += `+${atkBonus} bonus `;
    $('attack-summary').textContent = atkSummary;

    // ── GUARD TOTAL ──
    let defTotal = 0, defMultiplier = 1, defBonus = 0;
    const defCount = GS.allocated.guard.length;
    let defAmpMul = 0;
    GS.allocated.guard.forEach(d => {
        if (d.dieType === 'amplifier') {
            const face = getActiveFace(d);
            const chainMul = face?.modifier?.effect === 'chainLightning' ? 2 : 1;
            defAmpMul = Math.max(defAmpMul, (d.value / 100) * chainMul);
        }
    });

    const defNormal = GS.allocated.guard.filter(d => !d.dieType);
    const defContribs = defNormal.map(d => dieContribution(d, GS.allocated.guard, ascendBonus, false));
    defNormal.forEach((d, i) => {
        const c = defContribs[i];
        let val = c.val;
        if (defAmpMul && val > 0) val = Math.floor(val * defAmpMul);
        defTotal += val;
        const el = document.querySelector(`.die[data-die-id="${d.id}"]`);
        if (el && d.rolled) {
            let brief = `${c.displayVal}`;
            if (c.perDieMults.length > 0) { c.perDieMults.forEach(pm => { brief += ` ×${pm.mult} ${pm.label}`; }); brief += ` → ${c.val}`; }
            if (defAmpMul > 0) brief += ` ×${defAmpMul} amp = ${val}`;
            el.title = brief;
        }
    });

    const defPreMultBonuses = [];
    if (GS.passives.threshold) {
        GS.allocated.guard.forEach(d => {
            if (!d.dieType && d.value >= 12) {
                const t = d.value;
                defTotal += t;
                defPreMultBonuses.push({ amount: t, label: `threshold[${d.value}]` });
            }
        });
    }

    const defZoneMults = [];
    if (defCount >= 4 && GS.artifacts.some(a => a.effect === 'swarmBanner')) { defMultiplier *= 1.5; defZoneMults.push({ mul: 1.5, label: 'Swarm Banner' }); }
    const fortifiedMul = GS.transformBuffs?.fortified || 1;
    if (fortifiedMul > 1) { defMultiplier *= fortifiedMul; defZoneMults.push({ mul: fortifiedMul, label: 'Fortified' }); }

    const defBonuses = [];
    const armor = GS.buffs.armor; defBonus += armor; if (armor > 0) defBonuses.push({ amount: armor, label: 'armor' });
    const aegis = GS.artifacts.filter(a => a.effect === 'goldenAegis').reduce((s, a) => s + Math.floor(GS.gold / a.value), 0);
    defBonus += aegis; if (aegis > 0) defBonuses.push({ amount: aegis, label: "Golden Aegis" });

    const finalDef = Math.floor(defTotal * defMultiplier) + defBonus;

    $('defend-total').textContent = finalDef;
    $('defend-total').title = buildZoneTip({ contribs: defContribs, normalDice: defNormal, ampMul: defAmpMul, preMultBonuses: defPreMultBonuses, zoneMults: defZoneMults, bonuses: defBonuses, final: finalDef, sharpeningStone: false });

    // Set utility die titles (guard)
    GS.allocated.guard.forEach(d => {
        if (!d.dieType) return;
        const el = document.querySelector(`.die[data-die-id="${d.id}"]`);
        if (!el || !d.rolled) return;
        if (d.dieType === 'amplifier') {
            const face = getActiveFace(d);
            const chainMul = face?.modifier?.effect === 'chainLightning' ? 2 : 1;
            el.title = `amplifier: ×${(d.value / 100) * chainMul} zone${chainMul > 1 ? ' (⚡×2)' : ''}`;
        } else if (d.dieType === 'gold') {
            const zoneBase = defContribs.reduce((s, c) => s + (defAmpMul > 0 ? Math.floor(c.val * defAmpMul) : c.val), 0);
            const runes = getSlotRunes(d.slotId);
            const isAmplified = runes.some(r => r.effect === 'amplifier');
            const pct = (d.value / 100) * (isAmplified ? 2 : 1);
            el.title = `gold: ${zoneBase} × ${d.value}% = ${Math.floor(zoneBase * pct)}`;
        } else {
            el.title = `${d.dieType}: ${d.value}`;
        }
    });

    const { gold: defGold, chill: defChill } = calcUtilityPreviews(GS.allocated.guard);
    $('defend-gold').textContent  = defGold  > 0 ? `💰${defGold}g` : '';
    $('defend-chill').textContent = defChill > 0 ? `❄️${defChill}` : '';

    let defSummary = '';
    if (defAmpMul > 0) defSummary += `×${defAmpMul} amp `;
    if (defMultiplier > 1) defSummary += `×${defMultiplier.toFixed(1).replace('.0', '')} `;
    if (defBonus > 0) defSummary += `+${defBonus} armor `;
    $('defend-summary').textContent = defSummary;
}
