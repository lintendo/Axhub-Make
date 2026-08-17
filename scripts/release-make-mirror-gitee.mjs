#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const defaultManifestPath = path.join(repoRoot, '.release/make-client-template/manifest.json');
const defaultTokenFile = path.join(repoRoot, '.local/gitee-token');
const giteeApiBaseUrl = 'https://gitee.com/api/v5';

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function printUsage() {
  console.log(`Usage: pnpm release:make:mirror:gitee [options]

Options:
  --manifest <path>          Template release manifest path. Defaults to .release/make-client-template/manifest.json.
  --token-file <path>        Local token file. Defaults to .local/gitee-token.
  --target <commitish>       Gitee release target branch or commit. Defaults to main.
  --replace                  Delete and re-upload an existing template attachment.
  --dry-run                  Print planned Gitee mirror actions without requiring a token.
  --confirm-publish          Confirm external Gitee publishing after reviewing prepared artifacts.
  -h, --help                 Show this help message.

Token:
  Set GITEE_TOKEN, or put the token in .local/gitee-token. The token is never printed.
`);
}

function parseArgs(argv = []) {
  const options = {
    manifestPath: defaultManifestPath,
    tokenFile: defaultTokenFile,
    targetCommitish: 'main',
    replace: false,
    dryRun: false,
    confirmPublish: false,
    help: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const readValue = (name) => {
      const value = argv[index + 1];
      if (!value || value.startsWith('--')) {
        throw new Error(`Missing value for ${name}`);
      }
      index += 1;
      return value;
    };
    if (arg === '--') {
      continue;
    } else if (arg === '--manifest') {
      options.manifestPath = path.resolve(readValue('--manifest'));
    } else if (arg === '--token-file') {
      options.tokenFile = path.resolve(readValue('--token-file'));
    } else if (arg === '--target') {
      options.targetCommitish = readValue('--target');
    } else if (arg === '--replace') {
      options.replace = true;
    } else if (arg === '--dry-run') {
      options.dryRun = true;
    } else if (arg === '--confirm-publish') {
      options.confirmPublish = true;
    } else if (arg === '--help' || arg === '-h') {
      options.help = true;
    } else {
      throw new Error(`Unknown option: ${arg}`);
    }
  }

  return options;
}

export function resolveGiteeToken({ env = process.env, tokenFile = defaultTokenFile } = {}) {
  const envToken = typeof env.GITEE_TOKEN === 'string' ? env.GITEE_TOKEN.trim() : '';
  if (envToken) {
    return envToken;
  }
  if (fs.existsSync(tokenFile)) {
    const fileToken = fs.readFileSync(tokenFile, 'utf8').trim();
    if (fileToken) {
      return fileToken;
    }
  }
  throw new Error(`Missing Gitee token. Set GITEE_TOKEN or write it to ${tokenFile}`);
}

export function parseGiteeReleaseDownloadUrl(url) {
  const parsed = new URL(url);
  if (parsed.hostname !== 'gitee.com') {
    throw new Error(`Mirror URL must use gitee.com: ${url}`);
  }
  const parts = parsed.pathname.split('/').filter(Boolean).map(decodeURIComponent);
  const releasesIndex = parts.indexOf('releases');
  if (releasesIndex !== 2 || parts[3] !== 'download' || parts.length < 6) {
    throw new Error(`Unsupported Gitee release download URL: ${url}`);
  }
  return {
    owner: parts[0],
    repo: parts[1],
    tagName: parts[4],
    assetName: parts.slice(5).join('/'),
  };
}

function assertManifestHasTemplateZip(manifest, manifestPath) {
  if (!manifest?.templateZip?.path || !manifest?.templateZip?.mirrorUrl) {
    throw new Error(`Manifest is missing templateZip.path or templateZip.mirrorUrl: ${manifestPath}`);
  }
  if (!fs.existsSync(manifest.templateZip.path)) {
    throw new Error(`Template zip asset does not exist. Run release:make-client-template:prepare first: ${manifest.templateZip.path}`);
  }
  if (manifest.latestManifest?.path && !fs.existsSync(manifest.latestManifest.path)) {
    throw new Error(`Template latest manifest asset does not exist. Run release:make-client-template:prepare first: ${manifest.latestManifest.path}`);
  }
}

async function readGiteeJson(response, context) {
  const text = await response.text();
  let body = null;
  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      body = { message: text };
    }
  }
  if (!response.ok) {
    const message = body?.message || body?.error || response.statusText || 'Gitee API request failed';
    throw new Error(`${context} failed: HTTP ${response.status} ${message}`);
  }
  return body;
}

