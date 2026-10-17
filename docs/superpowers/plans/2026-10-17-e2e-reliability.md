# E2E Reliability and Marker Target Size Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove the real app bugs behind four flaky browser tests (a Reset/inspection race, a catalog overlay that rebuilds its buttons on every frame, and a drag that survives Reset), make the one test that assumes too much wait on state, and fix the catalog-marker `target-size` axe violation so the 320 px reflow test can run axe.

**Architecture:** Every change is either a small edit in `src/ui/application.ts` / `src/styles.css`, or a state-based wait in `tests/e2e/explorer.spec.ts`. Each fix lands test-first: a deterministic test that fails on the current code (a worker reply held back on purpose, a forced redraw, an axe scan) and then the smallest change that turns it green. No test gets a longer timeout; a wait that guessed at timing becomes a wait on an observable state (`data-render-request-id`, `data-render-stage`, `toBeFocused`, the trace ring).

**Tech Stack:** Vite, TypeScript (strict), Playwright (Chromium and Firefox, headless), `@axe-core/playwright`, Vitest, Prettier, ESLint (`strictTypeChecked`).

**Spec:** `docs/verification/PHASE2-TODO.md` section 0: the "E2E flake watch" item and the "Catalog marker target size at 320 px" item. Read both items before starting. This plan was written after reproducing each failure; the findings are recorded in "Findings" below so that implementers do not re-derive them.

## Findings (read first)

Reproduced on 2026-10-17 against a production preview build (`vite build --mode e2e`), headless, with eight busy-loop processes running beside eight Playwright workers.

| Symptom                                                                                                | Root cause                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | Evidence                                                                                                                                                                                                                                                                                    |
| ------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Chromium "marks and describes arbitrary escaped, attracting, and unresolved points"                    | App race. `resetView` does not invalidate `state.activeInspectionRequestId`, so a slow `inspection` reply that lands after Reset re-fills the evidence and rewrites `#selected-point-status`.                                                                                                                                                                                                                                                                                                 | Reproduced deterministically in both browsers by holding the worker reply (Task 1).                                                                                                                                                                                                         |
| Firefox "pans from a catalog marker, cancels pan with Escape, and stamps the build" (`markerBox` null) | App defect. `updateCatalogOverlay` replaces every marker button on every coarse and stable frame, so the button the test resolved is detached when `boundingBox()` reads it.                                                                                                                                                                                                                                                                                                                  | 5 of 10 runs failed under load before the fix; 0 of 20 after (prototype in a scratch copy).                                                                                                                                                                                                 |
| Firefox "catalog markers are keyboard-selectable and populate evidence"                                | Same defect. `press('Enter')` lands on a button that a frame has just replaced, so keyboard focus is lost and no inspection starts. It is also a real keyboard-user bug: a focused marker loses focus whenever the view redraws.                                                                                                                                                                                                                                                              | A focus probe (focus a marker, force a redraw, `toBeFocused`) fails in both browsers on the current build, passes with the fix.                                                                                                                                                             |
| Chromium "render traces carry delivery provenance…" (`originComputeId` 4 against an expected 2)        | Test assumes too much. It takes "the last completed trace" as the computation the worker's semantic cache holds, then expects the recolor to name it. A later computation can finish in the worker after the page dropped its frames as stale, so the cache then holds that one. Inside one trace the worker cannot disagree with itself (the replay frame and the stable frame come from the same `ActiveRender` object), so `originComputeId` is correct as designed and is not an app bug. | NOT reproduced: 0 failures in 72 whole-test runs, 1800 replay observations and 12 cancel-loop settle checks under load. The cause is therefore a reasoned diagnosis, not a captured failure. Task 5 removes the assumption and adds a permanent diagnostic so a recurrence names its cause. |
| axe `target-size` on "Airplane, period 3" at 320 px                                                    | Not a small hit target (every marker is already 44 px). The 44 px period-4 markers sit 17 px from the Airplane marker and cover it, leaving 13 px of it unobscured. Fails from 320 px to about 440 px wide.                                                                                                                                                                                                                                                                                   | Shrinking the period-4 hit box to the 24 px dot passes axe at every width from 320 to 1100 px, Chromium and Firefox.                                                                                                                                                                        |

Sweep result for "what else should Reset clear": a pan that is still in progress (Reset from the keyboard with `Home` or `0` mid-drag was overwritten by the rest of the gesture; Task 2). Already correct and now pinned by a test: selected point, catalog selection, evidence panel, status line, selection marker, `sel` in the address bar. Deliberately kept by Reset: interior view, quality, catalog visibility, legend isolation (these are not viewport state). Whether Reset should also clear a legend isolation is an owner decision this plan does not make.

## Global Constraints

