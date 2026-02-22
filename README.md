# ghst

A modern Ghost CMS CLI.

## Release Status

- Current version target: `v0.4.0`
- PRD source: [GitHub issue #1](https://github.com/TryGhost/ghst/issues/1)
- Phase coverage:
  - Phase 1: auth + post/page/tag CRUD
  - Phase 2: member/newsletter/tier/offer/label
  - Phase 3: webhook/user/image/theme/site/setting/migrate/config/api/completion
  - Phase 4: `mcp`, `webhook listen`, `theme dev --watch`, post/page/tag parity actions, bulk operations across mutable phase 1-4 resources
- Deferred: `snippet` remains intentionally deferred until Ghost Admin API contract is confirmed.
  - Tracking doc: `docs/snippet-contract-tracker.md`

## Prerequisites

- Node.js `24.x` (`.nvmrc` included)
- `corepack` enabled
- `pnpm` via `corepack` (`pnpm@10.28.1`)

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
4. Paste the `Ghost API URL` and `Ghost Admin API Key`.

For CI/scripts:

```bash
ghst auth login --non-interactive --url https://myblog.ghost.io --key "{id}:{secret}" --json
```

Credentials are stored in `~/.config/ghst/config.json`.

## Command Surface (`v0.4.0`)

- `ghst auth login|logout|status|switch|list|link|token`
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
- `ghst setting list|get|set`
- `ghst migrate wordpress|medium|substack|csv|json|export`
- `ghst config show|path|list|get|set`
- `ghst api [endpointPath]`
- `ghst mcp stdio|http`
- `ghst completion <bash|zsh|fish|powershell>`

## Key Behaviors And Flags

- `ghst member get [id] --email <email>` supports id or email lookup.
- `ghst member list --status <free|paid|comped>` adds a status convenience filter (composed with `--filter` when both are present).
- `ghst member update [id] --tier <id> --expiry <datetime>` supports complimentary tier expiry updates.
- `ghst member bulk --action <unsubscribe|add-label|remove-label|delete> --all|--filter <nql> [--label-id <id>]` keeps the action model and also supports PRD aliases: `--update --labels <csv>` and `--delete --yes`.
- `ghst member import <filePath> --labels a,b` sends multipart field `membersfile`.
- `ghst member export --output ./members.csv` writes CSV; without `--output` it prints CSV to stdout.
- `ghst post create|update` supports content and payload ingestion via `--markdown-file`, `--markdown-stdin`, `--html-raw-file`, and `--from-json`.
- `ghst post create|update` supports metadata/email fields including excerpt, meta/og fields, code injection fields, newsletter slug, email segment, and email-only toggles.
- `ghst post schedule <id> --at <datetime>` and `ghst post unschedule <id>` support scheduled publishing control.
- `ghst post delete [id] --filter <nql>` supports filtered deletion; non-interactive execution requires `--yes`.
- `ghst post|page copy <id>` uses Ghost copy endpoints.
- `ghst post bulk --filter <nql> --action <update|delete>` supports aliases `--update`/`--delete` and update fields `--status`, `--tags`, `--add-tag`, `--authors`.
- `ghst page|tag bulk --filter <nql> --action <update|delete>` applies update/delete operations over matched resources.
- `ghst newsletter|tier|offer bulk --filter <nql> --action update` supports safe update-only bulk operations.
- `ghst label bulk --filter <nql> --action <update|delete>` supports update/delete with delete confirmation via `--yes`.
- `ghst tier list --include <relations>` is supported for relationship expansion.
- `ghst label get [id] --slug <slug>` and `ghst label update [id] --slug <slug> ...` support slug lookup.
- `ghst webhook listen --public-url <public url> --forward-to <local url>` creates temporary webhook subscriptions, forwards deliveries, and cleans up on exit.
- `ghst theme dev <path> --watch [--activate] [--debounce-ms <ms>]` uploads once, then debounced uploads on file changes.
- `ghst migrate csv` enforces canonical CSV headers: required `title` + exactly one of `html` or `markdown`; optional `slug,status,published_at,tags,authors,excerpt,feature_image`.
- `ghst migrate substack --url <source>` requires explicit source URL; `--target-url` can override destination Ghost URL.
- `ghst setting set` uses `PUT /settings` and surfaces explicit permission guidance for integration-token restrictions.
- `ghst api` supports:
  - `--method|-X`, `--query key=value`, `--body`, `--input`
  - `--field|-f key=value` to build/merge request body fields
  - `--paginate` to merge paginated list responses
  - `--include-headers` to include status and headers with payload
  - `--content-api` to target Content API instead of Admin API
- `ghst mcp stdio|http --tools <csv|all>` supports tool-group filtering.
  - Available groups: `posts,pages,tags,members,site,settings,users,api,search`.
  - Core tools include post/page/tag/member CRUD, `ghost_image_upload`, `ghost_member_import`, `ghost_newsletter_list`, `ghost_tier_list`, `ghost_offer_list`, `ghost_theme_upload`, `ghost_webhook_create`, settings/site/user/api/search.
  - `ghost_snippet_list` remains deferred until snippet contract confirmation.

## Examples

```bash
ghst post list --limit 5
ghst post schedule 123 --at 2026-03-01T10:00:00Z
ghst page copy 456
ghst tag bulk --filter "visibility:public" --action update --visibility internal
ghst post create --title "Launch" --markdown-file ./launch.md --newsletter weekly --email-segment all
ghst post bulk --filter "status:draft" --update --add-tag release-notes --authors editor@example.com
ghst member bulk --update --filter "status:free" --labels "trial,needs-follow-up"
ghst newsletter bulk --filter "status:active" --action update --visibility members
ghst webhook listen --public-url https://hooks.example.com/ghost --forward-to http://localhost:3000/webhooks
ghst theme dev ./theme-dir --watch --activate
ghst api /posts/ --paginate --include-headers
ghst mcp http --host 127.0.0.1 --port 3100 --tools posts,tags,site
```

## Config Resolution Order

1. `--site`
2. `--url` + `--key`
3. `GHOST_URL` + `GHOST_ADMIN_API_KEY`
4. project link file `.ghst/config.json`
5. active site in `~/.config/ghst/config.json`

## Validation And CI Commands

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

When fixture-backed Ghost API behavior changes:

```bash
pnpm fixtures:ghost:check
```
