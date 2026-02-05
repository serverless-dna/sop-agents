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
 * Configuration options for the orchestrator
 */
export interface OrchestratorConfig {
	directory?: string; // default: "./sops"
	errorMode?: ErrorMode; // default: "fail-fast"
	logLevel?: LogLevel; // default: "info"
}

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
	 * @returns Final response string
	 */
	invoke(request: string): Promise<string>;

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
