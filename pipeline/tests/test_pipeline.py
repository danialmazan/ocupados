import copy
import unittest
from pipeline.build import ROOT, RAW, read, build, parse_ine, validate_taxonomy


class PipelineTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.data, cls.audit = build(check=True)

    def test_official_totals_and_reconciliation(self):
        self.assertEqual(self.data["totals"]["2018"]["persons"], 19327700)
        self.assertEqual(self.data["totals"]["2025"]["persons"], 22221100)
        self.assertEqual(self.audit["observationCount"], 630)
        for result in self.data["reconciliation"].values():
            self.assertLessEqual(abs(result["difference"]), result["roundingBound"])

    def test_no_imputed_division_98(self):
        self.assertEqual(self.audit["unavailableIneDivisions"], [{"code": "98", "years": list(range(2025, 2007, -1))}])
        self.assertEqual(next(s for s in self.data["sectors"] if s["id"] == "households")["sourceTerms"], ["T"])

    def test_duplicate_or_missing_activity_fails(self):
        tax = read(ROOT / "data" / "taxonomy.json")
        codes = set(c for s in tax["sectors"] for c in s["codes"])
        bad = copy.deepcopy(tax)
        bad["sectors"][1]["codes"].append("01")
        with self.assertRaises(AssertionError):
            validate_taxonomy(bad, codes)
        with self.assertRaises(AssertionError):
            validate_taxonomy(tax, codes | {"04"})

    def test_quarterly_data_rejected(self):
        source = next(s for s in read(RAW / "manifest.json")["sources"] if s["id"] == "ine-65985")
        raw = read(RAW / source["file"])
        raw[0]["Data"][0]["T3_Periodo"] = "T4"
        with self.assertRaises(AssertionError):
            parse_ine(raw)

    def test_default_contribution_difference_is_preserved(self):
        changes = [v["2025"]["persons"] - v["2018"]["persons"] for v in self.data["employment"].values()]
        increases = sum(max(0, v) for v in changes)
        decreases = sum(max(0, -v) for v in changes)
        self.assertEqual((increases, decreases), (3010300, 116500))
        self.assertEqual(2893400 - (increases - decreases), -400)


if __name__ == "__main__":
    unittest.main()
