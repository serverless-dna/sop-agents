# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.1.3] - 2025-02-06

### Added
- **MCP Tools Integration** - Register MCP clients by name and declare which tools each agent needs in frontmatter
- **Per-agent tool injection** - Only declared tools get injected into agents, avoiding context pollution
- **Orchestrator tool support** - Orchestrators can also declare tools in their frontmatter
- GitHub Actions release workflow with npm OIDC provenance

### Removed
- Removed unused `@modelcontextprotocol/sdk` dependency - users bring their own MCP clients

## [0.1.1] - 2025-02-05

### Changed
- Added repository, bugs, and homepage URLs to package.json
- Added GitHub issue and PR templates
- Added CODE_OF_CONDUCT.md, SECURITY.md, and CONTRIBUTING.md
- Improved documentation and code comments in examples

## [0.1.0] - 2025-02-05

### Added
- Initial release of SOP Agents
- Multi-agent orchestration with plain text SOPs
- Automatic agent discovery from markdown files
- Streaming support for real-time responses
- Default orchestrator for automatic agent coordination
- Custom orchestrator support via SOP files
- YAML frontmatter parsing for agent metadata
- Tool generation from SOP definitions
- Interactive chat example

[Unreleased]: https://github.com/serverless-dna/sop-agents/compare/v0.1.2...HEAD
[0.1.2]: https://github.com/serverless-dna/sop-agents/compare/v0.1.1...v0.1.2
[0.1.1]: https://github.com/serverless-dna/sop-agents/compare/v0.1.0...v0.1.1
[0.1.0]: https://github.com/serverless-dna/sop-agents/releases/tag/v0.1.0
