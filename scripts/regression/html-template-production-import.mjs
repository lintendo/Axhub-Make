import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

function readAdminRootFromArgs(argv) {
  const index = argv.indexOf('--admin-root');
  if (index === -1 || !argv[index + 1]) {
    throw new Error('Usage: node scripts/regression/html-template-production-import.mjs --admin-root <directory>');
  }
  return path.resolve(argv[index + 1]);
}

export async function assertHtmlTemplateBootstrapImport({ adminRoot }) {
  const entry = path.resolve(adminRoot, 'assets', 'html-template-bootstrap.js');
  if (!fs.existsSync(entry)) {
    throw new Error(`HTML template bootstrap entry does not exist: ${entry}`);
  }

  try {
    await import(`${pathToFileURL(entry).href}?axhub-production-import=${Date.now()}`);
    return { entry, browserRuntimeRequired: false };
  } catch (error) {
    if (error instanceof ReferenceError && error.message === 'document is not defined') {
      return { entry, browserRuntimeRequired: true };
    }
    throw error;
  }
}

async function main() {
  const adminRoot = readAdminRootFromArgs(process.argv.slice(2));
  const result = await assertHtmlTemplateBootstrapImport({ adminRoot });
  const suffix = result.browserRuntimeRequired
    ? ' (module graph passed; browser document runtime is required for editor mount)'
    : '';
  console.log(`HTML template production bootstrap import succeeded: ${result.entry}${suffix}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error?.stack || error);
    process.exitCode = 1;
  });
}
