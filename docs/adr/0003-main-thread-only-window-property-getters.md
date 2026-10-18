# ADR-0003. Window property getters are main-thread-only

**Status:** Accepted
**Date:** 2026-10-18
**Deciders:** Omar Estrada
**Related:** `ASSESSMENT.md` §5 (Yellow: window property getters from background threads), README "Known Limitations"; evidence in `clippy.log`

## Context

Tauri window property getters — `window.hwnd()`, `window.is_visible()`, `window.is_focused()`, `window.position()`, `window.outer_size()` — present synchronous signatures but internally **dispatch a request to the main event loop and wait for the reply**. Called from a background thread (clipboard monitor thread, spawned workers), the reply doesn't arrive in time and the call returns an error instead of a value.

Observed during the spike's diagnostic build, from a post-startup probe running off the main thread:

```
[LOG] Post-startup: HWND = Err(RawHandleError(Unavailable))
[LOG] Post-startup: is_visible = Err(Runtime(FailedToReceiveMessage))
[LOG] Post-startup: position = Err(Runtime(FailedToReceiveMessage))
```

Crucially, the window showed and hid correctly throughout — **only the queries failed**. This makes the trap easy to miss: code appears to work until it silently returns errors, and the failure mode (`FailedToReceiveMessage`) reads like a transient IPC problem rather than a threading mistake.

## Decision

**Window property getters may only be called from the main thread.** Concretely, allowed contexts are:

- Tauri lifecycle/setup code (`setup`, `on_window_event`)
- `#[tauri::command]` handlers (executed on the main thread)
- The main thread itself

Background threads must **not** query window state directly. Instead:

- Track state in process-wide atomics (`IS_PINNED`, `USER_INTERACTING`, `WINDOW_SHOWN_AT`, `WINDOW_POSITIONED` in `lib.rs`) — reads are lock-free and safe from any thread, and this is the established pattern.
- When a background thread genuinely needs to act on the window, prefer fire-and-forget operations that don't await a reply (`window.hide()`, `window.show()`, `window.set_focus()` are safe this way); for operations that *do* return values (like `is_focused()`), either route them back to the main thread, tolerate the error explicitly (`unwrap_or` with a documented assumption), or restructure to avoid the query.
- `defer_hide_until_mouse_up()` in `lib.rs` demonstrates the accepted pattern: a spawned thread waits using atomics for its decision inputs, then touches the window with methods that don't require a reply.

## Alternatives considered

- **Ignore the rule and unwrap everywhere** — rejected: intermittent `FailedToReceiveMessage` errors in production, hard to diagnose (see how the log line reads as an IPC glitch).
- **Add timeouts/retries around the getters** — rejected: masks the underlying design issue; a retry loop on a background thread still competes with the event loop it's waiting on.
- **Never read window state, infer everything from events** — partially adopted: where practical, prefer event-driven state (e.g. `Focused(false)` events over polling `is_focused()`). But the getters remain useful on the main thread, so a blanket ban is unnecessary.
- **Patch/fork Tauri to make getters thread-safe** — rejected: high maintenance cost for a documented ergonomic quirk; upstream behavior is intentional (window state lives with the event loop).

## Consequences

**Positive**
- No more phantom `FailedToReceiveMessage` errors; window state reads are deterministic.
- The atomic-state pattern (`IS_PINNED` et al.) is now the single source of truth for cross-thread window knowledge — it's already how the focus guard ([ADR-0002](0002-popup-hide-on-blur-with-interaction-guard.md)) works.

**Negative / costs**
- Slight friction: writing background logic that "just wants to check if the window is visible" requires an extra step (add an atomic, or restructure).
- Two representations of window state can drift (actual window vs. our atomics) — mitigated because the atomics are only toggled by the same code paths that change the window.

**Rules for future work**
- Code review check: **no window property getter outside main-thread contexts**. If you see `hwnd()`, `is_visible()`, `is_focused()`, `position()` inside `std::thread::spawn`, a clipboard-monitor callback, or any async task — stop and use an atomic or an event instead.
- If a getter must be called somewhere risky, `unwrap_or` with a comment stating the assumed fallback, as in `defer_hide_until_mouse_up`.
- If Tauri later ships thread-safe accessors, revisit this ADR — it exists because of a platform quirk, not a product requirement.
