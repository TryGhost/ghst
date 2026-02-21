# Ghost API Fixtures

These fixtures are captured from a real authenticated Ghost Admin API instance.

## Update Fixtures

```bash
nvm use
pnpm fixtures:ghost:update
```

This command will:

1. Resolve the active Ghost connection using normal CLI precedence.
2. Create temporary post/page/tag resources.
3. Capture representative browse/read/create/update responses.
4. Capture representative `ghst api` admin responses (`/site/` and `/settings/`).
5. Capture representative error responses (`409`, `404`, and `422` when returned).
6. Sanitize volatile fields and write `fixtures.json`.
7. Delete temporary resources.

## Check Fixtures In CI

```bash
pnpm fixtures:ghost:check
```

This regenerates fixtures in-memory and compares with the committed file. It exits non-zero when drift is detected.

## Notes

- Fixture generation performs real writes and deletes in the configured Ghost site.
- Use a development/staging site for fixture refreshes.
