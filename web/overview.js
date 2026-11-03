(function () {
  const D = window.KUMBH_DATA, M = window.MEETINGS_DATA, K = window.Kumbh;
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const attr = (html) => html.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const tip = (...parts) => attr(parts.map((p, i) => (i === 0 ? "<b>" + esc(p) + "</b>" : esc(p))).join("<br>"));
  const cr = (v, d = 0) => "₹" + v.toLocaleString("en-IN", { minimumFractionDigits: d, maximumFractionDigits: d }) + " cr";
  const pct = (v, t) => ((v / t) * 100).toFixed(v / t < 0.1 ? 1 : 0) + "%";
  const sum = (a) => a.reduce((s, x) => s + x, 0);
  const median = (a) => { const s = [...a].sort((x, y) => x - y), h = s.length >> 1; return s.length % 2 ? s[h] : (s[h - 1] + s[h]) / 2; };

  // ---- shared tooltip (any element with data-tip) ----
  const tp = $("tip");
  document.addEventListener("pointermove", (e) => {
    const t = e.target.closest && e.target.closest("[data-tip]");
    if (!t) { tp.hidden = true; return; }
    tp.innerHTML = t.dataset.tip; tp.hidden = false;
    const w = tp.offsetWidth, h = tp.offsetHeight;
    let x = e.clientX + 14, y = e.clientY + 16;
    if (x + w > innerWidth - 8) x = e.clientX - w - 14;
    if (y + h > innerHeight - 8) y = e.clientY - h - 14;
    tp.style.transform = `translate(${x}px,${y}px)`;
  });
  document.addEventListener("scroll", () => (tp.hidden = true), true);

  // ---- helpers ----
  function short(t) {
    const r = short0(t);
    if (r.length >= 12) return r;
    // title is mostly boilerplate: keep the part that names who/what
    return t.replace(/^administrative approval order[\s\-–:]*/i, "").replace(/nashik[ –-]*trimbakeshwar (simhastha )?kumbh mela( 2026[-–]27)?\s*[–-]?\s*/i, "")
      .replace(/[–-]?\s*\(?q?\.?\s*(hon\.|aa)?\s*amount.*$/i, "").replace(/\s+/g, " ").trim().replace(/^./, (c) => c.toUpperCase());
  }
  function short0(t) {
    return t.replace(/^nashik[ –-]*trimbakeshwar (simhastha )?kumbh mela( for)?\s*/i, "").replace(/^(administrative approval( order)?( has been accorded)? (for|of)\s+)/i, "")
      .replace(/\s*[–-]\s*(administrative approval order|total works?|total\.?\s*(aa|q\.)).*$/i, "")
      .replace(/\s*(total works?|total\.?\s*(aa|q\.)\s*amount|aa amount|administrative approval order).*$/i, "")
      .replace(/ for (the )?nashik[ –-]*trimbakeshwar (simhastha )?kumbh mela.*$/i, "")
      .replace(/\s+/g, " ").trim().replace(/^./, (c) => c.toUpperCase());
  }
  const shortAgency = (a) => ({ "Nashik Municipal Corporation": "NMC", "Kumbh Mela Authority (NTKMA)": "NTKMA", "Not stated in title": "Not stated",
    "Police – Nashik City": "Police (City)", "Police – Nashik Rural": "Police (Rural)", "MSEDCL (Mahavitaran)": "MSEDCL", "Info & Publicity (DIO)": "Info & Publicity",
    "Water Resources Dept": "Water Res.", "Trimbak Municipality": "Trimbak Muni.", "Shirdi Municipality": "Shirdi Muni." }[a] || a);
  const groupSum = (items, key) => {
    const g = {}; items.forEach((i) => { const r = (g[i[key]] = g[i[key]] || { v: 0, n: 0, w: 0 }); r.v += i.amount_cr; r.n++; r.w += i.works || 0; });
    return Object.entries(g).sort((a, b) => b[1].v - a[1].v);
  };
  function bars(el, rows, total, onClick, opts = {}) {
    const max = rows[0] ? rows[0][1].v : 1;
    el.innerHTML = rows.map(([k, r], i) => `<button class="row${opts.wide ? " wide" : ""}" data-i="${i}">
      <span class="n">${esc(opts.label ? opts.label(k, r) : k)}<small>${opts.sub ? esc(opts.sub(k, r)) : `${r.n} order${r.n > 1 ? "s" : ""}${r.w ? " · " + r.w + " works" : ""}`}</small></span>
      <span class="track"><span class="fill" style="width:${(r.v / max) * 100}%"></span></span>
      <span class="a">${cr(r.v)}<small>${pct(r.v, total)}</small></span></button>`).join("");
    el.querySelectorAll(".row").forEach((b) => (b.onclick = () => onClick(rows[+b.dataset.i][0], rows[+b.dataset.i][1])));
  }

  function render() {
    const c = D.items.filter(K.isCounted);
    const total = sum(c.map((i) => i.amount_cr));
    const works = sum(c.map((i) => i.works || 0));
    const sectors = groupSum(c, "sector"), agencies = groupSum(c, "agency");
    const amounts = c.map((i) => i.amount_cr);
    const sorted = [...c].sort((a, b) => b.amount_cr - a.amount_cr);

    // ---- hero ----
    $("hero").innerHTML = `
      <div><div class="eyebrow">Total administrative approvals · Simhastha Kumbh 2026–27</div>
        <div class="num">${cr(total).replace(" cr", "")}<small>crore</small></div>
        <div class="eq">≈ ₹${(total / 100).toFixed(0)} billion across ${c.length} approval orders</div></div>
      <div class="hero-stats">
        <div><b>${c.length}</b><span>orders counted</span></div>
        <div><b>${works}</b><span>works (where stated)</span></div>
        <div><b>${sectors.length}</b><span>sectors</span></div>
        <div><b>${agencies.filter((a) => a[0] !== "Not stated in title").length}</b><span>named agencies</span></div>
        <div><b>${(D.net_revisions_cr >= 0 ? "+" : "") + cr(D.net_revisions_cr, 2).replace("₹", "₹")}</b><span>net disclosed revisions</span></div>
        <div><b>${M.count}</b><span>meeting minutes</span></div>
      </div>`;

    // ---- insights (all computed) ----
    const ring = c.filter((i) => /ring road/i.test(i.title)), ringV = sum(ring.map((i) => i.amount_cr));
    const top5 = sum(sorted.slice(0, 5).map((i) => i.amount_cr));
    const namedAg = agencies.filter((a) => a[0] !== "Not stated in title")[0];
    const notStated = agencies.find((a) => a[0] === "Not stated in title");
    $("insights").innerHTML = [
      [pct(ringV, total), `of all approvals relate to the Nashik Ring Road (${cr(ringV)} across ${ring.length} orders, incl. land acquisition).`],
      [pct(top5, total), `sits in just 5 orders — the largest is ${cr(sorted[0].amount_cr)}.`],
      [cr(median(amounts), 1), `is the median order, vs a mean of ${cr(total / c.length, 1)} — a few very large orders skew the total.`],
      [namedAg ? pct(namedAg[1].v, total) : "–", namedAg ? `goes through ${namedAg[0]}, the largest named implementing agency.` : ""],
      [notStated ? pct(notStated[1].v, total) : "0%", "of approved value has no implementing agency stated in the order title."],
    ].map(([b, t]) => `<div class="insight"><div class="big">${b}</div><p>${esc(t)}</p></div>`).join("");

    // ---- ranked bars ----
    bars($("ovSectors"), sectors, total, (k) => { location.hash = "#spend"; K.drill("sector", [k]); });
    bars($("ovAgencies"), agencies.slice(0, 10), total, (k) => { location.hash = "#spend"; K.drill("agency", [k]); });
    $("ovAgencyGo").onclick = () => { location.hash = "#spend"; K.drill("agency", []); };
    const topRows = sorted.slice(0, 10).map((i) => [i.id, { v: i.amount_cr, n: 1, w: i.works || 0, i }]);
    bars($("ovTop"), topRows, total, (id) => K.openOrder(id), {
      wide: true, label: (id, r) => short(r.i.title).slice(0, 120), sub: (id, r) => `${r.i.sector} · ${r.i.agency}` });

    cumulative(c); sizes(c, total); heat(c); meetings(); quality(c, total, sectors, agencies);
  }

  // ---- cumulative line (SVG) ----
  function cumulative(c) {
    const by = {}; c.forEach((i) => { const k = i.uploaded || "?"; by[k] = (by[k] || 0) + i.amount_cr; });
    const keys = Object.keys(by).sort(); let run = 0;
    const pts = keys.map((k) => ({ k, add: by[k], cum: (run += by[k]) }));
    const W = 560, H = 230, L = 52, R = 70, T = 16, B = 30, max = run;
    const nice = Math.ceil(max / 5000) * 5000;
    const x = (i) => L + (pts.length === 1 ? (W - L - R) / 2 : (i * (W - L - R)) / (pts.length - 1));
    const y = (v) => T + (1 - v / nice) * (H - T - B);
    const grid = [0, 0.25, 0.5, 0.75, 1].map((f) => `<line class="grid" x1="${L}" x2="${W - R}" y1="${y(nice * f)}" y2="${y(nice * f)}"/><text x="${L - 8}" y="${y(nice * f) + 4}" text-anchor="end">${(nice * f).toLocaleString("en-IN")}</text>`).join("");
    const line = pts.map((p, i) => `${i ? "L" : "M"}${x(i)},${y(p.cum)}`).join("");
    const area = `${line}L${x(pts.length - 1)},${y(0)}L${x(0)},${y(0)}Z`;
    const colW = pts.length > 1 ? (W - L - R) / (pts.length - 1) : 80;
    $("ovCum").innerHTML = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Cumulative approvals by month">${grid}
      <path class="ar" d="${area}"/><path class="ln" d="${line}"/>
      ${pts.map((p, i) => `<rect class="hit" x="${x(i) - colW / 2}" y="${T}" width="${colW}" height="${H - T - B}" data-tip="${tip(p.k, "Added: " + cr(p.add), "Cumulative: " + cr(p.cum))}"/><circle class="dot" cx="${x(i)}" cy="${y(p.cum)}" r="5" pointer-events="none"/><text x="${x(i)}" y="${H - 8}" text-anchor="middle">${p.k}</text>`).join("")}
      <text class="vl" x="${x(pts.length - 1) + 10}" y="${y(max) + 4}">${cr(max)}</text></svg>`;
  }

  // ---- order size bands ----
  function sizes(c, total) {
    const bands = [["< ₹1 cr", 0, 1], ["₹1–10", 1, 10], ["₹10–50", 10, 50], ["₹50–250", 50, 250], ["₹250–1,000", 250, 1000], ["₹1,000+", 1000, 1e9]];
    const rows = bands.map(([l, lo, hi]) => { const it = c.filter((i) => i.amount_cr >= lo && i.amount_cr < hi); return { l, n: it.length, v: sum(it.map((i) => i.amount_cr)) }; });
    const max = Math.max(...rows.map((r) => r.v));
    $("ovSize").innerHTML = rows.map((r) => `<div class="mcol" data-tip="${tip(r.l + " cr", cr(r.v) + " · " + pct(r.v, total) + " of value", r.n + " order" + (r.n === 1 ? "" : "s"))}"><b>${r.v ? cr(r.v, r.v < 10 ? 1 : 0).replace("₹", "").replace(" cr", "") : ""}</b><div class="b" style="height:${(r.v / max) * 100}%"></div><span>${r.l}<br>${r.n} orders</span></div>`).join("");
  }

  // ---- sector x agency heatmap ----
  function heat(c) {
    const secs = groupSum(c, "sector").slice(0, 9).map((r) => r[0]);
    const ags = groupSum(c, "agency").slice(0, 8).map((r) => r[0]);
    const cell = {}; let max = 0;
    c.forEach((i) => { if (!secs.includes(i.sector)) return; const a = ags.includes(i.agency) ? i.agency : "Others"; const k = i.sector + "|" + a; cell[k] = (cell[k] || 0) + i.amount_cr; max = Math.max(max, cell[k]); });
    const cols = [...ags, "Others"];
    let h = `<div class="hm" style="grid-template-columns:170px repeat(${cols.length},minmax(52px,1fr))"><div></div>` + cols.map((a) => `<div class="ch">${esc(shortAgency(a))}</div>`).join("");
    secs.forEach((s) => {
      h += `<div class="rh">${esc(s)}</div>`;
      cols.forEach((a) => {
        const v = cell[s + "|" + a];
        if (!v) { h += `<div class="c z"></div>`; return; }
        const p = 8 + 92 * Math.sqrt(v / max);
        h += `<button class="c ${p > 52 ? "dk" : ""}" style="background:color-mix(in srgb,var(--seq) ${p.toFixed(0)}%,var(--surface))" data-s="${esc(s)}" data-a="${esc(a)}" data-tip="${tip(s, a, cr(v, 1))}">${v >= 10 ? Math.round(v).toLocaleString("en-IN") : v.toFixed(1)}</button>`;
      });
    });
    $("ovHeat").innerHTML = h + "</div>";
    $("ovHeat").querySelectorAll("button.c").forEach((b) => (b.onclick = () => {
      location.hash = "#spend";
      b.dataset.a === "Others" ? K.drill("sector", [b.dataset.s]) : K.drill("sector", [b.dataset.s, b.dataset.a]);
    }));
  }

  // ---- meetings snapshot ----
  function meetings() {
    const dated = M.items.filter((i) => i.date), latest = dated[0];
    const days = Math.floor((Date.now() - new Date(latest.date)) / 864e5);
    const cut = (n) => new Date(Date.now() - n * 864e5).toISOString().slice(0, 10);
    const r90 = dated.filter((i) => i.date >= cut(90)).length;
    const authority = M.items.filter((i) => i.forum.startsWith("Kumbh Mela Authority")).length;
    const by = {}; dated.forEach((i) => (by[i.date.slice(0, 7)] = (by[i.date.slice(0, 7)] || 0) + 1));
    const ks = Object.keys(by).sort().slice(-12), mx = Math.max(...ks.map((k) => by[k]));
    $("ovMeet").innerHTML = `
      <div class="kpis" style="grid-template-columns:repeat(3,1fr);margin-bottom:14px">
        <div class="kpi"><div class="l">Minutes</div><div class="v">${M.count}</div></div>
        <div class="kpi"><div class="l">Last 90 days</div><div class="v">${r90}</div></div>
        <div class="kpi"><div class="l">Latest</div><div class="v" style="font-size:17px;line-height:2">${days}d ago</div><div class="s">${latest.date}</div></div>
      </div>
      <div class="months" style="height:110px">${ks.map((k) => `<div class="mcol" data-tip="${tip(k, by[k] + " meeting" + (by[k] > 1 ? "s" : ""))}"><div class="b" style="height:${(by[k] / mx) * 100}%"></div><span>${k.slice(5)}</span></div>`).join("")}</div>
      <p class="hint">Meetings per month, last ${ks.length} active months · ${authority} Authority-level meetings</p>`;
  }

  // ---- data quality ----
  function quality(c, total, sectors, agencies) {
    const noAmt = D.items.filter((i) => i.amount_cr == null).length;
    const revs = D.items.filter((i) => i.is_revision).length;
    const dups = D.items.filter((i) => i.possible_duplicate).length;
    const unc = sectors.find((s) => s[0] === "Unclassified"), ns = agencies.find((s) => s[0] === "Not stated in title");
    const scanned = M.items.filter((i) => i.has_text === false).length;
    const noChair = M.items.filter((i) => i.chair === "Not stated").length;
    const row = (l, n, of, note) => `<div><span>${l}</span><b>${n} / ${of}</b><span class="track"><span class="fill" style="width:${Math.min(100, (n / of) * 100)}%"></span></span><small>${note}</small></div>`;
    $("ovDq").innerHTML =
      row("Orders with no amount in title", noAmt, D.count, "Mostly revisions/corrigenda — read the PDF") +
      row("Revision / corrigendum orders", revs, D.count, "Excluded from totals") +
      row("Suspected duplicate orders", dups, D.count, "Same amount and works as another order") +
      row("Value with agency not stated", Math.round(ns ? ns[1].v : 0), Math.round(total), "₹ crore, inferred from titles") +
      row("Value in unclassified sector", Math.round(unc ? unc[1].v : 0), Math.round(total), "₹ crore, titles lack detail") +
      row("Minutes with no named chair", noChair, M.count, "Chair is only read from the title") +
      row("Minutes that are scanned images", scanned, M.count, "No text search possible");
  }

  K.subs.push(render);
  render();
})();
