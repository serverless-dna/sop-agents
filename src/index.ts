// Public API exports

// Agent Discovery
export { discoverAgents, findOrchestrator } from "./agent-discovery";
// Error classes
export {
	AgentInvocationError,
	DirectoryNotFoundError,
	FileNotFoundError,
	FrontmatterParseError,
	FrontmatterValidationError,
	MultipleOrchestratorsError,
	OrchestratorNotFoundError,
	SOPError,
} from "./errors";
// Logger
export { createLogger, LoggerImpl } from "./logger";
// Factory function
export { createOrchestrator, OrchestratorImpl } from "./orchestrator";

// SOP Loader
export { generateZodSchema, loadSOP, validateFrontmatter } from "./sop-loader";
// Tool Generator
export {
	buildAgentPrompt,
	clearCache,
	createAllTools,
	createTool,
	getOrCreateAgent,
} from "./tool-generator";
// Types
export type {
	ErrorMode,
	InputDef,
	InputType,
	LogEntry,
	Logger,
	LogLevel,
	Orchestrator,
	OrchestratorConfig,
	SOPDefinition,
	SOPFrontmatter,
} from "./types";
