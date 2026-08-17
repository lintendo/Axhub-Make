export const NPM_OFFICIAL_REGISTRY = {
  id: 'npmjs' as const,
  label: 'npm official',
  url: 'https://registry.npmjs.org',
};

export const NPM_MIRROR_REGISTRY = {
  id: 'npmmirror' as const,
  label: 'npmmirror',
  url: 'https://registry.npmmirror.com',
};

const PUBLIC_NPM_REGISTRIES = [NPM_OFFICIAL_REGISTRY, NPM_MIRROR_REGISTRY] as const;
const DEFAULT_PROBE_TIMEOUT_MS = 2_000;
const DEFAULT_CONFIG_TIMEOUT_MS = 5_000;
const CLOSE_TO_OFFICIAL_THRESHOLD_MS = 150;

export interface RegistryProbePackage {
  name: string;
  version?: string;
}

export interface NpmRegistryProbeResult {
  id: 'npmjs' | 'npmmirror';
  label: string;
  url: string;
  ok: boolean;
  durationMs: number;
  error?: string;
}

export interface AutomaticRegistryRoute {
  mode: 'automatic';
  reason: 'faster' | 'close-to-official' | 'only-available' | 'probe-fallback';
  selected: typeof NPM_OFFICIAL_REGISTRY | typeof NPM_MIRROR_REGISTRY;
  alternate: typeof NPM_OFFICIAL_REGISTRY | typeof NPM_MIRROR_REGISTRY;
  probes: NpmRegistryProbeResult[];
}

export interface ConfiguredRegistryRoute {
  mode: 'configured';
  reason: 'environment-configured' | 'npm-configured' | 'scoped-npm-configured' | 'config-unavailable';
  probes: [];
}

export type MakeClientRegistryRoute = AutomaticRegistryRoute | ConfiguredRegistryRoute;

type RegistryCommandRunner = (
  command: string,
  args: string[],
  options: { cwd: string; timeoutMs?: number },
) => Promise<{ stdout?: unknown }>;

type RegistryProbe = (
  registry: typeof NPM_OFFICIAL_REGISTRY | typeof NPM_MIRROR_REGISTRY,
  packages: RegistryProbePackage[],
  timeoutMs?: number,
) => Promise<NpmRegistryProbeResult>;

function stringValue(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizedRegistryUrl(value: unknown): string {
  const normalized = stringValue(value).replace(/\/+$/u, '');
  return /^(?:null|undefined)$/iu.test(normalized) ? '' : normalized;
}

function minimumVersion(specifier: unknown): string | undefined {
  const normalized = stringValue(specifier);
  const match = normalized.match(/^(?:[~^]|>=?\s*)?(\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?)$/u);
  return match?.[1];
}

function findExplicitRegistryConfiguration(configList: unknown): { registry: boolean; scopedRegistry: boolean } {
  let section = 'default';
  let registry = false;
  let scopedRegistry = false;
  for (const rawLine of stringValue(configList).split(/\r?\n/gu)) {
    const line = rawLine.trim();
    const sectionMatch = line.match(/^;\s*"([^"]+)"\s+config\s+from\b/iu);
    if (sectionMatch) {
      section = sectionMatch[1].toLowerCase();
      continue;
    }
    if (!line || line.startsWith(';') || line.startsWith('#') || section === 'default') {
      continue;
    }
    const separatorIndex = line.indexOf('=');
    const key = (separatorIndex >= 0 ? line.slice(0, separatorIndex) : line).trim().toLowerCase();
    if (key === 'registry') {
      registry = true;
    } else if (key === '@axhub:registry') {
      scopedRegistry = true;
    }
  }
  return { registry, scopedRegistry };
}

