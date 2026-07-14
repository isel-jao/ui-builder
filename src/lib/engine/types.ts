export type PrimitiveKind = "variable" | "function" | "query";
// "loading" = in flight with no data to show yet; "reloading" = in flight
// over kept stale data. Keyed on data presence, not run count.

export type Scope = "global" | "page";

export type ExecutionStatus =
  | "idle"
  | "loading"
  | "reloading"
  | "success"
  | "error";

interface PrimitiveDefBase {
  id: string;
  name: string;
  kind: PrimitiveKind;
  scope: Scope;
  pageId?: string;
}

// example: { kind: "variable", id: "v1", name: "var1", doc: "{num: {{num.value}}, str: {{str.value}}}" }
export interface VariableDef extends PrimitiveDefBase {
  kind: "variable";
  doc: string;
}

// example: { kind: "function", id: "f1", name: "greet", doc: "var2.setValue(10); return var1.value.str +  'hello'", runOnMount: false, runOnDepChange: true }
export interface FunctionDef extends PrimitiveDefBase {
  kind: "function";
  doc: string;
  runOnMount: boolean;
  runOnDepChange: boolean;
}

// example: { kind: "query", id: "q1", name: "fetchData", config: { url: "https://api.example.com/data", page: "{{page.value}}", limit: "{{limit.value}}" }, runOnMount: true, runOnDepChange: false }
export interface QueryDef extends PrimitiveDefBase {
  kind: "query";
  config: Record<string, unknown>;
  runOnMount: boolean;
  runOnDepChange: boolean;
}

export type PrimitiveDef = VariableDef | FunctionDef | QueryDef;

// Variables are pure and recomputed synchronously, so there is no execution
// status; `error` holds config/evaluation failures (e.g. cyclic dependency).
export interface VariableState {
  readonly value: unknown;
  readonly error: string | null;
}

export interface FunctionState {
  readonly status: ExecutionStatus;
  readonly data: unknown;
  readonly error: string | null;
}

export interface QueryState {
  readonly status: ExecutionStatus;
  readonly data: unknown;
  readonly error: string | null;
}

export type PrimitiveState = VariableState | FunctionState | QueryState;

// A widget-config binding: id-keyed, never in scope, evaluated like a
// variable but allowed to read anything. A failing leaf degrades to
// undefined and is recorded in `error`; sibling leaves still produce.
export interface BindingState {
  readonly value: unknown;
  readonly error: string | null;
}
