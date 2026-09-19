# CAP Product Requirements Document

Status: Grill-settled Phase 1 truth frame  
Date: 2026-09-19  
Audience: founder and implementers  
Derived surface: [README.md](../README.md) (do not treat the README as the requirements source of truth)

Domain terms: [CONTEXT.md](../CONTEXT.md).

## How to read this PRD

Panorama Phases 1–3 remain. **P0 and Launch gates bind Phase 1 only.**

Every journey and every requirement ID carries **Phase** plus **Target / Now / Gap**.

| Label | Meaning |
|---|---|
| **Phase** | When the requirement belongs. Launch is Phase 1. |
| **Pri** | `P0` = Phase 1 launch gate. `P1` = Phase 1 follow-on, not a launch gate. `—` = later phase, not a launch gate. |
| **Target** | The intended product behavior for that Phase. |
| **Now** | What is already true. |
| **Gap** | What still separates Now from Target. Empty or “—” means Now meets Target. |

Former P0 rows that left the Phase 1 boundary keep their IDs so history stays traceable; their Pri is `—`.

### Phase 1 P0 boundary

**In**

- Agent-first install and first health report
- Local inventory and Context Health
- High-cost and duplicate recommendations
- JSON MCP optimize plus timestamped `.cap-backup` only
- Transparent local use: search / add / use, local Skills overlay, implicit add-on-use
- Seed-catalog local-style Unlock
- `cap inject` plan-only, as delivered

**Out**

- Remote public catalog
- Semantic or vector retrieval
- Full one-click Restore UI/CLI across all adapters
- Anonymous remote product telemetry
- Enterprise, Desktop, or team administration

## 1. Product definition

CAP is a local capability and context control layer for coding Agents. It lets developers freely discover and try MCP servers and Skills without permanently paying their context cost, safely reduces existing exposure, and acquires reviewed capabilities on demand.

> Install more capabilities while exposing less context, without changing how the user asks the Agent to work.

CAP has three connected jobs:

1. **Observe**: scan supported Agent configurations and visualize Context Health.
2. **Optimize**: recommend and, after confirmation, apply reversible consolidation into CAP.
3. **Explore and unlock**: search by intent, compare candidates from existing metadata, choose when needed, and use a Provider without making it permanently resident.

## 2. Interview findings

### Triggering problem

- Developers repeatedly discover attractive MCP servers and Skills on social media and want to install each one to experiment.
- Traditional installation commonly makes definitions permanently visible to the Agent, so every experiment adds an ongoing context cost even when rarely used.
- The cost compounds as the collection grows; users are forced to choose between experimentation and a clean context window.
- A company DingTalk MCP exposes a large tool surface and occupies substantial resident context.
- Developers may have close to one hundred Skills, including overlapping alternatives.
- Even resident Skill names and descriptions add up and make Agent selection less reliable.
- Users understand basic MCP/Skill configuration but do not want to audit it continuously.

### Settled Phase 1 decisions

- Primary users are company developers using Codex, Claude Code, or Cursor.
- The primary first-use surface is the user's current Agent conversation; terminal-first setup is secondary.
- README publishes one designated Agent Installation Directive. Pasting that complete directive is scoped authorization for CAP installation, registration of the minimal CAP surface, and initial read-only inspection. CAP does not ask again. Host Agent execution approvals still apply.
- General quoted articles or installation guides that do not contain this designated directive are not authorization.
- The optimized experience must remain natural-language and transparent.
- Acquisition ≠ Direct Exposure ≠ CAP-managed ≠ Invoked. Implicit `cap.use` register is Acquisition plus ManagedBinding. It is not Direct Exposure. Pinning or resident configuration is Direct Exposure.
- Compare is satisfied by existing Provider metadata. There is no separate pros/cons authoring engine.
- Initial advice uses context cost and duplication, never unobserved frequency.
- Frequency advice begins only after an Observation Period.
- CAP may edit configuration only after explicit confirmation (`optimize --apply --yes`).
- Phase 1 Restore is the JSON MCP optimize backup path plus documented recovery from `.cap-backup`. It is not full cross-agent one-click Restore.
- `cap inject` is plan-only in Phase 1. Automatic mutate or evict is later.
- Local Registry Activity is the Phase 1 activity record. Anonymous remote product telemetry is not a Phase 1 gate.
- macOS, Windows, and Linux are supported across Codex, Claude Code, and Cursor.
- Reads within the Agent's already-authorized project workspace need no extra CAP prompt.

### Later-phase Target (not Phase 1 gates)

- A public, administrator-curated, anonymous catalog with no account requirement.
- Remote search that sends only a locally simplified Capability Intent.
- Eligible remote candidates ranked by task relevance and popularity.
- Verified static assets may download automatically; scripts and new permissions require confirmation.
- Anonymous product telemetry within the privacy limits in §11.
- Full one-click Restore across shipped adapters, with conflict-aware preview.

## 3. Problem statement

Developers discover many MCP servers and Skills through social media and naturally want to install and try them. Today, Acquisition is coupled to Direct Exposure: each experiment can add schemas or Skill identities to every subsequent Agent session. As the collection grows, usable context shrinks and overlapping choices reduce selection quality. Removing capabilities regains context but loses convenient access; finding a capability later requires manual discovery, comparison, trust evaluation, installation, and configuration.

Existing plugin managers optimize installation. CAP separates **Acquisition** from **Direct Exposure**, maximizing accessible capability coverage per unit of context.

## 4. Goals and non-goals

### Phase 1 goals

