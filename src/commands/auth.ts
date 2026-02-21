import { spawn } from 'node:child_process';
import readline from 'node:readline/promises';
import chalk from 'chalk';
import type { Command } from 'commander';
import { GhostClient } from '../lib/client.js';
import { getGlobalOptions } from '../lib/context.js';
import {
  deriveSiteAlias,
  readUserConfig,
  resolveConnectionConfig,
  writeProjectConfig,
  writeUserConfig,
} from '../lib/config.js';
import { generateAdminToken, parseAdminApiKey } from '../lib/auth.js';
import { ExitCode, GhstError } from '../lib/errors.js';

type PromptFn = (question: string) => Promise<string>;
type OpenUrlFn = (url: string) => Promise<void>;

const NEW_INTEGRATION_URL = 'https://account.ghost.org/?r=settings/integrations/new';
const LOGIN_GUIDANCE_BORDER = '------------------------------------------------------------';
const LOGIN_GUIDANCE_TITLE = 'Authenticate with Ghost';
const LOGIN_GUIDANCE_LINE_ONE =
  'You will now be taken to your Ghost Admin panel, where you will create a new integration';

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

function getBrowserOpenCommand(url: string): { command: string; args: string[] } {
  if (process.platform === 'darwin') {
    return { command: 'open', args: [url] };
  }

  if (process.platform === 'win32') {
    return { command: 'cmd', args: ['/c', 'start', '', url] };
  }

  return { command: 'xdg-open', args: [url] };
}

async function openExternalUrl(url: string): Promise<void> {
  const { command, args } = getBrowserOpenCommand(url);

  await new Promise<void>((resolve, reject) => {
    const child = spawn(command, args, { stdio: 'ignore' });
    child.once('error', reject);
    child.once('close', (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`Failed to open browser (exit ${code ?? 'unknown'})`));
    });
  });
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
  const apiUrlText = useColor ? chalk.cyan('API URL') : 'API URL';
  const adminApiKeyText = useColor ? chalk.yellow('Admin API Key') : 'Admin API Key';
  const lineTwo = `You will need to copy the ${apiUrlText} and ${adminApiKeyText} and paste them here to authenticate.`;

  console.log('');
  console.log(LOGIN_GUIDANCE_BORDER);
  console.log(LOGIN_GUIDANCE_TITLE);
  console.log(LOGIN_GUIDANCE_BORDER);
  console.log(LOGIN_GUIDANCE_LINE_ONE);
  console.log(lineTwo);
  console.log('');
}

export function registerAuthCommands(program: Command): void {
  const auth = program.command('auth').description('Authentication management');

  auth
    .command('login')
    .description('Authenticate and store site credentials')
    .option('--url <url>', 'Ghost site URL')
    .option('--key <key>', 'Admin API key in {id}:{secret} format')
    .option('--key-env <name>', 'Read key from env var name')
    .option('--non-interactive', 'Disable prompts and require explicit credentials')
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

      const envKeyInput = options.keyEnv ? process.env[options.keyEnv] : undefined;
      let urlInput = options.url || global.url;
      let keyInput = options.key || global.key || envKeyInput;

      if (nonInteractive) {
        if (!urlInput || !keyInput) {
          throw new GhstError(
            'Non-interactive login requires both --url and --key (or --key-env).',
            {
              exitCode: ExitCode.USAGE_ERROR,
              code: 'USAGE_ERROR',
            },
          );
        }
      } else {
        printLoginGuidance(global.color !== false);
        await promptFn('Press Enter to Continue...');
        await openUrlFn(NEW_INTEGRATION_URL);
        urlInput = urlInput || (await promptFn('Ghost API URL: '));
        if (!keyInput) {
          keyInput = await promptFn('Ghost Admin API Key: ');
        }
      }

      parseAdminApiKey(keyInput);

      const client = new GhostClient({
        url: urlInput,
        key: keyInput,
        version: process.env.GHOST_API_VERSION ?? 'v6.0',
      });

      await client.siteInfo();

      const config = await readUserConfig();
      const alias = options.site ?? deriveSiteAlias(urlInput);
      config.sites[alias] = {
        url: urlInput,
        adminApiKey: keyInput,
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

      console.log(`Active site: ${config.active ?? '(none)'}`);
      for (const [alias, site] of Object.entries(config.sites)) {
        const marker = config.active === alias ? '*' : ' ';
        console.log(`${marker} ${alias} -> ${site.url}`);
      }
    });

  auth
    .command('list')
    .description('List configured sites')
    .action(async (_, command) => {
      const global = getGlobalOptions(command);
      const config = await readUserConfig();
      const aliases = Object.keys(config.sites);

      if (global.json) {
        console.log(JSON.stringify({ sites: aliases }, null, 2));
        return;
      }

      for (const alias of aliases) {
        console.log(alias);
      }
    });

  auth
    .command('switch [site]')
    .description('Switch active site alias (interactive if omitted)')
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
          console.log(`${marker} ${alias}`);
        }

        targetSite = await promptFn('Switch to site alias: ');
      }

      if (!targetSite || !config.sites[targetSite]) {
        throw new GhstError(`Unknown site alias: ${targetSite ?? '(empty)'}`, {
          exitCode: ExitCode.NOT_FOUND,
          code: 'SITE_NOT_FOUND',
        });
      }

      config.active = targetSite;
      await writeUserConfig(config);
      console.log(`Active site set to '${targetSite}'.`);
    });

  auth
    .command('logout')
    .description('Remove credentials for one site or all sites')
    .option('--site <alias>', 'Specific site to remove')
    .action(async (options, command) => {
      const global = getGlobalOptions(command);
      const config = await readUserConfig();
      const targetSite = options.site ?? global.site;

      if (targetSite) {
        if (!config.sites[targetSite]) {
          throw new GhstError(`Unknown site alias: ${targetSite}`, {
            exitCode: ExitCode.NOT_FOUND,
            code: 'SITE_NOT_FOUND',
          });
        }

        delete config.sites[targetSite];
        if (config.active === targetSite) {
          config.active = Object.keys(config.sites)[0];
        }
        await writeUserConfig(config);
        console.log(`Removed site '${targetSite}'.`);
        return;
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

      await writeProjectConfig({
        site: siteAlias,
      });

      console.log(`Linked current directory to '${siteAlias}'.`);
    });

  auth
    .command('token')
    .description('Print a short-lived admin JWT for the active connection')
    .action(async (_, command) => {
      const global = getGlobalOptions(command);
      const connection = await resolveConnectionConfig(global);
      const token = await generateAdminToken(connection.key);
      console.log(token);
    });
}
