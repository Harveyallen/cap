# ADR 0002: Observation Period and frequency labels in Phase 1

Status: Accepted  
Date: 2026-09-19  
PRD: REC-03, REC-04  
Issue: #31

## Context

REC-03 forbids labeling a Provider **low-frequency** until an Observation Period / evidence threshold is satisfied. REC-04 proposed 14 days. Value Analysis already lists managed capabilities with zero successful `use` (or high cost / low value-per-cost) as `profiler.underused`. Without a written policy, that list can be read as a day-one “rarely used → remove” recommendation.

## Decision

**Phase 1 defers frequency labels until Phase 2.**

- CAP must not emit a low-frequency verdict.
- CAP must not recommend **remove / uninstall / 卸载** from unused or day-one Value Analysis data.
- `profiler.underused` remains a cost/value **signal** for humans (do not keep Direct Exposure; prefer `cap.use` / inject plans). It is not Observation-Period-ready frequency advice.
- Search/select Registry Activity (REC-02) is stored for later observation. It does not create value scores. Inspect keeps `frequencyVerdicts: false`.
- The proposed **14-day** Observation Period stays the Phase 2 default to validate (REC-04). It is **not** applied in Phase 1. Evidence threshold (minimum successful uses / session days) is also Phase 2.

## Consequences

- PRD §17 observation duration is closed for Phase 1 (“defer labels”) and pointed at Phase 2 for the 14-day number.
- Inspect/Web/Agent copy must not say 低频, rarely used, or 建议移除 on first report.
- Phase 2 may introduce readiness chrome and frequency-based optimize recommendations; that work is out of scope here.
