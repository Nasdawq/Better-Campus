/* Better Campus — theme engine (v1.2: light theme only)
 *
 * Loaded BEFORE content.js. It does three things:
 *   1. Publishes the portal stylesheet (globalThis.__BC_PORTAL_CSS__) which content.js injects when a
 *      theme is active. All colours come from ONE token table (TOKENS below) — no scattered overrides.
 *   2. Tags floating panels (menus, dialogs, notification / user panels) with data-bc-floating so they
 *      always get their own, correctly-paired surface — even when they live inside the header.
 *   3. Runs a small, incremental "contrast guard" that repairs text/surfaces the stylesheet cannot know
 *      about (unknown portal classes). It never reads or stores page content; it only reads computed
 *      colours and writes colour overrides, and every override is reverted on theme change.
 *
 * Nothing here touches grades, assignments or any academic data.
 */
(function (root) {
  "use strict";

  /* ------------------------------------------------------------------ tokens */
  var TOKENS = {
    light: {
      page: "#F3F4F6", surface: "#FFFFFF", surface2: "#F3F4F6", elev: "#FFFFFF", nav: "#FFFFFF",
      fg: "#0A0A0A", fg2: "#374151", muted: "#4B5563", icon: "#111111", icon2: "#4B5563",
      border: "#E5E7EB", borderStrong: "#6B7280", link: "#0B5BD3", accent: "#1D4ED8", accentFg: "#FFFFFF",
      hover: "#E8EAEE", focus: "#1D4ED8", disabled: "#9CA3AF",
      shadow: "0 8px 24px rgba(15,23,42,.14)", rgb: "255,255,255",
      logoFilter: "brightness(0)", iconFilter: "brightness(0)", scheme: "light",
    },
  };

  function tokenDecls(set) {
    var t = TOKENS[set];
    return (
      "--bc-s-page:" + t.page + ";--bc-s-surface:" + t.surface + ";--bc-s-surface2:" + t.surface2 +
      ";--bc-s-elev:" + t.elev + ";--bc-s-nav:" + t.nav + ";--bc-s-fg:" + t.fg + ";--bc-s-fg2:" + t.fg2 +
      ";--bc-s-muted:" + t.muted + ";--bc-s-icon:" + t.icon + ";--bc-s-icon2:" + t.icon2 +
      ";--bc-s-border:" + t.border + ";--bc-s-border-strong:" + t.borderStrong + ";--bc-s-link:" + t.link +
      ";--bc-s-accent:" + t.accent + ";--bc-s-accent-fg:" + t.accentFg + ";--bc-s-hover:" + t.hover +
      ";--bc-s-focus:" + t.focus + ";--bc-s-disabled:" + t.disabled + ";--bc-s-shadow:" + t.shadow +
      ";--bc-s-rgb:" + t.rgb + ";--bc-s-logo-filter:" + t.logoFilter + ";--bc-s-icon-filter:" + t.iconFilter + ";"
    );
  }
  /* "page" tokens = what bare page text/links/icons use. By default identical to the theme's surface
     tokens; a background preset of the opposite tone swaps them (see tone rules below). */
  var PAGE_FROM_SURFACE =
    "--bc-fg:var(--bc-s-fg);--bc-fg2:var(--bc-s-fg2);--bc-muted:var(--bc-s-muted);--bc-icon:var(--bc-s-icon);" +
    "--bc-icon2:var(--bc-s-icon2);--bc-link:var(--bc-s-link);--bc-border:var(--bc-s-border);" +
    "--bc-border-strong:var(--bc-s-border-strong);--bc-accent:var(--bc-s-accent);--bc-accent-fg:var(--bc-s-accent-fg);" +
    "--bc-hover:var(--bc-s-hover);--bc-focus:var(--bc-s-focus);--bc-disabled:var(--bc-s-disabled);" +
    "--bc-surface:var(--bc-s-surface);--bc-surface2:var(--bc-s-surface2);--bc-elev:var(--bc-s-elev);" +
    "--bc-nav:var(--bc-s-nav);--bc-shadow:var(--bc-s-shadow);--bc-rgb:var(--bc-s-rgb);" +
    "--bc-logo-filter:var(--bc-s-logo-filter);--bc-icon-filter:var(--bc-s-icon-filter);";

  /* ------------------------------------------------------------------ selectors */
  var FLOAT_SEL = [
    '[role="menu"]', '[role="dialog"]', '[role="alertdialog"]', '[role="listbox"]', '[role="tooltip"]',
    '[aria-modal="true"]', "dialog", ".dropdown-menu", ".popover", ".modal-content", ".mat-menu-panel",
    ".mat-mdc-menu-panel", ".mat-mdc-dialog-surface", ".mat-dialog-container", ".mat-select-panel",
    ".mat-mdc-select-panel", ".mat-autocomplete-panel", ".mdc-menu-surface", ".cdk-overlay-pane",
    ".ui-dialog", ".k-popup", ".k-window", ".tooltip-inner",
    '[class*="notification" i][class*="panel" i]', '[class*="notification" i][class*="menu" i]',
    '[class*="notification" i][class*="dropdown" i]', '[class*="notification" i][class*="flyout" i]',
    '[class*="user" i][class*="menu" i]', '[class*="profile" i][class*="menu" i]',
    '[class*="user" i][class*="panel" i]', '[class*="user" i][class*="dropdown" i]',
    '[class*="message" i][class*="center" i][class*="panel" i]',
    '[class*="popover" i]', '[class*="flyout" i]', '[class*="dropdown" i][class*="panel" i]',
    '[class*="dropdown" i][class*="menu" i]', '[class*="overlay-panel" i]',
  ].join(",");

  /* Exact UI labels that only appear inside these panels. Used ONLY to locate the panel element
     so it can be given a surface; no text is read, stored or sent anywhere. */
  var FLOAT_LABELS = [
    "mark all as read", "message center", "user menu", "profile options", "linked districts",
    "manage districts", "log off", "give feedback", "about campus sis",
  ];

  var NAV_SEL = 'header, [role="banner"], .app-header, .campus-header, #header, .navbar, .mat-toolbar, .mat-mdc-toolbar';
  var CARD_SEL = [
    ".card", ".panel", ".tile", ".widget", ".box", ".well", ".course-card", ".grade-card", ".notice",
    "mat-card", ".mat-card", ".mat-mdc-card",
    "section.content-section",
  ].join(",");
  var LOGO_SEL = [
    'img[alt*="campus" i]', 'img[alt*="infinite" i]', 'img[src*="logo" i]', 'img[class*="logo" i]',
    '[class*="logo" i] img', '[class*="logo" i] > svg', 'svg[class*="logo" i]', '[class*="brand" i] img',
    '[class*="brand" i] > svg', '[id*="logo" i] img', '[id*="logo" i] > svg',
  ].join(",");

  /* ------------------------------------------------------------------ stylesheet */
  var H = "html[data-bc-theme]";
  function buildCss() {
    var s = [];
    // --- 1. tokens ---------------------------------------------------------------------------------
    s.push(H + '[data-bc-theme="light"]{' + tokenDecls("light") + "color-scheme:light}");
    s.push(H + "{" + PAGE_FROM_SURFACE + "--bcp-bg:var(--bc-s-page);--bcp-scrim:1;--bc-font:'Plus Jakarta Sans',ui-sans-serif,system-ui,-apple-system,'Segoe UI',sans-serif}");
    // Explicit light surface variant: any subtree can opt in and every token inside it re-resolves.
    s.push(
      H + ' [data-bc-surface="light"]{' + tokenDecls("light") + PAGE_FROM_SURFACE +
        "background-color:var(--bc-surface);color:var(--bc-fg);color-scheme:light}"
    );
    // A dark background preset / image: bare-page text, icons and borders flip to light. Cards keep theme tokens.
    s.push(
      H + '[data-bc-bg][data-bc-bg-tone="dark"]{--bc-fg:#F8FAFC;--bc-fg2:#E2E8F0;--bc-muted:#CBD5E1;--bc-icon:#F1F5F9;--bc-icon2:#CBD5E1;--bc-link:#9CC4FF;--bc-border:rgba(255,255,255,.28)}'
    );
    // Components that own a surface re-assert the theme tokens (so they never inherit bare-page tokens).
    var OWN = NAV_SEL + "," + CARD_SEL + ",[data-bc-floating],nav,aside,table,dialog,[role=dialog],[role=menu]";
    s.push(H + " :is(" + OWN + "){" + PAGE_FROM_SURFACE + "}");
    // Re-assert the explicit surface after OWN so a surface attribute always wins.
    s.push(H + ' :is(' + OWN + ')[data-bc-surface="light"]{' + tokenDecls("light") + PAGE_FROM_SURFACE + "}");

    // --- 2. page ----------------------------------------------------------------------------------
    s.push(H + ":not([data-bc-bg]),html[data-bc-theme]:not([data-bc-bg]) body{background-color:var(--bc-s-page)!important}");
    s.push(H + " body{color:var(--bc-fg)!important;-webkit-font-smoothing:antialiased}");
    s.push(
      H + " body :is(app-root,#app,#root,.app-root,main,[role=main],.main-content,.app-content,#main,.content-wrapper,.page-content){" +
        "background-color:transparent!important;color:var(--bc-fg)}"
    );
    s.push(
      H + " body :is(h1,h2,h3,h4,h5,h6,p,li,dt,dd,legend,label,td,th,caption,figcaption){color:var(--bc-fg)!important}"
    );
    s.push(H + " body :is(.text-muted,.muted,.subtitle,.meta,.help-text,small,[class*=secondary-text i]){color:var(--bc-muted)!important}");
    s.push(H + " ::selection{background:color-mix(in srgb,var(--bc-accent) 35%,transparent)}");
    s.push(H + " hr{border-color:var(--bc-border)!important}");
    // Links: blue links in content; menu/nav links keep the foreground token.
    s.push(
      H + " body a:not(:is(" + NAV_SEL + ",nav,aside,[data-bc-floating],[role=menu],[role=tablist],[role=button],.btn,.tabs,.mat-mdc-button,.mat-button) *):not(.btn):not([role=button]){" +
        "color:var(--bc-link)!important;text-underline-offset:2px}"
    );
    // focus ring
    s.push(H + " :focus-visible{outline:2px solid var(--bc-focus)!important;outline-offset:2px!important}");
    s.push(H + " :is(:disabled,[aria-disabled=true]){opacity:.55}");

    // --- 3. surfaces ------------------------------------------------------------------------------
    var cardBg = "background-color:rgba(var(--bc-rgb),var(--bcp-scrim))!important;";
    s.push(
      H + " body :is(" + CARD_SEL + "){" + cardBg + "color:var(--bc-fg)!important;border-color:var(--bc-border)!important;box-shadow:0 1px 3px rgba(15,23,42,.10)}"
    );
    s.push(H + " body :is(.card-header,.panel-heading,.section-header,.page-title){background:transparent!important;color:var(--bc-fg)!important;border-color:var(--bc-border)!important}");
    s.push(H + " body :is(footer,.footer){background:transparent!important;color:var(--bc-muted)!important;border-color:var(--bc-border)!important}");
    s.push(
      H + " body table{" + cardBg + "border-color:var(--bc-border)!important}"
    );
    s.push(H + " body :is(th,thead td){background-color:var(--bc-surface2)!important;color:var(--bc-fg2)!important;border-color:var(--bc-border)!important}");
    s.push(H + " body td{border-color:var(--bc-border)!important}");
    s.push(H + " body tbody tr:hover>td:not([style*=background]){background-color:var(--bc-hover)}");

    // --- 4. nav / header ----------------------------------------------------------------------------
    s.push(
      H + " body :is(" + NAV_SEL + "){background-color:var(--bc-nav)!important;color:var(--bc-fg)!important;" +
        "border-bottom-color:var(--bc-border)!important;box-shadow:0 1px 0 var(--bc-border)!important}"
    );
    s.push(
      H + " body :is(" + NAV_SEL + ") :is(a,button,span,i,p,h1,h2,h3,label,li,div,strong,[class*=icon i],.material-icons,mat-icon):not(:is([class*=badge i],[class*=unread i],[class*=count i],[class*=indicator i],[data-bc-keep]) *):not([class*=badge i]):not([class*=unread i]):not([class*=count i]):not([class*=indicator i]):not([data-bc-keep]){" +
        "color:var(--bc-fg)!important}"
    );
    s.push(
      H + " body :is(" + NAV_SEL + ",nav,aside,[data-bc-floating]) :is(i,[class*=icon i],.material-icons,mat-icon,[class*=glyph i]):not([data-bc-keep]){color:var(--bc-icon)!important}"
    );
    // SVG icons (outline icons keep fill:none)
    s.push(
      H + " body :is(" + NAV_SEL + ",nav,aside,[data-bc-floating]) svg:not([fill=none]):not(:is(" + LOGO_SEL + ")):not([data-bc-keep]) :is(path,circle,rect,polygon,ellipse):not([fill=none]){fill:var(--bc-icon)!important}"
    );
    s.push(
      H + " body :is(" + NAV_SEL + ",nav,aside,[data-bc-floating]) svg:not(:is(" + LOGO_SEL + ")):not([data-bc-keep]) :is(path,circle,rect,polygon,polyline,line,ellipse)[stroke]:not([stroke=none]){stroke:var(--bc-icon)!important}"
    );
    // <img> icons inside controls (not avatars/photos)
    s.push(
      H + " body :is(" + NAV_SEL + ",nav,[data-bc-floating]) :is(button,[role=button],a)>img:not(:is(" + LOGO_SEL + ")):not([class*=avatar i]):not([class*=photo i]):not([class*=picture i]):not([data-bc-keep]){filter:var(--bc-icon-filter)}"
    );
    // Logo: monochrome treatment scoped to the logo only (black on the light surface).
    s.push(H + " body :is(" + NAV_SEL + ",nav,aside,[data-bc-floating]) :is(" + LOGO_SEL + "){filter:var(--bc-logo-filter)!important;opacity:1!important}");
    s.push(H + " body :is(" + NAV_SEL + ") :is(" + LOGO_SEL + ") :is(path,circle,rect,polygon,g){fill:currentColor}");
    // sidebar / nav
    s.push(
      H + " body :is(nav,aside,.navigation,.sidebar,.side-nav,.app-sidebar,#navigation):not(:is(" + NAV_SEL + ")){" + cardBg +
        "color:var(--bc-fg)!important;border-color:var(--bc-border)!important}"
    );
    s.push(H + " body :is(nav,aside,.navigation,.sidebar) a:not([aria-current=page]):not(.active){color:var(--bc-fg)!important}");
    s.push(H + " body :is(nav,aside,.navigation,.sidebar) a:hover{background-color:var(--bc-hover)!important}");
    s.push(
      H + " body :is(nav,aside,.navigation,.sidebar) :is(a.active,a[aria-current=page],.active>a,.selected,[aria-selected=true]){" +
        "background-color:color-mix(in srgb,var(--bc-accent) 14%,transparent)!important;color:var(--bc-accent)!important;font-weight:700}"
    );

    // --- 5. floating panels (notification, user menu, dropdowns, dialogs) -------------------------
    s.push(
      H + " body [data-bc-floating][data-bc-floating]{background-color:var(--bc-elev)!important;color:var(--bc-fg)!important;" +
        "border-color:var(--bc-border)!important;border-radius:12px!important;box-shadow:0 0 0 1px var(--bc-border),var(--bc-shadow)!important;opacity:1;" +
        "backdrop-filter:none!important;-webkit-backdrop-filter:none!important;scrollbar-color:var(--bc-border-strong) transparent}"
    );
    s.push(
      H + " [data-bc-floating] :is(div,span,p,li,ul,a,button,h1,h2,h3,h4,h5,h6,label,strong,em,b,td,th,dt,dd,small,time,legend,[role=menuitem],[role=option]):not([class*=badge i]):not([class*=unread-dot i]):not([data-bc-keep]){" +
        "color:var(--bc-fg)!important}"
    );
    s.push(
      H + " [data-bc-floating] :is([class*=time i],[class*=date i],[class*=stamp i],[class*=muted i],[class*=secondary i],[class*=subtitle i],[class*=description i],[class*=meta i],time,small){color:var(--bc-fg2)!important}"
    );
    s.push(H + " [data-bc-floating] *{border-color:var(--bc-border)!important}");
    s.push(H + " [data-bc-floating] :is(hr,[class*=divider i],[class*=separator i]){border-color:var(--bc-border)!important;background-color:var(--bc-border)}");
    s.push(H + " [data-bc-floating] :is(li,[role=menuitem],[role=option]):hover{background-color:var(--bc-hover)!important}");
    s.push(H + " [data-bc-floating] :is(button,a,[role=menuitem]):not([class*=btn i]):not([class*=button i]){background-color:transparent}");
    s.push(H + " [data-bc-floating] :is(a,button):not(.btn):not([class*=btn i]){text-decoration:none}");
    s.push(H + " [data-bc-floating] p a{color:var(--bc-link)!important;text-decoration:underline}");
    s.push(H + " [data-bc-floating] [class*=unread i]:not([class*=dot i]):not([class*=badge i]){background-color:color-mix(in srgb,var(--bc-accent) 9%,transparent)!important}");
    s.push(H + " [data-bc-floating] :is(input[type=checkbox],input[type=radio]){accent-color:var(--bc-accent);opacity:1}");
    s.push(H + " [data-bc-floating] svg:not(:is(" + LOGO_SEL + ")):not([data-bc-keep]) :is(path,circle,rect,polygon,ellipse):not([fill=none]){fill:var(--bc-icon)!important}");

    // --- 6. controls -------------------------------------------------------------------------------
    s.push(
      H + " body :is(input:not([type=checkbox]):not([type=radio]):not([type=range]):not([type=color]):not([type=submit]):not([type=button]):not([type=file]),select,textarea){" +
        "background-color:var(--bc-s-surface2)!important;color:var(--bc-s-fg)!important;border-color:var(--bc-s-border-strong)!important}"
    );
    s.push(H + " body :is(input,textarea)::placeholder{color:var(--bc-s-muted)!important;opacity:1}");
    s.push(H + " body :is(input,select,textarea):focus{border-color:var(--bc-s-focus)!important;box-shadow:0 0 0 3px color-mix(in srgb,var(--bc-s-focus) 35%,transparent)!important}");
    s.push(
      H + " body :is(.btn,input[type=submit],input[type=button],.mat-mdc-outlined-button,.mat-stroked-button){" +
        "background-color:var(--bc-s-surface2)!important;color:var(--bc-s-fg)!important;border-color:var(--bc-s-border-strong)!important}"
    );
    s.push(H + " body :is(.btn,input[type=submit],input[type=button]):hover{background-color:var(--bc-s-hover)!important}");
    s.push(
      H + " body :is(.btn-primary,.button--primary,button[type=submit],input[type=submit],.mat-mdc-unelevated-button.mat-primary,.mat-flat-button.mat-primary){" +
        "background-color:var(--bc-s-accent)!important;color:var(--bc-s-accent-fg)!important;border-color:transparent!important}"
    );
    s.push(H + " body :is(.btn-primary,.button--primary,button[type=submit]) :is(span,i){color:var(--bc-s-accent-fg)!important}");
    s.push(H + " body :is(.modal-content,dialog,[role=dialog],.mat-mdc-dialog-surface){background-color:var(--bc-elev)!important;color:var(--bc-fg)!important}");

    // --- 7. background presets (kept from v1.0) -----------------------------------------------------
    s.push(H + "[data-bc-bg]{--bcp-scrim:var(--bcp-scrim-user,.85)}");
    s.push(
      H + "[data-bc-bg] body{background:var(--bcp-bg-layer)!important;background-attachment:fixed!important;" +
        "background-size:var(--bcp-bg-size,cover)!important;background-position:var(--bcp-bg-pos,center)!important;background-repeat:no-repeat!important}"
    );
    s.push(
      H + "[data-bc-bg] body :is(" + CARD_SEL + ",table,nav,aside,.navigation,.sidebar){backdrop-filter:blur(14px) saturate(1.1);-webkit-backdrop-filter:blur(14px) saturate(1.1)}"
    );
    s.push("@media (prefers-reduced-motion:reduce){" + H + " *{transition:none!important;animation:none!important}}");
    return s.join("\n");
  }

  var CSS = buildCss();
  root.__BC_PORTAL_CSS__ = CSS;
  root.__BC_THEME_TOKENS__ = TOKENS;

  /* Node (unit tests) */
  if (typeof module !== "undefined" && module.exports) {
    module.exports = { TOKENS: TOKENS, buildCss: buildCss, FLOAT_SEL: FLOAT_SEL };
  }
  if (typeof document === "undefined" || typeof MutationObserver === "undefined") return;

  /* ------------------------------------------------------------------ runtime guard */
  var HOST_ID = "better-campus-root";
  var doc = document;
  var html = doc.documentElement;
  var obs = null;
  var queue = new Set();
  var scheduled = false;
  var contrastRoots = new Set();
  var working = false;

  function themeOf() {
    var v = html.getAttribute("data-bc-theme");
    return v === "light" ? v : null;
  }
  function isMine(el) {
    return !!(el && el.closest && (el.id === HOST_ID || el.closest("#" + HOST_ID)));
  }

  /* ---- colour helpers ---- */
  function parseColor(str) {
    if (!str) return null;
    var m = str.match(/rgba?\(([^)]+)\)/);
    if (!m) return null;
    var p = m[1].split(/[ ,/]+/).filter(Boolean).map(parseFloat);
    if (p.length < 3 || p.some(isNaN)) return null;
    return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 };
  }
  function lin(c) {
    c /= 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  }
  function lum(c) {
    return 0.2126 * lin(c.r) + 0.7152 * lin(c.g) + 0.0722 * lin(c.b);
  }
  function ratio(a, b) {
    var l1 = lum(a), l2 = lum(b);
    return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
  }
  function over(fg, bg) {
    var a = fg.a;
    return { r: fg.r * a + bg.r * (1 - a), g: fg.g * a + bg.g * (1 - a), b: fg.b * a + bg.b * (1 - a), a: 1 };
  }
  function rgb2hsl(c) {
    var r = c.r / 255, g = c.g / 255, b = c.b / 255;
    var max = Math.max(r, g, b), min = Math.min(r, g, b), h = 0, s = 0, l = (max + min) / 2;
    if (max !== min) {
      var d = max - min;
      s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
      if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
      else if (max === g) h = (b - r) / d + 2;
      else h = (r - g) / d + 4;
      h /= 6;
    }
    return { h: h, s: s, l: l };
  }
  function hsl2rgb(c) {
    var h = c.h, s = c.s, l = c.l;
    function f(p, q, t) {
      if (t < 0) t += 1;
      if (t > 1) t -= 1;
      if (t < 1 / 6) return p + (q - p) * 6 * t;
      if (t < 1 / 2) return q;
      if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
      return p;
    }
    if (s === 0) { var v = l * 255; return { r: v, g: v, b: v, a: 1 }; }
    var q = l < 0.5 ? l * (1 + s) : l + s - l * s, p = 2 * l - q;
    return { r: f(p, q, h + 1 / 3) * 255, g: f(p, q, h) * 255, b: f(p, q, h - 1 / 3) * 255, a: 1 };
  }
  function saturationOf(c) {
    var max = Math.max(c.r, c.g, c.b), min = Math.min(c.r, c.g, c.b);
    return max === 0 ? 0 : (max - min) / max;
  }
  /* Move lightness (keeping hue) until contrast >= target. */
  function adjustForContrast(fg, bg, target) {
    var hsl = rgb2hsl(fg), bgL = lum(bg), up = bgL < 0.4;
    var lo = up ? hsl.l : 0, hi = up ? 1 : hsl.l, best = up ? 1 : 0;
    for (var i = 0; i < 14; i++) {
      var mid = (lo + hi) / 2;
      var cand = hsl2rgb({ h: hsl.h, s: hsl.s, l: mid });
      if (ratio(cand, bg) >= target) {
        best = mid;
        if (up) hi = mid; else lo = mid;
      } else {
        if (up) lo = mid; else hi = mid;
      }
    }
    var out = hsl2rgb({ h: hsl.h, s: hsl.s, l: best });
    if (ratio(out, bg) < target) out = up ? { r: 255, g: 255, b: 255 } : { r: 0, g: 0, b: 0 };
    return "rgb(" + Math.round(out.r) + "," + Math.round(out.g) + "," + Math.round(out.b) + ")";
  }

  /* ---- floating panels ---- */
  function tagFloating(el) {
    if (!themeOf()) return;
    if (!el.hasAttribute("data-bc-floating")) el.setAttribute("data-bc-floating", "");
    if (el.getAttribute("data-bc-surface") !== "light") el.setAttribute("data-bc-surface", "light");
  }
  function floatingAncestor(el) {
    var n = el, hops = 0;
    while (n && n !== doc.body && n !== html && hops < 10) {
      var cs = getComputedStyle(n);
      if ((cs.position === "absolute" || cs.position === "fixed") && n.matches("div,section,aside,ul,nav,form,mat-card,app-root *")) {
        var r = n.getBoundingClientRect();
        if (r.width === 0 || r.width <= 720) return n;
      }
      n = n.parentElement;
      hops++;
    }
    return null;
  }
  function scanFloating(node) {
    if (node.nodeType !== 1 || isMine(node)) return;
    if (node.matches(FLOAT_SEL)) tagFloating(node);
    var list = node.querySelectorAll(FLOAT_SEL);
    for (var i = 0; i < list.length && i < 200; i++) if (!isMine(list[i])) tagFloating(list[i]);
    // label-based discovery (only exact, short UI labels)
    var w = doc.createTreeWalker(node, NodeFilter.SHOW_TEXT, null);
    var t, seen = 0;
    while ((t = w.nextNode()) && seen < 4000) {
      seen++;
      var v = t.nodeValue;
      if (!v || v.length > 24) continue;
      v = v.trim().toLowerCase();
      if (v && FLOAT_LABELS.indexOf(v) !== -1) {
        var fa = floatingAncestor(t.parentElement);
        if (fa && !isMine(fa)) tagFloating(fa);
      }
    }
  }
  function retagAllFloating() {
    var th = themeOf();
    doc.querySelectorAll("[data-bc-floating]").forEach(function (el) {
      if (th) el.setAttribute("data-bc-surface", "light");
      else { el.removeAttribute("data-bc-floating"); el.removeAttribute("data-bc-surface"); }
    });
  }

  /* ---- background tone (explicit per preset; sampled for user images) ---- */
  var DARK_PRESET_HINTS = ["#0b1220", "#0f172a", "#111827"];
  var toneToken = 0;
  function setTone(v) {
    var prev = html.getAttribute("data-bc-bg-tone");
    if (v === null) { if (prev !== null) html.removeAttribute("data-bc-bg-tone"); }
    else if (prev !== v) html.setAttribute("data-bc-bg-tone", v);
    else return;
    if (themeOf() && doc.body && typeof revertFixes === "function") { revertFixes(); enqueue(doc.body); }
  }
  function updateTone() {
    var th = themeOf();
    var kind = html.getAttribute("data-bc-bg");
    if (!th || !kind) { setTone(null); return; }
    var layer = (html.style.getPropertyValue("--bcp-bg-layer") || "").toLowerCase();
    if (kind === "preset") {
      var dark = DARK_PRESET_HINTS.some(function (h) { return layer.indexOf(h) !== -1; });
      setTone(dark ? "dark" : "light");
      return;
    }
    var m = layer.match(/url\("?([^")]+)"?\)/);
    if (!m) { setTone(th); return; }
    var my = ++toneToken;
    var img = new Image();
    img.onload = function () {
      if (my !== toneToken) return;
      try {
        var c = doc.createElement("canvas");
        c.width = c.height = 16;
        var ctx = c.getContext("2d");
        ctx.drawImage(img, 0, 0, 16, 16);
        var d = ctx.getImageData(0, 0, 16, 16).data, sum = 0;
        for (var i = 0; i < d.length; i += 4) sum += lum({ r: d[i], g: d[i + 1], b: d[i + 2] });
        setTone(sum / 256 > 0.4 ? "light" : "dark");
      } catch (e) {
        setTone(th);
      }
    };
    img.onerror = function () { setTone(th); };
    img.src = m[1];
  }

  /* ---- contrast guard ---- */
  var SKIP_TAGS = { SCRIPT: 1, STYLE: 1, NOSCRIPT: 1, SVG: 1, IMG: 1, CANVAS: 1, VIDEO: 1, IFRAME: 1, INPUT: 1, SELECT: 1, TEXTAREA: 1, OPTION: 1, BR: 1, HR: 1, LINK: 1, META: 1, PATH: 1 };
  var CONTAINER_TAGS = { DIV: 1, SECTION: 1, ARTICLE: 1, ASIDE: 1, UL: 1, OL: 1, LI: 1, TABLE: 1, THEAD: 1, TBODY: 1, TR: 1, TD: 1, TH: 1, FORM: 1, FIELDSET: 1, MAIN: 1, P: 1, HEADER: 1, FOOTER: 1, NAV: 1 };

  function bgOf(el, cache) {
    if (cache.has(el)) return cache.get(el);
    var res = null;
    var cs = getComputedStyle(el);
    if ((el === doc.body || el === html) && html.hasAttribute("data-bc-bg")) {
      var tone = html.getAttribute("data-bc-bg-tone"), th0 = themeOf();
      if (tone === "light") res = { r: 238, g: 242, b: 247, a: 1 };       // translucent panels sit over a light image
      else if (tone === "dark") res = { r: 8, g: 12, b: 20, a: 1 };        // ...or a dark one
      else if (th0 && TOKENS[th0]) { var hx = parseInt(TOKENS[th0].page.slice(1), 16); res = { r: hx >> 16, g: (hx >> 8) & 255, b: hx & 255, a: 1 }; }
    } else if (cs.backgroundImage && cs.backgroundImage !== "none") res = null;
    else {
      var c = parseColor(cs.backgroundColor);
      if (c && c.a >= 0.99) res = c;
      else if (el === html || !el.parentElement) res = parseColor(getComputedStyle(html).backgroundColor) || { r: 255, g: 255, b: 255, a: 1 };
      else {
        var below = bgOf(el.parentElement, cache);
        res = below && c && c.a > 0.01 ? over(c, below) : below;
      }
    }
    cache.set(el, res);
    return res;
  }
  function hasOwnText(el) {
    for (var n = el.firstChild; n; n = n.nextSibling) if (n.nodeType === 3 && n.nodeValue.trim()) return true;
    return false;
  }
  function revertFixes() {
    doc.querySelectorAll("[data-bc-fixed]").forEach(function (el) {
      var oc = el.getAttribute("data-bc-orig-color");
      var ob = el.getAttribute("data-bc-orig-bg");
      if (oc !== null) { if (oc === "") el.style.removeProperty("color"); else el.style.setProperty("color", oc.split("|")[0], oc.split("|")[1] || ""); }
      if (ob !== null) { if (ob === "") el.style.removeProperty("background-color"); else el.style.setProperty("background-color", ob.split("|")[0], ob.split("|")[1] || ""); }
      var obi = el.getAttribute("data-bc-orig-bgi");
      if (obi !== null) { if (obi === "") el.style.removeProperty("background-image"); else el.style.setProperty("background-image", obi.split("|")[0], obi.split("|")[1] || ""); }
      el.removeAttribute("data-bc-orig-bgi");
      var obd = el.getAttribute("data-bc-orig-border");
      if (obd !== null) { if (obd === "") el.style.removeProperty("border-color"); else el.style.setProperty("border-color", obd.split("|")[0], obd.split("|")[1] || ""); }
      el.removeAttribute("data-bc-orig-border");
      el.removeAttribute("data-bc-orig-color");
      el.removeAttribute("data-bc-orig-bg");
      el.removeAttribute("data-bc-fixed");
    });
  }
  function remember(el, prop, attr) {
    if (el.hasAttribute(attr)) return;
    var v = el.style.getPropertyValue(prop);
    el.setAttribute(attr, v ? v + "|" + el.style.getPropertyPriority(prop) : "");
    el.setAttribute("data-bc-fixed", "");
  }
  function isNeutralLight(c) { return !!c && saturationOf(c) < 0.14 && lum(c) > 0.55; }
  function gradientAllNeutralLight(img) {
    if (!/^(repeating-)?linear-gradient/.test(img)) return false;
    var m = img.match(/rgba?\([^)]*\)/g);
    return !!m && m.every(function (x) { var c = parseColor(x); return c && c.a > 0.3 && isNeutralLight(c); });
  }
  function bigBox(el) {
    var r = el.getBoundingClientRect();
    return r.width >= root.innerWidth * 0.55 || r.height >= root.innerHeight * 0.6;
  }
  /* A wrapper is a big box that contains several card-like boxes (own fill / border / shadow) within 3 levels. */
  function looksLikeWrapper(el) {
    var level = [el], seen = 0, cards = 0;
    for (var d = 0; d < 3 && level.length; d++) {
      var next = [];
      for (var i = 0; i < level.length; i++) {
        var kids = level[i].children;
        for (var k = 0; k < kids.length && seen < 90; k++, seen++) {
          var c = kids[k], cs2 = getComputedStyle(c), b = parseColor(cs2.backgroundColor);
          if ((b && b.a > 0.3) || parseFloat(cs2.borderTopWidth) > 0 || cs2.boxShadow !== "none") cards++;
          else next.push(c);
        }
      }
      level = next;
    }
    return cards >= 2;
  }
  function guardElement(el, cache) {
    var th = themeOf();
    if (!th || el.nodeType !== 1 || SKIP_TAGS[el.tagName] || isMine(el)) return;
    if (el.closest("[data-bc-keep]") || el.closest("svg")) return;
    var cs = getComputedStyle(el);
    if (cs.display === "none" && !el.closest("[data-bc-floating]")) { /* still repair hidden menus */ }
    // (a) neutral light fills (solid, semi-transparent or light gradient) become theme surfaces.
    //     Only with a custom background: big layout wrappers go transparent so the background shows through,
    //     cards become the translucent "readability surface".
    var bgActive = html.hasAttribute("data-bc-bg");
    if (bgActive && cs.display !== "inline" && el.getAttribute("data-bc-surface") !== "light" && !el.closest('[data-bc-surface="light"]') && !el.hasAttribute("data-bc-floating")) {
      var bg = parseColor(cs.backgroundColor), img = cs.backgroundImage, grad = false, eff = null;
      if (img !== "none") grad = gradientAllNeutralLight(img);
      if (img === "none" || grad) {
        if (grad) eff = { r: 255, g: 255, b: 255, a: 1 };
        else if (bg && bg.a >= 0.3) {
          var below = el.parentElement ? bgOf(el.parentElement, cache) : null;
          eff = bg.a >= 0.95 ? bg : over(bg, below || { r: 0, g: 0, b: 0, a: 1 });
        }
        if (eff && isNeutralLight(eff)) {
          var wrapper = bigBox(el) && looksLikeWrapper(el);
          if (wrapper && lum(eff) > 0.85) {
            var value = "transparent";
            remember(el, "background-color", "data-bc-orig-bg");
            if (grad) {
              remember(el, "background-image", "data-bc-orig-bgi");
              el.style.setProperty("background-image", "none", "important");
            }
            el.style.setProperty("background-color", value, "important");
            cache.clear();
          }
        }
      }
    }
    // (b) text colour with insufficient contrast against what is really behind it
    if (hasOwnText(el)) {
      var fg = parseColor(cs.color);
      var back = bgOf(el, cache);
      if (fg && back) {
        var eff = over(fg, back);
        var size = parseFloat(cs.fontSize) || 14;
        var bold = parseInt(cs.fontWeight, 10) >= 700;
        var need = size >= 24 || (size >= 18.66 && bold) ? 3 : 4.5;
        if (html.hasAttribute("data-bc-bg")) need += 0.7; // backdrop is only estimated under a custom background
        if (ratio(eff, back) < need) {
          remember(el, "color", "data-bc-orig-color");
          el.style.setProperty("color", adjustForContrast({ r: fg.r, g: fg.g, b: fg.b, a: 1 }, back, need + 0.1), "important");
        }
      }
    }
  }

  function processRoot(rootEl) {
    var cache = new Map();
    var w = doc.createTreeWalker(rootEl, NodeFilter.SHOW_ELEMENT, null);
    var n = rootEl, count = 0;
    var gen = function () {
      var t0 = performance.now();
      while (n) {
        guardElement(n, cache);
        count++;
        n = w.nextNode();
        if (count % 60 === 0 && performance.now() - t0 > 10) {
          setTimeout(gen, 16); // yield to the page
          return;
        }
        if (count > 20000) return; // hard ceiling on huge pages
      }
    };
    gen();
  }

  function flush() {
    scheduled = false;
    if (working) return;
    working = true;
    try {
      var th = themeOf();
      if (!th) return;
      var items = Array.from(queue);
      queue.clear();
      items.forEach(function (n) {
        if (!n.isConnected) return;
        scanFloating(n);
      });
      items.forEach(function (n) {
        if (n.isConnected && n.nodeType === 1) processRoot(n);
      });
    } finally {
      working = false;
    }
  }
  function enqueue(n) {
    if (!n || n.nodeType !== 1 || isMine(n)) return;
    queue.add(n);
    if (!scheduled) {
      scheduled = true;
      (root.requestAnimationFrame || setTimeout)(function () { setTimeout(flush, 30); });
    }
  }

  function startObserving() {
    if (obs || !doc.body) return;
    obs = new MutationObserver(function (muts) {
      for (var i = 0; i < muts.length; i++) {
        var m = muts[i];
        if (m.type === "childList") {
          for (var j = 0; j < m.addedNodes.length; j++) enqueue(m.addedNodes[j]);
        } else if (m.type === "attributes") {
          if (m.attributeName && m.attributeName.indexOf("data-bc") === 0) continue;
          enqueue(m.target);
        }
      }
    });
    obs.observe(doc.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["class", "hidden", "aria-expanded", "aria-hidden", "open"] });
  }
  function stopObserving() {
    if (obs) { obs.disconnect(); obs = null; }
  }

  var lastTheme = null;
  function onThemeChange() {
    var th = themeOf();
    updateTone();
    if (th === lastTheme) return;
    lastTheme = th;
    revertFixes();
    retagAllFloating();
    if (!th) { stopObserving(); return; }
    startObserving();
    if (doc.body) enqueue(doc.body);
  }

  function boot() {
    new MutationObserver(onThemeChange).observe(html, { attributes: true, attributeFilter: ["data-bc-theme", "data-bc-bg", "style"] });
    onThemeChange();
  }
  if (doc.readyState === "loading") doc.addEventListener("DOMContentLoaded", boot, { once: true });
  else boot();
})(typeof globalThis !== "undefined" ? globalThis : this);
