# ADR 0003: Observation Period readiness for frequency advice

Status: Accepted  
Date: 2026-09-19  
PRD: REC-03, REC-04, REC-05  
Issue: #35  
Supersedes: ADR 0002’s “defer the 14-day rule until Phase 2”

## Context

Phase 1 ([ADR 0002](./0002-observation-period-phase1.md)) deferred frequency labels so day-one Value Analysis could not be read as “unused → remove.” REC-04 proposed 14 days and left the number to validate. Search/select Activity exists (REC-02). Phase 2 needs a written readiness rule, not “defer forever.”

## Decision

The Observation Period is **ready** when **both** are true:

1. **Duration (REC-04, kept at 14):** at least **14 UTC calendar days** have elapsed since `observation_started_at` (first local `search` / `select` / `add` / `use`, persisted so the 100-row Activity cap cannot drift the start).
2. **Evidence:** at least **3 distinct UTC days** contain CAP-mediated Activity (search, select, add, or use).

Until ready, `frequencyVerdicts` stays `false` and Inspect/Web must not emit frequency advice. `underused` remains a value signal only.

After ready, Inspect/Web may emit frequency/value **advice** with **cost, duplication, usage, and recency explained separately** (REC-05). Combined action is `prefer_on_demand` (do not keep Direct Exposure; use `cap.use` / inject). Advice must not say **remove / uninstall / 卸载**. Value scores still come from `use` only. CAP surface is never a candidate.

## Why 14 days was not shortened

A 7-day window would mark weekend-only or once-a-week tools unused after one quiet week. 30 days delays advice without much extra quality once three activity days exist. 14 days matches REC-04 and still covers a weekly cadence.

Three activity days distinguish “CAP was operated across the window” from “one install session aged in.” Search/select/add count as evidence that the user is using CAP; they still do not create value scores.

## Consequences

- PRD §17 closes the 14-day / evidence question for Phase 2.
- Env overrides `CAP_OBSERVATION_DAYS` and `CAP_OBSERVATION_EVIDENCE_DAYS` are for operators/tests; defaults stay 14 and 3.
- Pin/exclude UX (#36) and new optimize adapters (#37) stay out of scope.
