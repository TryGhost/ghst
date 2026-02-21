import type { Command } from 'commander';
import { getGlobalOptions } from '../lib/context.js';
import { ExitCode, GhstError } from '../lib/errors.js';
import { printJson, printTagHuman, printTagListHuman } from '../lib/output.js';
import { parseInteger } from '../lib/parse.js';
import { confirm } from '../lib/prompts.js';
import { createTag, deleteTag, getTag, listTags, updateTag } from '../lib/tags.js';
import { isNonInteractive } from '../lib/tty.js';
import {
  TagCreateInputSchema,
  TagDeleteInputSchema,
  TagGetInputSchema,
  TagListInputSchema,
  TagUpdateInputSchema,
} from '../schemas/tag.js';

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

export function registerTagCommands(program: Command): void {
  const tag = program.command('tag').description('Tag management');

  tag
    .command('list')
    .description('List tags')
    .option('--limit <numberOrAll>', 'Number of tags per page or "all"')
    .option('--page <number>', 'Page number')
    .option('--filter <nql>', 'NQL filter')
    .option('--include <relations>', 'Include relationships')
    .option('--fields <fields>', 'Select output fields')
    .option('--order <order>', 'Sort order')
    .action(async (options, command) => {
      const global = getGlobalOptions(command);
      const rawLimit = options.limit === 'all' ? 'all' : parseInteger(options.limit, 'limit');
      const rawPage = parseInteger(options.page, 'page');

      const parsed = TagListInputSchema.safeParse({
        limit: rawLimit,
        page: rawPage,
        filter: options.filter,
        include: options.include,
        fields: options.fields,
        order: options.order,
      });

      if (!parsed.success) {
        throwValidationError(parsed.error);
      }

      const allPages = parsed.data.limit === 'all';
      const payload = await listTags(
        global,
        {
          ...parsed.data,
          limit: parsed.data.limit === 'all' ? undefined : parsed.data.limit,
        },
        allPages,
      );

      if (global.json) {
        printJson(payload, global.jq);
        return;
      }

      printTagListHuman(payload, global.color !== false);
    });

  tag
    .command('get [id]')
    .description('Get a tag by id or slug')
    .option('--slug <slug>', 'Tag slug')
    .option('--include <relations>', 'Include relationships')
    .option('--fields <fields>', 'Select output fields')
    .action(async (id: string | undefined, options, command) => {
      const global = getGlobalOptions(command);
      const parsed = TagGetInputSchema.safeParse({
        id,
        slug: options.slug,
        include: options.include,
        fields: options.fields,
      });

      if (!parsed.success) {
        throwValidationError(parsed.error);
      }

      const lookup = parsed.data.slug ?? parsed.data.id;
      if (!lookup) {
        throw new GhstError('Provide an id argument or --slug.', {
          exitCode: ExitCode.USAGE_ERROR,
          code: 'USAGE_ERROR',
        });
      }

      const payload = await getTag(global, lookup, {
        bySlug: Boolean(parsed.data.slug),
        params: {
          include: parsed.data.include,
          fields: parsed.data.fields,
        },
      });

      if (global.json) {
        printJson(payload, global.jq);
        return;
      }

      printTagHuman(payload);
    });

  tag
    .command('create')
    .description('Create a tag')
    .requiredOption('--name <name>', 'Tag name')
    .option('--slug <slug>', 'Tag slug')
    .option('--description <description>', 'Tag description')
    .option('--feature-image <url>', 'Tag feature image URL')
    .option('--accent-color <hex>', 'Tag accent color (hex)')
    .option('--visibility <visibility>', 'public|internal')
    .option('--meta-title <title>', 'Meta title')
    .option('--meta-description <description>', 'Meta description')
    .action(async (options, command) => {
      const global = getGlobalOptions(command);
      const parsed = TagCreateInputSchema.safeParse({
        name: options.name,
        slug: options.slug,
        description: options.description,
        featureImage: options.featureImage,
        accentColor: options.accentColor,
        visibility: options.visibility,
        metaTitle: options.metaTitle,
        metaDescription: options.metaDescription,
      });

      if (!parsed.success) {
        throwValidationError(parsed.error);
      }

      const payload = await createTag(global, {
        name: parsed.data.name,
        slug: parsed.data.slug,
        description: parsed.data.description,
        feature_image: parsed.data.featureImage,
        accent_color: parsed.data.accentColor,
        visibility: parsed.data.visibility,
        meta_title: parsed.data.metaTitle,
        meta_description: parsed.data.metaDescription,
      });

      if (global.json) {
        printJson(payload, global.jq);
        return;
      }

      printTagHuman(payload);
    });

  tag
    .command('update [id]')
    .description('Update a tag by id or slug')
    .option('--slug <slug>', 'Tag slug lookup')
    .option('--name <name>', 'Tag name')
    .option('--new-slug <slug>', 'New tag slug')
    .option('--description <description>', 'Tag description')
    .option('--feature-image <url>', 'Tag feature image URL')
    .option('--accent-color <hex>', 'Tag accent color (hex)')
    .option('--visibility <visibility>', 'public|internal')
    .option('--meta-title <title>', 'Meta title')
    .option('--meta-description <description>', 'Meta description')
    .action(async (id: string | undefined, options, command) => {
      const global = getGlobalOptions(command);
      const parsed = TagUpdateInputSchema.safeParse({
        id,
        slugLookup: options.slug,
        name: options.name,
        slug: options.newSlug,
        description: options.description,
        featureImage: options.featureImage,
        accentColor: options.accentColor,
        visibility: options.visibility,
        metaTitle: options.metaTitle,
        metaDescription: options.metaDescription,
      });

      if (!parsed.success) {
        throwValidationError(parsed.error);
      }

      const payload = await updateTag(global, {
        id: parsed.data.id,
        slug: parsed.data.slugLookup,
        patch: {
          name: parsed.data.name,
          slug: parsed.data.slug,
          description: parsed.data.description,
          feature_image: parsed.data.featureImage,
          accent_color: parsed.data.accentColor,
          visibility: parsed.data.visibility,
          meta_title: parsed.data.metaTitle,
          meta_description: parsed.data.metaDescription,
        },
      });

      if (global.json) {
        printJson(payload, global.jq);
        return;
      }

      printTagHuman(payload);
    });

  tag
    .command('delete <id>')
    .description('Delete a tag')
    .option('--yes', 'Skip confirmation')
    .action(async (id: string, options, command) => {
      const global = getGlobalOptions(command);
      const parsed = TagDeleteInputSchema.safeParse({
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

        const ok = await confirm(`Delete tag '${parsed.data.id}'? [y/N]: `);
        if (!ok) {
          throw new GhstError('Operation cancelled.', {
            code: 'OPERATION_CANCELLED',
            exitCode: ExitCode.OPERATION_CANCELLED,
          });
        }
      }

      await deleteTag(global, parsed.data.id);

      if (global.json) {
        printJson({ ok: true, id: parsed.data.id });
        return;
      }

      console.log(`Deleted tag '${parsed.data.id}'.`);
    });
}
