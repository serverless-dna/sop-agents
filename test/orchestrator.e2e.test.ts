import { afterEach, describe, expect, it, vi } from "vitest";
import { createOrchestrator } from "../src/orchestrator";
import { clearCache } from "../src/tool-generator";

// Track tool invocations for verification
const toolInvocations: Array<{ name: string; task: string }> = [];

// Mock the @strands-agents/sdk module
vi.mock("@strands-agents/sdk", () => {
	class MockAgent {
		systemPrompt: string;
		tools: unknown[];

		constructor(config: { systemPrompt?: string; tools?: unknown[] }) {
			this.systemPrompt = config.systemPrompt || "";
			this.tools = config.tools || [];
		}

		async invoke(prompt: string) {
			// Simulate orchestrator behavior based on prompt
			const tools = this.tools as Array<{
				name: string;
				invoke: (input: Record<string, unknown>) => Promise<string>;
			}>;

			// Check if this is the orchestrator (has tools) or a sub-agent (no tools)
			if (tools.length > 0) {
				// Orchestrator - simulate delegation based on prompt content
				if (prompt.toLowerCase().includes("research") && prompt.toLowerCase().includes("write")) {
					// Multi-agent delegation
					const researchTool = tools.find((t) => t.name === "agent_research");
					const writerTool = tools.find((t) => t.name === "agent_writer");

					let researchResult = "";
					let writeResult = "";

					if (researchTool) {
						researchResult = await researchTool.invoke({
							task: "Research the topic",
							topic: "AI trends",
						});
					}

					if (writerTool) {
						writeResult = await writerTool.invoke({
							task: "Write a summary based on research",
							content_type: "summary",
							context: researchResult,
						});
					}

					return {
						lastMessage: {
							content: [
								{
									type: "textBlock",
									text: `Combined result: Research: ${researchResult}, Writing: ${writeResult}`,
								},
							],
						},
					};
				}

				if (prompt.toLowerCase().includes("research")) {
					// Single agent delegation - research only
					const researchTool = tools.find((t) => t.name === "agent_research");
					if (researchTool) {
						const result = await researchTool.invoke({
							task: "Research the topic",
							topic: "AI trends",
						});
						return {
							lastMessage: {
								content: [{ type: "textBlock", text: `Research result: ${result}` }],
							},
						};
					}
				}

				if (prompt.toLowerCase().includes("write")) {
					// Single agent delegation - writer only
					const writerTool = tools.find((t) => t.name === "agent_writer");
					if (writerTool) {
						const result = await writerTool.invoke({
							task: "Write content",
							content_type: "article",
						});
						return {
							lastMessage: {
								content: [{ type: "textBlock", text: `Writing result: ${result}` }],
							},
						};
					}
				}

				// Direct response without delegation
				return {
					lastMessage: {
						content: [
							{
								type: "textBlock",
								text: "Direct response from orchestrator without delegation",
							},
						],
					},
				};
			}

			// Sub-agent response
			return {
				lastMessage: {
					content: [{ type: "textBlock", text: `Agent response for: ${prompt}` }],
				},
			};
		}

		async *stream(prompt: string) {
			// Simulate streaming by yielding events then returning final result
			const invokeResult = await this.invoke(prompt);
			const text = invokeResult.lastMessage?.content[0]?.text || "";
			
			// Yield text delta events
			yield { type: "modelContentBlockDeltaEvent", delta: { type: "textDelta", text } };
			
			// Return the final result structure (this is what result.value will be when done)
			return invokeResult;
		}
	}

	return {
		Agent: MockAgent,
		tool: vi.fn().mockImplementation((config) => {
			const toolObj = {
				name: config.name,
				description: config.description,
				toolSpec: {
					name: config.name,
					description: config.description,
					inputSchema: config.inputSchema,
				},
				invoke: async (input: Record<string, unknown>) => {
					// Track invocation
					toolInvocations.push({
						name: config.name,
						task: input.task as string,
					});

					// Call the callback - it might be an async generator or regular async function
					const result = config.callback(input);

					// Check if it's an async generator (has Symbol.asyncIterator)
					if (result && typeof result[Symbol.asyncIterator] === "function") {
						// Consume the generator and return the final value
						let finalValue = "";
						let iterResult = await result.next();
						while (!iterResult.done) {
							// Accumulate yielded values (they're strings)
							if (typeof iterResult.value === "string") {
								finalValue += iterResult.value;
							}
							iterResult = await result.next();
						}
						// Return the final returned value, or accumulated string
						return iterResult.value || finalValue;
					}

					// Regular async function - just await it
					return result;
				},
				stream: vi.fn(),
			};
			return toolObj;
		}),
	};
});

describe("End-to-End Orchestration", () => {
	afterEach(() => {
		clearCache();
		toolInvocations.length = 0;
		vi.clearAllMocks();
	});

	it("should handle multi-agent delegation (research + write)", async () => {
		const orchestrator = await createOrchestrator({
			directory: "test/fixtures/sops",
		});

		const result = await orchestrator.invoke(
			"Research AI trends and write a summary about them",
		);

		// Should have invoked both agents
		expect(toolInvocations.length).toBe(2);
		expect(toolInvocations.some((i) => i.name === "agent_research")).toBe(true);
		expect(toolInvocations.some((i) => i.name === "agent_writer")).toBe(true);

		// Result should contain combined output
		expect(result).toContain("Research");
		expect(result).toContain("Writing");
	});

	it("should handle single-agent delegation", async () => {
		const orchestrator = await createOrchestrator({
			directory: "test/fixtures/sops",
		});

		const result = await orchestrator.invoke("Research the latest AI trends");

		// Should have invoked only research agent
		expect(toolInvocations.length).toBe(1);
		expect(toolInvocations[0].name).toBe("agent_research");

		expect(result).toContain("Research");
	});

	it("should handle direct response without delegation", async () => {
		const orchestrator = await createOrchestrator({
			directory: "test/fixtures/sops",
		});

		const result = await orchestrator.invoke("Hello, how are you?");

		// Should not have invoked any agents
		expect(toolInvocations.length).toBe(0);

		expect(result).toContain("Direct response");
	});

	it("should pass context between agents", async () => {
		const orchestrator = await createOrchestrator({
			directory: "test/fixtures/sops",
		});

		const result = await orchestrator.invoke(
			"Research AI and write a report about it",
		);

		// Verify both agents were called
		expect(toolInvocations.length).toBe(2);

		// Research should be called first
		expect(toolInvocations[0].name).toBe("agent_research");

		// Writer should be called second with context from research
		expect(toolInvocations[1].name).toBe("agent_writer");

		// Result should show combined output
		expect(result).toContain("Combined result");
	});
});
