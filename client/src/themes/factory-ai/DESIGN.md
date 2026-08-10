# Factory.ai PC/Web Theme Specification

Use this theme for an agent-native software-development product on the web. It is sparse and technical: warm off-white canvas, black command surfaces, monospace display type, precise rules, and a terminal-like product demonstration.

## Evidence and Source Record

- **Observed — source URL:** `https://styles.refero.design/style/13d6fc89-eba2-4724-ac37-20f4f2e5efec`; source image URL is retained in `theme.json`.
- **Observed — local source paths:** `theme.json`, `assets/tokens.json`, `assets/source-preview.jpg`, `assets/cover.jpg`, `implementations/react/style.css`, and `implementations/react/index.tsx`.
- **Observed — screenshot:** the desktop page has a fine black nav, large two-line monospace headline, a small command/demo block, black outlined utility controls, and an overwhelmingly pale field with minimal decoration.
- **Pinned upstream commit:** not applicable; this is a Refero image/metadata reference, not imported Git code.
- **License:** no source image, brand, or font license is recorded locally. Retain it as an internal reference pending rights verification.
- **Conversion notes:** collected source tags and the local desktop capture were translated into React/Web specification rules; no native/terminal application code was migrated.
- **Inference:** responsive composition, focus behavior, and detailed component states below are rules inferred from the visible desktop reference.

## Colors

| Role | Value | Application |
| --- | --- | --- |
| canvas | `#fafafa` | page background |
| ink | `#020202` | headline, command controls, primary action |
| ink-raised | `#101010` | selected/active technical panel |
| warm-rule | `#eeeeee` | separators and quiet panel edges |
| soft-gray | `#b8b3b0` | disabled/supporting marks |
| body-muted | `#5c5855` | technical description |
| body-subtle | `#8a8380` | secondary metadata |
| dark-warm | `#1f1d1c` | terminal/chrome fill |
| dark-soft | `#2e2c2b` | terminal secondary fill |
| signal-orange | `#ef6f2e` | a rare status/action accent only |

**Observed:** all values are present in local tokens; the pale field, black typography, thin rules, and small orange marks are visible in the screenshot. Orange is a signal, not a general background.

## Typography

- **Observed:** source metadata names `Geist` and `Geist Mono`; local CSS maps display/mono to Geist Mono and body to Geist with system fallbacks.
- Executable stacks: display `"Geist Mono", ui-monospace, monospace`; body `Geist, Inter, system-ui, sans-serif`; mono `"Geist Mono", ui-monospace, monospace`.
- Scale: hero `52px/1.02/500`, section `28px/1.15/500`, terminal command `13px/1.45/500`, body `15px/1.55/400`, nav `11px/1.3/600`.
- **Inference:** limit monospace display blocks to short statements and commands; prose remains in the body stack for readable scanning.

## Components

- Primary action: ink fill, white label, `40px` height, `4px` corners, no glossy gradient.
- Command/demo block: pale fill with a `1px` warm-rule, monospace prompt/output rows, copy affordance, and visible success/error text.
- Utility action: transparent canvas, thin ink rule, compact uppercase label; focus is a `2px` ink outline offset from the control.
- Product callout: text and a small schematic/terminal artifact share one horizontal baseline; avoid a large rounded marketing card.
- **Inference:** no shadows; use rules, alignment, and type contrast to establish hierarchy.

## Layout

- Desktop content maximum is `1280px` with `32px` outer gutters and `72px` major vertical gaps.
- Header is one shallow row; hide lower-priority links before shrinking the wordmark or primary action.
- Hero favors a `1.2fr / .8fr` grid: headline/copy on the left, sparse technical artifact on the right.
- Keep demonstrations short, aligned to the content grid, and surrounded by empty canvas rather than nested cards.

## Responsive

- This is a single responsive React/Web theme, not a separate mobile/terminal theme.
- Below `900px`, stack the hero and place the technical artifact after the primary action.
- Below `640px`, use `16px` gutters, `36px` hero type, wrapped nav actions, and horizontally scrollable code rows.
- Preserve `44px` touch targets for actionable controls and never rely on hover to reveal terminal output or copy feedback.

## Do's and Don'ts

**Do**

- Keep the canvas quiet, the commands explicit, and the type hierarchy exact.
- Use orange only as a meaningful technical signal with text/icon backup.
- Prefer one credible product artifact to decorative AI imagery.

**Don't**

- Add soft gradients, oversized rounded cards, or dense analytics dashboards.
- Put long paragraphs in monospace or make code the only way to understand a task.
- Hide errors, copy state, or keyboard focus in the pursuit of minimalism.

## Known Gaps

- **Blocking license gap:** source screenshot and Geist font references have no local license evidence; keep this client theme and verify rights before redistribution.
- No official source DESIGN.md, source commit, license, font files, interaction recordings, or dark-mode reference is present.
- The retained capture shows a marketing/developer entry state only; IDE integration, loading, errors, and authenticated workspace behavior are unobserved.
- Local CSS names Geist fonts but does not bundle or load them.
