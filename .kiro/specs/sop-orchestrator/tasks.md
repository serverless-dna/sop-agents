# Implementation Plan: SOP Orchestrator

## Overview

This implementation plan breaks down the SOP Orchestrator feature into discrete coding tasks. The approach is incremental: we start with core types and error handling, then build up through parsing, discovery, tool generation, and finally orchestration. Property tests validate correctness properties from the design, while unit tests cover specific examples and edge cases.

## Tasks

- [ ] 1. Set up project foundation
  - [ ] 1.1 Install dependencies (gray-matter, zod, fast-check, vitest)
    - Add gray-matter and zod to dependencies
    - Add fast-check and vitest to devDependencies
    - Configure vitest in package.json
    - _Requirements: 1.1, 3.1_

  - [ ] 1.2 Create type definitions in `src/types.ts`
    - Define InputType, InputDef, SOPFrontmatter, SOPDefinition
    - Define ErrorMode, OrchestratorConfig, Orchestrator interface
    - Define Logger, LogEntry interfaces
    - _Requirements: 1.4, 3.1-3.8_

  - [ ] 1.3 Create error classes in `src/errors.ts`
    - Implement SOPError base class
    - Implement FileNotFoundError, FrontmatterParseError, FrontmatterValidationError
    - Implement DirectoryNotFoundError, OrchestratorNotFoundError, MultipleOrchestratorsError
    - Implement AgentInvocationError
    - _Requirements: 1.5, 2.1, 2.2, 2.4, 2.6, 4.5, 7.5, 7.6, 8.5_

  - [ ] 1.4 Create sample SOP files for testing
    - Create `test/fixtures/sops/orchestrator.md`
    - Create `test/fixtures/sops/research.md`
    - Create `test/fixtures/sops/writer.md`
    - Create `test/fixtures/invalid/missing-name.md`
    - Create `test/fixtures/invalid/bad-yaml.md`
    - _Requirements: All_

- [ ] 2. Implement SOP_Loader
  - [ ] 2.1 Implement frontmatter validation in `src/sop-loader.ts`
    - Create validateFrontmatter function
    - Validate required fields (name, description)
    - Validate type field (must be "agent" or "orchestrator" if present)
    - Default type to "agent" when not specified
    - Throw FrontmatterValidationError with descriptive messages
    - _Requirements: 2.1, 2.2, 2.4, 2.5, 2.6_

  - [ ] 2.2 Implement Zod schema generation in `src/sop-loader.ts`
    - Create generateZodSchema function
    - Always include task field as z.string().describe()
    - Map InputDef types to Zod types (string, number, boolean, enum, list)
    - Apply .optional() when required is false
    - Apply .default() when default value is specified
    - Apply .describe() for all fields
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 3.8_

  - [ ] 2.3 Implement file loading in `src/sop-loader.ts`
    - Create loadSOP function
    - Read file and parse with gray-matter
    - Validate frontmatter
    - Generate Zod schema from inputs
    - Return complete SOPDefinition
    - Throw FileNotFoundError for missing files
    - Log warning when name doesn't match filename
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 2.3_

  - [ ] 2.4 Write unit tests for SOP_Loader
    - Test parsing valid SOP with all fields
    - Test parsing SOP with minimal fields
    - Test missing file error
    - Test invalid frontmatter errors
    - Test name/filename mismatch warning
    - _Requirements: 1.1-1.5, 2.1-2.6_

  - [ ] 2.5 Write property tests for SOP_Loader
    - **Property 1: SOP Parsing Round-Trip**
    - **Property 2: Frontmatter Validation Rejects Invalid Input**
    - **Property 3: Type Field Defaults to Agent**
    - **Property 4: Schema Generation Type Correctness**
    - **Validates: Requirements 1.1-1.5, 2.1-2.6, 3.1-3.8**

- [ ] 3. Checkpoint - SOP_Loader complete
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 4. Implement Agent_Discovery
  - [ ] 4.1 Implement directory scanning in `src/agent-discovery.ts`
    - Create discoverAgents function
    - Scan directory for .md files
    - Load each file with SOP_Loader
    - Filter out orchestrator SOPs (type: orchestrator)
    - Return Map<string, SOPDefinition> keyed by agent name
    - Throw DirectoryNotFoundError for missing directories
    - Log warning for empty directories
    - Log errors for invalid files and continue processing
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6_

  - [ ] 4.2 Implement orchestrator discovery in `src/agent-discovery.ts`
    - Create findOrchestrator function
    - Scan directory for .md files with type: orchestrator
    - Throw OrchestratorNotFoundError if none found
    - Throw MultipleOrchestratorsError if more than one found
    - Return the single orchestrator SOPDefinition
    - _Requirements: 7.5, 7.6_

  - [ ] 4.3 Write unit tests for Agent_Discovery
    - Test discovering multiple agents
    - Test filtering out orchestrator SOPs
    - Test missing directory error
    - Test empty directory warning
    - Test invalid file handling (continues processing)
    - _Requirements: 4.1-4.6, 7.5, 7.6_

  - [ ] 4.4 Write property tests for Agent_Discovery
    - **Property 5: Agent Discovery Filtering**
    - **Property 6: Discovery Error Resilience**
    - **Validates: Requirements 4.1-4.6**

- [ ] 5. Implement Logger
  - [ ] 5.1 Implement Logger in `src/logger.ts`
    - Create Logger class with debug, info, warn, error methods
    - Implement log level filtering
    - Implement withCorrelationId for request tracing
    - Implement withAgent for agent context
    - Format LogEntry with timestamp, level, correlationId, agentName, message
    - _Requirements: 9.1, 9.2, 9.3, 9.4, 9.5, 9.6_

  - [ ] 5.2 Write unit tests for Logger
    - Test log level filtering (debug, info, warn, error)
    - Test withCorrelationId context propagation
    - Test withAgent context propagation
    - Test LogEntry formatting with all fields
    - _Requirements: 9.1-9.6_