function apiUrl(pathname, token) {
  const url = new URL(`${giteeApiBaseUrl}${pathname}`);
  url.searchParams.set('access_token', token);
  return url;
}

async function getReleaseByTag({ fetchImpl, token, owner, repo, tagName }) {
  const response = await fetchImpl(apiUrl(`/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/releases/tags/${encodeURIComponent(tagName)}`, token));
  if (response.status === 404) {
    return null;
  }
  return readGiteeJson(response, `Get Gitee release ${tagName}`);
}

async function createRelease({ fetchImpl, token, owner, repo, tagName, version, templateVersion, targetCommitish }) {
  const releaseVersion = templateVersion || version;
  if (!releaseVersion) {
    throw new Error(`Manifest is missing templateVersion or version for ${tagName}`);
  }
  const isTemplateRelease = Boolean(templateVersion);
  const body = new FormData();
  body.set('access_token', token);
  body.set('tag_name', tagName);
  body.set('name', isTemplateRelease ? `Axhub Make Client Template ${releaseVersion}` : `@axhub/make ${releaseVersion}`);
  body.set('body', isTemplateRelease
    ? `Axhub Make client template ${releaseVersion} mirror release.`
    : `Axhub Make ${releaseVersion} mirror release for Make client template zip.`);
  body.set('prerelease', releaseVersion.includes('-') ? 'true' : 'false');
  body.set('target_commitish', targetCommitish);
  const response = await fetchImpl(`${giteeApiBaseUrl}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/releases`, {
    method: 'POST',
    body,
  });
  return readGiteeJson(response, `Create Gitee release ${tagName}`);
}

async function listAttachments({ fetchImpl, token, owner, repo, releaseId }) {
  const response = await fetchImpl(apiUrl(`/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/releases/${releaseId}/attach_files`, token));
  const body = await readGiteeJson(response, `List Gitee release attachments ${releaseId}`);
  return Array.isArray(body) ? body : [];
}

async function deleteAttachment({ fetchImpl, token, owner, repo, releaseId, attachmentId }) {
  const response = await fetchImpl(apiUrl(`/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/releases/${releaseId}/attach_files/${attachmentId}`, token), {
    method: 'DELETE',
  });
  if (response.status === 204) {
    return null;
  }
  return readGiteeJson(response, `Delete Gitee release attachment ${attachmentId}`);
}

function attachmentName(attachment) {
  return String(attachment?.name || attachment?.filename || attachment?.file_name || '');
}

async function uploadAttachment({ fetchImpl, token, owner, repo, releaseId, assetPath, assetName }) {
  const body = new FormData();
  body.set('access_token', token);
  const bytes = fs.readFileSync(assetPath);
  const contentType = assetName.endsWith('.json') ? 'application/json' : 'application/zip';
  const blob = new Blob([bytes], { type: contentType });
  body.set('file', blob, assetName);
  const response = await fetchImpl(`${giteeApiBaseUrl}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/releases/${releaseId}/attach_files`, {
    method: 'POST',
    body,
  });
  return readGiteeJson(response, `Upload Gitee release attachment ${assetName}`);
}

async function verifyMirrorUrl({ fetchImpl, mirrorUrl }) {
  const response = await fetchImpl(mirrorUrl, {
    method: 'HEAD',
    redirect: 'follow',
  });
  if (!response.ok) {
    throw new Error(`Verify Gitee mirror URL failed: HTTP ${response.status} ${response.statusText}`);
  }
  return {
    ok: true,
    contentLength: response.headers.get('content-length'),
    contentType: response.headers.get('content-type'),
  };
}

