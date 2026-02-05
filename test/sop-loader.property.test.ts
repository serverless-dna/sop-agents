import * as fs from "node:fs";
import * as path from "node:path";
import fc from "fast-check";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { FrontmatterValidationError } from "../src/types/errors";
import {
  generateZodSchema,
  loadSOP,
  validateFrontmatter,
} from "../src/agents/sop-loader";
import type { InputDef, InputType } from "../src/types/types";

const TEMP_DIR = "test/fixtures/temp-property";

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

// Generators
const validNameArb = fc.stringMatching(/^[a-z][a-z0-9-]{0,20}$/);
// Use a more robust approach: generate a non-whitespace char followed by optional chars
// This ensures we always have at least one non-whitespace character
const validDescriptionArb = fc
  .tuple(
    fc.stringMatching(/^[a-zA-Z0-9]$/), // At least one non-whitespace char
    fc.string({ maxLength: 99 })
  )
  .map(([first, rest]) => first + rest)
  .filter((s) => s.trim().length > 0); // Extra safety filter
const validVersionArb = fc.constantFrom("1.0.0", "2.0.0", "0.1.0");
const validTypeArb = fc.constantFrom("agent", "orchestrator");

const validFrontmatterArb = fc.record({
  name: validNameArb,
  description: validDescriptionArb,
  version: fc.option(validVersionArb, { nil: undefined }),
  type: fc.option(validTypeArb, { nil: undefined }),
});

const inputTypeArb: fc.Arbitrary<InputType> = fc.constantFrom(
  "string",
  "number",
  "boolean",
  "enum",
  "list",
);

const inputDefArb: fc.Arbitrary<InputDef> = fc
  .record({
    type: inputTypeArb,
    description: fc.string({ minLength: 1, maxLength: 50 }),
    required: fc.option(fc.boolean(), { nil: undefined }),
    values: fc.option(
      fc.array(fc.string({ minLength: 1, maxLength: 10 }), {
        minLength: 1,
        maxLength: 5,
      }),
      { nil: undefined },
    ),
  })
  .map((def) => {
    // Ensure enum type has values
    if (def.type === "enum" && !def.values) {
      return { ...def, values: ["option1", "option2"] };
    }
    return def;
  });

/**
 * Helper to escape YAML string values - always quote to ensure string type
 */
function yamlQuote(value: string): string {
  // Always quote to ensure the value is treated as a string by YAML parser
  return JSON.stringify(value);
}

/**
 * Property 1: SOP Parsing Round-Trip
 * For any valid SOP file content with frontmatter and body, parsing the file
 * should produce a SOPDefinition where the body matches the original markdown
 * content and all frontmatter fields are correctly extracted.
 * **Validates: Requirements 1.1, 1.4**
 */
describe("Property 1: SOP Parsing Round-Trip", () => {
  it("should correctly extract frontmatter and body from valid SOP files", async () => {
    await fc.assert(
      fc.asyncProperty(validFrontmatterArb, async (frontmatter) => {
        const body = "# Test Agent\n\nThis is the body content.";
        const yamlContent = [
          "---",
          `name: ${yamlQuote(frontmatter.name)}`,
          `description: ${yamlQuote(frontmatter.description)}`,
          frontmatter.version ? `version: ${yamlQuote(frontmatter.version)}` : null,
          frontmatter.type ? `type: ${frontmatter.type}` : null,
          "---",
          body,
        ]
          .filter(Boolean)
          .join("\n");

        const filepath = path.join(TEMP_DIR, `${frontmatter.name}.md`);
        fs.writeFileSync(filepath, yamlContent);

        try {
          const result = await loadSOP(filepath);

          // Verify frontmatter fields are correctly extracted
          expect(result.name).toBe(frontmatter.name);
          expect(result.description).toBe(frontmatter.description);
          if (frontmatter.version) {
            expect(result.version).toBe(frontmatter.version);
          }
          // Body should match (trimmed)
          expect(result.body).toBe(body.trim());

          return true;
        } finally {
          if (fs.existsSync(filepath)) {
            fs.unlinkSync(filepath);
          }
        }
      }),
      { numRuns: 100 },
    );
  });
});

/**
 * Property 2: Frontmatter Validation Rejects Invalid Input
 * For any frontmatter object missing required fields (name or description),
 * or containing invalid type values, validation should throw a descriptive error.
 * **Validates: Requirements 1.2, 2.1, 2.2, 2.4, 2.6**
 */
