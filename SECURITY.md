# Security Policy

## Reporting a Vulnerability

We take security seriously. If you discover a security vulnerability, please report it responsibly.

**Please do NOT open a public GitHub issue for security vulnerabilities.**

Instead, please report security issues by emailing the maintainers directly or using GitHub's private vulnerability reporting feature.

### What to Include

- Description of the vulnerability
- Steps to reproduce
- Potential impact
- Any suggested fixes (optional)

### Response Timeline

- We will acknowledge receipt within 48 hours
- We will provide an initial assessment within 7 days
- We will work with you to understand and resolve the issue

## Supported Versions

| Version | Supported          |
| ------- | ------------------ |
| 1.x.x   | :white_check_mark: |
| < 1.0   | :x:                |

## Security Best Practices

When using SOP Agents:

- Keep dependencies up to date
- Use environment variables for sensitive configuration
- Review SOP files before loading them from untrusted sources
- Follow AWS security best practices for Bedrock credentials
