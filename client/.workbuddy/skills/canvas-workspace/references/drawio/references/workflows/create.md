# Workflow: /drawio create

Create diagrams from text, Mermaid, CSV, or explicit YAML spec using the Draw.io design system.

## Trigger

- **Command**: `/drawio create ...`
- **Keywords**: `create`, `generate`, `make`, `draw`, `生成`, `创建`

## Route Selection

Determine the route before asking questions:

1. **Fast Path**
   - Use when the request already specifies the diagram type and at least 3 of: audience/profile, theme, layout, complexity.
   - Use when the estimated graph is small (`<= 12` nodes) and not stencil-heavy.
2. **Full Path**
   - Use for ambiguous, large, academic, replication-like, or routing-sensitive diagrams.
3. **Academic Branch**
   - Force-enable when prompt contains `paper`, `academic`, `IEEE`, `journal`, `thesis`, `figure`, `manuscript`, `research`.
   - Default `meta.profile = academic-paper`.
   - Classify the figure as `architecture`, `roadmap`, or `workflow` before final layout and set `meta.figureType`.
4. **Math / Formula Branch**
   - Enable when the prompt mentions `formula`, `equation`, `LaTeX`, `AsciiMath`, `MathJax`, `loss function`, `derivation`, `symbol legend`, `公式`, `行内公式`, or `行间公式`.
   - Load `references/docs/math-typesetting.md` as the syntax source of truth.
   - Load `references/docs/design-system/formulas.md` for formula-node placement and sizing.
5. **Stencil Branch**
   - Enable when the prompt mentions AWS, Azure, GCP, Cisco, Kubernetes, or vendor icons.
   - Use `references/docs/stencil-library-guide.md` to decide whether `search_shape_catalog` would help or whether semantic/icon fallbacks are sufficient.

## Procedure

```text
Step 1: Identify Input Mode
├── Natural language
├── YAML spec
├── Mermaid (flowchart/sequence/class/state/ER/gantt)
└── CSV hierarchy/org chart

Step 2: Determine profile and theme defaults
├── academic-paper -> theme academic by default
├── academic-paper + explicit color request -> academic-color
├── engineering-review -> theme tech-blue by default
└── otherwise -> theme from request or tech-blue

Step 3: Classify academic figure intent when profile=academic-paper
├── structure / modules / runtime interaction -> meta.figureType=architecture
├── stage progression / milestones / study phases -> meta.figureType=roadmap
└── ordered execution / branching / fallback / loop -> meta.figureType=workflow

Step 4: Decide Fast Path vs Full Path
├── Fast Path -> skip AskUserQuestion and skip ASCII confirmation
└── Full Path -> continue to Step 5

Step 5: Design Consultation (Full Path only)
├── Ask only unresolved questions:
│   • audience/profile
│   • theme
│   • layout
│   • figureType when academic intent is still ambiguous
│   • expected complexity
└── Store decisions in designIntent and pre-fill YAML meta

Step 6: Academic / Math / Stencil references
├── math/formula request -> load math typesetting + formula integration guide
├── academic-paper -> load academic figure playbook + export checklist + IEEE + math typesetting
└── stencil-heavy -> decide whether shape search is needed
    ├── if `search_shape_catalog` exists, use it for exact vendor/device lookup
    └── otherwise use design-system icons or semantic fallbacks

Step 7: Build the YAML spec
├── Normalize Mermaid/CSV inputs to YAML spec
├── Ensure meta.theme, meta.layout, meta.profile are present
├── Ensure meta.figureType is present when profile=academic-paper
├── Use semantic node types and typed connectors
└── Add manual positions when branching or dense routing requires it

Step 8: ASCII Draft (Full Path only)
├── Render semantic ASCII draft
├── Include Design Summary:
│   • theme
│   • profile
│   • figureType
│   • layout
│   • node/edge/module counts
│   • validation status
└── Pause for confirmation only when logic or structure is still ambiguous

Step 9: Validation
├── validateColorScheme()
├── validateLayoutConsistency()
├── validateConnectionPointPolicy()
├── validateEdgeQuality()
├── validateAcademicProfile() when profile=academic-paper
└── checkComplexity()

Step 10: Edge Audit
├── No corner connection points
├── No shared face slots on the same corridor
├── Last segment >= 30px
├── Labels offset from edge lines
├── No waypoint + explicit connection-point mixing
└── Prefer straight arrows when alignment allows it

Step 11: Render
├── node <skill-dir>/scripts/cli.js input --input-format <yaml|mermaid|csv> output.drawio --validate --write-sidecars --sidecar-dir .drawio-tmp/output
├── For paper-quality diagrams prefer output.svg --validate --write-sidecars --sidecar-dir .drawio-tmp/output
├── For thesis / A4 / Word / PNG requests, add a matching PNG only when draw.io Desktop export is available
├── Note: standalone SVG (without --use-desktop) is preview-quality (straight-line edges).
│   For publication-grade vector output, add --use-desktop or export to .drawio and refine in draw.io.
└── When embedded export matters and draw.io Desktop exists, add --use-desktop for SVG or export to PNG/PDF/JPG

Step 12: Exported-Artifact Verification / Optional Live Handoff
├── Inspect the exported SVG first when it is available and readable by the current environment
├── If a raster/final-fidelity check is needed and draw.io Desktop is available -> export PNG/PDF/JPG or embedded SVG through the CLI
├── Do not create browser or Playwright screenshots when an exported SVG/PNG/PDF/JPG exists
├── live backend has `replace_diagram_xml` + user wants browser or inline refinement
│   └── use the provider-specific tool mapping from `references/docs/mcp-tools.md`
├── browser/live screenshots are a last-resort review aid only when the user explicitly requested live review and no exported artifact can be inspected
└── otherwise present .drawio + standalone SVG and report any remaining manual visual check
```

