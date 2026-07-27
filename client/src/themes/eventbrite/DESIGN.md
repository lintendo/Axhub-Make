# Eventbrite PC/Web Theme Specification

Use this theme for event discovery on the web: an efficient search-led header, a high-impact photographic event hero, compact category navigation, and strong conversion actions on a predominantly white canvas.

## Evidence and Source Record

- **Observed — source URL:** `https://styles.refero.design/style/1fa0d9da-966f-4d43-9775-e156bec3a3b3`; the source image URL is recorded in `theme.json`.
- **Observed — local source paths:** `theme.json`, `assets/tokens.json`, `assets/source-preview.jpg`, `assets/cover.jpg`, `style.css`, and `index.tsx`.
- **Observed — screenshot:** a dense desktop header combines the Eventbrite mark, event/location search, utility links, and account actions; a large photo hero includes overlaid editorial type and a high-contrast CTA; round category controls and a location feed follow.
- **Pinned upstream commit:** not applicable; this is a Refero capture/metadata reference, not Git-imported code.
- **License:** no screenshot, photography, brand, or font license is recorded locally. Treat assets as internal references until rights are verified.
- **Conversion notes:** the retained desktop composition and palette were translated into reusable React/Web patterns; cookie UI visible in the capture is evidence of layering, not a default theme component.
- **Inference:** component dimensions, responsive priority, and accessible focus states below complete behavior not visible in the still image.

## Colors

| Role | Value | Application |
| --- | --- | --- |
| canvas | `#ffffff` | page and controls |
| canvas-soft | `#f8f7fa` | quiet sections and filter states |
| ink | `#1e0a3c` | strong headings |
| ink-secondary | `#39364f` | body/navigation text |
| text-muted | `#585163` | secondary metadata |
| action-blue | `#3659e3` | links, focus, selected filters |
| action-blue-soft | `#dee5ff` | selected background |
| rule | `#dbdae3` | input and card separation |
| rule-muted | `#d2d4d6` | secondary separators |
| disabled | `#bec0c6` | disabled marks only |
| black | `#000000` | high-contrast overlay/action where imagery requires |

**Observed:** white, violet ink, blue, and gray values exist in local tokens; the screenshot additionally shows the orange brand mark and photography-specific colors, which must not be promoted into general semantic roles without a source value.

## Typography

- **Observed source tags:** `Neue Plak` and `Neue Plak Text`.
- **Observed local implementation:** the preview loads `Inter` weights `400–800` and uses Inter for display/body with `ui-monospace` for technical labels.
- Executable fallback: display/body `Inter, system-ui, sans-serif`; mono `ui-monospace, SFMono-Regular, Menlo, monospace`. Use Neue Plak only with licensed local files.
- Scale: hero `44px/1.02/800`, page heading `32px/1.15/700`, card title `18px/1.3/700`, body `15px/1.5/400`, navigation `12px/1.35/600`.
- Keep over-image headlines short, and apply a solid backing or gradient scrim when contrast is insufficient.

## Components

- Search header: event and location inputs share one desktop group, with persistent labels/icons and a distinct submit action.
- Event hero: wide image, editorial overlay, short supporting label, and one high-contrast `44px` CTA; text contrast is validated against each image.
- Category control: circular icon target above a short label; selected state uses action-blue plus a written/shape change.
- Event card: image, title, date/time, location, and price/availability in that order; whole-card click does not replace accessible inner links.
- Consent layer: when present, it remains above content, traps focus only if modal, and never adopts event-card styling.

## Layout

- Desktop content maximum: `1320px`; outer gutter: `24px`; header may span the viewport.
- Hero uses a wide `16:5` crop and occupies the first content row. Category items form an evenly distributed rail below it.
- Search results use a responsive four-column grid above `1200px`, three columns above `900px`, and two columns above `640px`.
- Keep discovery hierarchy stable: search → featured event → categories → local event feed.

## Responsive

- This is one responsive PC/Web theme; do not add platform directories or treat the retained mobile tag as a mobile variant request.
- Below `980px`, collapse utility links before hiding core search. Keep search accessible through a labeled header control.
- Below `720px`, stack event/location fields, use `16px` gutters, make category controls horizontally scrollable, and reduce hero type to `32px`.
- Images preserve their focal point; buttons and category targets remain at least `44px`.

## Do's and Don'ts

**Do**

- Put search and location context before the event feed.
- Use strong event photography with legible, concise overlays and clear dates.
- Keep category and result metadata structured for fast scanning.

**Don't**

- Let navigation utilities crowd out search on narrow widths.
- Use generic stock photography without a reliable crop/focal point.
- Depend on color alone for selected categories, availability, or consent choices.

## Known Gaps

- No official source DESIGN.md, Git commit, source license, Neue Plak files, or canonical orange token is retained locally.
- The capture shows one discovery page and a consent state; checkout, organizer tools, empty/error/loading states, and dark mode are unobserved.
- The local preview uses Inter and a static image, so interaction density and source typography are approximations.
