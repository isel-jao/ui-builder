import { evaluateTemplate } from "../evaluate-template";
import { MAX_CASCADE_DEPTH } from "./constants";
import { buildGraph } from "./graph";
import type {
  ExecutionStatus,
  FunctionDef,
  FunctionState,
  PrimitiveDef,
  QueryDef,
  QueryState,
  VariableDef,
  VariableState,
} from "./types";

// Primitives activate lazily: subscribing to (or retaining) one retains it
// and, recursively, its static dependencies — deps first, so a variable
// always evaluates after everything it reads. Each retained edge counts,
// so a dep shared by two subscribers activates once and deactivates only
// after the last release. A primitive with no retainers left deactivates
// (state reset, in-flight runs invalidated) after a microtask; globals are
// the exception and stay active once touched, so state written on one page
// survives navigation to another. Handles keep referential identity until
// their primitive's state changes, so useSyncExternalStore consumers and
// memoized widgets bail out cheaply.
export interface VariableHandle {
  readonly value: unknown;
  readonly error: string | null;
  setValue(value: unknown): void;
}

export interface EffectHandle {
  readonly status: ExecutionStatus;
  readonly data: unknown;
  readonly error: string | null;
  run(args?: unknown): Promise<unknown>;
}

export type PrimitiveHandle = VariableHandle | EffectHandle;

export interface Engine {
  // Subscribes to one primitive, activating it and its transitive deps.
  // First activation evaluates variables (not a "change": `runOnDepChange`
  // effects don't fire from it) and starts `runOnMount` effects. The
  // listener fires once per batch in which this primitive's state changed.
  // The returned unsubscribe releases the retain; a primitive with no
  // retainers left deactivates a microtask later, so quick unsubscribe/
  // resubscribe churn (React StrictMode remounts) doesn't tear down and
  // refetch. Throws on unknown ids — `resolve` is the checked lookup.
  subscribe(id: string, listener: () => void): () => void;

  // Referentially stable until the primitive's state changes. Reading
  // never activates: an inactive primitive shows its initial state.
  getHandle(id: string): PrimitiveHandle;

  // Name → id within a page's scope (page shadows global).
  resolve(pageId: string, name: string): string | undefined;

  // External write to a variable, triggering recomputation of dependent
  // variables and `runOnDepChange` effects. Last write wins: the value
  // sticks until a later dependency change re-evaluates the variable's
  // doc. Writes to inactive variables are dropped — nothing active can
  // observe them, and activation re-evaluates the doc anyway.
  setValue(id: string, value: unknown): void;

  // Manual query/function trigger; resolves with the run's result, rejects
  // on failure. Works on inactive effects: their deps are retained for the
  // run's duration so the evaluation context is fresh. For functions,
  // `args` is visible in the code as `args`.
  run(id: string, args?: unknown): Promise<unknown>;

  // Terminal: resets all state and detaches listeners. Create a new engine
  // to restart (defs are immutable for an engine's lifetime).
  dispose(): void;

  // Static errors from graph building (bad names, bad deps, cycles), by id.
  readonly configErrors: ReadonlyMap<string, string>;
}

export interface EngineOptions {
  executeQuery: (
    def: QueryDef,
    config: Record<string, unknown>,
  ) => Promise<unknown>;
}

type EffectDef = FunctionDef | QueryDef;
type EffectState = FunctionState | QueryState;
type State = VariableState | EffectState;
type RunOutcome = { ok: true; value: unknown } | { ok: false; error: unknown };

const EMPTY_SET: ReadonlySet<string> = new Set();

