# Catalog Schema v2 and Image Regression Implementation Plan

<!-- prettier-ignore-start -->
> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give every catalog entry its validation residual, method and provenance under a stable ray-derived id (keeping the v1 ids as aliases), and gate every semantic view's pixels with deterministic colorized-buffer hashes, backed by advisory browser screenshots.

**Architecture:** A Python combinatorics module (Lavaurs ray pairing, kneading sequences, Schleicher denominators, tuned sub-wakes, ray landing) feeds a rewritten catalog generator that writes `catalog/components.v2.json` from first principles plus a small curation file; a TypeScript schema module validates the file on load and resolves aliases, and unit tests check the mathematics. A Node tool hashes `colorizeFrame` output for three frozen-corpus views in each semantic view, a unit test compares the hashes, and a separate Playwright configuration takes advisory screenshots only inside the pinned Playwright container.

**Tech Stack:** TypeScript 6, Vite 8, Vitest 5, Playwright 1.64.1 (`mcr.microsoft.com/playwright:v1.64.1-noble`), Python 3 standard library (`decimal`, `fractions`, `unittest`), Node 24, npm 12.

**Spec:** `docs/verification/PHASE2-TODO.md`, items "4. Catalog schema and tests" and "5. Semantic and image regression tests", with the owner decisions there (Q6: deterministic colorized-buffer hashes are the gate, browser screenshots are advisory). Also `docs/PLAN.md` §3.3 and §7, ADR 0004, ADR 0007, ADR 0009 (and the owner's ruling that replaced ordinal ids stay as aliases instead of bumping `v`), ADR 0010.

## Global Constraints

- `npm run check`, `npm run fixtures:kernel-golden -- --check` and `npx playwright test` pass at the end of every task.
- Implementer commit trailer: `Co-Authored-By: Claude Haiku 5.5 <noreply@anthropic.com>`.
- No headed runs.
- No new npm or pip dependencies. Generators use the Python standard library only.
- Q6: the colorized-buffer hashes are the image gate. The screenshot suite is advisory: never add it to `npm run check`, to `npx playwright test` (the `tests/e2e/` directory), or to a CI job without `continue-on-error: true`.
- Every v1 catalog id (`mi-p1-main`, `mi-p2-basilica`, `mi-p3-airplane`, `mi-p3-corabbit`, `mi-p3-rabbit`, `mi-p4-01` … `mi-p4-06`) resolves forever. The share-link version stays `v=1`.
- Regenerate a golden (`fixtures/kernel-golden.v1.json`, `fixtures/colorized-golden.v1.json`) only in a step that says so. If a golden test fails anywhere else, stop and report the failing cases; do not regenerate.
- `catalog/components.v2.json` is generated: never edit it by hand except in the one step that tells you to break it on purpose and then restore it.
- Catalog and fixture data stay CC0-1.0; code stays GPL-3.0-only.
- Work on branch `phase-2/core-atlas`. Commit once per task with the message given. Do not push.
- Run every command from the repository root `/home/aaron/int-M-`.
- Start after `docs/superpowers/plans/2026-10-17-e2e-reliability.md` has landed: both plans edit `src/ui/application.ts` and `tests/e2e/explorer.spec.ts`. This plan was verified on a copy of `63fc119`; its edits are given as exact text to find, not line numbers, so they survive that plan's changes. Line numbers in **Files** lists are approximate.

## Review Focus

1. Copying a link after a v1 link (`sel=mi-p2-basilica`) opened the view: a person expects the copied link to work, so it must carry the canonical id `mi-p2-1-2` — Task 3, `catalog aliases (ADR 0011)` in `tests/unit/ui/share-link.test.ts`.
2. Keyboard users tab through catalog markers in file order: regeneration must not reorder them — Task 4, `keeps the v1 order, which is the keyboard focus order of the markers`.
3. Regenerating the catalog on another machine (CI runs Python 3.14.7) must reproduce the committed bytes, or `catalog:check` fails in CI only — Task 2, `test_generation_is_deterministic`, plus the CI `catalog:check` step.
4. A well-formed id that names no component (`sel=mi-p4-1-3`) must be refused with a notice, never guessed — Task 3, the extra `falls back field by field` case.
5. Real-axis centres must be exactly real and conjugate centres exact mirrors, or marker symmetry and conjugate closure break — Task 2, `test_real_centres_are_exactly_real`; Task 4, `is closed under complex conjugation, mirroring rays and angles`.

## File Structure

| File | Responsibility | Task |
| --- | --- | --- |
| `tools/catalog_combinatorics.py` (new) | Exact ray, address and landing combinatorics | 1 |
| `tools/test_catalog_combinatorics.py` (new) | Python unit tests for it | 1 |
| `tools/generate_catalog.py` (rewrite) | Writes and checks schema v2 | 2 |
| `tools/test_generate_catalog.py` (new) | Python unit tests for the generator | 2 |
| `catalog/curation.v2.json` (new) | Reviewed labels and v1 aliases, keyed by canonical id | 2 |
| `catalog/components.v2.json` (generated) | The catalog, schema v2 | 2 |
| `catalog/components.v1.json` (deleted) | — | 3 |
| `src/catalog/schema.ts` (new) | Schema v2 types and the validating parser | 3 |
| `src/catalog/components.ts` (rewrite) | Loads, validates, resolves ids and aliases | 3 |
| `tests/unit/catalog/v1-catalog.ts` (new) | Frozen v1 ids, labels and centres | 3 |
| `tests/unit/catalog/schema.test.ts` (new) | Loader acceptance and rejection | 3 |
| `tests/unit/catalog/catalog.test.ts` (new) | Mathematical invariants of the file | 4 |
| `docs/decisions/0011-catalog-schema-v2-and-stable-ids.md` (new) | The id and schema decision | 3 |
| `tools/generate_colorized_golden.ts` (new) | Computes and writes colorized-buffer hashes | 5 |
| `fixtures/colorized-golden.v1.json` (generated) | The image gate | 5 |
| `tests/unit/render/colorized-golden.test.ts` (new) | Compares the hashes | 5 |
| `playwright.visual.config.ts`, `tests/visual/*` (new) | Advisory screenshot suite | 6 |
| `tools/run-visual-container.sh` (new) | Runs that suite in the pinned container | 6 |
| `fixtures/README.md` (rewrite) | Every fixture and the golden policy | 7 |
| `fixtures/orbit-raster-regression.v1.json` (deleted) | Orphaned, stale since ADR 0007/0010 | 7 |

---

### Task 1: Catalog combinatorics (Python)

Exact combinatorics that the generator needs: Lavaurs' pairing of characteristic rays, kneading sequences, internal addresses, angled internal addresses, and the binary64 ray landing that matches a ray pair to a centre. Angles are numerators over `2^p − 1`.

**Files:**
- Create: `tools/catalog_combinatorics.py`
- Create: `tools/test_catalog_combinatorics.py`
- Modify: `package.json` (scripts `catalog:test` and `check`)
- Modify: `.github/workflows/ci.yml` (quality job)

**Interfaces:**
- Consumes: nothing.
- Produces (Python module `catalog_combinatorics`, imported by `tools/generate_catalog.py` in Task 2):
  - `RayPair = tuple[int, int]`; `@dataclass(frozen=True) AngledStep(from_period: int, to_period: int, numerator: int, denominator: int)`
  - `ray_modulus(period: int) -> int`, `has_exact_ray_period(numerator: int, period: int) -> bool`
  - `lavaurs_pairs(max_period: int) -> dict[int, list[RayPair]]` (period 1 is `[(0, 1)]`)
  - `kneading_sequence(numerator: int, period: int) -> str`, `internal_address(numerator: int, period: int) -> list[int]`
  - `angled_denominator(numerator, period, step_from, step_to) -> int`, `bulb_pair(numerator, denominator) -> RayPair`, `tune_angle(inner, inner_period, outer, outer_period) -> int`
  - `angled_internal_address(numerator: int, period: int, pairs: dict[int, list[RayPair]]) -> list[AngledStep]`
  - `trace_ray_inward(numerator, period, depth) -> complex`, `nucleus_newton(seed: complex, period: int) -> complex`, `landing_center(numerator: int, period: int) -> complex`
  - npm script `catalog:test` = `python3 -m unittest discover -s tools -p 'test_*.py'`

- [ ] **Step 1: Write the failing test**

Create `tools/test_catalog_combinatorics.py`:

```python
"""Tests for tools/catalog_combinatorics.py (run: npm run catalog:test)."""

from __future__ import annotations

import unittest

from catalog_combinatorics import (
    AngledStep,
    angled_internal_address,
    bulb_pair,
    has_exact_ray_period,
    internal_address,
    kneading_sequence,
    landing_center,
    lavaurs_pairs,
    ray_modulus,
)

# Hyperbolic components of exact period p (OEIS A000740), p = 1..12; they sum to 4,016.
COMPONENT_COUNTS = [1, 1, 3, 6, 15, 27, 63, 120, 252, 495, 1023, 2010]


def step(from_period: int, to_period: int, numerator: int, denominator: int) -> AngledStep:
    return AngledStep(from_period, to_period, numerator, denominator)


class RayPeriodTest(unittest.TestCase):
    def test_exact_ray_period_excludes_divisor_periods(self) -> None:
        self.assertTrue(has_exact_ray_period(1, 4))  # 1/15
        self.assertFalse(has_exact_ray_period(5, 4))  # 5/15 = 1/3 has period 2
        self.assertFalse(has_exact_ray_period(0, 3))  # 0 has period 1
        self.assertTrue(has_exact_ray_period(3, 4))  # 3/15 = 1/5 has period 4


class LavaursTest(unittest.TestCase):
    def test_low_period_pairs(self) -> None:
        pairs = lavaurs_pairs(4)
        self.assertEqual(pairs[1], [(0, 1)])
        self.assertEqual(pairs[2], [(1, 2)])
        self.assertEqual(pairs[3], [(1, 2), (3, 4), (5, 6)])
        self.assertEqual(pairs[4], [(1, 2), (3, 4), (6, 9), (7, 8), (11, 12), (13, 14)])

    def test_pair_counts_match_the_component_counts(self) -> None:
        pairs = lavaurs_pairs(8)
        self.assertEqual([len(pairs[p]) for p in range(1, 9)], COMPONENT_COUNTS[:8])

    def test_every_exact_period_angle_is_paired_once(self) -> None:
        pairs = lavaurs_pairs(7)
        for period in range(2, 8):
            angles = sorted(angle for pair in pairs[period] for angle in pair)
            expected = [
                n for n in range(1, ray_modulus(period)) if has_exact_ray_period(n, period)
            ]
            self.assertEqual(angles, expected, f"period {period}")


class AddressTest(unittest.TestCase):
    def test_kneading_sequences(self) -> None:
        self.assertEqual(kneading_sequence(1, 2), "1*")  # 1/3
        self.assertEqual(kneading_sequence(1, 3), "11*")  # 1/7, rabbit
        self.assertEqual(kneading_sequence(3, 3), "10*")  # 3/7, airplane

    def test_internal_addresses_of_the_reviewed_v1_entries(self) -> None:
        self.assertEqual(internal_address(0, 1), [1])
        self.assertEqual(internal_address(1, 2), [1, 2])
        self.assertEqual(internal_address(3, 3), [1, 2, 3])
        self.assertEqual(internal_address(1, 3), [1, 3])
        self.assertEqual(internal_address(5, 3), [1, 3])
        self.assertEqual(internal_address(6, 4), [1, 2, 4])

    def test_angled_addresses_through_period_four(self) -> None:
        pairs = lavaurs_pairs(4)
        expected = {
            (1, 2): [step(1, 2, 1, 2)],
            (1, 3): [step(1, 3, 1, 3)],
            (3, 3): [step(1, 2, 1, 2), step(2, 3, 1, 2)],
            (5, 3): [step(1, 3, 2, 3)],
            (1, 4): [step(1, 4, 1, 4)],
            (3, 4): [step(1, 3, 1, 3), step(3, 4, 1, 2)],
            (6, 4): [step(1, 2, 1, 2), step(2, 4, 1, 2)],
            (7, 4): [step(1, 2, 1, 2), step(2, 3, 1, 2), step(3, 4, 1, 2)],
            (11, 4): [step(1, 3, 2, 3), step(3, 4, 1, 2)],
            (13, 4): [step(1, 4, 3, 4)],
        }
        for (numerator, period), steps in expected.items():
            self.assertEqual(
                angled_internal_address(numerator, period, pairs),
                steps,
                f"{numerator}/{ray_modulus(period)}",
            )

    def test_angled_addresses_are_injective_and_conjugation_symmetric(self) -> None:
        # Schleicher: the angled internal address determines the component.
        pairs = lavaurs_pairs(8)
        for period in range(2, 9):
            modulus = ray_modulus(period)
            seen: dict[tuple[AngledStep, ...], tuple[int, int]] = {}
            for lower, upper in pairs[period]:
                address = tuple(angled_internal_address(lower, period, pairs))
                self.assertNotIn(address, seen, f"{lower}/{modulus} repeats {seen.get(address)}")
                seen[address] = (lower, upper)
                conjugate = angled_internal_address(modulus - upper, period, pairs)
                mirrored = [
                    step(s.from_period, s.to_period, s.denominator - s.numerator, s.denominator)
                    for s in address
                ]
                self.assertEqual(conjugate, mirrored, f"conjugate of {lower}/{modulus}")

    def test_bulb_pairs(self) -> None:
        self.assertEqual(bulb_pair(1, 2), (1, 2))
        self.assertEqual(bulb_pair(1, 3), (1, 2))
        self.assertEqual(bulb_pair(2, 3), (5, 6))
        self.assertEqual(bulb_pair(2, 5), (9, 10))


class LandingTest(unittest.TestCase):
    def test_both_rays_of_a_pair_land_on_one_exact_period_centre(self) -> None:
        pairs = lavaurs_pairs(6)
        for period in range(2, 7):
            centres = []
            for lower, upper in pairs[period]:
                centre = landing_center(lower, period)
                self.assertLess(abs(centre - landing_center(upper, period)), 1e-9)
                centres.append(centre)
            for index, centre in enumerate(centres):
                for other in centres[index + 1 :]:
                    self.assertGreater(abs(centre - other), 1e-6, f"period {period}")

    def test_known_centres(self) -> None:
        self.assertEqual(landing_center(0, 1), 0j)
        self.assertLess(abs(landing_center(1, 2) - (-1)), 1e-12)
        self.assertLess(abs(landing_center(3, 3) - (-1.7548776662466927)), 1e-12)
        rabbit = complex(-0.12256116687665362, 0.7448617666197442)
        self.assertLess(abs(landing_center(1, 3) - rabbit), 1e-12)


if __name__ == "__main__":
    unittest.main()
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `python3 -m unittest discover -s tools -p 'test_*.py'`
Expected: FAIL — `ImportError: Failed to import test module: test_catalog_combinatorics` with `ModuleNotFoundError: No module named 'catalog_combinatorics'`.

- [ ] **Step 3: Write the implementation**

Create `tools/catalog_combinatorics.py`:

```python
"""Exact combinatorics of hyperbolic components for the catalog generator.

Every angle is an exact rational. A characteristic angle of a period-p
component is stored as its numerator over 2**p - 1, so the pair (p, numerator)
names it exactly. The main cardioid's root angle is 0; following Lavaurs it is
treated as the pair (0/1, 1/1).

References: P. Lavaurs, "Une description combinatoire de l'involution definie
par M sur les rationnels a denominateur impair" (1986), for the ray pairing;
D. Schleicher, "Internal addresses of the Mandelbrot set and Galois groups of
polynomials" (Arnold Math. J. 2017), for kneading sequences, internal
addresses and the denominators of angled internal addresses.

This module is application source code, licensed under GPL-3.0-only.
"""

from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass
from fractions import Fraction
import cmath
import math

RayPair = tuple[int, int]


@dataclass(frozen=True)
class AngledStep:
    from_period: int
    to_period: int
    numerator: int
    denominator: int


def ray_modulus(period: int) -> int:
    """2**period - 1: the denominator of every characteristic angle of that period."""
    return (1 << period) - 1


def has_exact_ray_period(numerator: int, period: int) -> bool:
    """True when numerator / (2**period - 1) has exact period `period` under doubling."""
    modulus = ray_modulus(period)
    return all(
        (numerator * ray_modulus(divisor)) % modulus != 0
        for divisor in range(1, period)
        if period % divisor == 0
    )


def _arcs_cross(left: tuple[Fraction, Fraction], right: tuple[Fraction, Fraction]) -> bool:
    (a, b), (c, d) = left, right
    return a < c < b < d or c < a < d < b


def lavaurs_pairs(max_period: int) -> dict[int, list[RayPair]]:
    """Characteristic ray pairs per period, as numerators over 2**p - 1.

    Lavaurs' algorithm: for p = 2, 3, ..., join each unpaired angle of exact
    period p, smallest first, to the next unpaired one whose chord crosses no
    earlier chord. The pairs are listed by increasing lower angle.
    """
    if max_period < 1:
        raise ValueError("max_period must be at least 1")
    chords: list[tuple[Fraction, Fraction]] = [(Fraction(0), Fraction(1))]
    pairs: dict[int, list[RayPair]] = {1: [(0, 1)]}
    for period in range(2, max_period + 1):
        modulus = ray_modulus(period)
        free = [n for n in range(1, modulus) if has_exact_ray_period(n, period)]
        period_pairs: list[RayPair] = []
        while free:
            lower = free.pop(0)
            for index, upper in enumerate(free):
                chord = (Fraction(lower, modulus), Fraction(upper, modulus))
                if not any(_arcs_cross(chord, earlier) for earlier in chords):
                    chords.append(chord)
                    period_pairs.append((lower, upper))
                    free.pop(index)
                    break
            else:
                raise RuntimeError(f"angle {lower}/{modulus} has no Lavaurs partner")
        pairs[period] = period_pairs
    return pairs


def kneading_sequence(numerator: int, period: int) -> str:
    """nu_1 ... nu_p of theta = numerator / (2**p - 1), as '0', '1' and '*'.

    nu_k is 1 when 2**(k-1) theta lies in (theta/2, (theta+1)/2), 0 when it
    lies outside, and * on either boundary. Units of 1/(2(2**p - 1)) keep it exact.
    """
    modulus = ray_modulus(period)
    lower, upper = numerator, numerator + modulus
    symbols: list[str] = []
    angle = numerator
    for _index in range(period):
        doubled = 2 * angle
        if doubled in (lower, upper):
            symbols.append("*")
        elif lower < doubled < upper:
            symbols.append("1")
        else:
            symbols.append("0")
        angle = doubled % modulus
    return "".join(symbols)


def _rho_function(kneading: str) -> Callable[[int], int]:
    period = len(kneading)

    def symbol(index: int) -> str:
        return kneading[(index - 1) % period]

    def rho(start: int) -> int:
        candidate = start + 1
        while candidate < period and symbol(candidate) == symbol(candidate - start):
            candidate += 1
        return candidate

    return rho


def internal_address(numerator: int, period: int) -> list[int]:
    """Internal address 1 -> S_1 -> ... -> period, from the kneading sequence."""
    if period == 1:
        return [1]
    rho = _rho_function(kneading_sequence(numerator, period))
    address = [1]
    while address[-1] < period:
        address.append(rho(address[-1]))
    return address


def angled_denominator(numerator: int, period: int, step_from: int, step_to: int) -> int:
    """Schleicher's denominator q_k of the angle at S_k = step_from.

    With r in {1, ..., S_k} congruent to S_{k+1} mod S_k:
    q_k = (S_{k+1} - r) / S_k + 1 if S_k is in the rho-orbit of r, else + 2.
    """
    rho = _rho_function(kneading_sequence(numerator, period))
    remainder = step_to % step_from or step_from
    orbit = {remainder}
    current = remainder
    while current < period:
        current = rho(current)
        orbit.add(current)
    offset = 1 if step_from in orbit else 2
    return (step_to - remainder) // step_from + offset


def bulb_pair(numerator: int, denominator: int) -> RayPair:
    """Characteristic pair of the numerator/denominator bulb of the main cardioid.

    Its angles form the doubling cycle of rotation number numerator/denominator;
    the pair is the two cycle points bounding the shortest gap.
    """
    modulus = ray_modulus(denominator)
    for start in range(1, modulus):
        orbit = [(start << shift) % modulus for shift in range(denominator)]
        if len(set(orbit)) != denominator:
            continue
        ordered = sorted(orbit)
        rotation = (ordered.index(orbit[1]) - ordered.index(orbit[0])) % denominator
        if rotation != numerator:
            continue
        gaps = [
            ((ordered[(index + 1) % denominator] - ordered[index]) % modulus, index)
            for index in range(denominator)
        ]
        _gap, index = min(gaps)
        return ordered[index], ordered[(index + 1) % denominator]
    raise ValueError(f"no bulb with rotation number {numerator}/{denominator}")


def tune_angle(inner: int, inner_period: int, outer: RayPair, outer_period: int) -> int:
    """Douady-Hubbard tuning: replace each binary digit 0/1 of `inner` by `outer`'s blocks."""
    lower, upper = outer
    tuned = 0
    for digit in format(inner, f"0{inner_period}b"):
        tuned = (tuned << outer_period) | (upper if digit == "1" else lower)
    return tuned


def _in_closed_wake(angle: Fraction, pair: RayPair, period: int) -> bool:
    modulus = ray_modulus(period)
    return Fraction(pair[0], modulus) <= angle <= Fraction(pair[1], modulus)


def angled_internal_address(
    numerator: int,
    period: int,
    pairs: dict[int, list[RayPair]],
) -> list[AngledStep]:
    """Angled internal address of the period-p component whose lower angle is given.

    Denominators follow Schleicher's formula. Each numerator is the internal
    angle of the sub-wake of component S_k that contains theta: the wake of
    the tuned numerator/denominator bulb, found by search. `pairs` must hold
    every period up to `period` (lavaurs_pairs).
    """
    address = internal_address(numerator, period)
    theta = Fraction(numerator, ray_modulus(period))
    component: RayPair = (0, 1)
    steps: list[AngledStep] = []
    for step_from, step_to in zip(address, address[1:]):
        denominator = angled_denominator(numerator, period, step_from, step_to)
        found = None
        for candidate in range(1, denominator):
            if math.gcd(candidate, denominator) != 1:
                continue
            bulb = bulb_pair(candidate, denominator)
            satellite = (
                tune_angle(bulb[0], denominator, component, step_from),
                tune_angle(bulb[1], denominator, component, step_from),
            )
            if _in_closed_wake(theta, satellite, denominator * step_from):
                found = candidate
                break
        if found is None:
            raise RuntimeError(
                f"no sub-wake of period {step_from} contains {numerator}/{ray_modulus(period)}"
            )
        steps.append(AngledStep(step_from, step_to, found, denominator))
        # Wakes of equal period can nest (6/15-9/15 holds 7/15-8/15): take the innermost.
        component = max(
            (pair for pair in pairs[step_to] if _in_closed_wake(theta, pair, step_to)),
            key=lambda pair: pair[0],
        )
    return steps


def trace_ray_inward(numerator: int, period: int, depth: int) -> complex:
    """Binary64 point on the parameter ray of angle numerator / (2**p - 1).

    Follows the ray from potential radius 65536 inward by Newton steps on
    f_c^k(0) = r e^{2 pi i 2^(k-1) theta}, eight radii per iteration depth.
    Used only to match a ray pair to a centre; the centre itself is refined
    separately.
    """
    radius = 65536.0
    sharpness = 8
    modulus = ray_modulus(period)
    parameter = cmath.rect(radius, 2 * math.pi * numerator / modulus)
    angle = numerator
    for depth_index in range(1, depth + 1):
        for sub_step in range(sharpness):
            target = cmath.rect(
                radius ** (0.5 ** ((sub_step + 1) / sharpness)),
                2 * math.pi * angle / modulus,
            )
            for _newton in range(64):
                value = 0j
                derivative = 0j
                for _iteration in range(depth_index):
                    derivative = 2 * value * derivative + 1
                    value = value * value + parameter
                update = (value - target) / derivative
                parameter -= update
                if abs(update) < 1e-15 * (1 + abs(parameter)):
                    break
        angle = (2 * angle) % modulus
    return parameter


def nucleus_newton(seed: complex, period: int) -> complex:
    """Binary64 Newton iteration for f_c^period(0) = 0 from `seed`."""
    parameter = seed
    for _iteration in range(200):
        value = 0j
        derivative = 0j
        for _step in range(period):
            derivative = 2 * value * derivative + 1
            value = value * value + parameter
        update = value / derivative
        parameter -= update
        if abs(update) < 1e-15:
            break
    return parameter


def landing_center(numerator: int, period: int) -> complex:
    """Approximate centre of the component whose root the ray lands on."""
    if period == 1:
        return 0j
    return nucleus_newton(trace_ray_inward(numerator, period, 4 * period), period)
```

Why each part is there (for the reviewer):
- The angled-address numerator is **not** the rank rule `(rank(2^S θ) − rank(θ)) mod q` on θ's own orbit: that rule is only right for satellite steps and produces collisions at period 8 (for example `103/255` and `151/255`). The tuned-bulb search is exact, and the test checks injectivity (Schleicher's theorem) and conjugation symmetry through period 8.
- Wakes of equal period nest (6/15–9/15 contains 7/15–8/15), so the next component on the address is the innermost wake containing θ, hence `max(..., key=lower)`.
- Ray landing (`landing_center`) only matches a ray pair to a centre; centres themselves are refined in 80-digit decimal arithmetic in Task 2.

- [ ] **Step 4: Run the test to verify it passes**

Run: `python3 -m unittest discover -s tools -p 'test_*.py'`
Expected: `Ran 11 tests` … `OK` (a few seconds).

- [ ] **Step 5: Wire the tests into `npm run check` and CI**

In `package.json`, add this script directly above `"catalog:check"`:

```json
    "catalog:test": "python3 -m unittest discover -s tools -p 'test_*.py'",
```

and in the `"check"` script replace `npm run catalog:check` with `npm run catalog:test && npm run catalog:check`. The result must read exactly:

```json
    "check": "npm run format:check && npm run lint && npm run typecheck && npm run catalog:test && npm run catalog:check && npm run fixtures:check && npm run test:unit && npm run build:assets",
```

In `.github/workflows/ci.yml`, in the `quality` job, insert before the step `- name: Validate generated catalog`:

```yaml
      - name: Test catalog combinatorics
        run: npm run catalog:test

```

Run: `npm run catalog:test`
Expected: `Ran 11 tests` … `OK`.

- [ ] **Step 6: Verify the global gates**

Run: `npm run check && npm run fixtures:kernel-golden -- --check && npx playwright test`
Expected: every command exits 0; Vitest reports all files passed; Playwright reports `passed` with no failures (one test is skipped by design).

- [ ] **Step 7: Commit**

```bash
git add tools/catalog_combinatorics.py tools/test_catalog_combinatorics.py package.json .github/workflows/ci.yml
git commit -m "$(cat <<'EOF'
Catalog: exact ray pairing, kneading and angled-address combinatorics

Lavaurs pairs, kneading sequences, internal addresses, Schleicher
denominators, tuned sub-wake numerators and ray landing, with tests for
injectivity and conjugation symmetry through period 8 (PHASE2-TODO item 4).

Co-Authored-By: Claude Haiku 5.5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: Catalog generator v2 and the generated file

Rewrite `tools/generate_catalog.py` so it writes the whole schema v2 catalog: refined centres rounded to binary64, ray-derived ids, addresses, residuals, method and provenance, and curated labels and aliases from `catalog/curation.v2.json`. `--check` regenerates and requires byte equality. The TypeScript loader still reads `components.v1.json` until Task 3, so leave that file in place.

**Files:**
- Modify (full rewrite): `tools/generate_catalog.py`
- Create: `tools/test_generate_catalog.py`
- Create: `catalog/curation.v2.json`
- Create (generated): `catalog/components.v2.json`
- Modify: `package.json` (`catalog:check` path)
- Modify: `tools/benchmark/capture-environment.mjs:86`

**Interfaces:**
- Consumes: `catalog_combinatorics` from Task 1 (`angled_internal_address`, `internal_address`, `landing_center`, `lavaurs_pairs`, `ray_modulus`).
- Produces:
  - CLI: `python3 tools/generate_catalog.py [--max-period 4] [--precision 80] [--curation catalog/curation.v2.json] [--write PATH | --check PATH]`
  - Python: `SCHEMA_VERSION = 2`, `DEFAULT_CURATION`, `build_catalog(max_period, precision, curation) -> dict`, `check_curation(curation, components)`, `load_curation(path)`, `render(catalog) -> str`, `three_digits(value: Decimal) -> float`
  - File `catalog/components.v2.json` (schema in ADR 0011, written in Task 3): top level `schemaVersion: 2`, `license`, `maxPeriod`, `methods`, `provenance`, `components`; entry fields `id`, `aliases?`, `label`, `period`, `center`, `centerPrecisionDigits`, `internalAddress`, `angledInternalAddress?`, `characteristicRays?`, `residual {orbitAbs, centerError, properDivisorOrbitMinAbs?}`, `method`, `provenance`.
  - Canonical ids: `mi-p1-0-1`, `mi-p2-1-2`, `mi-p3-3-4`, `mi-p3-5-6`, `mi-p3-1-2`, `mi-p4-7-8`, `mi-p4-6-9`, `mi-p4-11-12`, `mi-p4-3-4`, `mi-p4-13-14`, `mi-p4-1-2` (file order).

- [ ] **Step 1: Write the curation file**

Create `catalog/curation.v2.json`:

```json
{
  "schemaVersion": 2,
  "license": "CC0-1.0",
  "description": "Reviewed names and the v1 ids each canonical id keeps as an alias (ADR 0011). Keys are canonical catalog ids.",
  "entries": {
    "mi-p1-0-1": { "label": "Main cardioid", "aliases": ["mi-p1-main"] },
    "mi-p2-1-2": { "label": "Period-2 bulb", "aliases": ["mi-p2-basilica"] },
    "mi-p3-1-2": { "label": "Douady rabbit", "aliases": ["mi-p3-rabbit"] },
    "mi-p3-3-4": { "label": "Airplane", "aliases": ["mi-p3-airplane"] },
    "mi-p3-5-6": { "label": "Co-rabbit", "aliases": ["mi-p3-corabbit"] },
    "mi-p4-1-2": { "label": "Period-4 component 6", "aliases": ["mi-p4-06"] },
    "mi-p4-3-4": { "label": "Period-4 component 4", "aliases": ["mi-p4-04"] },
    "mi-p4-6-9": { "label": "Period-4 component 2", "aliases": ["mi-p4-02"] },
    "mi-p4-7-8": { "label": "Period-4 component 1", "aliases": ["mi-p4-01"] },
    "mi-p4-11-12": { "label": "Period-4 component 3", "aliases": ["mi-p4-03"] },
    "mi-p4-13-14": { "label": "Period-4 component 5", "aliases": ["mi-p4-05"] }
  }
}
```

These are the v1 labels and ids, mapped to the component each v1 entry was (checked in Task 4 against the frozen v1 centres).

- [ ] **Step 2: Write the failing test**

Create `tools/test_generate_catalog.py`:

```python
"""Tests for tools/generate_catalog.py (run: npm run catalog:test)."""

from __future__ import annotations

from decimal import Decimal
from pathlib import Path
import unittest

from generate_catalog import (
    DEFAULT_CURATION,
    build_catalog,
    check_curation,
    load_curation,
    render,
    three_digits,
)

ROOT = Path(__file__).resolve().parent.parent


class BuildCatalogTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.curation = load_curation(ROOT / DEFAULT_CURATION)
        cls.catalog = build_catalog(4, 80, cls.curation)

    def test_ids_derive_from_the_rays(self) -> None:
        ids = [entry["id"] for entry in self.catalog["components"]]
        self.assertEqual(
            ids,
            [
                "mi-p1-0-1",
                "mi-p2-1-2",
                "mi-p3-3-4",
                "mi-p3-5-6",
                "mi-p3-1-2",
                "mi-p4-7-8",
                "mi-p4-6-9",
                "mi-p4-11-12",
                "mi-p4-3-4",
                "mi-p4-13-14",
                "mi-p4-1-2",
            ],
        )

    def test_every_entry_has_residual_method_and_provenance(self) -> None:
        for entry in self.catalog["components"]:
            self.assertIn(entry["method"], self.catalog["methods"])
            self.assertIn(entry["provenance"], self.catalog["provenance"])
            self.assertLess(entry["residual"]["orbitAbs"], 1e-14)
            self.assertLessEqual(entry["residual"]["centerError"], 2.3e-16)
            if entry["period"] > 1:
                self.assertGreater(entry["residual"]["properDivisorOrbitMinAbs"], 1e-3)

    def test_real_centres_are_exactly_real(self) -> None:
        airplane = next(e for e in self.catalog["components"] if e["id"] == "mi-p3-3-4")
        self.assertEqual(airplane["center"], {"re": -1.7548776662466927, "im": 0.0})

    def test_generation_is_deterministic(self) -> None:
        again = build_catalog(4, 80, self.curation)
        self.assertEqual(render(again), render(self.catalog))

    def test_uncurated_entries_get_generated_labels(self) -> None:
        catalog = build_catalog(4, 80, {})
        rabbit = next(e for e in catalog["components"] if e["id"] == "mi-p3-1-2")
        self.assertEqual(rabbit["label"], "Period 3, rays 1/7 and 2/7")
        self.assertEqual(rabbit["provenance"], "generated-label")
        self.assertNotIn("aliases", rabbit)


class CurationTest(unittest.TestCase):
    def components(self) -> list[dict[str, object]]:
        return [{"id": "mi-p1-0-1"}, {"id": "mi-p2-1-2"}]

    def test_rejects_an_unknown_id(self) -> None:
        with self.assertRaisesRegex(ValueError, "did not produce"):
            check_curation({"mi-p9-1-2": {"label": "x"}}, self.components())

    def test_rejects_an_alias_that_is_a_canonical_id(self) -> None:
        curation = {"mi-p1-0-1": {"label": "Main", "aliases": ["mi-p2-1-2"]}}
        with self.assertRaisesRegex(ValueError, "never equal a canonical id"):
            check_curation(curation, self.components())

    def test_rejects_a_repeated_alias(self) -> None:
        curation = {
            "mi-p1-0-1": {"label": "Main", "aliases": ["mi-old"]},
            "mi-p2-1-2": {"label": "Bulb", "aliases": ["mi-old"]},
        }
        with self.assertRaisesRegex(ValueError, "unique"):
            check_curation(curation, self.components())

    def test_rejects_an_empty_label(self) -> None:
        with self.assertRaisesRegex(ValueError, "label"):
            check_curation({"mi-p1-0-1": {"label": " "}}, self.components())


class ResidualFormatTest(unittest.TestCase):
    def test_three_significant_digits(self) -> None:
        self.assertEqual(three_digits(Decimal("2.0149e-16")), 2.01e-16)
        self.assertEqual(three_digits(Decimal(0)), 0.0)
        self.assertEqual(three_digits(Decimal("1.7548")), 1.75)


if __name__ == "__main__":
    unittest.main()
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `python3 -m unittest discover -s tools -p 'test_generate_catalog.py'`
Expected: FAIL — `ImportError: cannot import name 'DEFAULT_CURATION' from 'generate_catalog'`.

- [ ] **Step 4: Rewrite the generator**

Replace the whole of `tools/generate_catalog.py` with:

```python
#!/usr/bin/env python3
"""Generate and validate the low-period Mandelbrot component catalog (schema v2).

Writes catalog/components.v2.json from first principles plus the curated
names and v1 aliases in catalog/curation.v2.json. `--check` regenerates the
file and requires it to be byte-identical to the committed one.

The generated numerical data is dedicated to the public domain under CC0-1.0.
This generator is application source code and is licensed under GPL-3.0-only.
"""

from __future__ import annotations

import argparse
import cmath
from dataclasses import dataclass
from decimal import Decimal, localcontext
import json
import math
from pathlib import Path
import re
import sys
from typing import Any

from catalog_combinatorics import (
    angled_internal_address,
    internal_address,
    landing_center,
    lavaurs_pairs,
    ray_modulus,
)

SCHEMA_VERSION = 2
DEFAULT_CURATION = Path("catalog/curation.v2.json")
ALIAS_PATTERN = re.compile(r"^mi-[a-z0-9-]+$")
# Landing points and refined centres must agree this closely to be matched.
MATCH_TOLERANCE = 1e-9


@dataclass(frozen=True)
class DecimalComplex:
    real: Decimal
    imaginary: Decimal

    @classmethod
    def from_complex(cls, value: complex) -> "DecimalComplex":
        return cls(Decimal(str(value.real)), Decimal(str(value.imag)))

    def __add__(self, other: "DecimalComplex") -> "DecimalComplex":
        return DecimalComplex(
            self.real + other.real,
            self.imaginary + other.imaginary,
        )

    def __sub__(self, other: "DecimalComplex") -> "DecimalComplex":
        return DecimalComplex(
            self.real - other.real,
            self.imaginary - other.imaginary,
        )

    def __mul__(self, other: "DecimalComplex") -> "DecimalComplex":
        return DecimalComplex(
            self.real * other.real - self.imaginary * other.imaginary,
            self.real * other.imaginary + self.imaginary * other.real,
        )

    def __truediv__(self, other: "DecimalComplex") -> "DecimalComplex":
        denominator = other.real * other.real + other.imaginary * other.imaginary
        return DecimalComplex(
            (self.real * other.real + self.imaginary * other.imaginary)
            / denominator,
            (self.imaginary * other.real - self.real * other.imaginary)
            / denominator,
        )

    def scale(self, scalar: int) -> "DecimalComplex":
        factor = Decimal(scalar)
        return DecimalComplex(self.real * factor, self.imaginary * factor)

    def magnitude_squared(self) -> Decimal:
        return self.real * self.real + self.imaginary * self.imaginary


ZERO = DecimalComplex(Decimal(0), Decimal(0))
ONE = DecimalComplex(Decimal(1), Decimal(0))


def polynomial_multiply(left: list[complex], right: list[complex]) -> list[complex]:
    result = [0j] * (len(left) + len(right) - 1)
    for left_index, left_value in enumerate(left):
        for right_index, right_value in enumerate(right):
            result[left_index + right_index] += left_value * right_value
    return result


def polynomial_value(coefficients: list[complex], value: complex) -> complex:
    result = 0j
    for coefficient in reversed(coefficients):
        result = result * value + coefficient
    return result


def orbit_polynomials(max_period: int) -> list[list[complex]]:
    """Return ascending coefficients of f_c^p(0) for p=1..max_period."""
    current = [0j, 1 + 0j]
    polynomials = [current]
    for _period in range(2, max_period + 1):
        current = polynomial_multiply(current, current)
        current[1] += 1
        polynomials.append(current)
    return polynomials


def durand_kerner(coefficients: list[complex]) -> list[complex]:
    degree = len(coefficients) - 1
    if degree == 1:
        return [-coefficients[0] / coefficients[1]]

    roots = [
        2 * cmath.exp(2j * math.pi * (index + 0.37) / degree)
        for index in range(degree)
    ]
    for _iteration in range(2_000):
        next_roots: list[complex] = []
        largest_update = 0.0
        for index, root in enumerate(roots):
            denominator = 1 + 0j
            for other_index, other in enumerate(roots):
                if index != other_index:
                    denominator *= root - other
            update = polynomial_value(coefficients, root) / denominator
            next_roots.append(root - update)
            largest_update = max(largest_update, abs(update))
        roots = next_roots
        if largest_update < 1e-14:
            return roots
    raise RuntimeError("root discovery did not converge")


def float_orbit(parameter: complex, iterations: int) -> complex:
    value = 0j
    for _iteration in range(iterations):
        value = value * value + parameter
    return value


def proper_divisors(value: int) -> list[int]:
    return [candidate for candidate in range(1, value) if value % candidate == 0]


def has_exact_period(parameter: complex, period: int) -> bool:
    if abs(float_orbit(parameter, period)) > 1e-7:
        return False
    return all(
        abs(float_orbit(parameter, divisor)) > 1e-6
        for divisor in proper_divisors(period)
    )


def decimal_orbit_and_derivative(
    parameter: DecimalComplex,
    period: int,
) -> tuple[DecimalComplex, DecimalComplex]:
    value = ZERO
    derivative = ZERO
    for _iteration in range(period):
        derivative = value.scale(2) * derivative + ONE
        value = value * value + parameter
    return value, derivative


def refine_center(
    seed: complex,
    period: int,
    precision: int,
) -> DecimalComplex:
    with localcontext() as context:
        context.prec = precision
        center = DecimalComplex.from_complex(seed)
        target = Decimal(10) ** (-(precision - 12))
        for _iteration in range(100):
            value, derivative = decimal_orbit_and_derivative(center, period)
            update = value / derivative
            center = center - update
            if update.magnitude_squared() < target * target:
                # A real centre keeps only round-off in its imaginary part.
                if abs(center.imaginary) < target:
                    center = DecimalComplex(center.real, Decimal(0))
                return center
    raise RuntimeError(f"high-precision refinement failed for period {period}")


def discover_centers(max_period: int, precision: int) -> dict[int, list[DecimalComplex]]:
    """Refined centres of every hyperbolic component of exact period <= max_period."""
    centers: dict[int, list[DecimalComplex]] = {}
    for period, polynomial in enumerate(orbit_polynomials(max_period), start=1):
        candidates = [
            candidate
            for candidate in durand_kerner(polynomial)
            if has_exact_period(candidate, period)
        ]
        centers[period] = [
            refine_center(candidate, period, precision) for candidate in candidates
        ]
    return centers


def binary64(value: Decimal) -> float:
    """Nearest binary64, with -0.0 normalized to 0.0."""
    return float(value) + 0.0


def three_digits(value: Decimal) -> float:
    """A non-negative residual rounded to three significant digits."""
    if value == 0:
        return 0.0
    return float(f"{value:.2e}")


def residual_fields(
    stored: DecimalComplex,
    refined: DecimalComplex,
    period: int,
    precision: int,
) -> tuple[dict[str, float], int]:
    """Residuals at the stored binary64 centre, and its significant digits."""
    with localcontext() as context:
        context.prec = precision
        orbit = decimal_orbit_and_derivative(stored, period)[0]
        error = (stored - refined).magnitude_squared().sqrt()
        residual: dict[str, float] = {
            "orbitAbs": three_digits(orbit.magnitude_squared().sqrt()),
            "centerError": three_digits(error),
        }
        divisors = proper_divisors(period)
        if divisors:
            residual["properDivisorOrbitMinAbs"] = three_digits(
                min(
                    decimal_orbit_and_derivative(stored, divisor)[0]
                    .magnitude_squared()
                    .sqrt()
                    for divisor in divisors
                )
            )
        magnitude = refined.magnitude_squared().sqrt()
        if error == 0:
            digits = 16
        else:
            digits = min(16, math.floor(-float((error / magnitude).log10())))
    return residual, digits


def match_pairs_to_centers(
    period: int,
    pairs: list[tuple[int, int]],
    centers: list[DecimalComplex],
) -> list[tuple[tuple[int, int], DecimalComplex]]:
    """Pairs each ray pair with the one centre both of its rays land on."""
    if len(pairs) != len(centers):
        raise ValueError(
            f"period {period}: {len(pairs)} ray pairs but {len(centers)} centres"
        )
    unmatched = list(centers)
    matched: list[tuple[tuple[int, int], DecimalComplex]] = []
    for lower, upper in pairs:
        lower_landing = landing_center(lower, period)
        upper_landing = landing_center(upper, period)
        if abs(lower_landing - upper_landing) > MATCH_TOLERANCE:
            raise ValueError(f"rays {lower} and {upper} of period {period} land apart")
        near = [
            center
            for center in unmatched
            if abs(complex(float(center.real), float(center.imaginary)) - lower_landing)
            <= MATCH_TOLERANCE
        ]
        if len(near) != 1:
            raise ValueError(
                f"rays {lower}/{ray_modulus(period)} land near {len(near)} centres"
            )
        unmatched.remove(near[0])
        matched.append(((lower, upper), near[0]))
    return matched


def load_curation(path: Path) -> dict[str, dict[str, Any]]:
    curation = json.loads(path.read_text(encoding="utf-8"))
    if curation.get("schemaVersion") != SCHEMA_VERSION:
        raise ValueError(f"{path} must declare schemaVersion {SCHEMA_VERSION}")
    entries = curation.get("entries")
    if not isinstance(entries, dict):
        raise ValueError(f"{path} entries must be an object keyed by catalog id")
    return entries


def ray_json(numerator: int, period: int) -> dict[str, int]:
    return {"numerator": numerator, "denominator": ray_modulus(period)}


def build_entry(
    period: int,
    pair: tuple[int, int],
    refined: DecimalComplex,
    pairs: dict[int, list[tuple[int, int]]],
    curated: dict[str, Any] | None,
    precision: int,
) -> dict[str, Any]:
    lower, upper = pair
    stored = DecimalComplex(
        Decimal(binary64(refined.real)), Decimal(binary64(refined.imaginary))
    )
    residual, digits = residual_fields(stored, refined, period, precision)
    modulus = ray_modulus(period)
    entry: dict[str, Any] = {"id": f"mi-p{period}-{lower}-{upper}"}
    if curated is not None and curated.get("aliases"):
        entry["aliases"] = list(curated["aliases"])
    entry["label"] = (
        curated["label"]
        if curated is not None
        else f"Period {period}, rays {lower}/{modulus} and {upper}/{modulus}"
    )
    entry["period"] = period
    entry["center"] = {"re": binary64(stored.real), "im": binary64(stored.imaginary)}
    entry["centerPrecisionDigits"] = digits
    entry["internalAddress"] = internal_address(lower, period)
    if period > 1:
        entry["angledInternalAddress"] = [
            {
                "fromPeriod": step.from_period,
                "toPeriod": step.to_period,
                "rotation": {"numerator": step.numerator, "denominator": step.denominator},
            }
            for step in angled_internal_address(lower, period, pairs)
        ]
        entry["characteristicRays"] = [ray_json(lower, period), ray_json(upper, period)]
    entry["residual"] = residual
    entry["method"] = f"newton-decimal-{precision}"
    entry["provenance"] = "curated-label" if curated is not None else "generated-label"
    return entry


def build_catalog(
    max_period: int,
    precision: int,
    curation: dict[str, dict[str, Any]],
) -> dict[str, Any]:
    pairs = lavaurs_pairs(max_period)
    centers = discover_centers(max_period, precision)
    components: list[dict[str, Any]] = []
    for period in range(1, max_period + 1):
        for pair, refined in match_pairs_to_centers(period, pairs[period], centers[period]):
            identifier = f"mi-p{period}-{pair[0]}-{pair[1]}"
            components.append(
                build_entry(
                    period, pair, refined, pairs, curation.get(identifier), precision
                )
            )
    # Presentation (and keyboard focus) order: by period, then by centre.
    components.sort(
        key=lambda entry: (entry["period"], entry["center"]["re"], entry["center"]["im"])
    )
    check_curation(curation, components)
    arguments = f"--max-period {max_period} --precision {precision}"
    return {
        "schemaVersion": SCHEMA_VERSION,
        "license": "CC0-1.0",
        "maxPeriod": max_period,
        "methods": {
            f"newton-decimal-{precision}": (
                "Centres: binary64 Durand-Kerner roots of f_c^p(0), refined by "
                f"Newton's method in {precision}-digit decimal arithmetic and "
                "rounded to the nearest binary64; exact period: every proper "
                "divisor d of p has |f_c^d(0)| > 1e-6. Rays: Lavaurs' pairing of "
                "the angles of exact period p, each pair matched to the one centre "
                "both of its rays land on (binary64 ray tracing, then Newton). "
                "Internal address: the kneading sequence of the lower ray. Angled "
                "address: Schleicher's denominators; each numerator names the tuned "
                "sub-wake that contains the lower ray. Residuals: |f_c^p(0)|, the "
                "distance to the refined centre, and the smallest |f_c^d(0)| over "
                f"proper divisors d, at the stored centre in {precision}-digit "
                "arithmetic, to three significant digits."
            )
        },
        "provenance": {
            "curated-label": {
                "generator": "tools/generate_catalog.py",
                "arguments": arguments,
                "curated": "label and aliases from catalog/curation.v2.json",
            },
            "generated-label": {
                "generator": "tools/generate_catalog.py",
                "arguments": arguments,
                "curated": "none; the label is generated from the characteristic rays",
            },
        },
        "components": components,
    }


def check_curation(
    curation: dict[str, dict[str, Any]],
    components: list[dict[str, Any]],
) -> None:
    identifiers = {entry["id"] for entry in components}
    unknown = sorted(set(curation) - identifiers)
    if unknown:
        raise ValueError(f"curation names ids the generator did not produce: {unknown}")
    aliases: list[str] = []
    for identifier, curated in curation.items():
        label = curated.get("label")
        if not isinstance(label, str) or not label.strip():
            raise ValueError(f"{identifier} needs a non-empty curated label")
        for alias in curated.get("aliases", []):
            if not isinstance(alias, str) or not ALIAS_PATTERN.match(alias):
                raise ValueError(f"{identifier} has a malformed alias {alias!r}")
            aliases.append(alias)
    if len(aliases) != len(set(aliases)) or identifiers & set(aliases):
        raise ValueError("aliases must be unique and never equal a canonical id")


def render(catalog: dict[str, Any]) -> str:
    return json.dumps(catalog, indent=2, ensure_ascii=False) + "\n"


def parse_arguments() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--max-period", type=int, default=4)
    parser.add_argument("--precision", type=int, default=80)
    parser.add_argument("--curation", type=Path, default=DEFAULT_CURATION)
    action = parser.add_mutually_exclusive_group()
    action.add_argument("--write", type=Path, help="Write the catalog to this path.")
    action.add_argument(
        "--check",
        type=Path,
        help="Regenerate and require this committed catalog to match byte for byte.",
    )
    return parser.parse_args()


def main() -> int:
    arguments = parse_arguments()
    if arguments.max_period < 1 or arguments.max_period > 8:
        raise ValueError("max-period must be between 1 and 8")
    if arguments.precision < 40:
        raise ValueError("precision must be at least 40 decimal digits")

    text = render(
        build_catalog(
            arguments.max_period,
            arguments.precision,
            load_curation(arguments.curation),
        )
    )
    if arguments.check is not None:
        if arguments.check.read_text(encoding="utf-8") != text:
            print(
                f"{arguments.check} differs from the regenerated catalog; run "
                f"python3 tools/generate_catalog.py --write {arguments.check}",
                file=sys.stderr,
            )
            return 1
        count = text.count('"id":')
        print(
            f"validated {count} exact-period components "
            f"through period {arguments.max_period}"
        )
        return 0
    if arguments.write is not None:
        arguments.write.write_text(text, encoding="utf-8")
        return 0
    sys.stdout.write(text)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
```

Notes for the reviewer:
- v1 stored the binary64 Durand–Kerner roots (up to 2.1·10⁻¹⁵ off); v2 stores the nearest binary64 to the 80-digit Newton root, so `centerPrecisionDigits` is now computed (16 for every current entry) instead of hand-entered.
- `refine_center` snaps a real centre's round-off imaginary part (around 1e-214) to exactly 0, and `binary64` turns `-0.0` into `0.0`, so real centres are exactly real.
- The file is sorted by `(period, re, im)`, the v1 order, which is the catalog markers' keyboard focus order.

- [ ] **Step 5: Generate the catalog and run the tests**

Run: `python3 tools/generate_catalog.py --write catalog/components.v2.json && python3 tools/generate_catalog.py --check catalog/components.v2.json`
Expected: `validated 11 exact-period components through period 4`.

Run: `python3 -c "import json; [print(c['id'], c.get('aliases'), c['internalAddress'], [(s['fromPeriod'], s['toPeriod'], s['rotation']['numerator'], s['rotation']['denominator']) for s in c.get('angledInternalAddress', [])], c['residual']) for c in json.load(open('catalog/components.v2.json'))['components']]"`
Expected, exactly:

```text
mi-p1-0-1 ['mi-p1-main'] [1] [] {'orbitAbs': 0.0, 'centerError': 0.0}
mi-p2-1-2 ['mi-p2-basilica'] [1, 2] [(1, 2, 1, 2)] {'orbitAbs': 0.0, 'centerError': 0.0, 'properDivisorOrbitMinAbs': 1.0}
mi-p3-3-4 ['mi-p3-airplane'] [1, 2, 3] [(1, 2, 1, 2), (2, 3, 1, 2)] {'orbitAbs': 2.01e-16, 'centerError': 3.55e-17, 'properDivisorOrbitMinAbs': 1.75}
mi-p3-5-6 ['mi-p3-corabbit'] [1, 3] [(1, 3, 2, 3)] {'orbitAbs': 7.84e-18, 'centerError': 3.88e-18, 'properDivisorOrbitMinAbs': 0.755}
mi-p3-1-2 ['mi-p3-rabbit'] [1, 3] [(1, 3, 1, 3)] {'orbitAbs': 7.84e-18, 'centerError': 3.88e-18, 'properDivisorOrbitMinAbs': 0.755}
mi-p4-7-8 ['mi-p4-01'] [1, 2, 3, 4] [(1, 2, 1, 2), (2, 3, 1, 2), (3, 4, 1, 2)] {'orbitAbs': 1.47e-15, 'centerError': 5.77e-17, 'properDivisorOrbitMinAbs': 1.83}
mi-p4-6-9 ['mi-p4-02'] [1, 2, 4] [(1, 2, 1, 2), (2, 4, 1, 2)] {'orbitAbs': 1.7e-16, 'centerError': 9.81e-17, 'properDivisorOrbitMinAbs': 0.407}
mi-p4-11-12 ['mi-p4-03'] [1, 3, 4] [(1, 3, 2, 3), (3, 4, 1, 2)] {'orbitAbs': 2.33e-16, 'centerError': 2.35e-17, 'properDivisorOrbitMinAbs': 1.04}
mi-p4-3-4 ['mi-p4-04'] [1, 3, 4] [(1, 3, 1, 3), (3, 4, 1, 2)] {'orbitAbs': 2.33e-16, 'centerError': 2.35e-17, 'properDivisorOrbitMinAbs': 1.04}
mi-p4-13-14 ['mi-p4-05'] [1, 4] [(1, 4, 3, 4)] {'orbitAbs': 2.01e-17, 'centerError': 5.49e-18, 'properDivisorOrbitMinAbs': 0.601}
mi-p4-1-2 ['mi-p4-06'] [1, 4] [(1, 4, 1, 4)] {'orbitAbs': 2.01e-17, 'centerError': 5.49e-18, 'properDivisorOrbitMinAbs': 0.601}
```

If any line differs, stop and report it.

Run: `npm run catalog:test`
Expected: `Ran 21 tests` … `OK`.

- [ ] **Step 6: Point the check and the evidence capture at v2**

In `package.json`, change the `catalog:check` script to:

```json
    "catalog:check": "python3 tools/generate_catalog.py --check catalog/components.v2.json",
```

In `tools/benchmark/capture-environment.mjs`, change line 86 from `catalog: sha256File('catalog/components.v1.json'),` to:

```js
    catalog: sha256File('catalog/components.v2.json'),
```

Run: `npm run catalog:check`
Expected: `validated 11 exact-period components through period 4`.

- [ ] **Step 7: Verify the global gates**

Run: `npm run check && npm run fixtures:kernel-golden -- --check && npx playwright test`
Expected: every command exits 0. (The app still loads `components.v1.json`; Task 3 switches it.)

- [ ] **Step 8: Commit**

```bash
git add tools/generate_catalog.py tools/test_generate_catalog.py catalog/curation.v2.json catalog/components.v2.json package.json tools/benchmark/capture-environment.mjs
git commit -m "$(cat <<'EOF'
Catalog: generate schema v2 with residuals, method, provenance and ray ids

The generator writes catalog/components.v2.json from first principles plus
catalog/curation.v2.json (reviewed labels, v1 aliases); --check requires byte
equality. Centres are now the correctly rounded refined centres (moved by at
most 2.1e-15); the six period-4 entries gain internal and angled addresses.

Co-Authored-By: Claude Haiku 5.5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: Schema v2 loader, alias resolution and ADR 0011

Switch the app to `components.v2.json` behind a validating parser, resolve v1 ids as aliases in share links, delete the v1 file, and record the decision.

**Files:**
- Create: `src/catalog/schema.ts`
- Modify (full rewrite): `src/catalog/components.ts`
- Create: `tests/unit/catalog/v1-catalog.ts`, `tests/unit/catalog/schema.test.ts`
- Modify: `src/ui/share-state.ts:152`, `src/ui/application.ts:1470-1472`
- Modify: `tests/unit/ui/share-state.test.ts`, `tests/unit/ui/share-link.test.ts`, `tests/e2e/explorer.spec.ts`
- Modify: `.prettierignore` (line 2)
- Delete: `catalog/components.v1.json`
- Create: `docs/decisions/0011-catalog-schema-v2-and-stable-ids.md`
- Modify: `docs/decisions/0004-catalog-disposition.md`, `docs/decisions/0009-shareable-url-schema.md` (append amendments)

**Interfaces:**
- Consumes: `catalog/components.v2.json` from Task 2.
- Produces (`src/catalog/components.ts`, re-exporting `src/catalog/schema.ts`):
  - `parseCatalog(raw: unknown): Catalog` (throws `CatalogSchemaError`), `CATALOG: Catalog`, `COMPONENT_CATALOG: readonly CatalogComponent[]`, `CATALOG_SCHEMA_VERSION`, `CATALOG_LICENSE`
  - `findCatalogComponent(idOrAlias: string): CatalogComponent | undefined`
  - `catalogIdFor(period: number, lower: number, upper: number): string`, `rayModulus(period: number): number`, `MAX_CATALOG_PERIOD = 12`
  - Types `Catalog`, `CatalogComponent` (now with `aliases: readonly string[]`, required `internalAddress`, `characteristicRays?: readonly [RationalAngle, RationalAngle]`, `residual`, `method`, `provenance`), `CatalogResidual`, `CatalogProvenance`, `RationalAngle`, `AngledAddressStep`
  - Test helper `V1_CATALOG` (`tests/unit/catalog/v1-catalog.ts`): `readonly { v1Id, label, id, center }[]` in v1 file order.

- [ ] **Step 1: Write the frozen v1 helper and the failing loader test**

Create `tests/unit/catalog/v1-catalog.ts`:

```ts
/**
 * The schema v1 catalog (catalog/components.v1.json, removed by ADR 0011), frozen:
 * each v1 id, the canonical id it is an alias of, its label and its v1 centre.
 * v1 share links name these ids in `sel=`, so they must resolve forever
 * (ADR 0009). The v1 centres were binary64 Durand-Kerner roots, within
 * 2.1e-15 of the refined centres v2 stores.
 */
export const V1_CATALOG = [
  { v1Id: 'mi-p1-main', label: 'Main cardioid', id: 'mi-p1-0-1', center: { re: 0, im: 0 } },
  { v1Id: 'mi-p2-basilica', label: 'Period-2 bulb', id: 'mi-p2-1-2', center: { re: -1, im: 0 } },
  {
    v1Id: 'mi-p3-airplane',
    label: 'Airplane',
    id: 'mi-p3-3-4',
    center: { re: -1.7548776662466907, im: 0 },
  },
  {
    v1Id: 'mi-p3-corabbit',
    label: 'Co-rabbit',
    id: 'mi-p3-5-6',
    center: { re: -0.1225611668766535, im: -0.7448617666197435 },
  },
  {
    v1Id: 'mi-p3-rabbit',
    label: 'Douady rabbit',
    id: 'mi-p3-1-2',
    center: { re: -0.1225611668766535, im: 0.7448617666197435 },
  },
  {
    v1Id: 'mi-p4-01',
    label: 'Period-4 component 1',
    id: 'mi-p4-7-8',
    center: { re: -1.9407998065294834, im: 0 },
  },
  {
    v1Id: 'mi-p4-02',
    label: 'Period-4 component 2',
    id: 'mi-p4-6-9',
    center: { re: -1.3107026413368348, im: 0 },
  },
  {
    v1Id: 'mi-p4-03',
    label: 'Period-4 component 3',
    id: 'mi-p4-11-12',
    center: { re: -0.1565201668337543, im: -1.0322471089228327 },
  },
  {
    v1Id: 'mi-p4-04',
    label: 'Period-4 component 4',
    id: 'mi-p4-3-4',
    center: { re: -0.1565201668337543, im: 1.0322471089228327 },
  },
  {
    v1Id: 'mi-p4-05',
    label: 'Period-4 component 5',
    id: 'mi-p4-13-14',
    center: { re: 0.2822713907669141, im: -0.5300606175785254 },
  },
  {
    v1Id: 'mi-p4-06',
    label: 'Period-4 component 6',
    id: 'mi-p4-1-2',
    center: { re: 0.2822713907669141, im: 0.5300606175785254 },
  },
] as const;
```

Create `tests/unit/catalog/schema.test.ts`:

```ts
import { describe, expect, it } from 'vitest';

import catalogData from '../../../catalog/components.v2.json';
import {
  CATALOG,
  CatalogSchemaError,
  findCatalogComponent,
  parseCatalog,
} from '../../../src/catalog/components';

type Raw = Record<string, unknown>;

/** A deep copy of the committed file with one edit applied to it. */
const edited = (edit: (catalog: Raw, components: Raw[]) => void): unknown => {
  const copy = structuredClone(catalogData) as unknown as Raw;
  edit(copy, copy['components'] as Raw[]);
  return copy;
};

/** The entry at `index` of the edited copy. */
const at = (components: Raw[], index: number): Raw => components[index]!;

const expectRejected = (raw: unknown, message: RegExp): void => {
  expect(() => parseCatalog(raw)).toThrow(CatalogSchemaError);
  expect(() => parseCatalog(raw)).toThrow(message);
};

describe('catalog schema v2 loader', () => {
  it('accepts the committed catalog', () => {
    expect(parseCatalog(catalogData)).toEqual(CATALOG);
    expect(CATALOG.schemaVersion).toBe(2);
    expect(CATALOG.components).toHaveLength(11);
  });

  it('gives every entry a residual, a method and a provenance it can resolve', () => {
    for (const component of CATALOG.components) {
      expect(CATALOG.methods[component.method], component.id).toBeTypeOf('string');
      expect(CATALOG.provenance[component.provenance], component.id).toBeDefined();
      expect(component.residual.orbitAbs, component.id).toBeGreaterThanOrEqual(0);
      expect(component.residual.centerError, component.id).toBeGreaterThanOrEqual(0);
    }
  });

  it('finds an entry by its canonical id or by an alias', () => {
    expect(findCatalogComponent('mi-p3-1-2')?.label).toBe('Douady rabbit');
    expect(findCatalogComponent('mi-p3-rabbit')).toBe(findCatalogComponent('mi-p3-1-2'));
    expect(findCatalogComponent('mi-p9-nope')).toBeUndefined();
  });

  it.each([
    ['another schema version', edited((c) => (c['schemaVersion'] = 1)), /schemaVersion/],
    ['another licence', edited((c) => (c['license'] = 'MIT')), /license/],
    ['a period above the generated core', edited((c) => (c['maxPeriod'] = 13)), /maxPeriod/],
    ['no components', edited((c) => (c['components'] = [])), /must not be empty/],
    ['an ordinal id', edited((_, e) => (at(e, 5)['id'] = 'mi-p4-01')), /must be mi-p4-7-8/],
    [
      'an id that disagrees with its rays',
      edited((_, e) => (at(e, 2)['id'] = 'mi-p3-1-2')),
      /must be mi-p3-3-4/,
    ],
    [
      'a repeated alias',
      edited((_, e) => (at(e, 1)['aliases'] = ['mi-p1-main'])),
      /mi-p1-main is not unique/,
    ],
    [
      'an alias equal to another id',
      edited((_, e) => (at(e, 1)['aliases'] = ['mi-p3-3-4'])),
      /mi-p3-3-4 is not unique/,
    ],
    ['an upper-case alias', edited((_, e) => (at(e, 1)['aliases'] = ['MI-X'])), /aliases\[0\]/],
    ['an empty label', edited((_, e) => (at(e, 0)['label'] = ' ')), /label/],
    ['a non-finite centre', edited((_, e) => (at(e, 2)['center'] = { re: null, im: 0 })), /re/],
    [
      'an address that does not end at the period',
      edited((_, e) => (at(e, 2)['internalAddress'] = [1, 2])),
      /internalAddress/,
    ],
    [
      'an angled step off the address',
      edited((_, e) => {
        const steps = at(e, 2)['angledInternalAddress'] as Raw[];
        steps[1]!['fromPeriod'] = 1;
      }),
      /must follow the internal address/,
    ],
    [
      'an angle not in lowest terms',
      edited((_, e) => {
        const steps = at(e, 1)['angledInternalAddress'] as Raw[];
        steps[0]!['rotation'] = { numerator: 2, denominator: 4 };
      }),
      /lowest terms/,
    ],
    [
      'a ray over the wrong denominator',
      edited(
        (_, e) =>
          (at(e, 1)['characteristicRays'] = [
            { numerator: 1, denominator: 7 },
            { numerator: 2, denominator: 7 },
          ]),
      ),
      /denominator must be 3/,
    ],
    [
      'rays in the wrong order',
      edited(
        (_, e) =>
          (at(e, 1)['characteristicRays'] = [
            { numerator: 2, denominator: 3 },
            { numerator: 1, denominator: 3 },
          ]),
      ),
      /lower angle first/,
    ],
    [
      'a main cardioid with a ray pair',
      edited((_, e) => (at(e, 0)['characteristicRays'] = [])),
      /main cardioid/,
    ],
    ['a missing residual', edited((_, e) => delete at(e, 3)['residual']), /residual/],
    [
      'a negative residual',
      edited((_, e) => ((at(e, 3)['residual'] as Raw)['orbitAbs'] = -1)),
      /orbitAbs/,
    ],
    [
      'a missing divisor residual',
      edited((_, e) => delete (at(e, 3)['residual'] as Raw)['properDivisorOrbitMinAbs']),
      /properDivisorOrbitMinAbs/,
    ],
    ['an unknown method', edited((_, e) => (at(e, 3)['method'] = 'guesswork')), /unknown method/],
    [
      'an unknown provenance',
      edited((_, e) => (at(e, 3)['provenance'] = 'hearsay')),
      /unknown provenance/,
    ],
  ])('rejects %s', (_name, raw, message) => {
    expectRejected(raw, message);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/unit/catalog/schema.test.ts`
Expected: FAIL — `src/catalog/components.ts` does not export `CATALOG`, `CatalogSchemaError` or `parseCatalog` yet (a SyntaxError about a missing export, or `parseCatalog is not a function`).

- [ ] **Step 3: Stop Prettier from skipping `src/catalog/`**

`.prettierignore` line 2 reads `catalog/`, which also matches `src/catalog/` and `tests/unit/catalog/`, so those were never format-checked. Change line 2 to:

```text
/catalog/
```

- [ ] **Step 4: Write the schema module and the loader**

Create `src/catalog/schema.ts`:

```ts
import type { Complex } from '../domain/types';

/**
 * Component catalog schema v2 (ADR 0011): the loader's structural check of
 * catalog/components.v2.json. The mathematical invariants (exact periods,
 * addresses recomputed from the rays, conjugate closure) are tested in
 * tests/unit/catalog/; this runs on every load and rejects a malformed file.
 */

export const CATALOG_SCHEMA_VERSION_2 = 2;
/** The generated core of PHASE2-TODO item 7 stops at period 12. */
export const MAX_CATALOG_PERIOD = 12;

export interface RationalAngle {
  readonly numerator: number;
  readonly denominator: number;
}

export interface AngledAddressStep {
  readonly fromPeriod: number;
  readonly toPeriod: number;
  readonly rotation: RationalAngle;
}

export interface CatalogResidual {
  /** |f_c^p(0)| at the stored binary64 centre (80-digit evaluation, 3 significant digits). */
  readonly orbitAbs: number;
  /** Distance from the stored centre to the refined centre. */
  readonly centerError: number;
  /** Smallest |f_c^d(0)| over proper divisors d of p; absent for period 1. */
  readonly properDivisorOrbitMinAbs?: number;
}

export interface CatalogComponent {
  /** Canonical id `mi-p<p>-<lower>-<upper>`: the characteristic ray numerators over 2^p - 1. */
  readonly id: string;
  /** Earlier ids that still resolve to this entry (v1 share links). */
  readonly aliases: readonly string[];
  readonly label: string;
  readonly center: Complex;
  readonly centerPrecisionDigits: number;
  readonly period: number;
  readonly internalAddress: readonly number[];
  /** Absent for the main cardioid, whose address has no steps. */
  readonly angledInternalAddress?: readonly AngledAddressStep[];
  /** The lower and upper characteristic angles; absent for the main cardioid (root angle 0). */
  readonly characteristicRays?: readonly [RationalAngle, RationalAngle];
  readonly residual: CatalogResidual;
  /** Key into Catalog.methods. */
  readonly method: string;
  /** Key into Catalog.provenance. */
  readonly provenance: string;
}

export interface CatalogProvenance {
  readonly generator: string;
  readonly arguments: string;
  readonly curated: string;
}

export interface Catalog {
  readonly schemaVersion: 2;
  readonly license: 'CC0-1.0';
  readonly maxPeriod: number;
  readonly methods: Readonly<Record<string, string>>;
  readonly provenance: Readonly<Record<string, CatalogProvenance>>;
  readonly components: readonly CatalogComponent[];
}

export class CatalogSchemaError extends Error {
  override readonly name = 'CatalogSchemaError';
}

const ALIAS_PATTERN = /^mi-[a-z0-9-]+$/;

/** The canonical id of a component from its period and characteristic ray numerators. */
export const catalogIdFor = (period: number, lower: number, upper: number): string =>
  `mi-p${period}-${lower}-${upper}`;

/** 2^period - 1, the denominator of every characteristic angle of that period. */
export const rayModulus = (period: number): number => 2 ** period - 1;

type Json = Readonly<Record<string, unknown>>;

const fail = (where: string, problem: string): never => {
  throw new CatalogSchemaError(`${where}: ${problem}`);
};

const isRecord = (value: unknown): value is Json =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const record = (value: unknown, where: string): Json =>
  isRecord(value) ? value : fail(where, 'must be an object');

const integer = (value: unknown, where: string, min: number, max: number): number =>
  typeof value === 'number' && Number.isInteger(value) && value >= min && value <= max
    ? value
    : fail(where, `must be an integer in [${min}, ${max}]`);

const finite = (value: unknown, where: string): number =>
  typeof value === 'number' && Number.isFinite(value) ? value : fail(where, 'must be finite');

const nonNegative = (value: unknown, where: string): number => {
  const number = finite(value, where);
  return number >= 0 ? number : fail(where, 'must not be negative');
};

const text = (value: unknown, where: string): string =>
  typeof value === 'string' && value.trim() !== ''
    ? value
    : fail(where, 'must be a non-empty string');

const array = (value: unknown, where: string): readonly unknown[] =>
  Array.isArray(value) ? value : fail(where, 'must be an array');

const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b));

const parseMethods = (value: unknown): Readonly<Record<string, string>> => {
  const methods = record(value, 'methods');
  return Object.fromEntries(
    Object.entries(methods).map(([key, description]) => [key, text(description, `methods.${key}`)]),
  );
};

const parseProvenance = (value: unknown): Readonly<Record<string, CatalogProvenance>> => {
  const table = record(value, 'provenance');
  return Object.fromEntries(
    Object.entries(table).map(([key, raw]) => {
      const entry = record(raw, `provenance.${key}`);
      return [
        key,
        {
          generator: text(entry['generator'], `provenance.${key}.generator`),
          arguments: text(entry['arguments'], `provenance.${key}.arguments`),
          curated: text(entry['curated'], `provenance.${key}.curated`),
        },
      ];
    }),
  );
};

const parseInternalAddress = (value: unknown, period: number, where: string): number[] => {
  const address = array(value, where).map((step, index) =>
    integer(step, `${where}[${index}]`, 1, period),
  );
  const increasing = address.every(
    (step, index) => index === 0 || step > (address[index - 1] ?? 0),
  );
  if (address[0] !== 1 || address.at(-1) !== period || !increasing) {
    fail(where, `must rise strictly from 1 to the period ${period}`);
  }
  return address;
};

const parseRotation = (value: unknown, where: string): RationalAngle => {
  const rotation = record(value, where);
  const denominator = integer(rotation['denominator'], `${where}.denominator`, 2, 2 ** 30);
  const numerator = integer(rotation['numerator'], `${where}.numerator`, 1, denominator - 1);
  if (gcd(numerator, denominator) !== 1) fail(where, 'must be in lowest terms');
  return { numerator, denominator };
};

const parseAngledAddress = (
  value: unknown,
  address: readonly number[],
  where: string,
): AngledAddressStep[] => {
  const steps = array(value, where);
  if (steps.length !== address.length - 1) fail(where, 'must have one step per address arrow');
  return steps.map((raw, index) => {
    const step = record(raw, `${where}[${index}]`);
    if (step['fromPeriod'] !== address[index] || step['toPeriod'] !== address[index + 1]) {
      fail(`${where}[${index}]`, 'must follow the internal address');
    }
    return {
      fromPeriod: address[index] ?? 0,
      toPeriod: address[index + 1] ?? 0,
      rotation: parseRotation(step['rotation'], `${where}[${index}].rotation`),
    };
  });
};

const parseRays = (
  value: unknown,
  period: number,
  where: string,
): readonly [RationalAngle, RationalAngle] => {
  const rays = array(value, where);
  const modulus = rayModulus(period);
  if (rays.length !== 2) fail(where, 'must hold exactly two angles');
  const [lower, upper] = rays.map((raw, index) => {
    const ray = record(raw, `${where}[${index}]`);
    if (ray['denominator'] !== modulus)
      fail(`${where}[${index}]`, `denominator must be ${modulus}`);
    return {
      numerator: integer(ray['numerator'], `${where}[${index}].numerator`, 1, modulus - 1),
      denominator: modulus,
    };
  });
  if (lower === undefined || upper === undefined || lower.numerator >= upper.numerator) {
    return fail(where, 'must list the lower angle first');
  }
  return [lower, upper];
};

const parseResidual = (value: unknown, period: number, where: string): CatalogResidual => {
  const residual = record(value, where);
  const base = {
    orbitAbs: nonNegative(residual['orbitAbs'], `${where}.orbitAbs`),
    centerError: nonNegative(residual['centerError'], `${where}.centerError`),
  };
  const divisor = residual['properDivisorOrbitMinAbs'];
  if (period === 1) {
    return divisor === undefined ? base : fail(where, 'period 1 has no proper divisor residual');
  }
  return {
    ...base,
    properDivisorOrbitMinAbs: nonNegative(divisor, `${where}.properDivisorOrbitMinAbs`),
  };
};

const parseAliases = (value: unknown, where: string): string[] =>
  value === undefined
    ? []
    : array(value, where).map((alias, index) =>
        typeof alias === 'string' && ALIAS_PATTERN.test(alias)
          ? alias
          : fail(`${where}[${index}]`, 'must look like mi-<lowercase words>'),
      );

const parseCombinatorics = (
  entry: Json,
  period: number,
  where: string,
): Pick<CatalogComponent, 'internalAddress' | 'angledInternalAddress' | 'characteristicRays'> => {
  const internalAddress = parseInternalAddress(
    entry['internalAddress'],
    period,
    `${where}.internalAddress`,
  );
  if (period === 1) {
    if (entry['angledInternalAddress'] !== undefined || entry['characteristicRays'] !== undefined) {
      fail(where, 'the main cardioid has no angled address or ray pair');
    }
    return { internalAddress };
  }
  return {
    internalAddress,
    angledInternalAddress: parseAngledAddress(
      entry['angledInternalAddress'],
      internalAddress,
      `${where}.angledInternalAddress`,
    ),
    characteristicRays: parseRays(
      entry['characteristicRays'],
      period,
      `${where}.characteristicRays`,
    ),
  };
};

const parseComponent = (
  raw: unknown,
  index: number,
  context: Pick<Catalog, 'maxPeriod' | 'methods' | 'provenance'>,
): CatalogComponent => {
  const where = `components[${index}]`;
  const entry = record(raw, where);
  const id = text(entry['id'], `${where}.id`);
  const period = integer(entry['period'], `${where}.period`, 1, context.maxPeriod);
  const combinatorics = parseCombinatorics(entry, period, where);
  const rays = combinatorics.characteristicRays;
  const expectedId =
    rays === undefined
      ? catalogIdFor(1, 0, 1)
      : catalogIdFor(period, rays[0].numerator, rays[1].numerator);
  if (id !== expectedId)
    fail(`${where}.id`, `must be ${expectedId}, derived from the period and rays`);
  const center = record(entry['center'], `${where}.center`);
  const method = text(entry['method'], `${where}.method`);
  const provenance = text(entry['provenance'], `${where}.provenance`);
  if (!(method in context.methods)) fail(`${where}.method`, `unknown method ${method}`);
  if (!(provenance in context.provenance))
    fail(`${where}.provenance`, `unknown provenance ${provenance}`);
  return {
    id,
    aliases: parseAliases(entry['aliases'], `${where}.aliases`),
    label: text(entry['label'], `${where}.label`),
    center: {
      re: finite(center['re'], `${where}.center.re`),
      im: finite(center['im'], `${where}.center.im`),
    },
    centerPrecisionDigits: integer(
      entry['centerPrecisionDigits'],
      `${where}.centerPrecisionDigits`,
      1,
      17,
    ),
    period,
    ...combinatorics,
    residual: parseResidual(entry['residual'], period, `${where}.residual`),
    method,
    provenance,
  };
};

const requireUniqueNames = (components: readonly CatalogComponent[]): void => {
  const names = components.flatMap((component) => [component.id, ...component.aliases]);
  const repeated = names.find((name, index) => names.indexOf(name) !== index);
  if (repeated !== undefined) fail('components', `id or alias ${repeated} is not unique`);
};

/** Validates a parsed catalog file against schema v2; throws CatalogSchemaError. */
export const parseCatalog = (raw: unknown): Catalog => {
  const root = record(raw, 'catalog');
  if (root['schemaVersion'] !== CATALOG_SCHEMA_VERSION_2) {
    fail('schemaVersion', `must be ${CATALOG_SCHEMA_VERSION_2}`);
  }
  if (root['license'] !== 'CC0-1.0') fail('license', 'must be CC0-1.0');
  const context = {
    maxPeriod: integer(root['maxPeriod'], 'maxPeriod', 1, MAX_CATALOG_PERIOD),
    methods: parseMethods(root['methods']),
    provenance: parseProvenance(root['provenance']),
  };
  const components = array(root['components'], 'components').map((entry, index) =>
    parseComponent(entry, index, context),
  );
  if (components.length === 0) fail('components', 'must not be empty');
  requireUniqueNames(components);
  return { schemaVersion: 2, license: 'CC0-1.0', ...context, components };
};
```

Replace the whole of `src/catalog/components.ts` with:

```ts
import catalogData from '../../catalog/components.v2.json';
import { parseCatalog, type CatalogComponent } from './schema';

export {
  catalogIdFor,
  CatalogSchemaError,
  MAX_CATALOG_PERIOD,
  parseCatalog,
  rayModulus,
  type AngledAddressStep,
  type Catalog,
  type CatalogComponent,
  type CatalogProvenance,
  type CatalogResidual,
  type RationalAngle,
} from './schema';

/**
 * Independently generated centres of every hyperbolic component of exact
 * period at most four (catalog/components.v2.json, ADR 0011), validated on
 * load. Ids derive from the characteristic rays, so they survive
 * regeneration; v1 ids remain aliases.
 */
export const CATALOG = parseCatalog(catalogData);

export const CATALOG_SCHEMA_VERSION = CATALOG.schemaVersion;
export const CATALOG_LICENSE = CATALOG.license;
export const COMPONENT_CATALOG: readonly CatalogComponent[] = CATALOG.components;

const BY_NAME: ReadonlyMap<string, CatalogComponent> = new Map(
  COMPONENT_CATALOG.flatMap((component) =>
    [component.id, ...component.aliases].map((name) => [name, component] as const),
  ),
);

/** The component with this canonical id or alias (a v1 id), if any. */
export function findCatalogComponent(idOrAlias: string): CatalogComponent | undefined {
  return BY_NAME.get(idOrAlias);
}
```

- [ ] **Step 5: Run the loader test to verify it passes**

Run: `npx vitest run tests/unit/catalog/schema.test.ts`
Expected: PASS, `Tests  25 passed (25)`.

- [ ] **Step 6: Write the failing alias tests in the share-link suites**

In `tests/unit/ui/share-state.test.ts`:

1. Below `import { COMPONENT_CATALOG } from '../../../src/catalog/components';` add:

```ts
import { V1_CATALOG } from '../catalog/v1-catalog';
```

2. In `DEEP_VIEW`, change `selection: { kind: 'catalog', id: 'mi-p3-rabbit' },` to:

```ts
  selection: { kind: 'catalog', id: 'mi-p3-1-2' },
```

(Leave the test `decodes a complete v1 link exactly` and its query `...&sel=mi-p3-rabbit` unchanged: it now proves that a v1 id decodes to the canonical id.)

3. Directly above `it('treats absent optional fields as their defaults without an issue', () => {` insert:

```ts
  it('resolves every v1 catalog id to its canonical id without an issue (ADR 0011)', () => {
    for (const entry of V1_CATALOG) {
      expect(v1(`?v=1&sel=${entry.v1Id}`), entry.v1Id).toEqual({
        state: { ...DEFAULT_SHARE_STATE, selection: { kind: 'catalog', id: entry.id } },
        issues: [],
      });
    }
  });

```

4. In the `it.each` table of `falls back field by field`, after the row `['?v=1&sel=mi-p9-nope', ['selection'], {}],` add:

```ts
    ['?v=1&sel=mi-p4-1-3', ['selection'], {}],
```

5. In the last row of that table, change `{ semanticView: 'period', selection: { kind: 'catalog', id: 'mi-p2-basilica' } },` to:

```ts
      { semanticView: 'period', selection: { kind: 'catalog', id: 'mi-p2-1-2' } },
```

(its query keeps `sel=mi-p2-basilica`).

6. In `writes every field in schema order with exact decimals`, change the expected string's ending `&sel=mi-p3-rabbit',` to `&sel=mi-p3-1-2',`:

```ts
      'v=1&c=-0.1592,-1.0344&s=0.0198&view=multiplier&q=detailed&sel=mi-p3-1-2',
```

In `tests/unit/ui/share-link.test.ts`:

1. Change `selection: { kind: 'catalog', id: 'mi-p2-basilica' },` (in `BASILICA_VIEW`) and the `BASILICA_QUERY` line to:

```ts
  selection: { kind: 'catalog', id: 'mi-p2-1-2' },
};
const BASILICA_QUERY = 'v=1&c=-1,0&s=0.5&view=period&q=quick&sel=mi-p2-1-2';
```

2. Directly above `describe('isEncodableShareState', () => {` insert:

```ts
describe('catalog aliases (ADR 0011)', () => {
  it('copies the canonical id after a v1 catalog id opened the view', () => {
    const startup = resolveStartupState(BASILICA_QUERY.replace('mi-p2-1-2', 'mi-p2-basilica'));
    expect(startup.notice).toBeUndefined();
    expect(shareLink('http://127.0.0.1:4174', '/', startup)).toBe(
      `http://127.0.0.1:4174/?${BASILICA_QUERY}`,
    );
  });
});

