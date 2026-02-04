# Requirements Document

## Introduction

This document defines the requirements for the SOP Orchestrator feature - a TypeScript-based system that enables multi-agent orchestration using markdown-based Standard Operating Procedures (SOPs). The system allows agents to be defined as markdown files with YAML frontmatter, auto-discovers available agents at runtime, and delegates tasks to appropriate agents based on their descriptions.

## Glossary

- **SOP**: Standard Operating Procedure - a markdown file (`.md`) containing agent definition with YAML frontmatter and markdown body
- **SOP_Loader**: Component responsible for parsing SOP files and extracting frontmatter, body, and generating Zod schemas
- **Agent_Discovery**: Component that scans directories for SOP files and creates a registry of available agents
- **Tool_Generator**: Component that creates Strands tools from discovered agent definitions
- **Orchestrator**: The master agent that receives requests and delegates tasks to appropriate sub-agents
- **SOPDefinition**: Data structure containing all parsed SOP information including frontmatter, body, filepath, and generated Zod schema
- **SOPFrontmatter**: YAML metadata at the top of SOP files containing name, description, version, tools, inputs, and type
- **InputDef**: Schema definition for agent input parameters supporting string, number, boolean, enum, and list types
- **Strands_Agent**: An agent instance from the @strands-agents/sdk library
- **Strands_Tool**: A callable tool that can be injected into a Strands agent
- **RFC2119**: Standard defining requirement keywords (MUST, SHOULD, MAY) for specification documents
- **Frontmatter**: YAML metadata block at the top of markdown files, delimited by `---` markers

## Requirements

### Requirement 1: SOP File Parsing

**User Story:** As a developer, I want to load and parse SOP markdown files, so that I can extract agent definitions from structured markdown documents.

#### Acceptance Criteria

1. WHEN the SOP_Loader receives a valid `.md` file path, THE SOP_Loader SHALL parse the file and extract YAML frontmatter and markdown body using the gray-matter library
2. WHEN the SOP_Loader parses a file, THE SOP_Loader SHALL validate the frontmatter against the SOPFrontmatter schema
3. WHEN the frontmatter contains an `inputs` field, THE SOP_Loader SHALL generate a Zod schema from the InputDef definitions
4. WHEN the SOP_Loader successfully parses a file, THE SOP_Loader SHALL return a SOPDefinition object containing name, description, version, tools, inputs, body, filepath, type, and zodSchema
5. IF the file does not exist or cannot be read, THEN THE SOP_Loader SHALL throw an error with the file path and reason

### Requirement 2: Frontmatter Validation

**User Story:** As a developer, I want frontmatter to be validated for required fields, so that malformed SOP files are caught early with clear error messages.

#### Acceptance Criteria

1. THE SOP_Loader SHALL require the `name` field in frontmatter and throw a descriptive error if missing
2. THE SOP_Loader SHALL require the `description` field in frontmatter and throw a descriptive error if missing
3. WHEN the frontmatter `name` field does not match the filename (without `.md` extension), THE SOP_Loader SHALL log a warning indicating the inconsistency
4. WHEN the frontmatter contains an invalid `type` value (not "agent" or "orchestrator"), THE SOP_Loader SHALL throw an error indicating valid type values
5. WHEN the frontmatter does not contain a `type` field, THE SOP_Loader SHALL default to type "agent"
6. IF the frontmatter is missing or malformed YAML, THEN THE SOP_Loader SHALL throw an error indicating the parsing failure location

### Requirement 3: Input Schema Generation

**User Story:** As a developer, I want input definitions to be converted to Zod schemas with default value support, so that agent inputs can be validated at runtime with sensible defaults.

#### Acceptance Criteria

1. WHEN an InputDef has type "string", THE SOP_Loader SHALL generate a z.string() schema
2. WHEN an InputDef has type "number", THE SOP_Loader SHALL generate a z.number() schema
3. WHEN an InputDef has type "boolean", THE SOP_Loader SHALL generate a z.boolean() schema
4. WHEN an InputDef has type "enum" with values array, THE SOP_Loader SHALL generate a z.enum() schema with the specified values
5. WHEN an InputDef has type "list", THE SOP_Loader SHALL generate a z.array(z.string()) schema
6. WHEN an InputDef has required set to false, THE SOP_Loader SHALL mark the field as optional in the Zod schema
7. WHEN an InputDef has a default value, THE SOP_Loader SHALL apply .default() to the Zod schema with the specified value
8. WHEN an InputDef has a description, THE SOP_Loader SHALL include the description in the Zod schema using .describe()

### Requirement 4: Agent Discovery

**User Story:** As a developer, I want the system to automatically discover all agent SOPs in a directory using frontmatter type flags, so that new agents can be added without code changes and orchestrators are properly identified.

#### Acceptance Criteria

1. WHEN Agent_Discovery scans a directory, THE Agent_Discovery SHALL find all files matching the `.md` pattern
2. WHEN Agent_Discovery finds SOP files, THE Agent_Discovery SHALL exclude files where frontmatter contains `type: orchestrator`
3. WHEN Agent_Discovery processes SOP files, THE Agent_Discovery SHALL return a Map with agent name as key and SOPDefinition as value
4. WHEN Agent_Discovery encounters an invalid SOP file, THE Agent_Discovery SHALL log the error with file path and continue processing other files
5. IF the specified directory does not exist, THEN THE Agent_Discovery SHALL throw an error indicating the directory path
6. IF the specified directory contains no `.md` files, THEN THE Agent_Discovery SHALL return an empty Map and log a warning message

