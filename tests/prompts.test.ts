import { afterEach, describe, expect, test, vi } from 'vitest';
import { confirmDestructiveAction, setPromptHandlerForTests } from '../src/lib/prompts.js';

describe('prompts', () => {
  afterEach(() => {
    setPromptHandlerForTests(null);
    vi.restoreAllMocks();
  });

  test('emits agent notices for destructive confirmations', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    setPromptHandlerForTests(async () => 'yes');

    await expect(
      confirmDestructiveAction("Delete member 'member-1'? [y/N]: ", {
        action: 'delete_member',
        target: 'member-1',
        reversible: false,
        site: 'myblog',
        sideEffects: ['cancel_subscriptions'],
      }),
    ).resolves.toBe(true);

    expect(errorSpy.mock.calls).toEqual([
      ['GHST_AGENT_NOTICE: destructive_action'],
      ['GHST_AGENT_NOTICE: Agents must ask the user for approval before continuing.'],
      [
        'GHST_AGENT_NOTICE: {"action":"delete_member","target":"member-1","reversible":false,"site":"myblog","sideEffects":["cancel_subscriptions"]}',
      ],
    ]);
  });
});
