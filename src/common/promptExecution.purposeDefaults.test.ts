import { describe, expect, it } from 'vitest';

import * as promptExecution from './promptExecution';

type PurposePreferences = {
  conversationPromptClient: 'acp:claude' | 'acp:codex' | 'acp:qoder' | null;
  conversationModel: string;
  annotationPromptClient: 'acp:claude' | 'acp:codex' | 'acp:qoder' | null;
  annotationModel: string;
  canvasPromptClient: 'acp:claude' | 'acp:codex' | 'acp:qoder' | null;
  canvasModel: string;
};

describe('fillUnsetAiPurposePromptClients', () => {
  const fillUnsetAiPurposePromptClients = (
    promptExecution as typeof promptExecution & {
      fillUnsetAiPurposePromptClients?: (
        previous: PurposePreferences,
        key: 'conversationPromptClient' | 'annotationPromptClient' | 'canvasPromptClient',
        value: PurposePreferences['conversationPromptClient'],
      ) => PurposePreferences;
    }
  ).fillUnsetAiPurposePromptClients;

  it('copies the first selected provider into the other unset purposes without changing models', () => {
    expect(fillUnsetAiPurposePromptClients).toBeTypeOf('function');
    if (!fillUnsetAiPurposePromptClients) return;

    const next = fillUnsetAiPurposePromptClients({
      conversationPromptClient: null,
      conversationModel: 'conversation-model',
      annotationPromptClient: null,
      annotationModel: 'annotation-model',
      canvasPromptClient: null,
      canvasModel: 'canvas-model',
    }, 'annotationPromptClient', 'acp:codex');

    expect(next).toEqual({
      conversationPromptClient: 'acp:codex',
      conversationModel: 'conversation-model',
      annotationPromptClient: 'acp:codex',
      annotationModel: 'annotation-model',
      canvasPromptClient: 'acp:codex',
      canvasModel: 'canvas-model',
    });
  });

  it('preserves providers that were already selected', () => {
    expect(fillUnsetAiPurposePromptClients).toBeTypeOf('function');
    if (!fillUnsetAiPurposePromptClients) return;

    const next = fillUnsetAiPurposePromptClients({
      conversationPromptClient: 'acp:claude',
      conversationModel: '',
      annotationPromptClient: null,
      annotationModel: '',
      canvasPromptClient: 'acp:qoder',
      canvasModel: '',
    }, 'annotationPromptClient', 'acp:codex');

    expect(next.conversationPromptClient).toBe('acp:claude');
    expect(next.annotationPromptClient).toBe('acp:codex');
    expect(next.canvasPromptClient).toBe('acp:qoder');
  });

  it('clears only the selected purpose when the provider is removed', () => {
    expect(fillUnsetAiPurposePromptClients).toBeTypeOf('function');
    if (!fillUnsetAiPurposePromptClients) return;

    const next = fillUnsetAiPurposePromptClients({
      conversationPromptClient: 'acp:claude',
      conversationModel: 'chat',
      annotationPromptClient: 'acp:codex',
      annotationModel: 'review',
      canvasPromptClient: 'acp:qoder',
      canvasModel: 'canvas',
    }, 'annotationPromptClient', null);

    expect(next).toEqual({
      conversationPromptClient: 'acp:claude',
      conversationModel: 'chat',
      annotationPromptClient: null,
      annotationModel: 'review',
      canvasPromptClient: 'acp:qoder',
      canvasModel: 'canvas',
    });
  });
});