describe("Property 2: Frontmatter Validation Rejects Invalid Input", () => {
  it("should reject frontmatter missing name field", () => {
    fc.assert(
      fc.property(validDescriptionArb, (description) => {
        const data = { description };
        expect(() => validateFrontmatter(data, "test.md")).toThrow(
          FrontmatterValidationError,
        );
        return true;
      }),
      { numRuns: 100 },
    );
  });

  it("should reject frontmatter missing description field", () => {
    fc.assert(
      fc.property(validNameArb, (name) => {
        const data = { name };
        expect(() => validateFrontmatter(data, "test.md")).toThrow(
          FrontmatterValidationError,
        );
        return true;
      }),
      { numRuns: 100 },
    );
  });

  it("should reject frontmatter with invalid type values", () => {
    const invalidTypeArb = fc
      .string({ minLength: 1 })
      .filter((s) => s !== "agent" && s !== "orchestrator");

    fc.assert(
      fc.property(
        validNameArb,
        validDescriptionArb,
        invalidTypeArb,
        (name, description, invalidType) => {
          const data = { name, description, type: invalidType };
          expect(() => validateFrontmatter(data, "test.md")).toThrow(
            FrontmatterValidationError,
          );
          return true;
        },
      ),
      { numRuns: 100 },
    );
  });
});

/**
 * Property 3: Type Field Defaults to Agent
 * For any valid frontmatter without a `type` field, the parsed SOPDefinition
 * should have type equal to "agent".
 * **Validates: Requirements 2.5**
 */
describe("Property 3: Type Field Defaults to Agent", () => {
  it("should default type to 'agent' when not specified", () => {
    fc.assert(
      fc.property(validNameArb, validDescriptionArb, (name, description) => {
        const data = { name, description };
        const result = validateFrontmatter(data, "test.md");
        expect(result.type).toBe("agent");
        return true;
      }),
      { numRuns: 100 },
    );
  });
});

/**
 * Property 4: Schema Generation Type Correctness
 * For any InputDef with a specified type, the generated Zod schema should:
 * - Accept values of the correct type
 * - Reject values of incorrect types
 * - Apply default values when specified
 * - Mark fields as optional when required is false
 * **Validates: Requirements 1.3, 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 3.8**
 */
describe("Property 4: Schema Generation Type Correctness", () => {
  it("should accept values of correct type and reject incorrect types", () => {
    fc.assert(
      fc.property(inputDefArb, (inputDef) => {
        const schema = generateZodSchema({ testField: inputDef });

        // Generate a valid value based on type
        let validValue: unknown;
        let invalidValue: unknown;

        switch (inputDef.type) {
          case "string":
            validValue = "test string";
            invalidValue = 123;
            break;
          case "number":
            validValue = 42;
            invalidValue = "not a number";
            break;
          case "boolean":
            validValue = true;
            invalidValue = "not a boolean";
            break;
          case "enum":
            validValue = inputDef.values?.[0] ?? "option1";
            invalidValue = "invalid_enum_value_xyz";
            break;
          case "list":
            validValue = ["item1", "item2"];
            invalidValue = "not an array";
            break;
        }

        // Test valid value
        const validResult = schema.safeParse({
          task: "test task",
          testField: validValue,
        });
        expect(validResult.success).toBe(true);

        // Test invalid value (only if field is required)
        if (inputDef.required !== false) {
          const invalidResult = schema.safeParse({
            task: "test task",
            testField: invalidValue,
          });
          expect(invalidResult.success).toBe(false);
        }

        return true;
      }),
      { numRuns: 100 },
    );
  });

  it("should apply default values when specified", () => {
    fc.assert(
      fc.property(
        fc.constantFrom("string", "number", "boolean") as fc.Arbitrary<InputType>,
        (type) => {
          const defaultValue =
            type === "string" ? "default" : type === "number" ? 42 : true;

          const inputDef: InputDef = {
            type,
            description: "Test field",
            default: defaultValue,
          };

          const schema = generateZodSchema({ testField: inputDef });
          const result = schema.parse({ task: "test task" });

          expect(result.testField).toBe(defaultValue);
          return true;
        },
      ),
      { numRuns: 100 },
    );
  });

  it("should mark fields as optional when required is false", () => {
    fc.assert(
      fc.property(inputTypeArb, (type) => {
        const inputDef: InputDef = {
          type,
          description: "Optional field",
          required: false,
          values: type === "enum" ? ["a", "b"] : undefined,
        };

        const schema = generateZodSchema({ optionalField: inputDef });
        const result = schema.safeParse({ task: "test task" });

        expect(result.success).toBe(true);
        return true;
      }),
      { numRuns: 100 },
    );
  });
});
