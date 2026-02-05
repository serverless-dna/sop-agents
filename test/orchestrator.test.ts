import * as fs from "node:fs";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AgentInvocationError } from "../src/types/errors";
import { OrchestratorImpl, createOrchestrator } from "../src/orchestrator/orchestrator";
import type { LogEntry } from "../src/types/types";

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
					content: [{ type: "textBlock", text: "Mock orchestrator response" }],
				},
			};
		}

		async *stream(_prompt: string) {
			yield { type: "modelContentBlockDeltaEvent", delta: { type: "textDelta", text: "Mock orchestrator response" } };
			return {
				lastMessage: {
					content: [{ type: "textBlock", text: "Mock orchestrator response" }],
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

describe("OrchestratorImpl", () => {
	describe("config defaults", () => {
		it("should use default directory ./sops when not specified", () => {
			const orchestrator = new OrchestratorImpl();
			expect(orchestrator.config.directory).toBe("./sops");
		});

		it("should use default errorMode fail-fast when not specified", () => {
			const orchestrator = new OrchestratorImpl();
			expect(orchestrator.config.errorMode).toBe("fail-fast");
		});

		it("should use default logLevel info when not specified", () => {
			const orchestrator = new OrchestratorImpl();
			expect(orchestrator.config.logLevel).toBe("info");
		});

		it("should accept custom config values", () => {
			const orchestrator = new OrchestratorImpl({
				directory: "./custom-sops",
				errorMode: "continue",
				logLevel: "debug",
			});

			expect(orchestrator.config.directory).toBe("./custom-sops");
			expect(orchestrator.config.errorMode).toBe("continue");
			expect(orchestrator.config.logLevel).toBe("debug");
		});

		it("should return a copy of config to prevent mutation", () => {
			const orchestrator = new OrchestratorImpl();
			const config1 = orchestrator.config;
			const config2 = orchestrator.config;

			expect(config1).not.toBe(config2);
			expect(config1).toEqual(config2);
		});
	});

	describe("initialize", () => {
		it("should discover agents and create tools", async () => {
			const orchestrator = new OrchestratorImpl({
				directory: "test/fixtures/sops",
			});

			await orchestrator.initialize();

			const registry = orchestrator.getRegistry();
			expect(registry.size).toBe(2);
			expect(registry.has("research")).toBe(true);
			expect(registry.has("writer")).toBe(true);
		});

		it("should not include orchestrator in registry", async () => {
			const orchestrator = new OrchestratorImpl({
				directory: "test/fixtures/sops",
			});

			await orchestrator.initialize();

			const registry = orchestrator.getRegistry();
			expect(registry.has("orchestrator")).toBe(false);
		});

		it("should return a copy of registry to prevent mutation", async () => {
			const orchestrator = new OrchestratorImpl({
				directory: "test/fixtures/sops",
			});

			await orchestrator.initialize();

			const registry1 = orchestrator.getRegistry();
			const registry2 = orchestrator.getRegistry();

			expect(registry1).not.toBe(registry2);
		});
	});

	describe("invoke", () => {
		it("should throw error if not initialized", async () => {
			const orchestrator = new OrchestratorImpl({
				directory: "test/fixtures/sops",
			});

			await expect(orchestrator.invoke("test request")).rejects.toThrow(
				"Orchestrator not initialized",
			);
		});

		it("should process request and return response", async () => {
			const orchestrator = new OrchestratorImpl({
				directory: "test/fixtures/sops",
			});

			await orchestrator.initialize();
			const result = await orchestrator.invoke("Test request");

			expect(result).toBe("Mock orchestrator response");
		});

		it("should generate correlation ID for request", async () => {
			const logEntries: LogEntry[] = [];
			const consoleSpy = vi.spyOn(console, "log").mockImplementation((msg) => {
				if (typeof msg === "string" && msg.includes("[req-")) {
					logEntries.push({ message: msg } as LogEntry);
				}
			});

			const orchestrator = new OrchestratorImpl({
				directory: "test/fixtures/sops",
			});

			await orchestrator.initialize();
			await orchestrator.invoke("Test request");

			// Check that logs contain correlation ID pattern
			expect(consoleSpy).toHaveBeenCalled();
			const calls = consoleSpy.mock.calls.flat().join(" ");
			expect(calls).toMatch(/\[req-\d+-[a-z0-9]+\]/);

			consoleSpy.mockRestore();
		});
	});

	describe("clearCache", () => {
		it("should clear the agent cache", async () => {
			const orchestrator = new OrchestratorImpl({
				directory: "test/fixtures/sops",
			});

			await orchestrator.initialize();

			// Should not throw
			expect(() => orchestrator.clearCache()).not.toThrow();
		});
	});
});

describe("createOrchestrator factory", () => {
	it("should create and initialize orchestrator", async () => {
		const orchestrator = await createOrchestrator({
			directory: "test/fixtures/sops",
		});

		const registry = orchestrator.getRegistry();
		expect(registry.size).toBe(2);
	});

	it("should use default config when not specified", async () => {
		// Create a temp directory with required files
		const tempDir = "test/fixtures/factory-test-temp";
		fs.mkdirSync(tempDir, { recursive: true });

		fs.writeFileSync(
			path.join(tempDir, "orchestrator.md"),
			`---
name: orchestrator
description: Test orchestrator
type: orchestrator
---
# Test Orchestrator`,
		);

		fs.writeFileSync(
			path.join(tempDir, "agent.md"),
			`---
name: agent
description: Test agent
type: agent
---
# Test Agent`,
		);

		try {
			const orchestrator = await createOrchestrator({
				directory: tempDir,
			});

			expect(orchestrator.config.errorMode).toBe("fail-fast");
			expect(orchestrator.config.logLevel).toBe("info");
		} finally {
			fs.unlinkSync(path.join(tempDir, "orchestrator.md"));
			fs.unlinkSync(path.join(tempDir, "agent.md"));
			fs.rmdirSync(tempDir);
		}
	});
});

describe("logging", () => {
	it("should log at invocation start", async () => {
		const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});

		const orchestrator = new OrchestratorImpl({
			directory: "test/fixtures/sops",
		});

		await orchestrator.initialize();
		await orchestrator.invoke("Test request");

		expect(consoleSpy).toHaveBeenCalled();
		const calls = consoleSpy.mock.calls.flat().join(" ");
		expect(calls).toContain("Processing request");

		consoleSpy.mockRestore();
	});

	it("should log at completion", async () => {
		const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});

		const orchestrator = new OrchestratorImpl({
			directory: "test/fixtures/sops",
		});

		await orchestrator.initialize();
		await orchestrator.invoke("Test request");

		expect(consoleSpy).toHaveBeenCalled();
		const calls = consoleSpy.mock.calls.flat().join(" ");
		expect(calls).toContain("completed");

		consoleSpy.mockRestore();
	});
});

