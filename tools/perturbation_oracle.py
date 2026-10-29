#!/usr/bin/env python3
"""Independent interval oracle for the Phase 3 perturbation backend pilot.

Each pixel's target parameter is iterated directly (no reference orbit, no
perturbation) in rectangular interval arithmetic on a dyadic grid, with every
endpoint rounded outward. The result is used to test the TypeScript binary64
delta backend in poc/performance/src/numerics/perturbation-tile.ts; the two
share no code and no arithmetic method.

See docs/verification/PERTURBATION-BACKEND-PILOT.md.

The generated numerical data is dedicated to the public domain under CC0-1.0.
This generator is application source code and is licensed under GPL-3.0-only.
"""

from __future__ import annotations

import argparse
from fractions import Fraction
import json
from pathlib import Path
import sys
from typing import Any

FIXTURE = Path(__file__).resolve().parent.parent / "fixtures" / "perturbation-tiles.v1.json"

# Reference parameters are binary64 values written as their shortest decimal
# text; Python's float() and JavaScript's Number() parse them identically.
TILES: tuple[dict[str, Any], ...] = (
    {
        "id": "seahorse-step-2^-31",
        "reference": {"re": "-0.743643887037151", "im": "0.13182590420533"},
        "stepExponent": 31,
        "width": 16,
        "height": 16,
        "maxIterations": 1024,
    },
    {
        "id": "misiurewicz-i-step-2^-60",
        "reference": {"re": "0", "im": "1"},
        "stepExponent": 60,
        "width": 16,
        "height": 16,
        "maxIterations": 1024,
    },
    {
        "id": "misiurewicz-i-step-2^-200",
        "reference": {"re": "0", "im": "1"},
        "stepExponent": 200,
        "width": 16,
        "height": 16,
        "maxIterations": 1024,
    },
)

# Interval grid: units of 2^-GRID_BITS. Exact for every binary64 reference
# coordinate used here and every offset (i * 2^-stepExponent).
GRID_BITS = 1200
# Enclosures are written outward-rounded to units of 2^-(stepExponent + this).
EXPORT_EXTRA_BITS = 96


def exact_units(value: float) -> int:
    fraction = Fraction(value)
    scaled = fraction * (1 << GRID_BITS)
    if scaled.denominator != 1:
        raise ValueError(f"{value!r} is not on the 2^-{GRID_BITS} grid")
    return scaled.numerator


def floor_shift(value: int, bits: int) -> int:
    return value >> bits


def ceil_shift(value: int, bits: int) -> int:
    return -((-value) >> bits)


def square_interval(lo: int, hi: int) -> tuple[int, int]:
    """Exact square of [lo, hi] in units 2^(-2*GRID_BITS)."""
    a = lo * lo
    b = hi * hi
    upper = max(a, b)
    lower = 0 if lo <= 0 <= hi else min(a, b)
    return lower, upper


def product_interval(alo: int, ahi: int, blo: int, bhi: int) -> tuple[int, int]:
    products = (alo * blo, alo * bhi, ahi * blo, ahi * bhi)
    return min(products), max(products)