## Academic Branch Rules

When `meta.profile = academic-paper`:

- `meta.figureType` is required and must be exactly `architecture`, `roadmap`, or `workflow`.
- `meta.title` is required for figure captioning.
- `meta.description` is recommended for figure context.
- `meta.legend` is required when icons are used or connector types are mixed.
- Prefer `academic` theme unless the request explicitly asks for a color paper figure.
- Default final deliverables are `.drawio` and `.svg`; keep `.spec.yaml` and `.arch.json` in a project-local work directory unless a sidecar bundle is explicitly requested.
- Add `.png` only for thesis, A4, Word, raster-first, screenshot rebuild, or explicit PNG requests.
- Do not rely on color alone to distinguish semantics.
- Treat A4 readability and grayscale print safety as final review gates, not optional polish.

## Math / Formula Branch Rules

When the request includes formulas, equations, or math-heavy labels:

- Use `$$...$$` only for standalone equations or labels that are entirely formula content.
- Use `\(...\)` for sentence-level inline math inside a longer label.
- Use `` `...` `` only when the user explicitly prefers AsciiMath or when the notation is simple.
- Do not generate bare LaTeX, `$...$`, or `\[...\]` in final YAML/XML output.
- Tell the user to enable `Extras > Mathematical Typesetting` when raw formulas may be edited in draw.io.
- For PDF exports where selectable math matters, recommend `math-output=html`.

## Notes

- YAML remains the canonical intermediate representation.
- `.drawio` is the editable final artifact; `.spec.yaml` and `.arch.json` remain the canonical offline sidecars in the work directory unless the user explicitly requests a beside-output bundle.
- Mermaid and CSV inputs are convenience adapters, not separate rendering pipelines.
- For formula-bearing labels, use only the three supported syntaxes: `$$...$$`, `\(...\)`, and `` `...` ``.
- Stencil-heavy requests may use shape search when available, but the create flow must still succeed without it.
- Academic figures should not blend structure, progression, and control flow into one ambiguous visual grammar.
