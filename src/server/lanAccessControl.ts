import crypto from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';

import { getLocalNetworkHosts, getRequestUrl, readJsonBody, sendJson, sendText } from './http.ts';
import type {
  LanAccessPasswordConfig,
  MakeServerConfig,
} from './projectCore/server-config.ts';

export const LAN_ACCESS_COOKIE = 'axhub_lan_auth';
export const LAN_ACCESS_TOKEN_PARAM = 'axhubAccessToken';
export const LAN_ACCESS_SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;
export const LAN_ACCESS_SHARE_TOKEN_TTL_MS = 10 * 60 * 1000;

const SCRYPT_KEY_LENGTH = 64;
const TOKEN_VERSION = 1;
const LAN_ACCESS_PUBLIC_RUNTIME_PATHS = new Set([
  '/assets/dev-template-bootstrap.js',
  '/runtime/quick-edit.js',
]);

export interface LanAccessPasswordRecord {
  algorithm: 'scrypt';
  hash: string;
  salt: string;
}

type LanAccessTokenKind = 'session' | 'share';

interface LanAccessTokenPayload {
  v: number;
  kind: LanAccessTokenKind;
  exp: number;
  targetUrl?: string;
}

interface TokenValidationResult {
  valid: boolean;
  reason?: 'malformed' | 'kind' | 'expired' | 'signature' | 'missing_secret';
  targetUrl?: string;
  expiresAt?: number;
}

export interface LanAccessStatus {
  passwordSet: boolean;
  sessionTtlMs: number;
  shareTokenTtlMs: number;
}

export interface LanAccessControlApiOptions {
  getConfig: () => MakeServerConfig;
  saveConfig: (config: Partial<MakeServerConfig>) => MakeServerConfig;
}

export interface LanAccessGateOptions {
  getConfig: () => MakeServerConfig;
  isPublicPublishedRequest?: (req: IncomingMessage) => boolean;
}

export interface LanAccessGateDecision {
  allowed: boolean;
  status: 401 | 403;
  code: 'LAN_PASSWORD_NOT_SET' | 'LAN_AUTH_REQUIRED';
}

function base64UrlEncode(input: Buffer | string): string {
  return Buffer.from(input).toString('base64url');
}

function base64UrlDecode(input: string): Buffer {
  return Buffer.from(input, 'base64url');
}

function signPayload(encodedPayload: string, secret: string): string {
  return crypto.createHmac('sha256', secret).update(encodedPayload).digest('base64url');
}

function safeEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

function scrypt(password: string, salt: string): Promise<string> {
  return new Promise((resolve, reject) => {
    crypto.scrypt(password, salt, SCRYPT_KEY_LENGTH, (error, derivedKey) => {
      if (error) {
        reject(error);
        return;
      }
      resolve(derivedKey.toString('hex'));
    });
  });
}

export function rotateLanAccessSecret(): string {
  return crypto.randomBytes(32).toString('hex');
}

export async function hashLanAccessPassword(password: string): Promise<LanAccessPasswordRecord> {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = await scrypt(password, salt);
  return { algorithm: 'scrypt', hash, salt };
}

export async function verifyLanAccessPassword(
  record: LanAccessPasswordRecord | LanAccessPasswordConfig,
  password: string,
): Promise<boolean> {
  const salt = 'salt' in record ? record.salt : null;
  const hash = 'hash' in record ? record.hash : record.passwordHash;
  if (!salt || !hash) {
    return false;
  }
  const candidate = await scrypt(password, salt);
  return safeEqual(candidate, hash);
}

function createSignedToken(payload: LanAccessTokenPayload, secret: string): string {
  const encodedPayload = base64UrlEncode(JSON.stringify(payload));
  const signature = signPayload(encodedPayload, secret);
  return `${encodedPayload}.${signature}`;
}

