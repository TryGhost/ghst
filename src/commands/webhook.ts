import type { Command } from 'commander';
import { getGlobalOptions } from '../lib/context.js';
import { ExitCode, GhstError } from '../lib/errors.js';
import { printJson, printWebhookHuman } from '../lib/output.js';
import { parseCsv, parseInteger } from '../lib/parse.js';
import { confirm } from '../lib/prompts.js';
import { isNonInteractive } from '../lib/tty.js';
import { runWebhookListener } from '../lib/webhook-listener.js';
import { createWebhook, deleteWebhook, updateWebhook, WEBHOOK_EVENTS } from '../lib/webhooks.js';
import {
  WebhookCreateInputSchema,
  WebhookDeleteInputSchema,
  WebhookListenInputSchema,
  WebhookUpdateInputSchema,
} from '../schemas/webhook.js';

function throwValidationError(error: unknown): never {
  throw new GhstError(
    (error as { issues?: Array<{ message: string }> }).issues?.map((i) => i.message).join('; ') ??
      'Validation failed',
    {
      exitCode: ExitCode.VALIDATION_ERROR,
      code: 'VALIDATION_ERROR',
      details: error,
    },
  );
}

let webhookListenRunnerForTests:
  | ((
      global: ReturnType<typeof getGlobalOptions>,
      options: {
        publicUrl: string;
        forwardTo: string;
        events: string[];
        host?: string;
        port?: number;
        onEvent?: (event: Record<string, unknown>) => void;
      },
    ) => Promise<void>)
  | null = null;

export function setWebhookListenRunnerForTests(
  runner:
    | ((
        global: ReturnType<typeof getGlobalOptions>,
        options: {
          publicUrl: string;
          forwardTo: string;
          events: string[];
          host?: string;
          port?: number;
          onEvent?: (event: Record<string, unknown>) => void;
        },
      ) => Promise<void>)
    | null,
): void {
  webhookListenRunnerForTests = runner;
}

