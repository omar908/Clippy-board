# Settings and startup preferences

Settings opens/closes with `Ctrl+,` by default (also configurable). Opening
dismisses an active preview, brings the main window forward, and moves focus to
Back. `Tab`/`Shift+Tab` traverse the form, including shortcut recorders.
`Escape` closes Settings and restores the previous focus. A focused shortcut
recorder captures key combinations instead of invoking them.

## Autosave and feedback

There is no manual Save button or native alert box. Toggles and individual Reset
buttons save immediately. Numbers save on blur or Enter (including when leaving
Settings). Complete shortcuts save after conflict validation; modifier-only keys
are ignored. Reset all shortcuts saves the defaults together in one transaction.

Each affected entry shows Saving…, briefly shows Saved, or keeps a wrapping error
message. Validation errors explain the correction; failed writes offer Retry.
The fixed summary remains visible while scrolling and links to the first setting
needing attention. Loading failures disable editing and offer Retry loading.

Writes are serialized from the last confirmed settings, merging only the field
being saved (shortcuts form one validated group). Invalid or unfinished edits in
other entries are retained, but never written along with an unrelated change.
Slow responses cannot overwrite newer drafts. Effects such as compact mode,
All-tab filtering and shortcut caches update only after confirmed persistence.

Back, Escape, the Settings shortcut/gear and the window close button wait for
pending saves. If an edit is invalid or failed, an inline Review / Discard unsaved
changes choice keeps Settings open. Review focuses the problem; Discard leaves
successfully saved changes intact. Hiding on blur keeps the current form/drafts
in memory; reopening the app window does not discard them.

Every editable setting shows its default and a Customized indicator when its
current form value differs. Its Reset button changes and autosaves only that entry.
Reset all shortcuts affects shortcuts only. Fixed reference rows
(such as the global summon key) remain read-only.

## Start with Windows

Default: Off. The app registers a per-user Windows Run entry named `Clippy-board`
through the compatible Tauri autostart plugin. The executable path is explicitly
quoted for installations in folders containing spaces. Startup uses the existing
hidden-to-tray launch behavior and single-instance guard.

Windows is authoritative: Settings reads the effective registration, including
Task Manager's Startup apps override. Startup is never reapplied automatically
on app launch. Only an explicit edit/reset of Start with Windows updates
registration; an unrelated autosave preserves a concurrent Task Manager change
and refreshes the checkbox from the confirmed result. A settings-file save failure
rolls back a changed startup state and reports errors. No admin rights are needed.

For manual verification, use the installed executable (or keep a portable binary
at its registered path). These checks change your own startup registration:

- Enable Start with Windows and wait for Saved. Check `Clippy-board` in Task Manager's
  Startup apps; sign out/in and verify exactly one tray instance starts hidden.
- Disable it in Task Manager. Launch the app manually and reopen Settings: it
  must show Off. Save another preference and verify startup stays disabled.
- Repeat a Task Manager change while Settings is open, then save an unrelated
  setting: its external state must remain unchanged and the checkbox must refresh.
- Re-enable in Settings, then turn it off and wait for Saved. Verify it no longer launches
  at sign-in. Also test from an installation path containing spaces.
- If a startup write fails, verify its error remains visible and Retry is available.

## Pinned entries in All

Default: On, including migrated settings files. Turning it off changes only the
All list and All count. Pinned and content-type tabs retain pinned entries, as do
their counts. No stored item is modified or deleted. All with only hidden pinned
entries explains that they remain available in Pinned. Clear still protects pins.

Verify the preference after autosave, reopening Settings and restarting the app.

## Automated coverage

`npm test` covers tab filtering, Settings shortcuts, recorder navigation, focus
return, customization status and individual resets. `npm run test:layout` covers
the real Settings DOM at narrow widths, saving/reopening preferences, checkbox
state, keyboard traversal, pinned counts, and simulated concurrent OS changes.
`cargo test --locked --all-targets` covers old-settings migration and startup save
success/rollback behavior. These tests do not enable startup on the developer's
machine or CI runner; Task Manager discovery and sign-in need the manual checks.

## Compact mode

Default: Off, including existing settings files. Enable Compact mode under
Application; it autosaves and applies immediately after success. The per-entry
Reset autosaves Off; startup and other preferences are unaffected.
The saved preference is loaded before the initial history render.

Compact mode reduces main-window header, search, card, footer and Settings
spacing without changing font sizes. Text snippets use one line; image thumbnails
are smaller. Metadata, timestamps, clipboard badges and actions remain available.
File cards retain their existing path summary and count. Full previews retain their
current sizing, complete text/file content, image zoom and adaptive placement.
Window size and Windows display scaling are not changed.

Manual checks:
- Enable and wait for Saved, then return to history: compare how many cards fit, including
  multiline text, images, multiple files, pinned entries and Deleted entries.
- Use arrows, Enter, Delete, Restore and search. Verify selection and the clipboard
  badge remain clear and card buttons still work.
- Open full previews with Home at narrow and wide window sizes; verify full content
  and image zoom remain usable. Resize and try your 225% Windows scaling.
- Reopen Settings and restart the app to confirm the saved choice. Reset Compact
  mode to return to the original layout. Verify a failed write keeps the previous
  layout active until the retry succeeds.

The density browser suite runs through the existing CI layout-test job. It compares
visible-card counts for text/images/files at 360×420 at 100% and 200% device scale,
checks defaults/autosave/Reset behavior, keyboard selection, saved startup state,
clipboard badges, Settings scrolling and full previews. Rust tests cover legacy
settings defaults and serialization of the enabled preference.

## Manual autosave checks

- Try toggles, resets, complete shortcuts and numeric blur/Enter. Verify the
  per-entry indicator and fixed summary in both density modes at minimum width.
- Leave a number empty/out of range or record a conflicting shortcut. Change an
  unrelated setting: it should save without overwriting the invalid draft.
- Use the summary's Review link to find an error below the fold. Try leaving with
  Back, Escape, Ctrl+, the gear and window X. Review/correct, or discard only the
  unsaved change. Previously saved settings must remain applied.
- Make quick consecutive edits, including toggling twice. Restart and confirm
  the last valid choice. Check updated shortcut bindings in the preview window.
- Browser failure-injection tests cover unavailable storage, Retry, slow responses
  and loading failures without touching your real settings or startup registration.
