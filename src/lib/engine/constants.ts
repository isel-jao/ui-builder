import type { PrimitiveKind } from "./types";

/** Default run-flags for newly created queries. Named so they're easy to retune independently of functions. */
export const QUERY_RUN_DEFAULTS = {
  runOnMount: true,
  runOnDepChange: false,
} as const;

/** Default run-flags for newly created functions. */
export const FUNCTION_RUN_DEFAULTS = {
  runOnMount: false,
  runOnDepChange: true,
} as const;

/** Artificial delay for the mock query executor. */
export const MOCK_QUERY_DELAY_MS = 400;

/** Caps `runOnDepChange` cascades so a dynamic (runtime-only) dependency loop can't hang the app. */
export const MAX_CASCADE_DEPTH = 16;

/**
 * Names a primitive can't take. JS reserved words are excluded because
 * primitive names become parameter names of a `new Function(...)` /
 * `AsyncFunction(...)` call when building evaluation contexts; `args` is
 * excluded because the engine injects call arguments under that name.
 */
export const RESERVED_NAMES: ReadonlySet<string> = new Set([
  "break",
  "case",
  "catch",
  "class",
  "const",
  "continue",
  "debugger",
  "default",
  "delete",
  "do",
  "else",
  "enum",
  "export",
  "extends",
  "false",
  "finally",
  "for",
  "function",
  "if",
  "import",
  "in",
  "instanceof",
  "new",
  "null",
  "return",
  "super",
  "switch",
  "this",
  "throw",
  "true",
  "try",
  "typeof",
  "var",
  "void",
  "while",
  "with",
  "yield",
  "let",
  "static",
  "await",
  "implements",
  "interface",
  "package",
  "private",
  "protected",
  "public",
  "arguments",
  "eval",
  "args",
]);

export const ALLOWED_DEP_KINDS: Record<
  PrimitiveKind,
  readonly PrimitiveKind[]
> = {
  variable: ["variable"],
  query: ["variable"],
  function: ["variable", "query", "function"],
};

export const IDENTIFIER_RE = /^[A-Za-z_$][A-Za-z0-9_$]*$/;
