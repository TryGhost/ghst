import { StaffAccessTokenSchema } from '../schemas/common.js';
import { type DiscoveredCookie, discoverBrowserSessionCookies } from './browser-cookies.js';

// Bootstraps a durable staff access token from an already-logged-in Ghost Admin
// browser session. The session cookie is only a bootstrap: we use it once on a
// GET to mint the persistent {id}:{secret} token the CLI stores, then discard
// it. The cookie is never persisted and never becomes the auth primitive.

const SESSION_COOKIE_NAME = 'ghost-admin-api-session';
const STAFF_TOKEN_PATH = '/ghost/api/admin/users/me/token/';

// Per-request cap so an unreachable or slow host can't stall discovery. A
// candidate that times out is simply skipped.
const REQUEST_TIMEOUT_MS = 8000;

type SessionDiscoverer = (name: string) => DiscoveredCookie[];

let sessionDiscoverer: SessionDiscoverer = discoverBrowserSessionCookies;

// Test seam: swap the discovery source so the picker logic can be tested
// without touching real browser stores or the Keychain.
export function setSessionDiscovererForTests(discoverer: SessionDiscoverer | null): void {
  sessionDiscoverer = discoverer ?? discoverBrowserSessionCookies;
}

// GETs an admin endpoint with the session cookie and returns the parsed JSON,
// or null on any failure (network error, timeout, non-OK, or unparseable body).
// Shared by the verify and mint requests, which differ only in path and shape.
async function getWithSession(
  path: string,
  origin: string,
  cookieValue: string,
  version: string,
): Promise<unknown> {
  try {
    const response = await fetch(new URL(path, origin).toString(), {
      method: 'GET',
      headers: {
        'Accept-Version': version,
        'App-Pragma': 'no-cache',
        Cookie: `${SESSION_COOKIE_NAME}=${cookieValue}`,
      },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    if (!response.ok) {
      return null;
    }
    return await response.json();
  } catch {
    return null; // network error, timeout, or unparseable body
  }
}

async function exchangeCookieForStaffToken(
  origin: string,
  cookieValue: string,
  version: string,
): Promise<string | null> {
  const body = (await getWithSession(STAFF_TOKEN_PATH, origin, cookieValue, version)) as {
    apiKey?: { id?: unknown; secret?: unknown };
  } | null;
  const apiKey = body?.apiKey;
  if (!apiKey || typeof apiKey.id !== 'string' || typeof apiKey.secret !== 'string') {
    return null;
  }
  const token = `${apiKey.id}:${apiKey.secret}`;
  return StaffAccessTokenSchema.safeParse(token).success ? token : null;
}

// A logged-in Ghost site discovered from a browser session. Discovery only
// verifies the session (a read-only GET /users/me/); the durable staff token is
// minted later, via mintStaffTokenForSession, once the user actually picks this
// session — mirroring the manual flow where the token is created only when the
// user proceeds. The cookie value is carried so we can mint at that point; it is
// never persisted.
export interface DiscoveredGhostSession {
  origin: string; // verified Ghost Admin origin
  label: string; // host (or host:port) for display
  source: string; // browser/profile it came from
  user: string | null; // the signed-in user's name/email, if resolvable
  cookieValue: string; // session cookie, used to mint the token once chosen
}

// Builds the origin(s) to try for a discovered cookie. The cookie store knows
// the host but not the port, so localhost defaults to Ghost's dev port.
function candidateOrigins(cookie: DiscoveredCookie): string[] {
  if (cookie.host === 'localhost' || cookie.host === '127.0.0.1') {
    return [`http://${cookie.host}:2368`];
  }
  return [cookie.secure ? `https://${cookie.host}` : `http://${cookie.host}`];
}

function firstNonEmptyString(...values: unknown[]): string | null {
  for (const value of values) {
    if (typeof value === 'string' && value.length > 0) {
      return value;
    }
  }
  return null;
}

// Verifies a session cookie against an origin with a read-only GET /users/me/
// (which does NOT create a staff token), returning the signed-in user's
// name/email and id, or null if the cookie isn't a valid Ghost Admin session.
async function fetchSessionUser(
  origin: string,
  cookieValue: string,
  version: string,
): Promise<{ name: string | null; id: string } | null> {
  const body = (await getWithSession(
    '/ghost/api/admin/users/me/',
    origin,
    cookieValue,
    version,
  )) as {
    users?: Array<{ id?: unknown; name?: unknown; email?: unknown }>;
  } | null;
  const user = body?.users?.[0];
  if (!user || typeof user.id !== 'string') {
    return null; // not a valid Ghost Admin session (or unexpected body shape)
  }
  return { name: firstNonEmptyString(user.name, user.email), id: user.id };
}

// Discovers logged-in Ghost sessions across the local browsers and verifies each
// with a read-only request (no staff token is created here). Returns one entry
// per usable session; never throws.
export async function discoverBrowserGhostSessions(
  version: string,
): Promise<DiscoveredGhostSession[]> {
  let cookies: DiscoveredCookie[];
  try {
    cookies = sessionDiscoverer(SESSION_COOKIE_NAME);
  } catch {
    return [];
  }

  // Verify every candidate concurrently so the wall-clock cost is one round
  // trip, not the sum across sites. Order is preserved from discovery.
  const verified = await Promise.all(
    cookies.map(async (cookie) => {
      for (const origin of candidateOrigins(cookie)) {
        const info = await fetchSessionUser(origin, cookie.value, version);
        if (!info) {
          continue;
        }
        let label: string;
        try {
          label = new URL(origin).host;
        } catch {
          label = origin;
        }
        return {
          session: {
            origin,
            label,
            source: cookie.source,
            user: info.name,
            cookieValue: cookie.value,
          },
          userId: info.id,
        };
      }
      return null;
    }),
  );

  // Dedupe the same user on the same site across browsers/profiles (different
  // cookies, same account) so the picker doesn't list a site twice.
  const sessions: DiscoveredGhostSession[] = [];
  const seen = new Set<string>();
  for (const entry of verified) {
    if (!entry) {
      continue;
    }
    const key = `${entry.session.origin} ${entry.userId}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    sessions.push(entry.session);
  }
  return sessions;
}

// Mints (or fetches, if it already exists) the durable staff token for a chosen
// session by calling GET /users/me/token/, which creates-if-absent — the same
// thing the user's profile page does. Returns {id}:{secret}, or null on failure.
export async function mintStaffTokenForSession(
  session: DiscoveredGhostSession,
  version: string,
): Promise<string | null> {
  return exchangeCookieForStaffToken(session.origin, session.cookieValue, version);
}
