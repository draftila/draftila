import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { SortOrder } from '@draftila/shared';

type ViewMode = 'grid' | 'list';

interface DashboardState {
  selectedProjectId: string | null;
  setSelectedProjectId: (id: string | null) => void;
  viewMode: ViewMode;
  setViewMode: (mode: ViewMode) => void;
  sortOrder: SortOrder;
  setSortOrder: (sort: SortOrder) => void;
  projectsViewMode: ViewMode;
  setProjectsViewMode: (mode: ViewMode) => void;
  projectsSortOrder: SortOrder;
  setProjectsSortOrder: (sort: SortOrder) => void;
}

export const useDashboardStore = create<DashboardState>()(
  persist(
    (set) => ({
      selectedProjectId: null,
      setSelectedProjectId: (id) => set({ selectedProjectId: id }),
      viewMode: 'grid',
      setViewMode: (mode) => set({ viewMode: mode }),
      sortOrder: 'last_edited',
      setSortOrder: (sort) => set({ sortOrder: sort }),
      projectsViewMode: 'grid',
      setProjectsViewMode: (mode) => set({ projectsViewMode: mode }),
      projectsSortOrder: 'last_edited',
      setProjectsSortOrder: (sort) => set({ projectsSortOrder: sort }),
    }),
    { name: 'dashboard' },
  ),
);
