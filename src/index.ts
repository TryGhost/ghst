import { realpathSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { Command, CommanderError } from 'commander';
import { registerApiCommands } from './commands/api.js';
import { registerAuthCommands } from './commands/auth.js';
import { registerCompletionCommands } from './commands/completion.js';
import { registerConfigCommands } from './commands/config.js';
import { registerImageCommands } from './commands/image.js';
import { registerLabelCommands } from './commands/label.js';
import { registerMcpCommands } from './commands/mcp.js';
import { registerMemberCommands } from './commands/member.js';
import { registerMigrateCommands } from './commands/migrate.js';
import { registerNewsletterCommands } from './commands/newsletter.js';
import { registerOfferCommands } from './commands/offer.js';
import { registerPageCommands } from './commands/page.js';
import { registerPostCommands } from './commands/post.js';
import { registerSettingCommands } from './commands/setting.js';
import { registerSiteCommands } from './commands/site.js';
import { registerStatsCommands } from './commands/stats.js';
import { registerTagCommands } from './commands/tag.js';
import { registerThemeCommands } from './commands/theme.js';
import { registerTierCommands } from './commands/tier.js';
import { registerUserCommands } from './commands/user.js';
import { registerWebhookCommands } from './commands/webhook.js';
import { ExitCode, GhstError, normalizeError, printError } from './lib/errors.js';

export function buildProgram(): Command {
  const program = new Command();

  program
    .name('ghst')
    .description('A modern CLI for Ghost CMS')
    .showHelpAfterError()
    .showSuggestionAfterError(true)
    .option('--json', 'Output JSON')
    .option('--jq <filter>', 'Apply jq-style field extraction to JSON output')
    .option('--site <site>', 'Configured site alias')
    .option('--url <url>', 'Ghost site URL override')
    .option('--staff-token <token>', 'Ghost staff access token override')
    .option('--debug [level]', 'Enable debug output')
    .option('--no-color', 'Disable color output');

  registerAuthCommands(program);
  registerPostCommands(program);
  registerPageCommands(program);
  registerTagCommands(program);
  registerMemberCommands(program);
  registerNewsletterCommands(program);
  registerTierCommands(program);
  registerOfferCommands(program);
  registerLabelCommands(program);
  registerWebhookCommands(program);
  registerUserCommands(program);
  registerImageCommands(program);
  registerThemeCommands(program);
  registerSiteCommands(program);
  registerStatsCommands(program);
  registerSettingCommands(program);
  registerConfigCommands(program);
  registerApiCommands(program);
  registerMcpCommands(program);
  registerMigrateCommands(program);
  registerCompletionCommands(program);

  program.exitOverride();
  return program;
}

export async function run(argv: string[]): Promise<number> {
  const program = buildProgram();

  try {
    await program.parseAsync(argv);
    return ExitCode.SUCCESS;
  } catch (error) {
    if (error instanceof CommanderError) {
      if (error.exitCode === 0) {
        return ExitCode.SUCCESS;
      }
      const globals = program.opts();
      const ghstError = new GhstError(error.message, {
        exitCode: ExitCode.USAGE_ERROR,
        code: 'USAGE_ERROR',
      });
      printError(ghstError, globals);
      return ghstError.exitCode;
    }

    const normalized = normalizeError(error);
    const jsonMode = argv.includes('--json');
    printError(normalized, { json: jsonMode });
    return normalized.exitCode;
  }
}

export async function main(argv: string[]): Promise<void> {
  const exitCode = await run(argv);
  process.exit(exitCode);
}

export function isMainModule(
  moduleUrl: string = import.meta.url,
  argvEntry: string | undefined = process.argv[1],
): boolean {
  const entry = argvEntry;
  if (!entry) {
    return false;
  }

  try {
    const modulePath = realpathSync(fileURLToPath(moduleUrl));
    const entryPath = realpathSync(entry);
    return modulePath === entryPath;
  } catch {
    // Fall back to URL equality when realpath resolution fails.
    return moduleUrl === pathToFileURL(entry).href;
  }
}

/* c8 ignore next 3 */
if (isMainModule()) {
  void main(process.argv);
}
