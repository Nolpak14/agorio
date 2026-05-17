# Architecture Decision Records

Short, dated, append-only records of architectural decisions that shaped agorio.
Newer ADRs supersede older ones; never edit an ADR after merge — write a new one and link back.

Use [adr-tools](https://github.com/npryce/adr-tools) format: `NNNN-title.md`, where `NNNN` is
zero-padded sequential.

## Index

- [0001 — Why Open Core + hosted Cloud](0001-open-core-pivot.md)
- [0002 — Quad-protocol coverage (UCP + ACP + AP2 + MCP)](0002-quad-protocol.md)
- [0003 — Schema duplication between site/ and cloud/](0003-schema-duplication.md)
- [0004 — Composable HTTP primitives instead of an internal client](0004-composable-http.md)
- [0005 — Sub-agent + AgentChain primitives instead of an internal orchestrator](0005-sub-agent-primitives.md)
- [0006 — Agent identity attestation via HMAC, not mTLS](0006-attestation-hmac.md)
- [0007 — Versioning policy and v1.0 stability commitment](0007-semver-v1.md)
