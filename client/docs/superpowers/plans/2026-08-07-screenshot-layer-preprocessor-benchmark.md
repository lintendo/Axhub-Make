# Screenshot Layer Preprocessor Benchmark Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Generate and validate a local, layer-first machine HTML plus review page from `src/resources/image-2.png`, then stop before any AI semantic review.

**Architecture:** A temporary Python runner uses RapidOCR with PP-OCRv6 small and SAM 2.1 Tiny to produce OCR rectangles and class-agnostic masks. A deterministic pixel partition assigns every source pixel to exactly one OCR, SAM, or base layer, exports cropped PNGs and JSON, and renders interactive HTML. A temporary browser validator captures the fixed `863×1823 / DPR 1` stage and verifies resources and controls before handoff.

**Tech Stack:** Python 3.10+ via `uv`, RapidOCR 3.9.2, ONNX Runtime, Pillow, NumPy, PyTorch, SAM 2.1 Tiny, Node.js, Playwright/Chrome.

## Global Constraints

- Input is exactly `src/resources/image-2.png` with viewport `863×1823 / DPR 1`.
- All implementation scripts and generated artifacts stay under `.local/` and are not committed.
- Do not modify `.agents/skills/screenshot-to-prototype/`, formal tests, or React prototype files.
- Do not run AI semantic review, generate `ai-patch.json`, call image generation, or use `rembg` in this phase.
- Deliver `machine.html` and `review.html` immediately after mechanical validation, then stop.
- A core RapidOCR or SAM failure is fatal; individual unusable masks remain in the base layer and are reported as unresolved.
- The committed design is `docs/superpowers/specs/2026-08-07-screenshot-layer-preprocessor-benchmark-design.md`.

---

## File Structure

- Create `.local/test-scripts/screenshot-layer-preprocessor/preprocess.py`: model adapters, pure geometry and mask functions, artifact export, HTML generation, and CLI.
- Create `.local/test-scripts/screenshot-layer-preprocessor/test_preprocess.py`: pure-function and synthetic artifact tests that do not load OCR or SAM weights.
- Create `.local/test-scripts/screenshot-layer-preprocessor/validate-machine.mjs`: browser capture and interaction/resource checks.
- Generate `.local/screenshot-preprocessor/municipal-government-services-home/`: JSON, PNG layers, machine HTML, capture, metrics, and review HTML.

The temporary benchmark intentionally keeps the implementation in one focused Python module so the experiment can be reviewed before any permanent package boundary is chosen. The browser validator is separate because browser lifecycle and capture do not belong in the image model process.

### Task 1: Pure Pixel Partition and Scene Contracts

**Files:**
- Create: `.local/test-scripts/screenshot-layer-preprocessor/test_preprocess.py`
- Create: `.local/test-scripts/screenshot-layer-preprocessor/preprocess.py`

**Interfaces:**
- Produces: `normalize_bbox(points, width, height) -> tuple[int, int, int, int]`
- Produces: `mask_iou(left, right) -> float`
- Produces: `filter_sam_masks(raw_masks, image_area, min_area_ratio, max_area_ratio, duplicate_iou, max_layers) -> list[dict]`
- Produces: `partition_masks(width, height, ocr_regions, sam_masks) -> tuple[list[LayerPixels], numpy.ndarray]`
- Produces: `stable_id(prefix, payload) -> str`

- [ ] **Step 1: Write failing pure-function tests**

```python
def test_partition_assigns_each_pixel_once():
    ocr = [{"id": "ocr-a", "bbox": [1, 1, 3, 2]}]
    sam_mask = np.zeros((4, 5), dtype=bool)
    sam_mask[0:3, 0:4] = True
    layers, base = partition_masks(5, 4, ocr, [{"id": "sam-a", "segmentation": sam_mask}])
    total = base.astype(np.uint8)
    for layer in layers:
        total += layer.mask.astype(np.uint8)
    assert np.all(total == 1)

def test_normalize_bbox_clamps_quad_to_image():
    assert normalize_bbox([[-4, 2], [12, 2], [12, 8], [-4, 8]], 10, 6) == (0, 2, 10, 6)
```

- [ ] **Step 2: Run tests and verify the missing module/functions fail**

Run:

```bash
cd apps/axhub-make/client
uv run --with numpy --with pillow .local/test-scripts/screenshot-layer-preprocessor/test_preprocess.py
```

Expected: non-zero exit with an import or missing-function error.

- [ ] **Step 3: Implement immutable layer records and pure functions**

