#!/usr/bin/env python3
"""Generate independent high-precision orbit fixtures.

The generated numerical data is dedicated to the public domain under CC0-1.0.
This generator is application source code and is licensed under GPL-3.0-only.
"""

from __future__ import annotations

import argparse
from dataclasses import dataclass
from decimal import Decimal, localcontext
import json
from pathlib import Path
import sys
from typing import Any


@dataclass(frozen=True)
class DecimalComplex:
    real: Decimal
    imaginary: Decimal

    @classmethod
    def from_strings(cls, real: str, imaginary: str) -> "DecimalComplex":
        return cls(Decimal(real), Decimal(imaginary))

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

    def magnitude_squared(self) -> Decimal:
        return self.real * self.real + self.imaginary * self.imaginary


ZERO = DecimalComplex(Decimal(0), Decimal(0))
ONE = DecimalComplex(Decimal(1), Decimal(0))
TWO = DecimalComplex(Decimal(2), Decimal(0))


CASES: tuple[dict[str, Any], ...] = (
    {
        "id": "escape-one-plus-i",
        "parameter": {"re": "1", "im": "1"},
        "expectedStatus": "escaped",
        "maxIterations": 16,
    },
    {
        "id": "main-cardioid-center",
        "parameter": {"re": "0", "im": "0"},
        "expectedStatus": "attracting-cycle",
        "knownPeriod": 1,
        "maxIterations": 64,
    },
    {
        "id": "period-two-center",
        "parameter": {"re": "-1", "im": "0"},
        "expectedStatus": "attracting-cycle",
        "knownPeriod": 2,
        "maxIterations": 64,
    },
    {
        "id": "period-three-off-center",
        "parameter": {"re": "-0.12", "im": "0.74"},
        "expectedStatus": "attracting-cycle",
        "knownPeriod": 3,
        "maxIterations": 2048,
    },
    {
        "id": "period-four-off-center",
        "parameter": {"re": "-1.30", "im": "0"},
        "expectedStatus": "attracting-cycle",
        "knownPeriod": 4,
        "maxIterations": 2048,
    },
    {
        "id": "parabolic-boundary-minus-three-quarters",
        "parameter": {"re": "-0.75", "im": "0"},
        "expectedStatus": "unresolved",
        "maxIterations": 1024,
    },
)


def iterate(value: DecimalComplex, parameter: DecimalComplex) -> DecimalComplex:
    return value * value + parameter


def escaped_fixture(parameter: DecimalComplex, max_iterations: int) -> dict[str, Any]:
    value = ZERO
    for iteration in range(1, max_iterations + 1):
        value = iterate(value, parameter)
        magnitude_squared = value.magnitude_squared()
        if magnitude_squared > Decimal(4):
            return {
                "status": "escaped",
                "escapeIteration": iteration,
                "magnitudeSquared": str(magnitude_squared),
            }
    raise ValueError("expected escape was not observed within the fixture budget")


def attracting_fixture(
    parameter: DecimalComplex,
    period: int,
    max_iterations: int,
    precision: int,
) -> dict[str, Any]:
    value = ZERO
    convergence_target = Decimal(10) ** (-(precision - 20))
    cycle_start = ZERO
    closure_residual = Decimal("Infinity")

    for iteration in range(1, max_iterations + 1):
        value = iterate(value, parameter)
        probe = value
        for _step in range(period):
            probe = iterate(probe, parameter)
        closure_residual = (probe - value).magnitude_squared()
        if closure_residual <= convergence_target:
            cycle_start = value
            break
    else:
        raise ValueError(
            f"period-{period} fixture did not converge within {max_iterations} iterations"
        )

    multiplier = ONE
    value = cycle_start
    for _step in range(period):
        multiplier = multiplier * (TWO * value)
        value = iterate(value, parameter)

    return {
        "status": "attracting-cycle",
        "period": period,
        "settledAfterIterations": iteration,
        "cycleClosureResidualSquared": str(closure_residual),
        "multiplier": {
            "re": str(multiplier.real),
            "im": str(multiplier.imaginary),
            "magnitude": str(multiplier.magnitude_squared().sqrt()),
        },
    }


def unresolved_fixture(parameter: DecimalComplex, max_iterations: int) -> dict[str, Any]:
    value = ZERO
    for _iteration in range(max_iterations):
        value = iterate(value, parameter)
        if value.magnitude_squared() > Decimal(4):
            raise ValueError("unresolved fixture escaped within its declared budget")
    return {
        "status": "unresolved",
        "iterations": max_iterations,
        "lastMagnitudeSquared": str(value.magnitude_squared()),
        "reason": "budget-exhausted-at-known-parabolic-boundary",
    }


def generate(precision: int) -> dict[str, Any]:
    fixtures: list[dict[str, Any]] = []
    with localcontext() as context:
        context.prec = precision
        for case in CASES:
            parameter_data = case["parameter"]
            parameter = DecimalComplex.from_strings(
                parameter_data["re"],
                parameter_data["im"],
            )
            max_iterations = case["maxIterations"]
            expected_status = case["expectedStatus"]
            if expected_status == "escaped":
                expected = escaped_fixture(parameter, max_iterations)
            elif expected_status == "attracting-cycle":
                expected = attracting_fixture(
                    parameter,
                    case["knownPeriod"],
                    max_iterations,
                    precision,
                )
            elif expected_status == "unresolved":
                expected = unresolved_fixture(parameter, max_iterations)
            else:
                raise ValueError(f"unsupported fixture status: {expected_status}")

            fixtures.append(
                {
                    "id": case["id"],
                    "parameter": parameter_data,
                    "classificationBudget": {
                        "maxIterations": max_iterations,
                        "maxPeriod": max(case.get("knownPeriod", 1), 8),
                        "cycleTolerance": 1e-10,
                        "cycleWarmup": 24,
                    },
                    "expected": expected,
                }
            )

    return {
        "schemaVersion": 1,
        "license": "CC0-1.0",
        "generator": "tools/generate_orbit_fixtures.py",
        "method": (
            "Python Decimal iteration independent of the TypeScript binary64 "
            "classifier; attracting fixtures use a declared known period."
        ),
        "precisionDigits": precision,
        "binary64Tolerance": {
            "multiplierMagnitudeAbsolute": 1e-7,
        },
        "fixtures": fixtures,
    }


def parse_arguments() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--precision", type=int, default=80)
    parser.add_argument(
        "--check",
        type=Path,
        help="Check that a committed fixture file matches regenerated data.",
    )
    return parser.parse_args()


def main() -> int:
    arguments = parse_arguments()
    if arguments.precision < 50:
        raise ValueError("precision must be at least 50 decimal digits")

    generated = generate(arguments.precision)
    if arguments.check is not None:
        committed = json.loads(arguments.check.read_text(encoding="utf-8"))
        if committed != generated:
            raise ValueError(
                f"{arguments.check} does not match independently regenerated fixtures"
            )
        print(
            f"validated {len(generated['fixtures'])} high-precision orbit fixtures "
            f"at {arguments.precision} decimal digits"
        )
        return 0

    json.dump(generated, sys.stdout, indent=2)
    print()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
