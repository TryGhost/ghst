import readline from 'node:readline/promises';

export type PromptHandler = (question: string) => Promise<string>;
export interface DestructiveActionNotice {
  action: string;
  target: string;
  count?: number;
  reversible?: boolean;
  site?: string | null;
  sideEffects?: string[];
}

/* c8 ignore start */
async function defaultPrompt(question: string): Promise<string> {
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

let promptHandler: PromptHandler = defaultPrompt;

export function setPromptHandlerForTests(nextPrompt: PromptHandler | null): void {
  promptHandler = nextPrompt ?? defaultPrompt;
}

export async function ask(question: string): Promise<string> {
  return promptHandler(question);
}

export async function confirm(question: string): Promise<boolean> {
  const value = (await ask(question)).trim().toLowerCase();
  return value === 'y' || value === 'yes';
}

export async function confirmDestructiveAction(
  question: string,
  notice: DestructiveActionNotice,
): Promise<boolean> {
  console.error('GHST_AGENT_NOTICE: destructive_action');
  console.error('GHST_AGENT_NOTICE: Agents must ask the user for approval before continuing.');
  console.error(`GHST_AGENT_NOTICE: ${JSON.stringify(notice)}`);
  return confirm(question);
}
