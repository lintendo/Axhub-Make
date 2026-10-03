#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

function parseArgs(argv) {
  const args = {};
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith('--')) throw new Error(`Unexpected argument: ${token}`);
    const key = token.slice(2);
    const next = argv[index + 1];
    if (!next || next.startsWith('--')) args[key] = true;
    else {
      args[key] = next;
      index += 1;
    }
  }
  return args;
}

function report(value) {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

function pathsReferToSameFile(input, output) {
  if (input === output) return true;
  if (!fs.existsSync(output)) return false;
  const inputStat = fs.statSync(input);
  const outputStat = fs.statSync(output);
  if (inputStat.dev === outputStat.dev && inputStat.ino === outputStat.ino) return true;
  return fs.realpathSync.native(input) === fs.realpathSync.native(output);
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.input || !args.output) {
    throw new Error('Usage: node remove-background-rembg.mjs --input <image> --output <png> [--model birefnet-general]');
  }

  const input = path.resolve(String(args.input));
  const output = path.resolve(String(args.output));
  const model = String(args.model || 'birefnet-general');
  if (!fs.existsSync(input)) throw new Error(`Input image is missing: ${input}`);
  if (pathsReferToSameFile(input, output)) throw new Error('Input and output paths must differ');

  const removeOutput = () => fs.rmSync(output, { force: true });
  fs.mkdirSync(path.dirname(output), { recursive: true });
  removeOutput();

  const commandArgs = ['i', '-m', model, input, output];
  const result = spawnSync('rembg', commandArgs, {
    encoding: 'utf8',
    shell: false,
    windowsHide: true,
  });

  if (result.error?.code === 'ENOENT') {
    removeOutput();
    report({ status: 'skipped', reason: 'rembg-unavailable', model, input, output });
    return;
  }
  if (result.error) {
    removeOutput();
    report({
      status: 'failed',
      reason: 'rembg-spawn',
      model,
      input,
      output,
      error: result.error.message,
    });
    return;
  }
  if (result.status !== 0) {
    removeOutput();
    report({
      status: 'failed',
      reason: 'rembg-exit',
      model,
      input,
      output,
      exitCode: result.status,
      stderr: String(result.stderr || '').trim(),
    });
    return;
  }
  if (!fs.existsSync(output) || fs.statSync(output).size === 0) {
    removeOutput();
    report({ status: 'failed', reason: 'rembg-output-missing', model, input, output });
    return;
  }

  report({ status: 'passed', model, input, output });
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
