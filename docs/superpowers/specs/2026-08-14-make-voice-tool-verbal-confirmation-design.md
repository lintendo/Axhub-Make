# Make Voice Tool Verbal Confirmation Design

## Context

Make currently marks four voice tools as requiring programmatic confirmation. ACP therefore pauses the tool call and renders a confirmation dialog for creating, executing, cancelling, or deleting a comment. This interrupts the voice workflow and duplicates the conversational guidance already present in the tool descriptions and Make voice prompt.

## Decision

Every Make voice tool will be registered with `confirmation: 'none'`. Read and capture tools already use this policy; create, execute, cancel, and delete will adopt it as well.

The voice prompt and tool descriptions continue to guide the Agent to obtain verbal confirmation where the workflow calls for it. Once the Agent invokes a tool, Make executes it without an additional UI authorization step.

## Boundaries

- Keep ACP's generic host-tool confirmation protocol and dialog available for other hosts.
- Do not change Make tool input validation, operation IDs, idempotency, abort handling, persistence, or execution behavior.
- Do not add a replacement settings toggle or confirmation preference.
- Accept that a mistaken voice invocation can directly create, execute, cancel, or delete a comment; this is an explicit product decision for the local Make workflow.

## Verification

- Update the real Make voice registry behavior test to require `confirmation: 'none'` for every registered tool.
- Verify the registry-to-ACP adapter emits `requiresConfirmation: false` for the real Make registry.
- Run the focused Make voice tests and a package-level TypeScript check.
- Restart Make and confirm the served voice bundle no longer receives any confirming Make tool declarations.