export function registerWebhookCommands(program: Command): void {
  const webhook = program.command('webhook').description('Webhook management');

  webhook
    .command('create')
    .description('Create a webhook')
    .requiredOption('--event <event>', 'Webhook event')
    .requiredOption('--target-url <url>', 'Webhook target URL')
    .option('--name <name>', 'Webhook name')
    .option('--secret <secret>', 'Webhook secret')
    .option('--api-version <version>', 'Webhook api version')
    .action(async (options, command) => {
      const global = getGlobalOptions(command);
      const parsed = WebhookCreateInputSchema.safeParse({
        event: options.event,
        targetUrl: options.targetUrl,
        name: options.name,
        secret: options.secret,
        apiVersion: options.apiVersion,
      });

      if (!parsed.success) {
        throwValidationError(parsed.error);
      }

      const payload = await createWebhook(global, {
        event: parsed.data.event,
        target_url: parsed.data.targetUrl,
        name: parsed.data.name,
        secret: parsed.data.secret,
        api_version: parsed.data.apiVersion,
      });

      if (global.json) {
        printJson(payload, global.jq);
        return;
      }

      printWebhookHuman(payload);
    });

  webhook
    .command('update <id>')
    .description('Update a webhook')
    .option('--event <event>', 'Webhook event')
    .option('--target-url <url>', 'Webhook target URL')
    .option('--name <name>', 'Webhook name')
    .option('--secret <secret>', 'Webhook secret')
    .option('--api-version <version>', 'Webhook api version')
    .action(async (id: string, options, command) => {
      const global = getGlobalOptions(command);
      const parsed = WebhookUpdateInputSchema.safeParse({
        id,
        event: options.event,
        targetUrl: options.targetUrl,
        name: options.name,
        secret: options.secret,
        apiVersion: options.apiVersion,
      });

      if (!parsed.success) {
        throwValidationError(parsed.error);
      }

      const payload = await updateWebhook(global, parsed.data.id, {
        event: parsed.data.event,
        target_url: parsed.data.targetUrl,
        name: parsed.data.name,
        secret: parsed.data.secret,
        api_version: parsed.data.apiVersion,
      });

      if (global.json) {
        printJson(payload, global.jq);
        return;
      }

      printWebhookHuman(payload);
    });

  webhook
    .command('delete <id>')
    .description('Delete a webhook')
    .option('--yes', 'Skip confirmation')
    .action(async (id: string, options, command) => {
      const global = getGlobalOptions(command);
      const parsed = WebhookDeleteInputSchema.safeParse({
        id,
        yes: options.yes,
      });

      if (!parsed.success) {
        throwValidationError(parsed.error);
      }

      if (!parsed.data.yes) {
        if (isNonInteractive()) {
          throw new GhstError('Deleting in non-interactive mode requires --yes.', {
            code: 'USAGE_ERROR',
            exitCode: ExitCode.USAGE_ERROR,
          });
        }

        const ok = await confirm(`Delete webhook '${parsed.data.id}'? [y/N]: `);
        if (!ok) {
          throw new GhstError('Operation cancelled.', {
            code: 'OPERATION_CANCELLED',
            exitCode: ExitCode.OPERATION_CANCELLED,
          });
        }
      }

      await deleteWebhook(global, parsed.data.id);

      if (global.json) {
        printJson({ ok: true, id: parsed.data.id });
        return;
      }

      console.log(`Deleted webhook '${parsed.data.id}'.`);
    });

  webhook
    .command('events')
    .description('List available webhook events')
    .action(async (_, command) => {
      const global = getGlobalOptions(command);
      if (global.json) {
        printJson({ events: WEBHOOK_EVENTS });
        return;
      }

      for (const eventName of WEBHOOK_EVENTS) {
        console.log(eventName);
      }
    });

  webhook
    .command('listen')
    .description('Listen for webhook events and forward to a local endpoint')
    .requiredOption('--public-url <url>', 'Public URL that Ghost should send webhook events to')
    .requiredOption('--forward-to <url>', 'Local endpoint to forward events to')
    .option('--events <events>', 'Comma-separated event names (defaults to post.published)')
    .option('--host <host>', 'Bind host for local listener', '127.0.0.1')
    .option('--port <port>', 'Bind port for local listener', '8787')
    .action(async (options, command) => {
      const global = getGlobalOptions(command);
      const parsed = WebhookListenInputSchema.safeParse({
        publicUrl: options.publicUrl,
        forwardTo: options.forwardTo,
        events: options.events,
        host: options.host,
        port: parseInteger(options.port, 'port'),
      });

      if (!parsed.success) {
        throwValidationError(parsed.error);
      }

      const selectedEvents = parseCsv(parsed.data.events) ?? ['post.published'];
      const knownEvents = new Set<string>(WEBHOOK_EVENTS as readonly string[]);
      const invalid = selectedEvents.filter((eventName) => !knownEvents.has(eventName));
      if (invalid.length > 0) {
        throw new GhstError(`Unsupported webhook event(s): ${invalid.join(', ')}`, {
          code: 'VALIDATION_ERROR',
          exitCode: ExitCode.VALIDATION_ERROR,
        });
      }

      const runner = webhookListenRunnerForTests ?? runWebhookListener;
      await runner(global, {
        publicUrl: parsed.data.publicUrl,
        forwardTo: parsed.data.forwardTo,
        events: selectedEvents,
        host: parsed.data.host,
        port: parsed.data.port,
        onEvent: (event) => {
          if (global.json) {
            console.log(JSON.stringify(event));
            return;
          }

          const type = String(event.type ?? '');
          if (type === 'ready') {
            console.log(
              `Listening on ${String(event.host)}:${String(event.port)} and forwarding to ${String(event.forwardTo)}`,
            );
            return;
          }

          if (type === 'forwarded') {
            console.log(`Forwarded event -> HTTP ${String(event.status)}`);
            return;
          }

          if (type === 'cleanup') {
            console.log(`Deleted temporary webhook ${String(event.id)}`);
            return;
          }

          if (type === 'error' || type === 'cleanup_error') {
            console.error(`Webhook listen error: ${String(event.message ?? '')}`);
          }
        },
      });
    });
}
