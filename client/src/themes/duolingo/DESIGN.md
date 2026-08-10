# Duolingo PC/Web Theme Specification

Use this theme for playful, progress-oriented learning experiences on the web. The retained desktop reference relies on a bright white canvas, friendly illustration, a dominant green action, and compact secondary controls.

## Evidence and Source Record

- **Observed — source URL:** `https://styles.refero.design/style/95b472c5-fc07-46a8-a11f-c5432e290fcd`; source image URL is recorded in `theme.json`.
- **Observed — local source paths:** `theme.json`, `assets/tokens.json`, `assets/source-preview.jpg`, `assets/cover.jpg`, `implementations/react/style.css`, and `implementations/react/index.tsx`.
- **Observed — screenshot:** a sparse top bar frames a centered two-part hero (character group and onboarding copy), a bright green primary action, a light outlined secondary action, and a bottom language rail.
- **Pinned upstream commit:** not applicable; this is a Refero image/metadata reference, not imported Git code.
- **License:** no brand-asset or screenshot license is recorded locally. Use as internal visual reference unless redistribution rights are established.
- **Conversion notes:** collected color/font names and the retained desktop image were converted into reusable React/Web rules; mobile-app behavior is outside this theme.
- **Inference:** the component scale and breakpoints below extend the observed desktop composition without asserting official Duolingo tokens.

## Colors

| Role | Value | Application |
| --- | --- | --- |
| action-green | `#58cc02` | primary action, progress, brand mark |
| green-soft | `#d7ffb8` | selected/positive background |
| action-blue | `#1cb0f6` | links, alternate learning action |
| heading-blue | `#042c60` | special dark heading surface |
| canvas | `#ffffff` | primary page and cards |
| ink | `#3c3c3c` | headings and primary copy |
| ink-muted | `#777777` | support copy |
| ink-strong | `#4b4b4b` | control labels |
| rule | `#e5e5e5` | separators and outlined controls |
| night | `#100f3e` | rare dark campaign section |

**Observed:** all values are retained in `assets/tokens.json`; green/white/gray are directly visible in the local screenshot. Blue and night roles come from source metadata and are secondary here.

## Typography

- **Observed source tags:** `din-round` and `feather` are named by the collected source metadata.
- **Observed local implementation:** the executable preview loads `Inter` weights `400–800` and uses `ui-monospace` for technical labels.
- **Executable fallback:** body/display `Inter, system-ui, sans-serif`; mono `ui-monospace, SFMono-Regular, Menlo, monospace`. Use DIN Round only when a licensed file is supplied.
- Scale: hero `32px/1.2/700`, section heading `24px/1.25/700`, control `14px/1.2/800` with `0.04em` tracking, body `16px/1.5/500`, caption `12px/1.35/600`.
- **Inference:** rounded weight and short line lengths create the friendly voice; do not use ultra-light type.

## Components

- Primary action: action-green fill, white uppercase label, `46px` height, `12px` corners, and a darker/lower edge that reads as press depth.
- Secondary action: white fill, rule outline, action-blue label, same dimensions as primary.
- Language/category rail: compact icon-label items in a horizontal scroll container with a visible selected state.
- Progress card: canvas fill, rule separation, green progress indicator, plain-language next step.
- **Inference:** illustration and copy form a single hero component; artwork has meaningful alt text or is hidden when redundant.

## Layout

- Desktop outer frame is full-width white with `32px` gutters and a content maximum near `1120px`.
- Hero uses two balanced columns, vertically centered, with illustration on the left and a `360px` maximum copy/action column on the right.
- Keep the middle of the page intentionally sparse. The bottom language rail is separate from the primary onboarding task.
- Use `8px, 16px, 24px, 40px, 64px` as the gap sequence and avoid dense dashboard grids.

## Responsive

- This is one React/Web theme; do not treat the retained mobile tag as authorization to add a mobile-theme directory.
- Below `820px`, stack artwork above copy, center the hero, and keep actions at `min(100%, 360px)`.
- Below `560px`, use `16px` gutters, hero type `28px`, and horizontal scrolling for the language rail.
- Maintain `44px` targets, persistent keyboard focus, and reduced-motion alternatives for celebratory animation.

## Do's and Don'ts

**Do**

- Make one next learning action unmistakable with green.
- Use friendly illustration, visible progress, and short encouraging copy.
- Preserve generous white space and compact, consistent controls.

**Don't**

- Apply green to every surface or rely on it alone to communicate success.
- Replace the learning journey with a generic commerce/card dashboard.
- Use dark enterprise styling, thin typography, or tiny targets that undermine approachability.

## Known Gaps

- **Blocking license gap:** brand imagery, screenshot, and DIN Round/Feather font references have no local license evidence; keep this client theme and verify rights before redistribution.
- No official source DESIGN.md, Git commit, asset license, DIN Round/Feather font files, or motion specifications are retained locally.
- The screenshot covers one landing/onboarding state only; lesson flows, error states, streaks, and accessibility behavior remain unobserved.
- The local preview uses Inter, so it approximates rather than reproduces the named source typefaces.
