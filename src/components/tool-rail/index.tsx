import { useAppStore } from "@/store";
import { Button } from "../ui/button";
import { views } from "@/constants";
import { cn } from "@/lib/utils";

import React from "react";
import { twMerge } from "tailwind-merge";
import { useNavigate, useParams } from "react-router";

interface ToolRailProps extends Omit<
  React.HTMLAttributes<HTMLElement>,
  "children"
> {}

export function ToolRail({ className, ...props }: ToolRailProps) {
  const selectedView = useAppStore((state) => state.view);
  const { pageId } = useParams<{ pageId: string }>();
  const navigate = useNavigate();

  function handleViewClick(e: React.MouseEvent<HTMLButtonElement>) {
    const view = e.currentTarget.dataset.view;
    if (!view) return;
    useAppStore.getState().selectView(view);

    if (view !== "pages" && !pageId) {
      const indexPage = useAppStore
        .getState()
        .pages.find((p) => p.index === true);
      if (indexPage) {
        navigate(`/${indexPage.id}`);
      }
    }
  }
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
          data-view={id}
          variant="ghost"
          className={cn({
            "text-primary!": selectedView === id,
          })}
          onClick={handleViewClick}
        >
          <Icon />
        </Button>
      ))}
    </div>
  );
}
