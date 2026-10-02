#!/usr/bin/env node
/**
 * CLI tool for converting YAML specifications to draw.io XML or SVG
 * Usage: node cli.js input.yaml [output.drawio|output.svg] [--theme name] [--strict] [--validate]
 */

import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, extname, join, resolve } from 'node:path'
import { parseSpecYaml, specToDrawioXml, validateSpec, validateXml } from './dsl/spec-to-drawio.js'
import { parseMermaidToSpec, parseCsvToSpec } from './adapters/index.js'
import { drawioToSpec } from './dsl/drawio-to-spec.js'
import {
  buildArchMetadata,
  createDrawioFileContent,
  deriveArtifactPaths,
  serializeSpecYaml
} from './runtime/artifacts.js'
import { exportWithDrawioDesktop, isDesktopExportFormat } from './runtime/desktop.js'

/** draw.io format compatibility version */
const DRAWIO_COMPAT_VERSION = '21.0.0'

// ---------------------------------------------------------------------------
// Argument parsing
// ---------------------------------------------------------------------------

const args = process.argv.slice(2)

if (args.length === 0 || args.includes('--help') || args.includes('-h')) {
  console.log(
    `
draw.io YAML → XML/SVG Converter

Usage:
  node cli.js <input> [output.drawio|output.svg] [options]

Arguments:
  input               Path to input file, or - for stdin
  output file         Optional output file. Extension determines format:
                        .drawio  → draw.io XML file format
                        .svg     → Standalone SVG (or desktop SVG with --use-desktop)
                        .png     → PNG via draw.io Desktop CLI
                        .pdf     → PDF via draw.io Desktop CLI
                        .jpg     → JPG via draw.io Desktop CLI
                      If omitted, XML is printed to stdout.

Options:
  --input-format <f>  Input format: yaml (default), mermaid, csv, drawio
  --theme <name>      Override theme (e.g. tech-blue, academic, nature, dark)
  --page <selector>   drawio only: page index (0-based) or diagram name
  --export-spec       Export the canonical YAML spec instead of generating XML/SVG
  --strict            Fail on complexity and spec validation warnings
  --strict-warnings   Alias of --strict (recommended for paper-grade validation)
  --validate          Run XML validation and print results (also summarizes spec warnings)
  --write-sidecars    Emit canonical .spec.yaml and .arch.json next to the output
  --sidecar-dir <dir> Emit sidecars in this directory when --write-sidecars is set
  --use-desktop       Prefer draw.io Desktop CLI for SVG export; required for PNG/PDF/JPG
  --help, -h          Show this help message
`.trim()
  )
  process.exit(0)
}

// Extract positional arguments (non-flag args, excluding values of --flags)
const flagsWithValues = new Set(['--theme', '--input-format', '--page', '--sidecar-dir'])
const positional = []
for (let i = 0; i < args.length; i++) {
  if (flagsWithValues.has(args[i])) {
    i++ // skip the flag value
  } else if (!args[i].startsWith('--')) {
    positional.push(args[i])
  }
}
const inputFile = positional[0]
const outputFile = positional[1] || null

// Extract flags
const themeIndex = args.indexOf('--theme')
const themeName = themeIndex !== -1 ? args[themeIndex + 1] : null
const inputFormatIndex = args.indexOf('--input-format')
const inputFormat = inputFormatIndex !== -1 ? args[inputFormatIndex + 1] : 'yaml'
const strict = args.includes('--strict') || args.includes('--strict-warnings')
const doValidate = args.includes('--validate')
const writeSidecars = args.includes('--write-sidecars')
const useDesktop = args.includes('--use-desktop')
const exportSpec = args.includes('--export-spec')
const pageIndex = args.indexOf('--page')
const pageSelector = pageIndex !== -1 ? args[pageIndex + 1] : null
const sidecarDirIndex = args.indexOf('--sidecar-dir')
const sidecarDir = sidecarDirIndex !== -1 ? args[sidecarDirIndex + 1] : null
const resolvedSidecarDir = sidecarDir ? resolve(sidecarDir) : null

if (sidecarDirIndex !== -1 && (!sidecarDir || sidecarDir.startsWith('--'))) {
  console.error('Error: --sidecar-dir requires a directory path.')
  process.exit(1)
}

if (sidecarDir && !writeSidecars) {
  console.error('Error: --sidecar-dir requires --write-sidecars.')
  process.exit(1)
}

if (resolvedSidecarDir) {
  try {
    mkdirSync(resolvedSidecarDir, { recursive: true })
  } catch (err) {
    console.error(`Error: Could not create sidecar directory "${sidecarDir}": ${err.message}`)
    process.exit(1)
  }
}

