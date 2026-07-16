import type { FC, SVGAttributes } from "react";

export interface WidgetRenderProps<T> {
  config: T;
}

export interface WidgetConfigProps<T> {
  config: T;
  onConfigChange: (newConfig: T) => void;
  VariableInput: FC<{
    value: string;
    onChange: (newValue: string) => void;
  }>;
}

// biome-ignore lint/suspicious/noExplicitAny: the grid layout widget can have any config shape, so we use `any` here
export interface WidgetPlugin<T = any> {
  id: string;
  name: string;
  defaultConfig: T;
  metadata: {
    minW?: number;
    minH?: number;
    maxW?: number;
    maxH?: number;
    [key: string]: unknown;
  };
  icon: FC<SVGAttributes<SVGSVGElement>>;
  Render: FC<WidgetRenderProps<T>>;
  Config?: FC<WidgetConfigProps<T>>;
}
