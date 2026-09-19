# CAP Product Requirements Document

Status: Draft based on founder interview  
Date: 2026-09-19  
Target: Cross-platform MVP

## 1. Product definition

CAP is a local capability and context control layer for coding Agents. It lets developers freely discover and try MCP servers and Skills without permanently paying their context cost, safely reduces existing exposure, and acquires reviewed capabilities on demand.

> Install more capabilities while exposing less context, without changing how the user asks the Agent to work.

CAP has three connected jobs:

1. **Observe**: scan supported Agent configurations and visualize Context Health.
2. **Optimize**: recommend and, after confirmation, apply reversible consolidation into CAP.
3. **Explore and unlock**: search by fuzzy intent, compare curated MCP/Skill candidates, choose one, and use it without making the entire Provider permanently resident.

## 2. Interview findings

### Triggering problem

- Developers repeatedly discover attractive MCP servers and Skills on social media and want to install each one to experiment.
- Traditional installation commonly makes definitions permanently visible to the Agent, so every experiment adds an ongoing context cost even when rarely used.
- The cost compounds as the collection grows; users are forced to choose between experimentation and a clean context window.
- A company DingTalk MCP exposes a large tool surface and occupies substantial resident context.
- Developers may have close to one hundred Skills, including overlapping alternatives.
- Even resident Skill names and descriptions add up and make Agent selection less reliable.
- Users understand basic MCP/Skill configuration but do not want to audit it continuously.

### Confirmed decisions

- Primary users are company developers using Codex, Claude Code, or Cursor.
- The primary first-use surface is the user's current Agent conversation; terminal-first setup is secondary.
- README provides a designated Agent Installation Directive that explicitly requests CAP installation and inspection.
- Pasting that complete directive is the user's scoped authorization for CAP installation, registration of the minimal CAP surface, and initial read-only inspection; CAP does not ask again. Host Agent execution approvals still apply.
- General quoted articles or installation guides that do not contain this designated directive are not authorization.
- The optimized experience must remain natural-language and transparent.
- Users can acquire many Providers while only the CAP surface and explicitly pinned Providers remain resident.
- A fuzzy task such as “生成一份 PPT” must produce relevant Skill/MCP candidates, not require a product name or exact keyword.
- Every candidate comparison explains strengths, limitations, context impact, permissions, trust, and task fit before the user chooses.
- CAP may edit configuration only after explicit confirmation.
- Every applied optimization must be restorable.
- Initial advice uses context cost and duplication, never unobserved frequency.
- Frequency advice begins only after an observation period.
- Remote search sends only a locally simplified Capability Intent.
- The first catalog is public, administrator-curated, anonymous, and free of account requirements.
- Eligible candidates rank by task relevance and popularity; the Agent chooses from a small set.
- Verified static assets may download automatically. Scripts and new permissions require confirmation.
- Reads within the Agent's already-authorized project workspace need no extra CAP prompt.
- Anonymous telemetry is allowed within the privacy limits below.
- macOS, Windows, and Linux are supported across Codex, Claude Code, and Cursor.

## 3. Problem statement

Developers discover many MCP servers and Skills through social media and naturally want to install and try them. Today, acquisition is coupled to permanent exposure: each experiment can add schemas or Skill identities to every subsequent Agent session. As the collection grows, usable context shrinks and overlapping choices reduce selection quality. Removing capabilities regains context but loses convenient access; finding a capability later requires manual discovery, comparison, trust evaluation, installation, and configuration.

Existing plugin managers optimize installation. CAP separates **acquisition** from **resident exposure**, maximizing accessible capability coverage per unit of context.

## 4. Goals and non-goals

### Goals

- Complete installation and the first Context Health report inside the user's current Agent conversation.
- Produce an understandable health report immediately after installation.
- Estimate context reduction before mutation.
- Consolidate selected Providers behind a small CAP surface.
- Let users collect and try many Providers without making them resident by default.
- Support fuzzy natural-language discovery across local and public capabilities.
- Explain each candidate's advantages and disadvantages so the user can make an informed choice.
- Preserve natural-language task execution after consolidation.
- Observe real use before labeling Providers low-frequency.
- Restore all modified MCP and Skill configuration.
- Discover and acquire administrator-reviewed public Providers without login.
- Protect company code and local configuration.
- Measure adoption, estimated savings, and Capability Unlocks.

