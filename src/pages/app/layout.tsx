import { PageSelect } from "@/components/page-select";
import { Outlet } from "react-router";
import { Allotment } from "allotment";

import React from "react";
import { twMerge } from "tailwind-merge";
import { useAppStore } from "@/store";
import { ToolRail } from "@/components/tool-rail";
import { EditorPane } from "@/components/editor-pane";
import { ExplorerPane } from "@/components/explorer-pane ";
import { useShallow } from "zustand/shallow";

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
  const { allotmentVisibility, primitiveEditorView } = useAppStore(
    useShallow((state) => ({
      allotmentVisibility: state.allotmentVisibility,
      primitiveEditorView: state.primitiveEditorView,
    })),
  );
  return (
    <main className="flex flex-col">
      <Header />
      <Allotment>
        <Allotment.Pane minSize={46} maxSize={46}>
          <ToolRail />
        </Allotment.Pane>
        <Allotment.Pane
          minSize={250}
          maxSize={250}
          preferredSize={250}
          snap
          visible={allotmentVisibility.explorer}
        >
          <ExplorerPane />
        </Allotment.Pane>
        ``
        <Allotment.Pane
          minSize={400}
          preferredSize={400}
          maxSize={400}
          snap
          visible={allotmentVisibility.editor && primitiveEditorView !== null}
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
