import { describe, expect, test } from 'vitest';
import { ExitCode, mapHttpStatusToExitCode } from '../src/lib/errors.js';

describe('mapHttpStatusToExitCode', () => {
  test('maps auth status codes', () => {
    expect(mapHttpStatusToExitCode(401)).toBe(ExitCode.AUTH_ERROR);
    expect(mapHttpStatusToExitCode(403)).toBe(ExitCode.AUTH_ERROR);
  });

  test('maps not found status code', () => {
    expect(mapHttpStatusToExitCode(404)).toBe(ExitCode.NOT_FOUND);
  });

  test('maps validation status code', () => {
    expect(mapHttpStatusToExitCode(422)).toBe(ExitCode.VALIDATION_ERROR);
  });

  test('maps rate limit status code', () => {
    expect(mapHttpStatusToExitCode(429)).toBe(ExitCode.RATE_LIMITED);
  });
});
