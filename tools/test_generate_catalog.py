"""Tests for tools/generate_catalog.py (run: npm run catalog:test)."""

from __future__ import annotations

from decimal import Decimal
from pathlib import Path
import unittest

from catalog_combinatorics import lavaurs_pairs
from generate_catalog import (
    DEFAULT_CURATION,
    build_catalog,
    certified_centers,
    check_curation,
    label_for,
    load_curation,
    render,
    three_digits,
)

ROOT = Path(__file__).resolve().parent.parent


class BuildCatalogTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.curation = load_curation(ROOT / DEFAULT_CURATION)
        cls.catalog = build_catalog(4, 80, cls.curation)

    def test_ids_derive_from_the_rays(self) -> None:
        ids = [entry["id"] for entry in self.catalog["components"]]
        self.assertEqual(
            ids,
            [
                "mi-p1-0-1",
                "mi-p2-1-2",
                "mi-p3-3-4",
                "mi-p3-5-6",
                "mi-p3-1-2",
                "mi-p4-7-8",
                "mi-p4-6-9",
                "mi-p4-11-12",
                "mi-p4-3-4",
                "mi-p4-13-14",
                "mi-p4-1-2",
            ],
        )

    def test_every_entry_has_residual_method_and_provenance(self) -> None:
        for entry in self.catalog["components"]:
            self.assertIn(entry["method"], self.catalog["methods"])
            self.assertIn(entry["provenance"], self.catalog["provenance"])
            self.assertLess(entry["residual"]["orbitAbs"], 1e-14)
            self.assertLessEqual(entry["residual"]["centerError"], 2.3e-16)
            if entry["period"] > 1:
                self.assertGreater(entry["residual"]["properDivisorOrbitMinAbs"], 1e-3)

    def test_real_centres_are_exactly_real(self) -> None:
        airplane = next(e for e in self.catalog["components"] if e["id"] == "mi-p3-3-4")
        self.assertEqual(airplane["center"], {"re": -1.7548776662466927, "im": 0.0})

    def test_generation_is_deterministic(self) -> None:
        again = build_catalog(4, 80, self.curation)
        self.assertEqual(render(again), render(self.catalog))

    def test_uncurated_entries_get_generated_labels(self) -> None:
        catalog = build_catalog(4, 80, {})
        rabbit = next(e for e in catalog["components"] if e["id"] == "mi-p3-1-2")
        self.assertEqual(rabbit["label"], "Period 3, rays 1/7 and 2/7")
        self.assertEqual(rabbit["provenance"], "generated-label")
        self.assertNotIn("aliases", rabbit)
        self.assertNotIn("annotation", rabbit)

    def test_generated_labels_name_the_period_and_both_rays(self) -> None:
        self.assertEqual(label_for(4, 6, 9), "Period 4, rays 6/15 and 9/15")
        self.assertEqual(label_for(12, 1, 2), "Period 12, rays 1/4095 and 2/4095")

    def test_records_the_certified_method(self) -> None:
        self.assertEqual(list(self.catalog["methods"]), ["krawczyk-decimal-80"])
        self.assertIn("Krawczyk test", self.catalog["methods"]["krawczyk-decimal-80"])

    def test_curated_annotations_follow_the_label(self) -> None:
        rabbit = next(e for e in self.catalog["components"] if e["id"] == "mi-p3-1-2")
        self.assertEqual(list(rabbit)[:4], ["id", "aliases", "label", "annotation"])
        self.assertIn("Douady rabbit", rabbit["annotation"])
        period_four = next(e for e in self.catalog["components"] if e["id"] == "mi-p4-1-2")
        self.assertNotIn("annotation", period_four)


