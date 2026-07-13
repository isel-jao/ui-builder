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

function Menu({ scop }: { scop: "global" | "page" }) {
  const selectedViewPrimitive = useAppStore(
    (state) => state.selectViewPrimitive,
  );
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
          <DropdownMenuItem
            onClick={() => selectedViewPrimitive(`variable-${scop}` as any)}
          >
            Variable
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={() => selectedViewPrimitive(`function-${scop}` as any)}
          >
            Function
          </DropdownMenuItem>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function PrimitivesView() {
  const { pageId } = useParams<{ pageId: string }>();
  // const globalPrimitives = useAppStore((state) =>
  //   state.primitives.filter((p) => p.scope === "global"),
  // );
  // const pagePrimitives = useAppStore((state) =>
  //   state.primitives.filter((p) => p.scope === "page" && p.pageId === pageId),
  // );
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
          <Menu scop="global" />
        </div>
        {globalPrimitives.length === 0 ? (
          <div className="flex h-full items-center justify-center text-muted-foreground">
            No global primitives
          </div>
        ) : (
          <ul className="flex flex-col gap-2 p-2">
            {globalPrimitives.map((p) => (
              <li key={p.id} className="flex items-center gap-2">
                <span className="font-bold">{p.name}</span>
                <span className="text-sm text-muted-foreground">{p.kind}</span>
              </li>
            ))}
          </ul>
        )}
      </Allotment.Pane>
      <Allotment.Pane minSize={200}>
        <div className="flex items-center p-2">
          <span className="font-bold capitalize">page</span>
          <Menu scop="page" />
        </div>
        {pagePrimitives.length === 0 ? (
          <div className="flex h-full items-center justify-center text-muted-foreground">
            No page primitives
          </div>
        ) : (
          <ul className="flex flex-col gap-2 p-2">
            {pagePrimitives.map((p) => (
              <li key={p.id} className="flex items-center gap-2">
                <span className="font-bold">{p.name}</span>
                <span className="text-sm text-muted-foreground">{p.kind}</span>
              </li>
            ))}
          </ul>
        )}
      </Allotment.Pane>
    </Allotment>
  );
}
