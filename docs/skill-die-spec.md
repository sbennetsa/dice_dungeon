# Dice Dungeon — 3D Skill Die System
## Implementation Spec for Coding Agent

**Reference prototype:** `skill-tree-d6-v2.html` (attached)
**Integration target:** `screens.js` skill tree screen

---

## Overview

The passive skill tree is a **3D d6 (cube)** rendered with Three.js. The player rotates the die to view each face. Four of the six faces (front, right, back, left) each contain a skill branch. The top and bottom faces are decorative. Each face has **4 passive nodes** in a 2×2 grid and **1 notable node** in the center. All 4 passives must be unlocked before the notable becomes available.

**No bridges exist between faces.** Each face is completely self-contained.

---

## Flow

### 1. Reveal Screen (one-time)
- Full-screen overlay shown before the die exists
- Displays a pulsing cube outline with 🎲 emoji
- Shows: "Reveal the Die" title, "+1 Attack Slot, +1 Defend Slot" effect, SP count
- Player taps to spend 1 SP → unlocks `root`, fades overlay, reveals 3D die
- Root is never shown again after reveal

### 2. Die Interaction
- **Drag** to rotate (single finger/mouse) with momentum + friction decay
- **Pinch** to zoom (two-finger touch), **scroll wheel** on desktop
- Zoom range: 3.0 (close) to 8.0 (far), default 4.8
- **Gentle idle rotation** when no input (subtle sinusoidal y-axis drift)
- **Tap** a node on the front face to select/inspect it
- **Allocate button** appears in detail bar when a selected node is available

### 3. Allocation
- Tapping a node **only inspects** — shows name, description, status in the detail bar
- If the node is available, an "Allocate" button renders in the detail bar
- Pressing Allocate spends 1 SP and unlocks the node
- Tapping empty space or a different node deselects

---

## Data Structure

### Faces
```
4 faces: wide, gold, tall, venom
Each mapped to a cube face: front(+Z), right(+X), back(-Z), left(-X)
Top(+Y) and Bottom(-Y) are decorative only
```

### Face Definitions
| Face  | Label | Color     | Icon | Notable       |
|-------|-------|-----------|------|---------------|
| wide  | Wide  | `#5fa84f` | 🐺   | Swarm Master  |
| gold  | Gold  | `#d4a534` | 💰   | Golden God    |
| tall  | Tall  | `#d48830` | 🔨   | Titan's Wrath |
| venom | Venom | `#9050c0` | 🧪   | Plague Lord   |

### Node Data per Face
Each face has exactly 5 nodes:

**4 Passives** (2×2 grid: top-left, top-right, bottom-left, bottom-right):
- All require only `root` (auto-granted on reveal)
- Can be unlocked in any order
- Each costs 1 SP

**1 Notable** (center):
- Requires ALL 4 passives on its face to be unlocked
- Costs 1 SP
- Represented with 👑 emoji

### Full Node List

**Wide (🐺)**
| ID   | Name         | Description                   | Position    |
|------|-------------|-------------------------------|-------------|
| w_a  | Extra Arms   | +1 Attack Slot                | top-left    |
| w_b  | Pack Tactics | +1 dmg per die in slot        | top-right   |
| w_c  | Shield Wall  | +1 Defend Slot                | bottom-left |
| w_d  | Volley       | 3+ dice in slot = +8 bonus    | bottom-right|
| w_n  | Swarm Master | +2 per die in ANY slot        | center      |

**Gold (💰)**
| ID   | Name          | Description                  | Position    |
|------|--------------|------------------------------|-------------|
| g_a  | Prospector    | +15 gold, +4 gold/combat     | top-left    |
| g_b  | Appraisal     | Shop prices -15%             | top-right   |
| g_c  | Investment    | +1 atk dmg per 15 gold held  | bottom-left |
| g_d  | Compound Int. | +10% of gold after combat    | bottom-right|
| g_n  | Golden God    | +1 dmg/8 gold, free refresh  | center      |

**Tall (🔨)**
| ID   | Name          | Description                  | Position    |
|------|--------------|------------------------------|-------------|
| t_a  | Precision     | +1 Reroll per combat         | top-left    |
| t_b  | Forge         | Unlock Dice Merge at rest    | top-right   |
| t_c  | Threshold     | Dice ≥8 deal +50% value      | bottom-left |
| t_d  | Amplify       | Gain a free Amplifier rune   | bottom-right|
| t_n  | Titan's Wrath | Single-die slots deal ×3     | center      |

