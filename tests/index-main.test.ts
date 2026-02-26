import { mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { isMainModule, main } from '../src/index.js';
import { ExitCode } from '../src/lib/errors.js';

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

  test('treats symlinked CLI path as main module', () => {
    const tempDir = mkdtempSync(join(tmpdir(), 'ghst-main-module-'));

    try {
      const realEntry = join(tempDir, 'index.js');
      const symlinkEntry = join(tempDir, 'ghst');

      writeFileSync(realEntry, '// fixture');
      symlinkSync(realEntry, symlinkEntry);

      expect(isMainModule(pathToFileURL(realEntry).href, symlinkEntry)).toBe(true);
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });
});
