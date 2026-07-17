import { useAppStore } from "@/store";
import React, { useRef } from "react";
import { useParams } from "react-router";
import { VariableInput } from "../cm/variable-input";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { Button } from "../ui/button";
import { toast } from "sonner";

export function VariableEditor({ scope }: { scope: string }) {
  const { pageId } = useParams<{
    pageId: string;
  }>();
  const pages = useAppStore((state) => state.pages);
  const addPrimitive = useAppStore((state) => state.addPrimitive);
  const primitives = useAppStore((state) => state.primitives);
  const data = useRef({
    name: "",
    doc: "",
  });
  const scopeName =
    scope === "global"
      ? "global"
      : `page (${pages.find((p) => p.id === pageId)?.name || "unknown"})`;

  function handleDocChange(value: string) {
    data.current.doc = value;
  }
  function handleNameChange(e: React.ChangeEvent<HTMLInputElement>) {
    data.current.name = e.target.value;
  }

  function handleSave() {
    const nameValue = data.current.name.trim();
    if (!nameValue) {
      toast.error("Name is required");
      return;
    }
    const docValue = data.current.doc.trim();
    // check for conflict
    const conflict = primitives.find(
      (p) =>
        p.name === nameValue &&
        p.scope === scope &&
        (scope === "global" || p.pageId === pageId),
    );
    if (conflict) {
      toast.error(
        `Primitive with name "${nameValue}" already exists in ${scopeName}`,
      );
      return;
    }
    addPrimitive({
      id: crypto.randomUUID(),
      name: nameValue,
      doc: docValue,
      kind: "variable",
      scope: scope as "global" | "page",
      pageId: scope === "page" ? pageId : undefined,
    });
    toast.success(`Variable "${nameValue}" added to ${scopeName}`);
  }
  return (
    <div className="h-full flex flex-col gap-2">
      <span>{`Scope: ${scopeName}`}</span>
      <Label htmlFor="variable-name">Name:</Label>
      <Input
        id="variable-name"
        type="text"
        placeholder="name"
        onChange={handleNameChange}
      />
      <Label htmlFor="variable-doc">Doc:</Label>
      <VariableInput ctx={{}} initialDoc="" onChange={handleDocChange} />

      <Button onClick={handleSave}>save</Button>
    </div>
  );
}
