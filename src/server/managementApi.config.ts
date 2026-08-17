import type { IncomingMessage, ServerResponse } from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  getConfigPath,
  maskVoiceAssistantSettings,
  readVoiceAssistantSettings,
  resolveCodexLocalImageGenerationConfig,
  type VoiceAssistantSecretPath,
  type VoiceAssistantSettingsPatch,
  writeVoiceAssistantSettingsPatch,
} from './projectCore/index.ts';

import { getLocalNetworkHosts, readJsonBody, sendJson, streamDirectoryAsZip } from './http.ts';
import { syncProjectAgentInstructions } from './projectAgentInstructions.ts';
import type { ManagementApiOptions } from './managementApi.ts';
import {
  sanitizeVoiceAssistantTestError,
  testVoiceAssistantConfig,
} from './voiceAssistantConfigTest.ts';

const makePackageJsonPath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../package.json');
const AI_IMAGE_CONFIG_TEST_PROMPT = '生成一张用于验证图片生成配置的极简测试图片，内容为白底黑色文字 OK。';
const AI_IMAGE_CONFIG_TEST_TIMEOUT_MS = 600_000;
const EMPTY_AGENT_AVAILABILITY = { cli: {}, localApp: {}, web: {} };
export function readMakeServerVersion(): string | null {
  return fs.existsSync(makePackageJsonPath)
    ? JSON.parse(fs.readFileSync(makePackageJsonPath, 'utf8')).version ?? null
    : null;
}

interface ConfigProject {
  id: string;
  name?: string;
  root: string;
}

interface ConfigProjectContext {
  project: ConfigProject;
}

interface ConfigApiHandlers {
  readProjectConfig: (projectRoot: string) => any;
  getServerConfigStoreForRequest: (options: ManagementApiOptions) => {
    getConfig: (params: { activeProjectRoot: string }) => any;
    saveConfig: (config: Record<string, unknown>) => unknown;
  };
  stringValue: (value: unknown) => string;
  toProjectIdentity: (project: ConfigProject) => { id: string; name: string };
  updateRegisteredProjectTitle: (options: ManagementApiOptions, project: ConfigProject, title: string) => ConfigProject;
}

function buildConfigBootstrapResponse(params: {
  config: any;
  activeProject: ConfigProject;
  activeProjectRoot: string;
  projectInfo: Record<string, unknown>;
  serverConfig: ReturnType<ConfigApiHandlers['getServerConfigStoreForRequest']> extends infer Store
    ? Store extends { getConfig: (...args: any[]) => infer Result } ? Result : any
    : any;
}) {
  const availableLANHosts = getLocalNetworkHosts();
  return {
    ...params.config,
    server: normalizeProjectServerConfig(params.config?.server, availableLANHosts),
    availableLANHosts,
    projectInfo: params.projectInfo,
    automation: params.serverConfig.automation,
    assistant: params.serverConfig.assistant,
    ai: params.serverConfig.ai,
    uiPreferences: params.serverConfig.uiPreferences,
    toolOpenState: params.serverConfig.toolOpenState,
    projectPath: params.activeProjectRoot,
    projectId: params.activeProject.id,
  };
}

class AiImageConfigTestError extends Error {
  readonly statusCode: number;

  constructor(message: string, statusCode = 502) {
    super(message);
    this.name = 'AiImageConfigTestError';
    this.statusCode = statusCode;
  }
}

function normalizeString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeProjectServerConfig(server: unknown, availableLANHosts: string[]): Record<string, unknown> {
  const raw = server && typeof server === 'object' && !Array.isArray(server)
    ? server as Record<string, unknown>
    : {};
  const host = normalizeString(raw.host) || 'localhost';
  const configuredLANHost = normalizeString(raw.lanHost);
  const fallbackLANHost = availableLANHosts.find(Boolean) || '';
  return {
    ...Object.fromEntries(Object.entries(raw).filter(([key]) => key !== 'allowLAN')),
    host,
    ...(configuredLANHost || fallbackLANHost ? { lanHost: configuredLANHost || fallbackLANHost } : {}),
  };
}

