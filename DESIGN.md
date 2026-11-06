---
name: Elentrik
description: Existing Nuxt UI blue/slate application system
colors:
  primary: "var(--ui-primary)"
  canvas: "var(--ui-bg)"
  text: "var(--ui-text)"
  highlighted: "var(--ui-text-highlighted)"
  muted: "var(--ui-text-muted)"
  inverted: "var(--ui-text-inverted)"
  elevated: "var(--ui-bg-elevated)"
  border: "var(--ui-border)"
  border-accented: "var(--ui-border-accented)"
  success: "var(--ui-success)"
  warning: "var(--ui-warning)"
  error: "var(--ui-error)"
typography:
  headline:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', 'Noto Sans', Arial, sans-serif, 'Apple Color Emoji', 'Segoe UI Emoji', 'Segoe UI Symbol', 'Noto Color Emoji'"
    fontSize: "1.5rem"
    fontWeight: 600
    lineHeight: "2rem"
  title:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', 'Noto Sans', Arial, sans-serif, 'Apple Color Emoji', 'Segoe UI Emoji', 'Segoe UI Symbol', 'Noto Color Emoji'"
    fontSize: "1.25rem"
    fontWeight: 600
    lineHeight: "1.75rem"
  section:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', 'Noto Sans', Arial, sans-serif, 'Apple Color Emoji', 'Segoe UI Emoji', 'Segoe UI Symbol', 'Noto Color Emoji'"
    fontSize: "1.125rem"
    fontWeight: 600
    lineHeight: "1.75rem"
  body:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', 'Noto Sans', Arial, sans-serif, 'Apple Color Emoji', 'Segoe UI Emoji', 'Segoe UI Symbol', 'Noto Color Emoji'"
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: "1.5rem"
  label:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', 'Noto Sans', Arial, sans-serif, 'Apple Color Emoji', 'Segoe UI Emoji', 'Segoe UI Symbol', 'Noto Color Emoji'"
    fontSize: "0.875rem"
    fontWeight: 500
    lineHeight: "1.25rem"
  metadata:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', 'Noto Sans', Arial, sans-serif, 'Apple Color Emoji', 'Segoe UI Emoji', 'Segoe UI Symbol', 'Noto Color Emoji'"
    fontSize: "0.75rem"
    fontWeight: 400
    lineHeight: "1rem"
rounded:
  sm: "0.25rem"
  md: "0.375rem"
  lg: "0.5rem"
spacing:
  "1": "0.25rem"
  "2": "0.5rem"
  "3": "0.75rem"
  "4": "1rem"
  "5": "1.25rem"
  "6": "1.5rem"
  "8": "2rem"
  "10": "2.5rem"
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.inverted}"
    rounded: "{rounded.md}"
    padding: "0.375rem 0.625rem"
    typography: "{typography.label}"
  button-ghost:
    backgroundColor: "transparent"
    textColor: "{colors.text}"
    rounded: "{rounded.md}"
    padding: "0.375rem 0.625rem"
    typography: "{typography.label}"
  button-outline:
    backgroundColor: "{colors.canvas}"
    textColor: "{colors.text}"
    rounded: "{rounded.md}"
    padding: "0.375rem 0.625rem"
    typography: "{typography.label}"
  input:
    backgroundColor: "{colors.canvas}"
    textColor: "{colors.highlighted}"
    rounded: "{rounded.md}"
    padding: "0.375rem 0.625rem"
  card:
    backgroundColor: "{colors.canvas}"
    rounded: "{rounded.lg}"
  chip:
    backgroundColor: "{colors.elevated}"
    textColor: "{colors.text}"
    rounded: "{rounded.md}"
    padding: "0.25rem 0.5rem"
    typography: "{typography.metadata}"
  navigation:
    textColor: "{colors.muted}"
    padding: "0.75rem"
    typography: "{typography.label}"
---
# Design System: Elentrik

## Overview

**Creative North Star: "Existing Nuxt UI blue/slate interface"**

Elentrik uses a restrained application interface: blue actions, slate neutrals, compact sans text, Lucide icons, thin separators, and focused forms. This is a record of the incumbent implementation, not a new visual identity or a claim about production deployment.

The admin area extends that system with linked records, horizontally scrollable tables, and explicit correction controls. The electrical editor retains its own dense toolbars and drawing surface. Page-specific composition remains in the surface brief; it is not a product-wide layout rule.

**Key Characteristics:**

- Semantic colours preserve light and dark themes.
- Compact hierarchy and labelled controls support operational work.
- Borders and tonal surfaces supply structure; floating results can use shadows.

## Colors

Blue supplies the primary interaction colour; slate supplies the neutral field, text, rules, and raised surfaces. The frontmatter deliberately preserves the live CSS semantic variables because their values change with the existing theme. It does not introduce a separate palette.

### Primary

- **Action Blue** (`primary`): primary buttons, linked record names, selected navigation, and focus feedback. Its configured source is Tailwind blue through Nuxt UI.

### Neutral

- **Canvas** (`canvas`): white in the light theme, slate-900 in the dark theme.
- **Reading Slate** (`text`): slate-700 in light mode, slate-200 in dark mode.
- **Strong Text** (`highlighted`): slate-900 in light mode, white in dark mode.
- **Quiet Text** (`muted`): slate-500 in light mode, slate-400 in dark mode.
- **Raised Surface** (`elevated`): slate-100 in light mode, slate-800 in dark mode.
- **Rules** (`border`): slate-200 in light mode, slate-800 in dark mode. Accented input rules use slate-300/slate-700.
- **Inverse Text** (`inverted`): white in light mode, slate-900 in dark mode.

