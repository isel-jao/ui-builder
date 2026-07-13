import { parse } from "acorn";
import { simple } from "acorn-walk";

/**
 * Parse a JS/TS expression and extract identifiers that reference
 * existing context entries.
 *
 * Handles common false-positives:
 * - MemberExpression property names in dot notation (obj.prop)
 * - Object literal property keys (non-computed)
 * - The wrapper variable used for parsing
 */
function tryParse(expression: string): ReturnType<typeof parse> | null {
  try {
    return parse(`var __expr = (${expression});`, {
      ecmaVersion: "latest",
      sourceType: "script",
    });
  } catch {
    try {
      return parse(expression, {
        ecmaVersion: "latest",
        sourceType: "script",
        allowReturnOutsideFunction: true,
      });
    } catch {
      return null;
    }
  }
}

/**
 * Extract context dependencies from a JS/TS expression.
 *
 * Examples:
 *
 * user.name + config.version
 * -> ["user", "config"]
 *
 * data.items.map(item => item.name)
 * -> ["data"]
 *
 * user[firstName]
 * -> ["user", "firstName"] (if firstName exists in context)
 */
function collectFromExpression(
  expression: string,
  ctx: Record<string, unknown>,
  dependencies: Set<string>,
): void {
  if (!expression.trim()) {
    return;
  }

  const ast = tryParse(expression);

  if (!ast) {
    return;
  }

  simple(ast, {
    Identifier(node) {
      if (Object.keys(ctx).includes(node.name)) {
        dependencies.add(node.name);
      }
    },
  });
}

export function extractDependencies(
  doc: string,
  ctx: Record<string, unknown>,
  template: boolean,
): string[] {
  if (!doc.trim()) {
    return [];
  }

  const dependencies = new Set<string>();

  if (template) {
    const matches = doc.matchAll(/\{\{(.*?)\}\}/gs);
    for (const match of matches) {
      const inner = match[1];
      if (inner !== undefined) {
        collectFromExpression(inner, ctx, dependencies);
      }
    }
  } else {
    collectFromExpression(doc, ctx, dependencies);
  }

  return [...dependencies];
}
