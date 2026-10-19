# ADR-0005. Full-content preview via main-window widening (aside panel)

**Status:** Accepted
**Date:** 2026-10-18
**Deciders:** Omar Estrada
**Related:** `ASSESSMENT.md` §8 (Next Steps item 2); implemented in `src/preview.ts`, `src-tauri/src/lib.rs` (`hide_main_window`), `src-tauri/capabilities/default.json`

## Context

The list shows only a one-line preview per item, so **large copies are unidentifiable** — several multi-thousand-char text copies or similar screenshots look identical, and the user can't tell which item Enter will restore. The fix is a full-content preview driven by the two selection signals:

- **Hover** — preview the card under the cursor. Hover and keyboard navigation must feel like **one flow with two inputs** (user requirement, 2026-10-18): a single selection state, previewed and copied identically whichever input moved it.
- **Keyboard highlight** — preview the item arrow keys are on, even with the cursor elsewhere.

Two presentation shapes were on the table:

1. **A separate hover window** following the cursor / pinned beside the main window (the classic approach in clipboard managers like ClipboardFusion/Raycast).
2. **An aside panel inside the main window** — the window widens by the panel width while the preview is open.

The user chose by pivot-ease: build whichever is easier to try, then switch away if needed. Shape 2 requires **zero Rust changes**, a seconds-long frontend rebuild loop, and no focus/blur-guard risk (ADR-0002 makes any second-focusable window dangerous — the summon/focus logic would have to be re-validated). Shape 1's renderer, trigger state machine, and zoom code are shape-independent; pivoting later means swapping only the geometry/presentation adapter (~40 lines).

Verified platform facts that constrain the design:

- The webview **cannot observe a native hide**: after `window.hide()`, WebView2 keeps `document.visibilityState === "visible"` (observed in test — `visibilitychange` and `focus`-based fallbacks both failed to fire). The frontend gets no signal that the window went away.
- Window reads (`innerSize`, `outerPosition`, `scaleFactor`, `currentMonitor`, `isMaximized`, `isFocused`) are covered by `core:default`; the writes (`setSize`, `setPosition`) are **not** and need explicit capability entries.

## Decision

