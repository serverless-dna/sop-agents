import { describe, expect, it } from "vitest";
import { parseModelSpec } from "../src/model-factory";

describe("parseModelSpec", () => {
	describe("with provider prefix", () => {
		it("should parse bedrock provider", () => {
			const result = parseModelSpec(
				"bedrock/us.anthropic.claude-sonnet-4-20250514-v1:0",
			);
			expect(result.provider).toBe("bedrock");
			expect(result.modelId).toBe("us.anthropic.claude-sonnet-4-20250514-v1:0");
		});

		it("should parse openai provider", () => {
			const result = parseModelSpec("openai/gpt-4o");
			expect(result.provider).toBe("openai");
			expect(result.modelId).toBe("gpt-4o");
		});

		it("should handle case-insensitive provider names", () => {
			const result1 = parseModelSpec("BEDROCK/model-id");
			expect(result1.provider).toBe("bedrock");

			const result2 = parseModelSpec("OpenAI/gpt-4");
			expect(result2.provider).toBe("openai");
		});
	});

	describe("without provider prefix", () => {
		it("should default to bedrock when no prefix", () => {
			const result = parseModelSpec(
				"us.anthropic.claude-sonnet-4-20250514-v1:0",
			);
			expect(result.provider).toBe("bedrock");
			expect(result.modelId).toBe("us.anthropic.claude-sonnet-4-20250514-v1:0");
		});

		it("should use custom default provider when specified", () => {
			const result = parseModelSpec("gpt-4o", "openai");
			expect(result.provider).toBe("openai");
			expect(result.modelId).toBe("gpt-4o");
		});
	});

	describe("with unknown provider prefix", () => {
		it("should treat unknown provider as part of model ID and use default", () => {
			const result = parseModelSpec("unknown/some-model");
			expect(result.provider).toBe("bedrock");
			expect(result.modelId).toBe("unknown/some-model");
		});

		it("should use custom default for unknown provider", () => {
			const result = parseModelSpec("anthropic/claude-3", "openai");
			expect(result.provider).toBe("openai");
			expect(result.modelId).toBe("anthropic/claude-3");
		});
	});

	describe("edge cases", () => {
		it("should handle model IDs with multiple slashes", () => {
			const result = parseModelSpec("bedrock/us.region/model-name");
			expect(result.provider).toBe("bedrock");
			expect(result.modelId).toBe("us.region/model-name");
		});

		it("should handle empty model ID after provider", () => {
			const result = parseModelSpec("bedrock/");
			expect(result.provider).toBe("bedrock");
			expect(result.modelId).toBe("");
		});
	});
});
