// Run with: npm test  (node --test, no framework)
//
// Guards the roll-up disambiguation contract: every roll-up (total_*) and
// percentage (*_pct) LppMetricKey must have a CANONICAL_METRIC_NAME entry,
// so a future session that adds such a key can't silently reintroduce the
// "first record wins on a collision" bug (Lex Yard June 2026 — Revenue card
// showed $154K Beverage revenue instead of the $608,445 roll-up).

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { CANONICAL_METRIC_NAME, resolveCanonicalRollup } from "./format.ts";

// Read the LppMetricKey string-literal union straight from the type source
// so this test tracks the real type rather than a hand-copied list.
function lppMetricKeys(): string[] {
  const src = readFileSync(fileURLToPath(new URL("../types/portal.ts", import.meta.url)), "utf8");
  const m = src.match(/export type LppMetricKey\s*=\s*([\s\S]*?);/);
  assert.ok(m, "could not locate the LppMetricKey union in types/portal.ts");
  return [...m[1].matchAll(/"([^"]+)"/g)].map((x) => x[1]);
}

// opex and net_profit are roll-up keys too — the pipeline tags two distinct
// Segment "Total" records under each (opex: "Total Other Operating Expenses"
// vs "Total Expenses"; net_profit: "Departmental Profit/(Loss)" vs "Gross
// Profit", both seen live on Yoshoku's first P&L) — but they don't fit the
// total_* / *_pct shape, so name them explicitly or the guard misses exactly
// the keys most prone to a silent collision.
const EXTRA_ROLLUP_KEYS = ["opex", "net_profit"];

test("every roll-up / *_pct metric key has a CANONICAL_METRIC_NAME entry", () => {
  const rollupKeys = lppMetricKeys().filter(
    (k) => k.startsWith("total_") || k.endsWith("_pct") || EXTRA_ROLLUP_KEYS.includes(k)
  );
  assert.ok(rollupKeys.length >= 8, `expected the roll-up/percentage keys, got: ${rollupKeys.join(", ")}`);
  const missing = rollupKeys.filter((k) => !(k in CANONICAL_METRIC_NAME));
  assert.deepEqual(
    missing,
    [],
    `CANONICAL_METRIC_NAME (src/lib/format.ts) is missing an entry for: ${missing.join(", ")}`
  );
});

test("resolveCanonicalRollup picks the canonical record on a key+segment collision", () => {
  const row = (metricName: string, metricValue: number) =>
    ({ metricName, metricValue } as Parameters<typeof resolveCanonicalRollup>[0][number]);
  const candidates = [
    row("Total Beverage Revenue", 153643),
    row("Total Food Revenue", 428553),
    row("Total Revenue", 608445),
  ];
  assert.equal(resolveCanonicalRollup(candidates, "total_revenue")?.metricValue, 608445);
});

test("resolveCanonicalRollup resolves the opex / net_profit two-headline collisions", () => {
  const row = (metricName: string, metricValue: number) =>
    ({ metricName, metricValue } as Parameters<typeof resolveCanonicalRollup>[0][number]);

  // Yoshoku's first P&L: two records each legitimately tagged Segment
  // "Total" under one key — distinct headline concepts, not a roll-up plus
  // its parts. Canonical name is second in each array, so a first-match
  // fallback would fail these.
  const opex = [row("Total Expenses", 250277), row("Total Other Operating Expenses", 143256)];
  assert.equal(resolveCanonicalRollup(opex, "opex")?.metricValue, 143256);

  const netProfit = [row("Gross Profit", 137607), row("Departmental Profit/(Loss)", -112669)];
  assert.equal(resolveCanonicalRollup(netProfit, "net_profit")?.metricValue, -112669);
});

test("resolveCanonicalRollup passes a single candidate straight through", () => {
  const only = { metricName: "Whatever", metricValue: 42 } as Parameters<typeof resolveCanonicalRollup>[0][number];
  assert.equal(resolveCanonicalRollup([only], "some_unmapped_key"), only);
});

test("resolveCanonicalRollup warns and falls back to first on an unmapped collision", () => {
  const warnings: string[] = [];
  const original = console.warn;
  console.warn = (msg?: unknown) => warnings.push(String(msg));
  try {
    const candidates = [
      { metricName: "A", metricValue: 1 },
      { metricName: "B", metricValue: 2 },
    ] as Parameters<typeof resolveCanonicalRollup>[0];
    const picked = resolveCanonicalRollup(candidates, "brand_new_key");
    assert.equal(picked?.metricValue, 1);
    assert.equal(warnings.length, 1);
    assert.match(warnings[0], /brand_new_key/);
    assert.match(warnings[0], /CANONICAL_METRIC_NAME in lib\/format\.ts/);
  } finally {
    console.warn = original;
  }
});
