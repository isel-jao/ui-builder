import { describe, expect, it } from "vitest";

import {
  extractCodeDeps,
  extractConfigDeps,
  extractPrimitiveDeps,
  extractTemplateDeps,
} from "./extract-deps";
import type { FunctionDef, QueryDef, VariableDef } from "./types";

describe("extractTemplateDeps", () => {
  it("returns nothing for a doc without templates", () => {
    expect(extractTemplateDeps("hello")).toEqual(new Set());
    expect(extractTemplateDeps('{num: 1, str: "a"}')).toEqual(new Set());
    expect(extractTemplateDeps("")).toEqual(new Set());
  });

  it("extracts a bare identifier", () => {
    expect(extractTemplateDeps("{{page}}")).toEqual(new Set(["page"]));
  });

  it("extracts only the root of a member chain", () => {
    expect(extractTemplateDeps("{{var1.value.str}}")).toEqual(
      new Set(["var1"]),
    );
    expect(extractTemplateDeps("{{q1.data?.items.length}}")).toEqual(
      new Set(["q1"]),
    );
  });

  it("extracts both sides of a computed member access", () => {
    expect(extractTemplateDeps("{{rows[selectedIndex]}}")).toEqual(
      new Set(["rows", "selectedIndex"]),
    );
  });

  it("unions deps across templates and dedupes repeats", () => {
    expect(extractTemplateDeps("{num: {{num}}, str: {{str}}}")).toEqual(
      new Set(["num", "str"]),
    );
    expect(extractTemplateDeps("{{a}} + {{a.b}}")).toEqual(new Set(["a"]));
  });

  it("extracts deps from calls and their arguments", () => {
    expect(extractTemplateDeps("{{Math.max(a, b)}}")).toEqual(
      new Set(["Math", "a", "b"]),
    );
  });

  it("does not report callback locals, but keeps their free references", () => {
    expect(
      extractTemplateDeps("{{items.map((item) => item.id + offset)}}"),
    ).toEqual(new Set(["items", "offset"]));
  });

  it("does not report object keys", () => {
    expect(extractTemplateDeps("{{ {foo: bar} }}")).toEqual(new Set(["bar"]));
  });

  it("reports shorthand properties", () => {
    expect(extractTemplateDeps("{{ {foo} }}")).toEqual(new Set(["foo"]));
  });

  it("reports computed keys", () => {
    expect(extractTemplateDeps("{{ {[key]: 1} }}")).toEqual(new Set(["key"]));
  });

  it("ignores identifiers inside string and template text", () => {
    expect(extractTemplateDeps("{{'var1' + x}}")).toEqual(new Set(["x"]));
    // biome-ignore lint/suspicious/noTemplateCurlyInString: this is a test for that exact case
    expect(extractTemplateDeps("{{`hi ${name}!`}}")).toEqual(new Set(["name"]));
  });

  it("extracts every branch of a ternary", () => {
    expect(extractTemplateDeps("{{ok ? a : b}}")).toEqual(
      new Set(["ok", "a", "b"]),
    );
  });

  it("contributes nothing for an unparsable expression", () => {
    expect(extractTemplateDeps("{{a +}} {{b}}")).toEqual(new Set(["b"]));
    expect(extractTemplateDeps("{{}}")).toEqual(new Set());
  });

  it("tolerates line comments the way the evaluator does", () => {
    expect(extractTemplateDeps("{{a // note}}")).toEqual(new Set(["a"]));
  });
});

