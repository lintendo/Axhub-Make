import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const typeBuffer = Buffer.from(type, 'ascii');
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const checksum = Buffer.alloc(4);
  checksum.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])), 0);
  return Buffer.concat([length, typeBuffer, data, checksum]);
}

function paeth(a, b, c) {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  if (pa <= pb && pa <= pc) return a;
  if (pb <= pc) return b;
  return c;
}

export function readPng(filePath) {
  const buffer = fs.readFileSync(filePath);
  if (!buffer.subarray(0, 8).equals(PNG_SIGNATURE)) {
    throw new Error(`Unsupported PNG signature: ${filePath}`);
  }

  let offset = 8;
  let width = 0;
  let height = 0;
  let bitDepth = 0;
  let colorType = 0;
  const idatChunks = [];

  while (offset < buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.subarray(offset + 4, offset + 8).toString('ascii');
    const data = buffer.subarray(offset + 8, offset + 8 + length);
    offset += 12 + length;

    if (type === 'IHDR') {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      bitDepth = data[8];
      colorType = data[9];
    } else if (type === 'IDAT') {
      idatChunks.push(data);
    } else if (type === 'IEND') {
      break;
    }
  }

  if (bitDepth !== 8 || ![0, 2, 4, 6].includes(colorType)) {
    throw new Error(`Only 8-bit grayscale, grayscale-alpha, RGB, or RGBA PNG files are supported: ${filePath}`);
  }

  const channels = colorType === 0 ? 1 : colorType === 2 ? 3 : colorType === 4 ? 2 : 4;
  const bytesPerPixel = channels;
  const stride = width * channels;
  const inflated = zlib.inflateSync(Buffer.concat(idatChunks));
  const raw = Buffer.alloc(height * stride);
  let inputOffset = 0;

  for (let y = 0; y < height; y += 1) {
    const filter = inflated[inputOffset];
    inputOffset += 1;
    const rowOffset = y * stride;
    const prevRowOffset = (y - 1) * stride;

    for (let x = 0; x < stride; x += 1) {
      const value = inflated[inputOffset + x];
      const left = x >= bytesPerPixel ? raw[rowOffset + x - bytesPerPixel] : 0;
      const up = y > 0 ? raw[prevRowOffset + x] : 0;
      const upLeft = y > 0 && x >= bytesPerPixel ? raw[prevRowOffset + x - bytesPerPixel] : 0;

      if (filter === 0) raw[rowOffset + x] = value;
      else if (filter === 1) raw[rowOffset + x] = (value + left) & 255;
      else if (filter === 2) raw[rowOffset + x] = (value + up) & 255;
      else if (filter === 3) raw[rowOffset + x] = (value + Math.floor((left + up) / 2)) & 255;
      else if (filter === 4) raw[rowOffset + x] = (value + paeth(left, up, upLeft)) & 255;
      else throw new Error(`Unsupported PNG filter ${filter}: ${filePath}`);
    }
    inputOffset += stride;
  }

  const rgba = Buffer.alloc(width * height * 4);
  for (let index = 0; index < width * height; index += 1) {
    const sourceOffset = index * channels;
    const targetOffset = index * 4;
    if (colorType === 0 || colorType === 4) {
      rgba[targetOffset] = raw[sourceOffset];
      rgba[targetOffset + 1] = raw[sourceOffset];
      rgba[targetOffset + 2] = raw[sourceOffset];
      rgba[targetOffset + 3] = colorType === 4 ? raw[sourceOffset + 1] : 255;
    } else {
      rgba[targetOffset] = raw[sourceOffset];
      rgba[targetOffset + 1] = raw[sourceOffset + 1];
      rgba[targetOffset + 2] = raw[sourceOffset + 2];
      rgba[targetOffset + 3] = colorType === 6 ? raw[sourceOffset + 3] : 255;
    }
  }

  return { width, height, data: rgba, hasAlphaChannel: colorType === 4 || colorType === 6 };
}

export function writePng(filePath, image) {
  const { width, height, data } = image;
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = 6;
  header[10] = 0;
  header[11] = 0;
  header[12] = 0;

  const scanlines = Buffer.alloc(height * (1 + width * 4));
  for (let y = 0; y < height; y += 1) {
    const rowStart = y * (1 + width * 4);
    scanlines[rowStart] = 0;
    data.copy(scanlines, rowStart + 1, y * width * 4, (y + 1) * width * 4);
  }

  fs.writeFileSync(filePath, Buffer.concat([
    PNG_SIGNATURE,
    chunk('IHDR', header),
    chunk('IDAT', zlib.deflateSync(scanlines)),
    chunk('IEND', Buffer.alloc(0)),
  ]));
}

