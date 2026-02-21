import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type { Command } from 'commander';
import { getGlobalOptions } from '../lib/context.js';
import { ExitCode, GhstError } from '../lib/errors.js';
import { printJson, printThemeHuman, printThemeListHuman } from '../lib/output.js';
import { parseInteger } from '../lib/parse.js';
import { runThemeDev } from '../lib/theme-dev.js';
import { activateTheme, listThemes, uploadTheme } from '../lib/themes.js';
import {
  ThemeActivateInputSchema,
  ThemeDevInputSchema,
  ThemeUploadInputSchema,
  ThemeValidateInputSchema,
} from '../schemas/theme.js';

function throwValidationError(error: unknown): never {
  throw new GhstError(
    (error as { issues?: Array<{ message: string }> }).issues?.map((i) => i.message).join('; ') ??
      'Validation failed',
    {
      exitCode: ExitCode.VALIDATION_ERROR,
      code: 'VALIDATION_ERROR',
      details: error,
    },
  );
}

async function zipDirectory(directoryPath: string): Promise<string> {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ghst-theme-'));
  const zipPath = path.join(tempDir, `${path.basename(directoryPath)}.zip`);

  await new Promise<void>((resolve, reject) => {
    const child = spawn('zip', ['-r', zipPath, '.'], {
      cwd: directoryPath,
      stdio: 'ignore',
    });

    child.on('error', (error) => reject(error));
    child.on('exit', (code) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(new Error(`zip command failed with code ${code}`));
    });
  });

  return zipPath;
}

async function validateTheme(targetPath: string): Promise<Record<string, unknown>> {
  const gscanModule = (await import('gscan')) as {
    default?: {
      check?: (target: string, options?: Record<string, unknown>) => Promise<unknown>;
      checkZip?: (target: string, options?: Record<string, unknown>) => Promise<unknown>;
    };
    check?: (target: string, options?: Record<string, unknown>) => Promise<unknown>;
    checkZip?: (target: string, options?: Record<string, unknown>) => Promise<unknown>;
  };

  const gscan = gscanModule.default ?? gscanModule;
  const stat = await fs.stat(targetPath);
  if (stat.isDirectory()) {
    const result = await gscan.check?.(targetPath, {
      checkVersion: 'v6',
    });
    return (result as Record<string, unknown>) ?? {};
  }

  const result = await gscan.checkZip?.(targetPath, {
    checkVersion: 'v6',
  });
  return (result as Record<string, unknown>) ?? {};
}

function getValidationErrorCount(result: Record<string, unknown>): number {
  const nested = (result.results as Record<string, unknown> | undefined) ?? {};

  const fromNestedError = nested.error;
  if (Array.isArray(fromNestedError)) {
    return fromNestedError.length;
  }

  if (
    fromNestedError &&
    typeof fromNestedError === 'object' &&
    Array.isArray((fromNestedError as { all?: unknown[] }).all)
  ) {
    return ((fromNestedError as { all?: unknown[] }).all ?? []).length;
  }

  const fromNestedErrors = nested.errors;
  if (Array.isArray(fromNestedErrors)) {
    return fromNestedErrors.length;
  }

  if (Array.isArray(result.error)) {
    return result.error.length;
  }

  if (Array.isArray(result.errors)) {
    return result.errors.length;
  }

  return 0;
}

let themeValidatorForTests: ((targetPath: string) => Promise<Record<string, unknown>>) | null =
  null;
let themeDevRunnerForTests:
  | ((
      global: ReturnType<typeof getGlobalOptions>,
      options: {
        path: string;
        watch?: boolean;
        activate?: boolean;
        debounceMs?: number;
        onEvent?: (event: Record<string, unknown>) => void;
      },
    ) => Promise<Record<string, unknown>>)
  | null = null;

export function setThemeValidatorForTests(
  validator: ((targetPath: string) => Promise<Record<string, unknown>>) | null,
): void {
  themeValidatorForTests = validator;
}

export function setThemeDevRunnerForTests(
  runner:
    | ((
        global: ReturnType<typeof getGlobalOptions>,
        options: {
          path: string;
          watch?: boolean;
          activate?: boolean;
          debounceMs?: number;
          onEvent?: (event: Record<string, unknown>) => void;
        },
      ) => Promise<Record<string, unknown>>)
    | null,
): void {
  themeDevRunnerForTests = runner;
}

