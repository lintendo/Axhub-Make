#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { colorDistance, findAlphaBounds, numberArg, parseArgs, parseColor, readPng, writeJson, writePng } from './png-utils.mjs';

const MAX_COLOR_DISTANCE = 441.7;
const usage = `Usage: node key-transparent-image.mjs --input keyed.png --output transparent.png --key green|magenta|cyan|purple|#rrggbb [--tolerance 40] [--near-tolerance 220] [--report report.json]`;

function smoothstep(value) {
  const clamped = Math.max(0, Math.min(1, value));
  return clamped * clamped * (3 - 2 * clamped);
}

function buildNearestSeedMap(width, height, isSeed) {
  const totalPixels = width * height;
  const nearest = new Int32Array(totalPixels);
  const distance = new Int32Array(totalPixels);
  nearest.fill(-1);
  distance.fill(-1);
  const queue = new Int32Array(totalPixels);
  let queueStart = 0;
  let queueEnd = 0;
  for (let index = 0; index < totalPixels; index += 1) {
    if (!isSeed(index)) continue;
    nearest[index] = index;
    distance[index] = 0;
    queue[queueEnd++] = index;
  }
  while (queueStart < queueEnd) {
    const index = queue[queueStart++];
    const x = index % width;
    const visit = (neighbour) => {
      if (nearest[neighbour] !== -1) return;
      nearest[neighbour] = nearest[index];
      distance[neighbour] = distance[index] + 1;
      queue[queueEnd++] = neighbour;
    };
    if (x > 0) visit(index - 1);
    if (x + 1 < width) visit(index + 1);
    if (index >= width) visit(index - width);
    if (index + width < totalPixels) visit(index + width);
  }
  return { nearest, distance };
}

function estimateMatteFit(data, offset, backgroundOffset, foregroundOffset, keyRgb, fallbackAlpha) {
  if (foregroundOffset < 0) return { alpha: fallbackAlpha, error: Number.POSITIVE_INFINITY };
  let numerator = 0;
  let denominator = 0;
  for (let channel = 0; channel < 3; channel += 1) {
    const background = backgroundOffset < 0 ? keyRgb[channel] : data[backgroundOffset + channel];
    const direction = data[foregroundOffset + channel] - background;
    numerator += (data[offset + channel] - background) * direction;
    denominator += direction * direction;
  }
  if (denominator < 1) return { alpha: fallbackAlpha, error: Number.POSITIVE_INFINITY };
  const alpha = Math.max(0, Math.min(1, numerator / denominator));
  let error = 0;
  for (let channel = 0; channel < 3; channel += 1) {
    const background = backgroundOffset < 0 ? keyRgb[channel] : data[backgroundOffset + channel];
    const reconstructed = background + alpha * (data[foregroundOffset + channel] - background);
    const residual = data[offset + channel] - reconstructed;
    error += residual * residual;
  }
  return { alpha, error };
}

function estimateLocalMatte(
  data,
  width,
  height,
  index,
  backgroundOffset,
  fallbackForegroundOffset,
  distances,
  nearTolerance,
  radius,
  keyRgb,
  fallbackAlpha,
) {
  const offset = index * 4;
  const x = index % width;
  const y = Math.floor(index / width);
  let bestFit = estimateMatteFit(data, offset, backgroundOffset, fallbackForegroundOffset, keyRgb, fallbackAlpha);
  let bestForegroundOffset = fallbackForegroundOffset;
  let bestDistance = Number.POSITIVE_INFINITY;
  if (fallbackForegroundOffset >= 0) {
    const fallbackIndex = fallbackForegroundOffset / 4;
    const fallbackX = fallbackIndex % width;
    const fallbackY = Math.floor(fallbackIndex / width);
    bestDistance = (fallbackX - x) ** 2 + (fallbackY - y) ** 2;
  }

  const minX = Math.max(0, x - radius);
  const maxX = Math.min(width - 1, x + radius);
  const minY = Math.max(0, y - radius);
  const maxY = Math.min(height - 1, y + radius);
  for (let candidateY = minY; candidateY <= maxY; candidateY += 1) {
    for (let candidateX = minX; candidateX <= maxX; candidateX += 1) {
      const candidateIndex = candidateY * width + candidateX;
      const candidateOffset = candidateIndex * 4;
      if (data[candidateOffset + 3] === 0 || distances[candidateIndex] < nearTolerance) continue;
      const fit = estimateMatteFit(data, offset, backgroundOffset, candidateOffset, keyRgb, fallbackAlpha);
      const candidateDistance = (candidateX - x) ** 2 + (candidateY - y) ** 2;
      if (fit.error < bestFit.error - 1e-6
        || (Math.abs(fit.error - bestFit.error) <= 1e-6 && candidateDistance < bestDistance)) {
        bestFit = fit;
        bestForegroundOffset = candidateOffset;
        bestDistance = candidateDistance;
      }
    }
  }
  return { ...bestFit, foregroundOffset: bestForegroundOffset };
}