export function cropPng(image, bbox) {
  const width = Math.max(0, bbox.width);
  const height = Math.max(0, bbox.height);
  const data = Buffer.alloc(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    const sourceStart = ((bbox.y + y) * image.width + bbox.x) * 4;
    const targetStart = y * width * 4;
    image.data.copy(data, targetStart, sourceStart, sourceStart + width * 4);
  }
  return { width, height, data, hasAlphaChannel: true };
}

export function findAlphaBounds(image, bounds = { x: 0, y: 0, width: image.width, height: image.height }, alphaThreshold = 8) {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -1;
  let maxY = -1;
  const startX = Math.max(0, bounds.x);
  const startY = Math.max(0, bounds.y);
  const endX = Math.min(image.width, bounds.x + bounds.width);
  const endY = Math.min(image.height, bounds.y + bounds.height);

  for (let y = startY; y < endY; y += 1) {
    for (let x = startX; x < endX; x += 1) {
      if (image.data[(y * image.width + x) * 4 + 3] > alphaThreshold) {
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x);
        maxY = Math.max(maxY, y);
      }
    }
  }

  if (maxX < minX || maxY < minY) return null;
  return { x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1 };
}

export function expandBounds(bounds, padding, image) {
  const x = Math.max(0, bounds.x - padding);
  const y = Math.max(0, bounds.y - padding);
  const right = Math.min(image.width, bounds.x + bounds.width + padding);
  const bottom = Math.min(image.height, bounds.y + bounds.height + padding);
  return { x, y, width: right - x, height: bottom - y };
}

