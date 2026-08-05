#!/usr/bin/env python3
"""Generate the disposable high-precision input for the Phase 0 perturbation tile."""

from __future__ import annotations

import json
from decimal import Decimal, getcontext


getcontext().prec = 80

WIDTH = 256
HEIGHT = 256
MAX_ITERATIONS = 1024
SAMPLE_STEP = 16
CENTER_RE = Decimal("-0.743643887037151")
CENTER_IM = Decimal("0.131825904205330")
SPAN_Y = Decimal("1e-8")


def iterate(c_re: Decimal, c_im: Decimal) -> tuple[int, str]:
    z_re = Decimal(0)
    z_im = Decimal(0)
    for iteration in range(1, MAX_ITERATIONS + 1):
        next_re = z_re * z_re - z_im * z_im + c_re
        z_im = Decimal(2) * z_re * z_im + c_im
        z_re = next_re
        if z_re * z_re + z_im * z_im > Decimal(4):
            return iteration, "escaped"
    return 0, "unresolved"


def parameter_for_pixel(x: int, y: int) -> tuple[Decimal, Decimal]:
    units = SPAN_Y / Decimal(HEIGHT)
    return (
        CENTER_RE + (Decimal(x) + Decimal("0.5") - Decimal(WIDTH) / 2) * units,
        CENTER_IM - (Decimal(y) + Decimal("0.5") - Decimal(HEIGHT) / 2) * units,
    )


def reference_orbit() -> list[list[float]]:
    result = [[0.0, 0.0]]
    z_re = Decimal(0)
    z_im = Decimal(0)
    for _ in range(MAX_ITERATIONS):
        next_re = z_re * z_re - z_im * z_im + CENTER_RE
        z_im = Decimal(2) * z_re * z_im + CENTER_IM
        z_re = next_re
        result.append([float(z_re), float(z_im)])
    return result


def main() -> None:
    samples = []
    for y in range(SAMPLE_STEP // 2, HEIGHT, SAMPLE_STEP):
        for x in range(SAMPLE_STEP // 2, WIDTH, SAMPLE_STEP):
            c_re, c_im = parameter_for_pixel(x, y)
            escape_iteration, status = iterate(c_re, c_im)
            samples.append(
                {
                    "x": x,
                    "y": y,
                    "status": status,
                    "escapeIteration": escape_iteration,
                }
            )

    print(
        json.dumps(
            {
                "precisionDigits": getcontext().prec,
                "referenceMethod": "Python decimal, 80 significant digits",
                "center": {"re": str(CENTER_RE), "im": str(CENTER_IM)},
                "spanY": str(SPAN_Y),
                "size": {"width": WIDTH, "height": HEIGHT},
                "maxIterations": MAX_ITERATIONS,
                "referenceOrbit": reference_orbit(),
                "samples": samples,
            },
            separators=(",", ":"),
        )
    )


if __name__ == "__main__":
    main()
