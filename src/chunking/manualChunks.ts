const REACT_PACKAGES = new Set([
  'react',
  'react-dom',
  'scheduler',
]);

const ANTD_PACKAGES = new Set([
  '@babel/runtime',
  'antd',
  'antd-style',
]);

const SPEC_TEMPLATE_PACKAGES = new Set([
  'domelementtype',
  'domhandler',
  'domutils',
  'entities',
  'highlight.js',
  'html-dom-parser',
  'html-react-parser',
  'htmlparser2',
  'lowlight',
  'react-property',
  'react-syntax-highlighter',
  'style-to-js',
]);

const WORKSPACE_CHUNK_RULES: Array<{ marker: string; chunkName: string }> = [
  { marker: '/packages/excalidraw/', chunkName: 'vendor-excalidraw' },
  { marker: '/packages/tiptap-editor/', chunkName: 'vendor-editor' },
  { marker: '/packages/axhub-export-core/', chunkName: 'vendor-export' },
  { marker: '/packages/axhub-commentary/', chunkName: 'vendor-commentary' },
  { marker: '/vendor/axhub-excalidraw/', chunkName: 'vendor-excalidraw' },
  { marker: '/vendor/tiptap-editor/', chunkName: 'vendor-editor' },
  { marker: '/vendor/axhub-export-core/', chunkName: 'vendor-export' },
  { marker: '/vendor/axhub-commentary/', chunkName: 'vendor-commentary' },
];

const WORKSPACE_PACKAGE_CHUNKS = new Map<string, string>([
  ['@axhub/excalidraw', 'vendor-excalidraw'],
  ['tiptap-editor', 'vendor-editor'],
  ['axhub-export-core', 'vendor-export'],
  ['@axhub/commentary', 'vendor-commentary'],
]);

export function normalizeModuleId(id: string) {
  return id.replace(/\\/g, '/');
}

export function getPackageNameFromId(id: string): string | null {
  const normalized = normalizeModuleId(id);
  const marker = '/node_modules/';
  const index = normalized.lastIndexOf(marker);
  if (index === -1) {
    return null;
  }

  const afterMarker = normalized.slice(index + marker.length);
  if (!afterMarker) {
    return null;
  }

  const parts = afterMarker.split('/');
  if (parts[0]?.startsWith('@')) {
    if (!parts[1]) {
      return null;
    }
    return `${parts[0]}/${parts[1]}`;
  }

  return parts[0] || null;
}

function startsWithPackageGroup(packageName: string, prefixes: string[]) {
  return prefixes.some((prefix) => packageName.startsWith(prefix));
}

export function getManualChunkName(id: string): string | undefined {
  const normalizedId = normalizeModuleId(id);

  for (const rule of WORKSPACE_CHUNK_RULES) {
    if (normalizedId.includes(rule.marker)) {
      return rule.chunkName;
    }
  }

  if (
    normalizedId.includes('/antd/dist/reset.css')
    || normalizedId.endsWith('antd/dist/reset.css')
  ) {
    return 'spec-template-reset';
  }

  const packageName = getPackageNameFromId(normalizedId);
  if (!packageName) {
    return undefined;
  }

  if (REACT_PACKAGES.has(packageName)) {
    return 'vendor-react';
  }

  const workspacePackageChunk = WORKSPACE_PACKAGE_CHUNKS.get(packageName);
  if (workspacePackageChunk) {
    return workspacePackageChunk;
  }

  if (SPEC_TEMPLATE_PACKAGES.has(packageName)) {
    return 'spec-template-vendor';
  }

  if (
    ANTD_PACKAGES.has(packageName)
    || startsWithPackageGroup(packageName, ['@ant-design/', '@rc-component/', 'rc-'])
  ) {
    return 'vendor-antd';
  }

  if (
    packageName.startsWith('@tiptap/')
    || packageName.startsWith('prosemirror')
  ) {
    return 'vendor-editor';
  }

  if (
    packageName.startsWith('@assistant-ui/')
    || packageName.startsWith('@ai-sdk/')
    || packageName.startsWith('@lobehub/')
    || packageName === '@axhub/acp'
    || packageName === 'ai'
    || packageName === 'assistant-cloud'
    || packageName === 'assistant-stream'
  ) {
    return 'vendor-assistant';
  }

  if (
    packageName === 'html-to-image'
    || packageName === 'kiwi-schema'
    || packageName === 'papaparse'
    || packageName === 'pako'
  ) {
    return 'vendor-export';
  }

  return 'vendor-common';
}
