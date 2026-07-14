import { describe, expect, it } from "vitest";

import { buildGraph } from "./graph";
import type { VariableDef } from "./types";

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

describe("buildGraph", () => {
  it("registers every valid def and resolves deps between them", () => {
    const graph = buildGraph({
      defs: [
        variable("v1", "a", "1"),
        variable("v2", "b", "{{a.value}}"),
        variable("v3", "c", "{{a.value}} {{b.value}}"),
      ],
    });
    expect(graph.configErrors.size).toBe(0);
    expect(graph.deps).toEqual(
      new Map([
        ["v1", new Set()],
        ["v2", new Set(["v1"])],
        ["v3", new Set(["v1", "v2"])],
      ]),
    );
    expect(graph.revDeps).toEqual(
      new Map([
        ["v1", new Set(["v2", "v3"])],
        ["v2", new Set(["v3"])],
        ["v3", new Set()],
      ]),
    );
  });

  it("reports a duplicate name but keeps registering later defs", () => {
    const graph = buildGraph({
      defs: [
        variable("v1", "a", ""),
        variable("v2", "a", ""),
        variable("v3", "b", "{{a.value}}"),
      ],
    });
    expect(graph.configErrors.get("v2")).toContain('Duplicate name "a"');
    expect(graph.deps.get("v3")).toEqual(new Set(["v1"]));
  });

  describe("cycle errors", () => {
    it("flags a self-dependency", () => {
      const graph = buildGraph({
        defs: [variable("v1", "a", "{{a.value}}")],
      });
      expect(graph.configErrors.get("v1")).toContain("cycle");
    });

    it("flags every member of a cycle", () => {
      const graph = buildGraph({
        defs: [
          variable("v1", "a", "{{b.value}}"),
          variable("v2", "b", "{{a.value}}"),
        ],
      });
      expect(graph.configErrors.get("v1")).toContain("cycle");
      expect(graph.configErrors.get("v2")).toContain("cycle");
    });

    it("flags nodes downstream of a cycle, but not upstream ones", () => {
      const graph = buildGraph({
        defs: [
          variable("v1", "a", "{{b.value}}"),
          variable("v2", "b", "{{a.value}}"),
          variable("v3", "c", "{{a.value}}"),
          variable("v4", "d", ""),
        ],
      });
      expect(graph.configErrors.get("v3")).toContain("cycle");
      expect(graph.configErrors.has("v4")).toBe(false);
    });

    it("reports no cycle errors for an acyclic graph", () => {
      const graph = buildGraph({
        defs: [
          variable("v1", "a", ""),
          variable("v2", "b", "{{a.value}}"),
          variable("v3", "c", "{{b.value}}"),
        ],
      });
      expect(graph.configErrors.size).toBe(0);
    });

    it("detects a cycle between defs on the same page", () => {
      const graph = buildGraph({
        defs: [
          variable("v1", "a", "{{b.value}}", "page-1"),
          variable("v2", "b", "{{a.value}}", "page-1"),
        ],
      });
      expect(graph.configErrors.get("v1")).toContain("cycle");
      expect(graph.configErrors.get("v2")).toContain("cycle");
    });

    it("does not form a cycle through a page-scoped name invisible to global scope", () => {
      const graph = buildGraph({
        defs: [
          variable("v1", "a", "{{b.value}}"),
          variable("v2", "b", "{{a.value}}", "page-1"),
        ],
      });
      expect(graph.configErrors.size).toBe(0);
    });
  });
});
