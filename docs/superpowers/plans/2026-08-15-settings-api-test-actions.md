# Settings API Test Actions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the image API action spacing and add real, secret-safe connectivity tests for Doubao speech, the OpenAI-compatible web-task API, and the OpenAI-compatible vision API.

**Architecture:** Keep outbound probe logic in a focused server module behind one project-scoped config endpoint. Merge unsaved section drafts with saved secrets in memory, then let the existing settings component own three independent button states without persisting tests.

**Tech Stack:** React 18.2, TypeScript 5.x, Node fetch, `ws`, Vitest, Tailwind CSS, pnpm.

**Spec:** `docs/superpowers/specs/2026-08-15-settings-api-test-actions-design.md`

## Global Constraints

- Use pnpm only.
- Preserve React 18.2.0 and TypeScript 5.x.
- Do not add compatibility paths for removed legacy voice fields.
- Never return, log, snapshot, or assert a plaintext API key.
- Keep remote endpoints HTTPS/WSS-only; permit HTTP/WS only for loopback hosts.
- Do not create temporary HTML or HTML reports.
- The worktree already contains overlapping user changes, so do not commit or stage files.

---

### Task 1: Pure in-memory voice settings merge

**Files:**
- Modify: `src/server/projectCore/voice-assistant-settings.ts`
- Test: `src/server/projectCore/voice-assistant-settings.test.ts`

**Interfaces:**
- Produces: `mergeVoiceAssistantSettingsPatch(current, patch, { clearSecrets? }): VoiceAssistantSettings`.
- Consumes: existing `VoiceAssistantSettings`, `VoiceAssistantSettingsPatch`, `VoiceAssistantSecretPath`, and URL normalization.

- [ ] **Step 1: Write the failing merge tests**

```ts
it('merges a draft in memory without changing the saved settings file', () => {
  const current = readVoiceAssistantSettings({ homeDir });
  const merged = mergeVoiceAssistantSettingsPatch(current, {
    processing: { model: 'draft-model' },
  });
  expect(merged.processing.model).toBe('draft-model');
  expect(readVoiceAssistantSettings({ homeDir }).processing.model).not.toBe('draft-model');
});

it('applies explicit secret clears to an in-memory merge', () => {
  const current = readVoiceAssistantSettings({ homeDir });
  const merged = mergeVoiceAssistantSettingsPatch(current, {}, {
    clearSecrets: ['doubao.accessKey'],
  });
  expect(merged.doubao.accessKey).toBe('');
});
```

- [ ] **Step 2: Run the focused test and verify RED**

Run: `pnpm exec vitest run src/server/projectCore/voice-assistant-settings.test.ts`

Expected: FAIL because `mergeVoiceAssistantSettingsPatch` is not exported.

- [ ] **Step 3: Extract the pure merge implementation**

```ts
export function mergeVoiceAssistantSettingsPatch(
  current: VoiceAssistantSettings,
  patch: VoiceAssistantSettingsPatch,
  options: { clearSecrets?: readonly VoiceAssistantSecretPath[] } = {},
): VoiceAssistantSettings {
  const next = applyPatch(current, patch);
  for (const secretPath of options.clearSecrets || []) clearVoiceSecret(next, secretPath);
  return next;
}
```

Update `writeVoiceAssistantSettingsPatch` to call this function before its existing atomic write.

- [ ] **Step 4: Run the focused test and verify GREEN**

Run: `pnpm exec vitest run src/server/projectCore/voice-assistant-settings.test.ts`

Expected: PASS.

### Task 2: Provider probe module

**Files:**
- Create: `src/server/voiceAssistantConfigTest.ts`
- Create: `src/server/voiceAssistantConfigTest.test.ts`
- Modify: `package.json`
- Modify: `pnpm-lock.yaml`

**Interfaces:**
- Consumes: `mergeVoiceAssistantSettingsPatch` from Task 1.
- Produces: `testVoiceAssistantConfig(params): Promise<{ message: string }>` and `VoiceAssistantConfigTestError` with `statusCode`.

