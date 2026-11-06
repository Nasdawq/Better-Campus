/* Better Campus — manual GPA calculation engine.
 *
 * PURE LOGIC: no DOM, no storage, no network, no Infinite Campus access. Every number comes from the
 * state object the student typed in. The UI (bc-gpa-ui.js) and the unit tests both call this module.
 *
 * CALCULATION MODEL (also shown to the student in the app)
 *   grade entry      -> letter row of the student's own scale (percent uses the student's own boundaries)
 *   base points      -> points of that row (e.g. A = 4.0)
 *   weighted points  -> base points + course-level bonus (Regular / Honors / AP, or a per-class override);
 *                       mode "additive-passing" gives no bonus when base points are 0
 *   class weight w   -> credits (if credit weighting is ON) else 1
 *   GPA              -> sum(points * w) / sum(w)          (only over entries that exist)
 *   class year points-> mean of that class's quarter points over the quarters being counted
 *   semester GPA     -> same, over the two quarters of the semester (Q1+Q2 or Q3+Q4)
 *   cumulative GPA   -> (historyGpa * historyCredits + sum(classYearPoints * w)) / (historyCredits + sum(w))
 *   Missing grade    -> excluded, NEVER zero (unless the student turns on "count missing as 0").
 *   Future quarters  -> hypothetical; only used in "projected" figures and the goal planner.
 */