function validateSignedToken(
  token: string,
  options: {
    secret: string;
    kind: LanAccessTokenKind;
    now?: number;
  },
): TokenValidationResult {
  const secret = String(options.secret || '').trim();
  if (!secret) {
    return { valid: false, reason: 'missing_secret' };
  }
  const [encodedPayload, signature, extra] = String(token || '').split('.');
  if (!encodedPayload || !signature || extra !== undefined) {
    return { valid: false, reason: 'malformed' };
  }
  const expectedSignature = signPayload(encodedPayload, secret);
  if (!safeEqual(signature, expectedSignature)) {
    return { valid: false, reason: 'signature' };
  }
  let payload: LanAccessTokenPayload;
  try {
    payload = JSON.parse(base64UrlDecode(encodedPayload).toString('utf8')) as LanAccessTokenPayload;
  } catch {
    return { valid: false, reason: 'malformed' };
  }
  if (payload.v !== TOKEN_VERSION || payload.kind !== options.kind) {
    return { valid: false, reason: 'kind' };
  }
  const now = options.now ?? Date.now();
  if (typeof payload.exp !== 'number' || payload.exp <= now) {
    return { valid: false, reason: 'expired' };
  }
  return {
    valid: true,
    targetUrl: typeof payload.targetUrl === 'string' ? payload.targetUrl : undefined,
    expiresAt: payload.exp,
  };
}

export function createLanAccessSessionToken(options: {
  secret: string;
  now?: number;
}): string {
  const now = options.now ?? Date.now();
  return createSignedToken({
    v: TOKEN_VERSION,
    kind: 'session',
    exp: now + LAN_ACCESS_SESSION_TTL_MS,
  }, options.secret);
}

export function createLanAccessSessionCookie(options: {
  secret: string;
  now?: number;
  token?: string;
}): string {
  const token = options.token || createLanAccessSessionToken(options);
  return `${LAN_ACCESS_COOKIE}=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${Math.floor(LAN_ACCESS_SESSION_TTL_MS / 1000)}`;
}

export function createLanAccessClearCookie(): string {
  return `${LAN_ACCESS_COOKIE}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0`;
}

export function validateLanAccessSessionToken(
  token: string,
  options: {
    secret: string;
    now?: number;
  },
): TokenValidationResult {
  return validateSignedToken(token, {
    secret: options.secret,
    kind: 'session',
    now: options.now,
  });
}

export function createLanAccessShareToken(options: {
  secret: string;
  targetUrl: string;
  now?: number;
}): string {
  const now = options.now ?? Date.now();
  return createSignedToken({
    v: TOKEN_VERSION,
    kind: 'share',
    exp: now + LAN_ACCESS_SHARE_TOKEN_TTL_MS,
    targetUrl: options.targetUrl,
  }, options.secret);
}

export function validateLanAccessShareToken(
  token: string,
  options: {
    secret: string;
    now?: number;
  },
): TokenValidationResult {
  return validateSignedToken(token, {
    secret: options.secret,
    kind: 'share',
    now: options.now,
  });
}

function getHeaderValue(value: string | string[] | undefined): string {
  return Array.isArray(value) ? value[0] || '' : value || '';
}

function normalizeHostname(value: string): string {
  return value.trim().toLowerCase().replace(/^\[/u, '').replace(/\]$/u, '');
}

function normalizeAddress(value: string): string {
  const normalized = normalizeHostname(value);
  return normalized.startsWith('::ffff:') ? normalized.slice('::ffff:'.length) : normalized;
}

function isLocalHostname(value: string): boolean {
  const normalized = normalizeAddress(value);
  const localNetworkHosts = getLocalNetworkHosts().map((host) => normalizeAddress(host));
  return !normalized
    || normalized === 'localhost'
    || normalized === '0.0.0.0'
    || normalized === '::'
    || normalized === '::1'
    || /^127(?:\.\d{1,3}){3}$/u.test(normalized)
    || localNetworkHosts.includes(normalized);
}

function getHostHeaderHostname(hostHeader: string): string {
  try {
    return new URL(`http://${hostHeader}`).hostname;
  } catch {
    return hostHeader.split(':')[0] || '';
  }
}

