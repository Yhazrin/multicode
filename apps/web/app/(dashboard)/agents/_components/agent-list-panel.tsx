"use client";

import {
  Cloud,
  Monitor,
} from "lucide-react";
import type { Agent } from "@/shared/types";
import { ActorAvatar } from "@/components/common/actor-avatar";
import { statusConfig } from "./agent-configs";

export function AgentListItem({
  agent,
  isSelected,
  onClick,
}: {
  agent: Agent;
  isSelected: boolean;
  onClick: () => void;
}) {
  const st = statusConfig[agent.status];
  const isArchived = !!agent.archived_at;

  return (
    <button
      onClick={onClick}
      aria-current={isSelected ? "true" : undefined}
      className={`flex w-full items-center gap-3 px-4 py-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
        isSelected ? "bg-accent" : "hover:bg-accent/50"
      }`}
    >
      <ActorAvatar actorType="agent" actorId={agent.id} size={32} className={`rounded-lg ${isArchived ? "opacity-50 grayscale" : ""}`} />

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className={`truncate text-sm font-medium ${isArchived ? "text-muted-foreground" : ""}`}>{agent.name}</span>
          {agent.runtime_mode === "cloud" ? (
            <Cloud className="h-3 w-3 text-muted-foreground" aria-hidden="true" />
          ) : (
            <Monitor className="h-3 w-3 text-muted-foreground" aria-hidden="true" />
          )}
        </div>
        <div className="flex items-center gap-1.5 mt-0.5">
          {isArchived ? (
            <span className="text-xs text-muted-foreground">Archived</span>
          ) : (
            <>
              <span className={`h-1.5 w-1.5 rounded-full ${st.dot}`} />
              <span className={`text-xs ${st.color}`}>{st.label}</span>
            </>
          )}
        </div>
      </div>
    </button>
  );
}
