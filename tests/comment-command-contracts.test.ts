import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { ExitCode } from '../src/lib/errors.js';
import { setPromptHandlerForTests } from '../src/lib/prompts.js';

const commentMocks = vi.hoisted(() => ({
  listComments: vi.fn(),
  getComment: vi.fn(),
  getCommentThread: vi.fn(),
  listCommentReplies: vi.fn(),
  listCommentLikes: vi.fn(),
  listCommentReports: vi.fn(),
  setCommentStatus: vi.fn(),
  printJson: vi.fn(),
  printCommentHuman: vi.fn(),
  printCommentThreadHuman: vi.fn(),
  printCommentLikesHuman: vi.fn(),
  printCommentListHuman: vi.fn(),
  printCommentReportsHuman: vi.fn(),
}));

vi.mock('../src/lib/comments.js', async () => {
  const actual =
    await vi.importActual<typeof import('../src/lib/comments.js')>('../src/lib/comments.js');
  return {
    ...actual,
    listComments: (...args: unknown[]) => commentMocks.listComments(...args),
    getComment: (...args: unknown[]) => commentMocks.getComment(...args),
    getCommentThread: (...args: unknown[]) => commentMocks.getCommentThread(...args),
    listCommentReplies: (...args: unknown[]) => commentMocks.listCommentReplies(...args),
    listCommentLikes: (...args: unknown[]) => commentMocks.listCommentLikes(...args),
    listCommentReports: (...args: unknown[]) => commentMocks.listCommentReports(...args),
    setCommentStatus: (...args: unknown[]) => commentMocks.setCommentStatus(...args),
  };
});

vi.mock('../src/lib/output.js', async () => {
  const actual =
    await vi.importActual<typeof import('../src/lib/output.js')>('../src/lib/output.js');
  return {
    ...actual,
    printJson: (...args: unknown[]) => commentMocks.printJson(...args),
    printCommentHuman: (...args: unknown[]) => commentMocks.printCommentHuman(...args),
    printCommentThreadHuman: (...args: unknown[]) => commentMocks.printCommentThreadHuman(...args),
    printCommentLikesHuman: (...args: unknown[]) => commentMocks.printCommentLikesHuman(...args),
    printCommentListHuman: (...args: unknown[]) => commentMocks.printCommentListHuman(...args),
    printCommentReportsHuman: (...args: unknown[]) =>
      commentMocks.printCommentReportsHuman(...args),
  };
});

import { run } from '../src/index.js';

