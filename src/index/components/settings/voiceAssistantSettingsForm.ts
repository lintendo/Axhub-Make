export type VoiceAssistantSecretPath =
  | 'doubao.accessKey'
  | 'processing.apiKey'
  | 'vision.apiKey';

export interface VoiceAssistantSettingsPublic {
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
    hasApiKey: boolean;
  };
}

export interface VoiceAssistantSettingsDraft {
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
  };
  configured: {
    doubaoAccessKey: boolean;
    processingApiKey: boolean;
    visionApiKey: boolean;
  };
  clearSecrets: VoiceAssistantSecretPath[];
}

export type VoiceAssistantTestSection = 'doubao' | 'processing' | 'vision';

export function createVoiceAssistantSettingsDraft(
  settings: VoiceAssistantSettingsPublic,
): VoiceAssistantSettingsDraft {
  return {
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
    },
    configured: {
      doubaoAccessKey: settings.doubao.hasAccessKey,
      processingApiKey: settings.processing.hasApiKey,
      visionApiKey: settings.vision.hasApiKey,
    },
    clearSecrets: [],
  };
}

export function buildVoiceAssistantSettingsRequest(
  draft: VoiceAssistantSettingsDraft,
) {
  return {
    patch: {
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
        ...(draft.vision.apiKey.trim()
          ? { apiKey: draft.vision.apiKey.trim() }
          : {}),
      },
    },
    clearSecrets: [...draft.clearSecrets],
  };
}

export function buildVoiceAssistantSettingsTestRequest(
  draft: VoiceAssistantSettingsDraft,
  section: VoiceAssistantTestSection,
) {
  const request = buildVoiceAssistantSettingsRequest(draft);
  const secretPathBySection: Record<VoiceAssistantTestSection, VoiceAssistantSecretPath> = {
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
  };
}
