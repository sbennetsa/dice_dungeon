# Spec: Two-Layer Event System
## Dice Dungeon — Coding Agent Implementation Brief

---

## Context

The dungeon currently has two non-combat floor types: `shop` and `event`. The `event` slots are pre-determined by the blueprint and reference named set-piece IDs (`wanderingMerchant`, `cursedShrine`, etc.) that are not yet implemented.

This spec introduces a second, independent layer of non-combat encounters — a weighted pool of 15 short narrative events (`nonCombatEncounters.js`) that fire randomly *between* floors as corridor interruptions. These are not floors. They do not advance the floor counter. They fire after any floor resolution and are always a surprise to the player.

The two layers must never compete or conflict:

| Layer | Name | When | Source | Floor counter |
|---|---|---|---|---|
| 1 | **Scheduled set-pieces** | Blueprint `event` slots | `EVENT_POOLS` IDs → `screens.js` handlers | Advances |
| 2 | **Random NCEs** | After any floor resolves | `nonCombatEncounters.js` weighted pool | Does NOT advance |

---

## Files Involved

```
js/encounters/
  dungeonBlueprint.js       ← minor additions only
  encounterGenerator.js     ← primary changes
  nonCombatEncounters.js    ← already written, minor changes
js/
  state.js                  ← add two GS fields
  screens.js                ← wire in the NCE screen (separate ticket)
```

> `screens.js` integration is out of scope for this ticket. `encounterGenerator.js` must expose everything `screens.js` needs; the UI wiring is handled separately.

---

## Step 1 — `state.js`: Add Two Fields to GS

Add to the `GS` object initialisation:

```js
GS.lastFloorType  = null;   // 'combat' | 'boss' | 'shop' | 'event' | null
GS.encounterFlags = {};     // cross-encounter continuity flags (already may exist — do not duplicate)
```

**Remove** `GS.lastFloorWasEvent` if it exists. It is replaced by `GS.lastFloorType`.

---

## Step 2 — `nonCombatEncounters.js`: Remove the Back-to-Back Guard

In `pickNonCombatEncounter()`, remove any check against `GS.lastFloorWasEvent`. Back-to-back NCEs are explicitly allowed.

The seen-encounter suppression (rolling window of 8) stays in place — that prevents immediate repeats of the *same* encounter, which is different from preventing consecutive events.

In `markEncounterSeen()`, remove the line `GS.lastFloorWasEvent = true` if present.

No other changes to this file.

---

## Step 3 — `encounterGenerator.js`: Full Rewrite of Event Logic

### 3a. Replace `_shouldGenerateEvent` entirely

Delete the current implementation. Replace with:

```js
/**
 * Roll for a random NCE corridor encounter based on what type of floor
 * just resolved. Returns true if an NCE should fire before the next floor.
 *
 * Probabilities are intentionally asymmetric:
 *  - after_boss:   0.50  — the dungeon exhales; corridor feels alive
 *  - after_combat: 0.30  — standard
 *  - after_event:  0.25  — set-piece just fired; normal cadence resumes
 *  - after_shop:   0.10  — player just had a resource beat; cool down
 *  - null / other: 0.00  — no previous floor (run start), never fire
 *
 * Floor 1 never has a preceding floor so this never fires before it.
 * Boss floors themselves are not blocked — the roll fires *after* them.
 *
 * @returns {boolean}
 */
function _shouldGenerateNCE() {
    const chances = {
        boss:   0.50,
        combat: 0.30,
        event:  0.25,
        shop:   0.10,
    };
    const chance = chances[GS.lastFloorType] ?? 0.00;
    return Math.random() < chance;
}
```

### 3b. Rename and scope `_generateEventEncounter`

Rename to `_generateNCE` for clarity. Its behaviour is unchanged — it calls `pickNonCombatEncounter()` and wraps the result. If the pool returns null, fall back silently to `null` (do not fall back to combat — the caller handles null):

```js
/**
 * Generate a random NCE corridor encounter.
 * Returns null if the pool is empty (caller must handle gracefully).
 * @param {number} floor — current floor number, for context only
 * @returns {object|null}
 */
function _generateNCE(floor) {
    const event = pickNonCombatEncounter();
    if (!event) return null;

    return {
        type:  'nce',       // distinct from blueprint 'event' slots
        floor,              // floor the player is currently on (does not advance)
        event,
    };
}
```

> **Important**: The type is `'nce'`, not `'event'`. Blueprint-scheduled set-pieces remain `type: 'event'`. This distinction is what lets `screens.js` route them to different handlers.

### 3c. Expose `checkForNCE` as a named export

This is the function `screens.js` calls after every floor resolution:

```js
/**
 * After a floor resolves, check whether a random NCE fires.
 * Call this from screens.js immediately after combat/shop/event completion,
 * before advancing GS.floor.
 *
 * Updates GS.lastFloorType as a side effect so subsequent calls reflect
 * the current floor's type.
 *
 * @param {string} resolvedFloorType — the type of floor that just finished
 * @returns {object|null} NCE encounter object, or null if nothing fires
 */
export function checkForNCE(resolvedFloorType) {
    GS.lastFloorType = resolvedFloorType;
    if (!_shouldGenerateNCE()) return null;
    return _generateNCE(GS.floor);
}
```

### 3d. Update `generateEncounter` — blueprint `'event'` path

When the blueprint has `type: 'event'`, do **not** call `_generateNCE`. Instead pass the `eventId` through so `screens.js` can route to the correct set-piece handler:

```js
if (floorBP && floorBP.type === 'event') {
    return {
        type:    'event',
        floor,
        eventId: floorBP.eventId,   // e.g. 'wanderingMerchant', 'cursedShrine'
    };
}
```

The set-piece handlers in `screens.js` are responsible for rendering these. This file does not need to know their content.

### 3e. Remove the legacy NCE roll from `generateEncounter`

Delete the `if (_shouldGenerateEvent(floor))` call that currently sits in the legacy path. The NCE roll has moved entirely to `checkForNCE`, which fires externally from `screens.js`. `generateEncounter` now only returns combat/boss/shop/event floors — never NCEs.

### 3f. `resolveEventChoice` — update `lastFloorType` removal

In `resolveEventChoice`, remove the line `GS.lastFloorWasEvent = true`. It has been replaced by the `checkForNCE` mechanism.

### 3g. `_generateEncounterLegacy` — remove `lastFloorWasEvent` reset

Remove `GS.lastFloorWasEvent = false` from `_generateEncounterLegacy`. No replacement needed.

---

## Step 4 — `dungeonBlueprint.js`: No Structural Changes

The blueprint system is correct as-is. `EVENT_POOLS` IDs remain in place. `generateAct` continues to emit `{ floor, type: 'event', eventId }` for event slots.

One minor addition: export `EVENT_POOLS` so `screens.js` can reference the valid set-piece IDs when building handlers:

```js
export { EVENT_POOLS };
```

No other changes.

---

## Step 5 — `encounterGenerator.js`: Final Export List

Ensure the following are exported. Remove anything that was only needed for the old `_shouldGenerateEvent` logic:

```js
// Existing — keep
export { generateEncounter };
export { applyEliteChoice };
export { applyFloorScaling };
export { calculateAvgDamage };
export { deepClone };
export { calculateRewardMultipliers };

// Updated — keep
export { resolveEventChoice };

// New
export { checkForNCE };

// Re-exported from nonCombatEncounters for screens.js convenience
export { applyEncounterResult, markEncounterSeen };
```

---

## Step 6 — `screens.js` Integration Points (Out of Scope — Reference Only)

This ticket does not implement `screens.js` changes. The following is provided so the coding agent understands the contract it is building toward.

After any floor completes, `screens.js` should:

```js
// 1. Resolve the floor (combat victory, shop exit, set-piece complete)
// 2. Determine the floor type that just finished
const resolvedType = currentEncounter.type; // 'combat' | 'boss' | 'shop' | 'event'

// 3. Check for NCE
const nce = checkForNCE(resolvedType);
if (nce) {
    showNCEScreen(nce);   // renders nce.event — does not advance GS.floor
    return;               // advancement happens after NCE resolves
}

// 4. No NCE — advance floor normally
GS.floor++;
loadNextFloor();
```

Routing by type:
```js
const encounter = generateEncounter(GS.floor);

switch (encounter.type) {
    case 'combat': showCombatScreen(encounter);     break;
    case 'boss':   showBossScreen(encounter);       break;
    case 'shop':   showShopScreen(encounter);       break;
    case 'event':  showSetPieceScreen(encounter);   break;
    // 'nce' never comes from generateEncounter — only from checkForNCE
}
```

---

## Acceptance Criteria

- [ ] `GS.lastFloorType` is set correctly after every floor resolution via `checkForNCE`
- [ ] `GS.lastFloorWasEvent` does not exist anywhere in the codebase
- [ ] `checkForNCE('boss')` fires at ~50% probability in manual testing
- [ ] `checkForNCE('shop')` fires at ~10% probability in manual testing
- [ ] `checkForNCE(null)` always returns null
- [ ] `generateEncounter` never returns `type: 'nce'`
- [ ] `checkForNCE` never returns `type: 'event'` (only `type: 'nce'`)
- [ ] Blueprint `event` floors return `{ type: 'event', floor, eventId }` with the correct `eventId` from `EVENT_POOLS`
- [ ] Back-to-back NCEs are possible (no guard prevents them)
- [ ] The same NCE does not appear twice within an 8-encounter window (seen-list still active)
- [ ] `dungeonBlueprint.js` generates identically to before this change (no blueprint structure altered)
- [ ] No runtime errors when `pickNonCombatEncounter()` returns null