- `npm run check`, `npm run fixtures:kernel-golden -- --check` and `npx playwright test` pass at the end of every task.
- Implementer commit trailer: `Co-Authored-By: Claude Haiku 5.5 <noreply@anthropic.com>`.
- No headed runs.
- Wait on state, never on a longer timeout. Do not raise any `timeout`, add `waitForTimeout`, or add retries.
- Before `npx playwright test`, make sure no stale preview server holds port 4174 or 5173 (`pgrep -af 'vite preview'` and `pgrep -af 'vite$'` print nothing). `reuseExistingServer` would otherwise test an old build.
- Format with `npx prettier --write <changed files>` before running `npm run check` (printWidth 100, single quotes, trailing commas).
- ESLint runs `strictTypeChecked` with `--max-warnings 0`. If lint rejects a snippet below, make the smallest change that satisfies it and keep the behavior.
- Load recipe (used where a step says "under load"): eight busy loops beside the test run, cleaned up on exit.

  ```bash
  bash -c 'pids=(); for i in 1 2 3 4 5 6 7 8; do (while :; do :; done) & pids+=($!); done; trap "kill ${pids[*]}" EXIT; COMMAND'
  ```

  Replace `COMMAND` with the test command. The machine has 8 cores, so this doubles the load.

## Review Focus

1. An inspection reply that arrives after Reset (slow worker, large quality profile): the page must stay at "No point selected." with an empty evidence panel. Pinned in Task 1.
2. Reset from the keyboard while a pan is in progress: the rest of the gesture must not move the restored view. Pinned in Task 2.
3. A keyboard user focused on a catalog marker when the view redraws (resize, quality change, finished render): focus and the selected marker must survive, and toggling the catalog must not duplicate markers. Pinned in Task 3.
4. Overlapping catalog markers on a phone (320, 375, 430 px): every marker keeps an unobscured 24 by 24 px target and the drawn dot does not change. Pinned in Task 4.
5. A render that finishes in the worker after the page has moved on (its frames dropped as stale): tests and tools must not treat "the last completed trace" as the worker's cached computation. Pinned in Task 5.

---

### Task 1: Reset invalidates a pending inspection

Finding: Chromium "marks and describes arbitrary escaped, attracting, and unresolved points" fails when the inspection reply for the last click lands after the Reset click. The race is in the app, so the test that reproduces it holds the reply on purpose.

**Files:**

- Modify: `tests/e2e/explorer.spec.ts` (helper after `expectNoHorizontalOverflow`, near line 100; test before `'automatically recovers once and offers manual retry after persistent failure'`)
- Modify: `src/ui/application.ts:800-812` (`resetView`)

**Interfaces:**

- Consumes: `state.activeInspectionRequestId: number` (`src/ui/application.ts:66`). `inspectPoint` increments `state.requestId` before assigning it, so real ids start at 1 and `0` never matches a reply (`handleWorkerMessage`, `case 'inspection'`, compares `message.requestId !== state.activeInspectionRequestId`).
- Produces: `holdInspectionReplies(page: Page): Promise<InspectionHold>` in the spec file, used by this task only. `InspectionHold` is `{ start(): Promise<void>; held(): Promise<number>; release(): Promise<void> }`. Call it before `page.goto`.

- [ ] **Step 1: Write the failing test**

Insert this helper after `expectNoHorizontalOverflow` in `tests/e2e/explorer.spec.ts`:

```ts
interface InspectionHold {
  /** Holds back every inspection reply that the renderer sends from now on. */
  readonly start: () => Promise<void>;
  /** How many replies are currently held back. */
  readonly held: () => Promise<number>;
  /** Delivers the held replies to the page, in arrival order. */
  readonly release: () => Promise<void>;
}

interface InspectionHoldState {
  active: boolean;
  readonly held: (() => void)[];
}

type HoldGlobal = typeof globalThis & { __miInspectionHold?: InspectionHoldState };

/**
 * Lets a test delay the renderer's inspection reply on purpose. Call it before
 * `page.goto`: it wraps the page's worker `message` listeners so that, once
 * started, `inspection` messages wait until `release`. Nothing else is held,
 * and no timer is involved.
 */
const holdInspectionReplies = async (page: Page): Promise<InspectionHold> => {
  await page.addInitScript(() => {
    const state: InspectionHoldState = { active: false, held: [] };
    (globalThis as HoldGlobal).__miInspectionHold = state;
    const original = Worker.prototype.addEventListener;
    Worker.prototype.addEventListener = function (
      this: Worker,
      type: string,
      listener: EventListenerOrEventListenerObject,
      options?: boolean | AddEventListenerOptions,
    ): void {
      if (type !== 'message') {
        original.call(this, type, listener, options);
        return;
      }
      const deliver = (event: Event): void => {
        if (typeof listener === 'function') listener.call(this, event);
        else listener.handleEvent(event);
      };
      original.call(
        this,
        type,
        (event: Event) => {
          const data = (event as MessageEvent<{ type?: string } | null>).data;
          if (state.active && data?.type === 'inspection') {
            state.held.push(() => {
              deliver(event);
            });
            return;
          }
          deliver(event);
        },
        options,
      );
    } as typeof Worker.prototype.addEventListener;
  });
  return {
    start: () =>
      page.evaluate(() => {
        const state = (globalThis as HoldGlobal).__miInspectionHold;
        if (state) state.active = true;
      }),
    held: () =>
      page.evaluate(() => (globalThis as HoldGlobal).__miInspectionHold?.held.length ?? 0),
    release: () =>
      page.evaluate(() => {
        const state = (globalThis as HoldGlobal).__miInspectionHold;
        if (!state) return;
        state.active = false;
        for (const deliverHeld of state.held.splice(0)) deliverHeld();
      }),
  };
};
```