describe("extractCodeDeps", () => {
  it("extracts references from statements", () => {
    expect(
      extractCodeDeps("var2.setValue(10); return var1.value.str + 'hello'"),
    ).toEqual(new Set(["var2", "var1"]));
  });

  it("does not report local declarations", () => {
    expect(
      extractCodeDeps("const x = a + 1; let y = 2; return x * y * b"),
    ).toEqual(new Set(["a", "b"]));
  });

  it("hoists var declarations above their first use", () => {
    expect(extractCodeDeps("x = 5; var x; return y")).toEqual(new Set(["y"]));
  });

  it("hoists function declarations", () => {
    expect(
      extractCodeDeps("return helper(); function helper() { return q1.data }"),
    ).toEqual(new Set(["q1"]));
  });

  it("keeps block-scoped declarations inside their block", () => {
    expect(extractCodeDeps("{ const x = 1; } return x")).toEqual(
      new Set(["x"]),
    );
  });

  it("does not report function parameters", () => {
    expect(
      extractCodeDeps("return [1, 2].map(function (v) { return v + offset })"),
    ).toEqual(new Set(["offset"]));
    expect(
      extractCodeDeps("const g = (n = base) => n * factor; return g(k)"),
    ).toEqual(new Set(["base", "factor", "k"]));
  });

  it("binds destructured names but keeps their sources", () => {
    expect(
      extractCodeDeps("const { a, b: c } = q1.data; return a + c + d"),
    ).toEqual(new Set(["q1", "d"]));
  });

  it("reports destructuring defaults and computed keys", () => {
    expect(
      extractCodeDeps("const { a = fallback, [key]: v } = obj; return a + v"),
    ).toEqual(new Set(["fallback", "key", "obj"]));
  });

  it("binds catch parameters", () => {
    expect(
      extractCodeDeps("try { risky() } catch (e) { return e.message }"),
    ).toEqual(new Set(["risky"]));
  });

  it("does not let an inner shadow hide an outer reference", () => {
    expect(
      extractCodeDeps(
        "const f = () => { const var1 = 1; return var1 }; return f() + var1",
      ),
    ).toEqual(new Set(["var1"]));
  });

  it("reports assignments to names it does not know", () => {
    expect(extractCodeDeps("count = count + 1")).toEqual(new Set(["count"]));
    expect(extractCodeDeps("flag = true")).toEqual(new Set(["flag"]));
  });

  it("reports write targets of destructuring assignments", () => {
    expect(extractCodeDeps("({ a } = q1.data)")).toEqual(new Set(["a", "q1"]));
  });

  it("does not report member property names", () => {
    expect(extractCodeDeps("return obj.length")).toEqual(new Set(["obj"]));
  });

  it("does not report labels", () => {
    expect(extractCodeDeps("outer: for (;;) { break outer }")).toEqual(
      new Set(),
    );
  });

  it("binds loop variables", () => {
    expect(
      extractCodeDeps("for (const item of items) { total += item.price }"),
    ).toEqual(new Set(["items", "total"]));
    expect(extractCodeDeps("for (let i = 0; i < n; i++) sum += i")).toEqual(
      new Set(["n", "sum"]),
    );
  });

  it("supports await", () => {
    expect(
      extractCodeDeps("const res = await q1.run(); return res.data"),
    ).toEqual(new Set(["q1"]));
  });

  it("returns nothing for unparsable code", () => {
    expect(extractCodeDeps("return {")).toEqual(new Set());
  });

  it("includes globals — filtering against known names is the caller's job", () => {
    expect(extractCodeDeps("return JSON.stringify(new Date(ts))")).toEqual(
      new Set(["JSON", "Date", "ts"]),
    );
  });
});

describe("extractPrimitiveDeps", () => {
  it("extracts template deps from a variable doc", () => {
    const def: VariableDef = {
      scope: "global",
      kind: "variable",
      id: "v1",
      name: "var1",
      doc: "{num: {{num}}, str: {{str}}}",
    };
    expect(extractPrimitiveDeps(def)).toEqual(new Set(["num", "str"]));
  });

  it("extracts code deps from a function doc", () => {
    const def: FunctionDef = {
      scope: "global",
      kind: "function",
      id: "f1",
      name: "greet",
      doc: "var2.setValue(10); return var1.value.str + 'hello'",
      runOnMount: false,
      runOnDepChange: true,
    };
    expect(extractPrimitiveDeps(def)).toEqual(new Set(["var2", "var1"]));
  });

  it("extracts template deps from every string in a query config", () => {
    const def: QueryDef = {
      scope: "global",
      kind: "query",
      id: "q1",
      name: "fetchData",
      config: {
        url: "https://api.example.com/data?page={{page}}",
        limit: "{{limit}}",
      },
      runOnMount: true,
      runOnDepChange: false,
    };
    expect(extractPrimitiveDeps(def)).toEqual(new Set(["page", "limit"]));
  });

  it("walks nested config objects and arrays", () => {
    const def: QueryDef = {
      scope: "global",
      kind: "query",
      id: "q2",
      name: "search",
      config: {
        headers: { Authorization: "Bearer {{token}}" },
        body: { filters: ["{{status}}", 42], flag: true },
      },
      runOnMount: true,
      runOnDepChange: false,
    };
    expect(extractPrimitiveDeps(def)).toEqual(new Set(["token", "status"]));
  });
});

describe("extractConfigDeps", () => {
  it("collects template deps from a bare config value", () => {
    expect(
      extractConfigDeps({
        title: "Sales — {{region.value}}",
        data: "{{q1.data}}",
        options: { depth: ["{{level}}", 3] },
      }),
    ).toEqual(new Set(["region", "q1", "level"]));
    expect(extractConfigDeps("{{a}}")).toEqual(new Set(["a"]));
    expect(extractConfigDeps(42)).toEqual(new Set());
  });
});
