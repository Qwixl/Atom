# Schemas — Transcript Accountability v1

JSON Schema files describe **minimal shape** for receipt and checkpoint
payloads.

Implementers MUST enforce the full normative rules in [SPEC.md](../SPEC.md)
(especially contiguous checkpoint entries and range length). Passing schema
validation alone is **not** sufficient to trust a checkpoint.
