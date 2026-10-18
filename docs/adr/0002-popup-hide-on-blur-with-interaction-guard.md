# ADR-0002. Popup hides on blur, with a native drag/resize interaction guard

**Status:** Accepted
**Date:** 2026-10-18
**Deciders:** Omar Estrada
**Related:** `ASSESSMENT.md` §4 (Windowing), §5 (Yellow: window focus); implemented in `src-tauri/src/lib.rs` (`USER_INTERACTING`, `defer_hide_until_mouse_up`, `Focused(false)` handler) and `src/main.ts` (`runNativeDrag`)

## Context

Clippy's popup follows a launcher-style interaction model: summoned via `Ctrl+Shift+Space` or the tray, dismissed by clicking anywhere outside (auto-hide on focus loss). This felt right for a fast, out-of-the-way tool — the user never has to close it explicitly.

The spike discovered a conflict: **Windows native drag and resize run a modal message loop.** During the operation, WebView2 reports a focus loss to the app even though the user is actively manipulating the window. The naive auto-hide handler saw that focus loss and hid the window mid-interaction. Observed behaviors during development:

- Resizing an unpinned window hid it immediately on grab.
- Moving an unpinned window either did nothing or hid the window.
- Everything "worked" only when the window was pinned — because pinning explicitly suppresses auto-hide.

Two distinct causes were identified:

1. **Drag/resize we initiate** (`startDragging` / `startResizeDragging` from JS) — the modal loop reports a focus loss; we know it's coming and can flag it.
2. **Drag/resize Windows initiates itself** (the invisible native resize borders on a resizable borderless window, or any OS-level window move) — our JS never runs, so no JS flag can cover it.

A first attempt that awaited an IPC round-trip *before* starting the drag failed: the delay past the mousedown tick caused Windows to discard the drag entirely. The interaction flag must be set fire-and-forget, with the drag started synchronously in the same event.

## Decision

Keep auto-hide on blur, and suppress it through a **two-layer interaction guard** that covers both causes:

1. **JS layer** (`runNativeDrag` in `src/main.ts`): every drag/resize we start is wrapped — `set_interacting(true)` is invoked **fire-and-forget, before** the synchronous `startDragging()` / `startResizeDragging()` call; it is cleared ~150 ms after the operation's promise resolves (delay covers focus events that arrive just after the modal loop unwinds).
2. **Rust layer** (`Focused(false)` handler in `lib.rs`): when a hide is due (unpinned, not interacting, >300 ms since last show), check `GetAsyncKeyState(VK_LBUTTON)`. If the left button is held — the signature of a native modal loop we didn't flag — call `defer_hide_until_mouse_up()`: a background thread waits for button release (5 s safety timeout), settles 80 ms, then hides **only if** the window is still unfocused and still unpinned and not flagged.

Pinning (`IS_PINNED`) remains the explicit user override that suppresses auto-hide entirely.

## Alternatives considered

- **No auto-hide (manual close only)** — rejected: breaks the launcher-style flow the product wants; `Escape` and the close button would still exist but click-outside is the expected behavior for this app class.
- **Hide only after a delay timer, ignore focus** — rejected: would hide while the user is mid-click into the window, and keep it open when they've genuinely moved on; focus is the right signal, it just needs the guard.
- **JS flag only** — rejected: proven insufficient. Windows starts resize loops itself on the native edges of a resizable borderless window; those never reach JS.
- **Disable native edge resize, rely only on the JS grip** — rejected: removes a free, well-understood Windows behavior; edge resize is what users expect.
- **Await `set_interacting` before starting the drag** — rejected empirically: the IPC latency cancels the drag (this was a real regression during the spike, fixed by making the call synchronous).

## Consequences

**Positive**
- Window behaves correctly in all paths: JS-initiated drag, JS-initiated resize, OS-initiated edge resize, native move — pinned or not.
- Auto-hide still works for genuine click-outside dismissal (button is up when focus settles → hide proceeds).

**Negative / maintenance costs**
- This is **custom platform logic with no compiler protection**. Nothing stops a future change from adding a hide path that bypasses the guard, or adding a new interaction that reports focus loss unexpectedly.
- The two layers must stay in sync: `set_interacting` command, the `USER_INTERACTING` static, the 150 ms clear delay, the 80 ms settle delay, and the 5 s timeout are all magic numbers with implicit reasoning (documented here, comments in code).

**Rules for future work**
- **Any new code path that hides the window must go through the guard**: check `IS_PINNED`, `USER_INTERACTING`, and use `defer_hide_until_mouse_up` (or the mouse-button check) instead of a bare `window.hide()` from a focus-loss context.
- **Any new drag/resize-like native operation** (e.g. a future window snapping UI) must be wrapped with `runNativeDrag`.
- Add regression tests around this logic early in the MVP: the failing states are only reproducible by hand today (grab → move → release), which is exactly how the bugs were found last time.
- If the hide delays (150/80/30 ms) ever feel wrong in use, tune them here and update this ADR.
