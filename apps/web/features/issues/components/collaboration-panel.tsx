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
  Brain,
  Trash2,
  Plus,
  X,
  Link2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ActorAvatar } from "@/components/common/actor-avatar";
import { api } from "@/shared/api";
import { useWorkspaceStore } from "@/features/workspace";
import { useWSEvent } from "@/features/realtime";
import type {
  AgentMessage,
  TaskDependency,
  TaskCheckpoint,
  AgentTask,
  AgentMemory,
} from "@/shared/types";
import type {
  AgentMessagePayload,
  TaskDependencyPayload,
  TaskCheckpointPayload,
} from "@/shared/types";
import { toast } from "sonner";

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
        aria-expanded={open}
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

function useAgentName(agentId: string): string {
  const agents = useWorkspaceStore((s) => s.agents);
  const agent = agents.find((a) => a.id === agentId);
  return agent?.name ?? `Agent ${agentId.slice(0, 8)}`;
}

function AgentLabel({ agentId }: { agentId: string }) {
  const name = useAgentName(agentId);
  return <span className="font-medium truncate">{name}</span>;
}

export function CollaborationPanel({ issueId }: CollaborationPanelProps) {
  const [activeTask, setActiveTask] = useState<AgentTask | null>(null);
  const [messages, setMessages] = useState<AgentMessage[]>([]);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [dependencies, setDependencies] = useState<TaskDependency[]>([]);
  const [depsLoading, setDepsLoading] = useState(false);
  const [checkpoints, setCheckpoints] = useState<TaskCheckpoint[]>([]);
  const [cpsLoading, setCpsLoading] = useState(false);
  const [memories, setMemories] = useState<AgentMemory[]>([]);
  const [memLoading, setMemLoading] = useState(false);
  const [replyText, setReplyText] = useState("");
  const [selectedAgentId, setSelectedAgentId] = useState<string>("");
  const [showAddDep, setShowAddDep] = useState(false);
  const [addDepTaskId, setAddDepTaskId] = useState("");
  const [memoryContent, setMemoryContent] = useState("");

  const agents = useWorkspaceStore((s) => s.agents);

  // Fetch active task on mount
  useEffect(() => {
    let cancelled = false;
    api.getActiveTaskForIssue(issueId).then(({ task }) => {
      if (!cancelled) {
        setActiveTask(task);
        if (task?.agent_id) setSelectedAgentId(task.agent_id);
      }
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
      toast.error("Failed to load messages");
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
      toast.error("Failed to load dependencies");
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
      toast.error("Failed to load checkpoints");
    } finally {
      setCpsLoading(false);
    }
  }, [taskId]);

  const loadMemories = useCallback(async () => {
    if (!agentId) return;
    setMemLoading(true);
    try {
      const data = await api.listAgentMemory(agentId);
      setMemories(data);
    } catch {
      toast.error("Failed to load memories");
    } finally {
      setMemLoading(false);
    }
  }, [agentId]);

  useEffect(() => {
    loadMessages();
    loadDependencies();
    loadCheckpoints();
    loadMemories();
  }, [loadMessages, loadDependencies, loadCheckpoints, loadMemories]);

  // --- Real-time updates ---
  useWSEvent("agent:message", () => {
    loadMessages();
  });

  useWSEvent("task_dep:created", () => {
    loadDependencies();
  });

  useWSEvent("task_dep:deleted", () => {
    loadDependencies();
  });

  useWSEvent("task:checkpoint", () => {
    loadCheckpoints();
  });

  useWSEvent("memory:stored", () => {
    loadMemories();
  });

  // --- Actions ---

  const handleSendMessage = async () => {
    if (!agentId || !replyText.trim() || !selectedAgentId) return;
    try {
      const msg = await api.sendAgentMessage(agentId, {
        to_agent_id: selectedAgentId,
        content: replyText.trim(),
        message_type: "info",
        task_id: taskId ?? undefined,
      });
      setMessages((prev) => [...prev, msg]);
      setReplyText("");
      toast.success("Message sent");
    } catch {
      toast.error("Failed to send message");
    }
  };

  const handleAddDependency = async () => {
    if (!taskId || !addDepTaskId.trim()) return;
    try {
      const dep = await api.addTaskDependency(taskId, {
        depends_on_task_id: addDepTaskId.trim(),
      });
      setDependencies((prev) => [...prev, dep]);
      setAddDepTaskId("");
      setShowAddDep(false);
      toast.success("Dependency added");
    } catch {
      toast.error("Failed to add dependency");
    }
  };

  const handleRemoveDependency = async (dependsOnId: string) => {
    if (!taskId) return;
    try {
      await api.removeTaskDependency(taskId, { depends_on_task_id: dependsOnId });
      setDependencies((prev) => prev.filter((d) => d.depends_on_id !== dependsOnId));
      toast.success("Dependency removed");
    } catch {
      toast.error("Failed to remove dependency");
    }
  };

  const handleStoreMemory = async () => {
    if (!agentId || !memoryContent.trim()) return;
    try {
      const mem = await api.storeAgentMemory(agentId, { content: memoryContent.trim() });
      setMemories((prev) => [...prev, mem]);
      setMemoryContent("");
      toast.success("Memory stored");
    } catch {
      toast.error("Failed to store memory");
    }
  };

  const handleDeleteMemory = async (memoryId: string) => {
    if (!agentId) return;
    try {
      await api.deleteAgentMemory(agentId, memoryId);
      setMemories((prev) => prev.filter((m) => m.id !== memoryId));
      toast.success("Memory deleted");
    } catch {
      toast.error("Failed to delete memory");
    }
  };

  // Don't render if no task context
  if (!taskId && !agentId) return null;

  const activeAgents = agents.filter((a) => !a.archived_at);

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
                      <AgentLabel agentId={msg.from_agent_id} />
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
          {/* Send message */}
          <div className="mt-2 space-y-1.5">
            <Select value={selectedAgentId} onValueChange={(v) => setSelectedAgentId(v ?? "")}>
              <SelectTrigger className="h-7 text-xs">
                <SelectValue placeholder="Select recipient..." />
              </SelectTrigger>
              <SelectContent>
                {activeAgents.map((a) => (
                  <SelectItem key={a.id} value={a.id} className="text-xs">
                    {a.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="flex gap-1.5">
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
                disabled={!replyText.trim() || !selectedAgentId}
              >
                <Send className="h-3.5 w-3.5" />
              </Button>
            </div>
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
          ) : dependencies.length === 0 && !showAddDep ? (
            <p className="text-xs text-muted-foreground py-1">No dependencies.</p>
          ) : (
            <div className="space-y-1.5">
              {dependencies.map((dep) => (
                <div key={`${dep.task_id}-${dep.depends_on_id}`} className="flex items-center gap-2 text-xs group">
                  <GitBranch className="h-3 w-3 text-muted-foreground shrink-0" />
                  <span className="font-mono truncate flex-1">
                    {dep.depends_on_id.slice(0, 8)}
                  </span>
                  <span className="text-muted-foreground">
                    {formatTime(dep.created_at)}
                  </span>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    className="h-5 w-5 p-0 opacity-0 group-hover:opacity-100 transition-opacity"
                    onClick={() => handleRemoveDependency(dep.depends_on_id)}
                  >
                    <X className="h-3 w-3" />
                  </Button>
                </div>
              ))}
            </div>
          )}
          {showAddDep ? (
            <div className="mt-2 flex gap-1.5">
              <Input
                value={addDepTaskId}
                onChange={(e) => setAddDepTaskId(e.target.value)}
                placeholder="Task ID..."
                className="h-8 text-xs"
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    handleAddDependency();
                  }
                  if (e.key === "Escape") {
                    setShowAddDep(false);
                    setAddDepTaskId("");
                  }
                }}
                autoFocus
              />
              <Button
                size="sm"
                variant="ghost"
                className="h-8 w-8 p-0 shrink-0"
                onClick={handleAddDependency}
                disabled={!addDepTaskId.trim()}
              >
                <Link2 className="h-3.5 w-3.5" />
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="h-8 w-8 p-0 shrink-0"
                onClick={() => { setShowAddDep(false); setAddDepTaskId(""); }}
              >
                <X className="h-3.5 w-3.5" />
              </Button>
            </div>
          ) : (
            <Button
              variant="ghost"
              size="sm"
              className="mt-1.5 h-6 text-xs text-muted-foreground w-full"
              onClick={() => setShowAddDep(true)}
            >
              <Plus className="h-3 w-3 mr-1" />
              Add dependency
            </Button>
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

      {/* Agent Memory */}
      {agentId && (
        <CollapsibleSection
          title="Memory"
          icon={<Brain className="h-3.5 w-3.5 text-muted-foreground" />}
          count={memories.length}
        >
          {memLoading ? (
            <div className="space-y-2">
              <Skeleton className="h-6 w-full" />
              <Skeleton className="h-6 w-full" />
            </div>
          ) : memories.length === 0 ? (
            <p className="text-xs text-muted-foreground py-1">No memories stored.</p>
          ) : (
            <div className="space-y-2 max-h-48 overflow-y-auto">
              {memories.map((mem) => (
                <div key={mem.id} className="group rounded-md border px-2 py-1.5">
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-xs text-muted-foreground flex-1 break-words">{mem.content}</p>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      className="h-5 w-5 p-0 opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
                      onClick={() => handleDeleteMemory(mem.id)}
                    >
                      <Trash2 className="h-3 w-3 text-destructive" />
                    </Button>
                  </div>
                  <div className="mt-1 flex items-center gap-2">
                    <span className="text-[10px] text-muted-foreground">
                      {formatTime(mem.created_at)}
                    </span>
                    {mem.similarity !== undefined && (
                      <Badge variant="outline" className="text-[9px] px-1 py-0">
                        {(mem.similarity * 100).toFixed(0)}% match
                      </Badge>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
          <div className="mt-2 flex gap-1.5">
            <Input
              value={memoryContent}
              onChange={(e) => setMemoryContent(e.target.value)}
              placeholder="Store a memory..."
              className="h-8 text-xs"
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  handleStoreMemory();
                }
              }}
            />
            <Button
              size="sm"
              variant="ghost"
              className="h-8 w-8 p-0 shrink-0"
              onClick={handleStoreMemory}
              disabled={!memoryContent.trim()}
            >
              <Plus className="h-3.5 w-3.5" />
            </Button>
          </div>
        </CollapsibleSection>
      )}
    </div>
  );
}
