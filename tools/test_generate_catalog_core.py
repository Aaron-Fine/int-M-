"""Tests for tools/generate_catalog_core.py (run: npm run catalog:test)."""

from __future__ import annotations

import json
from pathlib import Path
import shutil
import tempfile
import unittest

from generate_catalog import build_catalog, load_curation, DEFAULT_CURATION
from generate_catalog_core import (
    BINARY_NAME,
    HEADER,
    MANIFEST_NAME,
    RECORD,
    build_records,
    check_inputs,
    encode,
    generate,
)

ROOT = Path(__file__).resolve().parent.parent


class CoreFormatTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.records = build_records(6, 80)
        cls.data, cls.manifest_text = generate(6, 80)

    def test_records_are_34_bytes_after_a_16_byte_header(self) -> None:
        self.assertEqual((HEADER.size, RECORD.size), (16, 34))
        self.assertEqual(len(self.data), 16 + 34 * len(self.records))

    def test_lists_every_component_through_period_six_in_catalog_order(self) -> None:
        self.assertEqual(len(self.records), 1 + 1 + 3 + 6 + 15 + 27)
        keys = [(r[0], r[1]) for r in self.records]
        self.assertEqual(keys, sorted(set(keys)))

    def test_the_header_and_first_record_decode(self) -> None:
        magic, version, max_period, record_bytes, count = HEADER.unpack_from(self.data, 0)
        self.assertEqual((magic, version, max_period, record_bytes, count), (b"MICORE", 1, 6, 34, 53))
        period, lower, upper, re, im, digits, *_residuals = RECORD.unpack_from(self.data, 16)
        self.assertEqual((period, lower, upper, re, im, digits), (1, 0, 1, 0.0, 0.0, 16))

    def test_the_manifest_describes_the_bytes(self) -> None:
        manifest = json.loads(self.manifest_text)
        self.assertEqual(manifest["countsByPeriod"], [1, 1, 3, 6, 15, 27])
        self.assertEqual(manifest["byteLength"], len(self.data))
        self.assertEqual(manifest["method"], "krawczyk-decimal-80")
        self.assertEqual(sorted(manifest["inputs"]), sorted(
            ["tools/catalog_certify.py", "tools/catalog_combinatorics.py",
             "tools/generate_catalog.py", "tools/generate_catalog_core.py"]))

    def test_generation_is_deterministic(self) -> None:
        self.assertEqual(generate(6, 80), (self.data, self.manifest_text))

    def test_agrees_with_the_curated_json_through_period_four(self) -> None:
        catalog = build_catalog(4, 80, load_curation(ROOT / DEFAULT_CURATION))
        by_id = {e["id"]: e for e in catalog["components"]}
        for period, lower, upper, re, im, digits, orbit, error, divisor in self.records:
            if period > 4:
                continue
            entry = by_id[f"mi-p{period}-{lower}-{upper}"]
            self.assertEqual((re, im), (entry["center"]["re"], entry["center"]["im"]))
            self.assertEqual(digits, entry["centerPrecisionDigits"])
            self.assertEqual(orbit, entry["residual"]["orbitAbs"])
            self.assertEqual(error, entry["residual"]["centerError"])
            self.assertEqual(divisor, entry["residual"].get("properDivisorOrbitMinAbs", 0.0))

    def test_encode_round_trips_the_records(self) -> None:
        data = encode(self.records, 6)
        decoded = [RECORD.unpack_from(data, 16 + 34 * i) for i in range(len(self.records))]
        for record, back in zip(self.records, decoded):
            self.assertEqual(record[:6], back[:6])


class InputCheckTest(unittest.TestCase):
    def test_the_committed_core_matches_its_inputs(self) -> None:
        self.assertEqual(check_inputs(ROOT / "catalog"), [])

    def test_a_changed_binary_or_input_is_reported(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            target = Path(directory)
            shutil.copy(ROOT / "catalog" / BINARY_NAME, target / BINARY_NAME)
            manifest = json.loads((ROOT / "catalog" / MANIFEST_NAME).read_text(encoding="utf-8"))
            manifest["inputs"]["tools/catalog_certify.py"] = "0" * 64
            (target / MANIFEST_NAME).write_text(json.dumps(manifest), encoding="utf-8")
            data = bytearray((target / BINARY_NAME).read_bytes())
            data[40] ^= 1
            (target / BINARY_NAME).write_bytes(bytes(data))
            problems = check_inputs(target)
            self.assertEqual(len(problems), 2)
            self.assertIn("tools/catalog_certify.py changed", problems[0])
            self.assertIn("does not match its manifest", problems[1])


if __name__ == "__main__":
    unittest.main()
