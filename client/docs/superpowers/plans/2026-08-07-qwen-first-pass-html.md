# Qwen First-Pass HTML Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 用已有截图、RapidOCR 文本和 Qwen 3.7 Plus 组件树，调用 Qwen 生成一份可直接打开评审的单文件移动端 HTML。

**Architecture:** 本地脚本先按 Qwen 标记的素材区域从原图做确定性裁切，再把截图、组件树、OCR 和素材清单一起提供给 Qwen。模型只返回独立 HTML；脚本提取并校验 HTML 后写入结果目录，浏览器验证器负责截图、错误收集和交互冒烟检查。

**Tech Stack:** Node.js 20+、原生 `node:test`、Sharp、OpenAI 兼容 Chat Completions API、Puppeteer/Midscene。

## Global Constraints

- 所有脚本和生成产物只写入 `apps/axhub-make/client/.local/`。
- 使用 Qwen 3.7 Plus 与已有 RapidOCR 结果，不使用 SAM2。
- 输出不能把整张原图作为页面背景；复杂素材只能引用局部裁片。
- 不修改正式原型、主规格和截图还原核心流程。
- 不把 API Key 写入日志、HTML 或结果 JSON。

---

### Task 1: HTML 生成核心

**Files:**
- Create: `.local/vision-model-benchmark/test-html-generation-core.mjs`
- Create: `.local/vision-model-benchmark/html-generation-core.mjs`

**Interfaces:**
- Consumes: Qwen 文本响应、组件树、OCR 列表和素材清单。
- Produces: `extractHtmlDocument(text): string`、`buildHtmlPrompt(input): string`、`validateGeneratedHtml(html, options): object`。

- [ ] **Step 1: Write the failing test**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { extractHtmlDocument, validateGeneratedHtml } from './html-generation-core.mjs';

test('extracts a fenced standalone document', () => {
  assert.equal(extractHtmlDocument('```html\n<!doctype html><html><body>ok</body></html>\n```'), '<!doctype html><html><body>ok</body></html>');
});

