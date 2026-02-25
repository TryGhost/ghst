import { spawn } from 'node:child_process';

interface CommandResult {
  stdout: string;
  stderr: string;
  code: number;
}

interface CommandOptions {
  env?: NodeJS.ProcessEnv;
  input?: string;
}

export interface CredentialStore {
  isAvailable(): Promise<boolean>;
  set(ref: string, secret: string): Promise<void>;
  get(ref: string): Promise<string | null>;
  delete(ref: string): Promise<void>;
}

interface CredentialStoreAdapter {
  isAvailable(): Promise<boolean>;
  set(ref: string, secret: string): Promise<void>;
  get(ref: string): Promise<string | null>;
  delete(ref: string): Promise<void>;
}

const MACOS_SERVICE = 'ghst';
const LINUX_ATTR_APP = 'ghst-app';
const LINUX_ATTR_REF = 'ghst-ref';
const WINDOWS_TARGET_PREFIX = 'ghst:';

let credentialStoreForTests: CredentialStore | null = null;
let cachedStore: CredentialStore | null = null;

function sanitizeRef(ref: string): string {
  return ref.replace(/[^a-zA-Z0-9:_-]/g, '-');
}

function toWindowsTarget(ref: string): string {
  return `${WINDOWS_TARGET_PREFIX}${sanitizeRef(ref)}`;
}

async function runCommand(
  command: string,
  args: string[],
  options: CommandOptions = {},
): Promise<CommandResult> {
  return await new Promise<CommandResult>((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: 'pipe',
      env: options.env,
    });

    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];

    child.stdout.on('data', (chunk) => {
      stdout.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk)));
    });
    child.stderr.on('data', (chunk) => {
      stderr.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk)));
    });

    child.on('error', reject);
    child.on('close', (code) => {
      resolve({
        stdout: Buffer.concat(stdout).toString('utf8'),
        stderr: Buffer.concat(stderr).toString('utf8'),
        code: code ?? 1,
      });
    });

    if (options.input !== undefined) {
      child.stdin.write(options.input);
    }
    child.stdin.end();
  });
}

function createUnavailableStore(): CredentialStoreAdapter {
  return {
    isAvailable: async () => false,
    set: async () => {
      throw new Error('Secure credential storage is unavailable.');
    },
    get: async () => null,
    delete: async () => undefined,
  };
}

function createMacOsAdapter(): CredentialStoreAdapter {
  const runSecurity = async (
    args: string[],
    options: CommandOptions = {},
  ): Promise<CommandResult> => {
    return await runCommand('security', args, options);
  };

  return {
    isAvailable: async () => {
      try {
        const result = await runSecurity(['list-keychains']);
        return result.code === 0;
      } catch {
        return false;
      }
    },
    set: async (ref, secret) => {
      const result = await runSecurity([
        'add-generic-password',
        '-a',
        sanitizeRef(ref),
        '-s',
        MACOS_SERVICE,
        '-U',
        '-w',
        secret,
      ]);
      if (result.code !== 0) {
        throw new Error(
          `Failed to store credential in macOS Keychain: ${result.stderr || result.stdout}`,
        );
      }
    },
    get: async (ref) => {
      const result = await runSecurity([
        'find-generic-password',
        '-a',
        sanitizeRef(ref),
        '-s',
        MACOS_SERVICE,
        '-w',
      ]);
      if (result.code !== 0) {
        return null;
      }
      return result.stdout.trim() || null;
    },
    delete: async (ref) => {
      const result = await runSecurity([
        'delete-generic-password',
        '-a',
        sanitizeRef(ref),
        '-s',
        MACOS_SERVICE,
      ]);
      if (result.code !== 0) {
        const message = `${result.stderr}\n${result.stdout}`;
        if (message.includes('could not be found')) {
          return;
        }
        throw new Error(
          `Failed to delete credential from macOS Keychain: ${result.stderr || result.stdout}`,
        );
      }
    },
  };
}

function createLinuxAdapter(): CredentialStoreAdapter {
  const runSecretTool = async (
    args: string[],
    options: CommandOptions = {},
  ): Promise<CommandResult> => {
    return await runCommand('secret-tool', args, options);
  };

  return {
    isAvailable: async () => {
      try {
        const probe = await runSecretTool([
          'lookup',
          LINUX_ATTR_APP,
          'ghst',
          LINUX_ATTR_REF,
          '__probe__',
        ]);
        return probe.code === 0 || probe.code === 1;
      } catch {
        return false;
      }
    },
    set: async (ref, secret) => {
      const result = await runSecretTool(
        [
          'store',
          '--label',
          'ghst credential',
          LINUX_ATTR_APP,
          'ghst',
          LINUX_ATTR_REF,
          sanitizeRef(ref),
        ],
        { input: secret },
      );
      if (result.code !== 0) {
        throw new Error(
          `Failed to store credential in Secret Service: ${result.stderr || result.stdout}`,
        );
      }
    },
    get: async (ref) => {
      const result = await runSecretTool([
        'lookup',
        LINUX_ATTR_APP,
        'ghst',
        LINUX_ATTR_REF,
        sanitizeRef(ref),
      ]);
      if (result.code !== 0) {
        return null;
      }
      return result.stdout.trim() || null;
    },
    delete: async (ref) => {
      const result = await runSecretTool([
        'clear',
        LINUX_ATTR_APP,
        'ghst',
        LINUX_ATTR_REF,
        sanitizeRef(ref),
      ]);
      if (result.code !== 0) {
        throw new Error(
          `Failed to delete credential from Secret Service: ${result.stderr || result.stdout}`,
        );
      }
    },
  };
}

