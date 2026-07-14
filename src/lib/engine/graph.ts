import { reverseDependencies } from "../reverse-dependencies";
import { topoSort } from "../topo-sort";
import { ALLOWED_DEP_KINDS, IDENTIFIER_RE, RESERVED_NAMES } from "./constants";
import { extractPrimitiveDeps } from "./extract-deps";
import type { PrimitiveDef } from "./types";

export interface EngineGraph {
  readonly defs: ReadonlyMap<string, Map<string, PrimitiveDef>>;
  readonly deps: ReadonlyMap<string, ReadonlySet<string>>;
  readonly revDeps: ReadonlyMap<string, ReadonlySet<string>>;

  readonly configErrors: ReadonlyMap<string, string>;
}

interface BuildGraphOptions {
  defs: PrimitiveDef[];
}

export function buildGraph(options: BuildGraphOptions): EngineGraph {
  const errors = new Map<string, string[]>();
  const addError = (id: string, message: string): void => {
    const list = errors.get(id);
    if (list) list.push(message);
    else errors.set(id, [message]);
  };
  // -----------------------------------------------------------

  const defs = new Map<string, Map<string, PrimitiveDef>>();
  // naming uniqueness and validity ----------------------------
  for (const def of options.defs) {
    const { id, name, pageId = "global", scope } = def;

    if (!IDENTIFIER_RE.test(name)) {
      addError(id, `"${name}" is not a valid identifier`);
      continue;
    }
    if (RESERVED_NAMES.has(name)) {
      addError(id, `"${name}" is a reserved name`);
      continue;
    }
    const existingPage = defs.get(pageId);
    if (!existingPage) {
      const newPage = new Map([[name, def]]);
      defs.set(pageId, newPage);
      continue;
    }
    if (existingPage.has(name)) {
      addError(
        id,
        `Duplicate name "${name}" in ${scope === "global" ? "global scope" : `page "${pageId}"`}`,
      );
    }
  }
  // -----------------------------------------------------------

  // dependency resolution ----------------------------
  const globalDefs = defs.get("global") ?? new Map();

  const deps = new Map<string, Set<string>>();
  for (const pageDefs of defs.values()) {
    for (const def of pageDefs.values()) {
      const { id } = def;
      const allowed = ALLOWED_DEP_KINDS[def.kind];
      const resolved = new Set<string>();
      for (const dep of extractPrimitiveDeps(def)) {
        const target = pageDefs.get(dep) || globalDefs.get(dep);
        if (!target) {
          continue;
        }
        if (!allowed.includes(target.kind)) {
          addError(id, `Invalid dependency "${dep}" of kind "${target.kind}"`);
          continue;
        }
        resolved.add(target.id);
      }
      deps.set(id, resolved);
    }
  }

  const revDeps = reverseDependencies(deps);
  // -----------------------------------------------------------

  // check cycle errors  --------------------------------------

  // -----------------------------------------------------------

  // config errors --------------------------------------
  const configErrors = new Map(
    [...errors].map(([name, messages]) => [name, messages.join("; ")]),
  );
  // -----------------------------------------------------------

  return {
    defs,
    deps,
    revDeps,
    configErrors,
  };
}
