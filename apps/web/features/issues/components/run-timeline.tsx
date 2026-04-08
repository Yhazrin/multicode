"use client";

import { useState } from "react";
import {
  ChevronRight,
  Clock,
  FileText,
  CheckCircle2,
  XCircle,
  Circle,
  Loader2,
  ListTodo,
  Wrench,
  AlertCircle,
} from "lucide-react";
import type { Run, RunStep, RunTodo } from "@/shared/types";
import { useRunTimeline } from "../hooks/use-run-timeline";
import { cn } from "@/lib/utils";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Badge } from "@/components/ui/badge";

// ─── RunTimeline (main container) ──────────────────────────────────────────

interface RunTimelineProps {
  issueId: string;
}

export function RunTimeline({ issueId }: RunTimelineProps) {
  const { runs, stepsByRun, todosByRun, loading, error } = useRunTimeline(issueId);
  const [open, setOpen] = useState(false);

  if (loading) return null;

  if (error) {
    return (
      <div className="flex items-center gap-2 rounded border border-dashed px-3 py-2 text-xs text-destructive">
        <AlertCircle className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        {error}
      </div>
    );
  }

  if (runs.length === 0) return null;

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger className="flex w-full items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors py-1">
        <ChevronRight
          className={cn("h-3 w-3 transition-transform", open && "rotate-90")}
        />
        <Clock className="h-3 w-3" />
        <span>Agent runs ({runs.length})</span>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="mt-1 space-y-2">
          {runs.map((run) => (
            <RunEntry
              key={run.id}
              run={run}
              steps={stepsByRun.get(run.id) ?? []}
              todos={todosByRun.get(run.id) ?? []}
            />
          ))}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

// ─── RunEntry (single run with expandable details) ─────────────────────────

function RunEntry({
  run,
  steps,
  todos,
}: {
  run: Run;
  steps: RunStep[];
  todos: RunTodo[];
}) {
  const [open, setOpen] = useState(false);

  const duration =
    run.started_at && run.completed_at
      ? formatRunDuration(run.started_at, run.completed_at)
      : null;

  const totalTokens = run.input_tokens + run.output_tokens;
  const isActive = run.phase === "planning" || run.phase === "executing" || run.phase === "reviewing";
  const isTerminal = run.phase === "completed" || run.phase === "failed" || run.phase === "cancelled";

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger
        className={cn(
          "flex w-full items-center gap-2 rounded-lg px-3 py-2 text-xs transition-all",
          // Base card style
          "border bg-card hover:bg-accent/20",
          // Active runs: animated glow
          isActive && "active-run-card",
          // Terminal runs: muted styling
          isTerminal && run.phase === "completed" && "border-border/60 opacity-80",
          isTerminal && run.phase === "failed" && "border-destructive/30 opacity-80",
          isTerminal && run.phase === "cancelled" && "border-muted opacity-60",
          // Inactive pending
          run.phase === "pending" && "border-border/40 opacity-60",
          open && !isActive && "bg-accent/10",
        )}
      >
        <ChevronRight
          className={cn(
            "h-3 w-3 shrink-0 text-muted-foreground transition-transform",
            open && "rotate-90",
          )}
        />
        <RunPhaseIcon phase={run.phase} isActive={isActive} />
        <span className={cn(
          "min-w-[90px]",
          isActive ? "text-foreground font-medium" : "text-muted-foreground"
        )}>
          {(() => { const d = new Date(run.created_at); return isNaN(d.getTime()) ? "\u2014" : d.toLocaleString(undefined, {
            month: "short",
            day: "numeric",
            hour: "2-digit",
            minute: "2-digit",
          })})()}
        </span>
        {duration && (
          <span className="text-muted-foreground">{duration}</span>
        )}
        {run.model_name && (
          <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4 text-muted-foreground">
            {run.model_name}
          </Badge>
        )}
        {totalTokens > 0 && (
          <span className="text-[10px] text-muted-foreground ml-auto">
            {totalTokens.toLocaleString()} tokens
          </span>
        )}
        <RunPhaseBadge phase={run.phase} />
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="mt-1 ml-2 space-y-1.5 pl-3 border-l border-border/40">
          {/* Token usage summary */}
          {totalTokens > 0 && (
            <div className="flex items-center gap-3 text-[10px] text-muted-foreground px-2">
              <span>{totalTokens.toLocaleString()} tokens</span>
              {run.estimated_cost_usd > 0 && (
                <span>${run.estimated_cost_usd.toFixed(4)}</span>
              )}
            </div>
          )}

          {/* System prompt */}
          {run.system_prompt && (
            <RunSystemPrompt prompt={run.system_prompt} />
          )}

          {/* Steps */}
          {steps.length > 0 && (
            <RunStepLog steps={steps} />
          )}

          {/* Todos */}
          {todos.length > 0 && (
            <RunTodoList todos={todos} />
          )}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

// ─── RunStepLog (tool invocation steps) ────────────────────────────────────

function RunStepLog({ steps }: { steps: RunStep[] }) {
  const [open, setOpen] = useState(true);
  const hasActive = steps.some(s => !s.completed_at && !s.is_error);

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger
        className={cn(
          "flex items-center gap-2 text-[11px] rounded-lg px-3 py-1.5 w-full transition-all border",
          "hover:bg-accent/20",
          hasActive
            ? "border-info/30 text-foreground"
            : "border-border/40 text-muted-foreground",
        )}
      >
        <ChevronRight
          className={cn("h-3 w-3 transition-transform", open && "rotate-90")}
        />
        <Wrench className="h-3 w-3" />
        <span className="font-medium">Steps</span>
        <span className="text-muted-foreground">({steps.length})</span>
        {hasActive && (
          <span className="ml-auto relative flex h-1.5 w-1.5">
            <span className="absolute inline-flex h-full w-full rounded-full bg-info opacity-75 animate-ping" />
            <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-info" />
          </span>
        )}
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="mt-1 ml-2 pl-3 border-l border-border/40 space-y-1 max-h-48 overflow-y-auto">
          {steps.map((step, idx) => {
            const isRunning = !step.completed_at && !step.is_error;
            const isError = step.is_error;
            return (
              <div
                key={step.id ?? idx}
                className={cn(
                  "flex items-center gap-2 text-[11px] rounded-md px-2 py-1",
                  "border",
                  isRunning && "border-info/20 bg-info/5",
                  isError && "border-destructive/20 bg-destructive/5",
                  step.completed_at && !isError && "border-transparent",
                  !step.completed_at && !isError && !isRunning && "border-border/30",
                )}
              >
                {isError ? (
                  <AlertCircle className="h-3 w-3 shrink-0 text-destructive" />
                ) : step.completed_at ? (
                  <CheckCircle2 className="h-3 w-3 shrink-0 text-success" />
                ) : (
                  <Loader2 className="h-3 w-3 shrink-0 animate-spin text-info" />
                )}
                <span className={cn(
                  "font-mono",
                  isRunning ? "text-foreground" : "text-muted-foreground"
                )}>
                  {step.tool_name}
                </span>
                {step.tool_output && step.completed_at && (
                  <span className="text-muted-foreground truncate max-w-[200px]">
                    {truncate(step.tool_output, 80)}
                  </span>
                )}
              </div>
            );
          })}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

// ─── RunTodoList (agent todo items) ────────────────────────────────────────

function RunTodoList({ todos }: { todos: RunTodo[] }) {
  const [open, setOpen] = useState(true);
  const completedCount = todos.filter((t) => t.status === "completed").length;
  const hasBlocked = todos.some((t) => t.status === "blocked");
  const hasInProgress = todos.some((t) => t.status === "in_progress");

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger
        className={cn(
          "flex items-center gap-2 text-[11px] rounded-lg px-3 py-1.5 w-full transition-all border",
          "hover:bg-accent/20",
          hasBlocked
            ? "border-destructive/30 text-foreground"
            : hasInProgress
              ? "border-info/30 text-foreground"
              : "border-border/40 text-muted-foreground",
        )}
      >
        <ChevronRight
          className={cn("h-3 w-3 transition-transform", open && "rotate-90")}
        />
        <ListTodo className="h-3 w-3" />
        <span className="font-medium">Todos</span>
        <span className="text-muted-foreground">
          ({completedCount}/{todos.length})
        </span>
        {hasBlocked && (
          <AlertCircle className="h-3 w-3 text-destructive ml-auto" />
        )}
        {hasInProgress && !hasBlocked && (
          <span className="ml-auto relative flex h-1.5 w-1.5">
            <span className="absolute inline-flex h-full w-full rounded-full bg-info opacity-75 animate-ping" />
            <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-info" />
          </span>
        )}
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="mt-1 ml-2 pl-3 border-l border-border/40 space-y-1">
          {todos.map((todo) => (
            <div
              key={todo.id}
              className={cn(
                "flex items-start gap-2 text-[11px] rounded-md px-3 py-1.5 border",
                todo.status === "completed" && "border-transparent bg-transparent",
                todo.status === "in_progress" && "border-info/20 bg-info/5",
                todo.status === "blocked" && "border-destructive/20 bg-destructive/5",
                todo.status === "pending" && "border-border/30",
              )}
            >
              <TodoStatusIcon status={todo.status} />
              <div className="min-w-0 flex-1">
                <span
                  className={cn(
                    todo.status === "completed" && "line-through text-muted-foreground",
                    todo.status === "blocked" && "text-destructive",
                  )}
                >
                  {todo.title}
                </span>
                {todo.description && (
                  <p className="text-muted-foreground/70 text-[10px] mt-0.5 leading-snug">
                    {todo.description}
                  </p>
                )}
                {todo.blocker && (
                  <p className="text-destructive text-[10px] mt-0.5">
                    Blocked: {todo.blocker}
                  </p>
                )}
              </div>
            </div>
          ))}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

// ─── RunSystemPrompt (expandable system prompt view) ────────────────────────

function RunSystemPrompt({ prompt }: { prompt: string }) {
  const [open, setOpen] = useState(false);
  const preview = truncate(prompt, 100);

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger
        className={cn(
          "flex items-center gap-2 text-[11px] rounded-lg px-3 py-1.5 w-full transition-all border",
          "hover:bg-accent/20 border-border/40 text-muted-foreground",
        )}
      >
        <ChevronRight
          className={cn("h-3 w-3 transition-transform", open && "rotate-90")}
        />
        <FileText className="h-3 w-3" />
        <span>System prompt</span>
        {!open && (
          <span className="text-muted-foreground/50 truncate max-w-[200px]">
            — {preview}
          </span>
        )}
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="mt-1 ml-2 pl-3 border-l border-border/40 rounded-md border bg-muted/20 px-3 py-2 max-h-48 overflow-y-auto">
          <pre className="text-[11px] text-foreground whitespace-pre-wrap break-words font-mono">
            {prompt}
          </pre>
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

// ─── Helpers ───────────────────────────────────────────────────────────────

function RunPhaseIcon({ phase, isActive }: { phase: Run["phase"]; isActive?: boolean }) {
  switch (phase) {
    case "pending":
      return <Circle className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />;
    case "planning":
    case "executing":
    case "reviewing":
      return (
        <span className="relative flex h-3.5 w-3.5 shrink-0 items-center justify-center">
          {/* Pulse ring for active runs */}
          {isActive && (
            <span className="absolute inline-flex h-full w-full rounded-full bg-info/30 animate-ping" />
          )}
          <Loader2 className={cn("h-3.5 w-3.5 shrink-0 animate-spin text-info relative z-10", isActive && "text-info")} />
        </span>
      );
    case "completed":
      return <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-success" />;
    case "failed":
      return <XCircle className="h-3.5 w-3.5 shrink-0 text-destructive" />;
    case "cancelled":
      return <XCircle className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />;
    default:
      return <Circle className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />;
  }
}

function RunPhaseBadge({ phase }: { phase: Run["phase"] }) {
  const isActive = phase === "planning" || phase === "executing" || phase === "reviewing";

  if (isActive) {
    return (
      <span className="inline-flex items-center gap-1 text-[10px] text-info font-medium">
        <span className="relative flex h-1.5 w-1.5">
          <span className="absolute inline-flex h-full w-full rounded-full bg-info opacity-75 animate-ping" />
          <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-info" />
        </span>
        {phase}
      </span>
    );
  }

  const variant =
    phase === "completed"
      ? "secondary"
      : phase === "failed"
        ? "destructive"
        : "secondary";

  return (
    <Badge variant={variant} className="text-[10px] px-1.5 py-0 h-4 capitalize">
      {phase}
    </Badge>
  );
}

function TodoStatusIcon({ status }: { status: RunTodo["status"] }) {
  switch (status) {
    case "completed":
      return <CheckCircle2 className="h-3 w-3 shrink-0 text-success mt-0.5" />;
    case "in_progress":
      return <Loader2 className="h-3 w-3 shrink-0 animate-spin text-info mt-0.5" />;
    case "blocked":
      return <AlertCircle className="h-3 w-3 shrink-0 text-destructive mt-0.5" />;
    default:
      return <Circle className="h-3 w-3 shrink-0 text-muted-foreground mt-0.5" />;
  }
}

function formatRunDuration(start: string, end: string): string {
  const ms = new Date(end).getTime() - new Date(start).getTime();
  if (isNaN(ms)) return "---";
  if (ms < 1000) return `${ms}ms`;
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  if (minutes < 60) return `${minutes}m ${remainingSeconds}s`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ${minutes % 60}m`;
}

function truncate(str: string, maxLen: number): string {
  if (str.length <= maxLen) return str;
  return str.slice(0, maxLen) + "...";
}