- [ ] **Step 1: Add failing request-construction and validation tests**

```ts
it('uses a saved key when the draft leaves it blank', async () => {
  const fetchImpl = vi.fn(async (_url, init) => {
    expect(init?.headers).toMatchObject({ Authorization: 'Bearer saved-key' });
    return Response.json({ choices: [{ message: { content: 'OK' } }] });
  });
  await testVoiceAssistantConfig({
    body: { section: 'processing', patch: { processing: { model: 'draft-model' } } },
    savedSettings,
    fetchImpl,
  });
});

it('does not fall back after an explicit clear', async () => {
  await expect(testVoiceAssistantConfig({
    body: { section: 'processing', patch: {}, clearSecrets: ['processing.apiKey'] },
    savedSettings,
    fetchImpl: vi.fn(),
  })).rejects.toMatchObject({ statusCode: 400 });
});

it('sends a tiny image using OpenAI-compatible multimodal content', async () => {
  const fetchImpl = vi.fn(async (url, init) => {
    expect(String(url)).toMatch(/\/chat\/completions$/u);
    const body = JSON.parse(String(init?.body));
    expect(body.messages[1].content).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: 'text' }),
      expect.objectContaining({ type: 'image_url' }),
    ]));
    return Response.json({ choices: [{ message: { content: 'OK' } }] });
  });
  await testVoiceAssistantConfig({
    body: { section: 'vision', patch: { vision: { endpoint: 'https://vision.example/v1', model: 'vision-1' } } },
    savedSettings,
    fetchImpl,
  });
});
```

- [ ] **Step 2: Run the new test and verify RED**

Run: `pnpm exec vitest run src/server/voiceAssistantConfigTest.test.ts`

Expected: FAIL because the module does not exist.

- [ ] **Step 3: Implement shared HTTP probing and error sanitization**

```ts
export type VoiceAssistantTestSection = 'doubao' | 'processing' | 'vision';

export class VoiceAssistantConfigTestError extends Error {
  constructor(message: string, readonly statusCode = 502) {
    super(message);
  }
}

export async function testVoiceAssistantConfig(params: {
  body: unknown;
  savedSettings: VoiceAssistantSettings;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  openDoubaoSessionImpl?: DoubaoSessionProbe;
}): Promise<{ message: string }>;
```

Normalize both HTTP URLs so an exact `/chat/completions` path is preserved and a base path gains `/chat/completions`. Send `temperature: 0`, a minimal token limit, and require non-empty `choices[0].message.content`. Use an embedded 1×1 PNG data URL for vision. Sanitize every provider/network error to 500 characters and replace all active secret values with `***`.

- [ ] **Step 4: Add failing Doubao frame/session tests**

```ts
it('builds the ACP-compatible Doubao authentication headers', () => {
  expect(buildDoubaoHeaders({ appId: 'app', accessKey: 'secret' }, 'connect-id')).toEqual({
    'X-Api-App-ID': 'app',
    'X-Api-Access-Key': 'secret',
    'X-Api-Resource-Id': 'volc.speech.dialog',
    'X-Api-App-Key': 'PlgvMymc7f3tQnJ6',
    'X-Api-Connect-Id': 'connect-id',
  });
});

it('requires SessionStarted before the Doubao probe passes', async () => {
  const socket = createFakeDoubaoSocket([
    { event: 50, sessionId: '' },
    { event: 150, sessionId: 'session-1' },
  ]);
  await testVoiceAssistantConfig({
    body: { section: 'doubao', patch: { doubao: { appId: 'app', accessKey: 'secret' } } },
    savedSettings,
    openDoubaoSessionImpl: async () => socket,
  });
  expect(socket.sentEvents).toEqual([1, 100]);
});
```

- [ ] **Step 5: Add `ws` as an explicit runtime dependency and implement the Doubao probe**

