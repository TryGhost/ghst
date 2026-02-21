import { afterEach, describe, expect, test, vi } from 'vitest';
import { ExitCode } from '../src/lib/errors.js';
import { main } from '../src/index.js';

describe('main entrypoint', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  test('exits with success code for help', async () => {
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => undefined) as never);

    await main(['node', 'ghst', '--help']);

    expect(exitSpy).toHaveBeenCalledWith(ExitCode.SUCCESS);
  });

  test('exits with usage code for unknown command', async () => {
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => undefined) as never);

    await main(['node', 'ghst', 'unknown-command']);

    expect(exitSpy).toHaveBeenCalledWith(ExitCode.USAGE_ERROR);
  });
});
