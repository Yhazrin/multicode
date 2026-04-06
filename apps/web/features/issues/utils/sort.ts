import type { Issue } from "@/shared/types";
import { PRIORITY_ORDER } from "@/features/issues/config";
import type { SortField, SortDirection } from "@/features/issues/stores/view-store";

const PRIORITY_RANK: Record<string, number> = Object.fromEntries(
  PRIORITY_ORDER.map((p, i) => [p, i])
);

export function sortIssues(
  issues: Issue[],
  field: SortField,
  direction: SortDirection
): Issue[] {
  const dir = direction === "desc" ? -1 : 1;
  const sorted = [...issues].sort((a, b) => {
    switch (field) {
      case "priority":
        return dir * (
          (PRIORITY_RANK[a.priority] ?? 99) -
          (PRIORITY_RANK[b.priority] ?? 99)
        );
      case "due_date": {
        // Nulls always sort to the end regardless of direction
        if (!a.due_date && !b.due_date) return 0;
        if (!a.due_date) return 1;
        if (!b.due_date) return -1;
        return dir * (
          new Date(a.due_date).getTime() - new Date(b.due_date).getTime()
        );
      }
      case "created_at":
        return dir * (
          new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
        );
      case "title":
        return dir * a.title.localeCompare(b.title);
      case "position":
      default:
        return dir * (a.position - b.position);
    }
  });
  return sorted;
}