```

- [ ] **Step 7: Run them to verify they fail**

Run: `npx vitest run tests/unit/ui/share-state.test.ts tests/unit/ui/share-link.test.ts`
Expected: FAIL — the decoded selection id is the v1 text (for example `"id": "mi-p3-rabbit"` where `"mi-p3-1-2"` is expected) in `decodes a complete v1 link exactly`, `resolves every v1 catalog id…`, the `mi-p2-basilica` fallback row, and `copies the canonical id…`.

- [ ] **Step 8: Resolve aliases to canonical ids**

In `src/ui/share-state.ts`, in `decodeSelection`, replace the line

```ts
  return findCatalogComponent(text) === undefined ? undefined : { kind: 'catalog', id: text };
```

with:

```ts
  // A v1 id is an alias (ADR 0011): it resolves to the entry's canonical id.
  const component = findCatalogComponent(text);
  return component === undefined ? undefined : { kind: 'catalog', id: component.id };
```

In `src/ui/application.ts` (inspector `show`, around line 1470), `internalAddress` is now always present, so the lint rule `no-unnecessary-condition` rejects the guard. Replace

```ts
      if (component.internalAddress) {
        addFact('Internal address', component.internalAddress.join(' → '));
      }
```

with:

```ts
      addFact('Internal address', component.internalAddress.join(' → '));