export function isLanAccessRequestLocal(req: {
  headers?: Record<string, string | string[] | undefined>;
  socket?: { remoteAddress?: string | null };
}): boolean {
  const forwardedFor = getHeaderValue(req.headers?.['x-forwarded-for']).split(',')[0]?.trim();
  if (forwardedFor && !isLocalHostname(forwardedFor)) {
    return false;
  }
  const remoteAddress = req.socket?.remoteAddress || '';
  if (remoteAddress && !isLocalHostname(remoteAddress)) {
    return false;
  }
  const hostHeader = getHeaderValue(req.headers?.host).trim();
  return isLocalHostname(getHostHeaderHostname(hostHeader));
}

function getCookie(req: IncomingMessage, name: string): string {
  const cookieHeader = getHeaderValue(req.headers.cookie);
  for (const part of cookieHeader.split(';')) {
    const [rawKey, ...rawValue] = part.trim().split('=');
    if (rawKey === name) {
      return rawValue.join('=').trim();
    }
  }
  return '';
}

function hasLanPassword(config: MakeServerConfig): boolean {
  const password = config.accessControl.lanPassword;
  return Boolean(password.passwordHash && password.salt && password.secret);
}

export function getLanAccessStatus(config: MakeServerConfig): LanAccessStatus {
  return {
    passwordSet: hasLanPassword(config),
    sessionTtlMs: LAN_ACCESS_SESSION_TTL_MS,
    shareTokenTtlMs: LAN_ACCESS_SHARE_TOKEN_TTL_MS,
  };
}

function getLanPasswordConfig(config: MakeServerConfig): LanAccessPasswordConfig {
  return config.accessControl.lanPassword;
}

function isJsonRequest(req: IncomingMessage, pathname: string): boolean {
  if (pathname.startsWith('/api/')) {
    return true;
  }
  const accept = getHeaderValue(req.headers.accept).toLowerCase();
  return accept.includes('application/json');
}

function sendLanAccessUnavailable(req: IncomingMessage, res: ServerResponse, pathname: string): void {
  if (isJsonRequest(req, pathname)) {
    sendJson(res, {
      error: '请先在本机设置局域网访问密码',
      code: 'LAN_PASSWORD_NOT_SET',
    }, { status: 403 });
    return;
  }
  sendText(res, `<!doctype html>
<html lang="zh-CN">
<head><meta charset="utf-8"><title>局域网访问不可用</title></head>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;padding:32px;color:#111827;background:#f8fafc">
  <main style="max-width:520px;margin:0 auto;background:#fff;border:1px solid #e5e7eb;border-radius:8px;padding:24px">
    <h1 style="font-size:20px;margin:0 0 12px">局域网访问不可用</h1>
    <p style="margin:0;color:#4b5563;line-height:1.7">请先回到本机 Make 管理端，在左上角设置里设置局域网访问密码。</p>
  </main>
</body>
</html>`, 'text/html; charset=utf-8', 403);
}

function sendLanAuthRequired(req: IncomingMessage, res: ServerResponse, pathname: string): void {
  if (isJsonRequest(req, pathname)) {
    sendJson(res, {
      error: '需要验证局域网访问密码',
      code: 'LAN_AUTH_REQUIRED',
    }, { status: 401 });
    return;
  }
  sendText(res, `<!doctype html>
<html lang="zh-CN">
<head><meta charset="utf-8"><title>局域网访问验证</title></head>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;padding:32px;color:#111827;background:#f8fafc">
  <main style="max-width:520px;margin:0 auto;background:#fff;border:1px solid #e5e7eb;border-radius:8px;padding:24px">
    <h1 style="font-size:20px;margin:0 0 12px">需要局域网访问密码</h1>
    <p style="margin:0 0 16px;color:#4b5563;line-height:1.7">请输入本机设置的局域网访问密码。</p>
    <form id="lan-auth-form">
      <input name="password" type="password" autocomplete="current-password" placeholder="局域网访问密码" style="box-sizing:border-box;width:100%;height:36px;border:1px solid #d1d5db;border-radius:6px;padding:0 10px" />
      <button style="margin-top:12px;height:34px;border:0;border-radius:6px;background:#111827;color:#fff;padding:0 14px" type="submit">进入</button>
      <p id="lan-auth-error" style="min-height:20px;color:#dc2626;font-size:13px"></p>
    </form>
  </main>
  <script>
    document.getElementById('lan-auth-form').addEventListener('submit', async (event) => {
      event.preventDefault();
      const password = new FormData(event.currentTarget).get('password');
      const response = await fetch('/api/access/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password })
      });
      if (response.ok) location.reload();
      else document.getElementById('lan-auth-error').textContent = '密码错误或已失效';
    });
  </script>
</body>
</html>`, 'text/html; charset=utf-8', 401);
}

