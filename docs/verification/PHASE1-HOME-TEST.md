# Phase 1 home test

This is the shortest complete manual run for the evidence that CI cannot
establish. Run it on the intended four-core integrated-graphics target in
current stable Firefox and Chrome. Allow about 15–20 minutes per browser.

Copy
[the evidence template](../../evidence/phase-1/manual-template.md) before
starting. Record failures as failures; do not leave a row blank or convert an
unobserved check into a pass.

## Before each browser

1. Record the candidate URL and commit, date, reviewer, browser version,
   operating system, CPU/GPU, display scale, viewport, and canvas backing size.
2. Use a clean tab at 100% text zoom. Open Developer Tools, preserve the
   console log, and reload the candidate.
3. Keep the first-use guide open until **Stable frame** appears. Confirm the
   image and controls are visible behind it, then dismiss it.

## Interaction and performance

1. Drag the image. It must visibly follow the pointer before release, then
   progress from a coarse presentation to **Stable frame** at the new center.
2. Start another drag, press **Escape** before releasing, and release the
   pointer. The preview and coordinates must return to their pre-drag state.
3. Draw a zoom area, select a point, change Interior view and Quality, use
   arrow keys, use +/−, press Enter on the canvas, reset with 0, and reach the
   visible **6.00e6×** ceiling. No stale frame may replace the latest request.
4. Repeat quick +/− or arrow-key changes at least 20 times so superseded work
   produces cancellation samples. Export the browser performance marks with:

   ```js
   copy(
     JSON.stringify(
       performance
         .getEntriesByType('mark')
         .filter((entry) => entry.name.startsWith('mi:'))
         .map((entry) => ({
           name: entry.name,
           startTime: entry.startTime,
           detail: entry.detail,
         })),
       null,
       2,
     ),
   );
   ```

5. Record coarse/stable presentation times, cancellation-request to
   cancellation-acknowledgement p95, and every `mi:long-task` duration. Apply
   the budgets in [the Phase 1 TODO](PHASE1-TODO.md).

## Accessibility

1. Tab from the skip link through every control, catalog marker, canvas, and
   disclosure. Focus must remain visible and the order must make sense. Operate
   each primary function from the keyboard.
2. At 200% browser text zoom, repeat the controls, point inspector, error/retry,
   and reset paths. There must be no missing controls or unintended horizontal
   page scrolling.
3. With Orca, NVDA, or another available screen reader, confirm the canvas
   name/instructions, render status, viewport, selected point, outcome, and
   evidence are understandable.
4. Enable native high contrast when available; otherwise record use of browser
   `forced-colors: active` emulation. Confirm focus, selected point, catalog
   shapes, classifications, and retry remain visible.
5. Simulate protanopia, deuteranopia, and tritanopia. In Stability, Multiplier,
   and Period views, confirm escaped, unresolved, selected, and catalog states
   remain distinguishable without hue alone.

## Finish

Confirm the console has no application-origin errors and note any failed or
blocked network request. Save the completed record under
`evidence/phase-1/` with the date and target name. A failure opens follow-up
work; it does not invalidate the useful passing evidence.