describe('comment command contracts', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setPromptHandlerForTests(null);

    commentMocks.listComments.mockResolvedValue({ comments: [{ id: 'comment-1' }] });
    commentMocks.getComment.mockResolvedValue({ comments: [{ id: 'comment-1' }] });
    commentMocks.getCommentThread.mockResolvedValue({
      comment: { id: 'comment-1' },
      comments: [{ id: 'comment-reply-1' }],
    });
    commentMocks.listCommentReplies.mockResolvedValue({ comments: [{ id: 'comment-reply-1' }] });
    commentMocks.listCommentLikes.mockResolvedValue({ comment_likes: [{ id: 'like-1' }] });
    commentMocks.listCommentReports.mockResolvedValue({ comment_reports: [{ id: 'report-1' }] });
    commentMocks.setCommentStatus.mockResolvedValue({
      comments: [{ id: 'comment-1', status: 'hidden' }],
    });

    vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    setPromptHandlerForTests(null);
    vi.restoreAllMocks();
  });

  test('normalizes list/replies pagination and routes printers by output mode', async () => {
    await expect(
      run(['node', 'ghst', 'comment', 'list', '--limit', 'all', '--top-level-only', '--json']),
    ).resolves.toBe(ExitCode.SUCCESS);
    await expect(
      run([
        'node',
        'ghst',
        'comment',
        'replies',
        'comment-1',
        '--limit',
        '20',
        '--page',
        '2',
        '--filter',
        'status:published',
        '--json',
      ]),
    ).resolves.toBe(ExitCode.SUCCESS);

    expect(commentMocks.listComments).toHaveBeenCalledWith(
      expect.any(Object),
      {
        limit: undefined,
        page: undefined,
        filter: undefined,
        order: undefined,
        includeNested: false,
      },
      true,
    );
    expect(commentMocks.listCommentReplies).toHaveBeenCalledWith(
      expect.any(Object),
      'comment-1',
      {
        limit: 20,
        page: 2,
        filter: 'status:published',
      },
      false,
    );
    expect(commentMocks.printJson).toHaveBeenCalledTimes(2);
  });

  test('rejects combining --page with --limit all', async () => {
    await expect(
      run(['node', 'ghst', 'comment', 'list', '--limit', 'all', '--page', '2']),
    ).resolves.toBe(ExitCode.VALIDATION_ERROR);
    await expect(
      run(['node', 'ghst', 'comment', 'replies', 'comment-1', '--limit', 'all', '--page', '2']),
    ).resolves.toBe(ExitCode.VALIDATION_ERROR);
    await expect(
      run(['node', 'ghst', 'comment', 'likes', 'comment-1', '--limit', 'all', '--page', '2']),
    ).resolves.toBe(ExitCode.VALIDATION_ERROR);
    await expect(
      run(['node', 'ghst', 'comment', 'reports', 'comment-1', '--limit', 'all', '--page', '2']),
    ).resolves.toBe(ExitCode.VALIDATION_ERROR);

    expect(commentMocks.listComments).not.toHaveBeenCalled();
    expect(commentMocks.listCommentReplies).not.toHaveBeenCalled();
    expect(commentMocks.listCommentLikes).not.toHaveBeenCalled();
    expect(commentMocks.listCommentReports).not.toHaveBeenCalled();
  });

  test('routes get, thread, likes, and reports through the correct human/json printers', async () => {
    await expect(run(['node', 'ghst', 'comment', 'get', 'comment-1'])).resolves.toBe(
      ExitCode.SUCCESS,
    );
    await expect(run(['node', 'ghst', 'comment', 'thread', 'comment-1'])).resolves.toBe(
      ExitCode.SUCCESS,
    );
    await expect(run(['node', 'ghst', 'comment', 'likes', 'comment-1'])).resolves.toBe(
      ExitCode.SUCCESS,
    );
    await expect(run(['node', 'ghst', 'comment', 'reports', 'comment-1', '--json'])).resolves.toBe(
      ExitCode.SUCCESS,
    );

    expect(commentMocks.getComment).toHaveBeenCalledWith(expect.any(Object), 'comment-1');
    expect(commentMocks.getCommentThread).toHaveBeenCalledWith(expect.any(Object), 'comment-1');
    expect(commentMocks.printCommentHuman).toHaveBeenCalledWith({
      comments: [{ id: 'comment-1' }],
    });
    expect(commentMocks.printCommentThreadHuman).toHaveBeenCalledWith(
      {
        comment: { id: 'comment-1' },
        comments: [{ id: 'comment-reply-1' }],
      },
      expect.any(Boolean),
    );
    expect(commentMocks.printCommentLikesHuman).toHaveBeenCalledWith(
      { comment_likes: [{ id: 'like-1' }] },
      expect.any(Boolean),
    );
    expect(commentMocks.printJson).toHaveBeenCalledWith(
      { comment_reports: [{ id: 'report-1' }] },
      undefined,
    );
  });

  test('maps hide/show/delete to status mutations and enforces delete confirmation', async () => {
    await expect(run(['node', 'ghst', 'comment', 'hide', 'comment-1', '--json'])).resolves.toBe(
      ExitCode.SUCCESS,
    );
    await expect(run(['node', 'ghst', 'comment', 'show', 'comment-1', '--json'])).resolves.toBe(
      ExitCode.SUCCESS,
    );
    await expect(
      run(['node', 'ghst', 'comment', 'delete', 'comment-1', '--yes', '--json']),
    ).resolves.toBe(ExitCode.SUCCESS);

    expect(commentMocks.setCommentStatus).toHaveBeenNthCalledWith(
      1,
      expect.any(Object),
      'comment-1',
      'hidden',
    );
    expect(commentMocks.setCommentStatus).toHaveBeenNthCalledWith(
      2,
      expect.any(Object),
      'comment-1',
      'published',
    );
    expect(commentMocks.setCommentStatus).toHaveBeenNthCalledWith(
      3,
      expect.any(Object),
      'comment-1',
      'deleted',
    );

    const stdinTty = Object.getOwnPropertyDescriptor(process.stdin, 'isTTY');
    const stdoutTty = Object.getOwnPropertyDescriptor(process.stdout, 'isTTY');
    Object.defineProperty(process.stdin, 'isTTY', { value: false, configurable: true });
    await expect(run(['node', 'ghst', 'comment', 'delete', 'comment-1'])).resolves.toBe(
      ExitCode.USAGE_ERROR,
    );
    Object.defineProperty(process.stdin, 'isTTY', { value: true, configurable: true });
    Object.defineProperty(process.stdout, 'isTTY', { value: true, configurable: true });

    setPromptHandlerForTests(async () => 'no');
    await expect(run(['node', 'ghst', 'comment', 'delete', 'comment-1'])).resolves.toBe(
      ExitCode.OPERATION_CANCELLED,
    );

    if (stdinTty) {
      Object.defineProperty(process.stdin, 'isTTY', stdinTty);
    }
    if (stdoutTty) {
      Object.defineProperty(process.stdout, 'isTTY', stdoutTty);
    }
  });

  test('supports human moderation flows and validation errors', async () => {
    const stdinTty = Object.getOwnPropertyDescriptor(process.stdin, 'isTTY');
    const stdoutTty = Object.getOwnPropertyDescriptor(process.stdout, 'isTTY');

    Object.defineProperty(process.stdin, 'isTTY', { value: true, configurable: true });
    Object.defineProperty(process.stdout, 'isTTY', { value: true, configurable: true });

    await expect(run(['node', 'ghst', 'comment', 'show', 'comment-1'])).resolves.toBe(
      ExitCode.SUCCESS,
    );

    setPromptHandlerForTests(async () => 'yes');
    await expect(run(['node', 'ghst', 'comment', 'delete', 'comment-1'])).resolves.toBe(
      ExitCode.SUCCESS,
    );

    await expect(run(['node', 'ghst', 'comment', 'show', ''])).resolves.toBe(
      ExitCode.VALIDATION_ERROR,
    );
    await expect(run(['node', 'ghst', 'comment', 'delete', '', '--yes'])).resolves.toBe(
      ExitCode.VALIDATION_ERROR,
    );

    expect(commentMocks.printCommentHuman).toHaveBeenCalledTimes(2);

    if (stdinTty) {
      Object.defineProperty(process.stdin, 'isTTY', stdinTty);
    }
    if (stdoutTty) {
      Object.defineProperty(process.stdout, 'isTTY', stdoutTty);
    }
  });
});
