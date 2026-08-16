import {
  FunctionDef,
  FunctionHandler,
  FunctionState,
  QueryDef,
  QueryState,
  ReactiveDef,
  ReactiveState,
  VariableDef,
  VariableHandler,
  VariableState,
  WidgetDef,
  WidgetHandler,
  WidgetState,
} from "../types";

interface EngineOptions {
  defs: {
    globals: (VariableDef | FunctionDef | QueryDef)[];
    pages: Record<string, ReactiveDef[]>;
  };
  executeQuery: (
    def: QueryDef,
    config: Record<string, unknown>,
  ) => Promise<unknown>;
  evaluateTemplate(data: unknown, ctx: Record<string, unknown>): unknown;
  extractTemplateDependencies(data: unknown): string[];
  extractCodeDependencies(code: string): string[];
}

type Listener = () => void;

interface IEngine {
  subscribeToState(name: string, listener: Listener): void;
  unsubscribeFromState(name: string, listener: Listener): void;

  subscribeToAllStates(listener: Listener): void;
  unsubscribeFromAllStates(listener: Listener): void;

  getState(name: string): unknown;
  getHandler(name: string): unknown;

  getAllStates(): Record<string, unknown>;
  getAllHandlers(): Record<string, unknown>;

  mountPage(name: string): void;
  unmountPage(name: string): void;
}
export class Engine implements IEngine {
  private globalDefs: Record<string, VariableDef | FunctionDef | QueryDef> = {};
  private pageDefs: Record<string, Record<string, ReactiveDef>> = {};
  private globalStates: Record<string, unknown> = {};
  private globalHandlers: Record<string, unknown> = {};
  private pageStates: Record<string, Record<string, unknown>> = {};
  private pageHandlers: Record<string, Record<string, unknown>> = {};
  private nameIdMap: Record<string, string> = {};
  private dirty: Set<string> = new Set();
  private deps: Record<string, Set<string>> = {};
  private reverseDeps: Record<string, Set<string>> = {};
  private names: Set<string> = new Set();
  private mounted: boolean = false;

  private listeners: Record<string, Set<Listener>> = {};
  private allStateListeners: Set<Listener> = new Set();

  private mountedPage: string | null = null;

  constructor(private options: EngineOptions) {
    const defs = options.defs;
    for (const def of defs.globals) {
      this.names.add(def.name);
      this.globalDefs[def.name] = def;
      const { state, handler } = buildStateAndHandler(def);
      this.globalStates[def.name] = state;
      this.globalHandlers[def.name] = handler;
    }

    for (const page in defs.pages) {
      this.pageDefs[page] = {};
      this.pageStates[page] = {};
      this.pageHandlers[page] = {};
      for (const def of defs.pages[page]) {
        this.names.add(def.name);
        this.pageDefs[page][def.name] = def;
        const { state, handler } = buildStateAndHandler(def);
        this.pageStates[page][def.name] = state;
        this.pageHandlers[page][def.name] = handler;
      }
    }
  }

  subscribeToState(name: string, listener: Listener): void {
    if (!this.listeners[name]) {
      this.listeners[name] = new Set();
    }
    this.listeners[name].add(listener);
  }

  unsubscribeFromState(name: string, listener: Listener): void {
    if (this.listeners[name]) {
      this.listeners[name].delete(listener);
    }
  }

  subscribeToAllStates(listener: Listener): void {
    this.allStateListeners.add(listener);
  }

  unsubscribeFromAllStates(listener: Listener): void {
    this.allStateListeners.delete(listener);
  }

  getState(name: string): unknown {
    if (this.mountedPage && this.pageStates[this.mountedPage]?.[name]) {
      return this.pageStates[this.mountedPage][name];
    }
    return this.globalStates[name];
  }

  getHandler(name: string): unknown {
    if (this.mountedPage && this.pageHandlers[this.mountedPage]?.[name]) {
      return this.pageHandlers[this.mountedPage][name];
    }
    return this.globalHandlers[name];
  }

