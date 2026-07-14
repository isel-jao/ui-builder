import { describe, expect, it, vi } from "vitest";

import {
  createEngine,
  type EffectHandle,
  type EngineOptions,
  type Snapshot,
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

function varH(snapshot: Snapshot, name: string): VariableHandle {
  return snapshot[name] as VariableHandle;
}

function effectH(snapshot: Snapshot, name: string): EffectHandle {
  return snapshot[name] as EffectHandle;
}

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
  it("mount sweeps variables in dependency order regardless of def order", () => {
    const engine = createEngine(
      [
        variable("v3", "c", "{{b.value * 2}}"),
        variable("v1", "a", "1"),
        variable("v2", "b", "{{a.value + 1}}"),
      ],
      echoQuery,
    );
    engine.mount();
    const snap = engine.getSnapshot("global");
    expect(varH(snap, "a").value).toBe(1);
    expect(varH(snap, "b").value).toBe(2);
    expect(varH(snap, "c").value).toBe(4);
  });

  it("setValue recomputes dependents and notifies once per batch", () => {
    const engine = createEngine(
      [
        variable("v1", "a", "1"),
        variable("v2", "b", "{{a.value + 1}}"),
        variable("v3", "c", "{{b.value * 2}}"),
      ],
      echoQuery,
    );
    engine.mount();
    const listener = vi.fn();
    const unsubscribe = engine.subscribe(listener);

    engine.setValue("v1", 10);
    expect(listener).toHaveBeenCalledTimes(1);
    const snap = engine.getSnapshot("global");
    expect(varH(snap, "b").value).toBe(11);
    expect(varH(snap, "c").value).toBe(22);

    unsubscribe();
    engine.setValue("v1", 20);
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("keeps snapshots and untouched handles referentially stable", () => {
    const engine = createEngine(
      [
        variable("v1", "a", "1"),
        variable("v2", "b", "{{a.value + 1}}"),
        variable("v4", "d", "5"),
      ],
      echoQuery,
    );
    engine.mount();
    const first = engine.getSnapshot("global");
    expect(engine.getSnapshot("global")).toBe(first);

    engine.setValue("v1", 2);
    const second = engine.getSnapshot("global");
    expect(second).not.toBe(first);
    expect(second["a"]).not.toBe(first["a"]);
    expect(second["b"]).not.toBe(first["b"]);
    expect(second["d"]).toBe(first["d"]);
  });

  it("lets snapshot handles write variables", () => {
    const engine = createEngine(
      [variable("v1", "a", "1"), variable("v2", "b", "{{a.value + 1}}")],
      echoQuery,
    );
    engine.mount();
    varH(engine.getSnapshot("global"), "a").setValue(7);
    expect(varH(engine.getSnapshot("global"), "b").value).toBe(8);
  });

  it("last write wins between setValue and dependency-driven recomputes", () => {
    const engine = createEngine(
      [variable("v1", "a", "1"), variable("v2", "b", "{{a.value + 1}}")],
      echoQuery,
    );
    engine.mount();

    engine.setValue("v2", 99);
    expect(varH(engine.getSnapshot("global"), "b").value).toBe(99);

    engine.setValue("v1", 5);
    expect(varH(engine.getSnapshot("global"), "b").value).toBe(6);
  });

  it("records an evaluation error and degrades the value to undefined", () => {
    const engine = createEngine(
      [variable("v1", "a", "{{missing.value.deep}}")],
      echoQuery,
    );
    engine.mount();
    const handle = varH(engine.getSnapshot("global"), "a");
    expect(handle.value).toBeUndefined();
    expect(handle.error).toBeTruthy();
  });

  it("runs a runOnMount query with its evaluated config", async () => {
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
    engine.mount();
    expect(effectH(engine.getSnapshot("global"), "fetchData").status).toBe(
      "loading",
    );

    await tick();
    expect(executeQuery).toHaveBeenCalledWith(
      expect.objectContaining({ id: "q1" }),
      { url: "https://api.example.com", limit: 10 },
    );
    const handle = effectH(engine.getSnapshot("global"), "fetchData");
    expect(handle.status).toBe("success");
    expect(handle.data).toEqual({ url: "https://api.example.com", limit: 10 });
  });

  it("re-runs a runOnDepChange function when a dependency changes, but not on mount", async () => {
    const engine = createEngine(
      [variable("v1", "count", "0"), fn("f1", "double", "return count.value * 2")],
      echoQuery,
    );
    engine.mount();
    await tick();
    expect(effectH(engine.getSnapshot("global"), "double").status).toBe("idle");

    engine.setValue("v1", 3);
    expect(effectH(engine.getSnapshot("global"), "double").status).toBe(
      "loading",
    );
    await tick();
    const handle = effectH(engine.getSnapshot("global"), "double");
    expect(handle.status).toBe("success");
    expect(handle.data).toBe(6);
  });

  it("run(id, args) injects args and resolves with the result", async () => {
    const engine = createEngine(
      [fn("f1", "twice", "return args * 2", { runOnDepChange: false })],
      echoQuery,
    );
    engine.mount();
    await expect(engine.run("f1", 21)).resolves.toBe(42);
    expect(effectH(engine.getSnapshot("global"), "twice").data).toBe(42);
  });

  it("lets a function write variables and cascade into dependent effects", async () => {
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
    engine.mount();
    await engine.run("f1");
    await tick();
    expect(varH(engine.getSnapshot("global"), "total").value).toBe(3);
    expect(effectH(engine.getSnapshot("global"), "report").data).toBe(4);
  });

  it("discards a superseded run's result", async () => {
    const first = deferred<unknown>();
    const second = deferred<unknown>();
    const results = [first.promise, second.promise];
    const engine = createEngine(
      [query("q1", "q", { url: "x" }, { runOnMount: false })],
      { executeQuery: () => results.shift()! },
    );
    engine.mount();

    const run1 = engine.run("q1");
    const run2 = engine.run("q1");
    second.resolve("new");
    await tick();
    expect(effectH(engine.getSnapshot("global"), "q").data).toBe("new");

    first.resolve("old");
    await tick();
    // The superseded run resolves for its caller but doesn't touch state.
    await expect(run1).resolves.toBe("old");
    await expect(run2).resolves.toBe("new");
    expect(effectH(engine.getSnapshot("global"), "q").data).toBe("new");
  });

  it("reports loading with no data and reloading over stale data", async () => {
    const first = deferred<unknown>();
    const second = deferred<unknown>();
    const results = [first.promise, second.promise];
    const engine = createEngine(
      [query("q1", "q", { url: "x" }, { runOnMount: false })],
      { executeQuery: () => results.shift()! },
    );
    engine.mount();

    void engine.run("q1");
    expect(effectH(engine.getSnapshot("global"), "q").status).toBe("loading");
    first.resolve("data");
    await tick();

    void engine.run("q1");
    const handle = effectH(engine.getSnapshot("global"), "q");
    expect(handle.status).toBe("reloading");
    expect(handle.data).toBe("data");
    second.resolve("data2");
    await tick();
    expect(effectH(engine.getSnapshot("global"), "q").data).toBe("data2");
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
    engine.mount();
    await engine.run("f1");
    expect(effectH(engine.getSnapshot("global"), "risky").data).toBe(1);

    engine.setValue("v1", true);
    await tick();
    const handle = effectH(engine.getSnapshot("global"), "risky");
    expect(handle.status).toBe("error");
    expect(handle.error).toBe("boom");
    expect(handle.data).toBe(1);
  });

  it("mounts page primitives, shadows globals, and resets on unmount", async () => {
    const engine = createEngine(
      [
        variable("g1", "a", "1"),
        variable("p1", "a", "2", "page-1"),
        variable("p2", "pv", "{{a.value + 1}}", "page-1"),
        fn("p3", "onLoad", "return a.value", { runOnMount: true }, "page-1"),
      ],
      echoQuery,
    );
    engine.mountPage("page-1");
    await tick();

    const pageSnap = engine.getSnapshot("page-1");
    expect(varH(pageSnap, "a").value).toBe(2);
    expect(varH(pageSnap, "pv").value).toBe(3);
    expect(effectH(pageSnap, "onLoad").data).toBe(2);
    expect(varH(engine.getSnapshot("global"), "a").value).toBe(1);

    engine.unmountPage("page-1");
    const afterSnap = engine.getSnapshot("page-1");
    expect(varH(afterSnap, "a").value).toBeUndefined();
    expect(varH(afterSnap, "pv").value).toBeUndefined();
    expect(effectH(afterSnap, "onLoad").status).toBe("idle");
    expect(varH(engine.getSnapshot("global"), "a").value).toBe(1);
  });

  it("never computes page primitives while their page is unmounted", async () => {
    const engine = createEngine(
      [
        variable("g1", "a", "1"),
        variable("p1", "pv", "{{a.value + 1}}", "page-1"),
        fn("p2", "watcher", "return a.value", {}, "page-1"),
      ],
      echoQuery,
    );
    engine.mount();
    engine.setValue("g1", 5);
    await tick();

    const snap = engine.getSnapshot("page-1");
    expect(varH(snap, "pv").value).toBeUndefined();
    expect(effectH(snap, "watcher").status).toBe("idle");

    // Mounting later computes fresh from the current global value.
    engine.mountPage("page-1");
    expect(varH(engine.getSnapshot("page-1"), "pv").value).toBe(6);
  });

  it("surfaces config errors in state and rejects runs", async () => {
    const engine = createEngine(
      [
        variable("v1", "a", "{{b.value}}"),
        variable("v2", "b", "{{a.value}}"),
        fn("f1", "selfish", "return selfish.data"),
      ],
      echoQuery,
    );
    engine.mount();
    expect(varH(engine.getSnapshot("global"), "a").error).toMatch(/cycle/);
    await expect(engine.run("f1")).rejects.toThrow(/cycle/);
    await expect(engine.run("nope")).rejects.toThrow(/Unknown primitive/);
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
    engine.mount();
    engine.setValue("v1", 1);

    await vi.waitFor(() => {
      const snap = engine.getSnapshot("global");
      const errors = [effectH(snap, "fa").error, effectH(snap, "fb").error];
      expect(errors.join(" ")).toMatch(/Cascade depth exceeded/);
    });
  });

  it("unmount resets everything and detaches listeners", async () => {
    const listener = vi.fn();
    const engine = createEngine(
      [variable("v1", "a", "1"), query("q1", "q", { url: "x" })],
      echoQuery,
    );
    engine.mount();
    engine.subscribe(listener);
    engine.unmount();

    const snap = engine.getSnapshot("global");
    expect(varH(snap, "a").value).toBeUndefined();
    expect(effectH(snap, "q").status).toBe("idle");

    listener.mockClear();
    await tick(); // a settling in-flight query must be discarded silently
    expect(effectH(engine.getSnapshot("global"), "q").status).toBe("idle");
    expect(listener).not.toHaveBeenCalled();
  });
});
