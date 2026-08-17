export type DesktopClientProvider = 'chatgpt' | 'cursor' | 'opencode' | 'workbuddy' | 'traework' | 'qoderwork';
export type DesktopClientPlatform = 'darwin' | 'win32';

export interface DesktopClientCommandSpec {
  command: string;
  args: string[];
}

export interface DesktopIntegrationInspection {
  platform: DesktopClientPlatform;
  ready: boolean;
  recoverable?: boolean;
  running: boolean;
  installed: boolean;
  integrationInstalled: boolean;
  appPath: string;
  appPathRequired?: boolean;
  detail?: string;
}

export function buildDesktopClientProcessProbe(
  provider: DesktopClientProvider,
  platform: DesktopClientPlatform,
): DesktopClientCommandSpec {
  if (platform === 'darwin') {
    const processPatterns: Record<DesktopClientProvider, string> = {
      chatgpt: 'ChatGPT|Codex',
      cursor: 'Cursor',
      opencode: '/Applications/OpenCode.app/Contents/MacOS/OpenCode',
      workbuddy: '/Applications/WorkBuddy.app/Contents/MacOS/Electron',
      traework: '/Applications/TRAE SOLO(?: CN)?.app/Contents/MacOS/Electron',
      qoderwork: '/Applications/QoderWork(?: CN)?.app/Contents/MacOS/QoderWork(?: CN)?',
    };
    return {
      command: 'pgrep',
      args: provider === 'chatgpt' || provider === 'cursor'
        ? ['-x', processPatterns[provider]]
        : ['-f', processPatterns[provider]],
    };
  }
  const windowsImageNames: Record<Exclude<DesktopClientProvider, 'chatgpt' | 'traework'>, string> = {
    cursor: 'Cursor.exe',
    opencode: 'OpenCode.exe',
    workbuddy: 'WorkBuddy.exe',
    qoderwork: 'QoderWork.exe',
  };
  if (provider !== 'chatgpt' && provider !== 'traework') {
    return {
      command: 'tasklist.exe',
      args: ['/FI', `IMAGENAME eq ${windowsImageNames[provider]}`, '/NH'],
    };
  }
  const processNames = provider === 'chatgpt'
    ? "'ChatGPT','Codex'"
    : "'TRAE SOLO','TRAE SOLO CN'";
  return {
    command: 'powershell.exe',
    args: [
      '-NoProfile',
      '-NonInteractive',
      '-Command',
      `Get-Process -Name ${processNames} -ErrorAction SilentlyContinue | Select-Object -ExpandProperty ProcessName`,
    ],
  };
}

export function buildDesktopClientGracefulQuit(
  provider: DesktopClientProvider,
  platform: DesktopClientPlatform,
  appPath?: string,
): DesktopClientCommandSpec {
  if (platform === 'darwin') {
    const applicationNames: Record<Exclude<DesktopClientProvider, 'chatgpt' | 'traework'>, string> = {
      cursor: 'Cursor',
      opencode: 'OpenCode',
      workbuddy: 'WorkBuddy',
      qoderwork: 'QoderWork',
    };
    if (provider === 'chatgpt') {
      return { command: 'osascript', args: ['-e', 'tell application id "com.openai.codex" to quit'] };
    }
    const applicationName = provider === 'traework'
      ? appPath?.includes('/TRAE SOLO CN.app/') ? 'TRAE SOLO CN' : 'TRAE SOLO'
      : applicationNames[provider];
    return { command: 'osascript', args: ['-e', `tell application "${applicationName}" to quit`] };
  }
  const processNames: Record<DesktopClientProvider, string> = {
    chatgpt: "'ChatGPT','Codex'",
    cursor: "'Cursor'",
    opencode: "'OpenCode'",
    workbuddy: "'WorkBuddy'",
    traework: "'TRAE SOLO','TRAE SOLO CN'",
    qoderwork: "'QoderWork','QoderWork CN'",
  };
  return {
    command: 'powershell.exe',
    args: [
      '-NoProfile',
      '-NonInteractive',
      '-Command',
      `$items = Get-Process -Name ${processNames[provider]} -ErrorAction SilentlyContinue; $items | ForEach-Object { $_.CloseMainWindow() | Out-Null }`,
    ],
  };
}

export async function waitForDesktopClientExit({
  isRunning,
  wait,
  maxAttempts,
  retryDelayMs,
}: {
  isRunning: () => Promise<boolean>;
  wait: (delayMs: number) => Promise<void>;
  maxAttempts: number;
  retryDelayMs: number;
}): Promise<boolean> {
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    if (!await isRunning()) return true;
    if (attempt + 1 < maxAttempts) await wait(retryDelayMs);
  }
  return false;
}
