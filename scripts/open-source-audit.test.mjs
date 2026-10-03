import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';

import {
  findForbiddenPathFindings,
  findSensitiveTextFindings,
} from './open-source-audit.mjs';

describe('open-source audit', () => {
  it('rejects development output and disallowed Make metadata', () => {
    const findings = findForbiddenPathFindings([
      'docs/superpowers/plans/release.md',
      'midscene_run/report.html',
      'client/src/resources/example.assets/.sessions/run.json',
      'client/.axhub/make/sessions/private.json',
      'client/.axhub/make/client.json',
    ]);

    assert.deepEqual(
      findings.map((finding) => finding.path),
      [
        'docs/superpowers/plans/release.md',
        'midscene_run/report.html',
        'client/src/resources/example.assets/.sessions/run.json',
        'client/.axhub/make/sessions/private.json',
      ],
    );
  });

  it('detects machine paths, known local identity, and credential shapes', () => {
    const localPath = ['', 'Users', 'private-user', 'project'].join('/');
    const volumePath = ['', 'Volumes', 'PrivateDisk', 'project'].join('/');
    const githubToken = ['ghp', 'A'.repeat(36)].join('_');
    const knownIdentity = ['jian', 'zhoulin'].join('');
    const findings = findSensitiveTextFindings(
      'fixture.txt',
      [localPath, volumePath, githubToken, knownIdentity].join('\n'),
    );

    assert.deepEqual(
      new Set(findings.map((finding) => finding.rule)),
      new Set(['posix-home-path', 'mac-volume-path', 'github-token', 'known-local-identity']),
    );
  });

  it('does not treat a project directory named home as an operating-system home path', () => {
    const findings = findSensitiveTextFindings(
      'fixture.txt',
      'src/prototypes/home/index.tsx',
    );

    assert.equal(findings.some((finding) => finding.rule === 'posix-home-path'), false);
  });

  it('allows only synthetic home paths in test fixtures', () => {
    const macDemo = ['', 'Users', 'demo', 'project'].join('/');
    const linuxTester = ['', 'home', 'tester', 'project'].join('/');
    const windowsDemo = ['C:', 'Users', 'demo', 'project'].join('\\');
    const realUser = ['', 'Users', 'private-user', 'project'].join('/');

    assert.deepEqual(findSensitiveTextFindings('fixture.test.ts', [macDemo, linuxTester, windowsDemo].join('\n')), []);
    assert.equal(findSensitiveTextFindings('fixture.ts', macDemo).length, 1);
    assert.equal(findSensitiveTextFindings('fixture.test.ts', realUser).length, 1);
    assert.equal(findSensitiveTextFindings('fixture.test.ts', `${macDemo} ${realUser}`).length, 1);
  });

  it('keeps Gitleaks defaults enabled with narrow false-positive allowlists', () => {
    const config = fs.readFileSync(path.resolve('.gitleaks.toml'), 'utf8');

    assert.match(config, /useDefault\s*=\s*true/u);
    assert.match(config, /targetRules\s*=\s*\["gcp-api-key"\]/u);
    assert.match(config, /vendor\/axhub-excalidraw\/dist/u);
    assert.match(config, /targetRules\s*=\s*\["generic-api-key"\]/u);
    assert.match(config, /src\/server\/__tests__/u);
    assert.doesNotMatch(config, /commits\s*=|stopwords\s*=/u);
  });
});
