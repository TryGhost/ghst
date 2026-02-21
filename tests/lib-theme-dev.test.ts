import { EventEmitter } from 'node:events';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

const themeDevMocks = vi.hoisted(() => ({
  spawnImpl: vi.fn(),
  watchImpl: vi.fn(),
  uploadTheme: vi.fn(),
  activateTheme: vi.fn(),
}));

vi.mock('node:child_process', () => ({
  spawn: (...args: unknown[]) => themeDevMocks.spawnImpl(...args),
}));

vi.mock('node:fs', async () => {
  const actual = await vi.importActual<typeof import('node:fs')>('node:fs');
  return {
    ...actual,
    watch: (...args: unknown[]) => themeDevMocks.watchImpl(...args),
    default: {
      ...actual,
      watch: (...args: unknown[]) => themeDevMocks.watchImpl(...args),
    },
  };
});

vi.mock('../src/lib/themes.js', () => ({
  uploadTheme: (...args: unknown[]) => themeDevMocks.uploadTheme(...args),
  activateTheme: (...args: unknown[]) => themeDevMocks.activateTheme(...args),
}));

import { runThemeDev } from '../src/lib/theme-dev.js';

function mockZipCommandSuccess(): void {
  themeDevMocks.spawnImpl.mockImplementation((_cmd: unknown, args: unknown[]) => {
    const child = new EventEmitter() as EventEmitter & {
      on: (event: string, listener: (...args: unknown[]) => void) => unknown;
    };

    setImmediate(() => {
      const zipPath = String(args[1] ?? '');
      void fs
        .mkdir(path.dirname(zipPath), { recursive: true })
        .then(() => fs.writeFile(zipPath, 'fake-zip', 'utf8'))
        .then(() => {
          child.emit('exit', 0);
        })
        .catch((error) => {
          child.emit('error', error);
        });
    });

    return child;
  });
}

function mockZipCommandFailure(exitCode: number): void {
  themeDevMocks.spawnImpl.mockImplementation(() => {
    const child = new EventEmitter() as EventEmitter & {
      on: (event: string, listener: (...args: unknown[]) => void) => unknown;
    };

    setImmediate(() => {
      child.emit('exit', exitCode);
    });

    return child;
  });
}

async function waitFor(check: () => boolean, timeoutMs = 1000): Promise<void> {
  const start = Date.now();
  while (!check()) {
    if (Date.now() - start > timeoutMs) {
      throw new Error('Timed out waiting for condition');
    }
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

describe.sequential('theme dev runtime', () => {
  let tempRoot = '';

  beforeEach(async () => {
    tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'ghst-theme-dev-test-'));
    themeDevMocks.spawnImpl.mockReset();
    themeDevMocks.watchImpl.mockReset();
    themeDevMocks.uploadTheme.mockReset();
    themeDevMocks.activateTheme.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  test('fails when path is not a directory', async () => {
    await expect(runThemeDev({}, { path: path.join(tempRoot, 'missing') })).rejects.toMatchObject({
      code: 'USAGE_ERROR',
    });
  });

  test('uploads and activates once when watch mode is disabled', async () => {
    const themeDir = path.join(tempRoot, 'theme');
    await fs.mkdir(themeDir, { recursive: true });
    await fs.writeFile(path.join(themeDir, 'package.json'), '{"name":"theme"}', 'utf8');

    mockZipCommandSuccess();
    const payload = { themes: [{ name: 'uploaded-theme' }] };
    themeDevMocks.uploadTheme.mockResolvedValue(payload);
    themeDevMocks.activateTheme.mockResolvedValue({ themes: [{ name: 'uploaded-theme' }] });

    const events: Array<Record<string, unknown>> = [];
    const result = await runThemeDev(
      {},
      {
        path: themeDir,
        activate: true,
        onEvent: (event) => events.push(event),
      },
    );

    expect(result).toEqual(payload);
    expect(themeDevMocks.uploadTheme).toHaveBeenCalledTimes(1);
    expect(String(themeDevMocks.uploadTheme.mock.calls[0]?.[1] ?? '')).toContain('.zip');
    expect(themeDevMocks.activateTheme).toHaveBeenCalledWith({}, 'uploaded-theme');
    expect(events).toEqual([
      {
        type: 'uploaded',
        source: 'initial',
        activeTheme: 'uploaded-theme',
      },
    ]);
  });

  test('fails fast when watch upload errors occur', async () => {
    const themeDir = path.join(tempRoot, 'theme-watch');
    await fs.mkdir(themeDir, { recursive: true });
    await fs.writeFile(path.join(themeDir, 'index.hbs'), '<h1>Theme</h1>', 'utf8');

    mockZipCommandSuccess();

    const watcher = new EventEmitter() as EventEmitter & { close: () => void };
    const closeSpy = vi.fn();
    watcher.close = closeSpy;
    themeDevMocks.watchImpl.mockReturnValue(watcher);

    themeDevMocks.uploadTheme
      .mockResolvedValueOnce({ themes: [{ name: 'watch-theme' }] })
      .mockRejectedValueOnce(new Error('upload failed'));

    const events: Array<Record<string, unknown>> = [];
    const promise = runThemeDev(
      {},
      {
        path: themeDir,
        watch: true,
        debounceMs: 5,
        onEvent: (event) => events.push(event),
      },
    );
    const rejected: Promise<Error> = promise.then(
      () => {
        throw new Error('Expected runThemeDev to reject');
      },
      (error) => (error instanceof Error ? error : new Error(String(error))),
    );

    await waitFor(() => themeDevMocks.uploadTheme.mock.calls.length >= 1);
    watcher.emit('change', 'change', 'index.hbs');

    await waitFor(() =>
      events.some((event) => event.type === 'error' && event.message === 'upload failed'),
    );
    const error = await rejected;
    expect(error).toBeInstanceOf(Error);
    expect(error.message).toBe('upload failed');
    expect(closeSpy).toHaveBeenCalledTimes(1);
    expect(events.some((event) => event.type === 'change')).toBe(true);
  });

  test('rejects when file watcher emits an error', async () => {
    const themeDir = path.join(tempRoot, 'theme-watch-error');
    await fs.mkdir(themeDir, { recursive: true });
    await fs.writeFile(path.join(themeDir, 'index.hbs'), '<h1>Theme</h1>', 'utf8');

    mockZipCommandSuccess();

    const watcher = new EventEmitter() as EventEmitter & { close: () => void };
    watcher.close = vi.fn();
    themeDevMocks.watchImpl.mockReturnValue(watcher);

    themeDevMocks.uploadTheme.mockResolvedValue({ themes: [{ name: 'watch-theme' }] });

    const promise = runThemeDev(
      {},
      {
        path: themeDir,
        watch: true,
      },
    );

    await waitFor(() => themeDevMocks.uploadTheme.mock.calls.length >= 1);
    watcher.emit('error', new Error('watch failed'));

    await expect(promise).rejects.toThrow('watch failed');
  });

  test('fails when zip command exits non-zero', async () => {
    const themeDir = path.join(tempRoot, 'theme-bad-zip');
    await fs.mkdir(themeDir, { recursive: true });

    mockZipCommandFailure(2);

    await expect(runThemeDev({}, { path: themeDir })).rejects.toThrow(
      'zip command failed with code 2',
    );
  });
});
