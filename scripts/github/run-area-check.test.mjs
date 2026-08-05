import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { commandsForArea, runAreaChecks } from './run-area-check.mjs';

describe('Axhub Make area checks', () => {
  it('keeps documentation changes lightweight', () => {
    assert.deepEqual(commandsForArea('docs'), []);
  });

  it('uses existing checks for each product area', () => {
    assert.deepEqual(commandsForArea('server'), [
      { command: 'pnpm', args: ['server:build'] },
      { command: 'pnpm', args: ['server:test'] },
    ]);
    assert.deepEqual(commandsForArea('client'), [
      { command: 'pnpm', args: ['client:typecheck'] },
      { command: 'pnpm', args: ['--filter', '@axhub/make-client', 'test'] },
      { command: 'pnpm', args: ['client:build'] },
    ]);
    assert.deepEqual(commandsForArea('release'), [
      { command: 'node', args: ['--test', 'scripts/release-make.test.mjs', 'scripts/release-make-mirror-gitee.test.mjs'] },
      { command: 'pnpm', args: ['build'] },
    ]);
  });

  it('never schedules publish or a real release', () => {
    for (const area of ['docs', 'server', 'admin', 'client', 'release', 'shared']) {
      const serialized = JSON.stringify(commandsForArea(area));
      assert.doesNotMatch(serialized, /publish|release:make(?=["'])/u);
    }
  });

  it('rejects an unknown matrix value instead of executing it', () => {
    assert.throws(() => commandsForArea('shell-input'), /Unsupported CI area/u);
  });

  it('uses argument arrays and verifies that checks leave no tracked diff', () => {
    const calls = [];
    runAreaChecks('docs', {
      platform: 'linux',
      spawn: (command, args, options) => {
        calls.push({ command, args, options });
        return { status: 0 };
      },
    });
    assert.deepEqual(calls, [{
      command: 'git',
      args: ['diff', '--exit-code', '--', '.'],
      options: { stdio: 'inherit', shell: false },
    }]);
  });

  it('uses pnpm.cmd on Windows and propagates a failing status', () => {
    const calls = [];
    assert.throws(
      () => runAreaChecks('server', {
        platform: 'win32',
        spawn: (command, args) => {
          calls.push({ command, args });
          return { status: 23 };
        },
      }),
      (error) => error.exitCode === 23,
    );
    assert.deepEqual(calls, [{ command: 'pnpm.cmd', args: ['server:build'] }]);
  });
});
