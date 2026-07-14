import { RESERVED_NAMES } from "./constants";
import type { PrimitiveDef, PrimitiveKind, Scope } from "./types";

const IDENTIFIER_RE = /^[A-Za-z_$][A-Za-z0-9_$]*$/;

export function isValidIdentifier(name: string): boolean {
  return IDENTIFIER_RE.test(name) && !RESERVED_NAMES.has(name);
}

/** Whether `name` is free within a scope: globals share one namespace; page primitives are namespaced per page. */
export function isNameAvailable(
  definitions: Record<string, PrimitiveDef>,
  name: string,
  scope: Scope,
  pageId: string | undefined,
  excludeId?: string,
): boolean {
  return !Object.values(definitions).some(
    (d) =>
      d.id !== excludeId &&
      d.scope === scope &&
      (scope === "global" || d.pageId === pageId) &&
      d.name === name,
  );
}

/** First `${kind}1`, `${kind}2`, … that's free in the given scope. */
export function generateUniqueName(
  definitions: Record<string, PrimitiveDef>,
  kind: PrimitiveKind,
  scope: Scope,
  pageId: string | undefined,
): string {
  let i = 1;
  let candidate = `${kind}${i}`;
  while (!isNameAvailable(definitions, candidate, scope, pageId)) {
    i += 1;
    candidate = `${kind}${i}`;
  }
  return candidate;
}
