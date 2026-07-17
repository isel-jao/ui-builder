import { useAppStore } from "@/store";
import { VariableEditor } from "./variable-editor";
import { FunctionEditor } from "./function-editor";
import { useShallow } from "zustand/shallow";

export function PrimitiveEditor() {
  const { primitiveEditorView } = useAppStore(
    useShallow((state) => ({
      primitiveEditorView: state.primitiveEditorView,
    })),
  );

  if (!primitiveEditorView) {
    return null;
  }

  const { kind, scope } = primitiveEditorView.data;

  if (kind === "variable") {
    return <VariableEditor scope={scope} />;
  }
  if (kind === "function") {
    return <FunctionEditor scope={scope} />;
  }
  return <div>{`${kind}-${scope}`} not implemented yet</div>;
}
