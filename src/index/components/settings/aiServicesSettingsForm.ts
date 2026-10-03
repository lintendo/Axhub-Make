export type AiServiceSecretPath =
  | 'imageGeneration.apiKey'
  | 'doubao.accessKey'
  | 'processing.apiKey'
  | 'vision.apiKey';

export interface AiImageLastTest {
  status: 'passed' | 'failed';
  message: string;
  testedAt: number;
}

export interface AiServicesSettingsPublic {
  imageGeneration: {
    baseUrl: string;
    model: string;
    hasApiKey: boolean;
    lastTest?: AiImageLastTest;
  };
  doubao: {
    appId: string;
    speaker: string;
    hasAccessKey: boolean;
  };
  processing: {
    baseUrl: string;
    model: string;
    hasApiKey: boolean;
  };
  vision: {
    endpoint: string;
    model: string;
    family: '' | 'qwen3' | 'doubao-seed';
    responseFormat: 'auto' | 'none';
    hasApiKey: boolean;
  };
}

export interface AiServicesSettingsDraft {
  imageGeneration: {
    baseUrl: string;
    apiKey: string;
    model: string;
    lastTest?: AiImageLastTest;
  };
  doubao: {
    appId: string;
    accessKey: string;
    speaker: string;
  };
  processing: {
    baseUrl: string;
    apiKey: string;
    model: string;
  };
  vision: {
    endpoint: string;
    apiKey: string;
    model: string;
    family: '' | 'qwen3' | 'doubao-seed';
    responseFormat: 'auto' | 'none';
  };
  configured: {
    imageGenerationApiKey: boolean;
    doubaoAccessKey: boolean;
    processingApiKey: boolean;
    visionApiKey: boolean;
  };
  clearSecrets: AiServiceSecretPath[];
}

export type AiServicesTestSection = 'imageGeneration' | 'doubao' | 'processing' | 'vision';

export function createAiServicesSettingsDraft(
  settings: AiServicesSettingsPublic,
): AiServicesSettingsDraft {
  return {
    imageGeneration: {
      baseUrl: settings.imageGeneration.baseUrl,
      apiKey: '',
      model: settings.imageGeneration.model,
      ...(settings.imageGeneration.lastTest ? { lastTest: settings.imageGeneration.lastTest } : {}),
    },
    doubao: {
      appId: settings.doubao.appId,
      accessKey: '',
      speaker: settings.doubao.speaker,
    },
    processing: {
      baseUrl: settings.processing.baseUrl,
      apiKey: '',
      model: settings.processing.model,
    },
    vision: {
      endpoint: settings.vision.endpoint,
      apiKey: '',
      model: settings.vision.model,
      family: settings.vision.family,
      responseFormat: settings.vision.responseFormat,
    },
    configured: {
      imageGenerationApiKey: settings.imageGeneration.hasApiKey,
      doubaoAccessKey: settings.doubao.hasAccessKey,
      processingApiKey: settings.processing.hasApiKey,
      visionApiKey: settings.vision.hasApiKey,
    },
    clearSecrets: [],
  };
}

export function buildAiServicesSettingsRequest(draft: AiServicesSettingsDraft) {
  return {
    patch: {
      imageGeneration: {
        baseUrl: draft.imageGeneration.baseUrl.trim(),
        model: draft.imageGeneration.model.trim(),
        ...(draft.imageGeneration.apiKey.trim()
          ? { apiKey: draft.imageGeneration.apiKey.trim() }
          : {}),
        ...(draft.imageGeneration.lastTest ? { lastTest: draft.imageGeneration.lastTest } : {}),
      },
      doubao: {
        appId: draft.doubao.appId.trim(),
        speaker: draft.doubao.speaker.trim(),
        ...(draft.doubao.accessKey.trim()
          ? { accessKey: draft.doubao.accessKey.trim() }
          : {}),
      },
      processing: {
        baseUrl: draft.processing.baseUrl.trim(),
        model: draft.processing.model.trim(),
        ...(draft.processing.apiKey.trim()
          ? { apiKey: draft.processing.apiKey.trim() }
          : {}),
      },
      vision: {
        endpoint: draft.vision.endpoint.trim(),
        model: draft.vision.model.trim(),
        family: draft.vision.family,
        responseFormat: draft.vision.responseFormat,
        ...(draft.vision.apiKey.trim()
          ? { apiKey: draft.vision.apiKey.trim() }
          : {}),
      },
    },
    clearSecrets: [...draft.clearSecrets],
  };
}

export function buildAiServicesSettingsTestRequest(
  draft: AiServicesSettingsDraft,
  section: AiServicesTestSection,
  prompt?: string,
) {
  const request = buildAiServicesSettingsRequest(draft);
  const secretPathBySection: Record<AiServicesTestSection, AiServiceSecretPath> = {
    imageGeneration: 'imageGeneration.apiKey',
    doubao: 'doubao.accessKey',
    processing: 'processing.apiKey',
    vision: 'vision.apiKey',
  };
  return {
    section,
    patch: { [section]: request.patch[section] },
    clearSecrets: request.clearSecrets.filter(
      (secretPath) => secretPath === secretPathBySection[section],
    ),
    ...(prompt === undefined ? {} : { prompt }),
  };
}
