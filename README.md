# SOP Agents

**Multi-agent orchestration for [Strands Agents](https://github.com/strands-agents/sdk-python), defined in plain text. Write what your agents do. Write how they collaborate. Done.**

```markdown
<!-- sops/researcher.md -->
---
name: researcher
description: Researches topics and gathers information
version: 1.0.0
type: agent
---
# Research Agent

## Overview

You are a research specialist focused on gathering accurate information.

## Steps

### 1. Analyze the Topic

Understand what information is needed and identify reliable sources.

**Constraints:**
- You MUST use authoritative sources
- You SHOULD cross-reference multiple sources

### 2. Gather and Synthesize

Collect relevant information and organize it clearly.

**Constraints:**
- You MUST cite your sources
- You MUST distinguish facts from speculation
```

```markdown
<!-- sops/writer.md -->
---
name: writer  
description: Writes content based on research and requirements
version: 1.0.0
type: agent
---
# Writer Agent

## Overview

You are a skilled writer who transforms research into engaging content.

## Steps

### 1. Review the Input

Understand the research findings and target audience.

**Constraints:**
- You MUST NOT invent facts because the output must be grounded in provided research
- You SHOULD adapt tone to the target audience

### 2. Write and Polish

Create clear, engaging content from the source material.

**Constraints:**
- You MUST maintain factual accuracy
- You SHOULD use clear, accessible language
```

```typescript
// That's it. Now they work together automatically.
const orchestrator = await createOrchestrator({ directory: "./sops" });

const result = await orchestrator.invoke(
  "Research quantum computing breakthroughs in 2025 and write a blog post about them"
);
// The orchestrator reads your request, calls researcher, passes results to writer,
// and returns the finished blog post.
```

No glue code. No tool definitions. No agent-to-agent wiring. Just describe what each agent does, and the orchestrator figures out how to coordinate them.

## Why?

Building multi-agent systems usually means:
- Writing tool schemas and type definitions
- Manually wiring agents together  
- Hardcoding orchestration logic
- Rebuilding when requirements change

With SOP Agents, you write markdown files. The library handles the rest.

**Model-driven orchestration** means the LLM decides how to coordinate agents at runtime—not you at build time. Traditional approaches lock you into predefined flows. Here, the orchestrator reasons about each request and picks the best path. Add a new agent? It's immediately available. Rephrase your request? The orchestrator adapts. No rewiring required.

## Install

```bash
npm install @serverless-dna/sop-agents
```

Requires AWS credentials for Amazon Bedrock (the default model provider):

```bash
aws login  # or aws configure
```

## How It Works

1. **You write SOPs** - Markdown files describing what each agent does
2. **Library generates tools** - Each SOP becomes a callable tool with typed inputs
3. **Orchestrator coordinates** - A master agent reads requests and delegates to the right agents
4. **Agents execute** - Each agent runs with its SOP as the system prompt

The orchestrator is itself an agent—defined the same way. It sees your request, looks at the available agent tools, and decides which to call and in what order. No flowcharts, no state machines—just LLM reasoning.

**Out of the box**, the library includes a default orchestrator that analyzes your request and selects the right agent(s) to handle it. One agent, multiple agents in sequence, or a back-and-forth—it figures out what's needed.

**Want more control?** Write your own orchestrator SOP:

```markdown
<!-- sops/orchestrator.md -->
---
name: orchestrator
description: Coordinates research and writing tasks
type: orchestrator
---
# Content Pipeline Orchestrator

You coordinate a content creation pipeline.

## Steps

1. Always start with the researcher to gather facts
2. Pass research findings to the writer
3. If the writer needs clarification, go back to the researcher
4. Review the final output for accuracy before returning

Never skip research. Never let the writer make up facts.
```

Plain English orchestration. Override the default when you need specific workflows.

