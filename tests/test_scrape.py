import sys, unittest
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "scraper"))
from scrape import parse_amount, parse_works, is_revision, parse_old_amount

class T(unittest.TestCase):
    def test_amounts(self):
        self.assertEqual(parse_amount("... Total. AA Amount-Rs. 403.82 crore")[0], 403.82)
        self.assertEqual(parse_amount("approved amount of ₹116.69 crore")[0], 116.69)
        self.assertEqual(parse_amount("(Rs. 18 lakhs per month) ... Total AA Amount- Rs. 5.40 crore")[0], 5.40)
        self.assertEqual(parse_amount("Old Estimated Amount-15 Crores- Revised Estimated Amount- Rs. 36.00 Crores")[0], 36.0)
        self.assertIsNone(parse_amount("Revised Administrative Approval Order for Ozar Airport")[0])
    def test_works_and_revisions(self):
        self.assertEqual(parse_works("Total works-21- Total"), 21)
        self.assertEqual(parse_works("Nashik Municipal Corporation -(01 work) – Amount"), 1)
        self.assertTrue(is_revision("Revised Administrative Approval Order"))
        self.assertFalse(is_revision("Revised for 02 Works and Administrative Approval for 02 New Works"))
        self.assertEqual(parse_old_amount("revising the previously approved amount of ₹3.50 crore to ₹4.50 crore"), 3.5)

if __name__ == "__main__":
    unittest.main()
