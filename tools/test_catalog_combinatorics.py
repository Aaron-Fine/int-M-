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
