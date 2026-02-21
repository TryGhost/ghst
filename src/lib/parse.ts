import { ExitCode, GhstError } from './errors.js';

export function parseCsv(value: string | undefined): string[] | undefined {
  if (!value) {
    return undefined;
  }

  const parsed = value
    .split(',')
    .map((item) => item.trim())
    .filter((item) => item.length > 0);

  return parsed.length > 0 ? parsed : undefined;
}

export function parseBooleanFlag(value: unknown): boolean | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }

  if (typeof value === 'boolean') {
    return value;
  }

  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (normalized === 'true' || normalized === '1' || normalized === 'yes') {
      return true;
    }

    if (normalized === 'false' || normalized === '0' || normalized === 'no') {
      return false;
    }
  }

  throw new GhstError(`Invalid boolean value: ${String(value)}`, {
    exitCode: ExitCode.VALIDATION_ERROR,
    code: 'VALIDATION_ERROR',
  });
}

export function parseQueryPairs(entries: string[] | undefined): Record<string, string> {
  if (!entries || entries.length === 0) {
    return {};
  }

  return Object.fromEntries(
    entries.map((entry) => {
      const [key, ...rest] = entry.split('=');
      const parsedKey = key?.trim();
      if (!parsedKey) {
        throw new GhstError(`Invalid query pair: ${entry}`, {
          exitCode: ExitCode.USAGE_ERROR,
          code: 'USAGE_ERROR',
        });
      }
      return [parsedKey, rest.join('=').trim()];
    }),
  );
}

export function parseInteger(value: string | undefined, label: string): number | undefined {
  if (value === undefined) {
    return undefined;
  }

  const parsed = Number(value);
  if (!Number.isInteger(parsed)) {
    throw new GhstError(`${label} must be an integer`, {
      exitCode: ExitCode.VALIDATION_ERROR,
      code: 'VALIDATION_ERROR',
    });
  }

  return parsed;
}
