# ghst

A modern Ghost CMS CLI.

## Release

- Current release target: `v0.3.0` (Phase 3 operations surface)

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
ghst page create --title "About" --html-file ./about.html
ghst tag create --name "News" --accent-color "#ff0000"
ghst member list --limit 10
ghst member export --output ./members.csv
ghst newsletter list
ghst tier list
ghst offer list
ghst label list
ghst webhook events
ghst user me
ghst image upload ./photo.jpg
ghst theme list
ghst site info
ghst setting get title
ghst migrate export --output ./backup.zip
ghst api /settings/ --method GET --query limit=1
```

## Commands Included Through Phase 3

- `ghst auth login|logout|status|switch|list|link|token`
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
- `ghst api` (`--method|-X`, `--body`, `--input`, `--query`, `--content-api`)
- `ghst completion <bash|zsh|fish|powershell>`

## Phase 3 Resource Notes

- `ghst member get [id] --email <email>` supports id or email lookup.
- `ghst member delete <id> --cancel --yes` supports Stripe cancellation passthrough and non-interactive deletion.
- `ghst member import <filePath> --labels a,b` uploads CSV via multipart field `membersfile`.
- `ghst member export --output ./members.csv` writes CSV; omit `--output` to print CSV to stdout.
- `ghst member bulk --action <unsubscribe|add-label|remove-label|delete> --all|--filter <nql> [--label-id <id>]`.
- `ghst member bulk` requires exactly one of `--all` or `--filter`.
- `ghst label get [id] --slug <slug>` and `ghst label update [id] --slug <slug> --name <name>` support slug-based lookup.
- `ghst newsletter create|update --sender-email null` and `ghst offer create|update --currency null` explicitly clear nullable fields.
- `ghst tier get|update` normalizes known Ghost tier not-found-like 500 responses to not-found CLI semantics.
- `ghst setting set` uses `PUT /settings` and returns explicit permission guidance when integration tokens are blocked.
- `ghst migrate csv` enforces strict canonical CSV headers:
  `title` + exactly one of `html` or `markdown`; optional
  `slug,status,published_at,tags,authors,excerpt,feature_image`.
- `ghst migrate substack` requires an explicit source URL via `--url` and uses `--target-url` for destination Ghost URL overrides.
- `ghst migrate wordpress|medium|substack` uses Ghost-maintained migration packages and uploads generated Ghost import JSON through `POST /db`.
