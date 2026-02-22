import type { CredentialStore } from '../../src/lib/credentials.js';

export function createMemoryCredentialStore(initial: Record<string, string> = {}): CredentialStore {
  const store = new Map<string, string>(Object.entries(initial));

  return {
    isAvailable: async () => true,
    set: async (ref, secret) => {
      store.set(ref, secret);
    },
    get: async (ref) => {
      return store.get(ref) ?? null;
    },
    delete: async (ref) => {
      store.delete(ref);
    },
  };
}

export function createUnavailableCredentialStore(): CredentialStore {
  return {
    isAvailable: async () => false,
    set: async () => {
      throw new Error('Secure store unavailable');
    },
    get: async () => null,
    delete: async () => undefined,
  };
}