- Complete installation and the first Context Health report inside the user's current Agent conversation.
- Produce an understandable health report immediately after installation.
- Estimate context reduction before mutation.
- Consolidate selected JSON MCP Providers behind a small CAP surface, with timestamped `.cap-backup`.
- Let users collect and try many Providers without making them resident by default.
- Support intent/keyword discovery over the seed catalog and local Skills.
- Present existing metadata so the user can compare candidates.
- Preserve natural-language task execution after consolidation.
- Observe real use locally before labeling Providers low-frequency.
- Document recovery from `.cap-backup` for the JSON optimize path.
- Protect company code and local configuration.

### Later-phase goals (not launch gates)

- Fuzzy semantic discovery across a public catalog.
- Discover and acquire administrator-reviewed public Providers without login.
- Restore all modified MCP and Skill configuration through a one-click flow.
- Measure adoption, estimated savings, and remote Capability Unlocks with anonymous telemetry.

### Non-goals for Phase 1

- Exact live-session token measurement.
- Remote public catalog, semantic/vector retrieval, or remote Unlock.
- Full one-click Restore UI/CLI across all adapters.
- Anonymous remote product telemetry as a launch gate.
- Enterprise private catalogs or open self-service publishing.
- Accounts, billing, team administration, Desktop, or cross-device sync.
- Uploading source code, raw tasks, local configuration, credentials, or inventory.
- Treating general quoted article text as authorization, or installing beyond the scope explicitly granted by the designated directive.
- Replacing Agent permission systems.
- Auto-applying Dynamic Injection or evicting Providers.

## 5. Personas

**Company developer**: uses Codex, Claude Code, or Cursor; understands basic configuration; must use company MCPs; has many overlapping Skills; wants task success without manual context management.

**CAP catalog administrator** (Phase 3): reviews Provider metadata and artifacts, maintains compatibility and trust status, and revokes unsafe or abandoned versions without receiving user source code or inventory.

## 6. Product principles

1. Local first: inventory, analysis, intent simplification, and mutation happen locally.
2. Preview before mutation; consent before change. For onboarding, pasting the designated directive is consent for its disclosed scope.
3. Agent first: installation, report delivery, discovery, and use should complete in the conversation the user already occupies.
4. General quoted content is not consent; the README's designated directive is itself an explicit, narrowly scoped execution request.
5. Phase 1 reversibility is a launch gate only for the JSON MCP optimize path: timestamped `.cap-backup` plus documented recovery. Full cross-agent Restore is later.
6. Users express tasks, not CAP commands or Capability IDs.
7. Acquisition is not Direct Exposure: owning more Providers must not automatically increase resident context.
8. Discovery returns lightweight metadata, not every downstream schema.
9. Comparison uses existing metadata. A unique high-confidence local hit may skip “choose before acquire”; multiple viable candidates still require a choice.
10. Popularity ranks only Providers that already pass the quality gate (Phase 3 remote catalog).
11. Estimates are always labeled as estimates.

## 7. Core journeys

### Agent-first install and report

**Phase 1 · P0 launch journey**

| | |
|---|---|
| **Target** | Paste the complete README Agent Installation Directive. That paste is scoped install authorization: official install, minimal CAP surface, read-only inspect. Same conversation returns the first health report. Optimization is recommended when pressure or reclaimable context warrants it, never applied under onboarding consent. Restore language is backup plus documented recovery, not one-click Restore. |
| **Now** | The README already publishes the directive with that scope. `cap setup --agent auto` installs the surface and inspects. `cap inspect` / `--json` is the first-report source. Agent copy for optional `cap web` URL, partial-scan warnings, 10% material-savings, and scoped `.cap-backup` recovery is in [agent-onboarding.md](./agent-onboarding.md). |
| **Gap** | — for documented first-report copy. Not auto full Restore. |

1. The user copies the complete Agent Installation Directive from README into Codex, Claude Code, or Cursor.
2. The directive states that it is an execution request, identifies the official install command, limits the scope to CAP installation / minimal surface / inspection, and forbids optimization apply or third-party MCP execution.
3. Pasting the directive authorizes the Agent to begin immediately; CAP does not add a second confirmation dialog. The host Agent may still require its normal command approval.
4. The Agent verifies the Node.js prerequisite, installs CAP from the official package, registers the minimal CAP surface, and runs read-only `inspect` without starting third-party MCPs.
5. The same conversation displays the health summary, highest-cost items, estimated recoverable context, and any scan warnings.
6. A local detailed-report URL may be offered when the visual page is running; it is not a substitute for the conversation summary.
7. If pressure is severe or recoverable context is material, the Agent explicitly recommends CAP optimization, quantifies expected savings, and explains that confirmed JSON changes create a timestamped `.cap-backup` and can be recovered from that backup.
8. The recommendation offers a read-only Optimization Plan preview; it never applies that plan during first inspection.
9. The first report uses cost and duplication, not frequency, and does not migrate existing Providers.
10. Any later optimization plan receives its own preview and confirmation.

If the Agent cannot execute local commands, it provides one copyable official install command, then resumes the same flow after the user runs it. Terminal-first installation remains supported but is not the primary journey.

### Optimize

**Phase 1 · P0 launch journey**

| | |
|---|---|
| **Target** | Identify high-context and duplicate Providers. Preview. Require explicit confirmation. Apply JSON MCP consolidation only. Write a timestamped `.cap-backup`. Document how to recover from that file. |
| **Now** | `cap optimize` previews; `cap optimize --apply --yes` mutates supported JSON MCP and dotted-table Codex TOML, keeps `cap-mcp`, indexes local Skills, writes `*.cap-backup`, and validates after write. Unsafe TOML / JSON `mcp.servers` are refused. |
| **Gap** | Remaining layouts, per-item selectivity, and a dedicated one-click Restore command/UI. Those are not Phase 1 P0. |

