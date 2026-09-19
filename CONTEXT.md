# CAP

CAP is the domain of acquiring many Capabilities while exposing few of them in an Agent’s resident context.

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
A task-specific decision about which Capabilities to load versus defer. The current meaning is a plan only; automatic mutation or eviction is a later meaning of the same term.
_Avoid_: Auto-prune, restore, optimize apply

**Activity**:
The local Registry record of CAP-mediated search, selection, invocation, outcome, and time. It is not anonymous product telemetry, and it does not by itself create a frequency verdict.
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