// ---------------------------------------------------------------------------
// SVG module (optional)
// ---------------------------------------------------------------------------

let drawioToSvg = null
try {
  const svgModule = await import('./svg/drawio-to-svg.js')
  drawioToSvg = svgModule.drawioToSvg
} catch {
  // SVG export not available
}

// ---------------------------------------------------------------------------
// Read and convert
// ---------------------------------------------------------------------------

let inputText
if (inputFile === '-' || (!inputFile && !process.stdin.isTTY)) {
  const chunks = []
  for await (const chunk of process.stdin) chunks.push(chunk)
  inputText = Buffer.concat(chunks).toString('utf-8')
} else if (!inputFile) {
  console.error('Error: input file is required. Use - for stdin.')
  process.exit(1)
} else {
  try {
    inputText = readFileSync(resolve(inputFile), 'utf-8')
  } catch (err) {
    console.error(`Error: Could not read input file "${inputFile}": ${err.message}`)
    process.exit(1)
  }
}

let spec
try {
  if (inputFormat === 'yaml') {
    spec = parseSpecYaml(inputText)
  } else if (inputFormat === 'mermaid') {
    spec = parseMermaidToSpec(inputText, { profile: themeName?.startsWith('academic') ? 'academic-paper' : 'default' })
  } else if (inputFormat === 'csv') {
    spec = parseCsvToSpec(inputText, { profile: themeName?.startsWith('academic') ? 'academic-paper' : 'default' })
  } else if (inputFormat === 'drawio') {
    spec = drawioToSpec(inputText, { theme: themeName || undefined, page: pageSelector })
  } else {
    throw new Error(`Unsupported input format "${inputFormat}"`)
  }
} catch (err) {
  console.error(`Error: Failed to parse ${inputFormat}: ${err.message}`)
  process.exit(1)
}

try {
  validateSpec(spec)
} catch (err) {
  console.error(`Error: Spec validation failed: ${err.message}`)
  process.exit(1)
}

// Apply CLI theme override
if (themeName) {
  spec.meta = spec.meta || {}
  spec.meta.theme = themeName
}

