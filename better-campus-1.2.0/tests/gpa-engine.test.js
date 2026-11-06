// Run:  node tests/gpa-engine.test.js
// Expected values below were worked out by hand, independently of the engine's code.
const assert = require("node:assert/strict");
const E = require("../bc-gpa-engine.js");
let passed = 0;
function t(name, fn) { try { fn(); passed++; console.log("  ok  " + name); } catch (e) { console.error("FAIL  " + name + "\n" + e.stack); process.exitCode = 1; } }
const near = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) < eps, `expected ${b}, got ${a}`);

function mk(classes, over = {}) {
  const s = E.defaultState();
  Object.assign(s, over);
  if (over.settings) s.settings = Object.assign(E.defaultSettings(), over.settings);
  s.classes = classes.map((c, i) => ({
    id: "c" + i, name: c.name || "C" + i, level: c.level || "regular", credits: c.credits ?? 1,
    include: c.include !== false, bonusOverride: c.bonusOverride ?? null, notes: "",
    grades: Object.fromEntries(Object.entries(c.g || {}).map(([q, v]) => [q, E.parseGradeInput(v, s.settings).entry])),
  }));
  return s;
}

console.log("grade conversion & validation");
t("percent boundaries (90=A, 89.99=B, 80=B, 79.99=C, 0=F, 100=A)", () => {
  const s = E.defaultSettings();
  const L = (p) => E.rowForPercent(p, s).letter;
  assert.deepEqual([90, 89.99, 80, 79.99, 60, 59.99, 0, 100].map(L), ["A", "B", "B", "C", "D", "F", "F", "A"]);
});
t("custom school scale with plus/minus is honoured", () => {
  const s = E.defaultSettings();
  s.scale = [{ letter: "A", minPercent: 93, points: 4 }, { letter: "A-", minPercent: 90, points: 3.7 }, { letter: "B+", minPercent: 87, points: 3.3 }, { letter: "F", minPercent: 0, points: 0 }];
  assert.ok(E.validateSettings(s).ok);
  assert.equal(E.rowForPercent(91, s).letter, "A-");
  assert.equal(E.rowForPercent(87, s).points, 3.3);
  assert.equal(E.parseGradeInput("a-", s).entry.v, "A-");
});
t("rejects impossible percentages / unknown letters", () => {
  const s = E.defaultSettings();
  for (const bad of ["101", "-5", "abc", "12x", "E", "1e3"]) assert.equal(E.parseGradeInput(bad, s).ok, false, bad);
  assert.equal(E.parseGradeInput("100", s).ok, true);
  assert.equal(E.parseGradeInput("87.5%", s).entry.v, 87.5);
  assert.deepEqual(E.parseGradeInput("  ", s), { ok: true, entry: null });
  s.maxPercent = 110;
  assert.equal(E.parseGradeInput("105", s).ok, true);
  assert.equal(E.parseGradeInput("111", s).ok, false);
});
t("settings validation catches bad scales", () => {
  const s = E.defaultSettings();
  s.scale[4].minPercent = 5; assert.equal(E.validateSettings(s).ok, false); // no 0% row
  const s2 = E.defaultSettings(); s2.scale[1].letter = "A"; assert.equal(E.validateSettings(s2).ok, false); // dup letter
  const s3 = E.defaultSettings(); s3.scale[3].points = 3.5; assert.equal(E.validateSettings(s3).ok, false); // D > C
  const s4 = E.defaultSettings(); s4.levelBonus.ap = 9; assert.equal(E.validateSettings(s4).ok, false);
});
t("class validation (name, level, credits)", () => {
  assert.ok(E.validateClass({ name: "", level: "regular", credits: 1 }).name);
  assert.ok(E.validateClass({ name: "x", level: "gold", credits: 1 }).level);
  for (const c of [0, -1, 11, "abc"]) assert.ok(E.validateClass({ name: "x", level: "ap", credits: c }).credits, String(c));
  assert.deepEqual(E.validateClass({ name: "x", level: "ap", credits: 0.5 }), {});
});

