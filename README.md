# ghst cli

`ghst` is a CLI tool for managing Ghost instances from the terminal. Anything you can do with the Ghost Admin API, you can do with `ghst`. (And a bit more)

- CRUD for Ghost resources
- Full Admin API support
- JSON-first scripting support (`--json`, `--jq`)
- Built-in MCP server mode for editor/agent integration
- Utility functions for development

> [!IMPORTANT]
> This tool is pre-1.0 and not yet stable. Use with caution, and back up critical data.

## Contents

- [Install](#install)
- [Quick Start](#quick-start)
- [Authentication and Site Selection](#authentication-and-site-selection)
- [Command Reference](#command-reference)
- [Global Options](#global-options)
- [Common Workflows](#common-workflows)
- [Configuration and Environment Variables](#configuration-and-environment-variables)
- [Output, Automation, and Exit Codes](#output-automation-and-exit-codes)
- [MCP Server Mode](#mcp-server-mode)
- [Troubleshooting](#troubleshooting)
- [Development](#development)
- [License & trademark](#license--trademark)

## Install

Install globally with npm:

```bash
npm install -g @tryghost/ghst
```

or run instantly without global install:

```bash
npx @tryghost/ghst
```

Other package managers:

```bash
pnpm add -g @tryghost/ghst
```

```bash
yarn global add @tryghost/ghst
```

## Quick Start

1. Authenticate:

```bash
ghst auth login
```

2. Verify active auth:

```bash
ghst auth status
```

3. Fetch content:

```bash
ghst post list --limit 5
```

4. Create content:

```bash
ghst post create --title "Launch" --markdown-file ./launch.md
```

5. Get help:

```bash
ghst --help
ghst <resource> --help
ghst <resource> <action> --help
```

## Authentication and Site Selection

Interactive auth flow:

1. Run `ghst auth login`.
2. Open Ghost Admin when prompted.
3. Create or copy a staff access token from your user profile.
4. Paste `Ghost API URL` and `Ghost Staff Access Token`.

Non-interactive auth for CI/scripts:

```bash
ghst auth login \
  --non-interactive \
  --url https://myblog.ghost.io \
  --staff-token "{id}:{secret}" \
  --json
```

Site/profile management:

```bash
ghst auth list
ghst auth switch <site-alias>
ghst auth link --site <site-alias>
ghst auth token
```

`ghst auth token` prints a short-lived staff JWT. Treat the output as sensitive.

## Command Reference

| Resource | Actions |
| --- | --- |
| `auth` | `login`, `status`, `list`, `switch`, `logout`, `link`, `token` |
| `post` | `list`, `get`, `create`, `update`, `delete`, `publish`, `schedule`, `unschedule`, `copy`, `bulk` |
| `page` | `list`, `get`, `create`, `update`, `delete`, `copy`, `bulk` |
| `tag` | `list`, `get`, `create`, `update`, `delete`, `bulk` |
| `member` | `list`, `get`, `create`, `update`, `delete`, `import`, `export`, `bulk` |
| `newsletter` | `list`, `get`, `create`, `update`, `bulk` |
| `tier` | `list`, `get`, `create`, `update`, `bulk` |
| `offer` | `list`, `get`, `create`, `update`, `bulk` |
| `label` | `list`, `get`, `create`, `update`, `delete`, `bulk` |
| `webhook` | `create`, `update`, `delete`, `events`, `listen` |
| `user` | `list`, `get`, `me` |
| `image` | `upload` |
| `theme` | `list`, `upload`, `activate`, `validate`, `dev` |
| `site` | `info` |
| `stats` | `overview`, `web [content\|sources\|locations\|devices\|utm-sources\|utm-mediums\|utm-campaigns\|utm-contents\|utm-terms]`, `growth`, `posts`, `email [clicks\|subscribers]`, `post <id> [web\|growth\|newsletter\|referrers]` |
| `setting` | `list`, `get`, `set` |
| `migrate` | `wordpress`, `medium`, `substack`, `csv`, `json`, `export` |
| `config` | `show`, `path`, `list`, `get`, `set` |
| `api` | raw Ghost request command (`ghst api [endpointPath]`) |
| `mcp` | `stdio`, `http` |
| `completion` | `<bash|zsh|fish|powershell>` |

## Global Options

| Flag | Purpose |
| --- | --- |
| `--json` | Emit JSON output for automation |
| `--jq <filter>` | Apply jq-style extraction to JSON output |
| `--site <alias>` | Use configured site alias |
| `--url <url>` + `--staff-token <token>` | Use direct credentials for this invocation |
| `--debug [level]` | Enable debug output |
| `--no-color` | Disable color output |

## Common Workflows

Create and publish:

```bash
ghst post create --title "Launch" --markdown-file ./launch.md --newsletter weekly --email-segment all
ghst post publish <post-id>
```

Bulk updates:

```bash
ghst post bulk --filter "status:draft" --update --add-tag release-notes --authors editor@example.com
ghst member bulk --update --filter "status:free" --labels "trial,needs-follow-up"
ghst label bulk --filter "name:'legacy'" --action delete --yes
```

Scheduling:

```bash
ghst post schedule <post-id> --at 2026-03-01T10:00:00Z
ghst post unschedule <post-id>
```

Theme development:

```bash
ghst theme validate ./theme-dir
ghst theme dev ./theme-dir --watch --activate
```

Webhook relay for local development:

```bash
ghst webhook listen \
  --public-url https://hooks.example.com/ghost \
  --forward-to http://localhost:3000/webhooks
```

Direct API calls:

```bash
ghst api /posts/ --paginate --include-headers
ghst api /settings/ -X PUT -f settings[0].key=title -f settings[0].value="New title"
```

Analytics reporting:

```bash
ghst stats overview
ghst stats web
ghst stats web sources --range 90d --csv
ghst stats growth
ghst stats posts --range 30d --csv
ghst stats email subscribers --csv
ghst stats post <post-id> referrers --csv --output ./referrers.csv
```

Ghost analytics filter semantics:
- `source` and `utm_*` filters are session-scoped.
- post and member-status filters are hit-scoped.

Ghost range semantics:
- `stats growth` clips member, MRR, and subscription histories client-side when Ghost only exposes broader source data.
- `stats post ... growth` clips Ghost's lifetime post-growth history to the selected window.

`endpointPath` must stay within the selected Ghost API root. Use resource paths such as `/posts/`
or canonical Ghost API paths such as `/ghost/api/admin/posts/`.

## Configuration and Environment Variables

Connection resolution order:

1. `--site`
2. `--url` + `--staff-token`
3. `GHOST_URL` + `GHOST_STAFF_ACCESS_TOKEN`
4. project link file `.ghst/config.json`
5. active site in user config

Primary config/state files:

| Path | Purpose |
| --- | --- |
| `~/.config/ghst/config.json` | User config (saved sites, active site) |
| `.ghst/config.json` | Project-level linked site |
| `.env.example` | Example environment configuration |

Environment variables:

| Variable | Purpose |
| --- | --- |
| `GHOST_URL` | Ghost site URL override |
| `GHOST_STAFF_ACCESS_TOKEN` | Ghost staff access token (`{id}:{secret}`) |
| `GHOST_API_VERSION` | Admin API version override (default `v6.0`) |
| `GHOST_SITE` | Site alias fallback lookup in user config |
| `GHOST_CONTENT_API_KEY` | Required when using `ghst api --content-api` |
| `GHST_CONFIG_DIR` | Override user config directory path |
| `GHST_OUTPUT` | Force JSON output when set to `json` |
| `GHST_FORCE_TTY` | Force TTY behavior for non-interactive environments |
| `GHST_NO_COLOR` / `NO_COLOR` | Disable colorized output |

## Output, Automation, and Exit Codes

JSON + jq-style extraction:

```bash
ghst post list --json
ghst post list --json --jq '.posts[].title'
```

Common machine-safe practices:

- Use `--json` for scripts.
- Use `--non-interactive` for CI where prompts are invalid.
- Pass explicit auth (`--url` and `--staff-token`) or set env vars.

Exit code mapping:

| Code | Meaning |
| --- | --- |
| `0` | Success |
| `1` | General error |
| `2` | Usage/argument error |
| `3` | Authentication/authorization error |
| `4` | Operation cancelled |
| `5` | Not found |
| `6` | Conflict |
| `7` | Validation error |
| `8` | Rate limited |

## MCP Server Mode

Run MCP over stdio or HTTP:

```bash
ghst mcp stdio --tools all
ghst mcp http --host 127.0.0.1 --port 3100 --tools posts,tags,site --auth-token token-123
```

Notes:

- `ghst mcp http` binds to loopback by default. Binding to a non-loopback host requires `--unsafe-public-bind`.
- `--cors-origin` accepts a single exact origin only, for example `https://app.example.com`.

Supported tool groups:

- `posts`
- `pages`
- `tags`
- `members`
- `site`
- `settings`
- `users`
- `api`
- `search`

## Safe Operation

- Keep `ghst mcp http` on loopback unless you explicitly intend to expose Ghost admin automation.
- Treat `ghst api` and MCP `ghost_api_request` as privileged admin access.
- Avoid sharing terminal output that contains `ghst auth token` output or values revealed with `config --show-secrets`.

## Troubleshooting

`No site configuration found`:

- Run `ghst auth login`, or
- Provide `--url` and `--staff-token`, or
- Set `GHOST_URL` and `GHOST_STAFF_ACCESS_TOKEN`.

`GHOST_CONTENT_API_KEY is required for --content-api requests`:

- Export `GHOST_CONTENT_API_KEY` before `ghst api --content-api`.

`Use --non-interactive when combining auth login with --json`:

- Re-run auth with `--non-interactive` and explicit credentials.

Commands and flags drift:

- Re-check current command docs with `ghst <resource> --help`.

## Development

For cloning, testing, and developing the repository from source, see [CONTRIBUTING.md](CONTRIBUTING.md).

## License & trademark

Copyright (c) 2013-2026 Ghost Foundation - Released under the [MIT license](LICENSE).
Ghost and the Ghost Logo are trademarks of Ghost Foundation Ltd. Please see our [trademark policy](https://ghost.org/trademark/) for info on acceptable usage.
