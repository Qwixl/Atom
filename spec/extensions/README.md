# Atom A2A extensions

Published A2A protocol extensions defined by Atom.

| Extension | Identifier | Spec |
|---|---|---|
| Governed Object (Data Object) v1 | `https://atom.qwixl.dev/a2a/data-object/v1` | [data-object-v1/SPEC.md](./data-object-v1/SPEC.md) |

## Relationship to the Internet-Draft

[`draft-chapman-a2a-mls-01`](../draft-chapman-a2a-mls-01.md) is the current
working Internet-Draft revision (GO + MLS). The Datatracker first submission
remains [`-00`](../draft-chapman-a2a-mls-00.md); do not overwrite it.

The Governed Object extension here is the first Atom-published A2A extension.
It extracts the GO-only profile that an A2A peer can adopt without implementing
MLS. Normative GO structure, signing, and receiver checks in this package align
with the draft; provenance and the combined GO+MLS design live in the draft.

| Document | Scope |
|---|---|
| [data-object-v1](./data-object-v1/) | GO-only A2A extension (this publication) |
| [draft-chapman-a2a-mls-00](../draft-chapman-a2a-mls-00.md) | Published Datatracker `-00` snapshot |
| [draft-chapman-a2a-mls-01](../draft-chapman-a2a-mls-01.md) | Working revision (Option A + GO extension cross-link) |
