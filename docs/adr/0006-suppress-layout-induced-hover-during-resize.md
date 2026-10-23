# 0006. Suppress layout-induced hover while and after a native resize

**Status:** Accepted
**Date:** 2026-10-19
**Deciders:** Omar, agent

## Context

The preview panel opens on card hover and widens the window by 480 px. If the
pointer happens to sit over a card when the window shrinks, the content slides
under the parked cursor. Chromium then re-hit-tests the layout and dispatches a
synthetic `mouseenter` (and `mousemove`) at the new position even though the
pointer never moved — the app saw this as an intentional hover and opened the
panel **mid-drag**, adding 480 px back to the window the user was shrinking.

This reproduces with the custom resize grip (dragging past the 360 px minimum
leaves the cursor over a card) and with native edge resizing (same clamp), so
the grip is not the cause — the grip only makes the geometry easier to reach.

## Decision

`src/main.ts` keeps a `hoverResizeGuard`:

- Armed on every `onResized` that was not caused by our own geometry writes
  (`previewOwnResizeRecently()` in `src/preview.ts` excludes the panel's own
  expand/restore in the last 300 ms, so opening or grace-closing the panel never
  arms it).
- While armed, card `mouseenter` is ignored.
- The guard disarms only when the pointer reports **two distinct positions** in
  `mousemove`. Synthetic re-hit-tests arrive at a single position (or with no
  preceding real move), so they cannot disarm it; real movement does.
- On disarm, the card under the pointer is re-evaluated with
  `document.elementFromPoint` and hovered. The blocked `mouseenter` will not
  fire again while the pointer stays on that card, so without this step the
  preview would stay closed until the pointer left and re-entered.
- Any resize caused by our own geometry writes is excluded, so traversing
  cards right after the panel opens still works immediately.

## Alternatives considered

- **A short time window after resize** (e.g. 400–600 ms): the synthetic
  `mouseenter` fires ~60–70 ms after the layout change, but a slow drag can
  produce hundreds of such events, and a fixed window also swallows deliberate
  hovers. Counting distinct pointer positions is exact for this bug.
- **Deferring one frame**: the synthetic event follows the layout in the same
  task sequence; a frame later it still fires.
- **Asking Rust for the button state in `mouseenter`** (`is_pointer_held`):
  during the native modal loop IPC responses are only delivered after the loop
  ends, so the answer is already `false` by the time the event handler runs.
- **Dismissing the preview on grip `mousedown`**: races the geometry restore
  against the native resize loop and would flash/close the panel on every
  ordinary resize.
- **Removing the grip**: does not remove the bug (native edges have it too) and
  loses the only visible resize affordance on a borderless window.

## Consequences

- Shrinking to the minimum with the cursor over a card no longer opens the
  preview mid-drag or after release.
- After a real resize the user's next pointer movement restores normal hover,
  including on the card already under the cursor.
- The guard is UI-only; no Rust/window state is involved beyond the existing
  `is_pointer_held` gate in ADR-0005.
- Automated tests that "teleport" the cursor (single `SetCursorPos` jumps) do
  not produce two distinct positions and will see hover suppressed; test
  harnesses must glide the pointer in several steps to emulate a real mouse.
