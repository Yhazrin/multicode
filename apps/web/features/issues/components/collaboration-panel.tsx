"use client";

import { useState, useEffect, useCallback } from "react";
import {
  MessageSquare,
  GitBranch,
  CheckCircle2,
  Clock,
  ChevronDown,
  ChevronRight,
  Send,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { ActorAvatar } from "@/components/common/actor-avatar";
import { api } from "@/shared/api";
import type { AgentMessage, TaskDependency, TaskCheckpoint, AgentTask } from "@/shared/types";

interface CollaborationPanelProps {
  issueId: string;
}

interface SectionProps {
  title: string;
  icon: React.ReactNode;
  count?: number;
  defaultOpen?: boolean;
  children: React.ReactNode;
}

function CollapsibleSection({ title, icon, count, defaultOpen = false, children }: SectionProps) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className="rounded-lg border bg-card">
      <button
        className="flex w-full items-center gap-2 px-3 py-2 text-sm font-medium hover:bg-muted/50 transition-colors"
        onClick={() => setOpen(!open)}
      >
        {open ? (
          <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
        ) : (
          <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
        )}
        {icon}
        <span className="flex-1 text-left">{title}</span>
        {count !== undefined && count > 0 && (
          <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
            {count}
          </Badge>
        )}
      </button>
      {open && <div className="border-t px-3 py-2.5">{children}</div>}
    </div>
  );
}

function formatTime(ts: string): string {
  const d = new Date(ts);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return "just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffH = Math.floor(diffMin / 60);
  if (diffH < 24) return `${diffH}h ago`;
  return d.toLocaleDateString();
}

