import React from "react";
import { twMerge } from "tailwind-merge";
import { PrimitiveEditor } from "./primitive-editor";

interface InspectorProps extends Omit<
  React.HTMLAttributes<HTMLElement>,
  "children"
> {}

export function Inspector({ className, ...props }: InspectorProps) {
  return (
    <div
      className={twMerge("bg-card h-full flex flex-col p-2", className)}
      {...props}
    >
      <PrimitiveEditor />
    </div>
  );
}
