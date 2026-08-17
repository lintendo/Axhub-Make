// The standalone Make package ships this runtime in vendor; keeping the import direct
// ensures the injected script and the published server always use the same artifact.
import {
  getHostAdapter,
  openEntry,
  openProject,
  openProjectAndEntry,
  type AgentSurfaceConfig,
  type HostId,
  type HostInspection,
  type OpenProjectAndEntryOptions,
  type OpenResult,
  type OpenOptions,
  type ProjectOpenResult,
} from '../../vendor/agent-surface/dist/index.js';

import {
  buildDesktopClientGracefulQuit,
  waitForDesktopClientExit,
  type DesktopClientPlatform,
  type DesktopClientProvider,
  type DesktopIntegrationInspection,
} from './desktopClientLifecycle.ts';
import { runLocalCommand } from './localCommand.ts';

export type AgentSurfaceDesktopProvider = Exclude<DesktopClientProvider, 'opencode'>;

export interface MakeAgentSurfaceConfigOptions {
  makeOrigin: string;
  projectId?: string;
}

export interface MakeAgentSurfaceProjectOpenOptions extends MakeAgentSurfaceConfigOptions {
  provider: DesktopClientProvider;
  targetPath: string;
  appPath?: string;
}

const MAKE_AGENT_SURFACE_HOSTS: Partial<Record<DesktopClientProvider, HostId>> = {
  chatgpt: 'codex',
  cursor: 'cursor',
  workbuddy: 'workbuddy',
  traework: 'traework',
  qoderwork: 'qoderwork',
};

const AXHUB_MAKE_ICON_DATA_URL = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAADAAAAAwCAYAAABXAvmHAAAACXBIWXMAAAsTAAALEwEAmpwYAAAAAXNSR0IArs4c6QAAAARnQU1BAACxjwv8YQUAAAJ+SURBVHgB7Zm7SwNBEMYnIggKYmE6FSGNWvkqFbXR8ixsRStbtbWzsdX/QBG1Ek1KKxNsLHw2PoqAil0sRFCwijcJkUN2ZmcfegbuByEHm8d+O9/Mzt6lYH22DHVMA9Q5iYC4SQTETSIgbhrBE92t7bA5uVB558g/38Lq6SE8vL2AD7wJOJ5Z0U4eme8bDT+Xhon9NfCBFwv1p7tEk68x3tFj9HkOLwJwQqZMZ4bAB14EBJlhMCX4LwLQClQEssWLMGnvlGP4nbamFnDFWcB4Ry85tnp6AMuFHXJ8vm8EXHEWMBdWFRWvnx9wVXqqvPBahQ8bOQloa2om7YMTV11HwerlaiMnAZx9csXz7+tCuHmpwAXoT3eCC04CgswgOZaPTDpPCEBcy6mTAOrPsU2I2gYrEZUHVA5JsRZQLYPNyjHVikctFYXLIwnWAriVU02W2g8QFxs5RIBOYFXVyRIRQIK/FsA1b7jSqlYZc4CKAv6WbXNnJYAL+XXp0WrM1kZWAriQc1b5DRsZC8BQo4VUcDZBuHJq29wZn8i45MWSWF7aBluwudu4PDL6jnEEXDceDhsbGQlw3XR02DR3RgJ8HQMpbJo7IwFc8+YL00UySmIugbduTuBReK8HV3pxYEo5hjm2VNgFKWIBXPOGLBf2whL5DhI4AbU848pxFLGFuOpTre+yySO6/cLERmIB0tOXlFzxjBwLfAvQ3UnjTlwU1DkZMWnuRAK4kP48fUnh2grdf0YRCRhj7GOz+jVyHpo7rQCuedNNQgeXyNLmTiuAS97qJO7BlqxGvOTOXUr3oLvan6jrf+3umwtcb4X5pXsQkkqe1MdMIiBuEgFx8wXw+uRoEo2GpgAAAABJRU5ErkJggg==';

export function resolveMakeAgentSurfaceHost(provider: DesktopClientProvider): HostId | null {
  return MAKE_AGENT_SURFACE_HOSTS[provider] ?? null;
}

export function buildMakeAgentSurfaceConfig({
  makeOrigin,
  projectId,
}: MakeAgentSurfaceConfigOptions): AgentSurfaceConfig {
  const origin = new URL(makeOrigin);
  const pageUrl = new URL('/', origin);
  const normalizedProjectId = projectId?.trim();
  if (normalizedProjectId) {
    pageUrl.searchParams.set('projectId', normalizedProjectId);
  }
  pageUrl.searchParams.set('surface', 'codex');

  const healthUrl = new URL('/api/health', origin);
  return {
    schemaVersion: 1,
    entries: [{
      id: 'axhub-make',
      name: 'Axhub Make',
      icon: { type: 'data-url', value: AXHUB_MAKE_ICON_DATA_URL },
      hosts: ['codex', 'cursor', 'workbuddy', 'traework', 'qoderwork'],
      url: pageUrl.toString(),
      healthUrl: healthUrl.toString(),
      headerActions: {
        refresh: true,
        copyUrl: true,
      },
    }],
  };
}