const AsyncFunction = Object.getPrototypeOf(async function () {})
  .constructor as new (
  ...params: string[]
) => (...args: unknown[]) => Promise<unknown>;

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function createEngine(
  defs: PrimitiveDef[],
  options: EngineOptions,
): Engine {
  const graph = buildGraph({ defs });

  // Registered defs by id; defs that failed registration (bad or duplicate
  // name) exist only in `configErrors` and have no runtime state.
  const byId = new Map<string, PrimitiveDef>();
  for (const pageDefs of graph.defs.values()) {
    for (const def of pageDefs.values()) byId.set(def.id, def);
  }

  // Topological position of every acyclic def; cyclic defs carry a config
  // error and are never evaluated.
  const orderIndex = new Map<string, number>();
  graph.order.forEach((id, index) => orderIndex.set(id, index));

  const states = new Map<string, State>();
  for (const def of byId.values()) states.set(def.id, initialState(def));

  let disposed = false;

  // Retain counts: direct subscribers/retains plus one per retained
  // dependent edge (plus the permanent self-retain of a touched global).
  // `active` tracks whether activation ran; it lags refs on the way down
  // because deactivation is deferred, so a resubscribe arriving before the
  // deferred teardown finds the primitive still active and skips
  // re-activation (no refetch).
  const refs = new Map<string, number>();
  const active = new Set<string>();

  // Monotonic token per effect: a run's settlement applies only while its
  // token is still current, so superseded runs and runs of a since-
  // deactivated effect cannot clobber newer state.
  const runTokens = new Map<string, number>();

  const idListeners = new Map<string, Set<() => void>>();
  const handleCache = new Map<string, PrimitiveHandle>();
  const scopeCache = new Map<string, Map<string, PrimitiveDef>>();
  let dirtyIds = new Set<string>();

  // All engine work runs through one queue: a write arriving mid-sweep (a
  // function body calling setValue) is appended instead of re-entering, and
  // listeners are notified once per drain, not once per state change.
  const jobs: Array<() => void> = [];
  let draining = false;

  function schedule(job: () => void): void {
    jobs.push(job);
    if (draining) return;
    draining = true;
    try {
      while (jobs.length > 0) jobs.shift()!();
    } finally {
      draining = false;
      flushNotify();
    }
  }

  function flushNotify(): void {
    if (dirtyIds.size === 0) return;
    const ids = dirtyIds;
    dirtyIds = new Set();
    const toNotify = new Set<() => void>();
    for (const id of ids) {
      const set = idListeners.get(id);
      if (!set) continue;
      for (const listener of set) toNotify.add(listener);
    }
    for (const listener of toNotify) listener();
  }

  function initialState(def: PrimitiveDef): State {
    const error = graph.configErrors.get(def.id) ?? null;
    if (def.kind === "variable") return { value: undefined, error };
    return { status: "idle", data: undefined, error };
  }

  function pageOf(def: PrimitiveDef): string {
    return def.pageId ?? "global";
  }

  // Names visible from a page: globals overlaid by the page's own defs.
  function scopeFor(pageId: string): Map<string, PrimitiveDef> {
    const cached = scopeCache.get(pageId);
    if (cached) return cached;
    const merged = new Map(graph.defs.get("global") ?? []);
    if (pageId !== "global") {
      for (const [name, def] of graph.defs.get(pageId) ?? []) {
        merged.set(name, def);
      }
    }
    scopeCache.set(pageId, merged);
    return merged;
  }

  function setState(id: string, next: State): void {
    states.set(id, next);
    handleCache.delete(id);
    dirtyIds.add(id);
  }

  function retain(id: string): void {
    if (disposed) return;
    refs.set(id, (refs.get(id) ?? 0) + 1);
    if (!active.has(id)) activate(id);
  }

  function activate(id: string): void {
    active.add(id);
    const def = byId.get(id)!;
    // Config-errored defs never evaluate or run, so their deps are never
    // retained — this also keeps a dependency cycle from sustaining its
    // own refcounts forever.
    if (graph.configErrors.has(id)) return;
    // Globals never deactivate once activated (permanent self-retain), so
    // state written by one page's widgets survives navigation to another.
    if (pageOf(def) === "global") refs.set(id, (refs.get(id) ?? 0) + 1);
    for (const dep of graph.deps.get(id) ?? EMPTY_SET) retain(dep);
    if (def.kind === "variable") {
      // Initial evaluation is not a "change": effects don't fire from it.
      evaluateVariable(def);
    } else if (def.runOnMount) {
      startRun(def, undefined, 0).catch(() => {
        // Auto-triggered runs report failures through state, not rejection.
      });
    }
  }

  function release(id: string): void {
    const count = refs.get(id) ?? 0;
    if (count <= 0) return;
    refs.set(id, count - 1);
    if (count === 1) {
      // Deferred so quick unsubscribe/resubscribe churn (React StrictMode
      // remounts, list virtualization) doesn't tear down and refetch.
      queueMicrotask(() => schedule(() => deactivate(id)));
    }
  }

  function deactivate(id: string): void {
    if (disposed || (refs.get(id) ?? 0) > 0 || !active.has(id)) return;
    active.delete(id);
    // Invalidate in-flight runs so they settle as stale.
    runTokens.set(id, (runTokens.get(id) ?? 0) + 1);
    setState(id, initialState(byId.get(id)!));
    if (!graph.configErrors.has(id)) {
      for (const dep of graph.deps.get(id) ?? EMPTY_SET) release(dep);
    }
  }

  function subscribe(id: string, listener: () => void): () => void {
    if (!byId.has(id)) {
      throw new Error(
        graph.configErrors.get(id) ?? `Unknown primitive "${id}"`,
      );
    }
    if (disposed) return () => {};
    let set = idListeners.get(id);
    if (!set) idListeners.set(id, (set = new Set()));
    set.add(listener);
    schedule(() => retain(id));
    let released = false;
    return () => {
      if (released) return;
      released = true;
      idListeners.get(id)?.delete(listener);
      schedule(() => release(id));
    };
  }

  // Read-only evaluation context for templates: raw state objects keyed by
  // visible name ({{a.value}}, {{q.data}}). No callables, so a template
  // cannot re-enter the engine.
  function evalCtx(pageId: string): Record<string, unknown> {
    const ctx: Record<string, unknown> = {};
    for (const [name, def] of scopeFor(pageId)) ctx[name] = states.get(def.id);
    return ctx;
  }

  // Rich handle: state plus callables. Callables carry the creating run's
  // `depth` so a dynamic loop (f1's write re-runs f2, whose write re-runs
  // f1) deepens the cascade until MAX_CASCADE_DEPTH instead of looping
  // forever. Handles handed out through the public API are at depth 0.
  function makeHandle(def: PrimitiveDef, depth: number): PrimitiveHandle {
    if (def.kind === "variable") {
      const state = states.get(def.id) as VariableState;
      return {
        value: state.value,
        error: state.error,
        setValue: (value: unknown) => writeValue(def.id, value, depth),
      };
    }
    const state = states.get(def.id) as EffectState;
    const effect = def;
    return {
      status: state.status,
      data: state.data,
      error: state.error,
      run: (args?: unknown) => startRun(effect, args, depth + 1),
    };
  }

  function cachedHandle(id: string): PrimitiveHandle {
    const cached = handleCache.get(id);
    if (cached) return cached;
    const handle = makeHandle(byId.get(id)!, 0);
    handleCache.set(id, handle);
    return handle;
  }

  // Re-evaluates a variable's doc; returns whether the value changed
  // (an error-only change notifies but does not trigger dependents).
  function evaluateVariable(def: VariableDef): boolean {
    const errors: string[] = [];
    const value = evaluateTemplate(def.doc, evalCtx(pageOf(def)), (error) => {
      errors.push(errorMessage(error));
    });
    const error = errors[0] ?? null;
    const prev = states.get(def.id) as VariableState;
    if (Object.is(prev.value, value) && prev.error === error) return false;
    setState(def.id, { value, error });
    return !Object.is(prev.value, value);
  }

  function downstream(seeds: ReadonlySet<string>): Set<string> {
    const out = new Set<string>();
    const stack = [...seeds];
    while (stack.length > 0) {
      const id = stack.pop()!;
      for (const dependent of graph.revDeps.get(id) ?? []) {
        if (!out.has(dependent)) {
          out.add(dependent);
          stack.push(dependent);
        }
      }
    }
    return out;
  }

  // Recomputes the `recompute` variables plus everything downstream of them
  // or of `written` — ids whose values were already updated in place and
  // must NOT be re-evaluated (last write wins until a later dep change) —
  // in topological order. Returns every id whose value changed. Inactive
  // variables are skipped: they re-evaluate fresh on activation, and the
  // retain invariant guarantees no active primitive reads them meanwhile.
  function sweepVariables(
    recompute: ReadonlySet<string>,
    written: ReadonlySet<string>,
  ): Set<string> {
    const affected = downstream(new Set([...recompute, ...written]));
    for (const id of recompute) affected.add(id);

    const ordered = [...affected]
      .filter((id) => {
        if (written.has(id)) return false;
        const def = byId.get(id);
        return (
          def !== undefined &&
          def.kind === "variable" &&
          active.has(id) &&
          !graph.configErrors.has(id) &&
          orderIndex.has(id)
        );
      })
      .sort((a, b) => orderIndex.get(a)! - orderIndex.get(b)!);

    const changed = new Set(written);
    for (const id of ordered) {
      if (evaluateVariable(byId.get(id) as VariableDef)) changed.add(id);
    }
    return changed;
  }

  // Schedules every active `runOnDepChange` effect that depends on a changed
  // id; the runs execute at cascade depth `depth`.
  function triggerEffects(changed: ReadonlySet<string>, depth: number): void {
    const scheduled = new Set<string>();
    for (const id of changed) {
      for (const dependentId of graph.revDeps.get(id) ?? []) {
        if (scheduled.has(dependentId)) continue;
        const def = byId.get(dependentId);
        if (!def || def.kind === "variable") continue;
        if (!def.runOnDepChange) continue;
        if (!active.has(def.id) || graph.configErrors.has(def.id)) continue;
        scheduled.add(dependentId);
        startRun(def, undefined, depth).catch(() => {
          // Auto-triggered runs report failures through state, not rejection.
        });
      }
    }
  }

  // `depth` is the cascade depth of the write itself; effects it triggers
  // run one level deeper. Writes to unknown, non-variable, or inactive
  // targets are dropped (validation happens in the public API).
  function writeValue(id: string, value: unknown, depth: number): void {
    schedule(() => {
      const def = byId.get(id);
      if (!def || def.kind !== "variable" || !active.has(id)) return;
      const prev = states.get(id) as VariableState;
      if (Object.is(prev.value, value)) return;
      setState(id, { value, error: graph.configErrors.get(id) ?? null });
      triggerEffects(sweepVariables(EMPTY_SET, new Set([id])), depth + 1);
    });
  }

  function startRun(
    def: EffectDef,
    args: unknown,
    depth: number,
  ): Promise<unknown> {
    return new Promise((resolve, reject) => {
      schedule(() => {
        if (disposed) {
          reject(new Error("Engine is disposed"));
          return;
        }
        const configError = graph.configErrors.get(def.id);
        if (configError !== undefined) {
          reject(new Error(configError));
          return;
        }
        if (depth > MAX_CASCADE_DEPTH) {
          // Bump the token so in-flight settlements can't clobber the error.
          runTokens.set(def.id, (runTokens.get(def.id) ?? 0) + 1);
          const prev = states.get(def.id) as EffectState;
          const message = `Cascade depth exceeded (${MAX_CASCADE_DEPTH}); possible dynamic dependency loop`;
          setState(def.id, { status: "error", data: prev.data, error: message });
          reject(new Error(message));
          return;
        }

        // An inactive effect can still run: its deps are retained for the
        // run's duration so the evaluation context is fresh.
        const tempDeps: string[] = [];
        if (!active.has(def.id)) {
          for (const dep of graph.deps.get(def.id) ?? EMPTY_SET) {
            retain(dep);
            tempDeps.push(dep);
          }
        }
        const releaseTempDeps = () => {
          for (const dep of tempDeps) release(dep);
        };

        const token = (runTokens.get(def.id) ?? 0) + 1;
        runTokens.set(def.id, token);
        const prev = states.get(def.id) as EffectState;
        setState(def.id, {
          // In flight with nothing to show = loading; over stale data = reloading.
          status: prev.data === undefined ? "loading" : "reloading",
          data: prev.data,
          error: null,
        });

        execute(def, args, depth).then(
          (result) => {
            schedule(() => {
              settle(def, token, { ok: true, value: result }, depth);
              releaseTempDeps();
            });
            resolve(result);
          },
          (error: unknown) => {
            schedule(() => {
              settle(def, token, { ok: false, error }, depth);
              releaseTempDeps();
            });
            reject(error instanceof Error ? error : new Error(String(error)));
          },
        );
      });
    });
  }

  function settle(
    def: EffectDef,
    token: number,
    outcome: RunOutcome,
    depth: number,
  ): void {
    // Deactivation and disposal bump the token, so a run that outlived its
    // effect's retention settles as stale here.
    if (runTokens.get(def.id) !== token) return;
    const prev = states.get(def.id) as EffectState;
    if (!outcome.ok) {
      // Keep stale data on error so widgets don't blank out.
      setState(def.id, {
        status: "error",
        data: prev.data,
        error: errorMessage(outcome.error),
      });
      return;
    }
    setState(def.id, { status: "success", data: outcome.value, error: null });
    if (!Object.is(prev.data, outcome.value)) {
      triggerEffects(sweepVariables(EMPTY_SET, new Set([def.id])), depth + 1);
    }
  }

  async function execute(
    def: EffectDef,
    args: unknown,
    depth: number,
  ): Promise<unknown> {
    if (def.kind === "query") {
      const config = evaluateConfig(def.config, evalCtx(pageOf(def)));
      return options.executeQuery(def, config as Record<string, unknown>);
    }
    // Handles are bound at run start: reads after an await see the values
    // from when the run began, not live state.
    const names: string[] = [];
    const values: unknown[] = [];
    for (const [name, scoped] of scopeFor(pageOf(def))) {
      names.push(name);
      values.push(makeHandle(scoped, depth));
    }
    const fn = new AsyncFunction(...names, "args", `"use strict";\n${def.doc}`);
    return fn(...values, args);
  }

  // Deep-evaluates a query config: string leaves run through the template
  // evaluator (a failing leaf degrades to undefined), structure is copied.
  function evaluateConfig(
    value: unknown,
    ctx: Record<string, unknown>,
  ): unknown {
    if (typeof value === "string") return evaluateTemplate(value, ctx);
    if (Array.isArray(value)) {
      return value.map((item) => evaluateConfig(item, ctx));
    }
    if (value !== null && typeof value === "object") {
      const out: Record<string, unknown> = {};
      for (const [key, item] of Object.entries(value)) {
        out[key] = evaluateConfig(item, ctx);
      }
      return out;
    }
    return value;
  }

  function dispose(): void {
    if (disposed) return;
    disposed = true;
    refs.clear();
    active.clear();
    for (const def of byId.values()) {
      runTokens.set(def.id, (runTokens.get(def.id) ?? 0) + 1);
      setState(def.id, initialState(def));
    }
    flushNotify();
    idListeners.clear();
  }

  return {
    subscribe,
    getHandle(id) {
      if (!byId.has(id)) {
        throw new Error(
          graph.configErrors.get(id) ?? `Unknown primitive "${id}"`,
        );
      }
      return cachedHandle(id);
    },
    resolve(pageId, name) {
      return scopeFor(pageId).get(name)?.id;
    },
    setValue(id, value) {
      const def = byId.get(id);
      if (!def) {
        throw new Error(
          graph.configErrors.get(id) ?? `Unknown primitive "${id}"`,
        );
      }
      if (def.kind !== "variable") {
        throw new Error(`"${def.name}" is not a variable`);
      }
      writeValue(id, value, 0);
    },
    run(id, args) {
      const def = byId.get(id);
      if (!def) {
        return Promise.reject(
          new Error(graph.configErrors.get(id) ?? `Unknown primitive "${id}"`),
        );
      }
      if (def.kind === "variable") {
        return Promise.reject(
          new Error(`"${def.name}" is a variable; use setValue`),
        );
      }
      return startRun(def, args, 0);
    },
    dispose,
    configErrors: graph.configErrors,
  };
}
