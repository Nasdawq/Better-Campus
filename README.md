# Better-Campus
Git for better canmpus web extention.

# Better Campus 1.2.0

A light theme, custom backgrounds and a fully manual GPA calculator for the Infinite Campus student portal.

## Install / test locally
1. Unzip, open `chrome://extensions`, turn on **Developer mode**, click **Load unpacked** and pick the folder that directly contains `manifest.json` (press **Reload** if an older version is loaded).
2. Open your Infinite Campus portal. Click the **Better Campus** pill (bottom right).
3. **GPA Calculator** (also in the toolbar popup) or **Theme & Settings** (Light / Original, backgrounds).

## Files
* `bc-theme.js` – light token table → portal stylesheet, floating-panel tagging, contrast guard for custom backgrounds.
* `bc-gpa-engine.js` / `bc-gpa-ui.js` – GPA calculator (pure engine + shadow-DOM UI, saved locally).
* `content.js` – launcher pill, menu, theme & background panel. `popup.js` / `popup.html` – toolbar popup.
* `background.js` – local database for uploaded backgrounds + optional custom district URLs.

## GPA rules (all editable in the calculator's Settings)
GPA = Σ(points × weight) ÷ Σ(weight); weight = credits (or 1 if credit-weighting is off).
Weighted points = scale points + Regular/Honors/AP bonus (every grade, or passing grades only, or off).
Missing grades are left out, never 0 (unless you switch that on). Quarters after the current one are hypothetical.
Cumulative = (earlier GPA × earlier credits + this year's points) ÷ (earlier credits + this year's credits).

## Tests
`node tests/gpa-engine.test.js` (36 calculation tests) · `node tests/theme-tokens.test.js` (WCAG AA for every colour pair) ·
`node tests/no-dark-mode.test.js` (guards that dark mode, the calendar and Calculator Mode stay removed)
