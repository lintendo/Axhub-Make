import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  buildVoiceAssistantSettingsRequest,
  buildVoiceAssistantSettingsTestRequest,
  createVoiceAssistantSettingsDraft,
  type VoiceAssistantSettingsPublic,
} from './voiceAssistantSettingsForm';

const publicSettings: VoiceAssistantSettingsPublic = {
  doubao: { appId: 'app-1', speaker: 'voice-1', hasAccessKey: true },
  processing: { baseUrl: 'https://api.openai.com/v1', model: 'gpt-4.1-mini', hasApiKey: true },
  vision: { endpoint: '', model: '', hasApiKey: false },
};

const sectionSource = readFileSync(
  resolve(__dirname, './VoiceAssistantSettingsSection.tsx'),
  'utf8',
);

describe('VoiceAssistantSettingsSection helpers', () => {
  it('keeps secret configuration status inside the input instead of adding a helper row', () => {
    const secretFieldSource = sectionSource.slice(
      sectionSource.indexOf('function SecretField'),
      sectionSource.indexOf('export const VoiceAssistantSettingsSection'),
    );

    expect(secretFieldSource).toContain("placeholder={configured ? '已配置；留空保持不变' : '请输入密钥'}");
    expect(secretFieldSource).not.toContain('<FieldDescription>');
    expect(secretFieldSource).not.toContain('尚未配置。');
  });

  it('keeps secret inputs blank and preserves configured secret state', () => {
    const draft = createVoiceAssistantSettingsDraft(publicSettings);
    expect(draft.doubao).toEqual({ appId: 'app-1', accessKey: '', speaker: 'voice-1' });
    expect(draft.processing.apiKey).toBe('');
    expect(draft.configured).toEqual({
      doubaoAccessKey: true,
      processingApiKey: true,
      visionApiKey: false,
    });
  });

  it('submits only newly entered secrets and explicit clear paths', () => {
    const draft = createVoiceAssistantSettingsDraft(publicSettings);
    draft.doubao.appId = 'app-2';
    draft.processing.apiKey = 'new-processing-secret';
    draft.clearSecrets = ['doubao.accessKey'];

    expect(buildVoiceAssistantSettingsRequest(draft)).toEqual({
      patch: {
        doubao: { appId: 'app-2', speaker: 'voice-1' },
        processing: {
          baseUrl: 'https://api.openai.com/v1',
          model: 'gpt-4.1-mini',
          apiKey: 'new-processing-secret',
        },
        vision: { endpoint: '', model: '' },
      },
      clearSecrets: ['doubao.accessKey'],
    });
  });

  it('builds a target-only test request and clear path', () => {
    const draft = createVoiceAssistantSettingsDraft(publicSettings);
    draft.processing.model = 'draft-model';
    draft.clearSecrets = ['doubao.accessKey', 'processing.apiKey'];

    expect(buildVoiceAssistantSettingsTestRequest(draft, 'processing')).toEqual({
      section: 'processing',
      patch: {
        processing: {
          baseUrl: 'https://api.openai.com/v1',
          model: 'draft-model',
        },
      },
      clearSecrets: ['processing.apiKey'],
    });
  });

  it('renders one independent test action row for each provider section', () => {
    expect(sectionSource).toContain('测试豆包配置');
    expect(sectionSource).toContain('测试网页任务配置');
    expect(sectionSource).toContain('测试视觉配置');
    expect(sectionSource).toContain("'/api/config/voice-assistant/test'");
    expect(sectionSource.match(/data-voice-config-test-actions/gu)).toHaveLength(3);
  });

  it('invalidates stale provider test results when drafts or projects change', () => {
    expect(sectionSource).toContain('const invalidateTestState = (section: VoiceAssistantTestSection) =>');
    expect(sectionSource).toContain('const invalidateAllTestStates = () =>');
    expect(sectionSource).toContain('if (testRunIdsRef.current[section] !== requestId) return;');
    expect(sectionSource).toContain('invalidateTestState(section);');
    expect(sectionSource.match(/invalidateTestState\(secretPath\.split/gu)).toHaveLength(2);
  });
});
