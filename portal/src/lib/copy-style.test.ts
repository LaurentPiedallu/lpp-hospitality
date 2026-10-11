// Run with: npm test  (node --test, no framework)
//
// House style for client-facing copy: no dash used to join clauses
// (" — ", " – ", " - ") and no parentheses. This parses every portal
// source file with the TypeScript compiler and checks the text that can
// reach a reader:
//   - JSX text;
//   - string and template literals that read as prose (two or more words).
// Skipped as code rather than copy: imports, console/Error/RegExp
// arguments, string arguments of matching methods (includes, replace,
// split, startsWith...), comparison operands, JSX attributes that never
// render as text (className, style, href, key...), CSS values such as
// "rgba(...)", and test files. Comments aren't part of the AST text.
//
// A literal that must keep its exact form because it matches upstream
// data (a Notion Metric Name or Finding title) can opt out with a
// `copy-style: data` comment on the same line or the line above.

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const SRC = fileURLToPath(new URL("..", import.meta.url));

const FORBIDDEN: [RegExp, string][] = [
  [/ — /, "em dash joining clauses"],
  [/ – /, "en dash joining clauses"],
  [/ - /, "spaced hyphen joining clauses"],
  [/\(|\)/, "parentheses"],
];

// Attributes whose values never render as visible text.
const NON_COPY_ATTRS = new Set([
  "className", "style", "href", "src", "key", "id", "type", "role", "name", "value",
  "rel", "target", "method", "action", "htmlFor", "accept", "fill", "stroke", "d",
  "viewBox", "dataKey", "stroke-width", "strokeWidth", "transform", "points",
]);
const MATCHING_METHODS = new Set([
  "includes", "startsWith", "endsWith", "indexOf", "replace", "replaceAll", "split",
  "match", "matchAll", "test", "search", "get", "has", "set", "querySelector",
  "matchMedia", "localeCompare",
]);
const CSS_VALUE = /\b(?:rgba?|hsla?|var|calc|url|translate[XYZ]?|scale|rotate|linear-gradient|radial-gradient|cubic-bezier|blur|drop-shadow|minmax|repeat|clamp|min|max)\(/;

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) return sourceFiles(p);
    return /\.(ts|tsx)$/.test(name) && !/\.test\.ts$/.test(name) && !name.endsWith(".d.ts") ? [p] : [];
  });
}

function isProse(text: string): boolean {
  return /[A-Za-z]{2,}[^\n]*\s[^\n]*[A-Za-z]{2,}/.test(text);
}

function skippedByContext(node: ts.Node): boolean {
  for (let cur: ts.Node | undefined = node.parent; cur; cur = cur.parent) {
    if (ts.isImportDeclaration(cur) || ts.isExportDeclaration(cur)) return true;
    if (ts.isJsxAttribute(cur)) {
      const name = cur.name.getText();
      return NON_COPY_ATTRS.has(name) || name.startsWith("on") || name.startsWith("aria-hidden");
    }
    if (ts.isNewExpression(cur) && /^(Error|RegExp|URL|Date)$/.test(cur.expression.getText())) return true;
    if (ts.isThrowStatement(cur)) return true;
    if (ts.isCallExpression(cur)) {
      const callee = cur.expression;
      if (ts.isPropertyAccessExpression(callee)) {
        const obj = callee.expression.getText();
        const method = callee.name.getText();
        if (obj === "console") return true;
        // String arguments of matching methods are patterns, not copy.
        if (MATCHING_METHODS.has(method) && cur.arguments.some((a) => a === node || a.pos <= node.pos && node.end <= a.end)) {
          return true;
        }
      }
      const calleeText = callee.getText();
      if (/^(RegExp|require|encodeURIComponent)$/.test(calleeText)) return true;
    }
    if (ts.isBinaryExpression(cur) && [
      ts.SyntaxKind.EqualsEqualsEqualsToken, ts.SyntaxKind.ExclamationEqualsEqualsToken,
      ts.SyntaxKind.EqualsEqualsToken, ts.SyntaxKind.ExclamationEqualsToken,
    ].includes(cur.operatorToken.kind)) return true;
    // Stop at statement level: the context above it can't change meaning.
    if (ts.isStatement(cur) && !ts.isBlock(cur) && !ts.isReturnStatement(cur) && !ts.isVariableStatement(cur)) break;
  }
  return false;
}

function optedOut(sf: ts.SourceFile, node: ts.Node): boolean {
  const line = sf.getLineAndCharacterOfPosition(node.getStart(sf)).line;
  const lines = sf.text.split("\n");
  return [line, line - 1].some((l) => l >= 0 && /copy-style:\s*data/.test(lines[l] ?? ""));
}

export function findCopyViolations(): string[] {
  const violations: string[] = [];
  for (const file of sourceFiles(SRC)) {
    const text = readFileSync(file, "utf8");
    const sf = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, file.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
    const check = (node: ts.Node, value: string, isJsxText: boolean) => {
      const t = value.replace(/\s+/g, " ").trim();
      if (!t || t === "—" || t === "–") return; // empty-cell placeholders
      // JSX text keeps its edge spaces so "Recommendation — " still reads
      // as a joiner.
      const probe = isJsxText ? ` ${value.replace(/\s+/g, " ")} ` : t;
      if (!isJsxText && !isProse(t)) return;
      if (CSS_VALUE.test(t) || /^\(?(max|min)-width/.test(t)) return;
      if (skippedByContext(node) || optedOut(sf, node)) return;
      for (const [re, why] of FORBIDDEN) {
        if (re.test(probe)) {
          const { line } = sf.getLineAndCharacterOfPosition(node.getStart(sf));
          violations.push(`${relative(SRC, file).replace(/\\/g, "/")}:${line + 1} ${why}: ${t.slice(0, 120)}`);
          break;
        }
      }
    };
    const visit = (node: ts.Node) => {
      if (ts.isJsxText(node)) check(node, node.text, true);
      else if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
        // Property names and import specifiers are identifiers in disguise.
        if (!(node.parent && ts.isPropertyAssignment(node.parent) && node.parent.name === node)) check(node, node.text, false);
      } else if (ts.isTemplateExpression(node)) {
        // Join the literal parts with a placeholder so a dash between two
        // interpolations is still seen.
        const joined = [node.head.text, ...node.templateSpans.map((s) => `X${s.literal.text}`)].join("");
        check(node, joined, false);
      }
      ts.forEachChild(node, visit);
    };
    visit(sf);
  }
  return violations;
}

test("UI copy uses no dash clause joiners and no parentheses", () => {
  const violations = findCopyViolations();
  assert.deepEqual(violations, [], `Copy style violations:\n${violations.join("\n")}`);
});
