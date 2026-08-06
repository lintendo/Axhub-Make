import path from 'node:path';

export const CURSOR_INTEGRATION_LAUNCH_AGENT_LABEL = 'im.axhub.cursor.make-companion';
export const CURSOR_INTEGRATION_WINDOWS_TASK_NAME = 'Axhub Make Cursor Companion';

export interface ResolveCursorIntegrationPathsOptions {
  platform: NodeJS.Platform | string;
  homeDir: string;
  env: NodeJS.ProcessEnv | Record<string, string | undefined>;
}

interface CursorIntegrationBasePaths {
  platform: 'darwin' | 'win32';
  homeDir: string;
  installRoot: string;
  configFile: string;
  companionFile: string;
  launcherSourceFile: string;
  stdoutLog: string;
  stderrLog: string;
  cursorAppCandidates: string[];
}

export interface MacCursorIntegrationPaths extends CursorIntegrationBasePaths {
  platform: 'darwin';
  serviceFile: string;
}

export interface WindowsCursorIntegrationPaths extends CursorIntegrationBasePaths {
  platform: 'win32';
  taskXmlFile: string;
}

export type CursorIntegrationPaths = MacCursorIntegrationPaths | WindowsCursorIntegrationPaths;

function getEnvValue(
  env: NodeJS.ProcessEnv | Record<string, string | undefined>,
  key: string,
): string | undefined {
  const direct = env[key];
  if (direct) return direct;
  const match = Object.keys(env).find((candidate) => candidate.toLowerCase() === key.toLowerCase());
  return match ? env[match] : undefined;
}

export function resolveCursorIntegrationPaths(
  options: ResolveCursorIntegrationPathsOptions & { platform: 'darwin' },
): MacCursorIntegrationPaths;
export function resolveCursorIntegrationPaths(
  options: ResolveCursorIntegrationPathsOptions & { platform: 'win32' },
): WindowsCursorIntegrationPaths;
export function resolveCursorIntegrationPaths(
  options: ResolveCursorIntegrationPathsOptions,
): CursorIntegrationPaths;
export function resolveCursorIntegrationPaths({
  platform,
  homeDir,
  env,
}: ResolveCursorIntegrationPathsOptions): CursorIntegrationPaths {
  if (platform === 'darwin') {
    const installRoot = path.posix.join(
      homeDir,
      'Library/Application Support/Axhub Make/cursor-integration',
    );
    const systemApp = '/Applications/Cursor.app';
    const userApp = path.posix.join(homeDir, 'Applications/Cursor.app');
    return {
      platform,
      homeDir,
      installRoot,
      configFile: path.posix.join(installRoot, 'config.json'),
      companionFile: path.posix.join(installRoot, 'companion.mjs'),
      launcherSourceFile: path.posix.join(installRoot, 'axhub-make.cursor-launcher.js'),
      serviceFile: path.posix.join(
        homeDir,
        `Library/LaunchAgents/${CURSOR_INTEGRATION_LAUNCH_AGENT_LABEL}.plist`,
      ),
      stdoutLog: path.posix.join(installRoot, 'logs/companion.log'),
      stderrLog: path.posix.join(installRoot, 'logs/companion.error.log'),
      cursorAppCandidates: [systemApp, userApp],
    };
  }

  if (platform === 'win32') {
    const localAppData = getEnvValue(env, 'LOCALAPPDATA')
      || path.win32.join(homeDir, 'AppData', 'Local');
    const programFiles = getEnvValue(env, 'PROGRAMFILES') || String.raw`C:\Program Files`;
    const programFilesX86 = getEnvValue(env, 'PROGRAMFILES(X86)') || String.raw`C:\Program Files (x86)`;
    const installRoot = path.win32.join(localAppData, 'Axhub Make', 'cursor-integration');
    const appRoots = [
      path.win32.join(localAppData, 'Programs', 'cursor'),
      path.win32.join(programFiles, 'Cursor'),
      path.win32.join(programFilesX86, 'Cursor'),
    ];
    return {
      platform,
      homeDir,
      installRoot,
      configFile: path.win32.join(installRoot, 'config.json'),
      companionFile: path.win32.join(installRoot, 'companion.mjs'),
      launcherSourceFile: path.win32.join(installRoot, 'axhub-make.cursor-launcher.js'),
      taskXmlFile: path.win32.join(installRoot, 'scheduled-task.xml'),
      stdoutLog: path.win32.join(installRoot, 'logs', 'companion.log'),
      stderrLog: path.win32.join(installRoot, 'logs', 'companion.error.log'),
      cursorAppCandidates: appRoots.map((root) => path.win32.join(root, 'Cursor.exe')),
    };
  }

  throw new Error('The Axhub Make Cursor integration supports macOS and Windows only.');
}
