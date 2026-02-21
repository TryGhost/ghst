import type { Command } from 'commander';
import { registerNotImplemented } from './stub.js';

export function registerTagCommands(program: Command): void {
  const tag = program.command('tag').description('Tag management');
  registerNotImplemented(tag, 'list', 'List tags', 'tag list');
  registerNotImplemented(tag, 'get', 'Get a tag', 'tag get');
  registerNotImplemented(tag, 'create', 'Create a tag', 'tag create');
  registerNotImplemented(tag, 'update', 'Update a tag', 'tag update');
  registerNotImplemented(tag, 'delete', 'Delete a tag', 'tag delete');
}