### Non-goals for the first release

- Exact live-session token measurement.
- Enterprise private catalogs or open self-service publishing.
- Accounts, billing, team administration, or cross-device sync.
- Uploading source code, raw tasks, local configuration, credentials, or inventory.
- Treating general quoted article text as authorization, or installing beyond the scope explicitly granted by the designated directive.
- Replacing Agent permission systems.

## 5. Personas

**Company developer**: uses Codex, Claude Code, or Cursor; understands basic configuration; must use company MCPs; has many overlapping Skills; wants task success without manual context management.

**CAP catalog administrator**: reviews Provider metadata and artifacts, maintains compatibility and trust status, and revokes unsafe or abandoned versions without receiving user source code or inventory.

## 6. Product principles

1. Local first: inventory, analysis, intent simplification, and mutation happen locally.
2. Preview before mutation; consent before change. For onboarding, pasting the designated directive is consent for its disclosed scope.
3. Agent first: installation, report delivery, discovery, and use should complete in the conversation the user already occupies.
4. General quoted content is not consent; the README's designated directive is itself an explicit, narrowly scoped execution request.
5. Reversibility is a release gate.
6. Users express tasks, not CAP commands or Capability IDs.
7. Acquisition is not exposure: owning more Providers must not automatically increase resident context.
8. Discovery returns lightweight metadata, not every downstream schema.
9. Comparison precedes choice: CAP explains meaningful trade-offs instead of silently selecting a winner.
10. Popularity ranks only Providers that already pass the quality gate.
11. Estimates are always labeled as estimates.

## 7. Core journeys

### Agent-first install and report

1. The user copies the complete Agent Installation Directive from README into Codex, Claude Code, or Cursor.
2. The directive states that it is an execution request, identifies the official install command, limits the scope to CAP installation/minimal surface/inspection, and forbids optimization or third-party MCP execution.
3. Pasting the directive authorizes the Agent to begin immediately; CAP does not add a second confirmation dialog. The host Agent may still require its normal command approval.
4. The Agent verifies the Node.js prerequisite, installs CAP from the official package, registers the minimal CAP surface, and runs read-only `inspect` without starting third-party MCPs.
5. The same conversation displays the health summary, highest-cost items, estimated recoverable context, and any scan warnings.
6. The response includes a local URL for the detailed visual report.
7. If pressure is severe or recoverable context is material, the Agent explicitly recommends CAP optimization, quantifies expected savings, and explains that confirmed changes are backed up and restorable.
8. The recommendation offers a read-only Optimization Plan preview; it never applies that plan during first inspection.
9. The first report uses cost and duplication, not frequency, and does not migrate existing Providers.
10. Any later optimization plan receives its own preview and confirmation.

If the Agent cannot execute local commands, it provides one copyable official install command, then resumes the same flow after the user runs it. Terminal-first installation remains supported but is not the primary journey.

### Optimize

1. CAP identifies high-context and duplicate Providers.
2. It previews current and proposed footprint, savings, affected files, risks, and retained entries.
3. User selects items and explicitly confirms.
4. CAP creates a Restore Point, applies atomically, validates configuration, and reruns inspection.

### Transparent use

1. User asks for an outcome in natural language.
2. Agent searches local CAP-managed capabilities through the resident CAP surface.
3. CAP returns a small lightweight candidate set.
4. Agent selects a Provider; CAP loads the Skill body or mapped MCP input only on demand.

### Fuzzy discovery and comparison

1. The user describes an outcome in ordinary language, for example “我想生成一份 PPT”.
2. CAP searches acquired local Providers first, then the public catalog when local confidence is insufficient.
3. CAP returns a small set of relevant Skill and MCP candidates across Provider types.
4. Each candidate states why it matches, its strengths, limitations, context behavior, permissions, trust, maintenance, and setup effort.
5. The Agent presents the comparison without loading full Skill bodies or MCP schemas.
6. The user chooses a candidate; CAP acquires/configures it if necessary and makes it usable in the current task.
7. After use, the Provider remains acquired but non-resident unless the user explicitly pins it.

### Remote Capability Unlock