let xml
try {
  if (exportSpec) {
    xml = null
  } else if (doValidate) {
    const result = specToDrawioXml(spec, { strict, returnWarnings: true, silent: true })
    xml = result.xml
    const problems = (result.warnings || []).filter((w) => w.level && w.level !== 'fatal')
    if (problems.length === 0) {
      console.error('Spec validation: PASSED (no warnings)')
    } else {
      console.error(`Spec validation: WARNINGS (${problems.length})`)
      problems.forEach((w) => console.error(`  • [${w.level}] ${w.message}`))
    }
  } else {
    xml = specToDrawioXml(spec, { strict })
  }
} catch (err) {
  console.error(`Error: Conversion failed: ${err.message}`)
  process.exit(1)
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

if (doValidate && !exportSpec) {
  const result = validateXml(xml)
  if (result.valid) {
    console.error('XML validation: PASSED (no errors)')
  } else {
    console.error('XML validation: FAILED')
    for (const e of result.errors) {
      console.error(`  - ${e}`)
    }
    process.exit(1)
  }
}

if (
  !exportSpec &&
  spec.meta?.profile === 'academic-paper' &&
  outputFile &&
  extname(outputFile).toLowerCase() !== '.svg'
) {
  console.error('Validation: academic-paper profile recommends SVG export for paper-ready vector output.')
}

// ---------------------------------------------------------------------------
// Output
// ---------------------------------------------------------------------------

if (exportSpec) {
  const yamlOut = serializeSpecYaml(spec)
  let specPath = outputFile
  if (!specPath && inputFormat === 'drawio' && inputFile && inputFile !== '-') {
    specPath = deriveArtifactPaths(inputFile).specPath
  }

  if (specPath && resolvedSidecarDir) {
    specPath = resolve(resolvedSidecarDir, basename(specPath))
  }

  if (!specPath) {
    process.stdout.write(yamlOut)
    if (!yamlOut.endsWith('\n')) process.stdout.write('\n')
    process.exit(0)
  }

  try {
    writeFileSync(resolve(specPath), yamlOut, 'utf-8')
    console.error(`Saved spec: ${specPath}`)
  } catch (err) {
    console.error(`Error: Could not write spec file "${specPath}": ${err.message}`)
    process.exit(1)
  }

  if (writeSidecars) {
    const normalized = specPath.replace(/\\/g, '/')
    let archPath = null
    if (/\.spec\.ya?ml$/i.test(normalized)) {
      archPath = normalized.replace(/\.spec\.ya?ml$/i, '.arch.json')
    } else if (/\.ya?ml$/i.test(normalized)) {
      archPath = normalized.replace(/\.ya?ml$/i, '.arch.json')
    }

    if (archPath) {
      if (resolvedSidecarDir) {
        archPath = resolve(resolvedSidecarDir, basename(archPath))
      }
      const drawioPath = /\.arch\.json$/i.test(archPath) ? archPath.replace(/\.arch\.json$/i, '.drawio') : null
      try {
        writeFileSync(
          resolve(archPath),
          JSON.stringify(buildArchMetadata(spec, { outputFile: drawioPath || specPath }), null, 2) + '\n',
          'utf-8'
        )
        console.error(`Saved arch: ${archPath}`)
      } catch (err) {
        console.error(`Error: Could not write arch file "${archPath}": ${err.message}`)
        process.exit(1)
      }
    }
  }

  process.exit(0)
}

if (!outputFile) {
  process.stdout.write(xml)
  process.stdout.write('\n')
  process.exit(0)
}

const ext = extname(outputFile).toLowerCase()
const drawioContent = createDrawioFileContent(xml, { version: DRAWIO_COMPAT_VERSION })
const artifactPaths = deriveArtifactPaths(outputFile)
const sidecarArtifactPaths = resolvedSidecarDir
  ? deriveArtifactPaths(resolve(resolvedSidecarDir, basename(artifactPaths.drawioPath)))
  : artifactPaths
const needsDesktopExport = isDesktopExportFormat(ext.slice(1)) && (ext !== '.svg' || useDesktop)
let tempDir = null
let desktopInputPath = null

function writeCanonicalSidecars() {
  if (!writeSidecars) return

  writeFileSync(resolve(sidecarArtifactPaths.specPath), serializeSpecYaml(spec), 'utf-8')
  writeFileSync(
    resolve(sidecarArtifactPaths.archPath),
    JSON.stringify(buildArchMetadata(spec, { outputFile }), null, 2) + '\n',
    'utf-8'
  )
}

function ensureDesktopInput() {
  if (desktopInputPath) return desktopInputPath

  if (writeSidecars) {
    desktopInputPath = resolve(artifactPaths.drawioPath)
    writeFileSync(desktopInputPath, drawioContent, 'utf-8')
    return desktopInputPath
  }

  tempDir = mkdtempSync(join(tmpdir(), 'drawio-skill-'))
  desktopInputPath = resolve(tempDir, 'export-input.drawio')
  writeFileSync(desktopInputPath, drawioContent, 'utf-8')
  return desktopInputPath
}

let exitCode = 0

try {
  if (ext === '.drawio') {
    writeFileSync(resolve(outputFile), drawioContent, 'utf-8')
    writeCanonicalSidecars()
    console.error(`Saved: ${outputFile}`)
  } else if (needsDesktopExport) {
    try {
      exportWithDrawioDesktop({
        inputFile: ensureDesktopInput(),
        outputFile: resolve(outputFile),
        format: ext.slice(1)
      })
      writeCanonicalSidecars()
      console.error(`Saved: ${outputFile}`)
    } catch (err) {
      console.error(`Error: ${err.message}`)
      exitCode = 1
    }
  } else if (ext === '.svg') {
    if (!drawioToSvg) {
      console.error('Error: SVG export is not available (drawio-to-svg module not found).')
      exitCode = 1
    } else {
      let svg
      try {
        svg = drawioToSvg(xml)
      } catch (err) {
        console.error(`Error: SVG conversion failed: ${err.message}`)
        exitCode = 1
      }

      if (exitCode === 0) {
        try {
          writeFileSync(resolve(outputFile), svg, 'utf-8')
          if (writeSidecars) {
            writeFileSync(resolve(artifactPaths.drawioPath), drawioContent, 'utf-8')
          }
          writeCanonicalSidecars()
          console.error(`Saved SVG: ${outputFile}`)
        } catch (err) {
          console.error(`Error: Could not write output file "${outputFile}": ${err.message}`)
          exitCode = 1
        }
      }
    }
  } else {
    console.error(
      `Error: Unsupported output extension "${ext || '(none)'}". ` + 'Use .drawio, .svg, .png, .pdf, or .jpg/.jpeg.'
    )
    exitCode = 1
  }
} finally {
  if (tempDir) {
    rmSync(tempDir, { recursive: true, force: true })
  }
}

process.exit(exitCode)
