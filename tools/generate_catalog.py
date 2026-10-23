#!/usr/bin/env python3
"""Generate and validate the low-period Mandelbrot component catalog (schema v2).

Writes catalog/components.v2.json from first principles plus the curated
names, v1 aliases, annotations and reference keys in catalog/curation.v2.json;
each reference key must name an entry of catalog/references.v1.json, which is
validated too. `--check` regenerates the file and requires it to be
byte-identical to the committed one. Every centre is certified
(tools/catalog_certify.py, ADR 0014); tools/generate_catalog_core.py writes
the period <=12 core from the same centres.

The generated numerical data is dedicated to the public domain under CC0-1.0.
This generator is application source code and is licensed under GPL-3.0-only.
"""

from __future__ import annotations

import argparse
from dataclasses import dataclass
from decimal import Decimal, getcontext, localcontext
import json
import math
from pathlib import Path
import re
import sys
from urllib.parse import urlsplit
from typing import Any
from collections.abc import Collection

from catalog_certify import certify_center, proper_divisors
from catalog_combinatorics import (
    RayPair,
    angled_internal_address,
    internal_address,
    landing_center,
    lavaurs_pairs,
    ray_modulus,
)

SCHEMA_VERSION = 2
# The default inputs, resolved from the repository root so the tools and their
# tests run from any working directory.
ROOT = Path(__file__).resolve().parent.parent
DEFAULT_CURATION = ROOT / "catalog" / "curation.v2.json"
DEFAULT_REFERENCES = ROOT / "catalog" / "references.v1.json"
REFERENCES_SCHEMA_VERSION = 1
# A reference links to one of these hosts only, and its source names that host (ADR 0012).
REFERENCE_HOSTS = {"Wikipedia": "en.wikipedia.org", "arXiv": "arxiv.org"}
REFERENCE_KEY_PATTERN = re.compile(r"^[a-z0-9]+(-[a-z0-9]+)*$")
ALIAS_PATTERN = re.compile(r"^mi-[a-z0-9-]+$")
# An alias shaped like a canonical id could collide once more periods are generated.
CANONICAL_ID_SHAPE = re.compile(r"^mi-p\d+-\d+-\d+$")
# The two rays of a pair must land this close together (binary64 ray tracing).
MATCH_TOLERANCE = 1e-9
# Every centre is certified in a disk of radius 10**-(precision - 30): 1e-50 at
# 80 digits. At any precision the radius is far outside the Newton refinement
# error; whether the Krawczyk test then passes is checked, and a failure raises.
CERTIFIED_RADIUS_MARGIN = 30
# The highest period the generators support (PHASE2-TODO item 7, ADR 0014).
MAX_SUPPORTED_PERIOD = 12
# The lowest working precision, in decimal digits, the generators accept.
MIN_PRECISION = 40
# The longest curated annotation, in characters (ADR 0012; src/catalog/schema.ts).
ANNOTATION_MAX_LENGTH = 280


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


def check_disjoint(period: int, centers: list[DecimalComplex], radius: Decimal) -> None:
    """Certified disks of one period must not meet: each then holds a different root."""
    # Runs in the caller's context at P digits. Differences, squares and sums err
    # by a few units of 10**-P relative; the slack of 10**-(P - 5), which is
    # exactly representable, exceeds that, so a rounding never claims disjointness.
    digits = getcontext().prec
    slack = 1 + Decimal(10) ** -(digits - 5)
    ordered = sorted(centers, key=lambda center: (center.real, center.imaginary))
    for index, center in enumerate(ordered):
        for other in ordered[index + 1 :]:
            if other.real - center.real > 2 * radius * slack:
                break
            if (other - center).magnitude_squared() <= 4 * radius * radius * slack:
                raise ValueError(f"period {period}: two ray pairs land on one centre")


def label_for(period: int, lower: int, upper: int) -> str:
    """The generated label (owner decision 2026-10-17): the period and both rays."""
    modulus = ray_modulus(period)
    return f"Period {period}, rays {lower}/{modulus} and {upper}/{modulus}"


def method_key(precision: int) -> str:
    return f"krawczyk-decimal-{precision}"


def method_text(precision: int) -> str:
    return (
        "Centres: for each Lavaurs ray pair of exact period p, both parameter "
        "rays are traced in binary64 and must land within 1e-9 of each other; "
        f"Newton's method in {precision}-digit decimal arithmetic refines the "
        "landing point, and ball arithmetic with the Krawczyk test proves that "
        f"the disk of radius 1e-{precision - CERTIFIED_RADIUS_MARGIN} about it "
        "holds exactly one root of f_c^p(0), a simple one, with f_c^d(0) "
        "bounded away from 0 over the disk for every proper divisor d of p "
        "(exact period). The disks of one period are disjoint. The stored "
        "centre is the nearest binary64. Internal address: the kneading "
        "sequence of the lower ray. Angled address: Schleicher's denominators; "
        "each numerator names the tuned sub-wake that contains the lower ray. "
        "Residuals: |f_c^p(0)|, the distance to the refined centre, and the "
        "smallest |f_c^d(0)| over proper divisors d, at the stored centre in "
        f"{precision}-digit arithmetic, to three significant digits."
    )


