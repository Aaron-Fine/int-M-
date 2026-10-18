#!/usr/bin/env python3
"""Generate and check the period <=12 catalog core (PHASE2-TODO item 7, ADR 0014).

Writes catalog/core.v1.bin (every hyperbolic-component centre of exact
period 1..12, 4,016 records) and its manifest catalog/core.v1.json, from the
same certified centres as tools/generate_catalog.py. Labels, aliases and
annotations are not stored: the loader derives generated labels and takes
curated ones from catalog/components.v2.json.

  --write DIR   regenerate both files (about 100 s)
  --check DIR   regenerate and require byte equality (about 100 s)
  --inputs DIR  fast: the manifest's input hashes match the generator sources,
                and the binary's length and SHA-256 match the manifest

The generated numerical data is dedicated to the public domain under CC0-1.0.
This generator is application source code and is licensed under GPL-3.0-only.
"""

from __future__ import annotations

import argparse
from decimal import Decimal
import hashlib
import json
from pathlib import Path
import struct
import sys
from typing import Any

from catalog_combinatorics import lavaurs_pairs
from generate_catalog import (
    DecimalComplex,
    binary64,
    certified_centers,
    method_key,
    method_text,
    residual_fields,
)

FORMAT = "mi-catalog-core"
FORMAT_VERSION = 1
CORE_MAX_PERIOD = 12
BINARY_NAME = "core.v1.bin"
MANIFEST_NAME = "core.v1.json"
MAGIC = b"MICORE"
# magic, format version, maximum period, record size, record count (little-endian)
HEADER = struct.Struct("<6sHHHI")
# period, lower and upper ray numerators over 2^p - 1, centre (binary64 re, im),
# centerPrecisionDigits, residuals orbitAbs, centerError, properDivisorOrbitMinAbs
# (float32 of the three-significant-digit value; 0 for period 1)
RECORD = struct.Struct("<BHHddBfff")
ROOT = Path(__file__).resolve().parent.parent
INPUTS = (
    "tools/catalog_certify.py",
    "tools/catalog_combinatorics.py",
    "tools/generate_catalog.py",
    "tools/generate_catalog_core.py",
)


def build_records(max_period: int, precision: int) -> list[tuple[Any, ...]]:
    """One record per component in catalog order: by period, then lower ray."""
    pairs = lavaurs_pairs(max_period)
    centers = certified_centers(max_period, precision, pairs)
    records: list[tuple[Any, ...]] = []
    for period in range(1, max_period + 1):
        for (lower, upper), refined in sorted(centers[period], key=lambda item: item[0]):
            stored = DecimalComplex(
                Decimal(binary64(refined.real)), Decimal(binary64(refined.imaginary))
            )
            residual, digits = residual_fields(stored, refined, period, precision)
            records.append(
                (
                    period,
                    lower,
                    upper,
                    binary64(stored.real),
                    binary64(stored.imaginary),
                    digits,
                    residual["orbitAbs"],
                    residual["centerError"],
                    residual.get("properDivisorOrbitMinAbs", 0.0),
                )
            )
    return records


def encode(records: list[tuple[Any, ...]], max_period: int) -> bytes:
    header = HEADER.pack(MAGIC, FORMAT_VERSION, max_period, RECORD.size, len(records))
    return header + b"".join(RECORD.pack(*record) for record in records)


def sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def input_hashes() -> dict[str, str]:
    return {name: sha256((ROOT / name).read_bytes()) for name in INPUTS}


def manifest(data: bytes, records: list[tuple[Any, ...]], max_period: int, precision: int) -> dict[str, Any]:
    counts = [sum(1 for record in records if record[0] == period) for period in range(1, max_period + 1)]
    return {
        "format": FORMAT,
        "formatVersion": FORMAT_VERSION,
        "license": "CC0-1.0",
        "maxPeriod": max_period,
        "count": len(records),
        "countsByPeriod": counts,
        "recordBytes": RECORD.size,
        "byteLength": len(data),
        "sha256": sha256(data),
        "method": method_key(precision),
        "methods": {method_key(precision): method_text(precision)},
        "provenance": {
            "generated-label": {
                "generator": "tools/generate_catalog_core.py",
                "arguments": f"--max-period {max_period} --precision {precision}",
                "curated": "none; the label is generated from the characteristic rays",
            }
        },
        "inputs": input_hashes(),
    }


def render_manifest(value: dict[str, Any]) -> str:
    return json.dumps(value, indent=2, ensure_ascii=False) + "\n"


def generate(max_period: int, precision: int) -> tuple[bytes, str]:
    records = build_records(max_period, precision)
    data = encode(records, max_period)
    return data, render_manifest(manifest(data, records, max_period, precision))


def check_inputs(directory: Path) -> list[str]:
    """Fast staleness check; returns the problems found."""
    problems: list[str] = []
    try:
        recorded = json.loads((directory / MANIFEST_NAME).read_text(encoding="utf-8"))
        data = (directory / BINARY_NAME).read_bytes()
    except FileNotFoundError as error:
        return [f"missing {error.filename}"]
    for name, digest in input_hashes().items():
        if recorded.get("inputs", {}).get(name) != digest:
            problems.append(f"{name} changed since the core was generated")
    if recorded.get("byteLength") != len(data) or recorded.get("sha256") != sha256(data):
        problems.append(f"{BINARY_NAME} does not match its manifest")
    return problems


def parse_arguments() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--max-period", type=int, default=CORE_MAX_PERIOD)
    parser.add_argument("--precision", type=int, default=80)
    action = parser.add_mutually_exclusive_group(required=True)
    action.add_argument("--write", type=Path, help="Write both files into this directory.")
    action.add_argument("--check", type=Path, help="Regenerate and require byte equality.")
    action.add_argument("--inputs", type=Path, help="Fast input-hash and digest check.")
    return parser.parse_args()


def main() -> int:
    arguments = parse_arguments()
    if not 1 <= arguments.max_period <= CORE_MAX_PERIOD:
        raise ValueError(f"max-period must be between 1 and {CORE_MAX_PERIOD}")
    if arguments.inputs is not None:
        problems = check_inputs(arguments.inputs)
        for problem in problems:
            print(
                f"{problem}; run python3 tools/generate_catalog_core.py --write {arguments.inputs}",
                file=sys.stderr,
            )
        if problems:
            return 1
        print("catalog core inputs and digest match its manifest")
        return 0
    data, text = generate(arguments.max_period, arguments.precision)
    if arguments.check is not None:
        same = (arguments.check / BINARY_NAME).read_bytes() == data and (
            arguments.check / MANIFEST_NAME
        ).read_text(encoding="utf-8") == text
        if not same:
            print(
                f"{arguments.check} differs from the regenerated core; run "
                f"python3 tools/generate_catalog_core.py --write {arguments.check}",
                file=sys.stderr,
            )
            return 1
        print(f"regenerated {len(data)} bytes, identical to {arguments.check / BINARY_NAME}")
        return 0
    arguments.write.mkdir(parents=True, exist_ok=True)
    (arguments.write / BINARY_NAME).write_bytes(data)
    (arguments.write / MANIFEST_NAME).write_text(text, encoding="utf-8")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
