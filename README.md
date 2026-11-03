# Nashik Kumbh Spend Monitor

Drill-down dashboard of government **administrative approvals** for the Nashik–Trimbakeshwar Simhastha Kumbh Mela 2026–27, scraped from
<https://divcomnashik.maharashtra.gov.in/en/administrative-approvals/>.

Drill path: **All spend → sector (or agency) → agency (or sector) → orders → order detail + source PDF.**

## Run
```bash
python3 scraper/scrape.py      # fetch site -> data/approvals.json + web/data.js
python3 -m http.server -d web  # or just open web/index.html
python3 -m unittest tests.test_scrape
```
No dependencies (Python stdlib, vanilla JS).

## Caveats
- Figures are **approved ceilings, not actual spend** — the page publishes no expenditure data.
- Revisions/corrigenda are excluded from totals (net change shown when the title discloses old and new amounts). Suspected duplicates are excluded unless toggled.
- Sector/agency come from keyword rules in `scraper/scrape.py`; fix mistakes in `data/overrides.json` (keyed by order id).
- Order PDFs are scanned images (no text layer). Work-level detail would need Marathi OCR — not done yet.
