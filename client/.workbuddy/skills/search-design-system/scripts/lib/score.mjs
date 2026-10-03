const SEMANTIC_FIELDS = ['industries', 'productTypes', 'pageTypes', 'styles', 'brandTraits', 'colorFamilies', 'colorModes', 'density'];
const TEXT_FIELDS = ['title', 'aliases', 'keywords', 'description', 'designMd'];

export const WEIGHTS = Object.freeze({
  industries: 12,
  productTypes: 10,
  pageTypes: 8,
  styles: 6,
  brandTraits: 5,
  colorFamilies: 4,
  colorModes: 4,
  density: 3,
  title: 6,
  aliases: 5,
  keywords: 4,
  description: 3,
  designMd: 1,
});

export function normalizeValue(value) {
  return String(value ?? '').normalize('NFKC').trim().replace(/\s+/gu, ' ').toLocaleLowerCase('en-US');
}

export function tokenize(value) {
  const normalized = String(value ?? '').normalize('NFKC').trim();
  if (!normalized) return [];
  const tokens = new Set();
  if (typeof Intl.Segmenter === 'function') {
    for (const segment of new Intl.Segmenter('zh', { granularity: 'word' }).segment(normalized)) {
      if (segment.isWordLike) tokens.add(normalizeValue(segment.segment));
    }
  } else {
    for (const match of normalized.matchAll(/[\p{Script=Han}]+|[\p{L}\p{N}]+(?:[.'’_-][\p{L}\p{N}]+)*/gu)) tokens.add(normalizeValue(match[0]));
  }
  return [...tokens].filter(Boolean).sort((left, right) => left.localeCompare(right, 'en-US'));
}

function strings(value) {
  return Array.isArray(value) ? value.filter((item) => typeof item === 'string') : [];
}

export function fieldValues(record, field) {
  if (field === 'colorFamilies') return strings(record.palette?.families ?? record.palette?.colorFamilies ?? record.annotation?.colorFamilies);
  if (field === 'colorModes') return strings(record.palette?.modes ?? record.palette?.colorModes ?? record.annotation?.colorModes);
  if (field === 'keywords') return strings(record.keywords ?? record.semantic?.keywords ?? record.annotation?.keywords ?? record.tags);
  if (field === 'aliases') return strings(record.aliases ?? record.identity?.aliases);
  if (field === 'density') return strings(record.semantic?.density ?? record.annotation?.density ?? record.density);
  if (SEMANTIC_FIELDS.includes(field)) return strings(record.semantic?.[field] ?? record.annotation?.[field] ?? record[field]);
  if (field === 'title') return [record.title, record.identity?.titleEn, record.identity?.titleZh].filter((item) => typeof item === 'string');
  if (field === 'description') return [record.description, record.identity?.descriptionEn, record.identity?.descriptionZh].filter((item) => typeof item === 'string');
  if (field === 'designMd') return [record.designMd, record.text].filter((item) => typeof item === 'string');
  return [];
}

function normalizedSet(values) {
  return new Set(values.map(normalizeValue).filter(Boolean));
}

export function matchesHardFilters(record, hardFilters = {}) {
  return SEMANTIC_FIELDS.every((field) => {
    const requested = strings(hardFilters[field]).map(normalizeValue);
    if (requested.length === 0) return true;
    const candidate = normalizedSet(fieldValues(record, field));
    return requested.some((value) => candidate.has(value));
  });
}

export function isExcluded(record, exclude = {}) {
  const candidate = normalizedSet([
    ...SEMANTIC_FIELDS.flatMap((field) => fieldValues(record, field)),
    ...strings(record.avoid ?? record.semantic?.avoid ?? record.annotation?.avoid),
  ]);
  return SEMANTIC_FIELDS.some((field) => strings(exclude[field]).some((value) => candidate.has(normalizeValue(value))));
}

export function scoreRecord(record, request) {
  const scoreBreakdown = Object.fromEntries([...SEMANTIC_FIELDS, ...TEXT_FIELDS].map((field) => [field, 0]));
  const matched = {};
  const unmatched = {};

  for (const field of SEMANTIC_FIELDS) {
    const requested = [...new Set([
      ...strings(request.hardFilters?.[field]),
      ...strings(request.softFilters?.[field]),
    ].map(normalizeValue).filter(Boolean))];
    const candidate = normalizedSet(fieldValues(record, field));
    matched[field] = requested.filter((value) => candidate.has(value));
    unmatched[field] = requested.filter((value) => !candidate.has(value));
    scoreBreakdown[field] = matched[field].length * WEIGHTS[field];
  }

  const queryTokens = [...new Set(strings(request.terms).flatMap(tokenize))];
  const matchedTerms = new Set();
  for (const field of TEXT_FIELDS) {
    const fieldTokens = new Set(fieldValues(record, field).flatMap(tokenize));
    const overlaps = queryTokens.filter((token) => fieldTokens.has(token));
    overlaps.forEach((token) => matchedTerms.add(token));
    scoreBreakdown[field] = overlaps.length * WEIGHTS[field];
  }
  matched.terms = queryTokens.filter((token) => matchedTerms.has(token));
  unmatched.terms = queryTokens.filter((token) => !matchedTerms.has(token));
  const score = Object.values(scoreBreakdown).reduce((total, value) => total + value, 0);
  return { score, matched, unmatched, scoreBreakdown };
}
