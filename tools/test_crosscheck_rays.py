"""Tests for tools/crosscheck_rays.py (run: npm run catalog:test)."""

from __future__ import annotations

import cmath
from decimal import Decimal, localcontext
import unittest
from unittest import mock

import crosscheck_rays

from crosscheck_rays import (
    DECIMAL_DIGITS,
    PI,
    DecimalBalls,
    DecimalComplex,
    doubling_cycle,
    float_size,
    float_sqrt,
    prove_landing,
    prove_rays_land_together,
    prove_rays_land_together_in_decimals,
    unit_direction,
)

RABBIT = (-0.12256116687665362, 0.7448617666197442)
AIRPLANE = (-1.7548776662466927, 0.0)


class CorrectlyRoundedPartsTest(unittest.TestCase):
    """The binary64 path uses only IEEE operations; these parts replace hypot, cmath and exp."""

    def test_pi_to_fifty_digits(self) -> None:
        self.assertEqual(str(PI)[:52], "3.14159265358979323846264338327950288419716939937510")

    def test_unit_directions_match_cmath_to_rounding(self) -> None:
        for numerator, modulus in [(1, 7), (5, 7), (2047, 4095), (1, 4095), (4094, 4095), (6, 15)]:
            with self.subTest(angle=(numerator, modulus)):
                expected = cmath.exp(2j * cmath.pi * numerator / modulus)
                self.assertLess(abs(unit_direction(numerator, modulus) - expected), 1e-15)

    def test_sizes_and_square_roots_without_hypot(self) -> None:
        for value in [3 + 4j, -2 + 0j, 1e-200 + 1e-200j, 1e200 - 3e199j, 0.3 - 0.7j]:
            with self.subTest(value=value):
                self.assertLessEqual(abs(float_size(value) - abs(value)), 4e-16 * abs(value))
                root = float_sqrt(value)
                self.assertLessEqual(abs(root * root - value), 1e-15 * abs(value))
                self.assertGreaterEqual(root.real, 0)
        self.assertEqual(float_size(0j), 0.0)

    def test_decimal_square_roots_of_nearly_real_arguments(self) -> None:
        # Nearly real arguments, where the half-angle formulas cancel; the oracle is the
        # principal root at 150 digits, where that cancellation still leaves 80 good digits.
        cases = [("-1", "1e-30"), ("0.5", "1e-25"), ("4", "-1e-35"), ("-3.99999647", "-1.15e-14"),
                 ("-2", "0"), ("0", "-3"), ("1e-20", "1")]
        for re_text, im_text in cases:
            with self.subTest(value=(re_text, im_text)):
                value = DecimalComplex(Decimal(re_text), Decimal(im_text))
                with localcontext() as context:
                    context.prec = 150
                    modulus = (value.re * value.re + value.im * value.im).sqrt()
                    expected_re = ((modulus + value.re) / 2).sqrt()
                    expected_im = ((modulus - value.re) / 2).sqrt().copy_sign(value.im)
                    square = DecimalComplex(expected_re, expected_im) * DecimalComplex(expected_re, expected_im)
                    self.assertLess(abs(square - value), Decimal(10) ** -120)
                with localcontext() as context:
                    context.prec = DECIMAL_DIGITS
                    arith = DecimalBalls()
                    root = arith.sqrt(value)
                    allowance = arith.size(root) * 8 * arith.unit
                with localcontext() as context:
                    context.prec = 150
                    error = abs(root - DecimalComplex(expected_re, expected_im))
                self.assertLessEqual(error, allowance)


class RayLandingTest(unittest.TestCase):
    def test_doubling_cycles(self) -> None:
        self.assertEqual(doubling_cycle(1, 7), [1, 2, 4])
        self.assertEqual(doubling_cycle(6, 15), [6, 12, 9, 3])

    def test_the_rabbits_rays_land_together(self) -> None:
        landing = prove_rays_land_together(*RABBIT, 1e-15, 3, 1, 2)
        self.assertIsNotNone(landing)
        assert landing is not None
        self.assertFalse(landing.decimal)
        # The rays 1/7 and 2/7 land at the alpha fixed point, (1 - sqrt(1 - 4c)) / 2.
        alpha = (1 - cmath.sqrt(1 - 4 * complex(*RABBIT))) / 2
        self.assertLess(abs(landing.centre - alpha), 1e-12)
        self.assertLess(landing.radius, 0.1)

    def test_the_airplanes_rays_land_together(self) -> None:
        self.assertIsNotNone(prove_rays_land_together(*AIRPLANE, 1e-15, 3, 3, 4))

    def test_another_pairs_rays_do_not_pass_at_the_rabbit(self) -> None:
        for lower, upper in [(3, 4), (5, 6)]:
            with self.subTest(rays=(lower, upper)):
                self.assertIsNone(prove_rays_land_together(*RABBIT, 1e-15, 3, lower, upper))

    def test_the_decimal_balls_prove_the_rabbit_too(self) -> None:
        with localcontext() as context:
            context.prec = DECIMAL_DIGITS
            found = prove_landing(
                DecimalComplex(Decimal(RABBIT[0]), Decimal(RABBIT[1])),
                Decimal("1e-15"), 3, 1, 2, DecimalBalls(), 90,
            )
        self.assertIsNotNone(found)

    def test_the_decimal_prover_proves_the_rabbit_pair(self) -> None:
        with localcontext() as context:
            context.prec = DECIMAL_DIGITS
            disk = (Decimal(RABBIT[0]), Decimal(RABBIT[1]), Decimal("1e-15"))
        landing = prove_rays_land_together_in_decimals(disk, 3, 1, 2)
        self.assertIsNotNone(landing)
        assert landing is not None
        self.assertTrue(landing.decimal)
        alpha = (1 - cmath.sqrt(1 - 4 * complex(*RABBIT))) / 2
        self.assertLess(abs(landing.centre - alpha), 1e-12)

    def test_refuses_parameters_beyond_the_bottcher_bound(self) -> None:
        # |z| >= 0.99 |w| on the starting chain is proved only for |c| <= 2.01.
        with mock.patch.object(crosscheck_rays, "start_chain", side_effect=AssertionError):
            self.assertIsNone(prove_landing(complex(-2.0, 0.0), 0.02, 3, 3, 4, crosscheck_rays.FloatBalls(), 90))


if __name__ == "__main__":
    unittest.main()