```

Run: `npx vitest run tests/unit/ui tests/unit/catalog`
Expected: PASS (share-state 47 tests, share-link 18, schema 25).

- [ ] **Step 9: Update the browser scenarios**

In `tests/e2e/explorer.spec.ts`, in `records a settled view in the address without adding history and reopens it`, change `expect(searchParam(page, 'sel')).toBe('mi-p2-basilica');` to:

```ts
    expect(searchParam(page, 'sel')).toBe('mi-p2-1-2');
```

Directly above `test('restores a selected point and inspects it again', async ({ page }) => {` (inside `test.describe('Shareable links (MI-UX-019)'`), insert:

```ts
  test('restores a selection named by a v1 catalog id (ADR 0011)', async ({ page }) => {
    await page.goto('/?v=1&c=-1.3107026413368328,0&s=0.05&sel=mi-p4-02');
    await waitForStable(page);
    await expect(
      page
        .getByRole('region', { name: 'Point evidence' })
        .getByRole('heading', { name: 'Period-4 component 2' }),
    ).toBeVisible();
    await expect(page.getByRole('status', { name: 'Link notice' })).toHaveText('');
    await expect.poll(() => searchParam(page, 'sel'), { timeout: 10_000 }).toBe('mi-p4-6-9');
  });

```

Run: `npx playwright test tests/e2e/explorer.spec.ts -g "Shareable links|catalog|Catalog|marker"`
Expected: every matched test passes, none fail (26 at `63fc119`; the e2e-reliability plan may add more).

- [ ] **Step 10: Delete the v1 file and confirm nothing reads it**

Run: `git rm catalog/components.v1.json && grep -rn "components\.v1" src tests tools package.json`
Expected: exactly one match, the comment in `tests/unit/catalog/v1-catalog.ts`. (The `poc/` comments and the authored `docs/plans/` page are historical and stay.)

- [ ] **Step 11: Record the decision**

Create `docs/decisions/0011-catalog-schema-v2-and-stable-ids.md`:

````markdown
# ADR 0011: Catalog schema v2 and stable component ids

- Status: Accepted
- Date: 2026-10-17
- Amends: [ADR 0004](0004-catalog-disposition.md) (the curated layer's file),
  [ADR 0009](0009-shareable-url-schema.md) (catalog ids in `sel=`)
- Trace: [PHASE2-TODO item 4](../verification/PHASE2-TODO.md#4-catalog-schema-and-tests);
  PLAN §3.3 and §11; `MI-PERF-003`, `MI-UX-019`

## Context

PLAN §3.3 asks each catalog entry to carry a stable project identifier,
validation residuals and method, provenance and a schema version. Schema v1
(`catalog/components.v1.json`) carried none of the last three, and its
period-4 ids `mi-p4-01`…`mi-p4-06` were ordinals: the position of the centre
in a sort, which any regeneration with more periods or a different sort would
renumber. Five of those six entries had no internal address and none had an
angled address. Share links (ADR 0009) name catalog ids in `sel=`, so an id
is a public interface. The owner ruled (2026-10-17) that when the ordinal ids
are replaced, the old ids stay as aliases and the link version `v` does not
change.

PHASE2-TODO item 7 will generate the full period ≤12 core: 4,016 centres in
an encoded form within 256 KiB. The id scheme and schema must scale to it.

## Decision

**Ids.** A component's canonical id is `mi-p<p>-<a>-<b>`, where `a/(2^p−1)`
and `b/(2^p−1)` are its lower and upper characteristic angles (the external
rays landing at its root), written over `2^p − 1` without reducing. The main
cardioid's root angle 0 is the Lavaurs pair 0/1 and 1/1, so its id is
`mi-p1-0-1`. Examples: the Douady rabbit is `mi-p3-1-2` (rays 1/7, 2/7), the
period-2 bulb `mi-p2-1-2`, the 1/4 bulb `mi-p4-1-2`.

Why rays:

- **Unique.** Exactly two rays land at the root of each component of period
  p > 1, both of exact period p, and each angle of exact period p lands at
  exactly one such root (Douady–Hubbard; Lavaurs' pairing enumerates them).
- **Stable.** The id is a mathematical property of the component, not of a
  sort, a precision or a generator run. Adding periods, refining centres or
  reordering the file cannot change it.
- **Self-checking and compact.** The loader rejects an id that disagrees with
  the entry's period and rays. For p ≤ 12 the numerators fit in 12 bits, so an
  encoded core can store `(p, a, b)` and derive the id, the internal address
  and the angled internal address from them instead of storing strings.

Rejected: the internal address alone is not unique (the rabbit and co-rabbit
share `1 → 3`; PLAN §3.3 says so). The angled internal address is unique
(Schleicher) but long at period 12, awkward in a URL, and itself computed from
the rays. A centre hash depends on precision and rounding. Ordinals are what
broke.

**Aliases.** Every v1 id stays resolvable forever as an alias of its entry.
`findCatalogComponent` resolves ids and aliases; a v1 link with
`sel=mi-p4-02` opens with the canonical selection `mi-p4-6-9`, without a
notice, and the address bar is rewritten with the canonical id once the view
settles. `v` stays 1: the meaning of `sel` (one catalog component) is
unchanged. Aliases live in `catalog/curation.v2.json`, never collide with a
canonical id or each other, and are never removed.

**Schema v2.** `catalog/components.v2.json` replaces the v1 file. Top level:
`schemaVersion: 2`, `license`, `maxPeriod`, a `methods` table and a
`provenance` table. Each entry: `id`, optional `aliases`, `label`, `period`,
`center` (the nearest binary64 to the refined centre), `centerPrecisionDigits`,
`internalAddress`, `angledInternalAddress` and `characteristicRays` (absent
for the main cardioid), `residual`, `method` and `provenance`:

- `residual.orbitAbs` is |f_c^p(0)|, `residual.centerError` the distance to
  the 80-digit refined centre, and `residual.properDivisorOrbitMinAbs` the
  smallest |f_c^d(0)| over proper divisors d (absent for p = 1), each
  evaluated at the stored centre in 80-digit arithmetic, to three significant
  digits. Together they show the stored value is a centre of exact period p.
- `method` and `provenance` are keys into the top-level tables, so a 4,016-entry
  core spends one small index per entry on them. Provenance records the
  generator, its arguments, and which fields were curated (`curated-label`:
  label and aliases from the curation file; `generated-label`: none).

**Generation.** `tools/generate_catalog.py` writes the whole file from first
principles plus the curation file: Durand–Kerner seeds refined by Newton in
80-digit decimal arithmetic; Lavaurs' ray pairing with each pair matched to the
one centre both of its rays land on; the internal address from the kneading
sequence; angled-address denominators by Schleicher's formula and numerators
from the tuned sub-wake that contains the lower ray (`tools/catalog_combinatorics.py`).
`npm run catalog:check` regenerates the file and requires byte equality;
`npm run catalog:test` tests the combinatorics, including injectivity of the
angled addresses and their conjugation symmetry through period 8. The loader
(`src/catalog/schema.ts`) validates the structure on every load; the unit
tests in `tests/unit/catalog/` check exact periods, ray pairs, recomputed
internal addresses, Schleicher denominators, conjugate closure and the v1
aliases.

**Scaling to item 7.** The JSON form costs about 1 KiB per entry and is for
the curated layer. The generated core keeps the same fields but encodes them:
per entry the period, `a` and `b` (5 bytes), the centre (16), the three
residuals as float32 (12) and the method and provenance indexes (2), about
35 bytes, or about 140 KiB for 4,016 entries before compression, inside the
256 KiB budget. Ids, addresses and generated labels are derived on load.
Curated labels and aliases stay in the small curation file, keyed by
canonical id. Sharding by period is possible without changing ids.

## Consequences

- The eleven components, their labels, and their keyboard focus order are
  unchanged. Their centres move by at most 2.1·10⁻¹⁵ (v1 stored the binary64
  Durand–Kerner roots; v2 stores the correctly rounded refined centres), far
  below a pixel at the zoom ceiling.
- The six period-4 entries now have internal and angled addresses:
  `1 →½ 2 →½ 3 →½ 4` (rays 7/15, 8/15), `1 →½ 2 →½ 4` (6/15, 9/15),
  `1 →⅓ 3 →½ 4` and `1 →⅔ 3 →½ 4` (3/15, 4/15 and 11/15, 12/15),
  `1 →¼ 4` and `1 →¾ 4` (1/15, 2/15 and 13/15, 14/15). The airplane gains its
  angled address `1 →½ 2 →½ 3`. Every field v1 had reviewed is reproduced.
- New share links carry canonical ids; v1 links keep working through aliases
  (`tests/unit/ui/share-state.test.ts`, the `Shareable links (MI-UX-019)` e2e
  scenario for `sel=mi-p4-02`).
- The period-4 labels remain the v1 placeholders ("Period-4 component N").
  Naming them is an item 6 or 7 curation decision; a label change does not
  change an id.
````

Append to the end of `docs/decisions/0004-catalog-disposition.md`:

```markdown
## Amendment (2026-10-17)

[ADR 0011](0011-catalog-schema-v2-and-stable-ids.md) replaced
`catalog/components.v1.json` with `catalog/components.v2.json` (schema v2):
the same eleven components and labels, with residuals, method, provenance,
ray-derived ids and the v1 ids kept as aliases. This decision's scope (the
curated layer is the only shipped catalog in Phase 2) is unchanged.
```

Append to the end of `docs/decisions/0009-shareable-url-schema.md`:

```markdown
## Amendment (2026-10-17)

The ordinal catalog ids were replaced by ray-derived ids
([ADR 0011](0011-catalog-schema-v2-and-stable-ids.md)). Following the owner's
ruling, `v` stays 1: every v1 id remains an alias that `sel=` resolves to its
entry without a notice, and the settled address carries the canonical id
(`sel=mi-p4-02` becomes `sel=mi-p4-6-9`). Where this ADR says v1 fixes "the
catalog ids in `catalog/components.v1.json`", read: the canonical ids and
aliases of `catalog/components.v2.json`, of which the v1 ids are a permanent
subset.
```

Run: `npx prettier --write src/catalog tests/unit/catalog tests/unit/ui docs/decisions && npm run format:check`
Expected: `All matched files use Prettier code style!`

- [ ] **Step 12: Verify the global gates**

Run: `npm run check && npm run fixtures:kernel-golden -- --check && npx playwright test`
Expected: every command exits 0.

- [ ] **Step 13: Commit**

```bash
git add -A src/catalog src/ui/share-state.ts src/ui/application.ts tests/unit/catalog tests/unit/ui tests/e2e/explorer.spec.ts .prettierignore docs/decisions
git commit -m "$(cat <<'EOF'
Catalog: load schema v2 through a validating parser; v1 ids become aliases

Ids derive from the characteristic rays (mi-p<p>-<a>-<b>); every v1 id
resolves as an alias, so v1 share links keep working without a version bump
(ADR 0011, amending ADR 0004 and ADR 0009). Prettier now checks src/catalog.

Co-Authored-By: Claude Haiku 5.5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: Catalog unit test (mathematical invariants)

A test that guards the committed file: counts per period, unique ids, ids from rays, exact periods, residual bounds, ray periods, internal addresses recomputed from the kneading sequence, Schleicher denominators, conjugate closure, v1 aliases and the reviewed v1 fields.

**Files:**
- Create: `tests/unit/catalog/catalog.test.ts`
- Modify (full rewrite): `catalog/README.md`
- Modify: `docs/verification/REQUIREMENTS.md`, `model/MandelbrotInteriority.sysml`, `docs/verification/PHASE2-TODO.md`

**Interfaces:**
- Consumes: `CATALOG`, `catalogIdFor`, `COMPONENT_CATALOG`, `findCatalogComponent`, `rayModulus`, `CatalogComponent` (Task 3); `V1_CATALOG` (Task 3).
- Produces: nothing new.

- [ ] **Step 1: Write the test**

Create `tests/unit/catalog/catalog.test.ts`:

```ts
import { describe, expect, it } from 'vitest';

import {
  CATALOG,
  catalogIdFor,
  COMPONENT_CATALOG,
  findCatalogComponent,
  rayModulus,
  type CatalogComponent,
} from '../../../src/catalog/components';
import { V1_CATALOG } from './v1-catalog';

/** Hyperbolic components of exact period p (OEIS A000740), p = 1..12; 4,016 in all. */
const COMPONENT_COUNTS = [1, 1, 3, 6, 15, 27, 63, 120, 252, 495, 1023, 2010];

const properDivisors = (n: number): number[] =>
  Array.from({ length: n - 1 }, (_, index) => index + 1).filter((d) => n % d === 0);

/** |f_c^n(0)| in binary64. */
const orbitAbs = (component: CatalogComponent, n: number): number => {
  let re = 0;
  let im = 0;
  for (let step = 0; step < n; step += 1) {
    [re, im] = [re * re - im * im + component.center.re, 2 * re * im + component.center.im];
  }
  return Math.hypot(re, im);
};

/** Kneading sequence of numerator / (2^p - 1): '1' inside (θ/2, (θ+1)/2), '0' outside, '*' on it. */
const kneading = (numerator: number, period: number): string => {
  const modulus = rayModulus(period);
  let angle = numerator;
  let symbols = '';
  for (let step = 0; step < period; step += 1) {
    const doubled = 2 * angle;
    if (doubled === numerator || doubled === numerator + modulus) symbols += '*';
    else symbols += doubled > numerator && doubled < numerator + modulus ? '1' : '0';
    angle = doubled % modulus;
  }
  return symbols;
};

/** Schleicher's ρ: the first m > n where the kneading sequence differs from its n-shift. */
const rhoOf =
  (symbols: string) =>
  (start: number): number => {
    const symbol = (index: number): string => symbols[(index - 1) % symbols.length] ?? '';
    let candidate = start + 1;
    while (candidate < symbols.length && symbol(candidate) === symbol(candidate - start)) {
      candidate += 1;
    }
    return candidate;
  };

const internalAddressOf = (numerator: number, period: number): number[] => {
  const address = [1];
  if (period === 1) return address;
  const rho = rhoOf(kneading(numerator, period));
  while (address.at(-1)! < period) address.push(rho(address.at(-1)!));
  return address;
};

/** Schleicher's denominator of the angle at `from` on the way to `to`. */
const angledDenominatorOf = (numerator: number, period: number, from: number, to: number) => {
  const rho = rhoOf(kneading(numerator, period));
  const remainder = to % from || from;
  const orbit = new Set([remainder]);
  for (let current = remainder; current < period;) {
    current = rho(current);
    orbit.add(current);
  }
  return (to - remainder) / from + (orbit.has(from) ? 1 : 2);
};

const hasExactRayPeriod = (numerator: number, period: number): boolean =>
  properDivisors(period).every(
    (divisor) => (numerator * rayModulus(divisor)) % rayModulus(period) !== 0,
  );

const raysOf = (component: CatalogComponent): readonly [number, number] => {
  const rays = component.characteristicRays;
  return rays === undefined ? [0, 1] : [rays[0].numerator, rays[1].numerator];
};

describe('component catalog', () => {
  it('lists every component of each period up to its maximum, once', () => {
    const counts = Array.from(
      { length: CATALOG.maxPeriod },
      (_, index) => COMPONENT_CATALOG.filter((component) => component.period === index + 1).length,
    );
    expect(counts).toEqual(COMPONENT_COUNTS.slice(0, CATALOG.maxPeriod));
  });

  it('keeps the v1 order, which is the keyboard focus order of the markers', () => {
    expect(COMPONENT_CATALOG.map((component) => component.id)).toEqual(
      V1_CATALOG.map((entry) => entry.id),
    );
  });

  it('has unique ids and aliases', () => {
    const names = COMPONENT_CATALOG.flatMap((component) => [component.id, ...component.aliases]);
    expect(new Set(names).size).toBe(names.length);
  });

  it('derives every id from the period and the characteristic rays', () => {
    for (const component of COMPONENT_CATALOG) {
      const [lower, upper] = raysOf(component);
      expect(component.id).toBe(catalogIdFor(component.period, lower, upper));
    }
  });

  it('stores centres of exact period, not of a divisor period', () => {
    for (const component of COMPONENT_CATALOG) {
      expect(orbitAbs(component, component.period), component.id).toBeLessThan(1e-12);
      for (const divisor of properDivisors(component.period)) {
        expect(orbitAbs(component, divisor), `${component.id} at ${divisor}`).toBeGreaterThan(1e-3);
      }
    }
  });

  it('records residuals that bound the stored centre', () => {
    for (const { id, center, period, residual } of COMPONENT_CATALOG) {
      const scale = Math.max(1, Math.hypot(center.re, center.im));
      expect(residual.centerError, id).toBeLessThanOrEqual(Number.EPSILON * scale);
      expect(residual.orbitAbs, id).toBeLessThan(1e-14);
      if (period > 1) expect(residual.properDivisorOrbitMinAbs, id).toBeGreaterThan(1e-3);
    }
  });

  it('pairs two rays of exact period p over 2^p - 1', () => {
    for (const component of COMPONENT_CATALOG.filter((entry) => entry.period > 1)) {
      const [lower, upper] = raysOf(component);
      expect(lower, component.id).toBeLessThan(upper);
      expect(hasExactRayPeriod(lower, component.period), component.id).toBe(true);
      expect(hasExactRayPeriod(upper, component.period), component.id).toBe(true);
      // Both characteristic rays of a component share its kneading sequence.
      expect(kneading(upper, component.period)).toBe(kneading(lower, component.period));
    }
  });

  it('states the internal address the lower ray determines', () => {
    for (const component of COMPONENT_CATALOG) {
      expect(component.internalAddress, component.id).toEqual(
        internalAddressOf(raysOf(component)[0], component.period),
      );
    }
  });

  it('states angled addresses with Schleicher denominators in lowest terms', () => {
    for (const component of COMPONENT_CATALOG.filter((entry) => entry.period > 1)) {
      const [lower] = raysOf(component);
      for (const step of component.angledInternalAddress ?? []) {
        expect(step.rotation.denominator, component.id).toBe(
          angledDenominatorOf(lower, component.period, step.fromPeriod, step.toPeriod),
        );
      }
    }
  });

  it('is closed under complex conjugation, mirroring rays and angles', () => {
    for (const component of COMPONENT_CATALOG) {
      const modulus = rayModulus(component.period);
      const [lower, upper] = raysOf(component);
      const mirror = COMPONENT_CATALOG.find(
        (other) =>
          other.period === component.period &&
          other.center.re === component.center.re &&
          other.center.im === -component.center.im,
      );
      expect(mirror, component.id).toBeDefined();
      if (component.period === 1 || mirror === undefined) continue;
      expect(raysOf(mirror)).toEqual([modulus - upper, modulus - lower]);
      expect(mirror.angledInternalAddress?.map((step) => step.rotation)).toEqual(
        component.angledInternalAddress?.map(({ rotation }) => ({
          numerator: rotation.denominator - rotation.numerator,
          denominator: rotation.denominator,
        })),
      );
    }
  });

  it('keeps every v1 id as an alias of the same component, label and centre', () => {
    for (const entry of V1_CATALOG) {
      const component = findCatalogComponent(entry.v1Id);
      expect(component?.id, entry.v1Id).toBe(entry.id);
      expect(component?.aliases, entry.v1Id).toContain(entry.v1Id);
      expect(component?.label, entry.v1Id).toBe(entry.label);
      const moved = Math.hypot(
        (component?.center.re ?? Infinity) - entry.center.re,
        (component?.center.im ?? Infinity) - entry.center.im,
      );
      expect(moved, entry.v1Id).toBeLessThanOrEqual(2.5e-15);
    }
  });

  it('agrees with every combinatorial field the v1 catalog had reviewed', () => {
    const reviewed = (id: string) => findCatalogComponent(id);
    expect(reviewed('mi-p1-main')?.internalAddress).toEqual([1]);
    expect(reviewed('mi-p2-basilica')?.angledInternalAddress).toEqual([
      { fromPeriod: 1, toPeriod: 2, rotation: { numerator: 1, denominator: 2 } },
    ]);
    expect(raysOf(reviewed('mi-p3-airplane')!)).toEqual([3, 4]);
    expect(reviewed('mi-p3-airplane')?.internalAddress).toEqual([1, 2, 3]);
    expect(reviewed('mi-p3-corabbit')?.angledInternalAddress).toEqual([
      { fromPeriod: 1, toPeriod: 3, rotation: { numerator: 2, denominator: 3 } },
    ]);
    expect(raysOf(reviewed('mi-p3-corabbit')!)).toEqual([5, 6]);
    expect(reviewed('mi-p3-rabbit')?.angledInternalAddress).toEqual([
      { fromPeriod: 1, toPeriod: 3, rotation: { numerator: 1, denominator: 3 } },
    ]);
    expect(raysOf(reviewed('mi-p3-rabbit')!)).toEqual([1, 2]);
    expect(reviewed('mi-p4-02')?.internalAddress).toEqual([1, 2, 4]);
  });

  it('gives the six period-4 entries their addresses', () => {
    const addresses = Object.fromEntries(
      COMPONENT_CATALOG.filter((entry) => entry.period === 4).map((entry) => [
        entry.id,
        entry.angledInternalAddress
          ?.map((s) => `${s.fromPeriod}-${s.rotation.numerator}/${s.rotation.denominator}->`)
          .join('')
          .concat('4'),
      ]),
    );
    expect(addresses).toEqual({
      'mi-p4-7-8': '1-1/2->2-1/2->3-1/2->4',
      'mi-p4-6-9': '1-1/2->2-1/2->4',
      'mi-p4-11-12': '1-2/3->3-1/2->4',
      'mi-p4-3-4': '1-1/3->3-1/2->4',
      'mi-p4-13-14': '1-3/4->4',
      'mi-p4-1-2': '1-1/4->4',
    });
  });
});
```

- [ ] **Step 2: Run it**

Run: `npx vitest run tests/unit/catalog/catalog.test.ts`
Expected: PASS, `Tests  13 passed (13)`. (It passes at once because Task 2 generated correct data; Step 3 shows it guards the file.)

- [ ] **Step 3: Show that it catches a wrong address, then restore the file**

Run:

```bash
python3 -c "
import json
p = 'catalog/components.v2.json'
d = json.load(open(p))
next(c for c in d['components'] if c['id'] == 'mi-p3-1-2')['angledInternalAddress'][0]['rotation']['numerator'] = 2
open(p, 'w').write(json.dumps(d, indent=2, ensure_ascii=False) + '\n')
"
npx vitest run tests/unit/catalog/catalog.test.ts
```

Expected: FAIL — `is closed under complex conjugation, mirroring rays and angles` and `agrees with every combinatorial field the v1 catalog had reviewed` fail (2 failed, 11 passed).

Run: `git checkout catalog/components.v2.json && npx vitest run tests/unit/catalog/catalog.test.ts && npm run catalog:check`
Expected: `Tests  13 passed (13)` and `validated 11 exact-period components through period 4`.

- [ ] **Step 4: Rewrite the catalog README**

Replace the whole of `catalog/README.md` with:

````markdown
# Component catalog

`components.v2.json` is the Mandelbrot Interiority catalog: every
hyperbolic-component centre of exact period one through four, eleven entries
in all. Its schema and id scheme are recorded in
[ADR 0011](../docs/decisions/0011-catalog-schema-v2-and-stable-ids.md).

## Files

- `components.v2.json` is generated; never edit it by hand. Regenerate it with
  `python3 tools/generate_catalog.py --write catalog/components.v2.json`.
- `curation.v2.json` holds what a person reviewed: the names (labels) and the
  v1 ids each entry keeps as aliases, keyed by canonical id. Edit it, then
  regenerate.

## Ids

An entry's id is `mi-p<p>-<a>-<b>`: its period and the numerators of its two
characteristic rays over `2^p − 1` (the main cardioid is `mi-p1-0-1`). The id
depends only on the component, so regeneration never changes it. The v1 ids
(`mi-p1-main`, `mi-p3-rabbit`, `mi-p4-01`…) are aliases that resolve forever,
because share links (ADR 0009) name them in `sel=`. Never remove an alias.

## What each entry records

- `center`: the nearest binary64 to the centre refined by Newton's method in
  80-digit decimal arithmetic, and `centerPrecisionDigits`, its correct
  significant digits (at most 16).
- `period`, `internalAddress`, `angledInternalAddress` and
  `characteristicRays`, all generated from the rays (the main cardioid has no
  angled steps and no ray pair).
- `residual`: |f_c^p(0)|, the distance to the refined centre, and the
  smallest |f_c^d(0)| over proper divisors d, at the stored centre.
- `method` and `provenance`: keys into the file's `methods` and `provenance`
  tables, which say how the fields were computed and which were curated.

## Validation

```sh
npm run catalog:test   # the combinatorics and generator unit tests (Python)
npm run catalog:check  # regenerates the file and requires byte equality
```

`npm run check` runs both, and the unit tests in `tests/unit/catalog/` check
the loaded file: exact periods, ray pairs, recomputed internal addresses,
Schleicher denominators, conjugate closure and the v1 aliases. The loader
(`src/catalog/schema.ts`) rejects a malformed file at startup. This is
reproducible validation, not a claim of formal certification.

The catalog data is dedicated to the public domain under
[CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/). The generator
and application source remain licensed under GPL-3.0-only.

## Phase 2 role

Per [ADR 0004](../docs/decisions/0004-catalog-disposition.md), this curated
identity layer is the only shipped catalog in the Phase 2 performance work: it
stays a navigation, testing, and explanation feature and is deliberately not a
performance dependency. The exhaustive period-12 core (PHASE2-TODO item 7)
will extend this schema in an encoded form (ADR 0011, "Scaling to item 7").
An absent generated layer means "not yet built," not "impossible."
````

(`catalog/` is excluded from Prettier, so it needs no formatting step.)

- [ ] **Step 5: Update the requirements trace and the model**

In `docs/verification/REQUIREMENTS.md`:

1. In the `MI-UX-019` row, replace `` `share-state` and `share-link` unit suites; [ADR 0009](../decisions/0009-shareable-url-schema.md) `` with:

```markdown
`share-state` and `share-link` unit suites; [ADR 0009](../decisions/0009-shareable-url-schema.md); v1 catalog ids resolve as aliases (`restores a selection named by a v1 catalog id (ADR 0011)`, [ADR 0011](../decisions/0011-catalog-schema-v2-and-stable-ids.md))
```

2. In the traceability-matrix row for `MI-PERF-003`, replace `**Pass (proposed)** — curated catalog unchanged; F not adopted, so its conditional clauses do not apply` with:

```markdown
**Pass (proposed)** — curated catalog's eleven components and v1 ids intact under schema v2 ([ADR 0011](../decisions/0011-catalog-schema-v2-and-stable-ids.md), `tests/unit/catalog/`); F not adopted, so its conditional clauses do not apply
```

Run: `npx prettier --write docs/verification/REQUIREMENTS.md`

In `model/MandelbrotInteriority.sysml`, in `verification def <'MI-VER-PERF-003'> CatalogDeterminismTest`, replace the doc comment body

```text
             * Check catalog completeness, deterministic generation when a
             * generated layer ships, and keyboard, focus, and marker-cap
             * accessibility of catalog presentation.
```

with:

```text
             * Check catalog completeness, deterministic generation when a
             * generated layer ships, and keyboard, focus, and marker-cap
             * accessibility of catalog presentation. Schema v2 entries carry
             * residuals, method and provenance; ids derive from the
             * characteristic rays and v1 ids remain aliases (ADR 0011).
```

- [ ] **Step 6: Tick item 4 in the TODO**

In `docs/verification/PHASE2-TODO.md`, section `### 4. Catalog schema and tests`, replace the four `- [ ]` items with:

```markdown
- [x] Schema v2: per-entry `residual`, `method` and `provenance` (generator,
      loader, `npm run catalog:check`). Done:
      [ADR 0011](../decisions/0011-catalog-schema-v2-and-stable-ids.md),
      `catalog/components.v2.json`, `src/catalog/schema.ts`.
- [x] A catalog unit test: unique ids, exact period, ray pairs, schema.
      Done: `tests/unit/catalog/` and `npm run catalog:test`.
- [x] A stable id scheme that survives regeneration (today's `mi-p4-NN` is
      ordinal). Done: `mi-p<p>-<a>-<b>` from the characteristic rays; v1 ids
      stay as aliases, `v` unchanged (ADR 0011, ADR 0009 amendment).
- [x] Record internal and angled addresses for the six period-4 entries that
      lack them, or state why not. Done: generated from the rays (kneading
      sequence, Schleicher denominators, tuned sub-wakes), listed in ADR 0011.
```

Run: `npx prettier --write docs/verification/PHASE2-TODO.md`

- [ ] **Step 7: Verify the global gates**

Run: `npm run check && npm run fixtures:kernel-golden -- --check && npx playwright test`
Expected: every command exits 0.

- [ ] **Step 8: Commit**

```bash
git add tests/unit/catalog/catalog.test.ts catalog/README.md docs/verification/REQUIREMENTS.md model/MandelbrotInteriority.sysml docs/verification/PHASE2-TODO.md
git commit -m "$(cat <<'EOF'
Tests: catalog invariants (exact periods, ray pairs, addresses, conjugates, v1 aliases)

Closes PHASE2-TODO item 4.

Co-Authored-By: Claude Haiku 5.5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: Colorized-buffer goldens (the image gate)

Hash `colorizeFrame`'s RGBA bytes for the stability, multiplier and period views of the default view and two zoomed frozen-corpus views (126× period-4 neighbourhood, 2,500× Feigenbaum), plus the default period view with period 2 isolated, at the kernel golden's 160×100 raster.

**Files:**
- Create: `tools/generate_colorized_golden.ts`
- Create (generated): `fixtures/colorized-golden.v1.json`
- Create: `tests/unit/render/colorized-golden.test.ts`
- Modify: `package.json`, `tsconfig.node.json`, `tsconfig.app.json`, `.prettierignore`

**Interfaces:**
- Consumes: `classifyRows` (`src/render/classify-rows.ts`), `colorizeFrame`, `periodHistogram` (`src/render/colorize.ts`), `buildPeriodKey` (`src/domain`), `loadCorpusCases`, `profileQuality` (`tools/benchmark/judge/corpus.ts`).
- Produces (`tools/generate_colorized_golden.ts`): `GOLDEN_RASTER = {width: 160, height: 100}`, `COLORIZED_GOLDEN_VIEWPORTS`, `COLORIZED_GOLDEN_SEMANTIC_VIEWS`, `ISOLATION_CASE`, `colorizedGoldenCases(): readonly ColorizedGoldenCase[]`, `goldenFrame(viewport, quality): Promise<SemanticFrame>`, `colorizedRecord(frame, view, isolatedPeriod?): ColorizedGoldenRecord`, `computeColorizedGoldens(): Promise<Record<string, ColorizedGoldenRecord>>`; npm scripts `fixtures:colorized-golden` and `fixtures:golden:check`.

- [ ] **Step 1: Write the failing test**

Create `tests/unit/render/colorized-golden.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import golden from '../../../fixtures/colorized-golden.v1.json';
import kernelGolden from '../../../fixtures/kernel-golden.v1.json';
import {
  colorizedGoldenCases,
  computeColorizedGoldens,
  GOLDEN_RASTER,
} from '../../../tools/generate_colorized_golden';

const recorded: Record<string, unknown> = golden.cases;

/**
 * Image-regression gate (MI-VER-UX-006, Q6): the colorized RGBA bytes of every
 * semantic view are pinned by hash. A failure here with the kernel golden
 * passing is a palette or colorizer change; regenerate only per
 * fixtures/README.md#golden-fixture-policy.
 */
describe('colorized-buffer goldens', () => {
  it('uses the kernel golden raster and covers every case', () => {
    expect(golden.raster).toEqual(GOLDEN_RASTER);
    expect(kernelGolden.raster).toEqual(GOLDEN_RASTER);
    expect(Object.keys(recorded).sort()).toEqual(
      colorizedGoldenCases()
        .map((goldenCase) => goldenCase.id)
        .sort(),
    );
  });

  it('colorizes every case byte for byte as recorded', async () => {
    const computed = await computeColorizedGoldens();
    for (const [id, record] of Object.entries(computed)) {
      expect(record, id).toEqual(recorded[id]);
    }
  }, 60_000);
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run tests/unit/render/colorized-golden.test.ts`
Expected: FAIL — `Cannot find module '../../../fixtures/colorized-golden.v1.json'` (or the tool module).

- [ ] **Step 3: Write the tool**

Create `tools/generate_colorized_golden.ts`:

```ts
/**
 * Colorized-buffer goldens (PHASE2-TODO item 5, owner decision Q6,
 * MI-VER-UX-006): SHA-256 of colorizeFrame's RGBA bytes for every semantic
 * view on the default view and two zoomed views, plus one isolated period, at
 * the kernel golden's raster. These hashes are the image-regression gate; the
 * browser screenshots under tests/visual/ are advisory.
 * Usage: npm run fixtures:colorized-golden [-- --check]
 */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import {
  buildPeriodKey,
  type RenderQuality,
  type SemanticView,
  type Viewport,
} from '../src/domain';
import type { SemanticFrame } from '../src/render';
import { classifyRows } from '../src/render/classify-rows';
import { colorizeFrame, periodHistogram } from '../src/render/colorize';
import { loadCorpusCases, profileQuality } from './benchmark/judge/corpus';

/**
 * The kernel golden's raster (tools/generate_kernel_golden.ts). Not imported
 * from there: bundled together, that tool's entry guard would run its main.
 */
export const GOLDEN_RASTER = { width: 160, height: 100 } as const;

// Resolved from the repo root (npm runs scripts there), as in generate_kernel_golden.ts.
const FIXTURE = path.resolve(process.cwd(), 'fixtures/colorized-golden.v1.json');

/**
 * Frozen-corpus views: the default full-set view, the 126x period-4
 * neighbourhood (periods 4, 8, 12 and 16 in one frame) and the 2,500x
 * Feigenbaum view (deep periods and the unresolved texture).
 */
export const COLORIZED_GOLDEN_VIEWPORTS = [
  'mi-easy-default-full',
  'mi-hard-supplied-126x',
  'mi-fallback-budget-exhaustion',
] as const;

export const COLORIZED_GOLDEN_SEMANTIC_VIEWS: readonly SemanticView[] = [
  'stability',
  'multiplier',
  'period',
];

/** The isolated-period case: the default view's period view with period 2 isolated. */
export const ISOLATION_CASE = { viewport: 'mi-easy-default-full', period: 2 } as const;

export interface ColorizedGoldenCase {
  readonly id: string;
  readonly corpusCase: string;
  readonly view: SemanticView;
  readonly isolatedPeriod?: number;
}

export interface ColorizedGoldenRecord {
  readonly sha256: string;
  /** Period view only: the emphasized periods, ascending (diagnostic). */
  readonly emphasizedPeriods?: readonly number[];
}

export const colorizedGoldenCases = (): readonly ColorizedGoldenCase[] => [
  ...COLORIZED_GOLDEN_VIEWPORTS.flatMap((corpusCase) =>
    COLORIZED_GOLDEN_SEMANTIC_VIEWS.map((view) => ({
      id: `${corpusCase}/${view}`,
      corpusCase,
      view,
    })),
  ),
  {
    id: `${ISOLATION_CASE.viewport}/period/isolate-${ISOLATION_CASE.period}`,
    corpusCase: ISOLATION_CASE.viewport,
    view: 'period',
    isolatedPeriod: ISOLATION_CASE.period,
  },
];

/** The stable one-band frame of the kernel golden for this viewport. */
export const goldenFrame = async (
  viewport: Viewport,
  quality: RenderQuality,
): Promise<SemanticFrame> => {
  const band = await classifyRows(
    { viewport, size: GOLDEN_RASTER, quality },
    quality,
    1,
    0,
    GOLDEN_RASTER.height,
    new AbortController().signal,
  );
  return { stage: 'stable', size: GOLDEN_RASTER, sampleStride: 1, bands: [band], progress: 1 };
};

export const colorizedRecord = (
  frame: SemanticFrame,
  view: SemanticView,
  isolatedPeriod?: number,
): ColorizedGoldenRecord => {
  const rgba = colorizeFrame(frame, view, undefined, isolatedPeriod);
  const sha256 = createHash('sha256').update(rgba).digest('hex');
  if (view !== 'period') return { sha256 };
  const emphasizedPeriods = buildPeriodKey(periodHistogram(frame)).emphasized.map(
    (entry) => entry.period,
  );
  return { sha256, emphasizedPeriods };
};

export const computeColorizedGoldens = async (): Promise<Record<string, ColorizedGoldenRecord>> => {
  const corpus = new Map(loadCorpusCases().map((corpusCase) => [corpusCase.id, corpusCase]));
  const frames = new Map<string, SemanticFrame>();
  const records: Record<string, ColorizedGoldenRecord> = {};
  for (const goldenCase of colorizedGoldenCases()) {
    const corpusCase = corpus.get(goldenCase.corpusCase);
    if (corpusCase === undefined) throw new Error(`no corpus case ${goldenCase.corpusCase}`);
    let frame = frames.get(corpusCase.id);
    if (frame === undefined) {
      frame = await goldenFrame(corpusCase.viewport, profileQuality(corpusCase.profile));
      frames.set(corpusCase.id, frame);
    }
    records[goldenCase.id] = colorizedRecord(frame, goldenCase.view, goldenCase.isolatedPeriod);
  }
  return records;
};

const main = async (): Promise<void> => {
  const cases = await computeColorizedGoldens();
  const commit = execFileSync('git', ['rev-parse', '--short', 'HEAD'], { encoding: 'utf8' }).trim();
  const fixture = {
    schemaVersion: 1,
    raster: GOLDEN_RASTER,
    colorizer:
      'colorizeFrame (src/render/colorize.ts): stability and multiplier palettes, five-period Okabe-Ito key with isolation dimming (MI-UX-018, MI-UX-021)',
    generatedFrom: commit,
    cases,
  };
  if (process.argv.includes('--check')) {
    const current = JSON.parse(readFileSync(FIXTURE, 'utf8')) as { cases: unknown };
    if (JSON.stringify(current.cases) !== JSON.stringify(cases)) {
      process.stderr.write('colorized golden fixture is stale\n');
      process.exit(1);
    }
    return;
  }
  writeFileSync(FIXTURE, `${JSON.stringify(fixture, null, 2)}\n`);
};

if (
  import.meta.url === `file://${process.argv[1]}` ||
  process.argv[1]?.endsWith('generate_colorized_golden.js')
) {
  await main();
  // The yield scheduler's MessagePort keeps the event loop alive; exit explicitly as the other tools do.
  process.exit(0);
}
```

Do not import `GOLDEN_RASTER` from `tools/generate_kernel_golden.ts`: Vite would bundle that tool into this one, and its entry guard (`import.meta.url === file://argv[1]`) would then be true and rewrite the kernel golden.

In `package.json`, add these two scripts directly below `"fixtures:kernel-golden"`:

```json
    "fixtures:golden:check": "npm run fixtures:kernel-golden -- --check && npm run fixtures:colorized-golden -- --check",
    "fixtures:colorized-golden": "vite build --ssr tools/generate_colorized_golden.ts --outDir .evidence-build/colorized-golden --emptyOutDir --logLevel warn && node .evidence-build/colorized-golden/generate_colorized_golden.js",
```

In `tsconfig.node.json`, below `"tools/generate_kernel_golden.ts",` add `"tools/generate_colorized_golden.ts",`. In `tsconfig.app.json`'s `exclude`, below `"tests/unit/render/kernel-golden.test.ts",` add `"tests/unit/render/colorized-golden.test.ts",` (it imports `node:crypto` through the tool, like the kernel golden test).

Append to `.prettierignore`:

```text
# Generated by tools/generate_colorized_golden.ts; its --check compares the parsed cases.
fixtures/colorized-golden.v1.json
```

- [ ] **Step 4: Generate the fixture (this step is allowed to write a golden)**

Run: `npm run fixtures:colorized-golden && node -e "const c=require('./fixtures/colorized-golden.v1.json').cases; for (const [k,v] of Object.entries(c)) console.log([k, v.sha256, ...(v.emphasizedPeriods ? [v.emphasizedPeriods.join(',')] : [])].join(' '))"`
Expected, exactly (the hashes are deterministic for this commit's classifier and colorizer):

```text
mi-easy-default-full/stability 05f29ae2eca7b192284542c018371cceb2d1c3cc2c933b4c238881529690b0f5
mi-easy-default-full/multiplier 3834ab8dc162a0ed497073fa503135798410c60acd1a9affbb9061a048c32789
mi-easy-default-full/period 938040b779a9c7672617ae561bb311aba30bf9383361189431babfc23f39a772 1,2,3,4,5
mi-hard-supplied-126x/stability 672ee317c44e51e93ed406613ca9e0245f0cf2d1805b24db559e56649e15793b
mi-hard-supplied-126x/multiplier 04e9a143d46108cf802c11afe9d4d5abffe3a7607a3cff2c1e99715fd14a002e
mi-hard-supplied-126x/period cc5291fb8cfe0c88cd690cd61fb52b1dc8df9f7543b97e7e4da2b5f401d887d5 4,8,12,16,20
mi-fallback-budget-exhaustion/stability 04e55beccfa552ff0bda92e7172dae006e554805dfd8830c13c80eea7f6a31e5
mi-fallback-budget-exhaustion/multiplier bc3d4f7f899c53f3398228f7f59954cce01ce380ce528a8a84d32ed017f895c0
mi-fallback-budget-exhaustion/period 0b5026d7c33f71f0b63266f4bb68611184573ca92c3044990e0157c5f5999bc7 32
mi-easy-default-full/period/isolate-2 18c44cef3df078c1e47fd5d8a54fd5699db4b29a5b8639f7924e03715c70dce5 1,2,3,4,5
```

If any hash differs, stop and report: the classifier or colorizer differs from the one this plan was verified against.

- [ ] **Step 5: Run the test and the check**

Run: `npx vitest run tests/unit/render/colorized-golden.test.ts && npm run fixtures:colorized-golden -- --check && echo check-ok`
Expected: `Tests  2 passed (2)` and `check-ok`.

- [ ] **Step 6: Show the gate catches a colour-only change, then revert**

In `src/render/colorize.ts`, in `writeEscaped`, temporarily change `writeGray(rgba, offset, clampByte(18 + 42 * band));` to `writeGray(rgba, offset, clampByte(19 + 42 * band));`.

Run: `npx vitest run tests/unit/render/colorized-golden.test.ts tests/unit/render/kernel-golden.test.ts`
Expected: `colorizes every case byte for byte as recorded` FAILS (its message names `mi-easy-default-full/stability`); every kernel golden test passes.

Run: `git checkout src/render/colorize.ts && npx vitest run tests/unit/render/colorized-golden.test.ts`
Expected: `Tests  2 passed (2)`.

- [ ] **Step 7: Wire the golden checks into `npm run check`**

In `package.json`, the `"check"` script must read exactly:

```json
    "check": "npm run format:check && npm run lint && npm run typecheck && npm run catalog:test && npm run catalog:check && npm run fixtures:check && npm run fixtures:golden:check && npm run test:unit && npm run build:assets",
```

- [ ] **Step 8: Verify the global gates**

Run: `npm run check && npm run fixtures:kernel-golden -- --check && npx playwright test`
Expected: every command exits 0.

- [ ] **Step 9: Commit**

```bash
git add tools/generate_colorized_golden.ts fixtures/colorized-golden.v1.json tests/unit/render/colorized-golden.test.ts package.json tsconfig.node.json tsconfig.app.json .prettierignore
git commit -m "$(cat <<'EOF'
Fixtures: colorized-buffer goldens for every semantic view (image gate, Q6)

SHA-256 of colorizeFrame output for stability, multiplier and period on the
default view, the 126x period-4 view and the 2,500x Feigenbaum view, plus one
isolated period; npm run check runs both golden --check modes.

Co-Authored-By: Claude Haiku 5.5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 6: Advisory screenshot suite in the pinned Playwright container

Three views (one per semantic view) and two UI states (catalog overlay, selected marker with its evidence) in Chromium and Firefox, compared only in `mcr.microsoft.com/playwright:v1.64.1-noble`. Advisory wiring: its own Playwright configuration (so `npx playwright test` never runs it), an npm script that runs it in the container, and a CI job with `continue-on-error: true`.

**Files:**
- Create: `playwright.visual.config.ts`, `tests/visual/screenshots.spec.ts`, `tests/visual/volatile.css`, `tests/visual/raster-only.css`, `tools/run-visual-container.sh`
- Create (generated in the container): `tests/visual/__screenshots__/{chromium,firefox}/*.png` (12 files)
- Modify: `package.json`, `tsconfig.e2e.json`, `tsconfig.node.json`, `eslint.config.mjs`, `.gitignore`, `.prettierignore`, `.github/workflows/ci.yml`

**Interfaces:**
- Consumes: the app's DOM (`#explorer[data-render-stage]`, `.explorer__stack`, `.build-revision`, `.feedback`, `.explorer__hint`, `.catalog-overlay`, `.selected-point-marker`, the `Explore` guide button, the marker button `Inspect Douady rabbit, period 3`, the `Point evidence` region).
- Produces: npm scripts `test:visual` (run inside the container or in CI) and `test:visual:container` (from the host); baselines under `tests/visual/__screenshots__/`.

- [ ] **Step 1: Write the configuration, the spec and the stylesheets**

Create `playwright.visual.config.ts`:

```ts
import { defineConfig, devices } from '@playwright/test';

/**
 * Advisory screenshot suite (PHASE2-TODO item 5, owner decision Q6). The gate
 * for image regressions is the colorized-buffer hash test
 * (tests/unit/render/colorized-golden.test.ts); these baselines are compared
 * only inside the pinned Playwright container, because font rendering and
 * anti-aliasing differ between hosts. `npx playwright test` and
 * `npm run check` never run this suite. See fixtures/README.md.
 */
const previewURL = 'http://127.0.0.1:4175';

export default defineConfig({
  testDir: './tests/visual',
  snapshotPathTemplate: '{testDir}/__screenshots__/{projectName}/{arg}{ext}',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'playwright-report-visual' }]],
  outputDir: 'test-results/visual',
  updateSnapshots: 'none',
  expect: {
    toHaveScreenshot: { animations: 'disabled', caret: 'hide', scale: 'css' },
  },
  use: {
    baseURL: previewURL,
    viewport: { width: 1280, height: 800 },
    deviceScaleFactor: 1,
    colorScheme: 'light',
    reducedMotion: 'reduce',
    trace: 'off',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 800 } },
    },
    {
      name: 'firefox',
      use: { ...devices['Desktop Firefox'], viewport: { width: 1280, height: 800 } },
    },
  ],
  webServer: {
    command:
      'npx vite build --mode e2e --outDir dist-visual --emptyOutDir --logLevel warn && npx vite preview --outDir dist-visual --host 127.0.0.1 --port 4175 --strictPort',
    url: previewURL,
    reuseExistingServer: false,
    timeout: 180_000,
  },
});
```

Create `tests/visual/screenshots.spec.ts`:

```ts
import path from 'node:path';
import { expect, test, type Page } from '@playwright/test';