1. Local search has no adequate match.
2. CAP locally reduces the task to a privacy-safe Capability Intent.
3. The public catalog returns a bounded set of eligible candidates ranked by relevance and popularity.
4. Agent selects a candidate.
5. CAP downloads and verifies safe static assets automatically.
6. CAP pauses before scripts, external authorization, privilege elevation, or access outside the authorized workspace.
7. CAP registers and invokes the Provider and records the outcome.

### Restore

1. User previews a Restore Point and confirms.
2. CAP detects changes made after migration.
3. With no conflict it restores atomically; with a conflict it preserves both versions and never overwrites silently.
4. CAP validates that original MCP and Skill definitions are visible again.

## 8. Functional requirements

P0 is required for launch; P1 completes the first product iteration.

### Agent-first onboarding

| ID | Pri | Requirement |
|---|---:|---|
| ONB-01 | P0 | Make Agent conversation the primary documented installation and first-report path. |
| ONB-02 | P0 | Publish one copyable README Agent Installation Directive whose wording is an explicit execution request with a narrowly disclosed scope. |
| ONB-03 | P0 | The directive identifies the official command, prerequisite, CAP surface change, read-only inspection, prohibited optimization, and third-party MCP prohibition. |
| ONB-04 | P0 | Treat pasting the complete directive as scoped onboarding authorization and do not add a redundant CAP confirmation; preserve host Agent approvals. |
| ONB-05 | P0 | Do not include migration of existing MCPs/Skills in onboarding consent; optimization requires a separate plan and confirmation. |
| ONB-06 | P0 | Return the first health summary directly in the originating conversation and include a local detailed-report URL. |
| ONB-07 | P0 | If installation succeeds but one scan source fails, return a partial report with a scoped warning instead of losing the whole result. |
| ONB-08 | P0 | If the Agent cannot execute locally, provide one official copyable command and continue inspection after installation is detected. |
| ONB-09 | P1 | Detect an existing compatible CAP install and upgrade/reuse it rather than creating duplicate surfaces or state. |
| ONB-10 | P1 | Track time from explicit install request to first rendered health report. |
| ONB-11 | P0 | When Context Pressure is `high`, `critical`, or `emergency`, explicitly recommend previewing CAP optimization. |
| ONB-12 | P0 | Also recommend optimization when reclaimable context crosses a material-savings threshold; the proposed default is 10% of effective budget. |
| ONB-13 | P0 | State why the recommendation triggered, current/projected footprint, estimated savings, affected capability classes, confirmation requirement, and restore guarantee. |
| ONB-14 | P0 | First inspection may offer or run a read-only optimization preview but must not apply it under onboarding authorization. |

### Inventory and reporting

| ID | Pri | Requirement |
|---|---:|---|
| INV-01 | P0 | Detect Codex, Claude Code, and Cursor on macOS, Windows, and Linux. |
| INV-02 | P0 | Discover supported user, project, shared, and plugin MCP/Skill definitions. |
| INV-03 | P0 | Never connect to or execute third-party MCPs during inspection. |
| INV-04 | P0 | Estimate MCP schema/description cost and resident Skill identity cost separately. |
| INV-05 | P0 | Mark values as estimated and publish the method. |
| INV-06 | P0 | Identify duplicate definitions and probable overlapping Skills. |
| INV-07 | P0 | Distinguish installed, configured, directly exposed, CAP-managed, and observed-used. |
| INV-08 | P0 | Show effective budget, footprint, pressure, score, warnings, recoverable tokens, and projected after-state. |
| INV-09 | P0 | Use one report model for CLI, Agent response, and local visual UI. |
| INV-10 | P1 | Filter details by Agent, scope, source, type, status, cost, and reason. |

### Observation and recommendations

| ID | Pri | Requirement |
|---|---:|---|
| REC-01 | P0 | Initially recommend only high-context and duplicate capabilities. |
| REC-02 | P0 | Record local CAP-mediated search, selection, invocation, outcome, and time. |
| REC-03 | P0 | Never label low-frequency until the observation threshold is satisfied. |
| REC-04 | P1 | Proposed default observation period is 14 days; expose and validate the final policy before GA. |
| REC-05 | P1 | Explain cost, duplication, usage, and recency signals separately. |
| REC-06 | P1 | Let users pin a Provider resident or exclude it from recommendations. |
| REC-07 | P0 | Never recommend the CAP surface itself for removal. |
| REC-08 | P0 | Put reversibility beside every optimization call to action: what is backed up, how restore works, and how conflicts are handled. |

