# Incident PC/Web Theme Specification

Use this theme for transparent operational status and incident communication. It is intentionally plain: white canvas, strong black type, a large alert field, status tabs, and a conspicuous but readable error signal.

## Evidence and Source Record

- **Observed — source URL:** `https://styles.refero.design/style/d9a60077-619a-4cb7-95ed-0c428c2b51ed`; source image URL is retained in `theme.json`.
- **Observed — local source paths:** `theme.json`, `assets/tokens.json`, `assets/source-preview.jpg`, `assets/cover.jpg`, `implementations/react/style.css`, and `implementations/react/index.tsx`.
- **Observed — screenshot:** a status page identifies a region, presents a large pale-red issue panel with alert icon and plain-language impact, exposes Website/App tabs, and lists update timing in a simple table-like chronology.
- **Pinned upstream commit:** not applicable; it is a Refero visual reference rather than a Git migration.
- **License:** no source screenshot, brand, or font license is recorded locally. Treat it as internal reference material until rights are established.
- **Conversion notes:** source capture and palette values are converted into a React/Web status-page specification; the operational copy below is not a claim about any real incident.
- **Inference:** state variants, focus handling, and responsive behavior are implementation rules inferred from the captured desktop page.

## Colors

| Role | Value | Application |
| --- | --- | --- |
| canvas | `#ffffff` | page and content surfaces |
| panel | `#efefef` | quiet navigation/summary surface |
| ink | `#000000` | primary type and controls |
| ink-raised | `#161618` | high-emphasis action |
| alert | `#ff492c` | active incident marker/action |
| alert-soft | `#f25533` | alert detail/icon treatment |
| rule | `#dadada` | table and control separation |
| rule-strong | `#cccccc` | stronger grouped separation |
| info | `#0770e3` | informational update/link |
| maintenance | `#e4d9c8` | scheduled-maintenance surface |
| signal-orange | `#f1641e` | auxiliary service signal |
| signal-pink | `#ff66f4` | auxiliary service signal, never error alone |

**Observed:** white, black, pale red, and red alert relationships are visible in the retained image; values are present in local tokens. Incident severity must always be stated in words and icons as well as color.

## Typography

- **Observed source tags:** `Times` and `Arial` are named by source metadata.
- **Observed local implementation:** executable preview loads `Inter` and uses it for display/body with `ui-monospace` labels.
- Executable stack: display `Arial, Inter, system-ui, sans-serif`; body `Arial, Inter, system-ui, sans-serif`; mono `ui-monospace, SFMono-Regular, Menlo, monospace`.
- Scale: page title `28px/1.2/700`, alert title `20px/1.25/700`, update body `15px/1.5/400`, tab/label `13px/1.3/600`, timestamp `12px/1.35/400`.
- **Inference:** keep typography utilitarian; avoid a decorative serif treatment in time-sensitive status communications.

## Components

- Status alert: pale alert fill, `1px` alert edge, left alert icon, concise title, impact paragraph, and last-updated timestamp.
- Scope tabs: Website/App labels have a persistent selected state and are keyboard-operable; each panel has a text heading.
- Status row: service name, current state icon/text, and update time align in a stable grid; do not hide the active state behind hover.
- Primary action: ink fill with white label, `44px` height, `6px` corners; link-style info action uses blue plus underlined text on focus/hover.
- **Inference:** no shadows; hierarchy comes from type, alert surface, rules, and vertical rhythm.

## Layout

- Desktop content maximum: `960px`; outer gutter: `24px`; major vertical gap: `32px`.
- Place region/status title first, then the current alert, then scope tabs, then chronological updates. This order is mandatory for scanning.
- Use a single main column; wide historical tables may scroll horizontally with sticky row labels.
- Limit unrelated navigation to a small utility row so urgent status remains first.

## Responsive

- This is one responsive React/Web theme, not a mobile product split.
- Below `680px`, use `16px` gutters, stack alert metadata below the alert copy, and retain Website/App tabs as a horizontal scroll rail if needed.
- Keep alert actions, tabs, and close/dismiss controls at least `44px`; keyboard focus remains visible on white and alert surfaces.
- Do not reduce update timestamps below `12px` or replace written impact with an icon-only state.

## Do's and Don'ts

**Do**

- Lead with current impact, affected scope, timestamp, and next update expectation.
- Use direct language and pair each signal color with text and icon semantics.
- Keep chronological updates simple, stable, and easy to copy/share.

**Don't**

- Bury an active incident under marketing navigation or decorative imagery.
- Use red/pink/orange without an explicit severity/state label.
- Auto-dismiss incidents, rely on hover for details, or make historical updates unreadable on narrow screens.

## Known Gaps

- **Blocking license gap:** source screenshot, brand imagery, and font references have no local license evidence; keep this client theme and verify rights before redistribution.
- No official source DESIGN.md, Git commit, license, font files, complete state taxonomy, or accessibility audit is retained locally.
- The screenshot shows one active-incident page only; all-clear, maintenance scheduling, subscriptions, authentication, and error/loading states are unobserved.
- The local preview uses Inter rather than the source-tagged Times/Arial pairing.
