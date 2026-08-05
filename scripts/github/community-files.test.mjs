import assert from 'node:assert/strict';
import fs from 'node:fs';
import { describe, it } from 'node:test';
import { parse } from 'yaml';

const readText = (filePath) => fs.readFileSync(filePath, 'utf8');
const readYaml = (filePath) => parse(readText(filePath));
const fieldIds = (form) => form.body.map((field) => field.id).filter(Boolean);
const fieldById = (form, id) => form.body.find((field) => field.id === id);
const requiredFieldIds = (form) => form.body
  .filter((field) => field.validations?.required === true)
  .map((field) => field.id)
  .filter(Boolean);

const areaOptions = [
  'Installation or CLI',
  'Admin UI',
  'Server or API',
  'Client template',
  'Agent integration',
  'Import or export',
  'Annotation or review',
  'Documentation',
  'Release',
  'Other',
];

const checklistOptions = (form) => fieldById(form, 'checks').attributes.options
  .map(({ label, required }) => ({ label, required }));

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
    assert.deepEqual(requiredFieldIds(bug), [
      'version', 'area', 'os', 'node', 'entry', 'agent', 'reproduction', 'expected', 'actual',
    ]);
    assert.deepEqual(requiredFieldIds(feature), ['problem', 'outcome', 'area', 'proposal', 'scope']);
    assert.deepEqual(fieldById(bug, 'area').attributes.options, areaOptions);
    assert.deepEqual(fieldById(feature, 'area').attributes.options, areaOptions);
    assert.deepEqual(fieldById(bug, 'entry').attributes.options, [
      'npx',
      'Codex++ sidebar',
      'Local development',
      'Other',
    ]);
    assert.deepEqual(checklistOptions(bug), [
      { label: 'I searched existing issues for duplicates.', required: true },
      { label: 'I removed secrets and private data from this report.', required: true },
    ]);
    assert.deepEqual(checklistOptions(feature), [
      { label: 'I searched existing issues for similar requests.', required: true },
      { label: 'This request contains no secrets or private data.', required: true },
    ]);
    for (const [form, types] of [
      [bug, {
        version: 'input', area: 'dropdown', os: 'input', node: 'input', entry: 'dropdown',
        agent: 'input', reproduction: 'textarea', expected: 'textarea', actual: 'textarea',
        evidence: 'textarea', checks: 'checkboxes',
      }],
      [feature, {
        problem: 'textarea', outcome: 'textarea', area: 'dropdown', proposal: 'textarea',
        scope: 'textarea', alternatives: 'textarea', checks: 'checkboxes',
      }],
    ]) {
      for (const [id, type] of Object.entries(types)) assert.equal(fieldById(form, id).type, type);
    }
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
    const authorChecklist = template.slice(template.indexOf('## Author checklist'));
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
    for (const item of [
      'The PR has one focused goal.',
      'I reviewed the complete diff.',
      'I listed real validation evidence and remaining gaps.',
      'Cross-platform-sensitive behavior has appropriate coverage or documented risk.',
      'Vendor and generated changes include their source and generation command.',
      'Documentation is updated or explicitly not required.',
      'No token, account data, private URL, local path, cache, or runtime session is included.',
    ]) assert.ok(authorChecklist.includes(`- [ ] ${item}`));
  });

  it('publishes contribution, conduct, and security policies', () => {
    const contributing = readText('CONTRIBUTING.md');
    const conduct = readText('CODE_OF_CONDUCT.md');
    const security = readText('SECURITY.md');

    assert.match(contributing, /pnpm install --frozen-lockfile/u);
    assert.match(contributing, /npm\/npx 兼容/u);
    assert.match(contributing, /macOS、Windows、Linux/u);
    assert.match(contributing, /vendor\/ 是独立发布所需内容，必须保持提交/u);
    assert.match(contributing, /不要手工编辑无法从来源重建的产物/u);
    assert.match(contributing, /不要提交 token、账号数据、私有 URL、本地绝对路径、运行会话、缓存、coverage、dist、node_modules/u);
    assert.match(contributing, /`blocking:`.*`suggestion:`.*`question:`.*`nit:`/su);
    assert.match(conduct, /Contributor Covenant/u);
    assert.match(conduct, /lintendo@outlook\.com/u);
    assert.match(security, /https:\/\/github\.com\/lintendo\/Axhub-Make\/security\/advisories\/new/u);
    assert.match(security, /Do not open a public issue, discussion, or pull request/u);
  });

  it('links community policies and declares repository metadata', () => {
    const readme = readText('README.md');
    const packageJson = JSON.parse(readText('package.json'));

    assert.match(readme, /CONTRIBUTING\.md/u);
    assert.match(readme, /SECURITY\.md/u);
    assert.match(readme, /Apache License 2\.0/u);
    assert.equal(packageJson.private, true);
    assert.equal(packageJson.license, 'Apache-2.0');
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
