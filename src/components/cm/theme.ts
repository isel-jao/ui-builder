import { EditorView } from "@codemirror/view";

// Shared chrome for the demo editors: a rounded bordered box with a focus ring.
export const editorTheme = EditorView.theme(
  {
    "&": {
      border: "1px solid var(--color-border)",
      borderRadius: "0.5rem",
      overflow: "hidden",
      fontSize: "13px",
    },
    "&.cm-focused": {
      outline: "none",
      borderColor: "var(--color-ring)",
      boxShadow:
        "0 0 0 2px color-mix(in oklab, var(--color-ring) 30%, transparent)",
    },
    ".cm-content": { padding: "8px 6px" },
  },
  { dark: false },
);
