import { create } from 'zustand';
import { ConjunctionEvent } from '@/lib/types/orbits';

export type FilterTier = 'all' | 'critical' | 'high' | 'moderate' | 'low';

interface AppState {
  activeEvent: ConjunctionEvent | null;
  setActiveEvent: (event: ConjunctionEvent | null) => void;
  
  lastRefreshTime: Date | null;
  setLastRefreshTime: (date: Date) => void;
  
  filterTier: FilterTier;
  setFilterTier: (tier: FilterTier) => void;

  isDemoMode: boolean;
  setDemoMode: (val: boolean) => void;

  timeCursorIndex: number | null;
  setTimeCursorIndex: (idx: number | null) => void;
}

export const useAppStore = create<AppState>((set) => ({
  activeEvent: null,
  setActiveEvent: (event) => set({ activeEvent: event }),
  
  lastRefreshTime: null,
  setLastRefreshTime: (date) => set({ lastRefreshTime: date }),
  
  filterTier: 'all',
  setFilterTier: (tier) => set({ filterTier: tier }),
  
  isDemoMode: false,
  setDemoMode: (val) => set({ isDemoMode: val }),

  timeCursorIndex: null,
  setTimeCursorIndex: (idx) => set({ timeCursorIndex: idx })
}));
