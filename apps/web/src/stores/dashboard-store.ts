import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface DashboardState {
  selectedProjectId: string | null;
  setSelectedProjectId: (id: string | null) => void;
}

export const useDashboardStore = create<DashboardState>()(
  persist(
    (set) => ({
      selectedProjectId: null,
      setSelectedProjectId: (id) => set({ selectedProjectId: id }),
    }),
    { name: 'dashboard' },
  ),
);
