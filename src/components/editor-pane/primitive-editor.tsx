import { useAppStore } from "@/store";
import { VariableEditor } from "./variable-editor";
import { FunctionEditor } from "./function-editor";

export function PrimitiveEditor() {
  const primitiveEditorView = useAppStore((state) => state.primitiveEditorView);
  if (!primitiveEditorView) {
    return null;
  }
  const { kind, scope } = primitiveEditorView;

  if (kind === "variable") {
    return <VariableEditor scope={scope} />;
  }
  if (kind === "function") {
    return <FunctionEditor scope={scope} />;
  }
  return <div>{`${kind}-${scope}`} not implemented yet</div>;
}
