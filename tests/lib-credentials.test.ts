import { EventEmitter } from 'node:events';
import { afterEach, describe, expect, test, vi } from 'vitest';

const credentialMocks = vi.hoisted(() => ({
  spawnImpl: vi.fn(),
}));

vi.mock('node:child_process', () => ({
  spawn: (...args: unknown[]) => credentialMocks.spawnImpl(...args),
}));

import {
  credentialRefForAlias,
  getCredentialStore,
  resetCredentialStoreCacheForTests,
  setCredentialStoreForTests,
} from '../src/lib/credentials.js';

interface SpawnOutcome {
  code?: number;
  stdout?: string;
  stderr?: string;
  throwOnSpawn?: Error;
  assertCall?: (call: {
    command: string;
    args: string[];
    options: { env?: NodeJS.ProcessEnv; stdio?: string };
    stdin: string;
  }) => void;
}

function queueSpawnOutcomes(outcomes: SpawnOutcome[]): void {
  let index = 0;
  credentialMocks.spawnImpl.mockImplementation(
    (command: string, args: string[], options: { env?: NodeJS.ProcessEnv; stdio?: string }) => {
      const outcome = outcomes[index++];
      if (!outcome) {
        throw new Error(`Unexpected spawn call for ${command}`);
      }

      if (outcome.throwOnSpawn) {
        throw outcome.throwOnSpawn;
      }

      const child = new EventEmitter() as EventEmitter & {
        stdout: EventEmitter;
        stderr: EventEmitter;
        stdin: {
          write: (chunk: string | Uint8Array) => void;
          end: () => void;
        };
      };
      child.stdout = new EventEmitter();
      child.stderr = new EventEmitter();

      let stdin = '';
      child.stdin = {
        write: (chunk) => {
          stdin += Buffer.isBuffer(chunk) ? chunk.toString('utf8') : String(chunk);
        },
        end: () => {
          setImmediate(() => {
            outcome.assertCall?.({ command, args, options, stdin });
            if (outcome.stdout) {
              child.stdout.emit('data', Buffer.from(outcome.stdout, 'utf8'));
            }
            if (outcome.stderr) {
              child.stderr.emit('data', Buffer.from(outcome.stderr, 'utf8'));
            }
            child.emit('close', outcome.code ?? 1);
          });
        },
      };

      return child;
    },
  );
}

function setPlatform(platform: NodeJS.Platform): void {
  Object.defineProperty(process, 'platform', {
    value: platform,
    configurable: true,
  });
}