1. CAP identifies high-context and duplicate Providers.
2. It previews current and proposed footprint, savings, affected files, risks, and retained entries.
3. User selects items and explicitly confirms (`--apply --yes`).
4. CAP writes a timestamped `.cap-backup` for each mutated JSON file, applies the supported change, and reruns inspection.

### Transparent use

**Phase 1 · P0 launch journey**

| | |
|---|---|
| **Target** | Natural-language search over seed catalog and local Skills. Lightweight candidates. Add or implicit add-on-use registers a ManagedBinding without Direct Exposure. Use loads Skill body or mapped MCP input on demand. |
| **Now** | `cap.search` / `cap.add` / `cap.use`, local Skills overlay, implicit add on first `use`, mapped MCP gateway, honest `connection_required`. |
| **Gap** | — for the local path. Semantic/vector retrieval and remote catalog are Phase 3. |

1. User asks for an outcome in natural language.
2. Agent searches local CAP-managed and seed/local-skill capabilities through the resident CAP surface.
3. CAP returns a small lightweight candidate set from existing metadata.
4. A unique high-confidence local hit may be acquired and used without a choice step. Multiple viable candidates still require a choice.
5. Agent invokes the Provider; implicit `cap.use` register is Acquisition plus ManagedBinding, not Direct Exposure.
6. CAP loads the Skill body or mapped MCP input only on demand.

### Local Unlock (seed catalog and local Skills)

**Phase 1 · P0 launch journey**

| | |
|---|---|
| **Target** | When the user describes an outcome, CAP finds a relevant seed or local-skill Provider that was not already in their working set, presents metadata, and makes it usable without Direct Exposure. |
| **Now** | Keyword/intent ranking over `data/catalog.json` plus local `SKILL.md`. Misses are honest. |
| **Gap** | No result when seed and local Skills lack a match. That is not an install failure. Remote Unlock is Phase 3. |

1. The user describes an outcome in ordinary language, for example “我想生成一份 PPT”.
2. CAP searches the seed catalog and local Skills.
3. Each candidate is compared from existing metadata: match reason, permissions, trust, maintenance, compatibility, estimated context behavior, setup effort.
4. After use, the Provider remains acquired and CAP-managed but non-resident unless the user explicitly pins it.

### Dynamic Injection (plan-only)

**Phase 1 · P0 launch journey**

| | |
|---|---|
| **Target** | Given a task, return a load / defer / keepResident plan. Do not mutate Agent configs. |
| **Now** | `cap inject` (`mutates: false`). Default MCP surface stays search / add / use. |
| **Gap** | Auto mutate or evict is a later meaning of Dynamic Injection. |

### Remote Capability Unlock

**Phase 3 · not a launch gate**

| | |
|---|---|
| **Target** | Local search has no adequate match. CAP reduces the task to a Capability Intent. A public catalog returns a bounded eligible set. Safe static assets verify; scripts and new permissions pause. |
| **Now** | Seed catalog only. No remote public catalog. |
| **Gap** | Entire remote Unlock path: catalog service, ranking, acquisition gates, revocation. |

### Restore

**Phase 1 (scoped) and later (full)**

| | |
|---|---|
| **Phase 1 Target** | Every JSON MCP optimize mutation writes a timestamped `.cap-backup`. Recovery from that file is documented. Marketing and launch language do not claim one-click Restore. |
| **Phase 1 Now** | `*.cap-backup` is written before supported JSON mutation. Recovery steps are [restore-from-backup.md](./restore-from-backup.md). README/Agent copy refuse one-click Restore. |
| **Phase 1 Gap** | — for documented JSON recovery. Not a Restore CLI/UI. |
| **Later Target** | Preview a Restore Point, confirm, restore atomically when safe, preserve both versions on conflict, expose restore through CLI, Agent, and local UI, across shipped adapters. |

## 8. Functional requirements

`P0` is a Phase 1 launch gate only. Later-phase rows keep IDs and show Target / Now / Gap; they are not launch gates.

### Agent-first onboarding

