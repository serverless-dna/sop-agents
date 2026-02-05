import type { z } from "zod";

/**
 * Supported input types for SOP parameters
 */
export type InputType = "string" | "number" | "boolean" | "enum" | "list";

/**
 * Definition for a single input parameter in an SOP
 */
export interface InputDef {
	type: InputType;
	description: string;
	required?: boolean; // defaults to true
	default?: unknown; // default value if not provided
	values?: string[]; // only for enum type
}

/**
 * YAML frontmatter structure for SOP files
 */
export interface SOPFrontmatter {
	name: string; // required: agent name
	description: string; // required: agent description
	version?: string; // optional: semver version
	tools?: string[]; // optional: additional tools to inject
	inputs?: Record<string, InputDef>; // optional: input parameters
	type?: "agent" | "orchestrator"; // defaults to "agent"
	model?: string; // optional: model ID (e.g., "us.anthropic.claude-sonnet-4-20250514-v1:0")
}

/**
 * Complete parsed SOP definition
 */
export interface SOPDefinition {
	name: string;
	description: string;
	version: string;
	tools: string[];
	inputs: Record<string, InputDef>;
	body: string; // markdown content after frontmatter
	filepath: string; // original file path
	type: "agent" | "orchestrator";
	zodSchema: z.ZodObject<z.ZodRawShape>; // always has at least { task: z.string() }
	model?: string; // optional: model ID for this agent
}

/**
 * Error handling mode for orchestrator
 */
export type ErrorMode = "fail-fast" | "continue";

/**
 * Log level for orchestrator logging
 */
export type LogLevel = "debug" | "info" | "warn" | "error";

/**
 * Supported model providers
 */
export type ModelProvider = "bedrock" | "openai";

/**
 * Configuration options for the orchestrator
 */
export interface OrchestratorConfig {
	directory?: string; // default: "./sops"
	errorMode?: ErrorMode; // default: "fail-fast"
	logLevel?: LogLevel; // default: "info"
	defaultModel?: string; // default: undefined (use Strands SDK default)
	defaultProvider?: ModelProvider; // default: "bedrock" - used when model has no provider prefix
	showThinking?: boolean; // default: false - log orchestrator reasoning/thinking
}

/**
 * Options for invoke method
 */
export interface InvokeOptions {
	/** Include thinking/reasoning in the result */
	showThinking?: boolean;
}

/**
 * Result from orchestrator invocation
 */
export interface InvokeResult {
	/** The final response text */
	response: string;
	/** Orchestrator's thinking/reasoning (only populated if showThinking is enabled) */
	thinking?: string[];
	/** Tool calls made during execution */
	toolCalls?: Array<{
		name: string;
		input: Record<string, unknown>;
	}>;
}

/**
 * Stream event from orchestrator (re-exported from SDK)
 */
export type OrchestratorStreamEvent = {
	type: string;
	[key: string]: unknown;
};

/**
 * Orchestrator interface for managing multi-agent orchestration
 */
export interface Orchestrator {
	/**
	 * Initialize the orchestrator by discovering agents and creating tools
	 */
	initialize(): Promise<void>;

	/**
	 * Process a request through the orchestrator agent
	 * @returns Response string when no options, InvokeResult when options provided
	 */
	invoke(request: string): Promise<string>;
	invoke(request: string, options: InvokeOptions): Promise<InvokeResult>;

	/**
	 * Stream events from the orchestrator in real-time
	 * @returns AsyncGenerator of stream events
	 */
	stream(request: string): AsyncGenerator<OrchestratorStreamEvent>;

	/**
	 * Clear agent cache
	 */
	clearCache(): void;

	/**
	 * Get the agent registry (for inspection/debugging)
	 */
	getRegistry(): Map<string, SOPDefinition>;

	/**
	 * Current configuration (readonly for inspection)
	 */
	readonly config: OrchestratorConfig;
}

/**
 * Log entry structure for orchestrator logging
 */
export interface LogEntry {
	timestamp: Date;
	correlationId: string;
	level: LogLevel;
	agentName?: string;
	message: string;
	duration?: number; // milliseconds
	error?: Error;
	metadata?: Record<string, unknown>;
}

/**
 * Logger interface for orchestrator logging
 */
export interface Logger {
	debug(message: string, metadata?: Record<string, unknown>): void;
	info(message: string, metadata?: Record<string, unknown>): void;
	warn(message: string, metadata?: Record<string, unknown>): void;
	error(
		message: string,
		error?: Error,
		metadata?: Record<string, unknown>,
	): void;

	/**
	 * Create a child logger with correlation ID
	 */
	withCorrelationId(correlationId: string): Logger;

	/**
	 * Create a child logger with agent context
	 */
	withAgent(agentName: string): Logger;

	/**
	 * Set the minimum log level
	 */
	setLevel(level: LogLevel): void;
}
