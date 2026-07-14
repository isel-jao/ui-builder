import { type AnyNode, type Program, parse } from "acorn";

import { TEMPLATE_RE } from "../evaluate-template";
import type { PrimitiveDef } from "./types";

// Extracts the names a primitive's doc/config references so the engine can
// build its dependency graph. A dep is a *free* root identifier: for
// `var1.value.str` that is `var1`; locals, parameters, and destructured
// bindings are not deps, and an inner shadow never hides an outer reference.
// Globals (`Math`, `JSON`, ...) are reported too — intersecting with the set
// of primitive names is the caller's job. Writes count as reads: both
// `count = count + 1` and `var2.setValue(10)` read the binding. Code that
// does not parse reports no deps, matching the evaluator, which cannot
// construct such a function.

export function extractTemplateDeps(doc: string): Set<string> {
  const deps = new Set<string>();
  for (const match of doc.matchAll(TEMPLATE_RE)) {
    // Mirror makeEvaluator, which runs the expression as `return (expr\n);`.
    collectProgramDeps(`return (${match[1]}\n);`, false, deps);
  }
  return deps;
}

export function extractCodeDeps(code: string): Set<string> {
  const deps = new Set<string>();
  collectProgramDeps(code, true, deps);
  return deps;
}

export function extractPrimitiveDeps(def: PrimitiveDef): Set<string> {
  switch (def.kind) {
    case "variable":
      return extractTemplateDeps(def.doc);
    case "function":
      return extractCodeDeps(def.doc);
    case "query":
      return extractConfigDeps(def.config);
  }
}

// Walks a config of arbitrary nesting — a query's or a widget binding's raw
// config — collecting template deps from every string leaf.
export function extractConfigDeps(config: unknown): Set<string> {
  const deps = new Set<string>();
  collectConfigDeps(config, deps);
  return deps;
}

// Config keys are fixed by the config's owner; only string values are templated.
function collectConfigDeps(value: unknown, deps: Set<string>): void {
  if (typeof value === "string") {
    for (const dep of extractTemplateDeps(value)) deps.add(dep);
  } else if (Array.isArray(value)) {
    for (const item of value) collectConfigDeps(item, deps);
  } else if (value !== null && typeof value === "object") {
    for (const item of Object.values(value)) collectConfigDeps(item, deps);
  }
}

function collectProgramDeps(
  source: string,
  allowAwait: boolean,
  deps: Set<string>,
): void {
  let program: Program;
  try {
    program = parse(source, {
      ecmaVersion: "latest",
      allowReturnOutsideFunction: true,
      allowAwaitOutsideFunction: allowAwait,
    });
  } catch {
    return;
  }
  const root: Scope = { parent: null, bindings: new Set() };
  hoistVars(program, root);
  prescanLexical(program.body, root);
  for (const stmt of program.body) walkNode(stmt, root, deps);
}

interface Scope {
  parent: Scope | null;
  bindings: Set<string>;
}

function childScope(parent: Scope): Scope {
  return { parent, bindings: new Set() };
}

function referenceName(name: string, scope: Scope, deps: Set<string>): void {
  for (let s: Scope | null = scope; s !== null; s = s.parent) {
    if (s.bindings.has(name)) return;
  }
  deps.add(name);
}

function walkNode(node: AnyNode, scope: Scope, deps: Set<string>): void {
  switch (node.type) {
    case "Identifier":
      referenceName(node.name, scope, deps);
      return;

    // `a.b` depends on `a` alone; `a[b]` depends on both.
    case "MemberExpression":
      walkNode(node.object, scope, deps);
      if (node.computed) walkNode(node.property, scope, deps);
      return;

    // `{foo: bar}` — foo is a key, not a reference; `{[foo]: bar}` reads foo.
    case "Property":
      if (node.computed) walkNode(node.key, scope, deps);
      walkNode(node.value, scope, deps);
      return;

    case "MethodDefinition":
    case "PropertyDefinition":
      if (node.computed) walkNode(node.key, scope, deps);
      if (node.value) walkNode(node.value, scope, deps);
      return;

    case "FunctionDeclaration":
    case "FunctionExpression":
    case "ArrowFunctionExpression": {
      const inner = childScope(scope);
      if (node.type !== "ArrowFunctionExpression" && node.id) {
        inner.bindings.add(node.id.name);
      }
      for (const param of node.params) bindPattern(param, inner, deps);
      if (node.body.type === "BlockStatement") hoistVars(node.body, inner);
      walkNode(node.body, inner, deps);
      return;
    }

    case "ClassDeclaration":
    case "ClassExpression": {
      const inner = childScope(scope);
      if (node.id) inner.bindings.add(node.id.name);
      if (node.superClass) walkNode(node.superClass, inner, deps);
      walkNode(node.body, inner, deps);
      return;
    }

    case "StaticBlock": {
      const inner = childScope(scope);
      hoistVars(node, inner);
      prescanLexical(node.body, inner);
      for (const stmt of node.body) walkNode(stmt, inner, deps);
      return;
    }

    case "BlockStatement": {
      const inner = childScope(scope);
      prescanLexical(node.body, inner);
      for (const stmt of node.body) walkNode(stmt, inner, deps);
      return;
    }

    case "VariableDeclaration":
      for (const decl of node.declarations) {
        bindPattern(decl.id, scope, deps);
        if (decl.init) walkNode(decl.init, scope, deps);
      }
      return;

    case "ForStatement": {
      const inner = childScope(scope);
      if (node.init) walkNode(node.init, inner, deps);
      if (node.test) walkNode(node.test, inner, deps);
      if (node.update) walkNode(node.update, inner, deps);
      walkNode(node.body, inner, deps);
      return;
    }

    case "ForInStatement":
    case "ForOfStatement": {
      const inner = childScope(scope);
      walkNode(node.left, inner, deps);
      walkNode(node.right, inner, deps);
      walkNode(node.body, inner, deps);
      return;
    }

    case "CatchClause": {
      const inner = childScope(scope);
      if (node.param) bindPattern(node.param, inner, deps);
      walkNode(node.body, inner, deps);
      return;
    }

    // Cases share one block scope: `case a: let x = 1; case b: return x`.
    case "SwitchStatement": {
      walkNode(node.discriminant, scope, deps);
      const inner = childScope(scope);
      for (const c of node.cases) prescanLexical(c.consequent, inner);
      for (const c of node.cases) {
        if (c.test) walkNode(c.test, inner, deps);
        for (const stmt of c.consequent) walkNode(stmt, inner, deps);
      }
      return;
    }

    // Labels are not variable references.
    case "LabeledStatement":
      walkNode(node.body, scope, deps);
      return;
    case "BreakStatement":
    case "ContinueStatement":
      return;

    // new.target / import.meta — `meta` and `property` are Identifier nodes.
    case "MetaProperty":
      return;

    // Everything else has no binding or key semantics of its own, so every
    // child node sits in reference position and can be walked generically.
    // Unknown future node types get the safe over-approximation: walking
    // their children may add a spurious dep, never lose a real one.
    default:
      eachChildNode(node, (child) => walkNode(child, scope, deps));
  }
}