def iterate_pixel(
    c_re: int, c_im: int, max_iterations: int, record_from: int | None = None
) -> dict[str, Any]:
    """Classify escape through max_iterations for the exact parameter.

    With record_from, also returns the boxes of iterations record_from..max.
    """
    boxes: list[tuple[int, int, int, int]] = []
    re_lo = re_hi = im_lo = im_hi = 0
    four = 4 << (2 * GRID_BITS)
    for iteration in range(1, max_iterations + 1):
        rr_lo, rr_hi = square_interval(re_lo, re_hi)
        ii_lo, ii_hi = square_interval(im_lo, im_hi)
        ri_lo, ri_hi = product_interval(re_lo, re_hi, im_lo, im_hi)
        c_re_wide = c_re << GRID_BITS
        c_im_wide = c_im << GRID_BITS
        next_re_lo = floor_shift(rr_lo - ii_hi + c_re_wide, GRID_BITS)
        next_re_hi = ceil_shift(rr_hi - ii_lo + c_re_wide, GRID_BITS)
        next_im_lo = floor_shift(2 * ri_lo + c_im_wide, GRID_BITS)
        next_im_hi = ceil_shift(2 * ri_hi + c_im_wide, GRID_BITS)
        re_lo, re_hi, im_lo, im_hi = next_re_lo, next_re_hi, next_im_lo, next_im_hi
        if record_from is not None and iteration >= record_from:
            boxes.append((re_lo, re_hi, im_lo, im_hi))

        sq_re_lo, sq_re_hi = square_interval(re_lo, re_hi)
        sq_im_lo, sq_im_hi = square_interval(im_lo, im_hi)
        if sq_re_lo + sq_im_lo > four:
            return {"status": "escaped", "iteration": iteration, "box": (re_lo, re_hi, im_lo, im_hi)}
        if sq_re_hi + sq_im_hi > four:
            return {"status": "unresolved", "iteration": iteration, "box": (re_lo, re_hi, im_lo, im_hi)}
    return {
        "status": "bounded",
        "iteration": max_iterations,
        "box": (re_lo, re_hi, im_lo, im_hi),
        "boxes": boxes,
    }


def export_box(box: tuple[int, int, int, int], export_bits: int) -> dict[str, str]:
    shift = GRID_BITS - export_bits
    re_lo, re_hi, im_lo, im_hi = box
    return {
        "reLo": str(floor_shift(re_lo, shift)),
        "reHi": str(ceil_shift(re_hi, shift)),
        "imLo": str(floor_shift(im_lo, shift)),
        "imHi": str(ceil_shift(im_hi, shift)),
    }


