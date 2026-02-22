import type { Command } from 'commander';
import { ExitCode, GhstError } from '../lib/errors.js';

function unique(values: string[]): string[] {
  return Array.from(new Set(values));
}

function getTopLevelEntries(program: Command): string[] {
  const commandNames = program.commands
    .map((entry) => entry.name())
    .filter((name) => Boolean(name) && name !== 'help');
  const globalFlags = program.options.map((entry) => entry.long).filter(Boolean) as string[];

  return unique([...commandNames, 'help', ...globalFlags]);
}

function getBashCompletion(entries: string[]): string {
  return `# ghst bash completion\n_ghst_complete() {\n  local cur prev\n  COMPREPLY=()\n  cur="\${COMP_WORDS[COMP_CWORD]}"\n  COMPREPLY=( $(compgen -W "${entries.join(' ')}" -- "$cur") )\n  return 0\n}\ncomplete -F _ghst_complete ghst\n`;
}

function getZshCompletion(entries: string[]): string {
  return `#compdef ghst\n_arguments '*: :(${entries.join(' ')})'\n`;
}

function getFishCompletion(entries: string[]): string {
  return entries
    .map((entry) => `complete -c ghst -f -a '${entry}'`)
    .join('\n')
    .concat('\n');
}

function getPowerShellCompletion(entries: string[]): string {
  return `Register-ArgumentCompleter -Native -CommandName ghst -ScriptBlock {\n  param($wordToComplete, $commandAst, $cursorPosition)\n  @(${entries.map((entry) => `'${entry}'`).join(', ')}) |\n    Where-Object { $_ -like "$wordToComplete*" } |\n    ForEach-Object { [System.Management.Automation.CompletionResult]::new($_, $_, 'ParameterValue', $_) }\n}\n`;
}

export function registerCompletionCommands(program: Command): void {
  program
    .command('completion [shell]')
    .description('Print shell completion script')
    .action((shell: string | undefined) => {
      const entries = getTopLevelEntries(program);

      if (!shell) {
        console.log('Usage: ghst completion <bash|zsh|fish|powershell>');
        return;
      }

      if (shell === 'bash') {
        console.log(getBashCompletion(entries));
        return;
      }

      if (shell === 'zsh') {
        console.log(getZshCompletion(entries));
        return;
      }

      if (shell === 'fish') {
        console.log(getFishCompletion(entries));
        return;
      }

      if (shell === 'powershell') {
        console.log(getPowerShellCompletion(entries));
        return;
      }

      throw new GhstError(`Unsupported shell: ${shell}`, {
        exitCode: ExitCode.USAGE_ERROR,
        code: 'USAGE_ERROR',
      });
    });
}
