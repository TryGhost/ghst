import type { GlobalOptions } from './types.js';

export enum ExitCode {
  SUCCESS = 0,
  GENERAL_ERROR = 1,
  USAGE_ERROR = 2,
  AUTH_ERROR = 3,
  OPERATION_CANCELLED = 4,
  NOT_FOUND = 5,
  CONFLICT = 6,
  VALIDATION_ERROR = 7,
  RATE_LIMITED = 8,
}

export class GhstError extends Error {
  readonly exitCode: ExitCode;
  readonly code: string;
  readonly status?: number;
  readonly details?: unknown;

  constructor(
    message: string,
    options: {
      exitCode?: ExitCode;
      code?: string;
      status?: number;
      details?: unknown;
    } = {},
  ) {
    super(message);
    this.name = 'GhstError';
    this.exitCode = options.exitCode ?? ExitCode.GENERAL_ERROR;
    this.code = options.code ?? 'ERROR';
    this.status = options.status;
    this.details = options.details;
  }
}

export function mapHttpStatusToExitCode(status: number): ExitCode {
  if (status === 401 || status === 403) return ExitCode.AUTH_ERROR;
  if (status === 404) return ExitCode.NOT_FOUND;
  if (status === 409) return ExitCode.CONFLICT;
  if (status === 422) return ExitCode.VALIDATION_ERROR;
  if (status === 429) return ExitCode.RATE_LIMITED;
  return ExitCode.GENERAL_ERROR;
}

export function normalizeError(error: unknown): GhstError {
  if (error instanceof GhstError) return error;
  if (error instanceof Error) {
    return new GhstError(error.message, {
      code: 'UNHANDLED_ERROR',
      exitCode: ExitCode.GENERAL_ERROR,
    });
  }

  return new GhstError('Unknown error', {
    code: 'UNKNOWN_ERROR',
    exitCode: ExitCode.GENERAL_ERROR,
    details: error,
  });
}

export function formatErrorForJson(error: GhstError): Record<string, unknown> {
  return {
    error: true,
    code: error.code,
    status: error.status,
    message: error.message,
    details: error.details,
  };
}

export function printError(error: GhstError, global: GlobalOptions): void {
  if (global.json) {
    console.error(JSON.stringify(formatErrorForJson(error), null, 2));
    return;
  }

  if (error.status) {
    console.error(`Error: ${error.message} (HTTP ${error.status})`);
  } else {
    console.error(`Error: ${error.message}`);
  }
}
