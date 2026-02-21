import type { Command } from 'commander';
import { ExitCode, GhstError } from '../lib/errors.js';

const TOP_LEVEL = [
  'auth',
  'post',
  'page',
  'tag',
  'config',
  'api',
  'completion',
  'help',
  '--help',
  '--json',
  '--site',
  '--url',
  '--key',
];

function getBashCompletion(): string {
  return `# ghst bash completion\n_ghst_complete() {\n  local cur prev\n  COMPREPLY=()\n  cur="\${COMP_WORDS[COMP_CWORD]}"\n  COMPREPLY=( $(compgen -W "${TOP_LEVEL.join(' ')}" -- "$cur") )\n  return 0\n}\ncomplete -F _ghst_complete ghst\n`;
}

function getZshCompletion(): string {
  return `#compdef ghst\n_arguments '*: :(${TOP_LEVEL.join(' ')})'\n`;
}

function getFishCompletion(): string {
  return TOP_LEVEL.map((entry) => `complete -c ghst -f -a '${entry}'`)
    .join('\n')
    .concat('\n');
}

function getPowerShellCompletion(): string {
  return `Register-ArgumentCompleter -Native -CommandName ghst -ScriptBlock {\n  param($wordToComplete, $commandAst, $cursorPosition)\n  @(${TOP_LEVEL.map((entry) => `'${entry}'`).join(', ')}) |\n    Where-Object { $_ -like "$wordToComplete*" } |\n    ForEach-Object { [System.Management.Automation.CompletionResult]::new($_, $_, 'ParameterValue', $_) }\n}\n`;
}

export function registerCompletionCommands(program: Command): void {
  program
    .command('completion [shell]')
    .description('Print shell completion script')
    .action((shell: string | undefined) => {
      if (!shell) {
        console.log('Usage: ghst completion <bash|zsh|fish|powershell>');
        return;
      }

      if (shell === 'bash') {
        console.log(getBashCompletion());
        return;
      }

      if (shell === 'zsh') {
        console.log(getZshCompletion());
        return;
      }

      if (shell === 'fish') {
        console.log(getFishCompletion());
        return;
      }

      if (shell === 'powershell') {
        console.log(getPowerShellCompletion());
        return;
      }

      throw new GhstError(`Unsupported shell: ${shell}`, {
        exitCode: ExitCode.USAGE_ERROR,
        code: 'USAGE_ERROR',
      });
    });
}
