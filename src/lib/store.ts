import { create } from 'zustand';
import { ConjunctionEvent } from '@/lib/types/orbits';

export type FilterTier = 'all' | 'critical' | 'high' | 'moderate' | 'low';
export type FilterTime = 'all' | '6h' | '12h' | '24h';

interface AppState {
  activeEvent: ConjunctionEvent | null;
  setActiveEvent: (event: ConjunctionEvent | null) => void;
  
  lastRefreshTime: Date | null;
  setLastRefreshTime: (date: Date) => void;
  
  filterTier: FilterTier;
  setFilterTier: (tier: FilterTier) => void;
  
  filterTime: FilterTime;
  setFilterTime: (time: FilterTime) => void;

  isDemoMode: boolean;
  setDemoMode: (val: boolean) => void;
}

export const useAppStore = create<AppState>((set) => ({
  activeEvent: null,
  setActiveEvent: (event) => set({ activeEvent: event }),
  
  lastRefreshTime: null,
  setLastRefreshTime: (date) => set({ lastRefreshTime: date }),
  
  filterTier: 'all',
  setFilterTier: (tier) => set({ filterTier: tier }),
  
  filterTime: 'all',
  setFilterTime: (time) => set({ filterTime: time }),
  
  isDemoMode: false,
  setDemoMode: (val) => set({ isDemoMode: val })
}));
