import { GhostClient } from './client.js';
import { resolveConnectionConfig } from './config.js';
import { ExitCode, GhstError } from './errors.js';
import type { GlobalOptions } from './types.js';

async function getClient(global: GlobalOptions): Promise<GhostClient> {
  const connection = await resolveConnectionConfig(global);
  return new GhostClient({
    url: connection.url,
    staffToken: connection.staffToken,
    version: connection.apiVersion,
  });
}

export async function getSiteInfo(global: GlobalOptions): Promise<Record<string, unknown>> {
  const client = await getClient(global);
  return client.siteInfo();
}

function probeNetworkError(probeUrl: string, error: unknown): GhstError {
  return new GhstError(
    `Unable to reach Ghost Admin URL '${probeUrl}': ${(error as Error).message}`,
    {
      exitCode: ExitCode.GENERAL_ERROR,
      code: 'NETWORK_ERROR',
    },
  );
}

// Whether `origin` answers Ghost's public (unauthenticated) Admin API site
// endpoint. Login uses this before following a cross-origin discovery
// redirect: authenticating proxies such as Cloudflare Access redirect to their
// own login host, which never does. Failures that say nothing about what is
// served there (network errors, rate limits, 5xx) throw NETWORK_ERROR.
export async function servesGhostAdminApi(origin: string): Promise<boolean> {
  const probeUrl = `${origin}/ghost/api/admin/site/`;
  let response: Response;
  let body: string;
  try {
    response = await fetch(probeUrl, {
      method: 'GET',
      redirect: 'manual',
      headers: { Accept: 'application/json' },
    });
    body = await response.text();
  } catch (error) {
    throw probeNetworkError(probeUrl, error);
  }

  if (response.status === 429 || response.status >= 500) {
    throw new GhstError(
      `Ghost Admin URL '${probeUrl}' responded with HTTP ${response.status}. Try again later.`,
      {
        exitCode: ExitCode.GENERAL_ERROR,
        code: 'NETWORK_ERROR',
        status: response.status,
      },
    );
  }

  if (!response.ok) {
    return false;
  }

  let payload: { site?: unknown } | null;
  try {
    payload = JSON.parse(body) as { site?: unknown } | null;
  } catch {
    return false;
  }
  return typeof payload?.site === 'object' && payload.site !== null;
}
