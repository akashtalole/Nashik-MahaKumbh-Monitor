(function () {
  const D = window.KUMBH_DATA;
  const K = (window.Kumbh = { subs: [] });
  const $ = (id) => document.getElementById(id);
  const fmt = (v, d = 2) => "₹" + v.toLocaleString("en-IN", { minimumFractionDigits: d, maximumFractionDigits: d }) + " cr";
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const DIM = { sector: "Sector", agency: "Implementing agency", location: "Location" };

  // state: group = first-level dimension; path = [value at level1, value at level2]
  const S = { group: "sector", path: [], dup: false };
  const other = () => (S.group === "sector" ? "agency" : "sector");  // location/agency -> sector

  const isCounted = (i) => i.amount_cr != null && !i.is_revision && (S.dup || !i.possible_duplicate);

  function scoped() {
    // items matching the current drill path (revisions included for leaf lists)
    let it = D.items;
    if (S.path[0] != null) it = it.filter((i) => i[S.group] === S.path[0]);
    if (S.path[1] != null) it = it.filter((i) => i[other()] === S.path[1]);
    return it;
  }

  function renderKpis() {
    const c = D.items.filter(isCounted);
    const total = c.reduce((s, i) => s + i.amount_cr, 0);
    const works = c.reduce((s, i) => s + (i.works || 0), 0);
    const bySector = {};
    c.forEach((i) => (bySector[i.sector] = (bySector[i.sector] || 0) + i.amount_cr));
    const top = Object.entries(bySector).sort((a, b) => b[1] - a[1])[0];
    const revs = D.items.filter((i) => i.is_revision).length;
    const nofig = D.items.filter((i) => i.amount_cr == null).length;
    $("kpis").innerHTML = [
      ["Total approved", fmt(total, 0), `${c.length} orders counted`],
      ["Works (where stated)", works.toLocaleString("en-IN"), "sum of work counts in titles"],
      ["Largest sector", esc(top[0]), `${fmt(top[1], 0)} · ${((top[1] / total) * 100).toFixed(0)}% of total`],
      ["Net revisions", (D.net_revisions_cr >= 0 ? "+" : "") + fmt(D.net_revisions_cr), `${revs} revision orders · disclosed deltas only`],
      ["Needs PDF check", String(nofig), "orders with no amount in title"],
    ].map(([l, v, s]) => `<div class="kpi"><div class="l">${l}</div><div class="v">${v}</div><div class="s">${s}</div></div>`).join("");
    $("meta").innerHTML = `Source: <a href="${D.source}" target="_blank" rel="noopener">divcomnashik.maharashtra.gov.in</a> · Scraped ${new Date(D.scraped_at).toLocaleString("en-IN")} · ${D.count} orders`;
  }

  function renderCrumbs() {
    const parts = [{ label: "All spend", depth: 0 }];
    if (S.path[0] != null) parts.push({ label: S.path[0], depth: 1 });
    if (S.path[1] != null) parts.push({ label: S.path[1], depth: 2 });
    $("crumbs").innerHTML = parts.map((p, i) => {
      const last = i === parts.length - 1;
      return (i ? '<span class="sep">›</span>' : "") + (last ? `<span class="cur">${esc(p.label)}</span>` : `<button data-d="${p.depth}">${esc(p.label)}</button>`);
    }).join("");
    $("crumbs").querySelectorAll("button").forEach((b) => (b.onclick = () => { S.path = S.path.slice(0, +b.dataset.d); render(); }));
  }

  function renderChart() {
    const depth = S.path.length;
    const dim = depth === 0 ? S.group : depth === 1 ? other() : null;
    const chart = $("chart");
    if (!dim) { chart.innerHTML = ""; $("hint").textContent = "Showing individual orders below. Click an order for details and the source PDF."; return; }
    const c = scoped().filter(isCounted);
    const total = c.reduce((s, i) => s + i.amount_cr, 0);
    const g = {};
    c.forEach((i) => { const k = i[dim]; (g[k] = g[k] || { v: 0, n: 0, w: 0 }); g[k].v += i.amount_cr; g[k].n++; g[k].w += i.works || 0; });
    const rows = Object.entries(g).sort((a, b) => b[1].v - a[1].v);
    const max = rows.length ? rows[0][1].v : 1;
    $("hint").textContent = depth === 0
      ? `Click a ${DIM[dim].toLowerCase()} to drill down by ${DIM[other()].toLowerCase()}.`
      : `${DIM[dim]} breakdown inside “${S.path[0]}”. Click one to list its orders.`;
    chart.innerHTML = rows.length ? rows.map(([k, r]) => `
      <button class="row" data-k="${esc(k)}">
        <span class="n">${esc(k)}<small>${r.n} order${r.n > 1 ? "s" : ""}${r.w ? " · " + r.w + " works" : ""}</small></span>
        <span class="track"><span class="fill" style="width:${(r.v / max) * 100}%"></span></span>
        <span class="a">${fmt(r.v, 0)}<small>${((r.v / total) * 100).toFixed(1)}%</small></span>
      </button>`).join("") : '<div class="empty">No counted orders here (only revisions or orders without amounts).</div>';
    chart.querySelectorAll(".row").forEach((b) => (b.onclick = () => { S.path.push(b.dataset.k); render(); }));
  }

  function renderOrders() {
    const show = S.path.length >= 1;
    $("ordersCard").hidden = !show;
    if (!show) return;
    const items = scoped().slice().sort((a, b) => (b.amount_cr || 0) - (a.amount_cr || 0));
    $("ordersTitle").textContent = `Orders (${items.length})` + (S.path.length ? " – " + S.path.join(" › ") : "");
    const short = (t) => (t.length > 170 ? t.slice(0, 167) + "…" : t);
    $("orders").innerHTML = `<table><thead><tr><th>Order</th><th class="hide-sm">Agency / sector</th><th class="num">Works</th><th class="num">Amount</th></tr></thead><tbody>` +
      items.map((i) => `<tr class="order ${i.is_revision ? "rev" : ""}" tabindex="0" data-id="${i.id}">
        <td>${esc(short(i.title))}${i.is_revision ? '<span class="tag">revision</span>' : ""}${i.possible_duplicate ? '<span class="tag">suspected duplicate</span>' : ""}</td>
        <td class="hide-sm">${esc(i.agency)}<br><small>${esc(i.sector)}</small></td>
        <td class="num">${i.works ?? "–"}</td>
        <td class="num">${i.amount_cr != null ? fmt(i.amount_cr) : "see PDF"}</td></tr>`).join("") + "</tbody></table>";
    $("orders").querySelectorAll("tr.order").forEach((r) => {
      const open = () => openDrawer(r.dataset.id);
      r.onclick = open; r.onkeydown = (e) => { if (e.key === "Enter") open(); };
    });
  }

  function renderMonths() {
    const m = {};
    D.items.filter(isCounted).forEach((i) => { const k = i.uploaded || "?"; m[k] = (m[k] || 0) + i.amount_cr; });
    const keys = Object.keys(m).sort(); const max = Math.max(...keys.map((k) => m[k]));
    $("months").innerHTML = keys.map((k) => `<div class="mcol"><b>${fmt(m[k], 0)}</b><div class="b" style="height:${(m[k] / max) * 100}%"></div>${k}</div>`).join("");
  }

  function openDrawer(id) {
    const i = D.items.find((x) => x.id === id);
    const totalSector = D.items.filter((x) => isCounted(x) && x.sector === i.sector).reduce((s, x) => s + x.amount_cr, 0);
    const total = D.items.filter(isCounted).reduce((s, x) => s + x.amount_cr, 0);
    $("drawerBody").innerHTML = `
      <div class="big">${i.amount_cr != null ? fmt(i.amount_cr) : "Amount not in title"}</div>
      <h2 style="margin-top:8px">${esc(i.title)}</h2>
      <dl class="dl">
        <dt>Sector</dt><dd>${esc(i.sector)}</dd>
        <dt>Agency</dt><dd>${esc(i.agency)}</dd>
        <dt>Works</dt><dd>${i.works ?? "not stated"}</dd>
        <dt>Published</dt><dd>${esc(i.uploaded || "unknown")}</dd>
        ${i.old_amount_cr != null ? `<dt>Earlier amount</dt><dd>${fmt(i.old_amount_cr)} (net ${i.delta_cr >= 0 ? "+" : ""}${fmt(i.delta_cr)})</dd>` : ""}
        ${i.amount_cr != null && !i.is_revision ? `<dt>Share of sector</dt><dd>${((i.amount_cr / totalSector) * 100).toFixed(1)}% of ${esc(i.sector)}</dd><dt>Share of total</dt><dd>${((i.amount_cr / total) * 100).toFixed(2)}%</dd>` : ""}
        ${i.works && i.amount_cr ? `<dt>Avg per work</dt><dd>${fmt(i.amount_cr / i.works)}</dd>` : ""}
        <dt>Page position</dt><dd>#${i.seq} of ${D.count} (newest first)</dd>
      </dl>
      ${i.flags.map((f) => `<div class="flag">${esc(f)}</div>`).join("")}
      <a class="btn" href="${esc(i.pdf)}" target="_blank" rel="noopener">Open order PDF</a>`;
    $("drawer").classList.add("open"); $("drawer").setAttribute("aria-hidden", "false"); $("scrim").hidden = false;
  }
  function closeDrawer() { $("drawer").classList.remove("open"); $("drawer").setAttribute("aria-hidden", "true"); $("scrim").hidden = true; }
  $("closeDrawer").onclick = closeDrawer; $("scrim").onclick = closeDrawer;
  document.addEventListener("keydown", (e) => e.key === "Escape" && closeDrawer());

  document.querySelectorAll("#groupSeg button").forEach((b) => (b.onclick = () => {
    S.group = b.dataset.g; S.path = [];
    document.querySelectorAll("#groupSeg button").forEach((x) => x.classList.toggle("on", x === b)); render();
  }));
  $("optDup").onchange = (e) => { S.dup = e.target.checked; render(); };

  function render() { renderKpis(); renderCrumbs(); renderChart(); renderOrders(); renderMonths(); K.subs.forEach((f) => f()); }
  K.openOrder = openDrawer; K.isCounted = isCounted; K.closeDrawer = closeDrawer;
  K.drill = (g, path) => {
    S.group = g; S.path = path || [];
    document.querySelectorAll("#groupSeg button").forEach((x) => x.classList.toggle("on", x.dataset.g === g));
    render();
  };
  render();
})();
