#!/usr/bin/env python3
"""Scrape Administrative Approvals from the Nashik Divisional Commissioner site.

Source: https://divcomnashik.maharashtra.gov.in/en/administrative-approvals/
Stdlib only. Output: data/approvals.json and web/data.js (for file:// use).

Usage:
    python3 scraper/scrape.py            # fetch live
    python3 scraper/scrape.py --html saved.html   # parse a saved copy
"""
import argparse, difflib, hashlib, html, json, re, sys, urllib.request
from datetime import datetime, timezone
from pathlib import Path

URL = "https://divcomnashik.maharashtra.gov.in/en/administrative-approvals/"
ROOT = Path(__file__).resolve().parent.parent

# ---------- classification rules (first match wins) ----------
SECTORS = [
    ("Land Acquisition", r"land acquisition"),
    ("Ring Road & Airport", r"ring road|airport|ozar|terminal building"),
    ("Police & Security", r"police|cctv|crowd control|traffic warden|command and control|iccc"),
    ("Fire & Disaster", r"fire fighting|disaster"),
    ("Health", r"hospital|health"),
    ("Power & Electrical", r"electric|substation|mahavitaran|msedcl|electrification"),
    ("Water, Sewage & Dams", r"water|sewage|sewerage|rubber dam|pumping|reservoir|protective wall"),
    ("Ghats, Temples & Tirth", r"ghat|temple|tank|archaeolog|flagpole|tirth|darshan path|pradikshan|nature tourism"),
    ("Akhadas & Sadhugram", r"akhara|akhada|ashram"),
    ("Roads & Bridges", r"road|bridge"),
    ("Bus Stands & Transport", r"bus stand|transport|mobility|st\)"),
    ("Tech, Media & Publicity", r"portal|information and technology|technology|network|media|publicity|branding|promotion"),
    ("Admin, Consultancy & Training", r"office|consult|expert|training|volunteer|rent|survey|quality and control|authority|new administrative building"),
]
AGENCIES = [
    ("Nashik Municipal Corporation", r"nashik municipal corporation|\bnmc\b"),
    ("MSIDC", r"maharashtra state infrastructure development corporation"),
    ("MSEDCL (Mahavitaran)", r"msedcl|mahavitaran|electricity distribution"),
    ("MSRTC (ST)", r"msrtc|road transport corporation|\(st\)|bus stand"),
    ("Police – Nashik City", r"commissioner of police|nashik city police|nashik city police personnel"),
    ("Police – Nashik Rural", r"superintendent of police|nashik rural"),
    ("Water Resources Dept", r"water resources"),
    ("Health Department", r"health department|hospital"),
    ("Archaeology Dept", r"archaeolog"),
    ("Forest Dept", r"forest department"),
    ("Trimbak Municipality", r"trimbak municipality|trimbakeshwar nagar parishad|chief officer, trimbak"),
    ("Shirdi Municipality", r"shirdi"),
    ("PWD", r"public works department|\bpwd\b|r\.h\.o|sangamner wadgaon"),
    ("Info & Publicity (DIO)", r"district information officer|publicity"),
    ("Kumbh Mela Authority (NTKMA)", r"kumbh mela authority|ntkma|iim|iit bombay|consult|web portal|creative media|training|volunteer|disaster management|subject matter"),
    ("Resident Deputy Collector", r"resident deputy collector"),
]

