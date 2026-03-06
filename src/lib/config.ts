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
import { credentialRefForAlias, getCredentialStore } from './credentials.js';
import { ExitCode, GhstError } from './errors.js';
import type { ConnectionConfig, GlobalOptions } from './types.js';

const DEFAULT_API_VERSION = 'v6.0';
const CURRENT_CONFIG_VERSION = 2;
let warnedPlaintextStaffTokens = false;

function isPosixPlatform(): boolean {
  return process.platform !== 'win32';
}

async function enforceSecureUserConfigPermissions(configPath: string): Promise<void> {
  if (!isPosixPlatform()) {
    return;
  }

  let stat: Awaited<ReturnType<typeof fs.stat>> | null = null;
  try {
    stat = await fs.stat(configPath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return;
    }
    throw error;
  }

  const mode = stat.mode & 0o777;
  if ((mode & 0o077) !== 0) {
    await fs.chmod(configPath, 0o600);
  }
}

function withCurrentConfigVersion(config: GhstUserConfig): GhstUserConfig {
  return {
    ...config,
    version: Math.max(config.version, CURRENT_CONFIG_VERSION),
  };
}

function hasPlaintextStaffTokens(config: GhstUserConfig): boolean {
  return Object.values(config.sites).some((site) =>
    Boolean(site.staffAccessToken && !site.credentialRef),
  );
}

function warnPlaintextCredentialFallback(): void {
  if (warnedPlaintextStaffTokens || process.env.VITEST) {
    return;
  }

  warnedPlaintextStaffTokens = true;
  console.error(
    'Warning: secure credential storage is unavailable; plaintext staff access tokens remain in config. Re-login once secure storage is available.',
  );
}

async function migratePlaintextStaffTokens(
  config: GhstUserConfig,
  env: NodeJS.ProcessEnv,
): Promise<GhstUserConfig> {
  if (!hasPlaintextStaffTokens(config)) {
    return config;
  }

  const store = getCredentialStore();
  const available = await store.isAvailable().catch(() => false);
  if (!available) {
    warnPlaintextCredentialFallback();
    return config;
  }

  let changed = false;
  const next = structuredClone(config);

  for (const [alias, site] of Object.entries(next.sites)) {
    const staffToken = site.staffAccessToken;
    if (!staffToken || site.credentialRef) {
      continue;
    }

    const credentialRef = credentialRefForAlias(alias);
    await store.set(credentialRef, staffToken);
    site.credentialRef = credentialRef;
    delete site.staffAccessToken;
    changed = true;
  }

  if (!changed) {
    return config;
  }

  const normalized = withCurrentConfigVersion(next);
  await writeUserConfig(normalized, env);
  return normalized;
}

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

async function findProjectConfigPath(cwd = process.cwd()): Promise<string | null> {
  let dir = path.resolve(cwd);
  const root = path.parse(dir).root;

  while (true) {
    const candidate = path.join(dir, '.ghst', 'config.json');
    try {
      await fs.access(candidate);
      return candidate;
    } catch {
      // not found at this level, keep walking up
    }

    if (dir === root) {
      return null;
    }

    dir = path.dirname(dir);
  }
}