def certified_centers(
    max_period: int,
    precision: int,
    pairs: dict[int, list[RayPair]],
) -> dict[int, list[tuple[RayPair, DecimalComplex]]]:
    """The certified centre of every ray pair of exact period <= max_period.

    Each pair's two parameter rays are traced in binary64 and must land
    together; Newton's method refines the landing point in `precision`-digit
    arithmetic, and certify_center proves a small disk about it holds exactly
    one simple root of f_c^p(0), of exact period p. The disks of one period are
    disjoint, so the pairs name distinct centres.
    """
    radius = Decimal(10) ** -(precision - CERTIFIED_RADIUS_MARGIN)
    centers: dict[int, list[tuple[RayPair, DecimalComplex]]] = {}
    for period in range(1, max_period + 1):
        found: list[tuple[RayPair, DecimalComplex]] = []
        for lower, upper in pairs[period]:
            seed = landing_center(lower, period)
            if abs(seed - landing_center(upper, period)) > MATCH_TOLERANCE:
                raise ValueError(f"rays {lower} and {upper} of period {period} land apart")
            refined = refine_center(seed, period, precision)
            certify_center((refined.real, refined.imaginary), period, radius, precision)
            found.append(((lower, upper), refined))
        with localcontext() as context:
            context.prec = precision
            check_disjoint(period, [center for _pair, center in found], radius)
        centers[period] = found
    return centers


def binary64(value: Decimal) -> float:
    """Nearest binary64, with -0.0 normalized to 0.0."""
    return float(value) + 0.0


def three_digits(value: Decimal) -> float:
    """A non-negative residual rounded to three significant digits."""
    if value == 0:
        return 0.0
    return float(f"{value:.2e}")


def check_settings(max_period: int, precision: int) -> None:
    """The generators' common argument checks."""
    if not 1 <= max_period <= MAX_SUPPORTED_PERIOD:
        raise ValueError(f"max-period must be between 1 and {MAX_SUPPORTED_PERIOD}")
    if precision < MIN_PRECISION:
        raise ValueError(f"precision must be at least {MIN_PRECISION} decimal digits")


def stored_center(
    refined: DecimalComplex, period: int, precision: int
) -> tuple[float, float, dict[str, float], int]:
    """The stored centre (the nearest binary64 to the refined one), its residuals and digits."""
    re, im = binary64(refined.real), binary64(refined.imaginary)
    stored = DecimalComplex(Decimal(re), Decimal(im))
    residual, digits = residual_fields(stored, refined, period, precision)
    return re, im, residual, digits


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
    re, im, residual, digits = stored_center(refined, period, precision)
    entry: dict[str, Any] = {"id": f"mi-p{period}-{lower}-{upper}"}
    if curated is not None and curated.get("aliases"):
        entry["aliases"] = list(curated["aliases"])
    curated_label = curated is not None and "label" in curated
    entry["label"] = curated["label"] if curated_label else label_for(period, lower, upper)
    if curated is not None and "annotation" in curated:
        entry["annotation"] = curated["annotation"]
    if curated is not None and "references" in curated:
        entry["references"] = list(curated["references"])
    entry["period"] = period
    entry["center"] = {"re": re, "im": im}
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
    entry["method"] = method_key(precision)
    if curated_label:
        entry["provenance"] = "curated-label"
    elif curated is not None:
        entry["provenance"] = "curated-aliases"
    else:
        entry["provenance"] = "generated-label"
    return entry


def build_catalog(
    max_period: int,
    precision: int,
    curation: dict[str, dict[str, Any]],
    reference_keys: Collection[str] | None = None,
) -> dict[str, Any]:
    pairs = lavaurs_pairs(max_period)
    centers = certified_centers(max_period, precision, pairs)
    components: list[dict[str, Any]] = []
    for period in range(1, max_period + 1):
        for pair, refined in centers[period]:
            identifier = f"mi-p{period}-{pair[0]}-{pair[1]}"
            components.append(
                build_entry(
                    period, pair, refined, pairs, curation.get(identifier), precision
                )
            )
    # File order: by period, then by centre. The application sorts the entries
    # into catalog order, by period, then lower ray, as the core is stored.
    components.sort(
        key=lambda entry: (entry["period"], entry["center"]["re"], entry["center"]["im"])
    )
    check_curation(curation, components, reference_keys)
    arguments = f"--max-period {max_period} --precision {precision}"
    return {
        "schemaVersion": SCHEMA_VERSION,
        "license": "CC0-1.0",
        "maxPeriod": max_period,
        "methods": {method_key(precision): method_text(precision)},
        "provenance": {
            "curated-label": {
                "generator": "tools/generate_catalog.py",
                "arguments": arguments,
                "curated": "label, aliases, annotation and references from catalog/curation.v2.json",
            },
            "curated-aliases": {
                "generator": "tools/generate_catalog.py",
                "arguments": arguments,
                "curated": "aliases from catalog/curation.v2.json; the label is generated from the characteristic rays",
            },
            "generated-label": {
                "generator": "tools/generate_catalog.py",
                "arguments": arguments,
                "curated": "none; the label is generated from the characteristic rays",
            },
        },
        "components": components,
    }


