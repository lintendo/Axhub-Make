import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

const commandPlans = Object.freeze({
  docs: [],
  server: [
    { command: 'pnpm', args: ['server:build'] },
    { command: 'pnpm', args: ['server:test'] },
  ],
  admin: [
    { command: 'pnpm', args: ['admin:build'] },
    { command: 'pnpm', args: ['exec', 'vitest', 'run', 'src/index'] },
  ],
  client: [
    { command: 'pnpm', args: ['client:typecheck'] },
    { command: 'pnpm', args: ['client:build'] },
  ],
  release: [
    { command: 'node', args: ['--test', 'scripts/release-make.test.mjs', 'scripts/release-make-mirror-gitee.test.mjs'] },
    { command: 'pnpm', args: ['build'] },
  ],
  shared: [
    { command: 'pnpm', args: ['build'] },
    { command: 'pnpm', args: ['test', '--maxWorkers=1'] },
  ],
});

export function commandsForArea(area) {
  if (!Object.hasOwn(commandPlans, area)) throw new Error(`Unsupported CI area: ${area}`);
  const plan = commandPlans[area];
  return plan.map(({ command, args }) => ({ command, args: [...args] }));
}

const resolveCommand = (command, platform) => (
  platform === 'win32' && command === 'pnpm' ? 'pnpm.cmd' : command
);

export function runAreaChecks(
  area,
  { spawn = spawnSync, platform = process.platform } = {},
) {
  const commands = [
    ...commandsForArea(area),
    { command: 'git', args: ['diff', '--exit-code', '--', '.'] },
  ];

  for (const { command, args } of commands) {
    const resolvedCommand = resolveCommand(command, platform);
    const result = spawn(resolvedCommand, args, { stdio: 'inherit', shell: false });
    if (result.error) throw result.error;
    if (result.status === 0) continue;

    const error = new Error(`${resolvedCommand} exited with status ${result.status ?? 1}`);
    error.exitCode = result.status ?? 1;
    throw error;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    if (process.argv.length !== 3) throw new Error('Usage: run-area-check.mjs <area>');
    runAreaChecks(process.argv[2]);
  } catch (error) {
    console.error(error.message);
    process.exitCode = Number.isInteger(error.exitCode) ? error.exitCode : 1;
  }
}
