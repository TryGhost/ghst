import { describe, expect, test } from 'vitest';
import { resolveConnectionConfig } from '../src/lib/config.js';
import { ExitCode } from '../src/lib/errors.js';
import type { GlobalOptions } from '../src/lib/types.js';

const baseConfig = {
  version: 1,
  active: 'active-site',
  sites: {
    'active-site': {
      url: 'https://active.ghost.io',
      adminApiKey: 'activeid:0011223344556677',
      apiVersion: 'v6.0',
      addedAt: '2026-01-01T00:00:00.000Z',
    },
    'project-site': {
      url: 'https://project.ghost.io',
      adminApiKey: 'projectid:0011223344556677',
      apiVersion: 'v6.0',
      addedAt: '2026-01-01T00:00:00.000Z',
    },
  },
} as const;

describe('resolveConnectionConfig precedence', () => {
  test('prefers explicit flags over env and config', async () => {
    const global: GlobalOptions = {
      url: 'https://flags.ghost.io',
      key: 'flagid:0011223344556677',
    };

    const resolved = await resolveConnectionConfig(global, {
      env: {
        GHOST_URL: 'https://env.ghost.io',
        GHOST_ADMIN_API_KEY: 'envid:0011223344556677',
      },
      userConfig: baseConfig,
      projectConfig: { site: 'project-site' },
    });

    expect(resolved.url).toBe('https://flags.ghost.io');
    expect(resolved.source).toBe('flags');
  });

  test('rejects partial direct flags even when env has the missing value', async () => {
    await expect(
      resolveConnectionConfig(
        {
          url: 'https://flags.ghost.io',
        },
        {
          env: {
            GHOST_ADMIN_API_KEY: 'envid:0011223344556677',
            GHOST_URL: 'https://env.ghost.io',
          },
          userConfig: baseConfig,
          projectConfig: null,
        },
      ),
    ).rejects.toMatchObject({
      exitCode: ExitCode.USAGE_ERROR,
      code: 'USAGE_ERROR',
    });
  });

  test('uses env when flags absent', async () => {
    const resolved = await resolveConnectionConfig(
      {},
      {
        env: {
          GHOST_URL: 'https://env.ghost.io',
          GHOST_ADMIN_API_KEY: 'envid:0011223344556677',
        },
        userConfig: baseConfig,
        projectConfig: { site: 'project-site' },
      },
    );

    expect(resolved.url).toBe('https://env.ghost.io');
    expect(resolved.source).toBe('env');
  });

  test('prefers --site over env direct credentials', async () => {
    const resolved = await resolveConnectionConfig(
      { site: 'project-site' },
      {
        env: {
          GHOST_URL: 'https://env.ghost.io',
          GHOST_ADMIN_API_KEY: 'envid:0011223344556677',
        },
        userConfig: baseConfig,
        projectConfig: null,
      },
    );

    expect(resolved.url).toBe('https://project.ghost.io');
    expect(resolved.source).toBe('site');
  });

  test('uses GHOST_SITE env alias when set', async () => {
    const resolved = await resolveConnectionConfig(
      {},
      {
        env: {
          GHOST_SITE: 'project-site',
        },
        userConfig: baseConfig,
        projectConfig: null,
      },
    );

    expect(resolved.url).toBe('https://project.ghost.io');
    expect(resolved.source).toBe('site');
  });

  test('uses project link before active site', async () => {
    const resolved = await resolveConnectionConfig(
      {},
      {
        env: {},
        userConfig: baseConfig,
        projectConfig: { site: 'project-site' },
      },
    );

    expect(resolved.url).toBe('https://project.ghost.io');
    expect(resolved.source).toBe('project');
  });

  test('falls back to active site', async () => {
    const resolved = await resolveConnectionConfig(
      {},
      {
        env: {},
        userConfig: baseConfig,
        projectConfig: null,
      },
    );

    expect(resolved.url).toBe('https://active.ghost.io');
    expect(resolved.source).toBe('active');
  });

  test('throws when requested site alias is missing', async () => {
    await expect(
      resolveConnectionConfig(
        { site: 'missing' },
        {
          env: {},
          userConfig: baseConfig,
          projectConfig: null,
        },
      ),
    ).rejects.toMatchObject({
      code: 'SITE_NOT_FOUND',
      exitCode: ExitCode.AUTH_ERROR,
    });
  });

  test('throws auth required when no resolution source exists', async () => {
    await expect(
      resolveConnectionConfig(
        {},
        {
          env: {},
          userConfig: {
            version: 1,
            sites: {},
          },
          projectConfig: null,
        },
      ),
    ).rejects.toMatchObject({
      code: 'AUTH_REQUIRED',
      exitCode: ExitCode.AUTH_ERROR,
    });
  });
});
