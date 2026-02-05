/**
 * Interactive Chat Example
 *
 * This example demonstrates how to use the SOP Agents orchestrator in an
 * interactive chat mode. The orchestrator automatically discovers agent SOPs
 * from the specified directory and coordinates them to handle user requests.
 *
 * Run with: npx ts-node examples/chat.ts
 */

import * as readline from "node:readline";
import { createOrchestrator } from "@serverless-dna/sop-agents";

async function main() {
	console.log("=== INITIALIZING ORCHESTRATOR ===\n");

	// Create the orchestrator by pointing it at a directory of SOP files.
	// The orchestrator will:
	// 1. Discover all .md files in the directory
	// 2. Parse their frontmatter to extract agent metadata
	// 3. Generate callable tools for each agent
	// 4. Set up the coordination layer to route requests
	const orchestrator = await createOrchestrator({
		// Directory containing your agent SOP markdown files
		directory: "./examples/sops",

		// How to handle errors during SOP loading:
		// - "fail-fast": Stop immediately on first error (good for development)
		// - "continue": Skip invalid SOPs and continue (good for production)
		errorMode: "fail-fast",

		// Logging verbosity: "debug" | "info" | "warn" | "error"
		logLevel: "info",
	});

	console.log("=== CHAT MODE (type /quit to exit) ===\n");

	// Set up readline for interactive input
	const rl = readline.createInterface({
		input: process.stdin,
		output: process.stdout,
	});

	const chat = async () => {
		while (true) {
			// Prompt for user input
			const input = await new Promise<string>((resolve) => {
				rl.question("You: ", resolve);
			});

			const trimmed = input.trim();

			// Handle exit commands
			if (trimmed === "/quit" || trimmed === "/exit") {
				console.log("\nGoodbye!");
				rl.close();
				break;
			}

			if (!trimmed) continue;

			rl.pause();
			process.stdout.write("\nAssistant: ");

			try {
				// Stream the response from the orchestrator.
				// The orchestrator analyzes your request and decides which agent(s)
				// to invoke. It may call a single agent, chain multiple agents,
				// or handle the request directly if no agent is needed.
				for await (const event of orchestrator.stream(trimmed)) {
					const evt = event as any;

					// Filter for text delta events to display streamed text.
					// The stream emits various event types; we only care about
					// the actual text content being generated.
					if (
						evt.type === "modelContentBlockDeltaEvent" &&
						evt.delta?.type === "textDelta"
					) {
						process.stdout.write(evt.delta.text ?? "");
					}
				}
			} catch (error) {
				console.error("\nError:", error instanceof Error ? error.message : error);
			}

			console.log("\n");
			rl.resume();
		}
	};

	await chat();
}

main().catch(console.error);
