import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { runLocalCommand } from './localCommand.ts';

export const LEGACY_CURSOR_COMPANION_LABEL = 'im.axhub.cursor.make-companion';
export const LEGACY_CURSOR_WINDOWS_TASK_NAME = 'Axhub Make Cursor Companion';

interface LegacyCleanupFileSystem {
  access(filePath: string): Promise<void>;
  remove(filePath: string, options?: { force?: boolean; recursive?: boolean }): Promise<void>;
}

interface LegacyCleanupContext {
  platform?: NodeJS.Platform | string;
  homeDir?: string;
  env?: NodeJS.ProcessEnv | Record<string, string | undefined>;
  userId?: string;
  fileSystem?: LegacyCleanupFileSystem;
  run?: (command: string, args: string[]) => Promise<unknown>;
}

const defaultFileSystem: LegacyCleanupFileSystem = {
  access: (filePath) => fs.access(filePath),
  remove: (filePath, options) => fs.rm(filePath, options),
};

function getEnvValue(
  env: NodeJS.ProcessEnv | Record<string, string | undefined>,
  key: string,
): string | undefined {
  const direct = env[key];
  if (direct) return direct;
  const match = Object.keys(env).find((candidate) => candidate.toLowerCase() === key.toLowerCase());
  return match ? env[match] : undefined;
}

function resolveLegacyPaths(context: LegacyCleanupContext): {
  platform: 'darwin' | 'win32';
  root: string;
  service: string;
} | null {
  const platform = context.platform || process.platform;
  const homeDir = context.homeDir || os.homedir();
  const env = context.env || process.env;
  if (platform === 'darwin') {
    return {
      platform,
      root: path.posix.join(homeDir, 'Library/Application Support/Axhub Make/cursor-integration'),
      service: path.posix.join(homeDir, `Library/LaunchAgents/${LEGACY_CURSOR_COMPANION_LABEL}.plist`),
    };
  }
  if (platform === 'win32') {
    const localAppData = getEnvValue(env, 'LOCALAPPDATA')
      || path.win32.join(homeDir, 'AppData', 'Local');
    return {
      platform,
      root: path.win32.join(localAppData, 'Axhub Make', 'cursor-integration'),
      service: LEGACY_CURSOR_WINDOWS_TASK_NAME,
    };
  }
  return null;
}

async function exists(fileSystem: LegacyCleanupFileSystem, filePath: string): Promise<boolean> {
  try {
    await fileSystem.access(filePath);
    return true;
  } catch {
    return false;
  }
}

export async function removeLegacyCursorIntegration(
  context: LegacyCleanupContext = {},
): Promise<{ removed: boolean }> {
  const paths = resolveLegacyPaths(context);
  if (!paths) return { removed: false };
  const fileSystem = context.fileSystem || defaultFileSystem;
  const [rootExists, serviceExists] = await Promise.all([
    exists(fileSystem, paths.root),
    paths.platform === 'darwin' ? exists(fileSystem, paths.service) : Promise.resolve(false),
  ]);
  if (!rootExists && !serviceExists) return { removed: false };

  const run = context.run || ((command: string, args: string[]) => runLocalCommand(command, args));
  if (paths.platform === 'darwin' && serviceExists) {
    const userId = context.userId || (typeof process.getuid === 'function' ? String(process.getuid()) : '');
    if (userId) {
      await run('launchctl', ['bootout', `gui/${userId}/${LEGACY_CURSOR_COMPANION_LABEL}`]).catch(() => {});
    }
  }
  if (paths.platform === 'win32') {
    await run('schtasks.exe', ['/Delete', '/TN', LEGACY_CURSOR_WINDOWS_TASK_NAME, '/F']).catch(() => {});
  }

  await fileSystem.remove(paths.root, { recursive: true, force: true }).catch(() => {});
  if (paths.platform === 'darwin') {
    await fileSystem.remove(paths.service, { force: true }).catch(() => {});
  }
  return { removed: true };
}