### Requirement 5: Tool Generation

**User Story:** As a developer, I want each discovered agent to be exposed as a callable Strands tool with proper task and input injection, so that the orchestrator can delegate tasks to agents with full context.

#### Acceptance Criteria

1. WHEN Tool_Generator creates a tool from a SOPDefinition, THE Tool_Generator SHALL name the tool following the pattern `agent_{sop.name}`
2. WHEN Tool_Generator creates a tool, THE Tool_Generator SHALL use sop.description as the tool description
3. WHEN Tool_Generator creates a tool schema, THE Tool_Generator SHALL include a required `task` field of type string describing the specific task to perform
4. WHEN Tool_Generator creates a tool schema, THE Tool_Generator SHALL include all fields from sop.inputs with their types, constraints, and defaults
5. WHEN the tool handler is invoked, THE Tool_Generator SHALL pass the `task` parameter as the user message to the agent
6. WHEN the tool handler is invoked, THE Tool_Generator SHALL inject input parameters into the agent context as structured data
7. WHEN building the agent prompt, THE Tool_Generator SHALL format the task and input parameters into a structured message that the agent can parse

### Requirement 6: Agent Instance Caching

**User Story:** As a developer, I want agent instances to be cached and reused, so that repeated invocations don't incur the overhead of creating new agent instances.

#### Acceptance Criteria

1. WHEN Tool_Generator creates an agent for the first time, THE Tool_Generator SHALL store the agent instance in a Map keyed by agent name
2. WHEN Tool_Generator handles a subsequent invocation for the same agent, THE Tool_Generator SHALL retrieve and reuse the cached agent instance
3. THE Orchestrator SHALL provide a method to clear the agent cache when needed

### Requirement 7: Orchestrator Creation

**User Story:** As a developer, I want to create an orchestrator agent that can delegate to discovered agents, so that complex tasks can be broken down and handled by specialized agents.

#### Acceptance Criteria

1. WHEN the Orchestrator is created, THE Orchestrator SHALL load the SOP file with `type: orchestrator` in frontmatter as the master agent's system prompt
2. WHEN the Orchestrator is created, THE Orchestrator SHALL inject all discovered agent tools into the orchestrator agent
3. THE Orchestrator SHALL NOT require the orchestrator SOP to specify which agents exist
4. WHEN the Orchestrator receives a request, THE Orchestrator SHALL be able to call multiple agent tools in a single invocation
5. IF no SOP file with `type: orchestrator` exists in the directory, THEN THE Orchestrator SHALL throw an error indicating no orchestrator was found
6. IF multiple SOP files with `type: orchestrator` exist, THEN THE Orchestrator SHALL throw an error indicating only one orchestrator is allowed
7. THE Orchestrator SHALL use "./sops" as the default directory if none is specified

### Requirement 8: Request Execution and Error Handling

**User Story:** As a developer, I want to invoke the orchestrator with configurable error handling, so that I can choose between fail-fast and partial-result behaviors.

#### Acceptance Criteria

1. WHEN the invoke method receives a request string, THE Orchestrator SHALL process the request using the orchestrator agent
2. WHEN the orchestrator agent completes processing, THE Orchestrator SHALL return the final response as a string
3. WHEN the orchestrator calls multiple agent tools, THE Orchestrator SHALL support concurrent tool execution
4. THE Orchestrator SHALL accept an optional `errorMode` configuration parameter ("fail-fast" | "continue") with default value "fail-fast"
5. WHEN error handling mode is "fail-fast" and an agent tool fails, THE Orchestrator SHALL immediately propagate the error with context about which agent failed
6. WHEN error handling mode is "continue" and an agent tool fails, THE Orchestrator SHALL log the error, mark that agent's result as failed, and continue with remaining agents
7. WHEN error handling mode is "continue", THE Orchestrator SHALL include partial results and error information in the final response

### Requirement 9: Logging and Observability

**User Story:** As a developer, I want comprehensive logging of agent interactions, so that I can debug and monitor the multi-agent system.

#### Acceptance Criteria

1. WHEN an agent tool is invoked, THE Orchestrator SHALL log the agent name, task, and input parameters
2. WHEN an agent tool completes, THE Orchestrator SHALL log the agent name, execution duration, and response summary
3. WHEN an agent tool fails, THE Orchestrator SHALL log the agent name, error type, error message, and stack trace
4. THE Orchestrator SHALL support configurable log levels (debug, info, warn, error)
5. THE Orchestrator SHALL include correlation IDs in logs to trace requests across agent calls
6. WHEN the orchestrator starts processing a request, THE Orchestrator SHALL log the request with a unique correlation ID

### Requirement 10: End-to-End Orchestration

**User Story:** As a developer, I want the orchestrator to intelligently delegate tasks to appropriate agents, so that requests are handled by the most suitable agents.

#### Acceptance Criteria

1. WHEN a request requires multiple capabilities, THE Orchestrator SHALL delegate to multiple agents in sequence or parallel as appropriate
2. WHEN a request matches a single agent's capability, THE Orchestrator SHALL delegate to only that agent
3. WHEN a request can be answered directly without delegation, THE Orchestrator SHALL respond without calling any agent tools
4. WHEN delegating to multiple agents, THE Orchestrator SHALL pass relevant context between agent calls
