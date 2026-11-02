# Manual smoke test

A repeatable pass over the clipboard history and full-content preview. Run this
before merging a change that touches `src/preview.ts`, `src/main.ts`,
`src-tauri/src/lib.rs`, `src/styles.css`, or the window capabilities.

The preview has two presentations (ADR-0007), so **every preview check should be
done twice**: once in the separate window and once docked (maximized). Bugs tend
to be mode-specific.

---

## 0. Setup

- [ ] Build the release binary (`npm run build` + `cargo build --release`, or the
      Tauri bundler). A plain `cargo build` can embed a stale frontend — see the
      `generate_context!` note in the project history.
- [ ] Start `clippy.exe`. It appears in the tray, no window.
- [ ] Run `scripts/seed-clipboard.ps1` with the app running:
      `powershell -STA -ExecutionPolicy Bypass -File scripts\seed-clipboard.ps1`
      (~30 s; it overwrites the clipboard and leaves `seeding complete` on top).
- [ ] Optionally clear history first for a clean set: the oldest samples fall off
      once the 100-item cap is reached.
- [ ] Note the display setup you are testing on (single/multi-monitor, scaling).

---

## 1. Summon and dismissal

- [ ] `Ctrl+Shift+Space` opens the window near the tray/cursor, search focused.
- [ ] Pressing the hotkey again (or clicking the tray icon) toggles it closed.
- [ ] `Escape` closes it.
- [ ] Clicking outside closes it.
- [ ] With the window pinned, clicking outside does **not** close it.
- [ ] Restart the app: history is still there, newest first.
- [ ] Launch the same executable again with the original hidden, visible, and
      minimized: the original comes forward, the second process exits, and
      there is still only one tray icon and clipboard monitor.

## 2. Selection model

- [ ] Hovering a card moves the highlight to it and opens the preview.
- [ ] Arrow keys move the highlight and update the preview.
- [ ] First arrow press hides the cursor and ignores hover until the pointer
      physically moves.
- [ ] Moving the pointer after arrowing re-engages hover.
- [ ] `Enter` copies the highlighted item and closes the window.
- [ ] Clicking a card copies that card directly.
- [ ] Tap and release `Alt`, then use arrows: selection keeps moving without
      opening the Windows Restore/Move/Size/Close menu. Repeat in the separate
      preview window. `Alt+P` still pins; `Alt+Space` opens the native menu.
- [ ] In Deleted, `Enter` and card clicks restore and copy the item: it leaves
      Deleted and appears at the top of All (below pinned entries). The Restore
      button returns it to its original timestamp position without copying.
      `Delete` removes it permanently; a rebound
      Delete shortcut works too. Pin remains unavailable for Deleted items.
- [ ] A copied/moved item jumps to the top and the highlight follows it.
- [ ] Typing in search filters; the preview follows the new top selection.
- [ ] Hovering window chrome (header, footer, search) never opens the preview.

## 3. Preview — separate window

- [ ] With room on the right, the preview appears right of the window: same top
      edge, same height, ~12 px gap, ~480 px wide.
- [ ] The main window does **not** change size or position.
- [ ] Move the main window: the preview follows without visible lag.
- [ ] Resize the main window: the preview tracks width/height changes.
- [ ] Move the main window near the right screen edge: the preview flips to the
      left and does not cover the list.
- [ ] At a screen edge where neither side fits, the preview docks instead of
      overlapping the list (see §4).
- [ ] The preview never appears on a different monitor than the main window.

## 4. Preview — docked (no room)

- [ ] Maximize (double-click the header): the separate window disappears and the
      panel appears inside the main window on the right; the list narrows.
- [ ] While docked, hover and arrow keys update the panel content.
- [ ] Restore the window: the panel closes and the separate window reappears with
      the same selection.
- [ ] Resize the window wider than `work area − 480 − gap` by dragging the grip:
      it docks; drag back narrower and it undocks.
- [ ] `Escape` and `Enter` work the same while docked.
- [ ] With the window pinned while docked, main stays open on blur.
- [ ] The resize grip stays at the list column's bottom-right, not over the panel.

## 5. Preview content

Text:

