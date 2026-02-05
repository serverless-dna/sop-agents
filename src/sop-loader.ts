import * as fs from "node:fs";
import * as path from "node:path";
import matter from "gray-matter";
import { z } from "zod";
import {
	FileNotFoundError,
	FrontmatterParseError,
	FrontmatterValidationError,
} from "./errors";
import type { InputDef, SOPDefinition, SOPFrontmatter } from "./types";

/**
 * Validates frontmatter data against the SOPFrontmatter schema
 * @throws FrontmatterValidationError if validation fails
 */
export function validateFrontmatter(
	data: unknown,
	filepath: string,
): SOPFrontmatter {
	if (typeof data !== "object" || data === null) {
		throw new FrontmatterValidationError(
			filepath,
			"frontmatter",
			"must be an object",
		);
	}

	const obj = data as Record<string, unknown>;

	// Validate required 'name' field
	if (!("name" in obj) || obj.name === undefined || obj.name === null) {
		throw new FrontmatterValidationError(
			filepath,
			"name",
			"is required but missing",
		);
	}
	if (typeof obj.name !== "string" || obj.name.trim() === "") {
		throw new FrontmatterValidationError(
			filepath,
			"name",
			"must be a non-empty string",
		);
	}

	// Validate required 'description' field
	if (
		!("description" in obj) ||
		obj.description === undefined ||
		obj.description === null
	) {
		throw new FrontmatterValidationError(
			filepath,
			"description",
			"is required but missing",
		);
	}
	if (typeof obj.description !== "string" || obj.description.trim() === "") {
		throw new FrontmatterValidationError(
			filepath,
			"description",
			"must be a non-empty string",
		);
	}

	// Validate 'type' field if present
	if ("type" in obj && obj.type !== undefined) {
		if (obj.type !== "agent" && obj.type !== "orchestrator") {
			throw new FrontmatterValidationError(
				filepath,
				"type",
				'must be either "agent" or "orchestrator"',
			);
		}
	}

	// Validate optional fields
	const version = typeof obj.version === "string" ? obj.version : undefined;
	const tools = Array.isArray(obj.tools) ? (obj.tools as string[]) : undefined;
	const inputs =
		typeof obj.inputs === "object" && obj.inputs !== null
			? (obj.inputs as Record<string, InputDef>)
			: undefined;

	return {
		name: obj.name as string,
		description: obj.description as string,
		version,
		tools,
		inputs,
		type: (obj.type as "agent" | "orchestrator") ?? "agent", // Default to "agent"
	};
}

/**
 * Generates a Zod schema from input definitions
 * Always includes a required 'task' field
 */
export function generateZodSchema(
	inputs?: Record<string, InputDef>,
): z.ZodObject<z.ZodRawShape> {
	const shape: Record<string, z.ZodTypeAny> = {
		task: z.string().describe("The specific task to perform"),
	};

	if (inputs) {
		for (const [fieldName, inputDef] of Object.entries(inputs)) {
			let fieldSchema: z.ZodTypeAny;

			// Map InputDef type to Zod type
			switch (inputDef.type) {
				case "string":
					fieldSchema = z.string();
					break;
				case "number":
					fieldSchema = z.number();
					break;
				case "boolean":
					fieldSchema = z.boolean();
					break;
				case "enum":
					if (inputDef.values && inputDef.values.length > 0) {
						fieldSchema = z.enum(inputDef.values as [string, ...string[]]);
					} else {
						fieldSchema = z.string();
					}
					break;
				case "list":
					fieldSchema = z.array(z.string());
					break;
				default:
					fieldSchema = z.string();
			}

			// Apply description
			fieldSchema = fieldSchema.describe(inputDef.description);

			// Apply default value if specified
			if (inputDef.default !== undefined) {
				fieldSchema = fieldSchema.default(inputDef.default);
			}

			// Apply optional if required is false
			if (inputDef.required === false) {
				fieldSchema = fieldSchema.optional();
			}

			shape[fieldName] = fieldSchema;
		}
	}

	return z.object(shape);
}

/**
 * Loads and parses an SOP file
 * @throws FileNotFoundError if file doesn't exist
 * @throws FrontmatterParseError if YAML is malformed
 * @throws FrontmatterValidationError if frontmatter validation fails
 */
export async function loadSOP(filepath: string): Promise<SOPDefinition> {
	// Check if file exists
	if (!fs.existsSync(filepath)) {
		throw new FileNotFoundError(filepath);
	}

	// Read file content
	const content = fs.readFileSync(filepath, "utf-8");

	// Parse with gray-matter
	let parsed: matter.GrayMatterFile<string>;
	try {
		parsed = matter(content);
	} catch (error) {
		const errorMessage = error instanceof Error ? error.message : String(error);
		throw new FrontmatterParseError(filepath, errorMessage);
	}

	// Validate frontmatter
	const frontmatter = validateFrontmatter(parsed.data, filepath);

	// Check if name matches filename (log warning if not)
	const filename = path.basename(filepath, ".md");
	if (frontmatter.name !== filename) {
		console.warn(
			`Warning: SOP name "${frontmatter.name}" does not match filename "${filename}" in ${filepath}`,
		);
	}

	// Generate Zod schema from inputs
	const zodSchema = generateZodSchema(frontmatter.inputs);

	// Return complete SOPDefinition
	return {
		name: frontmatter.name,
		description: frontmatter.description,
		version: frontmatter.version ?? "1.0.0",
		tools: frontmatter.tools ?? [],
		inputs: frontmatter.inputs ?? {},
		body: parsed.content.trim(),
		filepath,
		type: frontmatter.type ?? "agent",
		zodSchema,
	};
}
