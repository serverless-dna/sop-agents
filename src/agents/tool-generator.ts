import type { InvokableTool } from "@strands-agents/sdk";
import { Agent, tool } from "@strands-agents/sdk";
import {
	createModelFromSpec,
	type ModelProvider,
	parseModelSpec,
} from "../model-factory.js";
import type { SOPDefinition } from "../types/types.js";

/**
 * Cache for agent instances to avoid recreating agents for repeated invocations
 */
const agentCache = new Map<string, Agent>();

/**
 * Current default model spec for creating agents (undefined = use Strands default)
 */
let currentDefaultModelSpec: string | undefined;

/**
 * Current default provider when model spec has no provider prefix
 */
let currentDefaultProvider: ModelProvider = "bedrock";

/**
 * Whether to print agent output to console (default: true, set false for non-debug)
 */
let printerEnabled = true;

/**
 * Tool registry for named tools (e.g., MCP clients)
 */
let toolRegistry: Record<string, unknown> = {};

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
	const inputEntries = Object.entries(inputs).filter(([key]) => key !== "task");

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
 * @param logger - Optional logger for logging agent creation
 * @returns The agent instance (cached or newly created)
 */
export function getOrCreateAgent(
	sop: SOPDefinition,
	logger?: { info: (msg: string) => void },
): Agent {
	const cached = agentCache.get(sop.name);
	if (cached) {
		return cached;
	}

	// Use SOP-specific model, then default, then Strands default (undefined)
	const modelSpec = sop.model ?? currentDefaultModelSpec;

	// Resolve tools from the registry based on SOP's tools list
	// biome-ignore lint/suspicious/noExplicitAny: SDK accepts flexible tool types
	const agentTools: any[] = [];
	if (sop.tools && sop.tools.length > 0) {
		for (const toolName of sop.tools) {
			const tool = toolRegistry[toolName];
			if (tool) {
				agentTools.push(tool);
			} else if (logger) {
				logger.info(`Warning: Tool "${toolName}" not found in registry`);
			}
		}
	}

	let modelDisplay: string;
	const agentConfig: ConstructorParameters<typeof Agent>[0] = {
		systemPrompt: sop.body,
		tools: agentTools,
		printer: printerEnabled,
	};

	if (modelSpec) {
		const parsed = parseModelSpec(modelSpec, currentDefaultProvider);
		modelDisplay = `${parsed.provider}/${parsed.modelId}`;
		agentConfig.model = createModelFromSpec(modelSpec, currentDefaultProvider);
	} else {
		modelDisplay = "default (Strands SDK)";
	}

	if (logger) {
		logger.info(`Creating agent with model: ${modelDisplay}`);
		if (agentTools.length > 0) {
			logger.info(
				`Injecting ${agentTools.length} tool(s): ${sop.tools?.join(", ")}`,
			);
		}
	}

	const agent = new Agent(agentConfig);
	agentCache.set(sop.name, agent);
	return agent;
}

/**
 * Sets the default model spec for creating new agents
 * @param modelSpec - The model spec to use as default (e.g., "bedrock/us.anthropic.claude-sonnet-4-20250514-v1:0")
 */
export function setDefaultModelSpec(modelSpec: string | undefined): void {
	currentDefaultModelSpec = modelSpec;
}

/**
 * Gets the current default model spec (undefined means Strands default)
 */
export function getDefaultModelSpec(): string | undefined {
	return currentDefaultModelSpec;
}

/**
 * Sets the default provider when model spec has no provider prefix
 * @param provider - The default provider ("bedrock" or "openai")
 */
export function setDefaultProvider(provider: ModelProvider): void {
	currentDefaultProvider = provider;
}

/**
 * Gets the current default provider
 */
export function getDefaultProvider(): ModelProvider {
	return currentDefaultProvider;
}

/**
 * Sets whether agent output should be printed to console
 * @param enabled - true to print output (debug), false to suppress (production)
 */
export function setPrinterEnabled(enabled: boolean): void {
	printerEnabled = enabled;
}

/**
 * Gets whether printer is enabled
 */
export function isPrinterEnabled(): boolean {
	return printerEnabled;
}

/**
 * Clears the agent cache
 */
export function clearCache(): void {
	agentCache.clear();
}

/**
 * Sets the tool registry for named tools
 * @param registry - Map of tool names to tool instances (e.g., MCP clients)
 */
export function setToolRegistry(registry: Record<string, unknown>): void {
	toolRegistry = registry;
}

/**
 * Gets the current tool registry
 */
export function getToolRegistry(): Record<string, unknown> {
	return { ...toolRegistry };
}

/**
 * Creates a Strands tool from an SOP definition
 * Tool name follows pattern: agent_{sop.name}
 * Uses async generator to stream sub-agent output
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
		callback: async function* (
			input: Record<string, unknown>,
		): AsyncGenerator<string, string, unknown> {
			const task = input.task as string;
			const agent = getOrCreateAgent(sop);
			const prompt = buildAgentPrompt(task, input);

			// Stream from the sub-agent
			const generator = agent.stream(prompt);
			let result = await generator.next();
			let fullText = "";

			while (!result.done) {
				// Process events from the sub-agent
				// biome-ignore lint/suspicious/noExplicitAny: SDK event types vary
				const event = result.value as any;
				if (
					event.type === "modelContentBlockDeltaEvent" &&
					event.delta?.type === "textDelta"
				) {
					const text = event.delta.text ?? "";
					fullText += text;
					yield text;
				}
				result = await generator.next();
			}

			// Return the full text as the final result
			const lastMessage = result.value.lastMessage;
			if (lastMessage?.content?.[0]) {
				const content = lastMessage.content[0];
				if (content.type === "textBlock") {
					return content.text;
				}
				return String(content);
			}

			return fullText;
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
