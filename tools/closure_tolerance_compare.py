#!/usr/bin/env python3
"""Compare production classifyOrbit with the independent interval oracle.

ADR 0015 evidence. Reads <dir>/production.json (tools/closure_tolerance_production.ts)
and iterates every sampled parameter c directly in rectangular interval
arithmetic (tools/perturbation_oracle.py: exact dyadic grid, outward rounding,
no shared code or arithmetic with the TypeScript classifier). The oracle
certifies escape and its iteration; it does not propose periods. Writes
<dir>/comparison.json (counts, histogram, every disagreement) and
<dir>/samples.csv (one row per sample).

Horizons: a production escape or unresolved verdict is checked for
max_iterations; a production attracting verdict is checked for
ATTRACTING_HORIZON_FACTOR times max_iterations, so a transient that escapes
after the production budget is still caught.

Usage: python3 tools/closure_tolerance_compare.py <dir> [--workers N]
The generated numerical data is dedicated to the public domain under CC0-1.0.
This script is application source code and is licensed under GPL-3.0-only.
"""

from __future__ import annotations

import argparse
import csv
from collections import Counter
from concurrent.futures import ProcessPoolExecutor
import json
from pathlib import Path
import sys
from typing import Any

sys.path.insert(0, str(Path(__file__).resolve().parent))
import perturbation_oracle as oracle  # noqa: E402

ATTRACTING_HORIZON_FACTOR = 4
# The oracle's dyadic grid, in bits, tried in order: a sample is re-run at the
# next size only when the interval box straddles the escape radius before the
# horizon, which is outward-rounding error amplified along the orbit (about
# 0.4 bit per iteration, so 1,200 bits fails near iteration 2,900). 4,096 bits
# covers the longest horizon here (4 x 1,024 iterations) with margin.
GRID_BITS_LADDER = (1200, 4096)
AGREEING = ("agree-escape", "agree-interior", "agree-unresolved-or-bounded")


def oracle_verdict(job: tuple[float, float, int]) -> tuple[str, int, int]:
    """(status, iteration, grid bits used); statuses are the oracle's."""
    re, im, horizon = job
    for bits in GRID_BITS_LADDER:
        oracle.GRID_BITS = bits
        result = oracle.iterate_pixel(oracle.exact_units(re), oracle.exact_units(im), horizon)
        if result["status"] != "unresolved":
            break
    return result["status"], result["iteration"], bits


def categorize(prod: dict[str, Any], status: str, iteration: int) -> str:
    """One category per sample; see the README for the definitions."""
    p = prod["status"]
    if p == "attracting":
        if status == "escaped":
            return "false-interior"
        return "agree-interior" if status == "bounded" else "oracle-inconclusive"
    if p == "escaped":
        if status == "escaped":
            return "agree-escape" if iteration == prod["escapeIteration"] else "shifted-escape"
        return "escape-not-confirmed"
    if status == "escaped":
        return "unresolved-but-escapes"
    return "agree-unresolved-or-bounded"


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("directory", type=Path)
    parser.add_argument("--workers", type=int, default=4)
    args = parser.parse_args()
    data = json.loads((args.directory / "production.json").read_text())

    jobs: list[tuple[float, float, int]] = []
    index: list[tuple[int, int]] = []
    for t, target in enumerate(data["targets"]):
        for s, sample in enumerate(target["samples"]):
            factor = ATTRACTING_HORIZON_FACTOR if sample["status"] == "attracting" else 1
            jobs.append((sample["re"], sample["im"], target["maxIterations"] * factor))
            index.append((t, s))
    with ProcessPoolExecutor(max_workers=args.workers) as pool:
        verdicts = list(pool.map(oracle_verdict, jobs, chunksize=16))

    per_target: dict[int, list[tuple[dict[str, Any], str, int, str]]] = {}
    rows: list[list[Any]] = []
    for (t, s), (status, iteration, bits) in zip(index, verdicts):
        target = data["targets"][t]
        sample = target["samples"][s]
        category = categorize(sample, status, iteration)
        per_target.setdefault(t, []).append((sample, status, iteration, category))
        rows.append(
            [
                target["id"], sample["x"], sample["y"], repr(sample["re"]), repr(sample["im"]),
                sample["status"], sample["period"], sample["escapeIteration"],
                sample["multiplierMagnitude"], status, iteration, bits, category,
            ]
        )

    summary: list[dict[str, Any]] = []
    disagreements: list[dict[str, Any]] = []
    totals: dict[str, Counter[str]] = {}
    histograms: dict[str, Counter[int]] = {}
    for t, target in enumerate(data["targets"]):
        entries = per_target[t]
        categories = Counter(category for *_, category in entries)
        hist: Counter[int] = Counter()
        for sample, status, iteration, category in entries:
            if status == "escaped" and sample["status"] == "escaped":
                hist[sample["escapeIteration"] - iteration] += 1
            if category not in AGREEING:
                disagreements.append(
                    {
                        "target": target["id"], "x": sample["x"], "y": sample["y"],
                        "re": sample["re"], "im": sample["im"], "category": category,
                        "production": {k: sample[k] for k in (
                            "status", "period", "escapeIteration", "iterations", "multiplierMagnitude")},
                        "oracle": {"status": status, "iteration": iteration, "gridBits": bits},
                    }
                )
        totals.setdefault(target["kind"], Counter()).update(categories)
        histograms.setdefault(target["kind"], Counter()).update(hist)
        summary.append(
            {
                "id": target["id"], "kind": target["kind"], "profile": target["profile"],
                "maxIterations": target["maxIterations"], "samples": len(entries),
                "production": dict(Counter(sample["status"] for sample, *_ in entries)),
                "categories": dict(categories),
                "escapeIterationDifference": {str(k): v for k, v in sorted(hist.items())},
            }
        )
    out = {
        "schemaVersion": 1, "productionCommit": data["commit"], "stride": data["stride"],
        "oracle": f"tools/perturbation_oracle.py iterate_pixel, GRID_BITS ladder {GRID_BITS_LADDER}",
        "attractingHorizonFactor": ATTRACTING_HORIZON_FACTOR,
        "totalsByKind": {k: dict(v) for k, v in totals.items()},
        "escapeIterationDifferenceByKind": {
            k: {str(d): n for d, n in sorted(v.items())} for k, v in histograms.items()
        },
        "targets": summary, "disagreements": disagreements,
    }
    (args.directory / "comparison.json").write_text(json.dumps(out, indent=1) + "\n")
    with (args.directory / "samples.csv").open("w", newline="") as handle:
        writer = csv.writer(handle, lineterminator="\n")
        writer.writerow(["target", "x", "y", "re", "im", "prodStatus", "prodPeriod", "prodEscapeIteration",
                         "prodMultiplierMagnitude", "oracleStatus", "oracleIteration", "oracleGridBits", "category"])
        writer.writerows(rows)
    print(json.dumps(out["totalsByKind"], indent=1))
    print(json.dumps(out["escapeIterationDifferenceByKind"]))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
