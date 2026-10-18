"""Tests for tools/crosscheck_catalog_core.py (run: npm run catalog:test)."""

from __future__ import annotations

import contextlib
import hashlib
import io
import json
from pathlib import Path
import re
import struct
import tempfile
import unittest

import crosscheck_catalog_core as crosscheck
from generate_catalog_core import generate

ROOT = Path(__file__).resolve().parent.parent
RECORD = struct.Struct("<BHHddBfff")


def write_core(directory: Path, data: bytes, manifest: dict) -> None:
    manifest = {**manifest, "byteLength": len(data), "sha256": hashlib.sha256(data).hexdigest()}
    (directory / "core.v1.bin").write_bytes(data)
    (directory / "core.v1.json").write_text(json.dumps(manifest), encoding="utf-8")


class CrossCheckTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        data, text = generate(5, 80)
        cls.data = data
        cls.manifest = json.loads(text)

    def run_on(self, data: bytes, manifest: dict | None = None) -> int:
        return self.run_with_report(data, manifest)[0]

    def run_with_report(self, data: bytes, manifest: dict | None = None) -> tuple[int, str]:
        errors = io.StringIO()
        with tempfile.TemporaryDirectory() as directory:
            write_core(Path(directory), data, manifest or self.manifest)
            with contextlib.redirect_stdout(io.StringIO()), contextlib.redirect_stderr(errors):
                code = crosscheck.main(["crosscheck", directory, "--workers=1"])
        return code, errors.getvalue()

    def record_offset(self, period: int, lower: int) -> int:
        for index in range((len(self.data) - 16) // 34):
            offset = 16 + 34 * index
            if RECORD.unpack_from(self.data, offset)[:2] == (period, lower):
                return offset
        raise LookupError((period, lower))

    def replace(self, period: int, lower: int, **fields: float) -> bytes:
        offset = self.record_offset(period, lower)
        values = list(RECORD.unpack_from(self.data, offset))
        names = ["period", "lower", "upper", "re", "im", "digits", "orbit", "error", "divisor"]
        for name, value in fields.items():
            values[names.index(name)] = value
        data = bytearray(self.data)
        RECORD.pack_into(data, offset, *values)
        return bytes(data)

    def test_accepts_the_generated_core(self) -> None:
        self.assertEqual(self.run_on(self.data), 0)

    def test_the_counts_follow_the_mobius_formula_and_a000740(self) -> None:
        self.assertEqual(
            [crosscheck.component_count(p) for p in range(1, 13)], list(crosscheck.A000740)
        )
        self.assertEqual(sum(crosscheck.A000740), 4016)

    def test_recomputes_lavaurs_pairs(self) -> None:
        pairs = crosscheck.lavaurs_pairs(4)
        self.assertEqual(pairs[3], [(1, 2), (3, 4), (5, 6)])
        self.assertEqual(pairs[4], [(1, 2), (3, 4), (6, 9), (7, 8), (11, 12), (13, 14)])
        self.assertEqual([len(crosscheck.lavaurs_pairs(8)[p]) for p in range(1, 9)], list(crosscheck.A000740[:8]))

    def swapped(self, first: tuple[int, int], second: tuple[int, int]) -> bytes:
        """The core with the centres (and their residuals) of two period-5 pairs exchanged."""
        data = bytearray(self.data)
        one, two = self.record_offset(5, first[0]), self.record_offset(5, second[0])
        a, b = RECORD.unpack_from(self.data, one), RECORD.unpack_from(self.data, two)
        RECORD.pack_into(data, one, *a[:3], *b[3:])
        RECORD.pack_into(data, two, *b[:3], *a[3:])
        return bytes(data)

    def test_rejects_centres_exchanged_between_two_pairs(self) -> None:
        # The pairs 1/31-2/31 and 3/31-4/31 swap centres: both are proved centres in the
        # upper half-plane with these kneading sequences; only the rays tell them apart.
        code, report = self.run_with_report(self.swapped((1, 2), (3, 4)))
        self.assertEqual(code, 1)
        self.assertIn("mi-p5-1-2: its two dynamic rays were not proved to land together", report)
        self.assertIn("mi-p5-3-4: its two dynamic rays were not proved to land together", report)
        self.assertNotIn("Rouche", report)

    def test_rejects_pairs_that_are_not_lavaurs_pairs(self) -> None:
        # 1/31 and 9/31 share a kneading sequence but are not a pair; 2/31 and 10/31 neither.
        data = self.replace(5, 1, upper=9)
        offset = self.record_offset(5, 9)
        values = list(RECORD.unpack_from(data, offset))
        values[1], values[2] = 2, 10
        mutable = bytearray(data)
        RECORD.pack_into(mutable, offset, *values)
        code, report = self.run_with_report(bytes(mutable))
        self.assertEqual(code, 1)
        self.assertIn("not Lavaurs' pairs", report)

    def test_rejects_a_missing_component(self) -> None:
        data = self.data[:-34]
        count = struct.unpack_from("<I", data, 12)[0] - 1
        data = data[:12] + struct.pack("<I", count) + data[16:]
        self.assertEqual(self.run_on(data, {**self.manifest, "count": count}), 1)

    def test_rejects_a_nudged_centre(self) -> None:
        offset = self.record_offset(5, 1)
        re_value = RECORD.unpack_from(self.data, offset)[3]
        self.assertEqual(self.run_on(self.replace(5, 1, re=re_value + 1e-9)), 1)

    def test_rejects_a_centre_of_a_divisor_period(self) -> None:
        # The period-2 centre -1 stored as a period-4 entry (rays 6/15, 9/15).
        self.assertEqual(self.run_on(self.replace(4, 6, re=-1.0, im=0.0)), 1)

    def test_rejects_a_broken_conjugate(self) -> None:
        offset = self.record_offset(5, 1)
        im_value = RECORD.unpack_from(self.data, offset)[4]
        self.assertEqual(self.run_on(self.replace(5, 1, im=-im_value)), 1)

    def test_rejects_rays_that_are_not_of_exact_period(self) -> None:
        self.assertEqual(self.run_on(self.replace(4, 6, upper=10)), 1)

    def test_rejects_a_stale_residual(self) -> None:
        self.assertEqual(self.run_on(self.replace(5, 1, orbit=1e-3)), 1)

    def test_rejects_bytes_that_do_not_match_the_manifest(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            write_core(Path(directory), self.data, self.manifest)
            (Path(directory) / "core.v1.bin").write_bytes(self.data[:-1] + b"\0")
            with self.assertRaisesRegex(ValueError, "does not match its manifest"):
                crosscheck.main(["crosscheck", directory])

    def test_shares_no_code_with_the_generator(self) -> None:
        for name in ("crosscheck_catalog_core.py", "crosscheck_rays.py"):
            source = (ROOT / "tools" / name).read_text(encoding="utf-8")
            imports = re.findall(r"^(?:from|import) (\w+)", source, re.MULTILINE)
            self.assertFalse(
                {"generate_catalog", "generate_catalog_core", "catalog_certify", "catalog_combinatorics"}
                & set(imports),
                name,
            )


if __name__ == "__main__":
    unittest.main()
