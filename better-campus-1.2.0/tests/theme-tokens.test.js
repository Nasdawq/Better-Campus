// Run: node tests/theme-tokens.test.js  — WCAG AA check of every foreground/background token pair.
const { TOKENS } = require("../bc-theme.js");
const lin = (c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
const L = (h) => { const n = parseInt(h.slice(1), 16); return 0.2126 * lin(n >> 16) + 0.7152 * lin((n >> 8) & 255) + 0.0722 * lin(n & 255); };
const cr = (a, b) => (Math.max(L(a), L(b)) + 0.05) / (Math.min(L(a), L(b)) + 0.05);
let bad = 0;
for (const [set, t] of Object.entries(TOKENS)) {
  const pairs = [
    ["fg on surface", t.fg, t.surface, 4.5], ["fg on page", t.fg, t.page, 4.5], ["fg on elevated", t.fg, t.elev, 4.5], ["fg on surface2", t.fg, t.surface2, 4.5], ["fg on nav", t.fg, t.nav, 4.5],
    ["fg2 on surface", t.fg2, t.surface, 4.5], ["fg2 on surface2", t.fg2, t.surface2, 4.5], ["muted on surface", t.muted, t.surface, 4.5], ["muted on page", t.muted, t.page, 4.5], ["muted on surface2", t.muted, t.surface2, 4.5],
    ["link on surface", t.link, t.surface, 4.5], ["link on page", t.link, t.page, 4.5], ["accent on surface", t.accent, t.surface, 4.5], ["accentFg on accent", t.accentFg, t.accent, 4.5],
    ["icon on surface", t.icon, t.surface, 3], ["icon on nav", t.icon, t.nav, 3], ["icon2 on surface", t.icon2, t.surface, 3],
    ["borderStrong on surface", t.borderStrong, t.surface, 3], ["borderStrong on surface2", t.borderStrong, t.surface2, 3], ["focus on surface", t.focus, t.surface, 3], ["focus on page", t.focus, t.page, 3],
  ];
  for (const [name, a, b, min] of pairs) { const r = cr(a, b); const ok = r >= min; if (!ok) bad++; console.log(`${ok ? "ok  " : "FAIL"} ${set}: ${name} ${r.toFixed(2)} (need ${min})`); }
}
console.log(bad ? `${bad} FAILED` : "all token pairs meet WCAG AA"); process.exit(bad ? 1 : 0);