(function (root) {
  "use strict";

  var LEVELS = ["regular", "honors", "ap"];
  var LEVEL_LABEL = { regular: "Regular", honors: "Honors", ap: "AP" };
  var WEIGHT_MODES = ["additive", "additive-passing", "none"];
  var EPS = 1e-9;

  /* ------------------------------------------------------------------ defaults */
  function defaultSettings() {
    return {
      scale: [
        { letter: "A", minPercent: 90, points: 4 },
        { letter: "B", minPercent: 80, points: 3 },
        { letter: "C", minPercent: 70, points: 2 },
        { letter: "D", minPercent: 60, points: 1 },
        { letter: "F", minPercent: 0, points: 0 },
      ],
      weightMode: "additive",
      levelBonus: { regular: 0, honors: 1, ap: 1.5 }, // STARTER values — student must set their school's
      allowCustomWeights: false,
      creditWeighted: true,
      missingAsZero: false,
      maxPercent: 100,
      reviewed: false, // false until the student opens/saves Settings
      persist: true,
    };
  }
  function defaultState() {
    return {
      v: 1,
      currentQuarter: 1,
      academicYear: "",
      classes: [],
      history: { unweightedGpa: null, weightedGpa: null, credits: null },
      goal: { target: 3.5, basis: "weighted", scope: "year" },
      settings: defaultSettings(),
    };
  }

  /* ------------------------------------------------------------------ validation */
  function isNum(x) { return typeof x === "number" && isFinite(x); }
  function num(x) {
    if (x === null || x === undefined || x === "") return null;
    var n = typeof x === "number" ? x : Number(String(x).trim());
    return isFinite(n) ? n : null;
  }

  function validateSettings(s) {
    var errors = [];
    if (!s || !Array.isArray(s.scale) || s.scale.length < 2) {
      errors.push("The grade scale needs at least two rows.");
      return { ok: false, errors: errors };
    }
    var max = num(s.maxPercent);
    if (max === null || max < 100 || max > 200) errors.push("Maximum percentage must be between 100 and 200.");
    var letters = {}, mins = {}, hasZero = false;
    s.scale.forEach(function (r, i) {
      var row = "Scale row " + (i + 1) + ": ";
      var L = typeof r.letter === "string" ? r.letter.trim() : "";
      if (!L || L.length > 3) errors.push(row + "letter must be 1–3 characters.");
      else if (letters[L.toLowerCase()]) errors.push(row + 'letter "' + L + '" is used twice.');
      else letters[L.toLowerCase()] = 1;
      var mp = num(r.minPercent), pt = num(r.points);
      if (mp === null || mp < 0 || mp > (max || 100)) errors.push(row + "minimum percent must be between 0 and " + (max || 100) + ".");
      else if (mins[mp]) errors.push(row + "minimum percent " + mp + " is used twice.");
      else mins[mp] = 1;
      if (mp === 0) hasZero = true;
      if (pt === null || pt < 0 || pt > 10) errors.push(row + "points must be between 0 and 10.");
    });
    if (!hasZero) errors.push("One row must start at 0% so every percentage maps to a grade.");
    var sorted = s.scale.slice().filter(function (r) { return num(r.minPercent) !== null && num(r.points) !== null; })
      .sort(function (a, b) { return num(b.minPercent) - num(a.minPercent); });
    for (var i = 1; i < sorted.length; i++) {
      if (num(sorted[i].points) > num(sorted[i - 1].points) + EPS) {
        errors.push("A lower percentage range (" + sorted[i].letter + ") cannot be worth more points than a higher one (" + sorted[i - 1].letter + ").");
        break;
      }
    }
    if (WEIGHT_MODES.indexOf(s.weightMode) === -1) errors.push("Unknown weighting rule.");
    LEVELS.forEach(function (l) {
      var b = num(s.levelBonus && s.levelBonus[l]);
      if (b === null || b < 0 || b > 5) errors.push(LEVEL_LABEL[l] + " weighting must be between 0 and 5.");
    });
    return { ok: errors.length === 0, errors: errors };
  }

  function validateClass(c) {
    var errors = {};
    if (!c || typeof c.name !== "string" || !c.name.trim()) errors.name = "Enter a class name.";
    else if (c.name.trim().length > 60) errors.name = "Class names can be up to 60 characters.";
    if (LEVELS.indexOf(c && c.level) === -1) errors.level = "Choose Regular, Honors or AP.";
    var cr = num(c && c.credits);
    if (cr === null || cr <= 0 || cr > 10) errors.credits = "Credits must be greater than 0 and at most 10.";
    if (c && c.bonusOverride !== null && c.bonusOverride !== undefined && c.bonusOverride !== "") {
      var b = num(c.bonusOverride);
      if (b === null || b < 0 || b > 5) errors.bonusOverride = "Custom weighting must be between 0 and 5.";
    }
    return errors;
  }

  /** Parse what the student typed into a grade box. "" = missing. */
  function parseGradeInput(text, settings) {
    var t = String(text === null || text === undefined ? "" : text).trim();
    if (t === "") return { ok: true, entry: null };
    var scale = settings.scale;
    var maxP = num(settings.maxPercent) || 100;
    var pctMatch = t.match(/^(\d+(?:\.\d+)?|\.\d+)\s*%?$/);
    if (pctMatch) {
      var v = parseFloat(pctMatch[1]);
      if (v < 0 || v > maxP + EPS) return { ok: false, error: "Enter a percentage from 0 to " + maxP + "." };
      return { ok: true, entry: { t: "p", v: v } };
    }
    for (var i = 0; i < scale.length; i++) {
      if (String(scale[i].letter).toLowerCase() === t.toLowerCase()) return { ok: true, entry: { t: "l", v: String(scale[i].letter) } };
    }
    if (/^-/.test(t)) return { ok: false, error: "Grades can't be negative." };
    return { ok: false, error: 'Use a percentage (0–' + maxP + ") or one of: " + scale.map(function (r) { return r.letter; }).join(", ") + "." };
  }
  function entryText(entry) {
    if (!entry) return "";
    return entry.t === "p" ? String(entry.v) : entry.v;
  }

  /* ------------------------------------------------------------------ grade conversion */
  function sortedScale(settings) {
    return settings.scale.slice().sort(function (a, b) { return num(b.minPercent) - num(a.minPercent); });
  }
  function rowForPercent(pct, settings) {
    var rows = sortedScale(settings);
    for (var i = 0; i < rows.length; i++) if (pct + EPS >= num(rows[i].minPercent)) return rows[i];
    return rows[rows.length - 1];
  }
  function rowForLetter(letter, settings) {
    for (var i = 0; i < settings.scale.length; i++) {
      if (String(settings.scale[i].letter).toLowerCase() === String(letter).toLowerCase()) return settings.scale[i];
    }
    return null;
  }
  /** -> {letter, points} for an entry, or null when missing/invalid. */
  function entryBase(entry, settings) {
    if (!entry) return null;
    var row = entry.t === "p" ? rowForPercent(entry.v, settings) : rowForLetter(entry.v, settings);
    return row ? { letter: String(row.letter), points: num(row.points) } : null;
  }

  /* ------------------------------------------------------------------ points */
  function levelBonus(cls, settings) {
    if (settings.weightMode === "none") return 0;
    if (settings.allowCustomWeights && cls.bonusOverride !== null && cls.bonusOverride !== undefined && cls.bonusOverride !== "" && num(cls.bonusOverride) !== null) {
      return num(cls.bonusOverride);
    }
    var b = settings.levelBonus ? num(settings.levelBonus[cls.level]) : 0;
    return b === null ? 0 : b;
  }
  /** Points a grade (base points) is worth for a class. */
  function pointsFor(cls, baseP, settings, weighted) {
    if (!weighted) return baseP;
    if (settings.weightMode === "additive-passing" && baseP <= EPS) return baseP;
    return baseP + levelBonus(cls, settings);
  }
  function classWeight(cls, settings) {
    if (!settings.creditWeighted) return 1;
    var c = num(cls.credits);
    return c !== null && c > 0 ? c : 1;
  }

  function quarterStatus(q, currentQuarter) {
    return q < currentQuarter ? "completed" : q === currentQuarter ? "current" : "planned";
  }
  /** completed | current | planned | missing  (missing = actual quarter with no grade) */
  function cellStatus(cls, q, state) {
    var st = quarterStatus(q, state.currentQuarter);
    var has = !!(cls.grades && cls.grades["q" + q]);
    if (st === "planned") return has ? "planned" : "unset";
    return has ? st : "missing";
  }

  /** Points for one class-quarter. mode: "actual" ignores planned quarters, "all" includes them. */
  function cellPoints(cls, q, state, weighted, mode) {
    var settings = state.settings;
    var planned = q > state.currentQuarter;
    if (planned && mode !== "all") return null;
    var entry = cls.grades ? cls.grades["q" + q] : null;
    var base = entryBase(entry, settings);
    if (!base) {
      if (settings.missingAsZero && !planned) return { base: 0, points: 0, letter: "0", assumedZero: true, planned: false };
      return null;
    }
    return { base: base.points, points: pointsFor(cls, base.points, settings, weighted), letter: base.letter, planned: planned };
  }

  function includedClasses(state) {
    return state.classes.filter(function (c) { return c.include !== false; });
  }

  /** Mean points over a set of quarters for one class. */
  function classPoints(cls, quarters, state, weighted, mode) {
    var sum = 0, n = 0, missing = [], hypo = false;
    quarters.forEach(function (q) {
      var cp = cellPoints(cls, q, state, weighted, mode);
      if (cp) { sum += cp.points; n++; if (cp.planned) hypo = true; } else missing.push(q);
    });
    return { avg: n ? sum / n : null, n: n, missing: missing, hypothetical: hypo };
  }

  /** Aggregate classes over `quarters`. requireAll: a class counts only if it has every quarter. */
  function aggregate(state, quarters, opts) {
    var weighted = !!opts.weighted, requireAll = !!opts.requireAll, mode = opts.mode || "actual";
    var qp = 0, w = 0, used = [], excluded = [], partial = [], hypo = false;
    includedClasses(state).forEach(function (c) {
      var cp = classPoints(c, quarters, state, weighted, mode);
      if (cp.n === 0 || (requireAll && cp.missing.length)) {
        excluded.push({ id: c.id, name: c.name, missing: cp.missing });
        return;
      }
      if (cp.missing.length) partial.push({ id: c.id, name: c.name, missing: cp.missing });
      var cw = classWeight(c, state.settings);
      qp += cp.avg * cw;
      w += cw;
      if (cp.hypothetical) hypo = true;
      used.push({ id: c.id, name: c.name, weight: cw, points: cp.avg });
    });
    return { gpa: w > 0 ? qp / w : null, qualityPoints: qp, weight: w, used: used, excluded: excluded, partial: partial, hypothetical: hypo };
  }

  /* ------------------------------------------------------------------ public computations */
  function quarterGpa(state, q, weighted) {
    var r = aggregate(state, [q], { weighted: weighted, requireAll: true, mode: q > state.currentQuarter ? "all" : "actual" });
    r.quarter = q;
    r.status = quarterStatus(q, state.currentQuarter);
    return r;
  }
  function semesterGpa(state, sem, weighted, includePlanned) {
    var qs = sem === 1 ? [1, 2] : [3, 4];
    var r = aggregate(state, qs, { weighted: weighted, requireAll: true, mode: includePlanned ? "all" : "actual" });
    r.semester = sem;
    return r;
  }
  /** "toDate": earned quarters only. "projected": all four quarters (targets allowed), every class needs all four. */
  function yearGpa(state, weighted, kind) {
    if (kind === "projected") return aggregate(state, [1, 2, 3, 4], { weighted: weighted, requireAll: true, mode: "all" });
    return aggregate(state, [1, 2, 3, 4], { weighted: weighted, requireAll: false, mode: "actual" });
  }
  function historyFor(state, weighted) {
    var h = state.history || {};
    var g = weighted ? num(h.weightedGpa) : num(h.unweightedGpa);
    var c = num(h.credits);
    if (g === null || c === null || c <= 0) return null;
    return { gpa: g, credits: c };
  }
  function cumulativeGpa(state, weighted, kind) {
    var hist = historyFor(state, weighted);
    var year = yearGpa(state, weighted, kind);
    if (!hist) {
      return { gpa: null, reason: "A cumulative GPA needs your earlier GPA and the credits (or classes, if credit weighting is off) it covers. Enter both in the Cumulative history box.", year: year };
    }
    if (year.weight <= 0) return { gpa: hist.gpa, reason: "No grades entered for this year yet, so this is only your earlier GPA.", year: year, historyOnly: true };
    var gpa = (hist.gpa * hist.credits + year.qualityPoints) / (hist.credits + year.weight);
    return { gpa: gpa, year: year, hypothetical: year.hypothetical };
  }

  /* ------------------------------------------------------------------ goal planner */
  /** Rows sorted best -> worst by points. Distinct points only (first row wins). */
  function gradeRows(settings) {
    var rows = settings.scale.map(function (r) { return { letter: String(r.letter), points: num(r.points), minPercent: num(r.minPercent) }; });
    rows.sort(function (a, b) { return b.points - a.points || b.minPercent - a.minPercent; });
    var out = [], seen = {};
    rows.forEach(function (r) { if (!seen[r.points]) { seen[r.points] = 1; out.push(r); } });
    return out;
  }

  function planGoal(state, goal) {
    var settings = state.settings;
    var weighted = goal.basis !== "unweighted";
    var scope = goal.scope === "cumulative" ? "cumulative" : "year";
    var target = num(goal.target);
    var maxPts = Math.max.apply(null, settings.scale.map(function (r) { return num(r.points); })) + (weighted ? 5 : 0);
    var res = { ok: false, scope: scope, basis: weighted ? "weighted" : "unweighted", target: target, hypothetical: true };

    if (target === null || target < 0 || target > maxPts) {
      res.reason = "Enter a target GPA between 0 and " + (Math.round(maxPts * 100) / 100) + ".";
      return res;
    }
    var classes = includedClasses(state);
    if (!classes.length) { res.reason = "Add at least one class that counts toward your GPA."; return res; }

    var hist = null;
    if (scope === "cumulative") {
      hist = historyFor(state, weighted);
      if (!hist) {
        res.reason = "An exact cumulative projection can't be calculated reliably without your earlier " + (weighted ? "weighted" : "unweighted") + " GPA and the credits it covers. Enter them in the Cumulative history box, or plan for this year's GPA instead.";
        return res;
      }
    }

    // Build per-class known points and remaining slots.
    var cur = state.currentQuarter;
    var per = [], slots = [], gaps = [];
    classes.forEach(function (c, idx) {
      var known = 0, n = 0, rem = [];
      for (var q = 1; q <= 4; q++) {
        var cp = q <= cur ? cellPoints(c, q, state, weighted, "actual") : null;
        if (cp) { known += cp.points; n++; }
        else if (q > cur || q === cur) rem.push(q);
        else gaps.push({ name: c.name, quarter: q });
      }
      per.push({ cls: c, w: classWeight(c, settings), known: known, n: n, rem: rem.length });
      rem.forEach(function (q) { slots.push({ ci: idx, q: q }); });
    });
    if (!slots.length) {
      res.reason = "There are no remaining quarters to plan: every counted class already has grades through Q4 (or the current quarter is the last one with a grade). Change the current quarter or clear a quarter to experiment.";
      return res;
    }

    var rows = gradeRows(settings);
    function gpaFor(pointsOfSlot) {
      // pointsOfSlot(slotIndex) -> weighted/unweighted points for that slot
      var sums = per.map(function (p) { return p.known; });
      slots.forEach(function (s, i) { sums[s.ci] += pointsOfSlot(i); });
      var qp = 0, w = 0;
      per.forEach(function (p, i) {
        var d = p.n + p.rem;
        if (d <= 0) return;
        qp += (sums[i] / d) * p.w;
        w += p.w;
      });
      if (w <= 0) return null;
      return hist ? (hist.gpa * hist.credits + qp) / (hist.credits + w) : qp / w;
    }
    function uniformGpa(base) {
      return gpaFor(function (i) { return pointsFor(per[slots[i].ci].cls, base, settings, weighted); });
    }
    function currentGpaToDate() {
      var qp = 0, w = 0;
      per.forEach(function (p) { if (p.n > 0) { qp += (p.known / p.n) * p.w; w += p.w; } });
      if (hist) return w > 0 ? (hist.gpa * hist.credits + qp) / (hist.credits + w) : hist.gpa;
      return w > 0 ? qp / w : null;
    }

    var top = rows[0], bottom = rows[rows.length - 1];
    var best = uniformGpa(top.points), worst = uniformGpa(bottom.points);
    res.ok = true;
    res.currentGpa = currentGpaToDate();
    res.remainingQuarters = Array.from(new Set(slots.map(function (s) { return s.q; }))).sort();
    res.slots = slots.length;
    res.maxAchievable = best;
    res.minPossible = worst;
    res.achievable = best + 1e-9 >= target;
    res.alreadyGuaranteed = worst + 1e-9 >= target;
    res.gaps = gaps;
    res.uniform = rows.map(function (r) { return { letter: r.letter, points: r.points, minPercent: r.minPercent, projected: uniformGpa(r.points) }; });
    res.scenarios = [];
    res.requiredBasePoints = null;

    if (!res.achievable) {
      res.explanation = "Even straight " + top.letter + "s in every remaining slot gives " + fmt(best, 3) + ", below your " + fmt(target, 2) + " goal. The highest GPA reachable under your entered grades and rules is " + fmt(best, 3) + ".";
      res.scenarios.push(scen("ceiling", "All " + top.letter + "s (best case)", [{ letter: top.letter, count: slots.length }], best, target));
      return res;
    }

    // Required average base points: bisection on the (monotone) uniform curve.
    if (res.alreadyGuaranteed) {
      res.requiredBasePoints = bottom.points;
      res.explanation = "Your goal is already guaranteed by the grades entered so far: even straight " + bottom.letter + "s would finish at " + fmt(worst, 3) + ".";
    } else {
      var lo = bottom.points, hi = top.points;
      for (var it = 0; it < 60; it++) {
        var mid = (lo + hi) / 2;
        if (uniformGpa(mid) + 1e-12 >= target) hi = mid; else lo = mid;
      }
      res.requiredBasePoints = hi;
      // lowest row that meets it
      var minRow = null;
      for (var k = rows.length - 1; k >= 0; k--) if (uniformGpa(rows[k].points) + 1e-9 >= target) { minRow = rows[k]; break; }
      res.requiredRow = minRow;
      res.explanation = "Average at least " + fmt(res.requiredBasePoints, 2) + " grade points (on your " + fmt(top.points, 1) + "-point scale) across the " + slots.length + " remaining class-quarter" + (slots.length === 1 ? "" : "s") + ", which is about a " + (minRow ? minRow.letter + " (" + minRow.minPercent + "%+)" : top.letter) + " in every one.";
    }

    // Scenarios
    var minRowIdx = rows.length - 1;
    for (var r = rows.length - 1; r >= 0; r--) if (uniformGpa(rows[r].points) + 1e-9 >= target) { minRowIdx = r; break; }
    var minRow2 = rows[minRowIdx];
    var below = rows[minRowIdx + 1];
    if (below && !res.alreadyGuaranteed) {
      // upgrade the highest-impact slots first
      var order = slots.map(function (s, i) { return i; }).sort(function (a, b) {
        function impact(i) {
          var p = per[slots[i].ci];
          return (p.w / Math.max(1, p.n + p.rem)) * (pointsFor(p.cls, minRow2.points, settings, weighted) - pointsFor(p.cls, below.points, settings, weighted));
        }
        return impact(b) - impact(a);
      });
      var mIdx = -1;
      for (var m = 1; m <= slots.length; m++) {
        var up = {};
        for (var u = 0; u < m; u++) up[order[u]] = true;
        var g = gpaFor(function (i) { return pointsFor(per[slots[i].ci].cls, up[i] ? minRow2.points : below.points, settings, weighted); });
        if (g + 1e-9 >= target) { mIdx = m; var mixG = g; break; }
      }
      if (mIdx > 0 && mIdx < slots.length) {
        res.scenarios.push(scen("mix", "Mostly " + below.letter + "s with " + mIdx + " " + minRow2.letter + (mIdx === 1 ? "" : "s"),
          [{ letter: minRow2.letter, count: mIdx }, { letter: below.letter, count: slots.length - mIdx }], mixG, target));
      }
    }
    if (!res.alreadyGuaranteed) {
      res.scenarios.push(scen("uniform", "All " + minRow2.letter + "s (minimum steady grade)", [{ letter: minRow2.letter, count: slots.length }], uniformGpa(minRow2.points), target));
    }
    if (top.letter !== minRow2.letter || res.alreadyGuaranteed) {
      res.scenarios.push(scen("ceiling", "All " + top.letter + "s (best case)", [{ letter: top.letter, count: slots.length }], best, target));
    }
    return res;
  }
  function scen(id, label, assignments, projected, target) {
    return { id: id, label: label, assignments: assignments, projected: projected, meetsGoal: projected + 1e-9 >= target, hypothetical: true };
  }

  /* ------------------------------------------------------------------ summary for the dashboard */
  function summarize(state) {
    var cur = state.currentQuarter, sem = cur <= 2 ? 1 : 2;
    var classes = includedClasses(state);
    var out = {
      includedCount: classes.length,
      totalCount: state.classes.length,
      rules: describeRules(state.settings),
      currentQuarter: { quarter: cur },
      semester: { semester: sem },
      year: {},
      cumulative: {},
    };
    [["unweighted", false], ["weighted", true]].forEach(function (p) {
      var key = p[0], w = p[1];
      out.currentQuarter[key] = quarterGpa(state, cur, w);
      out.semester[key] = semesterGpa(state, sem, w, false);
      out.semester[key + "Projected"] = semesterGpa(state, sem, w, true);
      out.year[key + "ToDate"] = yearGpa(state, w, "toDate");
      out.year[key + "Projected"] = yearGpa(state, w, "projected");
      out.cumulative[key + "ToDate"] = cumulativeGpa(state, w, "toDate");
      out.cumulative[key + "Projected"] = cumulativeGpa(state, w, "projected");
    });
    out.missingCurrent = classes.filter(function (c) { return cellStatus(c, cur, state) === "missing"; }).map(function (c) { return c.name; });
    out.missingCount = out.missingCurrent.length;
    return out;
  }

  function describeRules(s) {
    var lines = [];
    lines.push("Scale: " + sortedScale(s).map(function (r) { return r.letter + " ≥ " + r.minPercent + "% = " + fmt(num(r.points), 2); }).join(", "));
    if (s.weightMode === "none") lines.push("Course weighting: off (weighted GPA equals unweighted).");
    else lines.push("Course weighting: " + (s.weightMode === "additive-passing" ? "bonus added only to passing grades" : "bonus added to every grade") + " — Regular +" + fmt(num(s.levelBonus.regular), 2) + ", Honors +" + fmt(num(s.levelBonus.honors), 2) + ", AP +" + fmt(num(s.levelBonus.ap), 2) + (s.allowCustomWeights ? " (per-class overrides on)." : "."));
    lines.push(s.creditWeighted ? "GPA = Σ(points × credits) ÷ Σ(credits)." : "GPA = Σ(points) ÷ number of classes (every class counts equally).");
    lines.push(s.missingAsZero ? "Missing grades count as 0 (you turned this on)." : "Missing grades are left out — never counted as 0.");
    return lines;
  }

  /* ------------------------------------------------------------------ formatting / sanitising */
  function fmt(x, d) {
    if (x === null || x === undefined || !isFinite(x)) return "—";
    return (Math.round(x * Math.pow(10, d)) / Math.pow(10, d)).toFixed(d);
  }

  /** Make stored/imported data safe: fills defaults, clamps types. Never throws. */
  function normalizeState(raw) {
    var d = defaultState();
    if (!raw || typeof raw !== "object") return d;
    var st = d;
    var rs = raw.settings && typeof raw.settings === "object" ? raw.settings : {};
    var s = defaultSettings();
    if (Array.isArray(rs.scale)) {
      var cand = rs.scale.map(function (r) { return { letter: String(r.letter == null ? "" : r.letter).slice(0, 3), minPercent: num(r.minPercent), points: num(r.points) }; });
      var test = Object.assign({}, s, { scale: cand });
      if (validateSettings(test).ok) s.scale = cand;
    }
    if (WEIGHT_MODES.indexOf(rs.weightMode) !== -1) s.weightMode = rs.weightMode;
    if (rs.levelBonus) LEVELS.forEach(function (l) { var b = num(rs.levelBonus[l]); if (b !== null && b >= 0 && b <= 5) s.levelBonus[l] = b; });
    ["allowCustomWeights", "creditWeighted", "missingAsZero", "reviewed", "persist"].forEach(function (k) { if (typeof rs[k] === "boolean") s[k] = rs[k]; });
    var mp = num(rs.maxPercent); if (mp !== null && mp >= 100 && mp <= 200) s.maxPercent = mp;
    st.settings = s;
    var cq = num(raw.currentQuarter); if (cq && cq >= 1 && cq <= 4) st.currentQuarter = Math.round(cq);
    if (typeof raw.academicYear === "string") st.academicYear = raw.academicYear.slice(0, 20);
    if (raw.history && typeof raw.history === "object") {
      ["unweightedGpa", "weightedGpa", "credits"].forEach(function (k) {
        var v = num(raw.history[k]);
        st.history[k] = v !== null && v >= 0 && v < 1000 ? v : null;
      });
    }
    if (raw.goal && typeof raw.goal === "object") {
      var t = num(raw.goal.target); if (t !== null && t >= 0 && t <= 15) st.goal.target = t;
      if (raw.goal.basis === "unweighted") st.goal.basis = "unweighted";
      if (raw.goal.scope === "cumulative") st.goal.scope = "cumulative";
    }
    if (Array.isArray(raw.classes)) {
      st.classes = raw.classes.slice(0, 60).map(function (c, i) {
        var grades = {};
        [1, 2, 3, 4].forEach(function (q) {
          var e = c && c.grades && c.grades["q" + q];
          if (e && (e.t === "p" || e.t === "l")) {
            var chk = parseGradeInput(e.t === "p" ? String(e.v) : e.v, s);
            if (chk.ok && chk.entry) grades["q" + q] = chk.entry;
          }
        });
        var credits = num(c && c.credits);
        return {
          id: typeof (c && c.id) === "string" ? c.id : "c" + Date.now().toString(36) + i,
          name: String((c && c.name) || "Untitled class").slice(0, 60),
          level: LEVELS.indexOf(c && c.level) !== -1 ? c.level : "regular",
          credits: credits !== null && credits > 0 && credits <= 10 ? credits : 1,
          include: !(c && c.include === false),
          bonusOverride: c && num(c.bonusOverride) !== null && num(c.bonusOverride) >= 0 && num(c.bonusOverride) <= 5 ? num(c.bonusOverride) : null,
          notes: String((c && c.notes) || "").slice(0, 300),
          grades: grades,
        };
      });
    }
    return st;
  }

  var API = {
    LEVELS: LEVELS, LEVEL_LABEL: LEVEL_LABEL, WEIGHT_MODES: WEIGHT_MODES,
    defaultSettings: defaultSettings, defaultState: defaultState, normalizeState: normalizeState,
    validateSettings: validateSettings, validateClass: validateClass,
    parseGradeInput: parseGradeInput, entryText: entryText,
    rowForPercent: rowForPercent, rowForLetter: rowForLetter, entryBase: entryBase, gradeRows: gradeRows,
    levelBonus: levelBonus, pointsFor: pointsFor, classWeight: classWeight,
    quarterStatus: quarterStatus, cellStatus: cellStatus, cellPoints: cellPoints,
    quarterGpa: quarterGpa, semesterGpa: semesterGpa, yearGpa: yearGpa, cumulativeGpa: cumulativeGpa,
    planGoal: planGoal, summarize: summarize, describeRules: describeRules, fmt: fmt,
  };
  root.BCGpaEngine = API;
  if (typeof module !== "undefined" && module.exports) module.exports = API;
})(typeof globalThis !== "undefined" ? globalThis : this);
