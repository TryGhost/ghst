import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { setThemeDevRunnerForTests, setThemeValidatorForTests } from '../src/commands/theme.js';
import { ExitCode } from '../src/lib/errors.js';

const themeMocks = vi.hoisted(() => ({
  listThemes: vi.fn(),
  uploadTheme: vi.fn(),
  activateTheme: vi.fn(),
  printJson: vi.fn(),
  printThemeHuman: vi.fn(),
  printThemeListHuman: vi.fn(),
}));

vi.mock('../src/lib/themes.js', async () => {
  const actual =
    await vi.importActual<typeof import('../src/lib/themes.js')>('../src/lib/themes.js');
  return {
    ...actual,
    listThemes: (...args: unknown[]) => themeMocks.listThemes(...args),
    uploadTheme: (...args: unknown[]) => themeMocks.uploadTheme(...args),
    activateTheme: (...args: unknown[]) => themeMocks.activateTheme(...args),
  };
});

vi.mock('../src/lib/output.js', async () => {
  const actual =
    await vi.importActual<typeof import('../src/lib/output.js')>('../src/lib/output.js');
  return {
    ...actual,
    printJson: (...args: unknown[]) => themeMocks.printJson(...args),
    printThemeHuman: (...args: unknown[]) => themeMocks.printThemeHuman(...args),
    printThemeListHuman: (...args: unknown[]) => themeMocks.printThemeListHuman(...args),
  };
});

import { run } from '../src/index.js';

describe('theme command contracts', () => {
  let tempRoot = '';
  let themeZipPath = '';
  const uploadedThemePayload = { themes: [{ name: 'uploaded-theme' }] };
  const activatedThemePayload = { themes: [{ name: 'uploaded-theme', active: true }] };

  beforeEach(async () => {
    vi.clearAllMocks();
    tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'ghst-theme-command-'));
    themeZipPath = path.join(tempRoot, 'theme.zip');
    await fs.writeFile(themeZipPath, 'zip', 'utf8');

    themeMocks.listThemes.mockResolvedValue({ themes: [{ name: 'demo-theme' }] });
    themeMocks.uploadTheme.mockResolvedValue(uploadedThemePayload);
    themeMocks.activateTheme.mockResolvedValue(activatedThemePayload);

    setThemeValidatorForTests(null);
    setThemeDevRunnerForTests(null);
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    setThemeValidatorForTests(null);
    setThemeDevRunnerForTests(null);
    vi.restoreAllMocks();
  });

  test('uploads with --activate using the uploaded theme name and returns the activated payload', async () => {
    await expect(
      run(['node', 'ghst', 'theme', 'upload', themeZipPath, '--activate', '--json']),
    ).resolves.toBe(ExitCode.SUCCESS);

    expect(themeMocks.uploadTheme).toHaveBeenCalledWith(expect.any(Object), themeZipPath);
    expect(themeMocks.activateTheme).toHaveBeenCalledWith(expect.any(Object), 'uploaded-theme');
    expect(themeMocks.printJson).toHaveBeenCalledWith(activatedThemePayload, undefined);
  });

  test('fails loudly when upload activation cannot determine the uploaded theme name', async () => {
    themeMocks.uploadTheme.mockResolvedValue({ themes: [{}] });

    await expect(
      run(['node', 'ghst', 'theme', 'upload', themeZipPath, '--activate', '--json']),
    ).resolves.toBe(ExitCode.GENERAL_ERROR);

    expect(themeMocks.activateTheme).not.toHaveBeenCalled();
  });

  test('routes list and explicit activation through json output', async () => {
    await expect(run(['node', 'ghst', 'theme', 'list', '--json'])).resolves.toBe(ExitCode.SUCCESS);
    await expect(run(['node', 'ghst', 'theme', 'activate', 'demo-theme', '--json'])).resolves.toBe(
      ExitCode.SUCCESS,
    );

    expect(themeMocks.printJson).toHaveBeenCalledTimes(2);
    expect(themeMocks.activateTheme).toHaveBeenCalledWith(expect.any(Object), 'demo-theme');

    await expect(run(['node', 'ghst', 'theme', 'upload', ''])).resolves.toBe(
      ExitCode.VALIDATION_ERROR,
    );
    await expect(run(['node', 'ghst', 'theme', 'activate', ''])).resolves.toBe(
      ExitCode.VALIDATION_ERROR,
    );
  });

  test('renders validation results in json and human modes', async () => {
    setThemeValidatorForTests(async () => ({ results: { errors: [] } }));

    await expect(run(['node', 'ghst', 'theme', 'validate', themeZipPath, '--json'])).resolves.toBe(
      ExitCode.SUCCESS,
    );
    await expect(run(['node', 'ghst', 'theme', 'validate', themeZipPath])).resolves.toBe(
      ExitCode.SUCCESS,
    );

    expect(themeMocks.printJson).toHaveBeenCalledWith({ results: { errors: [] } }, undefined);
    expect(vi.mocked(console.log)).toHaveBeenCalledWith(
      'Theme validation completed with 0 error(s).',
    );

    await expect(run(['node', 'ghst', 'theme', 'validate', ''])).resolves.toBe(
      ExitCode.VALIDATION_ERROR,
    );
  });

  test('treats both nested and top-level validation errors as failures', async () => {
    setThemeValidatorForTests(async () => ({
      results: {
        error: {
          all: [{ message: 'invalid theme' }],
        },
      },
    }));
    await expect(run(['node', 'ghst', 'theme', 'validate', themeZipPath])).resolves.toBe(
      ExitCode.VALIDATION_ERROR,
    );

    setThemeValidatorForTests(async () => ({
      errors: [{ message: 'invalid theme' }],
    }));
    await expect(run(['node', 'ghst', 'theme', 'validate', themeZipPath])).resolves.toBe(
      ExitCode.VALIDATION_ERROR,
    );
  });

  test('renders theme dev events differently in json and human modes', async () => {
    setThemeDevRunnerForTests(async (_global, options) => {
      options.onEvent?.({ type: 'uploaded', source: 'watch' });
      options.onEvent?.({ type: 'error', message: 'upload failed' });
      return { themes: [{ name: 'watch-theme' }] };
    });

    await expect(run(['node', 'ghst', 'theme', 'dev', tempRoot, '--json'])).resolves.toBe(
      ExitCode.SUCCESS,
    );
    expect(vi.mocked(console.log)).toHaveBeenCalledWith(
      JSON.stringify({ type: 'uploaded', source: 'watch' }),
    );
    expect(themeMocks.printJson).toHaveBeenCalledWith(
      { themes: [{ name: 'watch-theme' }] },
      undefined,
    );

    vi.mocked(console.log).mockClear();
    setThemeDevRunnerForTests(async (_global, options) => {
      options.onEvent?.({ type: 'uploaded', source: 'watch' });
      options.onEvent?.({ type: 'error', message: 'upload failed' });
      return { themes: [{ name: 'watch-theme' }] };
    });

    await expect(run(['node', 'ghst', 'theme', 'dev', tempRoot])).resolves.toBe(ExitCode.SUCCESS);
    expect(vi.mocked(console.log)).toHaveBeenCalledWith('Uploaded (watch).');
    expect(vi.mocked(console.error)).toHaveBeenCalledWith('Theme dev upload error: upload failed');

    await expect(run(['node', 'ghst', 'theme', 'dev', '', '--debounce-ms', '1'])).resolves.toBe(
      ExitCode.VALIDATION_ERROR,
    );
  });
});