| ID | Phase | Pri | Target | Now | Gap |
|---|:---:|:---:|---|---|---|
| ONB-01 | 1 | P0 | Agent conversation is the primary documented installation and first-report path. | README leads with the Agent Installation Directive. | — |
| ONB-02 | 1 | P0 | Publish one copyable README directive whose wording is an explicit execution request with a narrowly disclosed scope. | Directive exists in README. | — |
| ONB-03 | 1 | P0 | The directive identifies the official command, prerequisite, CAP surface change, read-only inspection, prohibited optimize-apply, and third-party MCP prohibition. | README directive includes those limits. | — |
| ONB-04 | 1 | P0 | Treat pasting the complete directive as scoped onboarding authorization; do not add a redundant CAP confirmation; preserve host Agent approvals. | README states this. | — |
| ONB-05 | 1 | P0 | Onboarding consent does not include migration of existing MCPs/Skills; optimization requires a separate plan and confirmation. | Directive forbids `optimize --apply --yes`. | — |
| ONB-06 | 1 | P0 | Return the first health summary in the originating conversation. A local detailed-report URL is optional when the visual page is available. | Inspect JSON can be summarized in-conversation. README + inspect next-step may point at `cap web` → `http://127.0.0.1:4173` without requiring the server. | — |
| ONB-07 | 1 | P0 | If installation succeeds but one scan source fails, return a partial report with a scoped warning. | Inspect continues across sources and surfaces warnings. Agent wording is in [agent-onboarding.md](./agent-onboarding.md). | — |
| ONB-08 | 1 | P0 | If the Agent cannot execute locally, provide one official copyable command and continue after install is detected. | README documents the official command. | — |
| ONB-09 | 1 | P1 | Detect an existing compatible CAP install and upgrade/reuse it. | Setup updates marked launchers. | Dedup of duplicate surfaces. |
| ONB-10 | 1 | P1 | Track time from explicit install request to first rendered health report. | Not shipped. | Local timing only if useful; not remote TEL. |
| ONB-11 | 1 | P0 | When Context Pressure is `high`, `critical`, or `emergency`, explicitly recommend previewing CAP optimization. | README directive requires this. Inspect exposes pressure. | — |
| ONB-12 | 1 | P0 | Also recommend optimization when reclaimable context crosses a material-savings threshold. | Threshold is **10% of effective budget** ([ADR 0001](./adr/0001-material-savings-threshold.md)). Inspect exposes `reclaimableTokens` and `effectiveBudget`. | — |
| ONB-13 | 1 | P0 | State why the recommendation triggered, current/projected footprint, estimated savings, affected classes, confirmation requirement, and that a `.cap-backup` will be written. Do not claim one-click Restore. | README + [agent-onboarding.md](./agent-onboarding.md) template: backup file + documented copy-back. | — |
| ONB-14 | 1 | P0 | First inspection may offer a read-only optimization preview but must not apply it under onboarding authorization. | Directive and optimize default are preview-only. | — |

### Inventory and reporting

| ID | Phase | Pri | Target | Now | Gap |
|---|:---:|:---:|---|---|---|
| INV-01 | 1 | P0 | Detect Codex, Claude Code, and Cursor on macOS, Windows, and Linux. | Scanners exist. Published matrix: [compatibility.md](./compatibility.md) (tested / expected / unknown per path). | — for the path matrix. OS/Agent **version** floors remain open. |
| INV-02 | 1 | P0 | Discover supported user, project, shared, and plugin MCP/Skill definitions. | Inspect walks those locations. | — |
| INV-03 | 1 | P0 | Never connect to or execute third-party MCPs during inspection. | Inspect is read-only. | — |
| INV-04 | 1 | P0 | Estimate MCP schema/description cost and resident Skill identity cost separately. | Cost segments exist; Skill identity is name+description. | — |
| INV-05 | 1 | P0 | Mark values as estimated and publish the method. | Estimates are labeled; method is documented. | — |
| INV-06 | 1 | P0 | Identify duplicate definitions and probable overlapping Skills. | Duplicate paths/names are flagged. | Semantic overlap method is open. |
| INV-07 | 1 | P0 | Distinguish installed, configured, Direct Exposure, CAP-managed, and Invoked. | Funnel and item `status` exist. Label map: [agent-onboarding.md](./agent-onboarding.md) and [context-health.md](./context-health.md). | — |
| INV-08 | 1 | P0 | Show effective budget, footprint, pressure, score, warnings, recoverable tokens, and projected after-state. | Inspect / Health report includes these. | — |
| INV-09 | 1 | P0 | Use one report model for CLI, Agent response, and local visual UI. | Shared inspect JSON; CLI/Web render it. | Agent prose is derived, not a second model. |
| INV-10 | 1 | P1 | Filter details by Agent, scope, source, type, status, cost, and reason. | Basic listing. | Richer filters. |

### Observation and recommendations

| ID | Phase | Pri | Target | Now | Gap |
|---|:---:|:---:|---|---|---|
| REC-01 | 1 | P0 | Initially recommend only high-context and duplicate capabilities. | Inspect recommendations start from cost/duplication. | — |
| REC-01 | 1 | P0 | Initially recommend only high-context and duplicate capabilities. | Inspect recommendations start from cost/duplication. | — |
| REC-02 | 1 | P0 | Record local CAP-mediated search, selection, invocation, outcome, and time in Registry Activity. | `cap search` / `cap.search` write a privacy-safe search event; add/use of a recent hit also writes `select`. Add/use still record invocation and outcome. | — |
| REC-03 | 1 | P0 | Never label low-frequency until the Observation Period is satisfied. | Ready only after **14 UTC days and 3 activity days** ([ADR 0003](./adr/0003-observation-period-readiness.md)). Until then `frequencyVerdicts` is `false`. `underused` is a value signal only; copy must not say remove. | — |
| REC-04 | 2 | P1 | Observation Period default is 14 days; validate before calling it final. | **Kept at 14 UTC days** plus a 3-activity-day evidence floor. 7 days is too short for weekly tools; 30 days delays advice without extra quality. | — |
| REC-05 | 2 | P1 | Explain cost, duplication, usage, and recency signals separately. | After readiness, `profiler.advice[]` lists those four signals and `prefer_on_demand`. Never unused→remove. | — |
| REC-06 | 2 | — | Let users pin a Provider resident or exclude it from recommendations. | `cap pin` / `unpin` / `exclude` / `include` plus Web Health. Pin is Direct Exposure; unpin restores CAP-managed. Default MCP tools stay search/add/use. Optimize apply skips pinned/excluded JSON and dotted-table TOML. | Pin write-back is JSON. |
| REC-07 | 1 | P0 | Never recommend the CAP surface itself for removal. | `cap-mcp` is excluded from Move → CAP. | — |
| REC-08 | 1 | P0 | Beside every optimize call to action, say what is backed up (timestamped `.cap-backup`), how to recover from that file, and that one-click Restore is not claimed. | README + [restore-from-backup.md](./restore-from-backup.md) + onboarding template. | — |

