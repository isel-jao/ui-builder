import { useEffect, useRef } from "react";

import {
  acceptCompletion,
  autocompletion,
  type CompletionContext,
  type CompletionResult,
} from "@codemirror/autocomplete";
import { javascript, scopeCompletionSource } from "@codemirror/lang-javascript";
import { Prec } from "@codemirror/state";
import {
  Decoration,
  type DecorationSet,
  EditorView,
  keymap,
  ViewPlugin,
  type ViewUpdate,
} from "@codemirror/view";
import { minimalSetup } from "codemirror";

import { editorTheme } from "../theme";

export type BindingStatus = "ok" | "undefined" | "error";

const bindingTheme = EditorView.theme({
  // ".cm-binding-brace": { fontWeight: "600" },
  ".cm-binding-brace--ok": { color: "var(--color-green-500)" },
  ".cm-binding-brace--undefined": { color: "var(--color-muted-foreground)" },
  ".cm-binding-brace--error": { color: "var(--color-destructive)" },
  ".cm-binding-expr": {
    borderRadius: "4px",
    padding: "1px 2px",
  },
});

function bindingCompletions(ctx: Record<string, unknown>) {
  const scopeSource = scopeCompletionSource(ctx);
  return (
    context: CompletionContext,
  ): CompletionResult | Promise<CompletionResult | null> | null => {
    const before = context.state.sliceDoc(0, context.pos);
    const open = before.lastIndexOf("{{");
    const close = before.lastIndexOf("}}");

    if (open === -1 || close > open) return null; // not inside a binding
    return scopeSource(context);
  };
}
const braceMarks: Record<BindingStatus, Decoration> = {
  ok: Decoration.mark({ class: "cm-binding-brace cm-binding-brace--ok" }),
  undefined: Decoration.mark({
    class: "cm-binding-brace cm-binding-brace--undefined",
  }),
  error: Decoration.mark({ class: "cm-binding-brace cm-binding-brace--error" }),
};
const exprMark = Decoration.mark({ class: "cm-binding-expr" });

export const BINDING_RE = /\{\{([^}]*)\}\}/g;

function evalExpr(expr: string, ctx: Record<string, unknown>): unknown {
  const keys = Object.keys(ctx);
  const values = keys.map((k) => ctx[k]);
  // Dev-only demo: bindings are evaluated as JS expressions over the context.
  const fn = new Function(...keys, `"use strict"; return (${expr});`);
  return fn(...values);
}

export function bindingStatus(
  expr: string,
  ctx: Record<string, unknown>,
): BindingStatus {
  try {
    return evalExpr(expr.trim(), ctx) === undefined ? "undefined" : "ok";
  } catch {
    return "error";
  }
}

function bindingDecorations(
  view: EditorView,
  ctx: Record<string, unknown>,
): DecorationSet {
  const ranges: ReturnType<typeof exprMark.range>[] = [];
  for (const { from, to } of view.visibleRanges) {
    const text = view.state.doc.sliceString(from, to);
    for (const m of text.matchAll(BINDING_RE)) {
      const start = from + m.index;
      const end = start + m[0].length;
      const brace = braceMarks[bindingStatus(m[1] ?? "", ctx)];
      ranges.push(brace.range(start, start + 2));
      if (end - 2 > start + 2) ranges.push(exprMark.range(start + 2, end - 2));
      ranges.push(brace.range(end - 2, end));
    }
  }
  return Decoration.set(ranges, true);
}

function bindingHighlighter(ctx: Record<string, unknown>) {
  return ViewPlugin.fromClass(
    class {
      decorations: DecorationSet;
      constructor(view: EditorView) {
        this.decorations = bindingDecorations(view, ctx);
      }
      update(u: ViewUpdate) {
        if (u.docChanged || u.viewportChanged)
          this.decorations = bindingDecorations(u.view, ctx);
      }
    },
    { decorations: (v) => v.decorations },
  );
}

export function VariableInput({
  initialDoc,
  ctx,
  onChange,
}: {
  initialDoc: string;
  ctx: Record<string, unknown>;
  onChange: (value: string) => void;
}) {
  const host = useRef<HTMLDivElement>(null);

  // biome-ignore lint/correctness/useExhaustiveDependencies: create once; later edits flow out through the update listener
  useEffect(() => {
    const view = new EditorView({
      parent: host.current!,
      doc: initialDoc,
      extensions: [
        minimalSetup,
        javascript(),
        bindingHighlighter(ctx),
        editorTheme,
        bindingTheme,
        autocompletion({ override: [bindingCompletions(ctx)] }),
        Prec.highest(keymap.of([{ key: "Tab", run: acceptCompletion }])),
        EditorView.updateListener.of((u) => {
          if (u.docChanged) onChange(u.state.doc.toString());
        }),
      ],
    });
    return () => view.destroy();
  }, []);

  return <div ref={host} />;
}
