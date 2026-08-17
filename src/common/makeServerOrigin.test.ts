import { describe, expect, it } from 'vitest';

import {
  DEFAULT_MAKE_SERVER_ORIGIN,
  buildMakeServerApiUrl,
  normalizeMakeServerOrigin,
  resolveInjectedMakeServerOrigin,
  resolveHostedMakeServerOrigin,
} from './makeServerOrigin';

describe('make server origin helpers', () => {
  it('normalizes valid origins and removes trailing slashes', () => {
    expect(normalizeMakeServerOrigin('http://localhost:53817/')).toBe('http://localhost:53817');
    expect(normalizeMakeServerOrigin('https://make.example.test///')).toBe('https://make.example.test');
  });

  it('rejects invalid origins', () => {
    expect(normalizeMakeServerOrigin('')).toBe('');
    expect(normalizeMakeServerOrigin('/api')).toBe('');
    expect(normalizeMakeServerOrigin('not a url')).toBe('');
    expect(normalizeMakeServerOrigin('javascript:alert(1)')).toBe('');
    expect(normalizeMakeServerOrigin('file:///tmp/make')).toBe('');
  });

  it('uses the Make server default only for hosted fallback', () => {
    expect(DEFAULT_MAKE_SERVER_ORIGIN).toBe('http://localhost:53817');
    expect(resolveHostedMakeServerOrigin('')).toBe(DEFAULT_MAKE_SERVER_ORIGIN);
    expect(resolveHostedMakeServerOrigin('http://127.0.0.1:53817/')).toBe('http://127.0.0.1:53817');
  });

  it('uses only the host-injected Make origin and otherwise falls back to the default port', () => {
    expect(resolveInjectedMakeServerOrigin({
      __AXHUB_MAKE_API_ORIGIN__: 'http://localhost:64900/',
    })).toBe('http://localhost:64900');
    expect(resolveInjectedMakeServerOrigin({
      location: { origin: 'http://localhost:51720' },
    })).toBe(DEFAULT_MAKE_SERVER_ORIGIN);
    expect(resolveInjectedMakeServerOrigin(null)).toBe(DEFAULT_MAKE_SERVER_ORIGIN);
  });

  it('builds absolute management API URLs', () => {
    const search = new URLSearchParams({ targetPath: 'prototypes/home', projectId: 'project-a' });
    expect(buildMakeServerApiUrl('http://localhost:53817/', '/api/prototype-comments', search))
      .toBe('http://localhost:53817/api/prototype-comments?targetPath=prototypes%2Fhome&projectId=project-a');
    expect(buildMakeServerApiUrl('', '/api/prototype-comments')).toBe('');
    expect(buildMakeServerApiUrl('/relative', '/api/prototype-comments')).toBe('');
    expect(buildMakeServerApiUrl('http://localhost:53817', 'api/prototype-comments')).toBe('');
    expect(buildMakeServerApiUrl('https://make.example.test', '/api/health'))
      .toBe('https://make.example.test/api/health');
  });
});
