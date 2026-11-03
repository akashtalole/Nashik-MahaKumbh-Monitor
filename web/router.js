(function () {
  const $ = (id) => document.getElementById(id);
  const views = ["overview", "spend", "meetings"];
  function route() {
    let v = location.hash.slice(1); if (!views.includes(v)) v = "overview";
    views.forEach((n) => { $("view-" + n).hidden = n !== v; $("tab-" + n).classList.toggle("on", n === v); });
    window.Kumbh.closeDrawer && window.Kumbh.closeDrawer();
    window.scrollTo(0, 0);
  }
  window.addEventListener("hashchange", route);
  document.querySelectorAll("[data-go]").forEach((b) => (b.onclick = () => (location.hash = "#" + b.dataset.go)));

  // theme toggle: follows OS until the viewer picks one
  const root = document.documentElement;
  try { const t = localStorage.getItem("kumbh_theme"); if (t) root.dataset.theme = t; } catch (e) {}
  $("themeBtn").onclick = () => {
    const dark = root.dataset.theme ? root.dataset.theme === "dark" : matchMedia("(prefers-color-scheme: dark)").matches;
    root.dataset.theme = dark ? "light" : "dark";
    try { localStorage.setItem("kumbh_theme", root.dataset.theme); } catch (e) {}
  };
  route();
})();
