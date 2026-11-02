# ADR-0009. Adaptive preview widths with a compact fallback

**Status:** Accepted
**Accepted:** 2026-11-02
**Date:** 2026-11-02
**Deciders:** Omar Estrada
**Related:** Sizing amendment to [ADR-0007](0007-preview-separate-window-with-dock-fallback.md)
**Design:** [TDD-0003](../tdd/0003-adaptive-preview-sizing.md)

## Context

The fixed 480 logical pixel preview from ADR-0007 docks when neither side can
fit its entire width. On a 2560×1600 display at 225% scaling, even a centered
minimum-width main window cannot fit that preview beside it. Moving the main
window to an edge restores separate presentation. The fit rule is correct, but
the fixed width makes docking unnecessarily common at high scaling.

Docking a fixed-width panel into a narrow main window also leaves too little
room for history. A fixed screen percentage would create different problems on
very large and very small displays. We need readable bounds with available-space
sizing, without changing the user's main-window geometry.

## Decision

1. Prefer a 480 logical pixel separate preview on the right, then left.
2. If neither side fits the preferred width, choose the side with more space
   and shrink to that space, provided the width is at least 280 logical pixels.
   Choose right on an exact tie.
3. If neither side meets the minimum, dock with an adaptive width that retains
   360 logical pixels for history, plus the app's 2px outer border.
4. If both usable columns cannot fit, replace the list temporarily with a compact
   in-app preview and a keyboard-accessible Back to history button.
5. Keep sizes in logical units until the placement boundary, scale once, and
   preserve physical monitor coordinates. Do not resize or move the main window.

The 280px minimum is the initial accepted readability threshold. Main ownership,
preview focus handoff, grace timing, and separate-window event routing from
ADR-0007 remain unchanged. This proposal does not restrict docking to maximized
windows: the fallback still depends on available space.

## Alternatives considered

- **Fixed width:** simple, but reproduces the high-DPI centered docking case.
- **Screen percentage:** easy to calculate, but does not enforce readability or
  account for main-window position and width.
- **Dock only when maximized:** leaves no safe answer when an unmaximized window
  cannot fit a separate preview. It requires another fallback anyway.
- **Shrink without a minimum:** preserves separation at the cost of unreadable
  content. The compact view instead gives the preview the available main width.
- **Move/shrink main to create room:** violates the existing geometry-ownership rule.

## Consequences and acceptance

Separate preview widths vary while moving/resizing main. Content must wrap/fit;
the native preview can be resized without showing it again. Docked widths also
update without rerendering content. Compact view temporarily hides history and
requires Back to restore it. Escape retains its existing window-dismiss behavior.

There is no side-switch hysteresis in this implementation; placement near a tie or
threshold needs native testing. Vertical placement still follows main. The policy
cannot guarantee usability when the main window itself exceeds the monitor's
usable logical area or when monitor data is unavailable.

Omar confirmed on 2026-11-02 that the built application works at 225% scaling
and approved accepting this decision and TDD-0003, committing, and pushing.
Automated verification reported 197 passing tests and a passing frontend build.
This records the reported test outcome rather than a separate manual result for
every resolution, scale factor, and fallback scenario. Retain the
[TDD validation checklist](../tdd/0003-adaptive-preview-sizing.md#validation)
for future regression checks.
