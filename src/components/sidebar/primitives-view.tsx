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
  const globalPrimitives = useAppStore((state) =>
    state.primitives.filter((p) => p.scope === "global"),
  );
  const pagePrimitives = useAppStore((state) =>
    state.primitives.filter((p) => p.scope === "page" && p.pageId === pageId),
  );
  return (
    <Allotment vertical>
      <Allotment.Pane minSize={200}>
        <div className="flex items-center p-2">
          <span className="font-bold capitalize">global</span>
          <Menu scop="global" />
        </div>
      </Allotment.Pane>
      <Allotment.Pane minSize={200}>
        <div className="flex items-center p-2">
          <span className="font-bold capitalize">page</span>
          <Menu scop="page" />
        </div>
      </Allotment.Pane>
    </Allotment>
  );
}
