import { pathToFileURL } from 'node:url';
import { Command, CommanderError } from 'commander';
import { registerApiCommands } from './commands/api.js';
import { registerAuthCommands } from './commands/auth.js';
import { registerCompletionCommands } from './commands/completion.js';
import { registerConfigCommands } from './commands/config.js';
import { registerLabelCommands } from './commands/label.js';
import { registerMemberCommands } from './commands/member.js';
import { registerNewsletterCommands } from './commands/newsletter.js';
import { registerOfferCommands } from './commands/offer.js';
import { registerPageCommands } from './commands/page.js';
import { registerPostCommands } from './commands/post.js';
import { registerTagCommands } from './commands/tag.js';
import { registerTierCommands } from './commands/tier.js';
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
    .option('--key <key>', 'Ghost Admin API key override')
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
  registerConfigCommands(program);
  registerApiCommands(program);
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

/* c8 ignore start */
function isMainModule(): boolean {
  const entry = process.argv[1];
  if (!entry) {
    return false;
  }

  return import.meta.url === pathToFileURL(entry).href;
}

/* c8 ignore next 3 */
if (isMainModule()) {
  void main(process.argv);
}
/* c8 ignore stop */
