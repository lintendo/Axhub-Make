import fs from 'node:fs';
import { pathToFileURL } from 'node:url';

const titlePattern = /^(?:feat|fix|docs|refactor|test|build|ci|chore|perf|revert)(?:\([a-z0-9]+(?:-[a-z0-9]+)*\))?: \S.+$/u;
const requiredSections = [
  'Summary',
  'Motivation',
  'Scope',
  'Validation',
  'Platform coverage',
  'Risk and rollback',
];

function stripComments(value) {
  return value.replace(/<!--[\s\S]*?-->/gu, '').trim();
}

function readSection(body, heading) {
  const escaped = heading.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
  const match = body.match(new RegExp(`^## ${escaped}[\\t ]*\\r?\\n([\\s\\S]*?)(?=^## |(?![\\s\\S]))`, 'mu'));
  return match ? stripComments(match[1]) : '';
}

export function validatePrTitle(title) {
  return titlePattern.test(String(title || ''))
    ? []
    : ['PR title must match type(scope): summary with a supported lowercase type and scope.'];
}

export function validatePrBody(body, { draft = false } = {}) {
  if (draft) return [];
  return requiredSections
    .filter((heading) => !readSection(String(body || ''), heading))
    .map((heading) => `PR body section "${heading}" must contain real evidence.`);
}

export function validatePullRequest(pullRequest) {
  return [
    ...validatePrTitle(pullRequest?.title),
    ...validatePrBody(pullRequest?.body, { draft: Boolean(pullRequest?.draft) }),
  ];
}

export function runFromEvent(eventPath = process.env.GITHUB_EVENT_PATH) {
  if (!eventPath) throw new Error('GITHUB_EVENT_PATH is required');
  const event = JSON.parse(fs.readFileSync(eventPath, 'utf8'));
  const errors = validatePullRequest(event.pull_request);
  for (const error of errors) console.error(`::error::${error}`);
  if (errors.length > 0) process.exitCode = 1;
  return errors;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) runFromEvent();