def tile_fixture(tile: dict[str, Any]) -> dict[str, Any]:
    ref_re = exact_units(float(tile["reference"]["re"]))
    ref_im = exact_units(float(tile["reference"]["im"]))
    step = 1 << (GRID_BITS - tile["stepExponent"])
    width = tile["width"]
    height = tile["height"]
    export_bits = tile["stepExponent"] + EXPORT_EXTRA_BITS
    pixels = []
    for y in range(height):
        for x in range(width):
            c_re = ref_re + (x - width // 2) * step
            c_im = ref_im + (height // 2 - y) * step
            result = iterate_pixel(c_re, c_im, tile["maxIterations"])
            pixels.append(
                {
                    "x": x,
                    "y": y,
                    "status": result["status"],
                    "iteration": result["iteration"],
                    "box": export_box(result["box"], export_bits),
                }
            )
    return {**tile, "exportBits": export_bits, "pixels": pixels}


# ---------------------------------------------------------------------------
# Work packet 3: the V0 verifier decision on direct interval frames.

INTERIOR_FIXTURE = FIXTURE.parent / "perturbation-interior.v1.json"

INTERIOR_TILES: tuple[dict[str, Any], ...] = (
    {
        "id": "minibrot-p25-step-2^-24",
        "reference": {"re": "-0.10133043579283234", "im": "0.9564326741946593"},
        "stepExponent": 24,
        "width": 16,
        "height": 16,
        "maxIterations": 1024,
        "maxPeriod": 64,
    },
    {
        "id": "minibrot-p34-step-2^-33",
        "reference": {"re": "-0.10111537313879465", "im": "0.9562964985177921"},
        "stepExponent": 33,
        "width": 16,
        "height": 16,
        "maxIterations": 1024,
        "maxPeriod": 72,
    },
    {
        "id": "minibrot-p61-step-2^-40",
        "reference": {"re": "0.0016437219710060931", "im": "0.8224676332982375"},
        "stepExponent": 40,
        "width": 16,
        "height": 16,
        "maxIterations": 1536,
        "maxPeriod": 64,
    },
    {
        # Below binary64 resolution: an exact 128-bit reference (the period-349
        # nucleus); a binary64 reference would round out of this 2^-56 minibrot.
        "id": "minibrot-p349-step-2^-58",
        "reference": {
            "re": "-263951509265533703610639990652156275451",
            "im": "46437439613826002646581579954957011344",
            "exponent": -128,
        },
        "stepExponent": 58,
        "width": 8,
        "height": 8,
        "maxIterations": 4096,
        "maxPeriod": 360,
    },
)

# verifier.ts policy constants, as binary64 values (Python and ECMAScript
# evaluate these expressions identically under IEEE 754).
TAU_CLOSURE_SCALED = Fraction(1e-10 * 100)
TAU_EXCLUDE = Fraction(1e-6)
ATTRACT_UPPER = Fraction(1 - 1e-12)

Box = tuple[int, int, int, int]
Interval = tuple[Fraction, Fraction]


def abs_interval(lo: int, hi: int) -> tuple[int, int]:
    if lo <= 0 <= hi:
        return 0, max(-lo, hi)
    return min(abs(lo), abs(hi)), max(abs(lo), abs(hi))


def scale_interval(start: Box) -> Interval:
    """max(1, |Re zeta|, |Im zeta|) over the start box."""
    one = 1 << GRID_BITS
    re_lo, re_hi = abs_interval(start[0], start[1])
    im_lo, im_hi = abs_interval(start[2], start[3])
    unit = Fraction(1, one)
    return max(one, re_lo, im_lo) * unit, max(one, re_hi, im_hi) * unit


def residual_squared(start: Box, end: Box) -> Interval:
    re = square_interval(end[0] - start[1], end[1] - start[0])
    im = square_interval(end[2] - start[3], end[3] - start[2])
    unit = Fraction(1, 1 << (2 * GRID_BITS))
    return (re[0] + im[0]) * unit, (re[1] + im[1]) * unit


def certified_below(value: Interval, threshold: Interval, strict: bool) -> bool | None:
    """value (< or <=) threshold for every admissible pair, or None."""
    if (value[1] < threshold[0]) if strict else (value[1] <= threshold[0]):
        return True
    if (value[0] >= threshold[1]) if strict else (value[0] > threshold[1]):
        return False
    return None


def multiplier_prefixes(boxes: list[Box], count: int) -> list[Interval]:
    """|prod_{i<j} 2 z_{m+i}|^2 intervals for j = 1..count, rounded outward."""
    one = 1 << GRID_BITS
    re: tuple[int, int] = (one, one)
    im: tuple[int, int] = (0, 0)
    result = []
    unit = Fraction(1, 1 << (2 * GRID_BITS))
    for box in boxes[:count]:
        two_re = (2 * box[0], 2 * box[1])
        two_im = (2 * box[2], 2 * box[3])
        a = product_interval(*re, *two_re)
        b = product_interval(*im, *two_im)
        c = product_interval(*re, *two_im)
        d = product_interval(*im, *two_re)
        re = (floor_shift(a[0] - b[1], GRID_BITS), ceil_shift(a[1] - b[0], GRID_BITS))
        im = (floor_shift(c[0] + d[0], GRID_BITS), ceil_shift(c[1] + d[1], GRID_BITS))
        sq_re = square_interval(*re)
        sq_im = square_interval(*im)
        result.append(((sq_re[0] + sq_im[0]) * unit, (sq_re[1] + sq_im[1]) * unit))
    return result


def decide(boxes: list[Box], period: int, multipliers: list[Interval]) -> str:
    """VerifierModel.lean `reference`, every reached comparison certified."""
    start = boxes[0]
    scale_lo, scale_hi = scale_interval(start)
    accept = (TAU_CLOSURE_SCALED**2 * scale_lo**2, TAU_CLOSURE_SCALED**2 * scale_hi**2)
    exclude = (TAU_EXCLUDE**2 * scale_lo**2, TAU_EXCLUDE**2 * scale_hi**2)
    closure = residual_squared(start, boxes[period])
    within = certified_below(closure, exclude, strict=False)
    if within is None:
        return "U"
    if not within:
        return "N"
    within = certified_below(closure, accept, strict=False)
    if within is None:
        return "U"
    if not within:
        return "C"
    resolved = period
    for divisor in range(1, period):
        if period % divisor:
            continue
        frame = residual_squared(start, boxes[divisor])
        close = certified_below(frame, exclude, strict=True)
        if close is None:
            return "U"
        if not close:
            continue
        accepted = certified_below(frame, accept, strict=False)
        if accepted is None:
            return "U"
        if not accepted:
            return "D"
        resolved = divisor
        break
    upper = ATTRACT_UPPER**2
    attracting = certified_below(multipliers[resolved - 1], (upper, upper), strict=True)
    if attracting is None:
        return "U"
    return f"A{resolved}" if attracting else "X"


def reference_units(reference: dict[str, Any]) -> tuple[int, int]:
    """A binary64 decimal pair, or an exact dyadic (re + i im) * 2^exponent."""
    if "exponent" not in reference:
        return exact_units(float(reference["re"])), exact_units(float(reference["im"]))
    shift = GRID_BITS + reference["exponent"]
    return int(reference["re"]) << shift, int(reference["im"]) << shift


def interior_tile_fixture(tile: dict[str, Any]) -> dict[str, Any]:
    ref_re, ref_im = reference_units(tile["reference"])
    step = 1 << (GRID_BITS - tile["stepExponent"])
    width = tile["width"]
    height = tile["height"]
    max_period = tile["maxPeriod"]
    start = tile["maxIterations"] - max_period
    pixels = []
    for y in range(height):
        for x in range(width):
            c_re = ref_re + (x - width // 2) * step
            c_im = ref_im + (height // 2 - y) * step
            result = iterate_pixel(c_re, c_im, tile["maxIterations"], record_from=start)
            pixel: dict[str, Any] = {"status": result["status"], "iteration": result["iteration"]}
            if result["status"] == "bounded":
                boxes = result["boxes"]
                multipliers = multiplier_prefixes(boxes, max_period)
                pixel["codes"] = ",".join(
                    decide(boxes, period, multipliers) for period in range(1, max_period + 1)
                )
            pixels.append(pixel)
    return {**tile, "pixels": pixels}


def build_interior() -> dict[str, Any]:
    return {
        "schema": "int-m.perturbation-interior.v1",
        "generator": "tools/perturbation_oracle.py",
        "method": (
            "Direct interval iteration as in perturbation-tiles.v1.json; for pixels bounded "
            "through maxIterations, the V0 verifier decision (VerifierModel.lean `reference`) "
            "for every proposed period 1..maxPeriod at cycle start z_m, m = maxIterations - "
            "maxPeriod, with every reached comparison certified on interval frames."
        ),
        "codes": "A<p> accepted with period p; N no closure; C closure ambiguous; "
        "D divisor ambiguous; X not attracting; U a reached comparison is not certified",
        "thresholds": "exact products of the binary64 constants TAU_CLOSURE_SCALED, tauExclude "
        "and (1 - attractMargin) from src/domain/verifier.ts with s = max(1, |Re z_m|, |Im z_m|)",
        "tiles": [interior_tile_fixture(tile) for tile in INTERIOR_TILES],
    }


def build() -> dict[str, Any]:
    return {
        "schema": "int-m.perturbation-tiles.v1",
        "generator": "tools/perturbation_oracle.py",
        "method": (
            "Direct critical iteration of each exact target parameter in "
            f"rectangular interval arithmetic on a 2^-{GRID_BITS} grid, "
            "endpoints rounded outward; boxes exported outward on a coarser grid."
        ),
        "pixelOffset": "re = (x - width/2) * 2^-stepExponent, im = (height/2 - y) * 2^-stepExponent",
        "escape": "escaped at the first iteration whose |z|^2 > 4 is certified; unresolved when an enclosure straddles it",
        "tiles": [tile_fixture(tile) for tile in TILES],
    }


def encode(data: dict[str, Any]) -> str:
    return json.dumps(data, indent=1) + "\n"


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--check", action="store_true", help="fail if the committed fixture differs")
    args = parser.parse_args()
    outputs = ((FIXTURE, build), (INTERIOR_FIXTURE, build_interior))
    stale = 0
    for path, builder in outputs:
        text = encode(builder())
        if not args.check:
            path.write_text(text, encoding="utf-8")
            print(f"wrote {path}")
        elif path.read_text(encoding="utf-8") != text:
            print(f"{path} is stale; rerun tools/perturbation_oracle.py", file=sys.stderr)
            stale += 1
        else:
            print(f"{path.name} matches the oracle")
    return 1 if stale else 0


if __name__ == "__main__":
    sys.exit(main())
