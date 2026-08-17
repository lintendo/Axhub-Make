import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  documentCommentHash,
  normalizeDocumentCommentPath,
  normalizePrototypeCommentTargetPath,
  prototypeCommentHash,
  resolveDocumentCommentStorage,
  resolvePrototypeCommentStorage,
} from './documentCommentsStorage';

describe('document comment storage paths', () => {
  it('normalizes project-relative document paths and produces stable hashes', () => {
    expect(normalizeDocumentCommentPath('src\\resources\\prd\\order.md')).toBe('src/resources/prd/order.md');
    expect(documentCommentHash('src/resources/prd/order.md'))
      .toBe(documentCommentHash('src/resources/prd/order.md'));
    expect(documentCommentHash('src/resources/prd/order.md'))
      .not.toBe(documentCommentHash('src/resources/prd/other.md'));
  });

  it('accepts markdown and html documents, including prototype specs', () => {
    for (const documentPath of [
      'src/resources/prd/order.md',
      'src/resources/prd/order.mdx',
      'src/resources/prd/order.html',
      'src/resources/prd/order.htm',
      'src/prototypes/order/.spec/spec.md',
      'src/prototypes/order/.spec/spec.html',
    ]) {
      expect(normalizeDocumentCommentPath(documentPath)).toBe(documentPath);
    }
  });

  it('rejects traversal, protected roots, absolute paths, and source code files', () => {
    for (const value of [
      '../secret.md',
      'src/../secret.md',
      '.axhub/make/client.json',
      '.git/config',
      'node_modules/pkg/index.md',
      '/tmp/secret.md',
      'C:\\secret.md',
      'src/resources/order.tsx',
      'src/resources/order.md\0.json',
    ]) {
      expect(normalizeDocumentCommentPath(value)).toBeNull();
    }
  });

  it('resolves deterministic comment and asset paths under the project root', () => {
    const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'axhub-document-comments-'));
    try {
      const documentPath = path.join(projectRoot, 'src/resources/order.md');
      fs.mkdirSync(path.dirname(documentPath), { recursive: true });
      fs.writeFileSync(documentPath, '# Order\n', 'utf8');

      const resolved = resolveDocumentCommentStorage(projectRoot, 'src/resources/order.md');

      expect(resolved).toMatchObject({
        documentPath: 'src/resources/order.md',
        projectRelativeCommentPath: expect.stringMatching(/^\.axhub\/make\/comments\/[a-f0-9]{64}\.json$/u),
      });
      expect(resolved?.commentFilePath).toContain(path.join('.axhub', 'make', 'comments'));
      expect(resolved?.assetDir).toContain(path.join('.axhub', 'make', 'comment-assets'));
    } finally {
      fs.rmSync(projectRoot, { recursive: true, force: true });
    }
  });

  it('rejects document and storage symlink escapes when the platform supports symlinks', () => {
    const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'axhub-document-comments-symlink-'));
    const outsideRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'axhub-document-comments-outside-'));
    try {
      const outsideDocument = path.join(outsideRoot, 'order.md');
      fs.writeFileSync(outsideDocument, '# Outside\n', 'utf8');
      fs.mkdirSync(path.join(projectRoot, 'src'), { recursive: true });
      try {
        fs.symlinkSync(outsideRoot, path.join(projectRoot, 'src/resources'), 'dir');
      } catch {
        return;
      }
      expect(resolveDocumentCommentStorage(projectRoot, 'src/resources/order.md')).toBeNull();

      fs.rmSync(path.join(projectRoot, 'src/resources'), { recursive: true, force: true });
      fs.mkdirSync(path.join(projectRoot, '.axhub'), { recursive: true });
      try {
        fs.symlinkSync(outsideRoot, path.join(projectRoot, '.axhub/make'), 'dir');
      } catch {
        return;
      }
      expect(resolveDocumentCommentStorage(projectRoot, 'src/resources/order.md')).toBeNull();
    } finally {
      fs.rmSync(projectRoot, { recursive: true, force: true });
      fs.rmSync(outsideRoot, { recursive: true, force: true });
    }
  });
});

describe('prototype comment storage paths', () => {
  it('normalizes prototype targets and uses a separate stable hash namespace', () => {
    expect(normalizePrototypeCommentTargetPath('prototypes\\home')).toBe('prototypes/home');
    expect(normalizePrototypeCommentTargetPath('/prototypes/home')).toBe('prototypes/home');
    expect(normalizePrototypeCommentTargetPath('components/home')).toBeNull();
    expect(normalizePrototypeCommentTargetPath('prototypes/../home')).toBeNull();
    expect(normalizePrototypeCommentTargetPath('prototypes/.hidden')).toBeNull();

    expect(prototypeCommentHash('prototypes/home'))
      .toBe(prototypeCommentHash('prototypes/home'));
    expect(prototypeCommentHash('prototypes/home'))
      .not.toBe(documentCommentHash('prototypes/home.md'));
  });

  it('resolves prototype comments and assets under the shared .axhub roots', () => {
    const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'axhub-prototype-comments-'));
    try {
      const prototypeDir = path.join(projectRoot, 'src/prototypes/home');
      fs.mkdirSync(prototypeDir, { recursive: true });
      fs.writeFileSync(path.join(prototypeDir, 'index.tsx'), 'export default null;\n', 'utf8');

      const resolved = resolvePrototypeCommentStorage(projectRoot, 'prototypes/home');

      expect(resolved).toMatchObject({
        prototypeId: 'home',
        targetPath: 'prototypes/home',
        projectRelativeCommentPath: expect.stringMatching(/^\.axhub\/make\/comments\/[a-f0-9]{64}\.json$/u),
        projectRelativeAssetRoot: expect.stringMatching(/^\.axhub\/make\/comment-assets\/[a-f0-9]{64}$/u),
      });
      expect(resolved?.commentFilePath).toContain(path.join('.axhub', 'make', 'comments'));
      expect(resolved?.assetDir).toContain(path.join('.axhub', 'make', 'comment-assets'));
    } finally {
      fs.rmSync(projectRoot, { recursive: true, force: true });
    }
  });
});