function createWindowsAdapter(): CredentialStoreAdapter {
  const runPowerShell = async (
    script: string,
    env: NodeJS.ProcessEnv = process.env,
  ): Promise<CommandResult> => {
    return await runCommand(
      'powershell',
      ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', script],
      { env },
    );
  };

  const importModuleScript =
    "$ErrorActionPreference='Stop'; Import-Module CredentialManager -ErrorAction Stop;";

  return {
    isAvailable: async () => {
      try {
        const probe = await runPowerShell(
          '$module = Get-Module -ListAvailable -Name CredentialManager; if ($module) { exit 0 } else { exit 1 }',
        );
        return probe.code === 0;
      } catch {
        return false;
      }
    },
    set: async (ref, secret) => {
      const result = await runPowerShell(
        `${importModuleScript} $target=$env:GHST_CRED_TARGET; $secret=$env:GHST_CRED_SECRET; New-StoredCredential -Target $target -UserName 'ghst' -Password $secret -Persist LocalMachine | Out-Null`,
        {
          ...process.env,
          GHST_CRED_TARGET: toWindowsTarget(ref),
          GHST_CRED_SECRET: secret,
        },
      );
      if (result.code !== 0) {
        throw new Error(
          `Failed to store credential in Windows Credential Manager: ${result.stderr || result.stdout}`,
        );
      }
    },
    get: async (ref) => {
      const result = await runPowerShell(
        `${importModuleScript} $target=$env:GHST_CRED_TARGET; $cred = Get-StoredCredential -Target $target; if ($null -eq $cred) { exit 3 }; Write-Output $cred.Password`,
        {
          ...process.env,
          GHST_CRED_TARGET: toWindowsTarget(ref),
        },
      );
      if (result.code !== 0) {
        return null;
      }
      return result.stdout.trim() || null;
    },
    delete: async (ref) => {
      const result = await runPowerShell(
        `${importModuleScript} $target=$env:GHST_CRED_TARGET; $cred = Get-StoredCredential -Target $target; if ($null -eq $cred) { exit 0 }; Remove-StoredCredential -Target $target`,
        {
          ...process.env,
          GHST_CRED_TARGET: toWindowsTarget(ref),
        },
      );
      if (result.code !== 0) {
        throw new Error(
          `Failed to delete credential from Windows Credential Manager: ${result.stderr || result.stdout}`,
        );
      }
    },
  };
}

function createAdapterForPlatform(): CredentialStoreAdapter {
  if (process.platform === 'darwin') {
    return createMacOsAdapter();
  }

  if (process.platform === 'linux') {
    return createLinuxAdapter();
  }

  if (process.platform === 'win32') {
    return createWindowsAdapter();
  }

  return createUnavailableStore();
}

function createCredentialStoreFromAdapter(adapter: CredentialStoreAdapter): CredentialStore {
  return {
    isAvailable: async () => await adapter.isAvailable(),
    set: async (ref, secret) => {
      await adapter.set(ref, secret);
    },
    get: async (ref) => await adapter.get(ref),
    delete: async (ref) => {
      await adapter.delete(ref);
    },
  };
}

export function credentialRefForAlias(alias: string): string {
  return `site:${sanitizeRef(alias)}`;
}

export function setCredentialStoreForTests(store: CredentialStore | null): void {
  credentialStoreForTests = store;
}

export function resetCredentialStoreCacheForTests(): void {
  cachedStore = null;
}

export function getCredentialStore(): CredentialStore {
  if (credentialStoreForTests) {
    return credentialStoreForTests;
  }

  // Keep tests deterministic and avoid writing to real OS keychains unless explicitly mocked.
  if (process.env.VITEST) {
    if (!cachedStore) {
      cachedStore = createCredentialStoreFromAdapter(createUnavailableStore());
    }
    return cachedStore;
  }

  if (!cachedStore) {
    cachedStore = createCredentialStoreFromAdapter(createAdapterForPlatform());
  }

  return cachedStore;
}
