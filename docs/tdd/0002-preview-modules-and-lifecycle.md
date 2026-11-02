# TDD-0002. Preview modules and lifecycle

**Status:** Accepted
**Accepted:** 2026-11-02
**Related decisions:** [ADR-0007](../adr/0007-preview-separate-window-with-dock-fallback.md),
[ADR-0006](../adr/0006-suppress-layout-induced-hover-during-resize.md),
[ADR-0002](../adr/0002-popup-hide-on-blur-with-interaction-guard.md)

## Scope

Split the preview implementation into independently testable modules while
preserving its application-facing API, rendering, native command names, and
right → left → docked presentation policy. The main window remains the owner of
selection and presentation; the separate preview webview mirrors content and
requests closure. This implements existing decisions rather than adopting a new
docking policy.

The refactor also fixes asynchronous lifecycle races: geometry results completing
after dismissal, late listener registrations, canceled pointer queries, and a
final movement event dropped while a geometry update was already running.

## Module boundaries

| Module under `src/` | Responsibility |
|---|---|
| [preview.ts](../../src/preview.ts) | Stable façade and per-webview composition; explicit disposal |
| [preview/controller.ts](../../src/preview/controller.ts) | Main-window state, content updates, dock/window transitions and serialized native writes |
| [preview/viewer.ts](../../src/preview/viewer.ts) | Mirrored content, readiness handshake and interactive-focus requests from the separate webview |
| [preview/render.ts](../../src/preview/render.ts) | Shared text/image/file rendering, image zoom/pan and drag cleanup |
| [preview/dom.ts](../../src/preview/dom.ts) | DOM elements, CSS width, hover state, docked visibility and renderer lifetime |
| [preview/native.ts](../../src/preview/native.ts) | Tauri geometry, window commands, events and pointer-state adapter |
| [preview/geometry.ts](../../src/preview/geometry.ts) | Logical-to-physical dimension conversion before calling the existing placement resolver |
| [placement.ts](../../src/placement.ts) | Pure right/left/docked fit rules, unchanged by the refactor |
| [preview/tracking.ts](../../src/preview/tracking.ts) | Frame coalescing, movement/resize subscriptions and a trailing update after in-flight work |
| [preview/grace.ts](../../src/preview/grace.ts) | Grace timer, native drag hold, pointer-release polling and cancellation |
| [preview/lifetime.ts](../../src/preview/lifetime.ts) | Ownership of DOM/native listeners, including asynchronous registration |
| [preview/types.ts](../../src/preview/types.ts) | Typed host, native, DOM and scheduler ports |

The controller and viewer accept native/view/scheduler ports. Their tests need
neither a running Tauri app nor module-wide native mocks. The façade integration
suite also exercises the real native and DOM adapters against narrow test ports.

## State and ordering

The controller owns `open`, presentation mode (`none`, `window`, `docked`), the
rendered item ID, and a session generation. Geometry is read outside the native
write queue so slow reads cannot block dismissal. Every result must still belong
to the active generation before it is applied.

Native show/update/move/hide operations are serialized within a controller. A
pending show is followed by a queued hide if dismissal occurred, before a later
session is shown. A native operation already submitted cannot be canceled, but
its completion cannot restore stale controller/DOM state. The current selection
is re-read around asynchronous transitions instead of retaining an old item.

Tracking coalesces movement bursts into animation frames. Events arriving while
an update is in flight mark the session dirty and cause one trailing update.
Stopping cancels queued frames and invalidates callbacks. Listener registrations
that complete after stop/disposal are immediately detached.

The DOM adapter releases image drag listeners before replacing or clearing
content. Main disposes the preview façade on webview unload. `disposePreview()`
also supports explicit teardown; ordinary hide/show reuses the controller and
only stops/restarts geometry tracking.

## Grace and cross-window events

The grace close remains 350ms, the resize quiet hold 150ms (checked after 160ms),
and native pointer polling 150ms with a bounded 30-second polling cycle. Cancel,
dismiss and disposal invalidate outstanding pointer queries and timers.

The separate viewer registers its content listener before announcing
`preview-ready`. Entering preview makes it interactive and sends
`preview-cancel-close`; leaving disables interaction and arms grace. Grace sends
`preview-request-close` to main instead of hiding independently. Main checks its
own hovered surface before honoring that request. `preview-hidden` resets the
viewer and cancels pending grace work.

Background content refreshes never open a closed preview. User selection can
open it. Both docked and separate presentations use the same renderer and
validated clipboard payloads.

## Display scaling and the reported centered docking

Window positions, outer sizes and monitor work areas are already physical
pixels. Only the CSS preview width (480 logical px) and gap (8 logical px) are
multiplied by the current main-window scale factor. Monitor origins are not
scaled a second time.

At 2560×1600 and 225% scaling:

| Quantity | Physical pixels |
|---|---:|
| Preview width | 1080 |
| Gap | 18 |
| Default 460px logical main width | 1035 |
| Space per side with default main centered | 762.5 |
| Minimum 360px logical main width | 810 |
| Space per side with minimum main centered | 875 |

Neither side can fit the fixed-width preview in either centered case, so docking
is required by ADR-0007 even though the main window is not maximized. Moving to
an edge makes sufficient space on the other side. Regression tests reproduce
both behaviors and verify separate placement at lower scales.

This is not a coordinate-conversion bug. Restricting docking to maximized windows
would require another no-room policy, such as shrinking the separate preview,
and a deliberate update to the architectural decision. That policy change is
outside this refactor.

## Validation

Run `npm test` and `npm run build`. Coverage includes background/user-triggered
opening, content updates, dock/window transitions, stale geometry, pending native
show/hide, readiness, listener disposal, timer cancellation, drag holds, movement
coalescing, high-DPI placement, literal/long text, full image sources and file lists.

For future changes, repeat the relevant
[native smoke checks](../testing/manual-smoke-test.md):

- Hover/keyboard selection, copy/dismiss and search refresh.
- Main ↔ preview pointer/focus handoff and grace close across the gap.
- Separate/docked transitions on maximize/restore and resize.
- Native header drag/edge resize, including pausing mid-drag.
- Image zoom/pan, text selection/copy and full file lists in both presentations.
- The reported 2560×1600, 225% centered/edge placements; expect docking when the
  fixed-width preview cannot fit, as explained above.

**Manual validation:** Omar confirmed on 2026-11-02 that the built application
works after manual testing and approved acceptance, commit, and push. Automated
verification reported 156 passing tests and a passing frontend build. This records
the reported outcome rather than a separate result for every scenario above.
The existing 225% docking policy is unchanged; policy alternatives remain separate
follow-up work.
