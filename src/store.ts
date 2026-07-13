import { create } from "zustand";
import { persist } from "zustand/middleware";
import { immer } from "zustand/middleware/immer";
import type { PrimitiveDef } from "./lib/engine/types";

interface PageRecord {
  id: string;
  name: string;
}

interface WidgetConfig {
  widgetId: string;
  widgetName: string;
  config: Record<string, unknown>;
}

type PrimitiveRecord = PrimitiveDef & {
  scope: "global" | "page";
  pageId?: string;
};

type ViewPrimitive = `${"variable" | "function"}-${"global" | "page"}`;
interface State {
  pages: PageRecord[];
  widgets: WidgetConfig[];
  primitives: PrimitiveRecord[];
  readme: string;
  view: string;
  allotmentVisibility: {
    sidebar: boolean;
    inspector: boolean;
    configuration: boolean;
  };
  viewPrimitive: ViewPrimitive | null;
}

interface Actions {
  addPage: (page: PageRecord) => void;
  removePage: (pageId: string) => void;
  addWidget: (widget: WidgetConfig) => void;
  removeWidget: (widgetId: string) => void;
  addPrimitive: (primitive: PrimitiveRecord) => void;
  removePrimitive: (primitiveId: string) => void;
  setReadme: (readme: string) => void;
  selectView: (view: string) => void;
  openInspector: () => void;
  closeInspector: () => void;
  deletePage: (pageId: string) => void;
  selectViewPrimitive: (viewPrimitive: ViewPrimitive | null) => void;
}

interface StoreState extends State, Actions {}

const initialState: State = {
  pages: [],
  widgets: [],
  primitives: [],
  readme: "",
  view: "widgets",
  viewPrimitive: null,
  allotmentVisibility: {
    sidebar: true,
    inspector: false,
    configuration: false,
  },
};

export const useAppStore = create<StoreState>()(
  persist(
    immer((set) => ({
      ...initialState,
      addPage: (page) =>
        set((state) => {
          state.pages.push(page);
        }),
      removePage: (pageId) =>
        set((state) => {
          state.pages = state.pages.filter((p) => p.id !== pageId);
        }),
      addWidget: (widget) =>
        set((state) => {
          state.widgets.push(widget);
        }),
      removeWidget: (widgetId) =>
        set((state) => {
          state.widgets = state.widgets.filter((w) => w.widgetId !== widgetId);
        }),
      addPrimitive: (primitive) =>
        set((state) => {
          state.primitives.push(primitive);
          state.viewPrimitive = null;
        }),
      removePrimitive: (primitiveId) =>
        set((state) => {
          state.primitives = state.primitives.filter(
            (p) => p.id !== primitiveId,
          );
        }),
      setReadme: (readme) =>
        set((state) => {
          state.readme = readme;
        }),
      selectView: (view) =>
        set((state) => {
          state.view = view;
          state.allotmentVisibility.inspector =
            state.allotmentVisibility.inspector && view === "primitives";
        }),
      openInspector: () =>
        set((state) => {
          state.allotmentVisibility.inspector = true;
        }),
      closeInspector: () =>
        set((state) => {
          state.allotmentVisibility.inspector = false;
        }),
      deletePage: (pageId) =>
        set((state) => {
          state.pages = state.pages.filter((p) => p.id !== pageId);
        }),
      selectViewPrimitive: (viewPrimitive) =>
        set((state) => {
          state.viewPrimitive = viewPrimitive;
          state.allotmentVisibility.inspector = true;
          state.view = "primitives";
        }),
    })),
    {
      name: "app",
    },
  ),
);
