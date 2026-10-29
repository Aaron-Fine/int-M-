"""Tests for tools/perturbation_oracle.py (run: npm run catalog:test)."""

from __future__ import annotations

from fractions import Fraction
import unittest

from perturbation_oracle import (
    FIXTURE,
    GRID_BITS,
    INTERIOR_FIXTURE,
    build,
    build_interior,
    certified_below,
    decide,
    encode,
    export_box,
    iterate_pixel,
    multiplier_prefixes,
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


class VerifierDecisionTest(unittest.TestCase):
    @staticmethod
    def point(re: Fraction, im: Fraction = Fraction(0)) -> tuple[int, int, int, int]:
        scale = 1 << GRID_BITS
        return (int(re * scale), int(re * scale), int(im * scale), int(im * scale))

    def window(self, points: list[Fraction]) -> list[tuple[int, int, int, int]]:
        return [self.point(value) for value in points]

    def test_certified_below_refuses_straddling_intervals(self) -> None:
        self.assertTrue(certified_below((Fraction(1), Fraction(2)), (Fraction(2), Fraction(3)), strict=False))
        self.assertIsNone(certified_below((Fraction(1), Fraction(2)), (Fraction(2), Fraction(3)), strict=True))
        self.assertFalse(certified_below((Fraction(3), Fraction(4)), (Fraction(2), Fraction(3)), strict=True))
        self.assertIsNone(certified_below((Fraction(1), Fraction(4)), (Fraction(2), Fraction(3)), strict=False))

    def test_superattracting_two_cycle_reduces_multiples(self) -> None:
        boxes = self.window([Fraction(0) if k % 2 == 0 else Fraction(-1) for k in range(9)])
        multipliers = multiplier_prefixes(boxes, 8)
        self.assertEqual(decide(boxes, 1, multipliers), "N")
        self.assertEqual(decide(boxes, 2, multipliers), "A2")
        self.assertEqual(decide(boxes, 4, multipliers), "A2")
        self.assertEqual(decide(boxes, 8, multipliers), "A2")

    def test_ambiguity_and_repelling_codes(self) -> None:
        gap = Fraction(1, 10**7)
        closure = self.window([Fraction(0), gap])
        self.assertEqual(decide(closure, 1, multiplier_prefixes(closure, 1)), "C")
        divisor = self.window([Fraction(0), gap, Fraction(0)])
        self.assertEqual(decide(divisor, 2, multiplier_prefixes(divisor, 2)), "D")
        repelling = self.window([Fraction(2), Fraction(2)])
        self.assertEqual(decide(repelling, 1, multiplier_prefixes(repelling, 1)), "X")


class FixtureTest(unittest.TestCase):
    def test_committed_fixture_matches_the_oracle(self) -> None:
        self.assertEqual(FIXTURE.read_text(encoding="utf-8"), encode(build()))

    def test_committed_interior_fixture_matches_the_oracle(self) -> None:
        self.assertEqual(INTERIOR_FIXTURE.read_text(encoding="utf-8"), encode(build_interior()))


if __name__ == "__main__":
    unittest.main()
