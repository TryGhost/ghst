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
2. Enter your Ghost URL.
3. Create a Custom Integration in Ghost Admin and copy the Admin API key.
4. Paste the key in `{id}:{secret}` format.

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