async function mirrorGiteeAsset({
  fetchImpl,
  token,
  logger,
  options,
  manifest,
  parsedMirror,
  assetPath,
  assetName,
  mirrorUrl,
}) {
  logger.log(`Publishing Gitee mirror: ${parsedMirror.owner}/${parsedMirror.repo} ${parsedMirror.tagName}`);
  logger.log(`  asset: ${assetName}`);

  let release = await getReleaseByTag({
    fetchImpl,
    token,
    owner: parsedMirror.owner,
    repo: parsedMirror.repo,
    tagName: parsedMirror.tagName,
  });
  let created = false;
  if (!release) {
    release = await createRelease({
      fetchImpl,
      token,
      owner: parsedMirror.owner,
      repo: parsedMirror.repo,
      tagName: parsedMirror.tagName,
      version: manifest.version,
      templateVersion: manifest.templateVersion,
      targetCommitish: options.targetCommitish,
    });
    created = true;
    logger.log(`  release: created ${parsedMirror.tagName}`);
  } else {
    logger.log(`  release: using existing ${parsedMirror.tagName}`);
  }

  const releaseId = release?.id;
  if (!releaseId) {
    throw new Error('Gitee release response is missing id');
  }

  const attachments = await listAttachments({
    fetchImpl,
    token,
    owner: parsedMirror.owner,
    repo: parsedMirror.repo,
    releaseId,
  });
  const existingAttachment = attachments.find((attachment) => attachmentName(attachment) === assetName);
  let uploaded = true;
  if (existingAttachment && !options.replace) {
    logger.log(`  upload: skipped existing ${assetName}`);
    uploaded = false;
  } else {
    if (existingAttachment && options.replace) {
      await deleteAttachment({
        fetchImpl,
        token,
        owner: parsedMirror.owner,
        repo: parsedMirror.repo,
        releaseId,
        attachmentId: existingAttachment.id,
      });
      logger.log(`  upload: replacing existing ${assetName}`);
    }
    await uploadAttachment({
      fetchImpl,
      token,
      owner: parsedMirror.owner,
      repo: parsedMirror.repo,
      releaseId,
      assetPath,
      assetName,
    });
    logger.log(`  upload: completed ${assetName}`);
  }

  const verified = await verifyMirrorUrl({ fetchImpl, mirrorUrl });
  logger.log(`  verified: ${mirrorUrl}`);
  return {
    repo: `${parsedMirror.owner}/${parsedMirror.repo}`,
    tagName: parsedMirror.tagName,
    assetName,
    assetPath,
    mirrorUrl,
    releaseId,
    created,
    uploaded,
    verified: verified.ok,
  };
}

export async function runGiteeMirrorRelease({
  argv = process.argv.slice(2),
  env = process.env,
  fetchImpl = fetch,
  logger = console,
} = {}) {
  const options = parseArgs(argv);
  if (options.help) {
    printUsage();
    return { help: true };
  }

  const manifest = readJson(options.manifestPath);
  assertManifestHasTemplateZip(manifest, options.manifestPath);
  const parsedMirror = parseGiteeReleaseDownloadUrl(manifest.templateZip.mirrorUrl);
  const assetPath = manifest.templateZip.path;
  const assetName = parsedMirror.assetName || path.basename(assetPath);
  const plan = {
    repo: `${parsedMirror.owner}/${parsedMirror.repo}`,
    tagName: parsedMirror.tagName,
    assetName,
    assetPath,
    mirrorUrl: manifest.templateZip.mirrorUrl,
    targetCommitish: options.targetCommitish,
  };

  if (options.dryRun) {
    logger.log(`Gitee mirror dry run: ${plan.repo} ${plan.tagName}`);
    logger.log(`  asset: ${plan.assetName}`);
    logger.log(`  local: ${plan.assetPath}`);
    logger.log(`  url: ${plan.mirrorUrl}`);
    return { dryRun: true, ...plan };
  }

  if (!options.confirmPublish) {
    throw new Error('Gitee publishing requires human confirmation. Re-run with --confirm-publish after reviewing the prepared artifacts.');
  }

  const token = resolveGiteeToken({ env, tokenFile: options.tokenFile });
  const mirroredTemplateZip = await mirrorGiteeAsset({
    fetchImpl,
    token,
    logger,
    options,
    manifest,
    parsedMirror,
    assetPath,
    assetName,
    mirrorUrl: plan.mirrorUrl,
  });

  let latestManifest = null;
  if (manifest.latestManifest?.path && manifest.latestManifest?.mirrorUrl) {
    const parsedLatestMirror = parseGiteeReleaseDownloadUrl(manifest.latestManifest.mirrorUrl);
    latestManifest = await mirrorGiteeAsset({
      fetchImpl,
      token,
      logger,
      options: { ...options, replace: true },
      manifest,
      parsedMirror: parsedLatestMirror,
      assetPath: manifest.latestManifest.path,
      assetName: parsedLatestMirror.assetName || manifest.latestManifest.name || path.basename(manifest.latestManifest.path),
      mirrorUrl: manifest.latestManifest.mirrorUrl,
    });
  }

  return {
    ...plan,
    releaseId: mirroredTemplateZip.releaseId,
    created: mirroredTemplateZip.created,
    uploaded: mirroredTemplateZip.uploaded,
    verified: mirroredTemplateZip.verified,
    ...(latestManifest ? { latestManifest } : {}),
  };
}

async function main() {
  if (process.env.AXHUB_MAKE_GITEE_MIRROR_SKIP_MAIN === '1') {
    return;
  }
  try {
    await runGiteeMirrorRelease();
  } catch (error) {
    console.error(error?.message || error);
    process.exitCode = 1;
  }
}

await main();
