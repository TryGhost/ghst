import { spawn } from 'node:child_process';
import fs from 'node:fs';
import fsPromises from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { ExitCode, GhstError } from './errors.js';
import { activateTheme, getUploadedThemeName, uploadTheme } from './themes.js';
import type { GlobalOptions } from './types.js';

interface ThemeDevOptions {
  path: string;
  watch?: boolean;
  activate?: boolean;
  debounceMs?: number;
  onEvent?: (event: Record<string, unknown>) => void;
}

interface UploadResult {
  payload: Record<string, unknown>;
  activeTheme?: string;
}

async function zipDirectory(directoryPath: string): Promise<string> {
  const tempDir = await fsPromises.mkdtemp(path.join(os.tmpdir(), 'ghst-theme-dev-'));
  const zipPath = path.join(tempDir, `${path.basename(directoryPath)}.zip`);

  await new Promise<void>((resolve, reject) => {
    const child = spawn('zip', ['-r', zipPath, '.'], {
      cwd: directoryPath,
      stdio: 'ignore',
    });

    child.on('error', (error) => reject(error));
    child.on('exit', (code) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(new Error(`zip command failed with code ${code}`));
    });
  });

  return zipPath;
}

async function uploadAndMaybeActivate(
  global: GlobalOptions,
  themePath: string,
  activate: boolean,
): Promise<UploadResult> {
  const archivePath = await zipDirectory(themePath);
  const payload = await uploadTheme(global, archivePath);

  if (!activate) {
    return { payload };
  }

  const uploadedThemeName = getUploadedThemeName(payload);
  if (!uploadedThemeName) {
    return { payload };
  }

  await activateTheme(global, uploadedThemeName);
  return {
    payload,
    activeTheme: uploadedThemeName,
  };
}

export async function runThemeDev(
  global: GlobalOptions,
  options: ThemeDevOptions,
): Promise<Record<string, unknown>> {
  const stat = await fsPromises.stat(options.path).catch(() => null);
  if (!stat || !stat.isDirectory()) {
    throw new GhstError('theme dev requires a directory path.', {
      code: 'USAGE_ERROR',
      exitCode: ExitCode.USAGE_ERROR,
    });
  }

  const debounceMs = options.debounceMs ?? 500;
  const initial = await uploadAndMaybeActivate(global, options.path, options.activate === true);
  options.onEvent?.({
    type: 'uploaded',
    source: 'initial',
    activeTheme: initial.activeTheme,
  });

  if (!options.watch) {
    return initial.payload;
  }

  const watcher = fs.watch(options.path, { recursive: true });
  let timer: NodeJS.Timeout | null = null;
  let running = false;
  let queued = false;
  let closed = false;
  let onFailure: ((error: unknown, source: string) => void) | null = null;

  const runQueuedUpload = async (source: string): Promise<void> => {
    if (running || closed) {
      queued = true;
      return;
    }

    running = true;
    try {
      const next = await uploadAndMaybeActivate(global, options.path, options.activate === true);
      options.onEvent?.({
        type: 'uploaded',
        source,
        activeTheme: next.activeTheme,
      });
    } catch (error) {
      options.onEvent?.({
        type: 'error',
        source,
        message: (error as Error).message,
      });
      onFailure?.(error, source);
    } finally {
      running = false;
      if (queued && !closed) {
        queued = false;
        await runQueuedUpload('queued');
      }
    }
  };

  watcher.on('change', (_eventType, filename) => {
    options.onEvent?.({
      type: 'change',
      file: typeof filename === 'string' ? filename : undefined,
    });

    if (timer) {
      clearTimeout(timer);
    }

    timer = setTimeout(() => {
      void runQueuedUpload('watch');
    }, debounceMs);
  });

  await new Promise<void>((resolve, reject) => {
    const finalize = (error?: Error) => {
      if (closed) {
        return;
      }

      closed = true;
      if (timer) {
        clearTimeout(timer);
      }
      watcher.close();
      process.off('SIGINT', onSigint);
      process.off('SIGTERM', onSigterm);
      onFailure = null;

      if (error) {
        reject(error);
        return;
      }

      resolve();
    };

    const onSigint = () => finalize();
    const onSigterm = () => finalize();

    onFailure = (error) => {
      const normalized = error instanceof Error ? error : new Error(String(error));
      finalize(normalized);
    };

    watcher.on('error', (error) => {
      onFailure?.(error, 'watcher');
    });

    process.on('SIGINT', onSigint);
    process.on('SIGTERM', onSigterm);
  });

  return initial.payload;
}
