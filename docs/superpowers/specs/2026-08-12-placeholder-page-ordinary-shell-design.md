# Placeholder Page Ordinary Shell Design

## Goal

Treat an existing placeholder prototype as an ordinary prototype page at the Make page-shell level while retaining the `StartGuide` content rendered inside that resource.

## Current Behavior

An existing prototype whose resource metadata contains `placeholder: true` renders the Admin-owned `StartGuide`. The page shell also treats that resource specially: it hides the presentation toolbar and review panel, suppresses Assistant controls and state in the sidebar, blocks normal Assistant auto-restore, and temporarily hides an already-open Assistant.

The current prompt cards do not submit a generation job. They open the Assistant with a prefilled prompt and `autoSend: false`. A separate, now-unused frontend path still changes a placeholder into `generationStatus: 'waiting'`, refreshes prototype resources before submission, and auto-opens the Assistant for waiting resources.

## Design

- Continue rendering `StartGuide` when the selected prototype has `placeholder: true`; its prompt cards remain manual Assistant prompt entry points.
- Remove placeholder metadata from all page-shell visibility and Assistant lifecycle decisions. The toolbar, review panel, Assistant open actions, current Assistant state, normal auto-open, and normal auto-restore behave exactly as they do for any other selected prototype.
- Keep the no-resource prototype draft state distinct. It has no real selected resource or target file, so its existing page-shell restrictions remain.
- Remove the unused frontend placeholder-generation transition: no UI code calls the `start-generation` client API, creates a placeholder solely before this dead submission path, refreshes resources for that submission, or auto-opens the Assistant for `generationStatus: 'waiting'`.
- Retain server-side compatibility handling for already-existing waiting resources and older clients. This change does not rewrite project metadata or delete the server endpoint.
- Retain selection synchronization that keeps a newly-created placeholder selected; that logic protects resource selection during metadata refresh and is not a page-shell restriction.

## Components

- `IndexPage.tsx`: remove placeholder/waiting Assistant effects and pass only the no-resource draft flag as `prototypeStartPageActive`.
- `PresentationArea.tsx`: stop hiding the toolbar and review panel for an existing placeholder.
- `ContentAreaView.tsx` and presentation prop types/builders: remove the unreachable frontend generation callback chain.
- `api.ts`: remove the unused admin client method for entering waiting generation state while leaving the server route intact.
- Source regression tests: assert ordinary shell behavior and absence of the dead frontend path.

## Verification

Run the focused Vitest files for `IndexPage`, `PresentationArea`, `ContentAreaView`, sidebar props, responsive review-panel integration, and the index API client. Then run the Make TypeScript/server build check and inspect the focused diff.

