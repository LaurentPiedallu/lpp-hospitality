// Run with: npm test  (node --test, no framework)
//
// The one-Total-per-key tagging rule, and the transition to it: every
// lookup here must resolve identically on old-tagged records (roll-up and
// sub-components all on Segment "Total", Lex Yard June 2026) and new-tagged
// ones (components on their own Segment, Lex Yard July 2026).

import test from "node:test";
import assert from "node:assert/strict";
import {
  resolveCanonicalRollup, findMetricByKey, metricSeriesForKey, isIncludingComps,
  findFinancialComponents, benchmarkPosition, findSurveyCount, surveyVolumeChange,
} from "./format.ts";
import type { KpiMetric } from "../types/portal.ts";

const JUNE = "2026-06-01";
const JULY = "2026-07-01";

function rec(
  lppMetricKey: string,
  segment: string | null,
  metricName: string,
  metricValue: number,
  category: string,
  periodStart = JUNE
): KpiMetric {
  return { lppMetricKey, segment, metricName, metricValue, category, periodStart } as unknown as KpiMetric;
}

test("new tagging: the single Segment Total record is the headline", () => {
  const july = [
    rec("total_payroll", "Payroll Subtotal", "Total Payroll", 231904, "Labor", JULY),
    rec("total_payroll", "Total", "Total Payroll Taxes and Benefits", 407892, "Labor", JULY),
    rec("total_payroll", "Wages Total", "Total Wages", 231119, "Labor", JULY),
  ];
  // Neither Total-ish name matches CANONICAL_METRIC_NAME exactly (no comma),
  // which is what made the old resolver fall back to first-in-Notion-order.
  assert.equal(findMetricByKey(july, "total_payroll", JULY)?.metricValue, 407892);
});

test("old tagging: roll-up and components all on Total still resolve by canonical name", () => {
  const june = [
    rec("total_revenue", "Total", "Total Beverage Revenue", 153643, "Revenue"),
    rec("total_revenue", "Total", "Total Food Revenue", 428553, "Revenue"),
    rec("total_revenue", "Total", "Total Revenue", 608445, "Revenue"),
  ];
  assert.equal(findMetricByKey(june, "total_revenue", JUNE)?.metricValue, 608445);
});

test("blank Segment counts as Total", () => {
  const rows = [rec("labor_pct", null, "Total Payroll, Taxes and Benefits Percentage", 59, "Labor")];
  assert.equal(findMetricByKey(rows, "labor_pct", JUNE)?.metricValue, 59);
});

test("avg_check / covers fall back to Including Comps, flagged; other keys never do", () => {
  const july = [
    rec("avg_check", "Including Comps", "Food and Beverage Average Check (Inc Comps)", 68.83, "Revenue", JULY),
    rec("avg_check", "Food", "Food Average Check (Inc Comps)", 52.68, "Revenue", JULY),
    rec("total_covers_period", "Including Comps", "Total Covers", 12405, "Revenue", JULY),
    rec("total_covers_period", "Breakfast", "Breakfast Covers", 4072, "Revenue", JULY),
    rec("total_revenue", "Including Comps", "Odd record", 1, "Revenue", JULY),
  ];
  const avg = findMetricByKey(july, "avg_check", JULY, "Revenue");
  assert.equal(avg?.metricValue, 68.83);
  assert.equal(isIncludingComps(avg), true);
  const covers = findMetricByKey(july, "covers", JULY, "Revenue");
  assert.equal(covers?.metricValue, 12405);
  assert.equal(isIncludingComps(covers), true);
  assert.equal(findMetricByKey(july, "total_revenue", JULY), null);
});

test("a comps-excluded Total beats the Including Comps record", () => {
  const rows = [
    rec("avg_check", "Total", "Total Food and Beverage Average Check Excluding Comps", 86.43, "Revenue"),
    rec("avg_check", "Including Comps", "Food and Beverage Average Check Including Comps", 78.12, "Revenue"),
  ];
  const m = findMetricByKey(rows, "avg_check", JUNE, "Revenue");
  assert.equal(m?.metricValue, 86.43);
  assert.equal(isIncludingComps(m), false);
});