function despillPixel(outputData, sourceData, offset, backgroundOffset, foregroundOffset, keyRgb, matteAlpha) {
  let changed = false;
  for (let channel = 0; channel < 3; channel += 1) {
    const source = sourceData[offset + channel];
    let corrected;
    if (foregroundOffset >= 0) {
      corrected = sourceData[foregroundOffset + channel];
    } else {
      const background = backgroundOffset < 0 ? keyRgb[channel] : sourceData[backgroundOffset + channel];
      const foreground = (source - (1 - matteAlpha) * background) / matteAlpha;
      corrected = Math.round(Math.max(0, Math.min(255, foreground)));
    }
    if (corrected !== source) changed = true;
    outputData[offset + channel] = corrected;
  }
  return changed;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help || args.h) return console.log(usage);
  if (!args.input || !args.output || !(args.key || args['key-color'])) throw new Error(`${usage}\n--input, --output, and --key are required`);
  const tolerance = numberArg(args.tolerance, 40, 'tolerance', { min: 0, max: MAX_COLOR_DISTANCE });
  const defaultNearTolerance = Math.min(MAX_COLOR_DISTANCE, Math.max(tolerance + 24, 220));
  const nearTolerance = numberArg(args['near-tolerance'], defaultNearTolerance, 'near-tolerance', { min: 0, max: MAX_COLOR_DISTANCE });
  if (nearTolerance <= tolerance) throw new Error('--near-tolerance must be greater than --tolerance');
  const key = parseColor(args.key || args['key-color']);
  const image = readPng(args.input);
  const sourceData = Buffer.from(image.data);
  const totalPixels = image.width * image.height;
  const removed = new Uint8Array(totalPixels);
  const distances = new Float32Array(totalPixels);
  for (let index = 0; index < totalPixels; index += 1) {
    distances[index] = colorDistance(sourceData, index * 4, key.rgb);
  }
  const backgroundMap = buildNearestSeedMap(image.width, image.height, (index) => (
    sourceData[index * 4 + 3] > 0 && distances[index] <= tolerance
  ));
  const foregroundMap = buildNearestSeedMap(image.width, image.height, (index) => (
    sourceData[index * 4 + 3] > 0 && distances[index] >= nearTolerance
  ));
  const edgeRadius = Math.max(2, Math.min(4, Math.ceil(Math.min(image.width, image.height) / 256)));

  let preexistingTransparentPixels = 0;
  let newlyTransparentPixels = 0;
  let transparentPixels = 0;
  let translucentPixels = 0;
  let opaquePixels = 0;
  let softenedEdgePixels = 0;
  let despilledPixels = 0;
  for (let index = 0; index < totalPixels; index += 1) {
    const offset = index * 4;
    const inputAlpha = sourceData[offset + 3];
    if (inputAlpha === 0) {
      preexistingTransparentPixels += 1;
      transparentPixels += 1;
      removed[index] = 1;
      image.data[offset] = 0;
      image.data[offset + 1] = 0;
      image.data[offset + 2] = 0;
      continue;
    }

    const distance = distances[index];
    const fallbackAlpha = smoothstep((distance - tolerance) / (nearTolerance - tolerance));
    const withinEdgeBand = backgroundMap.distance[index] < 0 || backgroundMap.distance[index] <= edgeRadius;
    let matteAlpha = 1;
    let matteForegroundOffset = -1;
    if (distance <= tolerance) {
      matteAlpha = 0;
    } else if (distance < nearTolerance && withinEdgeBand) {
      const matte = estimateLocalMatte(
        sourceData,
        image.width,
        image.height,
        index,
        backgroundMap.nearest[index] * 4,
        foregroundMap.nearest[index] * 4,
        distances,
        nearTolerance,
        edgeRadius,
        key.rgb,
        fallbackAlpha,
      );
      matteAlpha = matte.alpha;
      matteForegroundOffset = matte.foregroundOffset;
    }
    const outputAlpha = Math.round(inputAlpha * matteAlpha);
    image.data[offset + 3] = outputAlpha;

    if (outputAlpha === 0) {
      newlyTransparentPixels += 1;
      transparentPixels += 1;
      removed[index] = 1;
      image.data[offset] = 0;
      image.data[offset + 1] = 0;
      image.data[offset + 2] = 0;
      continue;
    }

    if (outputAlpha < inputAlpha) softenedEdgePixels += 1;
    if (matteAlpha < 1 && despillPixel(
      image.data,
      sourceData,
      offset,
      backgroundMap.nearest[index] * 4,
      matteForegroundOffset,
      key.rgb,
      matteAlpha,
    )) despilledPixels += 1;
    if (outputAlpha < 255) translucentPixels += 1;
    else opaquePixels += 1;
  }

  let residualKeyPixels = 0;
  let nearKeyOpaquePixels = 0;
  let edgeContaminationPixels = 0;
  const residualAuditTolerance = Math.min(nearTolerance, tolerance + 24);
  for (let index = 0; index < totalPixels; index += 1) {
    const offset = index * 4;
    if (image.data[offset + 3] === 0) continue;
    const distance = colorDistance(image.data, offset, key.rgb);
    if (distance <= tolerance) residualKeyPixels += 1;
    else if (distance <= residualAuditTolerance) nearKeyOpaquePixels += 1;
    if (distance <= residualAuditTolerance) {
      const x = index % image.width;
      const y = Math.floor(index / image.width);
      const touchesImageEdge = x === 0 || y === 0 || x + 1 === image.width || y + 1 === image.height;
      const touchesRemoved = (x > 0 && removed[index - 1]) || (x + 1 < image.width && removed[index + 1])
        || (y > 0 && removed[index - image.width]) || (y + 1 < image.height && removed[index + image.width]);
      if (touchesImageEdge || touchesRemoved) edgeContaminationPixels += 1;
    }
  }
  fs.mkdirSync(path.dirname(path.resolve(args.output)), { recursive: true });
  writePng(args.output, image);
  const contentPixels = translucentPixels + opaquePixels;
  const contentRatio = contentPixels / totalPixels;
  const contentBounds = findAlphaBounds(image);
  const emptyCutoutRisk = contentRatio < 0.01 ? 'high' : contentRatio < 0.05 ? 'medium' : 'low';
  const quality = {
    contentPixels,
    contentRatio,
    contentBounds,
    residualKeyPixels,
    residualKeyRatio: residualKeyPixels / totalPixels,
    nearKeyOpaquePixels,
    nearKeyOpaqueRatio: nearKeyOpaquePixels / totalPixels,
    emptyCutoutRisk,
    riskOfEmptyCutout: emptyCutoutRisk !== 'low',
    edgeContaminationPixels,
    edgeContaminationRatio: edgeContaminationPixels / totalPixels,
    transparentPixels,
    transparentRatio: transparentPixels / totalPixels,
    translucentPixels,
    translucentRatio: translucentPixels / totalPixels,
    opaquePixels,
    opaqueRatio: opaquePixels / totalPixels,
    softenedEdgePixels,
    softenedEdgeRatio: softenedEdgePixels / totalPixels,
    despilledPixels,
    despilledRatio: despilledPixels / totalPixels,
    hasSoftEdges: translucentPixels > 0,
    mattingMode: 'global-soft-key',
    edgeRadius,
  };
  const report = {
    status: 'ok', input: args.input, output: args.output, width: image.width, height: image.height,
    key, tolerance, nearTolerance, transparentPixels,
    preexistingTransparentPixels, newlyTransparentPixels, ...quality, quality,
  };
  writeJson(args.report, report);
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
