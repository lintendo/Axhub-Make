import { describe, expect, it } from 'vitest';

import {
  addUrls,
  buildAdminDeepLinkUrl,
  getPreviewRoutePath,
} from './check-app-ready.mjs';

describe('check-app-ready url output', () => {
  it('builds the Make server prototype deep link for prototype acceptance', () => {
    expect(buildAdminDeepLinkUrl({
      adminOrigin: 'http://localhost:53817/',
      projectId: 'make-project',
      pagePath: '/prototypes/order-review',
    })).toBe('http://localhost:53817/?projectId=make-project&p=order-review');
  });

  it('builds a theme deep link for theme acceptance', () => {
    expect(buildAdminDeepLinkUrl({
      adminOrigin: 'http://localhost:53817',
      projectId: 'make-project',
      pagePath: '/themes/shopify',
    })).toBe('http://localhost:53817/?projectId=make-project&theme=shopify');
  });

  it('does not synthesize an index.html entry path for preview routes', () => {
    expect(getPreviewRoutePath('/prototypes/order-review')).toBe('/prototypes/order-review');
  });

  it('keeps runtime urls and returns server urls when admin status is known', () => {
    const result = addUrls(
      { status: 'READY', url: 'http://localhost:51720/prototypes/order-review' },
      { port: 51720, host: '0.0.0.0' },
      {
        adminOrigin: 'http://localhost:53817',
        adminUrl: 'http://localhost:53817/?projectId=make-project',
        projectId: 'make-project',
      },
      '/prototypes/order-review',
    );

    expect(result).toMatchObject({
      homeUrl: 'http://localhost:51720',
      targetUrl: 'http://localhost:51720/prototypes/order-review',
      runtimeHomeUrl: 'http://localhost:51720',
      runtimeTargetUrl: 'http://localhost:51720/prototypes/order-review',
      serverUrl: 'http://localhost:53817/?projectId=make-project&p=order-review',
      serverHomeUrl: 'http://localhost:53817/?projectId=make-project',
      serverOrigin: 'http://localhost:53817',
      targetPath: 'http://localhost:51720/prototypes/order-review',
    });
  });
});
