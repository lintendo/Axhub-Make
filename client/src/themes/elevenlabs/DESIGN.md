# ElevenLabs PC/Web Theme Specification

Use this theme for a precise AI/audio product page: near-white canvas, decisive black typography and actions, and a quiet product demonstrator whose colorful audio orbs carry the expressive layer.

## Evidence and Source Record

- **Observed — source URLs:** `https://styles.refero.design/style/031056ff-7af1-46db-8daa-115f731c5d26` and official-site reference `https://elevenlabs.io/`.
- **Observed — local source paths:** `theme.json`, `assets/tokens.json`, `assets/source-preview.jpg`, `assets/cover.jpg`, `assets/official-homepage.webp`, `assets/source-preview.html`, `implementations/react/style.css`, and `implementations/react/index.tsx`.
- **Observed — screenshot:** a fine black wordmark/nav sits above a two-column headline, black actions, and a pale product panel containing tabs, gradient audio spheres, a centered play control, and a compact mode rail.
- **Pinned upstream commit:** not applicable; retained sources are URLs/captures rather than Git code.
- **License:** no screenshot, brand, or font license is recorded in local metadata. Verify rights before redistribution.
- **Conversion notes:** the local capture and palette were converted into a React/Web product-system specification. The embedded HTML is a local reference artifact, not an upstream application bundle.
- **Inference:** interactive audio behavior, focus states, and responsive collapse below are implementation rules inferred from the still reference.

## Colors

| Role | Value | Application |
| --- | --- | --- |
| canvas | `#fdfcfc` | page canvas |
| panel | `#f5f3f1` | product demo and quiet sections |
| rule | `#e5e5e5` | separators |
| ink | `#000000` | headings, primary actions, navigation |
| on-ink | `#ffffff` | labels on black controls |
| text-muted | `#777169` | secondary copy |
| control-muted | `#a59f97` | inactive metadata |
| fog | `#b1b0b0` | disabled/supporting marks |
| signal-blue | `#0447ff` | focus and selected signal |
| signal-orange | `#ff4704` | audio accent only |
| orb-violet | `#3a1c71` | gradient artwork |
| orb-coral | `#d76d77` | gradient artwork |

**Observed:** the neutral field, black controls, and multicolor spheres are visible in the retained screenshot; all listed values occur in local tokens. Signal/orb colors are accents, not global surfaces.

## Typography

- **Observed source tags:** `Waldenburg`, `WaldenburgFH`, and `Inter`.
- **Observed local implementation:** `Inter` is loaded at weights `400–800`; the showcase uses Inter for display/body and `ui-monospace` for technical values.
- Executable stack: display `Inter, system-ui, sans-serif`; body `Inter, system-ui, sans-serif`; mono `ui-monospace, SFMono-Regular, Menlo, monospace`.
- Scale: hero `50px/1.02/500`, section heading `30px/1.15/500`, card title `18px/1.3/600`, body `15px/1.55/400`, nav/caption `12px/1.35/500`.
- **Inference:** use moderate rather than heavy display weights so the large type remains technical and calm.

## Components

- Primary action: black fill, white label, `40px` height, `12px` bounded corners, `16px` horizontal inset. **Inference:** retain a bounded control radius because the retained still reference does not establish a reusable primary-action pill/circle token.
- Secondary action: transparent/white surface, ink label, no elevation, visible focus outline.
- Audio demo: panel fill, segmented text tabs, a large selected orb/play target, and small descriptive metadata below each item.
- Mode rail: compact tabs with a clear selected underline or fill; preserve text labels at all widths.
- **Inference:** animation may gently pulse or rotate gradients, but must stop under `prefers-reduced-motion` and never obscure playback state.

## Layout

- Desktop content maximum: `1240px`; outer gutter: `32px`; major vertical gap: `64px`.
- Intro uses a `minmax(0, 1.2fr) minmax(320px, .8fr)` grid; actions sit directly below the headline.
- The product panel is full-width under the intro, approximately `16:6`, with generous inner inset and a single dominant selected audio item.
- Navigation remains visually light; do not add a heavy application sidebar to this marketing/product-demo composition.

## Responsive

- This specification is React/Web-first and remains one theme across desktop and narrow viewports.
- Below `900px`, stack headline and supporting copy; let the demo panel retain horizontal scrolling for its item rail.
- Below `640px`, use `16px` gutters, hero type `36px`, wrap nav actions, and show one primary orb at a time.
- All playback targets are at least `44px`; keyboard selection and current playback state remain explicit.

## Do's and Don'ts

**Do**

- Anchor the interface in black, white, and powder neutrals.
- Let a small number of gradient audio objects provide the expressive color.
- Keep product modes, playback state, and AI capability labels terse and legible.

**Don't**

- Turn blue/orange/violet accents into a full multicolor dashboard.
- Add heavy elevation or excessive cards to the quiet product demonstrator.
- Hide playback controls, current selection, or motion-reduction behavior.

## Known Gaps

- **Blocking license gap:** screenshot, brand imagery, and Waldenburg font references have no local license evidence; keep this client theme and verify rights before redistribution.
- No official source DESIGN.md, pinned code commit, asset/font license, or Waldenburg font files are retained locally.
- The still images do not reveal audio waveform behavior, loading/errors, hover states, or complete responsive navigation.
- The local executable preview uses Inter and therefore cannot reproduce the named proprietary source families exactly.
