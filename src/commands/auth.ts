import { spawn } from 'node:child_process';
import readline from 'node:readline/promises';
import chalk from 'chalk';
import type { Command } from 'commander';
import { generateStaffJwt, parseStaffAccessToken } from '../lib/auth.js';
import { GhostClient } from '../lib/client.js';
import {
  deriveSiteAlias,
  readProjectConfig,
  readUserConfig,
  resolveConnectionConfig,
  resolveProjectConfigCwd,
  writeProjectConfig,
  writeUserConfig,
} from '../lib/config.js';
import { getGlobalOptions } from '../lib/context.js';
import { credentialRefForAlias, getCredentialStore } from '../lib/credentials.js';
import { ExitCode, GhstError } from '../lib/errors.js';
import { confirmDestructiveAction } from '../lib/prompts.js';
import { isNonInteractive } from '../lib/tty.js';

type PromptFn = (question: string) => Promise<string>;
type OpenUrlFn = (url: string) => Promise<void>;

interface ResolvedGhostAdminOrigin {
  inputOrigin: string;
  resolvedOrigin: string;
}

const LOGIN_GUIDANCE_BORDER = '------------------------------------------------------------';
const LOGIN_GUIDANCE_TITLE = 'Continue In Ghost Admin';
const LOGIN_GUIDANCE_LINE =
  'Copy the staff access token from your profile, then return here to continue.';

/* c8 ignore start */
async function prompt(question: string): Promise<string> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  try {
    const value = await rl.question(question);
    return value.trim();
  } finally {
    rl.close();
  }
}

function getBrowserOpenCommands(url: string): Array<{ command: string; args: string[] }> {
  if (process.platform === 'darwin') {
    return [{ command: 'open', args: [url] }];
  }

  if (process.platform === 'win32') {
    return [
      { command: 'cmd', args: ['/c', 'start', '', url] },
      {
        command: 'powershell',
        args: ['-NoProfile', '-NonInteractive', '-Command', `Start-Process '${url}'`],
      },
    ];
  }

  return [
    { command: 'xdg-open', args: [url] },
    { command: 'gio', args: ['open', url] },
  ];
}

async function openExternalUrl(url: string): Promise<void> {
  const commands = getBrowserOpenCommands(url);
  let lastError: Error | null = null;

  for (const { command, args } of commands) {
    try {
      await new Promise<void>((resolve, reject) => {
        const child = spawn(command, args, { stdio: 'ignore' });
        child.once('error', reject);
        child.once('close', (code) => {
          if (code === 0) {
            resolve();
            return;
          }
          reject(new Error(`Failed to open browser with '${command}' (exit ${code ?? 'unknown'})`));
        });
      });
      return;
    } catch (error) {
      lastError = error as Error;
    }
  }

  if (lastError) {
    throw lastError;
  }

  throw new Error('Failed to open browser: no launch command available.');
}

function formatOpenError(error: unknown): string {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  try {
    return String(error);
  } catch {
    return 'unknown error';
  }
}

function printOpenWarning(adminUrl: string, useColor: boolean, reason: string): void {
  const warning = `Warning: could not open browser automatically. Open this URL manually: ${adminUrl}`;
  if (reason) {
    const message = `${warning}\nReason: ${reason}`;
    console.error(useColor ? chalk.yellow(message) : message);
    return;
  }

  console.error(useColor ? chalk.yellow(warning) : warning);
}

async function openGhostAdminForLogin(adminOrigin: string, useColor: boolean): Promise<void> {
  const staffProfileUrl = getGhostStaffProfileUrl(adminOrigin);
  const preflight = `Opening Ghost Admin in your browser: ${staffProfileUrl}`;
  console.log('');
  console.log(useColor ? chalk.cyan(preflight) : preflight);
  console.log('');
  try {
    await openUrlFn(staffProfileUrl);
  } catch (error) {
    const detail = formatOpenError(error);
    printOpenWarning(staffProfileUrl, useColor, detail);
  }
}
/* c8 ignore stop */

let promptFn: PromptFn = prompt;
let openUrlFn: OpenUrlFn = openExternalUrl;

export function setPromptForTests(nextPrompt: PromptFn | null): void {
  promptFn = nextPrompt ?? prompt;
}

export function setOpenUrlForTests(nextOpenUrl: OpenUrlFn | null): void {
  openUrlFn = nextOpenUrl ?? openExternalUrl;
}

