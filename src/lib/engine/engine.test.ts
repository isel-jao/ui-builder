import { describe, expect, it, vi } from "vitest";

import {
  createEngine,
  type EffectHandle,
  type Engine,
  type EngineOptions,
  type VariableHandle,
} from "./engine";
import type { FunctionDef, QueryDef, VariableDef } from "./types";

function variable(
  id: string,
  name: string,
  doc: string,
  pageId?: string,
): VariableDef {
  return {
    id,
    name,
    kind: "variable",
    scope: pageId ? "page" : "global",
    pageId,
    doc,
  };
}

function fn(
  id: string,
  name: string,
  doc: string,
  flags?: Partial<Pick<FunctionDef, "runOnMount" | "runOnDepChange">>,
  pageId?: string,
): FunctionDef {
  return {
    id,
    name,
    kind: "function",
    scope: pageId ? "page" : "global",
    pageId,
    doc,
    runOnMount: flags?.runOnMount ?? false,
    runOnDepChange: flags?.runOnDepChange ?? true,
  };
}

function query(
  id: string,
  name: string,
  config: Record<string, unknown>,
  flags?: Partial<Pick<QueryDef, "runOnMount" | "runOnDepChange">>,
  pageId?: string,
): QueryDef {
  return {
    id,
    name,
    kind: "query",
    scope: pageId ? "page" : "global",
    pageId,
    config,
    runOnMount: flags?.runOnMount ?? true,
    runOnDepChange: flags?.runOnDepChange ?? false,
  };
}

const echoQuery: EngineOptions = {
  executeQuery: async (_def, config) => config,
};

function varHandle(engine: Engine, id: string): VariableHandle {
  return engine.getHandle(id) as VariableHandle;
}

function effectHandle(engine: Engine, id: string): EffectHandle {
  return engine.getHandle(id) as EffectHandle;
}

const noop = () => {};

