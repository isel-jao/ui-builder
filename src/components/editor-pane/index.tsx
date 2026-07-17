import React from "react";
import { twMerge } from "tailwind-merge";
import { PrimitiveEditor } from "./primitive-editor";
import { useAppStore } from "@/store";

interface EditorPaneProps extends Omit<
  React.HTMLAttributes<HTMLElement>,
  "children"
> {}

export function EditorPane({ className, ...props }: EditorPaneProps) {
  const primitiveId = useAppStore((state) => {
    const primitiveEditorView = state.primitiveEditorView;
    if (!primitiveEditorView) {
      return null;
    }
    const { mode, data } = primitiveEditorView;
    if (mode === "edit") {
      return data.id;
    }
    return null;
  });
  return (
    <div
      className={twMerge("bg-card h-full flex flex-col p-2", className)}
      {...props}
    >
      <PrimitiveEditor key={primitiveId} />
    </div>
  );
}
