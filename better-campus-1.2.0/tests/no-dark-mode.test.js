// Run: node tests/no-dark-mode.test.js — regression guard: dark mode, the calendar and Calculator Mode stay removed.
const fs = require("fs"), path = require("path");
const read = (f) => fs.readFileSync(path.join(__dirname, "..", f), "utf8");
const { TOKENS, buildCss } = require("../bc-theme.js");
let bad = 0;
const t = (name, ok, detail) => { if (!ok) bad++; console.log(`${ok ? "ok  " : "FAIL"} ${name}${ok ? "" : "  -> " + detail}`); };

const css = buildCss();
t("token table has only the light set", Object.keys(TOKENS).join() === "light", Object.keys(TOKENS).join());
t('portal stylesheet never targets data-bc-theme="dark"', !/data-bc-theme="dark"/.test(css), "");
t("portal stylesheet declares no dark colour-scheme", !/color-scheme:dark/.test(css), "");
t("no hover re-tint / state-guard machinery in bc-theme.js", !/releaseHover|onOver|data-bc-orig-hbg/.test(read("bc-theme.js")), "");
t("bc-state-guard.js is gone", !fs.existsSync(path.join(__dirname, "..", "bc-state-guard.js")), "");

const manifest = JSON.parse(read("manifest.json"));
t("manifest does not load a state guard", !JSON.stringify(manifest).includes("state-guard"), "");
t("background.js does not register a state guard", !read("background.js").includes("state-guard"), "");

for (const f of ["content.js", "popup.js"]) {
  const src = read(f);
  t(`${f}: no "dark" mode value`, !/["'`]dark["'`]/.test(src), "");
  t(`${f}: no data-mode=dark styles`, !/data-mode="dark"/.test(src), "");
  t(`${f}: no calendar / calculator-mode UI`, !/Assignment Calendar|Calculator Mode|calculator-overlay|cal-grid/.test(src), "");
}
const gpa = read("bc-gpa-ui.js");
t("GPA calculator has no dark palette", !/dark/i.test(gpa), "");
t("GPA calculator is still wired up (manifest + menu)", manifest.content_scripts[0].js.includes("bc-gpa-ui.js") && /BetterCampusGPA\?\.open\(\)/.test(read("content.js")), "");
console.log(bad ? `${bad} FAILED` : "dark mode, calendar and Calculator Mode are fully removed");
process.exit(bad ? 1 : 0);