**Venom (🧪)**
| ID   | Name         | Description                    | Position    |
|------|-------------|--------------------------------|-------------|
| v_a  | Vitality     | +20 Max HP (heals too)         | top-left    |
| v_b  | Venom        | All attacks apply 1 poison     | top-right   |
| v_c  | Gambler      | +1 Reroll, rerolls deal 2 dmg  | bottom-left |
| v_d  | Regeneration | Heal 3 HP per turn start       | bottom-right|
| v_n  | Plague Lord  | Poison ×2, +2 poison/turn      | center      |

---

## 3D Implementation Details

### Cube Construction
- **Half-size:** 1.2 units (total cube = 2.4 × 2.4 × 2.4)
- **Wireframe edges** via `EdgesGeometry` + `LineSegments`, color `#444466`, opacity 0.18
- **Face panels:** `PlaneGeometry` sized `CS*1.95` (slightly inset from edges), dark fill `#0e0e18` at 85% opacity, `DoubleSide`, constant opacity (do NOT fade with visibility)
- **Decorative top/bottom:** same dark fill, `#0e0e18`, 85% opacity

### Node Rendering (Canvas Textures on Planes)
Nodes are **NOT 3D spheres**. Each node is a flat `PlaneGeometry` with a `CanvasTexture` rendered on it, sitting slightly above the face panel surface.

**Canvas texture (256×256px) renders:**
- Diamond shape (45° rotated rounded rectangle)
- Emoji icon centered inside
- Node name label below
- Visual state determines fill, border, glow, opacity (see Visual States below)

**Node plane properties:**
- Passive planes: `CS * 0.72` (≈0.864 units)
- Notable planes: `CS * 0.58` (≈0.696 units)
- Material: `MeshBasicMaterial`, `transparent: true`, `side: DoubleSide`, `depthWrite: false`, `depthTest: false`
- `renderOrder: 10` (ensures nodes always draw above face panels)
- **Lift:** nodes offset 0.06 units above face panel surface along face normal

### Node Layout per Face (2×2 Grid + Center)
```
Grid offset from face center: CS * 0.42 (≈0.504 units)

  [TL]  ·  [TR]     ← up + left, up + right
      [C]            ← center (notable)
  [BL]  ·  [BR]     ← down + left, down + right
```
Each node plane is oriented via `lookAt(position + faceNormal)`.

### Face Visibility System
Each frame, compute dot product of each face's outward normal against the camera direction (in die-group local space):

```javascript
function getFaceVis() {
  const camLocal = dieGroup.worldToLocal(camera.position.clone()).normalize();
  return faceNormals.map(n => {
    const d = n.dot(camLocal);
    if (d > 0.2) return 1;    // fully facing → visible
    if (d < -0.15) return 0;  // facing away → hidden
    return (d + 0.15) / 0.35; // smooth ramp between
  });
}
```

**Node opacity** = face visibility value (0–1). This means:
- Front face nodes: full opacity
- Adjacent face nodes: fade in/out smoothly as die rotates
- Back face nodes: invisible
- Face panels themselves stay at constant 85% (solid die body)

**Front face** = face with highest visibility value. Used for:
- Face indicator label in HUD
- Raycast target filtering (only front face nodes are clickable)

---

## Visual States

### Passive Nodes
| State     | Diamond Fill          | Border                    | Emoji α | Name Color           | Additional              |
|-----------|-----------------------|---------------------------|---------|----------------------|-------------------------|
| Locked    | `rgba(20,20,35,0.7)`  | `rgba(255,255,255,0.18)`  | 0.30    | `rgba(255,255,255,0.18)` | —                   |
| Available | `hex + '15'`          | `hex + '88'`, 2px         | 0.85    | `hex + '99'`         | Subtle scale pulse      |
| Unlocked  | `hex + '80'`          | `hex`, 3.5px + shadow/glow| 1.0     | `hex`                | Outer radial glow, facet cross lines |

### Notable Nodes
The notable diamond is **split into 4 triangular quadrant sections** radiating from center. Each section corresponds to a passive and lights up when that passive is unlocked.

| Passives Lit | Quadrant Fill (lit)  | Quadrant Fill (unlit)    | Border              | Emoji α              |
|-------------|----------------------|--------------------------|---------------------|----------------------|
| 0/4         | —                    | `rgba(20,20,35,0.6)`     | `rgba(255,255,255,0.15)` | 0.08            |
| 1–3/4       | `hex + '35'`         | `rgba(20,20,35,0.6)`     | `hex + '55'`        | 0.15 + count × 0.15  |
| 4/4 (avail) | `hex + '35'`         | —                        | `hex`, 4px + shadow | 0.85                 |
| Unlocked    | `hex + '80'` (solid) | —                        | `hex`, 4px + shadow | 1.0                  |

