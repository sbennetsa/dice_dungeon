# Playtester Issue Fixes — 2026-03-07

Review each section. Edit or delete entries before implementation.

---

## #26 Brittle — NO FIX
**Verdict**: Not a bug. Post-multiplier behaviour is intentional — brittle rewards high investment builds.
**Action**: Close the issue with a comment explaining this.

---

## #27 Skeleton Act 2 — passive clarity
**Verdict**: Not a bug. Act 2 Skeleton has `reassemble` instead of `brittle` by design.
**Proposed fix**: None needed in code. Close the issue.
**Optional**: We could add a short tooltip or note to each passive tag in the enemy panel (`combat.js renderEnemy()`) so players can see what a passive does on hover/tap — but this is a wider change, not specific to this issue.

---

## #28 Colossus Belt — BUG FIX
**Problem**: `_applyArtifactOnAcquire` applies the belt bonus only when acquired. If you later upgrade a die so its max reaches ≥9, the belt never applies to that die.
**Location**: `js/screens.js`
- `applyUpgrade()` at line 76 — upgrades a die (+1/+1); needs to check belt after
- `_applyArtifactOnAcquire()` at line 87 already handles acquire-time

**Proposed fix**: After upgrading a die in `applyUpgrade()`, check if the player owns Colossus Belt AND the die's new max is exactly 9 (i.e. just crossed the threshold) — if so, apply +value to all faces and bump min/max.
```js
function applyUpgrade(die) {
    upgradeDie(die);
    if (GS.tempBuffs && GS.tempBuffs.mastersHammer) upgradeDie(die);
    // Re-check Colossus Belt: if die just hit the >=9 threshold
    const belt = GS.artifacts?.find(a => a.effect === 'colossussBelt');
    if (belt && die.max === 9) {
        die.faceValues = die.faceValues.map(v => v + belt.value);
        die.min += belt.value; die.max += belt.value;
        log(`🏋️ Colossus Belt: ${die.name} crossed the threshold! +${belt.value} to all faces`, 'info');
    }
}
```
**Note**: Using `die.max === 9` (not `>= 9`) means it only triggers the first time a die crosses the threshold. Dice already at max ≥ 9 when the belt was acquired are handled by the onAcquire path. Dice that are already ≥ 10 (got there via other upgrades after belt was acquired while the belt threshold logic was missing) won't be retroactively fixed — acceptable.

---

## #29 Bug report buttons — UI FIX
**Problem**: The 🐛 report button is missing from two screens.
**Location**: `index.html`

**Proposed fix**:
1. `#screen-gameover` (~line 399) — add button inside `#go-buttons`:
   ```html
   <button class="btn" onclick="IssueReport.show()" style="font-size:0.8em; padding:5px 10px;">🐛</button>
   ```
2. `#screen-dungeon-path` (~line 170) — update `.dungeon-path-header` to flex and add button:
   ```html
   <div class="dungeon-path-header" style="display:flex; justify-content:space-between; align-items:center;">
       <h2>Dungeon Path</h2>
       <button class="btn" onclick="IssueReport.show()" style="font-size:0.8em; padding:5px 10px;">🐛</button>
   </div>
   ```

---

## #30 Soul Pact — REMOVE (design decision)
**Problem**: Soul Pact reflects overkill damage back to the player, which can kill them on the same turn they killed the demon. Unavoidable and not telegraphed until it happens.
**Decision**: No on-death effects that can kill the player. Remove entirely.
**Demon identity is maintained by**: Hellfire (unblockable, alternates with Strike) + hellfireMod (each hit corrupts a player die −1 max face).

**Locations**:
- `js/constants.js` lines ~384–386 (Demon act2 passives) — remove `{ id: 'soulPact', ... }`
- `js/constants.js` lines ~395–397 (Demon act3 passives) — remove `{ id: 'soulPact', ... }`
- `js/combat.js` lines ~1354–1363 — remove the Soul Pact block (variable + reflect calc)
- `js/combat.js` line ~1435 — remove the deferred `soulPactLethal` death check
- `docs/decisions.md` — record decision: "No on-death effects that can kill the player"

---

## #31 Skill die face auto-snap
**Problem**: When the player releases the 3D skill die cube after spinning it, it coasts to a stop at an arbitrary angle. It's hard to intentionally land on a specific face. The request is to snap to the nearest face when it almost stops.
**Location**: `js/screens.js` — `_loop()` at line 1217, velocity variables `_velX`/`_velY`
**How the cube works**: rotates freely; velocity decays at ×0.96 per frame; idle drift kicks in at velocity < 0.0004.