```python
@dataclass(frozen=True)
class LayerPixels:
    id: str
    source_type: str
    bbox: tuple[int, int, int, int]
    mask: np.ndarray
    score: float | None
    text: str | None = None

def stable_id(prefix: str, payload: object) -> str:
    encoded = json.dumps(payload, ensure_ascii=False, sort_keys=True).encode("utf-8")
    return f"{prefix}-{hashlib.sha256(encoded).hexdigest()[:12]}"
```

Implement OCR-first ownership, then ascending-area SAM ownership, then base ownership. Ensure every mask is boolean and exactly `height × width`.

- [ ] **Step 4: Run pure tests and verify they pass**

Run the command from Step 2.

Expected: `Ran ... tests` followed by `OK`.

- [ ] **Step 5: Confirm temporary files remain ignored**

Run:

```bash
git check-ignore -v .local/test-scripts/screenshot-layer-preprocessor/preprocess.py
git status --short -- .local/test-scripts/screenshot-layer-preprocessor
```

Expected: `.local` ignore rule is reported and Git status prints no tracked change. Do not commit the ignored implementation.

### Task 2: Synthetic Artifact and HTML Generation

**Files:**
- Modify: `.local/test-scripts/screenshot-layer-preprocessor/test_preprocess.py`
- Modify: `.local/test-scripts/screenshot-layer-preprocessor/preprocess.py`

**Interfaces:**
- Consumes: `LayerPixels`, `partition_masks`, and `stable_id` from Task 1.
- Produces: `export_layers(source, layers, base_mask, output_dir) -> list[dict]`
- Produces: `build_machine_html(scene) -> str`
- Produces: `build_review_html(scene, metrics) -> str`
- Produces: `write_artifacts(source_path, output_dir, ocr_payload, sam_payload, timings) -> dict`

- [ ] **Step 1: Add a failing synthetic export test**

```python
def test_synthetic_export_recomposes_source(self):
    source = Image.new("RGB", (8, 6), "white")
    pixels = np.asarray(source).copy()
    pixels[1:4, 2:6] = [20, 90, 220]
    source = Image.fromarray(pixels)
    result = write_artifacts_from_candidates(
        source=source,
        source_path=Path("synthetic.png"),
        output_dir=self.tempdir,
        ocr_regions=[{"id": "ocr-a", "text": "测试", "score": 0.99, "points": [[0, 4], [4, 4], [4, 6], [0, 6]]}],
        sam_masks=[{"id": "sam-a", "segmentation": blue_mask, "score": 0.95}],
        timings={"ocr_seconds": 0.01, "sam_seconds": 0.02},
    )
    assert result["metrics"]["coverage_ratio"] == 1.0
    assert (self.tempdir / "machine.html").is_file()
    assert (self.tempdir / "review.html").is_file()
```

- [ ] **Step 2: Run tests and verify artifact functions are missing**

Run the Task 1 test command.

Expected: FAIL naming `write_artifacts_from_candidates` or another new artifact function.

- [ ] **Step 3: Implement cropped PNG export and JSON schemas**

Each non-base PNG is cropped to its bbox and positioned by scene `x` and `y`; base remains full-canvas. Write `source-summary.json`, `ocr.json`, `layers.json`, `machine-scene.json`, and `metrics.json` with schema version `1` and relative resource paths only.

```python
scene_layer = {
    "id": layer.id,
    "sourceType": layer.source_type,
    "file": f"layers/{layer.id}.png",
    "x": left,
    "y": top,
    "width": right - left,
    "height": bottom - top,
    "bbox": [left, top, right - left, bottom - top],
    "score": layer.score,
    "text": layer.text,
    "status": "accepted",
}
```

- [ ] **Step 4: Implement machine and review HTML**

The machine page must provide checkboxes, active-layer radio buttons, isolate/reset actions, bbox and OCR overlays, pointer dragging, and `?capture=1` mode that renders only the fixed stage. Embed scene JSON directly so `file:` URLs do not require `fetch`.

The review page must show the source, `machine-render.png`, the machine page in an iframe, metrics, OCR rows, unresolved counts, and a checkerboard layer gallery. Embed metrics and summary JSON directly.

- [ ] **Step 5: Run tests and verify synthetic artifacts pass**

Run the Task 1 test command.

Expected: all pure and synthetic tests pass; no model downloads occur.

### Task 3: RapidOCR and SAM 2.1 Benchmark Run

**Files:**
- Modify: `.local/test-scripts/screenshot-layer-preprocessor/preprocess.py`
- Generate: `.local/screenshot-preprocessor/municipal-government-services-home/**`

**Interfaces:**
- Consumes: source image, output directory, and SAM checkpoint CLI arguments.
- Produces: the complete first-stage artifact tree and prints a one-line JSON summary.

- [ ] **Step 1: Add model adapters behind injectable functions**

