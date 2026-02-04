import type { Agent, InvokableTool } from "@strands-agents/sdk";
import { Agent as StrandsAgent } from "@strands-agents/sdk";
import { discoverAgents, findOrchestrator } from "./agent-discovery";
import { AgentInvocationError } from "./errors";
import { LoggerImpl } from "./logger";
import { clearCache as clearToolCache, createAllTools } from "./tool-generator";
import type {
	Logger,
	Orchestrator,
	OrchestratorConfig,
	SOPDefinition,
} from "./types";

/**
 * Generate a unique correlation ID for request tracing
 */
function generateCorrelationId(): string {
	return `req-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
}

/**
 * OrchestratorImpl class implementing the Orchestrator interface
 */
export class OrchestratorImpl implements Orchestrator {
	private readonly _config: OrchestratorConfig;
	private registry: Map<string, SOPDefinition> = new Map();
	private orchestratorAgent: Agent | null = null;
	private orchestratorSOP: SOPDefinition | null = null;
	private logger: Logger;

	constructor(config: OrchestratorConfig = {}) {
		this._config = {
			directory: config.directory ?? "./sops",
			errorMode: config.errorMode ?? "fail-fast",
			logLevel: config.logLevel ?? "info",
		};
		this.logger = new LoggerImpl(this._config.logLevel);
	}

	/**
	 * Current configuration (readonly for inspection)
	 */
	get config(): OrchestratorConfig {
		return { ...this._config };
	}

	/**
	 * Initialize the orchestrator by discovering agents and creating tools
	 */
	async initialize(): Promise<void> {
		const directory = this._config.directory ?? "./sops";

		// Discover agents
		this.registry = await discoverAgents(directory);

		// Find orchestrator SOP
		this.orchestratorSOP = await findOrchestrator(directory);

		// Create tools for all agents
		const tools = createAllTools(this.registry);

		// Wrap tools with error handling and logging
		const wrappedTools = this.wrapToolsWithErrorHandling(tools);

		// Create orchestrator agent with SOP body as system prompt
		this.orchestratorAgent = new StrandsAgent({
			systemPrompt: this.orchestratorSOP.body,
			tools: wrappedTools,
		});
	}

	/**
	 * Process a request through the orchestrator agent
	 */
	async invoke(request: string): Promise<string> {
		if (!this.orchestratorAgent) {
			throw new Error("Orchestrator not initialized. Call initialize() first.");
		}

		// Generate correlation ID for request
		const correlationId = generateCorrelationId();
		const requestLogger = this.logger.withCorrelationId(correlationId);

		// Log request start
		requestLogger.info(`Processing request: ${request.substring(0, 100)}...`, {
			requestLength: request.length,
		});

		const startTime = Date.now();

		try {
			// Invoke orchestrator agent with request
			const result = await this.orchestratorAgent.invoke(request);

			const duration = Date.now() - startTime;
			requestLogger.info(`Request completed in ${duration}ms`);

			// Extract text content from the result
			const lastMessage = result.lastMessage;
			if (!lastMessage) {
				return "";
			}

			const textContent = lastMessage.content
				.filter((block) => block.type === "textBlock")
				.map((block) => (block as { type: "textBlock"; text: string }).text)
				.join("\n");

			return textContent;
		} catch (error) {
			const duration = Date.now() - startTime;
			requestLogger.error(
				`Request failed after ${duration}ms`,
				error instanceof Error ? error : new Error(String(error)),
			);
			throw error;
		}
	}

	/**
	 * Clear agent cache
	 */
	clearCache(): void {
		clearToolCache();
	}

	/**
	 * Get the agent registry (for inspection/debugging)
	 */
	getRegistry(): Map<string, SOPDefinition> {
		return new Map(this.registry);
	}

	/**
	 * Wrap tools with error handling and logging
	 */
	private wrapToolsWithErrorHandling(
		tools: InvokableTool<Record<string, unknown>, string>[],
	): InvokableTool<Record<string, unknown>, string>[] {
		return tools.map((originalTool) => {
			const agentName = originalTool.name.replace(/^agent_/, "");

			const wrappedInvoke = async (
				input: Record<string, unknown>,
			): Promise<string> => {
				const agentLogger = this.logger.withAgent(agentName);
				const task = input.task as string;
				const startTime = Date.now();

				// Log invocation start
				agentLogger.info(`Invoking agent with task: ${task}`, {
					inputs: Object.keys(input).filter((k) => k !== "task"),
				});

				try {
					const result = await originalTool.invoke(input);
					const duration = Date.now() - startTime;

					// Log success
					agentLogger.info(`Agent completed in ${duration}ms`, {
						responseLength: result.length,
					});

					return result;
				} catch (error) {
					const duration = Date.now() - startTime;
					const originalError =
						error instanceof Error ? error : new Error(String(error));

					// Log failure
					agentLogger.error(
						`Agent failed after ${duration}ms: ${originalError.message}`,
						originalError,
						{
							errorType: originalError.name,
							stack: originalError.stack,
						},
					);

					// Handle based on error mode
					if (this._config.errorMode === "fail-fast") {
						throw new AgentInvocationError(agentName, task, originalError);
					}

					// In continue mode, return error information
					return JSON.stringify({
						success: false,
						agentName,
						error: {
							message: originalError.message,
							code: "AGENT_INVOCATION_ERROR",
						},
					});
				}
			};

			// Create a new tool object with the wrapped invoke
			const wrappedTool: InvokableTool<Record<string, unknown>, string> = {
				name: originalTool.name,
				description: originalTool.description,
				toolSpec: originalTool.toolSpec,
				invoke: wrappedInvoke,
				stream: originalTool.stream,
			};

			return wrappedTool;
		});
	}
}

/**
 * Factory function to create and initialize an orchestrator
 */
export async function createOrchestrator(
	config: OrchestratorConfig = {},
): Promise<Orchestrator> {
	const orchestrator = new OrchestratorImpl(config);
	await orchestrator.initialize();
	return orchestrator;
}
