# Surfshark PC/Web Theme Specification

Use this theme for a bold consumer security offer: a dark charcoal hero, a bright promotional strip, a vivid turquoise product object, high-contrast pricing, and a compact commerce/navigation frame.

## Evidence and Source Record

- **Observed — source URL:** `https://styles.refero.design/style/4fc7a535-3c99-4ffe-8365-7d025d33274e`; source image URL is retained in `theme.json`.
- **Observed — local source paths:** `theme.json`, `assets/tokens.json`, `assets/source-preview.jpg`, `assets/cover.jpg`, `style.css`, and `index.tsx`.
- **Observed — screenshot:** a yellow promotion strip sits above a compact white nav; the main dark hero places a large VPN offer and checklist left of a turquoise sculptural cake-like product illustration, with a pink CTA and small guarantee note.
- **Pinned upstream commit:** not applicable; source is a Refero capture/metadata reference, not imported Git code.
- **License:** no screenshot, illustration, brand, or font license is retained locally. Use only as internal reference until rights are confirmed.
- **Conversion notes:** screenshot composition and collected colors were converted into React/Web rules. The distinctive product image is evidence of visual energy, not an asset that may be reused without permission.
- **Inference:** detailed pricing states, control interactions, and breakpoints below are inferred from the desktop capture.

## Colors

| Role | Value | Application |
| --- | --- | --- |
| hero | `#16191c` | dominant dark hero canvas |
| hero-raised | `#1e2327` | inset dark surfaces |
| ink | `#000000` | high-contrast text/utility marks |
| canvas | `#f9f9f9` | nav and light sections |
| rule | `#dadadd` | separators on light surfaces |
| charcoal | `#393e41` | supporting dark detail |
| muted | `#5b6065` | secondary copy |
| turquoise | `#1ebfbf` | product/feature accent |
| yellow | `#ffc200` | promotion strip and limited urgency accent |
| pink | `#fa3556` | primary commerce CTA |
| white | `#ffffff` | reversed text and canvas |

**Observed:** dark hero, yellow strip, turquoise object, and pink CTA are visible in the local image; all values appear in local tokens. Yellow and pink are call-to-action signals, not semantic success/error colors.

## Typography

- **Observed:** source metadata and local implementation name `Inter`; local preview loads weights `400–800` with `ui-monospace` labels.
- Executable stack: display/body `Inter, system-ui, sans-serif`; mono `ui-monospace, SFMono-Regular, Menlo, monospace`.
- Scale: hero `42px/1.08/700`, price `22px/1.2/700`, nav `12px/1.3/600`, body `15px/1.5/400`, guarantee `11px/1.35/500`.
- **Inference:** use short, punchy offer copy and preserve a clear price hierarchy; avoid making legal or guarantee text too small to read.

## Components

- Promotion strip: yellow fill, compact centered message, optional accessible close button, no competing CTA.
- Primary CTA: pink fill, white label, `44px` height, `12px` bounded corners, explicit price/plan wording nearby. **Inference:** the retained reference does not establish a reusable purchase-control pill/circle token.
- Feature checklist: white check/icon plus text on dark hero; each item remains readable without the icon color.
- Product art: one large illustrative object with meaningful alt text when communicative; never crop a security claim into the artwork.
- Plan/guarantee note: neutral text with icon and link; disclose terms without relying on hover.

## Layout

- Desktop maximum: `1320px`; outer gutter: `28px`; major vertical gap: `64px`.
- Hero uses a `1fr / 1fr` grid; offer stays left and product illustration right. Navigation remains on white outside the hero.
- Keep the promotion strip full width and shallow. A light content section follows the dark hero rather than adding dark card stacks.
- The offer column has a `520px` maximum so the price and checklist remain scannable.

## Responsive

- This is a responsive React/Web theme; no mobile directory or compatibility alias is created.
- Below `900px`, stack hero content with the offer before product art and retain the CTA above the fold.
- Below `640px`, use `16px` gutters, hero type `34px`, wrapped nav utility actions, and a `100%`-width CTA where it improves clarity.
- Preserve `44px` targets, readable terms, and a motion-reduced alternative for decorative product movement.

## Do's and Don'ts

**Do**

- Use the dark hero to concentrate one simple security offer.
- Pair price, plan, and guarantee context with the CTA.
- Let turquoise and yellow energize the composition while pink remains the primary purchase action.

**Don't**

- Use promotional colors as the only meaning for security status or plan eligibility.
- Add multiple competing CTA colors or turn the hero into a generic dark dashboard.
- Hide pricing terms, guarantee conditions, or keyboard focus inside artwork/hover treatment.

## Known Gaps

- **Blocking license gap:** screenshot, product art, brand imagery, and font references have no local license evidence; keep this client theme and verify rights before redistribution.
- No official source DESIGN.md, source commit, license, product-art provenance, or interaction/motion spec is available locally.
- The capture covers one offer state only; checkout, plan comparison, signed-in security controls, errors, and dark/light system behavior are unobserved.
- The local preview is static, so animation and responsive crop rules need validation before production use.
