# Browser layout tests

These Playwright tests render the production `index.html`, stylesheet, bootstrap,
commands, keyboard handlers, and preview renderer in headless Chromium. The Vite
configuration under `tests/layout/` substitutes only the native Tauri SDK modules
with deterministic ports. It does not copy the app markup or alter production
startup. The normal Vite/Tauri build uses the real SDK.

## Run locally

```powershell
npm ci
npx playwright install chromium
npm run typecheck:layout
npm run test:layout
```

The test runner starts and stops an isolated Vite server on `127.0.0.1:4174`.
It refuses to reuse an existing server to avoid testing another checkout.
`npm test` continues to run the unit/integration suites in `src`; browser tests
run separately so the two runners do not collect each other's suites.

## Coverage

| Project | CSS viewport | Device pixel ratio | Presentation |
|---|---|---:|---|
| separate-minimum | 280×420 | 1 | Minimum-width separate preview |
| separate-225-percent | 331×560 | 2.25 | Approximate logical width of the reported 225% case |
| separate-preferred | 480×700 | 1.25 | Preferred-width separate preview |
| docked | 700×580 | 1 | Two usable columns |
| compact | 460×580 | 2 | Full-width preview and Back navigation |

Across these cases, assertions check preview/header/control bounds, absence of
unintended horizontal overflow, literal/scrollable long text, all file paths,
image fit and zoom, and accessibility visibility. Main-window cases also exercise
pointer/keyboard Back without copying, selection retention, and resize transitions
between compact and docked using the actual application handlers.
They also check card-click/keyboard restore-and-copy and permanent deletion in
Deleted using the same shared commands as the active history tabs. The Restore
button is checked separately: original timestamp order, without copying.
Settings coverage includes the Ctrl+R Restore default, overrides, and native
Alt+Space forwarding, recording, rebinding, and explicit disabling. The native
key notification and menu display command are simulated at the Tauri boundary;
opening the real Windows menu still requires a native/manual check.
Current-clipboard coverage checks a single readable badge distinct from selection,
no-match startup, status updates while paused, app copying, and narrow cards for
text, long text, images, and files. Clipboard notifications are mocked; native
matching and frontend snapshot/event races have separate unit coverage.
Settings preference cases additionally cover keyboard focus/Tab/Escape,
per-entry resets/default indicators, narrow layouts, All-only pinned filtering,
and simulated Task Manager changes. See
[Settings and startup preferences](settings-preferences.md) for native checks.
Autosave cases cover per-entry wrapping feedback and Retry at 360×420, a fixed
summary, number blur/Enter validation, failed loads, conflicting shortcuts and
atomic resets, delayed/serialized writes, rapid reversals, draft preservation,
and Review/Discard protection on Settings/window close. Failures and delays are
injected only at the mocked native boundary; no real settings file or startup
registration is changed.

Tests fail on browser JavaScript errors and console errors. They use bounding-box
invariants rather than pixel-perfect screenshot baselines, so ordinary cosmetic
changes do not require updating reference images.

## CI and failure diagnostics

The existing Windows CI `test` job typechecks the harness, installs Chromium and
runs `npm run test:layout` on main pushes, PRs targeting main, version-tag runs,
and manual runs. The existing release jobs depend on that job, so a failing
browser layout suite blocks release publication too.

Failures retain screenshots and Playwright traces. CI uploads `playwright-report/`
and `test-results/layout/` as `browser-layout-results` for seven days. Locally,
inspect the HTML report with `npx playwright show-report` or open a trace using
the path printed in the failed test output. Generated reports are gitignored.

## Limits

A Chromium device pixel ratio is not Windows display scaling. The suite uses
representative logical viewport sizes and raster density; it cannot prove native
window positioning, per-monitor DPI transitions, WebView2 focus handoff, tray
behavior, or OS-level shortcuts. Those retain the existing native CDP smoke test
and [manual smoke checks](manual-smoke-test.md).

The broad resolution/scaling matrix remains in `src/preview/geometry.test.ts`.
These browser tests complement it with real CSS layout and DOM interaction. The
separate preview uses an isolated browser page, not a second native app window.
