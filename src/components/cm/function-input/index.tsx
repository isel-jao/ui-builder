import { useEffect, useRef } from "react";

import { acceptCompletion } from "@codemirror/autocomplete";
import {
  javascript,
  javascriptLanguage,
  scopeCompletionSource,
} from "@codemirror/lang-javascript";
import { Prec } from "@codemirror/state";
import { keymap } from "@codemirror/view";
import { basicSetup, EditorView } from "codemirror";

import { editorTheme } from "../theme";

const tabAccept = Prec.highest(
  keymap.of([{ key: "Tab", run: acceptCompletion }]),
);

interface Props {
  initialDoc: string;
  ctx: Record<string, unknown>;
  onChange?: (doc: string) => void;
}

export function FunctionInput({ initialDoc, ctx, onChange }: Props) {
  const host = useRef<HTMLDivElement>(null);

  // biome-ignore lint/correctness/useExhaustiveDependencies:  create once; push later changes via view.dispatch, not re-render
  useEffect(() => {
    const view = new EditorView({
      parent: host.current!,
      doc: initialDoc,
      extensions: [
        basicSetup,
        javascript(),
        tabAccept,
        editorTheme,
        javascriptLanguage.data.of({
          // TODO: create our own completion (forgeCompletions(scope))
          autocomplete: scopeCompletionSource(ctx),
        }),
        EditorView.updateListener.of((update) => {
          if (update.docChanged) {
            onChange?.(update.state.doc.toString());
          }
        }),
      ],
    });
    return () => view.destroy();
  }, []);

  return <div ref={host} />;
}