### Optimization and restore

| ID | Phase | Pri | Target | Now | Gap |
|---|:---:|:---:|---|---|---|
| OPT-01 | 1 | P0 | Produce a dry-run plan with affected files, before/after estimate, savings, retained entries, and reload needs. | `cap optimize` preview. | — |
| OPT-02 | 1 | P0 | Require explicit confirmation immediately before applying. | `--apply --yes`. | — |
| OPT-03 | 1 | P0 | Preserve Provider executables and Skill bodies; consolidation is not uninstall. | JSON MCP entries move behind CAP; Skills are indexed, not rewritten. | — |
| OPT-04 | 1 | P0 | Apply supported JSON MCP changes and validate afterward. | Guarded JSON apply + validate-after. Codex dotted-table apply is Phase 2 (OPT-06). | Remaining adapters. |
| OPT-05 | 1 | P0 | Refuse ambiguous/unsupported mutations and provide manual guidance. | Unsafe TOML and JSON `mcp.servers` are refused with guidance. | — |
| OPT-06 | 2 | — | Support selective migration and every shipped Agent/OS adapter. | JSON MCP + Codex `[mcp_servers.name]` apply (backup, confirm, validate). | JSON `mcp.servers`; Codex inline-table / `[mcp_servers]` / `[mcp.servers.*]`; per-item pick UX (REC-06). |
| RST-01 | 1 | P0 | Write a timestamped `.cap-backup` before every supported JSON optimize mutation. | `*.cap-backup` is created for JSON and Codex dotted-table apply. | — |
| RST-02 | 1 | P0 | Keep enough backup identity to recover the file (path and timestamp). | Timestamped sibling backup files. | Richer plan-ID metadata is later. |
| RST-03 | later | — | Preview and confirm restoration through a Restore command. | Not shipped. | Full Restore UI/CLI. |
| RST-04 | later | — | Restore exact original configuration when no later edit conflicts. | Manual copy from `.cap-backup`. | Automated exact restore. |
| RST-05 | later | — | Detect conflicts, preserve both versions, and never overwrite silently. | Not shipped. | Conflict-aware Restore. |
| RST-06 | later | — | Verify original definitions are discoverable after restore. | Re-inspect after manual recovery. | Automated verify. |
| RST-07 | later | — | Expose restore through CLI, Agent conversation, and local UI. | Documented backup recovery only. | One-click surfaces. |
| RST-08 | later | — | A migration adapter cannot ship a Restore claim until automated apply/restore tests pass. | JSON apply is tested; Restore command is not. | Adapter Restore tests. |
| RST-09 | 1 | P0 | Never describe an optimization as one-click restorable unless a full Restore Point flow exists. Phase 1 may say: backed up, recoverable from `.cap-backup`. | README, runbook, and Agent template refuse one-click Restore. | — |

### Discovery, catalog, and acquisition

| ID | Phase | Pri | Target | Now | Gap |
|---|:---:|:---:|---|---|---|
| USE-01 | 1 | P0 | Natural-language tasks require no CAP command or ID knowledge. | Search accepts ordinary task phrasing. | — |
| USE-02 | 1 | P0 | Search local seed catalog and local Skills. There is no remote catalog in Phase 1, so local is the only path. | Seed + `SKILL.md` overlay. | Remote comes in Phase 3 (CAT-*). |
| USE-03 | 3 | — | Fuzzy semantic / vector intent such as “生成一份 PPT” without requiring catalog keywords. | Keyword/intent ranking; some CJK needles match. | Semantic/vector retrieval. Not a Phase 1 P0. |
| USE-04 | 1 | P0 | On-demand Skills become usable in the active task (path/summary; body on request). | Local Skill overlay, add, use. | CAP does not execute Skill workflows. |
| USE-05 | 1 | P0 | MCP use exposes only the mapped tool input for the selected Capability. | Gateway + on-demand `input_schema`. | — |
| USE-06 | 1 | P0 | Report connection, authorization, install, and execution failures honestly. | `connection_required` / `failed`; no fake success. | — |
| USE-07 | 1 | P0 | Return lightweight summaries; never load candidate bodies or full schemas merely to compare them. | Search returns summaries and metadata. | — |
| USE-08 | 1 | P0 | Compare candidates using existing metadata fields (match reason, permissions, trust, maintenance, compatibility, estimated context, setup effort). No separate pros/cons authoring engine. | Catalog and search already expose those fields. | — |
| USE-09 | 1 | P0 | When multiple viable candidates exist, the user chooses before Acquisition or first use. A unique high-confidence local hit may skip that choice. Implicit `cap.use` register is allowed for that hit. | Implicit add-on-use exists. Unique-hit vs multi-hit copy: [agent-onboarding.md](./agent-onboarding.md) and README. | — |
| USE-10 | 1 | P0 | Acquisition plus ManagedBinding stay non-resident by default. Only explicit pin / resident config is Direct Exposure. | Implicit add updates Registry, not Agent tool lists. | First-class pin UX is Phase 2 (REC-06). |
| USE-11 | 2 | — | Temporary try mode that can remove downloaded assets while retaining an anonymous outcome record. | Not shipped. | Later. |
| INJ-01 | 1 | P0 | `cap inject` returns a task-specific load/defer plan and does not mutate configs. | Delivered (`mutates: false`). | — |
| INJ-02 | later | — | Auto mutate or evict from an injection plan. | Plan-only. | Later Dynamic Injection meaning. |
| CAT-01 | 3 | — | Search a public catalog anonymously using only simplified Capability Intent. | Seed catalog only. | Remote catalog. |
| CAT-02 | 3 | — | Return only administrator-approved, compatible, non-revoked Providers. | Local seed is hand-maintained. | Public review workflow. |
| CAT-03 | 3 | — | Keep Capability and Provider as separate many-to-many objects in the public catalog. | Already true for the local seed. | Public catalog service. |
| CAT-04 | 3 | — | Public catalog metadata: version, compatibility, maintenance, permissions, risk, source, trust, install type, I/O. | Seed has a subset. | Full remote metadata. |
| CAT-05 | 3 | — | Apply quality eligibility before tunable relevance/popularity ranking. | Local keyword/intent ranking only. | Remote ranker. |
| CAT-06 | 3 | — | Return a bounded remote candidate set (proposed default three). | Local search already bounds results. | Remote bound. |
| CAT-07 | 3 | — | Cache verifiable catalog metadata for resilience and offline browsing. | No remote cache. | Phase 3. |
| CAT-08 | 3 | — | Version pinning, deprecation, revocation, advisories, admin audit/rollback. | Not shipped. | Phase 3. |
| ACQ-01 | 3 | — | Auto-download verified static assets after selection. | Local bind only. | Remote download. |
| ACQ-02 | 3 | — | Verify integrity and show source, version, and permissions for remote artifacts. | Local metadata only. | Remote integrity. |
| ACQ-03 | 3 | — | Confirm scripts, external account access, new service permissions, elevation, and access outside the workspace. | Honest connection/auth failures locally. | Remote permission gates. |
| ACQ-04 | 1 | P0 | Do not add a CAP prompt for reads already authorized inside the active workspace. | Local use inherits Agent workspace auth. | — |
| ACQ-05 | 3 | — | Fail closed when remote trust, integrity, compatibility, or permission metadata is missing. | Local missing launch fails closed with `connection_required`. | Remote fail-closed policy. |