# Location is matched AFTER removing the event name, which itself contains "Nashik-Trimbakeshwar".
LOCATIONS = [
    ("Nashik Ring Road", r"ring road"),
    ("Ozar (HAL airport)", r"ozar|hindustan aeronautics"),
    ("Shirdi", r"shirdi"),
    ("Ahilyanagar district", r"ahilyanagar|sangamner"),
    ("Saptashrungi Gad", r"saptashrung"),
    ("Trimbakeshwar", r"trimbak|brahmagiri|anjaneri|kavanai|kavnai|beje|taked|kushavarta"),
    ("Nashik city", r"nashik municipal corporation|nashik city|nashik ?road|panchavati|tapovan|godavari|ramkund|nandur|dasak|gangapur|chandshi|jalalpur|naroshankar|odha|takli|navshya|anandavalli|nashik"),
]
EVENT_RX = re.compile(r"nashik[\s–-]*trimbakeshwar[\s–-]*(simhastha[\s–-]*)?(kumbh[\s–-]*mela)?(\s*authority)?(\s*2027|\s*2026[–-]27)?|simhastha|kumbh mela( authority)?", re.I)

def locate(title):
    t = EVENT_RX.sub(" ", title)
    return classify(LOCATIONS, t, "Not stated in title")

def classify(rules, text, default):
    t = text.lower()
    for name, rx in rules:
        if re.search(rx, t):
            return name
    return default

# ---------- amount parsing ----------
NUM = r"(\d[\d,]*(?:\.\d+)?)"
AMT_RX = re.compile(r"(?:rs\.?|₹)\s*" + NUM + r"\s*(crores?|lakhs?)?", re.I)

def parse_amount(title):
    """Return (crore, kind). kind: 'stated'|'monthly'|None. Last amount wins
    for 'revised from X to Y'; otherwise the amount following 'Amount' wins."""
    t = re.sub(r"\s+", " ", title)
    m_amt = None
    # amount that follows an "Amount"/"Cost" label is the order total
    for m in re.finditer(r"(?:amount|cost|q\.? ?(?:hon\.|ma)? ?amo\w*)\s*[:\-–]*\s*(?:rs\.?|₹)\s*" + NUM + r"\s*(crores?|lakhs?)?", t, re.I):
        m_amt = m
    cands = [m_amt] if m_amt else list(AMT_RX.finditer(t))
    cands = [c for c in cands if c]
    if not cands:
        return None, None
    m = cands[-1]
    v = float(m.group(1).replace(",", ""))
    unit = (m.group(2) or "crore").lower()
    if unit.startswith("lakh"):
        v /= 100
    return round(v, 6), "stated"

OLD_RX = [
    re.compile(r"old estimated amount\s*[-–:]*\s*(?:rs\.?|₹)?\s*" + NUM + r"\s*(crores?|lakhs?)?", re.I),
    re.compile(r"from\s*(?:rs\.?|₹)\s*" + NUM + r"\s*(crores?|lakhs?)?\s*to", re.I),
    re.compile(r"previously approved amount of\s*(?:rs\.?|₹)\s*" + NUM + r"\s*(crores?|lakhs?)?", re.I),
]

def parse_old_amount(title):
    for rx in OLD_RX:
        m = rx.search(title)
        if m:
            v = float(m.group(1).replace(",", ""))
            return round(v / 100 if (m.group(2) or "").lower().startswith("lakh") else v, 6)
    return None

def parse_works(title):
    m = re.search(r"(?:total\s*works?|works?)\s*[-–:]?\s*\(?(\d{1,3})\)?", title, re.I) \
        or re.search(r"\((\d{1,3})\s*works?\)", title, re.I) \
        or re.search(r"\((\d{1,3})\s*work\)", title, re.I)
    return int(m.group(1)) if m else None

def is_revision(title):
    """Pure revision/corrigendum. Orders that ALSO approve new works are mixed, not revisions."""
    if re.search(r"\bnew works?\b", title, re.I):
        return False
    return bool(re.search(r"revised|corrigendum|changed from", title, re.I))

def clean(s):
    s = re.sub(r"<[^>]+>", " ", s)
    return re.sub(r"\s+", " ", html.unescape(s)).strip()