console.log("quarter GPA");
const base3 = [
  { name: "Alg", g: { q1: "92" } },                    // A = 4
  { name: "Eng", g: { q1: "85" } },                    // B = 3
  { name: "Chem", level: "honors", g: { q1: "78" } },  // C = 2 (+1 weighted)
];
t("unweighted (4+3+2)/3 = 3.0 ; weighted (4+3+3)/3 = 3.3333", () => {
  const s = mk(base3);
  near(E.quarterGpa(s, 1, false).gpa, 3.0);
  near(E.quarterGpa(s, 1, true).gpa, 10 / 3);
});
t("credit weighting: Chem 0.5 credits -> unweighted 8/2.5=3.2, weighted 8.5/2.5=3.4", () => {
  const s = mk([base3[0], base3[1], { ...base3[2], credits: 0.5 }]);
  near(E.quarterGpa(s, 1, false).gpa, 3.2);
  near(E.quarterGpa(s, 1, true).gpa, 3.4);
});
t("credit weighting OFF: every class counts equally even with different credits", () => {
  const s = mk([base3[0], base3[1], { ...base3[2], credits: 0.5 }], { settings: { creditWeighted: false } });
  near(E.quarterGpa(s, 1, false).gpa, 3.0);
});
t("missing grade is NOT zero; the class is listed as excluded", () => {
  const s = mk([...base3, { name: "Art", g: {} }]);
  const r = E.quarterGpa(s, 1, false);
  near(r.gpa, 3.0);
  assert.deepEqual(r.excluded.map((x) => x.name), ["Art"]);
  assert.equal(E.summarize(s).missingCount, 1);
});
t("opt-in 'count missing as 0' makes it (4+3+2+0)/4 = 2.25", () => {
  const s = mk([...base3, { name: "Art", g: {} }], { settings: { missingAsZero: true } });
  near(E.quarterGpa(s, 1, false).gpa, 2.25);
});
t("AP weighting: additive gives F +1.5, additive-passing does not", () => {
  const f = { name: "APUSH", level: "ap", g: { q1: "40" } };
  near(E.quarterGpa(mk([f]), 1, true).gpa, 1.5);
  near(E.quarterGpa(mk([f], { settings: { weightMode: "additive-passing" } }), 1, true).gpa, 0);
  near(E.quarterGpa(mk([f], { settings: { weightMode: "none" } }), 1, true).gpa, 0);
});
t("per-class custom weighting only when enabled", () => {
  const c = { name: "X", level: "regular", g: { q1: "95" }, bonusOverride: 0.5 };
  near(E.quarterGpa(mk([c]), 1, true).gpa, 4);
  near(E.quarterGpa(mk([c], { settings: { allowCustomWeights: true } }), 1, true).gpa, 4.5);
});
t("excluded (include:false) classes do not count", () => {
  const s = mk([...base3, { name: "Study hall", g: { q1: "100" }, include: false }]);
  near(E.quarterGpa(s, 1, false).gpa, 3.0);
  assert.equal(E.summarize(s).includedCount, 3);
});
t("letter entries use the scale points; mixed % and letter", () => {
  near(E.quarterGpa(mk([{ g: { q1: "A" } }, { g: { q1: "73" } }]), 1, false).gpa, 3.0); // 4 and 2
});