export function parseArgs(argv) {
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

export function numberArg(value, fallback, name, { min = -Infinity, max = Infinity, integer = false } = {}) {
  if (value === undefined) return fallback;
  const result = Number(value);
  if (!Number.isFinite(result) || result < min || result > max || (integer && !Number.isInteger(result))) {
    throw new Error(`--${name} must be ${integer ? 'an integer' : 'a number'} from ${min} to ${max}`);
  }
  return result;
}

export function parseSize(value, name = 'viewport') {
  const match = String(value || '').match(/^(\d+)[x×](\d+)$/iu);
  if (!match || Number(match[1]) < 1 || Number(match[2]) < 1) {
    throw new Error(`--${name} must use WIDTHxHEIGHT, for example 1440x900`);
  }
  return { width: Number(match[1]), height: Number(match[2]) };
}

export const KEY_COLORS = Object.freeze({
  green: [0, 255, 0],
  magenta: [255, 0, 255],
  cyan: [0, 255, 255],
  purple: [128, 0, 255],
});

export function parseColor(value) {
  const input = String(value || '').trim().toLowerCase();
  if (KEY_COLORS[input]) return { name: input, rgb: [...KEY_COLORS[input]], hex: rgbToHex(KEY_COLORS[input]) };
  const hex = input.match(/^#?([0-9a-f]{6})$/iu)?.[1];
  if (hex) {
    const rgb = [0, 2, 4].map((offset) => Number.parseInt(hex.slice(offset, offset + 2), 16));
    return { name: 'custom', rgb, hex: `#${hex}` };
  }
  const parts = input.split(',').map(Number);
  if (parts.length === 3 && parts.every((part) => Number.isInteger(part) && part >= 0 && part <= 255)) {
    return { name: 'custom', rgb: parts, hex: rgbToHex(parts) };
  }
  throw new Error(`Unsupported key colour "${value}"; use green, magenta, cyan, purple, #rrggbb, or r,g,b`);
}

export function rgbToHex(rgb) {
  return `#${rgb.map((channel) => channel.toString(16).padStart(2, '0')).join('')}`;
}

export function colorDistance(data, offset, rgb) {
  return Math.hypot(data[offset] - rgb[0], data[offset + 1] - rgb[1], data[offset + 2] - rgb[2]);
}

export function alphaSummary(image, alphaThreshold = 8) {
  let transparentPixels = 0;
  let translucentPixels = 0;
  let opaquePixels = 0;
  let alphaTotal = 0;
  for (let offset = 3; offset < image.data.length; offset += 4) {
    const alpha = image.data[offset];
    alphaTotal += alpha;
    if (alpha <= alphaThreshold) transparentPixels += 1;
    else if (alpha < 255) translucentPixels += 1;
    else opaquePixels += 1;
  }
  const totalPixels = image.width * image.height;
  return {
    hasAlphaChannel: image.hasAlphaChannel,
    transparentPixels,
    translucentPixels,
    opaquePixels,
    transparentRatio: transparentPixels / totalPixels,
    translucentRatio: translucentPixels / totalPixels,
    opaqueRatio: opaquePixels / totalPixels,
    meanAlpha: alphaTotal / totalPixels,
  };
}

export function colorSummary(image, limit = 8) {
  const buckets = new Map();
  const sums = [0, 0, 0];
  let sampledPixels = 0;
  for (let offset = 0; offset < image.data.length; offset += 4) {
    if (image.data[offset + 3] === 0) continue;
    const rgb = [image.data[offset], image.data[offset + 1], image.data[offset + 2]];
    sums[0] += rgb[0];
    sums[1] += rgb[1];
    sums[2] += rgb[2];
    sampledPixels += 1;
    const key = `${rgb[0] >> 4},${rgb[1] >> 4},${rgb[2] >> 4}`;
    buckets.set(key, (buckets.get(key) || 0) + 1);
  }
  const dominant = [...buckets.entries()]
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .slice(0, limit)
    .map(([key, pixels]) => {
      const rgb = key.split(',').map((channel) => Number(channel) * 16 + 8);
      return { hex: rgbToHex(rgb), rgb, pixels, ratio: pixels / Math.max(1, sampledPixels) };
    });
  const meanRgb = sums.map((sum) => Math.round(sum / Math.max(1, sampledPixels)));
  return { sampledPixels, meanRgb, meanHex: rgbToHex(meanRgb), dominant };
}

export function connectedAlphaComponents(image, alphaThreshold = 8) {
  const total = image.width * image.height;
  const visited = new Uint8Array(total);
  const components = [];
  for (let start = 0; start < total; start += 1) {
    if (visited[start] || image.data[start * 4 + 3] <= alphaThreshold) continue;
    visited[start] = 1;
    const queue = [start];
    let cursor = 0;
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -1;
    let maxY = -1;
    let pixels = 0;
    while (cursor < queue.length) {
      const index = queue[cursor++];
      const x = index % image.width;
      const y = Math.floor(index / image.width);
      pixels += 1;
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
      const neighbours = [];
      if (x > 0) neighbours.push(index - 1);
      if (x + 1 < image.width) neighbours.push(index + 1);
      if (y > 0) neighbours.push(index - image.width);
      if (y + 1 < image.height) neighbours.push(index + image.width);
      for (const neighbour of neighbours) {
        if (!visited[neighbour] && image.data[neighbour * 4 + 3] > alphaThreshold) {
          visited[neighbour] = 1;
          queue.push(neighbour);
        }
      }
    }
    components.push({ pixels, bounds: { x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1 } });
  }
  return components;
}

function boundsGap(left, right) {
  const horizontal = Math.max(0, left.x - (right.x + right.width), right.x - (left.x + left.width));
  const vertical = Math.max(0, left.y - (right.y + right.height), right.y - (left.y + left.height));
  return Math.hypot(horizontal, vertical);
}

function unionBounds(left, right) {
  const x = Math.min(left.x, right.x);
  const y = Math.min(left.y, right.y);
  const maxX = Math.max(left.x + left.width, right.x + right.width);
  const maxY = Math.max(left.y + left.height, right.y + right.height);
  return { x, y, width: maxX - x, height: maxY - y };
}

export function mergeNearbyComponents(components, distance = 2) {
  const result = components.map((component) => ({ ...component, fragments: 1 }));
  let changed = true;
  while (changed) {
    changed = false;
    outer: for (let left = 0; left < result.length; left += 1) {
      for (let right = left + 1; right < result.length; right += 1) {
        if (boundsGap(result[left].bounds, result[right].bounds) <= distance) {
          result[left] = {
            pixels: result[left].pixels + result[right].pixels,
            fragments: result[left].fragments + result[right].fragments,
            bounds: unionBounds(result[left].bounds, result[right].bounds),
          };
          result.splice(right, 1);
          changed = true;
          break outer;
        }
      }
    }
  }
  return result.sort((left, right) => left.bounds.y - right.bounds.y || left.bounds.x - right.bounds.x);
}

export function writeJson(filePath, value) {
  if (filePath) {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
  }
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}
