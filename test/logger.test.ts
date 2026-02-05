import { describe, expect, it, vi } from "vitest";
import { LoggerImpl, createLogger } from "../src/logger";
import type { LogEntry, LogLevel } from "../src/types";

describe("Logger", () => {
  describe("log level filtering", () => {
    it("should log messages at or above the configured level", () => {
      const entries: LogEntry[] = [];
      const logger = new LoggerImpl("info", undefined, undefined, (entry) =>
        entries.push(entry),
      );

      logger.debug("debug message");
      logger.info("info message");
      logger.warn("warn message");
      logger.error("error message");

      expect(entries).toHaveLength(3);
      expect(entries.map((e) => e.level)).toEqual(["info", "warn", "error"]);
    });

    it("should filter debug messages when level is info", () => {
      const entries: LogEntry[] = [];
      const logger = new LoggerImpl("info", undefined, undefined, (entry) =>
        entries.push(entry),
      );

      logger.debug("should not appear");

      expect(entries).toHaveLength(0);
    });

    it("should log all messages when level is debug", () => {
      const entries: LogEntry[] = [];
      const logger = new LoggerImpl("debug", undefined, undefined, (entry) =>
        entries.push(entry),
      );

      logger.debug("debug");
      logger.info("info");
      logger.warn("warn");
      logger.error("error");

      expect(entries).toHaveLength(4);
    });

    it("should only log errors when level is error", () => {
      const entries: LogEntry[] = [];
      const logger = new LoggerImpl("error", undefined, undefined, (entry) =>
        entries.push(entry),
      );

      logger.debug("debug");
      logger.info("info");
      logger.warn("warn");
      logger.error("error");

      expect(entries).toHaveLength(1);
      expect(entries[0].level).toBe("error");
    });
  });

  describe("withCorrelationId", () => {
    it("should create child logger with correlation ID", () => {
      const entries: LogEntry[] = [];
      const logger = new LoggerImpl("info", undefined, undefined, (entry) =>
        entries.push(entry),
      );

      const childLogger = logger.withCorrelationId("req-123");
      childLogger.info("test message");

      expect(entries).toHaveLength(1);
      expect(entries[0].correlationId).toBe("req-123");
    });

    it("should preserve log level in child logger", () => {
      const entries: LogEntry[] = [];
      const logger = new LoggerImpl("warn", undefined, undefined, (entry) =>
        entries.push(entry),
      );

      const childLogger = logger.withCorrelationId("req-123");
      childLogger.info("should not appear");
      childLogger.warn("should appear");

      expect(entries).toHaveLength(1);
      expect(entries[0].level).toBe("warn");
    });
  });

  describe("withAgent", () => {
    it("should create child logger with agent name", () => {
      const entries: LogEntry[] = [];
      const logger = new LoggerImpl("info", undefined, undefined, (entry) =>
        entries.push(entry),
      );

      const childLogger = logger.withAgent("research-agent");
      childLogger.info("test message");

      expect(entries).toHaveLength(1);
      expect(entries[0].agentName).toBe("research-agent");
    });

    it("should preserve correlation ID when adding agent", () => {
      const entries: LogEntry[] = [];
      const logger = new LoggerImpl("info", "req-456", undefined, (entry) =>
        entries.push(entry),
      );

      const childLogger = logger.withAgent("writer-agent");
      childLogger.info("test message");

      expect(entries).toHaveLength(1);
      expect(entries[0].correlationId).toBe("req-456");
      expect(entries[0].agentName).toBe("writer-agent");
    });
  });

  describe("LogEntry formatting", () => {
    it("should include timestamp in log entries", () => {
      const entries: LogEntry[] = [];
      const logger = new LoggerImpl("info", undefined, undefined, (entry) =>
        entries.push(entry),
      );

      const before = new Date();
      logger.info("test");
      const after = new Date();

      expect(entries[0].timestamp.getTime()).toBeGreaterThanOrEqual(
        before.getTime(),
      );
      expect(entries[0].timestamp.getTime()).toBeLessThanOrEqual(
        after.getTime(),
      );
    });

    it("should include all fields in log entry", () => {
      const entries: LogEntry[] = [];
      const logger = new LoggerImpl("info", "corr-id", "agent-name", (entry) =>
        entries.push(entry),
      );

      logger.info("test message", { key: "value" });

      const entry = entries[0];
      expect(entry.level).toBe("info");
      expect(entry.correlationId).toBe("corr-id");
      expect(entry.agentName).toBe("agent-name");
      expect(entry.message).toBe("test message");
      expect(entry.metadata).toEqual({ key: "value" });
    });

    it("should include error in log entry when provided", () => {
      const entries: LogEntry[] = [];
      const logger = new LoggerImpl("info", undefined, undefined, (entry) =>
        entries.push(entry),
      );

      const error = new Error("test error");
      logger.error("error occurred", error);

      expect(entries[0].error).toBe(error);
    });
  });

  describe("setLevel", () => {
    it("should change log level dynamically", () => {
      const entries: LogEntry[] = [];
      const logger = new LoggerImpl("error", undefined, undefined, (entry) =>
        entries.push(entry),
      );

      logger.info("should not appear");
      expect(entries).toHaveLength(0);

      logger.setLevel("info");
      logger.info("should appear");
      expect(entries).toHaveLength(1);
    });
  });

  describe("createLogger factory", () => {
    it("should create logger with default info level", () => {
      const logger = createLogger();
      expect(logger).toBeInstanceOf(LoggerImpl);
    });

    it("should create logger with specified level", () => {
      const entries: LogEntry[] = [];
      const logger = new LoggerImpl("debug", undefined, undefined, (entry) =>
        entries.push(entry),
      );

      logger.debug("debug message");
      expect(entries).toHaveLength(1);
    });
  });
});
