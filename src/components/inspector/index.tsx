import { useAppStore } from "@/store";
import React from "react";
import { twMerge } from "tailwind-merge";

interface InspectorProps extends Omit<
  React.HTMLAttributes<HTMLElement>,
  "children"
> {}

export function Inspector({ className, ...props }: InspectorProps) {
  const primitiveView = useAppStore((state) => state.viewPrimitive);
  return (
    <div
      className={twMerge("bg-card h-full flex flex-col p-2", className)}
      {...props}
    >
      {primitiveView}
    </div>
  );
}
