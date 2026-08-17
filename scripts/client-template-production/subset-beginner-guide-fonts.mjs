#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { TextDecoder } from 'node:util';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DEFAULT_APP_ROOT = path.resolve(__dirname, '../../client');

const SOURCE_FILES = [
  'index.tsx',
  'style.css',
  'index.html',
  'README.md',
];

const EXTRA_CODE_POINTS = [
  0x00a0,
  0x2013,
  0x2014,
  0x2018,
  0x2019,
  0x201c,
  0x201d,
  0x2022,
  0x2026,
  0x3000,
  0x3001,
  0x3002,
  0x300a,
  0x300b,
  0x300c,
  0x300d,
  0xff01,
  0xff08,
  0xff09,
  0xff0c,
  0xff1a,
  0xff1b,
  0xff1f,
];

const ASCII_FALLBACK =
  'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789' +
  ' ~`!@#$%^&*()-_=+[]{}\\|;:\'",.<>/?';

function uniqueCharacters(input) {
  const seen = new Set();
  const output = [];
  for (const character of input) {
    if (!seen.has(character)) {
      seen.add(character);
      output.push(character);
    }
  }
  return output;
}

export function parseSubsetArgs(argv = process.argv) {
  const args = {
    appRoot: DEFAULT_APP_ROOT,
    dryRun: false,
    sourceFontDir: process.env.AXHUB_BEGINNER_GUIDE_FONT_SOURCE_DIR || '',
  };

  const values = argv.slice(2);
  for (let index = 0; index < values.length; index += 1) {
    const value = values[index];
    if (value === '--dry-run') {
      args.dryRun = true;
      continue;
    }
    if (value === '--app-root') {
      args.appRoot = path.resolve(values[index + 1] || '');
      index += 1;
      continue;
    }
    if (value === '--source-font-dir') {
      args.sourceFontDir = path.resolve(values[index + 1] || '');
      index += 1;
      continue;
    }
    if (value === '--help' || value === '-h') {
      args.help = true;
      continue;
    }
    throw new Error(`Unknown option: ${value}`);
  }

  return args;
}

export function resolveBeginnerGuidePaths(options = {}) {
  const appRoot = path.resolve(options.appRoot || DEFAULT_APP_ROOT);
  const prototypeRoot = path.join(appRoot, 'src/prototypes/beginner-guide');
  const localSourceFontDir = path.join(appRoot, '.local/font-sources/beginner-guide');
  const sourceFontDir = options.sourceFontDir
    ? path.resolve(options.sourceFontDir)
    : fs.existsSync(localSourceFontDir)
      ? localSourceFontDir
      : prototypeRoot;

  return {
    appRoot,
    prototypeRoot,
    sourceFontDir,
  };
}

export function collectCharactersFromFiles(filePaths) {
  const content = filePaths
    .filter((filePath) => fs.existsSync(filePath))
    .map((filePath) => fs.readFileSync(filePath, 'utf8'))
    .join('\n');

  return uniqueCharacters(content);
}

export function getGb2312LevelOneCharacters() {
  const decoder = new TextDecoder('gb18030');
  const characters = [];

  for (let high = 0xb0; high <= 0xd7; high += 1) {
    for (let low = 0xa1; low <= 0xfe; low += 1) {
      characters.push(decoder.decode(Buffer.from([high, low])));
    }
  }

  return uniqueCharacters(characters).join('');
}

export function collectSubsetCharacters(options = {}) {
  const pageCharacters = Array.isArray(options.pageCharacters)
    ? options.pageCharacters
    : [...String(options.pageCharacters || '')];
  const commonCharacters = String(
    options.commonCharacters ?? getGb2312LevelOneCharacters(),
  );
  const extraCharacters = String(
    options.extraCharacters
      ?? `${ASCII_FALLBACK}${String.fromCodePoint(...EXTRA_CODE_POINTS)}`,
  );

  return uniqueCharacters(`${commonCharacters}${extraCharacters}${pageCharacters.join('')}`);
}

