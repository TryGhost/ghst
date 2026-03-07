import { ExitCode, GhstError } from './errors.js';

type RequestApi = 'admin' | 'content';

const API_ROOTS: Record<RequestApi, string> = {
  admin: '/ghost/api/admin',
  content: '/ghost/api/content',
};

const ABSOLUTE_URL_PATTERN = /^[A-Za-z][A-Za-z\d+.-]*:/;

function throwInvalidPath(message: string): never {
  throw new GhstError(message, {
    code: 'VALIDATION_ERROR',
    exitCode: ExitCode.VALIDATION_ERROR,
  });
}

function decodePathSegment(segment: string): string {
  try {
    return decodeURIComponent(segment);
  } catch {
    throwInvalidPath(`Invalid endpoint path segment: ${segment}`);
  }
}

function validatePathSegment(segment: string): void {
  const decoded = decodePathSegment(segment);

  if (segment === '.' || segment === '..' || decoded === '.' || decoded === '..') {
    throwInvalidPath('Endpoint path must not contain dot segments.');
  }

  if (decoded.includes('/') || decoded.includes('\\')) {
    throwInvalidPath('Endpoint path must not contain encoded path separators.');
  }
}

function stripSelectedApiRoot(input: string, api: RequestApi): string | null {
  const root = API_ROOTS[api];

  if (input === root || input === `${root}/`) {
    return '/';
  }

  if (input.startsWith(`${root}/`)) {
    return input.slice(root.length);
  }

  return null;
}

export function normalizeGhostApiPath(input: string, api: RequestApi): string {
  const trimmed = input.trim();
  if (!trimmed) {
    throwInvalidPath('Endpoint path is required.');
  }

  if (ABSOLUTE_URL_PATTERN.test(trimmed) || trimmed.startsWith('//')) {
    throwInvalidPath('Endpoint path must be relative to the selected Ghost API root.');
  }

  if (trimmed.includes('\\')) {
    throwInvalidPath('Endpoint path must not contain backslashes.');
  }

  if (trimmed.includes('#')) {
    throwInvalidPath('Endpoint path must not contain URL fragments.');
  }

  if (trimmed.includes('?')) {
    throwInvalidPath('Endpoint path must not include query parameters. Use --query instead.');
  }

  let candidate =
    stripSelectedApiRoot(trimmed, api) ??
    (() => {
      if (trimmed.startsWith('/ghost/api/')) {
        throwInvalidPath('Endpoint path must stay within the selected Ghost API root.');
      }

      return trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
    })();

  const rawSegments = candidate.split('/').filter(Boolean);
  for (const segment of rawSegments) {
    validatePathSegment(segment);
  }

  candidate = rawSegments.length === 0 ? '/' : `/${rawSegments.join('/')}/`;
  return candidate;
}
