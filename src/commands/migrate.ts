import type { Command } from 'commander';
import { getGlobalOptions } from '../lib/context.js';
import { ExitCode, GhstError } from '../lib/errors.js';
import {
  migrateExport,
  migrateImportCsv,
  migrateImportJson,
  migrateImportMedium,
  migrateImportSubstack,
  migrateImportWordpress,
} from '../lib/migrate.js';
import { printJson } from '../lib/output.js';
import {
  MigrateCsvInputSchema,
  MigrateExportInputSchema,
  MigrateJsonInputSchema,
  MigrateMediumInputSchema,
  MigrateSubstackInputSchema,
  MigrateWordpressInputSchema,
} from '../schemas/migrate.js';

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

function getRootCommand(command: Command): Command {
  let cursor: Command = command;
  while (cursor.parent) {
    cursor = cursor.parent;
  }
  return cursor;
}

function getExplicitSubstackSourceUrl(command: Command): string | undefined {
  const rootCommand = getRootCommand(command);
  const rawArgs = (rootCommand as unknown as { rawArgs?: string[] }).rawArgs ?? [];
  const substackIndex = rawArgs.lastIndexOf('substack');

  if (substackIndex === -1) {
    return undefined;
  }

  for (let index = substackIndex + 1; index < rawArgs.length; index += 1) {
    const token = rawArgs[index] ?? '';
    if (token === '--') {
      break;
    }

    if (token === '--url') {
      const value = rawArgs[index + 1];
      return value && !value.startsWith('-') ? value : undefined;
    }

    if (token.startsWith('--url=')) {
      const [, value = ''] = token.split('=');
      return value;
    }
  }

  return undefined;
}

export function registerMigrateCommands(program: Command): void {
  const migrate = program.command('migrate').description('Migration utilities');

  migrate
    .command('wordpress')
    .description('Import from WordPress XML export')
    .requiredOption('--file <path>', 'Path to WordPress XML file')
    .action(async (options, command) => {
      const global = getGlobalOptions(command);
      const parsed = MigrateWordpressInputSchema.safeParse({ file: options.file });
      if (!parsed.success) {
        throwValidationError(parsed.error);
      }

      const payload = await migrateImportWordpress(global, parsed.data.file);
      if (global.json) {
        printJson(payload, global.jq);
        return;
      }

      console.log('WordPress migration import completed.');
    });

  migrate
    .command('medium')
    .description('Import from Medium export zip')
    .requiredOption('--file <path>', 'Path to Medium export zip')
    .action(async (options, command) => {
      const global = getGlobalOptions(command);
      const parsed = MigrateMediumInputSchema.safeParse({ file: options.file });
      if (!parsed.success) {
        throwValidationError(parsed.error);
      }

      const payload = await migrateImportMedium(global, parsed.data.file);
      if (global.json) {
        printJson(payload, global.jq);
        return;
      }

      console.log('Medium migration import completed.');
    });

  migrate
    .command('substack')
    .description('Import from Substack export zip')
    .requiredOption('--file <path>', 'Path to Substack export zip')
    .option('--url <url>', 'Substack site url')
    .option('--target-url <url>', 'Ghost destination URL override')
    .action(async (options, command) => {
      const sourceUrl = getExplicitSubstackSourceUrl(command);
      if (!sourceUrl) {
        throw new GhstError('Substack migration requires --url.', {
          code: 'USAGE_ERROR',
          exitCode: ExitCode.USAGE_ERROR,
        });
      }

      const global = {
        ...getGlobalOptions(command),
        // Keep migrate source --url distinct from Ghost destination URL override.
        url: options.targetUrl as string | undefined,
      };

      const parsed = MigrateSubstackInputSchema.safeParse({
        file: options.file,
        url: sourceUrl,
      });
      if (!parsed.success) {
        throwValidationError(parsed.error);
      }

      const payload = await migrateImportSubstack(global, parsed.data.file, parsed.data.url);
      if (global.json) {
        printJson(payload, global.jq);
        return;
      }

      console.log('Substack migration import completed.');
    });

  migrate
    .command('csv')
    .description('Import from canonical CSV schema')
    .requiredOption('--file <path>', 'Path to CSV file')
    .action(async (options, command) => {
      const global = getGlobalOptions(command);
      const parsed = MigrateCsvInputSchema.safeParse({ file: options.file });
      if (!parsed.success) {
        throwValidationError(parsed.error);
      }

      const payload = await migrateImportCsv(global, parsed.data.file);
      if (global.json) {
        printJson(payload, global.jq);
        return;
      }

      console.log(`CSV migration completed (${String(payload.imported ?? 0)} rows imported).`);
    });

  migrate
    .command('json')
    .description('Import Ghost JSON/ZIP export')
    .requiredOption('--file <path>', 'Path to Ghost import file')
    .action(async (options, command) => {
      const global = getGlobalOptions(command);
      const parsed = MigrateJsonInputSchema.safeParse({ file: options.file });
      if (!parsed.success) {
        throwValidationError(parsed.error);
      }

      const payload = await migrateImportJson(global, parsed.data.file);
      if (global.json) {
        printJson(payload, global.jq);
        return;
      }

      console.log('Ghost JSON migration import completed.');
    });

  migrate
    .command('export')
    .description('Export site content as Ghost backup')
    .requiredOption('--output <path>', 'Output file path')
    .action(async (options, command) => {
      const global = getGlobalOptions(command);
      const parsed = MigrateExportInputSchema.safeParse({ output: options.output });
      if (!parsed.success) {
        throwValidationError(parsed.error);
      }

      const outputPath = await migrateExport(global, parsed.data.output);
      if (global.json) {
        printJson({ ok: true, output: outputPath }, global.jq);
        return;
      }

      console.log(`Exported Ghost backup to ${outputPath}`);
    });
}
