import { Server, Clock } from "lucide-react";
import type { AgentRuntime } from "@/shared/types";
import { RuntimeModeIcon } from "./shared";

function RuntimeListItem({
  runtime,
  isSelected,
  onClick,
}: {
  runtime: AgentRuntime;
  isSelected: boolean;
  onClick: () => void;
}) {
  const isPending = runtime.approval_status === "pending";
  const isApproved = runtime.approval_status === "approved";

  return (
    <button
      onClick={onClick}
      className={`flex w-full items-center gap-3 px-4 py-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
        isSelected ? "bg-accent" : "hover:bg-accent/50"
      } ${isPending ? "opacity-60" : ""}`}
    >
      <div
        className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${
          runtime.status === "online" ? "bg-success/10" : "bg-muted"
        }`}
      >
        {isPending ? (
          <Clock className="h-4 w-4 text-warning" />
        ) : (
          <RuntimeModeIcon mode={runtime.runtime_mode} />
        )}
      </div>
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium">{runtime.name}</div>
        <div className="mt-0.5 truncate text-xs text-muted-foreground">
          {runtime.provider} &middot; {runtime.runtime_mode}
          {isPending && " &middot; Pending approval"}
        </div>
      </div>
      {isPending ? (
        <Clock className="h-3 w-3 shrink-0 text-warning" />
      ) : (
        <div
          className={`h-2 w-2 shrink-0 rounded-full ${
            runtime.status === "online" ? "bg-success" : "bg-muted-foreground/40"
          }`}
        />
      )}
    </button>
  );
}

export function RuntimeList({
  runtimes,
  selectedId,
  onSelect,
}: {
  runtimes: AgentRuntime[];
  selectedId: string;
  onSelect: (id: string) => void;
}) {
  return (
    <div className="overflow-y-auto h-full border-r">
      <div className="flex h-12 items-center justify-between border-b px-4">
        <h1 className="text-sm font-semibold">Runtimes</h1>
        <span className="text-xs text-muted-foreground">
          {runtimes.filter((r) => r.status === "online").length}/
          {runtimes.length} online
        </span>
      </div>
      {runtimes.length === 0 ? (
        <div className="flex flex-col items-center justify-center px-4 py-12">
          <Server className="h-8 w-8 text-muted-foreground/40" aria-hidden="true" />
          <p className="mt-3 text-sm text-muted-foreground">
            No runtimes registered
          </p>
          <p className="mt-1 text-xs text-muted-foreground text-center">
            Run{" "}
            <code className="rounded bg-muted px-1 py-0.5">
              multicode daemon start
            </code>{" "}
            to register a local runtime.
          </p>
        </div>
      ) : (
        <div className="divide-y">
          {runtimes.map((runtime) => (
            <RuntimeListItem
              key={runtime.id}
              runtime={runtime}
              isSelected={runtime.id === selectedId}
              onClick={() => onSelect(runtime.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
