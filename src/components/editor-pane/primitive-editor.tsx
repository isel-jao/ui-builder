import { useAppStore } from "@/store";
import { VariableEditor } from "./variable-editor";
import { FunctionEditor } from "./function-editor";

export function PrimitiveEditor() {
  const primitiveView = useAppStore((state) => state.viewPrimitive);
  const [kind, scope = "global"] = primitiveView?.split("-") || [];

  if (kind === "variable") {
    return <VariableEditor scope={scope} />;
  }
  if (kind === "function") {
    return <FunctionEditor scope={scope} />;
  }
  return <div>{primitiveView} not implemented yet</div>;
}
