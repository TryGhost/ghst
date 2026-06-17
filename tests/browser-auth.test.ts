import { afterEach, describe, expect, test, vi } from 'vitest';
import {
  type DiscoveredGhostSession,
  discoverBrowserGhostSessions,
  mintStaffTokenForSession,
  setSessionDiscovererForTests,
} from '../src/lib/browser-auth.js';

const ID = 'abc123';
const SECRET = '00112233445566778899aabbccddeeff';

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}

afterEach(() => {
  setSessionDiscovererForTests(null);
  vi.restoreAllMocks();
});

describe('discoverBrowserGhostSessions', () => {
  test('verifies a session with a read-only request (no token minted) and labels it', async () => {
    setSessionDiscovererForTests(() => [
      { host: 'localhost', secure: false, value: 's%3Asess.sig', source: 'Chrome · Renato' },
    ]);
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input);
      if (url.endsWith('/users/me/')) {
        return jsonResponse({ users: [{ id: 'u1', name: 'Renato Costa' }] });
      }
      return new Response('not found', { status: 404 });
    });

    const sessions = await discoverBrowserGhostSessions('v6.0');

    expect(sessions).toHaveLength(1);
    expect(sessions[0]).toEqual({
      origin: 'http://localhost:2368',
      label: 'localhost:2368',
      source: 'Chrome · Renato',
      user: 'Renato Costa',
      cookieValue: 's%3Asess.sig',
    });
    // Discovery must NOT create a staff token; it only reads /users/me/.
    expect(fetchMock.mock.calls.every(([url]) => !String(url).endsWith('/users/me/token/'))).toBe(
      true,
    );
  });

  test('uses https for a secure cookie and falls back to email for the label', async () => {
    setSessionDiscovererForTests(() => [
      { host: 'demo.ghost.io', secure: true, value: 'ok', source: 'Firefox · default' },
    ]);
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResponse({ users: [{ id: 'u1', email: 'renato@ghost.org' }] }),
    );

    const sessions = await discoverBrowserGhostSessions('v6.0');

    expect(sessions[0]?.origin).toBe('https://demo.ghost.io');
    expect(sessions[0]?.user).toBe('renato@ghost.org');
  });

  test('keeps a verified session even when no name/email is resolvable', async () => {
    setSessionDiscovererForTests(() => [
      { host: 'demo.ghost.io', secure: true, value: 'ok', source: 'Chrome · Renato' },
    ]);
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse({ users: [{ id: 'u1' }] }));

    const sessions = await discoverBrowserGhostSessions('v6.0');

    expect(sessions).toHaveLength(1);
    expect(sessions[0]?.user).toBeNull();
  });

  test('dedupes the same account on the same site across browsers', async () => {
    setSessionDiscovererForTests(() => [
      { host: 'localhost', secure: false, value: 'chrome-cookie', source: 'Chrome · Renato' },
      { host: 'localhost', secure: false, value: 'safari-cookie', source: 'Safari' },
    ]);
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResponse({ users: [{ id: 'same-user', name: 'Renato' }] }),
    );

    const sessions = await discoverBrowserGhostSessions('v6.0');

    expect(sessions).toHaveLength(1);
  });

  test('skips cookies that fail verification', async () => {
    setSessionDiscovererForTests(() => [
      { host: 'demo.ghost.io', secure: true, value: 'stale', source: 'Chrome · Renato' },
    ]);
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('forbidden', { status: 403 }));

    const sessions = await discoverBrowserGhostSessions('v6.0');

    expect(sessions).toEqual([]);
  });

  test('returns [] and does not throw when discovery fails', async () => {
    setSessionDiscovererForTests(() => {
      throw new Error('keychain denied');
    });
    const sessions = await discoverBrowserGhostSessions('v6.0');
    expect(sessions).toEqual([]);
  });
});

describe('mintStaffTokenForSession', () => {
  const session: DiscoveredGhostSession = {
    origin: 'http://localhost:2368',
    label: 'localhost:2368',
    source: 'Chrome · Renato',
    user: 'Renato Costa',
    cookieValue: 's%3Asess.sig',
  };

  test('mints the durable token for a chosen session', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(jsonResponse({ apiKey: { id: ID, secret: SECRET } }));

    const token = await mintStaffTokenForSession(session, 'v6.0');

    expect(token).toBe(`${ID}:${SECRET}`);
    const [url, init] = fetchMock.mock.calls[0] ?? [];
    expect(String(url)).toBe('http://localhost:2368/ghost/api/admin/users/me/token/');
    expect((init?.headers as Record<string, string>).Cookie).toBe(
      'ghost-admin-api-session=s%3Asess.sig',
    );
  });

  test('returns null when minting fails', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('forbidden', { status: 403 }));
    const token = await mintStaffTokenForSession(session, 'v6.0');
    expect(token).toBeNull();
  });

  test('returns null when the response has no usable apiKey', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse({ apiKey: { id: ID } }));
    const token = await mintStaffTokenForSession(session, 'v6.0');
    expect(token).toBeNull();
  });

  test('returns null and does not throw on network failure', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('offline'));
    const token = await mintStaffTokenForSession(session, 'v6.0');
    expect(token).toBeNull();
  });
});
