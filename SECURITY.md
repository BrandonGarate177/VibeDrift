# Security Policy

## Reporting a vulnerability

Please do not open a public issue for security problems.

Report vulnerabilities privately through GitHub's
[security advisory form](https://github.com/VibeDrift/VibeDrift/security/advisories/new),
or by email to **security@vibedrift.ai**. We aim to acknowledge reports within
72 hours and to keep you updated as we work on a fix.

When reporting, please include:

- a description of the issue and its impact,
- steps to reproduce or a proof of concept,
- the VibeDrift version (`vibedrift --version`) and your environment.

## Scope

This repository is the VibeDrift CLI, which runs locally on a user's machine.
A local scan never sends your source code, file contents, or file paths; local
analysis and the five local MCP tools make no network calls of that kind. A
regular scan does send a small anonymous usage beacon by default (language, file
count, lines of code, scan time, CLI version, finding count, and score; no code,
no file paths, no identifiers), and the CLI checks npm about once a day for
updates; both are on for everyone whether signed in or not, and can be turned off
with `vibedrift telemetry disable` (or `VIBEDRIFT_TELEMETRY_DISABLED=1`), or
skipped entirely with `--local-only`.

When you explicitly opt in, more is sent to the optional cloud service: a deep
scan (`--deep`, which requires sign-in) sends in-memory function snippets, not
whole files, and saving or uploading a report includes relative file paths,
function names, and finding metadata. None of this happens on a default local
scan. The hosted deep-scan service is a separate product; vulnerabilities in it
can be reported through the same channels above.

## Supported versions

Security fixes are applied to the latest published release of `@vibedrift/cli`.
Please upgrade to the latest version before reporting, in case the issue is
already resolved.

## No secrets in the repo

This codebase contains no credentials. The CLI authenticates with the cloud
service using a user-provided token supplied at runtime through configuration or
the `VIBEDRIFT_TOKEN` environment variable. If you believe a secret has been
committed, please report it through the channels above so we can rotate it.
