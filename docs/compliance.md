# Compliance

This document describes how agorio (SDK + Cloud) addresses common enterprise compliance
requirements. It is not legal advice — bring your counsel into any procurement conversation.

## EU AI Act (Regulation (EU) 2024/1689)

The EU AI Act enters substantive enforcement on **2 August 2026**. Agents built with agorio
will, in most procurement contexts, be classified as **limited-risk** or **high-risk AI systems**
depending on the merchant context. agorio ships the artifacts buyers need on each side.

### What agorio provides

| Requirement (Annex IV) | agorio mechanism |
| ---------------------- | ---------------- |
| Logging of inputs, outputs, and model identity | Cloud trace explorer + `agorioCloud({ apiKey })` SDK helper records every tool call, LLM call, and final answer |
| Retention of system records | Cloud retains traces 12 months on Pro; configurable on Enterprise |
| Exportable system documentation | `GET /api/compliance/export?from=YYYY-MM-DD&to=YYYY-MM-DD&format=csv` — emits Annex IV-aligned CSV or JSON, with `X-Agorio-Export-Spec: EU-AI-Act-Annex-IV-v1` header for archival |
| Human oversight markers | Approval-workflow plugin captures approver identity + timestamp; surfaces in traces |
| Risk management — bounded transactions | Spending-controls plugin enforces per-tx / per-session / per-day limits |
| Provider transparency | Model identity, version, and SDK version are stamped on every trace |
| Cybersecurity (Art. 15) | See [docs/security.md](./security.md) — HMAC attestation, bounded ingest, tenant scoping |

### Operational notes

- Exports cap at 90 days per request. Stitch multiple exports for longer ranges.
- All exports are tenant-scoped; customers can only export their own records.
- "High-risk system" classification is the customer's responsibility — agorio supplies the
  evidence base; the customer makes the legal determination.
- We retain raw traces for the period configured per tier. Compliance exports can be archived
  by the customer indefinitely.

## GDPR

agorio Cloud processes personal data on behalf of customers (data controllers). agorio is the
data processor.

- **Data residency** — by default, Cloud runs on Neon's US-East region. Enterprise tenants can
  request EU-region storage; coordinate via your account contact.
- **DSAR support** — customers can use the compliance export endpoint to satisfy access
  requests. Right-to-erasure is implemented by `DELETE` on the trace run row (tracked: an
  endpoint will land in v0.9; today this is operator-assisted via support).
- **Sub-processors** — Vercel (hosting), Neon (Postgres), Stripe (billing), Resend (transactional
  email). DPAs in place with each.
- **DPA template** — available on request to enterprise@agorio.dev.

## SOC 2

agorio is not yet SOC 2 certified. We follow the same control objectives (access management,
change management, encryption, logging, vendor risk) and target Type I attestation alongside
the v1.0 GA. Enterprise customers should ask for the most recent control narrative.

## PCI DSS

agorio **does not handle cardholder data**. All payment flows are delegated to the merchant's
own gateway (ACP, Shopify, WooCommerce, BigCommerce, AP2-compatible processors). Card data
never transits the SDK or Cloud.

## HIPAA

agorio is not designed for protected health information. We do not sign BAAs.

## ISO 27001

Not certified. Reach out if this is a procurement blocker — we have a roadmap.

## Reporting compliance concerns

- General compliance: compliance@agorio.dev
- Security: security@agorio.dev (see [security.md](./security.md))
