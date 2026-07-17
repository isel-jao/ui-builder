import { PageSelect } from "@/components/page-select";
import { Outlet } from "react-router";
import { Allotment } from "allotment";

import React from "react";
import { twMerge } from "tailwind-merge";
import { useAppStore } from "@/store";
import { ToolRail } from "@/components/tool-rail";
import { EditorPane } from "@/components/editor-pane";
import { ExplorerPane } from "@/components/explorer-pane ";

interface HeaderProps extends Omit<
  React.HTMLAttributes<HTMLElement>,
  "children"
> {}

export function Header({ className, ...props }: HeaderProps) {
  return (
    <div
      className={twMerge(
        "h-12 bg-card border-b px-6 flex items-center gap-4",
        className,
      )}
      {...props}
    >
      <span className="uppercase font-extrabold tracking-tighter text-lg">
        ui-builder
      </span>
      <PageSelect className="w-40" />
    </div>
  );
}
export default function AppLayoutLayout() {
  const allotmentVisibility = useAppStore((state) => state.allotmentVisibility);
  return (
    <main className="flex flex-col">
      <Header />
      <Allotment>
        <Allotment.Pane minSize={46} maxSize={46}>
          <ToolRail />
        </Allotment.Pane>
        <Allotment.Pane
          minSize={200}
          maxSize={300}
          preferredSize={250}
          snap
          visible={allotmentVisibility.sidebar}
        >
          <ExplorerPane />
        </Allotment.Pane>
        <Allotment.Pane
          minSize={200}
          maxSize={300}
          snap
          visible={allotmentVisibility.inspector}
        >
          <EditorPane />
        </Allotment.Pane>
        <Allotment.Pane>
          <Outlet />
        </Allotment.Pane>
      </Allotment>
    </main>
  );
}