Run: `pnpm add ws@^8.18.3 && pnpm add -D @types/ws@^8.18.1`

Implement the ACP protocol constants, gzip JSON event encoder/decoder, authenticated WebSocket creation, `StartConnection`, minimal `StartSession`, `SessionStarted` success, error-frame handling, timeout cleanup, and socket close. Default an empty speaker to `zh_female_vv_jupiter_bigtts`.

- [ ] **Step 6: Run the provider tests and verify GREEN**

Run: `pnpm exec vitest run src/server/voiceAssistantConfigTest.test.ts src/server/projectCore/voice-assistant-settings.test.ts`

Expected: PASS and no real provider call.

### Task 3: Project-scoped test API

**Files:**
- Modify: `src/server/managementApi.config.ts`
- Modify: `src/server/managementApi.config.voice.source.test.ts`
- Modify: `src/server/__tests__/voice-assistant-settings-api.test.ts`

**Interfaces:**
- Consumes: `testVoiceAssistantConfig` from Task 2 and the existing global voice settings store.
- Produces: `POST /api/config/voice-assistant/test` returning secret-safe JSON.

- [ ] **Step 1: Write failing router and API tests**

```ts
expect(source).toContain("pathname === '/api/config/voice-assistant/test'");
expect(source).toContain('testVoiceAssistantConfig');

it('tests an unsaved processing draft with the saved key without persisting it', async () => {
  // Start a loopback mock chat/completions server, save a key, post a draft model,
  // assert Bearer auth and draft model, then reread the settings file unchanged.
});
```

Also assert that response text never contains the saved or draft key and that non-POST methods return 405.

- [ ] **Step 2: Run API tests and verify RED**

Run: `pnpm exec vitest run src/server/managementApi.config.voice.source.test.ts src/server/__tests__/voice-assistant-settings-api.test.ts`

Expected: FAIL because the route is missing.

- [ ] **Step 3: Add the thin route**

```ts
if (pathname === '/api/config/voice-assistant/test') {
  if (req.method !== 'POST') {
    sendJson(res, { error: 'Method not allowed' }, { status: 405 });
    return true;
  }
  readJsonBody(req).then(async (body) => {
    const result = await testVoiceAssistantConfig({
      body,
      savedSettings: readVoiceAssistantSettings(settingsOptions),
    });
    sendJson(res, { success: true, message: result.message });
  }).catch((error) => {
    sendJson(res, { success: false, error: sanitizeVoiceAssistantTestError(error) }, {
      status: error?.statusCode || 502,
    });
  });
  return true;
}
```

- [ ] **Step 4: Run API tests and verify GREEN**

Run: `pnpm exec vitest run src/server/managementApi.config.voice.source.test.ts src/server/__tests__/voice-assistant-settings-api.test.ts`

Expected: PASS.

### Task 4: Frontend test request and independent UI states

**Files:**
- Modify: `src/index/components/settings/voiceAssistantSettingsForm.ts`
- Modify: `src/index/components/settings/VoiceAssistantSettingsSection.tsx`
- Modify: `src/index/components/settings/VoiceAssistantSettingsSection.test.ts`

**Interfaces:**
- Consumes: `POST /api/config/voice-assistant/test` from Task 3.
- Produces: `buildVoiceAssistantSettingsTestRequest(draft, section)` and three test action rows.

- [ ] **Step 1: Write failing request-helper and source tests**

```ts
expect(buildVoiceAssistantSettingsTestRequest(draft, 'processing')).toEqual({
  section: 'processing',
  patch: { processing: { baseUrl: 'https://api.openai.com/v1', model: 'gpt-4.1-mini' } },
  clearSecrets: [],
});

expect(sectionSource).toContain('测试豆包配置');
expect(sectionSource).toContain('测试网页任务配置');
expect(sectionSource).toContain('测试视觉配置');
expect(sectionSource).toContain("'/api/config/voice-assistant/test'");
expect(sectionSource.match(/data-voice-config-test-actions/gu)).toHaveLength(3);
```