### Activity and telemetry

| ID | Phase | Pri | Target | Now | Gap |
|---|:---:|:---:|---|---|---|
| TEL-LCL | 1 | P0 | Local Registry Activity is sufficient for Value Analysis and underused advice. | Activity records search/select/add/use. Value Analysis still scores from `use` only. `frequencyVerdicts` follows Observation Period readiness ([ADR 0003](./adr/0003-observation-period-readiness.md)). | — |
| TEL-01 | 3 | — | Record anonymous install, active-use, search, exposure, acquisition, invocation result, and estimated savings events. | No product-wide anonymous contract. | Not a Phase 1 gate. |
| TEL-02 | 3 | — | Provide an immediate user-visible opt-out. | N/A until remote TEL exists. | Phase 3. |
| TEL-03 | 3 | — | Never transmit source code, raw task, config, inventory, paths, credentials, or raw errors. | Nothing is transmitted today. | Keep as a hard rule when TEL ships. |
| TEL-04 | 3 | — | Use coarse errors and a rotating anonymous installation identifier. | Not shipped. | Phase 3. |
| TEL-05 | 3 | — | Publish event fields and retention. | Not shipped. | Phase 3. |
| TEL-06 | 3 | — | Distinguish Provider invocation success from full task success unless the Agent supplies an explicit completion signal. | Local Activity is invocation-level. | Completion protocol is open. |

## 9. Local visual report

**Phase 1 Target:** health summary; before/after estimate; inventory with cost attribution; duplicates; high-cost/duplicate recommendations; scoped backup note.

**Now:** Web Health / inspect JSON cover health, inventory, duplicates, Value Analysis, and recommendations.

**Gap:** Restore Point browser, sanitized remote activity, and privacy/telemetry controls are later. Observation readiness and frequency/value advice are on Inspect/Web after the 14-day / 3-activity-day gate. The page must stay keyboard accessible and must not rely on color alone.

## 10. State model

CAP must not collapse these states:

```text
discovered -> recommended -> selected -> acquired -> configured -> CAP-managed -> invoked
```

Acquisition ≠ Direct Exposure ≠ CAP-managed ≠ Invoked.

- A search hit is not acquired.
- Acquisition creates a ManagedBinding. It is not configuration and not Direct Exposure.
- A CAP-managed Provider can remain non-resident and still be usable on demand.
- Implicit `cap.use` register is Acquisition plus ManagedBinding. Default is not Direct Exposure.
- Pin or resident configuration is Direct Exposure.
- Invocation success is not necessarily full task success.

Core local entities are Local Inventory item, Context Footprint, Capability, Provider, ManagedBinding, Activity, Optimization Plan, Restore Point (scoped), and Acquisition. Remote entities (Phase 3) are public catalog Capability/Provider, review, popularity, and revocation.

## 11. Privacy and security

**Phase 1 Now**

- Inspection is read-only and never starts scanned MCPs.
- Workspace reads inherit Agent authorization; CAP never broadens it silently.
- Writes use least privilege, restrictive state permissions where available, and timestamped `.cap-backup` for supported JSON optimize.
- Provider environment secrets never enter reports or logs.

**Phase 3 Target (not a launch gate)**

- Task simplification happens locally; remote search receives only Capability Intent and coarse compatibility data.
- Catalog artifacts and metadata are verifiable.
- New remote permissions are purpose-specific and deny-by-default.
- Disabling anonymous telemetry does not disable local features.
- Remote telemetry never includes source code, raw task, config, inventory, paths, credentials, or raw errors.

## 12. Non-functional requirements

