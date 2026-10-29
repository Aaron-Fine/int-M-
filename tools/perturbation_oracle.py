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


def iterate_pixel(c_re: int, c_im: int, max_iterations: int) -> dict[str, Any]:
    """Classify escape through max_iterations for the exact parameter."""
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

        sq_re_lo, sq_re_hi = square_interval(re_lo, re_hi)
        sq_im_lo, sq_im_hi = square_interval(im_lo, im_hi)
        if sq_re_lo + sq_im_lo > four:
            return {"status": "escaped", "iteration": iteration, "box": (re_lo, re_hi, im_lo, im_hi)}
        if sq_re_hi + sq_im_hi > four:
            return {"status": "unresolved", "iteration": iteration, "box": (re_lo, re_hi, im_lo, im_hi)}
    return {"status": "bounded", "iteration": max_iterations, "box": (re_lo, re_hi, im_lo, im_hi)}


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
    text = encode(build())
    if args.check:
        if FIXTURE.read_text(encoding="utf-8") != text:
            print(f"{FIXTURE} is stale; rerun tools/perturbation_oracle.py", file=sys.stderr)
            return 1
        print(f"{FIXTURE.name} matches the oracle")
        return 0
    FIXTURE.write_text(text, encoding="utf-8")
    print(f"wrote {FIXTURE}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
