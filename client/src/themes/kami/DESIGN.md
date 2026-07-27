# Kami PC/Web Theme Specification

Kami is a document-first desktop/web system for one-pagers, white papers, resumes, and portfolios. Treat reading order, evidence density, and print-like hierarchy as the product; decoration is secondary.

## Evidence and Source Record

- **Observed — local source paths:** `index.tsx`, `style.css`, `components/*.tsx`, `templates/*.tsx`, and `assets/kami-demo-tesla.png` in this theme directory are the evidence set for this specification.
- **Observed — implementation:** the React preview exposes Design, Components, and Templates tabs and uses a local screenshot rather than a remote runtime dependency.
- **Pinned upstream commit:** not applicable; this is repository-authored theme code, not a pinned upstream migration.
- **License:** repository-authored code is covered by the repository root `LICENSE` (MIT). The local demo image has no separate provenance record.
- **Conversion notes:** this document converts the existing React/CSS implementation into an executable PC/Web specification; no mobile variant or platform subdirectory is introduced.
- **Inference:** typography sizes and breakpoint behavior below complete gaps left by the current component samples while preserving their observed visual language.

## Colors

Use these semantic roles exactly:

| Role | Value | Application |
| --- | --- | --- |
| page | `#fffaf0` | browser canvas and outer margins |
| paper | `#f7f1e3` | document sheets, cards, tables |
| ink | `#2f2a24` | body text |
| ink-blue | `#1f3a5f` | headings, primary actions, table headers |
| link-blue | `#375f8e` | inline links and secondary emphasis |
| rule | `#e4d5bd` | dividers and table rules |
| gilded | `#b88746` | rare editorial accent, never body copy |

**Observed:** these values are declared by `style.css` and the preview configuration. The current component shadow is `0 14px 36px rgba(31, 58, 95, 0.10)`; the larger page-preview shadow is `0 18px 48px rgba(31, 58, 95, 0.12)`.

## Typography

- Display and English editorial headings: `Charter, Georgia, "Times New Roman", serif`.
- Chinese-first body copy: `TsangerJinKai02, Charter, Georgia, serif`.
- Labels, source notes, and token values: `ui-monospace, SFMono-Regular, Menlo, Consolas, monospace`.
- **Inference — executable scale:** page title `48px/1.08/700`, section title `30px/1.2/700`, card title `20px/1.3/700`, body `16px/1.7/400`, caption `12px/1.4/600` with `0.04em` tracking only on uppercase labels.
- Keep body measures between 60 and 76 characters. Do not simulate unavailable typefaces with images.

## Components

- **Observed — primary button:** ink-blue fill, page-colored text, `44px` minimum height, `18px` horizontal padding, `6px` corners, weight `700`.
- **Observed — editorial card/template:** paper fill, `1px` rule, `18px` padding, `4px` corners, restrained blue-tinted lift.
- **Observed — specification table:** collapsed rules, left alignment, `10px 12px` cells, monospace ink-blue headers.
- **Observed — resource tabs:** keep Components and Templates as peers of the Design view; each component/template remains a focused React file.
- **Inference:** links are underlined on hover/focus; inputs use paper fill, ink text, a `1px` rule, `44px` height, and a visible ink-blue focus outline.

## Layout

- Desktop content width is `min(1320px, calc(100vw - 48px))`, centered, with `42px` top and `76px` bottom breathing room.
- Use a single document column for long-form reading. Supporting component grids use `repeat(auto-fit, minmax(220px, 1fr))`; template grids use a `280px` minimum.
- Use the gap sequence `6px, 10px, 16px, 24px, 36px, 64px`; `64px` separates major narrative sections.
- Preserve generous page margins and place tables, quotations, and evidence inside the reading flow rather than in a marketing-card wall.

## Responsive

- This is one responsive React/Web theme, not a mobile-theme fork.
- At `980px` and below, multi-column systems reduce to two columns. At `720px` and below, header actions wrap, metadata and resource grids become one column, and the outer gutter becomes `16px`.
- Keep controls at least `44px` high and allow tables to scroll horizontally rather than compressing values into unreadable columns.
- On narrow screens, reduce the page title to `36px`; preserve body size and reading measure.

## Do's and Don'ts

**Do**

- Use ink blue for hierarchy and action, not as a full-page fill.
- Keep ample margins, stable baselines, and evidence close to the claim it supports.
- Let rules, tables, footnotes, and quotations feel native to the document.

**Don't**

- Build a dense SaaS dashboard or marketing-card mosaic with this theme.
- Add saturated gradients, oversized pills, or decorative effects that compete with reading.
- Use the gilded accent for long text or essential status meaning.

## Known Gaps

- The demo image has no separately recorded origin or license; replace it before external redistribution if provenance cannot be established.
- Charter and TsangerJinKai02 font files are not bundled in this theme, so fallback rendering varies by host.
- No print stylesheet, PDF pagination rules, dark mode, or RTL sample is currently present.
