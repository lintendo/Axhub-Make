# August Health EHR PC/Web Theme Specification

Use this theme for calm, information-rich healthcare and senior-living workflows. Its identity combines a deep violet field, editorial serif headings, and clearly separated green, orange, and pink information bands.

## Evidence and Source Record

- **Observed — source URL:** `https://styles.refero.design/style/81bd6ad6-b02b-4fb3-a600-91ecf8324171`; official-site reference: `https://www.augusthealth.com/`.
- **Observed — local source paths:** `theme.json`, `assets/tokens.json`, `assets/official-homepage.webp`, `assets/cover.webp`, `style.css`, and `index.tsx` in this theme directory.
- **Observed — screenshot:** the retained desktop capture shows a deep-violet section, restrained centered lead text, three horizontally structured color bands, fine connector marks, and a curved light lower edge.
- **Pinned upstream commit:** not applicable; Refero and the official website are URL/image references, not a Git-pinned code migration.
- **License:** no source-asset license is recorded in local metadata. Keep the screenshot as an internal design reference and verify rights before redistribution.
- **Conversion notes:** the source screenshot and collected palette were translated into React/Web rules. No claim is made that this is August Health's complete internal design system.
- **Inference:** component dimensions, accessible interaction states, and breakpoints below are implementation rules inferred from the retained desktop evidence.

## Colors

| Role | Value | Application |
| --- | --- | --- |
| violet-canvas | `#080331` | primary hero/section canvas |
| violet-raised | `#1b1463` | inset panels and hover depth |
| light-canvas | `#ffffff` | page sections and reversed text |
| warm-surface | `#f8f3eb` | quiet cards and lower sections |
| forest | `#0d5238` | data/insight band and positive status |
| leaf | `#328a3b` | supportive green detail |
| orange | `#ff6d39` | caregiver/action band |
| pink | `#f098d7` | proactive-care band |
| blue | `#4865ff` | links and focus indication |
| rule | `#cccccc` | rules on light surfaces |
| ink | `#000000` | text on light surfaces |

**Observed:** the colors above occur in the local token set; the screenshot establishes violet, green, orange, pink, and cream as the dominant relationship. Never infer clinical severity from color alone.

## Typography

- **Observed source tags:** `Saans` and `Reckless Neue` are named in collected source metadata.
- **Observed local implementation:** `Reckless Neue` is used for both display and body with system sans-serif fallbacks; `ui-monospace` is used for technical labels.
- **Inference — executable roles:** display `Reckless Neue, Georgia, serif`; body `Saans, Inter, system-ui, sans-serif`; mono `ui-monospace, SFMono-Regular, Menlo, monospace`.
- Scale: hero `52px/1.05/500`, section heading `32px/1.15/500`, card heading `19px/1.25/500`, body `15px/1.55/400`, label `12px/1.35/600`.
- Keep long clinical explanations in the sans-serif body role; reserve the serif for short headings and editorial emphasis.

## Components

- Information band: two-column content inside a solid semantic fill, `16px` vertical and `20px` horizontal inset, light/dark copy chosen for WCAG contrast.
- EHR summary panel: violet-raised surface, `1px` translucent light rule, `16px` corners, and three vertically stacked bands.
- Primary action: violet fill on light canvas, white label, `44px` height, `16px` horizontal inset, `8px` corners; focus uses a `2px` blue outline plus `2px` offset.
- Metric/status rows pair a text label with an explicit icon or word; color is supportive, never the only state carrier.
- **Inference:** use no decorative elevation; separate clinical groupings with color fields, rules, and whitespace.

## Layout

- Desktop maximum content width: `1200px`; default outer gutter: `32px`; major vertical gap: `64px`.
- The observed hero is a centered, full-width violet band. Keep the statement above a compact information panel rather than alongside a dashboard sidebar.
- Information bands use a `38% / 62%` label-to-description split and align all band text to a shared baseline.
- Use one primary task column for forms and records; secondary patient context may occupy a `320px` rail at widths above `1100px`.

## Responsive

- This is a responsive web specification; do not create a separate mobile theme tree.
- Below `900px`, stack the summary-panel columns and reduce outer gutters to `20px`.
- Below `640px`, information bands become single-column, hero type becomes `38px`, and buttons may span the container.
- Preserve `44px` targets, explicit form labels, readable error text, and horizontal scrolling for wide clinical tables.

## Do's and Don'ts

**Do**

- Use violet as the stable canvas and the three bright bands to distinguish information themes.
- Pair every health state color with text/icon meaning and keep clinical copy direct.
- Use serif headings sparingly to add care and humanity to operational information.

**Don't**

- Treat orange or pink as universal error/success tokens without a written label.
- Turn every surface into a colored card or use playful decoration in safety-critical workflows.
- Compress care notes into tiny type or hide key state changes behind hover.

## Known Gaps

- **Blocking license gap:** the retained screenshot, source imagery, and named fonts have no local license evidence; keep this client theme and verify rights before redistribution.
- Source metadata does not include a downloadable upstream DESIGN.md, source commit, asset license, or official font files.
- Only a limited official-site section is retained locally; complete EHR tables, forms, empty/error states, and dark mode were not observed.
- Local CSS currently falls back from Reckless Neue and does not load Saans; typography must be licensed and wired by the consuming product.
