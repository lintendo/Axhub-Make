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
});
