import chalk from 'chalk';
import type { DiscoveredGhostSession } from './browser-auth.js';
import { isStdinTty, isStdoutTty } from './tty.js';

// Interactive picker for the Ghost sessions discovered in the user's browsers.
// Uses an arrow-key selector on a TTY and falls back to a numbered prompt
// otherwise (pipes, CI, tests). Kept out of the auth command to keep that
// handler focused on the login flow rather than terminal UI.

// Outcome of the picker: a chosen session, "url" to type a URL instead, or
// "cancel" to abort the login.
export type SessionChoice = DiscoveredGhostSession | 'url' | 'cancel';

type Prompt = (question: string) => Promise<string>;

const BANNER_BORDER = '------------------------------------------------------------';
const BANNER_TITLE = 'Continue From Your Browser';
const URL_OPTION_LABEL = 'Enter a Ghost URL manually';

function sessionRow(session: DiscoveredGhostSession): string {
  const who = session.user ? ` — ${session.user}` : '';
  return `${session.label}${who} (${session.source})`;
}

function printBanner(count: number, useColor: boolean): void {
  const noun = `${count} active Ghost session${count === 1 ? '' : 's'}`;
  console.log('');
  console.log(BANNER_BORDER);
  console.log(BANNER_TITLE);
  console.log(BANNER_BORDER);
  console.log(`Found ${useColor ? chalk.yellow(noun) : noun}:`);
  console.log('');
}

// Numbered prompt used when stdin/stdout isn't a TTY (pipes, CI, tests).
async function numberedSelect(
  sessions: DiscoveredGhostSession[],
  prompt: Prompt,
): Promise<SessionChoice> {
  sessions.forEach((session, index) => {
    console.log(`  ${index + 1}) ${sessionRow(session)}`);
  });
  console.log('');
  const answer = await prompt(
    `Select a session [1-${sessions.length}], or press Enter to type a URL: `,
  );
  const trimmed = answer.trim();
  if (!trimmed) {
    return 'url';
  }
  const choice = Number.parseInt(trimmed, 10);
  if (Number.isInteger(choice) && choice >= 1 && choice <= sessions.length) {
    return sessions[choice - 1] ?? 'url';
  }
  return 'url';
}

/* c8 ignore start -- interactive raw-mode selector; verified by the manual login flow */
// Arrow-key selector built on raw stdin (no extra deps): up/down to move, Enter
// to select, Esc/Ctrl+C to cancel. "Enter a Ghost URL manually" is the last row.
async function arrowSelect(
  sessions: DiscoveredGhostSession[],
  useColor: boolean,
): Promise<SessionChoice> {
  const labels = [...sessions.map(sessionRow), URL_OPTION_LABEL];
  const rows = labels.map((label, i) => `${i + 1}) ${label}`);
  const urlIndex = rows.length - 1;
  let index = 0;

  const hint = 'Use up/down or a number, Enter to select, Esc to cancel';
  console.log(useColor ? chalk.dim(hint) : hint);
  console.log('');

  const stdin = process.stdin;
  const stdout = process.stdout;

  const renderRow = (row: string, selected: boolean): string => {
    if (selected) {
      const line = `> ${row}`;
      return useColor ? chalk.cyan(line) : line;
    }
    return `  ${row}`;
  };

  const draw = (first: boolean): void => {
    if (!first) {
      stdout.write(`\x1B[${rows.length}A`); // move cursor back to the first row
    }
    for (let i = 0; i < rows.length; i += 1) {
      stdout.write(`\x1B[2K${renderRow(rows[i] ?? '', i === index)}\n`);
    }
  };

  if (stdin.isTTY) {
    stdin.setRawMode(true);
  }
  stdin.resume();
  stdout.write('\x1B[?25l'); // hide cursor
  draw(true);

  return await new Promise<SessionChoice>((resolve) => {
    function finish(result: SessionChoice): void {
      stdin.off('data', onData);
      stdout.write('\x1B[?25h'); // show cursor
      if (stdin.isTTY) {
        stdin.setRawMode(false);
      }
      stdin.pause();
      resolve(result);
    }

    function onData(chunk: Buffer): void {
      const byte = chunk[0];
      const isEsc = byte === 0x1b;
      if (chunk.length === 1 && byte === 0x03) {
        finish('cancel'); // Ctrl+C
      } else if (chunk.length >= 3 && isEsc && chunk[1] === 0x5b && chunk[2] === 0x41) {
        index = (index - 1 + rows.length) % rows.length;
        draw(false);
      } else if (chunk.length >= 3 && isEsc && chunk[1] === 0x5b && chunk[2] === 0x42) {
        index = (index + 1) % rows.length;
        draw(false);
      } else if (chunk.length === 1 && byte === 0x6b) {
        index = (index - 1 + rows.length) % rows.length;
        draw(false);
      } else if (chunk.length === 1 && byte === 0x6a) {
        index = (index + 1) % rows.length;
        draw(false);
      } else if (chunk.length === 1 && byte !== undefined && byte >= 0x31 && byte <= 0x39) {
        const pick = byte - 0x31; // '1' selects the first row
        if (pick < rows.length) {
          index = pick;
          finish(index === urlIndex ? 'url' : (sessions[index] ?? 'url'));
        }
      } else if (chunk.length === 1 && (byte === 0x0d || byte === 0x0a)) {
        finish(index === urlIndex ? 'url' : (sessions[index] ?? 'url'));
      } else if (chunk.length === 1 && isEsc) {
        finish('cancel'); // lone Esc, after arrow sequences
      }
    }
    stdin.on('data', onData);
  });
}
/* c8 ignore stop */

// Shows the discovered sessions and returns the user's choice.
export async function selectBrowserSession(
  sessions: DiscoveredGhostSession[],
  options: { useColor: boolean; prompt: Prompt },
): Promise<SessionChoice> {
  printBanner(sessions.length, options.useColor);
  if (isStdinTty() && isStdoutTty()) {
    /* c8 ignore next */
    return arrowSelect(sessions, options.useColor);
  }
  return numberedSelect(sessions, options.prompt);
}