/**
 * Advisory browser screenshots (PHASE2-TODO item 5, owner decision Q6):
 * three views, one per semantic view, and two UI states, in Chromium and
 * Firefox. Baselines live in tests/visual/__screenshots__/<engine>/ and are
 * written and compared only in the pinned Playwright container
 * (npm run test:visual:container). A difference is a prompt to look, not a
 * build failure: the colorized-buffer hashes
 * (tests/unit/render/colorized-golden.test.ts) are the gate.
 */

const VOLATILE = path.join(import.meta.dirname, 'volatile.css');
const RASTER_ONLY = path.join(import.meta.dirname, 'raster-only.css');

/** Opens `url`, closes the first-use guide and waits for the stable frame. */
const openSettled = async (page: Page, url: string): Promise<void> => {
  await page.goto(url);
  await page.getByRole('button', { name: 'Explore', exact: true }).click();
  await expect(page.locator('#explorer')).toHaveAttribute('data-render-stage', 'stable', {
    timeout: 60_000,
  });
};

const RASTER_VIEWS = [
  { name: 'default-stability', path: '/' },
  {
    name: 'period-four-126x-period',
    path: '/?v=1&c=-0.158902249,-1.034028&s=0.019841269841269841269&view=period&q=detailed',
  },
  {
    name: 'feigenbaum-2500x-multiplier',
    path: '/?v=1&c=-1.401155189092,0&s=0.001&view=multiplier',
  },
] as const;