def check_annotation(identifier: str, annotation: object) -> None:
    """A curated annotation: one short line of text (ADR 0012)."""
    if not isinstance(annotation, str) or not annotation.strip():
        raise ValueError(f"{identifier} has an empty or non-text annotation")
    if annotation != annotation.strip():
        raise ValueError(f"{identifier} annotation must not start or end with white space")
    if any(ord(character) < 0x20 or ord(character) == 0x7F for character in annotation):
        raise ValueError(f"{identifier} annotation must not contain control characters")
    if len(annotation) > ANNOTATION_MAX_LENGTH:
        raise ValueError(
            f"{identifier} annotation is longer than {ANNOTATION_MAX_LENGTH} characters"
        )


def check_reference_table(table: object) -> dict[str, dict[str, str]]:
    """The shared reference table: https links to Wikipedia or arXiv only (ADR 0012)."""
    if not isinstance(table, dict) or table.get("schemaVersion") != REFERENCES_SCHEMA_VERSION:
        raise ValueError(f"references must declare schemaVersion {REFERENCES_SCHEMA_VERSION}")
    references = table.get("references")
    if not isinstance(references, dict) or not references:
        raise ValueError("references must be a non-empty object keyed by reference key")
    for key, reference in references.items():
        if not isinstance(key, str) or not REFERENCE_KEY_PATTERN.match(key):
            raise ValueError(f"malformed reference key {key!r}")
        if not isinstance(reference, dict):
            raise ValueError(f"reference {key} must be an object")
        title = reference.get("title")
        if not isinstance(title, str) or not title.strip() or title != title.strip():
            raise ValueError(f"reference {key} needs a non-empty title")
        source = reference.get("source")
        if source not in REFERENCE_HOSTS:
            raise ValueError(f"reference {key} source must be Wikipedia or arXiv")
        url = reference.get("url")
        if not isinstance(url, str):
            raise ValueError(f"reference {key} needs a url")
        parts = urlsplit(url)
        if parts.scheme != "https":
            raise ValueError(f"reference {key} url must be https")
        if parts.netloc != REFERENCE_HOSTS[source]:
            raise ValueError(
                f"reference {key} url host must be exactly {REFERENCE_HOSTS[source]} "
                f"for source {source}"
            )
    return references


def load_references(path: Path) -> dict[str, dict[str, str]]:
    return check_reference_table(json.loads(path.read_text(encoding="utf-8")))


def check_entry_references(
    identifier: str, curated: dict[str, Any], reference_keys: Collection[str]
) -> None:
    """A curated entry's reference keys: a non-empty list of known keys, none repeated."""
    keys = curated["references"]
    if not isinstance(keys, list) or not keys:
        raise ValueError(f"{identifier} has an empty or non-list references")
    if "label" not in curated:
        raise ValueError(f"{identifier} has references but no curated label")
    seen: set[str] = set()
    for key in keys:
        if not isinstance(key, str) or key not in reference_keys:
            raise ValueError(f"{identifier} cites an unknown reference {key!r}")
        if key in seen:
            raise ValueError(f"{identifier} cites reference {key} twice")
        seen.add(key)


def check_curation(
    curation: dict[str, dict[str, Any]],
    components: list[dict[str, Any]],
    reference_keys: Collection[str] | None = None,
) -> None:
    if reference_keys is None:
        reference_keys = load_references(DEFAULT_REFERENCES)
    identifiers = {entry["id"] for entry in components}
    unknown = sorted(set(curation) - identifiers)
    if unknown:
        raise ValueError(f"curation names ids the generator did not produce: {unknown}")
    aliases: list[str] = []
    for identifier, curated in curation.items():
        if "label" not in curated and not curated.get("aliases"):
            raise ValueError(f"{identifier} needs a curated label or aliases")
        label = curated.get("label", "generated")
        if not isinstance(label, str) or not label.strip():
            raise ValueError(f"{identifier} needs a non-empty curated label")
        if "annotation" in curated and "label" not in curated:
            raise ValueError(f"{identifier} has an annotation but no curated label")
        if "annotation" in curated:
            check_annotation(identifier, curated["annotation"])
        if "references" in curated:
            check_entry_references(identifier, curated, reference_keys)
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
    parser.add_argument("--references", type=Path, default=DEFAULT_REFERENCES)
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
    check_settings(arguments.max_period, arguments.precision)

    text = render(
        build_catalog(
            arguments.max_period,
            arguments.precision,
            load_curation(arguments.curation),
            load_references(arguments.references),
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
