import type { Command } from 'commander';
import { registerNotImplemented } from './stub.js';

export function registerPageCommands(program: Command): void {
  const page = program.command('page').description('Page management');
  registerNotImplemented(page, 'list', 'List pages', 'page list');
  registerNotImplemented(page, 'get', 'Get a page', 'page get');
  registerNotImplemented(page, 'create', 'Create a page', 'page create');
  registerNotImplemented(page, 'update', 'Update a page', 'page update');
  registerNotImplemented(page, 'delete', 'Delete a page', 'page delete');
}
