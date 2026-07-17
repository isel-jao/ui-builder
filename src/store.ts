import { create } from "zustand";
import { persist } from "zustand/middleware";
import { immer } from "zustand/middleware/immer";
import type { PrimitiveDef, PrimitiveKind } from "./lib/engine/types";

interface PageRecord {
  id: string;
  name: string;
  index?: boolean;
}
type NewPrimitiveData = {
  kind: PrimitiveKind;
} & (
  | {
      scope: "global";
    }
  | {
      scope: "page";
      pageId: string;
    }
);

type PrimitiveEditorView =
  | {
      mode: "add";
      data: NewPrimitiveData;
    }
  | {
      mode: "edit";
      data: PrimitiveDef;
    };

interface WidgetConfig {
  widgetId: string;
  widgetName: string;
  config: Record<string, unknown>;
}

type PrimitiveRecord = PrimitiveDef & {
  scope: "global" | "page";
  pageId?: string;
};

interface State {
  pages: PageRecord[];
  widgets: WidgetConfig[];
  primitives: PrimitiveRecord[];
  readme: string;
  view: string;
  allotmentVisibility: {
    toolRail: boolean;
    explorer: boolean;
    editor: boolean;
  };
  primitiveEditorView: PrimitiveEditorView | null;
  editPrimitiveId: string | null;
}

interface Actions {
  addPage: (page: PageRecord) => void;
  removePage: (pageId: string) => void;
  addWidget: (widget: WidgetConfig) => void;
  removeWidget: (widgetId: string) => void;
  addPrimitive: (primitive: PrimitiveRecord) => void;
  editPrimitive: (
    primitiveId: string,
    updatedPrimitive: Partial<PrimitiveRecord>,
  ) => void;
  removePrimitive: (primitiveId: string) => void;
  setReadme: (readme: string) => void;
  selectView: (view: string) => void;
  openEditor: () => void;
  closeEditor: () => void;
  deletePage: (pageId: string) => void;
  setHomePage: (pageId: string) => void;
  setPrimitiveEditorView: (viewPrimitive: PrimitiveEditorView | null) => void;
}

interface StoreState extends State, Actions {}

const initialState: State = {
  pages: [
    {
      id: "home",
      name: "Home",
      index: true,
    },
  ],
  widgets: [],
  primitives: [],
  readme: "",
  view: "pages",
  primitiveEditorView: null,
  allotmentVisibility: {
    toolRail: true,
    explorer: true,
    editor: false,
  },
  editPrimitiveId: null,
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
          state.primitiveEditorView = null;
        }),
      editPrimitive: (primitiveId, updatedPrimitive) =>
        set((state) => {
          const targetPrimitive = state.primitives.find(
            (p) => p.id === primitiveId,
          );
          if (targetPrimitive) {
            Object.assign(targetPrimitive, updatedPrimitive);
          }
          state.primitiveEditorView = null;
          state.editPrimitiveId = null;
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
          state.allotmentVisibility.editor =
            state.allotmentVisibility.editor && view === "primitives";
        }),
      openEditor: () =>
        set((state) => {
          state.allotmentVisibility.editor = true;
        }),
      closeEditor: () =>
        set((state) => {
          state.allotmentVisibility.editor = false;
          state.primitiveEditorView = null;
        }),
      deletePage: (pageId) =>
        set((state) => {
          state.pages = state.pages.filter((p) => p.id !== pageId);
        }),
      setPrimitiveEditorView: (viewPrimitive) =>
        set((state) => {
          state.primitiveEditorView = viewPrimitive;
          state.allotmentVisibility.editor = !!viewPrimitive;
        }),
      setHomePage: (pageId) =>
        set((state) => {
          state.pages = state.pages.map((p) => ({
            ...p,
            index: p.id === pageId,
          }));
        }),
    })),
    {
      name: "app",
      partialize: (state) => ({
        pages: state.pages,
        readme: state.readme,
        primitives: state.primitives,
        editPrimitiveId: state.editPrimitiveId,
      }),
    },
  ),
);
