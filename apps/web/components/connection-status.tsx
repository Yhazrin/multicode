"use client";

import { useConnectionState, ConnectionState } from "@/features/realtime";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";

const STATUS_CONFIG: Record<
  ConnectionState,
  { color: string; label: string; description: string }
> = {
  [ConnectionState.Idle]: {
    color: "bg-muted-foreground/40",
    label: "Idle",
    description: "Not connected",
  },
  [ConnectionState.Connecting]: {
    color: "bg-yellow-500",
    label: "Connecting",
    description: "Establishing connection...",
  },
  [ConnectionState.Connected]: {
    color: "bg-green-500",
    label: "Connected",
    description: "Real-time sync active",
  },
  [ConnectionState.Reconnecting]: {
    color: "bg-yellow-500 animate-pulse",
    label: "Reconnecting",
    description: "Connection lost, retrying...",
  },
  [ConnectionState.Failed]: {
    color: "bg-red-500",
    label: "Disconnected",
    description: "Unable to connect — refresh to retry",
  },
  [ConnectionState.Unauthorized]: {
    color: "bg-red-500",
    label: "Session expired",
    description: "Please log in again",
  },
  [ConnectionState.Closed]: {
    color: "bg-muted-foreground/40",
    label: "Offline",
    description: "Connection closed",
  },
};

export function ConnectionStatus() {
  const state = useConnectionState();
  const config = STATUS_CONFIG[state];

  return (
    <Tooltip>
      <TooltipTrigger className="flex items-center gap-1.5 rounded px-1.5 py-0.5 text-xs text-muted-foreground hover:bg-accent/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
        <span
          className={`inline-block size-2 rounded-full ${config.color}`}
          aria-hidden="true"
        />
        <span className="hidden sm:inline">{config.label}</span>
      </TooltipTrigger>
      <TooltipContent side="right">
        <p>{config.description}</p>
      </TooltipContent>
    </Tooltip>
  );
}
