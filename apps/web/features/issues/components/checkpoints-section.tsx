"use client";

import { CheckCircle2, Clock, FileText, AlertCircle } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { timeAgo } from "@/shared/utils";
import type { TaskCheckpoint } from "@/shared/types";
import { CollapsibleSection } from "./collapsible-section";

interface CheckpointsSectionProps {
  taskId: string;
  checkpoints: TaskCheckpoint[];
  cpsLoading: boolean;
  cpsError: string | null;
  checkpointsLoaded: boolean;
  onLoadCheckpoints: () => void;
  onSetCheckpointsLoaded: (loaded: boolean) => void;
}

export function CheckpointsSection({
  taskId,
  checkpoints,
  cpsLoading,
  cpsError,
  checkpointsLoaded,
  onLoadCheckpoints,
  onSetCheckpointsLoaded,
}: CheckpointsSectionProps) {
  return (
    <CollapsibleSection
      title="Checkpoints"
      icon={<CheckCircle2 className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />}
      count={checkpoints.length}
      onOpen={() => {
        if (!checkpointsLoaded) {
          onSetCheckpointsLoaded(true);
          onLoadCheckpoints();
        }
      }}
    >
      {cpsLoading ? (
        <div className="space-y-2">
          <Skeleton className="h-6 w-full" />
        </div>
      ) : cpsError ? (
        <div className="flex flex-col items-center gap-1.5 py-3 text-xs text-muted-foreground">
          <AlertCircle className="h-4 w-4 text-destructive" aria-hidden="true" />
          <span>Failed to load checkpoints</span>
          <span className="text-[10px] text-destructive">{cpsError}</span>
        </div>
      ) : checkpoints.length === 0 ? (
        <p className="text-xs text-muted-foreground py-1">No checkpoints saved.</p>
      ) : (
        <div className="space-y-1.5">
          {checkpoints.map((cp) => (
            <div key={cp.id} className="space-y-0.5">
              <div className="flex items-center gap-2 text-xs">
                <CheckCircle2 className="h-3 w-3 text-success shrink-0" aria-hidden="true" />
                <span className="font-medium truncate">{cp.label}</span>
                <span className="text-muted-foreground flex items-center gap-1">
                  <Clock className="h-2.5 w-2.5" aria-hidden="true" />
                  {timeAgo(cp.created_at)}
                </span>
              </div>
              {cp.files_changed && cp.files_changed.length > 0 && (
                <div className="ml-5 flex flex-wrap gap-x-2 gap-y-0.5">
                  {cp.files_changed.map((f) => (
                    <span key={f} className="inline-flex items-center gap-0.5 text-[10px] text-muted-foreground/70 font-mono">
                      <FileText className="h-2 w-2 shrink-0" aria-hidden="true" />
                      {f}
                    </span>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </CollapsibleSection>
  );
}
