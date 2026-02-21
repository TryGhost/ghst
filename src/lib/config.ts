import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { ApiVersionSchema, SiteAliasSchema, UrlSchema } from '../schemas/common.js';
import {
  type GhstProjectConfig,
  type GhstUserConfig,
  ProjectConfigSchema,
  UserConfigSchema,
} from '../schemas/config.js';
import { ExitCode, GhstError } from './errors.js';
import type { ConnectionConfig, GlobalOptions } from './types.js';

const DEFAULT_API_VERSION = 'v6.0';

export function deriveSiteAlias(url: string): string {
  const hostname = new URL(url).hostname.replace(/^www\./, '');
  const [base = hostname] = hostname.split('.');
  return base.replace(/[^a-zA-Z0-9-]/g, '-').toLowerCase();
}

export function getConfigDir(env: NodeJS.ProcessEnv = process.env): string {
  return env.GHST_CONFIG_DIR || path.join(os.homedir(), '.config', 'ghst');
}

export function getUserConfigPath(env: NodeJS.ProcessEnv = process.env): string {
  return path.join(getConfigDir(env), 'config.json');
}

export function getProjectConfigPath(cwd = process.cwd()): string {
  return path.join(cwd, '.ghst', 'config.json');
}

export async function readUserConfig(
  env: NodeJS.ProcessEnv = process.env,
): Promise<GhstUserConfig> {
  const configPath = getUserConfigPath(env);

  try {
    const raw = await fs.readFile(configPath, 'utf8');
    const json = JSON.parse(raw) as unknown;
    return UserConfigSchema.parse(json);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return UserConfigSchema.parse({ version: 1, sites: {} });
    }

    if (error instanceof SyntaxError) {
      throw new GhstError(`Invalid JSON in ${configPath}`, {
        exitCode: ExitCode.GENERAL_ERROR,
        code: 'INVALID_CONFIG',
      });
    }

    throw error;
  }
}

export async function writeUserConfig(
  config: GhstUserConfig,
  env: NodeJS.ProcessEnv = process.env,
): Promise<void> {
  const configPath = getUserConfigPath(env);
  await fs.mkdir(path.dirname(configPath), { recursive: true });
  await fs.writeFile(configPath, `${JSON.stringify(config, null, 2)}\n`, 'utf8');
}

export async function readProjectConfig(cwd = process.cwd()): Promise<GhstProjectConfig | null> {
  const configPath = getProjectConfigPath(cwd);

  try {
    const raw = await fs.readFile(configPath, 'utf8');
    const json = JSON.parse(raw) as unknown;
    return ProjectConfigSchema.parse(json);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return null;
    }

    if (error instanceof SyntaxError) {
      throw new GhstError(`Invalid JSON in ${configPath}`, {
        exitCode: ExitCode.GENERAL_ERROR,
        code: 'INVALID_PROJECT_CONFIG',
      });
    }

    throw error;
  }
}

export async function writeProjectConfig(
  config: GhstProjectConfig,
  cwd = process.cwd(),
): Promise<void> {
  const configPath = getProjectConfigPath(cwd);
  await fs.mkdir(path.dirname(configPath), { recursive: true });
  await fs.writeFile(configPath, `${JSON.stringify(config, null, 2)}\n`, 'utf8');
}

function resolveSiteFromConfig(
  alias: string,
  config: GhstUserConfig,
  source: ConnectionConfig['source'],
): ConnectionConfig {
  const site = config.sites[alias];
  if (!site) {
    throw new GhstError(`Site alias not found: ${alias}`, {
      exitCode: ExitCode.AUTH_ERROR,
      code: 'SITE_NOT_FOUND',
    });
  }

  return {
    url: site.url,
    key: site.adminApiKey,
    apiVersion: site.apiVersion,
    siteAlias: alias,
    source,
  };
}

export async function resolveConnectionConfig(
  global: GlobalOptions,
  options: {
    env?: NodeJS.ProcessEnv;
    cwd?: string;
    userConfig?: GhstUserConfig;
    projectConfig?: GhstProjectConfig | null;
  } = {},
): Promise<ConnectionConfig> {
  const env = options.env ?? process.env;
  const cwd = options.cwd ?? process.cwd();
  const userConfig = options.userConfig ?? (await readUserConfig(env));
  const projectConfig =
    options.projectConfig === undefined ? await readProjectConfig(cwd) : options.projectConfig;

  if (global.site) {
    SiteAliasSchema.parse(global.site);
    return resolveSiteFromConfig(global.site, userConfig, 'site');
  }

  const hasUrlFlag = global.url !== undefined;
  const hasKeyFlag = global.key !== undefined;
  const hasDirectFlags = hasUrlFlag || hasKeyFlag;
  const directVersion = env.GHOST_API_VERSION ?? DEFAULT_API_VERSION;

  if (hasDirectFlags) {
    const directUrl = global.url;
    const directKey = global.key;

    if (directUrl === undefined || directKey === undefined) {
      throw new GhstError('Both --url and --key are required when using direct credential flags.', {
        exitCode: ExitCode.USAGE_ERROR,
        code: 'USAGE_ERROR',
      });
    }

    UrlSchema.parse(directUrl);
    ApiVersionSchema.parse(directVersion);
    return {
      url: directUrl,
      key: directKey,
      apiVersion: directVersion,
      source: 'flags',
    };
  }

  if (env.GHOST_URL && env.GHOST_ADMIN_API_KEY) {
    UrlSchema.parse(env.GHOST_URL);
    ApiVersionSchema.parse(directVersion);
    return {
      url: env.GHOST_URL,
      key: env.GHOST_ADMIN_API_KEY,
      apiVersion: directVersion,
      source: 'env',
    };
  }

  if (env.GHOST_SITE) {
    return resolveSiteFromConfig(env.GHOST_SITE, userConfig, 'site');
  }

  if (projectConfig?.site) {
    return resolveSiteFromConfig(projectConfig.site, userConfig, 'project');
  }

  if (userConfig.active) {
    return resolveSiteFromConfig(userConfig.active, userConfig, 'active');
  }

  throw new GhstError(
    'No site configuration found. Use ghst auth login, set env vars, or pass --url and --key.',
    {
      exitCode: ExitCode.AUTH_ERROR,
      code: 'AUTH_REQUIRED',
    },
  );
}
