import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, test, vi } from 'vitest';
import {
  deriveSiteAlias,
  getConfigDir,
  getProjectConfigPath,
  getUserConfigPath,
  readProjectConfig,
  readUserConfig,
  writeProjectConfig,
  writeUserConfig,
} from '../src/lib/config.js';
import type { GhstError } from '../src/lib/errors.js';

describe('config io helpers', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  test('derives alias and path helpers', () => {
    expect(deriveSiteAlias('https://www.My-Blog.ghost.io')).toBe('my-blog');

    const env = { GHST_CONFIG_DIR: '/tmp/custom-config' } as NodeJS.ProcessEnv;
    expect(getConfigDir(env)).toBe('/tmp/custom-config');
    expect(getUserConfigPath(env)).toBe('/tmp/custom-config/config.json');
    expect(getProjectConfigPath('/tmp/project')).toBe('/tmp/project/.ghst/config.json');

    const defaultDir = getConfigDir({} as NodeJS.ProcessEnv);
    expect(defaultDir).toContain(path.join('.config', 'ghst'));
  });

  test('writes and reads user config', async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'ghst-config-'));
    const env = { GHST_CONFIG_DIR: path.join(tempRoot, 'cfg') } as NodeJS.ProcessEnv;

    const config = {
      version: 1,
      active: 'myblog',
      sites: {
        myblog: {
          url: 'https://myblog.ghost.io',
          staffAccessToken: 'abc123:0011223344556677',
          apiVersion: 'v6.0',
          addedAt: '2026-01-01T00:00:00.000Z',
        },
      },
    };

    await writeUserConfig(config, env);
    const readBack = await readUserConfig(env);

    expect(readBack.active).toBe('myblog');
    expect(readBack.sites.myblog?.url).toBe('https://myblog.ghost.io');
  });

  test('writes user config with secure file permissions on posix', async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'ghst-config-mode-'));
    const env = { GHST_CONFIG_DIR: path.join(tempRoot, 'cfg') } as NodeJS.ProcessEnv;
    await writeUserConfig(
      {
        version: 2,
        active: 'myblog',
        sites: {
          myblog: {
            url: 'https://myblog.ghost.io',
            staffAccessToken: 'abc123:0011223344556677',
            apiVersion: 'v6.0',
            addedAt: '2026-01-01T00:00:00.000Z',
          },
        },
      },
      env,
    );

    if (process.platform !== 'win32') {
      const stat = await fs.stat(path.join(tempRoot, 'cfg', 'config.json'));
      const mode = stat.mode & 0o777;
      expect(mode & 0o077).toBe(0);
    }
  });

  test('returns default user config when missing', async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'ghst-config-empty-'));
    const env = { GHST_CONFIG_DIR: path.join(tempRoot, 'cfg') } as NodeJS.ProcessEnv;

    const config = await readUserConfig(env);

    expect(config.version).toBe(2);
    expect(config.sites).toEqual({});
  });

  test('throws structured errors on invalid user/project json', async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'ghst-config-invalid-'));
    const configDir = path.join(tempRoot, 'cfg');
    await fs.mkdir(configDir, { recursive: true });
    await fs.writeFile(path.join(configDir, 'config.json'), '{ bad json', 'utf8');

    const env = { GHST_CONFIG_DIR: configDir } as NodeJS.ProcessEnv;

    await expect(readUserConfig(env)).rejects.toMatchObject({
      code: 'INVALID_CONFIG',
    } satisfies Partial<GhstError>);

    const projectDir = path.join(tempRoot, 'project');
    await fs.mkdir(path.join(projectDir, '.ghst'), { recursive: true });
    await fs.writeFile(path.join(projectDir, '.ghst', 'config.json'), '{ nope', 'utf8');

    await expect(readProjectConfig(projectDir)).rejects.toMatchObject({
      code: 'INVALID_PROJECT_CONFIG',
    } satisfies Partial<GhstError>);
  });

  test('writes and reads project config and returns null when missing', async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'ghst-project-'));

    expect(await readProjectConfig(tempRoot)).toBeNull();

    await writeProjectConfig({ site: 'myblog', defaults: { newsletter: 'weekly' } }, tempRoot);
    const readBack = await readProjectConfig(tempRoot);

    expect(readBack?.site).toBe('myblog');
    expect(readBack?.defaults).toEqual({ newsletter: 'weekly' });
  });

  test('readProjectConfig walks up directory tree to find .ghst/config.json', async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'ghst-walk-'));
    const subDir = path.join(tempRoot, 'a', 'b', 'c');
    await fs.mkdir(subDir, { recursive: true });

    await writeProjectConfig({ site: 'myblog' }, tempRoot);

    const readBack = await readProjectConfig(subDir);
    expect(readBack?.site).toBe('myblog');
  });

  test('rethrows unknown user config read errors', async () => {
    const env = { GHST_CONFIG_DIR: '/tmp/unused' } as NodeJS.ProcessEnv;
    const boom = new Error('disk-failure');
    vi.spyOn(fs, 'readFile').mockRejectedValueOnce(boom);

    await expect(readUserConfig(env)).rejects.toBe(boom);
  });

  test('rethrows unknown project config read errors', async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'ghst-rethrow-'));
    await fs.mkdir(path.join(tempRoot, '.ghst'), { recursive: true });
    await fs.writeFile(path.join(tempRoot, '.ghst', 'config.json'), '{}', 'utf8');

    const boom = new Error('project-failure');
    vi.spyOn(fs, 'readFile').mockRejectedValueOnce(boom);

    await expect(readProjectConfig(tempRoot)).rejects.toBe(boom);
  });
});
