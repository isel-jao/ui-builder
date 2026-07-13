import { type AnyNode, parseExpressionAt } from "acorn";

import { serialize } from "../serialize";

export const TEMPLATE_RE = /\{\{([\s\S]*?)\}\}/g;

type LiteralResult = { ok: true; value: unknown } | { ok: false };

export type TemplateErrorHandler = (error: unknown, expr: string) => void;

export function evaluateTemplate(
  doc: string,
  ctx: Record<string, unknown>,
  onError?: TemplateErrorHandler,
): unknown {
  const source = doc.trim();
  const matches = [...source.matchAll(TEMPLATE_RE)];

  if (matches.length === 0) {
    const literal = parseLiteral(source);
    return literal.ok ? literal.value : source;
  }

  const evaluate = makeEvaluator(ctx, onError);

  // The whole string is a single template: return the raw evaluated value,
  // preserving type and identity (objects, dates, functions, undefined).
  const first = matches[0];
  if (
    matches.length === 1 &&
    first &&
    first.index === 0 &&
    first[0].length === source.length
  ) {
    return evaluate(first[1] ?? "");
  }

  const values = matches.map((match) => evaluate(match[1] ?? ""));

  // Pass 1 (structural): splice quoted sentinel strings so the result can
  // parse as a data literal, then swap each sentinel for its raw evaluated
  // value — references, dates, and functions survive inside structures,
  // e.g. `{x: {{1 + 2}}, y: {{obj}}}` -> `{x: 3, y: ctx.obj}`.
  // A NUL in the doc could forge a sentinel, so skip straight to pass 2.
  if (!source.includes("\u0000")) {
    const sentinels = new Map<string, number>();
    const tokens = values.map((_, index) => {
      const sentinel = `\u0000${index}\u0000`;
      sentinels.set(sentinel, index);
      return JSON.stringify(sentinel);
    });
    const literal = parseLiteral(splice(source, tokens));
    if (literal.ok) {
      const resolved = resolveSentinels(literal.value, sentinels, values);
      if (resolved.ok) return resolved.value;
    }
  }

  // Pass 2 (textual): splice serialized values as plain text.
  const text = splice(source, values.map(serialize)).trim();
  const literal = parseLiteral(text);
  return literal.ok ? literal.value : text;
}

function splice(source: string, tokens: string[]): string {
  let i = 0;
  return source.replace(TEMPLATE_RE, () => tokens[i++] ?? "");
}

// Rebuilds a parsed literal, swapping each sentinel string for its raw
// evaluated value (a sentinel in key position becomes a serialized key).
// Fails when a sentinel ended up embedded inside a longer string — the
// template sat inside quotes — so pass 2 can handle the doc textually.
function resolveSentinels(
  parsed: unknown,
  sentinels: Map<string, number>,
  values: unknown[],
): LiteralResult {
  if (typeof parsed === "string") {
    if (!parsed.includes("\u0000")) return { ok: true, value: parsed };
    const index = sentinels.get(parsed);
    if (index === undefined) return { ok: false };
    return { ok: true, value: values[index] };
  }
  if (Array.isArray(parsed)) {
    const arr: unknown[] = [];
    for (const element of parsed) {
      const resolved = resolveSentinels(element, sentinels, values);
      if (!resolved.ok) return resolved;
      arr.push(resolved.value);
    }
    return { ok: true, value: arr };
  }
  if (parsed !== null && typeof parsed === "object") {
    const obj: Record<string, unknown> = {};
    for (const [rawKey, rawValue] of Object.entries(parsed)) {
      let key = rawKey;
      if (rawKey.includes("\u0000")) {
        const index = sentinels.get(rawKey);
        if (index === undefined) return { ok: false };
        key = serialize(values[index]);
      }
      const resolved = resolveSentinels(rawValue, sentinels, values);
      if (!resolved.ok) return resolved;
      Object.defineProperty(obj, key, {
        value: resolved.value,
        enumerable: true,
        writable: true,
        configurable: true,
      });
    }
    return { ok: true, value: obj };
  }
  return { ok: true, value: parsed };
}

