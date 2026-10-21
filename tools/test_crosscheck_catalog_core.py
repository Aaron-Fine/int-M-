"""Tests for tools/crosscheck_catalog_core.py (run: npm run catalog:test)."""

from __future__ import annotations

import ast
import contextlib
from fractions import Fraction
import hashlib
import io
import json
import os
from pathlib import Path
import struct
import tempfile
import unittest
from unittest import mock

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

    def test_workers_accepts_both_spellings_in_either_order(self) -> None:
        for argv in (
            ["x", "--workers", "4", "dir"],
            ["x", "--workers=4", "dir"],
            ["x", "dir", "--workers", "4"],
            ["x", "dir", "--workers=4"],
        ):
            with self.subTest(argv=argv):
                arguments = crosscheck.parse_arguments(argv)
                self.assertEqual((arguments.workers, arguments.directory), (4, Path("dir")))
        self.assertEqual(crosscheck.parse_arguments(["x"]).workers, os.cpu_count() or 1)

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

    def swapped(self, *exchanges: tuple[int, int]) -> bytes:
        """The core with the centres (and their residuals) of period-5 pairs exchanged.

        Each exchange names the lower rays of the two records whose centres trade places.
        """
        data = bytearray(self.data)
        for first, second in exchanges:
            one, two = self.record_offset(5, first), self.record_offset(5, second)
            a, b = RECORD.unpack_from(self.data, one), RECORD.unpack_from(self.data, two)
            RECORD.pack_into(data, one, *a[:3], *b[3:])
            RECORD.pack_into(data, two, *b[:3], *a[3:])
        return bytes(data)

    def test_only_the_ray_proofs_reject_centres_exchanged_between_pairs(self) -> None:
        # The pairs 1/31-2/31 and 3/31-4/31 swap centres, and so do their mirrors
        # 29/31-30/31 and 27/31-28/31, which keeps conjugate closure. Every centre is
        # still proved, in the right half-plane, with these kneading sequences.
        data = self.swapped((1, 3), (29, 27))
        with tempfile.TemporaryDirectory() as directory:
            write_core(Path(directory), data, self.manifest)
            _manifest, records = crosscheck.read(Path(directory))
        checked = [crosscheck.check_centre(record) for record in records]
        self.assertEqual([problems for _proof, problems in checked], [[]] * len(records))
        lavaurs = crosscheck.lavaurs_pairs(5)
        self.assertEqual(crosscheck.check_collection(records, [proof for proof, _ in checked], lavaurs), [])
        # Only the ray proofs tell them apart.
        code, report = self.run_with_report(data)
        self.assertEqual(code, 1)
        self.assertEqual(
            report.splitlines(),
            [f"mi-p5-{lower}-{lower + 1}: its two dynamic rays were not proved to land together"
             for lower in (1, 3, 27, 29)]
            + ["cross-check FAILED: 4 problems"],
        )

    def test_the_disjointness_scan_sees_past_a_far_disk_with_unequal_radii(self) -> None:
        # Sorted by real part: A at 0 (radius 1), B at 3 (radius 1, far above), C at 4
        # (radius 4.5). B is too far right to meet A, but C, further right, does.
        def record(lower: int, upper: int, re: float, im: float) -> crosscheck.Record:
            return crosscheck.Record(3, lower, upper, re, im, 16, 0.0, 0.0, 1.0)

        def proof(rho: Fraction) -> crosscheck.Proof:
            return crosscheck.Proof(rho, Fraction(0), Fraction(0))

        records = [record(1, 2, 0.0, 0.0), record(3, 4, 3.0, 100.0), record(5, 6, 4.0, 0.0)]
        proofs = [proof(Fraction(1)), proof(Fraction(1)), proof(Fraction(9, 2))]
        problems = crosscheck.check_collection(records, proofs, crosscheck.lavaurs_pairs(3))
        self.assertEqual([p for p in problems if "meet" in p], ["period 3: two disks meet at 0.0+0.0i"])

    def test_the_refined_disk_lies_in_the_records_own_disk(self) -> None:
        values = RECORD.unpack_from(self.data, self.record_offset(5, 1))
        record = crosscheck.Record(*values)
        own = crosscheck.prove_root(record)
        re_value, im_value, radius = crosscheck.refined_disk(record)
        # The Decimals are the proved dyadic disk itself, not a rounding of it.
        for value in (re_value, im_value, radius):
            denominator = Fraction(value).denominator
            self.assertEqual(denominator & (denominator - 1), 0)
        slack = own.rho - Fraction(radius)
        self.assertGreater(slack, 0)
        gap = (Fraction(re_value) - Fraction(record.re)) ** 2 + (Fraction(im_value) - Fraction(record.im)) ** 2
        self.assertLessEqual(gap, slack**2)
        self.assertLess(radius, 1e-24)

    def test_rejects_a_refined_disk_outside_the_records_own_disk(self) -> None:
        values = RECORD.unpack_from(self.data, self.record_offset(5, 1))
        record = crosscheck.Record(*values)
        tiny = crosscheck.Proof(Fraction(1, 1 << 200), Fraction(0), Fraction(0))
        with mock.patch.object(crosscheck, "prove_root", return_value=tiny):
            with self.assertRaisesRegex(ValueError, "the record's own disk"):
                crosscheck.refined_disk(record)

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
        # Every import at any depth, every name in it, and no dynamic import at all.
        generator = {"generate_catalog", "generate_catalog_core", "catalog_certify", "catalog_combinatorics"}
        for name in ("crosscheck_catalog_core.py", "crosscheck_rays.py"):
            tree = ast.parse((ROOT / "tools" / name).read_text(encoding="utf-8"))
            imported: set[str] = set()
            for node in ast.walk(tree):
                if isinstance(node, ast.Import):
                    imported.update(alias.name.split(".")[0] for alias in node.names)
                elif isinstance(node, ast.ImportFrom):
                    imported.add((node.module or "").split(".")[0])
                    imported.update(alias.name for alias in node.names)
                elif isinstance(node, ast.Name) and node.id == "__import__":
                    imported.add(node.id)
            self.assertTrue(imported, name)
            self.assertFalse((generator | {"importlib", "__import__"}) & imported, name)


if __name__ == "__main__":
    unittest.main()