for (const view of RASTER_VIEWS) {
  test(`raster: ${view.name}`, async ({ page }) => {
    await openSettled(page, view.path);
    await expect(page.locator('.explorer__stack')).toHaveScreenshot(`${view.name}.png`, {
      stylePath: [VOLATILE, RASTER_ONLY],
    });
  });
}

test('UI state: catalog overlay on the default view', async ({ page }) => {
  await openSettled(page, '/');
  await expect(page.getByRole('button', { name: 'Inspect Main cardioid, period 1' })).toBeVisible();
  await expect(page.locator('#explorer')).toHaveScreenshot('catalog-overlay.png', {
    stylePath: VOLATILE,
  });
});

test('UI state: a selected catalog marker and its evidence', async ({ page }) => {
  await openSettled(page, '/');
  const rabbit = page.getByRole('button', { name: 'Inspect Douady rabbit, period 3' });
  await rabbit.focus();
  await rabbit.press('Enter');
  const evidence = page.getByRole('region', { name: 'Point evidence' });
  await expect(evidence.locator('.inspector__classification')).toHaveText('Attracting cycle', {
    timeout: 10_000,
  });
  await expect(page.locator('#explorer')).toHaveScreenshot('selected-marker.png', {
    stylePath: VOLATILE,
  });
  await expect(evidence).toHaveScreenshot('selected-marker-evidence.png', { stylePath: VOLATILE });
});
```

Create `tests/visual/volatile.css`:

```css
/* Hidden in every advisory screenshot: the build stamp changes with each commit; feedback toasts are transient. */
.build-revision,
.feedback {
  visibility: hidden !important;
}
```

Create `tests/visual/raster-only.css`:

```css
/* Raster screenshots show only the image: no hint, markers or selection. */
.explorer__hint,
.catalog-overlay,
.selected-point-marker {
  display: none !important;
}
```

(`toHaveScreenshot` takes `stylePath`, not `style`; the build stamp `.build-revision` changes with every commit and must be hidden.)

- [ ] **Step 2: Write the container runner**

Create `tools/run-visual-container.sh` and make it executable (`chmod +x tools/run-visual-container.sh`):

```bash
#!/usr/bin/env bash
# Runs the advisory screenshot suite (playwright.visual.config.ts) inside the
# pinned Playwright container, the same image as CI's browser job. Baselines
# are only meaningful there: fonts and anti-aliasing differ between hosts.
# Extra arguments go to Playwright, e.g. --update-snapshots=all.
set -euo pipefail