def parse(page):
    start = page.find('id="row-content"')
    seg = page[start:] if start >= 0 else page
    rows = re.findall(r'<li><a href="([^"]+?)">(.*?)<span class="icon-pdf', seg, re.S)
    out = []
    for i, (url, raw) in enumerate(rows, 1):
        title = clean(raw)
        amt, kind = parse_amount(title)
        ym = re.search(r"/uploads/(\d{4})/(\d{2})/", url)
        out.append({
            "id": hashlib.sha1(url.encode()).hexdigest()[:10],
            "seq": i,  # position on page (site lists newest first)
            "title": title,
            "pdf": url,
            "uploaded": f"{ym.group(1)}-{ym.group(2)}" if ym else None,
            "amount_cr": amt,
            "amount_kind": kind,
            "works": parse_works(title),
            "is_revision": is_revision(title),
            "old_amount_cr": parse_old_amount(title),
            "sector": classify(SECTORS, title, "Unclassified"),
            "agency": classify(AGENCIES, title, "Not stated in title"),
            "location": locate(title),
            "flags": [],
        })
    return out

def apply_overrides(items):
    p = ROOT / "data" / "overrides.json"
    if not p.exists():
        return
    ov = json.loads(p.read_text())
    for it in items:
        o = ov.get(it["id"])
        if o:
            it.update({k: v for k, v in o.items() if k != "note"})
            if o.get("note"):
                it["flags"].append("override: " + o["note"])

def annotate(items):
    # Orders without a parseable amount
    for it in items:
        if it["amount_cr"] is None:
            it["flags"].append("No amount in title – see PDF")
        if it["is_revision"]:
            it["flags"].append("Revision/corrigendum – restates an earlier approval, excluded from totals")
            if it["amount_cr"] is not None and it["old_amount_cr"] is not None:
                it["delta_cr"] = round(it["amount_cr"] - it["old_amount_cr"], 6)
        elif re.search(r"\brevised\b", it["title"], re.I):
            it["flags"].append("Mixed order: revises some works and approves new ones – may partly double count")
    # Suspected duplicates: same amount + same works count + same sector
    seen = {}
    for it in items:
        if it["amount_cr"] is None or it["is_revision"]:
            continue
        k = (it["amount_cr"], it["works"])
        prev = seen.get(k)
        sim = difflib.SequenceMatcher(None, prev["title"].lower(), it["title"].lower()).ratio() if prev else 0
        # identical amount AND identical multi-work count is very unlikely by chance
        if prev and (sim > 0.6 or (it["works"] or 0) >= 5):
            it["flags"].append(f"Possible duplicate of order #{prev['seq']} (same amount, works and similar title)")
            it["possible_duplicate"] = True
        else:
            seen[k] = it

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--html", help="parse a saved HTML file instead of fetching")
    a = ap.parse_args()
    if a.html:
        page = Path(a.html).read_text(encoding="utf8", errors="ignore")
    else:
        req = urllib.request.Request(URL, headers={"User-Agent": "Mozilla/5.0 (NashikKumbhMonitor)"})
        page = urllib.request.urlopen(req, timeout=60).read().decode("utf8", "ignore")
    items = parse(page)
    if not items:
        sys.exit("No approvals parsed – site layout may have changed")
    apply_overrides(items)
    annotate(items)
    counted = [i for i in items if i["amount_cr"] and not i["is_revision"]]
    doc = {
        "source": URL,
        "scraped_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "count": len(items),
        "total_cr": round(sum(i["amount_cr"] for i in counted), 4),
        "net_revisions_cr": round(sum(i.get("delta_cr", 0) for i in items), 4),
        "items": items,
    }
    (ROOT / "data").mkdir(exist_ok=True)
    (ROOT / "data" / "approvals.json").write_text(json.dumps(doc, ensure_ascii=False, indent=1))
    (ROOT / "web" / "data.js").write_text("window.KUMBH_DATA = " + json.dumps(doc, ensure_ascii=False) + ";\n")
    print(f"{len(items)} orders, {len(counted)} counted, total ₹{doc['total_cr']:,.2f} cr")

if __name__ == "__main__":
    main()
