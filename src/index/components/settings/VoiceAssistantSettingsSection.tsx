import React, {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from 'react';
import { Loader2, RotateCcw, Trash2 } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '../../../components/ui/button';
import { Field, FieldLabelWithHint } from '../../../components/ui/field';
import { Input } from '../../../components/ui/input';
import { requireProjectScope, withProjectScope } from '../../services/projectScope';
import { SettingsCollapsiblePanel } from './SettingsCollapsiblePanel';
import {
  buildVoiceAssistantSettingsRequest,
  buildVoiceAssistantSettingsTestRequest,
  createVoiceAssistantSettingsDraft,
  type VoiceAssistantSecretPath,
  type VoiceAssistantSettingsDraft,
  type VoiceAssistantSettingsPublic,
  type VoiceAssistantTestSection,
} from './voiceAssistantSettingsForm';

export interface VoiceAssistantSettingsSectionHandle {
  save(): Promise<void>;
}

interface VoiceAssistantSettingsSectionProps {
  active: boolean;
  initialSection?: 'voice-doubao';
  projectId: string;
}

interface VoiceAssistantSettingsResponse {
  settings?: VoiceAssistantSettingsPublic;
  message?: string;
  error?: string;
}

type VoiceConfigTestState = {
  status: 'idle' | 'testing' | 'passed' | 'failed';
  message?: string;
};

function createVoiceConfigTestStates(): Record<VoiceAssistantTestSection, VoiceConfigTestState> {
  return {
    doubao: { status: 'idle' },
    processing: { status: 'idle' },
    vision: { status: 'idle' },
  };
}

function readResponseError(payload: VoiceAssistantSettingsResponse, fallback: string): string {
  return typeof payload.error === 'string' && payload.error.trim()
    ? payload.error.trim()
    : fallback;
}

function SecretField({
  configured,
  label,
  onChange,
  onClear,
  value,
}: {
  configured: boolean;
  label: string;
  onChange: (value: string) => void;
  onClear: () => void;
  value: string;
}) {
  return (
    <Field>
      <FieldLabelWithHint hint="密钥只保存在本机 Make 全局配置中，页面不会读取已保存的明文。">
        {label}
      </FieldLabelWithHint>
      <div className="flex min-w-0 gap-2">
        <Input
          className="min-w-0"
          type="password"
          autoComplete="new-password"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder={configured ? '已配置；留空保持不变' : '请输入密钥'}
        />
        {configured || value ? (
          <Button
            type="button"
            variant="ghost"
            className="shrink-0 gap-1 text-destructive hover:text-destructive"
            onClick={onClear}
          >
            <Trash2 className="h-3.5 w-3.5" />
            清除
          </Button>
        ) : null}
      </div>
    </Field>
  );
}

function VoiceConfigTestActionRow({
  label,
  onTest,
  state,
}: {
  label: string;
  onTest: () => void;
  state: VoiceConfigTestState;
}) {
  return (
    <div className="mt-4 flex flex-wrap items-center gap-2">
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="gap-1.5"
        disabled={state.status === 'testing'}
        onClick={onTest}
      >
        {state.status === 'testing' ? <Loader2 className="animate-spin" /> : null}
        {state.status === 'testing' ? '测试中...' : label}
      </Button>
      {state.message ? (
        <span
          className={`min-w-0 whitespace-pre-wrap break-words text-xs ${state.status === 'failed' ? 'text-destructive' : 'text-muted-foreground'}`}
        >
          {state.message}
        </span>
      ) : null}
    </div>
  );
}

export const VoiceAssistantSettingsSection = forwardRef<
  VoiceAssistantSettingsSectionHandle,
  VoiceAssistantSettingsSectionProps
>(function VoiceAssistantSettingsSection({ active, initialSection, projectId }, ref) {
  const [draft, setDraft] = useState<VoiceAssistantSettingsDraft | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [testStates, setTestStates] = useState(createVoiceConfigTestStates);
  const [doubaoOpen, setDoubaoOpen] = useState(initialSection === 'voice-doubao');
  const loadedProjectIdRef = useRef('');
  const doubaoSectionRef = useRef<HTMLDivElement>(null);
  const testRunIdsRef = useRef<Record<VoiceAssistantTestSection, number>>({
    doubao: 0,
    processing: 0,
    vision: 0,
  });

  const invalidateTestState = (section: VoiceAssistantTestSection) => {
    testRunIdsRef.current[section] += 1;
    setTestStates((current) => current[section].status === 'idle' && !current[section].message
      ? current
      : { ...current, [section]: { status: 'idle' } });
  };

  const invalidateAllTestStates = () => {
    testRunIdsRef.current.doubao += 1;
    testRunIdsRef.current.processing += 1;
    testRunIdsRef.current.vision += 1;
    setTestStates(createVoiceConfigTestStates());
  };

  const buildUrl = () => withProjectScope(
    '/api/config/voice-assistant',
    requireProjectScope(projectId),
  );

  const load = async () => {
    invalidateAllTestStates();
    setLoading(true);
    setError('');
    try {
      const response = await fetch(buildUrl(), {
        cache: 'no-store',
        headers: { Accept: 'application/json' },
      });
      const payload = await response.json() as VoiceAssistantSettingsResponse;
      if (!response.ok || !payload.settings) {
        throw new Error(readResponseError(payload, '读取语音助手配置失败'));
      }
      setDraft(createVoiceAssistantSettingsDraft(payload.settings));
      loadedProjectIdRef.current = projectId;
    } catch (loadError: any) {
      loadedProjectIdRef.current = '';
      setError(loadError?.message || '读取语音助手配置失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!active || !projectId || loadedProjectIdRef.current === projectId) return;
    void load();
  }, [active, projectId]);

  useEffect(() => {
    if (!active || initialSection !== 'voice-doubao') return;
    setDoubaoOpen(true);
    const frame = requestAnimationFrame(() => {
      doubaoSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
    return () => cancelAnimationFrame(frame);
  }, [active, initialSection]);

  useImperativeHandle(ref, () => ({
    async save() {
      if (!draft) {
        if (error) throw new Error(error);
        return;
      }
      const response = await fetch(buildUrl(), {
        method: 'PUT',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(buildVoiceAssistantSettingsRequest(draft)),
      });
      const payload = await response.json() as VoiceAssistantSettingsResponse;
      if (!response.ok || !payload.settings) {
        throw new Error(readResponseError(payload, '保存语音助手配置失败'));
      }
      invalidateAllTestStates();
      setDraft(createVoiceAssistantSettingsDraft(payload.settings));
    },
  }), [draft, error, projectId]);

  const updateSection = <Section extends 'doubao' | 'processing' | 'vision'>(
    section: Section,
    patch: Partial<VoiceAssistantSettingsDraft[Section]>,
  ) => {
    invalidateTestState(section);
    setDraft((current) => current
      ? { ...current, [section]: { ...current[section], ...patch } }
      : current);
  };

  const updateSecret = (
    secretPath: VoiceAssistantSecretPath,
    value: string,
  ) => {
    invalidateTestState(secretPath.split('.')[0] as VoiceAssistantTestSection);
    setDraft((current) => {
      if (!current) return current;
      const clearSecrets = current.clearSecrets.filter((path) => path !== secretPath);
      if (secretPath === 'doubao.accessKey') {
        return {
          ...current,
          clearSecrets,
          doubao: { ...current.doubao, accessKey: value },
        };
      }
      if (secretPath === 'processing.apiKey') {
        return {
          ...current,
          clearSecrets,
          processing: { ...current.processing, apiKey: value },
        };
      }
      return {
        ...current,
        clearSecrets,
        vision: { ...current.vision, apiKey: value },
      };
    });
  };

  const clearSecret = (secretPath: VoiceAssistantSecretPath) => {
    invalidateTestState(secretPath.split('.')[0] as VoiceAssistantTestSection);
    setDraft((current) => {
      if (!current) return current;
      const clearSecrets = Array.from(new Set([...current.clearSecrets, secretPath]));
      const configured = {
        ...current.configured,
        ...(secretPath === 'doubao.accessKey' ? { doubaoAccessKey: false } : {}),
        ...(secretPath === 'processing.apiKey' ? { processingApiKey: false } : {}),
        ...(secretPath === 'vision.apiKey' ? { visionApiKey: false } : {}),
      };
      if (secretPath === 'doubao.accessKey') {
        return { ...current, configured, clearSecrets, doubao: { ...current.doubao, accessKey: '' } };
      }
      if (secretPath === 'processing.apiKey') {
        return { ...current, configured, clearSecrets, processing: { ...current.processing, apiKey: '' } };
      }
      return { ...current, configured, clearSecrets, vision: { ...current.vision, apiKey: '' } };
    });
  };

  const handleTest = async (section: VoiceAssistantTestSection) => {
    if (!draft) return;
    const requestId = testRunIdsRef.current[section] + 1;
    testRunIdsRef.current[section] = requestId;
    setTestStates((current) => ({
      ...current,
      [section]: { status: 'testing' },
    }));
    try {
      const response = await fetch(withProjectScope(
        '/api/config/voice-assistant/test',
        requireProjectScope(projectId),
      ), {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(buildVoiceAssistantSettingsTestRequest(draft, section)),
      });
      const payload = await response.json() as VoiceAssistantSettingsResponse;
      if (testRunIdsRef.current[section] !== requestId) return;
      if (!response.ok || !payload.message) {
        throw new Error(readResponseError(payload, '配置测试失败'));
      }
      setTestStates((current) => ({
        ...current,
        [section]: { status: 'passed', message: payload.message },
      }));
      toast.success(payload.message);
    } catch (testError: any) {
      if (testRunIdsRef.current[section] !== requestId) return;
      const message = testError?.message || '配置测试失败';
      setTestStates((current) => ({
        ...current,
        [section]: { status: 'failed', message },
      }));
      toast.error(message);
    }
  };

  if (loading && !draft) {
    return (
      <div className="flex items-center gap-2 border-b border-border py-4 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        正在读取语音相关配置...
      </div>
    );
  }

  if (!draft) {
    return (
      <div className="flex items-center justify-between gap-3 border-b border-border py-4">
        <span className="text-sm text-destructive">{error || '语音相关配置暂不可用'}</span>
        <Button type="button" variant="outline" size="sm" className="gap-1.5" onClick={() => void load()}>
          <RotateCcw className="h-3.5 w-3.5" />
          重试
        </Button>
      </div>
    );
  }

  return (
    <div data-voice-assistant-settings>
      <div id="voice-doubao" ref={doubaoSectionRef} className="scroll-mt-4">
        <SettingsCollapsiblePanel
          title="豆包语音 API"
          description="配置语音识别、打断和播报所需的豆包应用凭证。"
          open={doubaoOpen}
          onOpenChange={setDoubaoOpen}
        >
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <Field>
              <FieldLabelWithHint hint="豆包实时语音应用 ID">App ID</FieldLabelWithHint>
              <Input
                value={draft.doubao.appId}
                onChange={(event) => updateSection('doubao', { appId: event.target.value })}
                placeholder="请输入 App ID"
              />
            </Field>
            <SecretField
              label="Access Key"
              configured={draft.configured.doubaoAccessKey}
              value={draft.doubao.accessKey}
              onChange={(value) => updateSecret('doubao.accessKey', value)}
              onClear={() => clearSecret('doubao.accessKey')}
            />
            <Field>
              <FieldLabelWithHint hint="可选；留空时沿用豆包默认发音人">发音人</FieldLabelWithHint>
              <Input
                value={draft.doubao.speaker}
                onChange={(event) => updateSection('doubao', { speaker: event.target.value })}
                placeholder="沿用豆包默认发音人"
              />
            </Field>
          </div>
          <div data-voice-config-test-actions>
            <VoiceConfigTestActionRow
              label="测试豆包配置"
              state={testStates.doubao}
              onTest={() => void handleTest('doubao')}
            />
          </div>
        </SettingsCollapsiblePanel>
      </div>

      <SettingsCollapsiblePanel
        title="网页任务 API"
        description="配置 OpenAI-compatible API，供语音网页任务处理使用。"
      >
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <Field>
            <FieldLabelWithHint hint="OpenAI-compatible /v1 API 地址">Base URL</FieldLabelWithHint>
            <Input
              value={draft.processing.baseUrl}
              onChange={(event) => updateSection('processing', { baseUrl: event.target.value })}
              placeholder="https://api.openai.com/v1"
            />
          </Field>
          <SecretField
            label="API Key"
            configured={draft.configured.processingApiKey}
            value={draft.processing.apiKey}
            onChange={(value) => updateSecret('processing.apiKey', value)}
            onClear={() => clearSecret('processing.apiKey')}
          />
          <Field>
            <FieldLabelWithHint hint="网页任务处理模型 ID">模型</FieldLabelWithHint>
            <Input
              value={draft.processing.model}
              onChange={(event) => updateSection('processing', { model: event.target.value })}
              placeholder="gpt-4.1-mini"
            />
          </Field>
        </div>
        <div data-voice-config-test-actions>
          <VoiceConfigTestActionRow
            label="测试网页任务配置"
            state={testStates.processing}
            onTest={() => void handleTest('processing')}
          />
        </div>
      </SettingsCollapsiblePanel>

      <SettingsCollapsiblePanel
        title="视觉 API"
        description="配置可选的视觉理解服务；未使用视觉能力时可留空。"
      >
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <Field>
            <FieldLabelWithHint hint="视觉服务的 HTTPS API 地址">Endpoint</FieldLabelWithHint>
            <Input
              value={draft.vision.endpoint}
              onChange={(event) => updateSection('vision', { endpoint: event.target.value })}
              placeholder="https://vision.example/v1"
            />
          </Field>
          <SecretField
            label="API Key"
            configured={draft.configured.visionApiKey}
            value={draft.vision.apiKey}
            onChange={(value) => updateSecret('vision.apiKey', value)}
            onClear={() => clearSecret('vision.apiKey')}
          />
          <Field>
            <FieldLabelWithHint hint="视觉理解模型 ID">模型</FieldLabelWithHint>
            <Input
              value={draft.vision.model}
              onChange={(event) => updateSection('vision', { model: event.target.value })}
              placeholder="请输入模型 ID"
            />
          </Field>
        </div>
        <div data-voice-config-test-actions>
          <VoiceConfigTestActionRow
            label="测试视觉配置"
            state={testStates.vision}
            onTest={() => void handleTest('vision')}
          />
        </div>
      </SettingsCollapsiblePanel>
    </div>
  );
});
