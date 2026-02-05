import * as fs from "node:fs";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  DirectoryNotFoundError,
  MultipleOrchestratorsError,
  OrchestratorNotFoundError,
} from "../src/errors";
import { discoverAgents, findOrchestrator } from "../src/agent-discovery";

describe("discoverAgents", () => {
  it("should discover multiple agents from a directory", async () => {
    const registry = await discoverAgents("test/fixtures/sops");

    expect(registry.size).toBe(2);
    expect(registry.has("research")).toBe(true);
    expect(registry.has("writer")).toBe(true);
  });

  it("should filter out orchestrator SOPs", async () => {
    const registry = await discoverAgents("test/fixtures/sops");

    expect(registry.has("orchestrator")).toBe(false);
  });

  it("should throw DirectoryNotFoundError for missing directory", async () => {
    await expect(discoverAgents("nonexistent-dir")).rejects.toThrow(
      DirectoryNotFoundError,
    );
  });

  it("should return empty Map and log warning for empty directory", async () => {
    const tempDir = "test/fixtures/empty-temp";
    fs.mkdirSync(tempDir, { recursive: true });

    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    try {
      const registry = await discoverAgents(tempDir);

      expect(registry.size).toBe(0);
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining("No .md files found"),
      );
    } finally {
      fs.rmdirSync(tempDir);
      warnSpy.mockRestore();
    }
  });

  it("should log errors for invalid files and continue processing", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const registry = await discoverAgents("test/fixtures/invalid");

    // Should have logged errors for invalid files
    expect(errorSpy).toHaveBeenCalled();
    // Should return empty map since all files are invalid
    expect(registry.size).toBe(0);

    errorSpy.mockRestore();
  });

  it("should return SOPDefinition with correct properties", async () => {
    const registry = await discoverAgents("test/fixtures/sops");
    const research = registry.get("research");

    expect(research).toBeDefined();
    expect(research?.name).toBe("research");
    expect(research?.description).toBe(
      "Researches topics and gathers information from various sources",
    );
    expect(research?.type).toBe("agent");
    expect(research?.inputs).toHaveProperty("topic");
  });
});

describe("findOrchestrator", () => {
  it("should find the orchestrator SOP in a directory", async () => {
    const orchestrator = await findOrchestrator("test/fixtures/sops");

    expect(orchestrator.name).toBe("orchestrator");
    expect(orchestrator.type).toBe("orchestrator");
    expect(orchestrator.description).toBe(
      "Master orchestrator that delegates tasks to specialized agents",
    );
  });

  it("should throw DirectoryNotFoundError for missing directory", async () => {
    await expect(findOrchestrator("nonexistent-dir")).rejects.toThrow(
      DirectoryNotFoundError,
    );
  });

  it("should throw OrchestratorNotFoundError when no orchestrator exists", async () => {
    const tempDir = "test/fixtures/no-orchestrator-temp";
    fs.mkdirSync(tempDir, { recursive: true });
    
    // Create an agent-only SOP
    fs.writeFileSync(
      path.join(tempDir, "agent.md"),
      `---
name: agent
description: A simple agent
type: agent
---
# Agent Content`,
    );

    try {
      await expect(findOrchestrator(tempDir)).rejects.toThrow(
        OrchestratorNotFoundError,
      );
    } finally {
      fs.unlinkSync(path.join(tempDir, "agent.md"));
      fs.rmdirSync(tempDir);
    }
  });

  it("should throw MultipleOrchestratorsError when multiple orchestrators exist", async () => {
    const tempDir = "test/fixtures/multi-orchestrator-temp";
    fs.mkdirSync(tempDir, { recursive: true });

    // Create two orchestrator SOPs
    fs.writeFileSync(
      path.join(tempDir, "orchestrator1.md"),
      `---
name: orchestrator1
description: First orchestrator
type: orchestrator
---
# Orchestrator 1`,
    );
    fs.writeFileSync(
      path.join(tempDir, "orchestrator2.md"),
      `---
name: orchestrator2
description: Second orchestrator
type: orchestrator
---
# Orchestrator 2`,
    );

    try {
      await expect(findOrchestrator(tempDir)).rejects.toThrow(
        MultipleOrchestratorsError,
      );
    } finally {
      fs.unlinkSync(path.join(tempDir, "orchestrator1.md"));
      fs.unlinkSync(path.join(tempDir, "orchestrator2.md"));
      fs.rmdirSync(tempDir);
    }
  });

  it("should skip invalid files when searching for orchestrator", async () => {
    // The invalid fixtures directory has no valid orchestrator
    await expect(findOrchestrator("test/fixtures/invalid")).rejects.toThrow(
      OrchestratorNotFoundError,
    );
  });
});
