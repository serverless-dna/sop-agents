import type { LogEntry, Logger, LogLevel } from "./types/types.js";

/**
 * Log level priority for filtering
 */
const LOG_LEVEL_PRIORITY: Record<LogLevel, number> = {
	debug: 0,
	info: 1,
	warn: 2,
	error: 3,
};

/**
 * Logger implementation for orchestrator logging
 */
export class LoggerImpl implements Logger {
	private level: LogLevel;
	private correlationId?: string;
	private agentName?: string;
	private output: (entry: LogEntry) => void;

	constructor(
		level: LogLevel = "info",
		correlationId?: string,
		agentName?: string,
		output?: (entry: LogEntry) => void,
	) {
		this.level = level;
		this.correlationId = correlationId;
		this.agentName = agentName;
		this.output = output ?? this.defaultOutput;
	}

	private defaultOutput(entry: LogEntry): void {
		const parts = [
			`[${entry.timestamp.toISOString()}]`,
			`[${entry.level.toUpperCase()}]`,
			entry.correlationId ? `[${entry.correlationId}]` : null,
			entry.agentName ? `[${entry.agentName}]` : null,
			entry.message,
		].filter(Boolean);

		const line = parts.join(" ");

		if (entry.duration !== undefined) {
			console.log(`${line} (${entry.duration}ms)`);
		} else if (entry.error) {
			console.log(`${line}\n${entry.error.stack ?? entry.error.message}`);
		} else {
			console.log(line);
		}
	}

	private shouldLog(level: LogLevel): boolean {
		return LOG_LEVEL_PRIORITY[level] >= LOG_LEVEL_PRIORITY[this.level];
	}

	private log(
		level: LogLevel,
		message: string,
		error?: Error,
		metadata?: Record<string, unknown>,
	): void {
		if (!this.shouldLog(level)) {
			return;
		}

		const entry: LogEntry = {
			timestamp: new Date(),
			correlationId: this.correlationId ?? "",
			level,
			agentName: this.agentName,
			message,
			error,
			metadata,
		};

		this.output(entry);
	}

	debug(message: string, metadata?: Record<string, unknown>): void {
		this.log("debug", message, undefined, metadata);
	}

	info(message: string, metadata?: Record<string, unknown>): void {
		this.log("info", message, undefined, metadata);
	}

	warn(message: string, metadata?: Record<string, unknown>): void {
		this.log("warn", message, undefined, metadata);
	}

	error(
		message: string,
		error?: Error,
		metadata?: Record<string, unknown>,
	): void {
		this.log("error", message, error, metadata);
	}

	withCorrelationId(correlationId: string): Logger {
		return new LoggerImpl(
			this.level,
			correlationId,
			this.agentName,
			this.output,
		);
	}

	withAgent(agentName: string): Logger {
		return new LoggerImpl(
			this.level,
			this.correlationId,
			agentName,
			this.output,
		);
	}

	setLevel(level: LogLevel): void {
		this.level = level;
	}
}

/**
 * Create a new logger instance
 */
export function createLogger(level: LogLevel = "info"): Logger {
	return new LoggerImpl(level);
}
