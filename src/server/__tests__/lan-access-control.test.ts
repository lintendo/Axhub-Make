import fs from 'node:fs';
import type { IncomingMessage } from 'node:http';

import { afterEach, describe, expect, it } from 'vitest';

import {
  LAN_ACCESS_COOKIE,
  createLanAccessSessionCookie,
  createLanAccessShareToken,
  getLanAccessGateDecision,
  hashLanAccessPassword,
  isLanAccessRequestLocal,
  rotateLanAccessSecret,
  validateLanAccessSessionToken,
  validateLanAccessShareToken,
  verifyLanAccessPassword,
} from '../lanAccessControl.ts';
import {
  getGlobalServerConfigPath,
  getGlobalServerSecretsPath,
} from '../projectCore/index.ts';
import {
  cleanupProjectApiTestRoots,
  createTempRoot,
  registerProject,
  startTestServer,
  writeProjectMetadata,
} from './projects-api.helpers';

afterEach(() => {
  cleanupProjectApiTestRoots();
});

describe('LAN access control primitives', () => {
  it('hashes LAN passwords with scrypt and verifies only the original password', async () => {
    const passwordRecord = await hashLanAccessPassword('correct horse battery staple');

    expect(passwordRecord.algorithm).toBe('scrypt');
    expect(passwordRecord.hash).toMatch(/^[a-f0-9]+$/u);
    expect(passwordRecord.salt).toMatch(/^[a-f0-9]+$/u);
    await expect(verifyLanAccessPassword(passwordRecord, 'correct horse battery staple')).resolves.toBe(true);
    await expect(verifyLanAccessPassword(passwordRecord, 'wrong password')).resolves.toBe(false);
  });

  it('creates expiring share tokens and invalidates them after a secret rotation', () => {
    const firstSecret = rotateLanAccessSecret();
    const token = createLanAccessShareToken({
      secret: firstSecret,
      targetUrl: 'http://192.168.1.22:53817/?projectId=demo',
      now: 1_000,
    });

    expect(validateLanAccessShareToken(token, {
      secret: firstSecret,
      now: 1_000,
    })).toMatchObject({
      valid: true,
      targetUrl: 'http://192.168.1.22:53817/?projectId=demo',
    });
    expect(validateLanAccessShareToken(token, {
      secret: firstSecret,
      now: 11 * 60 * 1_000,
    })).toMatchObject({ valid: false, reason: 'expired' });
    expect(validateLanAccessShareToken(token, {
      secret: rotateLanAccessSecret(),
      now: 1_000,
    })).toMatchObject({ valid: false });
  });

  it('creates 7 day session cookies and invalidates sessions after a secret rotation', () => {
    const secret = rotateLanAccessSecret();
    const cookie = createLanAccessSessionCookie({
      secret,
      now: 2_000,
    });
    const token = cookie.match(new RegExp(`${LAN_ACCESS_COOKIE}=([^;]+)`))?.[1] || '';

    expect(cookie).toContain(`${LAN_ACCESS_COOKIE}=`);
    expect(cookie).toContain('HttpOnly');
    expect(cookie).toContain('SameSite=Lax');
    expect(cookie).toContain('Path=/');
    expect(cookie).toContain('Max-Age=604800');
    expect(validateLanAccessSessionToken(token, {
      secret,
      now: 2_000,
    })).toMatchObject({ valid: true });
    expect(validateLanAccessSessionToken(token, {
      secret,
      now: 8 * 24 * 60 * 60 * 1_000,
    })).toMatchObject({ valid: false, reason: 'expired' });
    expect(validateLanAccessSessionToken(token, {
      secret: rotateLanAccessSecret(),
      now: 2_000,
    })).toMatchObject({ valid: false });
  });

  it('treats localhost requests as local and forwarded LAN addresses as non-local', () => {
    expect(isLanAccessRequestLocal({
      headers: { host: 'localhost:53817' },
      socket: { remoteAddress: '127.0.0.1' },
    })).toBe(true);
    expect(isLanAccessRequestLocal({
      headers: { host: '127.0.0.1:53817' },
      socket: { remoteAddress: '::ffff:127.0.0.1' },
    })).toBe(true);
    expect(isLanAccessRequestLocal({
      headers: { host: '192.168.1.22:53817', 'x-forwarded-for': '192.168.1.55' },
      socket: { remoteAddress: '127.0.0.1' },
    })).toBe(false);
  });

  it('allows only the approved management runtime assets without a LAN session', () => {
    const config = {
      accessControl: {
        lanPassword: {
          algorithm: 'scrypt',
          passwordHash: 'hash',
          salt: 'salt',
          secret: 'secret',
          updatedAt: new Date().toISOString(),
        },
      },
    } as any;
    const getDecision = (url: string, method: string) => getLanAccessGateDecision({
      url,
      method,
      headers: { host: '192.168.1.22:53817', 'x-forwarded-for': '192.168.1.55' },
      socket: { remoteAddress: '127.0.0.1' },
    } as unknown as IncomingMessage, { getConfig: () => config });

    for (const url of [
      '/assets/dev-template-bootstrap.js',
      '/runtime/quick-edit.js',
    ]) {
      expect(getDecision(url, 'GET')).toMatchObject({ allowed: true });
      expect(getDecision(url, 'HEAD')).toMatchObject({ allowed: true });
    }

    for (const [url, method] of [
      ['/assets/private.js', 'GET'],
      ['/assets/dev-template-bootstrap.js.map', 'GET'],
      ['/runtime/private.js', 'GET'],
      ['/assets/dev-template-bootstrap.js', 'POST'],
    ]) {
      expect(getDecision(url, method)).toMatchObject({
        allowed: false,
        code: 'LAN_AUTH_REQUIRED',
      });
    }
  });

  it('allows only validated published requests to bypass the LAN password gate', () => {
    const request = {
      url: '/published/html/publish-1/index.html',
      headers: { host: '192.168.1.22:53817', 'x-forwarded-for': '192.168.1.55' },
      socket: { remoteAddress: '127.0.0.1' },
    } as unknown as IncomingMessage;
    const config = {
      accessControl: {
        lanPassword: {
          algorithm: 'scrypt',
          passwordHash: 'hash',
          salt: 'salt',
          secret: 'secret',
          updatedAt: new Date().toISOString(),
        },
      },
    } as any;

    expect(getLanAccessGateDecision(request, {
      getConfig: () => config,
      isPublicPublishedRequest: () => true,
    })).toMatchObject({ allowed: true });
    expect(getLanAccessGateDecision(request, {
      getConfig: () => config,
      isPublicPublishedRequest: () => false,
    })).toMatchObject({ allowed: false, code: 'LAN_AUTH_REQUIRED' });
  });
});

