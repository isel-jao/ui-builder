export type ReactiveKind = "variable" | "function" | "query" | "widget";

export interface BaseReactiveDef {
  id: string;
  name: string;
  kind: ReactiveKind;
}

export interface VariableDef extends BaseReactiveDef {
  kind: "variable";
  doc: string;
}

export interface FunctionDef extends BaseReactiveDef {
  kind: "function";
  params: string[];
  doc: string;
  runOnMount: boolean;
}

export interface QueryDef extends BaseReactiveDef {
  kind: "query";
  config: Record<string, unknown>;
  runOnMount: boolean;
  runOnDepChange: boolean;
}

export type EventDef =
  | {
      action: "mutate-variable";
      target: string;
      doc: string;
    }
  | {
      action: "script";
      doc: string;
    }
  | {
      action: "call-function";
      target: string;
    }
  | {
      action: "call-query";
      target: string;
    };

export interface WidgetDef extends BaseReactiveDef {
  kind: "widget";
  config: Record<string, unknown>;
  actions: EventDef[];
}

export type ReactiveDef = VariableDef | FunctionDef | QueryDef | WidgetDef;

export type VariableState = {
  value: unknown;
};

export type VariableHandler = VariableState & {
  setValue: (value: unknown) => void;
};

export type FunctionState = {
  data: unknown;
  state: "idle" | "running" | "error";
  error: unknown;
};

export type FunctionHandler = FunctionState & {
  run: (args: unknown[]) => Promise<unknown>;
};

export type QueryState = {
  data: unknown;
  state: "idle" | "running" | "error";
  error: unknown;
};

export type QueryHandler = QueryState & {
  run: () => Promise<unknown>;
};

export type WidgetState = {
  config: Record<string, unknown>;
};
export type WidgetHandler = WidgetState & {
  [method: string]: (...args: unknown[]) => unknown;
};

export type ReactiveState =
  | VariableState
  | FunctionState
  | QueryState
  | WidgetState;

export type ReactiveHandler =
  | VariableHandler
  | FunctionHandler
  | QueryHandler
  | WidgetHandler;
