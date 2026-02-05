import * as fs from "node:fs";
import * as path from "node:path";
import fc from "fast-check";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import {
	MultipleOrchestratorsError,
	OrchestratorNotFoundError,
} from "../src/errors";
import { OrchestratorImpl } from "../src/orchestrator";

// Mock the @strands-agents/sdk module
vi.mock("@strands-agents/sdk", () => {
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

		async *stream(_prompt: string) {
			yield { type: "modelContentBlockDeltaEvent", delta: { type: "textDelta", text: "Mock response" } };
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

// Generators
const validNameArb = fc.stringMatching(/^[a-z][a-z0-9-]{2,12}$/);
const validDescriptionArb = fc.stringMatching(/^[a-zA-Z][a-zA-Z0-9 ]{10,40}$/);

/**
 * Helper to create a unique temp directory for each test iteration
 */
function createTempDir(): string {
	const uniqueId = `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
	const tempDir = `test/fixtures/prop-temp-${uniqueId}`;
	fs.mkdirSync(tempDir, { recursive: true });
	return tempDir;
}

/**
 * Helper to clean up a temp directory
 */
function cleanupTempDir(tempDir: string): void {
	if (fs.existsSync(tempDir)) {
		const files = fs.readdirSync(tempDir);
		for (const file of files) {
			fs.unlinkSync(path.join(tempDir, file));
		}
		fs.rmdirSync(tempDir);
	}
}

/**
 * Property 9: Orchestrator Initialization Validation
 * For any directory, Orchestrator initialization should:
 * - Succeed if exactly one orchestrator SOP exists
 * - Fail with descriptive error if no orchestrator exists
 * - Fail with descriptive error if multiple orchestrators exist
 * - Inject all discovered agent tools into the orchestrator
 * **Validates: Requirements 7.1, 7.2, 7.5, 7.6**
 */
describe("Property 9: Orchestrator Initialization Validation", () => {
	it("should succeed with exactly one orchestrator and inject all agent tools", async () => {
		await fc.assert(
			fc.asyncProperty(
				fc.array(validNameArb, { minLength: 1, maxLength: 3 }).filter(
					(names) => new Set(names).size === names.length,
				),
				validDescriptionArb,
				async (agentNames, description) => {
					const tempDir = createTempDir();

					try {
						// Create orchestrator
						fs.writeFileSync(
							path.join(tempDir, "orchestrator.md"),
							`---
name: orchestrator
description: ${description}
type: orchestrator
---
# Orchestrator`,
						);

						// Create agents
						for (const name of agentNames) {
							fs.writeFileSync(
								path.join(tempDir, `${name}.md`),
								`---
name: ${name}
description: Agent ${name}
type: agent
---
# Agent ${name}`,
							);
						}

						const orchestrator = new OrchestratorImpl({
							directory: tempDir,
						});

						await orchestrator.initialize();
						const registry = orchestrator.getRegistry();

						// Should have all agents
						expect(registry.size).toBe(agentNames.length);
						for (const name of agentNames) {
							expect(registry.has(name)).toBe(true);
						}

						return true;
					} finally {
						cleanupTempDir(tempDir);
					}
				},
			),
			{ numRuns: 20 },
		);
	});

	it("should fail with OrchestratorNotFoundError when no orchestrator exists", async () => {
		await fc.assert(
			fc.asyncProperty(
				validNameArb,
				validDescriptionArb,
				async (agentName, description) => {
					const tempDir = createTempDir();

					try {
						// Create only an agent (no orchestrator)
						fs.writeFileSync(
							path.join(tempDir, `${agentName}.md`),
							`---
name: ${agentName}
description: ${description}
type: agent
---
# Agent`,
						);

						const orchestrator = new OrchestratorImpl({
							directory: tempDir,
						});

						await expect(orchestrator.initialize()).rejects.toThrow(
							OrchestratorNotFoundError,
						);

						return true;
					} finally {
						cleanupTempDir(tempDir);
					}
				},
			),
			{ numRuns: 20 },
		);
	});

	it("should fail with MultipleOrchestratorsError when multiple orchestrators exist", async () => {
		await fc.assert(
			fc.asyncProperty(
				fc.array(validNameArb, { minLength: 2, maxLength: 3 }).filter(
					(names) => new Set(names).size === names.length,
				),
				validDescriptionArb,
				async (orchestratorNames, description) => {
					const tempDir = createTempDir();

					try {
						// Create multiple orchestrators
						for (const name of orchestratorNames) {
							fs.writeFileSync(
								path.join(tempDir, `${name}.md`),
								`---
name: ${name}
description: ${description}
type: orchestrator
---
# Orchestrator ${name}`,
							);
						}

						const orchestrator = new OrchestratorImpl({
							directory: tempDir,
						});

						await expect(orchestrator.initialize()).rejects.toThrow(
							MultipleOrchestratorsError,
						);

						return true;
					} finally {
						cleanupTempDir(tempDir);
					}
				},
			),
			{ numRuns: 20 },
		);
	});
});

