# Shortcut regression baseline

Run the focused suites with:

```sh
npm test -- src/shortcuts.regression.test.ts src/ui/keyboard.regression.test.ts
```

These suites specify behavior to preserve during the command/shortcut refactor.
Production code was not changed to establish this baseline.

Passing checks cover dynamic binding lookup, typing guards in the manager,
settings-input protection, search-focus toggling, preview key forwarding, and
single backend calls from the existing pin and pause buttons.

The following contracts were run as ordinary tests and confirmed to fail before
being marked with Vitest's `it.fails`:

1. One action execution across capture and bubble for an asynchronous binding.
2. Synchronous consumption of a matching key before asynchronous work yields.
3. Distinguishing Ctrl+Shift+P from Ctrl+P.
4. Keeping Delete in the search field from deleting clipboard history.
5. Matching the modifier combination produced by the settings recorder.
6. Reassigning Ctrl+F to pause after rebinding search.
7. Activating the new search binding without toggling focus twice.
8. Making a rebound pause shortcut behave like the pause button.
9. Making the pin shortcut behave like the card's pin button.

`it.fails` executes the assertions; it does not skip them. The expected-failure
count is part of this baseline, not evidence that those behaviors are fixed.
When a fix lands, an unexpected pass fails the suite: remove that test's
`fails` modifier and its known-bug comment, and update this list. Do not invert
assertions to accept the broken behavior. Investigate any changed failure reason
before treating an expected failure as still valid.

The integration suite runs the actual keyboard, settings, controls, history and
store code. A small synchronous window-dispatch harness exercises propagation
without awaiting listener promises. Minimal element ports model focus, clicks,
and shortcut recording; native Tauri calls are mocked. This is not a full DOM or
an OS-level hotkey test, so a manual Tauri smoke test remains necessary after the
refactor.
