---
name: bad-yaml
description: This has invalid YAML syntax
version: 1.0.0
inputs:
  field1:
    type: string
    description: A field
  field2: [this is: invalid: yaml: syntax
---

# Bad YAML Agent

This SOP has malformed YAML in the frontmatter that should cause a parse error.
