import { create } from 'zustand';
import type { Session } from '@/lib/types';

interface SessionsState {
  sessions: Session[];
  lastPolledAt: string | null;
  isPolling: boolean;
  setSessions: (sessions: Session[]) => void;
  setPolling: (polling: boolean) => void;
  setLastPolledAt: (time: string) => void;
}

export const useSessionsStore = create<SessionsState>((set) => ({
  sessions: [],
  lastPolledAt: null,
  isPolling: false,
  setSessions: (sessions) => set({ sessions }),
  setPolling: (isPolling) => set({ isPolling }),
  setLastPolledAt: (lastPolledAt) => set({ lastPolledAt }),
}));
