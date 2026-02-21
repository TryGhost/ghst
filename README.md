# ghst

A modern Ghost CMS CLI.

## Prerequisites

- Node.js 24.x (`.nvmrc` included)
- `corepack` enabled
- `pnpm` (managed via `corepack`)

## Setup

```bash
nvm use
corepack enable
pnpm install
pnpm build
```

## Local Usage

```bash
pnpm dev --help
pnpm dev -- auth login
pnpm dev -- post list
```

## Link Globally

```bash
pnpm link --global
ghst --help
```

## First Authentication Flow

1. Run `ghst auth login`.
2. Press Enter when prompted to open Ghost Admin integration setup.
3. Create a Custom Integration in Ghost Admin.
4. Paste the `Ghost API URL` and `Ghost Admin API Key` when prompted.

For CI/scripts, use non-interactive mode:

```bash
ghst auth login --non-interactive --url https://myblog.ghost.io --key "{id}:{secret}" --json
```

Credentials are stored in `~/.config/ghst/config.json`.

## Example

```bash
ghst post list --limit 5
ghst post get --slug welcome
```

## Commands Included in Phase 1 Skeleton

- `ghst auth login|logout|status|switch|list|link|token`
- `ghst post list|get|create|update|delete|publish`
- `ghst page list|get|create|update|delete` (stubbed)
- `ghst tag list|get|create|update|delete` (stubbed)
- `ghst config show`
- `ghst api`
- `ghst completion`
