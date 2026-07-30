import { describe, expect, it } from 'vitest';

import { getManualChunkName, getPackageNameFromId } from './manualChunks';

describe('getPackageNameFromId', () => {
  it('extracts scoped package names from pnpm module ids', () => {
    expect(
      getPackageNameFromId(
        '/repo/packages/excalidraw/dist/prod/index.js',
      ),
    ).toBeNull();
  });

  it('extracts unscoped package names from pnpm module ids', () => {
    expect(
      getPackageNameFromId(
        '/repo/node_modules/.pnpm/roughjs@4.6.4/node_modules/roughjs/bundled/rough.esm.js',
      ),
    ).toBe('roughjs');
  });

  it('returns null for workspace source files', () => {
    expect(getPackageNameFromId('/repo/apps/prototype-admin/src/index.tsx')).toBeNull();
  });
});

describe('getManualChunkName', () => {
  it('keeps React runtime packages together', () => {
    expect(
      getManualChunkName('/repo/node_modules/.pnpm/react-dom@18.2.0/node_modules/react-dom/index.js'),
    ).toBe('vendor-react');
  });

  it('keeps Ant Design X runtime with Ant Design to avoid spec chunk initialization cycles', () => {
    expect(
      getManualChunkName('/repo/node_modules/.pnpm/@ant-design+x@2.1.1/node_modules/@ant-design/x/es/index.js'),
    ).toBe('vendor-antd');
    expect(
      getManualChunkName('/repo/node_modules/.pnpm/@ant-design+x-markdown@2.1.1/node_modules/@ant-design/x-markdown/es/index.js'),
    ).toBe('vendor-antd');
  });

  it('routes HTML parsing and highlighting packages into the spec-template vendor chunk', () => {
    expect(
      getManualChunkName('/repo/node_modules/.pnpm/highlight.js@10.7.3/node_modules/highlight.js/es/index.js'),
    ).toBe('spec-template-vendor');
    expect(
      getManualChunkName('/repo/node_modules/.pnpm/html-react-parser@5.2.11/node_modules/html-react-parser/esm/index.mjs'),
    ).toBe('spec-template-vendor');
    expect(
      getManualChunkName('/repo/node_modules/.pnpm/html-dom-parser@5.1.2/node_modules/html-dom-parser/esm/index.mjs'),
    ).toBe('spec-template-vendor');
    expect(
      getManualChunkName('/repo/node_modules/.pnpm/htmlparser2@10.0.0/node_modules/htmlparser2/dist/esm/index.js'),
    ).toBe('spec-template-vendor');
  });

  it('keeps shared katex runtime in vendor-common so the homepage does not pull spec-template css', () => {
    expect(
      getManualChunkName('/repo/node_modules/.pnpm/katex@0.16.22/node_modules/katex/dist/katex.mjs'),
    ).toBe('vendor-common');
    expect(
      getManualChunkName('/repo/node_modules/.pnpm/marked@15.0.12/node_modules/marked/lib/marked.esm.js'),
    ).toBe('vendor-common');
    expect(
      getManualChunkName('/repo/node_modules/.pnpm/dayjs@1.11.18/node_modules/dayjs/dayjs.min.js'),
    ).toBe('vendor-common');
  });

  it('keeps shared nanoid runtime in vendor-common so common chunks do not import assistant chunks', () => {
    expect(
      getManualChunkName('/repo/node_modules/.pnpm/nanoid@5.1.11/node_modules/nanoid/index.browser.js'),
    ).toBe('vendor-common');
  });

  it('keeps Ant Design reset css on the spec-template styles entry instead of shared homepage chunks', () => {
    expect(
      getManualChunkName('/repo/node_modules/.pnpm/antd@5.27.3/node_modules/antd/dist/reset.css'),
    ).toBe('spec-template-reset');
  });

  it('keeps Babel interop helpers with Ant Design to avoid an early vendor-common read in chunk cycles', () => {
    expect(
      getManualChunkName('/repo/node_modules/.pnpm/@babel+runtime@7.28.6/node_modules/@babel/runtime/helpers/interopRequireDefault.js'),
    ).toBe('vendor-antd');
    expect(
      getManualChunkName('/repo/node_modules/.pnpm/@babel+runtime@7.28.6/node_modules/@babel/runtime/helpers/esm/interopRequireDefault.js'),
    ).toBe('vendor-antd');
  });

  it('keeps mermaid graph dependencies in vendor-common to avoid chunk cycles', () => {
    expect(
      getManualChunkName('/repo/node_modules/.pnpm/mermaid@11.12.2/node_modules/mermaid/dist/mermaid.core.mjs'),
    ).toBe('vendor-common');
    expect(
      getManualChunkName('/repo/node_modules/.pnpm/d3@7.9.0/node_modules/d3/src/index.js'),
    ).toBe('vendor-common');
    expect(
      getManualChunkName('/repo/node_modules/.pnpm/dompurify@3.2.5/node_modules/dompurify/dist/purify.es.mjs'),
    ).toBe('vendor-common');
  });

  it('keeps Excalidraw dependencies in vendor-common to avoid chunk cycles', () => {
    expect(
      getManualChunkName('/repo/packages/excalidraw/dist/prod/index.js'),
    ).toBe('vendor-excalidraw');
    expect(
      getManualChunkName('/repo/vendor/axhub-excalidraw/dist/prod/index.js'),
    ).toBe('vendor-excalidraw');
    expect(
      getManualChunkName('/repo/node_modules/.pnpm/roughjs@4.6.4/node_modules/roughjs/bundled/rough.esm.js'),
    ).toBe('vendor-common');
    expect(
      getManualChunkName('/repo/node_modules/.pnpm/image-blob-reduce@3.0.1/node_modules/image-blob-reduce/index.js'),
    ).toBe('vendor-common');
    expect(
      getManualChunkName('/repo/node_modules/.pnpm/browser-fs-access@0.29.1/node_modules/browser-fs-access/dist/index.modern.js'),
    ).toBe('vendor-common');
  });

  it('keeps assistant UI packages together', () => {
    expect(
      getManualChunkName('/repo/node_modules/.pnpm/@lobehub+icons@4.2.0/node_modules/@lobehub/icons/es/index.js'),
    ).toBe('vendor-assistant');
    expect(
      getManualChunkName('/repo/node_modules/.pnpm/@axhub+acp@file+..+acp-ui_@assistant-ui+react-ai-sdk@1.3.26/node_modules/@axhub/acp/dist/public-api/ui.mjs'),
    ).toBe('vendor-assistant');
    expect(
      getManualChunkName('/repo/node_modules/.pnpm/ai@6.0.195_zod@4.4.3/node_modules/ai/dist/index.mjs'),
    ).toBe('vendor-assistant');
    expect(
      getManualChunkName('/repo/node_modules/.pnpm/@ai-sdk+react@3.0.188_react@18.2.0_zod@4.4.3/node_modules/@ai-sdk/react/dist/index.mjs'),
    ).toBe('vendor-assistant');
    expect(
      getManualChunkName('/repo/node_modules/.pnpm/@ai-sdk+provider-utils@4.0.27_zod@4.4.3/node_modules/@ai-sdk/provider-utils/dist/index.mjs'),
    ).toBe('vendor-assistant');
  });

  it('falls back to vendor-common for other third-party packages', () => {
    expect(
      getManualChunkName('/repo/node_modules/.pnpm/lucide-react@0.475.0/node_modules/lucide-react/dist/esm/lucide-react.js'),
    ).toBe('vendor-common');
  });

  it('splits workspace packages into feature-aligned chunks', () => {
    expect(
      getManualChunkName('/repo/packages/tiptap-editor/src/index.ts'),
    ).toBe('vendor-editor');
    expect(
      getManualChunkName('/repo/vendor/tiptap-editor/dist/index.js'),
    ).toBe('vendor-editor');
    expect(
      getManualChunkName('/repo/packages/axhub-export-core/src/export-core/env.ts'),
    ).toBe('vendor-export');
    expect(
      getManualChunkName('/repo/vendor/axhub-export-core/dist/index.mjs'),
    ).toBe('vendor-export');
    expect(
      getManualChunkName('/repo/packages/axhub-export-core/src/export-core/dom/index.ts'),
    ).toBe('vendor-export');
    expect(
      getManualChunkName('/repo/packages/axhub-export-core/src/export-core/figma/figma-clipboard-encoder.ts'),
    ).toBe('vendor-export');
    expect(
      getManualChunkName('/repo/packages/axhub-commentary/src/index.ts'),
    ).toBe('vendor-commentary');
    expect(
      getManualChunkName('/repo/vendor/axhub-commentary/dist/index.mjs'),
    ).toBe('vendor-commentary');
    expect(
      getManualChunkName('/repo/node_modules/.pnpm/@axhub/commentary@file+vendor+@axhub/commentary/node_modules/@axhub/commentary/dist/index.mjs'),
    ).toBe('vendor-commentary');
    expect(
      getManualChunkName('/repo/node_modules/.pnpm/@axhub+excalidraw@file+vendor+axhub-excalidraw/node_modules/@axhub/excalidraw/index.js'),
    ).toBe('vendor-excalidraw');
    expect(
      getManualChunkName('/repo/node_modules/.pnpm/tiptap-editor@file+vendor+tiptap-editor/node_modules/tiptap-editor/dist/index.js'),
    ).toBe('vendor-editor');
    expect(
      getManualChunkName('/repo/node_modules/.pnpm/axhub-export-core@file+vendor+axhub-export-core/node_modules/axhub-export-core/dist/index.mjs'),
    ).toBe('vendor-export');
  });

  it('keeps export dependencies in the same chunk as axhub-export-core', () => {
    expect(
      getManualChunkName('/repo/node_modules/.pnpm/pako@2.1.0/node_modules/pako/dist/pako.esm.mjs'),
    ).toBe('vendor-export');
    expect(
      getManualChunkName('/repo/node_modules/.pnpm/kiwi-schema@0.3.0/node_modules/kiwi-schema/index.js'),
    ).toBe('vendor-export');
    expect(
      getManualChunkName('/repo/node_modules/.pnpm/html-to-image@1.11.13/node_modules/html-to-image/es/index.js'),
    ).toBe('vendor-export');
  });
});