### Optimization and restore

| ID | Pri | Requirement |
|---|---:|---|
| OPT-01 | P0 | Produce a dry-run plan with affected files, before/after estimate, savings, retained entries, and reload needs. |
| OPT-02 | P0 | Require explicit confirmation immediately before applying. |
| OPT-03 | P0 | Preserve Provider executables and Skill bodies; consolidation is not uninstall. |
| OPT-04 | P0 | Apply supported changes atomically and validate afterward. |
| OPT-05 | P0 | Refuse ambiguous/unsupported mutations and provide manual guidance. |
| OPT-06 | P1 | Support selective migration and every shipped Agent/OS adapter. |
| RST-01 | P0 | Create a Restore Point before every mutation. |
| RST-02 | P0 | Record original bytes/checksum, path, Agent, scope, time, and plan ID. |
| RST-03 | P0 | Preview and confirm restoration. |
| RST-04 | P0 | Restore exact original configuration when no later edit conflicts. |
| RST-05 | P0 | Detect conflicts, preserve both versions, and never overwrite silently. |
| RST-06 | P0 | Verify original definitions are discoverable after restore. |
| RST-07 | P0 | Expose restore through CLI, Agent conversation, and local UI. |
| RST-08 | P0 | A migration adapter cannot ship until automated apply/restore tests pass. |
| RST-09 | P0 | Never describe an optimization as safely reversible unless its Restore Point is created and validated before mutation. |

### Discovery, catalog, and acquisition

| ID | Pri | Requirement |
|---|---:|---|
| USE-01 | P0 | Natural-language tasks require no CAP command or ID knowledge. |
| USE-02 | P0 | Search local capabilities before remote catalog. |
| USE-03 | P0 | Support fuzzy semantic intent such as “生成一份 PPT” without requiring exact Provider names or catalog keywords. |
| USE-04 | P0 | On-demand Skills must become usable in the active task. |
| USE-05 | P0 | MCP use exposes only the mapped tool input for the selected Capability. |
| USE-06 | P0 | Report connection, authorization, install, and execution failures honestly. |
| USE-07 | P0 | Return lightweight summaries; never load candidate bodies or full schemas merely to compare them. |
| USE-08 | P0 | Compare candidates by match reason, strengths, limitations, estimated context behavior, permissions, trust, maintenance, compatibility, and setup effort. |
| USE-09 | P0 | Let the user make the final choice before acquisition or first use when multiple viable candidates exist. |
| USE-10 | P0 | Keep acquired Providers non-resident by default after use; only explicit pinning makes one resident. |
| USE-11 | P1 | Support a temporary try mode that can remove downloaded assets and bindings while retaining an anonymous outcome record. |
| CAT-01 | P0 | Search the public catalog anonymously using only simplified Capability Intent. |
| CAT-02 | P0 | Return only administrator-approved, compatible, non-revoked Providers. |
| CAT-03 | P0 | Keep Capability and Provider as separate many-to-many objects. |
| CAT-04 | P0 | Include version, compatibility, maintenance, permissions, risk, source, trust, install type, and I/O metadata. |
| CAT-05 | P0 | Apply quality eligibility before tunable relevance/popularity ranking. |
| CAT-06 | P0 | Return a bounded candidate set; proposed default is three. |
| CAT-07 | P0 | Cache verifiable catalog metadata for resilience and offline browsing. |
| CAT-08 | P1 | Support version pinning, deprecation, revocation, advisories, and admin audit/rollback. |
| ACQ-01 | P0 | Auto-download verified static assets after selection. |
| ACQ-02 | P0 | Verify integrity and show source, version, and permissions. |
| ACQ-03 | P0 | Confirm scripts, external account access, new service permissions, elevation, and access outside the workspace. |
| ACQ-04 | P0 | Do not add a prompt for reads already authorized inside the active workspace. |
| ACQ-05 | P0 | Fail closed when trust, integrity, compatibility, or permission metadata is missing. |

### Anonymous telemetry

