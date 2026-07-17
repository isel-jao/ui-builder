import type { PrimitiveDef } from "@/lib/engine/types";
import {
  CodeIcon,
  DatabaseIcon,
  PenIcon,
  Trash2Icon,
  VariableIcon,
} from "lucide-react";
import React from "react";
import { twMerge } from "tailwind-merge";
import { Button } from "../ui/button";
import { useAppStore } from "@/store";
import { useShallow } from "zustand/shallow";

const variableIcons: Record<string, React.ReactNode> = {
  variable: <VariableIcon />,
  function: <CodeIcon />,
  query: <DatabaseIcon />,
};

interface PrimitiveItemProps extends Omit<
  React.HTMLAttributes<HTMLElement>,
  "children"
> {
  primitive: PrimitiveDef;
}

export function PrimitiveItem({
  className,
  primitive,
  ...props
}: PrimitiveItemProps) {
  const { removePrimitive } = useAppStore(
    useShallow((state) => ({
      removePrimitive: state.removePrimitive,
    })),
  );
  const { name, kind } = primitive;
  function handleDelete(e: React.MouseEvent<HTMLButtonElement, MouseEvent>) {
    e.stopPropagation();
    e.preventDefault();
    removePrimitive(primitive.id);
  }
  return (
    <div className={twMerge("flex items-center gap-1 ", className)} {...props}>
      <span className="text-primary">
        {variableIcons[kind] || <VariableIcon />}
      </span>
      <span className="font-bold">{name}</span>
      <Button className={"ml-auto"} size={"icon-sm"} variant={"ghost"}>
        <PenIcon />
      </Button>
      <Button size={"icon-sm"} variant={"ghost"} onClick={handleDelete}>
        <Trash2Icon />
      </Button>
    </div>
  );
}