describe('LAN access control routes', () => {
  it('blocks non-local API access until a LAN password session is established', async () => {
    const projectRoot = createTempRoot();
    writeProjectMetadata(projectRoot, {
      project: { id: 'lan-auth', name: 'LAN Auth' },
    });
    const registryHome = createTempRoot('axhub-make-lan-auth-home-');
    const server = await startTestServer(projectRoot, registryHome);

    try {
      await registerProject(server.origin, projectRoot, 'lan-auth', 'LAN Auth');

      const nonLocalHeaders = { 'x-forwarded-for': '192.168.1.55' };
      const health = await fetch(`${server.origin}/api/health`, { headers: nonLocalHeaders });
      expect(health.status).toBe(200);

      const unavailable = await fetch(`${server.origin}/api/version`, { headers: nonLocalHeaders })
        .then(async (response) => ({ status: response.status, body: await response.json() }));
      expect(unavailable).toMatchObject({
        status: 403,
        body: {
          code: 'LAN_PASSWORD_NOT_SET',
        },
      });

      const setPassword = await fetch(`${server.origin}/api/access/password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: 'secret-pass' }),
      }).then(async (response) => ({ status: response.status, body: await response.json() }));
      expect(setPassword).toMatchObject({ status: 200, body: { passwordSet: true } });

      const unauthenticated = await fetch(`${server.origin}/api/version`, { headers: nonLocalHeaders })
        .then(async (response) => ({ status: response.status, body: await response.json() }));
      expect(unauthenticated).toMatchObject({
        status: 401,
        body: {
          code: 'LAN_AUTH_REQUIRED',
        },
      });

      const wrongLogin = await fetch(`${server.origin}/api/access/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...nonLocalHeaders },
        body: JSON.stringify({ password: 'wrong-pass' }),
      }).then(async (response) => ({ status: response.status, body: await response.json() }));
      expect(wrongLogin).toMatchObject({ status: 401, body: { code: 'INVALID_PASSWORD' } });

      const loginResponse = await fetch(`${server.origin}/api/access/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...nonLocalHeaders },
        body: JSON.stringify({ password: 'secret-pass' }),
      });
      expect(loginResponse.status).toBe(200);
      const loginCookie = loginResponse.headers.get('set-cookie') || '';
      expect(loginCookie).toContain(`${LAN_ACCESS_COOKIE}=`);

      const authenticated = await fetch(`${server.origin}/api/version`, {
        headers: { ...nonLocalHeaders, cookie: loginCookie },
      });
      expect(authenticated.status).toBe(200);

      await fetch(`${server.origin}/api/access/password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: 'new-secret-pass' }),
      });
      const staleSession = await fetch(`${server.origin}/api/version`, {
        headers: { ...nonLocalHeaders, cookie: loginCookie },
      });
      expect(staleSession.status).toBe(401);
    } finally {
      await server.close();
    }
  });

  it('keeps LAN password hash and secret only in the service-owned secret store', async () => {
    const projectRoot = createTempRoot();
    writeProjectMetadata(projectRoot, {
      project: { id: 'lan-global-config', name: 'LAN Global Config' },
    });
    const registryHome = createTempRoot('axhub-make-lan-config-home-');
    const server = await startTestServer(projectRoot, registryHome);

    try {
      await registerProject(server.origin, projectRoot, 'lan-global-config', 'LAN Global Config');
      await fetch(`${server.origin}/api/access/password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: 'global-secret' }),
      });

      const config = await fetch(new URL(
        `/api/config?projectId=${encodeURIComponent('lan-global-config')}`,
        server.origin,
      )).then((response) => response.json());
      expect(JSON.stringify(config)).not.toContain('global-secret');
      expect(JSON.stringify(config)).not.toContain('passwordHash');
      expect(JSON.stringify(config)).not.toContain('secret');

      const globalConfigText = fs.readFileSync(getGlobalServerConfigPath(registryHome), 'utf8');
      expect(globalConfigText).not.toContain('passwordHash');
      expect(globalConfigText).not.toContain('salt');
      expect(globalConfigText).not.toContain('secret');
      const globalSecrets = JSON.parse(fs.readFileSync(getGlobalServerSecretsPath(registryHome), 'utf8'));
      expect(globalSecrets.accessControl.lanPassword).toMatchObject({
        passwordHash: expect.any(String),
        salt: expect.any(String),
        secret: expect.any(String),
        updatedAt: expect.any(String),
      });
    } finally {
      await server.close();
    }
  });
});