test("explicit-segment lookups only see that segment", () => {
  const rows = [
    rec("total_covers_period", "Total", "Total Revenue Covers", 7040, "Revenue"),
    rec("total_covers_period", "Breakfast", "Breakfast Covers", 2702, "Revenue"),
  ];
  assert.equal(findMetricByKey(rows, "covers", JUNE, "Revenue", "Breakfast")?.metricValue, 2702);
  assert.equal(findMetricByKey(rows, "covers", JUNE, "Revenue", "Dinner"), null);
  // Headline lookup never returns a component when no Total exists.
  const noTotal = [rec("total_revenue", "Food", "Food Revenue", 1, "Revenue")];
  assert.equal(findMetricByKey(noTotal, "total_revenue", JUNE), null);
});

test("resolveCanonicalRollup still warns + falls back to first on an unresolved Total collision", () => {
  const warnings: string[] = [];
  const original = console.warn;
  console.warn = (msg?: unknown) => warnings.push(String(msg));
  try {
    const rows = [rec("brand_new_key", "Total", "A", 1, "X"), rec("brand_new_key", "Total", "B", 2, "X")];
    assert.equal(resolveCanonicalRollup(rows, "brand_new_key")?.metricValue, 1);
    assert.equal(warnings.length, 1);
  } finally {
    console.warn = original;
  }
});

test("trend series never mixes comps-excluded and comps-inclusive points", () => {
  const rows = [
    rec("total_covers_period", "Total", "Total Revenue Covers", 7040, "Revenue", JUNE),
    rec("total_covers_period", "Including Comps", "Total Covers", 12405, "Revenue", JULY),
  ];
  assert.deepEqual(metricSeriesForKey(rows, "covers", "Revenue").map((m) => m.metricValue), [7040]);
  const inclOnly = [rows[1]];
  assert.deepEqual(metricSeriesForKey(inclOnly, "covers", "Revenue").map((m) => m.metricValue), [12405]);
});

test("components: old (Lex Yard June) shape resolves by legacy Metric Name", () => {
  const june = [
    rec("total_revenue", "Total", "Total Revenue", 608445, "Revenue"),
    rec("total_revenue", "Total", "Total Food Revenue", 428553, "Revenue"),
    rec("total_revenue", "Total", "Total Beverage Revenue", 153643, "Revenue"),
    rec("total_cogs", "Total", "Food Cost of Sales", 118321, "COGS"),
    rec("total_cogs", "Total", "Beverage Cost of Sales", 25782, "COGS"),
    rec("total_payroll", "Total", "Total Wages", 204307, "Labor"),
    rec("total_payroll", "Total", "Taxes and Benefits", 152723, "Labor"),
  ];
  const c = findFinancialComponents(june, JUNE);
  assert.equal(c.foodRevenue?.metricValue, 428553);
  assert.equal(c.beverageRevenue?.metricValue, 153643);
  assert.equal(c.foodCost?.metricValue, 118321);
  assert.equal(c.beverageCost?.metricValue, 25782);
  assert.equal(c.wages?.metricValue, 204307);
  assert.equal(c.taxesAndBenefitsValue, 152723);
});

