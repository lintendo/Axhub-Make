const DEPENDENCY_FIELDS = [
  'dependencies',
  'devDependencies',
  'peerDependencies',
  'optionalDependencies',
] as const;
const KEY_MERGE_FIELDS = [...DEPENDENCY_FIELDS, 'scripts'] as const;

export type MakeClientPackageJsonSource = 'project' | 'template';

type JsonRecord = Record<string, unknown>;

function isJsonRecord(value: unknown): value is JsonRecord {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function fieldRecord(pkg: JsonRecord, field: string): JsonRecord {
  return isJsonRecord(pkg[field]) ? pkg[field] : {};
}

export class MakeClientPackageJsonError extends Error {
  constructor(public readonly source: MakeClientPackageJsonSource, message: string) {
    super(message);
    this.name = 'MakeClientPackageJsonError';
  }
}

export function parseMakeClientPackageJson(
  source: MakeClientPackageJsonSource,
  content: string,
): JsonRecord {
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Invalid JSON';
    throw new MakeClientPackageJsonError(source, `Invalid ${source} package.json: ${message}`);
  }
  if (!isJsonRecord(parsed)) {
    throw new MakeClientPackageJsonError(source, `${source} package.json must contain an object`);
  }
  for (const field of KEY_MERGE_FIELDS) {
    if (field in parsed && !isJsonRecord(parsed[field])) {
      throw new MakeClientPackageJsonError(source, `${source} package.json field ${field} must contain an object`);
    }
  }
  return parsed;
}

export function mergeMakeClientPackageJson(
  projectPackage: JsonRecord,
  templatePackage: JsonRecord,
): string {
  const merged: JsonRecord = { ...projectPackage, ...templatePackage };
  const templateDependencyNames = new Set(
    DEPENDENCY_FIELDS.flatMap((field) => Object.keys(fieldRecord(templatePackage, field))),
  );

  for (const field of DEPENDENCY_FIELDS) {
    const projectOnly = Object.fromEntries(
      Object.entries(fieldRecord(projectPackage, field))
        .filter(([name]) => !templateDependencyNames.has(name)),
    );
    const templateDependencies = fieldRecord(templatePackage, field);
    const next = { ...projectOnly, ...templateDependencies };
    if (field in projectPackage || field in templatePackage || Object.keys(next).length > 0) {
      merged[field] = next;
    } else {
      delete merged[field];
    }
  }

  const scripts = {
    ...fieldRecord(projectPackage, 'scripts'),
    ...fieldRecord(templatePackage, 'scripts'),
  };
  if ('scripts' in projectPackage || 'scripts' in templatePackage || Object.keys(scripts).length > 0) {
    merged.scripts = scripts;
  } else {
    delete merged.scripts;
  }

  return `${JSON.stringify(merged, null, 2)}\n`;
}
