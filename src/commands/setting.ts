import type { Command } from 'commander';
import { getGlobalOptions } from '../lib/context.js';
import { ExitCode, GhstError } from '../lib/errors.js';
import { printJson, printSettingHuman, printSettingListHuman } from '../lib/output.js';
import { getSetting, listSettings, setSetting } from '../lib/settings.js';
import { SettingGetInputSchema, SettingSetInputSchema } from '../schemas/setting.js';

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

function parseSettingValue(value: string): unknown {
  const normalized = value.trim();

  if (normalized === 'null') {
    return null;
  }

  if (normalized === 'true') {
    return true;
  }

  if (normalized === 'false') {
    return false;
  }

  if (/^-?\d+(?:\.\d+)?$/.test(normalized)) {
    return Number(normalized);
  }

  if (
    (normalized.startsWith('{') && normalized.endsWith('}')) ||
    (normalized.startsWith('[') && normalized.endsWith(']'))
  ) {
    try {
      return JSON.parse(normalized) as unknown;
    } catch {
      throw new GhstError('Invalid JSON value.', {
        code: 'USAGE_ERROR',
        exitCode: ExitCode.USAGE_ERROR,
      });
    }
  }

  return value;
}

export function registerSettingCommands(program: Command): void {
  const setting = program.command('setting').description('Settings management');

  setting
    .command('list')
    .description('List settings')
    .action(async (_, command) => {
      const global = getGlobalOptions(command);
      const payload = await listSettings(global);

      if (global.json) {
        printJson(payload, global.jq);
        return;
      }

      printSettingListHuman(payload, global.color !== false);
    });

  setting
    .command('get <key>')
    .description('Get a setting by key')
    .action(async (key: string, _, command) => {
      const global = getGlobalOptions(command);
      const parsed = SettingGetInputSchema.safeParse({ key });

      if (!parsed.success) {
        throwValidationError(parsed.error);
      }

      const payload = await getSetting(global, parsed.data.key);

      if (global.json) {
        printJson(payload, global.jq);
        return;
      }

      printSettingHuman(payload);
    });

  setting
    .command('set <key> <value>')
    .description('Set a setting value')
    .action(async (key: string, value: string, _options, command) => {
      const global = getGlobalOptions(command);
      const parsed = SettingSetInputSchema.safeParse({
        key,
        value,
      });

      if (!parsed.success) {
        throwValidationError(parsed.error);
      }

      const payload = await setSetting(
        global,
        parsed.data.key,
        parseSettingValue(parsed.data.value),
      );

      if (global.json) {
        printJson(payload, global.jq);
        return;
      }

      printSettingHuman(payload);
    });
}