**Proposed fix**: When both velocity components drop below the snap threshold, compute which face is currently most visible and lerp `_rotX`/`_rotY` to the exact angles that put that face squarely forward.
Target rotations per face (SD_NORMALS order):
- front [0,0,1]: rotX=0, rotY=0
- right [1,0,0]: rotX=0, rotY=π/2
- back [0,0,-1]: rotX=0, rotY=π (or −π)
- left [-1,0,0]: rotX=0, rotY=−π/2
- top [0,1,0]: rotX=−π/2, rotY=current (lock rotY)

Use a `_snapping` flag and lerp factor ~0.12 per frame until within 0.01 of target.

---

## #32 Sell screen stale — BUG FIX
**Problem**: After buying a consumable in the Market tab, the Sell tab still shows the old inventory until you sell something.
**Root cause**: The market purchase callback at `js/screens.js` line 2321 calls `_renderMarket()` and `_renderForge()` but not `_renderSell()`.
**Proposed fix** — one line change:
```js
// Before:
addConsumableToInventory({ ...item }, () => { Shop._renderMarket(); Shop._renderForge(); });
// After:
addConsumableToInventory({ ...item }, () => { Shop._renderMarket(); Shop._renderForge(); Shop._renderSell(); });
```

---

## #33 Rest stop free ordering — DESIGN CHANGE
**Current behaviour**: Maintenance tier (Heal/Train/Trim/Merge) is disabled and greyed out until the transformation tier is done first.
**Requested change**: Players can do either tier in any order.

**Proposed fix** in `js/screens.js` `Rest._render()` (~lines 3516–3558):
- Remove `if (!Rest._transformDone) maintHeader.style.opacity = '0.4'` (line 3516)
- Remove `' disabled'` class suffix on all maintenance cards that checks `!Rest._transformDone`
- Remove the `if (Rest._transformDone)` guards on maintenance card `onclick` handlers
- Keep `_transformDone` and `_maintenanceDone` flags — both must be done before the Continue button appears
- Keep the Skip button on the transformation tier so players can still opt out of it

---

## #34 Fury charges invisible — UX FIX
**Problem**: `GS.furyCharges` increments after each turn survived when Battle Fury artifact is held, but the only feedback is a log message. There's no visual indicator — players can't see their charge count.
**Location**: `js/combat.js` `renderPlayerStatus()` at line 482

**Proposed fix**: Add a fury tag to the player status bar:
```js
// Add at the end of renderPlayerStatus(), before bar.innerHTML = html:
if (GS.artifacts?.some(a => a.effect === 'battleFury')) {
    const needed = 3;
    const charges = GS.furyCharges || 0;
    const ready = charges >= needed;
    html += `<span class="player-status-tag${ready ? ' player-status-tag--fury-ready' : ''}">🔥 Fury ${charges}/${needed}${ready ? ' READY!' : ''}</span>`;
}
```
Also add a CSS class in `style.css`:
```css
.player-status-tag--fury-ready {
    background: rgba(180, 100, 0, 0.35);
    border-color: #d4a534;
    color: #ffd060;
}
```

---

## #35 Campaign carry-over — FEATURE (deferred)
**Request**: Carry 1–2 items between dungeon loops in campaign mode, not just rely on Order boons.
**Verdict**: Valid feature idea, but significant scope. Deferred — design and scope separately.
**Notes for future**: Could be a "Campaign Stash" — pick 1 item at loop end, starts in inventory next run. Store in `campaign.stash[]` in `js/campaign.js`, apply in `Game.start()` alongside Order boons.

---

## Checklist

- [ ] #26 Close issue (no fix)
- [ ] #27 Close issue (no fix / optional tooltip later)
- [ ] #28 Fix Colossus Belt in `applyUpgrade()`
- [ ] #29 Add 🐛 buttons to gameover and dungeon-path screens
- [ ] #30 Remove Soul Pact + document decision
- [ ] #31 Add face snap to skill die loop
- [ ] #32 Add `_renderSell()` to market purchase callback
- [ ] #33 Remove transformation-first ordering in rest stop
- [ ] #34 Add Fury tag to `renderPlayerStatus()`
- [ ] #35 Defer — design separately
