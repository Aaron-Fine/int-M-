# Dependency review — October 3, 2026

PR #12 failed because `docs/plans/int-m-performance-plan.html` did not match
Prettier formatting. Formatting that file fixed the original failure without
changing application behavior.

## Selection rule

Use stable releases published by **2026-09-27 04:43:31 UTC** (September 26,
10:43:31 p.m. America/Denver), seven days before the request. Prefer the supported
Node 24 LTS line. No prereleases were selected. The cutoff was also applied to
transitive dependencies using `npm update --before=2026-09-27T04:43:31Z`.
All 67 changed or newly added lockfile package versions were separately checked
against npm registry publication timestamps and satisfy that cutoff.

## Direct npm dependencies

Versions are compared with the PR base, `25feec3`.

| Package                | Previous | Selected | Published (UTC) |
| ---------------------- | -------- | -------- | --------------- |
| `@axe-core/playwright` | 4.13.0   | 4.13.0   | 2026-08-11      |
| `@eslint/js`           | 10.0.1   | 10.0.1   | 2026-02-06      |
| `@playwright/test`     | 1.62.1   | 1.63.0   | 2026-09-04      |
| `@types/node`          | 24.13.3  | 24.19.0  | 2026-09-25      |
| `eslint`               | 10.8.1   | 10.11.0  | 2026-09-18      |
| `globals`              | 17.10.0  | 17.12.0  | 2026-09-01      |
| `prettier`             | 3.9.6    | 3.9.9    | 2026-09-23      |
| `typescript`           | 6.0.3    | 6.0.3    | 2026-04-16      |
| `typescript-eslint`    | 8.67.0   | 8.70.1   | 2026-09-21      |
| `vite`                 | 8.2.1    | 8.3.1    | 2026-09-24      |
| `vitest`               | 4.1.10   | 5.0.2    | 2026-09-25      |

Publication dates come from each package's npm registry `time` metadata.

## Runtime and CI dependencies

| Dependency              | Previous     | Selected     | Release date              |
| ----------------------- | ------------ | ------------ | ------------------------- |
| Node.js (LTS)           | 24.18.0      | 24.21.0      | 2026-09-07                |
| npm                     | 11.19.0      | 12.1.0       | 2026-09-22                |
| Python                  | 3.14.6       | 3.14.7       | 2026-08-05                |
| Playwright container    | 1.62.1-noble | 1.63.0-noble | Matches Playwright 1.63.0 |
| actions/checkout        | 7.0.1        | unchanged    | 2026-07-20                |
| actions/setup-node      | 7.0.0        | unchanged    | 2026-07-14                |
| actions/setup-python    | 7.0.0        | unchanged    | 2026-07-20                |
| actions/upload-artifact | 7.0.1        | unchanged    | 2026-04-10                |
| CI OS                   | ubuntu-24.04 | unchanged    | LTS                       |

The four Actions are already on their latest stable releases and retain their
full commit-SHA pins. CI explicitly installs npm 12.1.0 in both jobs so that it
uses the same version as `packageManager`, rather than Node's bundled npm 11.
The Playwright container stays on Noble to match the existing Ubuntu 24.04 base.

Sources: [Node release index](https://nodejs.org/dist/index.json),
[Python release metadata](https://www.python.org/api/v2/downloads/release/?is_published=true),
[npm 12 migration notes](https://github.com/npm/cli/releases/tag/v12.0.0), and the
[checkout](https://github.com/actions/checkout/releases),
[setup-node](https://github.com/actions/setup-node/releases),
[setup-python](https://github.com/actions/setup-python/releases), and
[upload-artifact](https://github.com/actions/upload-artifact/releases) releases.

## Deliberately retained or deferred

- **TypeScript 6.0.3:** TypeScript 7.0.2 satisfies the age rule, but
  `typescript-eslint@8.70.1` and its parser require TypeScript `>=4.8.4 <6.1.0`.
  Keep typed linting supported rather than overriding the peer dependency.
- **Node 26 and corresponding types:** retain the Node 24 LTS runtime and matching
  major version of `@types/node`.
- **Too recent:** Vite 8.3.2, Vitest 5.0.3, ESLint 10.12.0, globals 17.13.0,
  typescript-eslint 8.71.0, npm 12.2.0, and Python 3.14.8 were published after
  the cutoff. Their eligible predecessors were selected.
- **Already current:** `@axe-core/playwright` and `@eslint/js` need no update.

The [Vitest 5 migration guide](https://vitest.dev/guide/migration/) was reviewed;
the existing test configuration and tests need no migration edits. npm 12 blocks
unapproved dependency install scripts by default; `npm install-scripts ls`
reports no packages requiring approval in this dependency tree.

## Validation

- Clean `npm ci` with Node 24.21.0 and npm 12.1.0.
- `npm run check`: formatting, typed linting, all five TypeScript projects,
  generated catalog, high-precision fixtures, 81 unit/worker tests, production build.
- `npm ls --depth=0`: no invalid peer dependencies.
- `npm audit`: zero reported vulnerabilities.
- Local generator checks use Python 3.12.14; CI validates the pinned Python 3.14.7.
- Local Playwright browser downloads returned invalid archives. The PR's
  Chromium/Firefox container job is the browser verification gate.
