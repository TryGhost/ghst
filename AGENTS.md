# AGENTS.md

## Project

- Name: `ghst`
- Purpose: TypeScript CLI for managing Ghost CMS instances.
- Status: `v0.3.0` Phase 3 command surface implemented (`auth`, `post`, `page`, `tag`, `member`, `newsletter`, `tier`, `offer`, `label`, `webhook`, `user`, `image`, `theme`, `site`, `setting`, `migrate`, `config`, `api`, `completion`) with tests and fixture-backed Ghost Admin API mocks.
- PRD: GitHub issue `#1` (`ghst: prd`) — https://github.com/TryGhost/ghst/issues/1

## Runtime And Tooling

- Node: `24.x` (enforced via `.nvmrc` and `package.json` engines `>=24 <25`)
- Package manager: `pnpm@10.28.1`
- Language: TypeScript (ESM)
- Build: `tsup`
- Test: `vitest`
- Lint/format: Biome

## Quick Start

```bash
nvm use
corepack enable
pnpm install
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

## Common Commands

- Dev CLI: `pnpm dev --help`
- CLI help: `node dist/index.js --help`
- Build: `pnpm build`
- Typecheck: `pnpm typecheck`
- Test: `pnpm test`
- Lint: `pnpm lint` (Biome check: lint + formatting)
- Refresh Ghost Admin fixtures: `pnpm fixtures:ghost:update`
- Check Ghost Admin fixture drift: `pnpm fixtures:ghost:check`

## Repository Layout

- Entrypoint: `src/index.ts`
- Commands: `src/commands/*`
- Core libs: `src/lib/*`
- Validation schemas: `src/schemas/*`
- Tests: `tests/*`
- CI workflows: `.github/workflows/*`

## Implemented Commands

- `ghst auth login|status|list|switch|logout|link|token`
- `ghst post list|get|create|update|delete|publish`
- `ghst page list|get|create|update|delete`
- `ghst tag list|get|create|update|delete`
- `ghst member list|get|create|update|delete|import|export|bulk`
- `ghst newsletter list|get|create|update`
- `ghst tier list|get|create|update`
- `ghst offer list|get|create|update`
- `ghst label list|get|create|update|delete`
- `ghst webhook create|update|delete|events`
- `ghst user list|get|me`
- `ghst image upload`
- `ghst theme list|upload|activate|validate`
- `ghst site info`
- `ghst setting list|get|set`
- `ghst migrate wordpress|medium|substack|csv|json|export`
- `ghst config show|path|list|get|set`
- `ghst api [endpointPath]`
- `ghst completion <bash|zsh|fish|powershell>`

## Config Resolution Order

1. Explicit `--site`
2. Explicit `--url` + `--key`
3. Env `GHOST_URL` + `GHOST_ADMIN_API_KEY`
4. Project link `.ghst/config.json`
5. Active site in `~/.config/ghst/config.json`

## Files And State

- User config: `~/.config/ghst/config.json`
- Project link file: `.ghst/config.json`
- Example env vars: `.env.example`

## Coding Guidelines

- Keep command handlers thin; move logic into `src/lib`.
- Validate all command input with Zod before network calls.
- Map API/validation failures to `ExitCode` in `src/lib/errors.ts`.
- Preserve CLI contract: `ghst <resource> <action>`.
- Do not introduce breaking command/interface changes without updating docs/tests.

## Validation Expectations For Changes

After any non-trivial change, run:

```bash
pnpm lint && pnpm typecheck && pnpm test && pnpm build
```

When changing Ghost API fixtures or fixture-backed mocks, also run:

```bash
pnpm fixtures:ghost:check
```

## Notes

- Ghost Admin API version defaults to `v6.0`.
- JWT auth uses `{id}:{secret}` Admin key with `aud: /admin/` and 5-minute expiry.
- Fixture capture/check scripts target Ghost Admin API responses only.
- Source migration commands use Ghost-maintained `@tryghost/mg-*` packages and build Ghost JSON imports uploaded via `/db`.
