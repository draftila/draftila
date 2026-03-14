import { create } from 'zustand';

interface EditorState {
  // Canvas state
  zoom: number;
  panX: number;
  panY: number;

  // Selection
  selectedElementIds: string[];

  // Actions
  setZoom: (zoom: number) => void;
  setPan: (x: number, y: number) => void;
  selectElements: (ids: string[]) => void;
  clearSelection: () => void;
}

export const useEditorStore = create<EditorState>((set) => ({
  zoom: 1,
  panX: 0,
  panY: 0,
  selectedElementIds: [],

  setZoom: (zoom) => set({ zoom }),
  setPan: (panX, panY) => set({ panX, panY }),
  selectElements: (ids) => set({ selectedElementIds: ids }),
  clearSelection: () => set({ selectedElementIds: [] }),
}));
