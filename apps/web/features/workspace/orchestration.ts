"use client";

import type { QueryClient } from "@tanstack/react-query";
import { issueKeys } from "@core/issues/queries";
import { inboxKeys } from "@core/inbox/queries";
import { workspaceKeys } from "@core/workspace/queries";

/**
 * Orchestrates query invalidation when workspace context changes.
 * TanStack Query handles caching - we just need to invalidate on workspace switch.
 */

/** Invalidates all cached data for a workspace. Called BEFORE workspace identity switches. */
export function resetStores(qc: QueryClient, wsId: string) {
  qc.invalidateQueries({ queryKey: issueKeys.all(wsId) });
  qc.invalidateQueries({ queryKey: inboxKeys.all(wsId) });
  qc.invalidateQueries({ queryKey: workspaceKeys.members(wsId) });
  qc.invalidateQueries({ queryKey: workspaceKeys.agents(wsId) });
  qc.invalidateQueries({ queryKey: workspaceKeys.skills(wsId) });
}