- [ ] 6. Checkpoint - Discovery and Logger complete
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 7. Implement Tool_Generator
  - [ ] 7.1 Implement tool creation in `src/tool-generator.ts`
    - Import tool from @strands-agents/sdk
    - Create createTool function
    - Name tool as `agent_{sop.name}`
    - Use sop.description as tool description
    - Use sop.zodSchema as input schema
    - _Requirements: 5.1, 5.2, 5.3, 5.4_

  - [ ] 7.2 Implement agent prompt construction in `src/tool-generator.ts`
    - Create buildAgentPrompt function
    - Format task and input parameters into structured message
    - _Requirements: 5.5, 5.6, 5.7_

  - [ ] 7.3 Implement tool handler in `src/tool-generator.ts`
    - Import tool from @strands-agents/sdk
    - Create tool callback that invokes sub-agent
    - Pass task as user message
    - Inject input parameters into prompt
    - Return agent response
    - _Requirements: 5.5, 5.6_

  - [ ] 7.4 Implement agent caching in `src/tool-generator.ts`
    - Create agent cache Map<string, Agent>
    - Implement getOrCreateAgent function
    - Return cached instance if exists
    - Create and cache new instance if not
    - Implement clearCache function
    - _Requirements: 6.1, 6.2, 6.3_

  - [ ] 7.5 Implement createAllTools in `src/tool-generator.ts`
    - Create tools for all agents in registry
    - Return array of InvokableTool
    - _Requirements: 7.2_

  - [ ] 7.6 Write unit tests for Tool_Generator
    - Test tool naming convention (agent_{name})
    - Test tool description from SOP
    - Test tool schema from SOP zodSchema
    - Test agent prompt construction
    - Test agent caching (same instance returned)
    - Test clearCache functionality
    - _Requirements: 5.1-5.7, 6.1-6.3_

  - [ ] 7.7 Write property tests for Tool_Generator
    - **Property 7: Tool Generation Correctness**
    - **Property 8: Agent Caching Idempotence**
    - **Validates: Requirements 5.1-5.7, 6.1-6.3**

- [ ] 8. Checkpoint - Tool_Generator complete
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 9. Implement Orchestrator
  - [ ] 9.1 Implement Orchestrator class in `src/orchestrator.ts`
    - Create OrchestratorImpl class implementing Orchestrator interface
    - Store config with defaults (directory: "./sops", errorMode: "fail-fast", logLevel: "info")
    - Expose readonly config property
    - _Requirements: 7.7, 8.4_

  - [ ] 9.2 Implement initialize method in `src/orchestrator.ts`
    - Discover agents using Agent_Discovery
    - Find orchestrator SOP
    - Create tools for all agents using Tool_Generator
    - Create orchestrator Agent with SOP body as system prompt
    - Inject all agent tools into orchestrator
    - Store registry for getRegistry method
    - _Requirements: 7.1, 7.2, 7.3_

  - [ ] 9.3 Implement invoke method in `src/orchestrator.ts`
    - Generate correlation ID for request
    - Log request start with correlation ID
    - Invoke orchestrator agent with request
    - Return final response as string
    - _Requirements: 8.1, 8.2, 8.3, 9.6_

  - [ ] 9.4 Implement error handling in `src/orchestrator.ts`
    - Wrap tool handlers with error handling
    - In fail-fast mode: propagate AgentInvocationError immediately
    - In continue mode: log error, mark result as failed, continue
    - Include partial results in continue mode response
    - _Requirements: 8.5, 8.6, 8.7_

  - [ ] 9.5 Implement logging in tool handlers
    - Log agent name, task, inputs at invocation start
    - Log agent name, duration, response summary on success
    - Log agent name, error type, message, stack trace on failure
    - _Requirements: 9.1, 9.2, 9.3_

  - [ ] 9.6 Write unit tests for Orchestrator
    - Test config defaults
    - Test initialize discovers agents and creates tools
    - Test invoke generates correlation ID
    - Test fail-fast error mode propagates errors
    - Test continue error mode includes partial results
    - Test logging at invocation start and completion
    - _Requirements: 7.1-7.7, 8.1-8.7, 9.1-9.6_

  - [ ] 9.7 Write property tests for Orchestrator
    - **Property 9: Orchestrator Initialization Validation**
    - **Property 10: Error Mode Behavior**
    - **Property 11: Logging Completeness**
    - **Validates: Requirements 7.1-7.7, 8.1-8.7, 9.1-9.6**

  - [ ] 9.8 Write end-to-end tests for orchestration
    - Test multi-agent delegation (research + write)
    - Test single-agent delegation
    - Test direct response without delegation
    - Test context passing between agents
    - _Requirements: 10.1, 10.2, 10.3, 10.4_

- [ ] 10. Implement factory function and public API
  - [ ] 10.1 Create createOrchestrator factory in `src/orchestrator.ts`
    - Accept OrchestratorConfig
    - Create OrchestratorImpl instance
    - Call initialize()
    - Return initialized Orchestrator
    - _Requirements: 7.1, 7.2_

  - [ ] 10.2 Export public API in `src/index.ts`
    - Export createOrchestrator factory
    - Export all types
    - Export all error classes
    - _Requirements: All_

- [ ] 11. Final checkpoint
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties from the design document
- Unit tests validate specific examples and edge cases
- Test fixtures in `test/fixtures/` provide consistent test data across all test types

