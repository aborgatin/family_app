# 0004 — One installation per family

- **Status:** Accepted
- **Date:** 2026-11-06

## Context
We want other families to be able to take the code and use it. Options: a hosted
multi-tenant service, or each family self-hosts its own instance.

## Decision
**One installation = one family.** A `Family` table exists (exactly one row) to keep the
model clean, but there is no tenant isolation logic. The repository is public under the MIT license.

## Consequences
- Much simpler code, security and privacy (each family owns its data and server).
- Other families need to self-host → provide a clear install README and `.env.example`.
- Turning this into a hosted multi-family service later would be a separate project.
