# CAP Domain Language

CAP uses intent-first language to separate what a user wants from the software that implements it.

## Capability model

**Capability**:
A stable, intent-oriented outcome an Agent can achieve.
_Avoid_: Tool, plugin, MCP

**Provider**:
An implementation of one or more Capabilities, such as an MCP server, Skill, CLI, or API.
_Avoid_: Capability

**Skill**:
An instruction-based Provider whose identity is resident and whose body can be loaded on demand.
_Avoid_: Scale

**Capability Intent**:
A locally simplified, privacy-safe description of the outcome being searched for.
_Avoid_: Full task, prompt

## Local control

**Agent-first Onboarding**:
The first-use flow in which a user asks their current Agent to install CAP, receives one installation confirmation, and gets the first health report in the same conversation.
_Avoid_: Silent install

**Local Inventory**:
MCP and Skill Providers discovered from supported Agent configurations on the user's computer.
_Avoid_: Catalog

**Direct Exposure**:
A Provider definition made resident in an Agent's context without going through CAP.
_Avoid_: Installed

**CAP-managed**:
A Capability or Provider registered with CAP and available through its stable surface.
_Avoid_: Installed, enabled

**Acquired Provider**:
A Provider downloaded or registered for possible use without being permanently exposed to an Agent.
_Avoid_: Resident Provider, Direct Exposure

**CAP Surface**:
The small set of stable CAP entry points kept visible while downstream Providers remain on demand.
_Avoid_: Full catalog

**Context Footprint**:
CAP's estimate of resident context occupied by Provider definitions and Skill identities.
_Avoid_: Exact token usage

**Context Health**:
An assessment of Context Footprint relative to an effective context budget.
_Avoid_: Model quality score

**Optimization Plan**:
A preview of reversible configuration changes that reduce Direct Exposure without removing Providers.
_Avoid_: Cleanup, uninstall

**Observation Period**:
The interval in which CAP records invocation activity before classifying a Provider as low-frequency.
_Avoid_: Trial period

**Restore Point**:
A recoverable snapshot of every configuration changed by an applied Optimization Plan.
_Avoid_: Log

## Remote discovery

**CAP Catalog**:
The administrator-curated public directory of Capabilities and reviewed Providers.
_Avoid_: Remote CAP, marketplace

**Curated Provider**:
A Provider that passed CAP administrator review and may appear in the CAP Catalog.
_Avoid_: Popular Provider

**Candidate Comparison**:
A concise, task-specific comparison of eligible Providers, including strengths, limitations, cost, permissions, and fit.
_Avoid_: Search results list

**Capability Unlock**:
A successful task enabled by a Provider absent from the user's Local Inventory.
_Avoid_: Search hit, download
