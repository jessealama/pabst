import ts from "typescript";
import { isDomain } from "./domains.js";
import type { Binder } from "./ir.js";

export interface ParsedFormula {
  binders: Binder[];
  /** Raw TS expression text of each `pre(...)` argument, in source order. */
  preconditions: string[];
  /** Raw TS expression text of the returned / expression body. */
  body: string;
  /** Precondition arguments + body, as nodes to walk for free identifiers. */
  exprNodes: ts.Expression[];
}

const VALID_DOMAINS = "int, nat, number, boolean, string, bigint";

export function parseFormula(formula: string): ParsedFormula {
  const sf = ts.createSourceFile("__formula.ts", `(${formula});`, ts.ScriptTarget.Latest, true);
  const stmt = sf.statements[0];
  if (!stmt || !ts.isExpressionStatement(stmt)) {
    throw new Error(`property must be an arrow function '(x: domain, ...) => body': ${formula.trim().slice(0, 60)}`);
  }
  let expr: ts.Expression = stmt.expression;
  while (ts.isParenthesizedExpression(expr)) expr = expr.expression;
  if (!ts.isArrowFunction(expr)) {
    throw new Error(`property must be an arrow function '(x: domain, ...) => body': ${formula.trim().slice(0, 60)}`);
  }

  const binders = parseBinders(expr, sf);
  const { preconditions, body, exprNodes } = parseBody(expr.body, sf);
  return { binders, preconditions, body, exprNodes };
}

function parseBinders(arrow: ts.ArrowFunction, sf: ts.SourceFile): Binder[] {
  const binders: Binder[] = [];
  for (const p of arrow.parameters) {
    if (!ts.isIdentifier(p.name)) {
      throw new Error(`binder must be a simple name '(x: domain)', no destructuring: ${p.getText(sf)}`);
    }
    if (p.dotDotDotToken) throw new Error(`rest parameters are not supported: ${p.getText(sf)}`);
    if (p.questionToken) throw new Error(`optional binders are not supported: ${p.name.text}`);
    if (p.initializer) throw new Error(`default binder values are not supported: ${p.name.text}`);
    if (!p.type) throw new Error(`binder '${p.name.text}' needs a domain, e.g. (${p.name.text}: int)`);
    const domain = p.type.getText(sf);
    if (!isDomain(domain)) {
      throw new Error(`unknown generation domain '${domain}' — valid domains: ${VALID_DOMAINS}`);
    }
    binders.push({ varName: p.name.text, domain });
  }
  if (binders.length === 0) {
    throw new Error(`property needs at least one binder, e.g. (x: int) => ...`);
  }
  return binders;
}

function parseBody(
  bodyNode: ts.ConciseBody,
  sf: ts.SourceFile,
): { preconditions: string[]; body: string; exprNodes: ts.Expression[] } {
  const preconditions: string[] = [];
  const exprNodes: ts.Expression[] = [];

  if (!ts.isBlock(bodyNode)) {
    exprNodes.push(bodyNode);
    return { preconditions, body: bodyNode.getText(sf), exprNodes };
  }

  let returnExpr: ts.Expression | undefined;
  for (const s of bodyNode.statements) {
    if (ts.isExpressionStatement(s) && isPreCall(s.expression)) {
      const arg = (s.expression as ts.CallExpression).arguments[0]!;
      preconditions.push(arg.getText(sf));
      exprNodes.push(arg);
      continue;
    }
    if (ts.isReturnStatement(s)) {
      if (returnExpr) throw new Error(`property block body has more than one return`);
      if (!s.expression) throw new Error(`property block body must return a boolean expression`);
      returnExpr = s.expression;
      continue;
    }
    throw new Error(`property block body may contain only pre(...) and one return: ${s.getText(sf)}`);
  }
  if (!returnExpr) throw new Error(`property block body must return a boolean expression`);
  exprNodes.push(returnExpr);
  return { preconditions, body: returnExpr.getText(sf), exprNodes };
}

function isPreCall(e: ts.Expression): e is ts.CallExpression {
  return ts.isCallExpression(e) && ts.isIdentifier(e.expression) && e.expression.text === "pre" && e.arguments.length === 1;
}
