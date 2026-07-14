import { buildGraph } from "./graph";
import type { PrimitiveDef, QueryDef } from "./types";

type Snapshot = Record<string, unknown>;

export interface Engine {
  // Initial sweep of all variables, then every `runOnMount` effect. (global Primitives)
  mount(): void;

  // unmount the previous page, then mount the new page. (page Primitives and config binding)
  mountPage(pageId: string): void;

  // Dispose of all page Primitives.
  unmountPage(pageId: string): void;

  // Dispose of all Primitives.
  unmount(): void;

  // External write to a variable, triggering recomputation of all dependent Primitives.
  setValue(id: string, value: unknown): void;

  // Manual query/function trigger; settles with the run's result.
  run(id: string): void;

  getSnapshot(pageId: string): Snapshot;
}

export interface EngineOptions {
  executeQuery: (
    def: QueryDef,
    config: Record<string, unknown>,
  ) => Promise<unknown>;
}

export function createEngine(defs: PrimitiveDef[], options: EngineOptions) {
  void options;
  const graph = buildGraph({ defs });

  let disposed = false;
  let sweeping = false;
  let mounted = false;
  let mountedPageId: string | undefined;
}