Add a clear-path case proving only the target section's secret path is sent.

- [ ] **Step 2: Run the frontend test and verify RED**

Run: `pnpm exec vitest run src/index/components/settings/VoiceAssistantSettingsSection.test.ts`

Expected: FAIL because the helper and buttons are missing.

- [ ] **Step 3: Implement the helper and UI actions**

```ts
type VoiceConfigTestState = {
  status: 'idle' | 'testing' | 'passed' | 'failed';
  message?: string;
};

const [testStates, setTestStates] = useState<Record<VoiceAssistantTestSection, VoiceConfigTestState>>({
  doubao: { status: 'idle' },
  processing: { status: 'idle' },
  vision: { status: 'idle' },
});
```

Implement one `handleTest(section)` and a small internal action-row component. Use `withProjectScope`, disable only the active section while it is testing, render a spinner, wrap long feedback, and show success/error toast. Place each action row after its section grid with `mt-4`.

- [ ] **Step 4: Run the frontend test and verify GREEN**

Run: `pnpm exec vitest run src/index/components/settings/VoiceAssistantSettingsSection.test.ts`

Expected: PASS.

### Task 5: Image action spacing regression

**Files:**
- Modify: `src/index/components/SettingsDialog.tsx`
- Modify: `src/index/components/SettingsDialog.source.test.ts`

**Interfaces:**
- Produces: 16px separation between the image form grid and its action row.

- [ ] **Step 1: Write the failing spacing assertion**

```ts
expect(imageSectionSource).toContain(
  'data-ai-image-config-actions className="mt-4 flex flex-wrap items-center gap-2"',
);
expect(imageSectionSource).not.toContain(
  'data-ai-image-config-actions className="flex flex-wrap items-center gap-2 pt-1"',
);
```

- [ ] **Step 2: Run the source test and verify RED**

Run: `pnpm exec vitest run src/index/components/SettingsDialog.source.test.ts`

Expected: FAIL on the new spacing assertion.

- [ ] **Step 3: Apply the minimal class change**

Replace the action row's `pt-1` with `mt-4` and keep all button behavior unchanged.

- [ ] **Step 4: Run the source test and verify GREEN**

Run: `pnpm exec vitest run src/index/components/SettingsDialog.source.test.ts`

Expected: PASS.

### Task 6: Verification and review

**Files:**
- Inspect all files changed by Tasks 1–5.

**Interfaces:**
- Consumes: all completed implementation tasks.
- Produces: test, type, build, visual, and independent-review evidence.

- [ ] **Step 1: Run the complete focused suite**

Run:

```bash
pnpm exec vitest run \
  src/server/projectCore/voice-assistant-settings.test.ts \
  src/server/voiceAssistantConfigTest.test.ts \
  src/server/managementApi.config.voice.source.test.ts \
  src/server/__tests__/voice-assistant-settings-api.test.ts \
  src/index/components/settings/VoiceAssistantSettingsSection.test.ts \
  src/index/components/SettingsDialog.source.test.ts
```

Expected: PASS.

- [ ] **Step 2: Run affected package verification**

Run: `pnpm server:build`

Run: `pnpm admin:build`

Expected: both commands exit 0.

- [ ] **Step 3: Verify in the real Make UI**

Start the existing full server with `pnpm server:dev -- --host 127.0.0.1 --no-open`. Use browser automation against the served admin page; do not create HTML. Confirm the image action gap visually, confirm each new button is present, and exercise a missing-config failure without sending real credentials.

- [ ] **Step 4: Request independent code review**

Dispatch the review required by L3. The reviewer must inspect the final diff for secret leakage, draft-vs-saved semantics, timeout cleanup, provider response validation, scope containment, and preservation of unrelated user changes.

- [ ] **Step 5: Inspect final diff and status**

Run: `git diff --check` and a path-scoped `git diff`/`git status`. Confirm no generated outputs, temporary files, credentials, or unrelated changes were added by this task.