test("components: re-tagged shape resolves by Segment, with identical values", () => {
  const june = [
    rec("total_revenue", "Total", "Total Revenue", 608445, "Revenue"),
    rec("total_revenue", "Food", "Total Food Revenue", 428553, "Revenue"),
    rec("total_revenue", "Beverage", "Total Beverage Revenue", 153643, "Revenue"),
    rec("total_cogs", "Food", "Food Cost of Sales", 118321, "COGS"),
    rec("total_cogs", "Beverage", "Beverage Cost of Sales", 25782, "COGS"),
    rec("total_payroll", "Wages Total", "Total Wages", 204307, "Labor"),
    rec("total_payroll", "Taxes and Benefits", "Taxes and Benefits", 152723, "Labor"),
  ];
  const c = findFinancialComponents(june, JUNE);
  assert.equal(c.foodRevenue?.metricValue, 428553);
  assert.equal(c.beverageRevenue?.metricValue, 153643);
  assert.equal(c.foodCost?.metricValue, 118321);
  assert.equal(c.beverageCost?.metricValue, 25782);
  assert.equal(c.wages?.metricValue, 204307);
  assert.equal(c.taxesAndBenefitsValue, 152723);
});

test("components: Payroll Taxes + Benefits are summed when no combined record exists", () => {
  const rows = [
    rec("total_payroll", "Payroll Taxes", "Payroll Taxes", 38890, "Labor", JULY),
    rec("total_payroll", "Benefits", "Total Benefits", 137098, "Labor", JULY),
  ];
  const c = findFinancialComponents(rows, JULY);
  assert.equal(c.taxesAndBenefits, null);
  assert.equal(c.taxesAndBenefitsValue, 175988);
  assert.equal(findFinancialComponents([rows[0]], JULY).taxesAndBenefitsValue, null);
});

test("benchmarkPosition only answers against a real benchmark", () => {
  assert.equal(benchmarkPosition(59, 34, 40), "above");
  assert.equal(benchmarkPosition(23.7, 28, 34), "below");
  assert.equal(benchmarkPosition(30, 28, 34), "within");
  assert.equal(benchmarkPosition(30, 0, 0), null);
  assert.equal(benchmarkPosition(30, null, 34), null);
});

test("survey volume change needs the property's own prior survey record", () => {
  const onlyJune = [rec("unclassified", "Total", "Survey Count", 118, "Guest Experience")];
  assert.equal(findSurveyCount(onlyJune, JUNE)?.metricValue, 118);
  assert.equal(surveyVolumeChange(onlyJune, JUNE), null);

  const withPrior = [
    rec("survey_count", "Total", "Survey Count", 75, "Guest Experience", JULY),
    rec("unclassified", "Total", "Survey Response Count", 100, "Guest Experience", JUNE),
  ];
  const change = surveyVolumeChange(withPrior, JULY);
  assert.equal(change?.prior, 100);
  assert.equal(change?.priorPeriod, JUNE);
  assert.equal(Math.round(change!.changePct), -25);
});

test("copy helpers: ranges in words, negative percentages in words, clean OpEx labels", async () => {
  const { benchmarkRange, signedPctWords, opexLineLabel } = await import("./format.ts");
  assert.equal(benchmarkRange(34, 40, "%"), "34 to 40%");
  assert.equal(benchmarkRange(26.5, 32, "%"), "26.5 to 32%");
  assert.equal(benchmarkRange(90, 160, "$"), "$90 to $160");
  assert.equal(signedPctWords(-86.5), "negative 86.5%");
  assert.equal(signedPctWords(12), "12.0%");
  assert.equal(opexLineLabel("Kitchen Allocation Expense"), "Kitchen allocation");
  assert.equal(opexLineLabel("Kitchen Allocation"), "Kitchen allocation");
  assert.equal(opexLineLabel("Plants and Decorations"), "Plants and decorations");
});

test("componentLines labels by component, never by Metric Name", async () => {
  const { componentLines } = await import("./format.ts");
  const peacock = [
    rec("total_cogs", "Food", "Cost of Sales - Food", 67985, "COGS"),
    rec("total_cogs", "Beverage", "Cost of Sales - Beverage", 55381, "COGS"),
  ];
  assert.deepEqual(componentLines(findFinancialComponents(peacock, JUNE), ["foodCost", "beverageCost"]), [
    { label: "Food cost of sales", value: 67985 },
    { label: "Beverage cost of sales", value: 55381 },
  ]);
});
