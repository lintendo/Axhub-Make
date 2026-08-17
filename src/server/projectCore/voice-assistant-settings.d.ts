export { getGlobalVoiceAssistantSettingsPath } from './paths.ts';
export type VoiceAssistantSecretPath = 'doubao.accessKey' | 'processing.apiKey' | 'vision.apiKey';
export interface VoiceAssistantSettings {
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
}
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
export type VoiceAssistantSettingsPatch = {
    doubao?: Partial<VoiceAssistantSettings['doubao']>;
    processing?: Partial<VoiceAssistantSettings['processing']>;
    vision?: Partial<VoiceAssistantSettings['vision']>;
};
export declare function readVoiceAssistantSettings(options?: {
    homeDir?: string;
}): VoiceAssistantSettings;
export declare function maskVoiceAssistantSettings(settings: VoiceAssistantSettings): VoiceAssistantSettingsPublic;
export declare function writeVoiceAssistantSettingsPatch(patch: VoiceAssistantSettingsPatch, options?: {
    clearSecrets?: readonly VoiceAssistantSecretPath[];
    homeDir?: string;
}): VoiceAssistantSettings;
