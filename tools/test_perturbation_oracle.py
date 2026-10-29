"""Tests for tools/perturbation_oracle.py (run: npm run catalog:test)."""

from __future__ import annotations

from fractions import Fraction
import unittest

from perturbation_oracle import (
    FIXTURE,
    GRID_BITS,
    build,
    encode,
    export_box,
    iterate_pixel,
    product_interval,
    square_interval,
)


class IntervalTest(unittest.TestCase):
    def test_square_straddling_zero_has_zero_lower_bound(self) -> None:
        self.assertEqual(square_interval(-3, 2), (0, 9))
        self.assertEqual(square_interval(-3, -2), (4, 9))

    def test_product_takes_extreme_corners(self) -> None:
        self.assertEqual(product_interval(-2, 3, -5, 1), (-15, 10))

    def test_export_rounds_outward(self) -> None:
        shift = GRID_BITS - 8
        box = export_box((-(1 << shift) - 1, (1 << shift) + 1, 0, 0), 8)
        self.assertEqual(box, {"reLo": "-2", "reHi": "2", "imLo": "0", "imHi": "0"})

    def test_known_escape_and_interior(self) -> None:
        one = 1 << GRID_BITS
        # c = 1: 1, 2, 5 -> escapes at iteration 3.
        self.assertEqual(iterate_pixel(one, 0, 16)["status"], "escaped")
        self.assertEqual(iterate_pixel(one, 0, 16)["iteration"], 3)
        # c = -1: period-two superattracting cycle, never escapes.
        self.assertEqual(iterate_pixel(-one, 0, 64)["status"], "bounded")
        # c = 2: 2, 6 -> |z|^2 = 4 at iteration 1 is not an escape.
        self.assertEqual(iterate_pixel(2 * one, 0, 4)["iteration"], 2)

    def test_box_contains_exact_orbit(self) -> None:
        c = Fraction(-3, 4) + Fraction(1, 1 << 40)
        z = Fraction(0)
        for _ in range(8):
            z = z * z + c
        result = iterate_pixel(c.numerator * (1 << GRID_BITS) // c.denominator, 0, 8)
        lo, hi, _, _ = result["box"]
        scaled = z * (1 << GRID_BITS)
        self.assertLessEqual(lo, scaled)
        self.assertGreaterEqual(hi, scaled)


class FixtureTest(unittest.TestCase):
    def test_committed_fixture_matches_the_oracle(self) -> None:
        self.assertEqual(FIXTURE.read_text(encoding="utf-8"), encode(build()))


if __name__ == "__main__":
    unittest.main()
