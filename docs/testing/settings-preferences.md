# Settings and startup preferences

Settings opens/closes with `Ctrl+,` by default (also configurable). Opening
dismisses an active preview, brings the main window forward, and moves focus to
Back. `Tab`/`Shift+Tab` traverse the form, including shortcut recorders.
`Escape` closes Settings and restores the previous focus. A focused shortcut
recorder captures key combinations instead of invoking them; Escape still closes.
Back/closing discards unapplied edits. Save applies changes and keeps Settings open.

Every editable setting shows its default and a Customized indicator when its
current form value differs. Its Reset button changes only that entry and requires
Save to apply. Reset all shortcuts affects shortcuts only. Fixed reference rows
(such as the global summon key) remain read-only.

## Start with Windows

Default: Off. The app registers a per-user Windows Run entry named `Clippy-board`
through the compatible Tauri autostart plugin. The executable path is explicitly
quoted for installations in folders containing spaces. Startup uses the existing
hidden-to-tray launch behavior and single-instance guard.

Windows is authoritative: Settings reads the effective registration, including
Task Manager's Startup apps override. Startup is never reapplied automatically
on app launch. Save updates registration only if the checkbox changed since
Settings opened; an unrelated save preserves a concurrent Task Manager change
and refreshes the checkbox from the confirmed result. A settings-file save failure
rolls back a changed startup state and reports errors. No admin rights are needed.

For manual verification, use the installed executable (or keep a portable binary
at its registered path). These checks change your own startup registration:

- Enable Start with Windows and Save. Check `Clippy-board` in Task Manager's
  Startup apps; sign out/in and verify exactly one tray instance starts hidden.
- Disable it in Task Manager. Launch the app manually and reopen Settings: it
  must show Off. Save another preference and verify startup stays disabled.
- Repeat a Task Manager change while Settings is open, then save an unrelated
  setting: its external state must remain unchanged and the checkbox must refresh.
- Re-enable in Settings, then turn it off and Save. Verify it no longer launches
  at sign-in. Also test from an installation path containing spaces.
- Change the checkbox and close without saving: registration must stay unchanged.

## Pinned entries in All

Default: On, including migrated settings files. Turning it off changes only the
All list and All count. Pinned and content-type tabs retain pinned entries, as do
their counts. No stored item is modified or deleted. All with only hidden pinned
entries explains that they remain available in Pinned. Clear still protects pins.

Verify the preference after Save, reopening Settings and restarting the app.

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
Application and Save to apply. Back/Escape discards unsaved edits. The per-entry
Reset returns it to Off after Save; startup and other preferences are unaffected.
The saved preference is loaded before the initial history render.

Compact mode reduces main-window header, search, card, footer and Settings
spacing without changing font sizes. Text snippets use one line; image thumbnails
are smaller. Metadata, timestamps, clipboard badges and actions remain available.
File cards retain their existing path summary and count. Full previews retain their
current sizing, complete text/file content, image zoom and adaptive placement.
Window size and Windows display scaling are not changed.

Manual checks:
- Enable and Save, then return to history: compare how many cards fit, including
  multiline text, images, multiple files, pinned entries and Deleted entries.
- Use arrows, Enter, Delete, Restore and search. Verify selection and the clipboard
  badge remain clear and card buttons still work.
- Open full previews with Home at narrow and wide window sizes; verify full content
  and image zoom remain usable. Resize and try your 225% Windows scaling.
- Reopen Settings and restart the app to confirm the saved choice. Reset Compact
  mode and Save to return to the original layout. Close without saving to verify
  an edited checkbox does not change the active layout.

The density browser suite runs through the existing CI layout-test job. It compares
visible-card counts for text/images/files at 360×420 at 100% and 200% device scale,
checks default/Save/discard/Reset behavior, keyboard selection, saved startup state,
clipboard badges, Settings scrolling and full previews. Rust tests cover legacy
settings defaults and serialization of the enabled preference.