function printLoginGuidance(useColor: boolean): void {
  console.log('');
  console.log(LOGIN_GUIDANCE_BORDER);
  console.log(LOGIN_GUIDANCE_TITLE);
  console.log(LOGIN_GUIDANCE_BORDER);
  console.log(
    useColor
      ? LOGIN_GUIDANCE_LINE.replace('staff access token', chalk.yellow('staff access token'))
      : LOGIN_GUIDANCE_LINE,
  );
  console.log('');
}

const URL_PROTOCOL_PATTERN = /^[A-Za-z][A-Za-z\d+.-]*:\/\//;

function normalizeGhostUrl(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) {
    throw new GhstError('Ghost URL is required.', {
      exitCode: ExitCode.USAGE_ERROR,
      code: 'USAGE_ERROR',
    });
  }

  const candidate = URL_PROTOCOL_PATTERN.test(trimmed) ? trimmed : `https://${trimmed}`;

  let parsed: URL;
  try {
    parsed = new URL(candidate);
  } catch {
    throw new GhstError('Ghost URL must be valid (e.g. https://example.com).', {
      exitCode: ExitCode.USAGE_ERROR,
      code: 'USAGE_ERROR',
    });
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new GhstError('Ghost URL must use http:// or https://.', {
      exitCode: ExitCode.USAGE_ERROR,
      code: 'USAGE_ERROR',
    });
  }

  return parsed.origin;
}

function getGhostAdminEntryUrl(url: string): string {
  const normalizedUrl = normalizeGhostUrl(url);
  return `${normalizedUrl}/ghost`;
}

function getGhostStaffProfileUrl(url: string): string {
  const normalizedUrl = normalizeGhostUrl(url);
  return `${normalizedUrl}/ghost/#/my-profile`;
}

function formatConfiguredSiteDisplay(
  alias: string | null | undefined,
  sites: Record<string, { url: string }>,
): string {
  if (!alias) {
    return '(none)';
  }

  const url = sites[alias]?.url;
  if (!url) {
    return alias;
  }

  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}

function formatSiteDomain(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}

function formatSwitchSiteOption(alias: string, sites: Record<string, { url: string }>): string {
  const site = sites[alias];
  if (!site) {
    return alias;
  }

  const domain = formatSiteDomain(site.url);
  const duplicateCount = Object.values(sites).filter(
    (configuredSite) => formatSiteDomain(configuredSite.url) === domain,
  ).length;

  if (duplicateCount > 1) {
    return `${domain} [${alias}]`;
  }

  return domain;
}

function resolveConfiguredSiteSelection(
  input: string | null | undefined,
  sites: Record<string, { url: string }>,
): string | null {
  const candidate = input?.trim();
  if (!candidate) {
    return null;
  }

  if (sites[candidate]) {
    return candidate;
  }

  for (const alias of Object.keys(sites)) {
    if (formatSwitchSiteOption(alias, sites) === candidate) {
      return alias;
    }
  }

  const matches = Object.entries(sites)
    .filter(([, site]) => formatSiteDomain(site.url) === candidate)
    .map(([alias]) => alias);

  if (matches.length === 1) {
    return matches[0] ?? null;
  }

  return null;
}

function hasOriginChanged(inputOrigin: string, resolvedOrigin: string): boolean {
  return inputOrigin !== resolvedOrigin;
}

async function confirmRedirectedOrigin(
  inputOrigin: string,
  resolvedOrigin: string,
  useColor: boolean,
): Promise<boolean> {
  const lines = [
    'Ghost Admin redirect detected.',
    `Requested origin: ${inputOrigin}`,
    `Resolved origin: ${resolvedOrigin}`,
    'Continue with the resolved Ghost Admin origin?',
  ];
  const message = lines.join('\n');

  console.log('');
  console.log(useColor ? chalk.yellow(message) : message);
  console.log('');

  const answer = await promptFn('Continue? [y/N]: ');
  const normalized = answer.trim().toLowerCase();
  return normalized === 'y' || normalized === 'yes';
}

async function resolveGhostAdminOrigin(inputUrl: string): Promise<ResolvedGhostAdminOrigin> {
  const maxRedirects = 5;
  const inputOrigin = normalizeGhostUrl(inputUrl);
  let probeUrl = getGhostAdminEntryUrl(inputOrigin);

  for (let redirectCount = 0; redirectCount <= maxRedirects; redirectCount += 1) {
    let response: Response;
    try {
      response = await fetch(probeUrl, {
        method: 'GET',
        redirect: 'manual',
      });
    } catch (error) {
      throw new GhstError(
        `Unable to reach Ghost Admin URL '${probeUrl}': ${(error as Error).message}`,
        {
          exitCode: ExitCode.GENERAL_ERROR,
          code: 'NETWORK_ERROR',
        },
      );
    }

    const location = response.headers.get('location');
    const isRedirect = response.status >= 300 && response.status < 400;
    if (isRedirect && location) {
      probeUrl = new URL(location, probeUrl).toString();
      continue;
    }

    const finalUrl = response.url || probeUrl;
    return {
      inputOrigin,
      resolvedOrigin: normalizeGhostUrl(finalUrl),
    };
  }

  throw new GhstError(`Too many redirects while resolving Ghost Admin URL from '${inputUrl}'.`, {
    exitCode: ExitCode.GENERAL_ERROR,
    code: 'NETWORK_ERROR',
  });
}

