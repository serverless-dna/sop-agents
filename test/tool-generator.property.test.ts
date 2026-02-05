import fc from "fast-check";
import { afterEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import type { SOPDefinition, InputDef } from "../src/types";
import {
  buildAgentPrompt,
  clearCache,
  createTool,
  getOrCreateAgent,
} from "../src/tool-generator";
import { generateZodSchema } from "../src/sop-loader";

// Mock the @strands-agents/sdk module
vi.mock("@strands-agents/sdk", () => {
  // Use a class for proper constructor behavior
  class MockAgent {
    invoke = vi.fn().mockResolvedValue({
      lastMessage: {
        content: [{ type: "textBlock", text: "Mock response" }],
      },
    });
  }

  return {
    Agent: MockAgent,
    tool: vi.fn().mockImplementation((config) => ({
      name: config.name,
      description: config.description,
      toolSpec: {
        name: config.name,
        description: config.description,
        inputSchema: config.inputSchema,
      },
      invoke: config.callback,
      stream: vi.fn(),
    })),
  };
});

// Generators
const validNameArb = fc.stringMatching(/^[a-z][a-z0-9-]{0,15}$/);
const validDescriptionArb = fc.stringMatching(/^[a-zA-Z][a-zA-Z0-9 ]{5,50}$/);

const inputTypeArb = fc.constantFrom(
  "string",
  "number",
  "boolean",
  "enum",
  "list",
) as fc.Arbitrary<"string" | "number" | "boolean" | "enum" | "list">;

const inputDefArb: fc.Arbitrary<InputDef> = fc
  .record({
    type: inputTypeArb,
    description: validDescriptionArb,
    required: fc.option(fc.boolean(), { nil: undefined }),
    default: fc.option(fc.oneof(fc.string(), fc.integer(), fc.boolean()), {
      nil: undefined,
    }),
    values: fc.option(
      fc.array(fc.stringMatching(/^[a-z]{2,8}$/), { minLength: 2, maxLength: 5 }),
      { nil: undefined },
    ),
  })
  .filter((def) => {
    // enum type requires values
    if (def.type === "enum") return def.values !== undefined;
    // default value should match type
    if (def.default !== undefined) {
      if (def.type === "string" && typeof def.default !== "string") return false;
      if (def.type === "number" && typeof def.default !== "number") return false;
      if (def.type === "boolean" && typeof def.default !== "boolean") return false;
    }
    return true;
  });

const inputsArb = fc.dictionary(
  fc.stringMatching(/^[a-z][a-z_]{2,10}$/),
  inputDefArb,
  { minKeys: 0, maxKeys: 3 },
);

function createSOPFromInputs(
  name: string,
  description: string,
  inputs: Record<string, InputDef>,
): SOPDefinition {
  return {
    name,
    description,
    version: "1.0.0",
    tools: [],
    inputs,
    body: `# ${name} Agent\n\nYou are a ${name} agent.`,
    filepath: `test/fixtures/sops/${name}.md`,
    type: "agent",
    zodSchema: generateZodSchema(inputs),
  };
}

/**
 * Property 7: Tool Generation Correctness
 * For any SOPDefinition, the generated Strands tool should:
 * - Have name matching pattern `agent_{sop.name}`
 * - Have description matching sop.description
 * - Have schema including required `task` field of type string
 * - Have schema including all fields from sop.inputs with correct types and constraints
 * **Validates: Requirements 5.1, 5.2, 5.3, 5.4, 5.7**
 */
describe("Property 7: Tool Generation Correctness", () => {
  afterEach(() => {
    clearCache();
  });

  it("should generate tool with correct name pattern agent_{sop.name}", () => {
    fc.assert(
      fc.property(validNameArb, validDescriptionArb, inputsArb, (name, description, inputs) => {
        const sop = createSOPFromInputs(name, description, inputs);
        const tool = createTool(sop);

        expect(tool.name).toBe(`agent_${name}`);
        return true;
      }),
      { numRuns: 100 },
    );
  });

  it("should use sop.description as tool description", () => {
    fc.assert(
      fc.property(validNameArb, validDescriptionArb, inputsArb, (name, description, inputs) => {
        const sop = createSOPFromInputs(name, description, inputs);
        const tool = createTool(sop);

        expect(tool.description).toBe(description);
        return true;
      }),
      { numRuns: 100 },
    );
  });

  it("should include task field in schema", () => {
    fc.assert(
      fc.property(validNameArb, validDescriptionArb, inputsArb, (name, description, inputs) => {
        const sop = createSOPFromInputs(name, description, inputs);
        const tool = createTool(sop);

        // The schema should have a task field
        const schema = tool.toolSpec.inputSchema as z.ZodObject<z.ZodRawShape>;
        const shape = schema.shape;
        expect(shape).toHaveProperty("task");
        return true;
      }),
      { numRuns: 100 },
    );
  });

  it("should include all input fields in schema", () => {
    fc.assert(
      fc.property(validNameArb, validDescriptionArb, inputsArb, (name, description, inputs) => {
        const sop = createSOPFromInputs(name, description, inputs);
        const tool = createTool(sop);

        const schema = tool.toolSpec.inputSchema as z.ZodObject<z.ZodRawShape>;
        const shape = schema.shape;

        // All input fields should be in the schema
        for (const fieldName of Object.keys(inputs)) {
          expect(shape).toHaveProperty(fieldName);
        }
        return true;
      }),
      { numRuns: 100 },
    );
  });
});

/**
 * Property 8: Agent Caching Idempotence
 * For any SOPDefinition, calling getOrCreateAgent multiple times should return
 * the same agent instance (reference equality).
 * **Validates: Requirements 6.1, 6.2**
 */
describe("Property 8: Agent Caching Idempotence", () => {
  afterEach(() => {
    clearCache();
  });

  it("should return same agent instance for repeated calls with same SOP", () => {
    fc.assert(
      fc.property(
        validNameArb,
        validDescriptionArb,
        fc.integer({ min: 2, max: 10 }),
        (name, description, numCalls) => {
          const sop = createSOPFromInputs(name, description, {});

          const agents: unknown[] = [];
          for (let i = 0; i < numCalls; i++) {
            agents.push(getOrCreateAgent(sop));
          }

          // All agents should be the same instance
          const firstAgent = agents[0];
          for (const agent of agents) {
            expect(agent).toBe(firstAgent);
          }

          // Clean up for next iteration
          clearCache();
          return true;
        },
      ),
      { numRuns: 100 },
    );
  });

  it("should return different agents for different SOP names", () => {
    fc.assert(
      fc.property(
        fc.array(validNameArb, { minLength: 2, maxLength: 5 }).filter((names) => {
          // Ensure unique names
          return new Set(names).size === names.length;
        }),
        validDescriptionArb,
        (names, description) => {
          const agents = names.map((name) => {
            const sop = createSOPFromInputs(name, description, {});
            return { name, agent: getOrCreateAgent(sop) };
          });

          // All agents should be different instances
          for (let i = 0; i < agents.length; i++) {
            for (let j = i + 1; j < agents.length; j++) {
              expect(agents[i].agent).not.toBe(agents[j].agent);
            }
          }

          // Clean up for next iteration
          clearCache();
          return true;
        },
      ),
      { numRuns: 100 },
    );
  });
});
