# TDD-0003. Adaptive preview sizing

**Status:** Accepted
**Accepted:** 2026-11-02
**Date:** 2026-11-02
**Decision:** [ADR-0009](../adr/0009-adaptive-preview-widths.md)
**Foundation:** [TDD-0002: Preview modules and lifecycle](0002-preview-modules-and-lifecycle.md)

## Sizing policy

| Constraint | Logical pixels |
|---|---:|
| Preferred preview width | 480 (existing `--preview-width` token) |
| Minimum separate/docked preview width | 280 |
| Minimum history width | 360, matching the native main-window minimum |
| App border reserved alongside history | 2 |
| Separate-window gap | 8 |

Try the full preferred width on the right, then left. If neither fits, select the
larger side and use its available width up to the preferred width. Right wins a
tie. If that width is below the minimum, try an in-app column of
`min(preferred, main width - history minimum - border)`. If that also falls below
the preview minimum, use a full-width compact preview with Back to history.

The minimum is initially 280px for manual readability evaluation. This is not a
percentage of screen width. Large monitors do not create oversized previews,
and narrow spaces do not create arbitrarily tiny ones.

## Geometry and scaling

[placement.ts](../../src/placement.ts) receives all dimensions in physical pixels.
It calculates available space against the monitor work area, respects nonzero
and negative monitor origins, rounds native coordinates to whole pixels, and
keeps separate previews inside the horizontal work area without overlapping main.

[preview/geometry.ts](../../src/preview/geometry.ts) scales the preferred/minimum
widths and gap once. Minimums round up so fractional scaling cannot undercut
them; available physical space rounds down. The controller divides a docked
physical width by the same scale before applying it as a CSS logical width.
Native window and monitor positions are never multiplied by scaling again.

For the reported 2560×1600 display at 225%, a centered default main gets roughly
331 logical pixels of separate preview; a centered minimum-width main gets
roughly 381px. Moving toward an edge restores the preferred 480px when it fits.

When monitor information is unavailable, retain the existing preferred-width
right-side fallback. Vertical position/height still mirror main. Handling an
oversized or vertically clipped main window is outside this horizontal experiment.

## Presentation integration

`Placement.docked` continues to distinguish separate from in-app presentation.
An optional `compact: true` flag identifies the in-app replacement view; the
controller keeps its existing `docked` state for both in-app layouts.

- Native separate previews receive resolved physical dimensions through existing
  show/move commands. Width changes reposition/resize without another show.
- The controller calls `view.setLayout` on every docked geometry update, including
  when the mode stays docked. This changes width without rerendering the item.
- The DOM adapter writes a local `--resolved-preview-width`. It never changes the
  preferred root token, avoiding a feedback loop in subsequent calculations.
- Compact mode hides the list column and lets preview fill the main window. A
  dedicated toolbar offers Back to history, which dismisses preview, restores
  history, and clears layout overrides. The current selection remains unchanged.
- Enter on the focused Back button retains native button activation instead of
  triggering the application's copy shortcut. Escape keeps dismissing the app.
- The preview header wraps at narrower widths. Text wraps, images retain fit/zoom,
  and the full file list keeps its existing wrapping/scrolling behavior.

No Rust commands or persistence schema change. The separate preview webview
continues to fill its native window and does not show the compact toolbar.

## Validation

Run `npm test` and `npm run build`. Automated checks cover preferred-side order,
adaptive-side selection/ties, exact minimum fits, below-minimum fallbacks,
offscreen main positions, fractional rounding, and monitor origins. A geometry
matrix covers widths 1024–3840px, scaling 100–300%, and several main sizes and
positions. Cases where main itself cannot fit are excluded from that matrix.

Controller/DOM tests cover growing/shrinking native previews without reopening,
adaptive docked widths, docked/compact transitions, Back cleanup, and CSS unit
conversion. Keyboard coverage protects native Back-button activation. Existing
preview lifecycle and content tests remain in place.

For future changes, repeat the relevant manual checks:

- Center/edges on the reported 225% display; evaluate readability near 331px.
- Movement between monitors with different DPI; no double scaling or overlap.
- Continuous movement near a side tie/minimum threshold; note unwanted flipping.
- Maximize/restore and resizing through separate, docked and compact layouts.
- Back by pointer and keyboard; normal Enter copy and Escape behavior elsewhere.
- Long text, long file paths, image fit/zoom/pan, and header wrapping at minimum width.
- History remains usable when docked; compact mode restores it without losing selection.

**Manual validation:** Accepted on 2026-11-02. Omar tested the build at 225%
scaling, reported that everything works, and approved acceptance, commit, and
push. Automated verification reported 197 passing tests and a passing frontend
build. This does not claim individual manual coverage of every scenario above.
Threshold tuning or side-switch hysteresis can be considered if later testing
shows a need.
