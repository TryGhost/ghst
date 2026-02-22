import type { Command } from 'commander';
import { getUserConfigPath, readUserConfig, writeUserConfig } from '../lib/config.js';
import { getGlobalOptions } from '../lib/context.js';
import { ExitCode, GhstError } from '../lib/errors.js';
import { UserConfigSchema } from '../schemas/config.js';

const REDACTED = '<redacted>';
const SENSITIVE_KEY_PATTERN = /(key|token|secret|password)/i;

function isSensitivePath(path: string): boolean {
  return path
    .split('.')
    .some(
      (segment) => segment.toLowerCase() === 'adminapikey' || SENSITIVE_KEY_PATTERN.test(segment),
    );
}

function redactValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((entry) => redactValue(entry));
  }

  if (!value || typeof value !== 'object') {
    return value;
  }

  const output: Record<string, unknown> = {};
  for (const [key, entryValue] of Object.entries(value as Record<string, unknown>)) {
    if (key === 'adminApiKey' || SENSITIVE_KEY_PATTERN.test(key)) {
      output[key] = REDACTED;
      continue;
    }
    output[key] = redactValue(entryValue);
  }

  return output;
}

function getByPath(source: Record<string, unknown>, keyPath: string): unknown {
  return keyPath.split('.').reduce<unknown>((acc, key) => {
    if (typeof acc !== 'object' || acc === null) {
      return undefined;
    }
    return (acc as Record<string, unknown>)[key];
  }, source);
}

function setByPath(target: Record<string, unknown>, keyPath: string, value: unknown): void {
  const parts = keyPath.split('.');
  const leaf = parts.pop();

  if (!leaf) {
    throw new GhstError('Invalid config path.', {
      code: 'USAGE_ERROR',
      exitCode: ExitCode.USAGE_ERROR,
    });
  }

  let cursor: Record<string, unknown> = target;
  for (const part of parts) {
    const next = cursor[part];
    if (typeof next !== 'object' || next === null) {
      cursor[part] = {};
    }
    cursor = cursor[part] as Record<string, unknown>;
  }

  cursor[leaf] = value;
}

function parseConfigValue(
  configPath: string,
  rawValue: string,
  config: Record<string, unknown>,
): unknown {
  if (configPath === 'defaults.limit') {
    const limit = Number(rawValue);
    if (!Number.isInteger(limit) || limit <= 0) {
      throw new GhstError('defaults.limit must be a positive integer.', {
        code: 'VALIDATION_ERROR',
        exitCode: ExitCode.VALIDATION_ERROR,
      });
    }
    return limit;
  }

  if (configPath === 'defaults.format' || configPath === 'defaults.editor') {
    return rawValue;
  }

  if (configPath === 'active') {
    if (rawValue === 'none') {
      return undefined;
    }

    const sites = (config.sites as Record<string, unknown> | undefined) ?? {};
    if (!sites[rawValue]) {
      throw new GhstError(`Unknown site alias: ${rawValue}`, {
        code: 'SITE_NOT_FOUND',
        exitCode: ExitCode.NOT_FOUND,
      });
    }
    return rawValue;
  }

  throw new GhstError(`Unsupported config path: ${configPath}`, {
    code: 'USAGE_ERROR',
    exitCode: ExitCode.USAGE_ERROR,
  });
}

export function registerConfigCommands(program: Command): void {
  const config = program.command('config').description('CLI configuration');

  config
    .command('show')
    .description('Show current user config')
    .option('--show-secrets', 'Display sensitive values in plaintext')
    .action(async (options, command) => {
      const global = getGlobalOptions(command);
      const userConfig = await readUserConfig();
      const payload = options.showSecrets ? userConfig : redactValue(userConfig);

      if (global.json) {
        console.log(JSON.stringify(payload, null, 2));
        return;
      }

      console.log(JSON.stringify(payload, null, 2));
    });

  config
    .command('path')
    .description('Print user config file path')
    .action(() => {
      console.log(getUserConfigPath());
    });

  config
    .command('list')
    .description('List configurable defaults')
    .action(async (_, command) => {
      const global = getGlobalOptions(command);
      const userConfig = await readUserConfig();
      const payload = {
        active: userConfig.active ?? null,
        defaults: userConfig.defaults ?? {},
        sites: Object.keys(userConfig.sites),
      };

      if (global.json) {
        console.log(JSON.stringify(payload, null, 2));
        return;
      }

      console.log(JSON.stringify(payload, null, 2));
    });

  config
    .command('get <path>')
    .description('Read a config value by dot path')
    .option('--show-secrets', 'Display sensitive values in plaintext')
    .action(async (path: string, options, command) => {
      const global = getGlobalOptions(command);
      const userConfig = await readUserConfig();
      let value = getByPath(userConfig as unknown as Record<string, unknown>, path);

      if (global.json) {
        if (!options.showSecrets && isSensitivePath(path)) {
          value = REDACTED;
        }
        console.log(JSON.stringify({ path, value: value ?? null }, null, 2));
        return;
      }

      if (value === undefined) {
        throw new GhstError(`Config value not found: ${path}`, {
          code: 'NOT_FOUND',
          exitCode: ExitCode.NOT_FOUND,
        });
      }

      if (!options.showSecrets && isSensitivePath(path)) {
        value = REDACTED;
      }
      console.log(typeof value === 'object' ? JSON.stringify(value, null, 2) : String(value));
    });

  config
    .command('set <path> <value>')
    .description('Set a config value by dot path')
    .action(async (path: string, value: string) => {
      const userConfig = await readUserConfig();
      const mutable = structuredClone(userConfig) as unknown as Record<string, unknown>;
      const parsedValue = parseConfigValue(path, value, mutable);

      setByPath(mutable, path, parsedValue);
      const validated = UserConfigSchema.parse(mutable);
      await writeUserConfig(validated);

      console.log(`Updated ${path}.`);
    });
}