Divider lines between quadrants: lit = `hex + '40'`, unlit = `rgba(255,255,255,0.1)`

### Scale Pulse
Available nodes pulse: `1 + sin(time * 0.003) * 0.05` (only when face visibility > 0.5)

---

## UI Overlay (HTML/CSS)

### HUD (top)
- Left: "⭐ Skill Die" title
- Right: SP badge pill showing "N SP" or "No SP"

### Face Indicator (below HUD)
- Shows `▸ {FaceName}` in the face's color
- Updates every frame based on front face detection

### Detail Bar (bottom, fixed)
- Default: placeholder text "Drag to rotate · Tap a node to inspect"
- On node select: icon + name (in face color) + status badge + description
- Status badges: "✓ UNLOCKED" (face color), "⬆ AVAILABLE" (green), "🔒 Need all 4 passives" / "🔒 Locked" (dim)
- **Allocate button:** only rendered when selected node is available. Green-tinted, `JetBrains Mono` font, calls `doAllocate()`

### Hint (above detail bar)
- "Drag to rotate · Pinch to zoom · Tap a node to inspect"
- Fades out on first interaction (`pointerdown`, once)

---

## Camera & Responsiveness
- Perspective camera, FOV 40°
- Default distance: 4.8 units, positioned at `(0, dist*0.25, dist)` looking at origin
- Zoom range: 3.0 to 8.0 via pinch or scroll wheel
- Viewport: `100dvh` for mobile, resize handler updates aspect ratio + renderer size

---

## Input Handling

### Mouse
- `mousedown` → start drag
- `mousemove` → rotate die (dx → Y rotation, dy → X rotation, scale 0.005)
- `mouseup` → stop drag; if `dragDist < 6` treat as tap
- `wheel` → zoom (deltaY × 0.005)

### Touch
- Single finger: same as mouse drag/tap (threshold `dragDist < 12`)
- Two fingers: pinch zoom via distance delta × 0.02
- Touch and mouse events are fully separated (no cross-firing)

### Rotation Physics
- Velocity stored as `{x, y}`, applied each frame when not dragging
- Friction: multiply by 0.96 per frame
- Idle drift: when velocity near zero, gentle sinusoidal Y rotation

---

## State Management
```javascript
let unlocked = new Set();     // node IDs that have been unlocked
let skillPoints = N;          // available points
let dieRevealed = false;      // true after root unlock
let selectedNodeId = null;    // currently inspected node
```

### Key Functions
- `isUnlocked(id)` → boolean
- `allPassives(faceKey)` → true if all 4 passives on face are unlocked
- `getNodeAvail(nodeId)` → true if node can be unlocked (not unlocked, SP > 0, meets requirements)
- `doAllocate()` → unlocks `selectedNodeId`, decrements SP, refreshes textures on that face

### Texture Caching
Node textures are only regenerated when state changes. Track `_lastState` and `_lastLit` (for notables) per mesh. Force refresh by setting both to null after allocation.

---

## Integration Notes

### Where this fits in the game
- Accessed from the **rest/camp screen** between encounters
- Player earns SP from leveling up (1 SP per level)
- Starting SP: varies by game state
- Unlocked passives must apply their effects to the combat/economy systems

### Effects to wire up
Each node's `desc` field describes the mechanical effect. These need to be read by the combat engine, shop system, and dice rolling system. Suggested approach: maintain a derived `activeEffects` object computed from `unlocked` set.

### What was removed (and why)
- **Bridges between faces**: removed because all passives are freely available (no pathing to gate). If cross-face bonuses are desired later, they should connect notables, not passives.
- **Ring/core view**: removed because the reveal screen replaces it. No intermediate gating step.
- **Connection/grid lines**: removed for visual clarity on the 3D die. The 2×2 grid + center layout is self-explanatory.
- **Double-tap to unlock**: replaced with explicit Allocate button for reliability on mobile.

### Fonts
- `EB Garamond` (body/titles, serif)
- `JetBrains Mono` (labels, badges, buttons, monospace)

### Colors
| Purpose     | Value     |
|-------------|-----------|
| Background  | `#06060c` |
| Text        | `#e8e0d4` |
| Gold accent | `#d4a534` |
| Wide        | `#5fa84f` |
| Gold face   | `#d4a534` |
| Tall        | `#d48830` |
| Venom       | `#9050c0` |
| Die panels  | `#0e0e18` |
| Wireframe   | `#444466` |
| Allocate btn| `#80ff80` |
