import * as fs from "node:fs";
import * as path from "node:path";
import { DEFAULT_ORCHESTRATOR } from "../orchestrator/default-orchestrator.js";
import {
	DirectoryNotFoundError,
	MultipleOrchestratorsError,
} from "../types/errors.js";
import type { SOPDefinition } from "../types/types.js";
import { loadSOP } from "./sop-loader.js";

/**
 * Scans a directory for SOP files and builds an agent registry.
 * Excludes orchestrator SOPs (type: orchestrator).
 *
 * @param directory - Path to scan (default: "./sops")
 * @returns Map of agent name to SOPDefinition (excludes orchestrators)
 * @throws DirectoryNotFoundError if directory doesn't exist
 */
export async function discoverAgents(
	directory = "./sops",
): Promise<Map<string, SOPDefinition>> {
	// Check if directory exists
	if (!fs.existsSync(directory)) {
		throw new DirectoryNotFoundError(directory);
	}

	const stats = fs.statSync(directory);
	if (!stats.isDirectory()) {
		throw new DirectoryNotFoundError(directory);
	}

	// Find all .md files in the directory
	const files = fs.readdirSync(directory);
	const mdFiles = files.filter((file) => file.endsWith(".md"));

	// Log warning for empty directories
	if (mdFiles.length === 0) {
		console.warn(`Warning: No .md files found in directory: ${directory}`);
		return new Map();
	}

	const registry = new Map<string, SOPDefinition>();

	// Load each file and filter out orchestrators
	for (const file of mdFiles) {
		const filepath = path.join(directory, file);
		try {
			const sop = await loadSOP(filepath);

			// Filter out orchestrator SOPs
			if (sop.type !== "orchestrator") {
				registry.set(sop.name, sop);
			}
		} catch (error) {
			// Log error and continue processing other files
			const errorMessage =
				error instanceof Error ? error.message : String(error);
			console.error(`Error loading SOP file ${filepath}: ${errorMessage}`);
		}
	}

	return registry;
}

/**
 * Finds the orchestrator SOP in a directory.
 * Returns the built-in default orchestrator if none is found.
 *
 * @param directory - Path to scan (default: "./sops")
 * @returns The orchestrator SOPDefinition (user-defined or default)
 * @throws DirectoryNotFoundError if directory doesn't exist
 * @throws MultipleOrchestratorsError if more than one orchestrator found
 */
export async function findOrchestrator(
	directory = "./sops",
): Promise<SOPDefinition> {
	// Check if directory exists
	if (!fs.existsSync(directory)) {
		throw new DirectoryNotFoundError(directory);
	}

	const stats = fs.statSync(directory);
	if (!stats.isDirectory()) {
		throw new DirectoryNotFoundError(directory);
	}

	// Find all .md files in the directory
	const files = fs.readdirSync(directory);
	const mdFiles = files.filter((file) => file.endsWith(".md"));

	const orchestrators: SOPDefinition[] = [];
	const orchestratorFiles: string[] = [];

	// Load each file and find orchestrators
	for (const file of mdFiles) {
		const filepath = path.join(directory, file);
		try {
			const sop = await loadSOP(filepath);

			if (sop.type === "orchestrator") {
				orchestrators.push(sop);
				orchestratorFiles.push(filepath);
			}
		} catch (_error) {
			// Skip invalid files when searching for orchestrator
		}
	}

	// Check for multiple orchestrators
	if (orchestrators.length > 1) {
		throw new MultipleOrchestratorsError(directory, orchestratorFiles);
	}

	// Return user-defined orchestrator or fall back to default
	if (orchestrators.length === 1) {
		return orchestrators[0];
	}

	return DEFAULT_ORCHESTRATOR;
}
