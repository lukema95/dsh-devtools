# Security Policy

## Reporting a vulnerability

Please report security issues privately through the repository's
**GitHub Security Advisories**:

https://github.com/lukema95/dsh-devtools/security/advisories/new

Do not open a public issue for a vulnerability, and do not include real access
tokens, OAuth codes, client secrets, or credential files in any report.

## Scope

This plugin stores access tokens in DSH's credential provider and stores OAuth
refresh tokens and client registrations in `dsh-devtools/*` grant records. It
exposes an owner-only HTTP action route and can write to connected third-party
services through MCP tools.

Security-sensitive areas include:

- credential and grant handling;
- OAuth callback validation, state/PKCE, and refresh;
- the owner-only `/api/dsh-devtools` route;
- tool visibility and permission enforcement;
- command/argument handling in the in-page tool tester;
- the Figma temporary compatibility client and its provider-policy implications.

## Supported versions

Security fixes are made on the latest published release line. Older pre-release
versions may not receive fixes.

## Figma note

The Figma integration currently uses a temporary compatibility identity to pass
Figma's MCP client allowlist. This is a policy workaround, not an official Figma
integration. Review Figma's terms before enabling it.
