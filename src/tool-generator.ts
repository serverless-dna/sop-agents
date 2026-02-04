import { Agent, tool } from "@strands-agents/sdk";
import type { InvokableTool } from "@strands-agents/sdk";
import type { SOPDefinition } from "./types";

/**
 * Cache for agent instances to avoid recreating agents for repeated invocations
 */
const agentCache = new Map<string, Agent>();

/**
 * Builds a structured prompt for the agent from task and input parameters
 * @param task - The specific task to perform
 * @param inputs - Input parameters for the task
 * @returns Formatted prompt string
 */
export function buildAgentPrompt(
  task: string,
  inputs: Record<string, unknown>,
): string {
  const inputEntries = Object.entries(inputs).filter(
    ([key]) => key !== "task",
  );

  if (inputEntries.length === 0) {
    return `## Task\n${task}`;
  }

  const inputSection = inputEntries
    .map(([key, value]) => `- ${key}: ${JSON.stringify(value)}`)
    .join("\n");

  return `## Task\n${task}\n\n## Input Parameters\n${inputSection}`;
}

/**
 * Gets or creates a cached agent instance for the given SOP
 * @param sop - The SOP definition to create an agent for
 * @returns The agent instance (cached or newly created)
 */
export function getOrCreateAgent(sop: SOPDefinition): Agent {
  const cached = agentCache.get(sop.name);
  if (cached) {
    return cached;
  }

  const agent = new Agent({
    systemPrompt: sop.body,
    tools: [], // Sub-agents don't get additional tools by default
  });

  agentCache.set(sop.name, agent);
  return agent;
}

/**
 * Clears the agent cache
 */
export function clearCache(): void {
  agentCache.clear();
}

/**
 * Creates a Strands tool from an SOP definition
 * Tool name follows pattern: agent_{sop.name}
 * @param sop - The SOP definition to create a tool from
 * @returns An InvokableTool that delegates to the agent
 */
export function createTool(
  sop: SOPDefinition,
): InvokableTool<Record<string, unknown>, string> {
  return tool({
    name: `agent_${sop.name}`,
    description: sop.description,
    inputSchema: sop.zodSchema,
    callback: async (input: Record<string, unknown>): Promise<string> => {
      const agent = getOrCreateAgent(sop);
      const prompt = buildAgentPrompt(input.task as string, input);
      const result = await agent.invoke(prompt);
      
      // Extract text content from the result
      const lastMessage = result.lastMessage;
      if (!lastMessage) {
        return "";
      }
      
      // Get text content from the message
      const textContent = lastMessage.content
        .filter((block) => block.type === "textBlock")
        .map((block) => (block as { type: "textBlock"; text: string }).text)
        .join("\n");
      
      return textContent;
    },
  });
}

/**
 * Creates tools for all agents in a registry
 * @param registry - Map of agent names to SOP definitions
 * @returns Array of InvokableTool instances
 */
export function createAllTools(
  registry: Map<string, SOPDefinition>,
): InvokableTool<Record<string, unknown>, string>[] {
  const tools: InvokableTool<Record<string, unknown>, string>[] = [];
  
  for (const sop of registry.values()) {
    tools.push(createTool(sop));
  }
  
  return tools;
}
