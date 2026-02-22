# Snippet Contract Tracker

## Status

- Deferred blocker (not implemented) as of February 21, 2026.
- Scope affected:
  - CLI top-level `snippet` command
  - MCP tool `ghost_snippet_list`

## Blocker

The Ghost Admin API contract for snippets is not yet confirmed in a stable, documented form that this CLI can safely target.

## Contract Prerequisites

The blocker is considered resolved only when all items below are available:

1. A canonical endpoint contract for snippet list/get/create/update/delete (or explicit read-only scope).
2. Confirmed request and response schema, including pagination and filter semantics.
3. Authentication and permission behavior documented for integration tokens.
4. Error code and validation behavior documented for invalid payloads and missing resources.

## Implementation Exit Criteria

All criteria must be met before closing the defer:

1. `ghst snippet` command family is registered and covered by command help/tests.
2. Zod schemas are added for snippet command inputs.
3. `src/lib` snippet service layer maps API and validation failures to `ExitCode`.
4. Fixture-backed tests cover snippet API success and failure paths.
5. MCP `ghost_snippet_list` is registered and tested (plus any additional snippet tools if included in the confirmed PRD contract).
6. README and AGENTS command/tool lists are updated to include snippet parity.
7. `tests/prd-parity.test.ts` deferred exception for `snippet` is removed.

## Verification Checklist

Run the full project gates after implementation:

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm fixtures:ghost:check
```
