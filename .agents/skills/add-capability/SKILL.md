---
name: add-capability
description: Add a Capability and Provider entry to the CAP seed catalog with bidirectional refs and tests.
---

# Add a Capability

## Steps

1. Open `data/catalog.json` and `data/catalog.schema.json`.
2. Append a Capability with stable `capability_id` (`domain.resource.action` style).
3. Include bilingual `intents` / `keywords` when the query language matters.
4. Set realistic `context_cost`, `risk`, and `permissions`.
5. Ensure every `provider_refs` id exists under `providers[]`.
6. Ensure each Provider lists the Capability in `capabilities[]`.
7. If the Provider is a local builtin, set `executable` and implement a branch in `src/use.js`.
8. Add a search ranking test and, for builtins, a use test under `test/`.

## Checks

```bash
npm run check
node ./bin/cap.js search "<one of the intents>" --json
```

Do not mark non-connected MCP providers as successfully executed from `use`.
