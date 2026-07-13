import { PageSelect } from "@/components/page-select";
import { Outlet } from "react-router";
import { Allotment } from "allotment";

import React from "react";
import { twMerge } from "tailwind-merge";
import { MinSideBar } from "@/components/mini-sidebar";
import { Sidebar } from "@/components/sidebar";
import { Inspector } from "@/components/inspector";
import { Configuration } from "@/components/configuration";
import { useAppStore } from "@/store";

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
export default function PageLayout() {
  const allotmentVisibility = useAppStore((state) => state.allotmentVisibility);
  return (
    <main className="flex flex-col">
      <Header />
      <Allotment>
        <Allotment.Pane minSize={46} maxSize={46}>
          <MinSideBar />
        </Allotment.Pane>
        <Allotment.Pane
          minSize={200}
          maxSize={250}
          snap
          visible={allotmentVisibility.sidebar}
        >
          <Sidebar />
        </Allotment.Pane>
        <Allotment.Pane
          minSize={200}
          maxSize={300}
          snap
          visible={allotmentVisibility.inspector}
        >
          <Inspector />
        </Allotment.Pane>
        <Allotment.Pane>
          <Outlet />
        </Allotment.Pane>
        <Allotment.Pane
          minSize={200}
          maxSize={200}
          snap
          visible={allotmentVisibility.configuration}
        >
          <Configuration />
        </Allotment.Pane>
      </Allotment>
    </main>
  );
}
