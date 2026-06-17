import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import type { DiscoveredGhostSession } from '../src/lib/browser-auth.js';
import { selectBrowserSession } from '../src/lib/session-picker.js';

const sessions: DiscoveredGhostSession[] = [
  {
    origin: 'http://localhost:2368',
    label: 'localhost:2368',
    source: 'Chrome · Renato',
    user: 'Renato',
    cookieValue: 's%3Aa',
  },
  {
    origin: 'https://demo.ghost.io',
    label: 'demo.ghost.io',
    source: 'Firefox · dev',
    user: null,
    cookieValue: 's%3Ab',
  },
];

beforeEach(() => {
  vi.spyOn(console, 'log').mockImplementation(() => undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
});

// Non-TTY (the vitest environment) exercises the numbered-prompt fallback.
describe('selectBrowserSession (numbered fallback)', () => {
  test('returns the chosen session by number', async () => {
    const result = await selectBrowserSession(sessions, {
      useColor: false,
      prompt: async () => '2',
    });
    expect(result).toBe(sessions[1]);
  });

  test('returns "url" when the user presses Enter', async () => {
    const result = await selectBrowserSession(sessions, {
      useColor: false,
      prompt: async () => '',
    });
    expect(result).toBe('url');
  });

  test('returns "url" for out-of-range or non-numeric input', async () => {
    expect(
      await selectBrowserSession(sessions, { useColor: false, prompt: async () => '99' }),
    ).toBe('url');
    expect(
      await selectBrowserSession(sessions, { useColor: false, prompt: async () => 'abc' }),
    ).toBe('url');
  });
});