const tick = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe("createEngine", () => {
  it("activates a subscribed variable and its transitive deps, leaving the rest inactive", () => {
    const engine = createEngine(
      [
        variable("v3", "c", "{{b.value * 2}}"),
        variable("v1", "a", "1"),
        variable("v2", "b", "{{a.value + 1}}"),
        variable("v4", "d", "5"),
      ],
      echoQuery,
    );
    engine.subscribe("v3", noop);
    expect(varHandle(engine, "v1").value).toBe(1);
    expect(varHandle(engine, "v2").value).toBe(2);
    expect(varHandle(engine, "v3").value).toBe(4);
    // Nothing subscribed to d or its downstream: never evaluated.
    expect(varHandle(engine, "v4").value).toBeUndefined();
  });

  it("notifies only the changed ids' listeners, once per batch", () => {
    const engine = createEngine(
      [
        variable("v1", "a", "1"),
        variable("v2", "b", "{{a.value + 1}}"),
        variable("v4", "d", "5"),
      ],
      echoQuery,
    );
    const bListener = vi.fn();
    const dListener = vi.fn();
    const unsubscribeB = engine.subscribe("v2", bListener);
    engine.subscribe("v4", dListener);
    bListener.mockClear();
    dListener.mockClear();

    engine.setValue("v1", 10);
    expect(bListener).toHaveBeenCalledTimes(1);
    expect(dListener).not.toHaveBeenCalled();
    expect(varHandle(engine, "v2").value).toBe(11);

    // Globals stay active after unsubscribe (sticky), so the write still
    // recomputes b — but the removed listener no longer hears about it.
    unsubscribeB();
    engine.setValue("v1", 20);
    expect(bListener).toHaveBeenCalledTimes(1);
    expect(varHandle(engine, "v2").value).toBe(21);
  });

  it("keeps untouched handles referentially stable", () => {
    const engine = createEngine(
      [
        variable("v1", "a", "1"),
        variable("v2", "b", "{{a.value + 1}}"),
        variable("v4", "d", "5"),
      ],
      echoQuery,
    );
    engine.subscribe("v2", noop);
    engine.subscribe("v4", noop);
    const b = engine.getHandle("v2");
    const d = engine.getHandle("v4");
    expect(engine.getHandle("v2")).toBe(b);

    engine.setValue("v1", 2);
    expect(engine.getHandle("v2")).not.toBe(b);
    expect(engine.getHandle("v4")).toBe(d);
  });

  it("lets handles write variables", () => {
    const engine = createEngine(
      [variable("v1", "a", "1"), variable("v2", "b", "{{a.value + 1}}")],
      echoQuery,
    );
    engine.subscribe("v2", noop);
    varHandle(engine, "v1").setValue(7);
    expect(varHandle(engine, "v2").value).toBe(8);
  });

  it("last write wins between setValue and dependency-driven recomputes", () => {
    const engine = createEngine(
      [variable("v1", "a", "1"), variable("v2", "b", "{{a.value + 1}}")],
      echoQuery,
    );
    engine.subscribe("v2", noop);

    engine.setValue("v2", 99);
    expect(varHandle(engine, "v2").value).toBe(99);

    engine.setValue("v1", 5);
    expect(varHandle(engine, "v2").value).toBe(6);
  });

  it("drops writes to inactive variables; activation evaluates the doc fresh", () => {
    const engine = createEngine([variable("v1", "a", "1")], echoQuery);
    engine.setValue("v1", 7);
    expect(varHandle(engine, "v1").value).toBeUndefined();

    engine.subscribe("v1", noop);
    expect(varHandle(engine, "v1").value).toBe(1);
  });

  it("records an evaluation error and degrades the value to undefined", () => {
    const engine = createEngine(
      [variable("v1", "a", "{{missing.value.deep}}")],
      echoQuery,
    );
    engine.subscribe("v1", noop);
    const handle = varHandle(engine, "v1");
    expect(handle.value).toBeUndefined();
    expect(handle.error).toBeTruthy();
  });

  it("runs a runOnMount query on first subscription, activating its config deps first", async () => {
    const executeQuery = vi.fn(
      async (_def: QueryDef, config: Record<string, unknown>) => config,
    );
    const engine = createEngine(
      [
        variable("v1", "limit", "10"),
        query("q1", "fetchData", {
          url: "https://api.example.com",
          limit: "{{limit.value}}",
        }),
      ],
      { executeQuery },
    );
    engine.subscribe("q1", noop);
    expect(effectHandle(engine, "q1").status).toBe("loading");
    // The config dep was retained and evaluated before the run started.
    expect(varHandle(engine, "v1").value).toBe(10);

    await tick();
    expect(executeQuery).toHaveBeenCalledWith(
      expect.objectContaining({ id: "q1" }),
      { url: "https://api.example.com", limit: 10 },
    );
    const handle = effectHandle(engine, "q1");
    expect(handle.status).toBe("success");
    expect(handle.data).toEqual({ url: "https://api.example.com", limit: 10 });
  });

  it("re-runs a runOnDepChange function when a dependency changes, but not on activation", async () => {
    const engine = createEngine(
      [variable("v1", "count", "0"), fn("f1", "double", "return count.value * 2")],
      echoQuery,
    );
    engine.subscribe("f1", noop);
    await tick();
    expect(effectHandle(engine, "f1").status).toBe("idle");

    engine.setValue("v1", 3);
    expect(effectHandle(engine, "f1").status).toBe("loading");
    await tick();
    const handle = effectHandle(engine, "f1");
    expect(handle.status).toBe("success");
    expect(handle.data).toBe(6);
  });

  it("run(id, args) works without any subscription and resolves with the result", async () => {
    const engine = createEngine(
      [fn("f1", "twice", "return args * 2", { runOnDepChange: false })],
      echoQuery,
    );
    await expect(engine.run("f1", 21)).resolves.toBe(42);
    expect(effectHandle(engine, "f1").data).toBe(42);
  });

  it("a manual run retains its deps and cascades into active dependent effects", async () => {
    const engine = createEngine(
      [
        variable("v1", "a", "1"),
        variable("v2", "b", "2"),
        variable("v3", "total", "0"),
        fn("f1", "sum", "total.setValue(a.value + b.value); return null;", {
          runOnDepChange: false,
        }),
        fn("f2", "report", "return total.value + 1"),
      ],
      echoQuery,
    );
    engine.subscribe("f2", noop);
    await engine.run("f1");
    await tick();
    expect(varHandle(engine, "v3").value).toBe(3);
    expect(effectHandle(engine, "f2").data).toBe(4);
  });

  it("globals stay active once touched, so state written through a temp retain persists", async () => {
    const engine = createEngine(
      [
        variable("v1", "a", "1"),
        variable("v2", "b", "2"),
        variable("v3", "total", "0"),
        fn("f1", "sum", "total.setValue(a.value + b.value); return null;", {
          runOnDepChange: false,
        }),
      ],
      echoQuery,
    );
    // No subscribers anywhere: the run temp-retains a, b, and total, and
    // being globals they never deactivate afterwards.
    await engine.run("f1");
    await tick();
    expect(varHandle(engine, "v3").value).toBe(3);
  });

  it("discards a superseded run's result", async () => {
    const first = deferred<unknown>();
    const second = deferred<unknown>();
    const results = [first.promise, second.promise];
    const engine = createEngine(
      [query("q1", "q", { url: "x" }, { runOnMount: false })],
      { executeQuery: () => results.shift()! },
    );

    const run1 = engine.run("q1");
    const run2 = engine.run("q1");
    second.resolve("new");
    await tick();
    expect(effectHandle(engine, "q1").data).toBe("new");

    first.resolve("old");
    await tick();
    // The superseded run resolves for its caller but doesn't touch state.
    await expect(run1).resolves.toBe("old");
    await expect(run2).resolves.toBe("new");
    expect(effectHandle(engine, "q1").data).toBe("new");
  });

  it("reports loading with no data and reloading over stale data", async () => {
    const first = deferred<unknown>();
    const second = deferred<unknown>();
    const results = [first.promise, second.promise];
    const engine = createEngine(
      [query("q1", "q", { url: "x" }, { runOnMount: false })],
      { executeQuery: () => results.shift()! },
    );

    void engine.run("q1");
    expect(effectHandle(engine, "q1").status).toBe("loading");
    first.resolve("data");
    await tick();

    void engine.run("q1");
    const handle = effectHandle(engine, "q1");
    expect(handle.status).toBe("reloading");
    expect(handle.data).toBe("data");
    second.resolve("data2");
    await tick();
    expect(effectHandle(engine, "q1").data).toBe("data2");
  });

  it("records a run error and keeps stale data", async () => {
    const engine = createEngine(
      [
        variable("v1", "flag", "false"),
        fn(
          "f1",
          "risky",
          'if (flag.value) throw new Error("boom"); return 1;',
        ),
      ],
      echoQuery,
    );
    engine.subscribe("f1", noop);
    await engine.run("f1");
    expect(effectHandle(engine, "f1").data).toBe(1);

    engine.setValue("v1", true);
    await tick();
    const handle = effectHandle(engine, "f1");
    expect(handle.status).toBe("error");
    expect(handle.error).toBe("boom");
    expect(handle.data).toBe(1);
  });

  it("page primitives shadow globals and deactivate when their last subscriber leaves", async () => {
    const engine = createEngine(
      [
        variable("g1", "a", "1"),
        variable("p1", "a", "2", "page-1"),
        variable("p2", "pv", "{{a.value + 1}}", "page-1"),
        fn("p3", "onLoad", "return a.value", { runOnMount: true }, "page-1"),
      ],
      echoQuery,
    );
    const unsubscribePv = engine.subscribe("p2", noop);
    const unsubscribeOnLoad = engine.subscribe("p3", noop);
    await tick();

    // "a" resolved to the page def, which shadows the global one.
    expect(varHandle(engine, "p1").value).toBe(2);
    expect(varHandle(engine, "p2").value).toBe(3);
    expect(effectHandle(engine, "p3").data).toBe(2);
    // The global "a" was shadowed, never retained, so never evaluated.
    expect(varHandle(engine, "g1").value).toBeUndefined();

    unsubscribePv();
    unsubscribeOnLoad();
    await tick();
    expect(varHandle(engine, "p1").value).toBeUndefined();
    expect(varHandle(engine, "p2").value).toBeUndefined();
    expect(effectHandle(engine, "p3").status).toBe("idle");
  });

  it("never computes primitives nobody subscribed to; late activation sees current values", async () => {
    const engine = createEngine(
      [
        variable("g1", "a", "1"),
        variable("p1", "pv", "{{a.value + 1}}", "page-1"),
        fn("p2", "watcher", "return a.value", {}, "page-1"),
      ],
      echoQuery,
    );
    engine.subscribe("g1", noop);
    engine.setValue("g1", 5);
    await tick();

    expect(varHandle(engine, "p1").value).toBeUndefined();
    expect(effectHandle(engine, "p2").status).toBe("idle");

    // Subscribing later computes fresh from the current global value.
    engine.subscribe("p1", noop);
    expect(varHandle(engine, "p1").value).toBe(6);
  });

  it("shares a dep across subscribers and deactivates it only after the last release", async () => {
    const executeQuery = vi.fn(
      async (_def: QueryDef, config: Record<string, unknown>) => config,
    );
    const engine = createEngine(
      [
        query("q1", "q", { url: "x" }, {}, "page-1"),
        fn("f1", "watchA", "return q.data", {}, "page-1"),
        fn("f2", "watchB", "return q.data", {}, "page-1"),
      ],
      { executeQuery },
    );
    const unsubscribeA = engine.subscribe("f1", noop);
    const unsubscribeB = engine.subscribe("f2", noop);
    await tick();
    // One fetch despite two dependents retaining the query.
    expect(executeQuery).toHaveBeenCalledTimes(1);
    expect(effectHandle(engine, "q1").status).toBe("success");

    unsubscribeA();
    await tick();
    expect(effectHandle(engine, "q1").status).toBe("success");

    unsubscribeB();
    await tick();
    expect(effectHandle(engine, "q1").status).toBe("idle");
    expect(effectHandle(engine, "q1").data).toBeUndefined();
    expect(executeQuery).toHaveBeenCalledTimes(1);
  });

  it("absorbs quick unsubscribe/resubscribe without tearing down or refetching", async () => {
    const executeQuery = vi.fn(
      async (_def: QueryDef, config: Record<string, unknown>) => config,
    );
    const engine = createEngine(
      [query("q1", "q", { url: "x" }, {}, "page-1")],
      { executeQuery },
    );
    const unsubscribe1 = engine.subscribe("q1", noop);
    // StrictMode-style churn: release and re-retain in the same tick.
    unsubscribe1();
    const unsubscribe2 = engine.subscribe("q1", noop);
    await tick();
    expect(executeQuery).toHaveBeenCalledTimes(1);
    expect(effectHandle(engine, "q1").status).toBe("success");

    // A real departure deactivates; the next subscriber fetches fresh.
    unsubscribe2();
    await tick();
    expect(effectHandle(engine, "q1").status).toBe("idle");
    engine.subscribe("q1", noop);
    await tick();
    expect(executeQuery).toHaveBeenCalledTimes(2);
  });

  it("surfaces config errors in state and rejects runs; cyclic defs are safe to subscribe", async () => {
    const engine = createEngine(
      [
        variable("v1", "a", "{{b.value}}"),
        variable("v2", "b", "{{a.value}}"),
        fn("f1", "selfish", "return selfish.data"),
      ],
      echoQuery,
    );
    expect(() => engine.subscribe("v1", noop)).not.toThrow();
    expect(varHandle(engine, "v1").error).toMatch(/cycle/);
    await expect(engine.run("f1")).rejects.toThrow(/cycle/);
    await expect(engine.run("nope")).rejects.toThrow(/Unknown primitive/);
    expect(() => engine.subscribe("nope", noop)).toThrow(/Unknown primitive/);
    expect(() => engine.getHandle("nope")).toThrow(/Unknown primitive/);
  });

  it("resolves names to ids per scope, with page shadowing", () => {
    const engine = createEngine(
      [
        variable("g1", "a", "1"),
        variable("p1", "a", "2", "page-1"),
        variable("p2", "pv", "3", "page-1"),
      ],
      echoQuery,
    );
    expect(engine.resolve("global", "a")).toBe("g1");
    expect(engine.resolve("page-1", "a")).toBe("p1");
    expect(engine.resolve("page-1", "pv")).toBe("p2");
    expect(engine.resolve("global", "pv")).toBeUndefined();
    expect(engine.resolve("page-1", "missing")).toBeUndefined();
  });

  it("caps dynamic dependency loops at MAX_CASCADE_DEPTH", async () => {
    const engine = createEngine(
      [
        variable("v1", "a", "0"),
        variable("v2", "b", "0"),
        fn("f1", "fa", "b.setValue(a.value + 1); return null;"),
        fn("f2", "fb", "a.setValue(b.value + 1); return null;"),
      ],
      echoQuery,
    );
    engine.subscribe("f1", noop);
    engine.subscribe("f2", noop);
    engine.setValue("v1", 1);

    await vi.waitFor(() => {
      const errors = [
        effectHandle(engine, "f1").error,
        effectHandle(engine, "f2").error,
      ];
      expect(errors.join(" ")).toMatch(/Cascade depth exceeded/);
    });
  });

  it("dispose resets everything and detaches listeners", async () => {
    const listener = vi.fn();
    const engine = createEngine(
      [variable("v1", "a", "1"), query("q1", "q", { url: "x" })],
      echoQuery,
    );
    engine.subscribe("v1", noop);
    engine.subscribe("q1", listener);
    engine.dispose();

    expect(varHandle(engine, "v1").value).toBeUndefined();
    expect(effectHandle(engine, "q1").status).toBe("idle");

    listener.mockClear();
    await tick(); // a settling in-flight query must be discarded silently
    expect(effectHandle(engine, "q1").status).toBe("idle");
    expect(listener).not.toHaveBeenCalled();
  });
});