function normalizeImageTestBaseUrl(value: unknown, fallback: unknown): string {
  const raw = normalizeString(value) || normalizeString(fallback) || 'https://api.openai.com/v1';
  const input = /^[a-zA-Z][a-zA-Z\d+.-]*:\/\//.test(raw)
    ? raw
    : `https://${raw}`;
  try {
    const url = new URL(input);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      throw new Error('Unsupported protocol');
    }
    const pathSegments = url.pathname.split('/').filter(Boolean);
    const v1Index = pathSegments.indexOf('v1');
    const normalizedSegments = v1Index >= 0
      ? pathSegments.slice(0, v1Index + 1)
      : pathSegments.length
        ? [...pathSegments, 'v1']
        : ['v1'];
    return `${url.origin}/${normalizedSegments.join('/')}`;
  } catch {
    throw new AiImageConfigTestError('Base URL 无效', 400);
  }
}

function buildImageGenerationTestUrl(baseUrl: string): string {
  return `${baseUrl.replace(/\/+$/u, '')}/images/generations`;
}

function createImageConfigTestSignal(timeoutMs: number): AbortSignal {
  if (typeof AbortSignal.timeout === 'function') {
    return AbortSignal.timeout(timeoutMs);
  }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  timeout.unref?.();
  return controller.signal;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function hasOwn(record: Record<string, unknown>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(record, key);
}

function getRegistryHome(options: ManagementApiOptions): string | undefined {
  return options.registryPath
    ? path.dirname(path.dirname(path.dirname(path.resolve(options.registryPath))))
    : undefined;
}

function hasGeneratedImagePayload(value: unknown, depth = 0): boolean {
  if (depth > 8 || value == null) return false;
  if (Array.isArray(value)) {
    return value.some((item) => hasGeneratedImagePayload(item, depth + 1));
  }
  if (!isRecord(value)) return false;

  for (const key of ['b64_json', 'base64', 'dataUrl', 'dataURL', 'url', 'image', 'image_url']) {
    if (typeof value[key] === 'string' && value[key].trim()) {
      return true;
    }
  }

  for (const key of ['data', 'images', 'output', 'result', 'structuredContent', 'content']) {
    if (hasGeneratedImagePayload(value[key], depth + 1)) {
      return true;
    }
  }

  return false;
}

function sanitizeProviderMessage(message: string, apiKey: string): string {
  const normalized = message.replace(/\s+/gu, ' ').trim().slice(0, 500);
  return apiKey ? normalized.split(apiKey).join('***') : normalized;
}

function readImageProviderError(body: unknown): string {
  if (typeof body === 'string') return body;
  if (!isRecord(body)) return '';
  if (typeof body.error === 'string') return body.error;
  if (isRecord(body.error) && typeof body.error.message === 'string') return body.error.message;
  if (typeof body.message === 'string') return body.message;
  return '';
}

async function readImageApiJson(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text.trim()) return null;
  try {
    return JSON.parse(text);
  } catch {
    throw new AiImageConfigTestError('图片 API 未返回有效 JSON');
  }
}

export async function testAiImageGenerationConfig(params: {
  body: unknown;
  fallbackConfig?: Record<string, unknown> | null;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}): Promise<{ message: string }> {
  const body = isRecord(params.body) ? params.body : {};
  const fallback = isRecord(params.fallbackConfig) ? params.fallbackConfig : {};
  const baseUrl = normalizeImageTestBaseUrl(
    hasOwn(body, 'baseUrl') ? body.baseUrl : undefined,
    fallback.baseUrl,
  );
  const apiKey = hasOwn(body, 'apiKey')
    ? normalizeString(body.apiKey)
    : normalizeString(fallback.apiKey);
  const model = hasOwn(body, 'model')
    ? normalizeString(body.model) || 'gpt-image-2'
    : normalizeString(fallback.model) || 'gpt-image-2';
  const prompt = hasOwn(body, 'prompt')
    ? normalizeString(body.prompt) || AI_IMAGE_CONFIG_TEST_PROMPT
    : AI_IMAGE_CONFIG_TEST_PROMPT;
  const fetchImpl = params.fetchImpl || fetch;

  let response: Response;
  try {
    response = await fetchImpl(buildImageGenerationTestUrl(baseUrl), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
      },
      body: JSON.stringify({
        model,
        prompt,
        n: 1,
      }),
      signal: createImageConfigTestSignal(params.timeoutMs || AI_IMAGE_CONFIG_TEST_TIMEOUT_MS),
    });
  } catch (error: any) {
    if (error?.name === 'AbortError' || error?.name === 'TimeoutError') {
      throw new AiImageConfigTestError('图片 API 测试超时');
    }
    throw new AiImageConfigTestError(`图片 API 请求失败：${sanitizeProviderMessage(error?.message || String(error), apiKey)}`);
  }

  const responseBody = await readImageApiJson(response);
  if (!response.ok) {
    const providerMessage = sanitizeProviderMessage(readImageProviderError(responseBody), apiKey);
    throw new AiImageConfigTestError(
      providerMessage
        ? `图片 API 返回 ${response.status}：${providerMessage}`
        : `图片 API 返回 ${response.status}`,
    );
  }
  if (!hasGeneratedImagePayload(responseBody)) {
    throw new AiImageConfigTestError('图片 API 未返回可识别的图片数据');
  }

  return { message: '已返回图片结果' };
}

