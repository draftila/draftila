import { create } from 'zustand';
import type { Camera, CanvasGuide, Point, ToolType } from '@draftila/shared';
import type { GuideSnapTarget } from '@draftila/engine';
import { DEFAULT_CAMERA, clampZoom, configureToolStore } from '@draftila/engine';

interface EditorState {
  activeTool: ToolType;
  activePageId: string | null;
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
  guides: CanvasGuide[];
  selectedGuideId: string | null;
  draggingGuide: { axis: 'x' | 'y'; position: number } | null;
  rulersVisible: boolean;
  guidesVisible: boolean;
  commentsVisible: boolean;
  activeCommentId: string | null;
  aiActiveFrameIds: Set<string>;

  setActiveTool: (tool: ToolType) => void;
  setActivePageId: (pageId: string | null) => void;
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
  setGuides: (guides: CanvasGuide[]) => void;
  setSelectedGuideId: (id: string | null) => void;
  setDraggingGuide: (guide: { axis: 'x' | 'y'; position: number } | null) => void;
  setRulersVisible: (visible: boolean) => void;
  setGuidesVisible: (visible: boolean) => void;
  setCommentsVisible: (visible: boolean) => void;
  setActiveCommentId: (id: string | null) => void;
  setAiActiveFrameIds: (ids: Set<string>) => void;
}

export const useEditorStore = create<EditorState>((set) => ({
  activeTool: 'move',
  activePageId: null,
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
  guides: [],
  selectedGuideId: null,
  draggingGuide: null,
  rulersVisible: localStorage.getItem('draftila:rulersVisible') !== 'false',
  guidesVisible: localStorage.getItem('draftila:rulersVisible') !== 'false',
  commentsVisible: localStorage.getItem('draftila:commentsVisible') !== 'false',
  activeCommentId: null,
  aiActiveFrameIds: new Set(),

  setActiveTool: (tool) => set({ activeTool: tool }),

  setActivePageId: (pageId) => set({ activePageId: pageId }),

  setCamera: (camera) => set({ camera }),

  updateCamera: (partial) =>
    set((state) => ({
      camera: { ...state.camera, ...partial },
    })),

  setZoom: (zoom) =>
    set((state) => ({
      camera: { ...state.camera, zoom: clampZoom(zoom) },
    })),

  setSelectedIds: (ids) =>
    set((state) => ({
      selectedIds: ids,
      selectedGuideId: ids.length > 0 ? null : state.selectedGuideId,
    })),

  addToSelection: (id) =>
    set((state) => ({
      selectedIds: state.selectedIds.includes(id) ? state.selectedIds : [...state.selectedIds, id],
      selectedGuideId: null,
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
      selectedGuideId: null,
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

  setGuides: (guides) => set({ guides }),

  setSelectedGuideId: (id) =>
    set((state) => ({
      selectedGuideId: id,
      selectedIds: id !== null ? [] : state.selectedIds,
    })),

  setDraggingGuide: (guide) => set({ draggingGuide: guide }),

  setRulersVisible: (visible) => {
    localStorage.setItem('draftila:rulersVisible', String(visible));
    set({ rulersVisible: visible });
  },

  setGuidesVisible: (visible) => set({ guidesVisible: visible }),

  setCommentsVisible: (visible) => {
    localStorage.setItem('draftila:commentsVisible', String(visible));
    set({ commentsVisible: visible });
  },

  setActiveCommentId: (id) => set({ activeCommentId: id }),

  setAiActiveFrameIds: (ids) => set({ aiActiveFrameIds: ids }),
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
  getGuides: (): GuideSnapTarget[] => {
    const { guides, guidesVisible } = useEditorStore.getState();
    if (!guidesVisible) return [];
    return guides.map((g) => ({ axis: g.axis, position: g.position }));
  },
  getCanvasGuides: () => useEditorStore.getState().guides,
  setSelectedGuideId: (id) => useEditorStore.getState().setSelectedGuideId(id),
  getActivePageId: () => useEditorStore.getState().activePageId,
});