image='mcr.microsoft.com/playwright:v1.64.1-noble'
engine="${CONTAINER_ENGINE:-}"
if [[ -z "$engine" ]]; then
  if command -v podman >/dev/null; then
    engine=podman
  elif command -v docker >/dev/null; then
    engine=docker
  else
    echo 'run-visual-container: install podman or docker, or set CONTAINER_ENGINE' >&2
    exit 2
  fi
fi
user_args=()
if [[ "$(basename "$engine")" == docker ]]; then
  # Rootful Docker would leave root-owned files in the checkout.
  user_args=(--user "$(id -u):$(id -g)" --env HOME=/tmp)
fi
root="$(git rev-parse --show-toplevel)"

# The checkout is copied into the container without node_modules (a worktree's
# may be a symlink to the host's), installed there, and only the baselines and
# the report are copied back.
exec "$engine" run --rm --init --ipc=host "${user_args[@]}" \
  --volume "$root:/src:Z" \
  "$image" \
  bash -euo pipefail -c '
    mkdir -p /tmp/work
    tar -C /src --exclude=./node_modules --exclude=./.git --exclude="./dist*" \
      --exclude=./test-results --exclude="./playwright-report*" --exclude=./.evidence-build \
      -cf - . | tar -C /tmp/work -xf -
    cd /tmp/work
    echo "node $(node --version), npm $(npm --version)"
    npm ci --no-audit --no-fund --loglevel=error
    status=0
    npx playwright test -c playwright.visual.config.ts "$@" || status=$?
    mkdir -p /src/tests/visual/__screenshots__
    cp -R tests/visual/__screenshots__/. /src/tests/visual/__screenshots__/
    rm -rf /src/playwright-report-visual
    cp -R playwright-report-visual /src/ 2>/dev/null || true
    exit "$status"
  ' bash "$@"
