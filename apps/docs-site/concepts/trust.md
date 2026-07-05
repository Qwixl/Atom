# Trust model

- **Attested decisions** — consequential actions run in shell-owned chrome; terms are hash-chained locally.
- **Sandboxed modules** — iframe bundles with declared events only; `capabilities: []` in v1.
- **Signed data objects** — agent-to-agent payloads use `@qwixl/protocol` envelopes.
- **MLS E2E** — pair sessions between backends; the shell never sees plaintext MLS payloads.

Managed hosting (optional) means the operator holds your keys — stated plainly at signup. Export/import (M13.4) preserves a self-host exit.
