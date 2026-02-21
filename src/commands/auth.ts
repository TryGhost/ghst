import readline from 'node:readline/promises';
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
/* c8 ignore stop */

let promptFn: PromptFn = prompt;

export function setPromptForTests(nextPrompt: PromptFn | null): void {
  promptFn = nextPrompt ?? prompt;
}

export function registerAuthCommands(program: Command): void {
  const auth = program.command('auth').description('Authentication management');

  auth
    .command('login')
    .description('Authenticate and store site credentials')
    .option('--url <url>', 'Ghost site URL')
    .option('--key <key>', 'Admin API key in {id}:{secret} format')
    .option('--key-env <name>', 'Read key from env var name')
    .option('--site <alias>', 'Optional site alias')
    .action(async (options, command) => {
      const global = getGlobalOptions(command);
      const urlInput = options.url || global.url || (await promptFn('Ghost site URL: '));

      let keyInput = options.key || global.key;
      if (!keyInput && options.keyEnv) {
        keyInput = process.env[options.keyEnv];
      }
      if (!keyInput) {
        keyInput = await promptFn('Admin API key ({id}:{secret}): ');
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

      console.log(`Authenticated ${urlInput} as '${alias}'.`);
      console.log(`Config saved to ~/.config/ghst/config.json`);
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