console.log("quarters, status, semester, year");
t("status labels follow the selected quarter and never delete grades", () => {
  const s = mk([{ g: { q1: "90", q2: "80", q3: "85", q4: "95" } }]);
  const row = (cq) => { s.currentQuarter = cq; return [1, 2, 3, 4].map((q) => E.cellStatus(s.classes[0], q, s)); };
  assert.deepEqual(row(1), ["current", "planned", "planned", "planned"]);
  assert.deepEqual(row(3), ["completed", "completed", "current", "planned"]);
  assert.deepEqual(row(4), ["completed", "completed", "completed", "current"]);
  assert.equal(Object.keys(s.classes[0].grades).length, 4);
});
t("missing vs unset", () => {
  const s = mk([{ g: { q1: "90" } }], { currentQuarter: 2 });
  assert.deepEqual([1, 2, 3, 4].map((q) => E.cellStatus(s.classes[0], q, s)), ["completed", "missing", "unset", "unset"]);
});
t("planned quarter GPA uses targets but is flagged hypothetical", () => {
  const s = mk([{ g: { q1: "90", q3: "A" } }], { currentQuarter: 1 });
  const r = E.quarterGpa(s, 3, false);
  near(r.gpa, 4); assert.equal(r.hypothetical, true); assert.equal(E.quarterGpa(s, 1, false).hypothetical, false);
});
t("semester GPA needs BOTH quarters for a class: (3.5 + 3)/2 = 3.25", () => {
  const s = mk([{ name: "A", g: { q1: "90", q2: "80" } }, { name: "B", g: { q1: "80", q2: "85" } }, { name: "C", g: { q1: "95" } }], { currentQuarter: 2 });
  const r = E.semesterGpa(s, 1, false, false);
  near(r.gpa, 3.25); assert.deepEqual(r.excluded.map((x) => x.name), ["C"]);
});
t("semester GPA ignores planned quarters unless asked", () => {
  const s = mk([{ g: { q1: "90", q2: "80" } }], { currentQuarter: 1 });
  assert.equal(E.semesterGpa(s, 1, false, false).gpa, null);
  near(E.semesterGpa(s, 1, false, true).gpa, 3.5);
});
t("year to date averages only earned quarters; projected needs all four", () => {
  const s = mk([{ g: { q1: "95", q2: "85", q3: "75" } }], { currentQuarter: 3 }); // 4,3,2 -> 3
  near(E.yearGpa(s, false, "toDate").gpa, 3);
  assert.equal(E.yearGpa(s, false, "projected").gpa, null);
  s.classes[0].grades.q4 = E.parseGradeInput("A", s.settings).entry; // 4 -> (4+3+2+4)/4 = 3.25
  near(E.yearGpa(s, false, "projected").gpa, 3.25);
  assert.equal(E.yearGpa(s, false, "projected").hypothetical, true);
});
t("year uses per-class means THEN credit weights (not pooled quarters)", () => {
  // class X 1cr: Q1 A(4); class Y 0.5cr: Q1 C(2), Q2 C(2).  year = (4*1 + 2*0.5)/1.5 = 3.3333
  const s = mk([{ name: "X", credits: 1, g: { q1: "A" } }, { name: "Y", credits: 0.5, g: { q1: "C", q2: "C" } }], { currentQuarter: 2 });
  near(E.yearGpa(s, false, "toDate").gpa, 5 / 1.5);
});

console.log("cumulative");
t("(3.5*10 + 7)/(10+2) = 3.5", () => {
  const s = mk([{ g: { q1: "A" } }, { g: { q1: "B" } }]);
  s.history = { unweightedGpa: 3.5, weightedGpa: null, credits: 10 };
  near(E.cumulativeGpa(s, false, "toDate").gpa, 3.5);
});
t("(3.0*20 + 4*1 + 2*0.5)/(20+1.5) = 65/21.5", () => {
  const s = mk([{ credits: 1, g: { q1: "A" } }, { credits: 0.5, g: { q1: "C" } }]);
  s.history = { unweightedGpa: 3.0, weightedGpa: null, credits: 20 };
  near(E.cumulativeGpa(s, false, "toDate").gpa, 65 / 21.5);
});
t("no history -> null with an explanation, never a misleading number", () => {
  const s = mk([{ g: { q1: "A" } }]);
  const r = E.cumulativeGpa(s, false, "toDate");
  assert.equal(r.gpa, null); assert.match(r.reason, /earlier GPA/);
  s.history = { unweightedGpa: 3.5, weightedGpa: null, credits: null };
  assert.equal(E.cumulativeGpa(s, false, "toDate").gpa, null); // GPA without credits is not enough
  s.history = { unweightedGpa: null, weightedGpa: 4.1, credits: 12 };
  assert.equal(E.cumulativeGpa(s, false, "toDate").gpa, null); // weighted history cannot stand in for unweighted
  assert.ok(E.cumulativeGpa(s, true, "toDate").gpa > 0);
});

