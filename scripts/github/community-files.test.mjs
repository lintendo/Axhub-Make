import assert from 'node:assert/strict';
import fs from 'node:fs';
import { describe, it } from 'node:test';
import { parse } from 'yaml';

const readText = (filePath) => fs.readFileSync(filePath, 'utf8');
const readYaml = (filePath) => parse(readText(filePath));
const fieldIds = (form) => form.body.map((field) => field.id).filter(Boolean);

describe('GitHub community files', () => {
  it('defines structured bug and feature forms', () => {
    const bug = readYaml('.github/ISSUE_TEMPLATE/bug.yml');
    const feature = readYaml('.github/ISSUE_TEMPLATE/feature.yml');

    assert.deepEqual(bug.labels, ['bug', 'status: needs-triage']);
    assert.deepEqual(feature.labels, ['enhancement', 'status: needs-triage']);
    assert.deepEqual(
      fieldIds(bug),
      ['version', 'area', 'os', 'node', 'entry', 'agent', 'reproduction', 'expected', 'actual', 'evidence', 'checks'],
    );
    assert.deepEqual(
      fieldIds(feature),
      ['problem', 'outcome', 'area', 'proposal', 'scope', 'alternatives', 'checks'],
    );
  });

  it('disables blank issues and links support and private security reporting', () => {
    const config = readYaml('.github/ISSUE_TEMPLATE/config.yml');
    assert.equal(config.blank_issues_enabled, false);
    assert.deepEqual(
      config.contact_links.map((link) => link.url),
      [
        'https://github.com/lintendo/Axhub-Make/blob/main/docs/faq.md',
        'https://github.com/lintendo/Axhub-Make/security/advisories/new',
      ],
    );
  });

  it('requires PR evidence without requiring a related issue', () => {
    const template = readText('.github/PULL_REQUEST_TEMPLATE.md');
    for (const heading of [
      '## Summary',
      '## Motivation',
      '## Scope',
      '## Validation',
      '## Platform coverage',
      '## Risk and rollback',
      '## Vendor and release impact',
      '## Visual evidence',
      '## Documentation impact',
      '## Related issue',
      '## Author checklist',
    ]) assert.match(template, new RegExp(`^${heading}$`, 'mu'));
    assert.match(template, /Related issue[\s\S]*Optional/u);
    assert.match(template, /- \[ \]/u);
  });

  it('publishes contribution, conduct, and security policies', () => {
    const contributing = readText('CONTRIBUTING.md');
    const conduct = readText('CODE_OF_CONDUCT.md');
    const security = readText('SECURITY.md');

    assert.match(contributing, /pnpm install/u);
    assert.match(contributing, /pull request/iu);
    assert.match(contributing, /vendor\//u);
    assert.match(conduct, /Contributor Covenant/u);
    assert.match(conduct, /lintendo@outlook\.com/u);
    assert.match(security, /security\/advisories\/new/u);
    assert.match(security, /not.*public issue/iu);
  });

  it('links community policies and declares repository metadata', () => {
    const readme = readText('README.md');
    const packageJson = JSON.parse(readText('package.json'));

    assert.match(readme, /CONTRIBUTING\.md/u);
    assert.match(readme, /SECURITY\.md/u);
    assert.match(readme, /MIT License/u);
    assert.equal(packageJson.private, true);
    assert.equal(packageJson.license, 'MIT');
    assert.deepEqual(packageJson.repository, {
      type: 'git',
      url: 'git+https://github.com/lintendo/Axhub-Make.git',
    });
    assert.deepEqual(packageJson.bugs, {
      url: 'https://github.com/lintendo/Axhub-Make/issues',
    });
    assert.equal(packageJson.homepage, 'https://github.com/lintendo/Axhub-Make#readme');
  });
});
