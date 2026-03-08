# Ghost API Fixtures

These fixtures are static, hand-curated Ghost Admin API samples used by fixture-backed tests.

## Check Fixtures

```bash
nvm use
pnpm fixtures:ghost:check
```

This command will:

1. Parse every committed fixture JSON file.
2. Verify the file set matches the typed fixture manifest.
3. Verify fixture payloads satisfy the mock-router contract.
4. Fail if any fixture contains secret-like values.

## Optional Local Snapshot

```bash
pnpm fixtures:ghost:capture --url http://localhost:2368 --staff-token <id:secret>
```

This writes a lightweight read-only Ghost Admin snapshot to a temp directory for manual inspection. It is not part of the normal fixture workflow, it never rewrites committed fixtures, and it refuses non-local hosts.

## Notes

- Fixtures are split by route/scenario under this directory so updates stay isolated.
- Fixture-backed tests and `pnpm fixtures:ghost:check` are fully offline.
- The optional capture command is only a lightweight local snapshot helper, not an authoritative contract verifier.
- `tests/fixtures-secrets.test.ts` and `scripts/check-ghost-fixtures.ts` both enforce that committed fixtures do not contain secret-like values.