describe.sequential('credential store adapters', () => {
  const originalPlatform = process.platform;
  const originalVitest = process.env.VITEST;

  afterEach(() => {
    credentialMocks.spawnImpl.mockReset();
    setCredentialStoreForTests(null);
    resetCredentialStoreCacheForTests();
    setPlatform(originalPlatform);

    if (originalVitest === undefined) {
      delete process.env.VITEST;
    } else {
      process.env.VITEST = originalVitest;
    }
  });

  test('builds sanitized credential refs', () => {
    expect(credentialRefForAlias('my blog/site')).toBe('site:my-blog-site');
  });

  test('returns injected test store when configured', async () => {
    const store = {
      isAvailable: vi.fn(async () => true),
      set: vi.fn(async () => undefined),
      get: vi.fn(async () => 'token'),
      delete: vi.fn(async () => undefined),
    };
    setCredentialStoreForTests(store);

    const resolved = getCredentialStore();
    expect(resolved).toBe(store);
    await expect(resolved.isAvailable()).resolves.toBe(true);
    await expect(resolved.get('site:myblog')).resolves.toBe('token');
  });

  test('uses deterministic unavailable store in vitest mode by default', async () => {
    process.env.VITEST = '1';
    setCredentialStoreForTests(null);
    resetCredentialStoreCacheForTests();

    const first = getCredentialStore();
    const second = getCredentialStore();
    expect(first).toBe(second);
    await expect(first.isAvailable()).resolves.toBe(false);
    await expect(first.get('site:any')).resolves.toBeNull();
    await expect(first.delete('site:any')).resolves.toBeUndefined();
    await expect(first.set('site:any', 'secret')).rejects.toThrow(
      'Secure credential storage is unavailable.',
    );
  });

  test('macOS adapter handles success and expected missing-delete case', async () => {
    delete process.env.VITEST;
    setPlatform('darwin');
    resetCredentialStoreCacheForTests();

    queueSpawnOutcomes([
      { code: 0, stdout: 'keychains' },
      {
        code: 0,
        assertCall: ({ command, args, stdin }) => {
          expect(command).toBe('security');
          expect(args).toEqual([
            'add-generic-password',
            '-a',
            'site:my-blog',
            '-s',
            'ghst',
            '-U',
            '-w',
          ]);
          expect(stdin).toBe('shhh\nshhh\n');
        },
      },
      { code: 0, stdout: 'secret-value\n' },
      { code: 1, stderr: 'The specified item could not be found in the keychain.' },
      { code: 1, stderr: 'permissions denied' },
      { code: 2 },
      { throwOnSpawn: new Error('security missing') },
    ]);

    const store = getCredentialStore();
    await expect(store.isAvailable()).resolves.toBe(true);
    await expect(store.set('site:my/blog', 'shhh')).resolves.toBeUndefined();
    await expect(store.get('site:my/blog')).resolves.toBe('secret-value');
    await expect(store.delete('site:my/blog')).resolves.toBeUndefined();
    await expect(store.delete('site:my/blog')).rejects.toThrow(
      'Failed to delete credential from macOS Keychain',
    );
    await expect(store.get('site:my/blog')).resolves.toBeNull();
    await expect(store.isAvailable()).resolves.toBe(false);
  });

  test('linux adapter handles input piping and error branches', async () => {
    delete process.env.VITEST;
    setPlatform('linux');
    resetCredentialStoreCacheForTests();

    queueSpawnOutcomes([
      { code: 1 },
      {
        code: 0,
        assertCall: ({ command, args, stdin }) => {
          expect(command).toBe('secret-tool');
          expect(args).toEqual([
            'store',
            '--label',
            'ghst credential',
            'ghst-app',
            'ghst',
            'ghst-ref',
            'site:my-blog',
          ]);
          expect(stdin).toBe('linux-secret');
        },
      },
      { code: 0, stdout: 'linux-secret \n' },
      { code: 0 },
      { code: 2 },
      { code: 2, stderr: 'store failed' },
      { code: 2, stderr: 'clear failed' },
      { throwOnSpawn: new Error('secret-tool missing') },
    ]);

    const store = getCredentialStore();
    await expect(store.isAvailable()).resolves.toBe(true);
    await expect(store.set('site:my/blog', 'linux-secret')).resolves.toBeUndefined();
    await expect(store.get('site:my/blog')).resolves.toBe('linux-secret');
    await expect(store.delete('site:my/blog')).resolves.toBeUndefined();
    await expect(store.get('site:my/blog')).resolves.toBeNull();
    await expect(store.set('site:my/blog', 'linux-secret')).rejects.toThrow(
      'Failed to store credential in Secret Service',
    );
    await expect(store.delete('site:my/blog')).rejects.toThrow(
      'Failed to delete credential from Secret Service',
    );
    await expect(store.isAvailable()).resolves.toBe(false);
  });

  test('windows adapter passes env token and handles failure branches', async () => {
    delete process.env.VITEST;
    setPlatform('win32');
    resetCredentialStoreCacheForTests();

    queueSpawnOutcomes([
      { code: 0 },
      {
        code: 0,
        assertCall: ({ command, options }) => {
          expect(command).toBe('powershell');
          expect(options.env?.GHST_CRED_TARGET).toBe('ghst:site:my-blog');
          expect(options.env?.GHST_CRED_SECRET).toBe('win-secret');
        },
      },
      { code: 0, stdout: 'win-secret\n' },
      { code: 0 },
      { code: 2, stderr: 'new failed' },
      { code: 1 },
      { throwOnSpawn: new Error('powershell missing') },
    ]);

    const store = getCredentialStore();
    await expect(store.isAvailable()).resolves.toBe(true);
    await expect(store.set('site:my/blog', 'win-secret')).resolves.toBeUndefined();
    await expect(store.get('site:my/blog')).resolves.toBe('win-secret');
    await expect(store.delete('site:my/blog')).resolves.toBeUndefined();
    await expect(store.set('site:my/blog', 'win-secret')).rejects.toThrow(
      'Failed to store credential in Windows Credential Manager',
    );
    await expect(store.get('site:my/blog')).resolves.toBeNull();
    await expect(store.isAvailable()).resolves.toBe(false);
  });

  test('unsupported platform returns unavailable store', async () => {
    delete process.env.VITEST;
    setPlatform('aix');
    resetCredentialStoreCacheForTests();

    const store = getCredentialStore();
    await expect(store.isAvailable()).resolves.toBe(false);
    await expect(store.get('site:any')).resolves.toBeNull();
    await expect(store.delete('site:any')).resolves.toBeUndefined();
    await expect(store.set('site:any', 'secret')).rejects.toThrow(
      'Secure credential storage is unavailable.',
    );
  });
});
