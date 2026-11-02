# ADR-0007. Full-content preview in a separate window, docking inside when there is no room

**Status:** Accepted
**Date:** 2026-10-22
**Deciders:** Omar Estrada
**Implementation design:** [TDD-0002: Preview modules and lifecycle](../tdd/0002-preview-modules-and-lifecycle.md) (accepted 2026-11-02)
**Sizing amendment:** [ADR-0009](0009-adaptive-preview-widths.md), accepted 2026-11-02, replaces the fixed-width/no-room sizing rule below with adaptive widths and compact fallback. Window ownership, focus and lifetime rules remain in effect.
**Related:** supersedes [ADR-0005](0005-full-content-preview-via-window-widening.md); builds on [ADR-0006](0006-suppress-layout-induced-hover-during-resize.md) (hover guard during native resize) and [ADR-0002](0002-popup-hide-on-blur-with-interaction-guard.md) (blur/hide guards); implemented in `src/preview.ts`, `src/main.ts`, `src-tauri/src/lib.rs`, `src-tauri/capabilities/default.json`, `src/styles.css`

## Context

ADR-0005 shipped the preview as an aside panel and predicted its own replacement: widen the main window while the preview is open, and "if the widening feels too blunt … pivot by swapping the geometry adapter". It did feel blunt.

Widening is the most fragile part of that design, and it makes the user's window the thing that moves:

- Every hover changes the main window's size (and near an edge, its position). Restoring that geometry correctly was the largest source of reported bugs in ADR-0005 — flip side, pending restore, maximize/unmaximize, mid-drag restores, restore-after-user-move.
- The window position is user-owned; moving/resizing it as a side effect of pointing at a row is surprising, and it disturbs window-position habits.
- There is no way to read the preview without also changing the window, even though the list column rarely needs its full width while the user is just identifying an item.

Hoping to keep the window untouched, the preview became a **second always-on-top window** positioned beside the main one. That surfaced platform facts the ADR-0005 model never had to answer:

- **A second window needs an ACL entry.** `capabilities/default.json` listed only `"main"`, so the preview window was created but rendered blank with no error. Any new window must be added there.
- **Focus is a shared resource.** A normal second window takes focus on show, which breaks arrow traversal of the main list and hands the list's keyboard to a window that doesn't own the selection.
- **Text selection needs focus.** The preview is the one place the user must be able to drag-select and copy a subset, which requires activation — the opposite of the traversal requirement. Both requirements are real, so activation has to follow the pointer.
- **WebView2 still cannot observe a native hide** (ADR-0005); hide has to stay an explicit Rust → frontend event.
- **Content must be pushed, not pulled.** The preview window cannot read the main window's selection, so the item travels Rust-side (`preview_show` / `preview_update` → `emit_to("preview", …)`).
- **No room is a real state, not an edge case.** Maximize is a live affordance (double-click the header, no titlebar button), and the resize grip allows windows wider than `workArea − 480 − gap`. Clamping the flip position, as the first implementation did, silently moved the preview *on top of the list it was supposed to preview*.

## Decision

1. **Presentation is resolved per geometry, not fixed at compile time.** `computePreviewPlacement` returns either a physical rectangle for the separate window or `docked`. Preference order: **right of the window → left of it → docked inside it**.
   - "Fits" means the whole preview lands inside the monitor's `workArea`. A clamped position that overlaps the main window does **not** count — that was the latent bug in the older flip logic.
   - Docking is the answer to every no-room case (maximized, or simply too wide), so maximize needs no special case. The window is never resized to make room; the list column gives up 480 px and the preview takes it, which is the panel layout ADR-0005 already had.

2. **The main window is the sole owner of preview state.** `open`, the presentation mode (`none | window | docked`), and `renderedId` live in the main webview's module instance. The preview window never self-dismisses: it emits `preview-request-close` and main decides. (Letting each window own its own lifetime caused the preview to stop responding after the pointer crossed into it and back.)

3. **The separate window is non-activating by default and activatable on pointer entry.**
   - Created as `preview`: undecorated, always-on-top, hidden and reused rather than destroyed.
   - Normally carries `WS_EX_NOACTIVATE`, so showing it or moving it never steals focus and traversal stays on the main window.
   - On pointer enter it is made activatable (`preview_set_interactive(true)`) and takes focus so the user can select text; on leave it becomes non-activating again and refocuses main. Focus is therefore only ever in the preview while the pointer is in it.
   - Keys pressed in the preview (arrows, Enter, Escape) are forwarded to main via `preview-forward-key` so navigation keeps working across the focus hand-off.
   - Modifier+arrow is **not** hijacked: `Shift`/`Ctrl`/`Meta`/`Alt` combinations belong to the browser's text selection.

