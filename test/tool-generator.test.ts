import { afterEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import type { SOPDefinition } from "../src/types";
import {
  buildAgentPrompt,
  clearCache,
  createAllTools,
  createTool,
  getOrCreateAgent,
} from "../src/tool-generator";

// Mock the @strands-agents/sdk module
vi.mock("@strands-agents/sdk", () => {
  // Create a proper class for Agent
  class MockAgent {
    systemPrompt: string;
    tools: unknown[];
    
    constructor(config: { systemPrompt?: string; tools?: unknown[] }) {
      this.systemPrompt = config.systemPrompt || "";
      this.tools = config.tools || [];
    }
    
    async invoke(_prompt: string) {
      return {
        lastMessage: {
          content: [{ type: "textBlock", text: "Mock response" }],
        },
      };
    }
  }

  return {
    Agent: MockAgent,
    tool: vi.fn().mockImplementation((config) => ({
      name: config.name,
      description: config.description,
      toolSpec: {
        name: config.name,
        description: config.description,
        inputSchema: config.inputSchema,
      },
      invoke: config.callback,
      stream: vi.fn(),
    })),
  };
});

function createMockSOP(overrides: Partial<SOPDefinition> = {}): SOPDefinition {
  return {
    name: "test-agent",
    description: "A test agent for unit testing",
    version: "1.0.0",
    tools: [],
    inputs: {},
    body: "# Test Agent\n\nYou are a test agent.",
    filepath: "test/fixtures/sops/test-agent.md",
    type: "agent",
    zodSchema: z.object({
      task: z.string().describe("The specific task to perform"),
    }),
    ...overrides,
  };
}

describe("buildAgentPrompt", () => {
  it("should format task-only prompt correctly", () => {
    const result = buildAgentPrompt("Do something", {});

    expect(result).toBe("## Task\nDo something");
  });

  it("should format task with input parameters", () => {
    const result = buildAgentPrompt("Review code", {
      task: "Review code",
      file_path: "/src/index.ts",
      review_type: "security",
    });

    expect(result).toContain("## Task\nReview code");
    expect(result).toContain("## Input Parameters");
    expect(result).toContain('- file_path: "/src/index.ts"');
    expect(result).toContain('- review_type: "security"');
  });

  it("should exclude task from input parameters section", () => {
    const result = buildAgentPrompt("Test task", {
      task: "Test task",
      param1: "value1",
    });

    // Should not have task in the input parameters section
    const lines = result.split("\n");
    const inputSection = lines.slice(lines.indexOf("## Input Parameters") + 1);
    expect(inputSection.some((line) => line.includes("task:"))).toBe(false);
  });

  it("should handle complex input values", () => {
    const result = buildAgentPrompt("Process data", {
      items: ["a", "b", "c"],
      config: { nested: true },
    });

    expect(result).toContain('- items: ["a","b","c"]');
    expect(result).toContain('- config: {"nested":true}');
  });
});

describe("getOrCreateAgent", () => {
  afterEach(() => {
    clearCache();
  });

  it("should create a new agent for a new SOP", () => {
    const sop = createMockSOP({ name: "new-agent" });
    const agent = getOrCreateAgent(sop);

    expect(agent).toBeDefined();
  });

  it("should return the same agent instance for repeated calls", () => {
    const sop = createMockSOP({ name: "cached-agent" });

    const agent1 = getOrCreateAgent(sop);
    const agent2 = getOrCreateAgent(sop);

    expect(agent1).toBe(agent2);
  });

  it("should create different agents for different SOPs", () => {
    const sop1 = createMockSOP({ name: "agent-1" });
    const sop2 = createMockSOP({ name: "agent-2" });

    const agent1 = getOrCreateAgent(sop1);
    const agent2 = getOrCreateAgent(sop2);

    // They should be different instances (different mock calls)
    expect(agent1).not.toBe(agent2);
  });
});

describe("clearCache", () => {
  it("should clear all cached agents", () => {
    const sop = createMockSOP({ name: "to-clear" });

    const agent1 = getOrCreateAgent(sop);
    clearCache();
    const agent2 = getOrCreateAgent(sop);

    // After clearing, a new agent should be created
    expect(agent1).not.toBe(agent2);
  });
});

describe("createTool", () => {
  afterEach(() => {
    clearCache();
  });

  it("should create tool with correct naming convention (agent_{name})", () => {
    const sop = createMockSOP({ name: "code-reviewer" });
    const tool = createTool(sop);

    expect(tool.name).toBe("agent_code-reviewer");
  });

  it("should use SOP description as tool description", () => {
    const sop = createMockSOP({
      name: "writer",
      description: "Writes content based on research",
    });
    const tool = createTool(sop);

    expect(tool.description).toBe("Writes content based on research");
  });

  it("should use SOP zodSchema as tool input schema", () => {
    const customSchema = z.object({
      task: z.string().describe("The task"),
      topic: z.string().describe("The topic to research"),
    });
    const sop = createMockSOP({
      name: "researcher",
      zodSchema: customSchema,
    });
    const tool = createTool(sop);

    expect(tool.toolSpec.inputSchema).toBe(customSchema);
  });
});

describe("createAllTools", () => {
  afterEach(() => {
    clearCache();
  });

  it("should create tools for all agents in registry", () => {
    const registry = new Map<string, SOPDefinition>();
    registry.set("agent1", createMockSOP({ name: "agent1" }));
    registry.set("agent2", createMockSOP({ name: "agent2" }));
    registry.set("agent3", createMockSOP({ name: "agent3" }));

    const tools = createAllTools(registry);

    expect(tools).toHaveLength(3);
    expect(tools.map((t) => t.name)).toContain("agent_agent1");
    expect(tools.map((t) => t.name)).toContain("agent_agent2");
    expect(tools.map((t) => t.name)).toContain("agent_agent3");
  });

  it("should return empty array for empty registry", () => {
    const registry = new Map<string, SOPDefinition>();
    const tools = createAllTools(registry);

    expect(tools).toHaveLength(0);
  });
});