| Area | Phase | Target | Now | Gap |
|---|:---:|---|---|---|
| Performance | 1 | Show a local summary within 5 seconds on a typical machine with 100 Skills, excluding exceptional trees. | Local inspect is the path. | Formal timing check. |
| Reliability | 1 | One failed scan source does not block others; failure is visible and scoped. | Multi-source inspect. | Agent wording. |
| Safety | 1 | Supported JSON apply writes `.cap-backup` first. Full atomic Restore is later. | Backup-before-apply. | Cross-adapter Restore. |
| Offline | 1 | Inspect, documented backup recovery, local search, inject plan, and managed local use work without a public catalog. | No remote catalog dependency. | — |
| Compatibility | 1 | Publish the supported OS/Agent matrix. | [compatibility.md](./compatibility.md): OS × Agent × path with tested / expected / unknown. | Version floors still open. |
| Explainability | 1 | Every cost, score, and recommendation exposes its reason. | Estimates and recommendation reasons exist. | Ranking weights still open. |
| Runtime | 1 | Preserve zero npm runtime dependencies unless separately approved. | Zero runtime deps. | — |

## 13. Success metrics

### Phase 1 north stars

- **Agent onboarding completion**: explicit Agent install requests that reach a rendered first health report.
- **Time to first health report**: median time from the pasted directive to report delivery in the same conversation (local observation; not remote TEL).
- **Non-resident library size**: acquired / CAP-managed Providers that do not add Direct Exposure.
- **Local Unlock**: seed or local-skill Provider acquired and Invoked when it was not already in the working set.

### Later-phase north stars (not launch gates)

- **Active CAP users** via anonymous installations.
- **Estimated tokens saved** from validated before/after reductions, aggregated remotely.
- **Remote Capability Unlocks**.
- **Intent-to-first-use conversion** across the public catalog.

### Phase 1 guardrails

- JSON optimize apply failure rate.
- Post-optimization invocation regression (local).
- Percentage of projected savings confirmed by post-change inspection.
- Copy never claims one-click Restore or remote Unlock as shipped.

### Later guardrails

- Full Restore success and mutation failure rates.
- Remote zero-result, irrelevant-selection, acquisition, and permission-abandonment rates.
- Revoked Provider invocations prevented.

Token savings remain explicitly estimated. Capability Unlock means Provider-level success unless the Agent provides a full-task completion signal.

## 14. Acceptance scenarios

Each scenario is labeled. Only Phase 1 scenarios are launch-relevant.

1. **Phase 1.** A heavy DingTalk MCP appears in the first report with estimated cost, without being started.
2. **Phase 1.** About 100 overlapping Skills are priced and grouped, with no day-one low-frequency claim.
3. **Phase 1.** Confirmed JSON MCP optimize writes a timestamped `.cap-backup`; recovery from that file is documented and can reproduce the prior JSON.
4. **Later.** Restore after a later manual edit detects conflict and preserves both versions. Not a Phase 1 gate.
5. **Phase 1.** A consolidated or seed Skill remains discoverable and usable from a natural-language task.
6. **Phase 3.** A company task sends only simplified Capability Intent to remote search. Not a Phase 1 gate.
7. **Phase 3.** A reviewed static Skill downloads and verifies automatically. Not a Phase 1 gate.
8. **Phase 3.** A Provider needing a script or DingTalk authorization pauses for informed confirmation. Not a Phase 1 gate.
9. **Phase 1.** Local inspection, backup recovery, search, inject plan, and managed use continue with no public catalog.
10. **Phase 1 (local) / Phase 3 (semantic+remote).** “生成一份 PPT” searches seed and local Skills and compares existing metadata. A miss is honest. Semantic/public-catalog hits are Phase 3.
11. **Phase 1.** A user can acquire and try multiple discoveries while the resident footprint stays limited to the CAP surface plus explicitly pinned Providers. Implicit `use` does not create Direct Exposure.
12. **Phase 1.** A user pastes the complete README Agent Installation Directive; the Agent starts installation without another CAP question and returns the first health report in the same conversation.
13. **Phase 1.** A user pastes ordinary CAP prose or asks to summarize README without the designated execution directive; the Agent does not infer installation authorization.
14. **Phase 1.** Agent-first onboarding does not migrate existing MCPs or Skills; selecting “优化” later produces a separate preview and confirmation.
15. **Phase 1.** A first inspection with `high` Context Pressure recommends CAP optimization, shows estimated before/after savings, and explains that confirmed JSON changes write `.cap-backup` and can be recovered from that backup — not that one-click Restore exists.
16. **Phase 1.** The same first inspection does not apply the recommendation until the user separately reviews and confirms the Optimization Plan.
17. **Phase 1.** `cap inject` for a task returns a load/defer plan with `mutates: false`.
18. **Phase 1.** A unique high-confidence local search hit may be used (and implicitly registered) without a choice step; two viable hits still require a choice.

## 15. Delivery phases

Panorama only. **Launch gates in §18 bind Phase 1.**

**Phase 1 — Agent-first trustworthy local control (launch):** same-conversation installation and first report; local inventory and Context Health; high-cost/duplicate recommendations; JSON MCP optimize plus timestamped `.cap-backup` and documented recovery; transparent local use (search / add / use, Skills overlay, implicit add-on-use); seed-catalog local Unlock; `cap inject` plan-only; Acquisition versus Direct Exposure versus CAP-managed versus Invoked.

**Phase 2 — observed optimization:** Observation Period readiness, frequency/value advice, resident pinning, remaining adapters, and savings validation. Not a Phase 1 launch gate.

