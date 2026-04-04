"use client";

import { create } from "zustand";
import type { InboxItem, IssueStatus } from "@/shared/types";
import { toast } from "sonner";
import { api } from "@/shared/api";
import { createLogger } from "@/shared/logger";

const logger = createLogger("inbox-store");

/**
 * Deduplicate inbox items by issue_id (one entry per issue, Linear-style),
 * keep latest, sort by time DESC.
 */
function deduplicateInboxItems(items: InboxItem[]): InboxItem[] {
  const active = items.filter((i) => !i.archived);
  const groups = new Map<string, InboxItem[]>();
  active.forEach((item) => {
    const key = item.issue_id ?? item.id;
    const group = groups.get(key) ?? [];
    group.push(item);
    groups.set(key, group);
  });
  const merged: InboxItem[] = [];
  groups.forEach((group) => {
    const sorted = group.sort(
      (a, b) =>
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
    );
    if (sorted[0]) merged.push(sorted[0]);
  });
  return merged.sort(
    (a, b) =>
      new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
  );
}

interface InboxState {
  items: InboxItem[];
  loading: boolean;
  dedupedItems: InboxItem[];
  unreadCount: number;
  fetch: () => Promise<void>;
  setItems: (items: InboxItem[]) => void;
  addItem: (item: InboxItem) => void;
  markRead: (id: string) => void;
  archive: (id: string) => void;
  markAllRead: () => void;
  archiveAll: () => void;
  archiveAllRead: () => void;
  updateIssueStatus: (issueId: string, status: IssueStatus) => void;
}

export const useInboxStore = create<InboxState>((set, get) => ({
  items: [],
  loading: true,
  dedupedItems: [],
  unreadCount: 0,

  fetch: async () => {
    logger.debug("fetch start");
    const isInitialLoad = get().items.length === 0;
    if (isInitialLoad) set({ loading: true });
    try {
      const data = await api.listInbox();
      logger.info("fetched", data.length, "items");
      const deduped = deduplicateInboxItems(data);
      set({ items: data, loading: false, dedupedItems: deduped, unreadCount: deduped.filter((i) => !i.read).length });
    } catch (err) {
      logger.error("fetch failed", err);
      toast.error("Failed to load inbox");
      if (isInitialLoad) set({ loading: false });
    }
  },

  setItems: (items) => {
    const deduped = deduplicateInboxItems(items);
    set({ items, dedupedItems: deduped, unreadCount: deduped.filter((i) => !i.read).length });
  },
  addItem: (item) =>
    set((s) => {
      const items = s.items.some((i) => i.id === item.id)
        ? s.items
        : [item, ...s.items];
      const deduped = deduplicateInboxItems(items);
      return { items, dedupedItems: deduped, unreadCount: deduped.filter((i) => !i.read).length };
    }),
  markRead: (id) =>
    set((s) => {
      const items = s.items.map((i) => (i.id === id ? { ...i, read: true } : i));
      const deduped = deduplicateInboxItems(items);
      return { items, dedupedItems: deduped, unreadCount: deduped.filter((i) => !i.read).length };
    }),
  archive: (id) =>
    set((s) => {
      const target = s.items.find((i) => i.id === id);
      const issueId = target?.issue_id;
      const items = s.items.map((i) =>
        i.id === id || (issueId && i.issue_id === issueId)
          ? { ...i, archived: true }
          : i,
      );
      const deduped = deduplicateInboxItems(items);
      return { items, dedupedItems: deduped, unreadCount: deduped.filter((i) => !i.read).length };
    }),
  markAllRead: () =>
    set((s) => {
      const items = s.items.map((i) => (!i.archived ? { ...i, read: true } : i));
      const deduped = deduplicateInboxItems(items);
      return { items, dedupedItems: deduped, unreadCount: deduped.filter((i) => !i.read).length };
    }),
  archiveAll: () =>
    set((s) => {
      const items = s.items.map((i) => (!i.archived ? { ...i, archived: true } : i));
      const deduped = deduplicateInboxItems(items);
      return { items, dedupedItems: deduped, unreadCount: deduped.filter((i) => !i.read).length };
    }),
  archiveAllRead: () =>
    set((s) => {
      const items = s.items.map((i) =>
        i.read && !i.archived ? { ...i, archived: true } : i
      );
      const deduped = deduplicateInboxItems(items);
      return { items, dedupedItems: deduped, unreadCount: deduped.filter((i) => !i.read).length };
    }),
  updateIssueStatus: (issueId, status) =>
    set((s) => ({
      items: s.items.map((i) =>
        i.issue_id === issueId ? { ...i, issue_status: status } : i
      ),
    })),
}));
