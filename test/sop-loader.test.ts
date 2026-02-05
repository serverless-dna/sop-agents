import { describe, expect, it, vi } from "vitest";
import {
  FileNotFoundError,
  FrontmatterParseError,
  FrontmatterValidationError,
} from "../src/types/errors";
import {
  generateZodSchema,
  loadSOP,
  validateFrontmatter,
} from "../src/agents/sop-loader";

describe("validateFrontmatter", () => {
  const filepath = "test.md";

  it("should validate frontmatter with all required fields", () => {
    const data = {
      name: "test-agent",
      description: "A test agent",
      version: "1.0.0",
      type: "agent",
    };

    const result = validateFrontmatter(data, filepath);

    expect(result.name).toBe("test-agent");
    expect(result.description).toBe("A test agent");
    expect(result.version).toBe("1.0.0");
    expect(result.type).toBe("agent");
  });

  it("should default type to 'agent' when not specified", () => {
    const data = {
      name: "test-agent",
      description: "A test agent",
    };

    const result = validateFrontmatter(data, filepath);

    expect(result.type).toBe("agent");
  });

  it("should throw error when name is missing", () => {
    const data = {
      description: "A test agent",
    };

    expect(() => validateFrontmatter(data, filepath)).toThrow(
      FrontmatterValidationError,
    );
  });

  it("should throw error when description is missing", () => {
    const data = {
      name: "test-agent",
    };

    expect(() => validateFrontmatter(data, filepath)).toThrow(
      FrontmatterValidationError,
    );
  });

  it("should throw error for invalid type value", () => {
    const data = {
      name: "test-agent",
      description: "A test agent",
      type: "invalid",
    };

    expect(() => validateFrontmatter(data, filepath)).toThrow(
      FrontmatterValidationError,
    );
  });

  it("should throw error when frontmatter is not an object", () => {
    expect(() => validateFrontmatter(null, filepath)).toThrow(
      FrontmatterValidationError,
    );
    expect(() => validateFrontmatter("string", filepath)).toThrow(
      FrontmatterValidationError,
    );
  });
});

describe("generateZodSchema", () => {
  it("should always include task field", () => {
    const schema = generateZodSchema();
    const result = schema.safeParse({ task: "do something" });

    expect(result.success).toBe(true);
  });

  it("should generate schema for string input", () => {
    const schema = generateZodSchema({
      name: { type: "string", description: "A name" },
    });

    const result = schema.safeParse({ task: "test", name: "John" });
    expect(result.success).toBe(true);
  });

  it("should generate schema for number input", () => {
    const schema = generateZodSchema({
      count: { type: "number", description: "A count" },
    });

    const result = schema.safeParse({ task: "test", count: 42 });
    expect(result.success).toBe(true);

    const invalid = schema.safeParse({ task: "test", count: "not a number" });
    expect(invalid.success).toBe(false);
  });

  it("should generate schema for boolean input", () => {
    const schema = generateZodSchema({
      enabled: { type: "boolean", description: "Is enabled" },
    });

    const result = schema.safeParse({ task: "test", enabled: true });
    expect(result.success).toBe(true);
  });

  it("should generate schema for enum input", () => {
    const schema = generateZodSchema({
      level: {
        type: "enum",
        description: "Level",
        values: ["low", "medium", "high"],
      },
    });

    const result = schema.safeParse({ task: "test", level: "medium" });
    expect(result.success).toBe(true);

    const invalid = schema.safeParse({ task: "test", level: "invalid" });
    expect(invalid.success).toBe(false);
  });

  it("should generate schema for list input", () => {
    const schema = generateZodSchema({
      tags: { type: "list", description: "Tags" },
    });

    const result = schema.safeParse({ task: "test", tags: ["a", "b", "c"] });
    expect(result.success).toBe(true);
  });

  it("should apply default values", () => {
    const schema = generateZodSchema({
      level: {
        type: "string",
        description: "Level",
        default: "medium",
      },
    });

    const result = schema.parse({ task: "test" });
    expect(result.level).toBe("medium");
  });

  it("should mark fields as optional when required is false", () => {
    const schema = generateZodSchema({
      optional_field: {
        type: "string",
        description: "Optional",
        required: false,
      },
    });

    const result = schema.safeParse({ task: "test" });
    expect(result.success).toBe(true);
  });
});

describe("loadSOP", () => {
  it("should load and parse a valid SOP file with all fields", async () => {
    const result = await loadSOP("test/fixtures/sops/research.md");

    expect(result.name).toBe("research");
    expect(result.description).toBe(
      "Researches topics and gathers information from various sources",
    );
    expect(result.version).toBe("1.0.0");
    expect(result.type).toBe("agent");
    expect(result.tools).toContain("web_search");
    expect(result.inputs).toHaveProperty("topic");
    expect(result.body).toContain("# Research Agent");
  });

  it("should load SOP with minimal fields", async () => {
    const result = await loadSOP("test/fixtures/sops/orchestrator.md");

    expect(result.name).toBe("orchestrator");
    expect(result.description).toBeDefined();
    expect(result.type).toBe("orchestrator");
  });

  it("should throw FileNotFoundError for missing file", async () => {
    await expect(loadSOP("nonexistent.md")).rejects.toThrow(FileNotFoundError);
  });

  it("should throw FrontmatterValidationError for missing name", async () => {
    await expect(
      loadSOP("test/fixtures/invalid/missing-name.md"),
    ).rejects.toThrow(FrontmatterValidationError);
  });

  it("should throw FrontmatterParseError for bad YAML", async () => {
    await expect(loadSOP("test/fixtures/invalid/bad-yaml.md")).rejects.toThrow(
      FrontmatterParseError,
    );
  });

  it("should log warning when name does not match filename", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    // Create a temp file with mismatched name
    const fs = await import("node:fs");
    const tempPath = "test/fixtures/sops/temp-mismatch.md";
    fs.writeFileSync(
      tempPath,
      `---
name: different-name
description: Test mismatch
---
# Content`,
    );

    try {
      await loadSOP(tempPath);
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining("does not match filename"),
      );
    } finally {
      fs.unlinkSync(tempPath);
      warnSpy.mockRestore();
    }
  });
});
