import { useAppStore } from "@/store";
import React, { useRef } from "react";
import { useParams } from "react-router";
import { VariableInput } from "../../cm/variable-input";
import { Input } from "../../ui/input";
import { Label } from "../../ui/label";
import { Button } from "../../ui/button";
import { toast } from "sonner";
import { useShallow } from "zustand/shallow";
import type { VariableDef } from "@/lib/engine/types";

interface VariableEditorProps {
  scope: string;
}

export function VariableEditor({ scope }: VariableEditorProps) {
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
  if (primitiveEditorView?.data.kind !== "variable") {
    throw new Error(
      `VariableEditor: expected primitiveEditorView.data.kind to be "variable", got "${primitiveEditorView?.data.kind}"`,
    );
  }
  const { mode, data: primitiveData } = primitiveEditorView;
  const data = useRef({
    name: mode === "edit" ? primitiveData.name : "",
    doc: mode === "edit" ? primitiveData.doc : "",
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
      });
      toast.success(`Variable "${nameValue}" updated in ${scopeName}`);
      return;
    }
    if (mode === "add") {
      addPrimitive({
        id: crypto.randomUUID(),
        name: nameValue,
        doc: docValue,
        kind: "variable",
        scope: scope as "global" | "page",
        pageId: scope === "page" ? pageId : undefined,
      });
      toast.success(`Variable "${nameValue}" added to ${scopeName}`);
      return;
    }
  }
  return (
    <form className="h-full flex flex-col gap-2" onSubmit={handleSave}>
      <span>{`Scope: ${scopeName}`}</span>
      <Label htmlFor="variable-name">Name:</Label>
      <Input
        autoFocus
        id="variable-name"
        type="text"
        placeholder="name"
        defaultValue={(primitiveData as VariableDef)?.name || ""}
        onChange={handleNameChange}
      />
      <Label htmlFor="variable-doc">Doc:</Label>
      <VariableInput
        ctx={{}}
        initialDoc={(primitiveData as VariableDef)?.doc || ""}
        onChange={handleDocChange}
      />

      <Button type="submit">save</Button>
    </form>
  );
}
