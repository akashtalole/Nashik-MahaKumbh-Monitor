#!/usr/bin/env python3
"""Scrape Meeting Proceedings (minutes) from the Nashik Divisional Commissioner site.

Source: https://divcomnashik.maharashtra.gov.in/en/meeting-proceedings/
Output: data/meetings.json and web/meetings_data.js

Meeting date, forum, chair and topic come from the order title (reliable).
If `pdftotext` is installed and --text is passed, PDFs are downloaded and the
Marathi text layer is stored for search. It is lossy (some glyphs are dropped)
and scanned PDFs have no text at all.
"""
import argparse, hashlib, html, json, re, shutil, subprocess, sys, tempfile, time, urllib.request
from datetime import date, datetime, timezone
from pathlib import Path

URL = "https://divcomnashik.maharashtra.gov.in/en/meeting-proceedings/"
ROOT = Path(__file__).resolve().parent.parent
UA = {"User-Agent": "Mozilla/5.0 (NashikKumbhMonitor)"}

def fetch(url, tries=4, timeout=60):
    for n in range(tries):
        try:
            return urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=timeout).read()
        except Exception as e:  # the site/proxy occasionally resets connections
            if n == tries - 1:
                raise
            time.sleep(2 ** (n + 1))

def clean(s):
    return re.sub(r"\s+", " ", html.unescape(re.sub(r"<[^>]+>", " ", s))).strip()

CHAIRS = [
    ("Chief Minister", r"chief minister"),
    ("Chief Secretary", r"chief secretary"),
    ("Addl. Chief Secretary (Home)", r"additional chief secretary"),
    ("Chairman, NTKMA", r"chairman"),
    ("Divisional Commissioner", r"divisional commissioner"),
]
TOPICS = [
    ("Budget & Finance", r"budget|head of accounts"),
    ("Ghats & Godavari", r"ghat|godavari|flowing water"),
    ("Crowd, Traffic & Railways", r"crowd|traffic|railway"),
    ("Technology & CCTV", r"cctv|ai/ml|technology"),
    ("Quality Control", r"quality"),
    ("NMC / PWD Works", r"municipal corporation|public works"),
    ("Site Inspection", r"inspection"),
]

def first(rules, text, default):
    t = text.lower()
    for n, rx in rules:
        if re.search(rx, t):
            return n
    return default

def parse_title(title):
    dates = []
    for d, m, y in re.findall(r"(\d{2})/(\d{2})/(\d{4})", title):
        try:
            dates.append(date(int(y), int(m), int(d)).isoformat())
        except ValueError:
            pass
    chair_m = re.search(r"chairmanship of the hon[’'`.]?(?:ble)?\.? (.+?)(?:,? regarding|,? Government| under|$)", title, re.I)
    chair_txt = chair_m.group(1) if chair_m else ""
    reg = re.search(r"regarding (?:the )?(.+?)(?: under the chairmanship.*)?$", title, re.I)
    topic_txt = reg.group(1).strip(" .") if reg else None
    if topic_txt and re.fullmatch(r"simhastha kumbh mela 2027", topic_txt, re.I):
        topic_txt = None  # generic, not a real topic
    chair = first(CHAIRS, chair_txt, "Not stated") if chair_txt else "Not stated"
    if re.search(r"executive committee", title, re.I):
        forum = "Executive Committee (District)"
    elif re.search(r"kumbh mela authority", title, re.I):
        forum = "Kumbh Mela Authority (NTKMA)"
    else:
        forum = "Review / coordination meeting"
    return {
        "dates": dates,
        "date": dates[0] if dates else None,
        "forum": forum,
        "chair": chair,
        "topic": topic_txt,
        "topic_group": first(TOPICS, topic_txt or "", "General review"),
    }

def parse(page):
    seg = page[page.find('id="row-content"'):] if 'id="row-content"' in page else page
    out = []
    for url, raw in re.findall(r'<li><a href="([^"]+?\.pdf)"[^>]*>(.*?)</a>', seg, re.S):
        title = clean(raw)
        m = {"id": hashlib.sha1(url.encode()).hexdigest()[:10], "title": title, "pdf": url, **parse_title(title)}
        u = re.search(r"/uploads/(\d{4})/(\d{2})/", url)
        m["uploaded"] = f"{u.group(1)}-{u.group(2)}" if u else None
        m["flags"] = [] if m["date"] else ["No meeting date in title"]
        out.append(m)
    return out

def add_text(items, cache):
    if not shutil.which("pdftotext"):
        print("pdftotext not found – skipping text extraction", file=sys.stderr)
        return
    cache.mkdir(parents=True, exist_ok=True)
    for it in items:
        f = cache / (it["id"] + ".txt")
        if f.exists():
            txt = f.read_text(encoding="utf8")
        else:
            with tempfile.TemporaryDirectory() as td:
                p = Path(td) / "a.pdf"
                try:
                    p.write_bytes(fetch(it["pdf"], timeout=90))
                    txt = subprocess.run(["pdftotext", "-layout", str(p), "-"], capture_output=True, text=True).stdout
                except Exception as e:
                    print("  text fail", it["id"], e, file=sys.stderr)
                    continue
            f.write_text(txt, encoding="utf8")
        body = re.sub(r"DCNSK[^\n]*\n", " ", txt)          # strip file-number headers
        body = re.sub(r"\s+", " ", body).strip()
        it["has_text"] = len(body) > 200
        it["text_chars"] = len(body)
        it["text_excerpt"] = body[:1800] if it["has_text"] else ""
        it["search_text"] = body[:20000] if it["has_text"] else ""
        if not it["has_text"]:
            it["flags"].append("Scanned PDF – no text layer")

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--html")
    ap.add_argument("--text", action="store_true", help="download PDFs and extract text (needs pdftotext)")
    a = ap.parse_args()
    page = Path(a.html).read_text(encoding="utf8", errors="ignore") if a.html else fetch(URL).decode("utf8", "ignore")
    items = parse(page)
    if not items:
        sys.exit("No meetings parsed – site layout may have changed")
    if a.text:
        add_text(items, ROOT / "data" / "minutes_text")
    items.sort(key=lambda i: i["date"] or "0000", reverse=True)
    doc = {"source": URL, "scraped_at": datetime.now(timezone.utc).isoformat(timespec="seconds"), "count": len(items), "items": items}
    (ROOT / "data" / "meetings.json").write_text(json.dumps(doc, ensure_ascii=False, indent=1))
    (ROOT / "web" / "meetings_data.js").write_text("window.MEETINGS_DATA = " + json.dumps(doc, ensure_ascii=False) + ";\n")
    print(f"{len(items)} meetings, latest {items[0]['date']}, with text: {sum(1 for i in items if i.get('has_text'))}")

if __name__ == "__main__":
    main()
