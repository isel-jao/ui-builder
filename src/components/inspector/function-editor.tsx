import { useAppStore } from "@/store";
import React, { useRef } from "react";
import { useParams } from "react-router";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { Button } from "../ui/button";
import { toast } from "sonner";
import { FunctionInput } from "../cm/function-input";
import { Switch } from "../ui/switch";

export function FunctionEditor({ scope }: { scope: string }) {
  const { pageId } = useParams<{
    pageId: string;
  }>();
  const pages = useAppStore((state) => state.pages);
  const addPrimitive = useAppStore((state) => state.addPrimitive);
  const primitives = useAppStore((state) => state.primitives);
  const data = useRef({
    name: "",
    doc: "",
    runOnMount: false,
    runOnDepChange: false,
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
    const doc = data.current.doc.trim();
    const runOnMount = data.current.runOnMount;
    const runOnDepChange = data.current.runOnDepChange;
    addPrimitive({
      id: crypto.randomUUID(),
      name: nameValue,
      kind: "function",
      scope: scope as "global" | "page",
      pageId: scope === "page" ? pageId : undefined,
      doc,
      runOnMount,
      runOnDepChange,
    });
    toast.success(`Function "${nameValue}" added to ${scopeName}`);
  }
  return (
    <div className="h-full flex flex-col gap-2">
      <span>{`Scope: ${scopeName}`}</span>
      <Label htmlFor="function-name">Name:</Label>
      <Input
        id="function-name"
        type="text"
        placeholder="name"
        onChange={handleNameChange}
      />
      <Label htmlFor="function-doc">Doc:</Label>
      <FunctionInput ctx={{}} initialDoc="" onChange={handleDocChange} />
      <Label htmlFor="function-run-on-mount">Run on mount:</Label>
      <Switch
        id="function-run-on-mount"
        onCheckedChange={(checked) => {
          data.current.runOnMount = checked;
        }}
      />
      <Label htmlFor="function-run-on-dep-change">
        Run on dependency change:
      </Label>
      <Switch
        id="function-run-on-dep-change"
        onCheckedChange={(checked) => {
          data.current.runOnDepChange = checked;
        }}
      />

      <Button onClick={handleSave}>save</Button>
    </div>
  );
}