class CurationTest(unittest.TestCase):
    def components(self) -> list[dict[str, object]]:
        return [{"id": "mi-p1-0-1"}, {"id": "mi-p2-1-2"}]

    def test_rejects_an_unknown_id(self) -> None:
        with self.assertRaisesRegex(ValueError, "did not produce"):
            check_curation({"mi-p9-1-2": {"label": "x"}}, self.components())

    def test_rejects_an_alias_that_is_a_canonical_id(self) -> None:
        curation = {"mi-p1-0-1": {"label": "Main", "aliases": ["mi-p2-1-2"]}}
        with self.assertRaisesRegex(ValueError, "shaped like a canonical id"):
            check_curation(curation, self.components())

    def test_rejects_an_alias_shaped_like_a_future_canonical_id(self) -> None:
        curation = {"mi-p1-0-1": {"label": "Main", "aliases": ["mi-p5-1-2"]}}
        with self.assertRaisesRegex(ValueError, "shaped like a canonical id"):
            check_curation(curation, self.components())

    def test_rejects_a_repeated_alias(self) -> None:
        curation = {
            "mi-p1-0-1": {"label": "Main", "aliases": ["mi-old"]},
            "mi-p2-1-2": {"label": "Bulb", "aliases": ["mi-old"]},
        }
        with self.assertRaisesRegex(ValueError, "unique"):
            check_curation(curation, self.components())

    def test_rejects_a_malformed_annotation(self) -> None:
        for annotation, message in [
            ("", "empty"),
            (42, "non-text"),
            (" leading space", "white space"),
            ("two\nlines", "control characters"),
            ("x" * 281, "longer than 280"),
        ]:
            with self.subTest(annotation=annotation):
                curation = {"mi-p1-0-1": {"label": "Main", "annotation": annotation}}
                with self.assertRaisesRegex(ValueError, message):
                    check_curation(curation, self.components())

    def test_accepts_an_annotation_of_the_maximum_length(self) -> None:
        curation = {"mi-p1-0-1": {"label": "Main", "annotation": "x" * 280}}
        check_curation(curation, self.components())

    def test_rejects_an_empty_label(self) -> None:
        with self.assertRaisesRegex(ValueError, "label"):
            check_curation({"mi-p1-0-1": {"label": " "}}, self.components())

    def test_accepts_aliases_without_a_label(self) -> None:
        check_curation({"mi-p2-1-2": {"aliases": ["mi-old"]}}, self.components())

    def test_rejects_an_entry_with_neither_label_nor_aliases(self) -> None:
        with self.assertRaisesRegex(ValueError, "label or aliases"):
            check_curation({"mi-p2-1-2": {}}, self.components())

    def test_rejects_an_annotation_without_a_curated_label(self) -> None:
        curation = {"mi-p2-1-2": {"aliases": ["mi-old"], "annotation": "A note."}}
        with self.assertRaisesRegex(ValueError, "no curated label"):
            check_curation(curation, self.components())


class CertifiedCentersTest(unittest.TestCase):
    def test_every_pair_through_period_six_has_a_distinct_certified_centre(self) -> None:
        pairs = lavaurs_pairs(6)
        centers = certified_centers(6, 80, pairs)
        self.assertEqual([len(centers[p]) for p in range(1, 7)], [1, 1, 3, 6, 15, 27])
        for period in range(1, 7):
            self.assertEqual([pair for pair, _center in centers[period]], pairs[period])

    def test_a_curated_entry_with_aliases_only_gets_a_generated_label(self) -> None:
        catalog = build_catalog(4, 80, {"mi-p4-6-9": {"aliases": ["mi-p4-02"]}})
        entry = next(e for e in catalog["components"] if e["id"] == "mi-p4-6-9")
        self.assertEqual(entry["label"], "Period 4, rays 6/15 and 9/15")
        self.assertEqual(entry["provenance"], "curated-aliases")
        self.assertEqual(entry["aliases"], ["mi-p4-02"])


class ResidualFormatTest(unittest.TestCase):
    def test_three_significant_digits(self) -> None:
        self.assertEqual(three_digits(Decimal("2.0149e-16")), 2.01e-16)
        self.assertEqual(three_digits(Decimal(0)), 0.0)
        self.assertEqual(three_digits(Decimal("1.7548")), 1.75)


if __name__ == "__main__":
    unittest.main()
