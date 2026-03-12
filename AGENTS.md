# AGENTS.md

## Project

- Name: `ghst`
- Purpose: TypeScript CLI for managing Ghost CMS instances.
- Status: Active TypeScript CLI with tests and fixture-backed Ghost Admin API mocks covering the current command surface (`auth`, `comment`, `post`, `page`, `tag`, `member`, `newsletter`, `tier`, `offer`, `label`, `webhook`, `user`, `image`, `theme`, `site`, `socialweb`, `stats`, `setting`, `migrate`, `config`, `api`, `mcp`, `completion`).
- Documentation split:
  - `README.md`: install + usage only (end-user docs)
  - `CONTRIBUTING.md`: cloning, local development, testing, and contribution workflow

## Runtime And Tooling

- Node: `20.x`, `22.x`, `24.x` (`.nvmrc` defaults to `24`; `package.json` engines allow all three)
- Package manager: `pnpm@10.30.3`
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
- Check committed Ghost fixtures offline: `pnpm fixtures:ghost:check`

## Documentation Rules

- Keep `README.md` focused on installing and using `ghst`; avoid repository development setup there.
- Keep all contributor/source-development instructions in `CONTRIBUTING.md`.
- Keep command/action/flag docs in sync across:
  - `README.md`
  - `AGENTS.md`
  - tests and command/runtime coverage
- When docs describe package installation UX, document intended published usage unless explicitly asked to note current publication status.

## Repository Layout

- Entrypoint: `src/index.ts`
- Commands: `src/commands/*`
- Core libs: `src/lib/*`
- Validation schemas: `src/schemas/*`
- Tests: `tests/*`
- CI workflows: `.github/workflows/*`

## Implemented Commands

- `ghst auth login|status|list|switch|logout|link|token`
- `ghst comment list|get|thread|replies|likes|reports|hide|show|delete`
- `ghst post list|get|create|update|delete|publish|schedule|unschedule|copy|bulk`
- `ghst page list|get|create|update|delete|copy|bulk`
- `ghst tag list|get|create|update|delete|bulk`
- `ghst member list|get|create|update|delete|import|export|bulk`
- `ghst newsletter list|get|create|update|bulk`
- `ghst tier list|get|create|update|bulk`
- `ghst offer list|get|create|update|bulk`
- `ghst label list|get|create|update|delete|bulk`
- `ghst webhook create|update|delete|events|listen`
- `ghst user list|get|me`
- `ghst image upload`
- `ghst theme list|upload|activate|validate|dev`
- `ghst site info`
- `ghst socialweb status|enable|disable|profile|profile-update|search|notes|reader|notifications|notifications-count|posts|likes|followers|following|post|thread|follow|unfollow|like|unlike|repost|derepost|delete|note|reply|blocked-accounts|blocked-domains|block|unblock|block-domain|unblock-domain|upload`
- `ghst stats overview|web|growth|posts|email|post`
- `ghst setting list|get|set`
- `ghst migrate wordpress|medium|substack|csv|json|export`
- `ghst config show|path|list|get|set`
- `ghst api [endpointPath]` (supports `--paginate`, `--include-headers`, `--field|-f`)
- `ghst mcp stdio|http`
- `ghst completion <bash|zsh|fish|powershell>`

## MCP Tool Groups

- `posts`
- `pages`
- `tags`
- `members`
- `comments`
- `site`
- `settings`
- `users`
- `api`
- `search`
- `stats`
- `socialweb`

## Behavior Notes

