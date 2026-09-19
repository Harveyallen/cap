# ADR 0001: Material-savings threshold for first-report optimize

Status: Accepted  
Date: 2026-09-19  
PRD: ONB-12  
Issue: #27

## Context

First-report copy should recommend a read-only Optimization Plan preview when reclaimable context is material, even if Context Pressure is not yet `high`. The PRD proposed 10% of effective budget and left the value open in §17.

## Decision

The Phase 1 material-savings threshold is **10% of `budget.effectiveBudget`**.

Recommend optimize preview when **either**:

- Context Pressure is `high`, `critical`, or `emergency` (ONB-11), or
- `summary.reclaimableTokens >= 0.1 * budget.effectiveBudget` (ONB-12).

This is a policy for Agent/README copy and launch language. Inspect continues to expose the raw estimates; it does not have to emit a separate boolean.

## Consequences

- §17 no longer lists this as open.
- “大量可回收上下文” in Agent copy means this 10% rule, not an undefined amount.
- Changing the percentage later is a new decision, not a silent tweak.