// Binds every `var` (use-before-declaration still counts as bound) reachable
// without crossing into a nested function or class, which have their own
// var scope. Function and class declaration names are handled per block by
// prescanLexical.
function hoistVars(node: AnyNode, scope: Scope): void {
  switch (node.type) {
    case "FunctionDeclaration":
    case "FunctionExpression":
    case "ArrowFunctionExpression":
    case "ClassDeclaration":
    case "ClassExpression":
      return;
    case "VariableDeclaration":
      if (node.kind === "var") {
        for (const decl of node.declarations) bindPatternNames(decl.id, scope);
      }
      return;
    default:
      eachChildNode(node, (child) => hoistVars(child, scope));
  }
}

// Binds the lexical declarations among a block's direct statements before
// the block is walked, so a reference earlier in the block still resolves
// to the local binding (`return helper(); function helper() {}`).
function prescanLexical(stmts: AnyNode[], scope: Scope): void {
  for (const stmt of stmts) {
    switch (stmt.type) {
      case "VariableDeclaration":
        if (stmt.kind !== "var") {
          for (const decl of stmt.declarations) {
            bindPatternNames(decl.id, scope);
          }
        }
        break;
      case "FunctionDeclaration":
      case "ClassDeclaration":
        if (stmt.id) scope.bindings.add(stmt.id.name);
        break;
    }
  }
}

// Binds a declaration/parameter pattern's names and walks the expressions
// evaluated inside it: computed keys and defaults are reads.
function bindPattern(node: AnyNode, scope: Scope, deps: Set<string>): void {
  switch (node.type) {
    case "Identifier":
      scope.bindings.add(node.name);
      return;
    case "ObjectPattern":
      for (const prop of node.properties) {
        if (prop.type === "RestElement") {
          bindPattern(prop.argument, scope, deps);
        } else {
          if (prop.computed) walkNode(prop.key, scope, deps);
          bindPattern(prop.value, scope, deps);
        }
      }
      return;
    case "ArrayPattern":
      for (const element of node.elements) {
        if (element) bindPattern(element, scope, deps);
      }
      return;
    case "AssignmentPattern":
      bindPattern(node.left, scope, deps);
      walkNode(node.right, scope, deps);
      return;
    case "RestElement":
      bindPattern(node.argument, scope, deps);
      return;
  }
}

// Name-only variant for hoisting passes: binds identifiers but must not
// touch computed keys or defaults, which are walked at the declaration site.
function bindPatternNames(node: AnyNode, scope: Scope): void {
  switch (node.type) {
    case "Identifier":
      scope.bindings.add(node.name);
      return;
    case "ObjectPattern":
      for (const prop of node.properties) {
        if (prop.type === "RestElement") {
          bindPatternNames(prop.argument, scope);
        } else {
          bindPatternNames(prop.value, scope);
        }
      }
      return;
    case "ArrayPattern":
      for (const element of node.elements) {
        if (element) bindPatternNames(element, scope);
      }
      return;
    case "AssignmentPattern":
      bindPatternNames(node.left, scope);
      return;
    case "RestElement":
      bindPatternNames(node.argument, scope);
      return;
  }
}

function eachChildNode(node: AnyNode, visit: (child: AnyNode) => void): void {
  for (const value of Object.values(node as object)) {
    if (Array.isArray(value)) {
      for (const item of value) {
        if (isNode(item)) visit(item);
      }
    } else if (isNode(value)) {
      visit(value);
    }
  }
}

function isNode(value: unknown): value is AnyNode {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as { type?: unknown }).type === "string"
  );
}
