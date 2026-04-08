"use client";

import { create } from "zustand";
import type { AgentRuntime } from "@/shared/types";

interface RuntimeState {
  runtimes: AgentRuntime[];
  selectedId: string | null;
  fetching: boolean;
  error: string | null;
  fetchRuntimes: () => Promise<void>;
  setSelectedId: (id: string | null) => void;
  patchRuntime: (id: string, updates: Partial<AgentRuntime>) => void;
}

export const useRuntimeStore = create<RuntimeState>((set) => ({
  runtimes: [],
  selectedId: null,
  fetching: false,
  error: null,

  fetchRuntimes: async () => {
    set({ fetching: true, error: null });
    // Note: This is a stub. The actual data fetching should use TanStack Query.
    // Runtimes are now managed via @core/runtimes/queries.ts
    set({ fetching: false });
  },

  setSelectedId: (id) => set({ selectedId: id }),

  patchRuntime: (id, updates) =>
    set((state) => ({
      runtimes: state.runtimes.map((r) =>
        r.id === id ? { ...r, ...updates } : r,
      ),
    })),
}));
