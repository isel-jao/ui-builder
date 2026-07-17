import { Allotment } from "allotment";
import { Button } from "../ui/button";
import { PlusIcon } from "lucide-react";
import { useAppStore } from "@/store";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useParams } from "react-router";
import { useShallow } from "zustand/shallow";
import { PrimitiveItem } from "./primitive-item";

function Menu({ scope }: { scope: "global" | "page" }) {
  const pageId = useParams<{ pageId: string }>().pageId;

  function handleClick(e: React.MouseEvent<HTMLDivElement, MouseEvent>) {
    const kind = e.currentTarget.dataset.kind as "variable" | "function";
    if (scope === "global") {
      useAppStore.getState().setPrimitiveEditorView({
        mode: "add",
        data: { kind, scope: "global" },
      });
      return;
    }
    if (scope === "page") {
      if (!pageId) return toast.error("No page selected");

      useAppStore.getState().setPrimitiveEditorView({
        mode: "add",
        data: { kind, scope: "page", pageId },
      });
    }
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button size={"icon-sm"} className={"ml-auto"} variant="outline" />
        }
      >
        <PlusIcon />
      </DropdownMenuTrigger>
      <DropdownMenuContent>
        <DropdownMenuGroup>
          <DropdownMenuItem data-kind="variable" onClick={handleClick}>
            Variable
          </DropdownMenuItem>
          <DropdownMenuItem data-kind="function" onClick={handleClick}>
            Function
          </DropdownMenuItem>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function PrimitivesView() {
  const { pageId } = useParams<{ pageId: string }>();
  const globalPrimitives = useAppStore(
    useShallow((state) => state.primitives.filter((p) => p.scope === "global")),
  );
  const pagePrimitives = useAppStore(
    useShallow((state) =>
      state.primitives.filter((p) => p.scope === "page" && p.pageId === pageId),
    ),
  );
  return (
    <Allotment vertical>
      <Allotment.Pane minSize={200}>
        <div className="flex items-center p-2">
          <span className="font-bold capitalize">global</span>
          <Menu scope="global" />
        </div>
        <PrimitiveList primitives={globalPrimitives} scope="global" />
      </Allotment.Pane>
      <Allotment.Pane minSize={200}>
        <div className="flex items-center p-2">
          <span className="font-bold capitalize">page</span>
          <Menu scope="page" />
        </div>
        <PrimitiveList primitives={pagePrimitives} scope="page" />
      </Allotment.Pane>
    </Allotment>
  );
}

import React from "react";
import { twMerge } from "tailwind-merge";
import type { PrimitiveDef } from "@/lib/engine/types";
import { toast } from "sonner";

interface PrimitiveListProps extends Omit<
  React.HTMLAttributes<HTMLElement>,
  "children"
> {
  primitives: PrimitiveDef[];
  scope: "global" | "page";
}

export function PrimitiveList({
  className,
  primitives,
  scope,
  ...props
}: PrimitiveListProps) {
  return (
    <div className={twMerge("h-full  w-full", className)} {...props}>
      {primitives.length === 0 ? (
        <div className="flex h-full items-center justify-center text-muted-foreground">
          No {scope} primitives
        </div>
      ) : (
        <ul className="flex flex-col gap-2 p-2 overflow-auto">
          {primitives.map((p) => (
            <PrimitiveItem key={p.id} primitive={p} />
          ))}
        </ul>
      )}
    </div>
  );
}
