export type DesktopClientProvider = 'chatgpt' | 'cursor';
export type DesktopClientPlatform = 'darwin' | 'win32';

export interface DesktopClientCommandSpec {
  command: string;
  args: string[];
}

export interface DesktopIntegrationInspection {
  platform: DesktopClientPlatform;
  ready: boolean;
  running: boolean;
  installed: boolean;
  integrationInstalled: boolean;
  appPath: string;
}

export function buildDesktopClientProcessProbe(
  provider: DesktopClientProvider,
  platform: DesktopClientPlatform,
): DesktopClientCommandSpec {
  if (platform === 'darwin') {
    return {
      command: 'pgrep',
      args: ['-x', provider === 'chatgpt' ? 'ChatGPT|Codex' : 'Cursor'],
    };
  }
  if (provider === 'cursor') {
    return {
      command: 'tasklist.exe',
      args: ['/FI', 'IMAGENAME eq Cursor.exe', '/NH'],
    };
  }
  return {
    command: 'powershell.exe',
    args: [
      '-NoProfile',
      '-NonInteractive',
      '-Command',
      "Get-Process -Name 'ChatGPT','Codex' -ErrorAction SilentlyContinue | Select-Object -ExpandProperty ProcessName",
    ],
  };
}

export function buildDesktopClientGracefulQuit(
  provider: DesktopClientProvider,
  platform: DesktopClientPlatform,
): DesktopClientCommandSpec {
  if (platform === 'darwin') {
    return provider === 'chatgpt'
      ? { command: 'osascript', args: ['-e', 'tell application id "com.openai.codex" to quit'] }
      : { command: 'osascript', args: ['-e', 'tell application "Cursor" to quit'] };
  }
  const names = provider === 'chatgpt' ? "'ChatGPT','Codex'" : "'Cursor'";
  return {
    command: 'powershell.exe',
    args: [
      '-NoProfile',
      '-NonInteractive',
      '-Command',
      `$items = Get-Process -Name ${names} -ErrorAction SilentlyContinue; $items | ForEach-Object { $_.CloseMainWindow() | Out-Null }`,
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
