# Xbox.com PC/Web Theme Specification

Use this theme for a high-energy game and entertainment storefront on the web. It combines a familiar white utility/nav layer with a cinematic black hero, bright green game-pass action, large imagery, and a structured discovery rail.

## Evidence and Source Record

- **Observed — source URL:** `https://styles.refero.design/style/3792d0ca-6c74-4667-a64d-76efe9f87076`; source image URL is retained in `theme.json`.
- **Observed — local source paths:** `theme.json`, `assets/tokens.json`, `assets/source-preview.jpg`, `assets/cover.jpg`, `implementations/react/style.css`, and `implementations/react/index.tsx`.
- **Observed — screenshot:** Microsoft/Xbox utility navigation sits above a full-bleed Call of Duty hero. The hero uses black/photographic contrast, a large white title, bright green game-pass CTA, secondary text action, carousel marks, and a lower green icon discovery band.
- **Pinned upstream commit:** not applicable; this is a Refero image/metadata reference rather than Git-imported code.
- **License:** no screenshot, game art, brand, or font license is stored locally. Treat assets as internal visual references until rights are verified.
- **Conversion notes:** the retained desktop image and palette were translated into React/Web rules; game IP and Spanish campaign copy in the screenshot are not reusable content by default.
- **Inference:** carousel behavior, menu collapse, focus treatment, and responsive hero crops below extend the visible desktop evidence.

## Colors

| Role | Value | Application |
| --- | --- | --- |
| xbox-green | `#107c10` | primary brand/action anchor |
| meadow | `#054b16` | active/hover green depth |
| lime | `#9bf00b` | game-pass CTA and high-energy emphasis |
| yellow | `#ffd800` | rare offer/status accent |
| black | `#000000` | hero overlay and cinematic canvas |
| white | `#ffffff` | utility nav and reversed type |
| ink | `#333333` | light-surface text |
| gray-soft | `#f2f2f2` | utility/nav fields |
| gray | `#616161` | supporting metadata |
| gray-dark | `#262626` | dark UI detail |
| rule | `#e0e0e0` | light-surface separation |

**Observed:** black cinematic hero, lime call-to-action, white nav, and green icon rail are clear in the local screenshot; values are retained in tokens. Lime/yellow are promotional accents and do not replace readable status labels.

## Typography

- **Observed source tags:** `Segoe UI` and `SegoeProBlack`.
- **Observed local implementation:** the preview loads `Inter` weights `400–800` and uses Inter for display/body with `ui-monospace` labels.
- Executable stack: display `"Segoe UI", Inter, system-ui, sans-serif`; body `"Segoe UI", Inter, system-ui, sans-serif`; mono `ui-monospace, SFMono-Regular, Menlo, monospace`.
- Scale: hero `48px/1.02/800`, offer subtitle `22px/1.2/700`, nav `12px/1.3/600`, body `15px/1.5/400`, rail label `11px/1.25/700`.
- **Inference:** title case and strong weight are appropriate for game promotion; keep navigation compact and utility-like.

## Components

- Utility/header: white two-tier navigation with brand marks, product links, search/account icons, and visible text alternatives for icon controls.
- Hero: full-bleed game art with a black/gradient contrast layer, title, supporting copy, lime CTA, secondary text action, and accessible carousel controls.
- Game-pass CTA: lime fill, black uppercase label, `40px` minimum height, `0px` corners, no pill treatment.
- Discovery rail: white surface with green outlined icons and short labels; selection includes a written/shape state in addition to green.
- **Inference:** carousel pauses on focus/hover, supports reduced motion, and exposes current slide count/label to assistive technology.

## Layout

- Desktop canvas is full-width. Hero minimum height is `560px`, with content aligned to a `1320px` grid and `32px` outer gutter.
- Keep hero copy to the right or left according to artwork safe area; never cover the character/product focal point.
- Utility nav is compact above the hero. Discovery rail follows immediately below it; content shelves may use a four-column desktop grid.
- Use `8px, 16px, 24px, 40px, 64px` gaps and preserve large image breathing room.

## Responsive

- This remains one responsive React/Web theme; do not create a separate mobile theme from the retained mobile tag.
- Below `900px`, collapse secondary nav links behind a labeled menu and set a deliberate hero image focal point.
- Below `640px`, use `16px` gutters, hero type `34px`, a stacked action group, horizontally scrollable discovery rail, and an image crop that keeps title contrast.
- Controls are at least `44px` when tapped; carousel never auto-advances under reduced motion.

## Do's and Don'ts

**Do**

- Lead with cinematic art, one game/product story, and one lime action.
- Keep brand navigation structured and discovery labels explicit.
- Validate text contrast against every hero crop and supply alt text/caption strategy for game art.

**Don't**

- Use lime/yellow as the only indicator of availability, purchase state, or accessibility selection.
- Overlay text over character faces or critical artwork without a contrast treatment.
- Turn the game storefront into a generic enterprise dashboard or an uncontrolled autoplay carousel.

## Known Gaps

- **Blocking license gap:** screenshot, game art, brand imagery, and SegoeProBlack font references have no local license evidence; keep this client theme and verify rights before redistribution.
- No official source DESIGN.md, source commit, license, game-art permission, SegoeProBlack file, or carousel interaction recording is retained locally.
- The capture represents a single campaign/home state only; commerce, age gates, search, library, errors, loading, and accessibility states are unobserved.
- The local preview uses Inter and a static image, so source typography and live media behavior remain approximations.
