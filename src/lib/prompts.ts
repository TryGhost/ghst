import readline from 'node:readline/promises';

export type PromptHandler = (question: string) => Promise<string>;

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
