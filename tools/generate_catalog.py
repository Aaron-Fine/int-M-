#!/usr/bin/env python3
"""Generate and validate the low-period Mandelbrot component centers.

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
import sys
from typing import Any


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
                return center
    raise RuntimeError(f"high-precision refinement failed for period {period}")


def decimal_exact_period_residual(
    center: DecimalComplex,
    period: int,
) -> tuple[Decimal, dict[int, Decimal]]:
    residual = decimal_orbit_and_derivative(center, period)[0].magnitude_squared()
    divisor_residuals = {
        divisor: decimal_orbit_and_derivative(center, divisor)[0].magnitude_squared()
        for divisor in proper_divisors(period)
    }
    return residual, divisor_residuals


def discover_centers(max_period: int, precision: int) -> list[dict[str, Any]]:
    centers: list[dict[str, Any]] = []
    for period, polynomial in enumerate(orbit_polynomials(max_period), start=1):
        candidates = [
            candidate
            for candidate in durand_kerner(polynomial)
            if has_exact_period(candidate, period)
        ]
        candidates.sort(key=lambda candidate: (candidate.real, candidate.imag))
        for index, candidate in enumerate(candidates, start=1):
            center = refine_center(candidate, period, precision)
            residual, divisor_residuals = decimal_exact_period_residual(center, period)
            centers.append(
                {
                    "generatedId": f"period-{period}-{index:02}",
                    "period": period,
                    "centerDecimal": {
                        "re": str(center.real),
                        "im": str(center.imaginary),
                    },
                    "residualSquared": str(residual),
                    "properDivisorResidualsSquared": {
                        str(divisor): str(value)
                        for divisor, value in divisor_residuals.items()
                    },
                }
            )
    return centers


def check_catalog(
    catalog_path: Path,
    generated: list[dict[str, Any]],
) -> None:
    catalog = json.loads(catalog_path.read_text(encoding="utf-8"))
    if catalog.get("license") != "CC0-1.0":
        raise ValueError("catalog must declare CC0-1.0")

    catalog_components = catalog.get("components")
    if not isinstance(catalog_components, list):
        raise ValueError("catalog components must be an array")

    unmatched = list(catalog_components)
    tolerance = Decimal("1e-13")
    for generated_center in generated:
        period = generated_center["period"]
        generated_real = Decimal(generated_center["centerDecimal"]["re"])
        generated_imaginary = Decimal(generated_center["centerDecimal"]["im"])
        match = next(
            (
                component
                for component in unmatched
                if component.get("period") == period
                and abs(Decimal(str(component["center"]["re"])) - generated_real)
                <= tolerance
                and abs(Decimal(str(component["center"]["im"])) - generated_imaginary)
                <= tolerance
            ),
            None,
        )
        if match is None:
            raise ValueError(
                "catalog has no matching center for "
                f"period {period}: {generated_real} {generated_imaginary:+}i"
            )
        unmatched.remove(match)

    if unmatched:
        identifiers = ", ".join(str(component.get("id")) for component in unmatched)
        raise ValueError(f"catalog contains ungenerated centers: {identifiers}")

    identifiers = [component.get("id") for component in catalog_components]
    if len(identifiers) != len(set(identifiers)):
        raise ValueError("catalog component identifiers must be unique")

    for component in catalog_components:
        rays = component.get("characteristicRays")
        if rays is not None and len(rays) != 2:
            raise ValueError(
                f"{component.get('id')} must have exactly two characteristic rays"
            )


def parse_arguments() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--max-period", type=int, default=4)
    parser.add_argument("--precision", type=int, default=80)
    parser.add_argument(
        "--check",
        type=Path,
        help="Validate a curated catalog against independently generated centers.",
    )
    return parser.parse_args()


def main() -> int:
    arguments = parse_arguments()
    if arguments.max_period < 1 or arguments.max_period > 8:
        raise ValueError("max-period must be between 1 and 8")
    if arguments.precision < 40:
        raise ValueError("precision must be at least 40 decimal digits")

    centers = discover_centers(arguments.max_period, arguments.precision)
    if arguments.check is not None:
        check_catalog(arguments.check, centers)
        print(
            f"validated {len(centers)} exact-period centers "
            f"through period {arguments.max_period}"
        )
        return 0

    json.dump(
        {
            "schemaVersion": 1,
            "license": "CC0-1.0",
            "precisionDigits": arguments.precision,
            "centers": centers,
        },
        sys.stdout,
        indent=2,
    )
    print()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
