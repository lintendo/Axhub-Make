import { describe, expect, it } from 'vitest';

import {
  assertAssistantWorkTransition,
  isTerminalAssistantWorkStatus,
  mapAcpRunStateToWorkStatus,
  normalizeAssistantWorkErrorCode,
  normalizeAssistantWorkStatus,
} from './assistantWorkProtocol.ts';

describe('assistant work protocol', () => {
  it.each([
    ['queued', 'queued'],
    ['running', 'running'],
    ['completed', 'completed'],
    ['aborted', 'failed'],
    ['error', 'failed'],
    ['unknown', null],
  ] as const)('maps ACP %s to %s', (runState, expected) => {
    expect(mapAcpRunStateToWorkStatus(runState)).toBe(expected);
  });

  it('maps an active run with a pending follow-up to waiting', () => {
    expect(mapAcpRunStateToWorkStatus('running', { hasPendingFollowUp: true })).toBe('waiting');
    expect(mapAcpRunStateToWorkStatus('queued', { hasPendingFollowUp: true })).toBe('waiting');
    expect(mapAcpRunStateToWorkStatus('completed', { hasPendingFollowUp: true })).toBe('completed');
  });

  it('normalizes only known statuses and error codes', () => {
    expect(normalizeAssistantWorkStatus('RUNNING')).toBe('running');
    expect(normalizeAssistantWorkStatus('not-a-state')).toBeNull();
    expect(normalizeAssistantWorkErrorCode('CANVAS_REVISION_CONFLICT')).toBe('CANVAS_REVISION_CONFLICT');
    expect(normalizeAssistantWorkErrorCode('internal stack')).toBeNull();
  });

  it('accepts the documented transitions and rejects silent terminal rewrites', () => {
    expect(() => assertAssistantWorkTransition('queued', 'running')).not.toThrow();
    expect(() => assertAssistantWorkTransition('running', 'waiting')).not.toThrow();
    expect(() => assertAssistantWorkTransition('waiting', 'running')).not.toThrow();
    expect(() => assertAssistantWorkTransition('completed', 'queued')).not.toThrow();
    expect(() => assertAssistantWorkTransition('completed', 'cancelled')).toThrow(/Invalid assistant work transition/);
  });

  it('identifies all terminal work statuses', () => {
    expect(isTerminalAssistantWorkStatus('completed')).toBe(true);
    expect(isTerminalAssistantWorkStatus('failed')).toBe(true);
    expect(isTerminalAssistantWorkStatus('cancelled')).toBe(true);
    expect(isTerminalAssistantWorkStatus('conflict')).toBe(true);
    expect(isTerminalAssistantWorkStatus('waiting')).toBe(false);
  });
});