- [ ] `Hello, Clippy!` and `clipboard` render without a scrollbar.
- [ ] The 14k prose sample scrolls smoothly; header does not shift.
- [ ] The 2,500-character unbroken line wraps instead of overflowing horizontally.
- [ ] The 23k stress sample renders and scrolls without hanging the UI.
- [ ] Unicode/emoji/RTL sample shows correctly (no tofu or mojibake).
- [ ] Tab-separated table keeps its tabs.
- [ ] JSON, Markdown, SQL, URL, base64 and path-list samples render as plain
      pre-wrapped text.
- [ ] Leading/trailing whitespace is preserved.
- [ ] Header shows plausible character and line counts.

Images:

- [ ] 1×1 and 64×64 upscale to fit the panel without blur artifacts breaking layout.
- [ ] 480×480 and 481×481 both show; the list thumbnail is generated for 481.
- [ ] 1200×800 shows fit-to-panel; click toggles 100% anchored on the click point;
      drag pans while zoomed; click again returns to fit.
- [ ] 2000×120 (wide) and 200×2000 (tall) stay inside the panel.
- [ ] Transparent 600×400 shows correct alpha (no black box).
- [ ] 1024×768 noise (3.1 MB PNG) renders without a long freeze.

Files:

- [ ] Single-file drop shows the filename.
- [ ] Three-file drop lists every path (not just the first three).

## 6. Text selection and copy in the preview

- [ ] Drag-select a subset of text in the separate window preview: selection is
      visible and the window gains focus while the pointer is inside.
- [ ] `Ctrl+C` copies exactly the selected subset (paste elsewhere to confirm).
- [ ] `Shift+Arrow` extends the selection instead of changing the list selection.
- [ ] Moving the pointer back over the main window returns focus there and the
      selection stays usable for traversal.
- [ ] Drag-select inside the docked panel and `Ctrl+C` works the same.

Known asymmetry (accepted): `Ctrl+C` in the preview copies the native selection
but does not add a history entry the way `Enter` does.

## 7. Focus and keyboard hand-off

- [ ] While the pointer is over the main window, arrows move the list and the
      preview updates.
- [ ] Cross the gap into the preview: the preview may take focus, but arrows and
      `Enter` still act on the list (they are forwarded).
- [ ] `Escape` pressed with the pointer in the preview closes the app.
- [ ] Moving from main to preview across the gap does **not** close the preview.
- [ ] After returning to main, traversal still works without clicking.

## 8. Grace close and pinning

- [ ] Leaving the window closes the preview after a short delay (~350 ms).
- [ ] Moving onto the preview inside that delay keeps it open.
- [ ] Leaving the preview closes it after the same delay.
- [ ] Hovering the preview and returning repeatedly keeps working (no desync:
      preview stops updating or refuses to reopen).
- [ ] Pinned: preview stays open while the window stays open.
- [ ] Pinned + alt-tab: the preview floats over other applications (accepted).

## 9. Resize and the hover guard

- [ ] Drag-resize with the grip while a preview is open: no flicker, no stuck
      preview, no jump to whichever card slides under the pointer mid-drag.
- [ ] Immediately after resizing, hover works on the first real pointer move.
- [ ] Shrinking the window so cards reflow does not change the selection on its own.
- [ ] Maximize/unmaximize does not leave the preview in the wrong mode.

## 10. Persistence and history rules

- [ ] Copy a fresh string: it appears at the top immediately.
- [ ] Re-copy a string already in history: it moves to the top without creating a
      duplicate.
- [ ] Restart: history order and pins are preserved.
- [ ] Launch the app with something on the clipboard: it is added only if new,
      and it does not reorder existing entries.
- [ ] Capture past 100 items: oldest entries drop, count stays at 100.
- [ ] Clear history: list empties and the preview closes.

## 11. Multi-monitor and DPI

- [ ] Repeat §3 with the window on a secondary monitor: preview lands on the same
      monitor at the same height.
- [ ] At 125% / 150% scaling, the gap and width stay visually correct (the
      preview is 480 logical px).
- [ ] Mixed-DPI monitors: moving the window between them re-resolves placement
      without leaving the preview the wrong size or off-screen.
- [ ] Maximized on a monitor with a taskbar: docked mode still leaves the list
      usable.

## 12. Accepted behavior (not bugs)

- `Ctrl+C` copies only the selection; it does not bump history.
- A pinned preview stays visible over other applications.
- Docked mode narrows the list by 480 px.
- On a very small display, a docked panel can squeeze the list hard.