Success, warning, and error are existing semantic feedback roles, not extra brand accents. Retain the installed Nuxt UI mappings for status badges, alerts, and validation.

**The Semantic Theme Rule.** Use the existing semantic colour roles for UI surfaces, text, rules, and interaction states.

## Typography

The existing body and interface headings use Tailwind's inherited sans stack, recorded in the frontmatter. This documents continuity with the pinned interface; it does not commission a new display face. There is no separate display hierarchy in these operational screens.

The headline role appears on page titles, title and section roles on grouped information, body on ordinary content, label on controls and table text, and metadata on secondary context. Regular, medium, and semibold weights create hierarchy. Small table text commonly retains regular weight; the label token captures control labels. Counts and tables use tabular numerals. Nuxt UI medium inputs use body-sized text below the medium breakpoint and label-sized text above it, with a fixed 1.25rem line height.

## Layout

Spacing follows Tailwind's quarter-rem base. The admin shell is centred in an 80rem maximum width, with 1rem side padding and 1.5rem from the small breakpoint. Main content has 2rem vertical padding. Customer pages retain their existing UContainer layouts; the editor retains its viewport workspace.

Admin filters wrap. Table content scrolls inside its own container on narrow screens. Header search occupies a full row below the large breakpoint, then a 24rem slot. Attention sections become two columns at the large breakpoint. The final overview uses a compact three-column count strip at all widths; this is an admin surface choice, not a universal metric-card pattern.

Comfortable forms enforce a 44px minimum control height and 16px input text at widths up to 640px. The selector is scoped to forms so dense drawing toolbars retain their existing proportions.

## Elevation & Depth

Most content stays flat, separated by fine borders, whitespace, and tonal changes. Cards use outline rings rather than decorative shadows. Floating global search results use the existing large shadow; this prevents a blanket no-shadow rule. The exact shadow and inherited transition values are in the sidecar.

**The Structural Depth Rule.** Follow existing component depth: bordered content surfaces and elevated floating results.

## Shapes

Controls use gently rounded medium corners; cards, search result panels, and correction forms use the larger corner token. Tables and navigation use straight rules. Lucide outline icons supply action and status symbols; preserve the established icon vocabulary.

## Components

### Buttons

Nuxt UI primary solid buttons carry the action colour and inverse text. Medium buttons use the label type role and the frontmatter padding. Hover and active states reduce the primary background to 75% opacity. Neutral outline and ghost variants support secondary actions, with elevated neutral hover/active fills. Library focus-visible outlines remain present; pending and disabled controls retain their existing feedback.

### Chips

Status badges use Nuxt UI variants. The sidecar shows the existing medium neutral subtle badge: a raised neutral fill, accented inset ring, and medium-weight metadata-sized text. Success/warning badges communicate effective access. Small badges seen in search are not promoted to a general text-size recommendation.

### Cards / Containers

UCard uses a rounded outline surface with section dividers. Body padding grows from 1rem to 1.5rem at the small breakpoint. Correction forms are a separate bordered pattern with 1.25rem padding, a 42rem maximum width, and labelled fields. Ordinary admin attention sections remain divided lists rather than additional cards.

### Inputs / Fields

Default Nuxt UI outline inputs use the canvas fill, highlighted text, accented inset ring, and primary focus ring/outline. Medium padding is recorded in the frontmatter. Disabled inputs reduce opacity and show a disabled cursor. Keep external form labels; a placeholder does not replace them. Input text size and comfortable-form overrides follow Layout and Typography.

### Navigation

Admin navigation uses medium-weight compact text and a transparent bottom rule at rest. The active route switches the rule and text to primary; hover strengthens text and keyboard focus shows a primary outline. It scrolls horizontally on narrow screens. This is the admin shell's implementation, not a requirement to replace the customer header.

### Tables and linked records

Admin tables use muted medium-weight headers, thin horizontal rules, regular small body text, tabular numbers, and blue linked row identities. Row hover applies a half-opacity elevated fill. Cells wrap long content while the table container can scroll. Pagination and result totals remain beneath the table.

## Plan-editor

The embedded plan editor (`apps/plan-editor`, shown in an iframe) is deliberately light, like paper, in every app theme. It does not follow the dark theme: a floor plan is drawn on, and printed as, a white sheet.

Its colours and small text size are CSS variables defined once in `apps/plan-editor/src/style.css`; `App.svelte` uses only these tokens, never raw hex values:

- Surfaces and ink: `--plan-papier`, `--plan-vlak`, `--plan-inkt`, `--plan-inkt-zacht`.
- Lines and states: `--plan-rand`, `--plan-rand-invoer`, `--plan-hover`.
- Accent (active tool, focus, selection): `--plan-accent`, `--plan-accent-zacht`, `--plan-accent-inkt`, `--plan-selectie`.
- Errors: `--plan-fout-inkt`, `--plan-fout-vlak`.
- Small text: `--plan-tekst-klein` (0.8125rem).

The vendored OpenPlan3D canvas in `apps/plan-editor/vendor` is not edited, so its own styling (including the house icon in the empty canvas state) stays as upstream ships it.

## Do's and Don'ts

### Do:

- Do use semantic Nuxt UI colours so light and dark modes stay connected.
- Do preserve visible labels, focus feedback, and the three supported interface languages.
- Do reuse existing component variants and Lucide icons.
- Do preserve readable table columns through local horizontal scrolling.

### Don't:

- Don't hard-code a light-only palette in shared components.
- Don't apply the comfortable-form control minimum to every editor toolbar.
- Don't turn admin-specific composition into a rule for every product screen.
