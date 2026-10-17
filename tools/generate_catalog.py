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
# An alias shaped like a canonical id could collide once more periods are generated.
CANONICAL_ID_SHAPE = re.compile(r"^mi-p\d+-\d+-\d+$")
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
            if CANONICAL_ID_SHAPE.match(alias):
                raise ValueError(f"{identifier} has an alias shaped like a canonical id: {alias!r}")
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
    if arguments.max_period < 1 or arguments.max_period > 4:
        raise ValueError(
            "max-period must be between 1 and 4: root discovery does not converge "
            "from period 5, and higher periods wait for item 7's pinned "
            "arbitrary-precision root isolator"
        )
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
        try:
            committed = arguments.check.read_text(encoding="utf-8")
        except FileNotFoundError:
            committed = None
        if committed != text:
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