Insert this test inside `test.describe('Mandelbrot Interiority explorer', ...)`, immediately before the `'automatically recovers once and offers manual retry after persistent failure'` test:

```ts
test('ignores an inspection reply that arrives after Reset', async ({ page }) => {
  const hold = await holdInspectionReplies(page);
  await page.goto('/');
  await page.getByRole('button', { name: 'Explore', exact: true }).click();
  const canvas = page.getByLabel('Interactive Mandelbrot set');
  const status = page.locator('#selected-point-status');
  const resetButton = page.getByRole('button', { name: 'Reset' });
  await canvas.focus();
  await canvas.press('+');
  await expect(resetButton).toBeEnabled();

  await hold.start();
  await canvas.press('Enter');
  await expect(status).toContainText('Computing evidence');
  await expect.poll(hold.held).toBe(1);

  await resetButton.click();
  await expect(status).toHaveText('No point selected.');
  await hold.release();

  // The held reply has now run through the page's message handler.
  await expect(status).toHaveText('No point selected.');
  await expect(page.locator('.selected-point-marker')).toBeHidden();
  await expect(
    page.getByRole('region', { name: 'Point evidence' }).locator('.inspector__classification'),
  ).toHaveCount(0);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx prettier --write tests/e2e/explorer.spec.ts && npx playwright test tests/e2e/explorer.spec.ts -g "ignores an inspection reply that arrives after Reset"`
Expected: FAIL in chromium and firefox at the second `toHaveText('No point selected.')`, with `Received: "Selected point c = ... Outcome: attracting cycle."`.

- [ ] **Step 3: Write the minimal fix**

In `src/ui/application.ts`, `resetView`, add one line after `delete state.selectedCatalogId;`:

```ts
delete state.selectedPoint;
delete state.selectedCatalogId;
// A reply for the point just cleared must not re-select it (ids start at 1).
state.activeInspectionRequestId = 0;
inspector.clear();
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx playwright test tests/e2e/explorer.spec.ts -g "ignores an inspection reply that arrives after Reset"`
Expected: 2 passed (chromium, firefox).

- [ ] **Step 5: Confirm the original flaky test under load**

Run (load recipe, `COMMAND` below):
`npx playwright test tests/e2e/explorer.spec.ts -g "marks and describes arbitrary" --repeat-each 10 --workers 8`
Expected: 20 passed. (It passed before the fix too, usually; it is the load that made the reply late. This run is the regression record, not the proof; the held-reply test is the proof.)

- [ ] **Step 6: Run the gates**

Run: `npm run check && npm run fixtures:kernel-golden -- --check && npx playwright test`
Expected: all pass.

- [ ] **Step 7: Commit**

```bash
git add tests/e2e/explorer.spec.ts src/ui/application.ts
git commit -m "$(cat <<'EOF'
Fix: Reset invalidates a pending inspection so a late reply cannot re-select the point

A held-reply e2e test reproduces the race deterministically.

Co-Authored-By: Claude Haiku 5.5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: Sweep what else Reset should clear

Finding: with `Home` or `0` pressed during a pan, `resetView` restores the viewport but the pointer session stays alive. The next `pointermove` pans from the session's saved viewport and `pointerup` commits it, so the restored view is overwritten. The other cleared state (selection, evidence, status, marker, `sel` in the address bar) is already correct; one guard test pins it.

**Files:**

- Modify: `tests/e2e/explorer.spec.ts` (two tests, after the Task 1 test)
- Modify: `src/ui/application.ts:800` (`resetView`)

**Interfaces:**

- Consumes: `cancelPointerSession(announce: boolean): void` (`src/ui/application.ts`, defined just below `startPointerSession`). It restores `session.viewport` for a pan, releases pointer capture, clears `pointerSession`, `state.dragging` and the grabbing/selecting classes. It is a function declaration, so it is callable from `resetView`.
- Produces: nothing new.

- [ ] **Step 1: Write the failing test and the guard test**

Insert both tests after the Task 1 test:

```ts
test('Reset from the keyboard ends a drag in progress instead of resuming it', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Explore', exact: true }).click();
  const canvas = page.getByLabel('Interactive Mandelbrot set');
  const view = page.getByLabel('Current view');
  const defaultView = await view.textContent();
  await canvas.focus();
  await canvas.press('+');
  await expect.poll(() => view.textContent()).not.toBe(defaultView);
  const box = await canvas.boundingBox();
  if (!box) throw new Error('canvas has no box');
  const startX = box.x + box.width * 0.3;
  const startY = box.y + box.height * 0.3;

  await page.mouse.move(startX, startY);
  await page.mouse.down();
  await page.mouse.move(startX + 40, startY + 20, { steps: 4 });
  await page.keyboard.press('Home');
  await expect.poll(() => view.textContent()).toBe(defaultView);

  // The rest of the gesture must not pan the restored view.
  await page.mouse.move(startX + 90, startY + 40, { steps: 4 });
  await page.mouse.up();
  await expect(view).toHaveText(defaultView ?? '');
  await expect(page.getByRole('button', { name: 'Reset' })).toBeDisabled();
});