test('rejects a full-page source screenshot dependency', () => {
  assert.throws(() => validateGeneratedHtml('<!doctype html><html><body><img src="../source.png"></body></html>', { requiredTexts: [] }), /source screenshot/i);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test .local/vision-model-benchmark/test-html-generation-core.mjs`

Expected: FAIL because `html-generation-core.mjs` does not exist.

- [ ] **Step 3: Write minimal implementation**

```js
export function extractHtmlDocument(text) {
  const source = String(text).trim();
  const fenced = source.match(/```html\s*([\s\S]*?)```/i)?.[1]?.trim();
  const html = fenced ?? source.slice(source.search(/<!doctype html>|<html/i));
  if (!/^<!doctype html>/i.test(html) || !/<\/html>\s*$/i.test(html)) throw new Error('Qwen response is not a standalone HTML document');
  return html;
}

export function buildHtmlPrompt({ canvas, componentTree, ocr, assets }) {
  return `生成 432×912 移动端单文件 HTML。输入截图是 ${canvas.width} × ${canvas.height}。布局依据 Qwen 组件树：${JSON.stringify(componentTree)}。文字依据 RapidOCR：${JSON.stringify(ocr)}。只能使用这些局部素材：${assets.map((asset) => asset.path).join(', ')}。禁止引用 source.png、外部 URL、框架和整图背景。只返回完整 HTML。`;
}

export function validateGeneratedHtml(html, { requiredTexts, allowedAssets = [] }) {
  if (!/^<!doctype html>/i.test(html.trim())) throw new Error('Missing doctype');
  if (/source\.png/i.test(html)) throw new Error('Generated HTML references the source screenshot');
  if (/https?:\/\//i.test(html)) throw new Error('Generated HTML references an external URL');
  for (const text of requiredTexts) if (!html.includes(text)) throw new Error(`Missing required text: ${text}`);
  const assets = [...html.matchAll(/(?:src|url\()=["']?([^"')]+)/gi)].map((match) => match[1]).filter((value) => value.startsWith('assets/'));
  for (const asset of assets) if (!allowedAssets.includes(asset)) throw new Error(`Undeclared asset: ${asset}`);
  return { requiredTextCount: requiredTexts.length, assetCount: assets.length };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test .local/vision-model-benchmark/test-html-generation-core.mjs`

Expected: all tests PASS.

### Task 2: Qwen Generation Runner

**Files:**
- Create: `.local/vision-model-benchmark/run-qwen-html.mjs`
- Create: `.local/vision-model-benchmark/results/municipal-government-services-home/qwen3.7-plus/assets/*.png`
- Create: `.local/vision-model-benchmark/results/municipal-government-services-home/qwen3.7-plus/generated-raw.txt`
- Create: `.local/vision-model-benchmark/results/municipal-government-services-home/qwen3.7-plus/generated.html`

**Interfaces:**
- Consumes: `credentials.env`、`source.png`、`component-tree.json`、RapidOCR `ocr.json`。
- Produces: standalone HTML and local image crops referenced through `assets/<name>.png`.

- [ ] **Step 1: Add a failing runner contract test**

Extend `test-html-generation-core.mjs` to require the prompt to contain `863 × 1823`、`Qwen 组件树`、`RapidOCR` and every declared asset path.

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test .local/vision-model-benchmark/test-html-generation-core.mjs`

Expected: FAIL on missing prompt fields.

- [ ] **Step 3: Implement asset cropping and Qwen request**

```js
for (const asset of assetSpecs) {
  await sharp(sourcePath).extract(asset.bbox).png().toFile(path.join(resultDir, asset.path));
}
const response = await fetch(`${config.baseUrl}/chat/completions`, {
  method: 'POST',
  headers: { authorization: `Bearer ${config.apiKey}`, 'content-type': 'application/json' },
  body: JSON.stringify({
    model: config.model,
    messages: [{ role: 'user', content: [
      { type: 'text', text: buildHtmlPrompt(context) },
      { type: 'image_url', image_url: { url: sourceDataUrl, detail: 'high' } },
    ] }],
    temperature: 0.1,
    max_tokens: 12000,
    enable_thinking: false,
  }),
});
if (!response.ok) throw new Error(`Qwen request failed: ${response.status}`);
const payload = await response.json();
const raw = payload.choices?.[0]?.message?.content ?? '';
const html = extractHtmlDocument(raw);
validateGeneratedHtml(html, { requiredTexts, allowedAssets: assetSpecs.map((asset) => asset.path) });
await Promise.all([
  fs.writeFile(path.join(resultDir, 'generated-raw.txt'), raw),
  fs.writeFile(path.join(resultDir, 'generated.html'), html),
]);
```

- [ ] **Step 4: Run the generator**

Run: `node .local/vision-model-benchmark/run-qwen-html.mjs`

Expected: exit 0 with paths for `generated.html` and `generated-raw.txt`, without any credential value in stdout.

### Task 3: Browser Validation

**Files:**
- Create: `.local/vision-model-benchmark/validate-generated-html.mjs`
- Create: `.local/vision-model-benchmark/results/municipal-government-services-home/qwen3.7-plus/generated-render.png`
- Create: `.local/vision-model-benchmark/results/municipal-government-services-home/qwen3.7-plus/generated-browser-validation.json`

**Interfaces:**
- Consumes: `generated.html` at a 432 × 912 viewport.
- Produces: screenshot plus `{consoleErrors, failedImages, horizontalOverflow, interactions}`.

- [ ] **Step 1: Write the browser assertions**

```js
const requiredTexts = ['政务服务', '搜索事项、政策、办件', '扫一扫', '预约', '咨询', '进度', '社保', '医保', '公积金', '户政', '交通', '税务', '教育', '企业服务', '热门服务', '通知公告', '首页', '办事', '资讯', '我的'];
for (const text of requiredTexts) {
  if (!(await page.locator('body').innerText()).includes(text)) throw new Error(`Missing visible text: ${text}`);
}
const metrics = await page.evaluate(() => ({
  horizontalOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
  failedImages: [...document.images].filter((image) => !image.complete || image.naturalWidth === 0).length,
}));
if (metrics.horizontalOverflow || metrics.failedImages) throw new Error(JSON.stringify(metrics));
```

- [ ] **Step 2: Run deterministic validation**

Run: `node .local/vision-model-benchmark/validate-generated-html.mjs`

Expected: exit 0, no console errors, no failed images, no horizontal overflow, and all interaction checks true.

- [ ] **Step 3: Run visual browser assertion**

Open `generated.html` through Midscene and assert that it is a complete mobile government-service homepage with the same major information hierarchy as `source.png`.

- [ ] **Step 4: Inspect final screenshot**

Open `generated-render.png` and report visible fidelity gaps without silently hand-correcting the model's first-pass output.
