import React from "react";
import { twMerge } from "tailwind-merge";
import { PrimitiveEditor } from "./primitive-editor";

interface EditorPaneProps extends Omit<
  React.HTMLAttributes<HTMLElement>,
  "children"
> {}

export function EditorPane({ className, ...props }: EditorPaneProps) {
  return (
    <div
      className={twMerge("bg-card h-full flex flex-col p-2", className)}
      {...props}
    >
      <PrimitiveEditor />
    </div>
  );
}
