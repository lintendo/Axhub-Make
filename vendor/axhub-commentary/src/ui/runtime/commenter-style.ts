function normalizeCommenterName(value: unknown): string {
  return String(value ?? '').trim();
}

/** Assigns deterministic, well-separated accent colors to commenter names. */
export function buildCommenterColorMap(names: readonly unknown[]): Map<string, string> {
  const uniqueNames = Array.from(new Set(names.map(normalizeCommenterName).filter(Boolean)))
    .sort((a, b) => a.localeCompare(b));
  const usedHues = new Set<number>();
  return new Map(uniqueNames.map((name, index) => {
    let hash = 0;
    for (const character of name) hash = (hash * 31 + character.codePointAt(0)!) >>> 0;
    let hue = Math.round((hash * 137.508) % 360);
    while (usedHues.has(hue)) hue = (hue + 29) % 360;
    usedHues.add(hue);
    const lightness = 42 + (index % 4) * 4;
    return [name, `hsl(${hue} 68% ${lightness}%)`];
  }));
}
