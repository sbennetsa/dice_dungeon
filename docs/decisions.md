# Design Decisions

A record of intentional design choices made during development, including the reasoning behind them. Reference this before changing related systems.

---

## Elite Encounter UI — Visible vs. Hidden Modifier Display

**Date:** 2026-03-01
**Status:** Decided

### Decision
The EncounterChoice screen shows the **visible modifier's effects as discrete, labelled bullet points** — never as aggregate computed stats that include the hidden modifier.

### What to show
- The visible modifier's named effects individually: dice upgrade (e.g. "d6 → d8"), HP multiplier, gold/XP multipliers, and passive name + description if one is added.
- A clear acknowledgement that one hidden modifier also applies after committing.

### What NOT to show
- Aggregate HP totals, dice pool strings, or average damage numbers that incorporate both modifiers. Any such number would be wrong in combat (the hidden modifier will also apply), making the Elite offer feel like a bait-and-switch.
- The hidden modifier's identity, effects, or magnitude in any form before the player commits.

### Rationale
If computed stats are shown using only the visible modifier, they are misleading — the player plans around numbers that don't reflect reality. If computed stats are shown using both modifiers, the hidden modifier is revealed. Showing the visible modifier's effects as named discrete changes avoids both problems: the player has real, accurate information about what they're opting into, while the hidden modifier's reveal moment after committing is preserved.

### Implementation note
The Elite card HP display should either be omitted or shown as the **base HP** (before any modifiers) with a `+ ???` note. The post-visible-modifier HP is not a useful number to show because it doesn't account for the hidden modifier.

---

## Skill Die — CSS 3D vs. Three.js

**Date:** 2026-02-28
**Status:** Decided

### Decision
The skill die is implemented as a CSS `transform-style: preserve-3d` rotating cube, not a Three.js scene.

### Rationale
Zero external dependency, no build step required, consistent with the project's no-framework philosophy. A CSS cube is sufficient for a d6 with 4 active faces. A Three.js prototype was built (`docs/skill-tree-d6-v2.html`) but rejected in favour of the CSS approach (`docs/skill-die-css-v1.html`).
