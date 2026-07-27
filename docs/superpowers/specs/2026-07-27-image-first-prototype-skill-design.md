# Image-First Prototype Skill Design

## Goal

Add a small, explicit opt-in Make client skill for the IMAGE2 UI/UX workflow: align requirements, generate one or more UI design images, let the user choose one, then reconstruct the selected image as a runnable prototype.

This is a new workflow built from existing capabilities. It does not replace or automatically extend the default prototype workflow.

## Trigger boundary

The skill id is `image-first-prototype`.

Run it only when the current user explicitly names or selects `$image-first-prototype`. Ordinary prototype creation, requirements alignment, `DESIGN.md` selection, multi-option exploration, UI image generation, or screenshot references do not count as opt-in. Do not recommend or enter this workflow merely because it might fit the request.

Repeat the boundary in both the frontmatter description and the first body section. If explicit opt-in is absent, stop this workflow without running any downstream skill.

## Workflow

1. Follow `rules/requirements-alignment-guide.md` to complete product requirements alignment.
2. Ask whether to continue with the existing visual alignment stage.
3. If the user continues visual alignment, use the existing `DESIGN.md` candidate and selection rules. The selected `DESIGN.md` becomes a shared constraint for every generated image; multiple images may vary composition and interaction emphasis but must not introduce unrelated visual systems.
4. If the user skips visual alignment, use `$explore-options` to create genuinely distinct UI directions. Override that skill's default from three directions to four for this workflow.
5. In the same confirmation, let the user change the default proposal count of four and keep only the proposals or directions they want generated. A count of one is valid.
6. Use `$ui-image-generation` to create one local UI design image for each confirmed direction. All images must share the aligned product brief; when a `DESIGN.md` was selected, they must also share that visual baseline.
7. Present the generated images and wait. Do not choose for the user and do not start reconstruction automatically.
8. Phrase the selection action as choosing an image **and starting prototype reconstruction**. Once the user explicitly makes that choice, pass the selected local image path to `$screenshot-to-prototype`.
9. Let `$screenshot-to-prototype` own reconstruction details, assets, specification updates, React conversion, and visual comparison. Do not duplicate those rules in the orchestrator skill.

## Agent delegation

When subagents are available, the main agent must keep orchestration and delegate each confirmed image direction independently after the shared brief is locked. Each image task receives only the shared requirements, optional selected `DESIGN.md`, direction-specific difference, target device, and output path.

After image selection, use only one reconstruction agent. Never let multiple agents write the same prototype directory concurrently.

## Files

Add byte-identical skill files at:

- `client/.agents/skills/image-first-prototype/SKILL.md`
- `client/.claude/skills/image-first-prototype/SKILL.md`

No scripts, assets, references, or downstream-skill edits are needed. Add a focused client test that verifies both mirrors stay identical and that the trigger gate, default count, choice gate, downstream skill names, and subagent boundary remain present.

## Validation

Before writing the skill, run independent baseline scenarios without the new skill and record failures around accidental triggering, skipped user choice, wrong default count, and premature reconstruction. After implementation, rerun the same scenarios with the new skill available.

Run the focused client skill test, a byte-for-byte mirror comparison, whitespace validation, and an independent forward test with a subagent. Success means:

- ordinary prototype requests do not enter this workflow;
- explicit `$image-first-prototype` requests do;
- visual alignment can be continued or skipped;
- the default is four but the user may change the count or retain only selected directions;
- generated images are shown before reconstruction;
- reconstruction starts only after the user explicitly chooses an image for that purpose;
- parallel image generation never becomes concurrent writes to one prototype directory.
