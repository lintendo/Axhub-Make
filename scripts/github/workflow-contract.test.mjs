import assert from 'node:assert/strict';
import fs from 'node:fs';
import { describe, it } from 'node:test';
import { parse } from 'yaml';

const load = (path) => parse(fs.readFileSync(path, 'utf8'));

describe('GitHub workflow security contract', () => {
  it('uses read-only pull_request workflows with stable check names', () => {
    const policy = load('.github/workflows/pr-policy.yml');
    const ci = load('.github/workflows/ci.yml');
    for (const workflow of [policy, ci]) {
      assert.ok(workflow.on.pull_request);
      assert.equal(workflow.on.pull_request_target, undefined);
      assert.deepEqual(workflow.permissions, { contents: 'read' });
    }
    assert.ok(policy.on.pull_request.types.includes('converted_to_draft'));
    assert.equal(policy.jobs.policy.name, 'pr-policy');
    assert.equal(ci.jobs.required.name, 'ci-required');
  });

  it('pins every action and contains no release, publish, or secret access', () => {
    const source = [
      fs.readFileSync('.github/workflows/pr-policy.yml', 'utf8'),
      fs.readFileSync('.github/workflows/ci.yml', 'utf8'),
    ].join('\n');
    for (const uses of source.matchAll(/uses:\s*[^@\s]+@([^\s]+)/gu)) {
      assert.match(uses[1], /^[a-f0-9]{40}$/u);
    }
    assert.doesNotMatch(source, /pull_request_target|secrets\.|npm publish|pnpm publish|release:make/u);
  });

  it('keeps single-maintainer branch protection reproducible', () => {
    const protection = JSON.parse(fs.readFileSync('scripts/github/branch-protection.json', 'utf8'));
    assert.deepEqual(protection.required_status_checks.contexts, ['pr-policy', 'ci-required']);
    assert.equal(protection.required_pull_request_reviews.required_approving_review_count, 0);
    assert.equal(protection.required_conversation_resolution, true);
    assert.equal(protection.allow_force_pushes, false);
    assert.equal(protection.allow_deletions, false);
  });
});
