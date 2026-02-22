# Contributing to ghst

This guide is the complete contributor workflow for cloning, installing, running, testing, and developing the project.

## Contents

- [Before You Start](#before-you-start)
- [Development TL;DR](#development-tldr)
- [Environment Requirements](#environment-requirements)
- [Install Dependencies](#install-dependencies)
- [Run the CLI Locally](#run-the-cli-locally)
- [Authentication for Local Development](#authentication-for-local-development)
- [Project Layout](#project-layout)
- [Development Workflow](#development-workflow)
- [Tests and Validation](#tests-and-validation)
- [Ghost Fixture Workflow](#ghost-fixture-workflow)
- [Coding Guidelines](#coding-guidelines)
- [Documentation Updates](#documentation-updates)
- [Submitting a Pull Request](#submitting-a-pull-request)
- [Getting Help](#getting-help)
- [Contributor License Agreement](#contributor-license-agreement)

## Before You Start

- For small fixes (typos, docs, focused bug fixes), open a PR directly.
- For non-trivial features or CLI behavior changes, open or discuss an issue first.
- Keep changes scoped to a single concern per PR.

## Development TL;DR

```bash
nvm use
corepack enable
pnpm install
pnpm dev --help
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

## Environment Requirements

- Node.js `24.x` (required by `.nvmrc` and `package.json` engines)
- `corepack` enabled
- `pnpm@10.28.1`
- A Ghost development or staging site - don’t run a local development build of `ghst` against a production Ghost instance with data you care about

## Install Dependencies

```bash
nvm use
corepack enable
pnpm install
```

If this is your first time in the repo, verify local tooling:

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

## Run the CLI Locally

Run directly from TypeScript source:

```bash
pnpm dev --help
pnpm dev auth status
pnpm dev post list
```

Run built output:

```bash
pnpm build
node dist/index.js --help
```

Optional global link:

```bash
pnpm link --global
ghst --help
```

## Authentication for Local Development

Interactive:

```bash
pnpm dev auth login
```

Non-interactive:

```bash
pnpm dev auth login \
  --non-interactive \
  --url https://your-site.ghost.io \
  --key "{id}:{secret}" \
  --json
```

Config and site linkage:

- User config: `~/.config/ghst/config.json`
- Project config: `.ghst/config.json`
- Example env: `.env.example`

Connection resolution order:

1. `--site`
2. `--url` + `--key`
3. `GHOST_URL` + `GHOST_ADMIN_API_KEY`
4. `.ghst/config.json`
5. active site in user config

## Project Layout

- Entrypoint: `src/index.ts`
- Commands: `src/commands/*`
- Core libraries: `src/lib/*`
- Validation schemas: `src/schemas/*`
- MCP server/tools: `src/mcp/*`
- Tests: `tests/*`
- Ghost fixture scripts: `scripts/update-ghost-fixtures.ts`
- CI workflows: `.github/workflows/*`

## Development Workflow

1. Create a branch from updated `main`:

```bash
git switch -c <your-branch-name>
```

2. Make the smallest change that solves one problem.
3. Add or update tests with code changes.
4. Run full validation locally.
5. Push and open a PR.

## Tests and Validation

Run the same checks as CI:

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

Useful variants:

```bash
pnpm test:watch
pnpm lint:fix
pnpm format
pnpm format:check
```

CI reference:

- Workflow: `.github/workflows/ci.yml`
- Node: `24`
- Package manager: `pnpm@10.28.1`

## Ghost Fixture Workflow

When changing behavior that depends on Ghost Admin API fixture mocks:

1. Refresh fixtures:

```bash
pnpm fixtures:ghost:update
```

2. Verify fixture drift:

```bash
pnpm fixtures:ghost:check
```

Important notes:

- Fixture generation performs real writes/deletes on the configured Ghost site.
- Use a development or staging Ghost instance, not production.
- Fixture details are documented in `tests/fixtures/ghost-admin/README.md`.

## Coding Guidelines

- Keep command handlers thin; move behavior to `src/lib`.
- Validate command input with Zod before network calls.
- Map API/validation failures to `ExitCode` in `src/lib/errors.ts`.
- Preserve CLI contract shape: `ghst <resource> <action>`.
- Do not introduce breaking CLI/interface changes without updating docs and tests.
- Keep changes focused and avoid unrelated refactors in the same PR.

## Documentation Updates

- Update docs whenever command behavior, flags, output, or config behavior changes.
- At minimum, keep `README.md` and this file in sync with the code.
- If `snippet` contract status changes, update `docs/snippet-contract-tracker.md`.

## Submitting a Pull Request

1. Ensure your branch is current with `main`.
2. Ensure all local checks pass:

```bash
pnpm lint && pnpm typecheck && pnpm test && pnpm build
```

3. Push your branch and open a PR against `main`.
4. In your PR description, include what changed, why it changed, how you tested it, and any follow-up work.

PR expectations:

- Include tests for behavior changes.
- Keep PR scope aligned with the issue/intent.
- Respond to review feedback with follow-up commits.

## Getting Help

- Open an issue for bugs, regression reports, and feature requests.
- Include reproduction steps, expected behavior, actual behavior, and environment details.
- For implementation questions, include the command(s), flags, and sample output/error.

## Contributor License Agreement

By contributing your code to Ghost you grant the Ghost Foundation a non-exclusive, irrevocable, worldwide, royalty-free, sublicenseable, transferable license under all of Your relevant intellectual property rights (including copyright, patent, and any other rights), to use, copy, prepare derivative works of, distribute and publicly perform and display the Contributions on any licensing terms, including without limitation:
(a) open source licenses like the MIT license; and (b) binary, proprietary, or commercial licenses. Except for the licenses granted herein, You reserve all right, title, and interest in and to the Contribution.

You confirm that you are able to grant us these rights. You represent that You are legally entitled to grant the above license. If Your employer has rights to intellectual property that You create, You represent that You have received permission to make the Contributions on behalf of that employer, or that Your employer has waived such rights for the Contributions.

You represent that the Contributions are Your original works of authorship, and to Your knowledge, no other person claims, or has the right to claim, any right in any invention or patent related to the Contributions. You also represent that You are not legally obligated, whether by entering into an agreement or otherwise, in any way that conflicts with the terms of this license.

The Ghost Foundation acknowledges that, except as explicitly described in this Agreement, any Contribution which you provide is on an "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, EITHER EXPRESS OR IMPLIED, INCLUDING, WITHOUT LIMITATION, ANY WARRANTIES OR CONDITIONS OF TITLE, NON-INFRINGEMENT, MERCHANTABILITY, OR FITNESS FOR A PARTICULAR PURPOSE.