export function getFontJobs(paths) {
  return [
    {
      weight: 400,
      inputPath: path.join(paths.sourceFontDir, 'TsangerJinKai02-W04.ttf'),
      outputPath: path.join(paths.prototypeRoot, 'TsangerJinKai02-W04.subset.woff2'),
    },
    {
      weight: 500,
      inputPath: path.join(paths.sourceFontDir, 'TsangerJinKai02-W05.ttf'),
      outputPath: path.join(paths.prototypeRoot, 'TsangerJinKai02-W05.subset.woff2'),
    },
  ];
}

function getSourceFilePaths(paths) {
  return SOURCE_FILES.map((fileName) => path.join(paths.prototypeRoot, fileName));
}

function formatSize(byteLength) {
  if (byteLength < 1024) return `${byteLength} B`;
  if (byteLength < 1024 * 1024) return `${(byteLength / 1024).toFixed(1)} KB`;
  return `${(byteLength / 1024 / 1024).toFixed(1)} MB`;
}

function printHelp() {
  console.log(`Usage: node scripts/subset-beginner-guide-fonts.mjs [options]

Options:
  --dry-run                 Print the plan without writing fonts.
  --app-root <path>          Client app root. Defaults to the current client.
  --source-font-dir <path>   Directory containing TsangerJinKai02-W04.ttf and W05.ttf.

Environment:
  AXHUB_BEGINNER_GUIDE_FONT_SOURCE_DIR can provide the source font directory.
`);
}

export async function subsetBeginnerGuideFonts(options = {}) {
  const paths = resolveBeginnerGuidePaths(options);
  const sourceFilePaths = getSourceFilePaths(paths);
  const pageCharacters = collectCharactersFromFiles(sourceFilePaths);
  const subsetCharacters = collectSubsetCharacters({ pageCharacters });
  const jobs = getFontJobs(paths);

  if (options.dryRun) {
    return {
      paths,
      jobs,
      characterCount: subsetCharacters.length,
      written: [],
    };
  }

  const missingInputs = jobs
    .map((job) => job.inputPath)
    .filter((inputPath) => !fs.existsSync(inputPath));
  if (missingInputs.length > 0) {
    throw new Error(
      [
        'Missing source font file(s):',
        ...missingInputs.map((inputPath) => `  - ${inputPath}`),
        'Pass --source-font-dir or set AXHUB_BEGINNER_GUIDE_FONT_SOURCE_DIR.',
      ].join('\n'),
    );
  }

  const { default: subsetFont } = await import('subset-font');
  fs.mkdirSync(paths.prototypeRoot, { recursive: true });

  const written = [];
  for (const job of jobs) {
    const inputBuffer = fs.readFileSync(job.inputPath);
    const outputBuffer = await subsetFont(inputBuffer, subsetCharacters.join(''), {
      targetFormat: 'woff2',
      preserveNameIds: [1, 2, 4, 6],
    });
    fs.writeFileSync(job.outputPath, outputBuffer);
    written.push({
      ...job,
      inputSize: inputBuffer.byteLength,
      outputSize: outputBuffer.byteLength,
    });
  }

  return {
    paths,
    jobs,
    characterCount: subsetCharacters.length,
    written,
  };
}

async function runCli() {
  const args = parseSubsetArgs(process.argv);
  if (args.help) {
    printHelp();
    return;
  }

  const result = await subsetBeginnerGuideFonts(args);
  console.log(`Beginner guide subset characters: ${result.characterCount}`);
  for (const job of result.jobs) {
    if (args.dryRun) {
      console.log(`dry-run ${job.weight}: ${job.inputPath} -> ${job.outputPath}`);
      continue;
    }
    const written = result.written.find((item) => item.weight === job.weight);
    console.log(
      `${job.weight}: ${formatSize(written.inputSize)} -> ${formatSize(written.outputSize)} ${written.outputPath}`,
    );
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  runCli().catch((error) => {
    console.error(error.message || error);
    process.exit(1);
  });
}
