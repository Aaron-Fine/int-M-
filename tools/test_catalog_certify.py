"""Tests for tools/catalog_certify.py (run: npm run catalog:test)."""

from __future__ import annotations

from decimal import Decimal, localcontext
import unittest

from catalog_certify import Arithmetic, Ball, certify_center
from generate_catalog import DecimalComplex, check_disjoint, refine_center

PRECISION = 80
RADIUS = Decimal(10) ** -50


def refined(seed: complex, period: int) -> tuple[Decimal, Decimal]:
    center = refine_center(seed, period, PRECISION)
    return center.real, center.imaginary


class BallArithmeticTest(unittest.TestCase):
    def test_a_product_encloses_every_product_of_points(self) -> None:
        arithmetic = Arithmetic(PRECISION)
        with localcontext() as context:
            context.prec = PRECISION
            left = Ball(Decimal("0.3"), Decimal("-0.7"), Decimal("1e-6"))
            right = Ball(Decimal("-1.1"), Decimal("0.2"), Decimal("1e-6"))
            product = arithmetic.multiply(left, right)
            for dl, dr in [(1, 1), (1, -1), (-1, 1), (-1, -1)]:
                a = complex(0.3 + dl * 1e-6 * 0.7071, -0.7 + dl * 1e-6 * 0.7071)
                b = complex(-1.1 + dr * 1e-6 * 0.7071, 0.2 - dr * 1e-6 * 0.7071)
                value = a * b
                distance = abs(complex(float(product.re), float(product.im)) - value)
                self.assertLessEqual(distance, float(product.radius))

    def test_a_product_encloses_the_true_value_under_the_default_context(self) -> None:
        arithmetic = Arithmetic(PRECISION)
        digits = "0." + "1234567890" * 7
        with localcontext() as context:
            context.prec = 28
            left = Ball(Decimal(digits), Decimal(0), Decimal(0))
            product = arithmetic.multiply(left, left)
        with localcontext() as exact:
            exact.prec = 200
            true = Decimal(digits) * Decimal(digits)
        error = abs(product.re - true)
        self.assertGreater(error, Decimal(10) ** -(PRECISION + 10))
        self.assertLessEqual(error, product.radius)

    def test_disks_a_rounding_apart_from_touching_are_not_claimed_disjoint(self) -> None:
        radius = Decimal("1e-10")
        with localcontext() as context:
            context.prec = 40
            origin = DecimalComplex(Decimal(0), Decimal(0))
            for gap in (Decimal(0), Decimal("1e-48"), Decimal("1e-46")):
                other = DecimalComplex(2 * radius + gap, Decimal(0))
                with self.assertRaisesRegex(ValueError, "one centre"):
                    check_disjoint(3, [origin, other], radius)
            far = DecimalComplex(2 * radius * Decimal("1.001"), Decimal(0))
            check_disjoint(3, [origin, far], radius)

    def test_a_sum_that_cancels_keeps_the_rounding_of_its_operands(self) -> None:
        # z^2 + c is near 0 at a centre: the radius must not shrink with the result.
        arithmetic = Arithmetic(PRECISION)
        with localcontext() as context:
            context.prec = PRECISION
            total = arithmetic.add(
                Ball(Decimal(1), Decimal(0), Decimal(0)), Ball(Decimal(-1), Decimal(0), Decimal(0))
            )
            self.assertGreater(total.radius, Decimal(10) ** -(PRECISION - 1))


class CertifyTest(unittest.TestCase):
    def test_certifies_the_rabbit_and_the_airplane(self) -> None:
        rabbit = refined(complex(-0.12256116687665362, 0.7448617666197442), 3)
        certificate = certify_center(rabbit, 3, RADIUS, PRECISION)
        self.assertLess(certificate.contraction, Decimal("1e-40"))
        certify_center(refined(-1.7548776662466927 + 0j, 3), 3, RADIUS, PRECISION)

    def test_certifies_a_period_twelve_centre(self) -> None:
        seed = complex(0.30922922123657415, 0.03212392698439477)  # rays 1/4095 and 2/4095
        certify_center(refined(seed, 12), 12, RADIUS, PRECISION)

    def test_rejects_a_point_that_is_not_a_root(self) -> None:
        re, im = refined(complex(-0.12256116687665362, 0.7448617666197442), 3)
        with self.assertRaisesRegex(ValueError, "Krawczyk"):
            certify_center((re + Decimal("1e-30"), im), 3, RADIUS, PRECISION)

    def test_rejects_a_root_of_a_divisor_period(self) -> None:
        # c = -1 has period 2, so it is also a root of f_c^4(0), a simple one.
        with self.assertRaisesRegex(ValueError, "f_c\\^2"):
            certify_center((Decimal(-1), Decimal(0)), 4, RADIUS, PRECISION)

    def test_rejects_a_disk_too_large_to_isolate_one_root(self) -> None:
        rabbit = refined(complex(-0.12256116687665362, 0.7448617666197442), 3)
        with self.assertRaisesRegex(ValueError, "Krawczyk"):
            certify_center(rabbit, 3, Decimal("0.5"), PRECISION)

    def test_a_zero_derivative_is_a_failure_to_prove_not_an_arithmetic_error(self) -> None:
        with self.assertRaisesRegex(ValueError, "derivative"):
            certify_center((Decimal("-0.5"), Decimal(0)), 2, RADIUS, PRECISION)

    def test_the_main_cardioid_contracts_to_rounding_only(self) -> None:
        # g_1(c) = c: g' is 1 everywhere, so 1 - y G' is pure rounding allowance.
        certificate = certify_center((Decimal(0), Decimal(0)), 1, RADIUS, PRECISION)
        self.assertLess(certificate.contraction, Decimal("1e-70"))


if __name__ == "__main__":
    unittest.main()
