#!/usr/bin/env node

const baseUrl = process.argv[2] || 'http://localhost:51720';
const targets = process.argv.slice(3).length > 0
  ? process.argv.slice(3)
  : [
      '/prototypes/annotation-demo',
      '/prototypes/beginner-guide',
      '/themes/apple',
    ];

let hasFailure = false;

for (const target of targets) {
  const requestUrl = new URL(target, baseUrl).toString();

  try {
    const response = await fetch(requestUrl, {
      redirect: 'follow',
      headers: {
        Accept: 'text/html',
      },
    });

    const html = await response.text();
    const previewLoaderMatches = Array.from(
      html.matchAll(/src="([^"]*__axhub-preview-loader\.js[^"]*)"/g),
      (match) => match[1],
    );
    const previewLoader = previewLoaderMatches[0] || null;

    let loaderScript = '';
    if (previewLoader) {
      loaderScript = await fetch(new URL(previewLoader, baseUrl)).then((res) => res.text());
    }

    const ok = response.ok
      && html.includes('<div id="root"></div>')
      && previewLoaderMatches.length === 1
      && !html.includes('html-proxy')
      && !html.includes('waitForBootstrap')
      && loaderScript.includes('import PreviewComponent from')
      && loaderScript.includes('import.meta.hot.accept(')
      && html.includes('<div id="root"></div>');

    if (!ok) {
      hasFailure = true;
      console.error(`[preview-smoke] FAIL ${requestUrl}`);
      console.error(`  status=${response.status}`);
      console.error(`  containsRoot=${html.includes('<div id="root"></div>')}`);
      console.error(`  previewLoaderCount=${previewLoaderMatches.length}`);
      console.error(`  removedHtmlProxy=${!html.includes('html-proxy')}`);
      console.error(`  removedLegacyLoader=${!html.includes('waitForBootstrap')}`);
      console.error(`  previewLoader=${Boolean(previewLoader)}`);
      console.error(`  loaderImportsEntry=${loaderScript.includes('import PreviewComponent from')}`);
      console.error(`  loaderHasAcceptBoundary=${loaderScript.includes('import.meta.hot.accept(')}`);
      continue;
    }

    console.log(`[preview-smoke] OK   ${requestUrl}`);
  } catch (error) {
    hasFailure = true;
    console.error(`[preview-smoke] ERROR ${requestUrl}`);
    console.error(`  ${(error && error.message) || error}`);
  }
}

if (hasFailure) {
  process.exitCode = 1;
}
