# Architecture Decision Records

This directory records the significant technical decisions made for Clippy — **what** we decided, **why**, and **what the consequences are**. The assessment ([ASSESSMENT.md](../../ASSESSMENT.md)) evaluates whether Tauri was the right platform; ADRs capture every consequential decision from that point forward.

## When to write one

Write an ADR when a decision is:

- **Hard to reverse** (affects dependencies, architecture, or public behavior)
- **A trade-off** — reasonable people could disagree; alternatives exist
- **Going to constrain future work** — future contributors need to know the rule and the reason behind it

Skip ADRs for routine changes (bug fixes, styling, small refactors) — the commit log is enough for those.

## How to write one

1. Copy the template below into `NNNN-short-title.md` (sequential number, e.g. `0004-...`).
2. Fill in the sections. Keep it short — an ADR should be readable in five minutes.
3. Update the [index](#index) below.
4. Commit it with the change it describes (or immediately after).

## Status values

| Status | Meaning |
|---|---|
| `Proposed` | Under discussion, not decided yet |
| `Accepted` | Decided and in effect |
| `Superseded by ADR-NNNN` | Replaced by a later decision |
| `Deprecated` | No longer relevant, but kept for history |

## Template

```markdown
# NNNN. Title

**Status:** Accepted | Proposed | Superseded by ADR-NNNN | Deprecated
**Date:** YYYY-MM-DD
**Deciders:** (who was involved)

## Context

What is the forces/tension/problem? What facts matter?

## Decision

What was decided, stated unambiguously.

## Alternatives considered

What else was on the table and why it was rejected.

## Consequences

Positive, negative, and neutral effects. Include the rules/constraints
this decision imposes on future work.
```

## Index

| ADR | Title | Status |
|---|---|---|
| [0001](0001-use-tauri-for-clippy.md) | Use Tauri (2) + Rust for Clippy | Accepted |
| [0002](0002-popup-hide-on-blur-with-interaction-guard.md) | Popup hides on blur, with a native drag/resize interaction guard | Accepted |
| [0003](0003-main-thread-only-window-property-getters.md) | Window property getters are main-thread-only | Accepted |
| [0004](0004-persistent-history-sqlite.md) | Persistent history via SQLite, with full image + display thumbnail | Accepted |
| [0005](0005-full-content-preview-via-window-widening.md) | Full-content preview via main-window widening (aside panel) | Superseded by ADR-0006 |
| [0006](0006-preview-separate-window-with-dock-fallback.md) | Full-content preview in a separate window, docking inside when there is no room | Accepted |