export function deriveRegistryProbePackages(packageJson: unknown): RegistryProbePackage[] {
  const record = packageJson && typeof packageJson === 'object' && !Array.isArray(packageJson)
    ? packageJson as Record<string, unknown>
    : {};
  const dependencies = record.dependencies && typeof record.dependencies === 'object' && !Array.isArray(record.dependencies)
    ? record.dependencies as Record<string, unknown>
    : {};
  const devDependencies = record.devDependencies && typeof record.devDependencies === 'object' && !Array.isArray(record.devDependencies)
    ? record.devDependencies as Record<string, unknown>
    : {};
  return ['@axhub/annotation', 'vite']
    .filter((name) => name in dependencies || name in devDependencies)
    .map((name) => {
      const version = minimumVersion(dependencies[name] ?? devDependencies[name]);
      return { name, ...(version ? { version } : {}) };
    });
}

export function chooseNpmRegistry(
  probes: NpmRegistryProbeResult[],
  closeThresholdMs = CLOSE_TO_OFFICIAL_THRESHOLD_MS,
): Omit<AutomaticRegistryRoute, 'mode' | 'probes'> {
  const successful = probes
    .filter((probe) => probe.ok)
    .sort((left, right) => left.durationMs - right.durationMs);
  if (successful.length === 0) {
    return {
      alternate: NPM_MIRROR_REGISTRY,
      reason: 'probe-fallback',
      selected: NPM_OFFICIAL_REGISTRY,
    };
  }
  if (successful.length === 1) {
    const selected = successful[0].id === 'npmmirror' ? NPM_MIRROR_REGISTRY : NPM_OFFICIAL_REGISTRY;
    const alternate = selected.id === 'npmmirror' ? NPM_OFFICIAL_REGISTRY : NPM_MIRROR_REGISTRY;
    return { alternate, reason: 'only-available', selected };
  }

  const fastest = successful[0];
  const npmjs = successful.find((probe) => probe.id === 'npmjs');
  if (npmjs && fastest.id !== 'npmjs' && npmjs.durationMs - fastest.durationMs <= closeThresholdMs) {
    return {
      alternate: NPM_MIRROR_REGISTRY,
      reason: 'close-to-official',
      selected: NPM_OFFICIAL_REGISTRY,
    };
  }
  const selected = fastest.id === 'npmmirror' ? NPM_MIRROR_REGISTRY : NPM_OFFICIAL_REGISTRY;
  const alternate = selected.id === 'npmmirror' ? NPM_OFFICIAL_REGISTRY : NPM_MIRROR_REGISTRY;
  return { alternate, reason: 'faster', selected };
}

function packageProbeUrl(registryUrl: string, probePackage: RegistryProbePackage): string {
  const packagePath = encodeURIComponent(probePackage.name);
  return probePackage.version
    ? `${registryUrl}/${packagePath}/${encodeURIComponent(probePackage.version)}`
    : `${registryUrl}/${packagePath}`;
}

export async function probeNpmRegistry(
  registry: typeof NPM_OFFICIAL_REGISTRY | typeof NPM_MIRROR_REGISTRY,
  packages: RegistryProbePackage[],
  options: { fetchImpl?: typeof fetch; timeoutMs?: number } = {},
): Promise<NpmRegistryProbeResult> {
  const fetchImpl = options.fetchImpl || fetch;
  const timeoutMs = options.timeoutMs ?? DEFAULT_PROBE_TIMEOUT_MS;
  const startedAt = Date.now();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const urls = [
      `${registry.url}/-/ping`,
      ...packages.map((probePackage) => packageProbeUrl(registry.url, probePackage)),
    ];
    const responses = await Promise.all(urls.map((url) => fetchImpl(url, {
      headers: { accept: 'application/json' },
      signal: controller.signal,
    })));
    for (let index = 0; index < responses.length; index += 1) {
      const response = responses[index];
      if (!response.ok) {
        throw new Error(`HTTP ${response.status} for ${urls[index]}`);
      }
    }
    const packageResponses = responses.slice(1);
    for (let index = 0; index < packageResponses.length; index += 1) {
      const expectedVersion = packages[index]?.version;
      if (!expectedVersion) continue;
      const metadata = await packageResponses[index].json() as { version?: unknown };
      if (metadata.version !== expectedVersion) {
        throw new Error(`${packages[index].name}@${expectedVersion} is unavailable`);
      }
    }
    return {
      ...registry,
      durationMs: Date.now() - startedAt,
      ok: true,
    };
  } catch (error) {
    return {
      ...registry,
      durationMs: Date.now() - startedAt,
      error: error instanceof Error ? error.message : String(error),
      ok: false,
    };
  } finally {
    clearTimeout(timeout);
  }
}

