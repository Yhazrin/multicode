"use client";

import { useState, useEffect } from "react";
import {
  Cloud,
  Monitor,
  Globe,
  Lock,
  ChevronDown,
} from "lucide-react";
import type {
  AgentVisibility,
  CreateAgentRequest,
  RuntimeDevice,
} from "@/shared/types";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
} from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { generateId } from "./agent-configs";

export function CreateAgentDialog({
  runtimes,
  onClose,
  onCreate,
}: {
  runtimes: RuntimeDevice[];
  onClose: () => void;
  onCreate: (data: CreateAgentRequest) => Promise<void>;
}) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [selectedRuntimeId, setSelectedRuntimeId] = useState(runtimes[0]?.id ?? "");
  const [visibility, setVisibility] = useState<AgentVisibility>("private");
  const [creating, setCreating] = useState(false);
  const [runtimeOpen, setRuntimeOpen] = useState(false);

  useEffect(() => {
    if (!selectedRuntimeId && runtimes[0]) {
      setSelectedRuntimeId(runtimes[0].id);
    }
  }, [runtimes, selectedRuntimeId]);

  const selectedRuntime = runtimes.find((d) => d.id === selectedRuntimeId) ?? null;

  const handleSubmit = async () => {
    if (!name.trim() || !selectedRuntime) return;
    setCreating(true);
    try {
      await onCreate({
        name: name.trim(),
        description: description.trim(),
        runtime_id: selectedRuntime.id,
        visibility,
        triggers: [
          { id: generateId(), type: "on_assign", enabled: true, config: {} },
          { id: generateId(), type: "on_comment", enabled: true, config: {} },
        ],
      });
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to create agent");
      setCreating(false);
    }
  };

  return (
    <Dialog open onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Create Agent</DialogTitle>
          <DialogDescription>
            Create a new AI agent for your workspace.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <Label htmlFor="agent-name" className="text-xs text-muted-foreground">Name</Label>
            <Input
              id="agent-name"
              autoFocus
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Deep Research Agent"
              className="mt-1"
              onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
            />
          </div>

          <div>
            <Label htmlFor="agent-description" className="text-xs text-muted-foreground">Description</Label>
            <Input
              id="agent-description"
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What does this agent do?"
              className="mt-1"
            />
          </div>

          <div>
            <Label className="text-xs text-muted-foreground">Visibility</Label>
            <div className="mt-1.5 flex gap-2">
              <button
                type="button"
                onClick={() => setVisibility("workspace")}
                aria-pressed={visibility === "workspace"}
                className={`flex flex-1 items-center gap-2 rounded-lg border px-3 py-2.5 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                  visibility === "workspace"
                    ? "border-primary bg-primary/5"
                    : "border-border hover:bg-muted"
                }`}
              >
                <Globe className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                <div className="text-left">
                  <div className="font-medium">Workspace</div>
                  <div className="text-xs text-muted-foreground">All members can assign</div>
                </div>
              </button>
              <button
                type="button"
                onClick={() => setVisibility("private")}
                aria-pressed={visibility === "private"}
                className={`flex flex-1 items-center gap-2 rounded-lg border px-3 py-2.5 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                  visibility === "private"
                    ? "border-primary bg-primary/5"
                    : "border-border hover:bg-muted"
                }`}
              >
                <Lock className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                <div className="text-left">
                  <div className="font-medium">Private</div>
                  <div className="text-xs text-muted-foreground">Only you can assign</div>
                </div>
              </button>
            </div>
          </div>

          <div>
            <Label className="text-xs text-muted-foreground">Runtime</Label>
            <Popover open={runtimeOpen} onOpenChange={setRuntimeOpen}>
              <PopoverTrigger
                disabled={runtimes.length === 0}
                className="flex w-full items-center gap-3 rounded-lg border border-border bg-background px-3 py-2.5 mt-1.5 text-left text-sm transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50"
              >
                {selectedRuntime?.runtime_mode === "cloud" ? (
                  <Cloud className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                ) : (
                  <Monitor className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                )}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate font-medium">
                      {selectedRuntime?.name ?? "No runtime available"}
                    </span>
                    {selectedRuntime?.runtime_mode === "cloud" && (
                      <span className="shrink-0 rounded bg-info/10 px-1.5 py-0.5 text-xs font-medium text-info">
                        Cloud
                      </span>
                    )}
                  </div>
                  <div className="truncate text-xs text-muted-foreground">
                    {selectedRuntime?.device_info ?? "Register a runtime before creating an agent"}
                  </div>
                </div>
                <ChevronDown className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform ${runtimeOpen ? "rotate-180" : ""}`} aria-hidden="true" />
              </PopoverTrigger>
              <PopoverContent align="start" className="w-[var(--anchor-width)] p-1 max-h-60 overflow-y-auto">
                {runtimes.map((device) => (
                  <button
                    key={device.id}
                    onClick={() => {
                      setSelectedRuntimeId(device.id);
                      setRuntimeOpen(false);
                    }}
                    className={`flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-left text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                      device.id === selectedRuntimeId ? "bg-accent" : "hover:bg-accent/50"
                    }`}
                  >
                    {device.runtime_mode === "cloud" ? (
                      <Cloud className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                    ) : (
                      <Monitor className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="truncate font-medium">{device.name}</span>
                        {device.runtime_mode === "cloud" && (
                          <span className="shrink-0 rounded bg-info/10 px-1.5 py-0.5 text-xs font-medium text-info">
                            Cloud
                          </span>
                        )}
                      </div>
                      <div className="truncate text-xs text-muted-foreground">{device.device_info}</div>
                    </div>
                    <span
                      className={`h-2 w-2 shrink-0 rounded-full ${
                        device.status === "online" ? "bg-success" : "bg-muted-foreground/40"
                      }`}
                    />
                  </button>
                ))}
              </PopoverContent>
            </Popover>
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={creating || !name.trim() || !selectedRuntime}
          >
            {creating ? "Creating..." : "Create"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