1. **Aside panel inside the main window; the window widens while the preview is open.**
   - `PANEL_WIDTH = 480` logical px; expand = `setSize(innerWidth + 480)` via `LogicalSize` (DPI-correct), collapse = restore the cached logical width. Height is never touched.
   - **Edge-flip:** if the widened window would cross the monitor's `workArea` right edge, the **panel flips to the left side** of the list instead: the window grows leftward by exactly the panel width (`currentMonitor().workArea`, physical px), so the list column keeps its exact screen position — like a menu opening leftward near an edge. (An earlier version shifted the whole window left; replaced 2026-10-18 after user testing — moving the list felt wrong when the rest of the window's position is user-controlled.) The flip side is rendered via `order: -1` on the panel; the flipped position is recorded and undone on collapse.
   - **Restore rules (respect the user's own changes):** restore width only if it still equals what we set (if the user resized while the panel was open, their size wins — same rule that position retention follows); restore position only if we shifted it and it hasn't moved since; skip all geometry while maximized (the panel just shows in the wide window; a `pendingRestoreW` applies the restore after unmaximize).
   - Geometry operations are guarded by a busy flag and serialized through one async path; an `onResized` self-heal reconciles maximize/unmaximize transitions with panel state.

2. **Trigger + lifetime: interaction opens, cursor departure closes.**
   - Opens on **card hover** or on arrow-key movement — never on summon, and **never from hovering window chrome** (header, footer, search; user feedback 2026-10-18): the panel only appears where an item is actually pointed at or highlighted.
   - **One selection, two traversals** (user decision 2026-10-18, superseding both the original "hover never changes the copy target" rule and the interim "Enter copies the hovered card" rule): hovering a card **moves the keyboard highlight** to it — the same single state the arrow keys move. The preview always shows the highlight, Enter always copies it, click still copies the clicked card directly. No per-input copy targets, no hover/selection handoff logic.
   - **Keyboard takeover of the mouse:** a stationary cursor re-fires hover after every re-render, which would pin the selection next to the mouse (you couldn't arrow more than one card away — observed in testing). The first arrow key hands control to the keyboard: the cursor is hidden (`cursor: none` on body) and hover updates are ignored until the pointer **physically moves** — re-dispatches at the same coordinates are discarded. A real pointer move re-engages the mouse; hide or focus-loss also ends the takeover.
   - Stays while the cursor is over the window; **350 ms grace** after the cursor leaves, then the panel closes and geometry is restored. Esc / ✕ / Enter-copy restore the geometry **after** the hide resolves, so it happens while the window is invisible.

3. **Rust emits `window-hidden` from a single `hide_main_window(&AppHandle)` helper that every hide path routes through** (`select_item`, `hide_window`, blur-hide, deferred drag-hide, `toggle_window`, close-request). The frontend listens and restores the pre-preview geometry while the window is invisible. This exists solely because of the WebView2 visibility limitation above — without it, blur-hiding a widened window left it permanently wide for the next summon (caught in testing).

4. **`src/preview.ts` is split into three sections — renderer, trigger/lifetime, geometry adapter** — with the geometry section explicitly marked as the one to replace when pivoting. Content rules: full text pre-wrapped + selectable with a 100,000-char render cap and truncation notice; images fit-to-panel with click-to-zoom anchored on the click point (the clicked spot stays under the cursor in both directions), drag or middle-drag to pan when zoomed (with a movement threshold so a plain click still toggles zoom, `margin:auto` centering so both scroll ends stay reachable); files list every path in full (no 3-path cap).

## Alternatives considered

- **Separate hover window (the pivot target)** — rejected *for now*, not forever: the strongest argument is shape-2's rebuild speed, plus it avoids any second window interacting with ADR-0002's focus guards. If the widening feels too blunt (e.g. it disturbs window-position retention habits or resizes feel janky), pivot by swapping the geometry adapter: show a positioned popup window instead of `setSize`, keep everything else.
- **Auto-open the preview on summon** — rejected: makes every summon 940 logical px wide before the user has asked for anything; keeps summon compact and lets the preview be an explicit interaction.
- **Pinning the preview open** (decoupling its lifetime from the cursor) — deferred: user decision, no pinning in v1; the grace delay plus keyboard re-trigger covers identification flows.
- **Rust-side polling / frontend timer to detect hide** — rejected: polling is a smell, and timers can't distinguish "hidden" from "still open, cursor left". An explicit event from the single choke point every hide already passes through is deterministic and testable.
- **Preview popup as an overlay inside the list column** — rejected: an absolutely-positioned overlay either covers the list (can't compare against neighbors) or needs the same width reservation without actually giving the preview room.

## Consequences

**Positive**
- Full content is always one hover/arrow away; identifying which copy to restore is solved without leaving the window.
- Zero focus surface: the panel can never steal keyboard focus (Enter/Esc flow is unaffected by construction), which was the main risk of the separate-window shape.
- `window-hidden` is now the canonical "the window went away" signal available to any future feature that needs to act on hide (not just the preview).

**Negative / costs**
- The window visibly resizes on hover (users may notice cursor-adjacent content shift); mitigated by restoring only when we still own the geometry and by the 480 px panel being a fixed, predictable step.
- More geometry state to keep honest (cached width/position, flip flag, pending-restore, maximize interactions) — concentrated in the geometry adapter with the busy-flag guard and `onResized` self-heal.
- Two new capability permissions (`core:window:allow-set-size`, `core:window:allow-set-position`) — writes only; all reads already come from `core:default`.

**Rules for future work**
- Every new `window.hide()` call site **must** go through `hide_main_window()` — a bare `window.hide()` silently skips the frontend restore (this is what `select_item`, blur, and the tray/close paths were converted to).
- Preview logic must never call `invoke("select_item" | ...)` or manipulate `selectedIndex` — it reads state through `host.getSelected()` only, keeping the preview a pure view of the selection and leaving all selection/copy decisions to `main.ts`.
- If pivoting to a separate hover window: replace only the geometry adapter section (expand/collapse → show/hide + position of the second window) and the panel DOM (aside → popup `<body>` container); the renderer and trigger/lifetime sections should carry over unchanged. That carry-over is the reason this ADR exists — validate it, and if it doesn't hold, record what broke here.