```

- [ ] **Step 3: Register the scripts, type-checking and ignores**

In `package.json`, below `"test:browser:headed"`, add:

```json
    "test:visual": "playwright test -c playwright.visual.config.ts",
    "test:visual:container": "bash tools/run-visual-container.sh",
```

In `tsconfig.e2e.json`, change `"include": ["tests/e2e/**/*.ts"]` to `"include": ["tests/e2e/**/*.ts", "tests/visual/**/*.ts"]`. In `tsconfig.node.json`, below `"playwright.config.ts",` add `"playwright.visual.config.ts",`.

In `eslint.config.mjs` `ignores`, add `'dist-visual/',` below `'dist-e2e/',` and `'playwright-report-visual/',` below `'playwright-report/',`. In `.gitignore` add `dist-visual/` below `dist-e2e/` and `playwright-report-visual/` below `playwright-report/`. In `.prettierignore` add the same two lines below `dist-e2e/` and `playwright-report/` respectively.

Run: `npx prettier --write playwright.visual.config.ts tests/visual package.json tsconfig.e2e.json tsconfig.node.json && npm run lint && npm run typecheck && bash -n tools/run-visual-container.sh && echo ok`
Expected: `ok`.

Run: `npx playwright test --list | grep -c visual`
Expected: `0` (the default suite never sees the screenshots).

- [ ] **Step 4: Write the baselines in the container**

This pulls the pinned image (about 2 GB) on first use. Run: `npm run test:visual:container -- --update-snapshots=all`
Expected: it prints the container's `node` and `npm` versions, then `10 passed`; `ls tests/visual/__screenshots__/*` lists 6 PNGs under each of `chromium/` and `firefox/`: `catalog-overlay.png`, `default-stability.png`, `feigenbaum-2500x-multiplier.png`, `period-four-126x-period.png`, `selected-marker-evidence.png`, `selected-marker.png`.

If neither `podman` nor `docker` can pull or run `mcr.microsoft.com/playwright:v1.64.1-noble`, stop and report BLOCKED with the error. Never commit baselines produced by `npm run test:visual` on the host.

- [ ] **Step 5: Confirm the baselines are stable and look right**

Run: `npm run test:visual:container`
Expected: `10 passed` (a second run compares against the new baselines).

Open `tests/visual/__screenshots__/chromium/period-four-126x-period.png` and `tests/visual/__screenshots__/firefox/selected-marker.png` with the Read tool. Expected: the first shows only the raster (yellow cardioid, blue and pink bulbs on dark blue, no marker, hint or toast); the second shows the default view with markers, the rabbit marker selected, and a footer without a build hash at the right.

- [ ] **Step 6: Add the non-gating CI job**

Append to `.github/workflows/ci.yml` (after the `browser` job, same indentation as `browser:`):

```yaml
  visual:
    # Advisory (owner decision Q6): the colorized-buffer goldens in the unit
    # tests are the image gate. This job reports screenshot differences and
    # never fails the workflow.
    name: Advisory screenshots
    runs-on: ubuntu-24.04
    timeout-minutes: 20
    continue-on-error: true
    container:
      image: mcr.microsoft.com/playwright:v1.64.1-noble
      options: --user 1001

    steps:
      - name: Check out repository
        uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1

      - name: Set up Node.js
        uses: actions/setup-node@820762786026740c76f36085b0efc47a31fe5020 # v7.0.0
        with:
          node-version-file: .nvmrc
          cache: npm

      - name: Set up npm
        run: npm install --global npm@12.1.0

      - name: Install dependencies
        run: npm ci

      - name: Compare advisory screenshots
        run: npm run test:visual

      - name: Upload screenshot report
        if: always()
        uses: actions/upload-artifact@043fb46d1a93c77aae656e7c1c64a875d1fc6a0a # v7.0.1
        with:
          name: visual-report
          path: playwright-report-visual/
          if-no-files-found: ignore
          retention-days: 7
```

Run: `npx prettier --check .github/workflows/ci.yml && python3 -c "import yaml; yaml.safe_load(open('.github/workflows/ci.yml')); print('yaml ok')"`
Expected: `All matched files use Prettier code style!` and `yaml ok` (if PyYAML is missing, skip the second command).

- [ ] **Step 7: Verify the global gates**

Run: `npm run check && npm run fixtures:kernel-golden -- --check && npx playwright test`
Expected: every command exits 0.

- [ ] **Step 8: Commit**

```bash
git add playwright.visual.config.ts tests/visual tools/run-visual-container.sh package.json tsconfig.e2e.json tsconfig.node.json eslint.config.mjs .gitignore .prettierignore .github/workflows/ci.yml
git commit -m "$(cat <<'EOF'
Tests: advisory screenshots of three views and two UI states in both engines

Separate Playwright configuration, run only in the pinned Playwright
container (npm run test:visual:container) and in a continue-on-error CI job;
the colorized-buffer hashes remain the gate (Q6).

Co-Authored-By: Claude Haiku 5.5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 7: Golden fixture policy, fixture inventory and `MI-VER-UX-006`

Document every fixture and the regeneration policy, retire the orphaned raster fixture, and add the image-regression verification objective. `MI-VER-UX-001` (the TODO's proposed id) is already the SysML model's `FirstUseExperienceTest`, and `MI-VER-UX-002`…`005` are taken too, so the objective is `MI-VER-UX-006`.

**Files:**
- Modify (full rewrite): `fixtures/README.md`
- Delete: `fixtures/orbit-raster-regression.v1.json`
- Modify: `docs/verification/ORBIT-RASTER-OPTIMIZATIONS.md`, `docs/verification/REQUIREMENTS.md`, `model/MandelbrotInteriority.sysml`, `model/README.md`, `docs/verification/PHASE2-TODO.md`

**Interfaces:**
- Consumes: the scripts and files of Tasks 1–6.
- Produces: documentation only.

- [ ] **Step 1: Confirm the raster fixture is orphaned and stale**

Run: `grep -rn "orbit-raster-regression" src tests tools`
Expected: no output (nothing reads it; its test was removed with the reference kernels, and ADR 0010 changed the evidence it pins).

- [ ] **Step 2: Rewrite the fixtures README and retire the fixture**

Replace the whole of `fixtures/README.md` with:

````markdown
# Fixtures

Every committed fixture, what it pins, and how it is checked. `npm run check`
runs every gating check listed here.

| Fixture                                                     | Kind                    | Pins                                                                                                                     | Checked by                                                                    |
| ----------------------------------------------------------- | ----------------------- | ------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------- |
| `orbits.v1.json`                                            | Independent reference   | Status, period, escape iteration and multiplier of chosen points, from a Python `Decimal` generator                      | `npm run fixtures:check`; `tests/unit/domain/orbit-fixtures.test.ts`          |
| `kernel-golden.v1.json`                                     | Golden                  | SHA-256 of the classifier's output channels for every frozen-corpus case at 160×100 (ADR 0007)                           | `tests/unit/render/kernel-golden.test.ts`; `npm run fixtures:golden:check`    |
| `colorized-golden.v1.json`                                  | Golden (the image gate) | SHA-256 of the colorized RGBA bytes of each semantic view on three views, plus one isolated period (Q6, `MI-VER-UX-006`) | `tests/unit/render/colorized-golden.test.ts`; `npm run fixtures:golden:check` |
| [`../catalog/components.v2.json`](../catalog/README.md)     | Independent reference   | Catalog centres, combinatorics, residuals and ids (ADR 0011)                                                             | `npm run catalog:test`; `npm run catalog:check`; `tests/unit/catalog/`        |
| [`../tests/visual/__screenshots__/`](#advisory-screenshots) | Advisory baseline       | Browser screenshots of three views and two UI states in Chromium and Firefox                                             | `npm run test:visual:container` only; never gating                            |

The frozen benchmark corpus (`tools/benchmark/corpus.v1.json`) is an input,
not a fixture; it changes only under
[PERFORMANCE-CORPUS.md](../docs/verification/PERFORMANCE-CORPUS.md).

## Golden fixture policy

An **independent reference** is computed by a separate implementation from
first principles. When the code disagrees with it, the code is wrong unless
the reference's own generator is shown to be wrong. A **golden** records what
the code produced at a reviewed commit. It is not evidence of correctness; it
makes every change to an output visible and deliberate.

1. **When.** A golden changes only in the commit that changes the behaviour it
   pins, never in a separate "update fixtures" commit and never to make an
   unrelated change pass.
2. **Who.** The owner, or an agent whose task (a plan step or an ADR) names the
   fixture as an expected change. An implementer whose change unexpectedly
   alters a golden stops and reports the failing cases; it does not
   regenerate.
3. **Evidence.** A changed kernel golden needs oracle evidence for every
   changed pixel (ADR 0007; ADR 0010's adjudication is the precedent). A
   changed colorized golden whose kernel golden is unchanged is a palette or
   colorizer change: the palette acceptance tests (`tests/unit/palette/`) must
   pass, `npm run evidence:palette` is rerun and recorded under
   `evidence/phase-2/`, and the advisory screenshots of the affected views
   are regenerated in the same commit so the reviewer sees the pixels.
4. **Record.** The commit message names the fixture, the cases that changed
   and why. The generator writes `generatedFrom` (the commit it ran on). An
   answer change (a pixel's status, period or evidence) also needs an ADR or
   an ADR amendment, as ADR 0010 did. The reviewer checks that the fixture
   diff names only the cases the change explains.
5. **Tolerance.** Goldens compare exact bytes through SHA-256: the tolerance
   is zero. Independent references declare their own tolerances (the orbit
   fixtures' binary64 multiplier tolerance is in their test).

Regenerate a golden with `npm run fixtures:kernel-golden` or
`npm run fixtures:colorized-golden`; add `-- --check` to compare without
writing. The catalog regenerates with
`python3 tools/generate_catalog.py --write catalog/components.v2.json`, and
its curated part (`catalog/curation.v2.json`) changes only by owner review.

## Colorized-buffer goldens

`colorized-golden.v1.json` is the image-regression gate the owner chose (Q6).
Each case classifies a frozen-corpus view at the kernel golden's raster
(160×100) with the production row kernel, colorizes it with `colorizeFrame`,
and hashes the RGBA bytes:

- views: the default full-set view (`mi-easy-default-full`), the 126×
  period-4 neighbourhood (`mi-hard-supplied-126x`) and the 2,500× Feigenbaum
  view (`mi-fallback-budget-exhaustion`);
- semantic views: stability, multiplier and period, plus the default view's
  period view with period 2 isolated.

Period-view cases also record their emphasized periods, so a failure shows
whether the period key changed. When this golden fails and the kernel golden
passes, only the colours changed.

## Advisory screenshots

`tests/visual/` compares browser screenshots against baselines in
`tests/visual/__screenshots__/<engine>/`: the three golden views (stability,
period and multiplier respectively), the catalog overlay, and a selected
marker with its evidence panel. They are written and compared only in the
pinned Playwright container, because fonts and anti-aliasing differ between
hosts:

```sh
npm run test:visual:container                          # compare
npm run test:visual:container -- --update-snapshots=all # rewrite the baselines
```

The suite has its own configuration (`playwright.visual.config.ts`), so
`npx playwright test` and `npm run check` never run it, and CI runs it in a
separate job that cannot fail the build (`continue-on-error`). A difference
is a prompt to look at the report (`playwright-report-visual/`), not a
failure. Commit new baselines with the change that explains them.

## Orbit fixtures

`orbits.v1.json` is an independently generated high-precision reference set for
the binary64 TypeScript classifier. It covers:

- an escaped point;
- exact period-one and period-two centers;
- ordinary off-center period-three and period-four attracting points;
- period-three points near the airplane cusp, near the rabbit's boundary
  (|λ| = 0.99) and at the weak-attraction corpus centre, which the analytic
  period-3 path answers (ADR 0010), and a period-six point of the rabbit's
  satellite inside that path's gate box, which it must not answer; and
- a known parabolic boundary point that must remain unresolved within the
  declared finite budget.

Regenerate and compare the committed data with:

```sh
npm run fixtures:check
```

The generator uses Python `Decimal` arithmetic at 80 decimal digits and does
not call the TypeScript classifier. Known attracting periods are declared as
fixture inputs; the generator independently iterates to a closed cycle and
computes its multiplier. The TypeScript unit test then compares status, period,
escape iteration, and multiplier magnitude within the declared binary64
tolerance. Cases that pin an acceptance path carry `expectedEvidence`, which the
test compares with the result's evidence flags (generated, not hand-added).

These fixtures are useful cross-implementation evidence, not a proof that
every boundary point is correctly classified.

## Retired fixtures

- `orbit-raster-regression.v1.json` (2026-10-04, `138a31b`): per-viewport
  digests of the reference `OrbitClassifier`. Its test was removed with the
  reference kernels; the kernel golden replaced it (ADR 0007), and its digests
  no longer match after the analytic period-3 path (ADR 0010). Deleted
  2026-10-17; recover it from `138a31b` if needed.

The fixture data is dedicated to the public domain under
[CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/); the generators
and tests remain GPL-3.0-only.
````

Run: `git rm fixtures/orbit-raster-regression.v1.json`

In `docs/verification/ORBIT-RASTER-OPTIMIZATIONS.md`, replace

```markdown
- Frozen digests generated from the reference commit are retained in
  `fixtures/orbit-raster-regression.v1.json` and tested against the default kernel.
```

with:

```markdown
- Frozen digests generated from the reference commit are retained in
  `fixtures/orbit-raster-regression.v1.json` and tested against the default kernel.
  (Retired 2026-10-17: superseded by the kernel golden, ADR 0007; see
  [fixtures/README.md](../../fixtures/README.md#retired-fixtures).)
```

- [ ] **Step 3: Add `MI-VER-UX-006` to the requirements matrix**

In `docs/verification/REQUIREMENTS.md`, directly above the line `## Phase 2 performance requirements`, insert:

```markdown
### Phase 2 UX verification objectives

The SysML model's `MI-VER-UX-001`…`005` group the Phase 1 verification cases.
Phase 2 adds the image-regression objective, proposed in PHASE2-TODO as
`MI-VER-UX-001` and renumbered because the model already uses that id.

| Objective | Objective text | State | Automated evidence | Remaining evidence |
| --- | --- | --- | --- | --- |
| `MI-VER-UX-006` Image regression | Each semantic view shall have committed goldens for the default view and two zoomed views, with a documented tolerance and update procedure. | **Implemented** | `colorized-buffer goldens` (`tests/unit/render/colorized-golden.test.ts` and `fixtures/colorized-golden.v1.json`: SHA-256 of the colorized RGBA bytes, zero tolerance) over the `kernel golden fixture`; the update procedure in [fixtures/README.md](../../fixtures/README.md#golden-fixture-policy); advisory screenshots in the pinned Playwright container (`tests/visual/`, non-gating) | Owner review of the first container screenshot baselines |

```

Run: `npx prettier --write docs/verification/REQUIREMENTS.md fixtures/README.md docs/verification/ORBIT-RASTER-OPTIMIZATIONS.md`

- [ ] **Step 4: Add the verification case to the SysML model**

In `model/MandelbrotInteriority.sysml`, directly after the closing `}` of `verification def <'MI-VER-UX-005'> AccessibilityTest { … }` (before `verification def <'MI-VER-PERF-001'>`), insert:

```text
        verification def <'MI-VER-UX-006'> ImageRegressionTest {
            subject app : Architecture::MandelbrotInteriorityApplication;
            doc /*
             * Each semantic view shall have committed goldens for the
             * default view and two zoomed views, with a documented tolerance
             * and update procedure. Unit tests hash the colorized frame bytes
             * of every semantic view (zero tolerance, the gate); browser
             * screenshots in the pinned Playwright container are advisory.
             */
            objective imageRegression {
                verify UserExperienceRequirements::TruthfulIntermediateResults;
                verify UserExperienceRequirements::NonColorStateDistinction;
                verify UserExperienceRequirements::PeriodViewEmphasis;
                verify UserExperienceRequirements::PaletteAcceptance;
            }
        }
