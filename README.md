# Agent SOP

A TypeScript library for building multi-agent orchestration systems using Standard Operating Procedures (SOPs). Define your agents as markdown files with YAML frontmatter, and let the orchestrator coordinate them to complete complex tasks.

Built on top of [@strands-agents/sdk](https://github.com/strands-agents/sdk).

## Features

- **Declarative Agent Definitions**: Define agents using markdown files with YAML frontmatter
- **Automatic Tool Generation**: SOPs are automatically converted to callable tools
- **Multi-Agent Orchestration**: A master orchestrator coordinates specialized agents
- **Type-Safe Inputs**: Input parameters are validated using Zod schemas
- **Flexible Model Configuration**: Per-agent model selection with global defaults
- **Caching**: Agent instances are cached for efficient repeated invocations
- **Structured Logging**: Built-in logging with correlation IDs for request tracing
- **Error Handling**: Configurable error modes (fail-fast or continue)

## Quick Start

### Installation

```bash
npm install agent-sop
```

### Prerequisites

This library uses Amazon Bedrock as the model provider. You'll need:

1. AWS credentials configured (via environment variables, AWS CLI, or IAM roles)
2. Access to Claude Sonnet 4 (or your chosen model) enabled in Amazon Bedrock

```bash
# Configure AWS credentials
aws configure

# Or set environment variables
export AWS_ACCESS_KEY_ID=your_access_key
export AWS_SECRET_ACCESS_KEY=your_secret_key
export AWS_REGION=us-east-1
```

### 1. Create Your SOP Directory

```bash
mkdir sops
```

### 2. Define an Orchestrator

Create `sops/orchestrator.md`:

```markdown
---
name: orchestrator
description: Master orchestrator that delegates tasks to specialized agents
version: 1.0.0
type: orchestrator
---

# Task Orchestrator

## Overview

You are a master orchestrator responsible for coordinating multiple specialized agents to complete complex tasks.

## Steps

### 1. Analyze Request

Parse the incoming request to understand what needs to be accomplished.

**Constraints:**
- You MUST identify all subtasks required to fulfill the request
- You SHOULD break complex requests into smaller, manageable tasks

### 2. Delegate to Agents

Invoke the appropriate specialized agents for each subtask.

**Constraints:**
- You MUST choose the most appropriate agent for each subtask
- You MUST pass relevant context between agent calls
- You SHOULD handle agent errors gracefully

### 3. Synthesize Results

Combine outputs from all agents into a coherent response.

**Constraints:**
- You MUST provide a unified response that addresses the original request
- You SHOULD include relevant details from each agent's output
```

### 3. Define Your Agents

Create `sops/research.md`:

```markdown
---
name: research
description: Researches topics and gathers information
version: 1.0.0
type: agent
inputs:
  topic:
    type: string
    description: The topic to research
    required: true
  depth:
    type: enum
    description: How deep to research
    values: [shallow, medium, deep]
    default: medium
---

# Research Agent

## Overview

You are a research specialist focused on gathering accurate and comprehensive information on any given topic.

## Steps

### 1. Understand Scope

Analyze the research topic and determine the appropriate scope based on the depth parameter.

**Constraints:**
- You MUST clearly define the boundaries of the research
- You SHOULD consider the depth parameter when determining scope

### 2. Gather Information

Identify and consult relevant sources to gather information.

**Constraints:**
- You MUST use reliable and authoritative sources
- You SHOULD cross-reference information across multiple sources

### 3. Synthesize Findings

Compile the gathered information into a coherent summary.

**Constraints:**
- You MUST provide key findings with source citations
- You MUST include a confidence level for each finding
- You SHOULD organize findings in a structured format
```

### 4. Run the Orchestrator

```typescript
import { createOrchestrator } from "agent-sop";

async function main() {
  const orchestrator = await createOrchestrator({
    directory: "./sops",
    errorMode: "fail-fast",
    logLevel: "info",
  });

  const result = await orchestrator.invoke(
    "Research the latest trends in AI agents"
  );
  
  console.log(result);
}

main();
```

## SOP File Format

SOP files are markdown files with YAML frontmatter followed by structured content:

```markdown
---
name: agent-name           # Required: unique agent identifier
description: What it does  # Required: used as tool description
version: 1.0.0             # Optional: semver version
type: agent                # Optional: "agent" (default) or "orchestrator"
model: us.amazon.nova-pro-v1:0  # Optional: model ID (overrides default)
tools:                     # Optional: additional tools to inject
  - web_search
  - file_reader
inputs:                    # Optional: typed input parameters
  param_name:
    type: string           # string | number | boolean | enum | list
    description: What it is
    required: true         # defaults to true
    default: value         # optional default value
    values: [a, b, c]      # only for enum type
---

# Agent Name

## Overview

A concise description of what the agent does and when to use it.

## Steps

### 1. First Step

Description of what happens in this step.

**Constraints:**
- You MUST perform specific action
- You SHOULD consider certain factors

### 2. Second Step

Description of what happens in this step.

**Constraints:**
- You MUST save output to a file because [reason]
- You SHOULD NOT skip validation because it ensures data integrity
```

The markdown body becomes the agent's system prompt. Use RFC2119 keywords (MUST, SHOULD, MAY) in constraints, and always provide context for negative constraints.

## API Reference

### `createOrchestrator(config?)`

Factory function to create and initialize an orchestrator.

```typescript
const orchestrator = await createOrchestrator({
  directory: "./sops",     // default: "./sops"
  errorMode: "fail-fast",  // "fail-fast" | "continue"
  logLevel: "info",        // "debug" | "info" | "warn" | "error"
  defaultModel: "us.amazon.nova-pro-v1:0", // optional: override default model
});
```

### `orchestrator.invoke(request)`

Process a request through the orchestrator.

```typescript
const result = await orchestrator.invoke("Your request here");
```

### `orchestrator.clearCache()`

Clear the agent instance cache.

### `orchestrator.getRegistry()`

Get the agent registry for inspection/debugging.

### Low-Level API

```typescript
import {
  discoverAgents,    // Scan directory for agent SOPs
  findOrchestrator,  // Find the orchestrator SOP
  loadSOP,           // Load a single SOP file
  createTool,        // Create a tool from an SOP
  createAllTools,    // Create tools for all agents
} from "agent-sop";
```

## Input Types

| Type | Zod Schema | Description |
|------|------------|-------------|
| `string` | `z.string()` | Text input |
| `number` | `z.number()` | Numeric input |
| `boolean` | `z.boolean()` | True/false |
| `enum` | `z.enum([...])` | One of specified values |
| `list` | `z.array(z.string())` | Array of strings |

## Error Handling

The library provides typed errors for common failure cases:

- `FileNotFoundError` - SOP file doesn't exist
- `DirectoryNotFoundError` - SOP directory doesn't exist
- `FrontmatterParseError` - Invalid YAML syntax
- `FrontmatterValidationError` - Missing required fields
- `OrchestratorNotFoundError` - No orchestrator SOP found
- `MultipleOrchestratorsError` - More than one orchestrator
- `AgentInvocationError` - Agent execution failed

## Model Configuration

The library uses Amazon Bedrock as the model provider. By default, agents use the Strands SDK default model (Claude Sonnet 4).

### Default Model

If no model is specified, agents use the Strands SDK default. Override it globally in the orchestrator config:

```typescript
const orchestrator = await createOrchestrator({
  defaultModel: "us.amazon.nova-pro-v1:0",
});
```

### Per-Agent Model

Override the model for a specific agent by adding `model` to its frontmatter:

```yaml
---
name: fast-responder
description: Quick responses using a faster model
model: us.amazon.nova-lite-v1:0
---
```

### Available Models

Common Bedrock model IDs:

| Model | ID |
|-------|-----|
| Claude Sonnet 4 | `us.anthropic.claude-sonnet-4-20250514-v1:0` |
| Claude Haiku 3.5 | `us.anthropic.claude-3-5-haiku-20241022-v1:0` |
| Amazon Nova Pro | `us.amazon.nova-pro-v1:0` |
| Amazon Nova Lite | `us.amazon.nova-lite-v1:0` |

Ensure you have [enabled model access](https://docs.aws.amazon.com/bedrock/latest/userguide/model-access.html) in the Amazon Bedrock console for any models you use.

## Development

```bash
# Install dependencies
npm install

# Build
npm run build

# Run tests
npm test

# Lint
npm run lint

# Fix lint issues
npm run lint:fix
```

## License

ISC
