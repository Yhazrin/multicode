import { describe, it, expect, vi, beforeEach } from "vitest";
import { useWorkspaceStore } from "../store";

// Mock dependencies
vi.mock("@/shared/api", () => {
  const mockApi = {
    setWorkspaceId: vi.fn(),
    listWorkspaces: vi.fn(),
    createWorkspace: vi.fn(),
    leaveWorkspace: vi.fn(),
    deleteWorkspace: vi.fn(),
  };
  return { api: mockApi };
});

vi.mock("@/features/issues", () => ({
  useIssueStore: {
    getState: () => ({
      setIssues: vi.fn(),
      issues: [],
    }),
  },
}));

vi.mock("@/features/inbox", () => ({
  useInboxStore: {
    getState: () => ({
      reset: vi.fn(),
    }),
  },
}));

vi.mock("sonner", () => ({ toast: { error: vi.fn() } }));

import { api } from "@/shared/api";

describe("workspace store", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    useWorkspaceStore.setState({
      workspace: null,
      workspaces: [],
      members: [],
      agents: [],
      skills: [],
    });
  });

  describe("hydrateWorkspace", () => {
    it("returns null when workspace list is empty", () => {
      const result = useWorkspaceStore.getState().hydrateWorkspace([]);
      expect(result).toBeNull();
      expect(useWorkspaceStore.getState().workspace).toBeNull();
      expect(api.setWorkspaceId).toHaveBeenCalledWith(null);
    });

    it("selects preferred workspace when available", () => {
      const workspaces = [
        { id: "ws-1", name: "First", slug: "first" },
        { id: "ws-2", name: "Second", slug: "second" },
      ] as any[];

      const result = useWorkspaceStore.getState().hydrateWorkspace(workspaces, "ws-2");

      expect(result?.id).toBe("ws-2");
      expect(api.setWorkspaceId).toHaveBeenCalledWith("ws-2");
      expect(localStorage.getItem("alphenix_workspace_id")).toBe("ws-2");
    });

    it("falls back to first workspace when preferred not found", () => {
      const workspaces = [
        { id: "ws-1", name: "First", slug: "first" },
      ] as any[];

      const result = useWorkspaceStore.getState().hydrateWorkspace(workspaces, "nonexistent");

      expect(result?.id).toBe("ws-1");
    });

    it("sets workspace state when workspace is selected", () => {
      const workspaces = [{ id: "ws-1", name: "WS", slug: "ws" }] as any[];

      const result = useWorkspaceStore.getState().hydrateWorkspace(workspaces);

      expect(result?.id).toBe("ws-1");
      expect(useWorkspaceStore.getState().workspace?.id).toBe("ws-1");
    });
  });

  describe("switchWorkspace", () => {
    it("clears stale data and re-hydrates", () => {
      const workspaces = [
        { id: "ws-1", name: "First", slug: "first" },
        { id: "ws-2", name: "Second", slug: "second" },
      ] as any[];

      useWorkspaceStore.setState({ workspaces });

      useWorkspaceStore.getState().switchWorkspace("ws-2");

      expect(api.setWorkspaceId).toHaveBeenCalledWith("ws-2");
      expect(localStorage.getItem("alphenix_workspace_id")).toBe("ws-2");
      expect(useWorkspaceStore.getState().workspace?.id).toBe("ws-2");
    });

    it("does nothing for unknown workspace ID", () => {
      useWorkspaceStore.setState({
        workspaces: [{ id: "ws-1", name: "First", slug: "first" }] as any[],
        workspace: { id: "ws-1" } as any,
      });

      useWorkspaceStore.getState().switchWorkspace("unknown");

      expect(useWorkspaceStore.getState().workspace?.id).toBe("ws-1");
    });
  });

  describe("clearWorkspace", () => {
    it("resets all state and clears localStorage", () => {
      localStorage.setItem("alphenix_workspace_id", "ws-1");
      useWorkspaceStore.setState({
        workspace: { id: "ws-1" } as any,
        workspaces: [{ id: "ws-1" }] as any[],
        members: [{ id: "m-1" }] as any[],
        agents: [{ id: "a-1" }] as any[],
        skills: [{ id: "s-1" }] as any[],
      });

      useWorkspaceStore.getState().clearWorkspace();

      expect(api.setWorkspaceId).toHaveBeenCalledWith(null);
      expect(localStorage.getItem("alphenix_workspace_id")).toBeNull();
      expect(useWorkspaceStore.getState().workspace).toBeNull();
      expect(useWorkspaceStore.getState().workspaces).toEqual([]);
      expect(useWorkspaceStore.getState().members).toEqual([]);
    });
  });

  describe("updateAgent", () => {
    it("updates agent by ID", () => {
      useWorkspaceStore.setState({
        agents: [
          { id: "a-1", name: "Old" },
          { id: "a-2", name: "Other" },
        ] as any[],
      });

      useWorkspaceStore.getState().updateAgent("a-1", { name: "New" } as any);

      const agents = useWorkspaceStore.getState().agents;
      expect(agents[0]!.name).toBe("New");
      expect(agents[1]!.name).toBe("Other");
    });
  });

  describe("upsertSkill", () => {
    it("inserts new skill when not found", () => {
      useWorkspaceStore.setState({ skills: [{ id: "s-1" }] as any[] });
      useWorkspaceStore.getState().upsertSkill({ id: "s-2" } as any);
      expect(useWorkspaceStore.getState().skills).toHaveLength(2);
    });

    it("updates existing skill", () => {
      useWorkspaceStore.setState({ skills: [{ id: "s-1", name: "Old" }] as any[] });
      useWorkspaceStore.getState().upsertSkill({ id: "s-1", name: "New" } as any);
      expect(useWorkspaceStore.getState().skills).toHaveLength(1);
      expect(useWorkspaceStore.getState().skills[0]!.name).toBe("New");
    });
  });

  describe("removeSkill", () => {
    it("removes skill by ID", () => {
      useWorkspaceStore.setState({
        skills: [{ id: "s-1" }, { id: "s-2" }] as any[],
      });
      useWorkspaceStore.getState().removeSkill("s-1");
      expect(useWorkspaceStore.getState().skills).toHaveLength(1);
      expect(useWorkspaceStore.getState().skills[0]!.id).toBe("s-2");
    });
  });
});
