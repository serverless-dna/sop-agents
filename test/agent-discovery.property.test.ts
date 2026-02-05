import * as fs from "node:fs";
import * as path from "node:path";
import fc from "fast-check";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { discoverAgents } from "../src/agents/discovery";

const TEMP_DIR = "test/fixtures/temp-discovery";

beforeAll(() => {
  if (!fs.existsSync(TEMP_DIR)) {
    fs.mkdirSync(TEMP_DIR, { recursive: true });
  }
});

afterAll(() => {
  if (fs.existsSync(TEMP_DIR)) {
    fs.rmSync(TEMP_DIR, { recursive: true });
  }
});

// Generators - use simple alphanumeric strings to avoid YAML escaping issues
const validNameArb = fc.stringMatching(/^[a-z][a-z0-9]{0,10}$/);
const validDescriptionArb = fc.stringMatching(/^[a-zA-Z][a-zA-Z0-9 ]{5,30}$/);

const sopTypeArb = fc.constantFrom("agent", "orchestrator");

interface GeneratedSOP {
  name: string;
  description: string;
  type: "agent" | "orchestrator";
}

const sopArb: fc.Arbitrary<GeneratedSOP> = fc.record({
  name: validNameArb,
  description: validDescriptionArb,
  type: sopTypeArb,
});

function createSOPFile(dir: string, sop: GeneratedSOP): string {
  const filepath = path.join(dir, `${sop.name}.md`);
  // Use JSON.stringify for proper escaping
  const content = `---
name: ${JSON.stringify(sop.name)}
description: ${JSON.stringify(sop.description)}
type: ${sop.type}
---
# ${sop.name} Agent

Body content for ${sop.name}.
`;
  fs.writeFileSync(filepath, content);
  return filepath;
}

function cleanupDir(dir: string): void {
  if (fs.existsSync(dir)) {
    const files = fs.readdirSync(dir);
    for (const file of files) {
      fs.unlinkSync(path.join(dir, file));
    }
  }
}

/**
 * Property 5: Agent Discovery Filtering
 * For any directory containing SOP files, Agent_Discovery should return a Map
 * containing only SOPs where type is "agent" or type is not specified (defaulting to "agent"),
 * with agent name as key and SOPDefinition as value.
 * **Validates: Requirements 4.1, 4.2, 4.3**
 */
describe("Property 5: Agent Discovery Filtering", () => {
  it("should only include agent SOPs and exclude orchestrators", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(sopArb, { minLength: 1, maxLength: 5 })
          .filter((sops) => {
            // Ensure unique names
            const names = sops.map((s) => s.name);
            return new Set(names).size === names.length;
          }),
        async (sops) => {
          const testDir = path.join(TEMP_DIR, `test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
          fs.mkdirSync(testDir, { recursive: true });

          try {
            // Create SOP files
            for (const sop of sops) {
              createSOPFile(testDir, sop);
            }

            const registry = await discoverAgents(testDir);

            // Count expected agents (type === "agent")
            const expectedAgents = sops.filter((s) => s.type === "agent");

            // Registry should only contain agents
            expect(registry.size).toBe(expectedAgents.length);

            // All entries should be agents
            for (const [name, def] of registry) {
              expect(def.type).toBe("agent");
              expect(name).toBe(def.name);
            }

            // No orchestrators should be in registry
            const orchestrators = sops.filter((s) => s.type === "orchestrator");
            for (const orch of orchestrators) {
              expect(registry.has(orch.name)).toBe(false);
            }

            return true;
          } finally {
            cleanupDir(testDir);
            fs.rmdirSync(testDir);
          }
        }
      ),
      { numRuns: 100 }
    );
  });
});

/**
 * Property 6: Discovery Error Resilience
 * For any directory containing a mix of valid and invalid SOP files,
 * Agent_Discovery should successfully parse all valid files and log errors
 * for invalid files without failing the entire operation.
 * **Validates: Requirements 4.4, 4.5**
 */
describe("Property 6: Discovery Error Resilience", () => {
  it("should continue processing after encountering invalid files", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(sopArb.filter((s) => s.type === "agent"), { minLength: 1, maxLength: 3 })
          .filter((sops) => {
            const names = sops.map((s) => s.name);
            return new Set(names).size === names.length;
          }),
        fc.integer({ min: 1, max: 3 }),
        async (validSops, numInvalid) => {
          const testDir = path.join(TEMP_DIR, `resilience-${Date.now()}-${Math.random().toString(36).slice(2)}`);
          fs.mkdirSync(testDir, { recursive: true });

          const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

          try {
            // Create valid SOP files
            for (const sop of validSops) {
              createSOPFile(testDir, sop);
            }

            // Create invalid SOP files (missing required fields)
            for (let i = 0; i < numInvalid; i++) {
              const invalidPath = path.join(testDir, `invalid-${i}.md`);
              fs.writeFileSync(invalidPath, `---
description: Missing name field
---
# Invalid`);
            }

            const registry = await discoverAgents(testDir);

            // Should have logged errors for invalid files
            expect(errorSpy.mock.calls.length).toBeGreaterThanOrEqual(numInvalid);

            // Should still have all valid agents
            expect(registry.size).toBe(validSops.length);

            for (const sop of validSops) {
              expect(registry.has(sop.name)).toBe(true);
            }

            return true;
          } finally {
            errorSpy.mockRestore();
            cleanupDir(testDir);
            fs.rmdirSync(testDir);
          }
        }
      ),
      { numRuns: 100 }
    );
  });
});