4. **Grace close is coordinated across the window gap.** Moving from main into the preview emits `preview-cancel-close` so main's pending 350 ms grace does not fire in the gap between the two windows. The preview's own departure arms the same grace.

5. **Docked mode reuses the existing in-window panel and renders locally.**
   - The panel that ADR-0005 built (`#preview-panel`, `flex: 0 0 480px`) is still in the main DOM; docking is `classList.add("open")` plus `renderPreviewContent(headerEl, bodyEl, item)` in the main instance.
   - Switching to docked hides the separate window first, which clears `PREVIEW_OPEN` — important, because Rust suppresses main's blur-hide while the preview window is open. Docked preview is part of main, so main must behave normally.
   - Switching back to a window (on unmaximize, or when a resize frees room) shows the window and clears the docked copy.
   - Presentation is re-evaluated on every move/resize, but a mode-preserving reposition only moves the window — it never re-renders content or re-shows.

6. **Geometry tracking is coalesced and detachable.** Move/resize handlers reposition through `requestAnimationFrame` with an in-flight guard (a drag emits far more events than IPC can absorb); the returned unlisten functions are stored and detached when the preview closes.

7. **`PREVIEW_OPEN` means "a separate preview window is visible" — nothing more.** It is set by `preview_show`, cleared by `preview_hide`/hide paths, and is the only thing that suspends main's blur-hide while the preview floats.

## Alternatives considered

- **Keep the widening panel (ADR-0005)** — rejected: it works, but the preview's existence mutates the user's window, and the restore logic was the least reliable code in the project. The main win of the separate window is that opening a preview costs the main window nothing.
- **Separate window only, no docked fallback** — rejected: when there is no room the only options are to overlap the list (what the clamped flip actually did) or to show nothing. Overlapping is worse than the panel it hides.
- **Suppress the preview when maximized / too wide** — rejected: maximize is a normal window state reached by double-clicking the header; silently losing the primary feature there is a poor trade.
- **Disable maximize, or clamp the max window width** — rejected: removes ordinary window behavior to work around a presentation limit, and still leaves the too-wide-by-dragging case.
- **Docked panel as an absolute overlay** — rejected: it either covers the list (can't compare against neighbours) or reserves the same width without giving the preview real room.
- **Force the main window to shrink so the preview fits beside it** — rejected: same class of problem as widening, just in the other direction.

## Consequences

**Positive**
- The main window's geometry is never touched by the preview. All of ADR-0005's expand/restore/flip/maximize bookkeeping is gone.
- The list column keeps its full width while previewing — the point of the separate window.
- The preview is available in every window state, including maximized; the docked fallback is the same 480 px panel users already know, with the list narrowing instead of the window growing.
- Docked text selection needs no focus hand-off at all (same webview), which makes the "copy a subset" flow more robust in exactly the state where the separate window is unavailable.
- `computePreviewPlacement` is now a pure position decision with no side effects, so it can be unit-tested without a window.

**Negative / costs**
- Two windows means two webviews, an ACL entry, focus/activation state, and cross-window events — materially more moving parts than a panel.
- Two render paths (separate window DOM vs docked panel DOM) can drift; they share `renderPreviewContent` to keep formatting identical.
- `PREVIEW_OPEN` and main's blur-hide are coupled by hand: any new hide path must clear the flag, or main will refuse to hide on blur.
- A pinned preview keeps floating over other applications after main loses focus. Accepted (user decision): pinning means "stay open", and the preview is the thing being pinned.
- Docking assumes the main window is wide enough to leave a usable list column. That holds on realistic monitors (no room ⇒ the window is already near work-area width), but a very small display could squeeze the list hard.
- The preview window can take focus on pointer entry. That is deliberate, but it means `Ctrl+C` copies the native selection without the history bump that `Enter` performs — a documented asymmetry, not an oversight.

**Rules for future work**
- Keep preview open/close state in the main instance. The preview window must never dismiss itself; new dismissal paths route through `previewDismiss()`.
- Keep placement decisions in `computePreviewPlacement` (and pure). Do not add window side effects there; `applyPlacement` performs them.
- Route all content rendering through `renderPreviewContent` for both presentations — no per-mode formatting.
- Every new window must be added to `capabilities/default.json` (`windows: ["main", "preview"]`), or it renders blank with no error.
- Any new path that hides or destroys the preview must clear `PREVIEW_OPEN`, and every main-window hide path must still go through `hide_main_window()` (ADR-0005).
- The preview must never call `select_item` or move `selectedIndex`; it reads the selection through `host.getSelected()`. All selection/copy decisions stay in `main.ts`.
- If the two render paths drift, fix the shared renderer rather than special-casing a mode.
