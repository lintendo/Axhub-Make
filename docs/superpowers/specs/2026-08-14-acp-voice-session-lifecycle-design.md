# ACP Voice Session Lifecycle Design

## Context

Axhub Make embeds the public `@axhub/acp/voice` component and supplies Make-specific host tools for page inspection, screenshots, comments, and comment execution. Make must not own or duplicate LiveKit room, microphone, publisher, data-channel, or realtime session logic.

The current integration can recreate the ACP voice session when React rerenders with a new `tools` or `prompt` object reference. The old session is disposed, which calls `Room.disconnect()` while a host-tool result may still be publishing over LiveKit. LiveKit then reports a Publisher connection error and the voice session stops.

## Goals

- Keep all LiveKit and realtime transport ownership inside `@axhub/acp/voice`.
- Keep Make ownership limited to host tool definitions, schemas, confirmation policy, page context, execution, and persistence.
- Keep Make's existing page tools, including screenshots and comment operations.
- Keep an ACP voice session connected while the component remains mounted, even when host tool callbacks or prompt context references change after a host-side state update.
- Preserve the existing host-tool RPC protocol and public component entry point.
- Add regression coverage for React/session lifetime and host-tool result delivery during host rerenders.

## Non-goals

- Do not add a direct `livekit-client` dependency or LiveKit imports to Make.
- Do not move Make comment persistence, page bridge operations, or confirmation policy into ACP.
- Do not introduce a second browser speech/TTS stack.
- Do not remove or rename the existing Make host tools.
- Do not change the LiveKit server or voice worker protocol in this change.

## Ownership Boundary

```text
@axhub/acp/voice
  LiveKit Room, microphone, publisher/data channels, realtime session,
  voice worker protocol, captions, connect/disconnect, transport errors

Axhub Make
  host tool schemas, page context, tool execution, confirmation policy,
  comment persistence, preview iframe bridge, Make configuration endpoint
```

The runtime flow remains:

1. Make renders `AcpVoiceAssistant` with `tools`, `prompt`, and the ACP service URL.
2. ACP connects the browser to the LiveKit room and configures the voice worker.
3. The voice worker requests a Make host tool over the ACP host topic.
4. ACP invokes the corresponding Make callback and sends JSON-safe progress, result, error, or cancellation frames back through LiveKit.
5. Make never observes or controls the LiveKit room directly.

## Options Considered

### Option A: Stable Make references only

Make would memoize the tool registry, prompt, and every bridge action strongly enough that their references never change during a voice connection.

This is a useful optimization but not a sufficient ownership boundary. It leaves the public ACP component dependent on an undocumented React identity contract and makes every future host responsible for avoiding accidental session teardown.

### Option B: Remove Make host tools

Make would use only ACP's built-in tools.

This avoids the failing path but removes the product capability that makes Make voice useful: page targets, screenshots, comments, and comment execution. It is rejected.

### Option C: Stable ACP session with live host configuration (recommended)

ACP creates the realtime session based only on transport identity and component mount lifetime. The session keeps the latest host prompt/tools in mutable session state or refs. When the host configuration changes, ACP updates the worker configuration over the existing room; it does not dispose or recreate the room.

This preserves the public component API, keeps LiveKit fully inside ACP, and makes host-tool identity changes safe for all embedders. Make may still memoize values for efficiency, but correctness no longer depends on it.

## Detailed Design

### ACP public component

`AcpVoiceAssistant` continues to expose the existing props. Its session is created once for the component's transport identity and remains stable across ordinary `tools` and `prompt` prop changes. The component stores the latest host configuration and passes it to the existing room session without creating a second `Room`.

The implementation must ensure that:

- a changed tools array does not call the old session's `dispose()`;
- an in-flight host tool uses the configuration that was active when its request was received;
- the next configuration is sent over the current room only after the room is connected;
- configuration publishing failures are surfaced as voice errors without producing an unhandled promise;
- unmount and explicit user disconnect still dispose the session exactly once.

The existing `host.session.configure` wire shape remains unchanged. If the session is connected, a configuration update may reuse that message type with the current session id; if the worker needs an explicit update discriminator, it must be additive and backward-compatible.

### Make adapter

Make keeps `MakeVoiceToolRegistration`, `createMakeVoiceToolRegistry`, and `toAcpVoiceHostTools` as the host-side adapter. These modules contain no LiveKit imports and remain responsible for mapping Make's execution context to ACP's host-tool context.

`MakeCommentaryVoiceEntry` remains a thin product placement component that renders `AcpVoiceAssistant`. No room/session creation, data-channel publishing, microphone control, or reconnect logic is added to Make.

Make-side reference stabilization may be retained as a performance optimization, but it is not relied on for session correctness. Any Make callback that reads current page state must continue to resolve that state at execution time rather than capture stale page data.

### Error and cancellation behavior

- Host tool failures continue to return `host.tool.error` through ACP.
- Abort signals continue to cancel Make-side operations when ACP sends `host.tool.cancel`.
- A stale result from a disposed or superseded request is ignored by ACP, as it is today.
- A transient configuration publish failure must update the ACP voice snapshot and remain recoverable without disconnecting the room unless the transport itself is unusable.
- Explicit user exit and component unmount remain the only normal paths that close the LiveKit room.

## Testing Strategy

### ACP tests

- Add a component/session lifecycle regression that changes `tools` and `prompt` references while connected and asserts the room is not disconnected and the same session remains active.
- Add a host-tool result test that keeps a tool request in flight while configuration changes, then asserts the result is delivered once.
- Add a configuration publish failure test that asserts the failure is represented in session state and does not escape as an unhandled rejection.
- Keep the existing LiveKit session and public API tests passing.

### Make tests

- Keep the existing Make tool registry and adapter tests.
- Add a source-level boundary assertion that Make imports only `@axhub/acp/voice` for the voice surface and contains no `livekit-client` import or room lifecycle method.
- Add a focused test for the adapter's tool context mapping if the ACP configuration update changes its type surface.

### Verification commands

- In `apps/axhub-make`: `pnpm exec vitest run src/index/domains/assistant/makeRealtimeVoice.test.ts src/index/domains/assistant/makeVoiceTools.test.ts src/index/components/content/MakeCommentaryVoiceEntry.source.test.ts`.
- In `acp-ui`: run the focused realtime voice/session tests and the public API source tests.
- Run ACP lint/typecheck or build if the public component implementation or generated dist is changed.

## Rollout and Compatibility

The change is backward-compatible for existing `AcpVoiceAssistant` consumers. Existing callers may continue passing static or memoized tools. The published ACP package and its bundled voice worker must be released from the same version, as required by the existing voice API contract. Make's local `file:../../../acp-ui` development dependency can validate the change before switching to a published ACP version.

## Success Criteria

- Triggering any Make host tool does not stop an active voice conversation.
- Console output contains no `could not establish Publisher connection, state: new` caused by host-tool execution.
- No Make source imports `livekit-client` or calls `Room.disconnect()`.
- Make host tools still execute, confirm, cancel, and persist exactly as before.
- ACP unmount and explicit exit still close the room cleanly.
