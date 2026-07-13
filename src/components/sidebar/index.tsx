import { useAppStore } from "@/store";
import React from "react";
import { twMerge } from "tailwind-merge";
import { PagesView } from "./pages-view";
import { PrimitivesView } from "./primitives-view";

interface SidebarProps extends Omit<
  React.HTMLAttributes<HTMLElement>,
  "children"
> {}

export function Sidebar({ className, ...props }: SidebarProps) {
  return (
    <div className={twMerge("bg-card h-full p-2", className)} {...props}>
      <View />
    </div>
  );
}

function View() {
  const selectedView = useAppStore((state) => state.view);
  if (selectedView === "pages") {
    return <PagesView />;
  }
  if (selectedView === "primitives") {
    return <PrimitivesView />;
  }
  return <div>View: {selectedView}</div>;
}
