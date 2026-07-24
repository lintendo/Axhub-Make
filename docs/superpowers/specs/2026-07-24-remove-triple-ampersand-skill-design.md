# Remove Triple Ampersand Skill Design

## Goal

Remove the non-production `triple-ampersand-operator` skill from future Axhub Make client templates and prevent it from being reintroduced by source synchronization.

## Scope

- Delete the skill from both `client/.agents/skills/` and `client/.claude/skills/`.
- Add a client template manifest exclusion for the skill path in both mirrored roots.
- Add release-test coverage that requires the exclusion and requires both source directories to be absent.
- Leave all other client skills and template packaging behavior unchanged.

## Verification

Run the focused release-helper test, inspect the client template manifest, confirm both source directories are absent, and run whitespace validation on the focused diff. Publishing a new client template version is outside this cleanup.