describe("printer configuration", () => {
	// Import the printer functions to verify state
	let isPrinterEnabled: () => boolean;
	let setPrinterEnabled: (enabled: boolean) => void;

	beforeEach(async () => {
		const toolGenerator = await import("../src/agents/tool-generator");
		isPrinterEnabled = toolGenerator.isPrinterEnabled;
		setPrinterEnabled = toolGenerator.setPrinterEnabled;
		// Reset to default
		setPrinterEnabled(true);
	});

	afterEach(() => {
		// Reset to default
		setPrinterEnabled(true);
	});

	it("should disable printer when logLevel is info (default)", () => {
		new OrchestratorImpl({
			directory: "test/fixtures/sops",
			logLevel: "info",
		});

		expect(isPrinterEnabled()).toBe(false);
	});

	it("should disable printer when logLevel is warn", () => {
		new OrchestratorImpl({
			directory: "test/fixtures/sops",
			logLevel: "warn",
		});

		expect(isPrinterEnabled()).toBe(false);
	});

	it("should disable printer when logLevel is error", () => {
		new OrchestratorImpl({
			directory: "test/fixtures/sops",
			logLevel: "error",
		});

		expect(isPrinterEnabled()).toBe(false);
	});

	it("should enable printer when logLevel is debug", () => {
		new OrchestratorImpl({
			directory: "test/fixtures/sops",
			logLevel: "debug",
		});

		expect(isPrinterEnabled()).toBe(true);
	});
});
