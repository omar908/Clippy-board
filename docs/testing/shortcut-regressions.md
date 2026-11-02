# Shortcut regression contracts

Run the focused suites with:

```sh
npm test -- src/shortcuts.regression.test.ts src/ui/keyboard.regression.test.ts
```

All nine failures from the original baseline are now ordinary passing tests.
There are no expected-failure markers. The contracts cover single execution,
synchronous consumption, exact modifiers, typing/settings contexts, recording,
rebinding, preview forwarding, and consistent button/shortcut actions.

Bindings are now cached and matched synchronously; actions can be asynchronous.
The first two manager tests therefore register cached strings with asynchronous
actions instead of asynchronous binding providers. They still assert one action
per dispatch and consumption before dispatch returns. Settings reload tests
explicitly refresh the cache after simulating a backend update. Separate tests
exercise the actual settings Save handler and its immediate cache update.

Additional suites cover command availability, binding precedence/conflicts,
explicit disabling, nested temporary overrides, registration replacement,
cleanup, in-flight settings loads, and backend failures.
Deleted-tab regressions cover shared Enter/Delete actions, saved Delete overrides,
typing protection, restoring copied items to the top of All, and preserving
Deleted entries when a clipboard write fails.
Native Rust tests reject expired copy targets and preserve Alt+Space while
filtering bare menu activation; the Windows smoke runner checks that a second
launch exits while the original process continues.

The integration suite runs the actual keyboard, settings, controls, history,
command registry, and store code. A synchronous window-dispatch harness exercises propagation
without awaiting listener promises. Minimal element ports model focus, clicks,
and shortcut recording; native Tauri calls are mocked. This is not a full DOM or
an OS-level hotkey test, so a manual Tauri smoke test remains necessary after the
refactor.
