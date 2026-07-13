import React from "react";
import { twMerge } from "tailwind-merge";

interface ConfigurationProps extends Omit<
  React.HTMLAttributes<HTMLElement>,
  "children"
> {}

export function Configuration({ className, ...props }: ConfigurationProps) {
  return (
    <div
      className={twMerge("bg-card h-full flex flex-col p-2", className)}
      {...props}
    >
      configuration
    </div>
  );
}