export async function openMakeAgentSurface({
  provider,
  makeOrigin,
  projectId,
  appPath,
  activate,
}: MakeAgentSurfaceConfigOptions & {
  provider: AgentSurfaceDesktopProvider;
  appPath?: string;
  activate?: boolean;
}): Promise<OpenResult> {
  return openEntry(buildMakeAgentSurfaceOpenOptions({ provider, makeOrigin, projectId, appPath, activate }));
}

export function buildMakeAgentSurfaceProjectOpenOptions({
  provider,
  makeOrigin,
  projectId,
  targetPath,
  appPath,
}: MakeAgentSurfaceProjectOpenOptions): OpenProjectAndEntryOptions {
  const projectProvider = provider === 'chatgpt' ? 'codex' : provider;
  const base = {
    provider: projectProvider,
    targetPath,
    ...(appPath ? { appPath } : {}),
  } satisfies OpenProjectAndEntryOptions;
  const host = resolveMakeAgentSurfaceHost(provider);
  if (!host) return base;
  return {
    ...base,
    surface: {
      entryId: 'axhub-make',
      config: buildMakeAgentSurfaceConfig({ makeOrigin, projectId }),
      activate: false,
    },
  };
}

export async function openMakeAgentSurfaceProject(
  options: MakeAgentSurfaceProjectOpenOptions,
): Promise<ProjectOpenResult> {
  return openProjectAndEntry(buildMakeAgentSurfaceProjectOpenOptions(options));
}

export async function openMakeAgentProjectOnly(
  options: MakeAgentSurfaceProjectOpenOptions,
): Promise<ProjectOpenResult> {
  const openOptions = buildMakeAgentSurfaceProjectOpenOptions(options);
  return openProject({
    provider: openOptions.provider,
    targetPath: openOptions.targetPath,
    appPath: openOptions.appPath,
  });
}

export function buildMakeAgentSurfaceOpenOptions({
  provider,
  makeOrigin,
  projectId,
  appPath,
  activate,
}: MakeAgentSurfaceConfigOptions & {
  provider: AgentSurfaceDesktopProvider;
  appPath?: string;
  activate?: boolean;
}): OpenOptions {
  const host = resolveMakeAgentSurfaceHost(provider);
  if (!host) throw new Error(`${provider} does not support Agent Surface injection.`);
  const config = buildMakeAgentSurfaceConfig({ makeOrigin, projectId });
  return {
    host,
    entryId: 'axhub-make',
    config: appPath
      ? { ...config, hosts: { ...config.hosts, [host]: { appPath } } }
      : config,
    activate: activate === true,
  };
}

function resolveDesktopPlatform(platform: NodeJS.Platform): DesktopClientPlatform {
  if (platform === 'darwin' || platform === 'win32') return platform;
  throw new Error(`Agent Surface does not support ${platform}.`);
}

export function mapMakeAgentSurfaceInspection(
  platform: DesktopClientPlatform,
  inspection: HostInspection,
): DesktopIntegrationInspection {
  const appPathRequired = inspection.code === 'configuration-required';
  return {
    platform,
    ready: Boolean(inspection.target),
    running: inspection.processRunning,
    installed: Boolean(inspection.appPath),
    integrationInstalled: true,
    appPath: inspection.appPath || '',
    ...(appPathRequired ? {
      appPathRequired: true,
      detail: inspection.message,
    } : {}),
  };
}

export async function inspectMakeAgentSurfaceHost(
  provider: AgentSurfaceDesktopProvider,
  options: {
    platform?: NodeJS.Platform;
    appPath?: string;
  } = {},
): Promise<DesktopIntegrationInspection> {
  const desktopPlatform = resolveDesktopPlatform(options.platform ?? process.platform);
  const host = resolveMakeAgentSurfaceHost(provider);
  const inspection = await getHostAdapter(host).inspect({
    platform: desktopPlatform,
    ...(options.appPath ? { config: { appPath: options.appPath } } : {}),
  });
  return mapMakeAgentSurfaceInspection(desktopPlatform, inspection);
}

export async function closeMakeAgentSurfaceHost(
  provider: AgentSurfaceDesktopProvider,
  options: {
    platform?: NodeJS.Platform;
    appPath?: string;
    wait?: (delayMs: number) => Promise<void>;
    maxAttempts?: number;
    retryDelayMs?: number;
  } = {},
): Promise<void> {
  const platform = resolveDesktopPlatform(options.platform ?? process.platform);
  const initial = await inspectMakeAgentSurfaceHost(provider, { platform, appPath: options.appPath });
  if (!initial.running) return;
  const quit = buildDesktopClientGracefulQuit(provider, platform, initial.appPath);
  await runLocalCommand(quit.command, quit.args);
  const exited = await waitForDesktopClientExit({
    isRunning: async () => (await inspectMakeAgentSurfaceHost(provider, { platform, appPath: options.appPath })).running,
    wait: options.wait ?? ((delayMs) => new Promise<void>((resolve) => setTimeout(resolve, delayMs))),
    maxAttempts: options.maxAttempts ?? 20,
    retryDelayMs: options.retryDelayMs ?? 1000,
  });
  if (!exited) {
    throw new Error('应用未能自动退出，请手动退出后重试。');
  }
}