function isLanAccessAllowedPath(pathname: string, method = 'GET'): boolean {
  const normalizedMethod = method.toUpperCase();
  const isPublicRuntimeAsset = (normalizedMethod === 'GET' || normalizedMethod === 'HEAD')
    && LAN_ACCESS_PUBLIC_RUNTIME_PATHS.has(pathname);
  return isPublicRuntimeAsset
    || pathname === '/api/health'
    || pathname.startsWith('/api/access/')
    || (
      pathname === '/api/review-reports/submit'
      && (normalizedMethod === 'POST' || normalizedMethod === 'OPTIONS')
    )
    || (
      pathname === '/api/review-reports/exists'
      && (normalizedMethod === 'GET' || normalizedMethod === 'OPTIONS')
    );
}

export function handleLanAccessGate(
  req: IncomingMessage,
  res: ServerResponse,
  options: LanAccessGateOptions,
): boolean {
  const pathname = getRequestUrl(req).pathname;
  if (isLanAccessAllowedPath(pathname, req.method)
    || isLanAccessRequestLocal(req)
    || options.isPublicPublishedRequest?.(req) === true) {
    return false;
  }
  const config = options.getConfig();
  const password = getLanPasswordConfig(config);
  const requestUrl = getRequestUrl(req);
  const shareToken = requestUrl.searchParams.get(LAN_ACCESS_TOKEN_PARAM)?.trim() || '';
  if (shareToken && hasLanPassword(config)) {
    const validation = validateLanAccessShareToken(shareToken, { secret: password.secret });
    if (validation.valid) {
      const sessionToken = createLanAccessSessionToken({ secret: password.secret });
      requestUrl.searchParams.delete(LAN_ACCESS_TOKEN_PARAM);
      const location = `${requestUrl.pathname}${requestUrl.search}${requestUrl.hash}`;
      res.statusCode = 302;
      res.setHeader('Set-Cookie', createLanAccessSessionCookie({
        secret: password.secret,
        token: sessionToken,
      }));
      res.setHeader('Location', location || '/');
      res.end();
      return true;
    }
  }

  const decision = getLanAccessGateDecision(req, { getConfig: () => config });
  if (decision.allowed) {
    return false;
  }
  if (decision.code === 'LAN_PASSWORD_NOT_SET') {
    sendLanAccessUnavailable(req, res, pathname);
  } else {
    sendLanAuthRequired(req, res, pathname);
  }
  return true;
}

export function getLanAccessGateDecision(
  req: IncomingMessage,
  options: LanAccessGateOptions,
): LanAccessGateDecision {
  const pathname = getRequestUrl(req).pathname;
  if (isLanAccessAllowedPath(pathname, req.method)
    || isLanAccessRequestLocal(req)
    || options.isPublicPublishedRequest?.(req) === true) {
    return { allowed: true, status: 401, code: 'LAN_AUTH_REQUIRED' };
  }
  const config = options.getConfig();
  const password = getLanPasswordConfig(config);
  if (!hasLanPassword(config)) {
    return { allowed: false, status: 403, code: 'LAN_PASSWORD_NOT_SET' };
  }
  const token = getCookie(req, LAN_ACCESS_COOKIE);
  if (token && validateLanAccessSessionToken(token, { secret: password.secret }).valid) {
    return { allowed: true, status: 401, code: 'LAN_AUTH_REQUIRED' };
  }
  return { allowed: false, status: 401, code: 'LAN_AUTH_REQUIRED' };
}