console.log("goal planner");
const one = () => mk([{ name: "Alg", g: { q1: "A", q2: "B" } }], { currentQuarter: 2 }); // known 4+3, 2 slots
t("target 3.5: needs avg 3.5 base points; A+B mix works; all-B gives 3.25; all-A gives 3.75", () => {
  const r = E.planGoal(one(), { target: 3.5, basis: "unweighted", scope: "year" });
  assert.ok(r.ok && r.achievable);
  near(r.maxAchievable, 3.75); near(r.minPossible, (4 + 3 + 0 + 0) / 4);
  near(r.requiredBasePoints, 3.5, 1e-6);
  assert.equal(r.remainingQuarters.join(), "3,4"); assert.equal(r.slots, 2);
  near(r.uniform.find((u) => u.letter === "B").projected, 3.25);
  const mix = r.scenarios.find((s) => s.id === "mix");
  assert.deepEqual(mix.assignments, [{ letter: "A", count: 1 }, { letter: "B", count: 1 }]);
  near(mix.projected, 3.5); assert.ok(mix.meetsGoal && mix.hypothetical);
  assert.equal(r.scenarios.find((s) => s.id === "uniform").assignments[0].letter, "A");
});
t("unreachable goal reports the highest achievable GPA", () => {
  const r = E.planGoal(one(), { target: 3.9, basis: "unweighted", scope: "year" });
  assert.ok(r.ok); assert.equal(r.achievable, false); near(r.maxAchievable, 3.75);
  assert.match(r.explanation, /3\.750/);
});
t("already-guaranteed goal is recognised", () => {
  const s = mk([{ g: { q1: "A", q2: "A" } }], { currentQuarter: 2 });
  const r = E.planGoal(s, { target: 2, basis: "unweighted", scope: "year" });
  assert.ok(r.alreadyGuaranteed); // worst case (4+4+0+0)/4 = 2.0
  assert.equal(E.planGoal(s, { target: 2.01, basis: "unweighted", scope: "year" }).alreadyGuaranteed, false);
});
t("weighted basis: honors A=5,B=4 known, best = (5+4+5+5)/4 = 4.75", () => {
  const s = mk([{ level: "honors", g: { q1: "A", q2: "B" } }], { currentQuarter: 2 });
  near(E.planGoal(s, { target: 4.5, basis: "weighted", scope: "year" }).maxAchievable, 4.75);
});
t("credit weights across classes: X(1cr) known A,B ; Y(0.5cr) known C,C ; target by hand", () => {
  // after Q2: X known 7 over 2, Y known 4 over 2. Remaining 2 each. all-A: X=(7+8)/4=3.75, Y=(4+8)/4=3 -> (3.75+1.5)/1.5=3.5
  const s = mk([{ name: "X", credits: 1, g: { q1: "A", q2: "B" } }, { name: "Y", credits: 0.5, g: { q1: "C", q2: "C" } }], { currentQuarter: 2 });
  const r = E.planGoal(s, { target: 3.4, basis: "unweighted", scope: "year" });
  near(r.maxAchievable, 3.5); assert.equal(r.slots, 4);
  assert.equal(E.planGoal(s, { target: 3.6, basis: "unweighted", scope: "year" }).achievable, false);
  // mix: upgrading X first (bigger credit) -> all-B baseline: X=(7+6)/4=3.25,Y=(4+6)/4=2.5 -> 4.0/1.5... check numerically
  const allB = r.uniform.find((u) => u.letter === "B").projected;
  near(allB, (3.25 * 1 + 2.5 * 0.5) / 1.5);
});
t("cumulative scope: hist 3.0 over 4 credits + this year's class; target 3.1 needs year avg 3.5", () => {
  const s = one(); s.history = { unweightedGpa: 3.0, weightedGpa: null, credits: 4 };
  const r = E.planGoal(s, { target: 3.1, basis: "unweighted", scope: "cumulative" });
  assert.ok(r.ok); near(r.maxAchievable, (12 + 3.75) / 5); near(r.requiredBasePoints, 3.5, 1e-6);
  near(r.currentGpa, (12 + 3.5) / 5);
});
t("cumulative scope without history explains instead of guessing", () => {
  const r = E.planGoal(one(), { target: 3.1, basis: "unweighted", scope: "cumulative" });
  assert.equal(r.ok, false); assert.match(r.reason, /can't be calculated reliably/);
});
t("no remaining quarters / no classes / bad target are explained", () => {
  const done = mk([{ g: { q1: "A", q2: "A", q3: "A", q4: "A" } }], { currentQuarter: 4 });
  assert.equal(E.planGoal(done, { target: 3, basis: "unweighted", scope: "year" }).ok, false);
  assert.equal(E.planGoal(mk([]), { target: 3, basis: "unweighted", scope: "year" }).ok, false);
  assert.equal(E.planGoal(one(), { target: 9, basis: "unweighted", scope: "year" }).ok, false);
  assert.equal(E.planGoal(one(), { target: "x", basis: "unweighted", scope: "year" }).ok, false);
});
t("current quarter with no grade yet counts as a slot to plan", () => {
  const s = mk([{ g: { q1: "A" } }], { currentQuarter: 2 });
  assert.equal(E.planGoal(s, { target: 3, basis: "unweighted", scope: "year" }).slots, 3); // Q2,Q3,Q4
});
t("nothing entered yet: planner still works from the scale (no current GPA)", () => {
  const s = mk([{ name: "A" }], { currentQuarter: 1 });
  const r = E.planGoal(s, { target: 3.0, basis: "unweighted", scope: "year" });
  assert.ok(r.ok); assert.equal(r.currentGpa, null); assert.equal(r.slots, 4); near(r.requiredBasePoints, 3.0, 1e-6);
});

console.log("persistence safety");
t("normalizeState survives garbage and keeps valid data", () => {
  for (const g of [null, undefined, 5, "x", [], { classes: "no" }, { settings: { scale: "bad" } }]) assert.doesNotThrow(() => E.normalizeState(g));
  const n = E.normalizeState({ currentQuarter: 9, classes: [{ name: 5, level: "zzz", credits: -3, grades: { q1: { t: "p", v: 999 }, q2: { t: "p", v: 88 }, q9: 1 } }], settings: { scale: [{ letter: "A", minPercent: 50, points: 4 }] } });
  assert.equal(n.currentQuarter, 1);
  assert.equal(n.classes[0].level, "regular"); assert.equal(n.classes[0].credits, 1);
  assert.equal(n.classes[0].grades.q1, undefined); assert.equal(n.classes[0].grades.q2.v, 88);
  assert.equal(n.settings.scale.length, 5); // invalid custom scale rejected -> defaults
  const rt = E.normalizeState(JSON.parse(JSON.stringify(mk([{ name: "R", g: { q1: "91" } }], { currentQuarter: 3 }))));
  assert.equal(rt.currentQuarter, 3); assert.equal(rt.classes[0].grades.q1.v, 91);
});
t("calculation is deterministic", () => {
  const s = mk(base3);
  assert.equal(JSON.stringify(E.summarize(s)), JSON.stringify(E.summarize(JSON.parse(JSON.stringify(s)))));
});

console.log(`\n${passed} passed${process.exitCode ? ", SOME FAILED" : ""}`);
