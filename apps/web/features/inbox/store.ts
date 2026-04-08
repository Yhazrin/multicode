"use client";

import { create } from "zustand";
import type { InboxItem } from "@/shared/types";

interface InboxState {
  items: InboxItem[];
  loading: boolean;
  error: string | null;
  fetch: () => Promise<void>;
  reset: () => void;
  addItem: (item: InboxItem) => void;
  markRead: (itemId: string) => void;
  archive: (itemId: string) => void;
  markAllRead: () => void;
  archiveAll: () => void;
}

export const useInboxStore = create<InboxState>((set) => ({
  items: [],
  loading: false,
  error: null,

  fetch: async () => {
    // Note: This is a stub. The actual data fetching uses TanStack Query.
    // See @core/inbox for the proper implementation.
    set({ loading: true });
    set({ loading: false });
  },

  reset: () => set({ items: [], loading: false, error: null }),

  addItem: (item) =>
    set((state) => ({
      items: state.items.some((i) => i.id === item.id)
        ? state.items
        : [item, ...state.items],
    })),

  markRead: (itemId) =>
    set((state) => ({
      items: state.items.map((i) =>
        i.id === itemId ? { ...i, read_at: new Date().toISOString() } : i,
      ),
    })),

  archive: (itemId) =>
    set((state) => ({
      items: state.items.filter((i) => i.id !== itemId),
    })),

  markAllRead: () =>
    set((state) => ({
      items: state.items.map((i) => ({
        ...i,
        read_at: i.read_at ?? new Date().toISOString(),
      })),
    })),

  archiveAll: () => set({ items: [] }),
}));