async function persistSiteCredential(
  alias: string,
  staffTokenInput: string,
  allowInsecureStorage: boolean,
): Promise<{ credentialRef?: string; staffAccessToken?: string }> {
  const store = getCredentialStore();
  const available = await store.isAvailable().catch(() => false);

  if (available) {
    const credentialRef = credentialRefForAlias(alias);
    await store.set(credentialRef, staffTokenInput);
    return { credentialRef };
  }

  if (!allowInsecureStorage) {
    throw new GhstError(
      'Secure credential storage is unavailable. Re-run with --insecure-storage to store credentials in config.json.',
      {
        exitCode: ExitCode.USAGE_ERROR,
        code: 'USAGE_ERROR',
      },
    );
  }

  return { staffAccessToken: staffTokenInput };
}

export function registerAuthCommands(program: Command): void {
  const auth = program.command('auth').description('Authentication management');

  auth
    .command('login')
    .description('Authenticate and store site credentials')
    .option('--url <url>', 'Ghost site URL')
    .option('--staff-token <token>', 'Staff access token in {id}:{secret} format')
    .option('--staff-token-env <name>', 'Read staff token from env var name')
    .option('--non-interactive', 'Disable prompts and require explicit credentials')
    .option(
      '--insecure-storage',
      'Allow plaintext credential storage when secure storage is unavailable',
    )
    .option('--site <alias>', 'Optional site alias')
    .action(async (options, command) => {
      const global = getGlobalOptions(command);
      const nonInteractive = Boolean(options.nonInteractive);

      if (global.json && !nonInteractive) {
        throw new GhstError('Use --non-interactive when combining auth login with --json.', {
          exitCode: ExitCode.USAGE_ERROR,
          code: 'USAGE_ERROR',
        });
      }

      const envStaffTokenInput = options.staffTokenEnv
        ? process.env[options.staffTokenEnv]
        : undefined;
      let urlInput = options.url || global.url;
      let staffTokenInput = options.staffToken || global.staffToken || envStaffTokenInput;

      if (nonInteractive) {
        if (!urlInput || !staffTokenInput) {
          throw new GhstError(
            'Non-interactive login requires both --url and --staff-token (or --staff-token-env).',
            {
              exitCode: ExitCode.USAGE_ERROR,
              code: 'USAGE_ERROR',
            },
          );
        }
      } else {
        urlInput = urlInput || (await promptFn('Ghost URL (e.g. https://example.com): '));
      }

      const requestedOrigin = normalizeGhostUrl(urlInput ?? '');
      const resolvedOrigin = await resolveGhostAdminOrigin(requestedOrigin);
      urlInput = resolvedOrigin.resolvedOrigin;

      if (hasOriginChanged(resolvedOrigin.inputOrigin, resolvedOrigin.resolvedOrigin)) {
        if (nonInteractive) {
          throw new GhstError(
            `Ghost Admin discovery resolved to '${resolvedOrigin.resolvedOrigin}' instead of '${resolvedOrigin.inputOrigin}'. Re-run with --url ${resolvedOrigin.resolvedOrigin}.`,
            {
              exitCode: ExitCode.USAGE_ERROR,
              code: 'USAGE_ERROR',
            },
          );
        }

        const shouldContinue = await confirmRedirectedOrigin(
          resolvedOrigin.inputOrigin,
          resolvedOrigin.resolvedOrigin,
          global.color !== false,
        );
        if (!shouldContinue) {
          throw new GhstError('Operation cancelled.', {
            exitCode: ExitCode.OPERATION_CANCELLED,
            code: 'OPERATION_CANCELLED',
          });
        }
      }

      if (!nonInteractive) {
        printLoginGuidance(global.color !== false);
        await promptFn('Press Enter to Continue...');
        await openGhostAdminForLogin(urlInput, global.color !== false);
        if (!staffTokenInput) {
          staffTokenInput = await promptFn('Ghost Staff Access Token: ');
        }
      }

      parseStaffAccessToken(staffTokenInput);

      const client = new GhostClient({
        url: urlInput,
        staffToken: staffTokenInput,
        version: process.env.GHOST_API_VERSION ?? 'v6.0',
      });

      await client.siteInfo();

      const config = await readUserConfig();
      const alias = options.site ?? deriveSiteAlias(urlInput);
      const persisted = await persistSiteCredential(
        alias,
        staffTokenInput,
        Boolean(options.insecureStorage),
      );
      config.sites[alias] = {
        url: urlInput,
        ...(persisted.credentialRef ? { credentialRef: persisted.credentialRef } : {}),
        ...(persisted.staffAccessToken ? { staffAccessToken: persisted.staffAccessToken } : {}),
        apiVersion: process.env.GHOST_API_VERSION ?? 'v6.0',
        addedAt: new Date().toISOString(),
      };
      config.active = alias;
      await writeUserConfig(config);

      if (global.json) {
        console.log(
          JSON.stringify(
            {
              ok: true,
              site: alias,
              url: urlInput,
              active: config.active,
            },
            null,
            2,
          ),
        );
        return;
      }

      const successMessage = 'Successfully authenticated with Ghost';
      console.log(global.color === false ? successMessage : chalk.green(successMessage));
    });

  auth
    .command('status')
    .description('Show configured authentication state')
    .action(async (_, command) => {
      const global = getGlobalOptions(command);
      const config = await readUserConfig();
      const aliases = Object.keys(config.sites);

      if (global.json) {
        console.log(
          JSON.stringify(
            {
              active: config.active ?? null,
              sites: aliases,
            },
            null,
            2,
          ),
        );
        return;
      }

      if (aliases.length === 0) {
        console.log('No configured sites. Run ghst auth login.');
        return;
      }

      console.log(`Active site: ${formatConfiguredSiteDisplay(config.active, config.sites)}`);
      for (const [alias, site] of Object.entries(config.sites)) {
        const marker = config.active === alias ? '*' : ' ';
        console.log(`${marker} ${formatSiteDomain(site.url)}`);
      }
    });

  auth
    .command('list')
    .description('List configured sites')
    .action(async (_, command) => {
      const global = getGlobalOptions(command);
      const config = await readUserConfig();
      const aliases = Object.keys(config.sites);
      const projectConfig = await readProjectConfig();
      const projectSite = projectConfig?.site ?? null;
      const effectiveSite = projectSite ?? config.active ?? null;

      if (global.json) {
        console.log(
          JSON.stringify(
            {
              active: config.active ?? null,
              ...(projectSite ? { projectLink: projectSite } : {}),
              effectiveSite,
              sites: aliases,
            },
            null,
            2,
          ),
        );
        return;
      }

      if (aliases.length === 0) {
        console.log('No configured sites. Run ghst auth login.');
        return;
      }

      console.log(`Active site: ${formatConfiguredSiteDisplay(config.active, config.sites)}`);
      if (projectSite) {
        console.log(
          `Project link: ${formatConfiguredSiteDisplay(projectSite, config.sites)} (overrides active site in this directory)`,
        );
      }
      for (const [alias, site] of Object.entries(config.sites)) {
        const marker = effectiveSite === alias ? '*' : ' ';
        console.log(`${marker} ${formatSiteDomain(site.url)}`);
      }
    });

  auth
    .command('switch [site]')
    .description('Switch active site (interactive if omitted)')
    .action(async (site: string | undefined) => {
      const config = await readUserConfig();
      const aliases = Object.keys(config.sites);

      if (aliases.length === 0) {
        throw new GhstError('No configured sites. Run ghst auth login first.', {
          exitCode: ExitCode.AUTH_ERROR,
          code: 'AUTH_REQUIRED',
        });
      }

      let targetSite = site;
      if (!targetSite) {
        if (!process.stdin.isTTY) {
          throw new GhstError('Missing site argument. Run interactively or provide <site>.', {
            exitCode: ExitCode.USAGE_ERROR,
            code: 'USAGE_ERROR',
          });
        }

        console.log('Configured sites:');
        for (const alias of aliases) {
          const marker = config.active === alias ? '*' : ' ';
          console.log(`${marker} ${formatSwitchSiteOption(alias, config.sites)}`);
        }

        targetSite = await promptFn('Switch to site domain or alias: ');
      }

      const resolvedTargetSite = resolveConfiguredSiteSelection(targetSite, config.sites);
      if (!resolvedTargetSite) {
        throw new GhstError(`Unknown site alias or domain: ${targetSite ?? '(empty)'}`, {
          exitCode: ExitCode.NOT_FOUND,
          code: 'SITE_NOT_FOUND',
        });
      }

      config.active = resolvedTargetSite;
      await writeUserConfig(config);
      console.log(
        `Active site set to '${formatSwitchSiteOption(resolvedTargetSite, config.sites)}'.`,
      );
    });

  auth
    .command('logout')
    .description('Remove credentials for one site or all sites')
    .option('--site <alias>', 'Specific site to remove')
    .option('--yes', 'Skip confirmation when removing all configured sites')
    .action(async (options, command) => {
      const global = getGlobalOptions(command);
      const config = await readUserConfig();
      const targetSite = options.site ?? global.site;
      const store = getCredentialStore();

      if (targetSite) {
        const site = config.sites[targetSite];
        if (!site) {
          throw new GhstError(`Unknown site alias: ${targetSite}`, {
            exitCode: ExitCode.NOT_FOUND,
            code: 'SITE_NOT_FOUND',
          });
        }

        if (site.credentialRef) {
          await store.delete(site.credentialRef).catch(() => undefined);
        }
        delete config.sites[targetSite];
        if (config.active === targetSite) {
          config.active = Object.keys(config.sites)[0];
        }
        await writeUserConfig(config);
        console.log(`Removed site '${targetSite}'.`);
        return;
      }

      if (!options.yes) {
        if (isNonInteractive()) {
          throw new GhstError('Removing all sites in non-interactive mode requires --yes.', {
            exitCode: ExitCode.USAGE_ERROR,
            code: 'USAGE_ERROR',
          });
        }

        const ok = await confirmDestructiveAction(
          'Remove all configured sites and credentials? [y/N]: ',
          {
            action: 'logout_all_sites',
            target: 'all_configured_sites',
            reversible: false,
            sideEffects: ['remove_credentials', 'remove_site_links'],
          },
        );
        if (!ok) {
          throw new GhstError('Operation cancelled.', {
            exitCode: ExitCode.OPERATION_CANCELLED,
            code: 'OPERATION_CANCELLED',
          });
        }
      }

      for (const site of Object.values(config.sites)) {
        if (site.credentialRef) {
          await store.delete(site.credentialRef).catch(() => undefined);
        }
      }
      config.active = undefined;
      config.sites = {};
      await writeUserConfig(config);
      console.log('Removed all configured sites.');
    });

  auth
    .command('link')
    .description('Link current project directory to a configured site alias')
    .option('--site <alias>', 'Site alias to link')
    .option('--yes', 'Skip confirmation when replacing an existing project link')
    .action(async (options, command) => {
      const global = getGlobalOptions(command);
      const config = await readUserConfig();
      const siteAlias = options.site ?? global.site ?? config.active;

      if (!siteAlias || !config.sites[siteAlias]) {
        throw new GhstError('A valid configured site alias is required for linking.', {
          exitCode: ExitCode.AUTH_ERROR,
          code: 'SITE_REQUIRED',
        });
      }

      const projectConfig = await readProjectConfig();
      const projectConfigCwd = await resolveProjectConfigCwd();
      if (projectConfig && projectConfig.site !== siteAlias) {
        if (!options.yes) {
          if (isNonInteractive()) {
            throw new GhstError(
              'Overwriting an existing project link in non-interactive mode requires --yes.',
              {
                exitCode: ExitCode.USAGE_ERROR,
                code: 'USAGE_ERROR',
              },
            );
          }

          const ok = await confirmDestructiveAction(
            `Relink current directory from '${projectConfig.site}' to '${siteAlias}'? [y/N]: `,
            {
              action: 'relink_project',
              target: `${projectConfig.site}->${siteAlias}`,
              reversible: true,
              site: siteAlias,
              sideEffects: ['update_project_link'],
            },
          );
          if (!ok) {
            throw new GhstError('Operation cancelled.', {
              exitCode: ExitCode.OPERATION_CANCELLED,
              code: 'OPERATION_CANCELLED',
            });
          }
        }
      }

      await writeProjectConfig(
        {
          ...(projectConfig?.defaults ? { defaults: projectConfig.defaults } : {}),
          site: siteAlias,
        },
        projectConfigCwd,
      );

      console.log(`Linked current directory to '${siteAlias}'.`);
    });

  auth
    .command('token')
    .description('Print a short-lived staff JWT for the active connection (sensitive output)')
    .action(async (_, command) => {
      const global = getGlobalOptions(command);
      const connection = await resolveConnectionConfig(global);
      const token = await generateStaffJwt(connection.staffToken);
      console.log(token);
    });
}
