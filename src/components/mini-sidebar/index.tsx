import { useAppStore } from "@/store";
import { Button } from "../ui/button";
import { views } from "@/constants";
import { cn } from "@/lib/utils";

import React from "react";
import { twMerge } from "tailwind-merge";

interface MiniSidebarProps extends Omit<
  React.HTMLAttributes<HTMLElement>,
  "children"
> {}

export function MinSideBar({ className, ...props }: MiniSidebarProps) {
  const selectedView = useAppStore((state) => state.view);
  return (
    <div
      className={twMerge(
        "bg-card h-full flex flex-col items-center gap-2 py-2",
        className,
      )}
      {...props}
    >
      {views.map(({ id, Icon }) => (
        <Button
          size="icon-lg"
          key={id}
          variant="ghost"
          onClick={() => useAppStore.getState().selectView(id)}
          className={cn({
            "text-primary!": selectedView === id,
          })}
        >
          <Icon />
        </Button>
      ))}
    </div>
  );
}
