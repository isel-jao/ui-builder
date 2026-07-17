import { useAppStore } from "@/store";
import React, { useRef } from "react";
import { useParams } from "react-router";
import { Input } from "../../ui/input";
import { Label } from "../../ui/label";
import { Button } from "../../ui/button";
import { toast } from "sonner";
import { useShallow } from "zustand/shallow";
import type { FunctionDef } from "@/lib/engine/types";
import { FunctionInput } from "@/components/cm/function-input";
import { Switch } from "@/components/ui/switch";

interface FunctionEditorProps {
  scope: string;
}

export function FunctionEditor({ scope }: FunctionEditorProps) {
  const { pageId } = useParams<{
    pageId: string;
  }>();
  const {
    pages,
    addPrimitive,
    primitives,
    editPrimitive,
    primitiveEditorView,
  } = useAppStore(
    useShallow((state) => ({
      pages: state.pages,
      addPrimitive: state.addPrimitive,
      primitives: state.primitives,
      editPrimitive: state.editPrimitive,
      primitiveEditorView: state.primitiveEditorView,
    })),
  );
  if (primitiveEditorView?.data.kind !== "function") {
    throw new Error(
      `FunctionEditor: expected primitiveEditorView.data.kind to be "function", got "${primitiveEditorView?.data.kind}"`,
    );
  }
  const { mode, data: primitiveData } = primitiveEditorView;
  const data = useRef({
    name: mode === "edit" ? primitiveData.name : "",
    doc: mode === "edit" ? primitiveData.doc : "",
    runOnMount: mode === "edit" ? primitiveData.runOnMount : false,
    runOnDepChange: mode === "edit" ? primitiveData.runOnDepChange : false,
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

  function handleSave(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
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
    if (mode === "edit" && primitiveData && conflict?.id === primitiveData.id) {
      // no conflict, same primitive
    } else if (conflict) {
      toast.error(
        `Primitive with name "${nameValue}" already exists in ${scopeName}`,
      );
      return;
    }
    if (mode === "edit" && primitiveData) {
      editPrimitive(primitiveData.id, {
        name: nameValue,
        doc: docValue,
        runOnMount: data.current.runOnMount,
        runOnDepChange: data.current.runOnDepChange,
      });
      toast.success(`Function "${nameValue}" updated in ${scopeName}`);
      return;
    }
    if (mode === "add") {
      addPrimitive({
        id: crypto.randomUUID(),
        name: nameValue,
        doc: docValue,
        kind: "function",
        scope: scope as "global" | "page",
        pageId: scope === "page" ? pageId : undefined,
        runOnMount: data.current.runOnMount,
        runOnDepChange: data.current.runOnDepChange,
      });
      toast.success(`Function "${nameValue}" added to ${scopeName}`);
      return;
    }
  }
  return (
    <form className="h-full flex flex-col gap-2" onSubmit={handleSave}>
      <span>{`Scope: ${scopeName}`}</span>
      <Label htmlFor="function-name">Name:</Label>
      <Input
        autoFocus
        id="function-name"
        type="text"
        placeholder="name"
        defaultValue={(primitiveData as FunctionDef)?.name || ""}
        onChange={handleNameChange}
      />
      <Label htmlFor="function-doc">Doc:</Label>
      <FunctionInput
        ctx={{}}
        initialDoc={(primitiveData as FunctionDef)?.doc || ""}
        onChange={handleDocChange}
      />
      <Label htmlFor="function-run-on-mount">Run on mount:</Label>
      <Switch
        id="function-run-on-mount"
        defaultChecked={(primitiveData as FunctionDef)?.runOnMount || false}
        onCheckedChange={(checked) => {
          data.current.runOnMount = checked;
        }}
      />
      <Label htmlFor="function-run-on-dep-change">
        Run on dependency change:
      </Label>
      <Switch
        id="function-run-on-dep-change"
        defaultChecked={(primitiveData as FunctionDef)?.runOnDepChange || false}
        onCheckedChange={(checked) => {
          data.current.runOnDepChange = checked;
        }}
      />

      <Button type="submit">save</Button>
    </form>
  );
}
