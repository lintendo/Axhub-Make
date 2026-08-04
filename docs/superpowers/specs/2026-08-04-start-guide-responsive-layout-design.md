# Start Guide Responsive Layout Design

## Goal

Keep the prototype, resource, and design start guides readable when the center workspace is narrowed by sidebars or panels. In particular, prompt-card labels must never collapse into character-by-character vertical text.

## Root Cause

The resource and design prompt grids currently use viewport breakpoints (`sm:grid-cols-2 lg:grid-cols-4`). The overall browser can still satisfy the `lg` breakpoint after surrounding panels have reduced the center workspace to a much smaller width, so the grid keeps four columns and compresses each card below a readable size.

## Scope

- Apply one responsive layout policy to the shared `StartGuide` used by prototype, resource, and design creation flows.
- Apply one grid rule to both `ResourceStartPromptGrid` and `ThemeStartPromptGrid`.
- Preserve all start-guide actions, composer behavior, prompt selection, copying, scene switching, settings, and disabled states.
- Do not change card content, ordering, icons, or generation behavior.

## Layout

- Treat the shared start-guide content area as an inline-size container.
- Replace viewport-driven prompt-card columns with `repeat(auto-fit, minmax(min(100%, 13rem), 1fr))`.
- Keep a 16px grid gap. At the current 960px maximum content width this produces four columns; narrower center workspaces naturally step through three, two, and one column while preserving an approximately 208px minimum card width.
- Use the same presentational grid wrapper for resource and design cards so future responsive changes cannot drift between the two pages.
- Keep the existing card height, border, radius, icon, copy action, and focus treatment.
- When the shared content container is narrow, use the existing 28px title size instead of the wide 34px size and reduce the composer-to-card spacing from 64px to 32px. Wide layouts retain the current title scale and spacing.
- Keep the existing wrapping behavior for top actions; no action is hidden.

## Accessibility And Behavior

- Grid reflow is CSS-only and must not add resize listeners, layout state, or delayed rendering.
- DOM order and keyboard order remain identical at every width.
- Cards remain real buttons with their current accessible names and visible focus rings.
- Reflow must not introduce horizontal scrolling in the start-guide content area.

## Verification

- Add a failing source-level regression test proving both prompt grids use the shared container-responsive layout and no longer use `sm`/`lg` viewport column classes.
- Add assertions for the compact and wide title/spacing rules on the shared start guide.
- Run the focused prompt-card, grid, composer, and `ContentAreaView` Vitest tests.
- Run the app type check.
- Start the local admin UI and inspect resource and design start pages at wide and narrow center-workspace widths. Confirm four/three/two/one-column reflow as space allows, readable labels, unchanged actions, and no horizontal overflow.
