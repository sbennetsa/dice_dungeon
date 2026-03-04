# Dice Dungeon — Font System Spec

## Font Stack

Three fonts, each with a clear role:

| Role | Font | Fallback | Usage |
|------|------|----------|-------|
| **Headings** | Cinzel | Georgia, "Times New Roman", serif | h1, h2, h3, enemy names, artifact names, floor titles, boss names, screen titles |
| **Body** | Crimson Text | Georgia, "Times New Roman", serif | Descriptions, combat log text, flavor text, tooltips, event narrative, card body text |
| **Data** | JetBrains Mono | "Courier New", Consolas, monospace | Dice values, HP/ATK/DEF numbers, gold amounts, XP values, damage numbers, stat labels |

## Google Fonts Load

Replace the existing Google Fonts `<link>` tag in `index.html` with:

```html
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Cinzel:wght@400;600;700&family=Crimson+Text:ital,wght@0,400;0,600;0,700;1,400&family=JetBrains+Mono:wght@400;600;700&display=swap" rel="stylesheet">
```

Make sure the service worker caches these font files for offline PWA use. Either cache the Google Fonts CSS + woff2 responses at install time, or self-host the `.woff2` files from the project's own static assets.

## REM-Based Sizing System

### Root Font Size with Breakpoints

Set the root font size on `<html>` and adjust at three breakpoints. All other sizing throughout the CSS should use `rem` units so everything scales from this single value.

```css
:root {
  /* ─── Font families ─── */
  --font-heading: 'Cinzel', Georgia, 'Times New Roman', serif;
  --font-body: 'Crimson Text', Georgia, 'Times New Roman', serif;
  --font-data: 'JetBrains Mono', 'Courier New', Consolas, monospace;

  /* ─── Font size scale (in rem) ─── */
  --text-xs:   0.7rem;    /* fine print, labels */
  --text-sm:   0.8rem;    /* combat log lines, small UI text */
  --text-base: 1rem;      /* body text, descriptions */
  --text-md:   1.15rem;   /* enemy names, artifact names */
  --text-lg:   1.4rem;    /* subheadings (h3), floor subtitles */
  --text-xl:   1.75rem;   /* section headings (h2), boss names */
  --text-2xl:  2.2rem;    /* screen titles (h1) */

  /* ─── Spacing scale (in rem) ─── */
  --space-xs:  0.25rem;
  --space-sm:  0.5rem;
  --space-md:  0.75rem;
  --space-lg:  1rem;
  --space-xl:  1.5rem;
}

/* ─── Mobile (default) ─── */
html {
  font-size: 15px;
}

/* ─── Tablet (600px+) ─── */
@media (min-width: 600px) {
  html {
    font-size: 16px;
  }
}

/* ─── Desktop (1024px+) ─── */
@media (min-width: 1024px) {
  html {
    font-size: 17px;
  }
}
```

### Applying the Scale

Use the CSS custom properties everywhere instead of hard-coded px values. Examples:

```css
/* Headings */
h1 {
  font-family: var(--font-heading);
  font-size: var(--text-2xl);
  font-weight: 700;
  letter-spacing: 0.05em;
}

h2 {
  font-family: var(--font-heading);
  font-size: var(--text-xl);
  font-weight: 600;
  letter-spacing: 0.03em;
}

h3 {
  font-family: var(--font-heading);
  font-size: var(--text-lg);
  font-weight: 600;
}

/* Body text */
body {
  font-family: var(--font-body);
  font-size: var(--text-base);
  line-height: 1.55;
}

/* Enemy / artifact names (inline headings, not h tags) */
.enemy-name,
.artifact-name {
  font-family: var(--font-heading);
  font-size: var(--text-md);
  font-weight: 600;
}

/* Stat values, dice, numerical data */
.stat-value,
.dice-value,
.gold-amount,
.xp-amount,
.damage-number {
  font-family: var(--font-data);
  font-size: var(--text-sm);
  font-weight: 600;
}

/* Combat log */
.combat-log-line {
  font-family: var(--font-body);
  font-size: var(--text-sm);
  line-height: 1.6;
}

/* Small labels, tags, ability names */
.ability-tag,
.stat-label {
  font-family: var(--font-data);
  font-size: var(--text-xs);
  text-transform: uppercase;
  letter-spacing: 0.08em;
}

/* Floor header */
.floor-number {
  font-family: var(--font-data);
  font-size: var(--text-xs);
  text-transform: uppercase;
  letter-spacing: 0.15em;
}

.floor-name {
  font-family: var(--font-heading);
  font-size: var(--text-xl);
  font-weight: 700;
}
```

## Migration Notes

When converting existing CSS from `px` to `rem`:

- Do **not** convert fixed layout values like borders, box shadows, or icon sizes — those stay in `px`.
- Convert font-size, padding, margin, and gap values to `rem` using the scale variables above.
- Anywhere the old CSS references `font-family: 'Uncial Antiqua'`, replace with `var(--font-heading)`.
- Anywhere the old CSS references `font-family: 'EB Garamond'`, replace with `var(--font-body)`.
- Anywhere the old CSS references `font-family: 'JetBrains Mono'`, replace with `var(--font-data)`.
- Search for any remaining hard-coded `font-family` declarations and unify them under the three CSS variables.

## Heading Styling Tips

Cinzel looks best with a bit of letter-spacing. Recommendations:

- h1: `letter-spacing: 0.05em` — gives it that engraved-in-stone feel
- h2: `letter-spacing: 0.03em`
- h3: `letter-spacing: 0.02em` or none
- `text-transform: uppercase` works well on Cinzel for major titles (h1, floor names, boss names) but skip it on smaller headings to keep readability

## What NOT to Change

- Dice face rendering (if using canvas or SVG for dice, keep those independent of the font system)
- Any pixel-based layout dimensions (grid sizes, card widths, etc.)
- Border widths, box shadows, outlines — keep in `px`
