(function () {
  const M = window.MEETINGS_DATA, $ = (id) => document.getElementById(id);
  const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const fmtD = (d) => (d ? new Date(d + "T00:00:00").toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) : "no date");
  const F = { month: null, forum: "", chair: "", topic: "", q: "" };

  // "NEW" tracking: ids this browser has already seen
  let seen = null;
  try { seen = JSON.parse(localStorage.getItem("kumbh_seen_meetings") || "null"); } catch (e) {}
  const firstVisit = !seen;
  const seenSet = new Set(seen || []);
  const isNew = (i) => !firstVisit && !seenSet.has(i.id);
  const newCount = M.items.filter(isNew).length;
  function markSeen() { try { localStorage.setItem("kumbh_seen_meetings", JSON.stringify(M.items.map((i) => i.id))); } catch (e) {} }

  // tabs
  function route() {
    const m = location.hash === "#meetings";
    $("view-spend").hidden = m; $("view-meetings").hidden = !m;
    $("tab-spend").classList.toggle("on", !m); $("tab-meetings").classList.toggle("on", m);
    if (m) { render(); }
  }
  window.addEventListener("hashchange", route);
  if (newCount) { $("newBadge").hidden = false; $("newBadge").textContent = newCount + " new"; }

  function opts(id, label, key) {
    const vals = [...new Set(M.items.map((i) => i[key]))].sort();
    $(id).innerHTML = `<option value="">${label}: all</option>` + vals.map((v) => `<option>${esc(v)}</option>`).join("");
  }
  opts("mForum", "Forum", "forum"); opts("mChair", "Chair", "chair"); opts("mTopic", "Topic", "topic_group");
  [["mForum", "forum"], ["mChair", "chair"], ["mTopic", "topic"]].forEach(([id, k]) => ($(id).onchange = (e) => { F[k] = e.target.value; render(); }));
  $("mSearch").oninput = (e) => { F.q = e.target.value.trim().toLowerCase(); render(); };

  const mo = (i) => (i.date || "").slice(0, 7);
  const filtered = (ignoreMonth) => M.items.filter((i) =>
    (ignoreMonth || !F.month || mo(i) === F.month) &&
    (!F.forum || i.forum === F.forum) && (!F.chair || i.chair === F.chair) && (!F.topic || i.topic_group === F.topic) &&
    (!F.q || (i.title + " " + (i.search_text || "")).toLowerCase().includes(F.q)));

  function kpis() {
    const dated = M.items.filter((i) => i.date);
    const latest = dated[0];
    const days = Math.floor((Date.now() - new Date(latest.date)) / 864e5);
    const cut = new Date(Date.now() - 90 * 864e5).toISOString().slice(0, 10);
    const recent = dated.filter((i) => i.date >= cut).length;
    const withText = M.items.filter((i) => i.has_text).length;
    const authority = M.items.filter((i) => i.forum.startsWith("Kumbh Mela Authority")).length;
    $("mKpis").innerHTML = [
      ["Minutes published", M.count, `${dated[dated.length - 1].date.slice(0, 7)} to ${latest.date.slice(0, 7)}`],
      ["Latest meeting", fmtD(latest.date), `${days} days ago`],
      ["Last 90 days", recent, "meetings held"],
      ["Authority meetings", authority, "NTKMA forum"],
      ["Text-searchable", withText, `of ${M.count} PDFs (rest scanned)`],
    ].map(([l, v, s]) => `<div class="kpi"><div class="l">${l}</div><div class="v">${v}</div><div class="s">${s}</div></div>`).join("");
  }

  function months() {
    const c = {};
    filtered(true).forEach((i) => { if (i.date) c[mo(i)] = (c[mo(i)] || 0) + 1; });
    // continuous month axis
    const ks = Object.keys(c).sort(); if (!ks.length) { $("mMonths").innerHTML = ""; return; }
    const out = []; let [y, m] = ks[0].split("-").map(Number); const [ey, em] = ks[ks.length - 1].split("-").map(Number);
    while (y < ey || (y === ey && m <= em)) { out.push(`${y}-${String(m).padStart(2, "0")}`); m++; if (m > 12) { m = 1; y++; } }
    const max = Math.max(...Object.values(c));
    $("mMonths").innerHTML = out.map((k) => `<div class="mcol ${F.month === k ? "sel" : ""}${c[k] ? "" : " zero"}" data-m="${k}" title="${k}: ${c[k] || 0}"><b>${c[k] || ""}</b><div class="b" style="height:${((c[k] || 0) / max) * 100}%"></div><span>${k.slice(2).replace("-", "/")}</span></div>`).join("");
    // === k ? "sel" : ""}" data-m="${k}" title="${k}: ${c[k] || 0}"><b>${c[k] || ""}</b><div class="b" style="height:${((c[k] || 0) / max) * 100}%"></div><span>${k.slice(2).replace("-", "/")}</span></div>`).join("");
    $("mMonths").querySelectorAll(".mcol").forEach((e) => (e.onclick = !c[e.dataset.m] ? null : () => { F.month = F.month === e.dataset.m ? null : e.dataset.m; render(); }));
  }

  function list() {
    const items = filtered(false);
    $("mTitle").textContent = `Minutes (${items.length})` + (F.month ? " · " + F.month : "");
    $("mList").innerHTML = items.length ? `<table><thead><tr><th>Date</th><th>Meeting</th><th class="hide-sm">Forum / chair</th></tr></thead><tbody>` +
      items.map((i) => `<tr class="order" tabindex="0" data-id="${i.id}"><td class="num">${fmtD(i.date)}</td>
        <td>${esc(i.topic || i.title.replace(/^Minutes of (the )?/i, ""))}${isNew(i) ? '<span class="tag new">NEW</span>' : ""}${i.has_text === false ? '<span class="tag">scanned</span>' : ""}</td>
        <td class="hide-sm">${esc(i.forum)}<br><small>${esc(i.chair)}</small></td></tr>`).join("") + "</tbody></table>" : '<div class="empty">No meetings match.</div>';
    $("mList").querySelectorAll("tr.order").forEach((r) => { const o = () => open(r.dataset.id); r.onclick = o; r.onkeydown = (e) => e.key === "Enter" && o(); });
  }

  function open(id) {
    const i = M.items.find((x) => x.id === id);
    $("drawerBody").innerHTML = `
      <div class="big">${fmtD(i.date)}</div>
      <h2 style="margin-top:8px">${esc(i.title)}</h2>
      <dl class="dl">
        <dt>Forum</dt><dd>${esc(i.forum)}</dd><dt>Chair</dt><dd>${esc(i.chair)}</dd>
        <dt>Topic</dt><dd>${esc(i.topic || "not stated in title")} <small>(${esc(i.topic_group)})</small></dd>
        ${i.dates.length > 1 ? `<dt>All dates</dt><dd>${i.dates.map(fmtD).join(", ")}</dd>` : ""}
        <dt>Published</dt><dd>${esc(i.uploaded || "unknown")}</dd>
      </dl>
      ${i.flags.map((f) => `<div class="flag">${esc(f)}</div>`).join("")}
      ${i.text_excerpt ? `<h3 style="font-size:14px;margin:14px 0 6px">Extracted text (Marathi, lossy)</h3><div class="mtext">${esc(i.text_excerpt)}${i.text_chars > 1800 ? "…" : ""}</div>` : ""}
      <a class="btn" href="${esc(i.pdf)}" target="_blank" rel="noopener">Open minutes PDF</a>`;
    $("drawer").classList.add("open"); $("drawer").setAttribute("aria-hidden", "false"); $("scrim").hidden = false;
  }

  function render() { kpis(); months(); list(); }
  // opening the tab counts as having seen everything (badge stays for this visit)
  window.addEventListener("pagehide", () => { if (location.hash === "#meetings") markSeen(); });
  if (firstVisit) markSeen();
  route();
})();