  getAllStates(): Record<string, unknown> {
    return {
      ...this.globalStates,
      ...(this.mountedPage ? this.pageStates[this.mountedPage] : {}),
    };
  }

  getAllHandlers(): Record<string, unknown> {
    return {
      ...this.globalHandlers,
      ...(this.mountedPage ? this.pageHandlers[this.mountedPage] : {}),
    };
  }

  mountPage(name: string): void {
    this.mountedPage = name;
  }

  unmountPage(name: string): void {
    if (this.mountedPage === name) {
      this.mountedPage = null;
    }
  }

  // private methods for internal state management and event handling can be added here
  notifyListeners(name: string, global = false): void {
    if (!this.mounted) return;

    if (
      global &&
      this.mountedPage &&
      this.pageStates[this.mountedPage]?.[name]
    ) {
      // page reactive shadows global reactive, so we don't notify global listeners if page reactive exists
      return;
    }
    if (this.listeners[name]) {
      for (const listener of this.listeners[name]) {
        listener();
      }
    }
    for (const listener of this.allStateListeners) {
      listener();
    }
    this.propagateStateChange(name, global);
  }

  private setVariableValue(name: string, value: unknown): void {
    if (this.mountedPage && this.pageStates[this.mountedPage]?.[name]) {
      const state = this.pageStates[this.mountedPage][name] as VariableState;
      state.value = value;
      this.notifyListeners(name);
    }
    if (this.globalStates[name]) {
      const state = this.globalStates[name] as VariableState;
      state.value = value;
      this.notifyListeners(name, true);
    }
  }

  private propagateStateChange(name: string, global = false): void {
    // every state change, trigger recompute for its variable and widgets config dependents, and re-run it dependents queries if runOnDepChange flag is set
  }

  private compute(def: ReactiveDef, global = false): unknown {
    if (def.kind === "variable") {
      return this.options.evaluateTemplate(
        def.doc,
        global ? this.globalStates : this.getAllStates(),
      );
    }
    if (def.kind === "widget") {
      return this.options.evaluateTemplate(
        def.config,
        global ? this.globalStates : this.getAllStates(),
      );
    }
    return undefined;
  }
}

function buildVariableStateAndHandler(def: VariableDef): {
  state: VariableState;
  handler: VariableHandler;
} {
  const state: VariableState = {
    value: undefined,
  };
  const handler: VariableHandler = {
    value: state.value,
    setValue: (value: unknown) => {
      state.value = value;
    },
  };
  return { state, handler };
}

function buildFunctionStateAndHandler(def: FunctionDef): {
  state: FunctionState;
  handler: FunctionHandler;
} {
  const state: FunctionState = {
    data: undefined,
    state: "idle",
    error: undefined,
  };
  const handler: FunctionHandler = {
    data: state.data,
    state: state.state,
    error: state.error,
    run: async (...args: unknown[]) => {},
  };
  return { state, handler };
}

function buildQueryStateAndHandler(def: QueryDef): {
  state: QueryState;
  handler: unknown;
} {
  const state: QueryState = {
    data: undefined,
    state: "idle",
    error: undefined,
  };
  const handler = {
    data: state.data,
    state: state.state,
    error: state.error,
    run: async () => {},
  };
  return { state, handler };
}

function buildWidgetStateAndHandler(def: WidgetDef): {
  state: WidgetState;
  handler: WidgetHandler;
} {
  const state: WidgetState = {
    config: def.config,
  };
  const handler = {
    config: state.config,
  } as WidgetHandler;
  return { state, handler };
}

function buildStateAndHandler(def: ReactiveDef): {
  state: ReactiveState;
  handler: unknown;
} {
  if (def.kind === "variable") {
    return buildVariableStateAndHandler(def);
  }
  if (def.kind === "function") {
    return buildFunctionStateAndHandler(def);
  }
  if (def.kind === "query") {
    return buildQueryStateAndHandler(def);
  }
  if (def.kind === "widget") {
    return buildWidgetStateAndHandler(def);
  }
  throw new Error(
    `Unknown reactive definition kind: ${(def as ReactiveDef).kind}`,
  );
}
