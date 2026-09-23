# CAP

CAP is the domain of a local Capability Router: the right Capabilities for the current Agent task, acquired widely and exposed narrowly in resident context.

## Capability model

**Capability**:
A stable, intent-oriented outcome an Agent can achieve.
_Avoid_: Tool, plugin, MCP

**Provider**:
An implementation of one or more Capabilities, such as an MCP server, Skill, CLI, or API.
_Avoid_: Capability

**Skill**:
An instruction-based Provider whose identity can be resident and whose body can be loaded on demand.
_Avoid_: Scale

**Capability Intent**:
A locally simplified, privacy-safe description of the outcome being searched for.
_Avoid_: Full task, prompt, raw query

## Routing

**Capability Router**:
CAP’s product role: the local control plane that, for one task, assembles the Capability Set to use now.
_Avoid_: Agent Context manager, Marketplace, remote registry

**Capability Set**:
The Capabilities selected for one task, together with the context they need.
_Avoid_: Local Inventory, CAP Surface, Direct Exposure

**Capability Recommendation**:
A ranked Capability Set for one task.
_Avoid_: Optimization Plan, Context Health advice, Pin

**Capability Evaluation**:
A local judgment, drawn from Activity, of whether a chosen Capability helped. The current signal is invocation outcome; full task success is a later meaning of the same term.
_Avoid_: Anonymous telemetry, Value Analysis, popularity

**Capability Feedback**:
The Activity outcome that Capability Evaluation reads.
_Avoid_: Anonymous telemetry, Value Analysis

**Capability Routing**:
A later revision of Capability Recommendation that uses Capability Feedback.
_Avoid_: Capability Router, Marketplace search, Dynamic Injection

## Binding and exposure

These four are not interchangeable. A Provider may be acquired and CAP-managed without Direct Exposure and without having been Invoked.

**Acquisition**:
The act of registering a Provider with CAP so it can be used later.
_Avoid_: Install, Direct Exposure, pin

**ManagedBinding**:
The registration that makes a Provider CAP-managed and invocable through the CAP surface without making it resident.
_Avoid_: Pin, resident config, Direct Exposure

**CAP-managed**:
The state of a Capability or Provider that has a ManagedBinding and is available through the CAP surface.
_Avoid_: Installed, enabled, Invoked, Direct Exposure

**Direct Exposure**:
The state of a Provider definition made resident in an Agent’s context. Pinning or resident configuration is Direct Exposure; Acquisition is not.
_Avoid_: Installed, Acquisition, CAP-managed

**Pin**:
The explicit user action that makes or keeps a Provider as Direct Exposure. Unpin restores CAP-managed, non-resident behavior.
_Avoid_: Install, favorite, add, Acquisition

**Exclude**:
A user mark that omits a Provider from Optimization Plan recommendations without uninstalling it.
_Avoid_: Disable, delete, unpin, uninstall

**Trial**:
A temporary ManagedBinding created by explicit `cap try`. `cap cleanup` removes that binding (and any Registry launch copy the trial created) while keeping an anonymous local outcome record. It is not Direct Exposure and not remote product telemetry. Remote catalog asset download waits for Phase 3.
_Avoid_: Pin, download, anonymous product telemetry, uninstall

**Invoked**:
The state of a CAP-managed Provider that has been executed for a task.
_Avoid_: Installed, acquired, used (when that means resident)

**CAP Surface**:
The small set of stable CAP entry points kept visible while downstream Providers remain on demand.
_Avoid_: Full catalog, Direct Exposure

## Context control

**Context Footprint**:
CAP’s estimate of resident context occupied by Provider definitions and Skill identities.
_Avoid_: Exact token usage

**Context Health**:
An assessment of Context Footprint relative to an effective context budget.
_Avoid_: Model quality score, telemetry

**Value Analysis**:
An assessment of a Capability’s observed usefulness relative to its Context Footprint.
_Avoid_: Anonymous telemetry, popularity

**Optimization Plan**:
A preview of reversible configuration changes that reduce Direct Exposure without removing Providers.
_Avoid_: Cleanup, uninstall, Restore Point

**Restore Point**:
A recoverable copy of the configuration an Optimization Plan changed, scoped to that plan. It is not a return of every Agent’s entire setup.
_Avoid_: Full restore, one-click restore, backup (as a synonym that hides the scoped meaning)

**Dynamic Injection**:
A task-specific decision about which Capabilities to load versus defer (product ladder: Capability Injection). The current meaning is a plan only; automatic mutation or eviction is a later meaning of the same term.
_Avoid_: Auto-prune, restore, optimize apply

**Activity**:
The local Registry record of CAP-mediated search, selection, invocation, outcome, and time. It is not anonymous product telemetry, and it does not by itself create a frequency verdict. Try/cleanup outcomes stay in this local ledger.
_Avoid_: Telemetry, log, Observation Period

**Local Inventory**:
MCP and Skill Providers discovered from supported Agent configuration files on the machine. Inspect `funnel.installed` counts distinct scanned names. That count is not Acquisition and not the seed catalog.
_Avoid_: Catalog, CAP-managed, Direct Exposure

**Observation Period**:
The interval in which CAP records invocation activity before classifying a Provider as low-frequency. Ready after 14 UTC days and 3 distinct activity days ([ADR 0003](docs/adr/0003-observation-period-readiness.md)). Until then, unused Value Analysis signals are not a frequency verdict and must not say remove.
_Avoid_: Trial period, telemetry window

**Capability Unlock**:
A successful task enabled by a Provider that was not already in the user’s local library. Local Unlock uses already-available seed or local Providers; remote Unlock uses a public catalog and is a later-phase meaning.
_Avoid_: Search hit, download, Direct Exposure
