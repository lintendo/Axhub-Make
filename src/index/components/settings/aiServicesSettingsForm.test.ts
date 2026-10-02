import { describe, expect, it } from 'vitest';

import {
  buildAiServicesSettingsRequest,
  buildAiServicesSettingsTestRequest,
  createAiServicesSettingsDraft,
  type AiServicesSettingsPublic,
} from './aiServicesSettingsForm';

const publicSettings: AiServicesSettingsPublic = {
  imageGeneration: {
    baseUrl: 'https://images.example/v1',
    model: 'image-model',
    hasApiKey: true,
  },
  doubao: { appId: 'app-1', speaker: 'voice-1', hasAccessKey: true },
  processing: { baseUrl: 'https://api.openai.com/v1', model: 'gpt-4.1-mini', hasApiKey: true },
  vision: {
    endpoint: '',
    model: '',
    family: 'qwen3',
    responseFormat: 'auto',
    hasApiKey: false,
  },
};

describe('AI services settings form helpers', () => {
  it('keeps every secret input blank while preserving configured state', () => {
    const draft = createAiServicesSettingsDraft(publicSettings);

    expect(draft.imageGeneration.apiKey).toBe('');
    expect(draft.doubao.accessKey).toBe('');
    expect(draft.processing.apiKey).toBe('');
    expect(draft.vision.apiKey).toBe('');
    expect(draft.configured).toEqual({
      imageGenerationApiKey: true,
      doubaoAccessKey: true,
      processingApiKey: true,
      visionApiKey: false,
    });
  });

  it('submits all public fields, only newly entered secrets, and explicit clear paths', () => {
    const draft = createAiServicesSettingsDraft(publicSettings);
    draft.imageGeneration.model = 'next-image-model';
    draft.processing.apiKey = 'new-processing-secret';
    draft.clearSecrets = ['doubao.accessKey'];

    expect(buildAiServicesSettingsRequest(draft)).toEqual({
      patch: {
        imageGeneration: {
          baseUrl: 'https://images.example/v1',
          model: 'next-image-model',
        },
        doubao: { appId: 'app-1', speaker: 'voice-1' },
        processing: {
          baseUrl: 'https://api.openai.com/v1',
          model: 'gpt-4.1-mini',
          apiKey: 'new-processing-secret',
        },
        vision: {
          endpoint: '',
          model: '',
          family: 'qwen3',
          responseFormat: 'auto',
        },
      },
      clearSecrets: ['doubao.accessKey'],
    });
  });

  it('builds a target-only image test request without exposing saved secrets', () => {
    const draft = createAiServicesSettingsDraft(publicSettings);
    draft.imageGeneration.apiKey = 'draft-image-secret';
    draft.clearSecrets = ['processing.apiKey'];

    expect(buildAiServicesSettingsTestRequest(draft, 'imageGeneration', 'test prompt')).toEqual({
      section: 'imageGeneration',
      patch: {
        imageGeneration: {
          baseUrl: 'https://images.example/v1',
          model: 'image-model',
          apiKey: 'draft-image-secret',
        },
      },
      clearSecrets: [],
      prompt: 'test prompt',
    });
  });
});
