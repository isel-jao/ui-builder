import { describe, expect, it } from "vitest";

import { extractDependencies } from "./index";

describe("extractDependencies", () => {
  const ctx = {
    user: { name: "Alice", age: 30 },
    config: { version: "1.0" },
    count: 0,
  };

  describe("statement mode (non-template)", () => {
    it("extracts from return statement", () => {
      expect(extractDependencies("return user.name", ctx, false)).toEqual([
        "user",
      ]);
    });

    it("extracts from return statement with multiple identifiers", () => {
      expect(
        extractDependencies("return user.name + config.version", ctx, false),
      ).toEqual(["user", "config"]);
    });

    it("extracts from return with conditional", () => {
      expect(
        extractDependencies(
          "return count > 0 ? user.name : config.version",
          ctx,
          false,
        ),
      ).toEqual(["count", "user", "config"]);
    });

    it("extracts from return with computed member", () => {
      expect(extractDependencies("return user.name", ctx, false)).toEqual([
        "user",
      ]);
    });

    it("extracts from function block with const declarations and return", () => {
      expect(
        extractDependencies(
          `const name = user.name; const age = user.age; return \`my name is \${name} and my age is \${age}\``,
          ctx,
          false,
        ),
      ).toEqual(["user"]);
    });
  });

  describe("JSON template mode", () => {
    it("extracts from JSON with {{}} placeholders", () => {
      expect(
        extractDependencies(
          "{ name: {{user.name}}, age: {{user.age}} }",
          ctx,
          true,
        ),
      ).toEqual(["user"]);
    });

    it("extracts from JSON with multiple different placeholders", () => {
      expect(
        extractDependencies(
          "{ name: {{user.name}}, version: {{config.version}} }",
          ctx,
          true,
        ),
      ).toEqual(["user", "config"]);
    });

    it("extracts from JSON with expression in placeholder", () => {
      expect(
        extractDependencies(
          "{ total: {{count + 1}}, name: {{user.name}} }",
          ctx,
          true,
        ),
      ).toEqual(["count", "user"]);
    });

    it("extracts from JSON with conditional in placeholder", () => {
      expect(
        extractDependencies(
          "{ label: {{count > 0 ? user.name : config.version}} }",
          ctx,
          true,
        ),
      ).toEqual(["count", "user", "config"]);
    });

    it("deduplicates identifiers across JSON placeholders", () => {
      expect(
        extractDependencies("{ a: {{user.name}}, b: {{user.age}} }", ctx, true),
      ).toEqual(["user"]);
    });

    it("returns empty for JSON with no placeholders", () => {
      expect(
        extractDependencies("{ name: 'static', age: 30 }", ctx, true),
      ).toEqual([]);
    });
  });
});
