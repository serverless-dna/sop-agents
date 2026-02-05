/**
 * Base error class for all SOP-related errors
 */
export class SOPError extends Error {
	constructor(
		message: string,
		public readonly code: string,
		public readonly context: Record<string, unknown>,
	) {
		super(message);
		this.name = "SOPError";
	}
}

/**
 * Thrown when an SOP file cannot be found
 */
export class FileNotFoundError extends SOPError {
	constructor(filepath: string) {
		super(`SOP file not found: ${filepath}`, "FILE_NOT_FOUND", { filepath });
		this.name = "FileNotFoundError";
	}
}

/**
 * Thrown when frontmatter YAML is malformed
 */
export class FrontmatterParseError extends SOPError {
	constructor(filepath: string, parseError: string) {
		super(
			`Failed to parse frontmatter in ${filepath}: ${parseError}`,
			"FRONTMATTER_PARSE_ERROR",
			{ filepath, parseError },
		);
		this.name = "FrontmatterParseError";
	}
}

/**
 * Thrown when frontmatter fails validation
 */
export class FrontmatterValidationError extends SOPError {
	constructor(filepath: string, field: string, reason: string) {
		super(
			`Invalid frontmatter in ${filepath}: ${field} - ${reason}`,
			"FRONTMATTER_VALIDATION_ERROR",
			{ filepath, field, reason },
		);
		this.name = "FrontmatterValidationError";
	}
}

/**
 * Thrown when discovery directory doesn't exist
 */
export class DirectoryNotFoundError extends SOPError {
	constructor(directory: string) {
		super(`Directory not found: ${directory}`, "DIRECTORY_NOT_FOUND", {
			directory,
		});
		this.name = "DirectoryNotFoundError";
	}
}

/**
 * Thrown when no orchestrator SOP is found
 */
export class OrchestratorNotFoundError extends SOPError {
	constructor(directory: string) {
		super(
			`No orchestrator SOP found in ${directory}`,
			"ORCHESTRATOR_NOT_FOUND",
			{ directory },
		);
		this.name = "OrchestratorNotFoundError";
	}
}

/**
 * Thrown when multiple orchestrator SOPs are found
 */
export class MultipleOrchestratorsError extends SOPError {
	constructor(directory: string, files: string[]) {
		super(
			`Multiple orchestrator SOPs found in ${directory}: ${files.join(", ")}`,
			"MULTIPLE_ORCHESTRATORS",
			{ directory, files },
		);
		this.name = "MultipleOrchestratorsError";
	}
}

/**
 * Thrown when an agent invocation fails
 */
export class AgentInvocationError extends SOPError {
	constructor(agentName: string, task: string, originalError: Error) {
		super(
			`Agent '${agentName}' failed: ${originalError.message}`,
			"AGENT_INVOCATION_ERROR",
			{ agentName, task, originalError: originalError.message },
		);
		this.name = "AgentInvocationError";
		this.cause = originalError;
	}
}
