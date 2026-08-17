# ACP Voice Popover And Drag Public API Design

## Goal

Restore the unified voice message card after a session connects and let Make enable the drag behavior already implemented by ACP's shared voice surface.

## Root causes

1. `SharedVoiceSurface` keeps its Popover closed until an explicit open change. The initial click starts an asynchronous connection while the Popover has no content, and no success-state effect opens it after the session becomes `connected`.
2. `SharedVoiceSurfaceProps` already includes `draggable?: boolean`, but `AcpVoiceAssistantProps` neither exposes nor forwards it. Make consumes `AcpVoiceAssistant`, so it cannot opt into dragging without bypassing the public component.

## Design

- Add a small transition predicate for the voice panel. It returns true only when status moves from a non-connected state to `connected`.
- `SharedVoiceSurface` tracks the previous session status and opens the Popover on that transition. A user may then close the Popover; subsequent caption updates while the status remains `connected` must not reopen it. A later disconnect/reconnect transition opens it again. Existing error auto-open behavior remains unchanged.
- Add optional `draggable?: boolean` to `AcpVoiceAssistantProps` and forward it unchanged to `SharedVoiceSurface`. The default remains false through the existing shared surface default, preserving current hosts.
- Make explicitly passes `draggable` while continuing to pass `injectAcpTools={false}` and its host `tools`.
- Update the public API documentation and rebuild ACP `dist`; refresh Make's existing `file:../../../acp-ui` dependency snapshot. Do not publish or change versions.

## Compatibility and boundaries

- No voice protocol, caption payload, LiveKit worker, prompt, or tool behavior changes.
- No Make-owned drag implementation or duplicated session state.
- Existing ACP consumers remain non-draggable unless they opt in.
- The message list remains ephemeral and in-memory for the current voice connection.

## Verification

- TDD unit coverage for the connection transition predicate, including no reopen while already connected and reopen after reconnect.
- ACP source/public-package checks proving `draggable` is exposed and forwarded.
- Make consumer regression proving `draggable`, `injectAcpTools={false}`, and host `tools` are all passed.
- ACP voice suite, public API build/package verification, Make focused tests, type checks, and production builds.
- Browser verification of the local ACP/Make surface where the local environment permits starting a configured voice session.

