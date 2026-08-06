import {
  CODEX_INTEGRATION_LAUNCH_AGENT_LABEL,
  CODEX_INTEGRATION_WINDOWS_TASK_NAME,
  type CodexIntegrationPaths,
} from './paths.ts';

export interface CommandResult {
  stdout: string;
  stderr: string;
}

export type CommandRunner = (command: string, args: string[]) => Promise<CommandResult>;

function escapeXml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

export function quoteWindowsCommandLineArgument(value: string): string {
  if (value.length > 0 && !/[\s"]/u.test(value)) return value;
  let quoted = '"';
  let backslashes = 0;
  for (const character of value) {
    if (character === '\\') {
      backslashes += 1;
      continue;
    }
    if (character === '"') {
      quoted += `${'\\'.repeat(backslashes * 2 + 1)}"`;
      backslashes = 0;
      continue;
    }
    quoted += `${'\\'.repeat(backslashes)}${character}`;
    backslashes = 0;
  }
  return `${quoted}${'\\'.repeat(backslashes * 2)}"`;
}

export interface LaunchAgentPlistOptions {
  nodePath: string;
  companionPath: string;
  configPath: string;
  stdoutLog: string;
  stderrLog: string;
}

export function createLaunchAgentPlist(options: LaunchAgentPlistOptions): string {
  const argumentsXml = [options.nodePath, options.companionPath, '--config', options.configPath]
    .map((argument) => `    <string>${escapeXml(argument)}</string>`)
    .join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>${CODEX_INTEGRATION_LAUNCH_AGENT_LABEL}</string>
  <key>ProgramArguments</key>
  <array>
${argumentsXml}
  </array>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <true/>
  <key>ProcessType</key>
  <string>Background</string>
  <key>StandardOutPath</key>
  <string>${escapeXml(options.stdoutLog)}</string>
  <key>StandardErrorPath</key>
  <string>${escapeXml(options.stderrLog)}</string>
</dict>
</plist>
`;
}

export interface WindowsTaskXmlOptions {
  userSid: string;
  nodePath: string;
  companionPath: string;
  configPath: string;
  workingDirectory: string;
}

export function createWindowsTaskXml(options: WindowsTaskXmlOptions): string {
  const argumentsValue = [
    quoteWindowsCommandLineArgument(options.companionPath),
    '--config',
    quoteWindowsCommandLineArgument(options.configPath),
  ].join(' ');
  return `<?xml version="1.0" encoding="UTF-8"?>
<Task version="1.4" xmlns="http://schemas.microsoft.com/windows/2004/02/mit/task">
  <RegistrationInfo>
    <Author>Axhub</Author>
    <Description>Starts the Axhub Make companion for the Codex++ sidebar entry.</Description>
  </RegistrationInfo>
  <Triggers>
    <LogonTrigger>
      <Enabled>true</Enabled>
      <UserId>${escapeXml(options.userSid)}</UserId>
    </LogonTrigger>
  </Triggers>
  <Principals>
    <Principal id="Author">
      <UserId>${escapeXml(options.userSid)}</UserId>
      <LogonType>InteractiveToken</LogonType>
      <RunLevel>LeastPrivilege</RunLevel>
    </Principal>
  </Principals>
  <Settings>
    <MultipleInstancesPolicy>IgnoreNew</MultipleInstancesPolicy>
    <DisallowStartIfOnBatteries>false</DisallowStartIfOnBatteries>
    <StopIfGoingOnBatteries>false</StopIfGoingOnBatteries>
    <AllowHardTerminate>true</AllowHardTerminate>
    <StartWhenAvailable>true</StartWhenAvailable>
    <RunOnlyIfNetworkAvailable>false</RunOnlyIfNetworkAvailable>
    <AllowStartOnDemand>true</AllowStartOnDemand>
    <Enabled>true</Enabled>
    <Hidden>true</Hidden>
    <RunOnlyIfIdle>false</RunOnlyIfIdle>
    <WakeToRun>false</WakeToRun>
    <ExecutionTimeLimit>PT0S</ExecutionTimeLimit>
    <Priority>7</Priority>
  </Settings>
  <Actions Context="Author">
    <Exec>
      <Command>${escapeXml(options.nodePath)}</Command>
      <Arguments>${escapeXml(argumentsValue)}</Arguments>
      <WorkingDirectory>${escapeXml(options.workingDirectory)}</WorkingDirectory>
    </Exec>
  </Actions>
</Task>
`;
}

export interface BackgroundServiceOptions {
  paths: CodexIntegrationPaths;
  run: CommandRunner;
  uid?: number;
  wait?: (delayMs: number) => Promise<void>;
}

async function ignoreFailure(operation: () => Promise<unknown>): Promise<void> {
  try {
    await operation();
  } catch {
    // Missing or stopped prior registrations are the normal idempotent-install case.
  }
}

async function bootstrapLaunchAgent(
  domain: string,
  serviceFile: string,
  run: CommandRunner,
  wait: (delayMs: number) => Promise<void>,
): Promise<void> {
  let lastError: unknown;
  for (let attempt = 0; attempt < 10; attempt += 1) {
    try {
      await run('launchctl', ['bootstrap', domain, serviceFile]);
      return;
    } catch (error) {
      lastError = error;
      if (attempt < 9) await wait(100);
    }
  }
  throw lastError;
}

export async function registerBackgroundService({
  paths,
  run,
  uid,
  wait = (delayMs) => new Promise((resolve) => setTimeout(resolve, delayMs)),
}: BackgroundServiceOptions): Promise<void> {
  if (paths.platform === 'darwin') {
    if (!Number.isInteger(uid) || Number(uid) < 0) {
      throw new Error('A current-user uid is required to register the macOS LaunchAgent.');
    }
    const domain = `gui/${uid}`;
    const target = `${domain}/${CODEX_INTEGRATION_LAUNCH_AGENT_LABEL}`;
    try {
      await run('launchctl', ['print', target]);
      await run('launchctl', ['bootout', target]);
    } catch {
      // The service is not loaded yet.
    }
    await bootstrapLaunchAgent(domain, paths.serviceFile, run, wait);
    await run('launchctl', ['kickstart', '-k', target]);
    return;
  }

  await ignoreFailure(() => run('schtasks.exe', [
    '/End', '/TN', CODEX_INTEGRATION_WINDOWS_TASK_NAME,
  ]));
  await ignoreFailure(() => run('schtasks.exe', [
    '/Delete', '/TN', CODEX_INTEGRATION_WINDOWS_TASK_NAME, '/F',
  ]));
  await run('schtasks.exe', [
    '/Create', '/TN', CODEX_INTEGRATION_WINDOWS_TASK_NAME, '/XML', paths.taskXmlFile, '/F',
  ]);
  await run('schtasks.exe', ['/Run', '/TN', CODEX_INTEGRATION_WINDOWS_TASK_NAME]);
}

export async function unregisterBackgroundService({
  paths,
  run,
  uid,
}: BackgroundServiceOptions): Promise<void> {
  if (paths.platform === 'darwin') {
    if (!Number.isInteger(uid) || Number(uid) < 0) {
      throw new Error('A current-user uid is required to unregister the macOS LaunchAgent.');
    }
    await ignoreFailure(() => run('launchctl', [
      'bootout', `gui/${uid}/${CODEX_INTEGRATION_LAUNCH_AGENT_LABEL}`,
    ]));
    return;
  }

  await ignoreFailure(() => run('schtasks.exe', [
    '/End', '/TN', CODEX_INTEGRATION_WINDOWS_TASK_NAME,
  ]));
  await ignoreFailure(() => run('schtasks.exe', [
    '/Delete', '/TN', CODEX_INTEGRATION_WINDOWS_TASK_NAME, '/F',
  ]));
}
