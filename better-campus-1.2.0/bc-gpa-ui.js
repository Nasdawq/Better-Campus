/* Better Campus — manual GPA calculator (UI + local persistence).
 *
 * PRIVACY BOUNDARY: this file never reads the Infinite Campus page. There is no DOM scraping, no network
 * request, no hidden API and no message to any server. The ONLY inputs are the fields the student types.
 * Data is saved with chrome.storage.local on the student's own device (key "bc-gpa-v1") and can be
 * switched off or wiped from Settings.
 */
(function (root) {
  "use strict";
  var E = root.BCGpaEngine;
  if (!E || typeof document === "undefined") return;

  var KEY = "bc-gpa-v1", HOST_ID = "better-campus-gpa";
  var hasChrome = typeof chrome !== "undefined" && chrome.storage && chrome.storage.local && chrome.runtime && chrome.runtime.id;

  /* ------------------------------------------------------------------ storage */
  function storeGet(key) {
    return new Promise(function (res) {
      try {
        if (hasChrome) chrome.storage.local.get(key, function (o) { res(o ? o[key] : undefined); });
        else res(JSON.parse(localStorage.getItem(key) || "null") || undefined);
      } catch (e) { res(undefined); }
    });
  }
  function storeSet(key, val) {
    return new Promise(function (res) {
      try {
        if (hasChrome) { var o = {}; o[key] = val; chrome.storage.local.set(o, function () { res(); }); }
        else { localStorage.setItem(key, JSON.stringify(val)); res(); }
      } catch (e) { res(); }
    });
  }
  function storeRemove(key) {
    return new Promise(function (res) {
      try {
        if (hasChrome) chrome.storage.local.remove(key, function () { res(); });
        else { localStorage.removeItem(key); res(); }
      } catch (e) { res(); }
    });
  }

  var S = null; // calculator state
  var saveTimer = null;
  function queueSave() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(flushSave, 250);
  }
  function flushSave() {
    clearTimeout(saveTimer);
    saveTimer = null;
    if (!S) return;
    if (S.settings.persist) storeSet(KEY, S);
    else storeRemove(KEY);
  }
  root.addEventListener("pagehide", function () { if (saveTimer) flushSave(); });

  /* ------------------------------------------------------------------ theme */
  var FALLBACK = {
    light: { fg: "#0A0A0A", fg2: "#374151", muted: "#4B5563", surface: "#FFFFFF", surface2: "#F3F4F6", page: "#F3F4F6", border: "#E5E7EB", borderStrong: "#6B7280", accent: "#1D4ED8", accentFg: "#FFFFFF", hover: "#E8EAEE", focus: "#1D4ED8", link: "#0B5BD3", icon: "#111111", shadow: "0 8px 24px rgba(15,23,42,.14)", elev: "#FFFFFF", scheme: "light" },
  };
  function tokens(mode) {
    var t = (root.__BC_THEME_TOKENS__ || FALLBACK)[mode] || FALLBACK[mode];
    return t;
  }
  var mode = "light";
  function cssVars(m) {
    var t = tokens(m);
    var status = "--ok:#065F46;--ok-bg:#D1FAE5;--warn:#92400E;--warn-bg:#FEF3C7;--bad:#B91C1C;--bad-bg:#FEE2E2;--hyp:#5B21B6;--hyp-bg:#EDE9FE;";
    return "--fg:" + t.fg + ";--fg2:" + t.fg2 + ";--muted:" + t.muted + ";--surface:" + t.surface + ";--surface2:" + t.surface2 +
      ";--page:" + t.page + ";--border:" + t.border + ";--border-strong:" + t.borderStrong + ";--accent:" + t.accent +
      ";--accent-fg:" + t.accentFg + ";--hover:" + t.hover + ";--focus:" + t.focus + ";--link:" + t.link + ";--icon:" + t.icon +
      ";--shadow:" + t.shadow + ";--elev:" + t.elev + ";color-scheme:" + t.scheme + ";" + status;
  }
  function loadTheme() { return Promise.resolve(); }
  function applyMode() {
    if (!ui.wrap) return;
    ui.wrap.setAttribute("data-mode", mode);
    ui.vars.textContent = ".bcg[data-mode=light]{" + cssVars("light") + "}";
  }
  /* ------------------------------------------------------------------ tiny DOM helper */
  var PROPS = { value: 1, checked: 1, disabled: 1, selected: 1, textContent: 1, className: 1 };
  function h(tag, attrs) {
    var el = document.createElement(tag);
    if (attrs) {
      for (var k in attrs) {
        var v = attrs[k];
        if (v === null || v === undefined || v === false) continue;
        if (k === "class") el.className = v;
        else if (k.slice(0, 2) === "on") el.addEventListener(k.slice(2), v);
        else if (PROPS[k]) el[k] = v;
        else el.setAttribute(k, v === true ? "" : v);
      }
    }
    for (var i = 2; i < arguments.length; i++) add(el, arguments[i]);
    return el;
  }
  function add(el, c) {
    if (c === null || c === undefined || c === false) return;
    if (Array.isArray(c)) c.forEach(function (x) { add(el, x); });
    else if (c.nodeType) el.appendChild(c);
    else el.appendChild(document.createTextNode(String(c)));
  }
  function clear(el) { while (el.firstChild) el.removeChild(el.firstChild); }
  function uid() { return "c" + Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }
  var f2 = function (x) { return E.fmt(x, 2); };

  /* ------------------------------------------------------------------ CSS */
  var CSS = [
    ":host{all:initial}",
    ".bcg{position:fixed;inset:0;z-index:2147483002;display:flex;justify-content:center;background:rgba(2,6,23,.55);font-family:'Plus Jakarta Sans',ui-sans-serif,system-ui,-apple-system,'Segoe UI',sans-serif;font-size:14px;line-height:1.5;color:var(--fg);-webkit-font-smoothing:antialiased}",
    ".bcg *,.bcg *::before,.bcg *::after{box-sizing:border-box}",
    ".bcg button,.bcg input,.bcg select,.bcg textarea{font:inherit;color:inherit}",
    ".sheet{width:min(1120px,100%);height:100%;background:var(--page);display:flex;flex-direction:column;box-shadow:var(--shadow)}",
    ".top{background:var(--surface);border-bottom:1px solid var(--border);padding:14px 20px;display:flex;flex-wrap:wrap;gap:12px 20px;align-items:center;justify-content:space-between}",
    ".top h1{margin:0;font-size:20px;font-weight:800;letter-spacing:-.02em;color:var(--fg)}",
    ".sub{color:var(--muted);font-size:12.5px}",
    ".qbar{display:flex;flex-wrap:wrap;gap:10px 14px;align-items:center}",
    ".seg{display:inline-flex;border:1px solid var(--border-strong);border-radius:10px;overflow:hidden}",
    ".seg button{border:0;background:var(--surface2);padding:7px 14px;font-weight:700;cursor:pointer;color:var(--fg2)}",
    ".seg button+button{border-left:1px solid var(--border-strong)}",
    ".seg button[aria-pressed=true]{background:var(--accent);color:var(--accent-fg)}",
    ".seg button:hover:not([aria-pressed=true]){background:var(--hover)}",
    ".tabs{display:flex;gap:4px;padding:10px 20px 0;background:var(--surface);border-bottom:1px solid var(--border);overflow-x:auto}",
    ".tab{border:0;background:transparent;padding:9px 14px;font-weight:700;color:var(--muted);cursor:pointer;border-bottom:3px solid transparent;white-space:nowrap}",
    ".tab:hover{color:var(--fg)}",
    ".tab[aria-selected=true]{color:var(--fg);border-bottom-color:var(--accent)}",
    ".view{flex:1;overflow-y:auto;padding:18px 20px 40px;display:flex;flex-direction:column;gap:16px}",
    ".btn{display:inline-flex;align-items:center;justify-content:center;gap:6px;padding:8px 14px;border-radius:10px;border:1px solid var(--border-strong);background:var(--surface2);color:var(--fg);font-weight:700;cursor:pointer;white-space:nowrap}",
    ".btn:hover{background:var(--hover)}",
    ".btn.primary{background:var(--accent);color:var(--accent-fg);border-color:transparent}",
    ".btn.primary:hover{filter:brightness(1.08)}",
    ".btn.danger{background:var(--bad-bg);color:var(--bad);border-color:var(--bad)}",
    ".btn.sm{padding:5px 10px;font-size:12.5px;border-radius:8px}",
    ".btn.icon{width:36px;height:36px;padding:0;font-size:20px;line-height:1}",
    ".bcg :focus-visible{outline:2px solid var(--focus);outline-offset:2px}",
    ".card{background:var(--surface);border:1px solid var(--border);border-radius:14px;padding:16px;box-shadow:0 1px 3px rgba(15,23,42,.08)}",
    ".card h2,.card h3{margin:0 0 8px;font-size:15px;font-weight:800;color:var(--fg)}",
    ".grid{display:grid;gap:14px}",
    ".g-stats{grid-template-columns:repeat(auto-fit,minmax(260px,1fr))}",
    ".g-2{grid-template-columns:repeat(auto-fit,minmax(300px,1fr))}",
    ".row{display:flex;flex-wrap:wrap;gap:10px;align-items:flex-end}",
    ".between{justify-content:space-between;align-items:center}",
    ".stack{display:flex;flex-direction:column;gap:10px}",
    ".muted{color:var(--muted)}.small{font-size:12.5px}",
    ".fld{display:flex;flex-direction:column;gap:4px;min-width:0}",
    ".fld>span.l{font-size:12px;font-weight:700;color:var(--fg2)}",
    ".sr{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}",
    ".in{width:100%;padding:8px 10px;border-radius:9px;border:1px solid var(--border-strong);background:var(--surface2);color:var(--fg);min-width:0}",
    ".in::placeholder{color:var(--muted);opacity:1}",
    ".in[aria-invalid=true]{border-color:var(--bad);box-shadow:0 0 0 2px var(--bad-bg)}",
    ".err{color:var(--bad);font-size:12.5px;min-height:0}",
    ".err:empty{display:none}",
    ".chk{display:inline-flex;align-items:center;gap:8px;font-weight:600;cursor:pointer}",
    ".chk input{width:18px;height:18px;accent-color:var(--accent)}",
    ".banner{padding:10px 14px;border-radius:12px;border:1px solid var(--border-strong);background:var(--surface2);color:var(--fg)}",
    ".banner.warn{border-color:var(--warn);background:var(--warn-bg);color:var(--warn)}",
    ".banner.ok{border-color:var(--ok);background:var(--ok-bg);color:var(--ok)}",
    ".banner.bad{border-color:var(--bad);background:var(--bad-bg);color:var(--bad)}",
    ".stat .v{font-size:30px;font-weight:800;letter-spacing:-.03em;line-height:1.1;color:var(--fg);font-variant-numeric:tabular-nums}",
    ".stat .k{font-size:12px;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:.04em}",
    ".stat .pair{display:flex;gap:22px;flex-wrap:wrap;margin:6px 0}",
    ".stat .note{font-size:12.5px;color:var(--fg2);margin-top:4px}",
    ".badge{display:inline-flex;align-items:center;gap:4px;padding:1px 9px;border-radius:999px;font-size:11.5px;font-weight:800;border:1px solid currentColor;white-space:nowrap}",
    ".b-est{color:var(--fg2);background:var(--surface2)}.b-hyp{color:var(--hyp);background:var(--hyp-bg)}",
    ".b-done{color:var(--fg2);background:var(--surface2)}.b-cur{color:var(--accent-fg);background:var(--accent);border-color:transparent}",
    ".b-plan{color:var(--hyp);background:var(--hyp-bg);border-style:dashed}.b-miss{color:var(--warn);background:var(--warn-bg)}.b-unset{color:var(--muted);background:transparent;border-style:dotted}",
    ".b-ok{color:var(--ok);background:var(--ok-bg)}.b-bad{color:var(--bad);background:var(--bad-bg)}",
    ".cls{display:flex;flex-direction:column;gap:12px}",
    ".cls.off{opacity:.7}",
    ".chead{display:grid;grid-template-columns:minmax(160px,2fr) 120px 100px auto auto;gap:10px;align-items:end}",
    ".qgrid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px}",
    ".qcell{border:1px solid var(--border);border-radius:12px;padding:10px;display:flex;flex-direction:column;gap:6px;background:var(--surface2)}",
    ".qcell.planned{border-style:dashed;border-color:var(--hyp)}",
    ".qcell.current{border-color:var(--accent);box-shadow:inset 0 0 0 1px var(--accent)}",
    ".qhead{display:flex;justify-content:space-between;align-items:center;gap:6px;flex-wrap:wrap}",
    ".qn{font-weight:800}",
    ".der{font-size:12.5px;color:var(--fg2);min-height:19px;font-variant-numeric:tabular-nums}",
    "table.t{width:100%;border-collapse:collapse;font-size:13px}",
    "table.t th{text-align:left;font-size:11.5px;text-transform:uppercase;letter-spacing:.04em;color:var(--fg2);padding:7px 8px;border-bottom:1px solid var(--border-strong)}",
    "table.t td{padding:7px 8px;border-bottom:1px solid var(--border);vertical-align:middle;color:var(--fg)}",
    ".scen{display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap;align-items:center;padding:12px;border:1px solid var(--border);border-radius:12px;background:var(--surface2)}",
    ".scen.yes{border-color:var(--ok)}.scen.no{border-color:var(--bad)}",
    ".big{font-size:24px;font-weight:800;font-variant-numeric:tabular-nums}",
    ".chips{display:flex;gap:8px;flex-wrap:wrap}",
    ".chipbtn{border:1px solid var(--border-strong);background:var(--surface2);border-radius:999px;padding:5px 12px;font-weight:700;cursor:pointer}",
    ".chipbtn:hover{background:var(--hover)}.chipbtn[aria-pressed=true]{background:var(--accent);color:var(--accent-fg);border-color:transparent}",
    ".sc-row{display:grid;grid-template-columns:70px 1fr 1fr auto;gap:8px;align-items:center;margin-bottom:6px}",
    "ul.rules{margin:0;padding-left:18px;color:var(--fg2)}",
    "details summary{cursor:pointer;font-weight:700;color:var(--fg2)}",
    "@media (max-width:760px){.chead{grid-template-columns:1fr 1fr}.chead .wide{grid-column:1/-1}.qgrid{grid-template-columns:repeat(2,minmax(0,1fr))}.view{padding:14px 12px 40px}.top{padding:12px}.tabs{padding:8px 12px 0}}",
    "@media (max-width:420px){.qgrid{grid-template-columns:1fr}.sc-row{grid-template-columns:60px 1fr 1fr auto}}",
    "@media (prefers-reduced-motion:no-preference){.sheet{animation:in .16s ease-out}@keyframes in{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}}",
  ].join("\n");

  /* ------------------------------------------------------------------ shell */
  var ui = { host: null, wrap: null, vars: null, view: null, tabs: null, qbar: null, current: "dashboard", mounted: null, lastFocus: null };
  var TABS = [["dashboard", "Dashboard"], ["classes", "Classes & grades"], ["goal", "Goal planner"], ["settings", "Settings"]];

  function open(viewName) {
    if (root.top !== root) return;
    if (ui.host && ui.host.isConnected) { if (viewName) show(viewName); return; }
    ui.lastFocus = document.activeElement;
    var go = function () {
      build();
      show(viewName || ui.current || "dashboard");
      var closeBtn = ui.wrap.querySelector("[data-close]");
      if (closeBtn) closeBtn.focus();
    };
    var stateP = S ? Promise.resolve() : storeGet(KEY).then(function (raw) { S = E.normalizeState(raw); });
    Promise.all([stateP, loadTheme()]).then(go);
  }
  function close() {
    flushSave();
    document.removeEventListener("keydown", onKey, true);
    if (ui.host) ui.host.remove();
    ui.host = ui.wrap = null;
    try { if (ui.lastFocus && ui.lastFocus.focus) ui.lastFocus.focus(); } catch (e) { /* ignore */ }
  }
  function onKey(e) {
    if (!ui.wrap) return;
    if (e.key === "Escape") { e.stopPropagation(); e.preventDefault(); close(); return; }
    if (e.key === "Tab") { // keep focus inside the dialog
      var sh = ui.host.shadowRoot;
      var f = Array.from(sh.querySelectorAll("button,input,select,textarea,summary,[tabindex]")).filter(function (n) { return !n.disabled && n.offsetParent !== null && n.tabIndex >= 0; });
      if (!f.length) return;
      var first = f[0], last = f[f.length - 1], act = sh.activeElement;
      if (e.shiftKey && act === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && (act === last || !act)) { e.preventDefault(); first.focus(); }
    }
  }

  function build() {
    ui.host = h("div", { id: HOST_ID, "data-testid": "bc-gpa-host" });
    var sh = ui.host.attachShadow({ mode: "open" });
    ui.vars = h("style");
    sh.appendChild(h("style", { textContent: CSS }));
    sh.appendChild(ui.vars);
    ui.qbar = h("div", { class: "qbar" });
    ui.tabs = h("div", { class: "tabs", role: "tablist", "aria-label": "Calculator sections" });
    ui.view = h("div", { class: "view", role: "tabpanel", tabindex: "-1" });
    ui.wrap = h("div", { class: "bcg", "data-mode": mode, role: "dialog", "aria-modal": "true", "aria-label": "GPA Calculator", "data-testid": "bc-gpa-dialog",
      onmousedown: function (e) { if (e.target === ui.wrap) close(); } },
      h("div", { class: "sheet" },
        h("div", { class: "top" },
          h("div", null,
            h("h1", null, "GPA Calculator"),
            h("div", { class: "sub" }, "Built from what you type in. It never reads your Infinite Campus grades, and it isn't an official gradebook.")),
          ui.qbar,
          h("button", { class: "btn icon", "data-close": "", "aria-label": "Close GPA Calculator", title: "Close (Esc)", onclick: close }, "×")),
        ui.tabs, ui.view));
    sh.appendChild(ui.wrap);
    ["keydown", "keyup", "keypress"].forEach(function (t) { ui.host.addEventListener(t, function (e) { e.stopPropagation(); }); }); // keep portal shortcuts out while typing
    document.documentElement.appendChild(ui.host);
    document.addEventListener("keydown", onKey, true);
    applyMode();
    renderQbar();
    renderTabs();
  }

  function renderTabs() {
    clear(ui.tabs);
    TABS.forEach(function (t) {
      ui.tabs.appendChild(h("button", { class: "tab", role: "tab", "aria-selected": String(ui.current === t[0]), "data-tab": t[0],
        onclick: function () { show(t[0]); } }, t[1]));
    });
  }
  function renderQbar() {
    clear(ui.qbar);
    var seg = h("div", { class: "seg", role: "group", "aria-label": "Current quarter" });
    [1, 2, 3, 4].forEach(function (q) {
      seg.appendChild(h("button", { "aria-pressed": String(S.currentQuarter === q), "data-q": q, title: "Set current quarter to Q" + q,
        onclick: function () { S.currentQuarter = q; queueSave(); renderQbar(); refresh(); } }, "Q" + q));
    });
    var yr = h("input", { class: "in", value: S.academicYear, maxlength: 20, placeholder: "e.g. 2026-2027", "aria-label": "Academic year (optional)", style: "width:150px",
      oninput: function () { S.academicYear = yr.value.slice(0, 20); queueSave(); } });
    var q = S.currentQuarter;
    ui.qbar.appendChild(h("div", { class: "fld" }, h("span", { class: "l" }, "Current quarter"), seg));
    ui.qbar.appendChild(h("label", { class: "fld" }, h("span", { class: "l" }, "Academic year (optional)"), yr));
    ui.qbar.appendChild(h("div", { class: "sub", "aria-live": "polite", style: "max-width:260px" },
      q === 1 ? "Q1 is current; Q2–Q4 are plans." : "Q1" + (q > 2 ? "–Q" + (q - 1) : "") + " completed · Q" + q + " current" + (q < 4 ? " · Q" + (q + 1) + (q < 3 ? "–Q4" : "") + " planned" : "")));
  }

  function show(name) {
    ui.current = name;
    renderTabs();
    clear(ui.view);
    var mod = { dashboard: mountDashboard, classes: mountClasses, goal: mountGoal, settings: mountSettings }[name] || mountDashboard;
    ui.mounted = mod(ui.view) || {};
    ui.view.scrollTop = 0;
  }
  /** Re-render derived values everywhere without rebuilding any input. */
  function refresh() { if (ui.mounted && ui.mounted.refresh) ui.mounted.refresh(); }

  /* ------------------------------------------------------------------ shared bits */
  var STATUS = {
    completed: ["b-done", "Completed"], current: ["b-cur", "Current"], planned: ["b-plan", "Planned (target)"],
    missing: ["b-miss", "Missing"], unset: ["b-unset", "Not set"],
  };
  function chip(status) { var s = STATUS[status]; return h("span", { class: "badge " + s[0] }, s[1]); }
  function names(list) { return list.map(function (x) { return x.name; }).join(", "); }

  /* ------------------------------------------------------------------ DASHBOARD */
  function mountDashboard(view) {
    var box = h("div", { class: "stack", "data-testid": "gpa-dashboard" });
    view.appendChild(box);
    function stat(title, sub, a, b, opts) {
      opts = opts || {};
      var card = h("div", { class: "card stat" },
        h("div", { class: "row between" },
          h("div", { class: "k" }, title),
          opts.hyp ? h("span", { class: "badge b-hyp" }, "Hypothetical") : h("span", { class: "badge b-est" }, "Estimate")));
      if (sub) card.appendChild(h("div", { class: "sub" }, sub));
      if (a.gpa !== null && a.gpa !== undefined || (b && b.gpa !== null && b.gpa !== undefined)) {
        card.appendChild(h("div", { class: "pair" },
          h("div", null, h("div", { class: "v", title: a.gpa === null ? "" : String(a.gpa) }, a.gpa === null ? "—" : f2(a.gpa)), h("div", { class: "sub" }, "Unweighted")),
          h("div", null, h("div", { class: "v", title: b && b.gpa !== null ? String(b.gpa) : "" }, !b || b.gpa === null ? "—" : f2(b.gpa)), h("div", { class: "sub" }, "Weighted"))));
      }
      (opts.notes || []).forEach(function (n) { card.appendChild(h("div", { class: "note" }, n)); });
      return card;
    }
    function leftOut(r) {
      return r.excluded && r.excluded.length ? ["Left out (no grade): " + names(r.excluded) + "."] : [];
    }
    function render() {
      clear(box);
      var sum = E.summarize(S);
      var cur = S.currentQuarter, semQ = cur <= 2 ? [1, 2] : [3, 4];
      if (!S.settings.reviewed) {
        box.appendChild(h("div", { class: "banner warn", role: "note" },
          "These results use starter grading values (4.0 scale, Honors +1.0, AP +1.5). Schools differ — ",
          h("button", { class: "btn sm", onclick: function () { show("settings"); } }, "check your school's rules in Settings")));
      }
      if (!S.classes.length) {
        box.appendChild(h("div", { class: "card" }, h("h2", null, "Start by adding your classes"),
          h("p", { class: "muted", style: "margin:0 0 10px" }, "Enter each class and the grades you want to include. Nothing is imported from Infinite Campus."),
          h("button", { class: "btn primary", onclick: function () { show("classes"); } }, "Add classes")));
      }
      var g = h("div", { class: "grid g-stats" });
      // current quarter
      var qu = sum.currentQuarter.unweighted, qw = sum.currentQuarter.weighted;
      g.appendChild(stat("Q" + cur + " GPA (current quarter)", "Classes with a Q" + cur + " grade", qu, qw, {
        notes: qu.gpa === null ? ["Enter a Q" + cur + " grade for at least one counted class to see this."] : leftOut(qu) }));
      // semester
      var su = sum.semester.unweighted, sw = sum.semester.weighted;
      var semNotes = su.gpa === null
        ? ["Needs both Q" + semQ[0] + " and Q" + semQ[1] + " earned grades for at least one class." + (cur < semQ[1] ? " Q" + semQ[1] + " hasn't happened yet — see Projected below." : "")]
        : leftOut(su);
      g.appendChild(stat("Semester " + sum.semester.semester + " GPA", "Q" + semQ[0] + " + Q" + semQ[1], su, sw, { notes: semNotes }));
      // year
      var yu = sum.year.unweightedToDate, yw = sum.year.weightedToDate;
      var yNotes = yu.gpa === null ? ["Enter at least one earned grade (Q1–Q" + cur + ")."] : ["Average of the quarters earned so far (Q1–Q" + cur + ")."].concat(yu.partial.length ? ["Some classes are missing earlier quarters: " + names(yu.partial) + "."] : [], leftOut(yu));
      g.appendChild(stat("Year GPA to date", S.academicYear || "This academic year", yu, yw, { notes: yNotes }));
      // cumulative
      var cu = sum.cumulative.unweightedToDate, cw = sum.cumulative.weightedToDate;
      var cNotes = [];
      if (cu.gpa === null && cw.gpa === null) cNotes.push(cu.reason);
      else if (cu.historyOnly || cw.historyOnly) cNotes.push("No grades entered for this year yet, so this is only your earlier GPA.");
      else cNotes.push("Earlier GPA and credits combined with this year to date.");
      var ccard = stat("Cumulative GPA", "Earlier years + this year to date", { gpa: cu.gpa }, { gpa: cw.gpa }, { notes: cNotes });
      if (cu.gpa === null && cw.gpa === null) ccard.appendChild(h("button", { class: "btn sm", style: "margin-top:8px", onclick: function () { show("settings"); } }, "Enter earlier GPA & credits"));
      g.appendChild(ccard);
      // projected year
      var pu = sum.year.unweightedProjected, pw = sum.year.weightedProjected;
      var pNotes = pu.gpa === null
        ? ["Needs a grade or target in all four quarters for every counted class." + (pu.excluded.length ? " Still missing: " + names(pu.excluded) + "." : "")]
        : ["Uses your Q" + (cur + 1 > 4 ? 4 : cur + 1) + "–Q4 targets, which are hypothetical — not an official or final-year GPA."];
      g.appendChild(stat("Projected year GPA", "If every planned quarter goes as targeted", pu, pw, { hyp: true, notes: pNotes }));
      var cpu = sum.cumulative.unweightedProjected, cpw = sum.cumulative.weightedProjected;
      if (cpu.gpa !== null || cpw.gpa !== null) {
        g.appendChild(stat("Projected cumulative GPA", "Earlier years + projected year", { gpa: cpu.gpa }, { gpa: cpw.gpa }, { hyp: true, notes: ["Depends on the targets you entered for future quarters."] }));
      }
      // counts + goal
      g.appendChild(h("div", { class: "card stat" },
        h("div", { class: "k" }, "Classes"),
        h("div", { class: "pair" },
          h("div", null, h("div", { class: "v" }, String(sum.includedCount)), h("div", { class: "sub" }, "counted")),
          h("div", null, h("div", { class: "v" }, String(sum.missingCount)), h("div", { class: "sub" }, "missing a Q" + cur + " grade"))),
        sum.missingCount ? h("div", { class: "note" }, "Missing: " + sum.missingCurrent.join(", ") + ". Missing grades are left out, not counted as 0.") : null));
      var gp = E.planGoal(S, S.goal);
      var goalCard = h("div", { class: "card stat" }, h("div", { class: "row between" }, h("div", { class: "k" }, "Academic goal"), h("span", { class: "badge b-hyp" }, "Hypothetical")),
        h("div", { class: "v" }, f2(S.goal.target)),
        h("div", { class: "note" }, S.goal.scope === "cumulative" ? "Cumulative · " + S.goal.basis : "This year · " + S.goal.basis));
      if (!gp.ok) goalCard.appendChild(h("div", { class: "note" }, gp.reason));
      else goalCard.appendChild(h("div", { class: "note" }, gp.alreadyGuaranteed ? "Already guaranteed by your entered grades." : gp.achievable ? "Reachable: average at least " + f2(gp.requiredBasePoints) + " grade points in what's left." : "Not reachable — best possible is " + f2(gp.maxAchievable) + "."));
      goalCard.appendChild(h("button", { class: "btn sm", style: "margin-top:8px", onclick: function () { show("goal"); } }, "Open goal planner"));
      g.appendChild(goalCard);
      box.appendChild(g);

      // per-class overview
      if (S.classes.length) {
        var tbl = h("table", { class: "t" },
          h("thead", null, h("tr", null, h("th", null, "Class"), h("th", null, "Level"), [1, 2, 3, 4].map(function (q) { return h("th", null, "Q" + q); }))),
          h("tbody", null, S.classes.map(function (c) {
            return h("tr", null,
              h("td", null, c.name, c.include === false ? h("span", { class: "muted" }, " (not counted)") : null),
              h("td", null, E.LEVEL_LABEL[c.level]),
              [1, 2, 3, 4].map(function (q) {
                var st = E.cellStatus(c, q, S), base = E.entryBase(c.grades["q" + q], S.settings);
                return h("td", null, base ? base.letter + " " : "", chip(st));
              }));
          })));
        box.appendChild(h("div", { class: "card" }, h("h2", null, "Your classes at a glance"), h("div", { style: "overflow-x:auto" }, tbl)));
      }
      box.appendChild(h("div", { class: "card" }, h("h2", null, "Rules used for every number above"),
        h("ul", { class: "rules" }, sum.rules.map(function (r) { return h("li", null, r); })),
        h("div", { class: "sub", style: "margin-top:8px" }, "Estimates only. Your school's official GPA may round or weight differently.")));
    }
    render();
    return { refresh: render };
  }

  /* ------------------------------------------------------------------ CLASSES */
  function mountClasses(view) {
    var listBox = h("div", { class: "stack", "data-testid": "gpa-class-list" });
    var cells = []; // {update}
    var nameIn = h("input", { class: "in", placeholder: "e.g. Honors Algebra II", maxlength: 60, "data-testid": "gpa-add-name" });
    var levelIn = h("select", { class: "in", "aria-label": "Course level", "data-testid": "gpa-add-level" }, E.LEVELS.map(function (l) { return h("option", { value: l }, E.LEVEL_LABEL[l]); }));
    var credIn = h("input", { class: "in", value: "1", inputmode: "decimal", "aria-label": "Credits", "data-testid": "gpa-add-credits" });
    var addErr = h("div", { class: "err", role: "alert" });

    function addClass() {
      var cls = { id: uid(), name: nameIn.value.trim(), level: levelIn.value, credits: credIn.value.trim() === "" ? 1 : Number(credIn.value), include: true, bonusOverride: null, notes: "", grades: {} };
      var errs = E.validateClass(cls);
      var msg = errs.name || errs.credits || errs.level || "";
      addErr.textContent = msg;
      nameIn.setAttribute("aria-invalid", errs.name ? "true" : "false");
      credIn.setAttribute("aria-invalid", errs.credits ? "true" : "false");
      if (msg) { (errs.name ? nameIn : credIn).focus(); return; }
      if (S.classes.length >= 60) { addErr.textContent = "That's the maximum of 60 classes."; return; }
      S.classes.push(cls);
      queueSave();
      nameIn.value = "";
      renderList(cls.id);
      nameIn.focus();
    }
    var onEnter = function (e) { if (e.key === "Enter") { e.preventDefault(); addClass(); } };
    nameIn.addEventListener("keydown", onEnter); credIn.addEventListener("keydown", onEnter);

    var addCard = h("div", { class: "card" }, h("h2", null, "Add a class"),
      h("div", { class: "row" },
        h("label", { class: "fld", style: "flex:2;min-width:200px" }, h("span", { class: "l" }, "Class name"), nameIn),
        h("label", { class: "fld", style: "width:130px" }, h("span", { class: "l" }, "Level"), levelIn),
        h("label", { class: "fld", style: "width:100px" }, h("span", { class: "l" }, "Credits"), credIn),
        h("button", { class: "btn primary", onclick: addClass, "data-testid": "gpa-add-btn" }, "Add class")),
      addErr);

    function gradeCell(c, q) {
      var input = h("input", { class: "in", inputmode: "decimal", placeholder: "% or letter", "aria-label": "Q" + q + " grade for " + c.name, "data-testid": "gpa-grade-q" + q, value: E.entryText(c.grades["q" + q]) });
      var err = h("div", { class: "err", role: "alert" });
      var chipHost = h("span");
      var der = h("div", { class: "der" });
      var cell = h("div", { class: "qcell" }, h("div", { class: "qhead" }, h("span", { class: "qn" }, "Q" + q), chipHost), input, der, err);
      function update() {
        var st = E.cellStatus(c, q, S);
        cell.className = "qcell " + (st === "planned" || st === "unset" ? "planned" : st === "current" ? "current" : "");
        clear(chipHost); chipHost.appendChild(chip(st));
        var entry = c.grades["q" + q], base = E.entryBase(entry, S.settings);
        input.setAttribute("aria-label", "Q" + q + " " + (st === "planned" || st === "unset" ? "target grade (hypothetical)" : "grade") + " for " + c.name);
        if (!base) { der.textContent = st === "missing" ? "No grade — left out of GPA" : st === "unset" ? "Optional target" : ""; return; }
        var w = E.pointsFor(c, base.points, S.settings, true);
        der.textContent = base.letter + " · " + f2(base.points) + " pts" + (Math.abs(w - base.points) > 1e-9 ? " (" + f2(w) + " weighted)" : "") + (st === "planned" ? " · hypothetical" : "");
      }
      input.addEventListener("input", function () {
        var r = E.parseGradeInput(input.value, S.settings);
        if (!r.ok) { err.textContent = r.error; input.setAttribute("aria-invalid", "true"); return; }
        err.textContent = ""; input.setAttribute("aria-invalid", "false");
        if (r.entry) c.grades["q" + q] = r.entry; else delete c.grades["q" + q];
        queueSave();
        cells.forEach(function (x) { x.update(); });
      });
      cells.push({ update: update });
      update();
      return cell;
    }

    function classCard(c) {
      var card = h("div", { class: "card cls" + (c.include === false ? " off" : ""), "data-testid": "gpa-class", "data-id": c.id });
      var nameErr = h("div", { class: "err", role: "alert" });
      var name = h("input", { class: "in", value: c.name, maxlength: 60, "aria-label": "Class name", "data-testid": "gpa-class-name" });
      name.addEventListener("input", function () {
        var e = E.validateClass({ name: name.value, level: c.level, credits: c.credits });
        nameErr.textContent = e.name || ""; name.setAttribute("aria-invalid", e.name ? "true" : "false");
        if (!e.name) { c.name = name.value.trim(); queueSave(); }
      });
      var level = h("select", { class: "in", "aria-label": "Course level for " + c.name }, E.LEVELS.map(function (l) { return h("option", { value: l, selected: c.level === l }, E.LEVEL_LABEL[l]); }));
      level.addEventListener("change", function () { c.level = level.value; queueSave(); cells.forEach(function (x) { x.update(); }); });
      var credErr = h("div", { class: "err", role: "alert" });
      var cred = h("input", { class: "in", value: String(c.credits), inputmode: "decimal", "aria-label": "Credits for " + c.name });
      cred.addEventListener("input", function () {
        var e = E.validateClass({ name: "x", level: c.level, credits: cred.value });
        credErr.textContent = e.credits || ""; cred.setAttribute("aria-invalid", e.credits ? "true" : "false");
        if (!e.credits) { c.credits = Number(cred.value); queueSave(); }
      });
      var inc = h("input", { type: "checkbox", checked: c.include !== false });
      inc.addEventListener("change", function () { c.include = inc.checked; card.classList.toggle("off", !inc.checked); queueSave(); });
      var del = h("button", { class: "btn sm danger", "aria-label": "Remove " + c.name }, "Remove");
      var delBox = h("div", { class: "row", style: "align-items:center" });
      function askDelete() {
        clear(delBox);
        delBox.appendChild(h("span", { class: "small", role: "alert" }, "Remove this class?"));
        delBox.appendChild(h("button", { class: "btn sm danger", "data-testid": "gpa-confirm-delete", onclick: function () {
          S.classes = S.classes.filter(function (x) { return x.id !== c.id; }); queueSave(); renderList();
        } }, "Yes, remove"));
        delBox.appendChild(h("button", { class: "btn sm", onclick: function () { clear(delBox); delBox.appendChild(del); del.focus(); } }, "Cancel"));
      }
      del.addEventListener("click", askDelete);
      delBox.appendChild(del);

      card.appendChild(h("div", { class: "chead" },
        h("label", { class: "fld wide" }, h("span", { class: "l" }, "Class name"), name, nameErr),
        h("label", { class: "fld" }, h("span", { class: "l" }, "Level"), level),
        h("label", { class: "fld" }, h("span", { class: "l" }, "Credits"), cred, credErr),
        h("label", { class: "chk", title: "Untick to keep the class but leave it out of GPA" }, inc, "Counts toward GPA"),
        delBox));
      if (S.settings.allowCustomWeights) {
        var bo = h("input", { class: "in", value: c.bonusOverride === null || c.bonusOverride === undefined ? "" : String(c.bonusOverride), placeholder: "default for level", inputmode: "decimal", style: "max-width:200px" });
        var boErr = h("div", { class: "err", role: "alert" });
        bo.addEventListener("input", function () {
          var e = E.validateClass({ name: "x", level: c.level, credits: 1, bonusOverride: bo.value.trim() === "" ? null : Number(bo.value) });
          boErr.textContent = e.bonusOverride || ""; bo.setAttribute("aria-invalid", e.bonusOverride ? "true" : "false");
          if (!e.bonusOverride) { c.bonusOverride = bo.value.trim() === "" ? null : Number(bo.value); queueSave(); cells.forEach(function (x) { x.update(); }); }
        });
        card.appendChild(h("label", { class: "fld" }, h("span", { class: "l" }, "Custom weighting bonus for this class (optional)"), bo, boErr));
      }
      card.appendChild(h("div", { class: "qgrid" }, [1, 2, 3, 4].map(function (q) { return gradeCell(c, q); })));
      var notes = h("textarea", { class: "in", rows: 2, maxlength: 300, "aria-label": "Notes for " + c.name, placeholder: "Optional notes (stored only on this device)", value: c.notes || "" });
      notes.addEventListener("input", function () { c.notes = notes.value.slice(0, 300); queueSave(); });
      card.appendChild(h("details", null, h("summary", null, "Notes"), notes));
      return card;
    }

    function renderList(focusId) {
      clear(listBox); cells.length = 0;
      if (!S.classes.length) {
        listBox.appendChild(h("div", { class: "card" }, h("p", { class: "muted", style: "margin:0 0 10px" }, "No classes yet. Add one above, or start from sample class names (no grades are filled in)."),
          h("button", { class: "btn", "data-testid": "gpa-add-samples", onclick: function () {
            ["Honors Algebra II", "AP Computer Science A", "Honors Chemistry", "Probability and Statistics", "Honors American Government", "Honors English"].forEach(function (n) {
              S.classes.push({ id: uid(), name: n, level: /^AP /.test(n) ? "ap" : /^Honors /.test(n) ? "honors" : "regular", credits: 1, include: true, bonusOverride: null, notes: "", grades: {} });
            });
            queueSave(); renderList();
          } }, "Add sample class names")));
        return;
      }
      S.classes.forEach(function (c) { listBox.appendChild(classCard(c)); });
      if (focusId) { var n = listBox.querySelector('[data-id="' + focusId + '"] input'); if (n) n.scrollIntoView({ block: "nearest" }); }
    }
    view.appendChild(addCard);
    view.appendChild(h("div", { class: "banner" }, "Type a percentage (like 87.5) or a letter. Quarters after the current one are ",
      h("strong", null, "planned targets"), " — they're hypothetical and never counted as earned grades. Blank means missing, not zero."));
    view.appendChild(listBox);
    renderList();
    return { refresh: function () { cells.forEach(function (x) { x.update(); }); } };
  }

  /* ------------------------------------------------------------------ GOAL */
  function mountGoal(view) {
    var out = h("div", { class: "stack", "aria-live": "polite", "data-testid": "gpa-goal-results" });
    var target = h("input", { class: "in", value: String(S.goal.target), inputmode: "decimal", style: "max-width:120px", "aria-label": "Target GPA", "data-testid": "gpa-goal-target" });
    var tErr = h("div", { class: "err", role: "alert" });
    var chipsBox = h("div", { class: "chips", role: "group", "aria-label": "Quick targets" });
    var basis = h("select", { class: "in", "aria-label": "Weighted or unweighted" },
      h("option", { value: "weighted", selected: S.goal.basis === "weighted" }, "Weighted GPA"), h("option", { value: "unweighted", selected: S.goal.basis === "unweighted" }, "Unweighted GPA"));
    var scope = h("select", { class: "in", "aria-label": "GPA scope" },
      h("option", { value: "year", selected: S.goal.scope === "year" }, "This year's GPA"), h("option", { value: "cumulative", selected: S.goal.scope === "cumulative" }, "Cumulative GPA"));
    function chips() {
      clear(chipsBox);
      [3.0, 3.3, 3.4, 3.5, 4.0].forEach(function (v) {
        chipsBox.appendChild(h("button", { class: "chipbtn", "aria-pressed": String(Math.abs(S.goal.target - v) < 1e-9), onclick: function () { target.value = v.toFixed(1); commit(); } }, v.toFixed(1)));
      });
    }
    function commit() {
      var v = Number(target.value);
      if (target.value.trim() === "" || !isFinite(v) || v < 0 || v > 15) { tErr.textContent = "Enter a target GPA such as 3.5."; target.setAttribute("aria-invalid", "true"); return; }
      tErr.textContent = ""; target.setAttribute("aria-invalid", "false");
      S.goal.target = v; S.goal.basis = basis.value; S.goal.scope = scope.value;
      queueSave(); chips(); render();
    }
    [target, basis, scope].forEach(function (n) { n.addEventListener(n === target ? "input" : "change", commit); });

    function render() {
      clear(out);
      var r = E.planGoal(S, S.goal);
      out.appendChild(h("div", { class: "banner" }, "Everything below about future quarters is ", h("strong", null, "hypothetical"), ": it shows what grades would be needed, not what you will earn."));
      if (!r.ok) { out.appendChild(h("div", { class: "banner warn", role: "alert", "data-testid": "gpa-goal-reason" }, r.reason)); return; }
      var hdr = h("div", { class: "grid g-stats" },
        h("div", { class: "card stat" }, h("div", { class: "k" }, "Current GPA (" + (r.scope === "cumulative" ? "cumulative" : "year to date") + ")"), h("div", { class: "v" }, r.currentGpa === null ? "—" : f2(r.currentGpa)),
          r.currentGpa === null ? h("div", { class: "note" }, "No earned grades entered yet.") : null),
        h("div", { class: "card stat" }, h("div", { class: "k" }, "Target"), h("div", { class: "v" }, f2(r.target)), h("div", { class: "note" }, r.basis + " · " + (r.scope === "cumulative" ? "cumulative" : "this year"))),
        h("div", { class: "card stat" }, h("div", { class: "k" }, "Remaining"), h("div", { class: "v" }, r.remainingQuarters.map(function (q) { return "Q" + q; }).join(", ")),
          h("div", { class: "note" }, r.slots + " class-quarter" + (r.slots === 1 ? "" : "s") + " still to earn")),
        h("div", { class: "card stat" }, h("div", { class: "k" }, "Highest achievable"), h("div", { class: "v" }, f2(r.maxAchievable)),
          h("div", { class: "note" }, "with the best grade in every remaining slot")));
      out.appendChild(hdr);
      out.appendChild(h("div", { class: "banner " + (r.achievable ? "ok" : "bad"), role: "status", "data-testid": "gpa-goal-verdict" },
        h("strong", null, r.alreadyGuaranteed ? "Already guaranteed. " : r.achievable ? "Reachable. " : "Not reachable. "), r.explanation));
      if (r.gaps && r.gaps.length) {
        var gp = {};
        r.gaps.forEach(function (g) { (gp[g.name] = gp[g.name] || []).push("Q" + g.quarter); });
        out.appendChild(h("div", { class: "banner warn" }, "Earned quarters with no grade are left out: " + Object.keys(gp).map(function (n) { return n + " (" + gp[n].join(", ") + ")"; }).join("; ") + "."));
      }
      if (r.scenarios.length) {
        var sc = h("div", { class: "stack" });
        r.scenarios.forEach(function (s) {
          sc.appendChild(h("div", { class: "scen " + (s.meetsGoal ? "yes" : "no"), "data-testid": "gpa-scenario" },
            h("div", null, h("div", { style: "font-weight:800" }, s.label), h("div", { class: "small muted" }, s.assignments.map(function (a) { return a.count + " × " + a.letter; }).join(" + ") + " across the remaining slots")),
            h("div", { class: "row", style: "align-items:center" }, h("span", { class: "badge b-hyp" }, "Hypothetical"), h("div", { class: "big" }, f2(s.projected)), h("span", { class: "badge " + (s.meetsGoal ? "b-ok" : "b-bad") }, s.meetsGoal ? "Meets goal" : "Short of goal"))));
        });
        out.appendChild(h("div", { class: "card" }, h("h2", null, "Example grade combinations"), sc));
      }
      var ut = h("table", { class: "t" }, h("thead", null, h("tr", null, h("th", null, "If every remaining grade is…"), h("th", null, "From"), h("th", null, "Points"), h("th", null, "Projected GPA"))),
        h("tbody", null, r.uniform.map(function (u) { return h("tr", null, h("td", null, u.letter), h("td", null, u.minPercent + "%"), h("td", null, f2(u.points)), h("td", null, f2(u.projected), " ", h("span", { class: "badge b-hyp" }, "Hypothetical"))); })));
      out.appendChild(h("div", { class: "card" }, h("h2", null, "Same grade everywhere"), h("div", { style: "overflow-x:auto" }, ut)));
      out.appendChild(h("div", { class: "card" }, h("h3", null, "Rules used"), h("ul", { class: "rules" }, E.describeRules(S.settings).map(function (x) { return h("li", null, x); }))));
    }
    view.appendChild(h("div", { class: "card" }, h("h2", null, "Goal planner"),
      h("div", { class: "row" },
        h("label", { class: "fld" }, h("span", { class: "l" }, "Target GPA"), target),
        h("label", { class: "fld", style: "min-width:170px" }, h("span", { class: "l" }, "Measured as"), basis),
        h("label", { class: "fld", style: "min-width:170px" }, h("span", { class: "l" }, "Over"), scope)),
      tErr, h("div", { style: "margin-top:10px" }, chipsBox)));
    view.appendChild(out);
    chips(); render();
    return { refresh: render };
  }

  /* ------------------------------------------------------------------ SETTINGS */
  function mountSettings(view) {
    function commit() { S.settings.reviewed = true; queueSave(); }

    // --- scale ---
    var scaleErr = h("div", { class: "err", role: "alert", "data-testid": "gpa-scale-errors" });
    var scaleBox = h("div");
    function scaleRow(r) {
      var L = h("input", { class: "in", value: r.letter, maxlength: 3, "aria-label": "Letter" });
      var P = h("input", { class: "in", value: String(r.minPercent), inputmode: "decimal", "aria-label": "Minimum percent for " + r.letter });
      var G = h("input", { class: "in", value: String(r.points), inputmode: "decimal", "aria-label": "Grade points for " + r.letter });
      var X = h("button", { class: "btn sm", "aria-label": "Remove row " + r.letter, onclick: function () {
        if (scaleBox.children.length <= 2) { scaleErr.textContent = "Keep at least two rows."; return; }
        row.remove(); read();
      } }, "Remove");
      var row = h("div", { class: "sc-row", "data-row": "" }, L, P, G, X);
      [L, P, G].forEach(function (i) { i.addEventListener("input", read); });
      return row;
    }
    function read() {
      var rows = Array.from(scaleBox.querySelectorAll("[data-row]")).map(function (r) {
        var i = r.querySelectorAll("input");
        return { letter: i[0].value.trim(), minPercent: i[1].value.trim() === "" ? null : Number(i[1].value), points: i[2].value.trim() === "" ? null : Number(i[2].value) };
      });
      var test = Object.assign({}, S.settings, { scale: rows });
      var v = E.validateSettings(test);
      var scaleOnly = v.errors.filter(function (e) { return /^Scale row|lower percentage|0%|Maximum|at least two/.test(e); });
      scaleErr.textContent = scaleOnly.join(" ");
      if (!scaleOnly.length) {
        S.settings.scale = rows;
        dropInvalidLetters();
        commit();
      }
    }
    function dropInvalidLetters() {
      var n = 0;
      S.classes.forEach(function (c) {
        [1, 2, 3, 4].forEach(function (q) {
          var e = c.grades["q" + q];
          if (e && e.t === "l" && !E.rowForLetter(e.v, S.settings)) { delete c.grades["q" + q]; n++; }
        });
      });
      if (n) scaleErr.textContent = n + " letter grade" + (n === 1 ? " was" : "s were") + " removed because that letter no longer exists in your scale.";
    }
    function renderScale() {
      clear(scaleBox);
      S.settings.scale.slice().sort(function (a, b) { return b.minPercent - a.minPercent; }).forEach(function (r) { scaleBox.appendChild(scaleRow(r)); });
    }
    renderScale();
    var addRow = h("button", { class: "btn sm", onclick: function () { scaleBox.appendChild(scaleRow({ letter: "", minPercent: "", points: "" })); scaleBox.lastChild.querySelector("input").focus(); } }, "Add a row (for + / − grades)");
    view.appendChild(h("div", { class: "card" }, h("h2", null, "Grade scale"),
      h("p", { class: "muted small", style: "margin:0 0 8px" }, "Match your school. Percentages use these boundaries; you can add plus/minus rows if your school uses them."),
      h("div", { class: "sc-row small muted", "aria-hidden": "true" }, h("span", null, "Letter"), h("span", null, "From %"), h("span", null, "GPA points"), h("span")),
      scaleBox, h("div", { class: "row", style: "margin-top:6px" }, addRow), scaleErr));

    // --- weighting ---
    var wErr = h("div", { class: "err", role: "alert" });
    var mode = h("select", { class: "in", "aria-label": "Weighting rule" },
      h("option", { value: "additive", selected: S.settings.weightMode === "additive" }, "Add the bonus to every grade"),
      h("option", { value: "additive-passing", selected: S.settings.weightMode === "additive-passing" }, "Add the bonus only to passing grades"),
      h("option", { value: "none", selected: S.settings.weightMode === "none" }, "No course weighting"));
    mode.addEventListener("change", function () { S.settings.weightMode = mode.value; commit(); });
    function bonusField(l) {
      var inp = h("input", { class: "in", value: String(S.settings.levelBonus[l]), inputmode: "decimal", style: "max-width:110px" });
      inp.addEventListener("input", function () {
        var v = Number(inp.value);
        if (inp.value.trim() === "" || !isFinite(v) || v < 0 || v > 5) { wErr.textContent = E.LEVEL_LABEL[l] + " weighting must be between 0 and 5."; inp.setAttribute("aria-invalid", "true"); return; }
        wErr.textContent = ""; inp.setAttribute("aria-invalid", "false"); S.settings.levelBonus[l] = v; commit();
      });
      return h("label", { class: "fld" }, h("span", { class: "l" }, E.LEVEL_LABEL[l] + " bonus"), inp);
    }
    var custom = h("input", { type: "checkbox", checked: S.settings.allowCustomWeights });
    custom.addEventListener("change", function () { S.settings.allowCustomWeights = custom.checked; commit(); });
    view.appendChild(h("div", { class: "card" }, h("h2", null, "Course weighting"),
      h("div", { class: "row" }, h("label", { class: "fld", style: "min-width:260px" }, h("span", { class: "l" }, "Rule"), mode), bonusField("regular"), bonusField("honors"), bonusField("ap")),
      wErr, h("div", { style: "margin-top:10px" }, h("label", { class: "chk" }, custom, "Allow a custom weighting bonus on individual classes")),
      h("p", { class: "muted small", style: "margin:8px 0 0" }, "Example: a 4.0 scale with Honors +1.0 and AP +1.5. These are starting values, not universal — set what your school uses.")));

    // --- credits & missing ---
    var cw = h("input", { type: "checkbox", checked: S.settings.creditWeighted });
    cw.addEventListener("change", function () { S.settings.creditWeighted = cw.checked; commit(); });
    var mz = h("input", { type: "checkbox", checked: S.settings.missingAsZero });
    mz.addEventListener("change", function () { S.settings.missingAsZero = mz.checked; commit(); });
    var mpErr = h("div", { class: "err", role: "alert" });
    var mp = h("input", { class: "in", value: String(S.settings.maxPercent), inputmode: "decimal", style: "max-width:110px" });
    mp.addEventListener("input", function () {
      var v = Number(mp.value);
      if (mp.value.trim() === "" || !isFinite(v) || v < 100 || v > 200) { mpErr.textContent = "Maximum percentage must be between 100 and 200."; mp.setAttribute("aria-invalid", "true"); return; }
      mpErr.textContent = ""; mp.setAttribute("aria-invalid", "false"); S.settings.maxPercent = v; commit();
    });
    view.appendChild(h("div", { class: "card stack" }, h("h2", null, "Credits & missing grades"),
      h("label", { class: "chk" }, cw, "Weight GPA by each class's credits (off = every class counts equally)"),
      h("label", { class: "chk" }, mz, "Count missing grades as 0 (not recommended — missing grades are normally left out)"),
      h("label", { class: "fld" }, h("span", { class: "l" }, "Highest percentage you can enter (raise above 100 if extra credit is allowed)"), mp), mpErr));

    // --- history ---
    function histField(key, label, hint, max) {
      var cur = S.history[key];
      var err = h("div", { class: "err", role: "alert" });
      var inp = h("input", { class: "in", value: cur === null || cur === undefined ? "" : String(cur), inputmode: "decimal", placeholder: hint, style: "max-width:170px", "data-testid": "gpa-hist-" + key });
      inp.addEventListener("input", function () {
        if (inp.value.trim() === "") { S.history[key] = null; err.textContent = ""; inp.setAttribute("aria-invalid", "false"); queueSave(); return; }
        var v = Number(inp.value);
        if (!isFinite(v) || v < 0 || v > max || (key === "credits" && v <= 0)) { err.textContent = "Enter a number from " + (key === "credits" ? ">0" : "0") + " to " + max + "."; inp.setAttribute("aria-invalid", "true"); return; }
        err.textContent = ""; inp.setAttribute("aria-invalid", "false"); S.history[key] = v; queueSave();
      });
      return h("label", { class: "fld" }, h("span", { class: "l" }, label), inp, err);
    }
    view.appendChild(h("div", { class: "card" }, h("h2", null, "Cumulative history (optional)"),
      h("p", { class: "muted small", style: "margin:0 0 8px" }, "For a cumulative GPA, enter your GPA from earlier years and the total credits (or number of classes, if credit weighting is off) it covers. Without both, a cumulative figure can't be calculated reliably."),
      h("div", { class: "row" }, histField("unweightedGpa", "Earlier unweighted GPA", "e.g. 3.40", 10), histField("weightedGpa", "Earlier weighted GPA", "e.g. 3.85", 15), histField("credits", "Credits (or classes) it covers", "e.g. 14", 999))));

    // --- data ---
    var persist = h("input", { type: "checkbox", checked: S.settings.persist, "data-testid": "gpa-persist" });
    persist.addEventListener("change", function () { S.settings.persist = persist.checked; commit(); flushSave(); });
    var resetBox = h("div", { class: "row", style: "align-items:center" });
    function resetIdle() {
      clear(resetBox);
      resetBox.appendChild(h("button", { class: "btn danger", "data-testid": "gpa-reset", onclick: function () {
        clear(resetBox);
        resetBox.appendChild(h("span", { role: "alert", class: "small" }, "Erase all classes, grades, settings and history?"));
        resetBox.appendChild(h("button", { class: "btn danger", "data-testid": "gpa-reset-confirm", onclick: function () {
          clearTimeout(saveTimer); saveTimer = null;
          S = E.defaultState();
          storeRemove(KEY).then(function () { renderQbar(); show("settings"); });
        } }, "Yes, erase everything"));
        resetBox.appendChild(h("button", { class: "btn", onclick: resetIdle }, "Cancel"));
      } }, "Reset all calculator data"));
    }
    resetIdle();
    view.appendChild(h("div", { class: "card stack" }, h("h2", null, "Your data"),
      h("label", { class: "chk" }, persist, "Remember my entries on this device (local only)"),
      h("p", { class: "muted small", style: "margin:0" }, "Everything here is typed by you and kept in this browser's extension storage. It's never sent anywhere and never read from Infinite Campus. Turn the box off to keep entries only until you close the calculator."),
      resetBox));
    return {};
  }

  root.BetterCampusGPA = { open: open, close: close };
  if (typeof module !== "undefined" && module.exports) module.exports = root.BetterCampusGPA;
})(typeof globalThis !== "undefined" ? globalThis : this);
