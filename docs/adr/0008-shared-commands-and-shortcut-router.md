# ADR-0008. Shared commands and a single shortcut router

**Status:** Accepted
**Accepted:** 2026-11-01
**Date:** 2026-11-01
**Deciders:** Omar Estrada
**Design:** [TDD-0001: Shared commands and shortcut routing](../tdd/0001-commands-and-shortcuts.md)
**Related:** [ADR-0007](0007-preview-separate-window-with-dock-fallback.md) (main-window ownership and preview key forwarding)

## Context

Splitting `main.ts` into modules made state, filtering, selection, and rendering
easier to test, but left overlapping keyboard listeners and separate button and
shortcut action implementations. Asynchronous binding lookup could yield before
event consumption, allowing duplicate execution. Recording and matching used
different modifier normalization, and hard-coded Ctrl+F/Ctrl+P handling constrained
rebinding. Adding a feature required coordinating multiple dispatch paths.

Regression tests reproduced nine failures in dispatch, context protection,
normalization, rebinding, and consistency between buttons and shortcuts. The
architecture needs one reusable action path and deterministic binding overrides.

## Decision

1. Route application actions through one typed command registry shared by buttons,
   keyboard bindings, and future menus. Commands own availability rules and mutation
   behavior; the registry supports replacement and scoped handler overrides.
2. Use one capture-phase shortcut router per webview. Match cached bindings and
   consume events synchronously; action execution may be asynchronous. Share one
   canonical representation across recording, persistence, validation, and matching.
3. Resolve bindings in this order: newest temporary scope, saved user binding,
   default definition. Resolve ties by explicit priority, then latest registration.
   Support explicit disabling, conflict reporting, and disposable scopes.
4. Keep action/shortcut metadata in an application catalog. Settings validates
   conflicting combinations before saving and updates cached bindings immediately.
5. Preserve main-window ownership of selection and mutations. Preview shortcuts
   forward allowlisted keys or action IDs to main; Rust continues to own the global
   summon hotkey. Native event subscriptions must be disposable.

The interfaces, module boundaries, extension examples, and validation requirements
are defined in [TDD-0001](../tdd/0001-commands-and-shortcuts.md).

## Alternatives considered

- **Keep separate button and shortcut handlers:** minimal change, but permits
  behavior and failure handling to diverge and makes overrides inconsistent.
- **Keep asynchronous settings lookup inside key dispatch:** always reads current
  settings, but cannot reliably consume the browser event before yielding and adds
  IPC to every keypress. Cache updates instead follow load/save events.
- **Use a shortcut library alone:** could simplify key parsing but would not
  establish shared commands, application context rules, or preview routing. A
  library remains an option behind the router interface if requirements grow.
- **Move every shortcut into Rust/global registration:** suitable for the summon
  hotkey, but browser focus and text-input rules belong to the webview. Making
  application shortcuts global would change their scope and expected behavior.

## Consequences

**Benefits:** shared behavior and overrides across UI entry points; deterministic
dispatch and rebinding; typed action arguments; testable matching and command
logic; explicit backend/preview ports for history tests.

**Costs and constraints:** a catalog and two registries require lifecycle and
precedence documentation. Settings caches must be updated in both webviews.
Temporary handler overrides supply their own availability rules. Exclusive
mutations drop overlapping invocations rather than queue them. Conflicting saved
bindings are rejected rather than silently selecting an action.

Future feature handlers must use the shared command path. New shortcuts must use
the shared normalizer and router rather than adding another global key listener.
The architecture does not provide undo/redo, multi-key sequences, or configurable
OS-level hotkeys.

## Acceptance

Omar confirmed on 2026-11-01 that the built application works after manual testing
and approved committing and pushing the implementation. Automated verification
reported 96 passing tests, a passing frontend build, and clean diff checks.

The design is accepted. Keep the [TDD regression checklist](../tdd/0001-commands-and-shortcuts.md#validation-and-acceptance)
and [manual smoke test](../testing/manual-smoke-test.md) for future changes.
