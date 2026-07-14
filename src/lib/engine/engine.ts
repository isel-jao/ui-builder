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

// A snapshot maps every primitive visible from a page (page shadows global)
// to a handle, keyed by name. Handles keep referential identity until their
// primitive's state changes, so useSyncExternalStore consumers and memoized
// widgets bail out cheaply.
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

export type Snapshot = Record<string, PrimitiveHandle>;

export interface Engine {
  // Initial sweep of all global variables, then every global `runOnMount`
  // effect. The initial evaluation is not a "change": `runOnDepChange`
  // effects do not fire from it.
  mount(): void;

  // Unmounts the previously mounted page, then sweeps the new page's
  // variables and runs its `runOnMount` effects. Mounts globals first if
  // `mount` was never called.
  mountPage(pageId: string): void;

  // Resets the page's primitive states and discards its in-flight runs.
  unmountPage(pageId: string): void;

  // Terminal: resets all state and detaches listeners. Create a new engine
  // to restart (defs are immutable for an engine's lifetime).
  unmount(): void;

  // External write to a variable, triggering recomputation of dependent
  // variables and `runOnDepChange` effects. Last write wins: the value
  // sticks until a later dependency change re-evaluates the variable's doc.
  setValue(id: string, value: unknown): void;

  // Manual query/function trigger; resolves with the run's result, rejects
  // on failure. For functions, `args` is visible in the code as `args`.
  run(id: string, args?: unknown): Promise<unknown>;

  // useSyncExternalStore-compatible; listeners fire once per batch of
  // changes. Returns an unsubscribe.
  subscribe(listener: () => void): () => void;

  // Referentially stable until something visible from `pageId` changes.
  getSnapshot(pageId: string): Snapshot;

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
  let mounted = false;
  let mountedPageId: string | undefined;

  // Monotonic token per effect: a run's settlement applies only while its
  // token is still current, so superseded runs cannot clobber newer state.
  const runTokens = new Map<string, number>();

  const listeners = new Set<() => void>();
  const handleCache = new Map<string, PrimitiveHandle>();
  const snapshotCache = new Map<string, Snapshot>();
  const scopeCache = new Map<string, Map<string, PrimitiveDef>>();
  let dirty = false;

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
    if (!dirty) return;
    dirty = false;
    for (const listener of [...listeners]) listener();
  }

  function initialState(def: PrimitiveDef): State {
    const error = graph.configErrors.get(def.id) ?? null;
    if (def.kind === "variable") return { value: undefined, error };
    return { status: "idle", data: undefined, error };
  }

  function pageOf(def: PrimitiveDef): string {
    return def.pageId ?? "global";
  }

  function isActive(def: PrimitiveDef): boolean {
    if (disposed || !mounted) return false;
    const page = pageOf(def);
    return page === "global" || page === mountedPageId;
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
    const page = pageOf(byId.get(id)!);
    if (page === "global") snapshotCache.clear();
    else snapshotCache.delete(page);
    dirty = true;
  }

  // Read-only evaluation context for templates: raw state objects keyed by
  // visible name ({{a.value}}, {{q.data}}). No callables, so a template
  // cannot re-enter the engine.
  function evalCtx(pageId: string): Record<string, unknown> {
    const ctx: Record<string, unknown> = {};
    for (const [name, def] of scopeFor(pageId)) ctx[name] = states.get(def.id);
    return ctx;
  }

  // Rich context/snapshot handle: state plus callables. Callables carry the
  // creating run's `depth` so a dynamic loop (f1's write re-runs f2, whose
  // write re-runs f1) deepens the cascade until MAX_CASCADE_DEPTH instead of
  // looping forever. Snapshot handles are created at depth 0.
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

  function snapshotHandle(id: string): PrimitiveHandle {
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
  // in topological order. Returns every id whose value changed.
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
          isActive(def) &&
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
        if (!isActive(def) || graph.configErrors.has(def.id)) continue;
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
      if (!def || def.kind !== "variable" || !isActive(def)) return;
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
        const configError = graph.configErrors.get(def.id);
        if (configError !== undefined) {
          reject(new Error(configError));
          return;
        }
        if (!isActive(def)) {
          reject(new Error(`"${def.name}" is not mounted`));
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
            schedule(() => settle(def, token, { ok: true, value: result }, depth));
            resolve(result);
          },
          (error: unknown) => {
            schedule(() => settle(def, token, { ok: false, error }, depth));
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
    if (runTokens.get(def.id) !== token) return; // superseded by a newer run
    if (!isActive(def)) return; // unmounted while in flight
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

  function sweepScope(pageId: string): void {
    const ids = new Set<string>();
    for (const def of byId.values()) {
      if (def.kind === "variable" && pageOf(def) === pageId) ids.add(def.id);
    }
    // Initial evaluation is not a "change": effects don't fire from it.
    sweepVariables(ids, EMPTY_SET);
  }

  function runMountEffects(pageId: string): void {
    for (const def of byId.values()) {
      if (def.kind === "variable" || pageOf(def) !== pageId) continue;
      if (!def.runOnMount || graph.configErrors.has(def.id)) continue;
      startRun(def, undefined, 0).catch(() => {});
    }
  }

  function resetScope(pageId: string): void {
    for (const def of byId.values()) {
      if (pageOf(def) !== pageId) continue;
      // Invalidate in-flight runs so they settle as stale.
      runTokens.set(def.id, (runTokens.get(def.id) ?? 0) + 1);
      setState(def.id, initialState(def));
    }
  }

  function mount(): void {
    if (disposed || mounted) return;
    mounted = true;
    schedule(() => {
      sweepScope("global");
      runMountEffects("global");
    });
  }

  function mountPage(pageId: string): void {
    if (disposed || pageId === "global") return;
    if (!mounted) mount();
    if (mountedPageId === pageId) return;
    if (mountedPageId !== undefined) unmountPage(mountedPageId);
    mountedPageId = pageId;
    schedule(() => {
      sweepScope(pageId);
      runMountEffects(pageId);
    });
  }

  function unmountPage(pageId: string): void {
    if (disposed || pageId === "global") return;
    if (mountedPageId === pageId) mountedPageId = undefined;
    schedule(() => resetScope(pageId));
  }

  function unmount(): void {
    if (disposed) return;
    disposed = true;
    mounted = false;
    mountedPageId = undefined;
    for (const def of byId.values()) {
      runTokens.set(def.id, (runTokens.get(def.id) ?? 0) + 1);
      setState(def.id, initialState(def));
    }
    flushNotify();
    listeners.clear();
  }

  function getSnapshot(pageId: string): Snapshot {
    const cached = snapshotCache.get(pageId);
    if (cached) return cached;
    const snapshot: Snapshot = {};
    for (const [name, def] of scopeFor(pageId)) {
      snapshot[name] = snapshotHandle(def.id);
    }
    snapshotCache.set(pageId, snapshot);
    return snapshot;
  }

  return {
    mount,
    mountPage,
    unmountPage,
    unmount,
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
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    getSnapshot,
    configErrors: graph.configErrors,
  };
}