| ID | Pri | Requirement |
|---|---:|---|
| TEL-01 | P0 | Record anonymous install, active-use, search, exposure, acquisition, invocation result, and estimated savings events. |
| TEL-02 | P0 | Provide an immediate user-visible opt-out. |
| TEL-03 | P0 | Never transmit source code, raw task, config, inventory, paths, credentials, or raw errors. |
| TEL-04 | P0 | Use coarse errors and a rotating anonymous installation identifier. |
| TEL-05 | P0 | Publish event fields and retention. |
| TEL-06 | P1 | Distinguish Provider invocation success from full task success unless the Agent supplies an explicit completion signal. |

## 9. Local visual report

The detailed page contains: health summary; before/after comparison; inventory with cost attribution; duplicates; explained recommendations; observation readiness; Restore Points; sanitized remote activity; and privacy/telemetry controls. It must be keyboard accessible and must not rely on color alone.

## 10. State model

CAP must not collapse these states:

```text
discovered -> recommended -> selected -> acquired -> configured -> CAP-managed -> invoked
```

A search hit is not acquired. Acquisition is not configuration. Configuration is not Direct Exposure. A CAP-managed Provider can remain non-resident and still be usable on demand. Invocation success is not necessarily full task success.

Core local entities are `LocalInventoryItem`, `ContextCost`, `Capability`, `Provider`, `ManagedBinding`, `ActivityEvent`, `OptimizationPlan`, `RestorePoint`, and `AcquisitionRecord`. Remote entities are `CatalogCapability`, `CatalogProvider`, `CatalogReview`, `PopularityAggregate`, and `Revocation`.

## 11. Privacy and security

- Inspection is read-only and never starts scanned MCPs.
- Task simplification happens locally; remote search receives only Capability Intent and coarse compatibility data.
- Workspace reads inherit Agent authorization; CAP never broadens it silently.
- New permissions are purpose-specific and deny-by-default.
- Writes use least privilege, atomic replacement, restrictive state permissions where available, and recoverable backups.
- Catalog artifacts and metadata are verifiable.
- Provider environment secrets never enter reports, logs, search, or telemetry.
- Disabling telemetry does not disable local features.

## 12. Non-functional requirements

| Area | Requirement |
|---|---|
| Performance | Show a local summary within 5 seconds on a typical machine with 100 Skills, excluding exceptional trees. |
| Reliability | One failed scan source does not block others; failure is visible and scoped. |
| Safety | Apply and restore are atomic and idempotent where the filesystem permits. |
| Offline | Inspect, restore, local search, and managed local use work without the catalog. |
| Compatibility | Publish and test the supported OS/Agent version matrix. |
| Explainability | Every cost, score, recommendation, and ranking exposes its reason. |
| Runtime | Preserve zero npm runtime dependencies unless separately approved. |

## 13. Success metrics

### North stars

- **Active CAP users**: anonymous installations with meaningful activity in the window.
- **Estimated tokens saved**: sum and median of validated before/after footprint reductions.
- **Capability Unlocks**: no adequate local Capability existed, a remote Provider was acquired, and its relevant invocation succeeded.
- **Non-resident library size**: accessible acquired Providers per user that do not add Direct Exposure.
- **Intent-to-first-use conversion**: fuzzy searches that lead to a chosen Provider and successful first invocation.
- **Agent onboarding completion**: explicit Agent install requests that reach a rendered first health report.
- **Time to first health report**: median time from user confirmation to report delivery in the same conversation.

### Guardrails

- Restore success and mutation failure rates.
- Post-optimization invocation regression rate.
- Remote zero-result, irrelevant-selection, acquisition, and permission-abandonment rates.
- Percentage of projected savings confirmed by post-change inspection.
- Revoked Provider invocations prevented.

Token savings remain explicitly estimated. Capability Unlock means Provider-level success unless the Agent provides a full-task completion signal.

## 14. Acceptance scenarios