export function handleConfigApi(
  req: IncomingMessage,
  res: ServerResponse,
  options: ManagementApiOptions,
  pathname: string,
  context: ConfigProjectContext,
  handlers: ConfigApiHandlers,
): boolean {
  const activeProject = context.project;
  const activeProjectRoot = context.project.root;

  const buildConfigContext = () => {
    const requestProjectRoot = activeProjectRoot;
    const config = handlers.readProjectConfig(requestProjectRoot);
    const projectInfo = config.projectInfo && typeof config.projectInfo === 'object'
      ? {
        ...config.projectInfo,
        name: handlers.toProjectIdentity(activeProject).name,
      }
      : { name: handlers.toProjectIdentity(activeProject).name };
    const serverConfigStore = handlers.getServerConfigStoreForRequest(options);
    const serverConfig = serverConfigStore.getConfig({ activeProjectRoot: requestProjectRoot });
    return { requestProjectRoot, config, projectInfo, serverConfigStore, serverConfig };
  };

  if (pathname === '/api/config/bootstrap') {
    if (req.method !== 'GET') {
      sendJson(res, { error: 'Method not allowed' }, { status: 405 });
      return true;
    }
    const { requestProjectRoot, config, projectInfo, serverConfig } = buildConfigContext();
    sendJson(res, buildConfigBootstrapResponse({
      config,
      activeProject,
      activeProjectRoot: requestProjectRoot,
      projectInfo,
      serverConfig,
    }));
    return true;
  }

  if (pathname === '/api/config/availability') {
    if (req.method !== 'GET') {
      sendJson(res, { error: 'Method not allowed' }, { status: 405 });
      return true;
    }
    sendJson(res, {
      ideAvailability: {},
      agentAvailability: EMPTY_AGENT_AVAILABILITY,
      availabilityEnabled: false,
    });
    return true;
  }

  if (pathname === '/api/config/voice-assistant') {
    const registryHome = getRegistryHome(options);
    const settingsOptions = registryHome ? { homeDir: registryHome } : {};
    if (req.method === 'GET') {
      try {
        sendJson(res, {
          settings: maskVoiceAssistantSettings(
            readVoiceAssistantSettings(settingsOptions),
          ),
        });
      } catch (error: any) {
        sendJson(res, { error: error?.message || '读取语音助手配置失败' }, { status: 500 });
      }
      return true;
    }
    if (req.method === 'PUT') {
      readJsonBody(req).then((body) => {
        if (!isRecord(body)) throw new Error('Invalid request body');
        const patch = body.patch === undefined
          ? {}
          : isRecord(body.patch)
            ? body.patch as VoiceAssistantSettingsPatch
            : null;
        if (!patch) throw new Error('patch 必须是对象');
        let clearSecrets: VoiceAssistantSecretPath[] = [];
        if (body.clearSecrets !== undefined) {
          if (!Array.isArray(body.clearSecrets) || body.clearSecrets.some((item) => typeof item !== 'string')) {
            throw new Error('clearSecrets 必须是字符串数组');
          }
          clearSecrets = body.clearSecrets as VoiceAssistantSecretPath[];
        }
        const settings = writeVoiceAssistantSettingsPatch(patch, {
          ...settingsOptions,
          clearSecrets,
        });
        sendJson(res, { settings: maskVoiceAssistantSettings(settings) });
      }).catch((error) => {
        sendJson(res, { error: error?.message || '保存语音助手配置失败' }, { status: 400 });
      });
      return true;
    }
    sendJson(res, { error: 'Method not allowed' }, { status: 405 });
    return true;
  }

  if (pathname === '/api/config/voice-assistant/test') {
    if (req.method !== 'POST') {
      sendJson(res, { error: 'Method not allowed' }, { status: 405 });
      return true;
    }
    const registryHome = getRegistryHome(options);
    const settingsOptions = registryHome ? { homeDir: registryHome } : {};
    readJsonBody(req).then(async (body) => {
      try {
        const result = await testVoiceAssistantConfig({
          body,
          savedSettings: readVoiceAssistantSettings(settingsOptions),
        });
        sendJson(res, { success: true, message: result.message });
      } catch (error: any) {
        const statusCode = Number.isInteger(error?.statusCode) ? error.statusCode : 502;
        sendJson(res, {
          success: false,
          error: sanitizeVoiceAssistantTestError(error),
        }, { status: statusCode });
      }
    }).catch((error) => {
      sendJson(res, {
        success: false,
        error: sanitizeVoiceAssistantTestError(error),
      }, { status: 400 });
    });
    return true;
  }

  if (pathname === '/api/config/ai-image/codex-local') {
    if (req.method !== 'GET') {
      sendJson(res, { error: 'Method not allowed' }, { status: 405 });
      return true;
    }
    const registryHome = getRegistryHome(options);
    const result = resolveCodexLocalImageGenerationConfig(registryHome ? { homeDir: registryHome } : undefined);
    sendJson(res, {
      success: true,
      ready: result.ready,
      config: result.config,
      discovery: result.discovery,
      warnings: result.warnings,
    });
    return true;
  }

  if (pathname === '/api/config/ai-image/test') {
    if (req.method !== 'POST') {
      sendJson(res, { error: 'Method not allowed' }, { status: 405 });
      return true;
    }
    readJsonBody(req).then(async (body) => {
      const { serverConfig } = buildConfigContext();
      try {
        const result = await testAiImageGenerationConfig({
          body,
          fallbackConfig: serverConfig.ai?.imageGeneration,
        });
        sendJson(res, {
          success: true,
          message: result.message,
        });
      } catch (error: any) {
        sendJson(res, {
          success: false,
          error: error?.message || '图片配置测试失败',
        }, { status: error?.statusCode || 502 });
      }
    }).catch((error) => {
      sendJson(res, { error: error?.message || 'Invalid request body' }, { status: 400 });
    });
    return true;
  }

  if (pathname === '/api/config') {
    const requestProjectRoot = activeProjectRoot;
    const configPath = getConfigPath(requestProjectRoot);
    const serverConfigStore = handlers.getServerConfigStoreForRequest(options);
    if (req.method === 'POST') {
      readJsonBody(req).then((body) => {
        const nextConfig = body && typeof body === 'object' ? body : {};
        const hasProjectConfigFields = Boolean(
          nextConfig.server
          || nextConfig.projectInfo
          || nextConfig.projectDefaults,
        );
        if (nextConfig.server && typeof nextConfig.server !== 'object') {
          sendJson(res, { error: 'Invalid config format' }, { status: 400 });
          return;
        }
        if (hasProjectConfigFields && (!nextConfig.server || typeof nextConfig.server !== 'object')) {
          const currentProjectConfig = handlers.readProjectConfig(requestProjectRoot);
          nextConfig.server = currentProjectConfig.server || { host: 'localhost' };
        }
        if (nextConfig.automation || nextConfig.assistant || nextConfig.ai || nextConfig.uiPreferences || nextConfig.toolOpenState) {
          serverConfigStore.saveConfig({
            ...(nextConfig.automation && typeof nextConfig.automation === 'object'
              ? { automation: nextConfig.automation }
              : {}),
            ...(nextConfig.assistant && typeof nextConfig.assistant === 'object'
              ? { assistant: nextConfig.assistant }
              : {}),
            ...(nextConfig.ai && typeof nextConfig.ai === 'object'
              ? { ai: nextConfig.ai }
              : {}),
            ...(nextConfig.uiPreferences && typeof nextConfig.uiPreferences === 'object'
              ? { uiPreferences: nextConfig.uiPreferences }
              : {}),
            ...(nextConfig.toolOpenState && typeof nextConfig.toolOpenState === 'object'
              ? { toolOpenState: nextConfig.toolOpenState }
              : {}),
          });
        }
        if (hasProjectConfigFields) {
          const currentProjectConfig = handlers.readProjectConfig(requestProjectRoot);
          let effectiveProject = activeProject;
          const projectConfig: Record<string, unknown> = {
            ...currentProjectConfig,
            server: {
              ...nextConfig.server,
            },
          };
          if ('port' in (projectConfig.server as Record<string, unknown>)) {
            delete (projectConfig.server as Record<string, unknown>).port;
          }
          if ('allowLAN' in (projectConfig.server as Record<string, unknown>)) {
            delete (projectConfig.server as Record<string, unknown>).allowLAN;
          }
          if (nextConfig.projectInfo && typeof nextConfig.projectInfo === 'object') {
            const nextProjectName = handlers.stringValue((nextConfig.projectInfo as Record<string, unknown>).name);
            const nextProjectInfo = { ...nextConfig.projectInfo } as Record<string, unknown>;
            delete nextProjectInfo.name;
            if (Object.keys(nextProjectInfo).length > 0) {
              projectConfig.projectInfo = nextProjectInfo;
            } else {
              delete projectConfig.projectInfo;
            }
            effectiveProject = handlers.updateRegisteredProjectTitle(options, activeProject, nextProjectName);
          }
          if (nextConfig.projectDefaults && typeof nextConfig.projectDefaults === 'object') {
            projectConfig.projectDefaults = nextConfig.projectDefaults;
          }
          delete projectConfig.automation;
          delete projectConfig.assistant;
          delete projectConfig.ai;
          fs.mkdirSync(path.dirname(configPath), { recursive: true });
          fs.writeFileSync(configPath, JSON.stringify(projectConfig, null, 2), 'utf8');
          syncProjectAgentInstructions({
            projectRoot: requestProjectRoot,
            projectName: handlers.toProjectIdentity(effectiveProject).name,
            projectDescription: (projectConfig.projectInfo as Record<string, unknown> | undefined)?.description as string | undefined,
            defaultThemeName: (projectConfig.projectDefaults as Record<string, unknown> | undefined)?.defaultTheme as string | undefined,
          });
        }
        sendJson(res, {
          success: true,
          message: '配置已保存',
        });
      }).catch((error) => sendJson(res, { error: error.message }, { status: 400 }));
      return true;
    }
    const { config, projectInfo, serverConfig } = buildConfigContext();
    const availableLANHosts = getLocalNetworkHosts();
    sendJson(res, {
      ...config,
      server: normalizeProjectServerConfig(config?.server, availableLANHosts),
      availableLANHosts,
      projectInfo,
      automation: serverConfig.automation,
      assistant: serverConfig.assistant,
      ai: serverConfig.ai,
      uiPreferences: serverConfig.uiPreferences,
      toolOpenState: serverConfig.toolOpenState,
      ideAvailability: {},
      agentAvailability: EMPTY_AGENT_AVAILABILITY,
      projectPath: requestProjectRoot,
      projectId: activeProject.id,
    });
    return true;
  }

  if (pathname === '/api/version') {
    sendJson(res, { version: readMakeServerVersion(), projectId: activeProject?.id ?? null });
    return true;
  }

  if (pathname === '/api/download-dist') {
    const distDir = path.join(activeProjectRoot, 'dist');
    if (!fs.existsSync(distDir)) {
      sendJson(res, { error: 'Dist directory not found' }, { status: 404 });
      return true;
    }
    streamDirectoryAsZip(res, distDir, 'dist.zip');
    return true;
  }

  return false;
}
