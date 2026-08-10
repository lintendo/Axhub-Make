# Headspace PC/Web Theme Specification

Use this theme for supportive wellbeing and care-navigation experiences. It pairs a white/cream page with warm rounded content panels, a confident blue action, friendly imagery, and concise reassurance rather than dense clinical UI.

## Evidence and Source Record

- **Observed — source URL:** `https://styles.refero.design/style/035a098b-5a27-48a3-8a3a-c68a698e3eab`; source image URL is retained in `theme.json`.
- **Observed — local source paths:** `theme.json`, `assets/tokens.json`, `assets/source-preview.jpg`, `assets/cover.jpg`, `implementations/react/style.css`, and `implementations/react/index.tsx`.
- **Observed — screenshot:** a thin yellow promotion strip and white navigation lead to a centered "Sleep better" message. Two large soft cream cards split meditation content and therapy/care content, with colorful supporting image clusters and compact black/blue actions.
- **Pinned upstream commit:** not applicable; sources are Refero capture/metadata, not Git-imported code.
- **License:** no source image, illustration, brand, or typeface license is recorded locally. Use retained assets as internal references only until rights are confirmed.
- **Conversion notes:** the desktop capture and collected tokens are translated into React/Web guidance; no claim is made that it reproduces the complete Headspace design system.
- **Inference:** control states, responsive stacking, and accessibility behavior below fill gaps in the still reference.

## Colors

| Role | Value | Application |
| --- | --- | --- |
| action-blue | `#0061ef` | primary action and key links |
| action-blue-soft | `#00a4ff` | secondary emphasis/artwork |
| sunshine | `#ffce00` | promotion strip and limited delight accent |
| plum | `#3b197f` | rare deep editorial accent |
| blush | `#ffa1cc` | warm illustration/detail surface |
| cream | `#f9f4f2` | cards and quiet fields |
| charcoal | `#2d2c2b` | primary ink/actions |
| gray | `#4b4c4d` | body/supporting copy |
| white | `#ffffff` | page canvas |
| rule | `#e2ded9` | gentle separators |

**Observed:** the white/cream surfaces, yellow strip, blue action, and colorful artwork relationship are visible in the local capture; all values appear in local tokens. Use color to support, never diagnose, wellbeing state.

## Typography

- **Observed:** source metadata names `Headspace Apercu`; local CSS uses `Apercu` with Helvetica/Arial fallbacks and `ui-monospace` for technical labels.
- Executable stacks: display/body `Apercu, "Helvetica Neue", Helvetica, Arial, sans-serif`; mono `ui-monospace, SFMono-Regular, Menlo, monospace`.
- Scale: hero `42px/1.08/700`, section `22px/1.25/700`, card title `18px/1.3/700`, body `15px/1.5/400`, benefit list `12px/1.35/500`.
- **Inference:** use direct, encouraging sentences and avoid clinical jargon or condensed all-caps body text.

## Components

- Primary action: action-blue fill, white label, `40px` minimum height, `12px` bounded corners, clear visible focus outline. **Inference:** the retained reference does not establish a reusable primary-action pill/circle token.
- Secondary care action: charcoal fill, white label, same target size; clarify the action in text rather than color alone.
- Support card: cream fill, `16px` corners, generous `24px` inset, image cluster anchored low/right, title and action at top/left.
- Benefit line: a small icon/check plus concise claim; keep evidence or disclaimer nearby where a health claim is made.
- **Inference:** use no hard drop shadows; cards separate through cream/white contrast and gentle rule treatment.

## Layout

- Desktop content maximum: `1200px`; outer gutter: `24px`; major vertical gap: `56px`.
- Center the opening statement beneath the nav. The primary content is a balanced two-card grid with matching visual weight, not a dashboard.
- Keep trust/benefit evidence in a single compact row beneath the headline before the cards.
- Promotional strip is shallow and may be dismissed only with an accessible, persistent close choice.

## Responsive

- This remains a responsive React/Web theme; no mobile variant directory is introduced.
- Below `820px`, stack the two care cards, retain their content order, and preserve illustration crop/focal point.
- Below `600px`, use `16px` gutters, hero type `34px`, full-width primary action where needed, and readable multi-line benefit text.
- Keep all actions at least `44px`, respect reduced motion, and avoid autoplaying therapeutic media.

## Do's and Don'ts

**Do**

- Use warm space, clear reassurance, and one confident next action.
- Balance meditation/self-guided and professional-care paths without implying equivalence.
- Pair imagery with meaningful text and preserve claim context.

**Don't**

- Use yellow/blue/pink as the only status or care-severity signal.
- Make care decisions feel like a dense operational dashboard.
- Overload panels with tiny therapeutic claims, forced animation, or intrusive upsells.

## Known Gaps

- **Blocking license gap:** care imagery, screenshot, and Apercu font references have no local license evidence; keep this client theme and verify rights before redistribution.
- No official source DESIGN.md, source commit, license, Apercu font files, or motion/accessibility rules are recorded locally.
- The reference shows one public landing state only; sign-in, program flows, crisis guidance, forms, error/loading states, and dark mode are unobserved.
- The local preview is static and therefore cannot validate card interaction or media behavior.
