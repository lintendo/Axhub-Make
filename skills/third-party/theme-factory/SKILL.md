---
name: theme-factory
description: "Use when applying visual themes (colors, fonts, branding) to slides, docs, reports, or HTML pages. Offers 10 pre-set professional themes with hex palettes and font pairings, or generates custom themes on the fly. Show theme-showcase.pdf for selection, then apply consistently across the artifact."
license: Complete terms in LICENSE.txt
---

# Theme Factory Skill

Apply consistent, professional color and typography themes to any artifact — slide decks, documents, reports, or HTML landing pages.

## Workflow

1. **Show the theme showcase**: Display `theme-showcase.pdf` so the user can see all themes visually. Do not modify this file.
2. **Get selection**: Ask which theme to apply; wait for explicit confirmation.
3. **Read theme spec**: Load the chosen theme file from `themes/` (e.g. `themes/ocean-depths.md`).
4. **Apply the theme**: Set colors (background, text, accent) and fonts (header, body) consistently throughout the artifact.
5. **Verify**: Check contrast/readability meets accessibility standards. Confirm the visual identity is maintained across all sections.

## Available Themes

10 pre-set themes in `themes/` (previewed in `theme-showcase.pdf`):

| Theme | Vibe | Best for |
|-------|------|----------|
| Ocean Depths | Professional, calming maritime | Corporate, finance |
| Sunset Boulevard | Warm, vibrant sunset colors | Creative, marketing |
| Forest Canopy | Natural, grounded earth tones | Sustainability, wellness |
| Modern Minimalist | Clean, contemporary grayscale | Tech, SaaS |
| Golden Hour | Rich, warm autumnal palette | Editorial, luxury |
| Arctic Frost | Cool, crisp winter tones | Healthcare, science |
| Desert Rose | Soft, sophisticated dusty tones | Fashion, lifestyle |
| Tech Innovation | Bold, modern tech aesthetic | Startups, product launches |
| Botanical Garden | Fresh, organic garden colors | Food, nature |
| Midnight Galaxy | Dramatic, cosmic deep tones | Events, entertainment |

## Custom Themes

When no pre-set fits, create a custom theme:
1. Ask what mood/brand the user wants
2. Generate a theme spec matching the format in `themes/` (hex palette + font pairing)
3. Show for review and get confirmation
4. Apply to the artifact