test('Reset clears the selection from the evidence, the marker, and the address bar', async ({
  page,
}) => {
  await page.goto('/?v=1&c=-0.1,0.65&s=0.5&view=stability&q=balanced&sel=-0.1,0.65');
  await expect(page.locator('#selected-point-status')).toContainText('Outcome:', {
    timeout: 10_000,
  });
  await expect(page.locator('.selected-point-marker')).toBeVisible();

  await page.getByRole('button', { name: 'Reset' }).click();

  await expect(page.locator('#selected-point-status')).toHaveText('No point selected.');
  await expect(page.locator('.selected-point-marker')).toBeHidden();
  await expect(
    page.getByRole('region', { name: 'Point evidence' }).locator('.inspector__classification'),
  ).toHaveCount(0);
  await expect(page.locator('.catalog-marker--selected')).toHaveCount(0);
  await expect.poll(() => new URL(page.url()).searchParams.has('sel')).toBe(false);
});
```

- [ ] **Step 2: Run the tests to verify the expected result**

Run: `npx prettier --write tests/e2e/explorer.spec.ts && npx playwright test tests/e2e/explorer.spec.ts -g "Reset from the keyboard ends a drag|Reset clears the selection"`
Expected: `Reset from the keyboard ends a drag in progress instead of resuming it` FAILS in both browsers at its last `toHaveText`/`toBeDisabled` (the view is panned again after the reset). `Reset clears the selection from the evidence, the marker, and the address bar` PASSES: it is a guard for behavior that already works, and says so in its name.

- [ ] **Step 3: Write the minimal fix**

In `src/ui/application.ts`, start `resetView` by ending any gesture in progress, before the viewport is replaced:

```ts
  function resetView(): void {
    // A pan or area selection still in progress would otherwise resume from its saved view.
    cancelPointerSession(false);
    state.viewport = {
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx playwright test tests/e2e/explorer.spec.ts -g "Reset from the keyboard ends a drag|Reset clears the selection"`
Expected: 4 passed.

- [ ] **Step 5: Run the gates**

Run: `npm run check && npm run fixtures:kernel-golden -- --check && npx playwright test`
Expected: all pass.

- [ ] **Step 6: Commit**

```bash
git add tests/e2e/explorer.spec.ts src/ui/application.ts
git commit -m "$(cat <<'EOF'
Fix: Reset from the keyboard ends a drag in progress

The rest of the gesture used to pan the restored view. A guard test pins
what Reset already clears (selection, evidence, marker, address bar).

Co-Authored-By: Claude Haiku 5.5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: Keep the catalog marker buttons across redraws

Finding: `updateCatalogOverlay` runs on every frame and replaces all marker buttons. Anything that holds a button across a frame loses it: keyboard focus, a pending `boundingBox()`, a `press('Enter')`. That is the cause of both Firefox flakes and a keyboard-user bug. The fix keeps one button per visible component and moves it.

**Files:**

- Modify: `tests/e2e/explorer.spec.ts` (two tests, after the Task 2 tests)
- Modify: `src/ui/application.ts:921-974` (`updateCatalogOverlay`; add `createCatalogMarker` and a `catalogMarkers` map next to it)

**Interfaces:**

- Consumes: `COMPONENT_CATALOG`, `CatalogComponent` (already imported, `src/ui/application.ts:17-18`), `complexToPixel`, `button`, `element`, `startPointerSession(event, component)`, `inspectPoint(center, component)`, `updateCatalogSelection()`, `catalogOverlay`, `state.catalogVisible`.
- Produces: `catalogMarkers: Map<string, HTMLButtonElement>` (catalog id to its live button) and `createCatalogMarker(component: CatalogComponent): HTMLButtonElement`, both local to `mountApplication`. DOM contract unchanged: `button.catalog-marker.catalog-marker--period-N[data-catalog-id]`, `aria-label` "Inspect <label>, period N", class `catalog-marker--left-facing` right of 76 % of the width, `catalog-marker--selected` and `aria-current="true"` set by `updateCatalogSelection`.

- [ ] **Step 1: Reproduce the flake before changing anything**

Run (load recipe, `COMMAND` below):
`npx playwright test tests/e2e/explorer.spec.ts -g "pans from a catalog marker|catalog markers are keyboard-selectable" --repeat-each 10 --workers 8 --project=firefox`
Expected: several failures, `expect(received).not.toBeNull()` / `Received: null` at `markerBox`, or the `Main cardioid` heading never appearing. (It failed 5 of 10 in the pans test when this plan was written. If every run passes on a quiet machine, rely on Step 3: the focus test is deterministic.)

- [ ] **Step 2: Write the failing focus test and the guard test**

Insert after the Task 2 tests:

```ts
test('keeps keyboard focus on a catalog marker across a redraw', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Explore', exact: true }).click();
  const explorer = page.locator('#explorer');
  const marker = page.getByRole('button', { name: 'Inspect Main cardioid, period 1' });
  await expect(marker).toBeVisible({ timeout: 20_000 });
  await expect(explorer).toHaveAttribute('data-render-stage', 'stable', { timeout: 20_000 });
  await marker.focus();
  await expect(marker).toBeFocused();

  // A resize forces a redraw: a new request, then its frames.
  const before = Number(await explorer.getAttribute('data-render-request-id'));
  await page.setViewportSize({ width: 1111, height: 700 });
  await expect
    .poll(async () => Number(await explorer.getAttribute('data-render-request-id')))
    .toBeGreaterThan(before);
  await expect(explorer).toHaveAttribute('data-render-stage', 'stable', { timeout: 20_000 });

  await expect(marker).toBeFocused();
});

test('keeps one marker per component and the selection across redraws and toggles', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Explore', exact: true }).click();
  const explorer = page.locator('#explorer');
  const markers = page.locator('.catalog-marker');
  const cardioid = page.getByRole('button', { name: 'Inspect Main cardioid, period 1' });
  await expect(cardioid).toBeVisible({ timeout: 20_000 });
  await expect(explorer).toHaveAttribute('data-render-stage', 'stable', { timeout: 20_000 });
  const total = await markers.count();
  expect(total).toBeGreaterThan(1);

  await cardioid.focus();
  await cardioid.press('Enter');
  await expect(cardioid).toHaveAttribute('aria-current', 'true');
  await expect(page.locator('.catalog-marker[aria-current="true"]')).toHaveCount(1);

  const before = Number(await explorer.getAttribute('data-render-request-id'));
  await page.setViewportSize({ width: 1111, height: 700 });
  await expect
    .poll(async () => Number(await explorer.getAttribute('data-render-request-id')))
    .toBeGreaterThan(before);
  await expect(explorer).toHaveAttribute('data-render-stage', 'stable', { timeout: 20_000 });
  await expect(markers).toHaveCount(total);
  await expect(cardioid).toHaveAttribute('aria-current', 'true');
  await expect(cardioid).toHaveClass(/catalog-marker--selected/);

  const toggle = page.getByRole('button', { name: /Catalog/ });
  await toggle.click();
  await expect(markers).toHaveCount(0);
  await toggle.click();
  await expect(markers).toHaveCount(total);
  await expect(page.locator('.catalog-marker[aria-current="true"]')).toHaveCount(1);
});
```

- [ ] **Step 3: Run the tests to verify the expected result**

Run: `npx prettier --write tests/e2e/explorer.spec.ts && npx playwright test tests/e2e/explorer.spec.ts -g "keeps keyboard focus on a catalog marker|keeps one marker per component"`
Expected: `keeps keyboard focus on a catalog marker across a redraw` FAILS in both browsers at the last `toBeFocused`. `keeps one marker per component and the selection across redraws and toggles` PASSES (a guard for the refactor below).

- [ ] **Step 4: Write the implementation**

In `src/ui/application.ts`, replace the whole `updateCatalogOverlay` function (from `function updateCatalogOverlay(): void {` through its closing `}` just before `const onDocumentKeydown`) with:

```ts
/** One live button per visible catalog component, keyed by catalog id. */
const catalogMarkers = new Map<string, HTMLButtonElement>();

function createCatalogMarker(component: CatalogComponent): HTMLButtonElement {
  const marker = button('', {
    className: `catalog-marker catalog-marker--period-${component.period}`,
    title: `${component.label}, period ${component.period}`,
  });
  marker.dataset['catalogId'] = component.id;
  marker.setAttribute('aria-label', `Inspect ${component.label}, period ${component.period}`);
  marker.append(
    element('span', {
      className: 'catalog-marker__dot',
      attributes: { 'aria-hidden': 'true' },
    }),
    element('span', {
      className: 'catalog-marker__label',
      text: component.label,
    }),
  );
  marker.addEventListener('pointerdown', (event) => {
    startPointerSession(event, component);
  });
  marker.addEventListener('click', (event) => {
    if (event.detail !== 0) return;
    inspectPoint(component.center, component);
  });
  return marker;
}

/**
 * Moves the existing buttons instead of rebuilding them on every frame. A
 * rebuilt button drops keyboard focus and vanishes under a pointer or a
 * test between two reads. Stale buttons are removed first so the survivors
 * keep their order and never move (moving a focused node blurs it).
 */
function updateCatalogOverlay(): void {
  if (!state.catalogVisible) {
    catalogMarkers.clear();
    catalogOverlay.replaceChildren();
    return;
  }
  const size = dimensions();
  const visible: HTMLButtonElement[] = [];
  for (const component of COMPONENT_CATALOG) {
    const point = complexToPixel(state.viewport, size, component.center);
    if (point.x < 0 || point.x > size.width || point.y < 0 || point.y > size.height) {
      catalogMarkers.delete(component.id);
      continue;
    }
    let marker = catalogMarkers.get(component.id);
    if (marker === undefined) {
      marker = createCatalogMarker(component);
      catalogMarkers.set(component.id, marker);
    }
    marker.classList.toggle('catalog-marker--left-facing', point.x / size.width > 0.76);
    marker.style.left = `${(point.x / size.width) * 100}%`;
    marker.style.top = `${(point.y / size.height) * 100}%`;
    visible.push(marker);
  }
  for (const child of [...catalogOverlay.children]) {
    if (!visible.includes(child as HTMLButtonElement)) child.remove();
  }
  let cursor = catalogOverlay.firstElementChild;
  for (const marker of visible) {
    if (marker === cursor) {
      cursor = cursor.nextElementSibling;
    } else {
      catalogOverlay.insertBefore(marker, cursor);
    }
  }
  updateCatalogSelection();
}
```

Notes: `updateCatalogSelection` already sets `catalog-marker--selected` and `aria-current`, so the creation code no longer sets them. If `replaceChildren` from `./dom` becomes unused in `application.ts`, remove it from the import (it is still used by `mountApplication` near line 443, so this should not happen).

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx playwright test tests/e2e/explorer.spec.ts -g "keeps keyboard focus on a catalog marker|keeps one marker per component|catalog markers|pans from a catalog marker|Douady rabbit"`
Expected: all pass in chromium and firefox.

- [ ] **Step 6: Re-run the Step 1 load command**

Run (load recipe): `npx playwright test tests/e2e/explorer.spec.ts -g "pans from a catalog marker|catalog markers are keyboard-selectable" --repeat-each 10 --workers 8`
Expected: 40 passed, 0 failed (20 in the scratch prototype).

- [ ] **Step 7: Run the gates**

Run: `npm run check && npm run fixtures:kernel-golden -- --check && npx playwright test`
Expected: all pass.

- [ ] **Step 8: Commit**

```bash
git add tests/e2e/explorer.spec.ts src/ui/application.ts
git commit -m "$(cat <<'EOF'
Fix: keep catalog marker buttons across redraws

The overlay used to rebuild every marker on each frame, which dropped
keyboard focus and detached the button under a pointer or a test. Both
Firefox marker flakes came from that.

Co-Authored-By: Claude Haiku 5.5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: Catalog marker target size at 320 px, and axe in the reflow test

Finding: the 44 px period-4 markers overlap the Airplane marker (17 px between centres) and leave 13 px of it unobscured. Shrinking the period-4 hit box to its 24 px dot keeps every marker at 24 px or more, unobscured, at every width from 320 to 1100 px. WCAG 2.5.8 (24 by 24 CSS px) is then met by size, not by the spacing exception. The drawn dot (24 px, rotated 45 degrees for period 4) and its label position do not change.

**Files:**

- Modify: `tests/e2e/explorer.spec.ts:786-832` (the `'reflows phone layouts without horizontal overflow or undersized controls'` test)
- Modify: `src/styles.css` (around lines 700-750 and 746-750)

**Interfaces:**

- Consumes: `expectNoAccessibilityViolations(page)` (top of the spec file), `.guidance` (fades out over 150 ms, `visibility` switches at the end), `data-render-stage` on `#explorer`.
- Produces: nothing new.

- [ ] **Step 1: Write the failing test**

In the reflow test, directly after `await expectNoHorizontalOverflow(page, \`${viewport.width}px initial phone layout\`);`, add:

```ts
// The guide fades out for 150 ms: axe must not sample it half transparent.
await expect(page.locator('.guidance')).toBeHidden();
// Catalog markers appear with the first frame and are redrawn until the stable one.
await expect(page.getByRole('button', { name: 'Inspect Airplane, period 3' })).toBeVisible({
  timeout: 20_000,
});
await expect(page.locator('#explorer')).toHaveAttribute('data-render-stage', 'stable', {
  timeout: 20_000,
});
await expectNoAccessibilityViolations(page);
```

Also update the test name's meaning in a comment above it if useful; do not rename it (other documents refer to it).

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx prettier --write tests/e2e/explorer.spec.ts && npx playwright test tests/e2e/explorer.spec.ts -g "reflows phone layouts"`
Expected: FAIL in chromium and firefox: `target-size: All touch targets must be 24px large, or leave sufficient space (button[title="Airplane, period 3"])`, first at the 320 px iteration.

- [ ] **Step 3: Write the fix**

In `src/styles.css`, replace the `.catalog-marker--period-4 .catalog-marker__dot` rule:

```css
/* Period-4 markers sit closest together: their hit target is the 24px dot, so that
   they do not cover their neighbours (WCAG 2.5.8 target size at phone widths). */
.catalog-marker--period-4 {
  width: 1.5rem;
  height: 1.5rem;
}

.catalog-marker--period-4 .catalog-marker__dot {
  inset: 0;
  border-radius: 0;
  transform: rotate(45deg);
}
```

and, directly after the existing `.catalog-marker--left-facing .catalog-marker__label { right: 2.85rem; left: auto; }` rule, add (the smaller box moves the label's anchor by 0.75rem, so the label stays where it was drawn):

```css
.catalog-marker--period-4 .catalog-marker__label {
  left: 2.225rem;
}

.catalog-marker--period-4.catalog-marker--left-facing .catalog-marker__label {
  right: 2.225rem;
  left: auto;
}
```

Check: the dot was `2.75rem - 2 * 0.625rem = 1.5rem`, so `inset: 0` on a `1.5rem` box draws the same dot; the old label offset from the marker centre was `2.85rem - 1.375rem = 1.475rem`, and `2.225rem - 0.75rem` is the same `1.475rem`. The base `.catalog-marker--period-4 .catalog-marker__label { display: none }` rule is unchanged.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx playwright test tests/e2e/explorer.spec.ts -g "reflows phone layouts|first-use flow|forced colors|catalog markers|legend"`
Expected: all pass in chromium and firefox.

- [ ] **Step 5: Repeat the reflow test under load**

Run (load recipe): `npx playwright test tests/e2e/explorer.spec.ts -g "reflows phone layouts" --repeat-each 8 --workers 8`
Expected: 16 passed. (Without the `.guidance` hidden wait, one Firefox run failed `color-contrast` on the half-faded guide; that is why the wait is in Step 1.)

- [ ] **Step 6: Run the gates**

Run: `npm run check && npm run fixtures:kernel-golden -- --check && npx playwright test`
Expected: all pass.

- [ ] **Step 7: Commit**

```bash
git add tests/e2e/explorer.spec.ts src/styles.css
git commit -m "$(cat <<'EOF'
Fix: catalog marker target size at phone widths; run axe in the reflow test

Period-4 markers use their 24px dot as the hit target so they no longer
cover the Airplane marker. The drawn dot and label are unchanged.

Co-Authored-By: Claude Haiku 5.5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: Make the render-trace provenance test wait on state

Finding: the test takes the last completed trace as the worker's cached computation and expects the recolor to name it. That is not an invariant: a later computation can complete in the worker after the page has dropped its frames as stale. `originComputeId` names the computation that produced the pixels, by design, and a replay trace is self-consistent by construction, so the app is right and the test assumes too much. The failure was not reproducible (see Findings), so this task has no failing-first step; it removes the assumption, and makes any recurrence print the whole trace ring.

**Files:**

- Modify: `tests/e2e/explorer.spec.ts` (`settledOriginComputeId` after `renderTraces`/`tracesWith`; `expectInflightReplay`; the test `'render traces carry delivery provenance and two-event cancellation timing'`)

**Interfaces:**

- Consumes: `renderTraces(page): Promise<TraceView[]>`, `TraceView` (fields `requestId`, `computeId?`, `outcome`, `frames[].stage`, `frames[].originComputeId?`), the `data-render-request-id` attribute on `#explorer`, `expectRecolorOf(page, originComputeId)`.
- Produces: `settledOriginComputeId(page: Page): Promise<number>` (test-local). `expectInflightReplay(replayTrace: TraceView | undefined, ring: readonly TraceView[]): void` (the signature gains `ring`, used only in an assertion message).

- [ ] **Step 1: Add the settle helper**

Insert directly before the `/** The latest trace is a one-frame recolor of ...` comment:

```ts
/**
 * Waits until nothing is in flight: the newest closed trace is the request on
 * screen, it completed, and its last frame is stable. Returns the computation
 * the worker's semantic cache then holds, which is what a recolor reports as
 * `originComputeId`. That is the request's own compute, or the origin it
 * reused. It is not the last trace that computed: a later computation can
 * finish in the worker after the page dropped its frames as stale, and then
 * the cache holds that one.
 */
const settledOriginComputeId = async (page: Page): Promise<number> => {
  const newest = async (): Promise<{ trace: TraceView | undefined; onScreen: string | null }> => ({
    trace: (await renderTraces(page)).at(-1),
    onScreen: await page.locator('#explorer').getAttribute('data-render-request-id'),
  });
  await expect
    .poll(
      async () => {
        const { trace, onScreen } = await newest();
        return (
          trace?.outcome === 'completed' &&
          String(trace.requestId) === onScreen &&
          trace.frames.at(-1)?.stage === 'stable'
        );
      },
      { timeout: 10_000 },
    )
    .toBe(true);
  const { trace } = await newest();
  const origin = trace?.computeId ?? trace?.frames.at(-1)?.originComputeId;
  if (origin === undefined)
    throw new Error(`settled trace names no computation: ${JSON.stringify(trace)}`);
  return origin;
};
```

- [ ] **Step 2: Use it, and print the ring on a mismatch**

In `expectInflightReplay`, change the signature and the origin assertion:

```ts
const expectInflightReplay = (
  replayTrace: TraceView | undefined,
  ring: readonly TraceView[],
): void => {
```

```ts
expect(replayFrame?.originComputeId, `trace ring: ${JSON.stringify(ring)}`).toBe(
  replayTrace?.computeId,
);
```

In the test `'render traces carry delivery provenance and two-event cancellation timing'`:

- Directly before `const computedTrace = (await renderTraces(page))`, add `const settledOrigin = await settledOriginComputeId(page);`.
- Replace `await expectRecolorOf(page, computedTrace?.computeId);` with `await expectRecolorOf(page, settledOrigin);`.
- Replace `expectInflightReplay(replayTrace);` with `expectInflightReplay(replayTrace, await renderTraces(page));`.

Keep the `computedTrace` assertions about `computed` frames, `originComputeId` undefined and `workerWallMs`; they test provenance fields, not the cache.

- [ ] **Step 3: Run the test under load**

Run: `npx prettier --write tests/e2e/explorer.spec.ts` then (load recipe)
`npx playwright test tests/e2e/explorer.spec.ts -g "render traces carry" --repeat-each 10 --workers 8`
Expected: 20 passed. If one still fails with `originComputeId` different from `computeId` inside the same trace, the message now carries `trace ring: [...]`: stop, keep that output, and report it; that would mean the worker really disagrees with itself, which is an app race this plan does not fix.

- [ ] **Step 4: Run the gates**

Run: `npm run check && npm run fixtures:kernel-golden -- --check && npx playwright test`
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add tests/e2e/explorer.spec.ts
git commit -m "$(cat <<'EOF'
Tests: provenance test waits for the settled request, prints the trace ring on mismatch

The recolor test no longer assumes the last completed trace is the
computation the worker's semantic cache holds.

Co-Authored-By: Claude Haiku 5.5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 6: Full suite under parallel load, and tick the TODO items

**Files:**

- Modify: `docs/verification/PHASE2-TODO.md:122-138` (the two items under section 0)

**Interfaces:** none.

- [ ] **Step 1: Run the full suite three times under parallel load**

Run (load recipe), in the background with a log, because it takes a long time:

```bash
bash -c 'pids=(); for i in 1 2 3 4 5 6 7 8; do (while :; do :; done) & pids+=($!); done; trap "kill ${pids[*]}" EXIT; npx playwright test --repeat-each 3 --workers 8' 2>&1 | tee /tmp/claude-1000/-home-aaron-int-M-/140a1fea-8eca-4da2-a94f-803b8433b2d1/scratchpad/e2e-reliability-full.log
```

Expected: every test passes on all three repeats, in both browsers and in the pilot projects, with no retries (the config has none locally). Any failure is a finding: do not tick the TODO items; report the test name, the repeat, and the first error lines.

- [ ] **Step 2: Run the other gates once**

Run: `npm run check && npm run fixtures:kernel-golden -- --check`
Expected: pass.

- [ ] **Step 3: Tick the TODO items**

In `docs/verification/PHASE2-TODO.md` change `- [ ] **E2E flake watch.**` to `- [x] **E2E flake watch.**` and append to its text one paragraph (keep lines under 100 columns):

```
      Done 2026-10-17: Reset now invalidates the pending inspection and ends a
      drag in progress; the catalog overlay keeps its marker buttons across
      redraws (the cause of both Firefox flakes and of lost keyboard focus);
      the provenance test waits for the settled request instead of assuming the
      last completed trace is the cached computation, and prints the trace ring
      if `originComputeId` ever disagrees with `computeId` again. The full suite
      passed `--repeat-each 3 --workers 8` beside eight busy loops (log kept in
      the scratchpad). Not run: `--repeat-each 5` on a quiet machine.
```

Change `- [ ] **Catalog marker target size at 320 px.**` to `- [x]` and append: `Done 2026-10-17: period-4 markers use their 24px dot as the hit target; the 320/375/430 px reflow test now runs axe.`

- [ ] **Step 4: Run the gates and commit**

Run: `npx prettier --write docs/verification/PHASE2-TODO.md && npm run check && npm run fixtures:kernel-golden -- --check && npx playwright test`
Expected: all pass.

```bash
git add docs/verification/PHASE2-TODO.md
git commit -m "$(cat <<'EOF'
Docs: tick the E2E flake watch and marker target size items

Co-Authored-By: Claude Haiku 5.5 <noreply@anthropic.com>
EOF
)"
```

---

## Self-Review

- Spec coverage: Reset race (Task 1) and its sweep (Task 2); the four flaky tests (Tasks 1, 3, 5; Findings table); marker target size and axe in the reflow test (Task 4); full suite with `--repeat-each 3` under load and ticking the TODO items (Task 6).
- Known gap: the replay flake was not captured. Task 5 is a reasoned fix with a diagnostic, not a verified one.
- Decision left to the owner: whether Reset should also clear a legend isolation (kept today; see Findings).
- Deviation from the TODO text: it suggests making the "marks and describes" test await the inspection before Reset. That would hide the bug; the test is left alone and Task 1 adds the deterministic held-reply test instead.