// A failed expression evaluates to undefined; `onError` observes the failure
// so callers that track errors (variables, bindings) can record it.
function makeEvaluator(
  ctx: Record<string, unknown>,
  onError?: TemplateErrorHandler,
) {
  const names = Object.keys(ctx).filter(isBindableName);
  const args = names.map((name) => ctx[name]);
  return (expr: string): unknown => {
    try {
      const fn = new Function(...names, `"use strict"; return (${expr}\n);`);
      return fn(...args);
    } catch (error) {
      onError?.(error, expr);
      return undefined;
    }
  };
}

// A ctx key can only be bound as a function parameter if it is a valid,
// non-reserved identifier ("foo-bar" or "class" would be a SyntaxError).
function isBindableName(name: string): boolean {
  if (!/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(name)) return false;
  try {
    new Function(name, '"use strict";');
    return true;
  } catch {
    return false;
  }
}

// Parses a string as a pure data literal (JSON plus unquoted keys, single
// quotes, undefined/NaN/Infinity, signed numbers). Built straight from the
// AST — nothing is executed. Any operator, call, or identifier fails.
function parseLiteral(src: string): LiteralResult {
  if (src === "") return { ok: false };
  let node: AnyNode;
  try {
    node = parseExpressionAt(src, 0, { ecmaVersion: "latest" });
  } catch {
    return { ok: false };
  }
  if (src.slice(node.end).trim() !== "") return { ok: false };
  return valueFromNode(node);
}

function valueFromNode(node: AnyNode): LiteralResult {
  switch (node.type) {
    case "Literal": {
      if ("regex" in node && node.regex) return { ok: false };
      if ("bigint" in node && node.bigint) return { ok: false };
      const value = node.value;
      if (
        value === null ||
        typeof value === "string" ||
        typeof value === "number" ||
        typeof value === "boolean"
      ) {
        return { ok: true, value };
      }
      return { ok: false };
    }
    case "Identifier": {
      if (node.name === "undefined") return { ok: true, value: undefined };
      if (node.name === "NaN") return { ok: true, value: NaN };
      if (node.name === "Infinity") return { ok: true, value: Infinity };
      return { ok: false };
    }
    case "UnaryExpression": {
      if (!node.prefix || (node.operator !== "-" && node.operator !== "+")) {
        return { ok: false };
      }
      const arg = valueFromNode(node.argument);
      if (!arg.ok || typeof arg.value !== "number") return { ok: false };
      return {
        ok: true,
        value: node.operator === "-" ? -arg.value : arg.value,
      };
    }
    case "ObjectExpression": {
      const obj: Record<string, unknown> = {};
      for (const prop of node.properties) {
        if (prop.type !== "Property" || prop.kind !== "init" || prop.computed) {
          return { ok: false };
        }
        let key: string;
        if (prop.key.type === "Identifier") {
          key = prop.key.name;
        } else if (
          prop.key.type === "Literal" &&
          (typeof prop.key.value === "string" ||
            typeof prop.key.value === "number")
        ) {
          key = String(prop.key.value);
        } else {
          return { ok: false };
        }
        const val = valueFromNode(prop.value);
        if (!val.ok) return { ok: false };
        // defineProperty so a "__proto__" key becomes a plain own property
        Object.defineProperty(obj, key, {
          value: val.value,
          enumerable: true,
          writable: true,
          configurable: true,
        });
      }
      return { ok: true, value: obj };
    }
    case "ArrayExpression": {
      const arr: unknown[] = [];
      for (const element of node.elements) {
        if (element === null || element.type === "SpreadElement") {
          return { ok: false };
        }
        const val = valueFromNode(element);
        if (!val.ok) return { ok: false };
        arr.push(val.value);
      }
      return { ok: true, value: arr };
    }
    default:
      return { ok: false };
  }
}
