export function isForcedTty(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.GHST_FORCE_TTY === '1';
}

export function isStdoutTty(env: NodeJS.ProcessEnv = process.env): boolean {
  if (isForcedTty(env)) {
    return true;
  }

  return Boolean(process.stdout.isTTY);
}

export function isStdinTty(env: NodeJS.ProcessEnv = process.env): boolean {
  if (isForcedTty(env)) {
    return true;
  }

  return Boolean(process.stdin.isTTY);
}

export function isNonInteractive(env: NodeJS.ProcessEnv = process.env): boolean {
  return !isStdoutTty(env) || !isStdinTty(env);
}
