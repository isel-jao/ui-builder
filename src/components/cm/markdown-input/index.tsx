import { useEffect, useRef } from "react";

import { markdown } from "@codemirror/lang-markdown";
import { languages } from "@codemirror/language-data";
import { EditorView } from "@codemirror/view";
import { minimalSetup } from "codemirror";

const fieldTheme = EditorView.theme({
  "&": {
    border: "1px solid var(--color-input)",
    borderRadius: "0.5rem",
    backgroundColor: "transparent",
    fontSize: "0.875rem",
  },
  "&.cm-focused": {
    outline: "none",
    borderColor: "var(--color-ring)",
    boxShadow:
      "0 0 0 3px color-mix(in oklab, var(--color-ring) 50%, transparent)",
  },
  ".cm-content": { padding: "8px 10px", fontFamily: "inherit" },
  ".cm-scroller": { minHeight: "12rem", fontFamily: "inherit" },
});

interface Props {
  initialDoc: string;
  onChange?: (doc: string) => void;
}

export function MarkdownInput({ initialDoc, onChange }: Props) {
  const host = useRef<HTMLDivElement>(null);

  // biome-ignore lint/correctness/useExhaustiveDependencies: create once; push later changes via view.dispatch, not re-render
  useEffect(() => {
    const view = new EditorView({
      parent: host.current!,
      doc: initialDoc,
      extensions: [
        minimalSetup,
        markdown({ codeLanguages: languages }),
        fieldTheme,
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
