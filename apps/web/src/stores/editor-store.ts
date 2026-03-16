import { create } from 'zustand';
import type { Camera, Point, ToolType } from '@draftila/shared';
import { DEFAULT_CAMERA, clampZoom, configureToolStore } from '@draftila/engine';

interface EditorState {
  activeTool: ToolType;
  camera: Camera;
  selectedIds: string[];
  enteredGroupId: string | null;
  hoveredId: string | null;
  editingTextId: string | null;
  isPanning: boolean;
  isDrawing: boolean;
  leftPanelOpen: boolean;
  rightPanelOpen: boolean;
  cursorCanvasPoint: Point | null;

  setActiveTool: (tool: ToolType) => void;
  setCamera: (camera: Camera) => void;
  updateCamera: (partial: Partial<Camera>) => void;
  setZoom: (zoom: number) => void;
  setSelectedIds: (ids: string[]) => void;
  addToSelection: (id: string) => void;
  removeFromSelection: (id: string) => void;
  toggleSelection: (id: string) => void;
  clearSelection: () => void;
  setHoveredId: (id: string | null) => void;
  setEditingTextId: (id: string | null) => void;
  setIsPanning: (isPanning: boolean) => void;
  setIsDrawing: (isDrawing: boolean) => void;
  setLeftPanelOpen: (open: boolean) => void;
  setRightPanelOpen: (open: boolean) => void;
  setCursorCanvasPoint: (point: Point | null) => void;
  setEnteredGroupId: (id: string | null) => void;
}

export const useEditorStore = create<EditorState>((set) => ({
  activeTool: 'move',
  camera: DEFAULT_CAMERA,
  selectedIds: [],
  enteredGroupId: null,
  hoveredId: null,
  editingTextId: null,
  isPanning: false,
  isDrawing: false,
  leftPanelOpen: true,
  rightPanelOpen: true,
  cursorCanvasPoint: null,

  setActiveTool: (tool) => set({ activeTool: tool }),

  setCamera: (camera) => set({ camera }),

  updateCamera: (partial) =>
    set((state) => ({
      camera: { ...state.camera, ...partial },
    })),

  setZoom: (zoom) =>
    set((state) => ({
      camera: { ...state.camera, zoom: clampZoom(zoom) },
    })),

  setSelectedIds: (ids) => set({ selectedIds: ids }),

  addToSelection: (id) =>
    set((state) => ({
      selectedIds: state.selectedIds.includes(id) ? state.selectedIds : [...state.selectedIds, id],
    })),

  removeFromSelection: (id) =>
    set((state) => ({
      selectedIds: state.selectedIds.filter((sid) => sid !== id),
    })),

  toggleSelection: (id) =>
    set((state) => ({
      selectedIds: state.selectedIds.includes(id)
        ? state.selectedIds.filter((sid) => sid !== id)
        : [...state.selectedIds, id],
    })),

  clearSelection: () => set({ selectedIds: [] }),

  setHoveredId: (id) => set({ hoveredId: id }),

  setEditingTextId: (id) => set({ editingTextId: id }),

  setIsPanning: (isPanning) => set({ isPanning }),

  setIsDrawing: (isDrawing) => set({ isDrawing }),

  setLeftPanelOpen: (open) => set({ leftPanelOpen: open }),

  setRightPanelOpen: (open) => set({ rightPanelOpen: open }),

  setCursorCanvasPoint: (point) => set({ cursorCanvasPoint: point }),

  setEnteredGroupId: (id) => set({ enteredGroupId: id }),
}));

configureToolStore({
  get selectedIds() {
    return useEditorStore.getState().selectedIds;
  },
  get enteredGroupId() {
    return useEditorStore.getState().enteredGroupId;
  },
  get camera() {
    return useEditorStore.getState().camera;
  },
  setSelectedIds: (ids) => useEditorStore.getState().setSelectedIds(ids),
  setActiveTool: (tool) => useEditorStore.getState().setActiveTool(tool),
  setIsDrawing: (drawing) => useEditorStore.getState().setIsDrawing(drawing),
  setIsPanning: (panning) => useEditorStore.getState().setIsPanning(panning),
  toggleSelection: (id) => useEditorStore.getState().toggleSelection(id),
  clearSelection: () => useEditorStore.getState().clearSelection(),
  setHoveredId: (id) => useEditorStore.getState().setHoveredId(id),
  setCamera: (camera) => useEditorStore.getState().setCamera(camera),
  setEnteredGroupId: (id) => useEditorStore.getState().setEnteredGroupId(id),
});