1. A heavy DingTalk MCP appears in the first report with estimated cost, without being started.
2. About 100 overlapping Skills are priced and grouped, with no day-one low-frequency claim.
3. Confirmed optimization creates a Restore Point and can reproduce the original configuration.
4. Restore after a later manual edit detects conflict and preserves both versions.
5. A consolidated Skill remains discoverable and usable from a natural-language task.
6. A company task sends only simplified intent to remote search—no code, raw task, paths, config, or inventory.
7. A reviewed static Skill downloads and verifies automatically.
8. A Provider needing a script or DingTalk authorization pauses for informed confirmation.
9. Local inspection, restore, search, and managed use continue when the catalog is offline.
10. “生成一份 PPT” returns a small relevant mix of Skills/MCPs with concrete pros and cons; after selection the chosen Provider works in the current task without all candidates becoming resident.
11. A user can acquire and try multiple social-media discoveries while the post-inspection resident footprint stays limited to CAP plus explicitly pinned Providers.
12. A user pastes the complete README Agent Installation Directive; the Agent starts installation without another CAP question and returns the first health report plus a local detail link in the same conversation.
13. A user pastes ordinary CAP prose or asks to summarize README without the designated execution directive; the Agent does not infer installation authorization.
14. Agent-first onboarding does not migrate existing MCPs or Skills; selecting “优化” later produces a separate preview and confirmation.
15. A first inspection with `high` Context Pressure recommends CAP optimization, shows estimated before/after savings, and explains that confirmed changes create a Restore Point and can be undone.
16. The same first inspection does not apply the recommendation until the user separately reviews and confirms the Optimization Plan.

## 15. Delivery phases

**Phase 1 — Agent-first trustworthy local control**: same-conversation installation and first report, cross-platform inventory, unified report, high-cost/duplicate recommendations, selective migration, Restore Points, transparent local use, and the acquired-versus-resident state distinction.

**Phase 2 — observed optimization**: observation readiness, frequency/value advice, resident pinning, and regression/savings validation.

**Phase 3 — public Capability Unlock**: fuzzy intent search, candidate pros/cons comparison, anonymous catalog, local intent simplification, admin curation, verifiable metadata, relevance/popularity ranking, acquisition gates, revocation, and unlock telemetry.

Remote discovery must not be marketed as generally available until acquisition, permission handling, and revocation work end to end.

## 16. Current implementation and gaps

| Area | Current state | Gap |
|---|---|---|
| Agent onboarding | `cap setup` installs the CAP surface and runs inspection; setup output can be shown by an Agent. | First-class same-conversation contract, safe pasted-content handling, preflight summary, partial-failure UX, and time-to-report telemetry. |
| Inventory | Scans MCP/Skill locations and estimates footprint. | Validate full OS/Agent matrix and semantic overlap. |
| Health | Budget, pressure, funnel, costs, reclaimable estimate, and value analysis exist. | Unified install presentation and richer visual report. |
| Optimization | Preview and guarded JSON MCP consolidation; local Skill indexing. | Selectivity, all adapters, conflict-safe restore command/UI, verification. |
| Dynamic use | Stable search/add/use, keyword/intent ranking, local Skill overlay, mapped MCP gateway. | Semantic fuzzy retrieval, candidate trade-off explanations, explicit choice, and transparent task parity. |
| Observation | Registry activity supports usage/value analysis. | Formal readiness; forbid premature low-frequency labels. |
| Catalog | Small bundled seed catalog. | Remote service, admin workflow, signing, caching, versioning, revocation. |
| Acquisition | Local bindings and honest connection-required responses. | Download, integrity, permission gates, cross-platform installation. |
| Telemetry | No product-wide anonymous contract. | Schema, opt-out, aggregation, retention, privacy tests. |

## 17. Open decisions

- Observation duration/evidence threshold; 14 days is proposed.
- Ranking weights and popularity anti-manipulation.
- “High context” thresholds by effective budget.
- Final material-savings threshold for first-report recommendations; 10% of effective budget is proposed.
- Semantic duplicate method and acceptable false positives.
- Semantic retrieval approach and quality targets for vague multilingual intents.
- Which candidate advantages and disadvantages are administrator-authored versus derived from metadata and observed outcomes.
- Minimum supported OS and Agent versions.
- Administrator review checklist, staffing, and publication SLA.
- Artifact hosting, licensing, and telemetry retention.
- Agent protocol for signaling full task completion.

## 18. Launch gates

- All shipped P0 requirements pass acceptance tests.
- Every mutation adapter has tested conflict-aware restore.
- Inspection never executes a scanned third-party MCP.
- Privacy tests exclude prohibited fields from search and telemetry.
- Context values consistently say “estimated.”
- Core local features work offline.
- The shipped compatibility matrix is verified and published.
- Acquired Providers cannot run scripts or gain new permissions without confirmation.