export async function readUserConfig(
  env: NodeJS.ProcessEnv = process.env,
): Promise<GhstUserConfig> {
  const configPath = getUserConfigPath(env);

  try {
    const raw = await fs.readFile(configPath, 'utf8');
    const json = JSON.parse(raw) as unknown;
    const parsed = UserConfigSchema.parse(json);
    await enforceSecureUserConfigPermissions(configPath);
    return await migratePlaintextStaffTokens(parsed, env);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return UserConfigSchema.parse({ version: CURRENT_CONFIG_VERSION, sites: {} });
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
  const normalized = withCurrentConfigVersion(UserConfigSchema.parse(config));
  await fs.mkdir(path.dirname(configPath), {
    recursive: true,
    ...(isPosixPlatform() ? { mode: 0o700 } : {}),
  });
  await fs.writeFile(configPath, `${JSON.stringify(normalized, null, 2)}\n`, {
    encoding: 'utf8',
    ...(isPosixPlatform() ? { mode: 0o600 } : {}),
  });
  await enforceSecureUserConfigPermissions(configPath);
}

export async function readProjectConfig(cwd = process.cwd()): Promise<GhstProjectConfig | null> {
  const configPath = await findProjectConfigPath(cwd);
  if (!configPath) {
    return null;
  }

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

async function resolveSiteFromConfig(
  alias: string,
  config: GhstUserConfig,
  source: ConnectionConfig['source'],
): Promise<ConnectionConfig> {
  const site = config.sites[alias];
  if (!site) {
    throw new GhstError(`Site alias not found: ${alias}`, {
      exitCode: ExitCode.AUTH_ERROR,
      code: 'SITE_NOT_FOUND',
    });
  }

  let staffToken = site.staffAccessToken;
  if (!staffToken && site.credentialRef) {
    const store = getCredentialStore();
    const available = await store.isAvailable().catch(() => false);
    if (!available) {
      throw new GhstError(
        `Secure credential storage is unavailable for site alias: ${alias}. Re-login with --insecure-storage or enable system keychain integration.`,
        {
          exitCode: ExitCode.AUTH_ERROR,
          code: 'AUTH_REQUIRED',
        },
      );
    }

    staffToken = (await store.get(site.credentialRef)) ?? undefined;
  }

  if (!staffToken) {
    throw new GhstError(
      `Credentials for site alias '${alias}' are unavailable. Run ghst auth login.`,
      {
        exitCode: ExitCode.AUTH_ERROR,
        code: 'AUTH_REQUIRED',
      },
    );
  }

  return {
    url: site.url,
    staffToken,
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
    return await resolveSiteFromConfig(global.site, userConfig, 'site');
  }

  const hasUrlFlag = global.url !== undefined;
  const hasStaffTokenFlag = global.staffToken !== undefined;
  const hasDirectFlags = hasUrlFlag || hasStaffTokenFlag;
  const directVersion = env.GHOST_API_VERSION ?? DEFAULT_API_VERSION;

  if (hasDirectFlags) {
    const directUrl = global.url;
    const directStaffToken = global.staffToken;

    if (directUrl === undefined || directStaffToken === undefined) {
      throw new GhstError(
        'Both --url and --staff-token are required when using direct credential flags.',
        {
          exitCode: ExitCode.USAGE_ERROR,
          code: 'USAGE_ERROR',
        },
      );
    }

    UrlSchema.parse(directUrl);
    ApiVersionSchema.parse(directVersion);
    return {
      url: directUrl,
      staffToken: directStaffToken,
      apiVersion: directVersion,
      source: 'flags',
    };
  }

  if (env.GHOST_URL && env.GHOST_STAFF_ACCESS_TOKEN) {
    UrlSchema.parse(env.GHOST_URL);
    ApiVersionSchema.parse(directVersion);
    return {
      url: env.GHOST_URL,
      staffToken: env.GHOST_STAFF_ACCESS_TOKEN,
      apiVersion: directVersion,
      source: 'env',
    };
  }

  if (env.GHOST_SITE) {
    return await resolveSiteFromConfig(env.GHOST_SITE, userConfig, 'site');
  }

  if (projectConfig?.site) {
    return await resolveSiteFromConfig(projectConfig.site, userConfig, 'project');
  }

  if (userConfig.active) {
    return await resolveSiteFromConfig(userConfig.active, userConfig, 'active');
  }

  throw new GhstError(
    'No site configuration found. Use ghst auth login, set env vars, or pass --url and --staff-token.',
    {
      exitCode: ExitCode.AUTH_ERROR,
      code: 'AUTH_REQUIRED',
    },
  );
}