export function CollaborationPanel({ issueId }: CollaborationPanelProps) {
  const [activeTask, setActiveTask] = useState<AgentTask | null>(null);
  const [messages, setMessages] = useState<AgentMessage[]>([]);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [dependencies, setDependencies] = useState<TaskDependency[]>([]);
  const [depsLoading, setDepsLoading] = useState(false);
  const [checkpoints, setCheckpoints] = useState<TaskCheckpoint[]>([]);
  const [cpsLoading, setCpsLoading] = useState(false);
  const [replyText, setReplyText] = useState("");

  // Fetch active task on mount
  useEffect(() => {
    let cancelled = false;
    api.getActiveTaskForIssue(issueId).then(({ task }) => {
      if (!cancelled) setActiveTask(task);
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [issueId]);

  const taskId = activeTask?.id;
  const agentId = activeTask?.agent_id;

  const loadMessages = useCallback(async () => {
    if (!agentId) return;
    setMessagesLoading(true);
    try {
      const data = await api.listAgentMessages(agentId, taskId ? { task_id: taskId } : undefined);
      setMessages(data);
    } catch {
      // Collaboration endpoints may not be deployed yet
    } finally {
      setMessagesLoading(false);
    }
  }, [agentId, taskId]);

  const loadDependencies = useCallback(async () => {
    if (!taskId) return;
    setDepsLoading(true);
    try {
      const data = await api.listTaskDependencies(taskId);
      setDependencies(data);
    } catch {
      // Silently handle
    } finally {
      setDepsLoading(false);
    }
  }, [taskId]);

  const loadCheckpoints = useCallback(async () => {
    if (!taskId) return;
    setCpsLoading(true);
    try {
      const data = await api.listTaskCheckpoints(taskId);
      setCheckpoints(data);
    } catch {
      // Silently handle
    } finally {
      setCpsLoading(false);
    }
  }, [taskId]);

  useEffect(() => {
    loadMessages();
    loadDependencies();
    loadCheckpoints();
  }, [loadMessages, loadDependencies, loadCheckpoints]);

  const handleSendMessage = async () => {
    if (!agentId || !replyText.trim()) return;
    try {
      const msg = await api.sendAgentMessage(agentId, {
        to_agent_id: agentId,
        content: replyText.trim(),
        message_type: "info",
        task_id: taskId ?? undefined,
      });
      setMessages((prev) => [...prev, msg]);
      setReplyText("");
    } catch {
      // Silently handle
    }
  };

  // Don't render if no task context
  if (!taskId && !agentId) return null;

  return (
    <div className="flex flex-col gap-2.5">
      {/* Agent Messages */}
      {agentId && (
        <CollapsibleSection
          title="Agent Messages"
          icon={<MessageSquare className="h-3.5 w-3.5 text-muted-foreground" />}
          count={messages.length}
          defaultOpen={messages.length > 0}
        >
          {messagesLoading ? (
            <div className="space-y-2">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          ) : messages.length === 0 ? (
            <p className="text-xs text-muted-foreground py-1">No messages yet.</p>
          ) : (
            <div className="space-y-2 max-h-60 overflow-y-auto">
              {messages.map((msg) => (
                <div key={msg.id} className="flex items-start gap-2 text-xs">
                  <ActorAvatar actorType="agent" actorId={msg.from_agent_id} size={20} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="font-medium truncate">
                        Agent {msg.from_agent_id.slice(0, 8)}
                      </span>
                      <span className="text-muted-foreground">
                        {formatTime(msg.created_at)}
                      </span>
                      <Badge variant="outline" className="text-[9px] px-1 py-0">
                        {msg.message_type}
                      </Badge>
                    </div>
                    <p className="text-muted-foreground mt-0.5 break-words">{msg.content}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
          {/* Quick reply */}
          <div className="mt-2 flex gap-1.5">
            <Input
              value={replyText}
              onChange={(e) => setReplyText(e.target.value)}
              placeholder="Send a message to agents..."
              className="h-8 text-xs"
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  handleSendMessage();
                }
              }}
            />
            <Button
              size="sm"
              variant="ghost"
              className="h-8 w-8 p-0 shrink-0"
              onClick={handleSendMessage}
              disabled={!replyText.trim()}
            >
              <Send className="h-3.5 w-3.5" />
            </Button>
          </div>
        </CollapsibleSection>
      )}

      {/* Task Dependencies */}
      {taskId && (
        <CollapsibleSection
          title="Dependencies"
          icon={<GitBranch className="h-3.5 w-3.5 text-muted-foreground" />}
          count={dependencies.length}
        >
          {depsLoading ? (
            <div className="space-y-2">
              <Skeleton className="h-6 w-full" />
            </div>
          ) : dependencies.length === 0 ? (
            <p className="text-xs text-muted-foreground py-1">No dependencies.</p>
          ) : (
            <div className="space-y-1.5">
              {dependencies.map((dep) => (
                <div key={`${dep.task_id}-${dep.depends_on_id}`} className="flex items-center gap-2 text-xs">
                  <GitBranch className="h-3 w-3 text-muted-foreground shrink-0" />
                  <span className="font-mono truncate">
                    {dep.depends_on_id.slice(0, 8)}
                  </span>
                  <span className="text-muted-foreground">
                    {formatTime(dep.created_at)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </CollapsibleSection>
      )}

      {/* Task Checkpoints */}
      {taskId && (
        <CollapsibleSection
          title="Checkpoints"
          icon={<CheckCircle2 className="h-3.5 w-3.5 text-muted-foreground" />}
          count={checkpoints.length}
        >
          {cpsLoading ? (
            <div className="space-y-2">
              <Skeleton className="h-6 w-full" />
            </div>
          ) : checkpoints.length === 0 ? (
            <p className="text-xs text-muted-foreground py-1">No checkpoints saved.</p>
          ) : (
            <div className="space-y-1.5">
              {checkpoints.map((cp) => (
                <div key={cp.id} className="flex items-center gap-2 text-xs">
                  <CheckCircle2 className="h-3 w-3 text-success shrink-0" />
                  <span className="font-medium truncate">{cp.label}</span>
                  <span className="text-muted-foreground flex items-center gap-1">
                    <Clock className="h-2.5 w-2.5" />
                    {formatTime(cp.created_at)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </CollapsibleSection>
      )}
    </div>
  );
}
