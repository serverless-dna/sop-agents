import type { Model } from "@strands-agents/sdk";
import { BedrockModel } from "@strands-agents/sdk/bedrock";

/**
 * Supported model providers
 */
export type ModelProvider = "bedrock" | "openai";

/**
 * Parsed model specification
 */
export interface ParsedModelSpec {
	provider: ModelProvider;
	modelId: string;
}

/**
 * Parse a model specification string into provider and model ID.
 * Format: "<provider>/<modelId>" or just "<modelId>" (defaults to bedrock)
 *
 * @example
 * parseModelSpec("bedrock/us.anthropic.claude-sonnet-4-20250514-v1:0")
 * // => { provider: "bedrock", modelId: "us.anthropic.claude-sonnet-4-20250514-v1:0" }
 *
 * parseModelSpec("openai/gpt-4o")
 * // => { provider: "openai", modelId: "gpt-4o" }
 *
 * parseModelSpec("us.anthropic.claude-sonnet-4-20250514-v1:0")
 * // => { provider: "bedrock", modelId: "us.anthropic.claude-sonnet-4-20250514-v1:0" }
 */
export function parseModelSpec(
	modelSpec: string,
	defaultProvider: ModelProvider = "bedrock",
): ParsedModelSpec {
	const slashIndex = modelSpec.indexOf("/");

	if (slashIndex === -1) {
		// No provider prefix, use default
		return { provider: defaultProvider, modelId: modelSpec };
	}

	const providerPart = modelSpec.substring(0, slashIndex).toLowerCase();
	const modelId = modelSpec.substring(slashIndex + 1);

	// Validate provider
	if (providerPart === "bedrock" || providerPart === "openai") {
		return { provider: providerPart, modelId };
	}

	// Unknown provider prefix - treat the whole thing as a model ID
	return { provider: defaultProvider, modelId: modelSpec };
}

/**
 * Create a Model instance from a parsed model specification
 */
export function createModel(spec: ParsedModelSpec): Model {
	switch (spec.provider) {
		case "bedrock":
			return new BedrockModel({ modelId: spec.modelId });
		case "openai": {
			// Dynamic import to avoid requiring openai package when not used
			// eslint-disable-next-line @typescript-eslint/no-require-imports
			const { OpenAIModel } = require("@strands-agents/sdk/openai");
			return new OpenAIModel({ modelId: spec.modelId });
		}
		default:
			throw new Error(`Unsupported model provider: ${spec.provider}`);
	}
}

/**
 * Create a Model instance from a model specification string
 */
export function createModelFromSpec(
	modelSpec: string,
	defaultProvider: ModelProvider = "bedrock",
): Model {
	const parsed = parseModelSpec(modelSpec, defaultProvider);
	return createModel(parsed);
}