```python
def run_ocr(source_path: Path) -> tuple[list[dict], dict]:
    from rapidocr import RapidOCR
    engine = RapidOCR()
    result = engine(str(source_path))
    regions = [
        {
            "id": stable_id("ocr", {"points": box.tolist(), "text": text}),
            "points": np.asarray(box, dtype=float).round(2).tolist(),
            "text": text,
            "score": float(score),
            "order": index,
        }
        for index, (box, text, score) in enumerate(zip(result.boxes, result.txts, result.scores), start=1)
    ]
    return regions, {"runtime": "rapidocr", "model": "PP-OCRv6-small"}
```

Use `SAM2AutomaticMaskGenerator` with `points_per_side=16`, `pred_iou_thresh=0.82`, `stability_score_thresh=0.92`, no crop layers, and hard binary masks. Use the cached checkpoint passed explicitly on the CLI.

- [ ] **Step 2: Run the real benchmark**

Run:

```bash
cd apps/axhub-make/client
uv run .local/test-scripts/screenshot-layer-preprocessor/preprocess.py \
  src/resources/image-2.png \
  .local/screenshot-preprocessor/municipal-government-services-home \
  --checkpoint "/Users/jianzhoulin/Documents/Codex/2026-08-03/new-chat/outputs/layerize-image/models/sam2.1_hiera_tiny.pt" \
  --points-per-side 16
```

Expected: RapidOCR downloads or reuses PP-OCRv6 small, SAM uses MPS when available, and the command prints counts, timings, and output paths without creating `ai-patch.json`.

- [ ] **Step 3: Inspect mechanical metrics without semantic edits**

Run:

```bash
jq '{ocrCount, layerCount, unresolvedCount, coverageRatio, timings}' \
  .local/screenshot-preprocessor/municipal-government-services-home/metrics.json
find .local/screenshot-preprocessor/municipal-government-services-home/layers -type f | wc -l
```

Expected: coverage ratio `1`, positive OCR and layer counts, zero missing referenced files. Do not rename, merge, split, or visually correct any layer.

### Task 4: Browser Validation and User Handoff

**Files:**
- Create: `.local/test-scripts/screenshot-layer-preprocessor/validate-machine.mjs`
- Modify: `.local/screenshot-preprocessor/municipal-government-services-home/metrics.json`
- Regenerate: `.local/screenshot-preprocessor/municipal-government-services-home/review.html`

**Interfaces:**
- Consumes: `machine.html`, `machine-scene.json`, and fixed output path.
- Produces: `machine-render.png` and `browserValidation` metrics.

- [ ] **Step 1: Implement browser validator**

```javascript
const page = await browser.newPage({ viewport: { width: 863, height: 1823 }, deviceScaleFactor: 1 });
const errors = [];
page.on('console', message => message.type() === 'error' && errors.push(message.text()));
page.on('pageerror', error => errors.push(error.message));
await page.goto(`${pathToFileURL(machineHtml)}?capture=1`, { waitUntil: 'networkidle' });
const stage = page.locator('#stage');
await stage.screenshot({ path: renderPath });
```

Also open normal mode, toggle the first non-base layer, toggle bbox/OCR overlays, activate isolate/reset, and assert all scene images have positive `naturalWidth`.

- [ ] **Step 2: Run browser validation**

Run:

```bash
node .local/test-scripts/screenshot-layer-preprocessor/validate-machine.mjs \
  .local/screenshot-preprocessor/municipal-government-services-home
```

Expected: JSON reports `863×1823`, zero console errors, zero failed images, and all required controls exercised.

- [ ] **Step 3: Regenerate review page with final capture metrics**

Run the Python CLI with `--render-review-only` so it reads existing JSON and `machine-render.png` without rerunning OCR or SAM.

Expected: `review.html` includes the captured machine image and browser validation summary.

- [ ] **Step 4: Run final mechanical verification**

Run:

```bash
uv run --with numpy --with pillow .local/test-scripts/screenshot-layer-preprocessor/test_preprocess.py
jq -e '.coverageRatio == 1 and .browserValidation.consoleErrors == 0 and .browserValidation.failedImages == 0' \
  .local/screenshot-preprocessor/municipal-government-services-home/metrics.json
git status --short -- .local
```

Expected: tests pass, `jq` exits `0`, and Git reports no `.local` changes.

- [ ] **Step 5: Stop and hand off HTML**

Open `review.html` for the user and provide clickable absolute links to both `review.html` and `machine.html`, plus the measured OCR/layer counts, unresolved count, and cold/warm timings. Explicitly state that AI review has not started and wait for the user's instruction.

Do not invoke AI semantic review, do not create `ai-patch.json`, and do not modify the formal screenshot skill.
