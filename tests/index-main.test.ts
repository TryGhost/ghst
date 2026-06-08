import { mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { isMainModule, main, run } from '../src/index.js';
import { ExitCode } from '../src/lib/errors.js';

const require = createRequire(import.meta.url);
const packageJson = require('../package.json') as { version: string };

describe('main entrypoint', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  test('exits with success code for help', async () => {
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => undefined) as never);

    await main(['node', 'ghst', '--help']);

    expect(exitSpy).toHaveBeenCalledWith(ExitCode.SUCCESS);
  });

  test('prints the package version with -v', async () => {
    const stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);

    await expect(run(['node', 'ghst', '-v'])).resolves.toBe(ExitCode.SUCCESS);

    expect(stdoutSpy).toHaveBeenCalledWith(`${packageJson.version}\n`);
  });

  test('includes the package version in help output', async () => {
    const stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);

    await expect(run(['node', 'ghst', '--help'])).resolves.toBe(ExitCode.SUCCESS);

    expect(String(stdoutSpy.mock.calls.at(-1)?.[0] ?? '')).toContain(
      `Version: ${packageJson.version}`,
    );
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
