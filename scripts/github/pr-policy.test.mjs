import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, it } from 'node:test';

import {
  runFromEvent,
  validatePrBody,
  validatePrTitle,
  validatePullRequest,
} from './pr-policy.mjs';

const validBody = `## Summary\nAdds governance.\n\n## Motivation\nKeeps reviews consistent.\n\n## Scope\nGitHub only.\n\n## Validation\nTests pass.\n\n## Platform coverage\nNot applicable.\n\n## Risk and rollback\nRevert the PR.\n`;

function runWithTemporaryEvent(pullRequest) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'axhub-pr-policy-'));
  const eventPath = path.join(directory, 'event.json');
  const previousExitCode = process.exitCode;
  try {
    fs.writeFileSync(eventPath, JSON.stringify({ pull_request: pullRequest }));
    return runFromEvent(eventPath);
  } finally {
    process.exitCode = previousExitCode;
    fs.rmSync(directory, { force: true, recursive: true });
  }
}

describe('PR policy', () => {
  it('accepts conventional titles with optional lowercase scopes', () => {
    assert.deepEqual(validatePrTitle('feat(server-api): validate requests'), []);
    assert.deepEqual(validatePrTitle('docs: add contribution guide'), []);
  });

  it('rejects informal and malformed titles', () => {
    assert.equal(validatePrTitle('update files').length, 1);
    assert.equal(validatePrTitle('feat(Server): update files').length, 1);
  });

  it('allows an empty Draft body but validates its title', () => {
    assert.deepEqual(validatePrBody('', { draft: true }), []);
    assert.equal(validatePullRequest({ title: 'work in progress', body: '', draft: true }).length, 1);
  });

  it('requires meaningful ready-for-review sections', () => {
    assert.deepEqual(validatePrBody(validBody, { draft: false }), []);
    assert.match(validatePrBody('## Summary\n<!-- empty -->', { draft: false })[0], /Motivation|Summary/u);
    assert.match(
      validatePrBody(validBody.replace('## Platform coverage', '## Other'), { draft: false }).join('\n'),
      /Platform coverage/u,
    );
  });

  it('reads a ready pull request event with a CRLF body', () => {
    assert.deepEqual(runWithTemporaryEvent({
      title: 'ci: validate pull request event',
      body: validBody.replaceAll('\n', '\r\n'),
      draft: false,
    }), []);
  });

  it('reads a Draft pull request event without requiring a structured body', () => {
    assert.deepEqual(runWithTemporaryEvent({
      title: 'ci: validate draft pull request event',
      body: 'Work in progress.',
      draft: true,
    }), []);
  });
});
