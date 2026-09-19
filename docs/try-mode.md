# Temporary try mode (USE-11)

Local **try → cleanup** for seed catalog, local Skills, and already-managed Providers. A trial is a temporary ManagedBinding. Cleanup removes that binding (and any Registry MCP launch copy created for it) and **keeps an anonymous local outcome record**. Nothing is sent off-machine.

Remote public-catalog download/try is **Phase 3 ACQ-***. This path closes USE-11 for local Providers only.

## Commands

```bash
cap try git.repository.status --input '{"path":"."}' --json
cap cleanup git.repository.status --json
```

- `cap try <capability-id>` invokes the Provider through the same executors as `cap.use`, but marks the ManagedBinding as a trial. It does **not** write Agent MCP/Skill configs (not Direct Exposure, not a pin).
- `cap cleanup <capability-id>` drops the trial binding and, if this trial created them, the Registry `managed_*` rows and `mcp_bindings` launch copy. SKILL.md files and pre-existing Agent configs stay. Activity rows for the trial stay on disk.
- `cap add` during an open trial **promotes** it: cleanup then keeps the persistent binding and still retains the outcome.
- `cap use` without `try` stays a persistent implicit add (USE-10). Try is the opt-in temporary path.
- Default Agent MCP `tools/list` stays `cap.search` / `cap.add` / `cap.use`. No `cap.try` tool. Web: `POST /api/try` and `POST /api/cleanup`.

## Outcome record

Registry Activity stores a `try` row plus the underlying `use` row:

- `capability_id`, `provider_id`, `success`, `status`, `at`
- `anonymous: true`, `local: true`
- no input, paths, stdout, env, credentials, or user identity
- no remote telemetry

`cleanup` appends `{action: "cleanup", outcome_retained: true, local: true, anonymous: true}` and does not delete prior `try` / `use` rows. `cap activity` prints try/cleanup as `local-anonymous`.

## What cleanup removes

| Created by this trial | Removed |
|---|---|
| Registry ManagedBinding (`managed_capabilities` / `managed_providers`) | Yes, unless the Provider was already CAP-managed or promoted with `cap add` |
| Registry `mcp_bindings` launch copy | Yes, if this trial created it |
| Agent `mcpServers` / Skill identity / SKILL.md | No |
| Direct Exposure / pin | Never written by try; not rewritten on cleanup |

There is no public catalog asset cache yet, so “downloaded assets” means the temporary Registry binding, not a Phase 3 package payload.

## Remote catalog (not this phase)

If a Provider is marked remote (`source: public-catalog` / `remote` / `download_url`, or `options.remote`), `cap try` fails closed with a Phase 3 message. Do not implement ACQ-* download, integrity, or billing here.

See [architecture.md](./architecture.md), [mcp-gateway.md](./mcp-gateway.md), and PRD USE-11.
