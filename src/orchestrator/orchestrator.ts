import type { Agent, InvokableTool } from "@strands-agents/sdk";
import { Agent as StrandsAgent } from "@strands-agents/sdk";
import { discoverAgents, findOrchestrator } from "../agents/discovery.js";
import {
	clearCache as clearToolCache,
	createAllTools,
	getOrCreateAgent,
	setDefaultModelSpec,
	setDefaultProvider,
	setPrinterEnabled,
	setToolRegistry,
} from "../agents/tool-generator.js";
import { LoggerImpl } from "../logger.js";
import { createModelFromSpec, type ModelProvider } from "../model-factory.js";
import { AgentInvocationError } from "../types/errors.js";
import type {
	ErrorMode,
	InvokeOptions,
	InvokeResult,
	Logger,
	LogLevel,
	Orchestrator,
	OrchestratorConfig,
	OrchestratorStreamEvent,
	SOPDefinition,
} from "../types/types.js";

/**
 * Generate a unique correlation ID for request tracing
 */
function generateCorrelationId(): string {
	return `req-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
}

/**
 * Internal resolved configuration (all required fields have values)
 */
interface ResolvedOrchestratorConfig {
	directory: string;
	errorMode: ErrorMode;
	logLevel: LogLevel;
	defaultModel?: string;
	defaultProvider: ModelProvider;
	showThinking: boolean;
	tools: Record<string, unknown>;
}

/**
 * OrchestratorImpl class implementing the Orchestrator interface
 */
export class OrchestratorImpl implements Orchestrator {
	private readonly _config: ResolvedOrchestratorConfig;
	private registry: Map<string, SOPDefinition> = new Map();
	private orchestratorAgent: Agent | null = null;
	private orchestratorSOP: SOPDefinition | null = null;
	private logger: Logger;
	private currentCorrelationId?: string;

	constructor(config: OrchestratorConfig = {}) {
		this._config = {
			directory: config.directory ?? "./sops",
			errorMode: config.errorMode ?? "fail-fast",
			logLevel: config.logLevel ?? "info",
			defaultModel: config.defaultModel,
			defaultProvider: config.defaultProvider ?? "bedrock",
			showThinking: config.showThinking ?? false,
			tools: config.tools ?? {},
		};
		this.logger = new LoggerImpl(this._config.logLevel);

		// Set the default model and provider for tool-generator
		setDefaultModelSpec(this._config.defaultModel);
		setDefaultProvider(this._config.defaultProvider);

		// Set the tool registry for agents to use
		setToolRegistry(this._config.tools);

		// Only print agent output to console in debug mode
		setPrinterEnabled(this._config.logLevel === "debug");
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
		const agentTools = createAllTools(this.registry);

		// Wrap tools with error handling and logging
		const wrappedTools = this.wrapToolsWithErrorHandling(agentTools);

		// Resolve tools for the orchestrator from its frontmatter
		// biome-ignore lint/suspicious/noExplicitAny: SDK accepts flexible tool types
		const orchestratorMcpTools: any[] = [];
		if (this.orchestratorSOP.tools && this.orchestratorSOP.tools.length > 0) {
			for (const toolName of this.orchestratorSOP.tools) {
				const tool = this._config.tools[toolName];
				if (tool) {
					orchestratorMcpTools.push(tool);
				} else {
					this.logger.info(
						`Warning: Tool "${toolName}" not found in registry for orchestrator`,
					);
				}
			}
		}

		// Combine agent tools with orchestrator's MCP tools
		// biome-ignore lint/suspicious/noExplicitAny: SDK accepts flexible tool types
		const allTools: any[] = [...wrappedTools, ...orchestratorMcpTools];

		// Determine model for orchestrator (SOP-specific, config default, or Strands default)
		const orchestratorModelSpec =
			this.orchestratorSOP.model ?? this._config.defaultModel;

		// Create orchestrator agent with agent tools + its own MCP tools
		const agentConfig: ConstructorParameters<typeof StrandsAgent>[0] = {
			systemPrompt: this.orchestratorSOP.body,
			tools: allTools,
			printer: this._config.logLevel === "debug",
		};

		if (orchestratorModelSpec && agentConfig) {
			agentConfig.model = createModelFromSpec(
				orchestratorModelSpec,
				this._config.defaultProvider,
			);
		}

		this.orchestratorAgent = new StrandsAgent(agentConfig);
	}

	/**
	 * Process a request through the orchestrator agent
	 */
	invoke(request: string): Promise<string>;
	invoke(request: string, options: InvokeOptions): Promise<InvokeResult>;
	async invoke(
		request: string,
		options?: InvokeOptions,
	): Promise<string | InvokeResult> {
		if (!this.orchestratorAgent) {
			throw new Error("Orchestrator not initialized. Call initialize() first.");
		}

		const showThinking = options?.showThinking ?? this._config.showThinking;

		// Generate correlation ID for request and store it for tool access
		const correlationId = generateCorrelationId();
		this.currentCorrelationId = correlationId;
		const requestLogger = this.logger.withCorrelationId(correlationId);

		// Log request start
		requestLogger.info(`Processing request: ${request.substring(0, 100)}...`, {
			requestLength: request.length,
		});

		const startTime = Date.now();
		const thinking: string[] = [];
		const toolCalls: Array<{ name: string; input: Record<string, unknown> }> =
			[];
		let responseText = "";

		try {
			// Use streaming to capture thinking and tool calls
			for await (const event of this.orchestratorAgent.stream(request)) {
				// Capture thinking/reasoning content
				if (
					event.type === "modelContentBlockDeltaEvent" &&
					// biome-ignore lint/suspicious/noExplicitAny: SDK event types vary
					(event as any).delta?.type === "thinkingDelta"
				) {
					// biome-ignore lint/suspicious/noExplicitAny: SDK event types vary
					const thinkingText = (event as any).delta?.thinking;
					if (thinkingText && showThinking) {
						thinking.push(thinkingText);
						requestLogger.debug(
							`Thinking: ${thinkingText.substring(0, 100)}...`,
						);
					}
				}

				// Capture text content
				if (
					event.type === "modelContentBlockDeltaEvent" &&
					// biome-ignore lint/suspicious/noExplicitAny: SDK event types vary
					(event as any).delta?.type === "textDelta"
				) {
					// biome-ignore lint/suspicious/noExplicitAny: SDK event types vary
					responseText += (event as any).delta?.text ?? "";
				}

				// Capture tool use starts
				if (
					event.type === "modelContentBlockStartEvent" &&
					// biome-ignore lint/suspicious/noExplicitAny: SDK event types vary
					(event as any).start?.type === "toolUseStart"
				) {
					// biome-ignore lint/suspicious/noExplicitAny: SDK event types vary
					const toolName = (event as any).start?.name;
					if (toolName) {
						requestLogger.debug(`Tool selected: ${toolName}`);
					}
				}

				// Capture tool calls from beforeToolsEvent
				if (event.type === "beforeToolsEvent") {
					// biome-ignore lint/suspicious/noExplicitAny: SDK event types vary
					const toolUses = (event as any).toolUses;
					if (Array.isArray(toolUses)) {
						for (const toolUse of toolUses) {
							toolCalls.push({
								name: toolUse.name,
								input: toolUse.input as Record<string, unknown>,
							});
						}
					}
				}
			}

			const duration = Date.now() - startTime;
			requestLogger.info(`Request completed in ${duration}ms`);

			// Return string if no options, InvokeResult if options provided
			if (options) {
				return {
					response: responseText,
					thinking: thinking.length > 0 ? thinking : undefined,
					toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
				};
			}
			return responseText;
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
	 * Stream events from the orchestrator in real-time
	 */
	async *stream(request: string): AsyncGenerator<OrchestratorStreamEvent> {
		if (!this.orchestratorAgent) {
			throw new Error("Orchestrator not initialized. Call initialize() first.");
		}

		// Generate correlation ID for request and store it for tool access
		const correlationId = generateCorrelationId();
		this.currentCorrelationId = correlationId;
		const requestLogger = this.logger.withCorrelationId(correlationId);

		requestLogger.info(`Streaming request: ${request.substring(0, 100)}...`, {
			requestLength: request.length,
		});

		const startTime = Date.now();

		try {
			for await (const event of this.orchestratorAgent.stream(request)) {
				yield event as OrchestratorStreamEvent;
			}

			const duration = Date.now() - startTime;
			requestLogger.info(`Stream completed in ${duration}ms`);
		} catch (error) {
			const duration = Date.now() - startTime;
			requestLogger.error(
				`Stream failed after ${duration}ms`,
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
			const sop = this.registry.get(agentName);

			const wrappedInvoke = async (
				input: Record<string, unknown>,
			): Promise<string> => {
				// Get logger with current correlation ID and agent name
				const agentLogger = this.currentCorrelationId
					? this.logger
							.withCorrelationId(this.currentCorrelationId)
							.withAgent(agentName)
					: this.logger.withAgent(agentName);
				const task = input.task as string;
				const startTime = Date.now();

				agentLogger.debug("Tool invoke called", { input });

				// Ensure agent is created with logger for model info
				if (sop) {
					getOrCreateAgent(sop, agentLogger);
				}

				agentLogger.info(
					`Invoking agent with task: "${task?.substring(0, 80) ?? "NO TASK"}..."`,
				);

				try {
					const result = await originalTool.invoke(input);
					const duration = Date.now() - startTime;

					// Log completion with output preview
					const outputPreview = result.substring(0, 200);
					agentLogger.info(
						`Completed in ${duration}ms (${result.length} chars)`,
					);
					agentLogger.debug(`Output preview: ${outputPreview}...`);

					return result;
				} catch (error) {
					const duration = Date.now() - startTime;
					const originalError =
						error instanceof Error ? error : new Error(String(error));

					agentLogger.error(
						`Failed after ${duration}ms: ${originalError.message}`,
						originalError,
					);

					if (this._config.errorMode === "fail-fast") {
						throw new AgentInvocationError(agentName, task, originalError);
					}

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

			// Wrapped stream generator with logging
			const wrappedStream = (
				toolContext: Parameters<typeof originalTool.stream>[0],
			) => {
				const streamLogger = this.currentCorrelationId
					? this.logger
							.withCorrelationId(this.currentCorrelationId)
							.withAgent(agentName)
					: this.logger.withAgent(agentName);
				const input = toolContext.toolUse.input as Record<string, unknown>;
				const task = input?.task as string;

				// Ensure agent is created with logger for model info
				if (sop) {
					getOrCreateAgent(sop, streamLogger);
				}

				streamLogger.info(
					`Invoking agent with task: "${task?.substring(0, 80) ?? "NO TASK"}..."`,
				);

				// Return the original stream - logging happens at invoke level
				return originalTool.stream(toolContext);
			};

			// Create a new tool object with the wrapped invoke and stream
			const wrappedTool: InvokableTool<Record<string, unknown>, string> = {
				name: originalTool.name,
				description: originalTool.description,
				toolSpec: originalTool.toolSpec,
				invoke: wrappedInvoke,
				stream: wrappedStream,
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
