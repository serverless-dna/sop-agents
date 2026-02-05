import * as readline from "node:readline";
import { createOrchestrator } from "./src";

async function main() {
	console.log("=== INITIALIZING ORCHESTRATOR ===\n");

	const orchestrator = await createOrchestrator({
		directory: "./sops",
		errorMode: "fail-fast",
		logLevel: "info",
	});

	console.log("=== CHAT MODE (type /quit to exit) ===\n");

	const rl = readline.createInterface({
		input: process.stdin,
		output: process.stdout,
	});

	const chat = async () => {
		while (true) {
			const input = await new Promise<string>((resolve) => {
				rl.question("You: ", resolve);
			});

			const trimmed = input.trim();

			if (trimmed === "/quit" || trimmed === "/exit") {
				console.log("\nGoodbye!");
				rl.close();
				break;
			}

			if (!trimmed) continue;

			// Pause readline to prevent interference with streaming output
			rl.pause();
			process.stdout.write("\nAssistant: ");

			try {
				for await (const event of orchestrator.stream(trimmed)) {
					// biome-ignore lint/suspicious/noExplicitAny: SDK event types vary
					const evt = event as any;
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
