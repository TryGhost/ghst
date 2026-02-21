import type { Command } from 'commander';
import { getGlobalOptions } from '../lib/context.js';
import { ExitCode, GhstError } from '../lib/errors.js';
import { uploadImage } from '../lib/images.js';
import { printJson } from '../lib/output.js';
import { ImageUploadInputSchema } from '../schemas/image.js';

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

export function registerImageCommands(program: Command): void {
  const image = program.command('image').description('Image management');

  image
    .command('upload <filePath...>')
    .description('Upload one or more images')
    .option('--purpose <purpose>', 'Image purpose')
    .option('--ref <ref>', 'Reference value')
    .action(async (filePaths: string[], options, command) => {
      const global = getGlobalOptions(command);
      const results: Array<Record<string, unknown>> = [];

      for (const filePath of filePaths) {
        const parsed = ImageUploadInputSchema.safeParse({
          filePath,
          purpose: options.purpose,
          ref: options.ref,
        });

        if (!parsed.success) {
          throwValidationError(parsed.error);
        }

        const payload = await uploadImage(global, {
          filePath: parsed.data.filePath,
          purpose: parsed.data.purpose,
          ref: parsed.data.ref,
        });

        results.push(payload);
      }

      if (global.json) {
        printJson({ images: results }, global.jq);
        return;
      }

      for (const payload of results) {
        const images = Array.isArray(payload.images)
          ? (payload.images as Array<Record<string, unknown>>)
          : [];
        const first = images[0] ?? payload;
        console.log(String(first.url ?? first.path ?? 'Uploaded image'));
      }
    });
}
