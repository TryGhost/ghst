import fs from 'node:fs/promises';
import { ExitCode, GhstError } from './errors.js';

export async function assertFileDoesNotExist(filePath: string): Promise<void> {
  try {
    await fs.access(filePath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return;
    }

    throw error;
  }

  throw new GhstError(`Refusing to overwrite existing file: ${filePath}`, {
    code: 'USAGE_ERROR',
    exitCode: ExitCode.USAGE_ERROR,
  });
}
