# AGENTS.md

## Project

- Name: `ghst`
- Purpose: TypeScript CLI for managing Ghost CMS instances.
- Status: Phase 1 skeleton with working vertical slice for `auth` and `post` read paths.
- PRD: GitHub issue `#1` (`ghst: prd`) — https://github.com/TryGhost/ghst/issues/1

## Runtime And Tooling

- Node: `24.x` (enforced via `.nvmrc` and `package.json` engines `>=24 <25`)
- Package manager: `pnpm@10.28.1`
- Language: TypeScript (ESM)
- Build: `tsup`
- Test: `vitest`
- Lint: ESLint + TypeScript ESLint

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
- Lint: `pnpm lint`

## Repository Layout

- Entrypoint: `src/index.ts`
- Commands: `src/commands/*`
- Core libs: `src/lib/*`
- Validation schemas: `src/schemas/*`
- Tests: `tests/*`
- CI workflows: `.github/workflows/*`

## Implemented Commands

- `ghst auth login|status|list|switch|logout|link|token`
- `ghst post list|get`
- `ghst config show`
- `ghst api <endpointPath>`
- `ghst completion`

## Stubbed Commands (Intentional)

- `ghst post create|update|delete|publish`
- `ghst page list|get|create|update|delete`
- `ghst tag list|get|create|update|delete`

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

## Notes

- Ghost Admin API version defaults to `v6.0`.
- JWT auth uses `{id}:{secret}` Admin key with `aud: /admin/` and 5-minute expiry.