export function registerThemeCommands(program: Command): void {
  const theme = program.command('theme').description('Theme management');

  theme
    .command('list')
    .description('List themes')
    .action(async (_, command) => {
      const global = getGlobalOptions(command);
      const payload = await listThemes(global);

      if (global.json) {
        printJson(payload, global.jq);
        return;
      }

      printThemeListHuman(payload, global.color !== false);
    });

  theme
    .command('upload <pathArg>')
    .description('Upload a theme zip or directory (with --zip)')
    .option('--zip', 'Zip a directory before upload')
    .option('--activate', 'Activate uploaded theme when possible')
    .action(async (pathArg: string, options, command) => {
      const global = getGlobalOptions(command);
      const parsed = ThemeUploadInputSchema.safeParse({
        path: pathArg,
        zip: options.zip,
        activate: options.activate,
      });

      if (!parsed.success) {
        throwValidationError(parsed.error);
      }

      const stat = await fs.stat(parsed.data.path);
      let uploadPath = parsed.data.path;
      if (stat.isDirectory()) {
        if (!parsed.data.zip) {
          throw new GhstError(
            'Theme path is a directory. Pass --zip to archive it before upload.',
            {
              code: 'USAGE_ERROR',
              exitCode: ExitCode.USAGE_ERROR,
            },
          );
        }

        uploadPath = await zipDirectory(parsed.data.path);
      }

      const payload = await uploadTheme(global, uploadPath);

      if (parsed.data.activate) {
        const themes = Array.isArray(payload.themes)
          ? (payload.themes as Array<Record<string, unknown>>)
          : [];
        const uploadedTheme = themes[0] ?? payload;
        const name = String(uploadedTheme.name ?? '').trim();
        if (name) {
          await activateTheme(global, name);
        }
      }

      if (global.json) {
        printJson(payload, global.jq);
        return;
      }

      printThemeHuman(payload);
    });

  theme
    .command('activate <name>')
    .description('Activate a theme')
    .action(async (name: string, _, command) => {
      const global = getGlobalOptions(command);
      const parsed = ThemeActivateInputSchema.safeParse({ name });

      if (!parsed.success) {
        throwValidationError(parsed.error);
      }

      const payload = await activateTheme(global, parsed.data.name);

      if (global.json) {
        printJson(payload, global.jq);
        return;
      }

      printThemeHuman(payload);
    });

  theme
    .command('validate <pathArg>')
    .description('Validate a theme zip or directory with gscan')
    .action(async (pathArg: string, _, command) => {
      const global = getGlobalOptions(command);
      const parsed = ThemeValidateInputSchema.safeParse({ path: pathArg });

      if (!parsed.success) {
        throwValidationError(parsed.error);
      }

      const result = themeValidatorForTests
        ? await themeValidatorForTests(parsed.data.path)
        : await validateTheme(parsed.data.path);
      const errorCount = getValidationErrorCount(result);

      if (global.json) {
        printJson(result, global.jq);
      } else {
        console.log(`Theme validation completed with ${errorCount} error(s).`);
      }

      if (errorCount > 0) {
        throw new GhstError(`Theme validation failed with ${errorCount} error(s).`, {
          code: 'VALIDATION_ERROR',
          exitCode: ExitCode.VALIDATION_ERROR,
        });
      }
    });

  theme
    .command('dev <pathArg>')
    .description('Watch a theme directory and auto-upload on changes')
    .option('--watch', 'Keep watching for changes')
    .option('--activate', 'Activate after successful uploads')
    .option('--debounce-ms <ms>', 'Debounce delay before upload')
    .action(async (pathArg: string, options, command) => {
      const global = getGlobalOptions(command);
      const parsed = ThemeDevInputSchema.safeParse({
        path: pathArg,
        watch: options.watch,
        activate: options.activate,
        debounceMs: parseInteger(options.debounceMs, 'debounce-ms'),
      });

      if (!parsed.success) {
        throwValidationError(parsed.error);
      }

      const runner = themeDevRunnerForTests ?? runThemeDev;
      const payload = await runner(global, {
        path: parsed.data.path,
        watch: parsed.data.watch,
        activate: parsed.data.activate,
        debounceMs: parsed.data.debounceMs,
        onEvent: (event) => {
          if (global.json) {
            console.log(JSON.stringify(event));
          } else if (event.type === 'uploaded') {
            const source = String(event.source ?? 'unknown');
            const activeTheme = String(event.activeTheme ?? '');
            if (activeTheme) {
              console.log(`Uploaded (${source}) and activated '${activeTheme}'.`);
            } else {
              console.log(`Uploaded (${source}).`);
            }
          } else if (event.type === 'error') {
            console.error(`Theme dev upload error: ${String(event.message ?? '')}`);
          }
        },
      });

      if (global.json) {
        printJson(payload, global.jq);
        return;
      }
      printThemeHuman(payload);
    });
}