- `post create|update` supports `--markdown-file`, `--markdown-stdin`, `--html-raw-file`, and `--from-json`.
- `comment list` defaults to site-wide admin moderation semantics and includes replies unless `--top-level-only` is passed.
- `comment get` uses Ghost Admin's moderation read include set, and `comment thread` mirrors the Admin moderation sidebar by combining the selected comment read with the filtered thread query.
- `comment hide|show|delete` map to Ghost Admin comment status transitions (`hidden`, `published`, `deleted`).
- `auth logout` requires confirmation when removing all configured sites; non-interactive use requires `--yes`.
- `auth link` requires confirmation before replacing an existing project link; non-interactive use requires `--yes`, and relinking updates the discovered project config within the enclosing repo.
- `post publish|schedule` supports `--newsletter`, `--email-segment`, and `--email-only`.
- `post delete` supports either `<id>` or `--filter` (non-interactive delete requires `--yes`).
- `post bulk` supports `--action` plus compatibility aliases `--update`/`--delete` and update fields including `--add-tag` and `--authors`.
- `member list --status` composes with `--filter`.
- `member export --output`, `stats ... --csv --output`, and `migrate export --output` refuse to overwrite an existing file.
- `member update --expiry` supports complimentary tier expiry when used with `--tier`.
- `member bulk` keeps `--action` and supports compatibility aliases `--update`, `--delete`, `--labels`, `--yes`.
- `tier list --include` is supported.
- `bulk` subcommands exist for the mutable resources that support batch updates: `post`, `page`, `tag`, `member`, `newsletter`, `tier`, `offer`, `label`.
- `webhook listen` explicitly requires `--public-url` plus `--forward-to`; no implicit tunnel mode.
- `stats web` and `stats post ... web` use Ghost Admin stats routes where available and internal Tinybird reads for web traffic datasets Ghost does not wrap.
- `socialweb` uses the existing staff-token Admin API flow to mint a short-lived identity JWT from `/ghost/api/admin/identities/`, then uses that bearer token against `/.ghost/activitypub/v1/*`.
- `socialweb` requires an Owner/Admin staff token and is intentionally limited to Ghost's private social web admin surface; neither the CLI nor MCP expose public federation endpoints.
- `socialweb delete` requires confirmation; non-interactive use requires `--yes`.
- `stats growth` clips broader Ghost member/MRR/subscription histories client-side to the selected window when upstream endpoints cannot express the full range.
- `stats post ... growth` clips Ghost lifetime post-growth history client-side to the selected window.
- Ghost analytics semantics: `source` and `utm_*` filters are session-scoped, while post/member-status filters are hit-scoped.
- MCP now exposes first-class stats tools via the `stats` tool group rather than requiring raw `ghost_api_request` calls.
- MCP now exposes first-class comment moderation tools via the `comments` tool group, including list/get/thread/replies/likes/reports/hide/show/delete.
- MCP now exposes first-class social web tools via the `socialweb` tool group, covering status/profile/feed/interaction/moderation/upload flows.
- `api [endpointPath]` only accepts resource-relative paths or canonical Ghost API paths within the selected API root.
- `mcp http` requires `--unsafe-public-bind` for non-loopback hosts and `--cors-origin` accepts one exact origin only.
- MCP includes dedicated tools such as `ghost_post_schedule`, `ghost_image_upload`, `ghost_member_import`, `ghost_newsletter_list`, `ghost_tier_list`, `ghost_offer_list`, `ghost_theme_upload`, and `ghost_webhook_create`.

## Config Resolution Order

1. Explicit `--site`
2. Explicit `--url` + `--staff-token`
3. Env `GHOST_URL` + `GHOST_STAFF_ACCESS_TOKEN`
4. Project link `.ghst/config.json`
5. Active site in `~/.config/ghst/config.json`

## Files And State

- User config: `~/.config/ghst/config.json`
- Project link file: `.ghst/config.json`
- Example env vars: `.env.example`
- Contributor guide: `CONTRIBUTING.md`
- License: `LICENSE`

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

## Legal Alignment

- Repository license file: MIT text copied from `TryGhost/Ghost` into `LICENSE`.
- `README.md` ends with a `License & trademark` section aligned to Ghost wording/policy link.
- `CONTRIBUTING.md` ends with the Ghost Contributor License Agreement text.

## Notes

- Ghost Admin API version defaults to `v6.0`.
- JWT auth uses `{id}:{secret}` staff access token with `aud: /admin/` and 5-minute expiry.
- Fixture capture/check scripts target Ghost Admin API responses only.
- Fixture coverage includes the copy, bulk, listen, and social web endpoint usage exercised by command and runtime tests.
- Source migration commands use Ghost-maintained `@tryghost/mg-*` packages and build Ghost JSON imports uploaded via `/db`.