**Phase 3 — public Capability Unlock:** semantic retrieval, remote catalog, local intent simplification, admin curation, verifiable metadata, relevance/popularity ranking, remote acquisition gates, revocation, anonymous product telemetry, and full one-click Restore. Not a Phase 1 launch gate.

Do not market remote discovery, anonymous telemetry, or full Restore as generally available until those Phase 3 paths work end to end.

## 16. Current implementation and gaps

| Area | Phase | Target | Now | Gap |
|---|:---:|---|---|---|
| Agent onboarding | 1 | Directive-scoped install + first health report | README Agent Installation Directive; `cap setup --agent auto`; `cap inspect`; [agent-onboarding.md](./agent-onboarding.md) | Not auto Restore. |
| Inventory and health | 1 | Local inventory and Context Health | Inspect: budget, pressure, funnel, costs, reclaimable estimate, Value Analysis; [compatibility.md](./compatibility.md) | Richer visual filters; OS/Agent version floors |
| Recommendations | 2 | High-cost / duplicate always; frequency/value advice after readiness | Inspect recommendations stay cost/duplication. After 14 UTC days + 3 activity days, `profiler.advice` explains cost, duplication, usage, and recency separately ([ADR 0003](./adr/0003-observation-period-readiness.md)). Until ready, `frequencyVerdicts: false` and `underused` is a value signal only. | Pin/exclude UX (#36) |
| Optimize | 1–2 | JSON + shipped adapters after `--apply --yes` | Preview + guarded JSON and Codex dotted-table apply; Skill index; remaining layouts refused | Per-item selectivity; other layouts; Restore UI |
| Restore | 1 | Timestamped `.cap-backup` + documented recovery | Backups are written; [restore-from-backup.md](./restore-from-backup.md); copy refuses one-click Restore | Full Restore UI/CLI across adapters is later, not Phase 1 P0 |
| Transparent use | 1 | search / add / use + Skills overlay + implicit add-on-use | Delivered | — |
| Compare | 1 | Existing metadata fields | Catalog and search metadata | No separate pros/cons engine (settled) |
| Local Unlock | 1 | Seed + local Skills | Keyword/intent search; honest misses | Remote catalog is Phase 3 |
| Dynamic Injection | 1 | Plan-only | `cap inject` (`mutates: false`) | Auto mutate/evict later |
| Remote catalog | 3 | Public Unlock | Bundled seed only | Service, admin workflow, signing, cache, revocation |
| Remote acquisition | 3 | Download, integrity, permission gates | Local bindings; honest `connection_required` | Remote install path |
| Activity | 1 | Local Registry Activity | Search/select/add/use on disk (privacy-safe query; no remote telemetry). `cap inject` ranking does not write search events. | — |
| Anonymous telemetry | 3 | Opt-out product telemetry | Not shipped | Not a Phase 1 gate |

## 17. Open decisions

Settled by this Grill and removed from this list: Installation Directive as scoped install auth; Phase 1 Restore scope; Compare via metadata (no authoring engine); local Activity versus remote TEL; inject plan-only; Acquisition ≠ Direct Exposure ≠ CAP-managed ≠ Invoked; unique-hit exception on USE-09; remote catalog / semantic retrieval / full Restore / enterprise out of Phase 1 P0.

Closed in this Phase 1 docs pass (removed from the open list):

- Material-savings threshold = **10% of effective budget** ([ADR 0001](./adr/0001-material-savings-threshold.md), #27 / ONB-12).
- Observation Period readiness: **14 UTC calendar days and 3 distinct activity days** ([ADR 0003](./adr/0003-observation-period-readiness.md), #35 / REC-03/04/05). Until ready, no low-frequency → remove. After ready, advice is `prefer_on_demand` with separated signals.

Still open:

- Ranking weights (and, in Phase 3, popularity anti-manipulation).
- “High context” thresholds by effective budget (pressure bands are shipped; this is any extra high-cost cutoff beyond ONB-11/12).
- Semantic duplicate method and acceptable false positives.
- Semantic retrieval approach and quality targets for vague multilingual intents (Phase 3; not a launch gate).
- Minimum supported OS and Agent **versions** (path matrix is published; version floors are not).
- Administrator review checklist, staffing, and publication SLA (Phase 3).
- Artifact hosting, licensing, and telemetry retention (Phase 3).
- Agent protocol for signaling full task completion.

## 18. Launch gates

These are the real Phase 1 gates. They are not “all historical P0 rows.”

- Phase 1 `P0` rows in §8 pass their acceptance scenarios.
- README Agent Installation Directive exists and is treated as scoped install + minimal CAP surface + read-only inspect authorization.
- First health report can be produced in the Agent conversation without executing a scanned third-party MCP.
- First-report advice uses cost and duplication only; no day-one low-frequency label and no unused→remove recommendation.
- JSON MCP optimize requires `--apply --yes`, writes timestamped `.cap-backup`, and documents recovery from that file.
- Launch copy does not claim full one-click Restore across adapters.
- Transparent local use works: search / add / use, local Skills overlay, implicit add-on-use as Acquisition plus ManagedBinding (not Direct Exposure).
- Unique high-confidence local hit may skip choose-before-acquire; multiple viable candidates still require a choice.
- Compare uses existing metadata; no pros/cons authoring engine is required.
- `cap inject` is plan-only (`mutates: false`).
- Context values consistently say “estimated.”
- Core local features work offline (no public catalog required).
- The supported Agent scan set (Codex, Claude Code, Cursor) is documented as the published OS × path matrix; launch copy matches tested/expected cells only.

Not launch gates: remote public catalog, semantic/vector retrieval, full Restore UI/CLI, anonymous product telemetry, enterprise / Desktop / team.