function normalizePassword(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function buildShareUrl(targetUrl: string, token: string): string {
  const url = new URL(targetUrl);
  url.searchParams.set(LAN_ACCESS_TOKEN_PARAM, token);
  return url.toString();
}

function isSafeShareTarget(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

export async function handleLanAccessApi(
  req: IncomingMessage,
  res: ServerResponse,
  options: LanAccessControlApiOptions,
): Promise<boolean> {
  const url = getRequestUrl(req);
  const pathname = url.pathname;
  if (!pathname.startsWith('/api/access/')) {
    return false;
  }

  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    res.end();
    return true;
  }

  if (pathname === '/api/access/status') {
    if (req.method !== 'GET') {
      sendJson(res, { error: 'Method not allowed' }, { status: 405 });
      return true;
    }
    sendJson(res, getLanAccessStatus(options.getConfig()));
    return true;
  }

  if (pathname === '/api/access/password') {
    if (req.method !== 'POST') {
      sendJson(res, { error: 'Method not allowed' }, { status: 405 });
      return true;
    }
    if (!isLanAccessRequestLocal(req)) {
      sendJson(res, {
        error: '只能在本机设置局域网访问密码',
        code: 'LOCAL_ACCESS_REQUIRED',
      }, { status: 403 });
      return true;
    }
    const body = await readJsonBody(req);
    const password = normalizePassword((body as { password?: unknown }).password);
    if (!password) {
      const saved = options.saveConfig({
        accessControl: {
          lanPassword: {
            algorithm: 'scrypt',
            passwordHash: null,
            salt: null,
            secret: rotateLanAccessSecret(),
            updatedAt: new Date().toISOString(),
          },
        },
      } as Partial<MakeServerConfig>);
      res.setHeader('Set-Cookie', createLanAccessClearCookie());
      sendJson(res, {
        success: true,
        passwordSet: getLanAccessStatus(saved).passwordSet,
      });
      return true;
    }
    const passwordRecord = await hashLanAccessPassword(password);
    const saved = options.saveConfig({
      accessControl: {
        lanPassword: {
          algorithm: 'scrypt',
          passwordHash: passwordRecord.hash,
          salt: passwordRecord.salt,
          secret: rotateLanAccessSecret(),
          updatedAt: new Date().toISOString(),
        },
      },
    } as Partial<MakeServerConfig>);
    sendJson(res, {
      success: true,
      passwordSet: getLanAccessStatus(saved).passwordSet,
    });
    return true;
  }

  if (pathname === '/api/access/login') {
    if (req.method !== 'POST') {
      sendJson(res, { error: 'Method not allowed' }, { status: 405 });
      return true;
    }
    const config = options.getConfig();
    const passwordConfig = getLanPasswordConfig(config);
    if (!hasLanPassword(config)) {
      sendJson(res, {
        error: '请先在本机设置局域网访问密码',
        code: 'LAN_PASSWORD_NOT_SET',
      }, { status: 403 });
      return true;
    }
    const body = await readJsonBody(req);
    const password = normalizePassword((body as { password?: unknown }).password);
    if (!await verifyLanAccessPassword(passwordConfig, password)) {
      sendJson(res, {
        error: '局域网访问密码错误',
        code: 'INVALID_PASSWORD',
      }, { status: 401 });
      return true;
    }
    const sessionToken = createLanAccessSessionToken({ secret: passwordConfig.secret });
    res.setHeader('Set-Cookie', createLanAccessSessionCookie({
      secret: passwordConfig.secret,
      token: sessionToken,
    }));
    sendJson(res, {
      success: true,
      sessionToken,
      expiresAt: new Date(Date.now() + LAN_ACCESS_SESSION_TTL_MS).toISOString(),
    });
    return true;
  }

  if (pathname === '/api/access/share-token') {
    if (req.method !== 'POST') {
      sendJson(res, { error: 'Method not allowed' }, { status: 405 });
      return true;
    }
    const config = options.getConfig();
    const passwordConfig = getLanPasswordConfig(config);
    if (!hasLanPassword(config)) {
      sendJson(res, {
        error: '请先在本机设置局域网访问密码',
        code: 'LAN_PASSWORD_NOT_SET',
      }, { status: 403 });
      return true;
    }
    if (!isLanAccessRequestLocal(req)) {
      const sessionToken = getCookie(req, LAN_ACCESS_COOKIE);
      const session = validateLanAccessSessionToken(sessionToken, { secret: passwordConfig.secret });
      if (!session.valid) {
        sendJson(res, {
          error: '需要验证局域网访问密码',
          code: 'LAN_AUTH_REQUIRED',
        }, { status: 401 });
        return true;
      }
    }
    const body = await readJsonBody(req);
    const targetUrl = typeof (body as { targetUrl?: unknown }).targetUrl === 'string'
      ? (body as { targetUrl: string }).targetUrl.trim()
      : '';
    if (!targetUrl || !isSafeShareTarget(targetUrl)) {
      sendJson(res, { error: 'Invalid targetUrl' }, { status: 400 });
      return true;
    }
    const token = createLanAccessShareToken({
      secret: passwordConfig.secret,
      targetUrl,
    });
    const expiresAt = new Date(Date.now() + LAN_ACCESS_SHARE_TOKEN_TTL_MS).toISOString();
    sendJson(res, {
      success: true,
      token,
      url: buildShareUrl(targetUrl, token),
      expiresAt,
      ttlMs: LAN_ACCESS_SHARE_TOKEN_TTL_MS,
    });
    return true;
  }

  if (pathname === '/api/access/exchange') {
    if (req.method !== 'POST') {
      sendJson(res, { error: 'Method not allowed' }, { status: 405 });
      return true;
    }
    const config = options.getConfig();
    const passwordConfig = getLanPasswordConfig(config);
    if (!hasLanPassword(config)) {
      sendJson(res, {
        error: '请先在本机设置局域网访问密码',
        code: 'LAN_PASSWORD_NOT_SET',
      }, { status: 403 });
      return true;
    }
    const body = await readJsonBody(req);
    const token = typeof (body as { token?: unknown }).token === 'string'
      ? (body as { token: string }).token.trim()
      : '';
    const validation = validateLanAccessShareToken(token, { secret: passwordConfig.secret });
    if (!validation.valid) {
      sendJson(res, {
        error: '分享链接已失效',
        code: 'INVALID_ACCESS_TOKEN',
      }, { status: 401 });
      return true;
    }
    const sessionToken = createLanAccessSessionToken({ secret: passwordConfig.secret });
    res.setHeader('Set-Cookie', createLanAccessSessionCookie({
      secret: passwordConfig.secret,
      token: sessionToken,
    }));
    sendJson(res, {
      success: true,
      sessionToken,
      targetUrl: validation.targetUrl,
      expiresAt: new Date(Date.now() + LAN_ACCESS_SESSION_TTL_MS).toISOString(),
    });
    return true;
  }

  if (pathname === '/api/access/validate') {
    if (req.method !== 'POST') {
      sendJson(res, { error: 'Method not allowed' }, { status: 405 });
      return true;
    }
    const config = options.getConfig();
    const passwordConfig = getLanPasswordConfig(config);
    const body = await readJsonBody(req);
    const bodyToken = typeof (body as { sessionToken?: unknown }).sessionToken === 'string'
      ? (body as { sessionToken: string }).sessionToken.trim()
      : '';
    const token = bodyToken || getCookie(req, LAN_ACCESS_COOKIE);
    const validation = hasLanPassword(config)
      ? validateLanAccessSessionToken(token, { secret: passwordConfig.secret })
      : { valid: false };
    sendJson(res, {
      valid: validation.valid,
      passwordSet: hasLanPassword(config),
    }, { status: validation.valid ? 200 : 401 });
    return true;
  }

  sendJson(res, { error: 'Not found' }, { status: 404 });
  return true;
}
