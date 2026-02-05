// Public API exports

// Agent Discovery
export { discoverAgents, findOrchestrator } from "./agents/discovery.js";
// SOP Loader
export {
	generateZodSchema,
	loadSOP,
	validateFrontmatter,
} from "./agents/sop-loader.js";
// Tool Generator
export {
	buildAgentPrompt,
	clearCache,
	createAllTools,
	createTool,
	getDefaultModelSpec,
	getDefaultProvider,
	getOrCreateAgent,
	setDefaultModelSpec,
	setDefaultProvider,
} from "./agents/tool-generator.js";

// Logger
export { createLogger, LoggerImpl } from "./logger.js";

// Model Factory
export {
	createModel,
	createModelFromSpec,
	parseModelSpec,
} from "./model-factory.js";
// Default Orchestrator
export { DEFAULT_ORCHESTRATOR } from "./orchestrator/default-orchestrator.js";
// Factory function
export {
	createOrchestrator,
	OrchestratorImpl,
} from "./orchestrator/orchestrator.js";
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
} from "./types/errors.js";

// Types
export type {
	ErrorMode,
	InputDef,
	InputType,
	InvokeOptions,
	LogEntry,
	Logger,
	LogLevel,
	ModelProvider,
	Orchestrator,
	OrchestratorConfig,
	SOPDefinition,
	SOPFrontmatter,
} from "./types/types.js";
