# Cloudflare Pages production observation — 2026-08-12

- Production URL: <https://int-m.pages.dev/>
- Observed production baseline:
  [\`4fce632\`](https://github.com/Aaron-Fine/int-M-/commit/4fce632972e9a7b24be4e48213ddf2e21f94d4fc)
- Source change:
  [PR #8, Improve phone layout and responsive coverage](https://github.com/Aaron-Fine/int-M-/pull/8)
- Post-merge CI:
  [run 31664650043](https://github.com/Aaron-Fine/int-M-/actions/runs/31664650043),
  successful
- Observation environment: managed cloud Chrome; exact branded release version
  and target-device hardware were not exposed

## Production smoke result

The production route loaded with the expected title and reached **Stable
frame**. Direct interaction then:

1. dismissed first-use guidance;
2. selected Main cardioid and populated its point evidence;
3. changed Interior view from Stability to Period;
4. zoomed by keyboard and returned to a stable frame; and
5. reached the visible \`6.00e6×\` ceiling with Zoom in disabled.

No warning or error originated from \`https://int-m.pages.dev\` during the
smoke run. The cloud-browser extension emitted its own metadata errors; those
were excluded because they did not originate from or affect the application.

## Scope

This observation verifies the merged production route and ordinary interaction
for the PR #8 application build. It does not satisfy branded Firefox/Chrome,
real-device pointer cancellation, 200% text zoom, assistive-technology,
color-vision, or target-hardware performance evidence. Repeat the production
observation if later Phase 1 work changes the built application.
