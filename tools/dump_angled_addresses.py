#!/usr/bin/env python3
"""Pin the angled internal addresses of every Lavaurs pair of period 2 to 12.

The generator side (tools/catalog_combinatorics.angled_internal_address) finds
each rotation numerator by a tuned search of the sub-wakes. The browser
computes the same addresses in closed form (src/catalog/combinatorics.ts) and
tests/unit/catalog/core/angled-addresses.test.ts compares them with this
fixture, so ADR 0014 and ADR 0011's claim that the two agree on all 4,015
entries is a committed test (ADR 0014).

  --write FILE  regenerate the fixture (about 25 s)
  --check FILE  regenerate and require byte equality; writes nothing

Each key is "period/lower", the pair's lower angle over 2^period - 1. Each
value lists the steps "from>to:numerator/denominator", space separated.
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path
import sys

from catalog_combinatorics import angled_internal_address, lavaurs_pairs

MAX_PERIOD = 12


def render() -> str:
    pairs = lavaurs_pairs(MAX_PERIOD)
    entries: dict[str, str] = {}
    for period in range(2, MAX_PERIOD + 1):
        for lower, _upper in pairs[period]:
            steps = angled_internal_address(lower, period, pairs)
            entries[f"{period}/{lower}"] = " ".join(
                f"{step.from_period}>{step.to_period}:{step.numerator}/{step.denominator}"
                for step in steps
            )
    return json.dumps(entries, indent=2) + "\n"


def main() -> int:
    parser = argparse.ArgumentParser()
    action = parser.add_mutually_exclusive_group(required=True)
    action.add_argument("--write", type=Path)
    action.add_argument("--check", type=Path)
    arguments = parser.parse_args()
    text = render()
    if arguments.write is not None:
        arguments.write.write_text(text, encoding="utf-8")
        return 0
    if arguments.check.read_text(encoding="utf-8") != text:
        print(
            f"{arguments.check} differs; run python3 tools/dump_angled_addresses.py --write {arguments.check}",
            file=sys.stderr,
        )
        return 1
    print(f"angled addresses of {text.count(chr(10)) - 2} pairs match {arguments.check}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