export async function resolveMakeClientRegistryRoute(options: {
  cwd: string;
  env?: NodeJS.ProcessEnv;
  npmCommand: string;
  probePackages: RegistryProbePackage[];
  probeRegistry?: RegistryProbe;
  probeTimeoutMs?: number;
  runCommand: RegistryCommandRunner;
}): Promise<MakeClientRegistryRoute> {
  const env = options.env || process.env;
  const environmentRegistry = normalizedRegistryUrl(env.NPM_CONFIG_REGISTRY || env.npm_config_registry);
  if (environmentRegistry && environmentRegistry !== NPM_OFFICIAL_REGISTRY.url) {
    return { mode: 'configured', probes: [], reason: 'environment-configured' };
  }

  let effectiveRegistry: string;
  let explicitRegistry = { registry: false, scopedRegistry: false };
  try {
    const [result, configListResult] = await Promise.all([
      options.runCommand(options.npmCommand, ['config', 'get', 'registry'], {
        cwd: options.cwd,
        timeoutMs: DEFAULT_CONFIG_TIMEOUT_MS,
      }),
      options.runCommand(options.npmCommand, ['config', 'ls', '-l'], {
        cwd: options.cwd,
        timeoutMs: DEFAULT_CONFIG_TIMEOUT_MS,
      }),
    ]);
    effectiveRegistry = normalizedRegistryUrl(result.stdout);
    explicitRegistry = findExplicitRegistryConfiguration(configListResult.stdout);
  } catch {
    return { mode: 'configured', probes: [], reason: 'config-unavailable' };
  }
  if (!effectiveRegistry) {
    return { mode: 'configured', probes: [], reason: 'config-unavailable' };
  }
  if (effectiveRegistry !== NPM_OFFICIAL_REGISTRY.url) {
    return { mode: 'configured', probes: [], reason: 'npm-configured' };
  }
  if (explicitRegistry.scopedRegistry) {
    return { mode: 'configured', probes: [], reason: 'scoped-npm-configured' };
  }
  if (explicitRegistry.registry) {
    return { mode: 'configured', probes: [], reason: 'npm-configured' };
  }

  const probeRegistry = options.probeRegistry || ((registry, packages, timeoutMs) => (
    probeNpmRegistry(registry, packages, { timeoutMs })
  ));
  const probes = await Promise.all(PUBLIC_NPM_REGISTRIES.map((registry) => (
    probeRegistry(registry, options.probePackages, options.probeTimeoutMs ?? DEFAULT_PROBE_TIMEOUT_MS)
  )));
  return {
    mode: 'automatic',
    probes,
    ...chooseNpmRegistry(probes),
  };
}

export function registryInstallArgs(args: string[], registryUrl?: string): string[] {
  return registryUrl ? [...args, `--registry=${registryUrl}`] : [...args];
}

export function isRetryableRegistryError(error: unknown): boolean {
  const looseError = error as {
    cause?: unknown;
    code?: unknown;
    details?: unknown;
    message?: unknown;
    stderr?: unknown;
    stdout?: unknown;
  } | null;
  const text = [
    looseError?.code,
    looseError?.message,
    looseError?.stderr,
    looseError?.stdout,
    looseError?.details && JSON.stringify(looseError.details),
    looseError?.cause,
  ]
    .map((value) => String(value || ''))
    .join(' ');
  return /\b(?:EAI_AGAIN|ECONNREFUSED|ECONNRESET|ENETUNREACH|ENOTFOUND|ETIMEDOUT|UND_ERR_CONNECT_TIMEOUT)\b/iu.test(text)
    || /\bE(?:404|408|429|5\d{2})\b/iu.test(text)
    || /\bHTTP\s+(?:404|408|429|5\d{2})\b/iu.test(text)
    || /\bEINTEGRITY\b/iu.test(text);
}
