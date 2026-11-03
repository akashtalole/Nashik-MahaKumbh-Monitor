(function () {
  const D = window.KUMBH_DATA, M = window.MEETINGS_DATA, K = window.Kumbh;
  const $ = (id) => document.getElementById(id);
  const esc = K.esc, cr = K.cr, tip = K.tip;
  const sum = (a) => a.reduce((s, x) => s + x, 0);
  const view = () => location.hash.slice(1);

  /* ===================== ORDERS EXPLORER ===================== */
  const O = { q: "", sector: "", agency: "", loc: "", type: "counted", min: 0, sort: "amount_cr", dir: -1 };
  const cols = [
    ["seq", "#", "num"], ["title", "Order", ""], ["sector", "Sector", "hide-sm"], ["agency", "Agency", "hide-sm"],
    ["location", "Location", "hide-sm"], ["works", "Works", "num"], ["amount_cr", "₹ crore", "num"], ["uploaded", "Published", "hide-sm"],
  ];
  function opts(id, label, key) {
    $(id).innerHTML = `<option value="">${label}: all</option>` + [...new Set(D.items.map((i) => i[key]))].sort().map((v) => `<option>${esc(v)}</option>`).join("");
  }
  opts("oSector", "Sector", "sector"); opts("oAgency", "Agency", "agency"); opts("oLoc", "Location", "location");
  $("oSearch").oninput = (e) => { O.q = e.target.value.trim().toLowerCase(); orders(); };
  [["oSector", "sector"], ["oAgency", "agency"], ["oLoc", "loc"], ["oType", "type"]].forEach(([id, k]) => ($(id).onchange = (e) => { O[k] = e.target.value; orders(); }));
  $("oMin").oninput = (e) => { O.min = +e.target.value || 0; orders(); };

  function filtered() {
    return D.items.filter((i) =>
      (O.type === "all" || (O.type === "rev" ? i.is_revision : K.isCounted(i))) &&
      (!O.sector || i.sector === O.sector) && (!O.agency || i.agency === O.agency) && (!O.loc || i.location === O.loc) &&
      (!O.min || (i.amount_cr || 0) >= O.min) && (!O.q || i.title.toLowerCase().includes(O.q)))
      .sort((a, b) => {
        const x = a[O.sort], y = b[O.sort];
        if (x == null && y == null) return 0; if (x == null) return 1; if (y == null) return -1;   // blanks last
        return (typeof x === "string" ? x.localeCompare(y) : x - y) * O.dir;
      });
  }
  function orders() {
    const items = filtered(), withAmt = items.filter((i) => i.amount_cr != null);
    $("oTitle").textContent = `Orders (${items.length})`;
    $("oSummary").textContent = `${cr(sum(withAmt.map((i) => i.amount_cr)), 2)} across ${withAmt.length} orders with an amount` + (O.type === "all" ? " · revisions are included here, so this is not the headline total" : "");
    const arrow = (k) => (k === O.sort ? (O.dir < 0 ? "▼" : "▲") : "");
    $("oTable").innerHTML = `<table><thead><tr>${cols.map(([k, l, c]) => `<th class="sort ${c}" data-k="${k}" ${k === O.sort ? 'aria-sort="' + (O.dir < 0 ? "descending" : "ascending") + '"' : ""} data-arrow="${arrow(k)}">${l}</th>`).join("")}</tr></thead><tbody>` +
      items.map((i) => `<tr class="order ${i.is_revision ? "rev" : ""}" tabindex="0" data-id="${i.id}">
        <td class="num">${i.seq}</td>
        <td>${esc(i.title.length > 190 ? i.title.slice(0, 187) + "…" : i.title)}${i.is_revision ? '<span class="tag">revision</span>' : ""}${i.possible_duplicate ? '<span class="tag">suspected duplicate</span>' : ""}</td>
        <td class="hide-sm">${esc(i.sector)}</td><td class="hide-sm">${esc(i.agency)}</td><td class="hide-sm">${esc(i.location)}</td>
        <td class="num">${i.works ?? "–"}</td><td class="num">${i.amount_cr != null ? i.amount_cr.toLocaleString("en-IN", { maximumFractionDigits: 2 }) : "see PDF"}</td>
        <td class="hide-sm">${esc(i.uploaded || "")}</td></tr>`).join("") + "</tbody></table>" +
      (items.length ? "" : '<div class="empty">No orders match these filters.</div>');
    $("oTable").querySelectorAll("th.sort").forEach((th) => (th.onclick = () => {
      const k = th.dataset.k; if (O.sort === k) O.dir *= -1; else { O.sort = k; O.dir = ["title", "sector", "agency", "location"].includes(k) ? 1 : -1; } orders();
    }));
    $("oTable").querySelectorAll("tr.order").forEach((r) => { const o = () => K.openOrder(r.dataset.id); r.onclick = o; r.onkeydown = (e) => e.key === "Enter" && o(); });
  }
  $("oCsv").onclick = () => {
    const f = ["seq", "title", "sector", "agency", "location", "works", "amount_cr", "old_amount_cr", "is_revision", "possible_duplicate", "uploaded", "pdf"];
    const q = (v) => (v == null ? "" : '"' + String(v).replace(/"/g, '""') + '"');
    const csv = "﻿" + f.join(",") + "\n" + filtered().map((i) => f.map((k) => q(i[k])).join(",")).join("\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    a.download = "kumbh-approvals.csv"; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };

  /* ===================== TREEMAP ===================== */
  const T = { group: "sector", sel: null };
  function squarify(items, x, y, w, h) {
    const total = sum(items.map((i) => i.v)), k = (w * h) / total, out = [];
    const nodes = items.map((i) => ({ ...i, a: i.v * k })); let row = [];
    const worst = (r, side) => { const s = sum(r.map((n) => n.a)), mx = Math.max(...r.map((n) => n.a)), mn = Math.min(...r.map((n) => n.a)); return Math.max((side * side * mx) / (s * s), (s * s) / (side * side * mn)); };
    const lay = (r) => {
      const s = sum(r.map((n) => n.a));
      if (w >= h) { const rw = s / h; let cy = y; r.forEach((n) => { const rh = n.a / rw; out.push({ ...n, x, y: cy, w: rw, h: rh }); cy += rh; }); x += rw; w -= rw; }
      else { const rh = s / w; let cx = x; r.forEach((n) => { const rw = n.a / rh; out.push({ ...n, x: cx, y, w: rw, h: rh }); cx += rw; }); y += rh; h -= rh; }
    };
    while (nodes.length) { const side = Math.min(w, h), n = nodes[0]; if (!row.length || worst([...row, n], side) <= worst(row, side)) { row.push(n); nodes.shift(); } else { lay(row); row = []; } }
    if (row.length) lay(row);
    return out;
  }
  function treemap() {
    const c = D.items.filter(K.isCounted);
    let nodes, total;
    if (T.sel == null) {
      const g = {}; c.forEach((i) => { const r = (g[i[T.group]] = g[i[T.group]] || { v: 0, n: 0 }); r.v += i.amount_cr; r.n++; });
      nodes = Object.entries(g).map(([k, r]) => ({ key: k, name: k, v: r.v, sub: `${r.n} order${r.n > 1 ? "s" : ""}` }));
    } else {
      nodes = c.filter((i) => i[T.group] === T.sel).map((i) => ({ key: i.id, name: K.short(i.title).slice(0, 90), v: i.amount_cr, sub: i.agency, order: true }));
    }
    nodes.sort((a, b) => b.v - a.v); total = sum(nodes.map((n) => n.v));
    $("tCrumbs").innerHTML = T.sel == null ? `<span class="cur">All spend · ${cr(total)}</span>` :
      `<button id="tUp">All spend</button><span class="sep">›</span><span class="cur">${esc(T.sel)} · ${cr(total)}</span>`;
    if ($("tUp")) $("tUp").onclick = () => { T.sel = null; treemap(); };
    const box = $("tMap"), W = box.clientWidth, H = box.clientHeight;
    if (!nodes.length || !W) { box.innerHTML = '<div class="empty">Nothing to show.</div>'; return; }
    const max = nodes[0].v;
    box.innerHTML = squarify(nodes, 0, 0, W, H).map((n) => {
      const p = 14 + 80 * Math.sqrt(n.v / max), big = n.w > 96 && n.h > 54;
      return `<button class="tile ${p > 50 ? "dk" : ""}" style="left:${n.x}px;top:${n.y}px;width:${n.w}px;height:${n.h}px;background:color-mix(in srgb,var(--seq) ${p.toFixed(0)}%,var(--surface))" data-k="${esc(n.key)}" data-o="${n.order ? 1 : ""}"
        data-tip="${tip(n.name, cr(n.v, 1) + " · " + ((n.v / total) * 100).toFixed(1) + "%", n.sub)}" aria-label="${esc(n.name)} ${cr(n.v)}">
        ${big ? `<b>${esc(n.name.length > 60 ? n.name.slice(0, 57) + "…" : n.name)}</b><span>${cr(n.v)} · ${((n.v / total) * 100).toFixed(0)}%</span>` : n.w > 56 && n.h > 28 ? `<span>${cr(n.v)}</span>` : ""}</button>`;
    }).join("");
    box.querySelectorAll(".tile").forEach((b) => (b.onclick = () => { if (b.dataset.o) K.openOrder(b.dataset.k); else { T.sel = b.dataset.k; treemap(); } }));
  }
  $("tSeg").querySelectorAll("button").forEach((b) => (b.onclick = () => {
    T.group = b.dataset.g; T.sel = null;
    $("tSeg").querySelectorAll("button").forEach((x) => x.classList.toggle("on", x === b)); treemap();
  }));
  let rt; window.addEventListener("resize", () => { clearTimeout(rt); rt = setTimeout(() => view() === "treemap" && treemap(), 150); });

  /* ===================== TIMELINE ===================== */
  const L = { kind: "all", open: {} };
  const fmtD = (d) => new Date(d + "T00:00:00").toLocaleDateString("en-IN", { day: "2-digit", month: "short" });
  function timeline() {
    const months = {};
    const slot = (k) => (months[k] = months[k] || { o: [], m: [] });
    D.items.forEach((i) => i.uploaded && slot(i.uploaded).o.push(i));
    M.items.forEach((m) => m.date && slot(m.date.slice(0, 7)).m.push(m));
    const keys = Object.keys(months).sort().reverse();
    $("lFeed").innerHTML = keys.map((k) => {
      const { o, m } = months[k], counted = o.filter(K.isCounted);
      const showO = L.kind !== "meetings" && o.length, showM = L.kind !== "orders" && m.length;
      if (!showO && !showM) return "";
      const label = new Date(k + "-01T00:00:00").toLocaleDateString("en-IN", { month: "long", year: "numeric" });
      const so = [...o].sort((a, b) => (b.amount_cr || 0) - (a.amount_cr || 0)), lim = L.open[k] ? so.length : 5;
      return `<section class="card fm"><div class="when"><b>${label}</b>
        <span>${m.length} meeting${m.length === 1 ? "" : "s"}</span><span>${o.length} order${o.length === 1 ? "" : "s"} · ${cr(sum(counted.map((i) => i.amount_cr)))}</span></div>
        <div>${showM ? m.map((x) => `<button class="ev" data-m="${x.id}"><span class="k m">Meeting</span><span class="t">${esc(x.topic || x.title.replace(/^Minutes of (the )?/i, ""))}<small>${fmtD(x.date)} · ${esc(x.forum)}</small></span><span></span></button>`).join("") : ""}
        ${showO ? so.slice(0, lim).map((i) => `<button class="ev" data-o="${i.id}"><span class="k o">Order</span><span class="t">${esc(K.short(i.title).slice(0, 130))}<small>${esc(i.agency)} · ${esc(i.sector)}${i.is_revision ? " · revision" : ""}</small></span><span class="v">${i.amount_cr != null ? cr(i.amount_cr, 1) : "see PDF"}</span></button>`).join("") : ""}
        ${showO && so.length > 5 ? `<button class="link" data-more="${k}" style="margin-top:8px">${L.open[k] ? "Show fewer" : `Show all ${so.length} orders`}</button>` : ""}</div></section>`;
    }).join("") || '<div class="card empty">Nothing to show.</div>';
    $("lFeed").querySelectorAll("[data-o]").forEach((b) => (b.onclick = () => K.openOrder(b.dataset.o)));
    $("lFeed").querySelectorAll("[data-m]").forEach((b) => (b.onclick = () => window.Meetings.open(b.dataset.m)));
    $("lFeed").querySelectorAll("[data-more]").forEach((b) => (b.onclick = () => { L.open[b.dataset.more] = !L.open[b.dataset.more]; timeline(); }));
  }
  $("lSeg").querySelectorAll("button").forEach((b) => (b.onclick = () => {
    L.kind = b.dataset.k; $("lSeg").querySelectorAll("button").forEach((x) => x.classList.toggle("on", x === b)); timeline();
  }));

  /* render a view when it is shown (treemap needs a visible, measured container) */
  function show() { const v = view(); if (v === "orders") orders(); else if (v === "treemap") treemap(); else if (v === "timeline") timeline(); }
  window.addEventListener("viewshown", show);
  K.subs.push(show);          // refresh when the duplicates toggle changes
  show();
})();