```

In `model/README.md`, replace

```markdown
- `Verification` — grouped verification cases that cover every active UX
  requirement and every performance requirement (`MI-VER-PERF-001`…`005`).
```

with:

```markdown
- `Verification` — grouped verification cases that cover every active UX
  requirement and every performance requirement (`MI-VER-PERF-001`…`005`),
  and the Phase 2 image-regression objective `MI-VER-UX-006`.
```

Run: `grep -c "verification def <'MI-VER-UX-" model/MandelbrotInteriority.sysml`
Expected: `6`.

- [ ] **Step 5: Tick item 5 and rename the proposed requirement in the TODO**

In `docs/verification/PHASE2-TODO.md`, section `### 5. Semantic and image regression tests`:

1. In the `**Trace:**` line, replace the text

```markdown
**Trace:** proposed `MI-VER-UX-001`; PLAN §7.
```

with:

```markdown
**Trace:** `MI-VER-UX-006` (proposed as `MI-VER-UX-001`); PLAN §7.
```

(the rest of that line, `**Estimate:** 4–5. **Needs:**`, stays).
2. Replace the five `- [ ]` items with:

```markdown
- [x] A policy note: which fixtures are golden, who regenerates them, and how
      a reviewed change is recorded. Done:
      [fixtures/README.md](../../fixtures/README.md#golden-fixture-policy).
- [x] Colorized-buffer goldens per view (default plus two zoomed views) in
      unit tests. Done: `fixtures/colorized-golden.v1.json`,
      `tests/unit/render/colorized-golden.test.ts`.
- [x] Browser screenshot baselines for 3 views × 2 engines in the pinned
      Playwright container, as advisory checks or a gate per Q6. Done:
      advisory, `tests/visual/` with its own configuration
      (`npm run test:visual:container`) and a non-gating CI job.
- [x] UI-state baselines: catalog overlay and a selected marker (advisory,
      `tests/visual/`).
- [x] Document every fixture in `fixtures/README.md` and wire the checks into
      `npm run check` (`catalog:test`, `fixtures:golden:check`; the golden
      unit tests run in `test:unit`).
```

3. In `## Proposed requirements`, replace the `MI-VER-UX-001` bullet with:

```markdown
- `MI-VER-UX-006` Image regression (proposed as `MI-VER-UX-001`, which the
  SysML model already uses for the first-use verification case): each
  semantic view has committed goldens for the default and two zoomed views,
  with a documented tolerance and update procedure. Added 2026-10-17 with
  item 5.
```

Run: `npx prettier --write docs/verification/PHASE2-TODO.md && npm run format:check`
Expected: `All matched files use Prettier code style!`

- [ ] **Step 6: Verify the global gates**

Run: `npm run check && npm run fixtures:kernel-golden -- --check && npx playwright test`
Expected: every command exits 0.

- [ ] **Step 7: Commit**

```bash
git add -A fixtures docs/verification/ORBIT-RASTER-OPTIMIZATIONS.md docs/verification/REQUIREMENTS.md model/MandelbrotInteriority.sysml model/README.md docs/verification/PHASE2-TODO.md
git commit -m "$(cat <<'EOF'
Docs: golden fixture policy, fixture inventory and MI-VER-UX-006

Every fixture documented with how it is checked and who may regenerate it;
the orphaned orbit-raster-regression fixture is retired (superseded by the
kernel golden, ADR 0007). The image-regression objective is MI-VER-UX-006
because MI-VER-UX-001 to 005 already exist. Closes PHASE2-TODO item 5.

Co-Authored-By: Claude Haiku 5.5 <noreply@anthropic.com>
EOF
)"
```

---

## Decisions this plan makes that the code could not settle

The plan implements the recommendation in each case; the owner may overrule before execution.

1. **Id scheme.** Every entry takes a ray-derived id, `mi-p<p>-<a>-<b>` (`mi-p3-rabbit` becomes `mi-p3-1-2`, the main cardioid `mi-p1-0-1`), all eleven v1 ids become permanent aliases, and new links carry the canonical id. Alternative: keep the five named v1 ids canonical and use ray ids only for period 4; that gains no compatibility (aliases already provide it) and makes ids depend on curation. Rejected alternatives and the scaling argument are in ADR 0011.
2. **`MI-VER-UX-001` collides.** The SysML model already defines `MI-VER-UX-001`…`005` (not only 002 and 003). Image regression becomes verification objective `MI-VER-UX-006`, verifying `MI-UX-004`, `-011`, `-018` and `-021`, rather than a new `MI-UX` requirement.
3. **Advisory wiring.** A separate Playwright configuration plus `npm run test:visual:container` and a `continue-on-error` CI job, not `test.info().annotations` inside the main suite: host fonts never match container baselines, and a missing baseline would be written into the repository on a host run.
4. **Container runner is unverified.** The suite was verified on host browsers (10 passed, stable across reruns), but the pinned image was not pulled while planning. The image's own Node and npm are used (CI pins Node 24.21 and npm 12.1.0); Task 6 stops BLOCKED if the image cannot run.
5. **Centres move by up to 2.1·10⁻¹⁵.** v1 stored binary64 Durand–Kerner roots, not the refined centres; v2 stores the correctly rounded refined centres, and `centerPrecisionDigits` becomes generated (16 for all eleven).
6. **Period-4 labels** keep the v1 placeholders ("Period-4 component N"); naming them is left to item 6 or 7.
7. **`fixtures/orbit-raster-regression.v1.json` is deleted.** Nothing reads it, and its removed test, restored against today's classifier, fails 12 of 15 tests (ADR 0010 changed the evidence it pins).
8. **`.prettierignore`'s `catalog/` also matched `src/catalog/`**, so that directory was never format-checked; Task 3 anchors it to `/catalog/`.
9. **`fixtures:golden:check` joins `npm run check`** (about 3 s): it duplicates the golden unit tests but also proves the regeneration path agrees with the committed files.
10. **The `MI-PERF-003` closeout cell** ("curated catalog unchanged") is reworded in Task 4. The PHASE-2-CLOSEOUT "Generator" row ("No generator change") also becomes stale; this plan leaves that pending owner-approval record alone and recommends a dated owner note.

<!-- prettier-ignore-end -->