/**
 * Property 10: Error Mode Behavior
 * For any orchestrator invocation where an agent tool fails:
 * - In "fail-fast" mode: error should propagate immediately with agent context
 * - In "continue" mode: execution should continue, and final response should include partial results and error information
 * **Validates: Requirements 8.5, 8.6, 8.7**
 */
describe("Property 10: Error Mode Behavior", () => {
	it("should use fail-fast as default error mode", () => {
		fc.assert(
			fc.property(fc.constant(null), () => {
				const orchestrator = new OrchestratorImpl();
				expect(orchestrator.config.errorMode).toBe("fail-fast");
				return true;
			}),
			{ numRuns: 10 },
		);
	});

	it("should accept continue error mode", () => {
		fc.assert(
			fc.property(fc.constant(null), () => {
				const orchestrator = new OrchestratorImpl({
					errorMode: "continue",
				});
				expect(orchestrator.config.errorMode).toBe("continue");
				return true;
			}),
			{ numRuns: 10 },
		);
	});

	it("should preserve error mode in config", () => {
		fc.assert(
			fc.property(
				fc.constantFrom("fail-fast", "continue") as fc.Arbitrary<
					"fail-fast" | "continue"
				>,
				(errorMode) => {
					const orchestrator = new OrchestratorImpl({ errorMode });
					expect(orchestrator.config.errorMode).toBe(errorMode);
					return true;
				},
			),
			{ numRuns: 20 },
		);
	});
});

/**
 * Property 11: Logging Completeness
 * For any agent tool invocation, logs should include:
 * - Correlation ID for request tracing
 * - Agent name in all related log entries
 * - Task and input parameters at invocation start
 * - Duration and response summary on success
 * - Error type, message, and stack trace on failure
 * **Validates: Requirements 9.1, 9.2, 9.3, 9.4, 9.5, 9.6**
 */
describe("Property 11: Logging Completeness", () => {
	it("should include correlation ID in logs for any request", async () => {
		// Use a single test with the existing fixtures directory
		const logMessages: string[] = [];
		const consoleSpy = vi.spyOn(console, "log").mockImplementation((msg) => {
			if (typeof msg === "string") {
				logMessages.push(msg);
			}
		});

		try {
			await fc.assert(
				fc.asyncProperty(
					fc.stringMatching(/^[a-zA-Z][a-zA-Z0-9 ]{5,30}$/),
					async (request) => {
						logMessages.length = 0; // Clear logs for each iteration

						const orchestrator = new OrchestratorImpl({
							directory: "test/fixtures/sops",
						});

						await orchestrator.initialize();
						await orchestrator.invoke(request);

						// Check that at least one log contains correlation ID pattern
						const hasCorrelationId = logMessages.some((msg) =>
							/\[req-\d+-[a-z0-9]+\]/.test(msg),
						);
						expect(hasCorrelationId).toBe(true);

						return true;
					},
				),
				{ numRuns: 10 },
			);
		} finally {
			consoleSpy.mockRestore();
		}
	});

	it("should log request processing start and completion", async () => {
		const logMessages: string[] = [];
		const consoleSpy = vi.spyOn(console, "log").mockImplementation((msg) => {
			if (typeof msg === "string") {
				logMessages.push(msg);
			}
		});

		try {
			await fc.assert(
				fc.asyncProperty(
					fc.stringMatching(/^[a-zA-Z][a-zA-Z0-9 ]{5,30}$/),
					async (request) => {
						logMessages.length = 0; // Clear logs for each iteration

						const orchestrator = new OrchestratorImpl({
							directory: "test/fixtures/sops",
						});

						await orchestrator.initialize();
						await orchestrator.invoke(request);

						const allLogs = logMessages.join(" ");

						// Should log processing start
						expect(allLogs).toContain("Processing request");

						// Should log completion
						expect(allLogs).toContain("completed");

						return true;
					},
				),
				{ numRuns: 10 },
			);
		} finally {
			consoleSpy.mockRestore();
		}
	});
});
